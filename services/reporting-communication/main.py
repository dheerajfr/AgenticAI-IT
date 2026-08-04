import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import requests
import json
from datetime import datetime

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import ReportRequest, CommRequest, MeetingTranscriptRequest, MeetingActionUpdateRequest
from database import db, meeting_actions_db
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

        res_risk = requests.get(f"{base_url}/risk-issues/project/{demand_id}")
        if res_risk.status_code == 200:
            context_data['risk_issues'] = res_risk.json()

        res_budget = requests.get(f"{base_url}/budget-cost/project/{demand_id}")
        if res_budget.status_code == 200:
            context_data['budget_cost'] = res_budget.json()

        res_burn = requests.get(f"{base_url}/budget-cost/burn/{demand_id}")
        if res_burn.status_code == 200:
            context_data['budget_burn'] = res_burn.json()

    except Exception as e:
        context_data['fetch_error'] = str(e)
        print(f"Error fetching cross-module context: {e}")
        
    return json.dumps(context_data, indent=2)

@app.post("/api/reporting-communication/generate-summary")
def generate_summary(req: ReportRequest):
    record = _get_or_create(req.demand_id)
    project_context = fetch_project_context(req.demand_id)
    prompt = (
        f"Write an executive summary report for project {req.demand_id} tailored for a {req.audience} audience.\n\n"
        f"Use the following real-time project data, including RAID data (risk_issues: risks, issues, mitigations, health_score) "
        f"and finance data (budget_cost: cost estimation, ROI; budget_burn: actuals, forecast, variance, narrative):\n{project_context}\n\n"
        f"Aggregate the status across all modules and highlight critical paths and risks based strictly on the provided data. "
        f"Explicitly synthesize the RAID data and finance data into the narrative — don't just restate facts, explain the 'so what' "
        f"(e.g. what open risks or budget variance mean for delivery confidence and next steps).\n\n"
        f"Finally, anticipate 2-3 likely questions this {req.audience} audience would ask after reading this report, and give brief, "
        f"pre-emptive answers to each grounded strictly in the provided data. Present these under a clearly labeled "
        f"'Anticipated Questions' section at the end of the report.\n\n"
        f"IMPORTANT: Output only clean plain text. Do not use any markdown formatting, asterisks, hashes, or special symbols. "
        f"Use standard newlines and regular text formatting."
    )
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
    
    prompt = f"""Draft an email for {req.comm_type} regarding project {req.demand_id}, tailored for a {req.audience} audience.

Context Data:
{project_context}

Ensure the communication accurately reflects the factual statuses and metrics contained in the Context Data.
Tailor the tone, level of technical detail, and specific concerns addressed to the {req.audience} audience, the same way the executive summary report for this project is tailored per-audience (e.g. an executive/CIO audience cares about business impact, risk exposure and budget; a technical lead audience cares about implementation and quality detail; a business owner audience cares about scope, timeline and user impact).
CRITICAL INSTRUCTION: Do NOT use literal bracketed placeholders like [Your Name], [Company Name], [Contact Info], etc. anywhere in the output. The sender signature MUST be '{submitted_by}'. For any other missing details (like recipients), invent a realistic corporate name or role. The final output MUST look like a completely finished email."""
    ai_res = call_gemini(prompt)

    comm = {
        "id": f"COMM-{uuid.uuid4().hex[:4]}",
        "type": req.comm_type,
        "content": ai_res,
        "status": "draft",
        "audience": req.audience
    }
    
    comms = record.get("communications", [])
    comms.append(comm)
    record["communications"] = comms
    db.save(record)

    return {"status": "success", "communication": comm, "record": record}

# ── Meeting Actions (transcript -> decisions/action items) ────────────────────

@app.get("/api/reporting-communication/meeting-actions/{demand_id}")
def list_meeting_actions(demand_id: str):
    return {"actions": meeting_actions_db.get_by_demand(demand_id)}

@app.post("/api/reporting-communication/meeting-actions")
def extract_meeting_actions(req: MeetingTranscriptRequest):
    prompt = f"""You are an assistant that extracts decisions and action items from a meeting transcript for project {req.demand_id}.

Meeting Transcript:
{req.transcript}

Analyze the transcript and identify:
1. Key decisions made during the meeting.
2. Action items assigned to specific owners.

Respond ONLY with a JSON array of objects (no markdown blocks, no prefix/suffix text). Each object must have keys:
- "type": either "decision" or "action_item"
- "description": a concise description of the decision or action
- "owner": the person or role responsible (use "Unassigned" if not mentioned in the transcript)
- "due_date": a due date in YYYY-MM-DD format if mentioned, else an empty string
"""
    ai_res_str = call_gemini(prompt)

    cleaned = ai_res_str.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        extracted = json.loads(cleaned)
        if not isinstance(extracted, list):
            extracted = []
    except Exception as e:
        print(f"Failed to parse meeting action extraction: {e}")
        extracted = []

    created_actions = []
    for item in extracted:
        if not isinstance(item, dict):
            continue
        action = {
            "id": f"MTG-{uuid.uuid4().hex[:8]}",
            "demand_id": req.demand_id,
            "type": item.get("type", "action_item"),
            "description": item.get("description", ""),
            "owner": item.get("owner", "Unassigned"),
            "status": "Open",
            "due_date": item.get("due_date", ""),
            "created_at": datetime.utcnow().isoformat()
        }
        meeting_actions_db.save(action)
        created_actions.append(action)

    return {"status": "success", "actions": created_actions}

@app.patch("/api/reporting-communication/meeting-actions/{action_id}")
def update_meeting_action(action_id: str, req: MeetingActionUpdateRequest):
    action = meeting_actions_db.get_by_id(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Meeting action not found")

    if req.status is not None:
        action["status"] = req.status
    if req.owner is not None:
        action["owner"] = req.owner

    meeting_actions_db.save(action)
    return {"status": "success", "action": action}
