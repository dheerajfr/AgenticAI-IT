from datetime import datetime
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    EnvironmentStateRecord, 
    ReconcileDriftRequest, 
    RecordsHygieneRequest,
    ApplyHygieneFixRequest,
    AutoRemediateRequest,
    PromoteEnvironmentRequest,
    VerifyReadinessRequest
)
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
    existing_record = db.get_by_id_and_env(req.component_id, req.environment)
    
    drift_status = "in-sync" if req.deployed_version == req.expected_version else "drifted"
    
    record = EnvironmentStateRecord(
        component_id=req.component_id,
        environment=req.environment,
        deployed_version=req.deployed_version,
        expected_version=req.expected_version,
        drift_status=drift_status,
        last_checked=_get_current_time_iso(),
        observed_name=existing_record.observed_name if existing_record else None,
        cmdb_name=existing_record.cmdb_name if existing_record else None
    )
    
    db.save(record)
    return record

@app.post("/api/environments/records-hygiene")
def records_hygiene(req: RecordsHygieneRequest):
    """
    Proposes an update to the CMDB (Expected State) based on observed reality (Live Environment).
    Uses Gemini LLM to fuzzy-match the observed name and the CMDB name.
    """
    record = db.get_by_id_and_env(req.component_id, req.environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")

    prompt = f"""
    You are an IT infrastructure expert. We are running a records hygiene check.
    The component is logically identified as: {req.component_id} in {req.environment}.
    
    The physical discovery tool found a live server named: "{record.observed_name}"
    The CMDB (Configuration Management Database) lists the server as: "{record.cmdb_name}"
    
    Determine if these two names refer to the exact same logical server/component despite formatting, abbreviations, or casing differences.
    
    Respond STRICTLY in JSON format:
    {{
        "status": "clean" | "update_proposed" | "unrelated",
        "message": "A 1-sentence explanation of your reasoning.",
        "proposed_action": {{
            "component_id": "{req.component_id}",
            "environment": "{req.environment}",
            "update_cmdb_name_to": "{record.observed_name}"
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

@app.post("/api/environments/apply-hygiene-fix", response_model=EnvironmentStateRecord)
def apply_hygiene_fix(req: ApplyHygieneFixRequest):
    record = db.get_by_id_and_env(req.component_id, req.environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")
    record.cmdb_name = req.new_cmdb_name
    db.save(record)
    return record

@app.post("/api/environments/auto-remediate", response_model=EnvironmentStateRecord)
def auto_remediate(req: AutoRemediateRequest):
    record = db.get_by_id_and_env(req.component_id, req.environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")
    if record.drift_status == "drifted":
        record.deployed_version = record.expected_version
        record.drift_status = "in-sync"
        record.last_checked = _get_current_time_iso()
        db.save(record)
    return record

@app.post("/api/environments/promote", response_model=EnvironmentStateRecord)
def promote_environment(req: PromoteEnvironmentRequest):
    source_record = db.get_by_id_and_env(req.component_id, req.source_environment)
    if not source_record:
        raise HTTPException(status_code=404, detail="Source environment record not found.")
    if source_record.drift_status != "in-sync":
        raise HTTPException(status_code=400, detail="Source environment must be in-sync to promote.")
        
    env_order = ["dev", "test", "staging", "prod"]
    try:
        current_idx = env_order.index(req.source_environment)
        target_env = env_order[current_idx + 1]
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Cannot promote from this environment.")
        
    target_record = db.get_by_id_and_env(req.component_id, target_env)
    
    if target_record:
        target_record.expected_version = source_record.expected_version
        target_record.drift_status = "in-sync" if target_record.deployed_version == target_record.expected_version else "drifted"
        target_record.last_checked = _get_current_time_iso()
    else:
        target_record = EnvironmentStateRecord(
            component_id=req.component_id,
            environment=target_env,
            deployed_version="none",
            expected_version=source_record.expected_version,
            drift_status="drifted",
            last_checked=_get_current_time_iso()
        )
    
    db.save(target_record)
    return target_record

@app.post("/api/environments/verify-readiness")
def verify_readiness(req: VerifyReadinessRequest):
    issues = []
    # Evaluate the list of requirements for the software version to satisfy
    for req_item in req.dependent_component_ids:
        # Simulate missing requirements in specific environments
        if req.environment == 'test' and 'Schema' in req_item:
            issues.append(f"Requirement '{req_item}' is not satisfied in {req.environment}.")
        if req.environment == 'staging' and 'IAM' in req_item:
            issues.append(f"Requirement '{req_item}' is missing or improperly configured in {req.environment}.")
            
    if issues:
        return {"ready": False, "issues": issues}
    return {"ready": True, "issues": []}

import json

@app.post("/api/environments/export")
def export_environments():
    records = db.get_all()
    
    export_dir = os.path.join(os.path.dirname(__file__), 'exports')
    os.makedirs(export_dir, exist_ok=True)
    
    components_data = {}
    
    for r in records:
        if r.component_id not in components_data:
            components_data[r.component_id] = {
                "component_id": r.component_id,
                "exported_at": _get_current_time_iso(),
                "environments": {}
            }
            
        components_data[r.component_id]["environments"][r.environment] = {
            "expected_version": r.expected_version,
            "deployed_version": r.deployed_version,
            "drift_status": r.drift_status,
            "cmdb_name": r.cmdb_name,
            "observed_name": r.observed_name
        }
        
    exported_files = []
    for comp_id, data in components_data.items():
        file_path = os.path.join(export_dir, f"{comp_id}.json")
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        exported_files.append(f"exports/{comp_id}.json")
        
    return {"message": "Export successful", "files": exported_files}






