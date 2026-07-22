import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid

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

@app.post("/api/reporting-communication/generate-summary")
def generate_summary(req: ReportRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Write an executive summary report for project {req.demand_id} tailored for a {req.audience} audience. Aggregate status across all modules."
    ai_res = call_gemini(prompt)
    
    record["exec_summary"] = {
        "audience": req.audience,
        "content": ai_res
    }
    db.save(record)
    
    return {"status": "success", "summary": record["exec_summary"], "record": record}

@app.post("/api/reporting-communication/draft-comm")
def draft_comm(req: CommRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Draft an email for {req.comm_type} regarding project {req.demand_id}."
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
