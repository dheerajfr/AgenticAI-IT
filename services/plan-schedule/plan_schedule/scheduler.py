"""
scheduler.py — Core scheduling engine.

Converts WBS phase allocations into dated Tasks:
  1. Computes phase duration in working days respecting:
       - role capacity (hours_per_day_per_person)
       - max_daily_utilization_percentage
  2. Assigns sequential start/end dates (start = predecessor end + 1 working day).
  3. Assigns owners via round-robin across named members in each role.

Phase → primary role mapping (heuristic, covers typical delivery teams):
    design  → backend  (lead architects / senior devs drive design)
    build   → backend  (majority of build effort)
    test    → qa
    deploy  → devops

If a required role has no members configured, falls back to "unassigned".
"""

from __future__ import annotations

import math
import logging
import warnings
from datetime import date, timedelta
from typing import Dict, Iterator, List, Tuple

from plan_schedule.models import SprintConstraints, Task, TeamConfig
from plan_schedule.wbs import PHASE_DEPLOY, PHASE_BUILD, PHASE_DESIGN, PHASE_TEST, PhaseAllocation

log = logging.getLogger(__name__)

try:
    from database import db
except ImportError:
    db = None

# ---------------------------------------------------------------------------
# Phase → role mapping
# ---------------------------------------------------------------------------
_PHASE_ROLE: Dict[str, str] = {
    PHASE_DESIGN: "backend",
    PHASE_BUILD:  "backend",
    PHASE_TEST:   "qa",
    PHASE_DEPLOY: "devops",
}

_PHASE_DISPLAY_NAMES: Dict[str, str] = {
    PHASE_DESIGN: "Design & Setup",
    PHASE_BUILD:  "Build",
    PHASE_TEST:   "Test & QA",
    PHASE_DEPLOY: "Deploy & Release",
}

# Mapping from WBS phase → list of exact demand role names that feed that phase.
# These match the `role` field stored in resource_constraints from the demand module.
_PHASE_DEMAND_ROLES: Dict[str, List[str]] = {
    PHASE_DESIGN: ["Senior Architect", "Backend Developer", "Frontend Developer"],
    PHASE_BUILD:  ["Backend Developer", "Frontend Developer", "Senior Architect"],
    PHASE_TEST:   ["QA Engineer", "Security Engineer"],
    PHASE_DEPLOY: ["Security Engineer", "QA Engineer", "Backend Developer"],
}


# ---------------------------------------------------------------------------
# Calendar helpers
# ---------------------------------------------------------------------------

def _is_working_day(d: date, working_days_per_week: int) -> bool:
    """
    Naively treat Mon–Fri as working days when working_days_per_week == 5.
    For other values, use a rolling weekday window from Monday.
    Public holidays are NOT modelled (out of scope for this module).
    """
    return d.weekday() < working_days_per_week


def _next_working_day(d: date, working_days_per_week: int) -> date:
    """Return the next calendar day that is a working day (inclusive of d)."""
    while not _is_working_day(d, working_days_per_week):
        d += timedelta(days=1)
    return d


def _add_working_days(start: date, n_days: int, working_days_per_week: int) -> date:
    """
    Return the date that is exactly `n_days` working days after `start`
    (start is counted as day 1).
    """
    if n_days <= 0:
        return start
    remaining = n_days - 1            # start itself counts as day 1
    current = start
    while remaining > 0:
        current += timedelta(days=1)
        if _is_working_day(current, working_days_per_week):
            remaining -= 1
    return current


# ---------------------------------------------------------------------------
# Required headcount helper (demand-driven)
# ---------------------------------------------------------------------------

