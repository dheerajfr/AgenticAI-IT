from datetime import datetime
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import EnvironmentStateRecord, ReconcileDriftRequest, RecordsHygieneRequest
from database import db
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from llm_client import call_gemini

app = FastAPI(
    title="Config & Environments Service (Stage 05)",
    description="Backend API for drift detection, baseline reconcile, and records hygiene.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_current_time_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

@app.get("/api/environments", response_model=List[EnvironmentStateRecord])
def get_environments():
    """List all environment state records."""
    return db.get_all()

@app.get("/api/environments/{component_id}/{environment}", response_model=EnvironmentStateRecord)
def get_environment(component_id: str, environment: str):
    """Get a specific environment state record."""
    record = db.get_by_id_and_env(component_id, environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")
    return record

@app.post("/api/environments/reconcile-drift", response_model=EnvironmentStateRecord)
def reconcile_drift(req: ReconcileDriftRequest):
    """
    Accepts expected and deployed state payloads, compares them, flags drift if they don't match,
    and saves/returns the updated record.
    """
    drift_status = "in-sync" if req.deployed_version == req.expected_version else "drifted"
    
    record = EnvironmentStateRecord(
        component_id=req.component_id,
        environment=req.environment,
        deployed_version=req.deployed_version,
        expected_version=req.expected_version,
        drift_status=drift_status,
        last_checked=_get_current_time_iso()
    )
    
    db.save(record)
    return record

@app.post("/api/environments/records-hygiene")
def records_hygiene(req: RecordsHygieneRequest):
    """
    Proposes an update to the CMDB (Expected State) based on observed reality (Live Environment).
    Uses Gemini LLM to fuzzy-match the observed name and the CMDB name.
    """
    prompt = f"""
    You are an IT infrastructure expert. We are running a records hygiene check.
    The component is logically identified as: {req.component_id} in {req.environment}.
    
    The physical discovery tool found a live server named: "{req.observed_name}"
    The CMDB (Configuration Management Database) lists the server as: "{req.cmdb_name}"
    
    Determine if these two names refer to the exact same logical server/component despite formatting, abbreviations, or casing differences.
    
    Respond STRICTLY in JSON format:
    {{
        "status": "clean" | "update_proposed" | "unrelated",
        "message": "A 1-sentence explanation of your reasoning.",
        "proposed_action": {{
            "component_id": "{req.component_id}",
            "environment": "{req.environment}",
            "update_cmdb_name_to": "{req.observed_name}"
        }} // Only include proposed_action if status is "update_proposed"
    }}
    
    Use "clean" if they match perfectly.
    Use "update_proposed" if they are the same component but the CMDB has an outdated, messy, or differently formatted name, and propose updating the CMDB to match the physical discovery name.
    Use "unrelated" if they are completely different components.
    """
    
    try:
        result = call_gemini(prompt=prompt, is_json=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
