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


def _build_kt_markdown(demand_id: str, handover: Dict[str, Any]) -> str:
    """
    Renders the real KT/handover content this service already produces (the LLM-drafted
    support runbook + known errors + on-call roster captured on the handover pack) as a
    plain, honest local KT document.

    This is a LOCAL artifact only -- it is not published to SharePoint. Real SharePoint
    integration would require Microsoft Graph API credentials that are not configured in
    this environment, so we do not fabricate a fake SharePoint URL/connector.
    """
    lines = [f"# Knowledge Transfer Package - {demand_id}", ""]
    lines.append(f"- Handover ID: {handover.get('handover_id')}")
    lines.append(f"- Created At: {handover.get('created_at')}")
    lines.append(f"- Status: {handover.get('status')}")
    if handover.get("reviewed_by"):
        lines.append(f"- Reviewed By: {handover.get('reviewed_by')}")
    lines.append("")
    lines.append("_Note: This is a locally-generated KT package. It has not been published to_")
    lines.append("_SharePoint -- Microsoft Graph API integration is not configured in this environment._")
    lines.append("")

    lines.append("## Delivery / On-Call Team")
    delivery_team = handover.get("delivery_team") or []
    run_team = handover.get("run_team") or []
    lines.append(f"- Delivery team: {', '.join(delivery_team) if delivery_team else 'Not assigned'}")
    lines.append(f"- Run/support team: {', '.join(run_team) if run_team else 'Not assigned'}")
    lines.append("")

    sr = handover.get("support_runbook") or {}
    lines.append(f"## {sr.get('title', 'Ops Support Runbook')}")
    for section in (sr.get("sections") or []):
        lines.append(f"### {section.get('section')}")
        lines.append(section.get("content", ""))
        lines.append("")

    lines.append("## Known Errors")
    kes = handover.get("known_errors") or []
    if not kes:
        lines.append("No known errors documented for this release.")
    else:
        for ke in kes:
            lines.append(f"- **{ke.get('ke_id')}** ({ke.get('severity', 'Major')}/{ke.get('priority', 'Medium')}): {ke.get('title')}")
            lines.append(f"  - Linked defect: {ke.get('linked_defect')}")
            lines.append(f"  - Status: {ke.get('status', 'Open')} | Assigned to: {ke.get('assigned_to', 'Unassigned')}")
            lines.append(f"  - Workaround: {ke.get('workaround')}")
    lines.append("")

    return "\n".join(lines)

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

    if not fallback_known_errors and req.defect_ids:
        for def_id in req.defect_ids:
            fallback_known_errors.append(
                KnownError(
                    ke_id=f"KE-{def_id}",
                    title=f"Unresolved defect {def_id}",
                    workaround=f"[AI-Generated] Temporarily monitor {def_id} and apply failover or restart services if degradation occurs.",
                    linked_defect=def_id,
                    priority="Medium",
                    severity="Major",
                    assigned_to="Unassigned",
                    status="Open",
                    description=f"Defect {def_id} reported during Stage 07 testing.",
                    operational_impact=f"Potential operational degradation when triggering features related to {def_id}."
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
                content=f"Primary on-call contact: {', '.join(req.delivery_team) if req.delivery_team else 'bob@example.com, karthik@example.com, fardeen@example.com, alice@example.com, john@example.com, raj@example.com, diana@example.com'}. Support distribution list: {', '.join(req.run_team) if req.run_team else 'ops-support@company.com'}."
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

    # NOTE: Real SharePoint publishing requires Microsoft Graph API credentials that are
    # not configured in this environment. Rather than fabricate a fake sharepoint:// URL
    # that doesn't resolve to anything real, we generate the actual KT document content
    # (the same support runbook + known errors produced above) as a real local artifact
    # and reference that honestly instead. kt_pack_url intentionally uses a "local://"
    # scheme so it is never mistaken for a live SharePoint link.
    kt_filename = f"KT-{demand_id}.md"
    kt_url = f"local://ops-readiness/kt-packages/{kt_filename}"

    handover_record = HandoverPackRecord(
        handover_id=handover_id,
        demand_id=demand_id,
        plan_id=plan_id,
        created_at=now,
        support_runbook=support_runbook,
        known_errors=known_errors,
        kt_pack_url=kt_url,
        delivery_team=req.delivery_team or [],
        run_team=req.run_team or [],
        reviewed_by=None,
        status="draft"
    )

    # Persist the real local KT document (not a SharePoint upload -- see note above).
    try:
        kt_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "exports", "kt_packages"))
        os.makedirs(kt_dir, exist_ok=True)
        kt_content = _build_kt_markdown(demand_id, handover_record.model_dump())
        with open(os.path.join(kt_dir, kt_filename), "w", encoding="utf-8") as f:
            f.write(kt_content)
    except Exception as e:
        print(f"[Ops-Readiness] Error writing local KT package file: {e}")

    db.update_section(demand_id, "handover", handover_record.model_dump())
    return handover_record

