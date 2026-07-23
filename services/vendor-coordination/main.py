import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import random

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import VendorRequest, SOWCheckRequest
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
    if not record:
        record = {
            "id": f"VND-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "sla_tracking": {
                "vendor_claims": random.randint(10, 20),
                "actual_outputs": random.randint(5, 15),
                "reconciliation_status": "in_progress"
            },
            "sow_discrepancies": [],
            "access_alerts": [
                {"user": "vendor_contractor_1", "last_active": "45 days ago", "action": "recommend_revoke"}
            ]
        }
        db.save(record)
    return record

@app.get("/api/vendor-coordination/project/{demand_id}")
def get_vendor_coordination(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/vendor-coordination/check-sow")
def check_sow(req: SOWCheckRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Check for discrepancies between SOW {req.sow_document_id} and the actual PM tool deliverables for project {req.demand_id}."
    ai_res = call_gemini(prompt)
    
    disc = {
        "id": f"DISC-{uuid.uuid4().hex[:4]}",
        "description": "Missing UI component deliverables in PM tool vs SOW.",
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
