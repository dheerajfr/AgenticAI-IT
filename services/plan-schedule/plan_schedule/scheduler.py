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
from datetime import date, timedelta
from typing import Dict, Iterator, List, Tuple

from plan_schedule.models import SprintConstraints, Task, TeamConfig
from plan_schedule.wbs import PHASE_DEPLOY, PHASE_BUILD, PHASE_DESIGN, PHASE_TEST, PhaseAllocation

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
# Owner round-robin
# ---------------------------------------------------------------------------

class _RoundRobinOwner:
    """Stateful round-robin owner iterator per role."""

    def __init__(self, team: TeamConfig) -> None:
        self._counters: Dict[str, int] = {}
        self._members: Dict[str, List[str]] = {}
        for role_cfg in team.roles:
            self._members[role_cfg.role] = role_cfg.members
            self._counters[role_cfg.role] = 0

    def next_owner(self, role: str) -> str:
        members = self._members.get(role, [])
        if not members:
            return "unassigned"
        idx = self._counters.get(role, 0)
        owner = members[idx % len(members)]
        self._counters[role] = idx + 1
        return owner


# ---------------------------------------------------------------------------
# Duration calculation
# ---------------------------------------------------------------------------

def _phase_duration_working_days(
    phase_effort_days: float,
    role: str,
    team: TeamConfig,
    constraints: SprintConstraints,
) -> int:
    """
    Convert phase effort (person-days) into calendar working days for
    a given role, respecting the utilization cap.

    Formula:
        daily_capacity = count * hours_per_day_per_person * (utilization / 100)
        # normalise to "person-days" at 8 h/person-day
        effective_persons_per_day = daily_capacity / 8
        calendar_days = ceil(phase_effort_days / effective_persons_per_day)

    If the role doesn't exist in the team, treat as 1 person at 8 h/day.
    """
    util = constraints.max_daily_utilization_percentage / 100.0

    role_cfg = next((r for r in team.roles if r.role == role), None)
    if role_cfg is None:
        # Fallback: single person at 8 h/day
        daily_capacity_person_days = 1.0 * util
    else:
        # total available hours today across role members
        daily_hours = role_cfg.count * role_cfg.hours_per_day_per_person * util
        # convert to person-days (normalised at 8 h)
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

    Parameters
    ----------
    estimate_id:
        Used to derive task_id prefixes.
    demand_id:
        Propagated into Task metadata (used by planner for plan_id naming).
    plan_seq:
        Sequential index of this plan in the batch (1-based), used for task_id uniqueness.
    allocations:
        Ordered list of PhaseAllocation objects (output of wbs.compute_phase_allocations).
    team:
        TeamConfig for role lookup and member assignment.
    constraints:
        SprintConstraints for calendar rules.
    global_owner_state:
        Shared _RoundRobinOwner across all plans in a batch, so owners distribute
        across plans. Pass None to create a fresh state for a single plan.

    Returns
    -------
    (tasks, critical_path_task_ids)
        tasks: scheduled Task objects in phase order
        critical_path_task_ids: all task_ids (fully sequential = all critical)
    """
    owner_rr = global_owner_state or _RoundRobinOwner(team)

    tasks: List[Task] = []
    predecessor_ids: List[str] = []
    current_start = _next_working_day(
        constraints.planning_start_date,
        constraints.working_days_per_week,
    )

    for alloc in allocations:
        role = _PHASE_ROLE[alloc.phase]
        duration_days = _phase_duration_working_days(
            alloc.effort_days, role, team, constraints
        )
        end = _add_working_days(current_start, duration_days, constraints.working_days_per_week)

        # Build a compact task_id:  PLN-<seq>-<PHASE>
        task_id = f"PLN-{plan_seq:04d}-{alloc.phase.upper()}"
        owner = owner_rr.next_owner(role)
        display_name = _PHASE_DISPLAY_NAMES[alloc.phase]

        task = Task(
            task_id=task_id,
            name=display_name,
            start_date=current_start,
            end_date=end,
            owner=owner,
            predecessor_task_ids=list(predecessor_ids),
        )
        tasks.append(task)

        # Next phase starts the day after this one ends (next working day)
        predecessor_ids = [task_id]
        next_day = end + timedelta(days=1)
        current_start = _next_working_day(next_day, constraints.working_days_per_week)

    critical_path = [t.task_id for t in tasks]
    return tasks, critical_path
