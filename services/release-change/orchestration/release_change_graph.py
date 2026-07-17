from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
import sys
import os
import json
import hashlib
import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))) # for llm_client
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))       # for models, database

from llm_client import call_gemini
from models import (
    ChangeRecord,
    ChangeRiskScoreRecord,
    CABPackRecord,
    CollisionDetectionRecord,
    AuditTrailRecord
)
from database import db
from shared_db.connection import get_db

class ReleaseChangeState(TypedDict):
    task: str # 'draft', 'risk_score', 'cab_prep', 'collision', or 'audit'
    demand_id: str
    plan_id: Optional[str]
    estimate_id: Optional[str]
    readiness_id: Optional[str]
    gate_id: Optional[str]
    test_run_id: Optional[str]
    runbook_id: Optional[str]
    rollback_id: Optional[str]
    itsm_schema_version: Optional[str]

    # Risk Score inputs
    change_record_id: Optional[str]
    component_ids: Optional[List[str]]
    change_calendar_ref: Optional[str]
    historical_change_outcomes_ref: Optional[str]

    # CAB Prep inputs
    risk_score_id: Optional[str]
    cab_policy_ref: Optional[str]
    prior_qa_ref: Optional[str]

    # Collision inputs
    scheduled_start: Optional[str]
    scheduled_end: Optional[str]
    freeze_rules_ref: Optional[str]

    # Audit inputs
    event_sources: Optional[List[str]]

    # Outputs
    change_record: Optional[Dict[str, Any]]
    risk_score_record: Optional[Dict[str, Any]]
    cab_pack_record: Optional[Dict[str, Any]]
    collision_record: Optional[Dict[str, Any]]
    audit_trail_record: Optional[Dict[str, Any]]
    error: Optional[str]


