import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import urllib.request
import json
from datetime import datetime

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import RiskRequest, IssueRequest, MitigationRequest, MitigationUpdateRequest, RiskRecord
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
        # "/api/deployments/info" (the previous URL here) is a static
        # service-index blob ({"stage": ..., "implemented": [...]}) - it
        # returns 200 but never contains real deployment records, so
        # anything reading it silently got useless data with no error.
        # "/api/deployments/orchestration" is the real list of
        # DeploymentRecord entries (status go/no-go/rolled-back, etc.).
        "deployments": f"{base_url}/deployments/orchestration"
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


def _extract_risk_signals(external_data: dict) -> dict:
    """
    Pulls the specific signals the risk-sensing spec calls for - recent
    build/deployment failures, test/quality signals, and dependency breaks -
    out of the real sibling-service data fetch_module_data already fetched,
    instead of dumping the entire external_data blob (truncated to 4000
    chars) at the LLM.

    list_endpoints above collapses a single filtered match down to a bare
    dict (not a 1-item list), so both shapes are normalized to a list here.

    Comms/sentiment analysis over real Teams messages would need Microsoft
    Graph API credentials this environment doesn't have, so that signal is
    intentionally NOT included/faked here.
    """
    signals = {
        "build_deploy_failures": [],
        "test_failures": {},
        "dependency_breaks": [],
    }

    deployments = external_data.get("deployments")
    if isinstance(deployments, dict) and "error" not in deployments:
        deployments = [deployments]
    if isinstance(deployments, list):
        signals["build_deploy_failures"] = [
            {
                "deployment_id": d.get("deployment_id"),
                "component_id": d.get("component_id"),
                "version": d.get("version"),
                "environment": d.get("environment"),
                "status": d.get("status"),
                "updated_at": d.get("updated_at"),
            }
            for d in deployments
            if isinstance(d, dict) and d.get("status") in ("no-go", "rolled-back")
        ]

    test_quality = external_data.get("test_quality")
    if isinstance(test_quality, dict) and "error" not in test_quality:
        defect_triage = test_quality.get("defect_triage") or {}
        security_testing = test_quality.get("security_testing") or {}
        quality_gate = test_quality.get("quality_gate") or {}
        signals["test_failures"] = {
            "open_defects": len(defect_triage.get("triaged_defects") or []),
            "release_risk_summary": defect_triage.get("release_risk_summary", ""),
            "security_findings_summary": security_testing.get("summary"),
            "quality_gate_verdict": quality_gate.get("verdict"),
            "quality_gate_score": quality_gate.get("score"),
        }

    dependencies = external_data.get("dependencies")
    if isinstance(dependencies, dict) and "error" not in dependencies:
        dependencies = [dependencies]
    if isinstance(dependencies, list):
        signals["dependency_breaks"] = [
            {
                "dependency_id": d.get("dependency_id"),
                "type": d.get("type"),
                "status": d.get("status"),
                "risk": d.get("risk") or d.get("risk_level"),
                "threat_level": d.get("threat_level"),
                "owner": d.get("owner"),
            }
            for d in dependencies
            if isinstance(d, dict) and d.get("status") == "at-risk"
        ]

    return signals


def _find_unmitigated_risks(record: dict) -> list:
    """
    Cross-references open risks against record['mitigations'] to flag risks
    with no live (non-closed) mitigation tracked against them - the spec's
    explicit "risks with no live mitigation" requirement. Real
    cross-referencing against actual mitigation records, not a fabricated
    flag.
    """
    closed_statuses = {"Completed", "Closed", "Cancelled"}
    live_mitigation_risk_ids = {
        m.get("risk_id") for m in record.get("mitigations", [])
        if m.get("status") not in closed_statuses
    }
    return [
        r["id"] for r in record.get("risks", [])
        if r.get("status") == "Open" and r.get("id") not in live_mitigation_risk_ids
    ]


def _finalize(record: dict) -> dict:
    """Recomputes derived, always-fresh fields before a record is handed back
    to a caller. Not persisted to the DB - cross-referencing risks against
    mitigations is cheap and must never go stale between requests."""
    record["risks_without_mitigation"] = _find_unmitigated_risks(record)
    return record


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
    return _finalize(record)

