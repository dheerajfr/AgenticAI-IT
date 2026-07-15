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
