"""
test_buffer.py — Unit tests for plan_schedule.buffer

Covers every combination of confidence × risk scenario:
  - high + 0 risk factors    → multiplier = 1.00
  - high + 3 risk factors    → multiplier = 1.10
  - medium + 0 risk factors  → multiplier = 1.10
  - medium + 3 risk factors  → multiplier = 1.20
  - low + 0 risk factors     → multiplier = 1.20
  - low + 3 risk factors     → multiplier = 1.30
  - re-baselined             → always +10% extra (regardless of count)
"""

import pytest

from plan_schedule.buffer import buffered_effort_days, compute_buffer_multiplier
from plan_schedule.models import EstimateRecord


def _make_estimate(
    confidence: str,
    risk_factors: list[str],
    status: str = "approved",
    effort_days: float = 100.0,
) -> EstimateRecord:
    return EstimateRecord(
        estimate_id="EST-TEST-1",
        demand_id="DEM-TEST-1",
        effort_days=effort_days,
        effort_range_low=80,
        effort_range_high=120,
        cost_estimate=50000,
        duration_weeks=10,
        confidence=confidence,
        methodology="test",
        risk_factors=risk_factors,
        status=status,
    )


class TestComputeBufferMultiplier:
    """compute_buffer_multiplier returns the correct multiplier."""

    def test_high_confidence_no_risks(self):
        e = _make_estimate("high", [])
        assert compute_buffer_multiplier(e) == pytest.approx(1.00)

    def test_high_confidence_two_risks(self):
        # 2 < 3 threshold, no extra buffer
        e = _make_estimate("high", ["risk1", "risk2"])
        assert compute_buffer_multiplier(e) == pytest.approx(1.00)

    def test_high_confidence_three_risks(self):
        # ≥3 risk_factors triggers +10%
        e = _make_estimate("high", ["r1", "r2", "r3"])
        assert compute_buffer_multiplier(e) == pytest.approx(1.10)

    def test_medium_confidence_no_risks(self):
        e = _make_estimate("medium", [])
        assert compute_buffer_multiplier(e) == pytest.approx(1.10)

    def test_medium_confidence_three_risks(self):
        e = _make_estimate("medium", ["r1", "r2", "r3"])
        assert compute_buffer_multiplier(e) == pytest.approx(1.20)

    def test_low_confidence_no_risks(self):
        e = _make_estimate("low", [])
        assert compute_buffer_multiplier(e) == pytest.approx(1.20)

    def test_low_confidence_three_risks(self):
        e = _make_estimate("low", ["r1", "r2", "r3"])
        assert compute_buffer_multiplier(e) == pytest.approx(1.30)

    def test_rebaselined_always_adds_extra(self):
        # re-baselined forces +10% extra regardless of risk_factor count
        e = _make_estimate("high", [], status="re-baselined")
        assert compute_buffer_multiplier(e) == pytest.approx(1.10)

    def test_rebaselined_low_confidence(self):
        # re-baselined + low confidence = 20% + 10% = 1.30
        # (extra is capped at 10%, not doubled even if ≥3 risk_factors also)
        e = _make_estimate("low", ["r1", "r2", "r3"], status="re-baselined")
        assert compute_buffer_multiplier(e) == pytest.approx(1.30)


class TestBufferedEffortDays:
    """buffered_effort_days applies multiplier correctly."""

    def test_high_confidence_no_buffer(self):
        e = _make_estimate("high", [], effort_days=120)
        assert buffered_effort_days(e) == pytest.approx(120.0)

    def test_low_confidence_three_risks(self):
        # 100 days × 1.30 = 130 days
        e = _make_estimate("low", ["r1", "r2", "r3"], effort_days=100)
        assert buffered_effort_days(e) == pytest.approx(130.0)

    def test_medium_confidence_no_risks(self):
        # 45 days × 1.10 = 49.5 days
        e = _make_estimate("medium", [], effort_days=45)
        assert buffered_effort_days(e) == pytest.approx(49.5)

    def test_real_estimate_1(self):
        """EST-0001-1: high confidence, 2 risks, approved → no buffer, 120 days."""
        e = _make_estimate("high", ["AWS complexity", "Data migration"], effort_days=120)
        # 2 risk_factors < 3 threshold, so only confidence buffer = 0
        assert buffered_effort_days(e) == pytest.approx(120.0)

    def test_real_estimate_3(self):
        """EST-0003-1: high confidence, 0 risks, approved → 18 days unchanged."""
        e = _make_estimate("high", [], effort_days=18)
        assert buffered_effort_days(e) == pytest.approx(18.0)
