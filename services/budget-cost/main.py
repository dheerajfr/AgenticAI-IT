import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import random

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import BudgetRequest, ROIRequest
from database import db
from llm_client import call_gemini

app = FastAPI(title="Budget & Cost Service (Always-on)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    if not record:
        record = {
            "id": f"BDG-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "cost_estimation": {
                "infrastructure_cost": random.randint(5000, 20000),
                "vendor_cost": random.randint(10000, 50000),
                "resource_cost": random.randint(20000, 80000)
            },
            "variances": [
                {
                    "environment": "staging",
                    "spike_amount": random.randint(100, 1000),
                    "reason": "Unknown high compute usage"
                }
            ],
            "roi_model": None
        }
        db.save(record)
    return record

@app.get("/api/budget-cost/project/{demand_id}")
def get_budget_cost(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/budget-cost/estimate")
def forecast_costs(req: BudgetRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Provide a bottom-up forecast for AWS/Azure and vendor costs for project {req.demand_id} based on typical enterprise web application architectures."
    ai_res = call_gemini(prompt)
    
    # Just save the LLM response as a note in the estimation dict
    est = record.get("cost_estimation", {})
    est["ai_analysis"] = ai_res
    record["cost_estimation"] = est
    db.save(record)
    
    return {"status": "success", "estimation": record["cost_estimation"], "record": record}

@app.post("/api/budget-cost/roi")
def model_roi(req: ROIRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Model the Resource ROI for project {req.demand_id}. Velocity data: {req.velocity_data}. Match team velocity to spend."
    ai_res = call_gemini(prompt)
    
    record["roi_model"] = {
        "analysis": ai_res,
        "velocity_score": random.randint(60, 100)
    }
    db.save(record)
    
    return {"status": "success", "roi_model": record["roi_model"], "record": record}

# Invoice generation & retrieval endpoints
import json
import calendar
from datetime import datetime

# Helper to import get_db from shared_db
import sys
from pathlib import Path
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.append(str(_ROOT_DIR))
from shared_db.connection import get_db

@app.get("/api/budget-cost/project/{demand_id}/invoices")
def get_invoices(demand_id: str):
    return db.get_invoices(demand_id)

@app.post("/api/budget-cost/project/{demand_id}/invoices/generate")
def generate_invoices(demand_id: str):
    # 1. Fetch corresponding plan from services/source.db
    with get_db() as conn:
        row = conn.execute("SELECT data FROM plans WHERE demand_id = ?", (demand_id,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=404, 
                detail=f"No plan record found for project {demand_id}. Please generate a plan in Plan & Schedule first."
            )
        plan_data = json.loads(row[0])
    
    tasks = plan_data.get("tasks", [])
    if not tasks:
        raise HTTPException(status_code=404, detail="No tasks found in the plan. Cannot determine start/end dates.")
    
    # 2. Extract earliest start_date and latest end_date from tasks
    start_dates = [t.get("start_date") for t in tasks if t.get("start_date")]
    end_dates = [t.get("end_date") for t in tasks if t.get("end_date")]
    if not start_dates or not end_dates:
        raise HTTPException(status_code=400, detail="Start or end dates are missing in plan tasks.")
        
    start_date_str = min(start_dates)
    end_date_str = max(end_dates)
    
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format in plan: {e}")
        
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Plan start date cannot be after end date.")
        
    # 3. Retrieve budget estimate for billing allocation
    record = _get_or_create(demand_id)
    est = record.get("cost_estimation", {})
    infra = est.get("infrastructure_cost", 0)
    vendor = est.get("vendor_cost", 0)
    resource = est.get("resource_cost", 0)
    total_cost = infra + vendor + resource
    
    # 4. Compute months between start_date and end_date (inclusive)
    months = []
    curr_year = start_date.year
    curr_month = start_date.month
    
    while True:
        months.append((curr_year, curr_month))
        if curr_year == end_date.year and curr_month == end_date.month:
            break
        curr_month += 1
        if curr_month > 12:
            curr_month = 1
            curr_year += 1
            
    num_months = len(months)
    if num_months == 0:
        num_months = 1
        
    # Monthly values rounded to 2 decimal places
    monthly_infra = round(infra / num_months, 2)
    monthly_vendor = round(vendor / num_months, 2)
    monthly_resource = round(resource / num_months, 2)
    monthly_total = round(total_cost / num_months, 2)
    
    # 5. Generate monthly invoices
    generated_invoices = []
    for i, (yr, mo) in enumerate(months):
        month_str = f"{yr}-{mo:02d}"
        
        if i == 0:
            billing_start = start_date_str
        else:
            billing_start = f"{yr}-{mo:02d}-01"
            
        if i == num_months - 1:
            billing_end = end_date_str
        else:
            last_day = calendar.monthrange(yr, mo)[1]
            billing_end = f"{yr}-{mo:02d}-{last_day}"
            
        invoice = {
            "invoice_id": f"INV-{demand_id}-{month_str}",
            "demand_id": demand_id,
            "month": month_str,
            "amount": monthly_total,
            "status": "Generated",
            "billing_start": billing_start,
            "billing_end": billing_end,
            "details": [
                {"item": "Infrastructure Cost Allocation", "amount": monthly_infra},
                {"item": "Resource Cost Allocation", "amount": monthly_resource},
                {"item": "Vendor Services Allocation", "amount": monthly_vendor}
            ]
        }
        db.save_invoice(invoice)
        generated_invoices.append(invoice)
        
    return {"status": "success", "invoices": generated_invoices}
