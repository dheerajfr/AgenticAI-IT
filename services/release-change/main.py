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
        "build_timestamp": "2026-07-14T06:30:00Z",
        "pipeline_url": f"http://jenkins.internal/job/pipeline-{suffix}/9901"
    }

def get_mock_quality_details(project_id: str):
    suffix = project_id.split("-")[-1] if project_id else "DUMMY"
    # Make DEM-0072 look green, others look red or warn for high realism
    gate_verdict = "Passed" if suffix == "0072" else "Failed"
    defects = []
    if gate_verdict == "Failed":
        defects = [
            {
                "defect_id": f"BUG-44{suffix}",
                "severity": "critical",
                "summary": "Connection pool exhausted under load > 200 rps",
                "status": "open"
            }
        ]
    return {
        "test_results": "12 total, 11 passed, 1 failed" if gate_verdict == "Failed" else "15 total, 15 passed, 0 failed",
        "automation_report": f"http://qa-reporter.internal/suites/TST-{suffix}-1",
        "code_coverage": "74.2%" if gate_verdict == "Failed" else "92.5%",
        "security_scan": "1 high finding (SQL Injection at src/routes/payments.py:L88), 3 medium findings" if gate_verdict == "Failed" else "0 high findings, 1 medium finding",
        "performance_results": "p99 latency: 250ms, avg throughput: 150 rps" if gate_verdict == "Failed" else "p99 latency: 95ms, avg throughput: 300 rps",
        "defect_summary": f"1 critical defect (BUG-44{suffix}) blocks release" if gate_verdict == "Failed" else "0 open critical defects",
        "quality_gate": gate_verdict,
        "open_issues": defects
    }


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
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z"
    
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
        
    # Mock data providers
    build_details = get_mock_build_details(rel["build_id"], rel["plan_id"], rel["version"])
    quality_details = get_mock_quality_details(rel["project_id"])
    
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
        updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z"
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
    approval_time = datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z"
    
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

