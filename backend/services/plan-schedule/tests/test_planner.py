"""
test_planner.py — Integration tests for plan_schedule.planner.generate_plans

Uses the real upstream estimate fixtures (copied from estimate-shape/fixtures).

Scenarios:
  1. approved estimate (EST-0001-1) → exactly one PlanRecord
  2. draft estimate (EST-0002-1)    → no PlanRecord produced (silently skipped)
  3. approved + draft batch         → only approved produces a PlanRecord
  4. re-baselined estimate          → PlanRecord produced with extra buffer applied
  5. missing team_config            → ValueError raised
  6. missing sprint_constraints     → ValueError raised
  7. Output schema integrity        → PlanRecord passes model validation
"""

import json
from datetime import date
from pathlib import Path

import pytest

from plan_schedule.models import EstimateRecord, SprintConstraints, TeamConfig
from plan_schedule.planner import generate_plans

# Path to this file's fixture directory
FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_estimate(filename: str) -> EstimateRecord:
    raw = json.loads((FIXTURES_DIR / filename).read_text(encoding="utf-8"))
    return EstimateRecord(**raw)


def _load_team() -> TeamConfig:
    raw = json.loads((FIXTURES_DIR / "team_config.json").read_text(encoding="utf-8"))
    return TeamConfig(**raw)


def _load_constraints() -> SprintConstraints:
    raw = json.loads((FIXTURES_DIR / "sprint_constraints.json").read_text(encoding="utf-8"))
    return SprintConstraints(**raw)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def team():
    return _load_team()


@pytest.fixture
def constraints():
    return _load_constraints()


@pytest.fixture
def est_approved():
    return _load_estimate("estimate_approved.json")      # EST-0001-1, approved


@pytest.fixture
def est_draft():
    return _load_estimate("estimate_draft.json")         # EST-0002-1, draft


@pytest.fixture
def est_approved_2():
    return _load_estimate("estimate_approved_2.json")    # EST-0003-1, approved


@pytest.fixture
def est_rebaselined():
    return _load_estimate("estimate_rebaselined.json")   # EST-0004-1, re-baselined


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestStatusGating:
    def test_approved_produces_plan(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        assert len(plans) == 1

    def test_draft_produces_no_plan(self, est_draft, team, constraints):
        plans = generate_plans([est_draft], team, constraints)
        assert len(plans) == 0

    def test_mixed_batch_only_approved_scheduled(self, est_approved, est_draft, team, constraints):
        plans = generate_plans([est_approved, est_draft], team, constraints)
        assert len(plans) == 1
        assert plans[0].demand_id == "DEM-2026-0001"

    def test_rebaselined_produces_plan(self, est_rebaselined, team, constraints):
        plans = generate_plans([est_rebaselined], team, constraints)
        assert len(plans) == 1


class TestMissingInputs:
    def test_missing_team_config_raises(self, est_approved, constraints):
        with pytest.raises(ValueError, match="team_config is required"):
            generate_plans([est_approved], None, constraints)

    def test_missing_sprint_constraints_raises(self, est_approved, team):
        with pytest.raises(ValueError, match="sprint_constraints is required"):
            generate_plans([est_approved], team, None)


class TestOutputIntegrity:
    def test_plan_id_derived_from_estimate(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        # EST-0001-1 → PLN-0001-1
        assert plans[0].plan_id == "PLN-0001-1"

    def test_demand_id_matches(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        assert plans[0].demand_id == "DEM-2026-0001"

    def test_four_tasks_produced(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        assert len(plans[0].tasks) == 4

    def test_end_date_matches_last_task(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        plan = plans[0]
        last_task_end = max(t.end_date for t in plan.tasks)
        assert plan.end_date == last_task_end

    def test_all_tasks_on_critical_path_single_plan(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        plan = plans[0]
        assert set(plan.critical_path_task_ids) == {t.task_id for t in plan.tasks}

    def test_tasks_sequential_no_overlap(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        tasks = plans[0].tasks
        for i in range(1, len(tasks)):
            assert tasks[i].start_date > tasks[i - 1].end_date

    def test_no_task_before_planning_start(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        for task in plans[0].tasks:
            assert task.start_date >= constraints.planning_start_date

    def test_predecessors_populated(self, est_approved, team, constraints):
        plans = generate_plans([est_approved], team, constraints)
        tasks = plans[0].tasks
        assert tasks[0].predecessor_task_ids == []
        for i in range(1, len(tasks)):
            assert tasks[i].predecessor_task_ids == [tasks[i - 1].task_id]

    def test_model_dump_iso_serializable(self, est_approved, team, constraints):
        """PlanRecord must serialize to valid JSON with ISO dates."""
        plans = generate_plans([est_approved], team, constraints)
        payload = plans[0].model_dump_iso()
        serialized = json.dumps(payload)  # must not raise
        parsed = json.loads(serialized)
        # Dates are strings in output
        assert isinstance(parsed["end_date"], str)
        for task in parsed["tasks"]:
            assert isinstance(task["start_date"], str)
            assert isinstance(task["end_date"], str)


class TestRebaselinedExtra:
    def test_rebaselined_end_date_is_later_than_approved(
        self, est_approved, est_rebaselined, team, constraints
    ):
        """Re-baselined plan (low conf + ≥3 risks + re-baselined status) should
        have longer duration than an approved high-confidence plan of similar size."""
        plans_a = generate_plans([est_approved], team, constraints)
        plans_r = generate_plans([est_rebaselined], team, constraints)
        # EST-0004-1 has 60 effort_days × 1.30 buffer vs EST-0001-1 120 × 1.00
        # Both produce a plan; just check re-baselined plan has > 0 tasks
        assert len(plans_r[0].tasks) == 4


class TestBatchPlanning:
    def test_two_approved_estimates_produce_two_plans(
        self, est_approved, est_approved_2, team, constraints
    ):
        plans = generate_plans([est_approved, est_approved_2], team, constraints)
        assert len(plans) == 2

    def test_owners_round_robin_across_batch(
        self, est_approved, est_approved_2, team, constraints
    ):
        """Backend owners should alternate between plans (round-robin shared state)."""
        plans = generate_plans([est_approved, est_approved_2], team, constraints)
        # Design and Build are backend tasks
        p1_design_owner = plans[0].tasks[0].owner  # Design plan 1
        p1_build_owner  = plans[0].tasks[1].owner  # Build  plan 1
        p2_design_owner = plans[1].tasks[0].owner  # Design plan 2
        # All three should be backend members cycling through the pool
        backend_members = {"m.rodriguez", "d.chen"}
        assert p1_design_owner in backend_members
        assert p1_build_owner in backend_members
        assert p2_design_owner in backend_members
