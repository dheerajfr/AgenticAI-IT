from pydantic import BaseModel, Field
from typing import Optional, Literal, List, Dict, Any

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
    critical_path_task_ids: Optional[List[str]] = Field(default=[], description="List of task IDs that lie on the critical path")
    tasks: Optional[List[Task]] = Field(default=[], description="List of tasks mapped under this plan")
    release_name: Optional[str] = Field(
        default=None,
        description="Human-readable release/milestone name for this plan, if tracked upstream in plan.db or the demand record"
    )


class ResourceInsightInfo(BaseModel):
    is_same_owner: bool = Field(default=True, description="True if predecessor and dependent share the same owner")
    owner_name: str = Field(default="", description="Name of the single owner")
    benefit: str = Field(default="No cross-team coordination required.", description="Benefit statement")
    risk: str = Field(default="Single point of failure: If owner becomes unavailable, both tasks will be delayed.", description="Risk statement")
    utilization_pct: int = Field(default=120, description="Owner utilization percentage")
    projects_assigned_count: int = Field(default=3, description="Number of projects assigned")
    has_conflict: bool = Field(default=True, description="True if owner has scheduling conflict")


class DependencyEdge(BaseModel):
    dependency_id: Optional[str] = Field(default="", description="Stable unique ID for the dependency")
    plan_id: Optional[str] = Field(default="", description="ID of the plan this dependency belongs to")
    source_task_id: str = Field(..., description="Task ID of the task that depends on another task (references task_id in plan)")
    target_task_id: str = Field(..., description="Task ID of the task being depended on (may be in a different plan)")
    type: Literal["technical", "resource", "data", "external-vendor"] = Field(..., description="Type of dependency")
    status: Literal["open", "at-risk", "resolved"] = Field(..., description="Current status of the dependency")
    owner: str = Field(..., description="Accountable person for managing and resolving this dependency")
    
    # Enterprise Workflow Classification & Ownership Fields
    workflow_type: Optional[Literal["owner-to-owner", "self-dependency", "resource-dependency", "vendor-dependency"]] = Field(
        default="owner-to-owner",
        description="Classified dependency workflow type derived deterministically from owners and type"
    )
    predecessor_owner: Optional[str] = Field(default="", description="Predecessor task owner from Plan DB")
    dependent_owner: Optional[str] = Field(default="", description="Dependent task owner from Plan DB")
    resource_insight: Optional[ResourceInsightInfo] = Field(default=None, description="Resource insight for single-owner dependencies")
    
    # Deterministic Health, Impact & Threat Fields
    health_status: Optional[Literal["healthy", "waiting", "at-risk", "blocked", "resolved"]] = Field(
        default="healthy",
        description="Deterministic dependency health calculated from critical path, float, and predecessor state"
    )
    health_score: Optional[int] = Field(default=85, description="Deterministic health score (0-100%)")
    threat_level: Optional[str] = Field(default="medium", description="Deterministic threat level (low, medium, high)")
    impact_level: Optional[Literal["low", "medium", "high", "critical"]] = Field(
        default="medium",
        description="Enterprise impact severity rating"
    )
    
    # Multi-Predecessor & Provenance Evidence
    depends_on_list: Optional[List[str]] = Field(default=[], description="List of multiple predecessor requirements")
    evidence_sources: Optional[List[str]] = Field(
        default=["Plan DB", "Critical Path", "Historical Projects", "Architecture"],
        description="Sources from which dependency was detected"
    )
    missing_dependency_warnings: Optional[List[str]] = Field(
        default=[],
        description="AI missing dependency warnings and recommendations"
    )
    
    # Resource-Aware Capacity & Staffing Fields
    required_skill: Optional[str] = Field(default="Backend Developer", description="Required technical skill")
    headcount_required: int = Field(default=1, description="Required headcount")
    headcount_available: int = Field(default=0, description="Available headcount from Capacity Check")
    resource_status: Literal["SATISFIED", "BLOCKED", "AT_RISK"] = Field(default="BLOCKED", description="Resource staffing status")
    resource_impact_statement: str = Field(default="Build cannot start due to staffing shortage", description="Impact statement")
    resource_recommendation: Optional[str] = Field(default="Raise hiring request or re-assign backup engineer", description="Staffing recommendation")
    estimated_staffing_delay_days: int = Field(default=8, description="Estimated delay in days from staffing gap")
    best_resource_match: Optional[Dict[str, Any]] = Field(
        default={"name": "Karthik", "skill_match_pct": 95, "availability": "Tomorrow"},
        description="Best matched resource details"
    )
    
    # Environment & Approval Gate Status
    environment_dependencies: Optional[Dict[str, str]] = Field(
        default={"production": "Ready (YES)", "staging": "Ready (YES)", "approval": "Pending"},
        description="Live environment readiness status"
    )
    approval_dependencies: Optional[Dict[str, str]] = Field(
        default={"cab": "Pending", "architecture": "Completed", "security": "Pending"},
        description="Live governance approval status"
    )
    
    # Workflow Lifecycle State & Validation Suite (5 points)
    workflow_state: Optional[Literal["analysis-complete", "awaiting-approval", "reminder-sent", "forecast-generated", "escalated", "resolved"]] = Field(
        default="analysis-complete",
        description="Current step in the dependency management lifecycle"
    )
    validation_checks: Optional[Dict[str, bool]] = Field(
        default={
            "predecessor_complete": True,
            "environment_ready": True,
            "owner_assigned": True,
            "cab_approval": False,
            "artifact_available": True
        },
        description="5-point AI dependency validation checklist"
    )
    
    # Communications & History
    activity_history: List[str] = Field(default=[], description="History of actions taken on this dependency")
    draft_message: Optional[str] = Field(default="", description="Draft follow-up message text")
    confidence: Optional[int] = Field(default=96, description="AI confidence score")
    confidence_reasons: Optional[List[str]] = Field(default=["Detected from project workflow & critical path."], description="AI confidence reasons")
    recommendation: Optional[str] = Field(default="Assign Backup Engineer or Raise Hiring Request", description="Recommended next action")
    suggested_actions: Optional[List[str]] = Field(default=["Assign Backup Engineer", "Raise Hiring Request", "Escalate PM", "Send Reminder"], description="Star-rated action choices")
    is_self_dependency: Optional[bool] = Field(default=None, description="True if source task and target task have the same owner")


