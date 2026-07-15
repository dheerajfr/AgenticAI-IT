import os
import sys
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException

from database import cutover_db, runbooks_db
from models import (
    CutoverSession,
    CutoverStepStatus,
    CutoverUpdate,
    StartCutoverRequest,
    AdvanceStepRequest,
    PostUpdateRequest,
    EndCutoverRequest,
)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini

router = APIRouter(prefix="/api/deployments/cutover", tags=["cutover-comms"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_id() -> str:
    existing = cutover_db.get_all()
    return f"CUT-{len(existing) + 1:04d}"


@router.get("", response_model=List[CutoverSession])
def list_sessions():
    return cutover_db.get_all()


@router.get("/{cutover_id}", response_model=CutoverSession)
def get_session(cutover_id: str):
    record = cutover_db.get_by_id(cutover_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cutover session not found.")
    return record


@router.post("/start", response_model=CutoverSession)
def start_cutover(req: StartCutoverRequest):
    """
    Opens the cutover bridge: seeds live step tracking from the approved
    runbook (if given) and starts the stakeholder comms feed.
    """
    steps: List[CutoverStepStatus] = []
    if req.runbook_id:
        runbook = runbooks_db.get_by_id(req.runbook_id)
        if not runbook:
            raise HTTPException(status_code=404, detail="Referenced runbook not found.")
        steps = [
            CutoverStepStatus(step_id=s.step_id, description=s.description, status="pending")
            for s in runbook.steps
        ]

    now = _now_iso()
    record = CutoverSession(
        cutover_id=_next_id(),
        deployment_id=req.deployment_id,
        component_id=req.component_id,
        runbook_id=req.runbook_id,
        stakeholders=req.stakeholders,
        status="in-progress",
        steps=steps,
        updates=[CutoverUpdate(timestamp=now, author="system", message=f"Cutover bridge opened for {req.component_id}.")],
        started_at=now,
        ended_at=None,
    )
    cutover_db.save(record)
    return record


@router.post("/{cutover_id}/step/{step_id}/advance", response_model=CutoverSession)
def advance_step(cutover_id: str, step_id: str, req: AdvanceStepRequest):
    """Tracks a step's live status and drops an auto-generated stakeholder update into the comms feed."""
    record = cutover_db.get_by_id(cutover_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cutover session not found.")

    step = next((s for s in record.steps if s.step_id == step_id), None)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found in this cutover session.")

    step.status = req.status
    step.notes = req.notes
    now = _now_iso()
    step.updated_at = now

    try:
        prompt = f"""
        Write one short, calm stakeholder-facing status line (max 25 words) for a live
        deployment cutover bridge. Step "{step.description}" just moved to status "{req.status}".
        {"Notes: " + req.notes if req.notes else ""}
        Respond with plain text only, no quotes.
        """
        message = call_gemini(prompt=prompt).strip()
        if not message:
            raise ValueError("empty message")
    except Exception:
        message = f"Step '{step.description}' is now {req.status}."

    record.updates.append(CutoverUpdate(timestamp=now, author="system", message=message))
    cutover_db.save(record)
    return record


@router.post("/{cutover_id}/update", response_model=CutoverSession)
def post_update(cutover_id: str, req: PostUpdateRequest):
    record = cutover_db.get_by_id(cutover_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cutover session not found.")
    record.updates.append(CutoverUpdate(timestamp=_now_iso(), author=req.author, message=req.message))
    cutover_db.save(record)
    return record


@router.post("/{cutover_id}/end", response_model=CutoverSession)
def end_cutover(cutover_id: str, req: EndCutoverRequest):
    """Owns decisions on the bridge: a human closes the session as completed or aborted."""
    record = cutover_db.get_by_id(cutover_id)
    if not record:
        raise HTTPException(status_code=404, detail="Cutover session not found.")
    record.status = req.status
    record.ended_at = _now_iso()
    record.updates.append(CutoverUpdate(timestamp=record.ended_at, author="system", message=f"Cutover session marked {req.status}."))
    cutover_db.save(record)
    return record
