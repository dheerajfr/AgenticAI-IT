import sys
import uuid
import random
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import sqlite3
import json

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from pydantic import BaseModel
from models import (
    BudgetRequest, ROIRequest,
    BurnForecastRequest, ActualEntry,
    InvoiceMatchRequest, InvoiceApproveRequest,
    CapexOpexRequest, CapexOpexSignOffRequest, CapexOpexItemSignOffRequest, SpendItem
)
from database import db, burn_db, invoice_db, capex_db, delete_demand_data
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

# Documented ratios for budget allocation split
INFRASTRUCTURE_RATIO = 0.20
VENDOR_RATIO = 0.30
RESOURCE_RATIO = 0.50

def _get_estimate_cost(demand_id: str):
    db_path = os.environ.get("DATABASE_PATH", os.path.abspath(os.path.join(_THIS_DIR, "..", "source.db")))
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='estimates'")
            if c.fetchone():
                c.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,))
                row = c.fetchone()
                if row:
                    est_data = json.loads(row[0])
                    cost = est_data.get("cost_estimate")
                    if cost is not None:
                        return float(cost)
    except Exception as e:
        print("Error fetching estimate cost:", e)
    return None

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    cost = _get_estimate_cost(demand_id)
    
    if cost is not None:
        infra = round(cost * INFRASTRUCTURE_RATIO, 2)
        vendor = round(cost * VENDOR_RATIO, 2)
        resource = round(cost * RESOURCE_RATIO, 2)
        cost_estimation = {
            "infrastructure_cost": infra,
            "vendor_cost": vendor,
            "resource_cost": resource,
            "awaiting_estimate": False
        }
    else:
        cost_estimation = {
            "infrastructure_cost": 0,
            "vendor_cost": 0,
            "resource_cost": 0,
            "awaiting_estimate": True
        }

    if not record:
        record = {
            "id": f"BDG-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "cost_estimation": cost_estimation,
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
    else:
        current_est = record.get("cost_estimation", {})
        if current_est.get("awaiting_estimate", True) and cost is not None:
            record["cost_estimation"] = cost_estimation
            db.save(record)
            
    return record


# ── Existing Endpoints ─────────────────────────────────────────────────────────

@app.get("/api/budget-cost/project/{demand_id}")
def get_budget_cost(demand_id: str):
    return _get_or_create(demand_id)

@app.delete("/api/budget-cost/project/{demand_id}")
def delete_budget_cost(demand_id: str):
    delete_demand_data(demand_id)
    return {"status": "success", "message": f"All budget data for {demand_id} deleted."}

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

def _compute_velocity_score(velocity_data: dict) -> Optional[int]:
    try:
        if not velocity_data or not isinstance(velocity_data, dict):
            return None
        
        # Case 1: Simple planned/actual at root
        actual = None
        planned = None
        for k, v in velocity_data.items():
            k_low = k.lower()
            if "actual" in k_low and isinstance(v, (int, float)):
                actual = v
            elif "planned" in k_low and isinstance(v, (int, float)):
                planned = v
        
        # Case 2: Sprints list
        if (actual is None or planned is None) and "sprints" in velocity_data:
            sprints = velocity_data["sprints"]
            if isinstance(sprints, list) and len(sprints) > 0:
                total_actual = 0
                total_planned = 0
                for s in sprints:
                    if isinstance(s, dict):
                        s_act = None
                        s_pla = None
                        for sk, sv in s.items():
                            sk_low = sk.lower()
                            if "actual" in sk_low and isinstance(sv, (int, float)):
                                s_act = sv
                            elif "planned" in sk_low and isinstance(sv, (int, float)):
                                s_pla = sv
                        if s_act is not None and s_pla is not None:
                            total_actual += s_act
                            total_planned += s_pla
                if total_planned > 0:
                    actual = total_actual
                    planned = total_planned

        if actual is not None and planned is not None and planned > 0:
            pct = (actual / planned) * 100
            return max(0, min(100, int(pct)))
    except Exception as e:
        print("Error computing velocity score programmatically:", e)
    return None

from typing import Optional

@app.post("/api/budget-cost/roi")
def model_roi(req: ROIRequest):
    record = _get_or_create(req.demand_id)
    score = _compute_velocity_score(req.velocity_data)
    
    if score is not None:
        prompt = (
            f"Model the Resource ROI for project {req.demand_id}. "
            f"Velocity data: {req.velocity_data}. Match team velocity to spend. "
            f"Provide a concise analysis of how the team's velocity translates to ROI."
        )
        ai_res = call_gemini(prompt)
        analysis = ai_res
        velocity_score = score
    else:
        prompt = f"""
        You are a Finance ROI Analyst. Model the Resource ROI for project {req.demand_id}.
        Velocity data: {req.velocity_data}. Match team velocity to spend.
        
        Analyze the velocity data and estimate a velocity performance score from 0 to 100 based on actual vs planned/target performance.
        
        Respond ONLY with a JSON object in this format (no markdown blocks, no prefix/suffix text):
        {{
            "analysis": "Your concise analysis paragraph here.",
            "velocity_score": 85
        }}
        """
        ai_res = call_gemini(prompt)
        cleaned = ai_res.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        try:
            parsed = json.loads(cleaned)
            analysis = parsed.get("analysis", ai_res)
            raw_score = parsed.get("velocity_score")
            if raw_score is not None:
                velocity_score = max(0, min(100, int(raw_score)))
            else:
                velocity_score = None
        except Exception:
            analysis = "Insufficient velocity data available to model ROI."
            velocity_score = None

    record["roi_model"] = {
        "analysis": analysis,
        "velocity_score": velocity_score
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
    if est.get("awaiting_estimate"):
        raise HTTPException(
            status_code=400,
            detail="Budget estimate is not yet available. Please complete estimation in the Estimate Shape service first."
        )
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
    # Look at invoice_matches
    invoices = invoice_db.get_all(demand_id)
    if not invoices:
        return []
        
    monthly_totals = {}
    
    # We will need the plan to assign months if they don't have dates.
    # But wait, generated samples might not have explicit months.
    # Let's map them chronologically.
    with get_db() as conn:
        row = conn.execute("SELECT data FROM plans WHERE demand_id = ?", (demand_id,)).fetchone()
        
    plan_months = []
    if row:
        plan_data = json.loads(row[0])
        tasks = plan_data.get("tasks", [])
        if tasks:
            start_dates = [t.get("start_date") for t in tasks if t.get("start_date")]
            end_dates = [t.get("end_date") for t in tasks if t.get("end_date")]
            if start_dates and end_dates:
                start_date = datetime.strptime(min(start_dates), "%Y-%m-%d").date()
                end_date = datetime.strptime(max(end_dates), "%Y-%m-%d").date()
                curr_year = start_date.year
                curr_month = start_date.month
                while True:
                    plan_months.append(f"{curr_year}-{curr_month:02d}")
                    if curr_year == end_date.year and curr_month == end_date.month:
                        break
                    curr_month += 1
                    if curr_month > 12:
                        curr_month = 1
                        curr_year += 1
                        
    # Try to extract month from invoice_id (e.g., INV-...-2026-07) or just distribute them sequentially
    for i, inv in enumerate(invoices):
        # Default to chronological distribution across plan months if available
        month = plan_months[i % len(plan_months)] if plan_months else f"2026-{i+1:02d}"
        
        # If the invoice has a month embedded in it, we could parse it, but for simplicity
        # we will assume the sample generator suffixes the invoice_id with -YYYY-MM
        parts = inv.get("invoice_id", "").split("-")
        if len(parts) >= 3 and len(parts[-2]) == 4 and len(parts[-1]) == 2:
            month = f"{parts[-2]}-{parts[-1]}"

        amt = inv.get("invoice_amount", 0.0)
        
        # Only sum up matched or approved invoices
        status = inv.get("match_status", "")
        decision = inv.get("decision", "")
        if status == "matched" or decision == "approve":
            monthly_totals[month] = monthly_totals.get(month, 0.0) + amt

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
            "actuals": [],
            "forecast": [],
            "variance_pct": 0,
            "narrative": "",
            "committed": False
        }
        burn_db.upsert(demand_id, data)
    else:
        actuals = data.get("actuals", [])
        if actuals:
            actual_total = sum(a["amount"] for a in actuals if isinstance(a, dict))
            forecast_total = sum(f["amount"] for f in data.get("forecast", []) if isinstance(f, dict))
            total_spend = actual_total + forecast_total if forecast_total > 0 else actual_total
            plan_cost = _get_plan_cost(demand_id)
            if plan_cost > 0:
                data["variance_pct"] = round(((total_spend - plan_cost) / plan_cost) * 100, 1)
                burn_db.upsert(demand_id, data)
        
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
    actual_total = sum(a["amount"] for a in data["actuals"])
    forecast_total = sum(f["amount"] for f in data.get("forecast", []) if isinstance(f, dict))
    total_spend = actual_total + forecast_total if forecast_total > 0 else actual_total
    plan_cost = _get_plan_cost(req.demand_id)
    if plan_cost > 0:
        data["variance_pct"] = round(((total_spend - plan_cost) / plan_cost) * 100, 1)
    burn_db.upsert(req.demand_id, data)
    return data

import sqlite3
import json
import os

def _get_plan_cost(demand_id: str) -> float:
    db_path = os.environ.get("DATABASE_PATH", os.path.abspath(os.path.join(_THIS_DIR, "..", "source.db")))
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,))
            row = c.fetchone()
            if row:
                est = json.loads(row[0])
                cost = est.get("cost_estimate")
                if cost and float(cost) > 0:
                    return float(cost)
    except Exception as e:
        print("Error reading estimate for plan cost:", e)

    try:
        rec = db.get_by_demand(demand_id)
        if rec and rec.get("cost_estimation"):
            ce = rec["cost_estimation"]
            tot = float(ce.get("infrastructure_cost", 0) + ce.get("vendor_cost", 0) + ce.get("resource_cost", 0))
            if tot > 0:
                return tot
    except Exception as e:
        print("Error reading budget record for plan cost:", e)

    return 0.0

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
    forecast_total = sum(f["amount"] if isinstance(f, dict) else f.amount for f in data.get("forecast", []))
    total_spend = actual_total + forecast_total if forecast_total > 0 else actual_total

    plan_cost = _get_plan_cost(req.demand_id)
    if plan_cost > 0:
        data["variance_pct"] = round(((total_spend - plan_cost) / plan_cost) * 100, 1)
    
    historical_context = _get_historical_context(req.demand_id)
    
    prompt = (
        f"You are a Finance AI assistant. Project {req.demand_id} has spent ${actual_total:,.0f} in actuals against baseline plan of ${plan_cost:,.0f}. "
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
    return invoice_db.get_all(demand_id)

# No PO amount was supplied for the invoice, so there's nothing to reconcile the
# invoice total against — fall back to a flat review threshold instead of silently
# skipping the check. Named here (rather than left as a bare literal) so the policy
# is visible and easy to change.
NO_PO_AMOUNT_REVIEW_THRESHOLD = 30000

@app.post("/api/budget-cost/invoices/match")
def match_invoice(req: InvoiceMatchRequest):
    from datetime import datetime
    prompt = (
        f"You are a Finance AI auditor. Invoice {req.invoice_id} for ${req.invoice_amount:,.2f} "
        f"references PO {req.po_reference} (PO value: {f'${req.po_amount:,.2f}' if req.po_amount is not None else 'not provided'}) "
        f"and SOW {req.sow_reference or 'N/A'}. "
        f"Delivered items: {req.delivered_items or []}. "
        f"Identify any discrepancies between the invoice amount, PO value, and delivered work. "
        f"Flag any items billed but not delivered. Return a concise bullet-point analysis."
    )
    ai_analysis = call_gemini(prompt)
    discrepancies = []
    if req.po_amount is not None:
        if req.invoice_amount > req.po_amount:
            over_by = req.invoice_amount - req.po_amount
            discrepancies.append({
                "item": "Invoice exceeds PO value",
                "detail": f"Invoice is ${over_by:,.2f} over the PO value of ${req.po_amount:,.2f}"
            })
    elif req.invoice_amount > NO_PO_AMOUNT_REVIEW_THRESHOLD:
        discrepancies.append({
            "item": "No PO value on file",
            "detail": f"No PO amount was provided to reconcile against; invoice exceeds the ${NO_PO_AMOUNT_REVIEW_THRESHOLD:,} review threshold — manual review required"
        })
    if not req.delivered_items:
        discrepancies.append({"item": "No delivered items listed", "detail": "Cannot confirm invoiced work was actually delivered"})
    record = {
        "id": f"INV-{uuid.uuid4().hex[:8]}",
        "demand_id": req.demand_id,
        "invoice_id": req.invoice_id,
        "invoice_amount": req.invoice_amount,
        "po_reference": req.po_reference,
        "po_amount": req.po_amount,
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

@app.post("/api/budget-cost/invoices/{demand_id}/generate-samples")
def generate_sample_invoices(demand_id: str):
    import sqlite3 as _sqlite3

    # ── 1. Load demand context ─────────────────────────────────────────────────
    with get_db() as conn:
        dem_row   = conn.execute("SELECT data FROM demands   WHERE demand_id = ?", (demand_id,)).fetchone()
        est_row   = conn.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,)).fetchone()
        plan_row  = conn.execute("SELECT data FROM plans     WHERE demand_id = ?", (demand_id,)).fetchone()

    if not plan_row:
        raise HTTPException(status_code=404,
            detail="No plan found for this project. Please generate a plan in Plan & Schedule first.")

    demand_data  = json.loads(dem_row[0])  if dem_row  else {}
    estimate_data = json.loads(est_row[0]) if est_row  else {}
    plan_data    = json.loads(plan_row[0])

    project_title = demand_data.get("title", demand_id)
    domain        = demand_data.get("domain", "Technology")
    submitted_by  = demand_data.get("submitted_by", "system")

    total_cost      = estimate_data.get("cost_estimate", 0)
    effort_days     = estimate_data.get("effort_days", 0)
    duration_weeks  = estimate_data.get("duration_weeks", 0)
    risk_factors    = estimate_data.get("risk_factors", [])

    tasks = plan_data.get("tasks", [])
    if not tasks:
        raise HTTPException(status_code=404, detail="No tasks found in plan.")

    # ── 2. Gather overall dates ────────────────────────────────────────────────
    start_dates = [t.get("start_date") for t in tasks if t.get("start_date")]
    end_dates   = [t.get("end_date")   for t in tasks if t.get("end_date")]
    if not start_dates or not end_dates:
        raise HTTPException(status_code=400, detail="Missing dates in plan tasks.")

    proj_start = datetime.strptime(min(start_dates), "%Y-%m-%d").date()
    proj_end   = datetime.strptime(max(end_dates),   "%Y-%m-%d").date()
    total_days = max((proj_end - proj_start).days, 1)

    # ── 3. Prepare task list for LLM ──────────────────────────────────────────────
    task_inputs = []
    
    for i, task in enumerate(tasks):
        task_name   = task.get("name", f"Phase {i+1}")
        task_start  = task.get("start_date", str(proj_start))
        task_end    = task.get("end_date",   str(proj_end))
        
        try:
            t_start = datetime.strptime(task_start, "%Y-%m-%d").date()
            t_end   = datetime.strptime(task_end,   "%Y-%m-%d").date()
        except:
            t_start, t_end = proj_start, proj_end
            
        task_days       = max((t_end - t_start).days, 1)
        task_proportion = task_days / total_days
        task_cost       = round(total_cost * task_proportion, 2)
        
        task_inputs.append({
            "task_index": i,
            "task_name": task_name,
            "po_budget": task_cost
        })

    disc_types = ["quantity_overbill", "rate_mismatch", "unauthorized_item", "duplicate_billing", "unverified_milestone"]
    for i, t in enumerate(task_inputs):
        # Alternate between discrepant invoices and clean matched invoices
        if i % 2 == 0:
            disc_idx = (i // 2) % len(disc_types)
            t["introduce_discrepancy"] = disc_types[disc_idx]
            t["include_capex_item"] = False
        else:
            t["introduce_discrepancy"] = False
            t["include_capex_item"] = True
            
    prompt = (
        f"You are an AI generating realistic synthetic invoice data for project '{project_title}' (domain: {domain}).\n"
        f"For each task in the list below, generate one invoice with contextually appropriate line items.\n\n"
        f"=== RULES ===\n"
        f"1. LINE ITEM AMOUNTS: The PO amounts (`amount`) across all line items should sum roughly to `po_budget` for that task.\n"
        f"2. DISCREPANCY TYPE 'quantity_overbill': For tasks where `introduce_discrepancy` is 'quantity_overbill', "
        f"   introduce a billing discrepancy where one line item has a higher `qty_invoiced` than `qty_po` "
        f"   (e.g., qty_po=1.0, qty_invoiced=1.35), making `amount_invoiced` noticeably higher than `amount`. "
        f"   Set `match_status` to 'discrepancy'. In `discrepancies`, include item='Quantity Overbill' and a realistic detail "
        f"   like 'Vendor invoiced 1.35 units against PO qty of 1.0 — 35%% overbill requiring approval'. "
        f"   Write a thorough `ai_analysis` (2–3 sentences) flagging the quantity mismatch and recommending human review.\n"
        f"3. DISCREPANCY TYPE 'rate_mismatch': For tasks where `introduce_discrepancy` is 'rate_mismatch', "
        f"   introduce a rate variance where the invoiced unit price is higher than the contracted PO rate "
        f"   (e.g., PO unit price $125/hr vs invoiced unit price $155/hr). Mark that line item with `flagged: true`. "
        f"   Set `match_status` to 'discrepancy'. In `discrepancies`, include item='Rate Variance' and a detail "
        f"   like 'Invoiced rate ($155/hr) exceeds contracted PO rate ($125/hr) by 24%% — rate revision authorization needed'. "
        f"   Write a thorough `ai_analysis` (2–3 sentences) detailing the unit price deviation.\n"
        f"4. DISCREPANCY TYPE 'unauthorized_item': For tasks where `introduce_discrepancy` is 'unauthorized_item', "
        f"   add one extra line item that was NOT in the original SOW (e.g., 'Premium Support Retainer', 'Travel & Expenses', "
        f"   or 'Additional Integration Fee'). Mark that line item with `flagged: true`. "
        f"   Set `match_status` to 'discrepancy'. In `discrepancies`, include item='Unauthorized Charge' and a detail "
        f"   like 'Line item not referenced in SOW or PO — requires human approval before payment'. "
        f"   Write a thorough `ai_analysis` (2–3 sentences) explaining the unauthorized item was not scoped.\n"
        f"5. DISCREPANCY TYPE 'duplicate_billing': For tasks where `introduce_discrepancy` is 'duplicate_billing', "
        f"   include a line item billed for a deliverable already claimed or paid in a prior billing cycle. Mark with `flagged: true`. "
        f"   Set `match_status` to 'discrepancy'. In `discrepancies`, include item='Duplicate Billing' and a detail "
        f"   like 'Line item appears identical to milestone delivered and settled in prior invoice'. "
        f"   Write a thorough `ai_analysis` (2–3 sentences) flagging duplicate milestone submission.\n"
        f"6. DISCREPANCY TYPE 'unverified_milestone': For tasks where `introduce_discrepancy` is 'unverified_milestone', "
        f"   include a milestone charge where acceptance criteria sign-off or completion proof is missing. Mark with `flagged: true`. "
        f"   Set `match_status` to 'discrepancy'. In `discrepancies`, include item='Unverified Milestone' and a detail "
        f"   like 'Invoiced for milestone completion prior to formal QA sign-off and deliverable acceptance'. "
        f"   Write a thorough `ai_analysis` (2–3 sentences) noting unconfirmed delivery.\n"
        f"7. CAPEX ITEMS: For tasks where `include_capex_item` is true, include at least one line item that is clearly "
        f"   capital expenditure in nature — e.g., 'Software License (3-Year)', 'Cloud Infrastructure Setup', "
        f"   'Hardware Procurement', or 'Perpetual IP License'. These should be realistic amounts within the task budget. "
        f"   These invoices should be `match_status: 'matched'` (no discrepancy) unless also flagged.\n"
        f"8. All other tasks: generate clean, matched invoices with realistic line items for the task type.\n"
        f"9. `flagged` on a line item should be true only when that specific line is discrepant or unauthorized.\n\n"
        f"=== TASKS ===\n"
        f"{json.dumps(task_inputs, indent=2)}\n\n"
        f"=== OUTPUT FORMAT ===\n"
        f"Return ONLY a JSON array (no markdown, no explanation) with one object per task:\n"
        f"[\n"
        f"  {{\n"
        f"    \"task_index\": 0,\n"
        f"    \"task_name\": \"...\",\n"
        f"    \"invoice_amount\": 1250.00,\n"
        f"    \"line_items\": [\n"
        f"      {{\n"
        f"        \"description\": \"...\",\n"
        f"        \"qty_po\": 1.0,\n"
        f"        \"qty_invoiced\": 1.3,\n"
        f"        \"unit\": \"Lump Sum\",\n"
        f"        \"amount\": 1000.00,\n"
        f"        \"amount_invoiced\": 1300.00,\n"
        f"        \"flagged\": true\n"
        f"      }}\n"
        f"    ],\n"
        f"    \"match_status\": \"discrepancy\",\n"
        f"    \"discrepancies\": [{{\"item\": \"...\", \"detail\": \"...\"}}],\n"
        f"    \"ai_analysis\": \"...\"\n"
        f"  }}\n"
        f"]"
    )
    
    ai_result = call_gemini(prompt, is_json=True)
    parsed_invoices = []
    if isinstance(ai_result, dict) and 'items' in ai_result:
        parsed_invoices = ai_result['items']
    elif isinstance(ai_result, list):
        parsed_invoices = ai_result
    elif isinstance(ai_result, dict):
        for val in ai_result.values():
            if isinstance(val, list):
                parsed_invoices = val
                break
                
    invoice_map = {item.get('task_index'): item for item in parsed_invoices if isinstance(item, dict) and 'task_index' in item}

    # Clear existing samples
    existing = invoice_db.get_all(demand_id)
    for inv in existing:
        invoice_db.delete(inv["id"])

    created = []
    po_number = 1

    for i, task in enumerate(tasks):
        task_name   = task.get("name", f"Phase {i+1}")
        task_start  = task.get("start_date", str(proj_start))
        task_end    = task.get("end_date",   str(proj_end))
        
        try:
            t_start = datetime.strptime(task_start, "%Y-%m-%d").date()
            t_end   = datetime.strptime(task_end,   "%Y-%m-%d").date()
        except:
            t_start, t_end = proj_start, proj_end
            
        task_days       = max((t_end - t_start).days, 1)
        task_proportion = task_days / total_days
        task_cost       = round(total_cost * task_proportion, 2)
        
        t = task_inputs[i] if i < len(task_inputs) else {}
        ai_inv = invoice_map.get(i) or (parsed_invoices[i] if i < len(parsed_invoices) and isinstance(parsed_invoices[i], dict) else {})
        
        line_items = ai_inv.get("line_items", [{"description": f"{task_name} Services", "qty_po": 1.0, "qty_invoiced": 1.0, "unit": "Lump Sum", "amount": task_cost, "amount_invoiced": task_cost, "flagged": False}])
        invoice_amount = float(ai_inv.get("invoice_amount", task_cost))
        match_status = ai_inv.get("match_status", "matched")
        discrepancies = ai_inv.get("discrepancies", [])
        ai_analysis = ai_inv.get("ai_analysis", f"Invoice for '{task_name}' generated by AI.")

        # Enforce discrepancy if requested but LLM returned matched/empty
        disc_type = t.get("introduce_discrepancy")
        if disc_type and (match_status != "discrepancy" or not discrepancies):
            match_status = "discrepancy"
            if disc_type == "quantity_overbill":
                discrepancies = [{"item": "Quantity Overbill", "detail": f"Vendor invoiced 1.35 units against PO qty of 1.0 for '{task_name}' — 35% overbill requiring approval"}]
                ai_analysis = f"Quantity Overbill detected: Invoiced quantity exceeds PO allotment for '{task_name}'. Review and obtain approval before payment."
                if line_items:
                    line_items[0]["qty_invoiced"] = round(float(line_items[0].get("qty_po", 1.0)) * 1.35, 2)
                    line_items[0]["amount_invoiced"] = round(float(line_items[0].get("amount", task_cost)) * 1.35, 2)
                    line_items[0]["flagged"] = True
                    invoice_amount = line_items[0]["amount_invoiced"]
            elif disc_type == "rate_mismatch":
                discrepancies = [{"item": "Rate Variance", "detail": f"Invoiced rate ($155/hr) exceeds contracted PO rate ($125/hr) by 24% on '{task_name}'"}]
                ai_analysis = f"Rate Variance detected: Invoiced unit price for '{task_name}' exceeds agreed PO rate card by 24%."
                if line_items:
                    line_items[0]["amount_invoiced"] = round(float(line_items[0].get("amount", task_cost)) * 1.24, 2)
                    line_items[0]["flagged"] = True
                    invoice_amount = line_items[0]["amount_invoiced"]
            elif disc_type == "unauthorized_item":
                discrepancies = [{"item": "Unauthorized Charge", "detail": f"Line item 'Out-of-Scope Travel & Expenses' not referenced in SOW or PO for '{task_name}'"}]
                ai_analysis = f"Unauthorized item detected on '{task_name}': Added charge is not covered in SOW or PO scope."
                line_items.append({
                    "description": "Out-of-Scope Travel & Expenses",
                    "qty_po": 0.0,
                    "qty_invoiced": 1.0,
                    "unit": "Lump Sum",
                    "amount": 0.0,
                    "amount_invoiced": round(task_cost * 0.15, 2),
                    "flagged": True
                })
                invoice_amount = sum(float(li.get("amount_invoiced", li.get("amount", 0))) for li in line_items)
            elif disc_type == "duplicate_billing":
                discrepancies = [{"item": "Duplicate Billing", "detail": f"Line item appears identical to milestone delivered and settled in prior invoice for '{task_name}'"}]
                ai_analysis = f"Duplicate Billing warning: '{task_name}' includes charges previously invoiced and settled."
                if line_items:
                    line_items[0]["flagged"] = True
            elif disc_type == "unverified_milestone":
                discrepancies = [{"item": "Unverified Milestone", "detail": f"Invoiced prior to formal QA sign-off and deliverable acceptance proof for '{task_name}'"}]
                ai_analysis = f"Unverified Milestone: Delivery acceptance proof for '{task_name}' has not been uploaded or verified."
                if line_items:
                    line_items[0]["flagged"] = True

        invoice_id = f"INV-{demand_id.split('-')[-1]}-{i+1:02d}-{task_name.replace(' ', '').upper()[:6]}"
        po_ref     = f"PO-{demand_id.split('-')[-1]}-{po_number:03d}"
        sow_ref    = f"SOW-{demand_id.split('-')[-1]}-{i+1}"
        po_number += 1

        inv_record = {
            "id":             f"INV-{uuid.uuid4().hex[:8]}",
            "demand_id":      demand_id,
            "invoice_id":     invoice_id,
            "invoice_amount": invoice_amount,
            "po_reference":   po_ref,
            "sow_reference":  sow_ref,
            "delivered_items": [li.get("description", "") for li in line_items],
            "line_items":     line_items,
            "task_name":      task_name,
            "task_start":     task_start,
            "task_end":       task_end,
            "project_title":  project_title,
            "domain":         domain,
            "submitted_by":   submitted_by,
            "effort_days":    effort_days,
            "match_status":   match_status,
            "discrepancies":  discrepancies,
            "ai_analysis":    ai_analysis,
            "decision":       "",
            "decision_note":  "",
            "created_at":     datetime.utcnow().isoformat()
        }
        invoice_db.save(inv_record)
        created.append(inv_record)

    return {"status": "success", "invoices": created, "project_title": project_title}


@app.post("/api/budget-cost/invoices/approve")
def approve_invoice(req: InvoiceApproveRequest):
    inv = invoice_db.get_by_invoice_id(req.demand_id, req.invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    inv["match_status"] = "matched" if req.decision == "approve" else "disputed"
    inv["decision"] = req.decision
    inv["decision_note"] = req.note or ""
    
    invoice_db.save(inv)
    
    all_invoices = invoice_db.get_all(req.demand_id)
    all_approved = False
    disputed_count = 0
    pending_count = 0
    if all_invoices:
        all_approved = all((i.get("match_status") == "matched" or i.get("decision") == "approve") for i in all_invoices)
        disputed_count = sum(1 for i in all_invoices if i.get("match_status") == "disputed" or i.get("decision") == "dispute")
        pending_count = sum(1 for i in all_invoices if i.get("match_status") == "discrepancy" and not i.get("decision"))
        
    return {
        "status": "success",
        "all_approved": all_approved,
        "disputed_count": disputed_count,
        "pending_count": pending_count,
        "all_handled": pending_count == 0,
        "invoice": inv
    }

@app.post("/api/budget-cost/invoices/final-approve")
def final_approve_invoices(req: BurnForecastRequest):
    try:
        demand_id = req.demand_id
        all_invoices = invoice_db.get_all(demand_id)
        
        # Guard: Ensure every invoice is approved before allowing final approval
        if any(i.get("match_status") != "matched" and i.get("decision") != "approve" for i in all_invoices):
            raise HTTPException(status_code=400, detail="Cannot proceed to Final Approval. All invoices must be approved first.")
        
        # 1. Classify Capex/Opex for approved/matched ones
        spend_items = []
        for i in all_invoices:
            if i.get("match_status") == "matched" or i.get("decision") == "approve":
                for li in i.get("line_items", []):
                    spend_items.append(
                        SpendItem(
                            description=li["description"],
                            amount=li["amount"],
                            vendor=i.get("po_reference", "Vendor"),
                            project_phase=i.get("task_name", "")
                        )
                    )
        if spend_items:
            existing_capex = capex_db.get_all(demand_id)
            for c in existing_capex:
                if hasattr(capex_db, "delete"): capex_db.delete(demand_id, c["id"])
            
            classify_req = CapexOpexRequest(demand_id=demand_id, spend_items=spend_items)
            classify_capex(classify_req)
            
        # 2. Auto-populate Burn Actuals & Forecast
        burn_data = get_burn(demand_id)
        if len(burn_data.get("actuals", [])) == 0:
            burn_data["actuals"] = _get_auto_populated_months(demand_id)
            burn_db.upsert(demand_id, burn_data)

        try:
            run_burn_forecast(BurnForecastRequest(demand_id=demand_id))
        except Exception as e:
            print("Forecast error:", e)
            
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}
    return {"status": "success", "message": "Final approval completed. Downstream data generated."}

@app.post("/api/budget-cost/insights/generate/{demand_id}")
def generate_insights(demand_id: str):
    # Just generate invoices (they have intentional discrepancies for the user to solve)
    generate_sample_invoices(demand_id)
    return {"status": "success", "message": "Invoices generated. Please resolve discrepancies."}

# ── Capex / Opex Endpoints ─────────────────────────────────────────────────────

@app.get("/api/budget-cost/capex-opex/{demand_id}")
def get_capex_opex(demand_id: str):
    items = capex_db.get_all(demand_id)
    return items or []

@app.post("/api/budget-cost/capex-opex/classify")
def classify_capex(req: CapexOpexRequest):
    items_desc = [{"description": s.description, "amount": s.amount, "vendor": s.vendor, "phase": s.project_phase}
                  for s in req.spend_items]
    prompt = (
        f"You are a Finance Controller AI. Classify each spend item as CAPEX or OPEX based on IAS 38 / IFRS 16 / company policy.\n"
        f"Project: {req.demand_id}. Spend items: {items_desc}.\n"
        f"Return ONLY a JSON array where each element is an object with:\n"
        f"'description' (string, exactly matching the input description),\n"
        f"'classification' (string, either 'capex' or 'opex'),\n"
        f"'policy_evidence' (string, short one-line policy evidence),\n"
        f"'rationale' (string, brief reasoning)."
    )
    ai_result = call_gemini(prompt, is_json=True)
    
    parsed_items = []
    if isinstance(ai_result, dict) and 'items' in ai_result:
        parsed_items = ai_result['items']
    elif isinstance(ai_result, list):
        parsed_items = ai_result
    elif isinstance(ai_result, dict):
        # Maybe it returned {"project": ..., "classifications": [...]}
        for val in ai_result.values():
            if isinstance(val, list):
                parsed_items = val
                break
                
    classification_map = {item.get('description', ''): item for item in parsed_items if isinstance(item, dict)}
    
    records = []
    for s in req.spend_items:
        ai_item = classification_map.get(s.description, {})
        classification = str(ai_item.get("classification", "")).lower()
        
        desc_lower = s.description.lower()
        phase_lower = (s.project_phase or "").lower()
        
        capex_keywords = ["license", "perpetual", "hardware", "procurement", "architecture", "setup", "build", "infrastructure", "migration tool", "implementation", "design", "3-year", "annual license"]
        opex_keywords = ["support", "maintenance", "retainer", "hypercare", "subscription", "sla", "travel", "expenses", "monthly", "hourly", "qa", "testing", "deploy", "operation"]
        
        if any(k in desc_lower for k in capex_keywords) or any(k in phase_lower for k in ["design", "build"]):
            classification = "capex"
            policy = ai_item.get("policy_evidence") or "IAS 38 — Directly attributable cost for long-term intangible/tangible asset creation."
            rationale = ai_item.get("rationale") or "Capital expenditure: Initial build/setup deliverable creating enduring enterprise asset."
        elif any(k in desc_lower for k in opex_keywords) or any(k in phase_lower for k in ["support", "hypercare"]):
            classification = "opex"
            policy = ai_item.get("policy_evidence") or "IFRS 16 — Period operational expense."
            rationale = ai_item.get("rationale") or "Operational expenditure: Ongoing service/maintenance period cost."
        elif "capex" in classification:
            classification = "capex"
            policy = ai_item.get("policy_evidence", "IAS 38 — Asset creation criteria met")
            rationale = ai_item.get("rationale", "Capitalised project deliverable.")
        else:
            classification = "opex"
            policy = ai_item.get("policy_evidence", "Revenue expense — period cost")
            rationale = ai_item.get("rationale", "Standard operational expense.")
        
        records.append({
            "id": f"CAP-{uuid.uuid4().hex[:8]}",
            "demand_id": req.demand_id,
            "description": s.description,
            "amount": s.amount,
            "vendor": s.vendor or "",
            "project_phase": s.project_phase or "",
            "classification": classification,
            "policy_evidence": policy,
            "ai_rationale": rationale,
            "signed_off": False,
            "signed_off_by": "",
            "created_at": datetime.utcnow().isoformat()
        })
    capex_db.save_batch(records)
    return {"status": "success", "items": records, "ai_analysis": "Completed via LLM classification."}

@app.post("/api/budget-cost/capex-opex/sign-off")
def sign_off_capex(req: CapexOpexSignOffRequest):
    items = capex_db.get_all(req.demand_id)
    if not items:
        raise HTTPException(status_code=404, detail="No capex/opex items found for this demand.")
    capex_db.sign_off(req.demand_id, req.approved_by or "Finance")
    return {"status": "signed_off", "approved_by": req.approved_by, "items_count": len(items)}

@app.post("/api/budget-cost/capex-opex/sign-off-item")
def sign_off_capex_item(req: CapexOpexItemSignOffRequest):
    capex_db.sign_off_item(req.item_id, req.approved_by or "Finance Controller")
    return {"status": "signed_off", "item_id": req.item_id, "approved_by": req.approved_by or "Finance Controller"}
