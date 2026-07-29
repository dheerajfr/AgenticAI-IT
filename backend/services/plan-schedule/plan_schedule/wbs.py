"""
wbs.py — Work-Breakdown Structure (WBS) phase-split logic.

Default split (of buffered effort):
    Design / Setup  → 15 %
    Build           → 50 %
    Test / QA       → 25 %
    Deploy / Release→ 10 %

Keyword-triggered shift:
    If any risk_factor string (case-insensitive) contains one of:
        "integration", "security", "compliance", "data migration"
    → shift 5 % from Build to Test/QA:
        Build   → 45 %
        Test/QA → 30 %
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


# ---------------------------------------------------------------------------
# Phase identifiers (used as task name prefixes and task_id stems)
# ---------------------------------------------------------------------------
PHASE_DESIGN = "design"
PHASE_BUILD = "build"
PHASE_TEST = "test"
PHASE_DEPLOY = "deploy"

PHASE_ORDER = [PHASE_DESIGN, PHASE_BUILD, PHASE_TEST, PHASE_DEPLOY]

# Keywords (lowercase) that trigger the Build→Test shift
_SHIFT_KEYWORDS = ["integration", "security", "compliance", "data migration"]


@dataclass(frozen=True)
class PhaseAllocation:
    """Fractional allocation of buffered effort for one WBS phase."""

    phase: str
    fraction: float          # 0 < fraction <= 1
    effort_days: float       # buffered_effort_days * fraction


def _has_shift_keyword(risk_factors: List[str]) -> bool:
    """Return True if any risk factor triggers the Build→Test 5 % shift."""
    combined = " ".join(risk_factors).lower()
    return any(kw in combined for kw in _SHIFT_KEYWORDS)


def compute_phase_allocations(
    buffered_days: float,
    risk_factors: List[str],
) -> List[PhaseAllocation]:
    """
    Compute the WBS phase allocations given buffered effort and risk factors.

    Parameters
    ----------
    buffered_days:
        Total buffered effort in person-days (output of buffer.buffered_effort_days).
    risk_factors:
        List of risk factor strings from the EstimateRecord.

    Returns
    -------
    List[PhaseAllocation]
        One entry per phase, in PHASE_ORDER sequence.
    """
    # Default fractions
    fractions = {
        PHASE_DESIGN: 0.15,
        PHASE_BUILD:  0.50,
        PHASE_TEST:   0.25,
        PHASE_DEPLOY: 0.10,
    }

    if _has_shift_keyword(risk_factors):
        # Shift 5 % from Build to Test/QA
        fractions[PHASE_BUILD] -= 0.05
        fractions[PHASE_TEST]  += 0.05

    allocations = []
    for phase in PHASE_ORDER:
        frac = fractions[phase]
        allocations.append(
            PhaseAllocation(
                phase=phase,
                fraction=round(frac, 4),
                effort_days=round(buffered_days * frac, 2),
            )
        )

    return allocations
