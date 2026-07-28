import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uuid

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

import json
import sqlite3
from datetime import datetime
from models import VendorRequest, SOWCheckRequest, OnboardRequest, ChecklistStepUpdate
from shared_db.connection import get_db
from database import db
from llm_client import call_gemini

app = FastAPI(title="Vendor Coordination Service (Always-on)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)

    # Actual outputs = real task count from the project's plan. No plan yet means
    # no actual outputs to reconcile against, not a made-up placeholder count.
    actual_outputs = 0
    try:
        with get_db() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT data FROM plans WHERE demand_id = ?", (demand_id,)).fetchone()
            if row and row['data']:
                plan_data = json.loads(row['data'])
                actual_outputs = len(plan_data.get('tasks', []))
    except Exception:
        actual_outputs = 0

    # Vendor claims come from the vendor's own latest self-reported status report
    # (uploaded via the Status Normaliser), not a fabricated offset. Until a vendor
    # actually submits a report, there is nothing to reconcile against.
    reports = db.get_reports(demand_id)
    vendor_claims = None
    if reports:
        latest_report = max(reports, key=lambda r: r.get('parsed_at') or '')
        claimed = latest_report.get('metrics', {}).get('deliverables_completed')
        if isinstance(claimed, (int, float)):
            vendor_claims = claimed

    if vendor_claims is None:
        reconciliation_status = "awaiting_vendor_report"
    elif vendor_claims == actual_outputs:
        reconciliation_status = "completed"
    else:
        reconciliation_status = "discrepancy_detected"

    sla_tracking = {
        "vendor_claims": vendor_claims,
        "actual_outputs": actual_outputs,
        "reconciliation_status": reconciliation_status
    }

    if not record:
        record = {
            "id": f"VND-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "sla_tracking": sla_tracking,
            "sow_discrepancies": [],
            "access_alerts": []
        }
    else:
        record["sla_tracking"] = sla_tracking
    db.save(record)
    return record

@app.get("/api/vendor-coordination/project/{demand_id}")
def get_vendor_coordination(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/vendor-coordination/check-sow")
def check_sow(req: SOWCheckRequest):
    record = _get_or_create(req.demand_id)
    
    demand_desc = ""
    try:
        with get_db() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT data FROM demands WHERE demand_id = ?", (req.demand_id,)).fetchone()
            if row and row['data']:
                demand_data = json.loads(row['data'])
                demand_desc = demand_data.get('description', '')
    except Exception:
        pass

    prompt = f"""
    Check for discrepancies between SOW {req.sow_document_id} and the actual PM tool deliverables for project {req.demand_id}.
    Project description from demand intake: {demand_desc}
    Compare these and identify missing deliverables. Keep your analysis concise (2 sentences).
    """
    ai_res = call_gemini(prompt)
    
    disc = {
        "id": f"DISC-{uuid.uuid4().hex[:4]}",
        "description": f"Scope check for SOW vs actual deliverables for {req.demand_id}",
        "ai_analysis": ai_res
    }
    
    discrepancies = record.get("sow_discrepancies", [])
    discrepancies.append(disc)
    record["sow_discrepancies"] = discrepancies
    db.save(record)
    
    return {"status": "success", "discrepancy": disc, "record": record}

@app.post("/api/vendor-coordination/revoke-access/{demand_id}")
def revoke_access(demand_id: str, user: str):
    record = _get_or_create(demand_id)
    alerts = record.get("access_alerts", [])
    alerts = [a for a in alerts if a.get("user") != user]
    record["access_alerts"] = alerts
    db.save(record)
    
    return {"status": "success", "revoked_user": user, "record": record}

# --- Onboarding / Offboarding Checklist ---

@app.get("/api/vendor-coordination/project/{demand_id}/checklists")
def get_checklists(demand_id: str):
    return db.get_checklists(demand_id)

@app.post("/api/vendor-coordination/onboard")
def start_onboarding(req: OnboardRequest):
    request_id = f"REQ-{uuid.uuid4().hex[:8]}"
    
    # Define steps based on type
    if req.onboarding_type == 'join':
        steps = [
            {"step_name": "NDA Signature", "completed": False},
            {"step_name": "Compliance Training", "completed": False},
            {"step_name": "IAM Account Created", "completed": False},
            {"step_name": "VPN Access Configured", "completed": False}
        ]
    else:  # leave
        steps = [
            {"step_name": "Equipment Returned", "completed": False},
            {"step_name": "ITSM Revocation Ticket Opened", "completed": False},
            {"step_name": "IAM Account Deactivated", "completed": False},
            {"step_name": "Security Exit Interview", "completed": False}
        ]
        
    checklist = {
        "request_id": request_id,
        "demand_id": req.demand_id,
        "vendor_employee_name": req.vendor_employee_name,
        "onboarding_type": req.onboarding_type,
        "status": "pending",
        "checklist_items": steps
    }
    
    db.save_checklist(checklist)

    # Track the new access grant so it shows up for later review/revocation.
    if req.onboarding_type == 'join':
        record = _get_or_create(req.demand_id)
        alerts = record.get("access_alerts", [])
        if not any(a.get("user") == req.vendor_employee_name for a in alerts):
            alerts.append({
                "user": req.vendor_employee_name,
                "onboarded_at": datetime.now().isoformat(),
                "action": "active"
            })
            record["access_alerts"] = alerts
            db.save(record)

    return {"status": "success", "checklist": checklist}

@app.patch("/api/vendor-coordination/checklists/{request_id}/step")
def update_checklist_step(request_id: str, step_update: ChecklistStepUpdate):
    with get_db() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM vendor_checklists WHERE request_id = ?", (request_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Checklist not found")
        checklist = dict(row)
        checklist['checklist_items'] = json.loads(checklist['checklist_items'])
        
    for item in checklist['checklist_items']:
        if item['step_name'] == step_update.step_name:
            item['completed'] = step_update.completed
            break
            
    # Check if all steps are completed
    all_done = all(item['completed'] for item in checklist['checklist_items'])
    checklist['status'] = "completed" if all_done else "pending"
    
    # Save back
    db.save_checklist(checklist)
    
    # If it is a leave request and IAM Account Deactivated is completed, trigger revocation logic
    if checklist['onboarding_type'] == 'leave' and step_update.step_name == "IAM Account Deactivated" and step_update.completed:
        # Revoke access alert for this user if matching
        record = _get_or_create(checklist['demand_id'])
        alerts = record.get("access_alerts", [])
        alerts = [a for a in alerts if checklist['vendor_employee_name'].lower() not in a.get('user').lower()]
        record["access_alerts"] = alerts
        db.save(record)
        
    return {"status": "success", "checklist": checklist}

# --- Status Normaliser ---

@app.get("/api/vendor-coordination/project/{demand_id}/reports")
def get_reports(demand_id: str):
    return db.get_reports(demand_id)

@app.post("/api/vendor-coordination/upload-report")
async def upload_report(demand_id: str = Form(...), file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    
    prompt = f"""
    You are an AI status normaliser. Analyze the following unstructured vendor status report text:
    ---
    {text}
    ---
    
    Extract the following information:
    1. Vendor Name
    2. Reporting Period (e.g. July 2026, Week 29)
    3. Overall Status (one of: Green, Amber, Red)
    4. Key Achievements (list of strings)
    5. Risks/Escalations (list of strings)
    6. Metrics (a JSON object with key-value pairs representing metrics). This MUST
       include a "deliverables_completed" key: the total number of deliverables,
       tickets, or work items the vendor claims are complete to date (integer, 0 if
       not mentioned in the report). Include any other metrics the report mentions
       (e.g. velocity, tickets_closed) alongside it.

    Respond ONLY with a JSON object in this format (no markdown blocks, no prefix/suffix text):
    {{
        \"vendor_name\": \"name\",
        \"reporting_period\": \"period\",
        \"overall_status\": \"Green/Amber/Red\",
        \"key_achievements\": [\"ach1\", \"ach2\"],
        \"risks_escalations\": [\"risk1\"],
        \"metrics\": {{\"deliverables_completed\": 15, \"velocity\": 4.5}}
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
    except Exception:
        parsed = {
            "vendor_name": "Unknown Vendor",
            "reporting_period": "Current Period",
            "overall_status": "Amber",
            "key_achievements": ["Uploaded status report parsed with formatting errors."],
            "risks_escalations": ["Failed to extract structured data from report text."],
            "metrics": {"deliverables_completed": 0}
        }
        
    report = {
        "id": f"REP-{uuid.uuid4().hex[:8]}",
        "demand_id": demand_id,
        "vendor_name": parsed.get("vendor_name", "Unknown Vendor"),
        "reporting_period": parsed.get("reporting_period", "Current Period"),
        "overall_status": parsed.get("overall_status", "Green"),
        "key_achievements": parsed.get("key_achievements", []),
        "risks_escalations": parsed.get("risks_escalations", []),
        "metrics": parsed.get("metrics", {}),
        "parsed_at": datetime.now().isoformat()
    }
    
    db.save_report(report)
    return {"status": "success", "report": report}
