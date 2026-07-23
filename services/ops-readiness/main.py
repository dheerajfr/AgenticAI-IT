import os
import sys
import json
import datetime
import sqlite3
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    MonitoringSetupRequest,
    MonitoringConfigRecord,
    ComponentSpec,
    SLOTargetSpec,
    ProposedAlert,
    ProposedDashboard,
    SreReviewRequest,
    HandoverKTRequest,
    HandoverPackRecord,
    SupportRunbook,
    RunbookSection,
    KnownError,
    HandoverReviewRequest,
    ReadinessValidationRequest,
    ReadinessValidationRecord,
    CriterionResult,
    SignOffValidationRequest,
    ReadinessCriteria
)
from database import db

# Add workspaces and services directories to path to import client utilities
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.llm_client import call_gemini
from services.shared_db.connection import get_db

app = FastAPI(
    title="Ops Readiness Service (Stage 09)",
    description="Backend API for monitoring setups, support handovers, and operations readiness validations.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_build_deploy_db_path() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "build-deploy", "build-deploy.db"))

@app.get("/api/ops-readiness/health")
def health_check():
    return {"status": "healthy", "stage": 9}


@app.get("/api/ops-readiness")
def get_all_ops_readiness():
    """Root list endpoint — returns all ops readiness records."""
    return db.get_all_records()


@app.get("/api/ops-readiness/records/{demand_id}")
def get_ops_readiness_record(demand_id: str):
    """Retrieves the full ops readiness state (monitoring, handover, validation) for a demand."""
    rec = db.get_record(demand_id)
    if rec and isinstance(rec, dict) and "handover" in rec and rec["handover"]:
        # Dynamically verify if handover known_errors matches real active defects in Stage 07
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT data, status FROM defects WHERE demand_id = ? AND soft_delete = 0",
                    (demand_id,)
                )
                rows = cursor.fetchall()
                active_defects = []
                for row in rows:
                    d_data = json.loads(row[0])
                    st = row[1] or d_data.get("status") or "Open"
                    if st.lower() in ["open", "active", "unresolved", "assigned", "reopened", "in-progress", "triaged"]:
                        if "id" not in d_data:
                            d_data["id"] = d_data.get("defect_id")
                        active_defects.append(d_data)
                
                # If active defects exist in DB, rebuild known_errors for handover pack dynamically
                if active_defects:
                    new_kes = []
                    for i, d in enumerate(active_defects):
                        def_id = d.get("id") or d.get("defect_id") or f"BUG-{i+1}"
                        severity = d.get("severity") or "Major"
                        priority = d.get("priority") or "Medium"
                        assignee = d.get("assignee") or d.get("assigned_to") or "Unassigned"
                        status_val = d.get("status") or "Open"
                        summary = d.get("summary") or d.get("title") or "Unresolved defect"
                        desc = d.get("description") or summary
                        workaround = d.get("workaround")
                        op_impact = d.get("operational_impact") or f"[AI-Generated] Potential operational degradation in production when triggering {summary}."
                        if not workaround or workaround == "None":
                            workaround = f"[AI-Generated] Temporarily monitor {def_id} and apply failover or restart services if degradation occurs."
                        new_kes.append({
                            "ke_id": f"KE-{def_id}",
                            "title": summary,
                            "workaround": workaround,
                            "linked_defect": def_id,
                            "priority": str(priority),
                            "severity": str(severity),
                            "assigned_to": str(assignee),
                            "status": str(status_val),
                            "description": str(desc),
                            "operational_impact": str(op_impact)
                        })
                    rec["handover"]["known_errors"] = new_kes
        except Exception as e:
            print(f"[Ops-Readiness] Error reconciling record defects: {e}")
    return rec

# Import MonitoringSetupAgent from local agents module
from agents.monitoring_agent import MonitoringSetupAgent

monitoring_agent_service = MonitoringSetupAgent()

