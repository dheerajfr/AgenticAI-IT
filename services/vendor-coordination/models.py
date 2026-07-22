from pydantic import BaseModel
from typing import List, Optional, Dict

class VendorRequest(BaseModel):
    demand_id: str

class SOWCheckRequest(BaseModel):
    demand_id: str
    sow_document_id: str

class VendorRecord(BaseModel):
    id: str
    demand_id: str
    sla_tracking: Optional[Dict] = None
    sow_discrepancies: Optional[List[Dict]] = None
    access_alerts: Optional[List[Dict]] = None
