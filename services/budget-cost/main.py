import sys
import uuid
import random
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from pydantic import BaseModel
from models import (
    BudgetRequest, ROIRequest,
    BurnForecastRequest, ActualEntry,
    InvoiceMatchRequest, InvoiceApproveRequest,
    CapexOpexRequest, CapexOpexSignOffRequest
)
from database import db, burn_db, invoice_db, capex_db
from llm_client import call_gemini

app = FastAPI(title="Budget & Cost Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ────────────────────────────────────────────────────────────────────

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

def _seed_burn_data(demand_id: str) -> dict:
    """Generate realistic seeded actuals + forecast for a demand."""
    base = random.randint(30000, 80000)
    plan_monthly = base / 6
    months = [(datetime(2026, m, 1).strftime("%Y-%m")) for m in range(1, 7)]
    actuals = []
    for i, mo in enumerate(months[:4]):
        drift = random.uniform(0.85, 1.20)
        actuals.append({"date": mo, "amount": round(plan_monthly * drift, 2), "category": "blended"})
    actual_total = sum(a["amount"] for a in actuals)
    plan_total = plan_monthly * 4
    variance_pct = round((actual_total - plan_total) / plan_total * 100, 1)
    forecast = []
    for mo in months[4:]:
        forecast.append({"date": mo, "amount": round(plan_monthly * random.uniform(0.95, 1.10), 2), "category": "projected"})
    return {
        "actuals": actuals,
        "forecast": forecast,
        "variance_pct": variance_pct,
        "narrative": "",
        "committed": False
    }

def _seed_invoices(demand_id: str) -> list:
    vendors = ["Infosys Ltd", "TechMahindra", "Wipro Digital", "Cognizant"]
    invoices = []
    for i in range(3):
        amount = round(random.uniform(8000, 45000), 2)
        discrepancy = random.choice([True, False, False])
        invoices.append({
            "id": f"INV-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "invoice_id": f"INV-{demand_id.split('-')[-1]}-{i+1:02d}",
            "invoice_amount": amount,
            "po_reference": f"PO-{demand_id.split('-')[-1]}-{i+1:02d}",
            "sow_reference": f"SOW-{demand_id.split('-')[-1]}",
            "delivered_items": ["API integration module", "Unit test suite", "Deployment runbook"],
            "match_status": "discrepancy" if discrepancy else "matched",
            "discrepancies": [{"item": "UI component", "detail": "Claimed in invoice but not in PM tool"}] if discrepancy else [],
            "ai_analysis": "",
            "decision": "",
            "decision_note": "",
            "created_at": (datetime.utcnow() - timedelta(days=random.randint(1, 30))).isoformat()
        })
    return invoices

def _seed_capex(demand_id: str) -> list:
    items_data = [
        ("Cloud infrastructure setup", random.randint(5000, 15000), "AWS", "build", "capex",
         "IAS 38 — infrastructure directly attributable to project delivery"),
        ("Developer licences (annual)", random.randint(2000, 6000), "Microsoft", "all", "opex",
         "Recurring licence — period expense under IFRS 16"),
        ("Data migration tooling", random.randint(3000, 9000), "Informatica", "build", "capex",
         "One-off tool cost tied to capitalised deliverable"),
        ("Hypercare support (3 months)", random.randint(4000, 12000), "Internal", "post-go-live", "opex",
         "Post-delivery support — revenue expense"),
    ]
    results = []
    for desc, amount, vendor, phase, cls, evidence in items_data:
        results.append({
            "id": f"CAP-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "description": desc,
            "amount": amount,
            "vendor": vendor,
            "project_phase": phase,
            "classification": cls,
            "policy_evidence": evidence,
            "ai_rationale": "",
            "signed_off": False,
            "signed_off_by": "",
            "created_at": datetime.utcnow().isoformat()
        })
    return results

# ── Existing Endpoints ─────────────────────────────────────────────────────────

@app.get("/api/budget-cost/project/{demand_id}")
def get_budget_cost(demand_id: str):
    return _get_or_create(demand_id)

@app.post("/api/budget-cost/estimate")
def forecast_costs(req: BudgetRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Provide a bottom-up forecast for AWS/Azure and vendor costs for project {req.demand_id} based on typical enterprise web application architectures."
    ai_res = call_gemini(prompt)
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

# Invoice generation & retrieval endpoints (Project Billing breakdown)
import json
import calendar

# Helper to import get_db from shared_db
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.append(str(_ROOT_DIR))
from shared_db.connection import get_db

@app.get("/api/budget-cost/project/{demand_id}/invoices")
def get_project_billing_invoices(demand_id: str):
    return db.get_invoices(demand_id)

@app.post("/api/budget-cost/project/{demand_id}/invoices/generate")
def generate_project_billing_invoices(demand_id: str):
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

# ── Burn & Forecast Endpoints ──────────────────────────────────────────────────

def _get_auto_populated_months(demand_id: str) -> list:
    invoices = db.get_invoices(demand_id)
    if not invoices:
        return []
        
    monthly_totals = {}
    for inv in invoices:
        month = inv.get("month")
        amt = inv.get("amount", 0.0)
        if month:
            monthly_totals[month] = monthly_totals.get(month, 0.0) + amt
            
    # Sort months chronologically
    sorted_months = sorted(monthly_totals.keys())
    
    actuals = []
    for month in sorted_months:
        actuals.append({
            "date": month,
            "amount": monthly_totals[month],
            "category": "actual"
        })
        
    return actuals

@app.get("/api/budget-cost/burn/{demand_id}")
def get_burn(demand_id: str):
    data = burn_db.get(demand_id)
    if not data:
        data = {
            "actuals": _get_auto_populated_months(demand_id),
            "forecast": [],
            "variance_pct": 0,
            "narrative": "",
            "committed": False
        }
        burn_db.upsert(demand_id, data)
    elif len(data.get("actuals", [])) == 0:
        data["actuals"] = _get_auto_populated_months(demand_id)
        
    return data

class UpdateActualsRequest(BaseModel):
    demand_id: str
    actuals: list[ActualEntry]

@app.post("/api/budget-cost/burn/actuals")
def save_actuals(req: UpdateActualsRequest):
    data = burn_db.get(req.demand_id)
    if not data:
        data = {"actuals": [], "forecast": [], "variance_pct": 0, "narrative": "", "committed": False}
    data["actuals"] = [a.dict() for a in req.actuals]
    burn_db.upsert(req.demand_id, data)
    return data

import sqlite3
import json
import os

def _get_historical_context(demand_id: str) -> str:
    db_path = os.environ.get("DATABASE_PATH", os.path.abspath(os.path.join(_THIS_DIR, "..", "source.db")))
    context = ""
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in c.fetchall()]
            
            if 'demands' in tables:
                c.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
                row = c.fetchone()
                if row:
                    dem = json.loads(row[0])
                    context += f"\nDemand Context: Title='{dem.get('title')}', Type='{dem.get('type')}', Risk='{dem.get('risk_level')}'.\n"
            
            if 'estimates' in tables:
                c.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,))
                row = c.fetchone()
                if row:
                    est = json.loads(row[0])
                    context += f"Original Estimate: Cost=${est.get('cost_estimate', 0)}, Effort={est.get('effort_days', 0)} days, Duration={est.get('duration_weeks', 0)} weeks.\n"
                    if est.get("risk_factors"):
                        context += f"Risks identified during estimation: {', '.join(est['risk_factors'])}.\n"
    except Exception as e:
        print("Error fetching historical context:", e)
    return context