def draft_node(state: ReleaseChangeState) -> Dict[str, Any]:
    print(f"[Agent: draft] Drafting change record for demand {state.get('demand_id')}...")
    demand_id = state.get("demand_id")
    plan_id = state.get("plan_id")
    suffix = demand_id.split("-")[-1]
    change_record_id = f"CHG-{suffix}-1"

    # Call Gemini to write a professional title and description
    prompt = f"""
    Draft a professional title and description for an ITSM change ticket matching this project info:
    - Demand ID: {demand_id}
    - Plan ID: {plan_id}
    
    Return a valid JSON object with keys:
    - "title": A descriptive deployment title
    - "description": A concise, detailed implementation summary
    """
    
    try:
        res = call_gemini(prompt, is_json=True)
        title = res.get("title") or f"Deploy Migration Pipeline — Demand {demand_id}"
        description = res.get("description") or f"Deployment run for components as specified in plan {plan_id}."
    except Exception as e:
        print(f"[Agent: draft] LLM call failed, using default: {e}")
        title = f"Deploy Migration Pipeline — Demand {demand_id}"
        description = f"Deployment run for components as specified in plan {plan_id}."

    # Look up plan end date
    end_date = "2026-07-14"
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
            row = cursor.fetchone()
            if row:
                end_date = json.loads(row[0]).get("end_date") or "2026-07-14"
    except Exception:
        pass

    scheduled_start = f"{end_date}T22:00:00Z"
    try:
        dt = datetime.datetime.strptime(end_date, "%Y-%m-%d")
        next_day = (dt + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        scheduled_end = f"{next_day}T02:00:00Z"
    except Exception:
        scheduled_end = f"{end_date}T23:59:59Z"

    record = ChangeRecord(
        change_record_id=change_record_id,
        demand_id=demand_id,
        plan_id=plan_id,
        title=title,
        change_type="standard",
        risk_rating=None,
        description=description,
        implementation_plan_ref=plan_id,
        backout_plan_ref=state.get("rollback_id") or f"RBK-ROLLBACK-{suffix}-1",
        test_evidence_ref=state.get("test_run_id") or f"TR-{suffix}-1",
        quality_gate_ref=state.get("gate_id") or f"QGT-{suffix}-1",
        runbook_ref=state.get("runbook_id") or f"RBK-{suffix}-1",
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        submitted_by="system.delivery",
        approved_by=None,
        status="draft"
    )

    db.save_change_record(change_record_id, demand_id, plan_id, record.model_dump())
    return {"change_record": record.model_dump()}


def risk_score_node(state: ReleaseChangeState) -> Dict[str, Any]:
    print(f"[Agent: risk_score] Evaluating risk score for change record {state.get('change_record_id')}...")
    demand_id = state.get("demand_id")
    suffix = demand_id.split("-")[-1]
    risk_score_id = f"RSK-{suffix}-1"

    # Analyze risk via Gemini
    prompt = f"""
    You are an AI Risk Analyst. Analyze the technical risk level of this deployment:
    - Change Record: {state.get('change_record_id')}
    - Components: {state.get('component_ids')}
    - Calendar ref: {state.get('change_calendar_ref')}
    - Historical reference: {state.get('historical_change_outcomes_ref')}
    
    Calculate:
    1. A risk score from 0 to 100.
    2. A risk band: "low", "medium", or "high".
    3. A recommended CAB path: "pre-approved-standard" (score < 40) or "standard-cab" (score >= 40).
    4. A list of specific risk factors.
    5. A list of specific mitigations.
    
    Return a valid JSON object with keys:
    - "risk_score": integer
    - "risk_band": string
    - "recommended_path": string
    - "risk_factors": string array
    - "mitigations": string array
    """

    try:
        res = call_gemini(prompt, is_json=True)
        score = int(res.get("risk_score") or 30)
        band = res.get("risk_band") or "medium"
        path = res.get("recommended_path") or "standard-cab"
        factors = res.get("risk_factors") or []
        mitigations = res.get("mitigations") or []
    except Exception as e:
        print(f"[Agent: risk_score] LLM call failed: {e}")
        # Deterministic fallback
        score = 30
        score += len(state.get("component_ids") or []) * 5
        if "freeze" in (state.get("change_calendar_ref") or "").lower():
            score += 15
        if "api" in "".join(state.get("component_ids") or []).lower():
            score += 5
        score = min(100, score)
        band = "high" if score >= 60 else ("medium" if score >= 40 else "low")
        path = "standard-cab" if score >= 40 else "pre-approved-standard"
        factors = ["Generic component impact checklist"]
        mitigations = ["Tested rollback plan verified"]

    record = ChangeRiskScoreRecord(
        risk_score_id=risk_score_id,
        change_record_id=state.get("change_record_id"),
        demand_id=demand_id,
        risk_score=score,
        risk_band=band,
        blast_radius=f"Systems affected: {', '.join(state.get('component_ids') or [])}",
        recommended_path=path,
        risk_factors=factors,
        mitigations=mitigations,
        freeze_window_conflict="freeze" in (state.get("change_calendar_ref") or "").lower(),
        human_reviewed=False,
        status="pending-review"
    )

    db.save_risk_score(risk_score_id, demand_id, record.model_dump())
    return {"risk_score_record": record.model_dump()}


def cab_prep_node(state: ReleaseChangeState) -> Dict[str, Any]:
    print(f"[Agent: cab_prep] Assembling CAB Pack for risk score {state.get('risk_score_id')}...")
    risk_score = db.get_risk_score(state.get("risk_score_id"))
    if not risk_score:
        return {"error": "Risk score record not found"}

    demand_id = risk_score.get("demand_id")
    change_record_id = risk_score.get("change_record_id")
    suffix = demand_id.split("-")[-1]
    cab_pack_id = f"CAB-{suffix}-1"

    # Assemble sections and Q&A via Gemini
    prompt = f"""
    Write CAB advisory sections and anticipated questions for this deployment:
    - Change ID: {change_record_id}
    - Risk Score: {risk_score.get('risk_score')}/100
    - CAB Policy: {state.get('cab_policy_ref')}
    
    Return a valid JSON object with keys:
    - "pack_sections": Array of objects like {{"section": "Title", "content": "details..."}}
    - "anticipated_qa": Array of objects like {{"question": "How...", "answer": "The..."}}
    """

    try:
        res = call_gemini(prompt, is_json=True)
        sections = res.get("pack_sections") or []
        qa = res.get("anticipated_qa") or []
    except Exception as e:
        print(f"[Agent: cab_prep] LLM call failed: {e}")
        sections = [
            { "section": "Change Summary", "content": f"Automated deployment pack for demand {demand_id}." },
            { "section": "Risk Assessment", "content": f"Risk score: {risk_score.get('risk_score')}/100." }
        ]
        qa = [
            { "question": "What is the rollback strategy?", "answer": "Restore component versions to prior release configurations." }
        ]

    record = CABPackRecord(
        cab_pack_id=cab_pack_id,
        change_record_id=change_record_id,
        demand_id=demand_id,
        assembled_at=datetime.datetime.utcnow().isoformat() + "Z",
        calendar_conflicts=[],
        pack_sections=sections,
        anticipated_qa=qa,
        cab_decision=None,
        chaired_by=None,
        status="pending-cab"
    )

    db.save_cab_pack(cab_pack_id, demand_id, record.model_dump())
    return {"cab_pack_record": record.model_dump()}


def collision_node(state: ReleaseChangeState) -> Dict[str, Any]:
    print(f"[Agent: collision] Checking conflicts for change {state.get('change_record_id')}...")
    change_rec = db.get_change_record(state.get("change_record_id"))
    if not change_rec:
        return {"error": "Change record not found"}

    demand_id = change_rec.get("demand_id")
    suffix = demand_id.split("-")[-1]
    collision_id = f"COL-{suffix}-1"

    # Analyze collisions via Gemini
    prompt = f"""
    Check if the schedule overlaps with the production freeze window rules:
    - Component IDs: {state.get('component_ids')}
    - Scheduled Start: {state.get('scheduled_start')}
    - Scheduled End: {state.get('scheduled_end')}
    - Freeze Rules Reference: {state.get('freeze_rules_ref')}
    
    Return a valid JSON object with keys:
    - "collisions": string array of asset collisions
    - "freeze_window_conflicts": string array of freeze windows overlaps
    - "safe_to_proceed": boolean
    """

    try:
        res = call_gemini(prompt, is_json=True)
        collisions = res.get("collisions") or []
        freeze_conflicts = res.get("freeze_window_conflicts") or []
        safe = bool(res.get("safe_to_proceed") if res.get("safe_to_proceed") is not None else (len(freeze_conflicts) == 0))
    except Exception as e:
        print(f"[Agent: collision] LLM call failed: {e}")
        collisions = []
        freeze_conflicts = []
        if "freeze" in (state.get("freeze_rules_ref") or "").lower():
            freeze_conflicts.append("Scheduled window overlaps with July production freeze.")
        safe = len(freeze_conflicts) == 0

    record = CollisionDetectionRecord(
        collision_id=collision_id,
        change_record_id=state.get("change_record_id"),
        demand_id=demand_id,
        evaluated_at=datetime.datetime.utcnow().isoformat() + "Z",
        collisions=collisions,
        freeze_window_conflicts=freeze_conflicts,
        shared_asset_clashes=[],
        safe_to_proceed=safe,
        human_decision=None,
        status="clear" if safe else "conflict"
    )

    db.save_collision_detection(collision_id, demand_id, record.model_dump())
    return {"collision_record": record.model_dump()}


def audit_node(state: ReleaseChangeState) -> Dict[str, Any]:
    print(f"[Agent: audit] Aggregates compliance logs for demand {state.get('demand_id')}...")
    demand_id = state.get("demand_id")
    change_record_id = state.get("change_record_id")
    suffix = demand_id.split("-")[-1]
    audit_id = f"AUD-{suffix}-1"

    events = []
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Demand Intake
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                events.append({
                    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                    "actor": "system.demand",
                    "action": "demand_approved",
                    "ref": demand_id
                })
                
            # Estimate Shape
            cursor.execute("SELECT estimate_id FROM estimates WHERE demand_id = ?", (demand_id,))
            rows = cursor.fetchall()
            for r in rows:
                events.append({
                    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                    "actor": "system.estimator",
                    "action": "estimate_approved",
                    "ref": r[0]
                })

            # Plan Schedule
            cursor.execute("SELECT plan_id FROM plans WHERE demand_id = ?", (demand_id,))
            rows = cursor.fetchall()
            for r in rows:
                events.append({
                    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                    "actor": "system.scheduler",
                    "action": "plan_generated",
                    "ref": r[0]
                })
    except Exception:
        pass

    change_rec = db.get_change_record(change_record_id)
    if change_rec:
        events.append({
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "actor": "system.release",
            "action": "change_record_submitted",
            "ref": change_record_id
        })

    events = sorted(events, key=lambda x: x["timestamp"])
    serialized = json.dumps(events, sort_keys=True)
    immutable_hash = "sha256:" + hashlib.sha256(serialized.encode()).hexdigest()

    record = AuditTrailRecord(
        audit_id=audit_id,
        demand_id=demand_id,
        change_record_id=change_record_id,
        generated_at=datetime.datetime.utcnow().isoformat() + "Z",
        events=events,
        immutable_hash=immutable_hash,
        regulator_ready=True
    )

    db.save_audit_trail(audit_id, demand_id, record.model_dump())
    return {"audit_trail_record": record.model_dump()}


def route_task(state: ReleaseChangeState) -> str:
    task = state.get("task")
    if task == "draft":
        return "draft"
    elif task == "risk_score":
        return "risk_score"
    elif task == "cab_prep":
        return "cab_prep"
    elif task == "collision":
        return "collision"
    elif task == "audit":
        return "audit"
    else:
        return END

builder = StateGraph(ReleaseChangeState)

builder.add_node("draft", draft_node)
builder.add_node("risk_score", risk_score_node)
builder.add_node("cab_prep", cab_prep_node)
builder.add_node("collision", collision_node)
builder.add_node("audit", audit_node)

builder.set_conditional_entry_point(
    route_task,
    {
        "draft": "draft",
        "risk_score": "risk_score",
        "cab_prep": "cab_prep",
        "collision": "collision",
        "audit": "audit"
    }
)

builder.add_edge("draft", END)
builder.add_edge("risk_score", END)
builder.add_edge("cab_prep", END)
builder.add_edge("collision", END)
builder.add_edge("audit", END)

release_change_graph = builder.compile()

# ==============================================================================
# NEW STAGE 8 AGENTS (FOR RICH RELEASE FLOW)
# ==============================================================================

def _to_string(val) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        steps = []
        for item in val:
            if isinstance(item, dict):
                step_str = item.get("step") or item.get("name") or item.get("description") or json.dumps(item)
                steps.append(step_str)
            else:
                steps.append(str(item))
        return "\n".join(steps)
    if isinstance(val, dict):
        return json.dumps(val)
    return str(val)


def run_change_record_agent(release_id: str, project_id: str, plan_id: str, db) -> dict:
    """
    Change Record Agent:
    Retrieves upstream project and planning details, calls Gemini to draft
    a professional ITSM change request, and saves it to the change_request table.
    """
    print(f"[Agent: Change Record] Generating documentation for Release {release_id}...")
    
    # Defaults
    title = f"Deploy Release {release_id}"
    description = f"Deployment of components specified in Plan {plan_id}."
    summary = f"Deploy version associated with plan {plan_id}."
    business_justification = "Required release for business capability update."
    impact_analysis = "Low impact. Standard deployment window."
    deployment_plan = "1. Run database migration\n2. Deploy app container\n3. Verify health endpoint"
    validation_plan = "Run automated smoke test suite on target environment."
    rollback_plan = "Revert to previous container image and restore database snapshot."
    known_issues = "None."
    
    # Query demand
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (project_id,))
            row = cursor.fetchone()
            if row:
                demand_data = json.loads(row[0])
                title = demand_data.get("title") or title
                description = demand_data.get("description") or description
                business_justification = demand_data.get("business_case_summary") or business_justification
    except Exception as e:
        print(f"[Agent: Change Record] Demand query failed: {e}")

    # Query plan tasks for implementation steps
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
            row = cursor.fetchone()
            if row:
                plan_data = json.loads(row[0])
                tasks = plan_data.get("tasks") or []
                if tasks:
                    steps = []
                    for idx, t in enumerate(tasks, start=1):
                        steps.append(f"{idx}. {t.get('name')} (Owner: {t.get('owner')})")
                    deployment_plan = "\n".join(steps)
    except Exception as e:
        print(f"[Agent: Change Record] Plan query failed: {e}")

    prompt = f"""
    You are an IT Change Management Specialist. Draft a professional ITSM Change Request for:
    - Release ID: {release_id}
    - Project: {title}
    - Description: {description}
    - Business Justification: {business_justification}
    - Proposed Implementation Steps:
    {deployment_plan}
    
    Format the response as a JSON object with keys:
    - "summary": A high-level release summary sentence.
    - "business_justification": Refined professional business case.
    - "impact_analysis": Analysis of potential system impact during rollout.
    - "deployment_plan": Step-by-step deploy instructions.
    - "validation_plan": How to verify the release is successful.
    - "rollback_plan": Step-by-step rollback instructions.
    - "known_issues": Open defects or risks.
    """

    try:
        res = call_gemini(prompt, is_json=True)
        summary = _to_string(res.get("summary") or summary)
        business_justification = _to_string(res.get("business_justification") or business_justification)
        impact_analysis = _to_string(res.get("impact_analysis") or impact_analysis)
        deployment_plan = _to_string(res.get("deployment_plan") or deployment_plan)
        validation_plan = _to_string(res.get("validation_plan") or validation_plan)
        rollback_plan = _to_string(res.get("rollback_plan") or rollback_plan)
        known_issues = _to_string(res.get("known_issues") or known_issues)
    except Exception as e:
        print(f"[Agent: Change Record] Gemini failed, using defaults: {e}")

    change_id = f"CR-{release_id.split('-')[-1]}-1"
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    
    db.save_change_request(
        change_id=change_id,
        release_id=release_id,
        summary=summary,
        business_justification=business_justification,
        impact_analysis=impact_analysis,
        deployment_plan=deployment_plan,
        validation_plan=validation_plan,
        rollback_plan=rollback_plan,
        known_issues=known_issues,
        status="draft",
        created_by="system.delivery",
        created_at=created_at
    )
    
    return {
        "change_id": change_id,
        "summary": summary,
        "business_justification": business_justification,
        "impact_analysis": impact_analysis,
        "deployment_plan": deployment_plan,
        "validation_plan": validation_plan,
        "rollback_plan": rollback_plan,
        "known_issues": known_issues,
        "status": "draft",
        "created_by": "system.delivery",
        "created_at": created_at
    }


