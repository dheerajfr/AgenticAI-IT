from pydantic import BaseModel
from typing import List, Optional, Dict

class ReportRequest(BaseModel):
    demand_id: str
    audience: str = "general"

class CommRequest(BaseModel):
    demand_id: str
    comm_type: str = "release_notes"

class ReportRecord(BaseModel):
    id: str
    demand_id: str
    exec_summary: Optional[Dict] = None
    communications: Optional[List[Dict]] = None
