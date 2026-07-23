from pydantic import BaseModel
from typing import List, Optional, Dict

class RiskRequest(BaseModel):
    demand_id: str

class IssueRequest(BaseModel):
    demand_id: str
    incident_details: str

class MitigationRequest(BaseModel):
    demand_id: str
    risk_id: str

class RiskRecord(BaseModel):
    id: str
    demand_id: str
    sensing_data: Optional[Dict] = None
    issues: Optional[List[Dict]] = None
    mitigations: Optional[Dict[str, str]] = None
