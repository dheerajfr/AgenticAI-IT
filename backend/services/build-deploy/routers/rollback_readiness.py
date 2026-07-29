from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException

from database import rollback_readiness_db, runbooks_db, read_environment_state
from models import RollbackPlan, RunbookStep, ValidateRollbackRequest

router = APIRouter(prefix="/api/deployments/rollback-readiness", tags=["rollback-readiness"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_id() -> str:
    existing = rollback_readiness_db.get_all()
    return f"RB-{len(existing) + 1:04d}"


def validate_rollback(req: ValidateRollbackRequest) -> RollbackPlan:
    """
    Core validation logic, exposed as a plain function so Deployment
    orchestration can call it directly (same process, no HTTP round-trip).
    """
    issues: List[str] = []
    rollback_steps: List[RunbookStep] = []

    if req.runbook_id:
        runbook = runbooks_db.get_by_id(req.runbook_id)
        if not runbook:
            issues.append(f"Referenced runbook {req.runbook_id} not found.")
        else:
            rollback_steps = [s for s in runbook.steps if s.step_type == "rollback-trigger"]
            if not rollback_steps:
                issues.append(f"Runbook {req.runbook_id} has no rollback-trigger step defined.")
    else:
        issues.append("No runbook referenced - cannot confirm a rollback trigger point.")

    if not req.backup_verified:
        issues.append("Backup/restore has not been verified for this component.")

    env_state = read_environment_state(req.component_id, req.environment)
    if env_state and env_state.get("drift_status") != "in-sync":
        issues.append(f"Environment {req.environment} is currently drifted; rolling back would land on an unknown baseline.")

    viable = len(issues) == 0

    record = RollbackPlan(
        rollback_id=_next_id(),
        deployment_id=req.deployment_id,
        component_id=req.component_id,
        runbook_id=req.runbook_id,
        backup_verified=req.backup_verified,
        rollback_steps=rollback_steps,
        viable=viable,
        issues=issues,
        created_at=_now_iso(),
    )
    rollback_readiness_db.save(record)
    return record


@router.get("", response_model=List[RollbackPlan])
def list_plans():
    return rollback_readiness_db.get_all()


@router.get("/{rollback_id}", response_model=RollbackPlan)
def get_plan(rollback_id: str):
    record = rollback_readiness_db.get_by_id(rollback_id)
    if not record:
        raise HTTPException(status_code=404, detail="Rollback plan not found.")
    return record


@router.post("/validate", response_model=RollbackPlan)
def validate(req: ValidateRollbackRequest):
    """Prepares and validates the rollback plan before cutover."""
    return validate_rollback(req)
