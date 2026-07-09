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


@app.get("/api/plans/employees")
def list_employees():
    """Return list of all employees and their statuses."""
    return db.get_employees()


@app.get("/api/plans/employees/availability")
def employees_availability(skill: str):
    """Return all employees of a given skill with days_until_free computed from saved plan tasks.
    
    Query param: skill — e.g. 'backend', 'qa', 'devops', 'frontend'
    Response per employee: { email, name, skill, status, days_until_free }
      days_until_free = 0 → available now
      days_until_free = N → free in N days
      days_until_free = null → working but no task end date found
    """
    return db.get_employees_by_skill_with_availability(skill)


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

    # Build or parse team configuration dynamically from database free pool
    team_config_dict = req.team_config
    if not team_config_dict:
        roles_config = []
        total_members = 0
        has_db_employees = False
        try:
            for role in ["backend", "frontend", "qa", "devops"]:
                emails = db.get_free_employees_by_role(role)
                if emails:
                    has_db_employees = True
                count = len(emails) if emails else 1
                members = emails if emails else [f"{role}_default_1"]
                total_members += count
                roles_config.append({
                    "role": role,
                    "count": count,
                    "hours_per_day_per_person": 8.0,
                    "members": members
                })
        except Exception as e:
            print(f"[plan-schedule] Error querying free employees: {e}")
            has_db_employees = False
            
        if has_db_employees:
            team_config_dict = {
                "team_size": total_members,
                "roles": roles_config
            }
        else:
            team_config_dict = _DEFAULT_TEAM_CONFIG

    try:
        team = TeamConfig(**team_config_dict)
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

    accepted_plans = db.get_all()
    try:
        plans: List[PlanRecord] = generate_plans(
            estimate_objects, team, constraints, dependencies=dep_objects, accepted_plans=accepted_plans
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
        # Keep _reasoning in-memory on client side, do NOT call db.save(plan_dict) yet!
        plan_dict["_reasoning"] = reasoning
        serialised.append(plan_dict)

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
    """Update a plan's status (approval state) and mark owners as working if accepted."""
    plan = db.get_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    
    new_status = req.status
    plan["status"] = new_status
    db.save(plan)
    
    # Mark task owners as "working" when plan is accepted
    if new_status == "accepted":
        for t in plan.get("tasks", []):
            owner = t.get("owner")
            task_status = t.get("status", "pending")
            if owner and owner != "unassigned" and task_status == "pending":
                db.update_employee_status(owner, "working")
                
    return {"status": "updated", "plan_id": plan_id, "new_status": new_status}


class UpdateTaskStatusRequest(BaseModel):
    status: str


@app.patch("/api/plans/{plan_id}/tasks/{task_id}/status")
def update_task_status(plan_id: str, task_id: str, req: UpdateTaskStatusRequest):
    """Update a specific task's status and recompute all employee allocations.

    When a task is marked completed (or its end_date has passed), the owner is
    automatically freed via sync_employee_allocations — which also handles the
    case where the employee still has other active tasks in other accepted plans.
    If all remaining tasks for the employee are completed/expired, they are marked
    Available (unallocated).
    """
    plan = db.get_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    tasks = plan.get("tasks", [])
    task = next((t for t in tasks if t.get("task_id") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    old_status = task.get("status", "pending")
    new_status = req.status

    if old_status != new_status:
        task["status"] = new_status
        # db.save() persists the updated task status and internally calls
        # sync_employee_allocations(), which re-evaluates ALL employees:
        #   - Skips tasks marked 'completed' or whose end_date has already passed
        #   - Marks employees with no remaining active tasks as Available
        #   - Keeps employees with other pending tasks as Allocated
        #   - Respects active leave periods and auto-clears expired leaves
        db.save(plan)

    return {"status": "updated", "plan_id": plan_id, "task_id": task_id, "new_task_status": new_status}


# Moved above get_plan to avoid collision


@app.post("/api/plans")
def create_plan(plan_dict: dict):
    """Save an approved/accepted plan to the database."""
    # Ensure status is set to accepted by default when saved from HITL
    plan_dict.setdefault("status", "accepted")
    db.save(plan_dict)
    
    # If accepted, mark all owners of pending tasks as "working" in the DB
    if plan_dict.get("status") == "accepted":
        for t in plan_dict.get("tasks", []):
            owner = t.get("owner")
            task_status = t.get("status", "pending")
            if owner and owner != "unassigned" and task_status == "pending":
                db.update_employee_status(owner, "working")
                
    return {"status": "saved", "plan_id": plan_dict["plan_id"]}


class ReplanRequest(BaseModel):
    reason: Optional[str] = None
    effort_days: Optional[float] = None
    planning_start_date: Optional[str] = None
    working_days_per_week: Optional[int] = None
    max_daily_utilization_percentage: Optional[float] = None


@app.post("/api/plans/{plan_id}/replan")
def replan_project(plan_id: str, req: ReplanRequest):
    import datetime
    today = datetime.date.today()
    today_str = today.isoformat()

    # 1. Fetch current plan
    plan = db.get_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    # 2. Determine if started
    tasks = plan.get("tasks", [])
    started = False
    if tasks:
        try:
            earliest_start = min(datetime.date.fromisoformat(t["start_date"]) for t in tasks if t.get("start_date"))
            if earliest_start <= today:
                started = True
        except Exception:
            pass

    # If any task is completed, it has also started
    if any(t.get("status") == "completed" for t in tasks):
        started = True

    # 3. Validation
    if started and (not req.reason or not req.reason.strip()):
        raise HTTPException(status_code=400, detail="Reason for replanning is mandatory for started projects.")

    # 4. Save history snapshot
    history = db.get_plan_history(plan_id)
    version = len(history) + 1
    # Save a copy of the current plan to history
    db.save_plan_history(plan_id, plan.get("demand_id"), version, req.reason or "Manual replan before start", plan)

    # 5. Run AI Replanning Agent for leave detection & reallocation
    reallocations = []
    reason_str = req.reason or ""
    
    # Defaults and info to reconstruct estimate/schedule if needed
    reasoning = plan.get("_reasoning", {})
    raw_effort = req.effort_days if req.effort_days is not None else reasoning.get("raw_effort_days", 10.0)
    start_date_str = req.planning_start_date or (tasks[0].get("start_date") if tasks else today_str)
    work_days = req.working_days_per_week or 5
    util = req.max_daily_utilization_percentage or 85.0

    # AI Leave reallocation flow
    if reason_str.strip():
        try:
            from llm_client import call_gemini
            employees = db.get_employees()
            emp_list_str = "\n".join([f"- Name: {e['employee_name']}, Email: {e['email']}" for e in employees])
            
            prompt = f"""
            You are an AI Replanning Assistant. Analyze the user's reason for replanning a project and determine if an employee is going on leave.
            
            Today's date: {today_str}
            
            Reason for replanning: "{reason_str}"
            
            Here is the list of employees in our database:
            {emp_list_str}
            
            Please output a JSON object with the following fields:
            - "employee_on_leave": The email of the employee going on leave, or null if no employee is identified.
            - "leave_start_date": The start date of the leave in YYYY-MM-DD format (default to today ({today_str}) if not specified), or null if not applicable.
            - "leave_end_date": The end date of the leave in YYYY-MM-DD format (compute based on leave duration, e.g., if 'for two weeks', add 14 days to the start date), or null if not applicable.
            - "reallocation_required": A boolean indicating if we need to reallocate tasks because the employee is unavailable.
            """
            
            ai_res = call_gemini(prompt, is_json=True)
            print(f"[AI Agent] Gemini Replan Output: {ai_res}")
            
            emp_email = ai_res.get("employee_on_leave")
            if emp_email and ai_res.get("reallocation_required"):
                l_start = ai_res.get("leave_start_date") or today_str
                l_end = ai_res.get("leave_end_date") or (today + datetime.timedelta(days=14)).isoformat()
                
                # Mark employee on leave
                db.set_employee_leave(emp_email, l_start, l_end)
                
                # Find replacement for their tasks
                # Refresh employee list with their new status
                all_emps = db.get_employees()
                active_plans = db.get_all()
                
                for t in tasks:
                    t_owner = t.get("owner")
                    t_status = t.get("status", "pending")
                    
                    if t_status != "completed" and (t_owner == emp_email or t_owner == next((e["employee_name"] for e in all_emps if e["email"] == emp_email), None)):
                        rep_emp = find_replacement_employee(t, emp_email, all_emps, active_plans)
                        if rep_emp:
                            previous_assignee = t_owner
                            new_assignee = rep_emp["email"]
                            t["owner"] = new_assignee
                            reallocations.append({
                                "task_id": t["task_id"],
                                "task_name": t["name"],
                                "previous_assignee": previous_assignee,
                                "new_assignee": new_assignee,
                                "allocation_status": "Reallocated"
                            })
                        else:
                            reallocations.append({
                                "task_id": t["task_id"],
                                "task_name": t["name"],
                                "previous_assignee": t_owner,
                                "new_assignee": "unassigned",
                                "allocation_status": "No candidate found"
                            })
        except Exception as e:
            print(f"[AI Agent] Error in AI leave processing: {e}")

    # 6. Reschedule pending tasks if scope or dates changed
    if (req.effort_days is not None or req.planning_start_date is not None or 
        req.working_days_per_week is not None or req.max_daily_utilization_percentage is not None):
        try:
            team_dict = _get_team_config_from_db()
            team = TeamConfig(**team_dict)
            constraints = SprintConstraints(
                planning_start_date=datetime.date.fromisoformat(start_date_str),
                working_days_per_week=work_days,
                max_daily_utilization_percentage=util
            )
            
            ratio = raw_effort / reasoning.get("raw_effort_days", 10.0) if reasoning.get("raw_effort_days", 0) > 0 else 1.0
            est = EstimateRecord(
                estimate_id=reasoning.get("estimate_id", f"EST-{plan_id}"),
                demand_id=plan["demand_id"],
                effort_days=raw_effort,
                effort_range_low=reasoning.get("raw_effort_days", raw_effort) * 0.9 * ratio,
                effort_range_high=reasoning.get("raw_effort_days", raw_effort) * 1.2 * ratio,
                cost_estimate=1000.0 * raw_effort,
                duration_weeks=raw_effort / 5.0,
                confidence="medium",
                methodology="WBS",
                risk_factors=[],
                status="approved"
            )
            
            accepted_plans = db.get_all()
            new_plans = generate_plans([est], team, constraints, accepted_plans=accepted_plans)
            if new_plans:
                new_plan = new_plans[0]
                new_tasks = new_plan.tasks
                
                merged_tasks = []
                for nt in new_tasks:
                    old_t = next((ot for ot in plan.get("tasks", []) if ot["task_id"] == nt.task_id), None)
                    if old_t and old_t.get("status") == "completed":
                        merged_tasks.append(old_t)
                    else:
                        nt_dict = nt.model_dump_iso()
                        reassigned = next((r for r in reallocations if r["task_id"] == nt.task_id), None)
                        if reassigned:
                            nt_dict["owner"] = reassigned["new_assignee"]
                        merged_tasks.append(nt_dict)
                
                plan["tasks"] = merged_tasks
                plan["end_date"] = max(t["end_date"] for t in merged_tasks)
                plan["critical_path_task_ids"] = [t["task_id"] for t in merged_tasks]
                plan["_reasoning"] = _build_reasoning(est, plan_id)
        except Exception as e:
            print(f"[Reschedule] Error during replan rescheduling: {e}")

    # 7. Save updated plan
    db.save(plan)

    return {
        "status": "success",
        "plan": plan,
        "reallocations": reallocations,
        "started": started
    }


@app.get("/api/plans/{plan_id}/history")
def get_history(plan_id: str):
    """Fetch history list for this plan."""
    return db.get_plan_history(plan_id)


def find_replacement_employee(task, original_employee_email, all_employees, active_plans):
    import datetime
    orig_emp = next((e for e in all_employees if e["email"] == original_employee_email), None)
    if not orig_emp:
        orig_emp = {"role": "backend", "skills": "backend", "experience": 5}
    
    task_start = datetime.date.fromisoformat(task["start_date"])
    task_end = datetime.date.fromisoformat(task["end_date"])
    
    candidates = []
    for emp in all_employees:
        if emp["email"] == original_employee_email:
            continue
        if emp["status"] == "On Leave":
            continue
        
        if emp["leave_start_date"] and emp["leave_end_date"]:
            try:
                l_start = datetime.date.fromisoformat(emp["leave_start_date"])
                l_end = datetime.date.fromisoformat(emp["leave_end_date"])
                if max(task_start, l_start) <= min(task_end, l_end):
                    continue
            except ValueError:
                pass
        
        skill_match = emp["skills"].lower() == orig_emp["skills"].lower()
        role_match = emp["role"].lower() == orig_emp["role"].lower()
        
        available = True
        workload = 0
        for plan in active_plans:
            for t in plan.get("tasks", []):
                if t.get("owner") == emp["email"] or t.get("owner") == emp["employee_name"]:
                    t_status = t.get("status", "pending")
                    if t_status != "completed":
                        workload += 1
                        try:
                            p_start = datetime.date.fromisoformat(t["start_date"])
                            p_end = datetime.date.fromisoformat(t["end_date"])
                            if max(task_start, p_start) <= min(task_end, p_end):
                                available = False
                        except ValueError:
                            pass
        
        exp_diff = abs(emp["experience"] - orig_emp["experience"])
        
        score = (
            0 if skill_match else 1,
            0 if role_match else 1,
            0 if available else 1,
            workload,
            exp_diff
        )
        candidates.append((emp, score))
    
    if not candidates:
        return None
    
    candidates.sort(key=lambda x: x[1])
    return candidates[0][0]


def _get_team_config_from_db():
    roles_config = []
    total_members = 0
    for role in ["backend", "frontend", "qa", "devops"]:
        matched = db.get_employees_by_role(role, only_available=False)
        members = [e["email"] for e in matched]
        count = len(members) if members else 1
        if not members:
            members = [f"{role}_default_1"]
        total_members += count
        roles_config.append({
            "role": role,
            "count": count,
            "hours_per_day_per_person": 8.0,
            "members": members
        })
    return {
        "team_size": total_members,
        "roles": roles_config
    }


