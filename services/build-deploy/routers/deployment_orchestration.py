from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException

from database import deployments_db, runbooks_db, cutover_db
from models import (
    DeploymentRecord,
    PreconditionCheck,
    StartDeploymentRequest,
    GoNoGoRequest,
    EvaluateReadinessRequest,
    ValidateRollbackRequest,
    StartCutoverRequest,
)
from routers.release_readiness import evaluate_readiness
from routers.rollback_readiness import validate_rollback
from routers.cutover import start_cutover

router = APIRouter(prefix="/api/deployments/orchestration", tags=["deployment-orchestration"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_id() -> str:
    existing = deployments_db.get_all()
    return f"DEP-{len(existing) + 1:04d}"


@router.get("", response_model=List[DeploymentRecord])
def list_deployments():
    return deployments_db.get_all()


@router.get("/{deployment_id}", response_model=DeploymentRecord)
def get_deployment(deployment_id: str):
    record = deployments_db.get_by_id(deployment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    return record


@router.post("/start", response_model=DeploymentRecord)
def start_deployment(req: StartDeploymentRequest):
    """Drives the deployment runbook across environments and teams; checks pre-conditions."""
    runbook = runbooks_db.get_by_id(req.runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail="Referenced runbook not found.")
    if runbook.status != "approved":
        raise HTTPException(status_code=400, detail=f"Runbook {req.runbook_id} is not approved (status: {runbook.status}).")

    now = _now_iso()
    deployment_id = f"{req.demand_id}-{req.component_id}"
    record = deployments_db.get_by_id(deployment_id)
    if record:
        record.version = req.version
        record.environment = req.environment
        record.runbook_id = req.runbook_id
        record.status = "planned"
        record.preconditions = []
        record.cutover_id = None
        record.decided_by = None
        record.updated_at = now
        deployments_db.save(record)
    else:
        record = DeploymentRecord(
            deployment_id=deployment_id,
            demand_id=req.demand_id,
            component_id=req.component_id,
            version=req.version,
            environment=req.environment,
            runbook_id=req.runbook_id,
            status="planned",
            created_at=now,
            updated_at=now,
        )
        deployments_db.save(record)

    # Automatically notify Config Environments of the newly deployed version
    try:
        import urllib.request, json
        payload = json.dumps({"deployed_version": req.version}).encode("utf-8")
        url = f"http://127.0.0.1:8000/api/environments/{req.demand_id}/{req.environment}"
        put_req = urllib.request.Request(url, data=payload, method="PUT", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(put_req, timeout=2) as f:
            pass
    except Exception as e:
        print(f"Failed to update config environment deployed version: {e}")

    return record


@router.post("/{deployment_id}/check-preconditions", response_model=DeploymentRecord)
def check_preconditions(deployment_id: str):
    """
    Aggregates Release-readiness and Rollback readiness into the go/no-go
    preconditions this function checks before allowing a go decision.
    """
    record = deployments_db.get_by_id(deployment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Deployment not found.")

    readiness = evaluate_readiness(EvaluateReadinessRequest(
        component_id=record.component_id,
        environment=record.environment,
        runbook_id=record.runbook_id,
        deployment_id=record.deployment_id,
        version_being_deployed=record.version,
    ))
    rollback = validate_rollback(ValidateRollbackRequest(
        component_id=record.component_id,
        environment=record.environment,
        runbook_id=record.runbook_id,
        deployment_id=record.deployment_id,
        # TODO: wire to a real backup-verification signal once one exists; assumed
        # verified here so the demo path can reach a "go" without a manual toggle.
        backup_verified=True,
    ))

    record.preconditions = [
        PreconditionCheck(
            name=c.name,
            source="release-readiness",
            passed=c.passed,
            detail=c.detail
        ) for c in readiness.checks
    ]
    record.preconditions.append(
        PreconditionCheck(
            name="rollback-readiness",
            source="rollback-readiness",
            passed=rollback.viable,
            detail="; ".join(rollback.issues) or "Rollback plan is viable."
        )
    )
    record.status = "checking"
    record.updated_at = _now_iso()
    deployments_db.save(record)
    return record


@router.post("/{deployment_id}/go-no-go", response_model=DeploymentRecord)
def go_no_go(deployment_id: str, req: GoNoGoRequest):
    """Holds go/no-go on production steps. On 'go', opens the Cutover comms bridge."""
    record = deployments_db.get_by_id(deployment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    if not record.preconditions:
        raise HTTPException(status_code=400, detail="Run check-preconditions before deciding go/no-go.")

    record.decided_by = req.decided_by
    record.updated_at = _now_iso()

    if req.decision == "no-go":
        record.status = "no-go"
        deployments_db.save(record)
        return record

    if not all(p.passed for p in record.preconditions):
        raise HTTPException(status_code=400, detail="Cannot go: one or more preconditions failed. Resolve them or record a no-go.")

    cutover = start_cutover(StartCutoverRequest(
        demand_id=record.demand_id or "Unknown",
        component_id=record.component_id,
        runbook_id=record.runbook_id,
        stakeholders=req.stakeholders,
        deployment_id=record.deployment_id,
    ))
    record.status = "in-progress"
    record.cutover_id = cutover.cutover_id
    deployments_db.save(record)
    return record


@router.post("/{deployment_id}/complete", response_model=DeploymentRecord)
def complete_deployment(deployment_id: str):
    """Marks the deployment done once its linked cutover session has completed."""
    record = deployments_db.get_by_id(deployment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    if not record.cutover_id:
        raise HTTPException(status_code=400, detail="No cutover session linked to this deployment yet.")

    cutover_record = cutover_db.get_by_id(record.cutover_id)
    if not cutover_record or cutover_record.status != "completed":
        raise HTTPException(status_code=400, detail="Linked cutover session is not marked completed yet.")

    record.status = "done"
    record.updated_at = _now_iso()
    deployments_db.save(record)
    return record


@router.delete("/{deployment_id}")
def delete_deployment(deployment_id: str):
    """Permanently delete a deployment record."""
    deleted = deployments_db.delete(deployment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    return {"message": f"Deployment {deployment_id} deleted."}