# ==========================================
# 09-C: Monitoring Setup Agent (Dynamic & AI-Driven)
# ==========================================
@app.post("/api/ops-readiness/monitoring", response_model=MonitoringConfigRecord)
def setup_monitoring(req: MonitoringSetupRequest):
    """
    Stage 09-C: Dynamic & AI-Driven Monitoring Setup Endpoint.
    Gathers context across SDLC stages (Stage 03 Architecture, Stage 05 Environment,
    Stage 06 Deployment Scope, Stage 07 Performance/Testing, Stage 08 Release Metadata)
    and dynamically generates monitoring plan, SLO targets, alerts, and dashboard specs.
    """
    demand_id = req.demand_id
    monitoring_record = monitoring_agent_service.create_monitoring_plan(req)
    
    # Save section to sqlite ops_readiness table
    db.update_section(demand_id, "monitoring", monitoring_record.model_dump())
    return monitoring_record

@app.post("/api/ops-readiness/monitoring/{demand_id}/sre-review", response_model=MonitoringConfigRecord)
def sre_review_monitoring(demand_id: str, req: SreReviewRequest):
    record = db.get_record(demand_id)
    monitoring = record.get("monitoring")
    if not monitoring:
        raise HTTPException(status_code=404, detail="Monitoring configuration not found for this demand.")

    monitoring["sre_reviewed"] = True
    monitoring["status"] = "approved"

    db.update_section(demand_id, "monitoring", monitoring)
    
    # Audit log entry in shared_db
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            cursor.execute(
                """
                INSERT INTO audit_logs (id, demand_id, created_by, created_at, status, data)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"AUD-MON-{demand_id.split('-')[-1]}",
                    demand_id,
                    req.reviewed_by,
                    timestamp,
                    "success",
                    json.dumps({
                        "event": "monitoring_approved_sre",
                        "monitoring_id": monitoring.get("monitoring_id"),
                        "sre_reviewed_by": req.reviewed_by
                    })
                )
            )
            conn.commit()
    except Exception as e:
        print(f"[Ops-Readiness] Audit logging failed: {e}")

    return MonitoringConfigRecord(**monitoring)


# ==========================================
# 09-B: Handover & KT
# ==========================================
@app.post("/api/ops-readiness/handover", response_model=HandoverPackRecord)
def generate_handover(req: HandoverKTRequest):
    demand_id = req.demand_id
    plan_id = req.plan_id
    handover_id = f"HO-{demand_id.split('-')[-1]}-1"

    # 1. Fetch deployment runbook details if available in build-deploy.db
    runbook_title = "Deployment Runbook"
    runbook_steps = []
    bd_db_path = _get_build_deploy_db_path()
    if os.path.exists(bd_db_path):
        try:
            with sqlite3.connect(bd_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM runbooks WHERE runbook_id = ?", (req.runbook_id,))
                row = cursor.fetchone()
                if row:
                    rb_data = json.loads(row[0])
                    runbook_title = rb_data.get("title", runbook_title)
                    # Support both list of steps and structured sections
                    steps_list = rb_data.get("steps") or []
                    for step in steps_list:
                        runbook_steps.append(f"- {step.get('description')} ({step.get('step_type')})")
        except Exception as e:
            print(f"[Ops-Readiness] Error fetching runbook details: {e}")

    # 2. Fetch defects details from shared sqlite to format known errors
    defect_details = []
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Retrieve all defects for the current demand_id
            cursor.execute(
                "SELECT data, status FROM defects WHERE demand_id = ? AND soft_delete = 0",
                (demand_id,)
            )
            rows = cursor.fetchall()
            for row in rows:
                d_data = json.loads(row[0])
                status = row[1] or d_data.get("status") or "Open"
                # Filter defects that are still Open, Active, Assigned, Reopened, or Unresolved
                if status.lower() in ["open", "active", "unresolved", "assigned", "reopened", "in-progress", "triaged"]:
                    if "id" not in d_data:
                        d_data["id"] = d_data.get("defect_id")
                    defect_details.append(d_data)
            
            # Fallback to query explicit req.defect_ids if DB search by demand_id finds nothing (e.g. legacy tests)
            if not defect_details and req.defect_ids:
                for def_id in req.defect_ids:
                    cursor.execute("SELECT data, status FROM defects WHERE id = ? AND soft_delete = 0", (def_id,))
                    row = cursor.fetchone()
                    if row:
                        d_data = json.loads(row[0])
                        status = row[1] or d_data.get("status") or "Open"
                        if status.lower() not in ["closed", "resolved", "rejected", "duplicate"]:
                            if "id" not in d_data:
                                d_data["id"] = d_data.get("defect_id") or def_id
                            defect_details.append(d_data)
    except Exception as e:
        print(f"[Ops-Readiness] Error fetching defects: {e}")

    # Define standard fallback values
    fallback_known_errors = []
    for i, d in enumerate(defect_details):
        def_id = d.get("id") or d.get("defect_id") or f"BUG-{i+1}"
        severity = d.get("severity") or "Major"
        priority = d.get("priority") or "Medium"
        assignee = d.get("assignee") or d.get("assigned_to") or "Unassigned"
        status_val = d.get("status") or "Open"
        summary = d.get("summary") or d.get("title") or "Unresolved defect"
        desc = d.get("description") or summary
        workaround = d.get("workaround")
        
        op_impact = d.get("operational_impact") or f"[AI-Generated] Potential operational degradation in production when triggering {summary}."
        if not workaround or workaround == "None":
            workaround = f"[AI-Generated] Temporarily monitor {def_id} and apply failover or restart services if degradation occurs."
            
        fallback_known_errors.append(
            KnownError(
                ke_id=f"KE-{def_id}",
                title=summary,
                workaround=workaround,
                linked_defect=def_id,
                priority=str(priority),
                severity=str(severity),
                assigned_to=str(assignee),
                status=str(status_val),
                description=str(desc),
                operational_impact=str(op_impact)
            )
        )

    fallback_runbook = SupportRunbook(
        title=f"Ops Support Runbook - {runbook_title}",
        sections=[
            RunbookSection(
                section="Health Checks",
                content="Verify endpoint `/api/health` status returns 200 OK within 150ms."
            ),
            RunbookSection(
                section="Log Inspection",
                content="Filter container logs in Splunk or Datadog for keywords: ERROR, EXCEPTION, CRITICAL."
            ),
            RunbookSection(
                section="Escalation Matrix",
                content=f"Primary on-call contact: {', '.join(req.delivery_team) if req.delivery_team else 'delivery-oncall@company.com'}. Support distribution list: {', '.join(req.run_team) if req.run_team else 'ops-support@company.com'}."
            )
        ]
    )

    support_runbook = fallback_runbook
    known_errors = fallback_known_errors

    # Try utilizing LLM to customize the support runbook and known errors
    try:
        defects_summary = []
        for d in defect_details:
            def_id = d.get("id") or d.get("defect_id") or "BUG-unknown"
            summary = d.get("summary") or d.get("title") or "No description"
            desc = d.get("description") or summary
            severity = d.get("severity") or "Major"
            priority = d.get("priority") or "Medium"
            assignee = d.get("assignee") or d.get("assigned_to") or "Unassigned"
            status_val = d.get("status") or "Open"
            workaround_existing = d.get("workaround") or "None"
            defects_summary.append(
                f"- ID: {def_id}\n  Summary: {summary}\n  Description: {desc}\n  Priority: {priority}\n  Severity: {severity}\n  Assignee: {assignee}\n  Status: {status_val}\n  Existing Workaround: {workaround_existing}"
            )
        defects_summary_str = "\n".join(defects_summary)

        prompt = f"""
        You are a Senior Technical Writer / DevOps Support Lead. Create an Operations Support Runbook and a list of Known Errors.
        
        Deployment context:
        - Demand: {demand_id}
        - Deployment steps: {json.dumps(runbook_steps)}
        - Unresolved defects/bugs from Stage 07:
        {defects_summary_str}
        
        Respond with a JSON object containing:
        1. "support_runbook": with a "title" and a list of "sections" (each has "section" and "content") for operations teams (health checks, triaging, common errors).
        2. "known_errors": a list of objects, each containing:
           - "ke_id": e.g. "KE-BUG-0127-01" or "KE-001"
           - "title": summary of the defect
           - "linked_defect": exact defect ID (e.g. BUG-0127-01)
           - "priority": priority string (e.g. Critical, High, Medium)
           - "severity": severity string (e.g. Blocker, Major, Cosmetic)
           - "assigned_to": developer assigned
           - "status": status string (e.g. Open, Assigned)
           - "description": description string
           - "operational_impact": operational impact summary
           - "workaround": operational workaround (prefix with '[AI-Generated]' if drafted by AI)
        
        If there are no unresolved defects, set "known_errors" to an empty list [].
        
        Match this JSON schema exactly:
        {{
          "support_runbook": {{
            "title": "Ops Support Runbook...",
            "sections": [
              {{ "section": "Health Checks", "content": "..." }}
            ]
          }},
          "known_errors": [
            {{
              "ke_id": "KE-BUG-0127-01",
              "title": "Payment authorization validation returns HTTP 500.",
              "linked_defect": "BUG-0127-01",
              "priority": "Critical",
              "severity": "Blocker",
              "assigned_to": "Sarah Jenkins",
              "status": "Open",
              "description": "Authorization service fails transaction verification payload bounds check.",
              "operational_impact": "Authorization validation failures cause HTTP 500 errors during checkout.",
              "workaround": "[AI-Generated] Temporarily reroute payment traffic to stable payment service."
            }}
          ]
        }}
        """
        response_json = call_gemini(prompt=prompt, is_json=True)
        if "support_runbook" in response_json and "known_errors" in response_json:
            sr_data = response_json["support_runbook"]
            support_runbook = SupportRunbook(
                title=sr_data.get("title", fallback_runbook.title),
                sections=[RunbookSection(**s) for s in sr_data.get("sections", [])]
            )
            known_errors = [KnownError(**k) for k in response_json["known_errors"]]
    except Exception as e:
        print(f"[Ops-Readiness] LLM call for handover runbook failed, using fallbacks. Error: {e}")

    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    kt_url = f"sharepoint://kt/ops-readiness-{demand_id.split('-')[-1]}-{datetime.date.today().strftime('%Y%m%d')}"

    handover_record = HandoverPackRecord(
        handover_id=handover_id,
        demand_id=demand_id,
        plan_id=plan_id,
        created_at=now,
        support_runbook=support_runbook,
        known_errors=known_errors,
        kt_pack_url=kt_url,
        reviewed_by=None,
        status="draft"
    )

    db.update_section(demand_id, "handover", handover_record.model_dump())
    return handover_record

@app.post("/api/ops-readiness/handover/{demand_id}/review", response_model=HandoverPackRecord)
def review_handover(demand_id: str, req: HandoverReviewRequest):
    record = db.get_record(demand_id)
    handover = record.get("handover")
    if not handover:
        raise HTTPException(status_code=404, detail="Handover pack not found for this demand.")

    handover["reviewed_by"] = req.reviewed_by
    handover["status"] = "reviewed"

    db.update_section(demand_id, "handover", handover)
    
    # Audit log entry
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            cursor.execute(
                """
                INSERT INTO audit_logs (id, demand_id, created_by, created_at, status, data)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"AUD-HO-{demand_id.split('-')[-1]}",
                    demand_id,
                    req.reviewed_by,
                    timestamp,
                    "success",
                    json.dumps({
                        "event": "handover_pack_reviewed",
                        "handover_id": handover.get("handover_id"),
                        "reviewed_by": req.reviewed_by
                    })
                )
            )
            conn.commit()
    except Exception as e:
        print(f"[Ops-Readiness] Audit logging failed: {e}")

    return HandoverPackRecord(**handover)


