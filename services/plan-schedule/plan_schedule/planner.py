"""
planner.py — Orchestrator for Stage 03: Plan & Schedule.

Entry point for the pipeline. Call `generate_plans()` with a batch of
EstimateRecords, a TeamConfig, SprintConstraints, and an optional
cross-plan dependency list.

Rules enforced here:
  - Only 'approved' or 're-baselined' estimates produce a PlanRecord.
  - 'draft' and 'challenged' are logged and skipped — never silently dropped.
  - Missing team_config or sprint_constraints raises ValueError immediately.
  - Every eligible estimate produces exactly one PlanRecord.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from plan_schedule.buffer import buffered_effort_days, compute_buffer_multiplier
from plan_schedule.critical_path import multi_plan_critical_path, single_plan_critical_path
from plan_schedule.models import (
    DependencyEdge,
    EstimateRecord,
    PlanRecord,
    SprintConstraints,
    TeamConfig,
    Task,
)
from plan_schedule.scheduler import _RoundRobinOwner, schedule_phases
from plan_schedule.wbs import compute_phase_allocations

log = logging.getLogger(__name__)

# Statuses that are eligible for scheduling
_ELIGIBLE_STATUSES = frozenset(["approved", "re-baselined"])


def _plan_id_from_estimate(estimate: EstimateRecord, seq: int) -> str:
    """Derive a plan_id from the estimate_id and sequential index."""
    # e.g.  EST-0001-1  →  PLN-0001-1
    return estimate.estimate_id.replace("EST-", "PLN-", 1)


def generate_plans(
    estimates: List[EstimateRecord],
    team_config: Optional[TeamConfig],
    sprint_constraints: Optional[SprintConstraints],
    dependencies: Optional[List[DependencyEdge]] = None,
) -> List[PlanRecord]:
    """
    Convert a batch of EstimateRecords into PlanRecords.

    Parameters
    ----------
    estimates:
        One or more EstimateRecords from Stage 02. Mixed statuses allowed;
        only 'approved' / 're-baselined' are scheduled.
    team_config:
        Required. Raises ValueError if None.
    sprint_constraints:
        Required. Raises ValueError if None.
    dependencies:
        Optional cross-plan dependency edges. When supplied, used for
        multi-plan critical-path computation.

    Returns
    -------
    List[PlanRecord]
        One PlanRecord per eligible estimate, in input order.

    Raises
    ------
    ValueError
        If team_config or sprint_constraints is None.
    """
    # --- Guard: required inputs ---
    if team_config is None:
        raise ValueError(
            "team_config is required to generate plans. "
            "Cannot fabricate dates without team configuration."
        )
    if sprint_constraints is None:
        raise ValueError(
            "sprint_constraints is required to generate plans. "
            "Cannot fabricate dates without calendar constraints."
        )

    deps: List[DependencyEdge] = dependencies or []

    # Shared round-robin owner state across all plans in this batch
    global_owner_rr = _RoundRobinOwner(team_config)

    plans: List[PlanRecord] = []

    for seq, estimate in enumerate(estimates, start=1):
        # --- Status gate ---
        if estimate.status not in _ELIGIBLE_STATUSES:
            log.warning(
                "SKIPPED estimate_id=%s demand_id=%s status=%s — "
                "only 'approved' or 're-baselined' estimates are scheduled.",
                estimate.estimate_id,
                estimate.demand_id,
                estimate.status,
            )
            continue

        log.info(
            "Scheduling estimate_id=%s demand_id=%s status=%s confidence=%s",
            estimate.estimate_id,
            estimate.demand_id,
            estimate.status,
            estimate.confidence,
        )

        # --- Step 1: Buffer ---
        buf_days = buffered_effort_days(estimate)
        buf_mult = compute_buffer_multiplier(estimate)
        log.debug(
            "  Buffer: raw=%.1f days × %.4f → %.2f buffered days",
            estimate.effort_days,
            buf_mult,
            buf_days,
        )

        # --- Step 2: WBS split ---
        allocations = compute_phase_allocations(buf_days, estimate.risk_factors)
        for a in allocations:
            log.debug("  WBS  : phase=%-8s  frac=%.2f  days=%.2f", a.phase, a.fraction, a.effort_days)

        # --- Step 3: Schedule ---
        tasks, cp_task_ids = schedule_phases(
            estimate_id=estimate.estimate_id,
            demand_id=estimate.demand_id,
            plan_seq=seq,
            allocations=allocations,
            team=team_config,
            constraints=sprint_constraints,
            global_owner_state=global_owner_rr,
        )

        # --- Step 4: Assemble PlanRecord ---
        plan_id = _plan_id_from_estimate(estimate, seq)
        end_date = max(t.end_date for t in tasks)

        # Critical path for this individual plan = all tasks (sequential)
        cp_ids = single_plan_critical_path(cp_task_ids)

        plan = PlanRecord(
            plan_id=plan_id,
            demand_id=estimate.demand_id,
            end_date=end_date,
            critical_path_task_ids=cp_ids,
            tasks=tasks,
        )
        plans.append(plan)
        log.info(
            "  → PlanRecord plan_id=%s end_date=%s tasks=%d",
            plan_id,
            end_date,
            len(tasks),
        )

    # --- Multi-plan critical path (if cross-plan dependencies supplied) ---
    if len(plans) > 1 and deps:
        try:
            cross_plan_cp = multi_plan_critical_path(plans, deps)
            log.info("Cross-plan critical path (plan_ids): %s", cross_plan_cp)
        except ValueError as exc:
            log.error("Critical path error: %s", exc)

    return plans
