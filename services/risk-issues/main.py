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
    
    # Direct access endpoints
    direct = {
        "demand": f"{base_url}/demands/{demand_id}",
        "test_quality": f"{base_url}/test-quality/consolidated/{demand_id}",
        "release_change": f"{base_url}/release-change/quality-summary/{demand_id}"
    }
    
    for key, url in direct.items():
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    context[key] = json.loads(response.read().decode())
        except Exception as e:
            context[key] = {"error": str(e)}

    # List endpoints to filter
    list_endpoints = {
        "estimate": f"{base_url}/estimates",
        "plan": f"{base_url}/plans",
        "dependencies": f"{base_url}/dependencies",
        "config_environments": f"{base_url}/environments",
        "deployments": f"{base_url}/deployments/info"
    }
    
    for key, url in list_endpoints.items():
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    if isinstance(data, list):
                        # Filter by demand_id existence anywhere in the record text representation
                        filtered = [d for d in data if str(d).find(demand_id) != -1]
                        context[key] = filtered[0] if len(filtered) == 1 else filtered
                    else:
                        context[key] = data
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
        
    # --- Auto-Sync Issues & Timeline from external data ---
    
    # 1. Sync Test Quality Defects as Issues
    tq_data = external_data.get("test_quality", {})
    if isinstance(tq_data, dict):
        # Sync defects
        defect_triage = tq_data.get("defect_triage") or {}
        defects = defect_triage.get("triaged_defects", []) if isinstance(defect_triage, dict) else []
        for d in defects:
            issue_id = f"ISS-DEFECT-{d.get('defect_id')}"
            if not any(iss["issue_id"] == issue_id for iss in record["issues"]):
                record["issues"].append({
                    "issue_id": issue_id,
                    "risk_id": None,
                    "description": f"Test Defect ({d.get('severity')}): {d.get('cluster', 'Testing Issue')}",
                    "rca_result": d.get("root_cause_hint", ""),
                    "owner": d.get("assigned_to", "QA"),
                    "status": "Open",
                    "target_date": "",
                    "progress": 0,
                    "related_tasks": [],
                    "related_sprint": "",
                    "assigned_employees": [d.get("assigned_to", "QA")],
                    "dependencies": [],
                    "test_failures": [d.get("defect_id", "")],
                    "build_failures": [],
                    "release_info": "",
                    "environment_details": "",
                    "created_at": datetime.now().isoformat()
                })
                record["timeline"].append({
                    "id": f"TL-{uuid.uuid4().hex[:6]}",
                    "timestamp": datetime.now().isoformat(),
                    "event_type": "Issue Synced",
                    "description": f"Synced defect {d.get('defect_id')} from Test & Quality.",
                    "related_id": issue_id
                })
                
        # Sync Security Findings as Risks
        security_testing = tq_data.get("security_testing") or {}
        findings = security_testing.get("findings", []) if isinstance(security_testing, dict) else []
        for f in findings:
            rsk_id = f"RSK-SEC-{f.get('finding_id')}"
            if not any(r["id"] == rsk_id for r in record["risks"]):
                record["risks"].append({
                    "id": rsk_id,
                    "category": "Security",
                    "description": f"Security Vulnerability: {f.get('category')} at {f.get('location')}",
                    "probability": "High",
                    "impact": "High" if f.get('severity') == "high" else "Medium",
                    "severity": f.get('severity', "medium").capitalize(),
                    "risk_score": 85 if f.get('severity') == "high" else 50,
                    "confidence_score": 100,
                    "owner": "Security Team",
                    "related_module": "Test & Quality",
                    "linked_tasks": [],
                    "suggested_mitigation": f.get("draft_fix", ""),
                    "expected_resolution_date": "",
                    "root_cause_analysis": "Automated SAST/DAST Scan",
                    "ai_recommendation": "Address before release.",
                    "status": "Open",
                    "created_at": datetime.now().isoformat(),
                    "due_date": ""
                })

    # 2. Sync Dependency Blockers as Risks or Issues
    deps = external_data.get("dependencies", [])
    if isinstance(deps, list):
        for dep in deps:
            if isinstance(dep, dict):
                # Map to Timeline
                hist = dep.get("activity_history", [])
                for idx, h in enumerate(hist):
                    tl_id = f"TL-DEP-{dep.get('dependency_id')}-{idx}"
                    if not any(t.get("related_id") == tl_id for t in record["timeline"]):
                        record["timeline"].append({
                            "id": f"TL-{uuid.uuid4().hex[:6]}",
                            "timestamp": dep.get("last_updated", datetime.now().isoformat()),
                            "event_type": "Dependency Update",
                            "description": h,
                            "related_id": tl_id
                        })
                
                if dep.get("status") == "blocked":
                    rsk_id = f"RSK-DEP-{dep.get('dependency_id')}"
                    if not any(r["id"] == rsk_id for r in record["risks"]):
                        record["risks"].append({
                            "id": rsk_id,
                            "category": "Schedule",
                            "description": f"Dependency Blocker: {dep.get('source_task_id')} -> {dep.get('target_task_id')}",
                            "severity": "High",
                            "risk_score": 80,
                            "confidence_score": 90,
                            "owner": dep.get("owner", "Unassigned"),
                            "related_module": "Dependencies",
                            "status": "Open",
                            "created_at": datetime.now().isoformat()
                        })

    # 3. Sync Plan Tasks into Timeline
    plan_data = external_data.get("plan", {})
    if isinstance(plan_data, dict):
        tasks = plan_data.get("tasks", [])
        for t in tasks:
            tl_id = f"TL-TSK-{t.get('task_id')}"
            if not any(tl.get("related_id") == tl_id for tl in record["timeline"]):
                record["timeline"].append({
                    "id": f"TL-{uuid.uuid4().hex[:6]}",
                    "timestamp": t.get("start_date", datetime.now().isoformat()) + "T00:00:00",
                    "event_type": "Plan Task Scheduled",
                    "description": f"Task '{t.get('name')}' scheduled from {t.get('start_date')} to {t.get('end_date')} (Owner: {t.get('owner')})",
                    "related_id": tl_id
                })

    # 4. Sync Demand Events into Timeline
    if demand_data:
        tl_id = f"TL-DEM-{demand_id}"
        if not any(tl.get("related_id") == tl_id for tl in record["timeline"]):
            record["timeline"].append({
                "id": f"TL-{uuid.uuid4().hex[:6]}",
                "timestamp": demand_data.get("created_at", datetime.now().isoformat()),
                "event_type": "Project Intake",
                "description": f"Demand '{demand_data.get('title')}' created by {demand_data.get('business_unit')}.",
                "related_id": tl_id
            })
    
    # AI Risk Detection
    prompt = (
        f"Analyze this project data and identify up to 3 critical/high risks. "
        f"Output a JSON array of objects with keys: title, description, category (e.g. Schedule, Resource, Quality, Security), "
        f"probability (High/Medium/Low), impact (High/Medium/Low), severity (Critical/High/Medium/Low), "
        f"risk_score (0-100), confidence_score (0-100), owner (e.g. Project Manager, Tech Lead), "
        f"related_module (e.g. Build & Deploy, Plan & Schedule), linked_tasks (array of task strings), "
        f"suggested_mitigation (string), expected_resolution_date (YYYY-MM-DD), root_cause_analysis (string). "
        f"Project data: {json.dumps(external_data)[:4000]}"
    )
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
                    "risk_score": int(r.get("risk_score", 50)),
                    "confidence_score": int(r.get("confidence_score", random.randint(70, 95))),
                    "owner": r.get("owner", "Unassigned"),
                    "related_module": r.get("related_module", "General"),
                    "linked_tasks": r.get("linked_tasks", []),
                    "suggested_mitigation": r.get("suggested_mitigation", ""),
                    "expected_resolution_date": r.get("expected_resolution_date", ""),
                    "root_cause_analysis": r.get("root_cause_analysis", ""),
                    "ai_recommendation": "Automatically generated by intelligent risk sensing.",
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
                # Adjust health score
                deduction = 10 if r.get("severity") == "Critical" else (5 if r.get("severity") == "High" else 2)
                record["health_score"] = max(0, record["health_score"] - deduction)
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
    prompt = f"Perform Root Cause Analysis for the following incident in project {req.demand_id}: {req.incident_details}. Suggest a root cause in clean plain text only, without any markdown formatting or asterisks."
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
    
    prompt = f"Draft a mitigation plan for risk ID {req.risk_id} in project {req.demand_id} based on similar past risks. IMPORTANT: Provide the response in clean plain text only. Do not use any markdown formatting, asterisks, hashes, or special symbols. Keep it structured but use regular text spacing."
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
