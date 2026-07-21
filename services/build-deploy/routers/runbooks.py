import os
import sys
import re
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException

from database import runbooks_db, fetch_runbook_context
from models import RunbookRecord, RunbookStep, DraftRunbookRequest, UpdateRunbookRequest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini

router = APIRouter(prefix="/api/deployments/runbooks", tags=["runbook-drafting"])


def format_simple_name(comp_id: str) -> str:
    if not comp_id: return "Unknown"
    s = comp_id.lower()
    s = re.sub(r'^svc-', '', s)
    s = re.sub(r'-api', '', s)
    s = re.sub(r'-prod.*', '', s)
    s = re.sub(r'-staging.*', '', s)
    s = re.sub(r'-test.*', '', s)
    s = re.sub(r'-dev.*', '', s)
    s = re.sub(r'-svr.*', '', s)
    return " ".join(word.capitalize() for word in s.split("-"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_id() -> str:
    existing = runbooks_db.get_all()
    return f"RBK-{len(existing) + 1:04d}"


@router.get("", response_model=List[RunbookRecord])
def list_runbooks():
    return runbooks_db.get_all()


@router.get("/{runbook_id}", response_model=RunbookRecord)
def get_runbook(runbook_id: str):
    record = runbooks_db.get_by_id(runbook_id)
    if not record:
        raise HTTPException(status_code=404, detail="Runbook not found.")
    return record


@router.post("/draft", response_model=RunbookRecord)
def draft_runbook(req: DraftRunbookRequest):
    """
    Drafts a deployment runbook from the change summary, architecture notes,
    and a prior runbook to reuse where relevant. Falls back to a minimal
    templated runbook if the LLM call fails, so the flow never dead-ends.
    """
    prior_steps_context = ""
    if req.prior_runbook_id:
        prior = runbooks_db.get_by_id(req.prior_runbook_id)
        if prior:
            prior_steps_context = "\n".join(f"- {s.description} (owner: {s.owner})" for s in prior.steps)

    # Fetch cross-stage context for better AI generation
    ctx = fetch_runbook_context(req.demand_id, req.component_id, req.environment)

    prompt = f"""
    You are a release engineer drafting a deployment runbook specifically for the '{req.environment}' environment.

    Component: {req.component_id}
    Environment: {req.environment}
    Change summary: {req.change_summary}
    Architecture notes: {req.architecture_notes or "None provided"}
    Prior runbook steps to reuse/adapt where relevant:
    {prior_steps_context or "None available"}
    
    Cross-stage Context provided for highly specific runbook generation:
    - Risk Level: {ctx.get('risk_level', 'unknown')}. If the risk_level is 'high', generate additional rigorous pre-flight checks and ensure the rollback-trigger step requires explicit senior management approval.
    - Identified Risk Factors: {ctx.get('risk_factors', [])}. Address these specific risk factors by generating explicit verification steps or mitigation tasks in the execution phase.
    - Available Task Owners (SMEs): {ctx.get('owners', [])}. Assign step ownership using only these available personnel where possible.
    - Expected Dependencies: {ctx.get('dependencies', [])}. If there are downstream/upstream dependencies, generate pre-execution coordination steps to notify or pause traffic.
    - Expected Infrastructure Requirements: {ctx.get('expected_requirements', [])}. Create dedicated health-check steps in the 'pre-check' and 'verify' phases for each of these infrastructure components.

    Produce 5-8 ordered runbook steps covering pre-checks, execution, verification,
    and a rollback trigger point tailored for this specific environment. Respond STRICTLY in JSON:
    {{
      "title": "short runbook title",
      "steps": [
        {{"description": "...", "owner": "role or team name (prefer from Available Task Owners)", "environment": "{req.environment}", "step_type": "pre-check|execute|verify|rollback-trigger", "estimated_minutes": 10}}
      ]
    }}
    """

    try:
        result = call_gemini(prompt=prompt, is_json=True)
        title = f"{format_simple_name(req.component_id)} - {req.environment}"
        raw_steps = result.get("steps") or []
        if not raw_steps:
            raise ValueError("LLM returned no steps")
    except Exception:
        title = f"{format_simple_name(req.component_id)} - {req.environment}"
        raw_steps = [
            {"description": f"Confirm change approval and release-readiness sign-off for {req.environment}", "owner": "release-manager", "environment": req.environment, "step_type": "pre-check", "estimated_minutes": 15},
            {"description": f"Deploy {req.component_id} per change summary to {req.environment}", "owner": "deploy-engineer", "environment": req.environment, "step_type": "execute", "estimated_minutes": 30},
            {"description": f"Verify health checks and smoke tests pass in {req.environment}", "owner": "qa", "environment": req.environment, "step_type": "verify", "estimated_minutes": 15},
            {"description": f"Confirm rollback trigger criteria and owner in {req.environment}", "owner": "release-manager", "environment": req.environment, "step_type": "rollback-trigger", "estimated_minutes": 5},
        ]

    steps = []
    for i, s in enumerate(raw_steps):
        env_val = s.get("environment", req.environment)
        if env_val not in ["dev", "test", "staging", "prod"]:
            env_val = req.environment
            
        step_type_val = s.get("step_type", "execute")
        if step_type_val not in ["pre-check", "execute", "verify", "rollback-trigger"]:
            step_type_val = "execute"
            
        steps.append(RunbookStep(
            step_id=f"STEP-{i + 1}",
            description=s.get("description", ""),
            owner=s.get("owner", "unassigned"),
            environment=env_val,
            step_type=step_type_val,
            estimated_minutes=s.get("estimated_minutes", 10),
        ))

    now = _now_iso()
    record = RunbookRecord(
        runbook_id=f"{req.demand_id}-{req.component_id}",
        demand_id=req.demand_id,
        deployment_id=req.deployment_id,
        component_id=req.component_id,
        environment=req.environment,
        title=title,
        change_record_ref=req.change_record_ref,
        prior_runbook_id=req.prior_runbook_id,
        architecture_refs=[req.architecture_notes] if req.architecture_notes else [],
        steps=steps,
        status="draft",
        generated_by="llm",
        created_at=now,
        updated_at=now,
    )
    runbooks_db.save(record)
    return record


@router.put("/{runbook_id}", response_model=RunbookRecord)
def update_runbook(runbook_id: str, req: UpdateRunbookRequest):
    record = runbooks_db.get_by_id(runbook_id)
    if not record:
        raise HTTPException(status_code=404, detail="Runbook not found.")
    if req.title is not None:
        record.title = req.title
    if req.steps is not None:
        record.steps = req.steps
        record.generated_by = "manual"
    record.updated_at = _now_iso()
    runbooks_db.save(record)
    return record


@router.post("/{runbook_id}/submit-review", response_model=RunbookRecord)
def submit_for_review(runbook_id: str):
    record = runbooks_db.get_by_id(runbook_id)
    if not record:
        raise HTTPException(status_code=404, detail="Runbook not found.")
    record.status = "sme-review"
    record.updated_at = _now_iso()
    runbooks_db.save(record)
    return record


@router.post("/{runbook_id}/approve", response_model=RunbookRecord)
def approve_runbook(runbook_id: str):
    """SME sign-off. Deployment orchestration should only drive runbooks in 'approved' status."""
    record = runbooks_db.get_by_id(runbook_id)
    if not record:
        raise HTTPException(status_code=404, detail="Runbook not found.")
    record.status = "approved"
    record.updated_at = _now_iso()
    runbooks_db.save(record)
    return record


@router.delete("/{runbook_id}")
def delete_runbook(runbook_id: str):
    """Permanently delete a runbook record."""
    deleted = runbooks_db.delete(runbook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Runbook not found.")
    return {"message": f"Runbook {runbook_id} deleted."}
