"""
main.py — FastAPI service for Stage 03: Plan & Schedule.

Loaded by the root gateway.py via dynamic import.

Endpoints:
  GET  /api/plans                        → list all PlanRecords
  GET  /api/plans/{plan_id}              → get one PlanRecord
  GET  /api/plans/{plan_id}/explain      → planning reasoning for one plan (Fix 5)
  POST /api/plans/generate               → generate plans from approved estimates
  DELETE /api/plans/{plan_id}            → delete a plan

Fix 3: Uses database.py (SQLite) for persistence — plans survive restarts.
Fix 2: Accepts optional `dependencies` in POST body; returns cross_plan_critical_path.
Fix 5: POST response includes `reasoning` list beside plans; explain endpoint too.

PlanRecord objects in the output are NEVER augmented — reasoning lives in
separate top-level keys (`reasoning`, `cross_plan_critical_path`) outside
the plan array. The PlanRecord schema contract is preserved exactly.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Ensure plan_schedule package and database module are importable when loaded
# dynamically by gateway.py from the project root.
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from database import db  # Fix 3 — SQLite-backed store

from plan_schedule.buffer import buffered_effort_days, compute_buffer_multiplier
from plan_schedule.models import (
    DependencyEdge,
    EstimateRecord,
    PlanRecord,
    SprintConstraints,
    TeamConfig,
)
from plan_schedule.planner import generate_plans
from plan_schedule.critical_path import multi_plan_critical_path
from plan_schedule.wbs import _has_shift_keyword, compute_phase_allocations

# ---------------------------------------------------------------------------
# Default team + constraints (used when caller omits them)
# ---------------------------------------------------------------------------
_DEFAULT_TEAM_CONFIG: Dict[str, Any] = {
    "team_size": 6,
    "roles": [
        {"role": "backend",  "count": 2, "hours_per_day_per_person": 8,
         "members": ["m.rodriguez", "d.chen"]},
        {"role": "frontend", "count": 1, "hours_per_day_per_person": 8,
         "members": ["f.nguyen"]},
        {"role": "qa",       "count": 2, "hours_per_day_per_person": 8,
         "members": ["alice.smith", "bob.jones"]},
        {"role": "devops",   "count": 1, "hours_per_day_per_person": 8,
         "members": ["clara.davis"]},
    ],
}

_DEFAULT_SPRINT_CONSTRAINTS: Dict[str, Any] = {
    "planning_start_date": "2026-07-07",
    "working_days_per_week": 5,
    "max_daily_utilization_percentage": 85,
}

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Plan & Schedule Service (Stage 03)",
    description="Converts approved EstimateRecords into dated, resourced PlanRecords.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / helper models
# ---------------------------------------------------------------------------

class GeneratePlanRequest(BaseModel):
    estimates: List[dict]
    team_config: Optional[dict] = None
    sprint_constraints: Optional[dict] = None
    # Fix 2 — optional cross-plan dependency edges
    dependencies: Optional[List[dict]] = None


# ---------------------------------------------------------------------------
# Internal: build per-plan reasoning record (Fix 5)
# Does NOT add fields to PlanRecord — this is a separate sidecar dict.
# ---------------------------------------------------------------------------

_CONF_BUFFER = {"low": 20, "medium": 10, "high": 0}
_SHIFT_KEYWORDS = ["integration", "security", "compliance", "data migration"]


def _build_reasoning(estimate: EstimateRecord, plan_id: str) -> dict:
    """
    Compute planning reasoning for display in the UI.
    Returned as a sidecar dict alongside (never inside) PlanRecord.
    """
    conf_pct = _CONF_BUFFER.get(estimate.confidence, 0)
    extra_pct = 0
    extra_reason = None

    if estimate.status == "re-baselined":
        extra_pct = 10
        extra_reason = "status is re-baselined"
    elif len(estimate.risk_factors) >= 3:
        extra_pct = 10
        extra_reason = f"{len(estimate.risk_factors)} risk factors (≥3 threshold)"

    total_mult = 1.0 + conf_pct / 100 + extra_pct / 100
    buffered = round(estimate.effort_days * total_mult, 2)

    # WBS shift detection
    combined = " ".join(estimate.risk_factors).lower()
    shift_triggered = False
    shift_trigger_kw = None
    for kw in _SHIFT_KEYWORDS:
        if kw in combined:
            shift_triggered = True
            shift_trigger_kw = next(
                rf for rf in estimate.risk_factors if kw in rf.lower()
            )
            break

    return {
        "plan_id": plan_id,
        "estimate_id": estimate.estimate_id,
        "confidence_buffer_pct": conf_pct,
        "extra_risk_buffer_pct": extra_pct,
        "extra_risk_buffer_reason": extra_reason,
        "total_buffer_multiplier": round(total_mult, 4),
        "raw_effort_days": estimate.effort_days,
        "buffered_effort_days": buffered,
        "wbs_shift_applied": shift_triggered,
        "wbs_shift_trigger": shift_trigger_kw,
        "wbs_note": (
            "Build −5% → Test +5% (risk factor mentions integration/security/compliance/data migration)"
            if shift_triggered else
            "Default split: Design 15% / Build 50% / Test 25% / Deploy 10%"
        ),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/plans", response_model=List[dict])
def list_plans():
    """Return all PlanRecords from SQLite store."""
    return db.get_all()


@app.get("/api/plans/{plan_id}", response_model=dict)
def get_plan(plan_id: str):
    """Return a single PlanRecord by plan_id."""
    plan = db.get_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    return plan


@app.get("/api/plans/{plan_id}/explain")
def explain_plan(plan_id: str):
    """
    Return planning reasoning for a stored plan (Fix 5).
    The stored plan dict includes _reasoning if it was generated via this service.
    Otherwise returns a 404 if the plan_id is unknown or an in-memory fixture.
    """
    plan = db.get_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    reasoning = plan.get("_reasoning")
    if reasoning is None:
        raise HTTPException(
            status_code=404,
            detail="No reasoning trace available for this plan (e.g. loaded from fixture).",
        )
    return reasoning


@app.post("/api/plans/generate")
def generate(req: GeneratePlanRequest):
    """
    Accept a list of EstimateRecord dicts plus optional team/sprint config.
    Returns:
      {
        "plans": [ <PlanRecord>, … ],          ← schema-clean, no extra fields
        "reasoning": [ <reasoning_dict>, … ],  ← sidecar reasoning, one per plan
        "cross_plan_critical_path": [ <plan_id>, … ] | null  ← Fix 2
      }
    Only 'approved' and 're-baselined' estimates produce a plan.
    """
    try:
        estimate_objects = [EstimateRecord(**e) for e in req.estimates]
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid estimate payload: {exc}")

    try:
        team = TeamConfig(**(req.team_config or _DEFAULT_TEAM_CONFIG))
        constraints = SprintConstraints(
            **(req.sprint_constraints or _DEFAULT_SPRINT_CONSTRAINTS)
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid config payload: {exc}")

    # Fix 2 — parse optional dependency edges
    dep_objects = None
    if req.dependencies:
        try:
            dep_objects = [DependencyEdge(**d) for d in req.dependencies]
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid dependency payload: {exc}")

    try:
        plans: List[PlanRecord] = generate_plans(
            estimate_objects, team, constraints, dependencies=dep_objects
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Planning engine error: {exc}")

    if not plans:
        raise HTTPException(
            status_code=422,
            detail="No plans generated. All estimates may be in draft/challenged status.",
        )

    # Build reasoning sidecar (Fix 5) — indexed by plan position
    # Map estimate → plan by demand_id (1-to-1 for approved estimates)
    est_by_demand = {e.demand_id: e for e in estimate_objects if e.status in ("approved", "re-baselined")}
    reasoning_list = []
    for plan in plans:
        est = est_by_demand.get(plan.demand_id)
        if est:
            reasoning_list.append(_build_reasoning(est, plan.plan_id))

    # Fix 2 — compute cross-plan critical path when deps supplied
    cross_plan_cp: Optional[List[str]] = None
    if dep_objects and len(plans) > 1:
        try:
            cross_plan_cp = multi_plan_critical_path(plans, dep_objects)
        except ValueError:
            cross_plan_cp = None  # cycle detected — skip silently, logged by engine

    # Persist to SQLite (Fix 3) — store reasoning inside the row for /explain
    serialised = []
    for plan, reasoning in zip(plans, reasoning_list):
        plan_dict = plan.model_dump_iso()
        # Store _reasoning in the DB row (private key, not part of PlanRecord schema)
        plan_dict["_reasoning"] = reasoning
        db.save(plan_dict)
        # Return clean plan dict without _reasoning leak
        clean_dict = {k: v for k, v in plan_dict.items() if not k.startswith("_")}
        serialised.append(clean_dict)

    # Handle case where reasoning list shorter than plans (fixture fallback)
    if len(reasoning_list) < len(serialised):
        reasoning_list += [None] * (len(serialised) - len(reasoning_list))

    return {
        "plans": serialised,
        "reasoning": reasoning_list,
        "cross_plan_critical_path": cross_plan_cp,
    }


@app.delete("/api/plans/{plan_id}")
def delete_plan(plan_id: str):
    """Remove a PlanRecord from the SQLite store."""
    deleted = db.delete(plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Plan not found.")
    return {"status": "deleted", "plan_id": plan_id}


class UpdateStatusRequest(BaseModel):
    status: str


@app.patch("/api/plans/{plan_id}/status")
def update_plan_status(plan_id: str, req: UpdateStatusRequest):
    """Update a plan's status (approval state)."""
    plan = db.get_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    plan["status"] = req.status
    db.save(plan)
    return {"status": "updated", "plan_id": plan_id, "new_status": req.status}