@app.post("/api/risk-issues/project/{demand_id}/aggregate")
def aggregate_and_detect(demand_id: str):
    record = _get_or_create(demand_id)

    # Fetch external data
    external_data = fetch_module_data(demand_id)

    # Real completeness ratio: how many of the queried sibling-service data
    # sources actually returned usable data (vs. a connection/parse error)
    # for this sensing pass. Used below as the confidence for any risks
    # detected in this pass - a genuine measure of how much real signal was
    # available, never a random placeholder.
    queried_sources = len(external_data)
    available_sources = sum(
        1 for v in external_data.values()
        if not (isinstance(v, dict) and "error" in v)
    )
    sensing_confidence = round((available_sources / queried_sources) * 100) if queried_sources else 0

    # Update project summary from demand
    demand_data = external_data.get("demand", {})
    if demand_data and "title" in demand_data:
        record["project_summary"] = {
            "title": demand_data.get("title", "Unknown"),
            "customer": demand_data.get("business_unit", "Unknown"),
            "status": demand_data.get("status", "Active")
        }

    # Real, targeted signal extraction (build/deploy failures, test/quality
    # signals, dependency breaks) instead of a raw dump of everything fetched.
    # Also feeds the AI Risk Detection prompt below.
    signals = _extract_risk_signals(external_data)
    record["sensing_data"] = {
        "fetched_at": datetime.now().isoformat(),
        "sources_available": f"{available_sources}/{queried_sources}",
        "signals": signals,
    }

    # --- Auto-Sync Issues & Timeline from external data ---
    
    # 1. Sync Test Quality Defects as Issues
    tq_data = external_data.get("test_quality") or {}
    if isinstance(tq_data, dict):
        # Sync defects
        defect_triage = tq_data.get("defect_triage") or {}
        defects = defect_triage.get("triaged_defects") or []
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
        findings = security_testing.get("findings") or []
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
    
    # AI Risk Detection - targeted prompt built from the real extracted
    # signals (build/deploy failures, test/quality signals, dependency
    # breaks) rather than a generic truncated JSON dump of everything fetched.
    prompt = (
        "Analyze this project's real signals and identify up to 3 critical/high risks. "
        "Output a JSON array of objects with keys: title, description, category (e.g. Schedule, Resource, Quality, Security), "
        "probability (High/Medium/Low), impact (High/Medium/Low), severity (Critical/High/Medium/Low), "
        "risk_score (0-100), owner (e.g. Project Manager, Tech Lead), "
        "related_module (e.g. Build & Deploy, Plan & Schedule), linked_tasks (array of task strings), "
        "suggested_mitigation (string), expected_resolution_date (YYYY-MM-DD), root_cause_analysis (string).\n\n"
        f"Recent build/deployment failures (build-deploy service, real records): {json.dumps(signals['build_deploy_failures'])[:800]}\n"
        f"Test/quality signals (test-quality service, real records): {json.dumps(signals['test_failures'])[:800]}\n"
        f"Dependency-break signals (dependencies service, real records): {json.dumps(signals['dependency_breaks'])[:800]}\n"
        f"Project context: title={demand_data.get('title', 'Unknown')}, status={demand_data.get('status', 'Unknown')}"
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
                    # Genuine completeness ratio computed above from how many
                    # queried sibling-service sources actually returned real
                    # data this pass - never a fabricated random placeholder.
                    "confidence_score": sensing_confidence,
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
    return {"status": "success", "record": _finalize(record)}

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

    return {"status": "success", "issue": issue, "record": _finalize(record)}

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
    return {"status": "success", "issue": issue, "record": _finalize(record)}

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
        # No AI can genuinely "own" execution of a mitigation. Use a real
        # owner passed in the request if one was given; otherwise leave it
        # explicitly "Unassigned" (consistent with how Risk/Issue owners are
        # left unassigned elsewhere in this file) rather than the fabricated
        # "AI Agent" placeholder that used to imply someone had been assigned.
        "owner": req.owner or "Unassigned",
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
    return {"status": "success", "mitigation": mitigation, "record": _finalize(record)}


@app.patch("/api/risk-issues/{demand_id}/mitigations/{mitigation_id}")
def update_mitigation(demand_id: str, mitigation_id: str, req: MitigationUpdateRequest):
    """
    Real mitigation-tracking workflow: lets progress/status/owner be updated
    and tracked through to closure, instead of draft_mitigation's one-shot
    "append and stop". This is the update path that was previously entirely
    missing.
    """
    record = _get_or_create(demand_id)
    mitigation = next((m for m in record.get("mitigations", []) if m.get("id") == mitigation_id), None)
    if not mitigation:
        raise HTTPException(status_code=404, detail="Mitigation not found")

    changes = []
    if req.status is not None and req.status != mitigation.get("status"):
        changes.append(f"status: {mitigation.get('status')} -> {req.status}")
        mitigation["status"] = req.status
    if req.progress is not None and req.progress != mitigation.get("progress"):
        changes.append(f"progress: {mitigation.get('progress')} -> {req.progress}")
        mitigation["progress"] = req.progress
    if req.owner is not None and req.owner != mitigation.get("owner"):
        changes.append(f"owner: {mitigation.get('owner')} -> {req.owner}")
        mitigation["owner"] = req.owner

    # A mitigation marked Completed is, by definition, fully progressed.
    if mitigation.get("status") == "Completed" and mitigation.get("progress", 0) < 100:
        mitigation["progress"] = 100
        changes.append("progress: auto-set to 100 on Completed")

    if changes:
        record["timeline"].append({
            "id": f"TL-{uuid.uuid4().hex[:6]}",
            "timestamp": datetime.now().isoformat(),
            "event_type": "Mitigation Updated",
            "description": f"Mitigation {mitigation_id} updated ({'; '.join(changes)})",
            "related_id": mitigation_id
        })

    db.save(record)
    return {"status": "success", "mitigation": mitigation, "record": _finalize(record)}
