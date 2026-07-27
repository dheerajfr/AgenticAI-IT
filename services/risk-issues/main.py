import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import random
import urllib.request
import json
from datetime import datetime

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import RiskRequest, IssueRequest, MitigationRequest, RiskRecord
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

def fetch_module_data(demand_id: str):
    """Fetch data from other modules to build a unified context."""
    base_url = "http://127.0.0.1:8000/api"
    context = {}
    
    endpoints = {
        "demand": f"{base_url}/demands/{demand_id}",
        "estimate": f"{base_url}/estimates/{demand_id}",
        "plan": f"{base_url}/plans/{demand_id}",
        "deployments": f"{base_url}/deployments/project/{demand_id}",
        "test_quality": f"{base_url}/test-quality/project/{demand_id}"
    }
    
    for key, url in endpoints.items():
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    context[key] = json.loads(response.read().decode())
        except Exception as e:
            context[key] = {"error": str(e)}
            
    return context

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    if not record:
        now = datetime.now().isoformat()
        record = {
            "id": f"PRJ-RSK-{uuid.uuid4().hex[:6]}",
            "demand_id": demand_id,
            "project_summary": {},
            "health_score": 100,
            "sensing_data": {},
            "risks": [],
            "issues": [],
            "mitigations": [],
            "timeline": [{
                "id": f"TL-{uuid.uuid4().hex[:6]}",
                "timestamp": now,
                "event_type": "Created",
                "description": "Risk & Issues monitoring initialized.",
                "related_id": None
            }]
        }
        db.save(record)
    
    # Always ensure new schema fields exist if upgrading old record
    if "risks" not in record: record["risks"] = []
    if "issues" not in record: record["issues"] = []
    if "mitigations" not in record: record["mitigations"] = []
    if "timeline" not in record: record["timeline"] = []
    if isinstance(record.get("mitigations"), dict):
        record["mitigations"] = []
    if "health_score" not in record: record["health_score"] = 100
        
    return record

@app.get("/api/risk-issues/project/{demand_id}")
def get_risk_issues(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/risk-issues/project/{demand_id}/aggregate")
def aggregate_and_detect(demand_id: str):
    record = _get_or_create(demand_id)
    
    # Fetch external data
    external_data = fetch_module_data(demand_id)
    
    # Update project summary from demand
    demand_data = external_data.get("demand", {})
    if demand_data and "title" in demand_data:
        record["project_summary"] = {
            "title": demand_data.get("title", "Unknown"),
            "customer": demand_data.get("business_unit", "Unknown"),
            "status": demand_data.get("status", "Active")
        }
    
    # AI Risk Detection
    prompt = f"Analyze this project data and identify up to 2 critical risks. Output JSON array of objects with keys: title, description, category, probability (High/Medium/Low), impact (High/Medium/Low), severity (Critical/High/Medium/Low). Project data: {json.dumps(external_data)[:2000]}"
    try:
        ai_res_str = call_gemini(prompt)
        # Parse AI response (basic heuristic for JSON extraction)
        if "```json" in ai_res_str:
            json_str = ai_res_str.split("```json")[1].split("```")[0]
            new_risks = json.loads(json_str)
            for r in new_risks:
                risk_id = f"RSK-{uuid.uuid4().hex[:6]}"
                record["risks"].append({
                    "id": risk_id,
                    "category": r.get("category", "General"),
                    "description": r.get("description", r.get("title", "Detected Risk")),
                    "probability": r.get("probability", "Medium"),
                    "impact": r.get("impact", "Medium"),
                    "severity": r.get("severity", "Medium"),
                    "confidence_score": random.randint(70, 95),
                    "owner": "Unassigned",
                    "ai_recommendation": "",
                    "status": "Open",
                    "created_at": datetime.now().isoformat(),
                    "due_date": ""
                })
                record["timeline"].append({
                    "id": f"TL-{uuid.uuid4().hex[:6]}",
                    "timestamp": datetime.now().isoformat(),
                    "event_type": "Risk Detected",
                    "description": f"AI detected new risk: {r.get('title', 'Unknown')}",
                    "related_id": risk_id
                })
                # Drop health score slightly
                record["health_score"] = max(0, record["health_score"] - 5)
    except Exception as e:
        print(f"AI Risk Detection failed: {e}")
        
    db.save(record)
    return {"status": "success", "record": record}

@app.post("/api/risk-issues/convert")
def convert_risk_to_issue(req: dict):
    demand_id = req.get("demand_id")
    risk_id = req.get("risk_id")
    record = _get_or_create(demand_id)
    
    # Find risk
    risk = next((r for r in record.get("risks", []) if r["id"] == risk_id), None)
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
        
    risk["status"] = "Converted"
    
    issue_id = f"ISSUE-{uuid.uuid4().hex[:6]}"
    issue = {
        "issue_id": issue_id,
        "risk_id": risk_id,
        "description": f"Escalated from Risk: {risk['description']}",
        "rca_result": "",
        "owner": risk["owner"],
        "status": "Open",
        "target_date": "",
        "progress": 0,
        "created_at": datetime.now().isoformat()
    }
    
    record["issues"].append(issue)
    record["timeline"].append({
        "id": f"TL-{uuid.uuid4().hex[:6]}",
        "timestamp": datetime.now().isoformat(),
        "event_type": "Escalated",
        "description": f"Risk {risk_id} escalated to Issue {issue_id}",
        "related_id": issue_id
    })
    
    record["health_score"] = max(0, record["health_score"] - 10)
    db.save(record)
    
    return {"status": "success", "issue": issue, "record": record}

@app.post("/api/risk-issues/rca")
def resolve_issue(req: IssueRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Perform Root Cause Analysis for the following incident in project {req.demand_id}: {req.incident_details}. Suggest a root cause."
    ai_res = call_gemini(prompt)
    
    issue_id = f"ISSUE-{uuid.uuid4().hex[:4]}"
    issue = {
        "issue_id": issue_id,
        "description": req.incident_details,
        "rca_result": ai_res,
        "owner": "Unassigned",
        "status": "Open",
        "target_date": "",
        "progress": 0,
        "created_at": datetime.now().isoformat()
    }
    
    record["issues"].append(issue)
    record["timeline"].append({
        "id": f"TL-{uuid.uuid4().hex[:6]}",
        "timestamp": datetime.now().isoformat(),
        "event_type": "Created",
        "description": f"New issue created: {issue_id}",
        "related_id": issue_id
    })
    
    db.save(record)
    return {"status": "success", "issue": issue, "record": record}

@app.post("/api/risk-issues/mitigate")
def draft_mitigation(req: MitigationRequest):
    record = _get_or_create(req.demand_id)
    
    prompt = f"Draft a mitigation plan for risk ID {req.risk_id} in project {req.demand_id} based on similar past risks."
    ai_res = call_gemini(prompt)
    
    mit_id = f"MIT-{uuid.uuid4().hex[:6]}"
    mitigation = {
        "id": mit_id,
        "risk_id": req.risk_id,
        "description": ai_res,
        "owner": "AI Agent",
        "status": "Pending",
        "progress": 0,
        "due_date": ""
    }
    
    record["mitigations"].append(mitigation)
    record["timeline"].append({
        "id": f"TL-{uuid.uuid4().hex[:6]}",
        "timestamp": datetime.now().isoformat(),
        "event_type": "Mitigation Suggested",
        "description": f"AI suggested mitigation for {req.risk_id}",
        "related_id": mit_id
    })
    
    db.save(record)
    return {"status": "success", "mitigation": mitigation, "record": record}