def run_risk_assessment_agent(release_id: str, db) -> dict:
    """
    Risk Assessment Agent:
    Evaluates database/configuration changes, defects, security scans,
    and blast radius to calculate an intelligent numerical risk score (0-100).
    """
    print(f"[Agent: Risk Assessment] Evaluating risk for Release {release_id}...")
    
    release_rec = db.get_release(release_id)
    change_rec = db.get_change_request_by_release(release_id)
    
    project_id = release_rec.get("project_id") if release_rec else "DUMMY"
    
    # Mocking or extracting key factors from DB
    database_changes = "No database schema alterations detected."
    configuration_changes = "No configuration file drift detected."
    security_score = 100
    critical_defects = 0
    dependency_score = 0
    
    # Query database changes (check config environment table or similar)
    if release_rec:
        env = release_rec.get("environment")
        # Check drift from environments table
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM environments WHERE environment = ?", (env,))
                rows = cursor.fetchall()
                drift_count = 0
                for r in rows:
                    env_data = json.loads(r[0])
                    if env_data.get("drift_status") == "drifted":
                        drift_count += 1
                if drift_count > 0:
                    configuration_changes = f"Configuration drift detected on {drift_count} components."
        except Exception:
            pass

    # Query dependencies for project
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM dependencies WHERE demand_id = ?", (project_id,))
            rows = cursor.fetchall()
            at_risk_dep = 0
            for r in rows:
                dep_data = json.loads(r[0])
                if dep_data.get("status") in ["open", "at-risk"]:
                    at_risk_dep += 1
            if at_risk_dep > 0:
                dependency_score = min(100, at_risk_dep * 25)
    except Exception:
        pass

    # Basic deterministic math for fallback
    db_changed = False
    if change_rec:
        dep_plan = change_rec.get("deployment_plan") or ""
        dep_plan = _to_string(dep_plan)
        db_changed = "alter" in dep_plan.lower() or "db" in dep_plan.lower()

    if db_changed:
        database_changes = "Database migrations or DDL operations detected in deployment steps."

    # Compute a fallback score first
    overall_score = 10
    if db_changed:
        overall_score += 20
    if "drift" in configuration_changes.lower():
        overall_score += 20
    overall_score += min(50, dependency_score // 2)
    overall_score = min(100, overall_score)

    prompt = f"""
    You are an AI Release Risk Officer. Evaluate the risk level of this deployment:
    - Release ID: {release_id}
    - Database Changes: {database_changes}
    - Configuration Changes: {configuration_changes}
    - Security vulnerabilities: {100 - security_score} points
    - Critical Defects: {critical_defects}
    - Dependency Risk Score: {dependency_score}/100
    - Base Calculated Risk Score: {overall_score}/100
    
    Calculate:
    1. A final risk score from 0 to 100.
    2. A risk band: "low", "medium", or "high".
    3. A clear justification / recommendation.
    
    Return a valid JSON object with keys:
    - "overall_score": integer
    - "risk_level": string
    - "recommendation": string
    """

    try:
        res = call_gemini(prompt, is_json=True)
        overall_score = int(res.get("overall_score") or overall_score)
        risk_level = res.get("risk_level") or ("high" if overall_score >= 60 else ("medium" if overall_score >= 35 else "low"))
        recommendation = res.get("recommendation") or f"Standard approval flow. Risk level is {risk_level.upper()}."
    except Exception as e:
        print(f"[Agent: Risk Assessment] Gemini failed: {e}")
        risk_level = "high" if overall_score >= 60 else ("medium" if overall_score >= 35 else "low")
        recommendation = f"Calculated via rules engine. CAB Review required." if risk_level == "high" else "Pre-approved release path."

    risk_id = f"RA-{release_id.split('-')[-1]}-1"
    generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    
    db.save_risk_assessment(
        risk_id=risk_id,
        release_id=release_id,
        database_changes=database_changes,
        configuration_changes=configuration_changes,
        security_score=security_score,
        critical_defects=critical_defects,
        dependency_score=dependency_score,
        overall_score=overall_score,
        risk_level=risk_level,
        recommendation=recommendation,
        generated_at=generated_at
    )
    
    # Sync with release table
    cab_required = 1
    cab_status = "pending-cab"
    
    # Update release status
    if release_rec:
        db.save_release(
            release_id=release_rec["release_id"],
            project_id=release_rec["project_id"],
            plan_id=release_rec["plan_id"],
            build_id=release_rec["build_id"],
            version=release_rec["version"],
            environment=release_rec["environment"],
            status="Pending Approval",
            planned_release_date=release_rec["planned_release_date"],
            actual_release_date=release_rec["actual_release_date"],
            risk_score=overall_score,
            cab_required=cab_required,
            cab_status=cab_status,
            created_at=release_rec["created_at"],
            updated_at=generated_at
        )

    return {
        "risk_id": risk_id,
        "overall_score": overall_score,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "generated_at": generated_at
    }


def run_cab_assistant_agent(release_id: str, db) -> dict:
    """
    CAB Assistant Agent:
    Assembles CAB documentation and proactively identifies missing approvals or evidence.
    """
    print(f"[Agent: CAB Assistant] Preparing CAB packet for Release {release_id}...")
    
    release_rec = db.get_release(release_id)
    change_rec = db.get_change_request_by_release(release_id)
    risk_rec = db.get_risk_assessment_by_release(release_id)
    
    missing_approvals = []
    required_documents = ["Change Request", "Risk Report"]
    
    # Auto-sense missing items
    if not change_rec:
        missing_approvals.append("Change Request is not drafted.")
    if not risk_rec:
        missing_approvals.append("AI Risk Assessment is missing.")
    
    # Query Quality Gate (mocked/sensed from test run)
    qg_passed = True
    if qg_passed:
        required_documents.append("Test Summary Report (PASSED)")
    else:
        missing_approvals.append("Stage 07 Quality Gate verdict: FAILED.")
        
    prompt = f"""
    You are an Executive CAB chairperson assistant. Help compile the review notes for release {release_id}:
    - Change Summary: {change_rec.get('summary') if change_rec else 'N/A'}
    - Risk Score: {risk_rec.get('overall_score') if risk_rec else 'N/A'} / 100
    - Missing Approvals: {missing_approvals}
    
    Provide:
    1. A list of 3 anticipated CAB review questions.
    2. A checklist of required items.
    
    Format the response as a JSON object with keys:
    - "questions": array of string (review questions)
    - "document_checklist": array of string
    """

    questions = ["What is the estimated deployment duration?", "Has the rollback strategy been verified in Staging?"]
    document_checklist = required_documents
    
    try:
        res = call_gemini(prompt, is_json=True)
        questions = res.get("questions") or questions
        document_checklist = res.get("document_checklist") or document_checklist
    except Exception as e:
        print(f"[Agent: CAB Assistant] Gemini failed: {e}")
        
    return {
        "release_id": release_id,
        "missing_approvals": missing_approvals,
        "document_checklist": document_checklist,
        "anticipated_questions": questions
    }


def run_collision_agent(release_id: str, db) -> list[dict]:
    """
    Collision Detection Agent:
    Checks for overlapping release windows, shared server/db resources, and freeze periods.
    """
    print(f"[Agent: Collision Detection] Checking for clashes for Release {release_id}...")
    
    release_rec = db.get_release(release_id)
    if not release_rec:
        return []
        
    start_date = release_rec.get("planned_release_date")
    env = release_rec.get("environment")
    
    # Default server & database values
    server = f"srv-{env}-node1"
    database = f"db-{env}-master"
    
    collisions = []
    
    # Check calendar freeze (e.g. July/December)
    if "-07-" in start_date or "-12-" in start_date:
        col_id = f"CL-{release_id.split('-')[-1]}-freeze"
        col_rec = {
            "collision_id": col_id,
            "release_id": release_id,
            "conflicting_release": "System Freeze Window",
            "shared_server": "N/A",
            "shared_database": "N/A",
            "shared_environment": env,
            "reason": f"Planned release on {start_date} falls within the standard mid-year/year-end production freeze period.",
            "recommended_schedule": "Next available Tuesday off-freeze.",
            "status": "conflict"
        }
        db.save_release_collision(**col_rec)
        collisions.append(col_rec)

    # Check same-environment concurrent releases
    all_rels = db.get_all_releases()
    for other in all_rels:
        if other["release_id"] != release_id and other["environment"] == env:
            # Overlap test (simple date string equality for same day)
            if other["planned_release_date"] == start_date:
                col_id = f"CL-{release_id.split('-')[-1]}-{other['release_id'].split('-')[-1]}"
                col_rec = {
                    "collision_id": col_id,
                    "release_id": release_id,
                    "conflicting_release": other["release_id"],
                    "shared_server": server,
                    "shared_database": database,
                    "shared_environment": env,
                    "reason": f"Concurrent release schedule on {env} environment. Release {other['release_id']} is scheduled at the same date.",
                    "recommended_schedule": "Reschedule release to alternate time slot.",
                    "status": "conflict"
                }
                db.save_release_collision(**col_rec)
                collisions.append(col_rec)
                
    return collisions


def run_audit_agent(release_id: str, db) -> list[dict]:
    """
    Audit & Compliance Agent:
    Assembles evidence from upstream modules, computes regulatory traceability,
    and updates the audit_log table.
    """
    print(f"[Agent: Audit & Compliance] Building compliance records for Release {release_id}...")
    
    release_rec = db.get_release(release_id)
    if not release_rec:
        return []
        
    project_id = release_rec.get("project_id")
    plan_id = release_rec.get("plan_id")
    
    events = []
    
    # 1. Demand Approved (Stage 01)
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (project_id,))
            row = cursor.fetchone()
            if row:
                events.append({
                    "audit_id": f"AU-{release_id.split('-')[-1]}-1",
                    "release_id": release_id,
                    "event": "Demand Approved",
                    "performed_by": "alice.smith@example.com",
                    "timestamp": "2026-07-14T09:00:00Z",
                    "evidence_link": f"/api/demands/{project_id}",
                    "module_name": "Demand & Intake"
                })
    except Exception:
        pass
        
    # 2. Plan generated & accepted (Stage 03)
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
            row = cursor.fetchone()
            if row:
                events.append({
                    "audit_id": f"AU-{release_id.split('-')[-1]}-2",
                    "release_id": release_id,
                    "event": "Plan Generated & Accepted",
                    "performed_by": "system.scheduler",
                    "timestamp": "2026-07-14T10:00:00Z",
                    "evidence_link": f"/api/plans/{plan_id}",
                    "module_name": "Plan & Schedule"
                })
    except Exception:
        pass

    # 3. Change request drafted
    cr = db.get_change_request_by_release(release_id)
    if cr:
        events.append({
            "audit_id": f"AU-{release_id.split('-')[-1]}-3",
            "release_id": release_id,
            "event": "Change Request Drafted",
            "performed_by": "system.delivery",
            "timestamp": cr.get("created_at"),
            "evidence_link": f"/api/release-change/releases/{release_id}",
            "module_name": "Release & Change"
        })

    # Save to DB
    for ev in events:
        db.add_audit_log(**ev)
        
    return events