class AutoDetectSuggestion(BaseModel):
    suggestion_id: str = Field(..., description="Unique suggestion ID")
    source_task_id: str = Field(..., description="Source dependent task ID")
    target_task_id: str = Field(..., description="Target predecessor task ID")
    source_task_name: str = Field(..., description="Source task name")
    target_task_name: str = Field(..., description="Target task name")
    type: Literal["technical", "resource", "data", "external-vendor"] = Field(..., description="Dependency type")
    confidence: int = Field(..., description="AI confidence percentage")
    reason: str = Field(..., description="Reasoning for auto-detection")
    evidence_provenance: List[str] = Field(default=["WBS Analysis", "CI/CD Pipeline", "Architecture"], description="Evidence sources")
    status: Literal["suggested", "accepted", "rejected"] = Field(default="suggested", description="Accept/Reject status")


class AutoDetectResponse(BaseModel):
    plan_id: str
    suggestions: List[AutoDetectSuggestion]


class CopilotQueryRequest(BaseModel):
    query: str
    plan_id: Optional[str] = None


class CopilotQueryResponse(BaseModel):
    query: str
    answer: str
    confidence: int = 95
    suggested_followups: List[str] = []
    data_points: List[Dict[str, Any]] = []


class ExecutiveDashboardMetrics(BaseModel):
    total_dependencies: int = 3
    healthy_count: int = 1
    waiting_count: int = 2
    blocked_count: int = 0
    critical_count: int = 3
    auto_detection_accuracy_pct: int = 91
    avg_resolution_time_days: float = 2.3


class DependencySenseRequest(BaseModel):
    plan_id: str = Field(..., description="ID of the plan to automatically sense dependencies for")


class DependencySenseResponse(BaseModel):
    detected_dependencies: List[DependencyEdge] = Field(..., description="List of automatically discovered dependency edges")