@app.get("/api/ops-readiness/handover/{demand_id}/kt-package")
def get_kt_package(demand_id: str):
    """
    Returns the real, locally-generated KT package content (markdown) for viewing or
    downloading in the UI. This is a local artifact, NOT a SharePoint document -- real
    SharePoint publishing requires Microsoft Graph API credentials that are not
    configured in this environment.
    """
    record = db.get_record(demand_id)
    handover = record.get("handover") if record else None
    if not handover:
        raise HTTPException(status_code=404, detail="Handover pack not found for this demand.")

    content = _build_kt_markdown(demand_id, handover)
    return {
        "demand_id": demand_id,
        "filename": f"KT-{demand_id}.md",
        "format": "markdown",
        "is_local_artifact": True,
        "sharepoint_integration": "not_configured",
        "content": content
    }

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

    # Server-side ground truth for criteria 2-5: independently re-derive from the
    # handover pack + defects tables instead of trusting the client-supplied
    # readiness_criteria booleans (those are pre-computed by the frontend from other
    # tabs and are not authoritative). req.readiness_criteria is accepted for backward
    # compatibility but is intentionally NOT used to determine pass/fail below.
    ho_rec = rec_record.get("handover") if rec_record else None
    ho_reviewed = bool(ho_rec) and ho_rec.get("status") == "reviewed" and bool(ho_rec.get("reviewed_by"))

    # Criterion 2: Support Team Briefed (KT session + handover walk-through actually reviewed by ops)
    if not ho_rec:
        brief_status = "fail"
        brief_evidence = "FAIL: No handover/KT pack has been generated for this demand."
    elif not ho_reviewed:
        brief_status = "fail"
        brief_evidence = "FAIL: Handover pack generated but KT walk-through has not been reviewed/accepted by operations."
    else:
        brief_status = "pass"
        brief_evidence = f"PASS: KT session and handover walk-through completed and reviewed by {ho_rec.get('reviewed_by')}."
    criteria_results.append(CriterionResult(criterion="support_team_briefed", status=brief_status, evidence=brief_evidence))
    if brief_status == "fail":
        gaps.append("Operations/Support team briefing (KT session) is pending.")

    # Criterion 3: Runbook Reviewed (a real runbook record exists with content and has been reviewed)
    runbook_sections = (ho_rec.get("support_runbook") or {}).get("sections") if ho_rec else None
    runbook_has_content = bool(runbook_sections) and len(runbook_sections) > 0
    if not ho_rec or not runbook_has_content:
        runbook_status = "fail"
        runbook_evidence = "FAIL: Operations support runbook has not been drafted."
    elif not ho_reviewed:
        runbook_status = "fail"
        runbook_evidence = "FAIL: Support runbook drafted but review/approval by operations is pending."
    else:
        runbook_status = "pass"
        runbook_evidence = f"PASS: Operations support runbook ({len(runbook_sections)} sections) drafted and approved by {ho_rec.get('reviewed_by')}."
    criteria_results.append(CriterionResult(criterion="runbook_reviewed", status=runbook_status, evidence=runbook_evidence))
    if runbook_status == "fail":
        gaps.append("Deployment & support runbook has not been reviewed by operations.")

    # Criterion 4: Known Errors Documented (compare actual active defects vs. documented known-error items)
    active_defect_ids = set()
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data, status FROM defects WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
            for row in cursor.fetchall():
                d_data = json.loads(row[0])
                st = row[1] or d_data.get("status") or "Open"
                if st.lower() not in ["resolved", "closed", "rejected", "duplicate"]:
                    def_id = d_data.get("id") or d_data.get("defect_id")
                    if def_id:
                        active_defect_ids.add(str(def_id))
    except Exception as e:
        print(f"[Ops-Readiness] Error fetching active defects for known-errors check: {e}")

    documented_defect_ids = set()
    if ho_rec:
        for ke in (ho_rec.get("known_errors") or []):
            linked = ke.get("linked_defect")
            if linked:
                documented_defect_ids.add(str(linked))

    num_unresolved = len(active_defect_ids)
    num_undocumented = len(active_defect_ids - documented_defect_ids)

    if num_unresolved == 0:
        ke_status = "pass"
        ke_evidence = "PASS: No active/unresolved defects require known-error documentation."
    elif num_undocumented == 0:
        ke_status = "pass"
        ke_evidence = f"PASS: All {num_unresolved} active defects translated to known error items and documented in KB."
    else:
        ke_status = "warn"
        ke_evidence = f"WARN: {num_undocumented} of {num_unresolved} active defects are not yet documented as known errors in KB."
    criteria_results.append(CriterionResult(criterion="known_errors_documented", status=ke_status, evidence=ke_evidence))
    if ke_status == "warn":
        gaps.append(f"{num_undocumented} known errors or unresolved defects are pending KB documentation.")

    # Criterion 5: On-Call Assigned (real delivery/run team personnel captured on the reviewed handover pack)
    delivery_team = (ho_rec.get("delivery_team") or []) if ho_rec else []
    run_team = (ho_rec.get("run_team") or []) if ho_rec else []
    has_oncall_roster = bool(delivery_team) or bool(run_team)

    if not ho_rec or not has_oncall_roster:
        oncall_status = "fail"
        oncall_evidence = "FAIL: No delivery/run team on-call personnel have been captured on the handover pack."
    elif not ho_reviewed:
        oncall_status = "fail"
        oncall_evidence = "FAIL: On-call roster captured but handover has not been reviewed/accepted by operations yet."
    else:
        oncall_status = "pass"
        roster = list(dict.fromkeys(delivery_team + run_team))
        oncall_evidence = f"PASS: On-call roster established with {len(roster)} personnel assigned to go-live shift ({', '.join(roster)})."
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
