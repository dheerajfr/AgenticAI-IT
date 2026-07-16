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
    VerifyReadinessRequest,
    SeedEnvironmentRequest,
    UpdateEnvironmentRequest
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

@app.get("/api/environments/demand-ids")
def get_demand_ids():
    """Return unique demand IDs that have environment records."""
    records = db.get_all()
    ids = sorted(list({r.demand_id for r in records}))
    return {"demand_ids": ids}

@app.get("/api/environments/{demand_id}", response_model=List[EnvironmentStateRecord])
def get_environments_by_demand(demand_id: str):
    """Get all environment records for a given demand ID."""
    records = db.get_by_demand_id(demand_id)
    if not records:
        raise HTTPException(status_code=404, detail="No environment records found for this demand ID.")
    return records

@app.get("/api/environments/{demand_id}/{environment}", response_model=EnvironmentStateRecord)
def get_environment(demand_id: str, environment: str):
    """Get a specific environment state record by demand ID and environment."""
    record = db.get_by_demand_and_env(demand_id, environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")
    return record

@app.put("/api/environments/{demand_id}/{environment}", response_model=EnvironmentStateRecord)
def update_environment(demand_id: str, environment: str, req: UpdateEnvironmentRequest):
    """Update a specific environment record (human-configured edits)."""
    record = db.get_by_demand_and_env(demand_id, environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")
    if req.deployed_version is not None:
        record.deployed_version = req.deployed_version
    if req.expected_version is not None:
        record.expected_version = req.expected_version
    if req.observed_name is not None:
        record.observed_name = req.observed_name
    if req.cmdb_name is not None:
        record.cmdb_name = req.cmdb_name
    if req.expected_requirements is not None:
        record.expected_requirements = req.expected_requirements
    if req.observed_requirements is not None:
        record.observed_requirements = req.observed_requirements
    # Recompute drift status after edits
    if record.deployed_version == record.expected_version:
        record.drift_status = "in-sync"
    else:
        record.drift_status = "drifted"
    record.last_checked = _get_current_time_iso()
    db.save(record)
    return record

@app.post("/api/environments/seed", response_model=List[EnvironmentStateRecord])
def seed_environments(req: SeedEnvironmentRequest):
    """
    One-time LLM-driven generation of environment config records for a demand ID.
    Fetches the business_case_summary from demand-intake and uses the LLM to derive
    realistic expected versions, CMDB names, and requirements.
    Raises 409 if records already exist for this demand.
    """
    existing = db.get_by_demand_id(req.demand_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Environment records already exist for {req.demand_id}. Use the edit (✎) controls to update individual fields."
        )

    # Try to fetch business summary from demand-intake
    business_summary = None
    demand_title = req.demand_id
    try:
        import urllib.request
        url = "http://127.0.0.1:8000/api/demands"
        with urllib.request.urlopen(url, timeout=3) as resp:
            import json as _json
            demands = _json.loads(resp.read())
            for d in demands:
                if d.get("demand_id") == req.demand_id:
                    business_summary = d.get("business_case_summary") or d.get("description")
                    demand_title = d.get("title", req.demand_id)
                    break
    except Exception:
        pass  # Gracefully fall back if demand service unavailable

    context = f"Demand ID: {req.demand_id}\nTitle: {demand_title}"
    if business_summary:
        context += f"\nBusiness Summary: {business_summary}"

    prompt = f"""
You are an IT configuration management expert. Based on the following demand, generate realistic environment baseline configuration data for a software delivery pipeline.

{context}

Generate expected (baseline) configuration data for these 4 environments: dev, test, staging, prod.

Rules:
- Use realistic semantic versioning (e.g. 1.x.y). Prod should be the most stable (lowest version). Dev should have the latest target version.
- Do NOT include deployed versions — we only know what the baseline EXPECTS, not what has been deployed yet.
- Generate 2-4 realistic expected_requirements based on what this kind of system would need (e.g. databases, caches, auth services, message queues, external APIs, etc.).
- Generate realistic CMDB server names based on the demand title (short kebab-case, e.g. svc-loyalty-api-prod-svr-01).

Respond STRICTLY in JSON with this structure:
{{
  "service_name": "short-kebab-name",
  "environments": {{
    "dev": {{
      "expected_version": "...",
      "cmdb_name": "...",
      "expected_requirements": ["...", "..."]
    }},
    "test": {{
      "expected_version": "...",
      "cmdb_name": "...",
      "expected_requirements": ["...", "..."]
    }},
    "staging": {{
      "expected_version": "...",
      "cmdb_name": "...",
      "expected_requirements": ["...", "..."]
    }},
    "prod": {{
      "expected_version": "...",
      "cmdb_name": "...",
      "expected_requirements": ["...", "..."]
    }}
  }}
}}
"""

    try:
        llm_result = call_gemini(prompt=prompt, is_json=True)
        env_data = llm_result.get("environments", {})
    except Exception as e:
        # Fallback to deterministic defaults if LLM fails
        svc = req.demand_id.lower().replace("-", "_")
        env_data = {
            "dev":     {"expected_version": "2.0.0", "cmdb_name": f"svc-{svc}-dev-svr-01",     "expected_requirements": ["db-dev", "cache-dev", "auth-service"]},
            "test":    {"expected_version": "2.0.0", "cmdb_name": f"svc-{svc}-test-svr-01",    "expected_requirements": ["db-test", "cache-test", "auth-service"]},
            "staging": {"expected_version": "1.8.0", "cmdb_name": f"svc-{svc}-staging-svr-01", "expected_requirements": ["db-staging", "cache-staging", "auth-service"]},
            "prod":    {"expected_version": "1.7.3", "cmdb_name": f"svc-{svc}-prod-svr-01",    "expected_requirements": ["db-prod", "cache-prod", "auth-service"]},
        }

    created = []
    for env in ["dev", "test", "staging", "prod"]:
        cfg = env_data.get(env, {})
        expected = cfg.get("expected_version", "1.0.0")
        record = EnvironmentStateRecord(
            demand_id=req.demand_id,
            environment=env,
            # Start fully in-sync by default based on the new baseline
            deployed_version=expected,
            expected_version=expected,
            drift_status="in-sync",          # Start in-sync by default
            last_checked=_get_current_time_iso(),
            observed_name=cfg.get("cmdb_name", f"svc-{req.demand_id.lower()}-{env}-svr-01"),
            cmdb_name=cfg.get("cmdb_name", f"svc-{req.demand_id.lower()}-{env}-svr-01"),
            expected_requirements=cfg.get("expected_requirements", []),
            observed_requirements=cfg.get("expected_requirements", [])  # Keep them in-sync by default
        )
        db.save(record)
        created.append(record)
    return created


@app.delete("/api/environments/{demand_id}")
def delete_demand_environments(demand_id: str):
    """Delete all environment records for a demand ID."""
    db.delete_by_demand_id(demand_id)
    return {"message": f"All environment records for {demand_id} deleted."}



@app.post("/api/environments/reconcile-drift", response_model=EnvironmentStateRecord)
def reconcile_drift(req: ReconcileDriftRequest):
    """
    Accepts expected and deployed state payloads, compares them, flags drift if they don't match,
    and saves/returns the updated record.
    """
    record = db.get_by_demand_and_env(req.demand_id, req.environment)
    drift_status = "in-sync" if req.deployed_version == req.expected_version else "drifted"
    
    if record:
        record.deployed_version = req.deployed_version
        record.expected_version = req.expected_version
        record.drift_status = drift_status
        record.last_checked = _get_current_time_iso()
    else:
        record = EnvironmentStateRecord(
            demand_id=req.demand_id,
            environment=req.environment,
            deployed_version=req.deployed_version,
            expected_version=req.expected_version,
            drift_status=drift_status,
            last_checked=_get_current_time_iso(),
            observed_name=None,
            cmdb_name=None
        )
        
    db.save(record)
    return record

@app.post("/api/environments/records-hygiene")
def records_hygiene(req: RecordsHygieneRequest):
    """
    Proposes an update to the CMDB (Expected State) based on observed reality (Live Environment).
    Uses Gemini LLM to fuzzy-match the observed name and the CMDB name.
    """
    record = db.get_by_demand_and_env(req.demand_id, req.environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")

    prompt = f"""
    You are an IT infrastructure expert. We are running a records hygiene check.
    The demand is logically identified as: {req.demand_id} in {req.environment}.
    
    The physical discovery tool found a live server named: "{record.observed_name}"
    The CMDB (Configuration Management Database) lists the server as: "{record.cmdb_name}"
    
    Determine if these two names refer to the exact same logical server/component despite formatting, abbreviations, or casing differences.
    
    Respond STRICTLY in JSON format:
    {{
        "status": "clean" | "update_proposed" | "unrelated",
        "message": "A 1-sentence explanation of your reasoning.",
        "proposed_action": {{
            "demand_id": "{req.demand_id}",
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
    record = db.get_by_demand_and_env(req.demand_id, req.environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")
    record.cmdb_name = req.new_cmdb_name
    db.save(record)
    return record

@app.post("/api/environments/auto-remediate", response_model=EnvironmentStateRecord)
def auto_remediate(req: AutoRemediateRequest):
    record = db.get_by_demand_and_env(req.demand_id, req.environment)
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
    source_record = db.get_by_demand_and_env(req.demand_id, req.source_environment)
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
        
    target_record = db.get_by_demand_and_env(req.demand_id, target_env)
    
    if target_record:
        target_record.expected_version = source_record.expected_version
        target_record.drift_status = "in-sync" if target_record.deployed_version == target_record.expected_version else "drifted"
        target_record.last_checked = _get_current_time_iso()
    else:
        target_record = EnvironmentStateRecord(
            demand_id=req.demand_id,
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
    record = db.get_by_demand_and_env(req.demand_id, req.environment)
    if not record:
        raise HTTPException(status_code=404, detail="Environment record not found.")

    issues = []
    for expected in record.expected_requirements:
        if expected not in record.observed_requirements:
            issues.append(f"Requirement '{expected}' is missing or not satisfied in {req.environment}.")
            
    if issues:
        return {"ready": False, "issues": issues}
    return {"ready": True, "issues": []}

import json

@app.post("/api/environments/export")
def export_environments():
    records = db.get_all()
    
    export_dir = os.path.join(os.path.dirname(__file__), 'exports')
    os.makedirs(export_dir, exist_ok=True)
    
    demands_data = {}
    
    for r in records:
        if r.demand_id not in demands_data:
            demands_data[r.demand_id] = {
                "demand_id": r.demand_id,
                "exported_at": _get_current_time_iso(),
                "environments": {}
            }
            
        demands_data[r.demand_id]["environments"][r.environment] = {
            "expected_version": r.expected_version,
            "deployed_version": r.deployed_version,
            "drift_status": r.drift_status,
            "cmdb_name": r.cmdb_name,
            "observed_name": r.observed_name
        }
        
    exported_files = []
    for demand_id, data in demands_data.items():
        file_path = os.path.join(export_dir, f"{demand_id}.json")
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        exported_files.append(f"exports/{demand_id}.json")
        
    return {"message": "Export successful", "files": exported_files}