class ChaseCommitmentResponse(BaseModel):
    dependency_id: str = Field(..., description="The dependency ID checked")
    workflow_type: str = Field(default="owner-to-owner", description="Workflow type")
    nudge_message: str = Field(..., description="AI generated communication nudge to target task owner")
    escalation_required: bool = Field(..., description="True if dependency has high risk and impacts critical path")
    threat_level: Literal["low", "medium", "high"] = Field(..., description="Assessed threat level of the commitment delay")
    health_status: str = Field(default="warning", description="Deterministic health status")
    health_score: int = Field(default=75, description="Health score percentage")
    confidence: int = Field(default=90, description="AI confidence score percentage")
    confidence_reasons: List[str] = Field(default=[], description="Reasons backing the confidence score")
    recommendation: str = Field(default="Send Nudge", description="Recommended next step")
    suggested_actions: List[str] = Field(default=["Reminder", "Meeting", "Escalate"], description="Context-aware action choices")
    workflow_state: str = Field(default="awaiting-approval", description="Current lifecycle state")


class ReplanResponse(BaseModel):
    dependency_id: str
    replan_triggered: bool = True
    new_forecast_finish: str = "2026-10-05"
    schedule_adjusted_days: int = 8
    recommendations: List[str] = ["Re-sequence Build phase after hiring sign-off", "Fast-track Security Review", "Assign Backup Engineer"]
    message: str = "Auto-replan successfully generated. Target finish date updated to 05 Oct with 8 days buffer."


class CrossProgrammeImpactRequest(BaseModel):
    task_id: str = Field(..., description="Task ID of the task experiencing delays")
    delay_days: int = Field(..., description="Number of days the task is delayed")
    plan_id: Optional[str] = Field(default=None, description="Optional plan ID to specify the exact plan")


class AffectedTaskInfo(BaseModel):
    task_id: str
    name: str
    original_start_date: str
    new_start_date: str
    original_end_date: str
    new_end_date: str
    on_critical_path: bool
    owner: Optional[str] = "unassigned"


class CrossProgrammeImpactResponse(BaseModel):
    has_cross_programme_conflict: bool = Field(default=False, description="True if conflict affects other projects/programmes outside this project")
    cross_programme_status: str = Field(default="No cross-programme conflicts detected", description="Status text")
    analysis_summary: List[str] = Field(
        default=[
            "No shared resources identified across other active projects",
            "No shared release milestones with other programmes",
            "No shared infrastructure conflicts detected",
            "No downstream programme impact detected"
        ],
        description="Analysis summary checklist"
    )
    overall_risk: Literal["low", "medium", "high", "critical"] = Field(default="low", description="Overall risk rating")
    impact_detected: bool = Field(..., description="True if other tasks or project end dates are impacted")
    original_project_end_date: str = Field(..., description="The project committed end date before delay")
    new_project_end_date: str = Field(..., description="The updated project end date after ripple delay")
    project_end_date_slipped: bool = Field(..., description="True if the project end date is pushed back")
    delay_days: int = Field(default=0, description="Days delayed")
    affected_tasks: List[AffectedTaskInfo] = Field(..., description="List of tasks impacted directly or indirectly by the delay")
    affected_teams: List[str] = Field(default=[], description="Teams impacted by this ripple delay")
    affected_releases: List[str] = Field(default=[], description="Releases impacted by this ripple delay")
    affected_owners: List[str] = Field(default=[], description="Task owners impacted by this ripple delay")
    portfolio_projects_impacted: List[str] = Field(default=[], description="Impacted portfolio projects")
    shared_resources_conflicts: List[Dict[str, Any]] = Field(default=[], description="Shared resource conflicts")
    shared_assets_impacted: List[Dict[str, Any]] = Field(default=[], description="Shared infrastructure assets impacted")
    cost_impact_usd: float = Field(default=0.0, description="Financial cost impact in USD")
    severity: Literal["low", "medium", "high", "critical"] = Field(default="low", description="Portfolio impact severity rating")
    business_impact: str = Field(default="", description="Executive business impact summary")
    explanation: str = Field(..., description="AI reasoning explaining the ripple impact")
