"""
buffer.py — Confidence & risk buffer computation.

Rules (from spec):
  confidence:
    low     → +20 %
    medium  → +10 %
    high    → +0  %
  Additional +10 % if:
    - len(risk_factors) >= 3, OR
    - status == "re-baselined"
"""

from __future__ import annotations

from plan_schedule.models import EstimateRecord


# Keywords that trigger the WBS shift (used here as documentation only;
# the actual shift is applied in wbs.py).
_EXTRA_BUFFER_KEYWORDS = frozenset(
    ["integration", "security", "compliance", "data migration"]
)


def compute_buffer_multiplier(estimate: EstimateRecord) -> float:
    """
    Return the buffer multiplier to apply to raw effort_days.

    Examples
    --------
    >>> e = EstimateRecord(confidence="high", risk_factors=[], status="approved", ...)
    >>> compute_buffer_multiplier(e)
    1.0   # no buffer

    >>> e = EstimateRecord(confidence="low", risk_factors=["a","b","c"], status="approved", ...)
    >>> compute_buffer_multiplier(e)
    1.30  # 20 % confidence + 10 % risk count
    """
    # --- Base confidence buffer ---
    confidence_buffer = {
        "low": 0.20,
        "medium": 0.10,
        "high": 0.00,
    }[estimate.confidence]

    # --- Extra risk buffer ---
    extra_buffer = 0.0
    if len(estimate.risk_factors) >= 3:
        extra_buffer = 0.10
    if estimate.status == "re-baselined":
        # Always add (or keep) +10 % regardless of risk_factor count
        extra_buffer = 0.10

    multiplier = 1.0 + confidence_buffer + extra_buffer
    return round(multiplier, 4)


def buffered_effort_days(estimate: EstimateRecord) -> float:
    """
    Apply the buffer multiplier to effort_days and return the adjusted value.

    Parameters
    ----------
    estimate:
        The upstream EstimateRecord. Only `effort_days`, `confidence`,
        `risk_factors`, and `status` are consumed.

    Returns
    -------
    float
        Adjusted effort in person-days (rounded to 2 decimal places).
    """
    multiplier = compute_buffer_multiplier(estimate)
    return round(estimate.effort_days * multiplier, 2)