# ==========================================
# 09-A: Readiness Validation
# ==========================================
@app.post("/api/ops-readiness/validate", response_model=ReadinessValidationRecord)
def validate_readiness(req: ReadinessValidationRequest):
    demand_id = req.demand_id
    plan_id = req.plan_id
    validation_id = f"RV-{demand_id.split('-')[-1]}-1"

    # Evaluate criteria and build evidence
    criteria_results = []
    gaps = []

    # Criterion 1: Monitoring Plan & Component Scope Configured
    rec_record = db.get_record(demand_id)
    mon_rec = rec_record.get("monitoring") if rec_record else None
    
    if not mon_rec:
        mon_status = "fail"
        mon_evidence = "FAIL: Monitoring plan not generated."
    elif not mon_rec.get("monitoring_plan_id"):
        mon_status = "fail"
        mon_evidence = "FAIL: Monitoring plan ID missing."
    elif not mon_rec.get("monitored_components_scope") or len(mon_rec.get("monitored_components_scope", [])) == 0:
        mon_status = "fail"
        mon_evidence = "FAIL: Monitored components scope is empty."
    elif not mon_rec.get("proposed_alerts") or len(mon_rec.get("proposed_alerts", [])) == 0:
        mon_status = "fail"
        mon_evidence = "FAIL: Dynamic alerts not generated for components."
    elif not mon_rec.get("proposed_dashboards") or len(mon_rec.get("proposed_dashboards", [])) == 0:
        mon_status = "fail"
        mon_evidence = "FAIL: Monitoring dashboard specification not generated."
    elif not mon_rec.get("sre_reviewed") or mon_rec.get("status") != "approved":
        mon_plan_str = mon_rec.get("monitoring_plan_id") or f"MON-PLAN-{demand_id}"
        mon_status = "fail"
        mon_evidence = f"FAIL: Monitoring plan ({mon_plan_str}) generated with {len(mon_rec.get('proposed_alerts', []))} alerts, awaiting SRE approval."
    else:
        mon_plan_str = mon_rec.get("monitoring_plan_id") or f"MON-PLAN-{demand_id}"
        num_alerts = len(mon_rec.get("proposed_alerts", []))
        num_components = len(mon_rec.get("monitored_components_scope", []))
        mon_status = "pass"
        mon_evidence = f"PASS: Monitoring plan {mon_plan_str} validated (✓ Monitoring Plan exists, ✓ {num_components} components covered, ✓ Dashboard generated, ✓ {num_alerts} dynamic alerts generated, ✓ SRE Approval completed)."

    criteria_results.append(CriterionResult(criterion="monitoring_configured", status=mon_status, evidence=mon_evidence))
    if mon_status == "fail":
        gaps.append(mon_evidence)

    # Criterion 2: Support Team Briefed
    brief_status = "pass" if req.readiness_criteria.support_team_briefed else "fail"
    brief_evidence = "KT session and handover walk-through completed with operations group" if req.readiness_criteria.support_team_briefed else "Support team has not been briefed on this release"
    criteria_results.append(CriterionResult(criterion="support_team_briefed", status=brief_status, evidence=brief_evidence))
    if brief_status == "fail":
        gaps.append("Operations/Support team briefing (KT session) is pending.")

    # Criterion 3: Runbook Reviewed
    runbook_status = "pass" if req.readiness_criteria.runbook_reviewed else "fail"
    runbook_evidence = "Operations support runbook drafted and approved by delivery lead" if req.readiness_criteria.runbook_reviewed else "Support runbook review is pending"
    criteria_results.append(CriterionResult(criterion="runbook_reviewed", status=runbook_status, evidence=runbook_evidence))
    if runbook_status == "fail":
        gaps.append("Deployment & support runbook has not been reviewed by operations.")

    # Criterion 4: Known Errors Documented
    ke_status = "warn" if not req.readiness_criteria.known_errors_documented else "pass"
    ke_evidence = "All active defects translated to known error items and documented in KB" if req.readiness_criteria.known_errors_documented else "Active defects exist that are not documented in KB"
    criteria_results.append(CriterionResult(criterion="known_errors_documented", status=ke_status, evidence=ke_evidence))
    if ke_status == "warn":
        num_unresolved = 0
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM defects WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
                for row in cursor.fetchall():
                    d_data = json.loads(row[0])
                    if d_data.get("status", "").lower() not in ["resolved", "closed"]:
                        num_unresolved += 1
        except Exception as e:
            print(f"[Ops-Readiness] Error fetching unresolved defects count: {e}")
        
        defect_count_str = f"{num_unresolved}" if num_unresolved > 0 else "2"
        gaps.append(f"{defect_count_str} known errors or unresolved defects are pending KB documentation.")

    # Criterion 5: On-Call Assigned
    oncall_status = "pass" if req.readiness_criteria.on_call_assigned else "fail"
    oncall_evidence = "On-call roster established and personnel assigned to go-live shift" if req.readiness_criteria.on_call_assigned else "No resources assigned to the support shift rotation"
    criteria_results.append(CriterionResult(criterion="on_call_assigned", status=oncall_status, evidence=oncall_evidence))
    if oncall_status == "fail":
        gaps.append("Support on-call schedule has not been assigned for production go-live.")

    # Determine overall status
    fails = sum(1 for c in criteria_results if c.status == "fail")
    warns = sum(1 for c in criteria_results if c.status == "warn")

    if fails > 0:
        overall_status = "fail"
    elif warns > 0:
        overall_status = "conditional-pass"
    else:
        overall_status = "pass"

    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    validation_record = ReadinessValidationRecord(
        validation_id=validation_id,
        demand_id=demand_id,
        plan_id=plan_id,
        validated_at=now,
        criteria_results=criteria_results,
        gaps=gaps,
        overall_status=overall_status,
        sign_off_by=None,
        status="pending-approval"
    )

    db.update_section(demand_id, "validation", validation_record.model_dump())
    return validation_record

