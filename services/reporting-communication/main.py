import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import requests
import json

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import ReportRequest, CommRequest
from database import db
from llm_client import call_gemini

app = FastAPI(title="Reporting & Communication Service (Always-on)")

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
            "id": f"REP-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "exec_summary": None,
            "communications": []
        }
        db.save(record)
    return record

@app.get("/api/reporting-communication/project/{demand_id}")
def get_reports(demand_id: str):
    record = _get_or_create(demand_id)
    return record

def fetch_project_context(demand_id: str) -> str:
    base_url = "http://127.0.0.1:8000/api"
    context_data = {"demand_id": demand_id}
    try:
        res_demand = requests.get(f"{base_url}/demands")
        if res_demand.status_code == 200:
            context_data['demand'] = next((d for d in res_demand.json() if d.get('demand_id') == demand_id), None)
            
        res_est = requests.get(f"{base_url}/estimates")
        if res_est.status_code == 200:
            context_data['estimate'] = next((e for e in res_est.json() if e.get('demand_id') == demand_id), None)
            
        res_plan = requests.get(f"{base_url}/plans")
        if res_plan.status_code == 200:
            context_data['plan'] = next((p for p in res_plan.json() if p.get('demand_id') == demand_id), None)
            
        res_env = requests.get(f"{base_url}/environments/{demand_id}")
        if res_env.status_code == 200:
            context_data['environments'] = res_env.json()
            
        res_tq = requests.get(f"{base_url}/test-quality/relational/quality_gate/{demand_id}")
        if res_tq.status_code == 200:
            tqs = res_tq.json()
            if tqs and len(tqs) > 0:
                context_data['test_quality'] = tqs[0]

        res_rel = requests.get(f"{base_url}/release-change/releases")
        if res_rel.status_code == 200:
            context_data['releases'] = [r for r in res_rel.json() if r.get('demand_id') == demand_id]
            
    except Exception as e:
        context_data['fetch_error'] = str(e)
        print(f"Error fetching cross-module context: {e}")
        
    return json.dumps(context_data, indent=2)

@app.post("/api/reporting-communication/generate-summary")
def generate_summary(req: ReportRequest):
    record = _get_or_create(req.demand_id)
    project_context = fetch_project_context(req.demand_id)
    prompt = f"Write an executive summary report for project {req.demand_id} tailored for a {req.audience} audience.\n\nUse the following real-time project data:\n{project_context}\n\nAggregate the status across all modules and highlight critical paths and risks based strictly on the provided data."
    ai_res = call_gemini(prompt)
    
    summary_obj = {
        "type": f"Exec_Summary_{req.audience}",
        "status": "generated",
        "content": ai_res,
        "audience": req.audience
    }
    record["exec_summary"] = summary_obj
    record["communications"].append(summary_obj)
    db.save(record)
    
    return {"status": "success", "summary": record["exec_summary"], "record": record}

@app.post("/api/reporting-communication/draft-comm")
def draft_comm(req: CommRequest):
    record = _get_or_create(req.demand_id)
    project_context = fetch_project_context(req.demand_id)
    context_dict = json.loads(project_context) if project_context else {}
    submitted_by = context_dict.get('demand', {}).get('submitted_by', 'Project Manager')
    
    prompt = f"""Draft an email for {req.comm_type} regarding project {req.demand_id}.

Context Data:
{project_context}

Ensure the communication accurately reflects the factual statuses and metrics contained in the Context Data.
CRITICAL INSTRUCTION: Do NOT use literal bracketed placeholders like [Your Name], [Company Name], [Contact Info], etc. anywhere in the output. The sender signature MUST be '{submitted_by}'. For any other missing details (like recipients), invent a realistic corporate name or role. The final output MUST look like a completely finished email."""
    ai_res = call_gemini(prompt)
    
    comm = {
        "id": f"COMM-{uuid.uuid4().hex[:4]}",
        "type": req.comm_type,
        "content": ai_res,
        "status": "draft"
    }
    
    comms = record.get("communications", [])
    comms.append(comm)
    record["communications"] = comms
    db.save(record)
    
    return {"status": "success", "communication": comm, "record": record}
