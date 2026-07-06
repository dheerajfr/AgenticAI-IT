"""
test_wbs.py — Unit tests for plan_schedule.wbs

Covers:
  - Default phase split (no shift keywords)
  - Build→Test 5% shift when risk factors contain trigger keywords
  - Fractions always sum to 1.0
  - effort_days = buffered_days × fraction for each phase
"""

import pytest

from plan_schedule.wbs import (
    PHASE_BUILD,
    PHASE_DEPLOY,
    PHASE_DESIGN,
    PHASE_TEST,
    compute_phase_allocations,
)


def _phases_as_dict(buffered_days: float, risk_factors: list[str]) -> dict:
    allocs = compute_phase_allocations(buffered_days, risk_factors)
    return {a.phase: a for a in allocs}


class TestDefaultSplit:
    """No shift keywords → default 15/50/25/10 split."""

    def test_fractions_sum_to_one(self):
        allocs = compute_phase_allocations(100.0, [])
        total = sum(a.fraction for a in allocs)
        assert total == pytest.approx(1.0)

    def test_design_fraction(self):
        d = _phases_as_dict(100.0, [])
        assert d[PHASE_DESIGN].fraction == pytest.approx(0.15)

    def test_build_fraction(self):
        d = _phases_as_dict(100.0, [])
        assert d[PHASE_BUILD].fraction == pytest.approx(0.50)

    def test_test_fraction(self):
        d = _phases_as_dict(100.0, [])
        assert d[PHASE_TEST].fraction == pytest.approx(0.25)

    def test_deploy_fraction(self):
        d = _phases_as_dict(100.0, [])
        assert d[PHASE_DEPLOY].fraction == pytest.approx(0.10)

    def test_effort_days_calculated(self):
        d = _phases_as_dict(120.0, [])
        assert d[PHASE_BUILD].effort_days == pytest.approx(60.0)
        assert d[PHASE_TEST].effort_days == pytest.approx(30.0)


class TestKeywordTriggeredShift:
    """Shift keywords move 5% from Build to Test."""

    @pytest.mark.parametrize("keyword", [
        "integration",
        "security",
        "compliance",
        "data migration",
        "Data Migration",      # case-insensitive
        "INTEGRATION testing",
    ])
    def test_shift_triggers(self, keyword: str):
        d = _phases_as_dict(100.0, [keyword])
        assert d[PHASE_BUILD].fraction == pytest.approx(0.45)
        assert d[PHASE_TEST].fraction == pytest.approx(0.30)

    def test_design_and_deploy_unchanged_after_shift(self):
        d = _phases_as_dict(100.0, ["security"])
        assert d[PHASE_DESIGN].fraction == pytest.approx(0.15)
        assert d[PHASE_DEPLOY].fraction == pytest.approx(0.10)

    def test_fractions_still_sum_to_one_after_shift(self):
        allocs = compute_phase_allocations(100.0, ["compliance"])
        total = sum(a.fraction for a in allocs)
        assert total == pytest.approx(1.0)

    def test_real_estimate_1_data_migration(self):
        """EST-0001-1 has 'Data migration' risk → should trigger WBS shift."""
        risk_factors = [
            "AWS database instance setup complexity",
            "Data migration script validation time",
        ]
        d = _phases_as_dict(120.0, risk_factors)
        assert d[PHASE_BUILD].fraction == pytest.approx(0.45)
        assert d[PHASE_TEST].fraction == pytest.approx(0.30)

    def test_no_shift_for_irrelevant_keywords(self):
        d = _phases_as_dict(100.0, ["performance tuning", "stakeholder availability"])
        assert d[PHASE_BUILD].fraction == pytest.approx(0.50)
        assert d[PHASE_TEST].fraction == pytest.approx(0.25)
