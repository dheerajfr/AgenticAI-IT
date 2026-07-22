import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import random

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import RiskRequest, IssueRequest, MitigationRequest
from database import db
from llm_client import call_gemini

app = FastAPI(title="Risk & Issues Service (Always-on)")

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
            "id": f"RSK-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "sensing_data": {
                "schedule_drift_days": random.randint(0, 5),
                "cost_overrun_pct": random.uniform(0.0, 5.0),
                "quality_risk_score": random.randint(1, 10)
            },
            "issues": [],
            "mitigations": {}
        }
        db.save(record)
    return record

@app.get("/api/risk-issues/project/{demand_id}")
def get_risk_issues(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/risk-issues/rca")
def resolve_issue(req: IssueRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Perform Root Cause Analysis for the following incident in project {req.demand_id}: {req.incident_details}. Suggest a root cause."
    ai_res = call_gemini(prompt)
    
    issue = {
        "issue_id": f"ISSUE-{uuid.uuid4().hex[:4]}",
        "description": req.incident_details,
        "rca_result": ai_res
    }
    
    issues = record.get("issues", [])
    issues.append(issue)
    record["issues"] = issues
    db.save(record)
    
    return {"status": "success", "issue": issue, "record": record}

@app.post("/api/risk-issues/mitigate")
def draft_mitigation(req: MitigationRequest):
    record = _get_or_create(req.demand_id)
    
    prompt = f"Draft a mitigation plan for risk ID {req.risk_id} in project {req.demand_id} based on similar past risks."
    ai_res = call_gemini(prompt)
    
    mitigations = record.get("mitigations", {})
    mitigations[req.risk_id] = ai_res
    record["mitigations"] = mitigations
    db.save(record)
    
    return {"status": "success", "mitigation": ai_res, "record": record}