@app.post("/api/budget-cost/burn/forecast")
def run_burn_forecast(req: BurnForecastRequest):
    data = burn_db.get(req.demand_id) or {"actuals": [], "forecast": [], "variance_pct": 0, "narrative": "", "committed": False}
    actuals = req.actuals or [{"date": a["date"], "amount": a["amount"], "category": a["category"]}
                               for a in data.get("actuals", [])]
    actual_total = sum(a["amount"] if isinstance(a, dict) else a.amount for a in actuals)
    
    historical_context = _get_historical_context(req.demand_id)
    
    prompt = (
        f"You are a Finance AI assistant. Project {req.demand_id} has spent ${actual_total:,.0f} in actuals. "
        f"Actuals by period: {actuals}. "
        f"{historical_context}"
        f"Write a 3-paragraph variance narrative: "
        f"(1) Burn vs plan summary with variance % (compare actuals vs Original Estimate Cost), "
        f"(2) Key cost drivers causing overrun or underrun (reference the Demand Context and Risks if relevant), "
        f"(3) Recommended forecast adjustment and risk outlook. "
        f"Be concise and use numbers."
    )
    narrative = call_gemini(prompt)
    data["actuals"] = [a if isinstance(a, dict) else a.dict() for a in actuals]
    data["narrative"] = narrative
    burn_db.upsert(req.demand_id, data)
    return {"status": "success", **burn_db.get(req.demand_id)}

@app.post("/api/budget-cost/burn/commit")
def commit_forecast(req: BurnForecastRequest):
    data = burn_db.get(req.demand_id)
    if not data:
        raise HTTPException(status_code=404, detail="No burn forecast found. Run forecast first.")
    data["committed"] = True
    burn_db.upsert(req.demand_id, data)
    return {"status": "committed", **burn_db.get(req.demand_id)}

