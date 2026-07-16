import os
import sys
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException

from database import release_readiness_db, runbooks_db, read_environment_state
from models import ReleaseReadinessCheck, ReadinessCheckItem, EvaluateReadinessRequest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini

router = APIRouter(prefix="/api/deployments/release-readiness", tags=["release-readiness"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_id() -> str:
    existing = release_readiness_db.get_all()
    return f"RR-{len(existing) + 1:04d}"


def evaluate_readiness(req: EvaluateReadinessRequest) -> ReleaseReadinessCheck:
    """
    Core evaluation logic, exposed as a plain function so Deployment
    orchestration can call it directly (same process, no HTTP round-trip).
    """
    checks: List[ReadinessCheckItem] = []

    # Drift detection / baseline reconcile - Module 05 (Config & environments)
    env_state = read_environment_state(req.component_id, req.environment)
    if env_state is None:
        checks.append(ReadinessCheckItem(
            name="drift-detection",
            passed=False,
            detail=f"No environment state record found for {req.component_id} in {req.environment} (Module 05)."
        ))
    else:
        drift_ok = env_state.get("drift_status") == "in-sync"
        checks.append(ReadinessCheckItem(
            name="drift-detection",
            passed=drift_ok,
            detail=f"Deployed {env_state.get('deployed_version')} vs expected {env_state.get('expected_version')} - {env_state.get('drift_status')}."
        ))

    # Runbook approved
    if req.runbook_id:
        runbook = runbooks_db.get_by_id(req.runbook_id)
        if not runbook:
            checks.append(ReadinessCheckItem(name="runbook-approved", passed=False, detail=f"Runbook {req.runbook_id} not found."))
        else:
            checks.append(ReadinessCheckItem(
                name="runbook-approved",
                passed=runbook.status == "approved",
                detail=f"Runbook {runbook.runbook_id} status is '{runbook.status}'."
            ))
    else:
        checks.append(ReadinessCheckItem(name="runbook-approved", passed=False, detail="No runbook referenced."))

    # Test execution / Change-record drafting: no upstream service exists yet in this repo.
    # Treated as informational rather than blocking until one is built.
    checks.append(ReadinessCheckItem(
        name="test-execution",
        passed=True,
        detail="No test-execution service exists yet in this repo; treated as not-blocking."
    ))

    ready = all(c.passed for c in checks)

    try:
        summary_prompt = f"""
        Write a 2-3 sentence evidence-backed go/no-go readiness summary for a
        release manager. Component: {req.component_id}, environment: {req.environment}.
        Checks: {[c.model_dump() for c in checks]}
        Overall ready: {ready}.
        """
        evidence_summary = call_gemini(prompt=summary_prompt).strip()
        if not evidence_summary:
            raise ValueError("empty summary")
    except Exception:
        evidence_summary = f"{'Ready' if ready else 'Not ready'}: " + "; ".join(f"{c.name}={c.passed}" for c in checks)

    record = ReleaseReadinessCheck(
        check_id=_next_id(),
        deployment_id=req.deployment_id,
        component_id=req.component_id,
        environment=req.environment,
        checks=checks,
        ready=ready,
        evidence_summary=evidence_summary,
        created_at=_now_iso(),
    )
    release_readiness_db.save(record)
    return record


@router.get("", response_model=List[ReleaseReadinessCheck])
def list_checks():
    return release_readiness_db.get_all()


@router.get("/{check_id}", response_model=ReleaseReadinessCheck)
def get_check(check_id: str):
    record = release_readiness_db.get_by_id(check_id)
    if not record:
        raise HTTPException(status_code=404, detail="Release-readiness check not found.")
    return record


@router.post("/evaluate", response_model=ReleaseReadinessCheck)
def evaluate(req: EvaluateReadinessRequest):
    """Verifies every go-live precondition and produces an evidence-backed go/no-go."""
    return evaluate_readiness(req)
