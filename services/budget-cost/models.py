from pydantic import BaseModel
from typing import List, Optional, Dict

class BudgetRequest(BaseModel):
    demand_id: str

class ROIRequest(BaseModel):
    demand_id: str
    velocity_data: Dict

class BudgetRecord(BaseModel):
    id: str
    demand_id: str
    cost_estimation: Optional[Dict] = None
    variances: Optional[List[Dict]] = None
    roi_model: Optional[Dict] = None
