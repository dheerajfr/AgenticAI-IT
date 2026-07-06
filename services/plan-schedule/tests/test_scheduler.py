"""
test_scheduler.py — Unit tests for plan_schedule.scheduler

Covers:
  - Working-day arithmetic helpers
  - Phase duration respects utilization cap
  - Sequential phase ordering (start_n+1 > end_n)
  - Round-robin owner assignment
  - Weekend skip
"""

import pytest
from datetime import date

from plan_schedule.models import SprintConstraints, TeamConfig
from plan_schedule.scheduler import (
    _RoundRobinOwner,
    _add_working_days,
    _is_working_day,
    _next_working_day,
    _phase_duration_working_days,
    schedule_phases,
)
from plan_schedule.wbs import compute_phase_allocations, PHASE_BUILD, PHASE_TEST


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def team() -> TeamConfig:
    return TeamConfig(
        team_size=6,
        roles=[
            {"role": "backend", "count": 2, "hours_per_day_per_person": 8,
             "members": ["m.rodriguez", "d.chen"]},
            {"role": "frontend", "count": 1, "hours_per_day_per_person": 8,
             "members": ["f.nguyen"]},
            {"role": "qa", "count": 2, "hours_per_day_per_person": 8,
             "members": ["alice.smith", "bob.jones"]},
            {"role": "devops", "count": 1, "hours_per_day_per_person": 8,
             "members": ["clara.davis"]},
        ],
    )


@pytest.fixture
def constraints() -> SprintConstraints:
    return SprintConstraints(
        planning_start_date=date(2026, 7, 7),   # Tuesday
        working_days_per_week=5,
        max_daily_utilization_percentage=85,
    )


# ---------------------------------------------------------------------------
# Calendar helper tests
# ---------------------------------------------------------------------------

class TestCalendarHelpers:
    def test_weekday_is_working(self):
        assert _is_working_day(date(2026, 7, 7), 5)  # Monday

    def test_saturday_not_working(self):
        assert not _is_working_day(date(2026, 7, 11), 5)  # Saturday

    def test_sunday_not_working(self):
        assert not _is_working_day(date(2026, 7, 12), 5)  # Sunday

    def test_next_working_day_weekday(self):
        d = date(2026, 7, 7)   # Monday
        assert _next_working_day(d, 5) == date(2026, 7, 7)

    def test_next_working_day_skips_weekend(self):
        d = date(2026, 7, 11)  # Saturday
        assert _next_working_day(d, 5) == date(2026, 7, 13)  # Monday

    def test_add_working_days_simple(self):
        start = date(2026, 7, 7)   # Tuesday (Jul 1 2026 = Wed, so Jul 7 = Tue)
        # 5 working days from Tuesday: Tue(1) Wed(2) Thu(3) Fri(4) Mon(5) = Jul 13
        result = _add_working_days(start, 5, 5)
        assert result == date(2026, 7, 13)

    def test_add_working_days_crosses_weekend(self):
        start = date(2026, 7, 9)   # Wednesday
        # 5 working days from Wednesday → next Wednesday
        result = _add_working_days(start, 5, 5)
        assert result == date(2026, 7, 15)  # Wed + 2 days this week + 3 next week

    def test_add_zero_days(self):
        start = date(2026, 7, 7)
        assert _add_working_days(start, 0, 5) == start


# ---------------------------------------------------------------------------
# Duration calculation tests
# ---------------------------------------------------------------------------

class TestPhaseDuration:
    def test_backend_role_with_two_members(self, team, constraints):
        # backend: 2 members × 8 h/day × 0.85 util = 13.6 h → 1.7 person-days
        # effort = 10 days → ceil(10 / 1.7) = ceil(5.88) = 6 working days
        dur = _phase_duration_working_days(10.0, "backend", team, constraints)
        assert dur == 6

    def test_single_devops_member(self, team, constraints):
        # devops: 1 member × 8 h × 0.85 = 6.8 h → 0.85 person-days
        # effort = 5 days → ceil(5 / 0.85) = ceil(5.88) = 6 working days
        dur = _phase_duration_working_days(5.0, "devops", team, constraints)
        assert dur == 6

    def test_minimum_one_day(self, team, constraints):
        # Even tiny effort should produce ≥ 1 day
        dur = _phase_duration_working_days(0.001, "backend", team, constraints)
        assert dur >= 1


# ---------------------------------------------------------------------------
# Round-robin owner tests
# ---------------------------------------------------------------------------

class TestRoundRobinOwner:
    def test_backend_cycles(self, team):
        rr = _RoundRobinOwner(team)
        assert rr.next_owner("backend") == "m.rodriguez"
        assert rr.next_owner("backend") == "d.chen"
        assert rr.next_owner("backend") == "m.rodriguez"

    def test_qa_cycles(self, team):
        rr = _RoundRobinOwner(team)
        assert rr.next_owner("qa") == "alice.smith"
        assert rr.next_owner("qa") == "bob.jones"
        assert rr.next_owner("qa") == "alice.smith"

    def test_unknown_role_returns_unassigned(self, team):
        rr = _RoundRobinOwner(team)
        assert rr.next_owner("unknown_role") == "unassigned"


# ---------------------------------------------------------------------------
# Full schedule_phases integration tests
# ---------------------------------------------------------------------------

class TestSchedulePhases:
    def test_sequential_ordering(self, team, constraints):
        """Every task must start after the previous one ends."""
        allocs = compute_phase_allocations(60.0, [])
        tasks, _ = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        for i in range(1, len(tasks)):
            assert tasks[i].start_date > tasks[i - 1].end_date, (
                f"Task {tasks[i].task_id} starts before {tasks[i-1].task_id} ends"
            )

    def test_four_tasks_produced(self, team, constraints):
        allocs = compute_phase_allocations(60.0, [])
        tasks, _ = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        assert len(tasks) == 4

    def test_all_tasks_critical_single_plan(self, team, constraints):
        allocs = compute_phase_allocations(60.0, [])
        tasks, cp_ids = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        assert set(cp_ids) == {t.task_id for t in tasks}

    def test_start_date_respects_planning_start(self, team, constraints):
        """First task must start on or after planning_start_date."""
        allocs = compute_phase_allocations(60.0, [])
        tasks, _ = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        assert tasks[0].start_date >= constraints.planning_start_date

    def test_first_task_start_is_working_day(self, team, constraints):
        allocs = compute_phase_allocations(60.0, [])
        tasks, _ = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        assert tasks[0].start_date.weekday() < 5  # 0=Mon … 4=Fri

    def test_predecessors_wired_correctly(self, team, constraints):
        allocs = compute_phase_allocations(60.0, [])
        tasks, _ = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        assert tasks[0].predecessor_task_ids == []
        for i in range(1, len(tasks)):
            assert tasks[i].predecessor_task_ids == [tasks[i - 1].task_id]

    def test_owner_assigned(self, team, constraints):
        allocs = compute_phase_allocations(60.0, [])
        tasks, _ = schedule_phases(
            estimate_id="EST-TEST-1",
            demand_id="DEM-TEST-1",
            plan_seq=1,
            allocations=allocs,
            team=team,
            constraints=constraints,
        )
        for task in tasks:
            assert task.owner and task.owner != ""
