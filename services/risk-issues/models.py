from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class RiskRequest(BaseModel):
    demand_id: str

class IssueRequest(BaseModel):
    demand_id: str
    incident_details: str

class MitigationRequest(BaseModel):
    demand_id: str
    risk_id: str
    owner: Optional[str] = None  # real assignment, if known; falls back to "Unassigned" (never a fabricated name)


class MitigationUpdateRequest(BaseModel):
    progress: Optional[int] = None
    status: Optional[str] = None  # Pending, In Progress, Blocked, Completed
    owner: Optional[str] = None

class RiskModel(BaseModel):
    id: str
    category: str = "General"
    description: str
    probability: str = "Medium" # High, Medium, Low
    impact: str = "Medium" # High, Medium, Low
    severity: str = "Medium" # Critical, High, Medium, Low
    risk_score: int = 50
    confidence_score: int = 80
    owner: str = "Unassigned"
    related_module: str = "General"
    linked_tasks: List[str] = Field(default_factory=list)
    suggested_mitigation: str = ""
    expected_resolution_date: str = ""
    root_cause_analysis: str = ""
    ai_recommendation: str = ""
    status: str = "Open"
    created_at: str
    due_date: str = ""

class IssueModel(BaseModel):
    issue_id: str
    risk_id: Optional[str] = None
    description: str
    rca_result: str = ""
    owner: str = "Unassigned"
    status: str = "Open"
    target_date: str = ""
    progress: int = 0
    related_tasks: List[str] = Field(default_factory=list)
    related_sprint: str = ""
    assigned_employees: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    test_failures: List[str] = Field(default_factory=list)
    build_failures: List[str] = Field(default_factory=list)
    release_info: str = ""
    environment_details: str = ""
    created_at: str

class MitigationModel(BaseModel):
    id: str
    risk_id: str
    action: str = ""
    description: str
    owner: str = "Unassigned"
    status: str = "Pending" # Pending, In Progress, Blocked, Completed
    progress: int = 0
    due_date: str = ""
    ai_recommendation: str = ""
    estimated_impact_reduction: int = 0

class TimelineEvent(BaseModel):
    id: str
    timestamp: str
    event_type: str # Created, Updated, Escalated, Resolved
    description: str
    related_id: Optional[str] = None # Risk or Issue ID

class RiskRecord(BaseModel):
    id: str
    demand_id: str
    project_summary: Dict[str, Any] = Field(default_factory=dict)
    health_score: int = 100
    sensing_data: Optional[Dict] = None
    risks: List[RiskModel] = Field(default_factory=list)
    issues: List[IssueModel] = Field(default_factory=list)
    mitigations: List[MitigationModel] = Field(default_factory=list)
    timeline: List[TimelineEvent] = Field(default_factory=list)
    risks_without_mitigation: List[str] = Field(
        default_factory=list,
        description="Risk IDs with no live (non-closed) mitigation tracked against them; computed at read-time, not persisted."
    )