# ── Invoice & PO Match Endpoints ───────────────────────────────────────────────

@app.get("/api/budget-cost/invoices/{demand_id}")
def get_invoices(demand_id: str):
    invoices = invoice_db.get_all(demand_id)
    if not invoices:
        seeded = _seed_invoices(demand_id)
        for inv in seeded:
            invoice_db.save(inv)
        invoices = invoice_db.get_all(demand_id)
    return invoices

@app.post("/api/budget-cost/invoices/match")
def match_invoice(req: InvoiceMatchRequest):
    from datetime import datetime
    prompt = (
        f"You are a Finance AI auditor. Invoice {req.invoice_id} for ${req.invoice_amount:,.2f} "
        f"references PO {req.po_reference} and SOW {req.sow_reference or 'N/A'}. "
        f"Delivered items: {req.delivered_items or []}. "
        f"Identify any discrepancies between the invoice amount, PO value, and delivered work. "
        f"Flag any items billed but not delivered. Return a concise bullet-point analysis."
    )
    ai_analysis = call_gemini(prompt)
    discrepancies = []
    if req.invoice_amount > 30000:
        discrepancies.append({"item": "Amount threshold", "detail": "Invoice exceeds PO tolerance — manual review required"})
    record = {
        "id": f"INV-{uuid.uuid4().hex[:8]}",
        "demand_id": req.demand_id,
        "invoice_id": req.invoice_id,
        "invoice_amount": req.invoice_amount,
        "po_reference": req.po_reference,
        "sow_reference": req.sow_reference or "",
        "delivered_items": req.delivered_items or [],
        "match_status": "discrepancy" if discrepancies else "matched",
        "discrepancies": discrepancies,
        "ai_analysis": ai_analysis,
        "decision": "",
        "decision_note": "",
        "created_at": datetime.utcnow().isoformat()
    }
    invoice_db.save(record)
    return {"status": "success", "invoice": record}

@app.post("/api/budget-cost/invoices/approve")
def approve_invoice(req: InvoiceApproveRequest):
    inv = invoice_db.get_by_invoice_id(req.demand_id, req.invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv["decision"] = req.decision
    inv["decision_note"] = req.note or ""
    inv["match_status"] = "approved" if req.decision == "approve" else "disputed"
    invoice_db.save(inv)
    return {"status": "success", "invoice": inv}

# ── Capex / Opex Endpoints ─────────────────────────────────────────────────────

@app.get("/api/budget-cost/capex-opex/{demand_id}")
def get_capex_opex(demand_id: str):
    items = capex_db.get_all(demand_id)
    if not items:
        seeded = _seed_capex(demand_id)
        capex_db.save_batch(seeded)
        items = capex_db.get_all(demand_id)
    return items

@app.post("/api/budget-cost/capex-opex/classify")
def classify_capex(req: CapexOpexRequest):
    items_desc = [{"description": s.description, "amount": s.amount, "vendor": s.vendor, "phase": s.project_phase}
                  for s in req.spend_items]
    prompt = (
        f"You are a Finance Controller AI. Classify each spend item as CAPEX or OPEX based on IAS 38 / IFRS 16 / company policy. "
        f"Project: {req.demand_id}. Spend items: {items_desc}. "
        f"For each item, return: classification (capex/opex), one-line policy evidence, and brief rationale. "
        f"Format as a numbered list."
    )
    ai_result = call_gemini(prompt)
    from datetime import datetime
    records = []
    for i, s in enumerate(req.spend_items):
        classification = "capex" if "build" in (s.project_phase or "").lower() else "opex"
        records.append({
            "id": f"CAP-{uuid.uuid4().hex[:8]}",
            "demand_id": req.demand_id,
            "description": s.description,
            "amount": s.amount,
            "vendor": s.vendor or "",
            "project_phase": s.project_phase or "",
            "classification": classification,
            "policy_evidence": "IAS 38 — directly attributable expenditure" if classification == "capex" else "Revenue expense — period cost",
            "ai_rationale": ai_result,
            "signed_off": False,
            "signed_off_by": "",
            "created_at": datetime.utcnow().isoformat()
        })
    capex_db.save_batch(records)
    return {"status": "success", "items": records, "ai_analysis": ai_result}

@app.post("/api/budget-cost/capex-opex/sign-off")
def sign_off_capex(req: CapexOpexSignOffRequest):
    items = capex_db.get_all(req.demand_id)
    if not items:
        raise HTTPException(status_code=404, detail="No capex/opex items found for this demand.")
    capex_db.sign_off(req.demand_id, req.approved_by or "Finance")
    return {"status": "signed_off", "approved_by": req.approved_by, "items_count": len(items)}