def get_required_count_for_role(phase: str, constraints: list) -> int:
    """
    Sum the `requiredCapacity` values from the demand resource_constraints
    for all roles that belong to the given WBS phase.

    Matching is done by exact role name against _PHASE_DEMAND_ROLES[phase].
    If no constraints match, returns 1 (default single-assignee).

    Example:
        demand has: Backend Developer: required=2, QA Engineer: required=1
        Phase 'build'  → demand roles = [Backend Developer, Frontend Developer, Senior Architect]
                       → matches Backend Developer (2) → returns 2
        Phase 'test'   → demand roles = [QA Engineer, Security Engineer]
                       → matches QA Engineer (1) → returns 1
    """
    demand_roles_for_phase = _PHASE_DEMAND_ROLES.get(phase, [])
    if not demand_roles_for_phase or not constraints:
        return 1

    total = 0
    found = False
    for c in constraints:
        role_name = (c.get("role") or "").strip()
        headcount = c.get("requiredCapacity", 0)
        if role_name in demand_roles_for_phase and headcount > 0:
            total += headcount
            found = True

    return total if found else 1


# ---------------------------------------------------------------------------
# Timeline and capacity aware resource allocator
# ---------------------------------------------------------------------------

class _RoundRobinOwner:
    """Stateful capacity-aware and timeline-aware resource allocator."""

    def __init__(self, team: TeamConfig, accepted_plans: List[dict] | None = None) -> None:
        self.team = team
        self.assignments: List[Tuple[str, date, date]] = []
        
        # Load all employees from database — these are the authoritative roster
        self._all_db_employees: List[dict] = []
        if db is not None:
            try:
                self._all_db_employees = db.get_employees()
            except Exception as e:
                log.warning("Could not load employees from database: %s", e)

        # Build self.employees from team config (for round-robin / test-compat fallback)
        # Map configured members to database employees or create virtual ones
        self.employees = []
        seen_emails: set = set()
        for role_cfg in team.roles:
            for member in role_cfg.members:
                matched_emp = None
                for emp in self._all_db_employees:
                    if emp["email"].lower() == member.lower() or emp["employee_name"].lower() == member.lower() or emp["email"].split("@")[0].lower() == member.lower():
                        matched_emp = emp
                        break
                
                if matched_emp:
                    if matched_emp["email"] not in seen_emails:
                        self.employees.append(matched_emp)
                        seen_emails.add(matched_emp["email"])
                else:
                    if member not in seen_emails:
                        self.employees.append({
                            "employee_id": f"VIRT-{member}",
                            "employee_name": member,
                            "email": member,
                            "role": role_cfg.role,
                            "skills": "",
                            "status": "Available",
                            "allocated": False,
                            "leave_start_date": None,
                            "leave_end_date": None
                        })
                        seen_emails.add(member)

        # Track existing assignments to avoid overlaps
        if accepted_plans:
            for plan in accepted_plans:
                if plan.get("status") in ("accepted", "approved"):
                    for t in plan.get("tasks", []):
                        owner_str = t.get("owner")
                        t_start = t.get("start_date")
                        t_end = t.get("end_date")
                        if owner_str and owner_str != "unassigned" and t_start and t_end:
                            try:
                                s_date = date.fromisoformat(t_start)
                                e_date = date.fromisoformat(t_end)
                                owners = [o.strip() for o in owner_str.split(",") if o.strip()]
                                for owner in owners:
                                    self.assignments.append((owner, s_date, e_date))
                            except ValueError:
                                pass

    def get_utilization_days(self, email: str) -> int:
        total_days = 0
        norm = email.lower()
        for assigned_email, s_date, e_date in self.assignments:
            ae = assigned_email.lower()
            if ae == norm or ae.split("@")[0] == norm.split("@")[0]:
                total_days += (e_date - s_date).days + 1
        return total_days

    def _init_selected_teams(self, demand_constraints: List[dict] | None) -> None:
        if hasattr(self, "_selected_teams_initialized") and self._selected_teams_initialized:
            return
        
        self._selected_teams = {}
        self._selected_teams_initialized = True
        
        if not demand_constraints:
            return
            
        for c in demand_constraints:
            role_name = c.get("role")
            if not role_name:
                continue
            required_count = c.get("requiredCapacity", 1)
            
            candidates = []
            seen_emails = set()
            
            def is_match(emp):
                emp_role = (emp.get("role") or "").strip().lower()
                emp_skills = (emp.get("skills") or emp.get("skill") or "").strip().lower()
                req_lower = role_name.strip().lower()
                
                if emp_role == req_lower:
                    return True
                norm_req = req_lower.replace("engineer", "").replace("developer", "").strip()
                if norm_req in emp_role or norm_req in emp_skills:
                    return True
                if "developer" in req_lower or "dev" in req_lower:
                    if "developer" in emp_role or "dev" in emp_role or "architect" in emp_role:
                        return True
                return False
                
            # Filter from DB employees
            for emp in self._all_db_employees:
                if is_match(emp) and emp["email"] not in seen_emails:
                    candidates.append(emp)
                    seen_emails.add(emp["email"])
                    
            # Filter from config employees
            for emp in self.employees:
                if is_match(emp) and emp["email"] not in seen_emails:
                    candidates.append(emp)
                    seen_emails.add(emp["email"])
                    
            if not candidates:
                candidates = self._all_db_employees or self.employees
                
            def get_score(emp):
                status_avail = 1 if emp.get("status", "Available") == "Available" else 0
                skill_match = 1 if (role_name.lower() in (emp.get("skill") or "").lower() or role_name.lower() in (emp.get("skills") or "").lower()) else 0
                exp = emp.get("experience", 0) or 0
                workload = -self.get_utilization_days(emp["email"])
                return (status_avail, skill_match, exp, workload)
                
            candidates.sort(key=get_score, reverse=True)
            self._selected_teams[role_name] = candidates[:required_count]

    def get_assigned_team_for_phase(self, phase: str) -> List[dict]:
        phase_lower = phase.lower()
        category = ""
        if "design" in phase_lower or "build" in phase_lower:
            category = "developer"
        elif "test" in phase_lower:
            category = "qa"
        elif "deploy" in phase_lower:
            category = "devops"
            
        combined_team = []
        seen_emails = set()
        
        for role_name, emps in self._selected_teams.items():
            norm_role = role_name.lower()
            is_match = False
            if category == "developer" and ("developer" in norm_role or "architect" in norm_role or "backend" in norm_role or "frontend" in norm_role):
                is_match = True
            elif category == "qa" and ("qa" in norm_role or "test" in norm_role):
                is_match = True
            elif category == "devops" and ("devops" in norm_role or "security" in norm_role or "ops" in norm_role or "infra" in norm_role or "cloud" in norm_role):
                is_match = True
                
            if is_match:
                for emp in emps:
                    if emp["email"] not in seen_emails:
                        combined_team.append(emp)
                        seen_emails.add(emp["email"])
                        
        if combined_team:
            return combined_team
            
        for emps in self._selected_teams.values():
            for emp in emps:
                if emp["email"] not in seen_emails:
                    combined_team.append(emp)
                    seen_emails.add(emp["email"])
                    
        return combined_team

    def get_adjusted_window(
        self,
        phase: str,
        start_date: date,
        duration_days: int,
        required_count: int,
        working_days_per_week: int,
        demand_constraints: List[dict] | None
    ) -> Tuple[date, date]:
        self._init_selected_teams(demand_constraints)
        assigned_team = self.get_assigned_team_for_phase(phase)
        
        if not assigned_team:
            end = _add_working_days(start_date, duration_days, working_days_per_week)
            return start_date, end
            
        current_start = start_date
        pool_size = len(assigned_team)
        effective_req_count = min(required_count, pool_size)
        
        for _ in range(365):
            current_start = _next_working_day(current_start, working_days_per_week)
            current_end = _add_working_days(current_start, duration_days, working_days_per_week)
            
            free_candidates = []
            for emp in assigned_team:
                email = emp["email"]
                has_overlap = False
                for assigned_email, s_date, e_date in self.assignments:
                    if assigned_email.lower() == email.lower():
                        if max(current_start, s_date) <= min(current_end, e_date):
                            has_overlap = True
                            break
                if not has_overlap:
                    free_candidates.append(emp)
                    
            if len(free_candidates) >= effective_req_count:
                return current_start, current_end
                
            current_start += timedelta(days=1)
            
        end = _add_working_days(start_date, duration_days, working_days_per_week)
        return start_date, end

    def next_owner(self, role: str, start_date: date | None = None, end_date: date | None = None) -> str:
        """Backward-compatible single-owner allocator."""
        owners = self.next_owners(role, start_date or date.min, end_date or date.max, 1)
        return owners[0] if owners else "unassigned"

    def next_owners(
        self,
        role: str,
        start_date: date,
        end_date: date,
        count: int,
        demand_constraints: List[dict] | None = None,
        phase: str | None = None,
    ) -> List[str]:
        """Assign exactly `count` employees to this task."""
        
        # ─── DEMAND-DRIVEN PATH ──────────────────────────────────────────────
        if demand_constraints and phase is not None:
            self._init_selected_teams(demand_constraints)
            assigned_team = self.get_assigned_team_for_phase(phase)
            
            if not assigned_team:
                log.warning(
                    "[scheduler] No pre-selected team members for phase '%s'. Falling back.",
                    phase
                )
            else:
                assigned_team_sorted = sorted(assigned_team, key=lambda e: self.get_utilization_days(e["email"]))
                allocated_emails: List[str] = []
                pool_size = len(assigned_team_sorted)
                for i in range(count):
                    emp = assigned_team_sorted[i % pool_size]
                    email = emp["email"]
                    allocated_emails.append(email)
                    self.assignments.append((email, start_date, end_date))
                    
                return allocated_emails

        # ─── LEGACY / TEST ROUND-ROBIN PATH ─────────────────────────────────
        candidates = []
        role_lower = role.lower()
        
        for emp in self.employees:
            emp_role = (emp.get("role") or "").lower()
            emp_skills = (emp.get("skills") or "").lower()
            
            match = False
            if role_lower == "backend":
                if "developer" in emp_role or "architect" in emp_role or "backend" in emp_role or "backend" in emp_skills:
                    if "frontend" not in emp_role and "frontend" not in emp_skills:
                        match = True
            elif role_lower == "frontend":
                if "frontend" in emp_role or "frontend" in emp_skills or "ui" in emp_role or "ux" in emp_role:
                    match = True
            elif role_lower == "qa":
                if "qa" in emp_role or "qa" in emp_skills or "test" in emp_role or "test" in emp_skills:
                    match = True
            elif role_lower == "devops":
                if "devops" in emp_role or "devops" in emp_skills or "security" in emp_role or "security" in emp_skills or "infra" in emp_role or "cloud" in emp_role:
                    match = True
                    
            if match:
                candidates.append(emp)

        if not candidates:
            return ["unassigned"] * count

        # Test round-robin mode (start_date is date.min and end_date is date.max)
        if start_date == date.min and end_date == date.max:
            if not hasattr(self, "_counters"):
                self._counters = {}
            self._counters.setdefault(role, 0)
            allocated_emails = []
            for _ in range(count):
                idx = self._counters[role] % len(candidates)
                allocated_emails.append(candidates[idx]["email"])
                self._counters[role] += 1
            return allocated_emails

        # Sort all candidates by utilization
        all_sorted = sorted(candidates, key=lambda emp: self.get_utilization_days(emp["email"]))

        # Assign count employees, cycling if pool is smaller
        allocated_emails = []
        pool_size = len(all_sorted)
        for i in range(count):
            emp = all_sorted[i % pool_size]
            email = emp["email"]
            allocated_emails.append(email)
            self.assignments.append((email, start_date, end_date))

        return allocated_emails


