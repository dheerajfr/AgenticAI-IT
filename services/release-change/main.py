import os
import hashlib
import json
import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import (
    ChangeRecordDraftRequest,
    ChangeRecord,
    ChangeRiskScoringRequest,
    ChangeRiskScoreRecord,
    CABPrepRequest,
    CABPackRecord,
    CollisionDetectionRequest,
    CollisionDetectionRecord,
    AuditTrailRequest,
    AuditTrailRecord,
    ReleaseCreateRequest,
    ChangeRequestEdit,
    CABReviewSubmit
)
from database import db
from shared_db.connection import get_db
from orchestration.release_change_graph import (
    release_change_graph,
    run_change_record_agent,
    run_risk_assessment_agent,
    run_cab_assistant_agent,
    run_collision_agent,
    run_audit_agent
)

app = FastAPI(
    title="Release & Change Service (Stage 08)",
    description="Backend API for change record drafting, risk scoring, CAB prep, collision detection, and audit trails.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/release-change/health")
def health_check():
    return {"status": "healthy", "stage": 8}


@app.get("/api/release-change")
def get_all_release_change():
    """Root list endpoint — returns all release records."""
    return db.get_all_releases()


# 1. Change Record Drafting
@app.post("/api/release-change/draft", response_model=ChangeRecord)
def draft_change_record(req: ChangeRecordDraftRequest):
    state_input = {
        "task": "draft",
        "demand_id": req.demand_id,
        "plan_id": req.plan_id,
        "estimate_id": req.estimate_id,
        "readiness_id": req.readiness_id,
        "gate_id": req.gate_id,
        "test_run_id": req.test_run_id,
        "runbook_id": req.runbook_id,
        "rollback_id": req.rollback_id,
        "itsm_schema_version": req.itsm_schema_version
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["change_record"]


@app.get("/api/release-change/draft/{change_record_id}", response_model=ChangeRecord)
def get_change_record(change_record_id: str):
    record = db.get_change_record(change_record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Change record not found.")
    return record


# 2. Change Risk Scoring
@app.post("/api/release-change/risk-score", response_model=ChangeRiskScoreRecord)
def compute_risk_score(req: ChangeRiskScoringRequest):
    state_input = {
        "task": "risk_score",
        "demand_id": req.demand_id,
        "change_record_id": req.change_record_id,
        "component_ids": req.component_ids,
        "change_calendar_ref": req.change_calendar_ref,
        "historical_change_outcomes_ref": req.historical_change_outcomes_ref
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["risk_score_record"]


@app.get("/api/release-change/risk-score/{risk_score_id}", response_model=ChangeRiskScoreRecord)
def get_risk_score(risk_score_id: str):
    record = db.get_risk_score(risk_score_id)
    if not record:
        raise HTTPException(status_code=404, detail="Risk score not found.")
    return record


# 3. CAB Prep
@app.post("/api/release-change/cab-prep", response_model=CABPackRecord)
def prep_cab_pack(req: CABPrepRequest):
    state_input = {
        "task": "cab_prep",
        "risk_score_id": req.risk_score_id,
        "cab_policy_ref": req.cab_policy_ref,
        "prior_qa_ref": req.prior_qa_ref
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["cab_pack_record"]


@app.get("/api/release-change/cab-prep/{cab_pack_id}", response_model=CABPackRecord)
def get_cab_pack(cab_pack_id: str):
    record = db.get_cab_pack(cab_pack_id)
    if not record:
        raise HTTPException(status_code=404, detail="CAB pack not found.")
    return record


# 4. Collision Detection
@app.post("/api/release-change/collision", response_model=CollisionDetectionRecord)
def detect_collision(req: CollisionDetectionRequest):
    state_input = {
        "task": "collision",
        "change_record_id": req.change_record_id,
        "component_ids": req.component_ids,
        "scheduled_start": req.scheduled_start,
        "scheduled_end": req.scheduled_end,
        "change_calendar_ref": req.change_calendar_ref,
        "freeze_rules_ref": req.freeze_rules_ref
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["collision_record"]


@app.get("/api/release-change/collision/{collision_id}", response_model=CollisionDetectionRecord)
def get_collision(collision_id: str):
    record = db.get_collision_detection(collision_id)
    if not record:
        raise HTTPException(status_code=404, detail="Collision record not found.")
    return record


# 5. Audit Trail
@app.post("/api/release-change/audit", response_model=AuditTrailRecord)
def generate_audit_trail(req: AuditTrailRequest):
    state_input = {
        "task": "audit",
        "demand_id": req.demand_id,
        "change_record_id": req.change_record_id,
        "event_sources": req.event_sources
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["audit_trail_record"]


@app.get("/api/release-change/audit/{audit_id}", response_model=AuditTrailRecord)
def get_audit_trail(audit_id: str):
    record = db.get_audit_trail(audit_id)
    if not record:
        raise HTTPException(status_code=404, detail="Audit trail not found.")
    return record


# ==============================================================================
# NEW STAGE 08 RELEASE GOVERNANCE ENDPOINTS
# ==============================================================================

def get_mock_build_details(build_id: str, plan_id: str, version: str):
    suffix = plan_id.split("-")[-1] if plan_id else "DUMMY"
    return {
        "build_id": build_id or f"BLD-{suffix}-1",
        "artifact_version": version or "v2.4.2",
        "build_status": "successful",
        "deployment_status": "successful",
        "deployment_logs": (
            "[INFO] Pulling source code repository...\n"
            "[INFO] Checking compiler configuration: JDK 17 / Node.js 18\n"
            "[INFO] Build compilation started...\n"
            "[INFO] 42 modules compiled successfully.\n"
            "[INFO] Running unit tests...\n"
            "[INFO] Packaging archive: app-artifact-v2.4.2.tar.gz\n"
            "[INFO] Build artifact published successfully.\n"
            "[INFO] Deploying to target environment...\n"
            "[INFO] Swapping load balancer target...\n"
            "[INFO] Deployment completed successfully."
        ),
        "rollback_package": f"rollback-app-{suffix}-v2.4.1.tar.gz",
        "build_timestamp": "2026-07-14T06:30:00Z"
    }

def get_real_build_details(project_id: str, build_id: str, version: str) -> dict:
    import sqlite3
    db_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "build-deploy", "build-deploy.db")
    )
    if not os.path.exists(db_path):
        return get_mock_build_details(build_id, project_id, version)
    
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            
            # Fetch all deployments
            cursor.execute("SELECT data FROM deployments")
            deployment_row = None
            for r in cursor.fetchall():
                dep_data = json.loads(r[0])
                if dep_data.get("demand_id") == project_id:
                    deployment_row = dep_data
                    break
            
            if not deployment_row:
                # Try fetching runbooks for this demand/project
                cursor.execute("SELECT data FROM runbooks")
                runbook_data = None
                for r in cursor.fetchall():
                    rb_data = json.loads(r[0])
                    if rb_data.get("demand_id") == project_id:
                        runbook_data = rb_data
                        break
                
                if runbook_data:
                    rb_id = runbook_data.get("runbook_id")
                    comp_id = runbook_data.get("component_id")
                    status = "runbook approved" if runbook_data.get("status") == "approved" else "runbook drafting"
                    steps = runbook_data.get("steps") or []
                    steps_str = "\n".join([f"- {s.get('description')} ({s.get('step_type')})" for s in steps])
                    
                    return {
                        "build_id": build_id or f"BLD-{project_id.split('-')[-1]}-1",
                        "artifact_version": version or "v1.0.0",
                        "build_status": "successful",
                        "deployment_status": "runbook-ready",
                        "deployment_logs": f"[INFO] Runbook {rb_id} loaded for component {comp_id}.\n[INFO] Status: {status}.\n[INFO] Runbook Steps:\n{steps_str}",
                        "rollback_package": f"rollback-{comp_id}-{version}.tar.gz",
                        "build_timestamp": runbook_data.get("created_at") or "2026-07-14T06:30:00Z"
                    }
                
                return get_mock_build_details(build_id, project_id, version)
            
            # We found a deployment record! Let's get more details
            dep_id = deployment_row.get("deployment_id")
            rb_id = deployment_row.get("runbook_id")
            comp_id = deployment_row.get("component_id")
            dep_status = deployment_row.get("status")
            dep_ver = deployment_row.get("version") or version
            
            # Fetch cutover updates if cutover session exists
            cutover_id = deployment_row.get("cutover_id")
            logs = [
                f"[INFO] Deployment {dep_id} initialized.",
                f"[INFO] Target: {deployment_row.get('environment')} environment.",
                f"[INFO] Status: {dep_status}."
            ]
            
            if rb_id:
                logs.append(f"[INFO] Using approved runbook: {rb_id}.")
                
            # Preconditions summary
            preconditions = deployment_row.get("preconditions") or []
            if preconditions:
                logs.append("[INFO] Pre-conditions evaluated:")
                for pc in preconditions:
                    status_sym = "[✓]" if pc.get("passed") else "[✗]"
                    logs.append(f"  {status_sym} {pc.get('name')}: {pc.get('detail')}")
                    
            if cutover_id:
                logs.append(f"[INFO] Cutover session {cutover_id} active.")
                cursor.execute("SELECT data FROM cutover_sessions WHERE cutover_id = ?", (cutover_id,))
                co_row = cursor.fetchone()
                if co_row:
                    co_data = json.loads(co_row[0])
                    for update in co_data.get("updates", []):
                        logs.append(f"[{update.get('timestamp')}] {update.get('author')}: {update.get('message')}")
                    for step in co_data.get("steps", []):
                        logs.append(f"  Step {step.get('step_id')} ({step.get('status')}): {step.get('description')}")
                        
            return {
                "build_id": build_id or f"BLD-{project_id.split('-')[-1]}-1",
                "artifact_version": dep_ver,
                "build_status": "successful",
                "deployment_status": dep_status,
                "deployment_logs": "\n".join(logs),
                "rollback_package": f"rollback-{comp_id}-{dep_ver}.tar.gz",
                "build_timestamp": deployment_row.get("created_at") or "2026-07-14T06:30:00Z"
            }
    except Exception as e:
        print(f"Error querying build-deploy DB: {e}")
        return get_mock_build_details(build_id, project_id, version)

def get_real_quality_details(project_id: str) -> dict:
    """
    Fetches real Test & Quality data from the shared SQLite database.
    Reads test executions, defects, security findings and quality gate results
    keyed by demand_id == project_id.
    Falls back to safe defaults when no data is found.
    """
    try:
        with get_db() as conn:
            cursor = conn.cursor()

            # ── test_execution rows (from the mirrored explicit table) ────────
            try:
                cursor.execute(
                    "SELECT data FROM test_execution WHERE demand_id = ? AND soft_delete = 0",
                    (project_id,)
                )
                exec_rows = [json.loads(r[0]) for r in cursor.fetchall() if r[0]]
            except Exception:
                exec_rows = []

            # ── defects rows ─────────────────────────────────────────────────
            try:
                cursor.execute(
                    "SELECT data FROM defects WHERE demand_id = ? AND soft_delete = 0",
                    (project_id,)
                )
                defect_rows = [json.loads(r[0]) for r in cursor.fetchall() if r[0]]
            except Exception:
                defect_rows = []

            # ── security_findings rows ────────────────────────────────────────
            try:
                cursor.execute(
                    "SELECT data FROM security_findings WHERE demand_id = ? AND soft_delete = 0",
                    (project_id,)
                )
                sec_rows = [json.loads(r[0]) for r in cursor.fetchall() if r[0]]
            except Exception:
                sec_rows = []

            # ── quality_gate rows ─────────────────────────────────────────────
            try:
                cursor.execute(
                    "SELECT data FROM quality_gate WHERE demand_id = ? AND soft_delete = 0",
                    (project_id,)
                )
                gate_rows = [json.loads(r[0]) for r in cursor.fetchall() if r[0]]
            except Exception:
                gate_rows = []

            # ── fallback: consolidated test_and_quality store ─────────────────
            if not exec_rows and not gate_rows:
                try:
                    cursor.execute(
                        "SELECT data FROM test_and_quality WHERE demand_id = ?",
                        (project_id,)
                    )
                    row = cursor.fetchone()
                    if row and row[0]:
                        consolidated = json.loads(row[0])
                        run = consolidated.get("test_execution")
                        if run:
                            exec_rows = [run]
                        gate = consolidated.get("quality_gate")
                        if gate:
                            gate_rows = [gate]
                        for d in consolidated.get("defects", []):
                            defect_rows.append(d)
                        for s in consolidated.get("security_findings", []):
                            sec_rows.append(s)
                except Exception:
                    pass

        # ── aggregate execution stats ────────────────────────────────────────
        # test_execution rows may be individual result records or a consolidated run dict
        all_results = []
        for e in exec_rows:
            if "results" in e and isinstance(e["results"], list):
                # consolidated run dict — expand the results array
                all_results.extend(e["results"])
            else:
                all_results.append(e)

        total = len(all_results)
        passed = sum(1 for e in all_results if str(e.get("status", "")).lower() in ("passed", "pass"))
        failed = sum(1 for e in all_results if str(e.get("status", "")).lower() in ("failed", "fail"))
        test_results = f"{total} total, {passed} passed, {failed} failed" if total > 0 else "No executions recorded"

        # ── open defects ─────────────────────────────────────────────────────
        # Handle both direct defect rows and nested defect lists from consolidated store
        flat_defects = []
        for d in defect_rows:
            if isinstance(d, list):
                flat_defects.extend(d)
            elif isinstance(d, dict):
                flat_defects.append(d)

        open_issues = [
            {
                "defect_id": d.get("defect_id") or d.get("id", "DEF-unknown"),
                "severity": d.get("severity", "unknown"),
                "summary": d.get("summary") or d.get("title") or d.get("description") or "No description",
                "status": d.get("status", "open")
            }
            for d in flat_defects
            if str(d.get("status", "")).lower() not in ("closed", "resolved")
        ]
        critical_sev = {"critical", "blocker", "high"}
        critical_defects = sum(1 for d in open_issues if d["severity"].lower() in critical_sev)
        defect_summary = (
            f"{len(open_issues)} open defect(s), {critical_defects} critical/blocker"
            if open_issues else "0 open critical defects"
        )

        # ── security scan summary ─────────────────────────────────────────────
        high_sec = sum(1 for f in sec_rows if str(f.get("severity", "")).lower() in ("high", "critical"))
        med_sec = sum(1 for f in sec_rows if str(f.get("severity", "")).lower() == "medium")
        security_scan = (
            f"{high_sec} high/critical finding(s), {med_sec} medium finding(s)"
            if sec_rows else "No security scan data available"
        )

        # ── quality gate verdict ──────────────────────────────────────────────
        latest_gate = gate_rows[-1] if gate_rows else {}
        # Real DB stores verdict as "PASS"/"FAIL", score as "score" field
        gate_verdict_raw = str(latest_gate.get("verdict") or latest_gate.get("status") or "")
        gate_verdict = "Passed" if gate_verdict_raw.upper() in ("PASS", "PASSED") else (
            "Failed" if gate_verdict_raw.upper() in ("FAIL", "FAILED") else (
                "Not Evaluated" if not gate_verdict_raw else gate_verdict_raw.title()
            )
        )
        quality_score = latest_gate.get("score") or latest_gate.get("quality_score")
        code_coverage_val = latest_gate.get("code_coverage_pct") or latest_gate.get("coverage_pct")
        code_coverage = f"{code_coverage_val}%" if code_coverage_val is not None else (
            f"{quality_score}/100" if quality_score is not None else "N/A"
        )

        return {
            "test_results": test_results,
            "automation_report": f"/api/test-quality/relational/test_execution/{project_id}",
            "code_coverage": code_coverage,
            "security_scan": security_scan,
            "performance_results": f"Pass rate: {round(passed/total*100, 1) if total > 0 else 0}%",
            "defect_summary": defect_summary,
            "quality_gate": gate_verdict,
            "quality_score": quality_score,
            "open_issues": open_issues,
            "source": "Test & Quality Module (Stage 07)",
            "total_executions": total,
            "total_defects": len(flat_defects),
            "total_security_findings": len(sec_rows)
        }


    except Exception as e:
        print(f"[release-change] Error fetching real quality details for {project_id}: {e}")
        return {
            "test_results": "Error loading data",
            "automation_report": "",
            "code_coverage": "N/A",
            "security_scan": "N/A",
            "performance_results": "N/A",
            "defect_summary": "Could not load quality data",
            "quality_gate": "Not Evaluated",
            "quality_score": None,
            "open_issues": [],
            "source": "Test & Quality Module (Stage 07)",
            "total_executions": 0,
            "total_defects": 0,
            "total_security_findings": 0
        }


@app.get("/api/release-change/quality-summary/{demand_id}")
def get_quality_summary(demand_id: str):
    """
    Returns real Test & Quality evidence data for a given demand_id.
    Used by the Release & Change frontend to populate the Quality Gate section.
    """
    return get_real_quality_details(demand_id)


@app.get("/api/release-change/dropdowns")
def get_dropdown_options():
    """
    Fetches list of approved demands, accepted plans, builds, environments,
    teams, and approvers for populating searchable UI dropdowns.
    """
    demands = []
    plans = []
    environments = ["dev", "test", "staging", "prod"]
    teams = ["Engineering", "Payments Platform", "Core Infra", "Customer Digital"]
    approvers = ["chairperson.cab@example.com", "sec-officer@example.com", "manager.delivery@example.com"]
    windows = [
        "2026-07-21T22:00:00Z - 2026-07-22T02:00:00Z",
        "2026-08-19T22:00:00Z - 2026-08-20T02:00:00Z",
        "2026-09-15T22:00:00Z - 2026-09-16T02:00:00Z"
    ]
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT demand_id, data FROM demands")
            for r in cursor.fetchall():
                d_data = json.loads(r[1])
                if d_data.get("status") == "approved":
                    demands.append({
                        "demand_id": r[0],
                        "title": d_data.get("title")
                    })
                    
            cursor.execute("SELECT plan_id, demand_id, data FROM plans")
            for r in cursor.fetchall():
                p_data = json.loads(r[2])
                if p_data.get("status") == "accepted":
                    plans.append({
                        "plan_id": r[0],
                        "demand_id": r[1],
                        "end_date": p_data.get("end_date")
                    })
    except Exception as e:
        print(f"Error fetching dropdowns: {e}")
        
    return {
        "demands": demands,
        "plans": plans,
        "environments": environments,
        "teams": teams,
        "approvers": approvers,
        "windows": windows
    }


@app.get("/api/release-change/releases")
def get_releases(project_id: Optional[str] = None, status: Optional[str] = None, environment: Optional[str] = None):
    """
    Retrieves all release records from the DB, with optional filters.
    """
    releases = db.get_all_releases()
    if project_id:
        releases = [r for r in releases if r["project_id"] == project_id]
    if status:
        releases = [r for r in releases if r["status"].lower() == status.lower()]
    if environment:
        releases = [r for r in releases if r["environment"].lower() == environment.lower()]
    return releases


@app.delete("/api/release-change/releases/{release_id}")
def delete_release(release_id: str):
    """
    Deletes a release record and all associated data for the given release_id.
    """
    deleted = db.delete_release(release_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Release record not found.")
    return {"status": "deleted", "release_id": release_id}


@app.post("/api/release-change/releases")
def create_release(req: ReleaseCreateRequest):
    """
    Creates a new release record in the database.
    """
    project_id = req.project_id
    suffix = project_id.split("-")[-1] if project_id else "0001"
    
    # Fetch Plan ID and Target Release Date (End Date) from plans table if not provided
    plan_id = req.plan_id
    planned_date = req.planned_release_date
    
    if not plan_id or not planned_date:
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT plan_id, data FROM plans WHERE demand_id = ?", (project_id,))
                row = cursor.fetchone()
                if row:
                    if not plan_id:
                        plan_id = row[0]
                    if not planned_date:
                        plan_data = json.loads(row[1])
                        end_date = plan_data.get("end_date")
                        if end_date:
                            planned_date = end_date + "T22:00:00Z"
        except Exception as e:
            print(f"Error fetching plan details for release creation: {e}")
            
    if not plan_id:
        plan_id = f"PLN-{suffix}-1"
    if not planned_date:
        planned_date = (datetime.date.today() + datetime.timedelta(days=7)).isoformat() + "T22:00:00Z"
        
    build_id = req.build_id or f"BLD-{suffix}-1"
    version = req.version or "v1.0.0"
    environment = req.environment or "prod"
    
    release_id = f"REL-{suffix}-1"
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    
    db.save_release(
        release_id=release_id,
        project_id=project_id,
        plan_id=plan_id,
        build_id=build_id,
        version=version,
        environment=environment,
        status="Draft",
        planned_release_date=planned_date,
        actual_release_date=None,
        risk_score=None,
        cab_required=0,
        cab_status="not-required",
        created_at=created_at,
        updated_at=created_at
    )
    
    # Auto-run Change Record agent to draft initial record
    run_change_record_agent(release_id, project_id, plan_id, db)
    # Auto-run Collision agent
    run_collision_agent(release_id, db)
    # Auto-run Audit agent
    run_audit_agent(release_id, db)
    
    return {"status": "created", "release_id": release_id}


@app.get("/api/release-change/releases/{release_id}")
def get_release_by_id(release_id: str):
    """
    Consolidates a full overview payload containing the release status,
    change request form details, risk assessment, CAB review info, collision report,
    upstream dependencies, and mocked Build / Quality gates evidence.
    """
    rel = db.get_release(release_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Release record not found.")
        
    change_req = db.get_change_request_by_release(release_id)
    risk_rec = db.get_risk_assessment_by_release(release_id)
    cab_rec = db.get_cab_by_release(release_id)
    collisions = db.get_release_collisions(release_id)
    audit_logs = db.get_audit_logs(release_id)
    
    # Fetch upstream tables
    demand = None
    plan = None
    dependencies = []
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (rel["project_id"],))
            row = cursor.fetchone()
            if row:
                demand = json.loads(row[0])
                
            cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (rel["plan_id"],))
            row = cursor.fetchone()
            if row:
                plan = json.loads(row[0])
                
            cursor.execute("SELECT data FROM dependencies WHERE demand_id = ?", (rel["project_id"],))
            rows = cursor.fetchall()
            for r in rows:
                dependencies.append(json.loads(r[0]))
    except Exception as e:
        print(f"Error loading upstream data: {e}")
        
    # Mock/Real data providers
    build_details = get_real_build_details(rel["project_id"], rel["build_id"], rel["version"])
    quality_details = get_real_quality_details(rel["project_id"])
    
    return {
        "release": rel,
        "change_request": change_req,
        "risk_assessment": risk_rec,
        "cab": cab_rec,
        "collisions": collisions,
        "audit_logs": audit_logs,
        "upstream": {
            "demand": demand,
            "plan": plan,
            "dependencies": dependencies,
            "build": build_details,
            "quality": quality_details
        }
    }


@app.post("/api/release-change/releases/{release_id}/draft")
def draft_release_change(release_id: str):
    rel = db.get_release(release_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Release not found.")
    res = run_change_record_agent(release_id, rel["project_id"], rel["plan_id"], db)
    return res


@app.put("/api/release-change/releases/{release_id}/change")
def edit_release_change(release_id: str, req: ChangeRequestEdit):
    cr = db.get_change_request_by_release(release_id)
    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found.")
        
    db.save_change_request(
        change_id=cr["change_id"],
        release_id=release_id,
        summary=req.summary,
        business_justification=req.business_justification,
        impact_analysis=req.impact_analysis,
        deployment_plan=req.deployment_plan,
        validation_plan=req.validation_plan,
        rollback_plan=req.rollback_plan,
        known_issues=req.known_issues,
        status=cr["status"],
        created_by=cr["created_by"],
        created_at=cr["created_at"]
    )
    return {"status": "saved"}


@app.post("/api/release-change/releases/{release_id}/submit")
def submit_release_change(release_id: str):
    rel = db.get_release(release_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Release not found.")
        
    cr = db.get_change_request_by_release(release_id)
    if not cr:
        raise HTTPException(status_code=404, detail="Change request is missing.")
        
    # Re-run risk and collisions
    risk = run_risk_assessment_agent(release_id, db)
    run_collision_agent(release_id, db)
    
    cab_req = True
    next_status = "Pending Approval"
    
    # Save change request with 'submitted' status
    db.save_change_request(
        change_id=cr["change_id"],
        release_id=release_id,
        summary=cr["summary"],
        business_justification=cr["business_justification"],
        impact_analysis=cr["impact_analysis"],
        deployment_plan=cr["deployment_plan"],
        validation_plan=cr["validation_plan"],
        rollback_plan=cr["rollback_plan"],
        known_issues=cr["known_issues"],
        status="submitted",
        created_by=cr["created_by"],
        created_at=cr["created_at"]
    )
    
    # Update release status
    db.save_release(
        release_id=release_id,
        project_id=rel["project_id"],
        plan_id=rel["plan_id"],
        build_id=rel["build_id"],
        version=rel["version"],
        environment=rel["environment"],
        status=next_status,
        planned_release_date=rel["planned_release_date"],
        actual_release_date=rel["actual_release_date"],
        risk_score=risk["overall_score"],
        cab_required=1 if cab_req else 0,
        cab_status="pending-cab" if cab_req else "not-required",
        created_at=rel["created_at"],
        updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    )
    
    # Run audit agent
    run_audit_agent(release_id, db)
    
    return {"status": next_status, "cab_required": cab_req}


@app.post("/api/release-change/releases/{release_id}/evaluate-risk")
def evaluate_release_risk(release_id: str):
    res = run_risk_assessment_agent(release_id, db)
    return res


@app.post("/api/release-change/releases/{release_id}/cab-review")
def cab_review_release(release_id: str, req: CABReviewSubmit):
    rel = db.get_release(release_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Release not found.")
        
    cab_id = f"CAB-{release_id.split('-')[-1]}-1"
    approval_time = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    
    db.save_cab(
        cab_id=cab_id,
        release_id=release_id,
        meeting_date=req.meeting_date,
        chairperson=req.chairperson,
        decision=req.decision,
        comments=req.comments,
        approved_by=req.chairperson if req.decision == "Approve" else None,
        approval_time=approval_time if req.decision == "Approve" else None
    )
    
    # Update status based on decision
    new_status = "Approved"
    if req.decision == "Reject":
        new_status = "Failed"
    elif req.decision == "Request Changes":
        new_status = "Draft"
        
    db.save_release(
        release_id=release_id,
        project_id=rel["project_id"],
        plan_id=rel["plan_id"],
        build_id=rel["build_id"],
        version=rel["version"],
        environment=rel["environment"],
        status=new_status,
        planned_release_date=rel["planned_release_date"],
        actual_release_date=approval_time if new_status == "Approved" else None,
        risk_score=rel["risk_score"],
        cab_required=rel["cab_required"],
        cab_status=req.decision.lower(),
        created_at=rel["created_at"],
        updated_at=approval_time
    )
    
    # Add audit log
    db.add_audit_log(
        audit_id=f"AU-{release_id.split('-')[-1]}-cab",
        release_id=release_id,
        event=f"CAB Decision: {req.decision}",
        performed_by=req.chairperson,
        timestamp=approval_time,
        evidence_link=f"/api/release-change/releases/{release_id}",
        module_name="Release & Change"
    )
    
    return {"status": new_status}


@app.post("/api/release-change/releases/{release_id}/collision")
def check_release_collision(release_id: str):
    res = run_collision_agent(release_id, db)
    return res


@app.post("/api/release-change/releases/{release_id}/audit")
def update_release_audit(release_id: str):
    res = run_audit_agent(release_id, db)
    return res

