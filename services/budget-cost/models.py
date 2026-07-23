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

# --- Burn & Forecast ---
class ActualEntry(BaseModel):
    date: str
    amount: float
    category: str  # "infrastructure" | "vendor" | "resource"

class BurnForecastRequest(BaseModel):
    demand_id: str
    actuals: Optional[List[ActualEntry]] = None

# --- Invoice & PO Match ---
class InvoiceMatchRequest(BaseModel):
    demand_id: str
    invoice_id: str
    invoice_amount: float
    po_reference: str
    sow_reference: Optional[str] = None
    delivered_items: Optional[List[str]] = None

class InvoiceApproveRequest(BaseModel):
    demand_id: str
    invoice_id: str
    decision: str   # "approve" | "dispute"
    note: Optional[str] = None

# --- Capex / Opex ---
class SpendItem(BaseModel):
    description: str
    amount: float
    vendor: Optional[str] = None
    project_phase: Optional[str] = None

class CapexOpexRequest(BaseModel):
    demand_id: str
    spend_items: List[SpendItem]

class CapexOpexSignOffRequest(BaseModel):
    demand_id: str
    approved_by: Optional[str] = "Finance"
