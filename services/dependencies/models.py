from pydantic import BaseModel, Field
from typing import Optional, Literal, List

class Task(BaseModel):
    task_id: str = Field(..., description="Stable task identifier")
    name: str = Field(..., description="Human-readable name of the task")
    start_date: str = Field(..., description="ISO 8601 date, e.g. YYYY-MM-DD")
    end_date: str = Field(..., description="ISO 8601 date, e.g. YYYY-MM-DD")
    owner: str = Field(..., description="Assignee/owner of the task")
    predecessor_task_ids: Optional[List[str]] = Field(default=[], description="List of predecessor task IDs")


class PlanRecord(BaseModel):
    plan_id: str = Field(..., description="Stable unique ID for the project plan")
    demand_id: str = Field(..., description="Foreign key to the associated demand record")
    end_date: str = Field(..., description="Plan's current committed end date")
    critical_path_task_ids: List[str] = Field(..., description="List of task IDs that lie on the critical path")
    tasks: List[Task] = Field(..., description="List of tasks mapped under this plan")
    release_name: Optional[str] = Field(
        default=None,
        description="Human-readable release/milestone name for this plan, if tracked upstream in plan.db or the demand record"
    )


class DependencyEdge(BaseModel):
    dependency_id: Optional[str] = Field(default="", description="Stable unique ID for the dependency")
    plan_id: Optional[str] = Field(default="", description="ID of the plan this dependency belongs to")
    source_task_id: str = Field(..., description="Task ID of the task that depends on another task (references task_id in plan)")
    target_task_id: str = Field(..., description="Task ID of the task being depended on (may be in a different plan)")
    type: Literal["technical", "resource", "data", "external-vendor"] = Field(..., description="Type of dependency")
    status: Literal["open", "at-risk", "resolved"] = Field(..., description="Current status of the dependency")
    owner: str = Field(..., description="Accountable person for managing and resolving this dependency")
    activity_history: List[str] = Field(default=[], description="History of actions taken on this dependency")
    draft_message: Optional[str] = Field(default="", description="Draft follow-up message text")
    threat_level: Optional[str] = Field(default="", description="AI assessed threat level")
    confidence: Optional[int] = Field(default=None, description="AI confidence score")
    confidence_reasons: Optional[List[str]] = Field(default=[], description="AI confidence reasons")


class DependencySenseRequest(BaseModel):
    plan_id: str = Field(..., description="ID of the plan to automatically sense dependencies for")


class DependencySenseResponse(BaseModel):
    detected_dependencies: List[DependencyEdge] = Field(..., description="List of automatically discovered dependency edges")


class ChaseCommitmentResponse(BaseModel):
    dependency_id: str = Field(..., description="The dependency ID checked")
    nudge_message: str = Field(..., description="AI generated communication nudge to target task owner")
    escalation_required: bool = Field(..., description="True if dependency has high risk and impacts critical path")
    threat_level: Literal["low", "medium", "high"] = Field(..., description="Assessed threat level of the commitment delay")
    confidence: int = Field(default=90, description="AI confidence score percentage")
    confidence_reasons: List[str] = Field(default=[], description="Reasons backing the confidence score")


class CrossProgrammeImpactRequest(BaseModel):
    task_id: str = Field(..., description="Task ID of the task experiencing delays")
    delay_days: int = Field(..., description="Number of days the task is delayed")


class AffectedTaskInfo(BaseModel):
    task_id: str
    name: str
    original_start_date: str
    new_start_date: str
    original_end_date: str
    new_end_date: str
    on_critical_path: bool


class CrossProgrammeImpactResponse(BaseModel):
    impact_detected: bool = Field(..., description="True if other tasks or project end dates are impacted")
    original_project_end_date: str = Field(..., description="The project committed end date before delay")
    new_project_end_date: str = Field(..., description="The updated project end date after ripple delay")
    project_end_date_slipped: bool = Field(..., description="True if the project end date is pushed back")
    affected_tasks: List[AffectedTaskInfo] = Field(..., description="List of tasks impacted directly or indirectly by the delay")
    explanation: str = Field(..., description="AI reasoning explaining the ripple impact")