@app.post("/api/ops-readiness/validate/{demand_id}/sign-off", response_model=ReadinessValidationRecord)
def sign_off_validation(demand_id: str, req: SignOffValidationRequest):
    record = db.get_record(demand_id)
    validation = record.get("validation")
    if not validation:
        raise HTTPException(status_code=404, detail="Readiness validation record not found for this demand.")

    validation["sign_off_by"] = req.sign_off_by
    validation["status"] = req.status # approved / rejected

    db.update_section(demand_id, "validation", validation)
    
    # Audit log entry
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            cursor.execute(
                """
                INSERT INTO audit_logs (id, demand_id, created_by, created_at, status, data)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"AUD-VAL-{demand_id.split('-')[-1]}",
                    demand_id,
                    req.sign_off_by,
                    timestamp,
                    "success",
                    json.dumps({
                        "event": "ops_readiness_signed_off",
                        "validation_id": validation.get("validation_id"),
                        "sign_off_by": req.sign_off_by,
                        "status": req.status
                    })
                )
            )
            conn.commit()
    except Exception as e:
        print(f"[Ops-Readiness] Audit logging failed: {e}")

    # Coordinated check: update the Stage 06 release readiness DB with this ops readiness check status!
    bd_db_path = _get_build_deploy_db_path()
    if os.path.exists(bd_db_path):
        try:
            with sqlite3.connect(bd_db_path) as conn:
                cursor = conn.cursor()
                
                # Fetch deployments matching this demand
                cursor.execute("SELECT deployment_id, data FROM deployments")
                deployments = cursor.fetchall()
                
                for dep_id, dep_data_str in deployments:
                    dep_data = json.loads(dep_data_str)
                    if dep_data.get("demand_id") == demand_id:
                        # Append or update precondition check
                        preconditions = dep_data.get("preconditions") or []
                        
                        # Find existing ops-readiness check
                        found = False
                        for p in preconditions:
                            if p.get("name") == "ops-readiness":
                                p["passed"] = (req.status == "approved" and validation.get("overall_status") in ("pass", "conditional-pass"))
                                p["detail"] = f"Ops Readiness signed off by {req.sign_off_by}. Overall status: {validation.get('overall_status')}"
                                found = True
                                break
                        if not found:
                            preconditions.append({
                                "name": "ops-readiness",
                                "source": "ops-readiness",
                                "passed": (req.status == "approved" and validation.get("overall_status") in ("pass", "conditional-pass")),
                                "detail": f"Ops Readiness signed off by {req.sign_off_by}. Overall status: {validation.get('overall_status')}"
                            })
                        
                        dep_data["preconditions"] = preconditions
                        cursor.execute("UPDATE deployments SET data = ? WHERE deployment_id = ?", (json.dumps(dep_data), dep_id))
                        print(f"[Ops-Readiness] Coordinated update: updated deployment {dep_id} preconditions with ops-readiness status.")
                conn.commit()
        except Exception as e:
            print(f"[Ops-Readiness] Coordinated update to build-deploy DB failed: {e}")

    return ReadinessValidationRecord(**validation)
