"""
critical_path.py — Critical path computation.

Single-plan case:
    All phases are fully sequential, so every task is critical.
    The scheduler already returns them in order.

Multi-plan batch case:
    Uses a longest-path (topological sort) across the cross-plan
    dependency graph to identify which plans / tasks form the
    project critical path.

    Each plan is treated as a single node with weight = plan duration
    in calendar days (end_date - first task start_date).
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import date
from typing import Dict, List, Optional, Set

from plan_schedule.models import DependencyEdge, PlanRecord


# ---------------------------------------------------------------------------
# Single-plan helper (trivial — all sequential tasks are critical)
# ---------------------------------------------------------------------------

def single_plan_critical_path(task_ids: List[str]) -> List[str]:
    """
    For a single, fully sequential plan every task is on the critical path.
    Returns the task_ids in their existing (phase) order.
    """
    return list(task_ids)


# ---------------------------------------------------------------------------
# Multi-plan critical path (longest path in a DAG)
# ---------------------------------------------------------------------------

def _plan_duration_days(plan: PlanRecord) -> int:
    """Calendar days from first task start to plan end."""
    first_start: date = min(t.start_date for t in plan.tasks)
    return (plan.end_date - first_start).days + 1


def multi_plan_critical_path(
    plans: List[PlanRecord],
    dependencies: List[DependencyEdge],
) -> List[str]:
    """
    Compute the critical (longest) path across a batch of PlanRecords
    connected by cross-plan dependency edges.

    Returns
    -------
    List[str]
        Ordered list of plan_ids that form the critical path.
        Internal task-level critical path for each of those plans is
        left to single_plan_critical_path.
    """
    plan_map: Dict[str, PlanRecord] = {p.plan_id: p for p in plans}
    plan_ids = list(plan_map.keys())

    # Build adjacency list and in-degree
    adj: Dict[str, List[str]] = defaultdict(list)      # from → [to]
    in_degree: Dict[str, int] = defaultdict(int)
    for edge in dependencies:
        adj[edge.from_plan_id].append(edge.to_plan_id)
        in_degree[edge.to_plan_id] += 1

    # Kahn's topological sort + longest-path DP
    dist: Dict[str, int] = {pid: _plan_duration_days(plan_map[pid]) for pid in plan_ids}
    prev: Dict[str, Optional[str]] = {pid: None for pid in plan_ids}

    queue: deque[str] = deque(
        pid for pid in plan_ids if in_degree[pid] == 0
    )

    topo_order: List[str] = []
    while queue:
        node = queue.popleft()
        topo_order.append(node)
        for neighbour in adj[node]:
            candidate = dist[node] + _plan_duration_days(plan_map[neighbour])
            if candidate > dist[neighbour]:
                dist[neighbour] = candidate
                prev[neighbour] = node
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    if len(topo_order) != len(plan_ids):
        raise ValueError(
            "Cycle detected in cross-plan dependency graph — "
            "cannot compute critical path."
        )

    # Find the plan with the maximum accumulated distance
    sink = max(dist, key=lambda p: dist[p])

    # Trace back the path
    path: List[str] = []
    node: Optional[str] = sink
    while node is not None:
        path.append(node)
        node = prev[node]

    path.reverse()
    return path
