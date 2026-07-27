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

class RiskModel(BaseModel):
    id: str
    category: str = "General"
    description: str
    probability: str = "Medium" # High, Medium, Low
    impact: str = "Medium" # High, Medium, Low
    severity: str = "Medium" # Critical, High, Medium, Low
    confidence_score: int = 80
    owner: str = "Unassigned"
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
    created_at: str

class MitigationModel(BaseModel):
    id: str
    risk_id: str
    description: str
    owner: str = "Unassigned"
    status: str = "Pending" # Pending, In Progress, Blocked, Completed
    progress: int = 0
    due_date: str = ""

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
