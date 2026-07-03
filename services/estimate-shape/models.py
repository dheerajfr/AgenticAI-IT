from pydantic import BaseModel, Field
from typing import Optional, Literal, List

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
    source: Optional[Literal["text", "document"]] = Field(None, description="Intake source")
    source_filename: Optional[str] = Field(None, description="Original file name if source is document")
    duplicate_of: Optional[str] = Field(None, description="demand_id of the duplicate record if flagged as duplicate")
    business_case_summary: Optional[str] = Field(None, description="Generated business case summary text")
    status: Literal["intake", "classified", "capacity-checked", "approved", "rejected"] = Field(..., description="Lifecycle status")


class EstimateRecord(BaseModel):
    estimate_id: str = Field(..., description="Unique estimate ID")
    demand_id: str = Field(..., description="Foreign key to demand record")
    effort_days: int = Field(..., description="Point estimate")
    effort_range_low: int = Field(..., description="Confidence range low")
    effort_range_high: int = Field(..., description="Confidence range high")
    cost_estimate: int = Field(..., description="In local currency, whole units")
    duration_weeks: int = Field(..., description="Duration in weeks")
    confidence: Literal["low", "medium", "high"] = Field(..., description="Confidence level")
    methodology: str = Field(..., description="e.g. comparable-history, expert-judgement")
    risk_factors: Optional[List[str]] = Field(None, description="From 'Challenge the estimate'")
    status: Literal["draft", "challenged", "approved", "re-baselined"] = Field(..., description="Lifecycle status")