# ---------------------------------------------------------------------------
# Duration calculation
# ---------------------------------------------------------------------------

def _phase_duration_working_days(
    phase_effort_days: float,
    role: str,
    team: TeamConfig,
    constraints: SprintConstraints,
    assigned_count: int | None = None,
) -> int:
    """
    Convert phase effort (person-days) into calendar working days for
    a given role, respecting the utilization cap.
    """
    util = constraints.max_daily_utilization_percentage / 100.0

    if assigned_count is None:
        role_cfg = next((r for r in team.roles if r.role == role), None)
        assigned_count = role_cfg.count if role_cfg is not None else 1

    daily_hours = assigned_count * 8.0 * util
    daily_capacity_person_days = daily_hours / 8.0

    if daily_capacity_person_days <= 0:
        daily_capacity_person_days = 1.0

    raw_days = phase_effort_days / daily_capacity_person_days
    return max(1, math.ceil(raw_days))


# ---------------------------------------------------------------------------
# Main scheduling function
# ---------------------------------------------------------------------------

def schedule_phases(
    estimate_id: str,
    demand_id: str,
    plan_seq: int,
    allocations: List[PhaseAllocation],
    team: TeamConfig,
    constraints: SprintConstraints,
    global_owner_state: _RoundRobinOwner | None = None,
) -> Tuple[List[Task], List[str]]:
    """
    Convert phase allocations into a sequenced list of Tasks.
    """
    owner_rr = global_owner_state or _RoundRobinOwner(team)

    # Fetch demand resource constraints from source.db
    demand_constraints = []
    if db is not None:
        try:
            with db._plan_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
                row = cursor.fetchone()
                if row:
                    import json
                    demand_data = json.loads(row[0])
                    demand_constraints = demand_data.get("resource_constraints") or []
        except Exception as e:
            print(f"[scheduler] Error loading demand resource constraints: {e}")

    tasks: List[Task] = []
    predecessor_ids: List[str] = []
    current_start = _next_working_day(
        constraints.planning_start_date,
        constraints.working_days_per_week,
    )

    for alloc in allocations:
        phase_role = _PHASE_ROLE[alloc.phase]
        
        # Determine required headcount directly from demand constraints.
        # requiredCapacity is the literal number of employees to assign (e.g. 2 means assign 2 people).
        required_count = get_required_count_for_role(alloc.phase, demand_constraints)

        # The allocation of multiple persons for a task depends on the time/effort taking for completion.
        # If the task takes less time (effort_days < 10.0), allocate a single person.
        # If it takes more time (effort_days >= 10.0), multiple employees are allocated.
        if alloc.effort_days < 10.0:
            allocated_count = 1
        else:
            allocated_count = required_count

        # Compute duration working days based on the allocated count
        duration_days = _phase_duration_working_days(
            alloc.effort_days, phase_role, team, constraints, allocated_count
        )
        if demand_constraints:
            current_start, end = owner_rr.get_adjusted_window(
                alloc.phase, current_start, duration_days, allocated_count,
                constraints.working_days_per_week, demand_constraints
            )
        else:
            end = _add_working_days(current_start, duration_days, constraints.working_days_per_week)

        # Allocate owners — pass demand_constraints + phase so next_owners can use
        # the exact demand roles as the source of truth for employee selection.
        owners = owner_rr.next_owners(
            phase_role, current_start, end, allocated_count,
            demand_constraints=demand_constraints or None,
            phase=alloc.phase,
        )

        # Build task_id: PLN-<seq>-<PHASE>
        task_id = f"PLN-{plan_seq:04d}-{alloc.phase.upper()}"
        display_name = _PHASE_DISPLAY_NAMES[alloc.phase]

        # owner is a comma-separated list of owners for backward compatibility
        owner_str = ", ".join(owners)

        task = Task(
            task_id=task_id,
            name=display_name,
            start_date=current_start,
            end_date=end,
            owner=owner_str,
            owners=owners,
            predecessor_task_ids=list(predecessor_ids),
        )
        tasks.append(task)

        # Next phase starts the day after this one ends (next working day)
        predecessor_ids = [task_id]
        next_day = end + timedelta(days=1)
        current_start = _next_working_day(next_day, constraints.working_days_per_week)

    critical_path = [t.task_id for t in tasks]
    return tasks, critical_path
