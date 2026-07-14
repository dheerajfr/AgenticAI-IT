"""
models.py — Pydantic v2 data models for plan-schedule.

All business-rule validation (status gating, date ordering, etc.)
is expressed as model validators so it fires on construction.
"""

from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# INPUT MODELS (mirrors Stage 02 output schema — read-only contract)
# ---------------------------------------------------------------------------

ConfidenceLevel = Literal["low", "medium", "high"]
EstimateStatus = Literal["draft", "challenged", "approved", "re-baselined"]
RoleType = Literal["backend", "frontend", "qa", "devops"]


class EstimateRecord(BaseModel):
    """Upstream estimate record from Stage 02. Never mutated by this module."""

    estimate_id: str = Field(..., description="Unique estimate identifier")
    demand_id: str = Field(..., description="Parent demand identifier")
    effort_days: float = Field(..., ge=0, description="Central effort in person-days")
    effort_range_low: float = Field(..., ge=0)
    effort_range_high: float = Field(..., ge=0)
    cost_estimate: float = Field(..., ge=0)
    duration_weeks: float = Field(..., ge=0)
    confidence: ConfidenceLevel
    methodology: str
    risk_factors: List[str] = Field(default_factory=list)
    status: EstimateStatus

    @model_validator(mode="after")
    def _range_ordering(self) -> "EstimateRecord":
        if self.effort_range_low > self.effort_range_high:
            raise ValueError(
                f"effort_range_low ({self.effort_range_low}) must be <= "
                f"effort_range_high ({self.effort_range_high})"
            )
        return self


class RoleConfig(BaseModel):
    """Configuration for one role within a team."""

    role: RoleType
    count: int = Field(..., ge=1)
    hours_per_day_per_person: float = Field(default=8.0, ge=1, le=24)
    members: List[str] = Field(
        default_factory=list,
        description="Optional named members for round-robin assignment",
    )

    @model_validator(mode="after")
    def _default_members(self) -> "RoleConfig":
        """If no named members provided, generate generic names role_1, role_2 …"""
        if not self.members:
            self.members = [f"{self.role}_{i + 1}" for i in range(self.count)]
        return self


class TeamConfig(BaseModel):
    """Team composition and daily capacity."""

    team_size: int = Field(..., ge=1)
    roles: List[RoleConfig] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _headcount_consistency(self) -> "TeamConfig":
        total = sum(r.count for r in self.roles)
        if total != self.team_size:
            raise ValueError(
                f"team_size ({self.team_size}) must equal sum of role counts ({total})"
            )
        return self


class SprintConstraints(BaseModel):
    """Calendar and capacity constraints for scheduling."""

    planning_start_date: date = Field(..., description="Earliest task start date")
    working_days_per_week: int = Field(..., ge=1, le=7)
    max_daily_utilization_percentage: float = Field(..., ge=1, le=100)


# ---------------------------------------------------------------------------
# OUTPUT MODELS (PlanRecord — matches output contract exactly)
# ---------------------------------------------------------------------------


class Task(BaseModel):
    """A single scheduled task within a PlanRecord."""

    task_id: str
    name: str
    start_date: date
    end_date: date
    owner: str
    owners: List[str] = Field(default_factory=list)
    predecessor_task_ids: List[str] = Field(default_factory=list)
    status: str = "pending"

    @model_validator(mode="after")
    def _initialize_owners(self) -> "Task":
        if not self.owners and self.owner:
            self.owners = [o.strip() for o in self.owner.split(",") if o.strip()]
        elif self.owners and not self.owner:
            self.owner = ", ".join(self.owners)
        return self

    @model_validator(mode="after")
    def _date_ordering(self) -> "Task":
        if self.start_date > self.end_date:
            raise ValueError(
                f"Task {self.task_id}: start_date ({self.start_date}) must be "
                f"<= end_date ({self.end_date})"
            )
        return self

    def model_dump_iso(self) -> dict:
        """Serialize to dict with ISO-8601 string dates (for JSON output)."""
        d = self.model_dump()
        d["start_date"] = self.start_date.isoformat()
        d["end_date"] = self.end_date.isoformat()
        return d


class PlanRecord(BaseModel):
    """
    Output artifact for Stage 03.
    One PlanRecord per approved / re-baselined estimate.
    Internal planning math (buffers, utilization) must NOT appear here.
    """

    plan_id: str
    demand_id: str
    end_date: date
    critical_path_task_ids: List[str] = Field(..., min_length=1)
    tasks: List[Task] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _end_date_matches_last_task(self) -> "PlanRecord":
        last_task_end = max(t.end_date for t in self.tasks)
        if self.end_date != last_task_end:
            raise ValueError(
                f"plan end_date ({self.end_date}) must equal the last task "
                f"end_date ({last_task_end})"
            )
        return self

    @model_validator(mode="after")
    def _critical_path_ids_exist(self) -> "PlanRecord":
        task_ids = {t.task_id for t in self.tasks}
        bad = set(self.critical_path_task_ids) - task_ids
        if bad:
            raise ValueError(
                f"critical_path_task_ids references unknown task_ids: {bad}"
            )
        return self

    def model_dump_iso(self) -> dict:
        """Serialize to dict with ISO-8601 string dates (for JSON output)."""
        d = {
            "plan_id": self.plan_id,
            "demand_id": self.demand_id,
            "end_date": self.end_date.isoformat(),
            "critical_path_task_ids": self.critical_path_task_ids,
            "tasks": [t.model_dump_iso() for t in self.tasks],
        }
        return d


# ---------------------------------------------------------------------------
# Optional cross-estimate dependency mapping
# ---------------------------------------------------------------------------


class DependencyEdge(BaseModel):
    """Express that plan B cannot start until plan A is complete."""

    from_plan_id: str = Field(..., description="Predecessor plan_id")
    to_plan_id: str = Field(..., description="Successor plan_id")
    description: Optional[str] = None
