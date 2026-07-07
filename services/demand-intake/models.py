from pydantic import BaseModel, Field
from typing import Optional, Literal, List, Dict, Any

class DemandRecord(BaseModel):
    demand_id: str = Field(..., description="Stable unique ID, never reused")
    title: str = Field(..., description="Short human-readable name")
    description: str = Field(..., description="Full request text, structured from intake")
    type: Literal["project", "enhancement", "defect-fix", "compliance"] = Field(..., description="Type of demand")
    domain: str = Field(..., description="Owning business/technical domain")
    risk_level: Literal["low", "medium", "high"] = Field(..., description="Assessed risk level")
    funding_status: Literal["unfunded", "pending", "approved"] = Field(..., description="Funding status")
    submitted_by: str = Field(..., description="Requestor identity")
    submitted_date: str = Field(..., description="ISO 8601 date, e.g. YYYY-MM-DD")
    source: Literal["text", "document"] = Field(..., description="Intake source")
    source_filename: Optional[str] = Field(None, description="Original file name if source is document")
    duplicate_of: Optional[str] = Field(None, description="demand_id of the duplicate record if flagged as duplicate")
    business_case_summary: Optional[str] = Field(None, description="Generated business case summary text")
    status: Literal["intake", "classified", "capacity-checked", "approved", "rejected"] = Field(..., description="Lifecycle status")
    capacity_verdict: Optional[str] = Field(None, description="Approved capacity verdict")
    capacity_score: Optional[int] = Field(None, description="Assessed capacity score")
    earliest_start_date: Optional[str] = Field(None, description="Estimated earliest start date")
    capacity_reasoning: Optional[List[str]] = Field(None, description="Evidence-based reasoning list")
    resource_constraints: Optional[List[Dict[str, Any]]] = Field(None, description="Resource constraints list")
    skill_gaps: Optional[List[str]] = Field(None, description="Detected skill gaps")
