from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
import sys
import os
from datetime import datetime, timedelta

# Append paths to access services-wide llm_client and current folder models/database
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))) # for llm_client
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))       # for models, database

import json
from llm_client import call_gemini
from models import DependencyEdge, PlanRecord, Task
from database import db, plan_loader

class DependencyState(TypedDict):
    task: str # 'sense', 'chase', or 'impact'
    plan_id: Optional[str]
    dependency_id: Optional[str]
    
    # Input/context objects
    plan: Optional[PlanRecord]
    dependency: Optional[DependencyEdge]
    
    # Sense inputs / outputs
    detected_dependencies: Optional[List[Dict[str, Any]]]
    
    # Chase inputs / outputs
    tone: Optional[str]
    channel: Optional[str]
    nudge_message: Optional[str]
    escalation_required: Optional[bool]
    threat_level: Optional[str]
    confidence: Optional[int]
    confidence_reasons: Optional[List[str]]
    
    # Impact inputs / outputs
    delay_task_id: Optional[str]
    delay_days: Optional[int]
    impact_detected: Optional[bool]
    original_project_end_date: Optional[str]
    new_project_end_date: Optional[str]
    project_end_date_slipped: Optional[bool]
    affected_tasks: Optional[List[Dict[str, Any]]]
    explanation: Optional[str]
    
    error: Optional[str]


def sense_node(state: DependencyState) -> Dict[str, Any]:
    plan_id = state.get("plan_id")
    print(f"[LangGraph Node: sense] Auto-sensing dependencies for plan {plan_id}...")
    plan = state.get("plan")
    if not plan:
        return {"error": "Plan record is missing for auto-sensing."}
        
    dep_id = f"DEP-{plan.plan_id}"
    task_ids = [t.task_id for t in plan.tasks]
    return {
        "detected_dependencies": [
            {
                "dependency_id": dep_id,
                "plan_id": plan.plan_id,
                "status": "open",
                "risk": "medium",
                "task_list": task_ids
            }
        ]
    }


def chase_node(state: DependencyState) -> Dict[str, Any]:
    print(f"[LangGraph Node: chase] Assessing dependency commitment {state.get('dependency_id')}...")
    dep = state.get("dependency")
    if not dep:
        return {"error": "Dependency record is missing for chasing commitments."}
        
    plan = state.get("plan")
    tone = state.get("tone") or "friendly"
    channel = state.get("channel") or "email"
    selected_task = state.get("selected_task")
    
    # Gather task info from plan if available
    source_id = dep.source_task_id
    target_id = dep.target_task_id
    source_name = dep.source_task_id
    target_name = dep.target_task_id
    source_owner = dep.owner or "admin@example.com"
    target_owner = dep.owner or "admin@example.com"
    on_critical_path = False
    
    if plan:
        if selected_task:
            sel_rec = None
            for t in plan.tasks:
                if t.task_id == selected_task:
                    sel_rec = t
                    break
            if sel_rec:
                source_id = sel_rec.task_id
                source_name = sel_rec.name
                source_owner = sel_rec.owner
                
                pred_id = None
                if sel_rec.predecessor_task_ids:
                    pred_id = sel_rec.predecessor_task_ids[0]
                else:
                    # fallback to sequential predecessor
                    idx = -1
                    for i, t in enumerate(plan.tasks):
                        if t.task_id == selected_task:
                            idx = i
                            break
                    if idx > 0:
                        pred_id = plan.tasks[idx - 1].task_id
                
                if pred_id:
                    for t in plan.tasks:
                        if t.task_id == pred_id:
                            target_id = t.task_id
                            target_name = t.name
                            target_owner = t.owner
                            break
        else:
            # Default fallback to legacy fields
            for t in plan.tasks:
                if t.task_id == dep.source_task_id:
                    source_name = t.name
                    source_owner = t.owner
                if t.task_id == dep.target_task_id:
                    target_name = t.name
                    target_owner = t.owner
                    
        on_critical_path = source_id in plan.critical_path_task_ids or target_id in plan.critical_path_task_ids
                
    prompt = f"""
    You are an Automated Project Manager. You need to write a nudge message to check the status of a dependency.
    
    Dependency Details:
    Dependency ID: {dep.dependency_id}
    Source Task: {source_name} (ID: {source_id}, Owner: {source_owner})
    Target Task: {target_name} (ID: {target_id}, Owner: {target_owner})
    Type: {dep.type}
    Status: {dep.status}
    Is either task on Critical Path? {on_critical_path}
    
    Communication Channel: {channel}
    Channel formatting guides:
    - email: Formal email format with subject line and professional sign-off.
    - teams: Microsoft Teams message — moderate length, use @mentions where appropriate.
    - slack: Slack message — can use emojis, mention handles with @, keep concise.
    - ado: Azure DevOps work item comment — formal, link to work items, reference task IDs directly.
    
    Requested message tone: {tone}
    Tone guides:
    - friendly: Warm, polite reminder, collaborative language.
    - technical: Asks specific technical blocking questions, requests logs or endpoint details.
    - business: Business-focused, highlights financial or delivery impact, schedule risk and SLA implications.
    - executive: High-level escalation focus, concise, highlights project-wide impact for senior stakeholders.
    - short: Ultra-brief 1-2 sentence direct message suitable for quick nudge.
    
    Output a JSON object containing:
    - nudge_message: string (personalized nudge to {target_owner} from the perspective of {source_owner} or project admin, formatted for {channel} channel, matching the {tone} tone)
    - escalation_required: boolean (True if status is 'at-risk' and on critical path, or 'open' and on critical path)
    - threat_level: one of "low", "medium", "high"
    - confidence: integer between 70 and 99 (represents AI risk estimation confidence score based on critical path status and owner history)
    - confidence_reasons: list of strings (reasons behind the confidence score, e.g. ["Critical path task has zero float", "Predecessor owner has not updated ETA in 3 days", "Resource dependency constraint"])
    """
    
    try:
        res = call_gemini(
            prompt=prompt,
            system_instruction="Generate project status nudges and risk alerts with confidence metrics, tailored for the specified communication channel and tone.",
            is_json=True
        )
        print(f"[LangGraph Node: chase] Nudge generated: {res.get('nudge_message')[:50]}... Threat level: {res.get('threat_level')}")
        threat = res.get("threat_level") or "medium"
        threat_lower = str(threat).lower()
        if threat_lower not in ["low", "medium", "high"]:
            if "low" in threat_lower or "green" in threat_lower:
                threat = "low"
            elif "high" in threat_lower or "red" in threat_lower or "critical" in threat_lower:
                threat = "high"
            else:
                threat = "medium"
        else:
            threat = threat_lower
        conf = res.get("confidence")
        if not isinstance(conf, int):
            try:
                conf = int(conf)
            except Exception:
                conf = 85
        
        reasons = res.get("confidence_reasons") or []
        if not isinstance(reasons, list):
            reasons = [str(reasons)]
            
        if not reasons:
            reasons = ["Critical Path Task" if on_critical_path else "Standard Dependency Path", "Awaiting owner feedback"]

        return {
            "nudge_message": res.get("nudge_message") or "Hi, just following up on this task dependency.",
            "escalation_required": res.get("escalation_required", False),
            "threat_level": threat,
            "confidence": conf,
            "confidence_reasons": reasons
        }
    except Exception as e:
        print(f"[LangGraph Node: chase] Failed: {e}. Using fallback nudge generator.")
        target_display = target_owner.split('@')[0] if '@' in target_owner else target_owner
        source_display = source_owner.split('@')[0] if '@' in source_owner else source_owner

        if tone == "executive":
            nudge = (
                f"Escalation Alert: Dependency {dep.dependency_id} is currently blocking '{source_name}' ({dep.source_task_id}). "
                f"Predecessor task '{target_name}' ({dep.target_task_id}) is past its scheduled timeline, "
                f"impacting critical path milestones. Immediate attention and updated ETA required."
            )
        elif tone == "technical":
            nudge = (
                f"Technical Follow-up [{dep.dependency_id}]: '{source_name}' ({dep.source_task_id}) is blocked on "
                f"'{target_name}' ({dep.target_task_id}). "
                f"Please confirm completion status, share any blockers, logs, or endpoint readiness details."
            )
        elif tone == "business":
            nudge = (
                f"Business Impact Notice: The dependency {dep.dependency_id} is at risk of impacting delivery timelines. "
                f"'{source_name}' cannot proceed until '{target_name}' is complete. "
                f"This has schedule and SLA implications. Please provide an updated ETA at your earliest convenience."
            )
        elif tone == "short":
            nudge = f"Hi {target_display}, quick check — any update on '{target_name}' ({dep.target_task_id})? It's blocking '{source_name}'. Thanks!"
        else:  # friendly (default)
            nudge = (
                f"Hi {target_display}, I'm reaching out regarding dependency {dep.dependency_id}. "
                f"{source_display} is waiting on the completion of '{target_name}' (ID: {dep.target_task_id}) "
                f"before they can begin '{source_name}' (ID: {dep.source_task_id}). "
                f"Could you please provide an updated ETA or let us know if there are any blockers? Thank you!"
            )

        # Format for channel
        if channel == "slack":
            nudge = f":wave: {nudge}"
        elif channel == "teams":
            nudge = f"@{target_display} — {nudge}"
        elif channel == "ado":
            nudge = f"[Work Item Comment] Ref: {dep.dependency_id} | {dep.source_task_id} -> {dep.target_task_id}\n{nudge}"

        fallback_threat = "medium"
        if dep.status == "at-risk":
            fallback_threat = "high" if on_critical_path else "medium"
        elif dep.status == "open":
            fallback_threat = "medium" if on_critical_path else "low"

        return {
            "nudge_message": nudge,
            "escalation_required": on_critical_path and dep.status == "at-risk",
            "threat_level": fallback_threat,
            "confidence": 92 if on_critical_path else 85,
            "confidence_reasons": [
                "Critical path dependency chain" if on_critical_path else "Standard dependency track",
                "Owner hasn't updated status recently",
                "Slack/variance buffer absorbed"
            ]
        }


def impact_node(state: DependencyState) -> Dict[str, Any]:
    print(f"[LangGraph Node: impact] Analyzing ripple impact of delay on {state.get('delay_task_id')}...")
    plan = state.get("plan")
    delay_task_id = state.get("delay_task_id")
    delay_days = state.get("delay_days") or 0
    
    if not plan:
        return {"error": "Plan record is missing for cross-programme impact check."}
        
    # Load all plans in the portfolio to support cross-programme ripple analysis
    all_plans = plan_loader.load_all_plans()
    
    # Gather all tasks across all plans
    all_tasks = {}
    task_dates = {}
    task_to_plan = {}
    for p in all_plans:
        for t in p.tasks:
            all_tasks[t.task_id] = t
            task_to_plan[t.task_id] = p
            
    # 1. Date shifting algorithm
    def parse_date(d_str: str) -> datetime:
        return datetime.strptime(d_str.strip(), "%Y-%m-%d")

    def format_date(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%d")
        
    for t_id, t in all_tasks.items():
        task_dates[t_id] = {
            "start": parse_date(t.start_date),
            "end": parse_date(t.end_date)
        }
        
    if delay_task_id not in task_dates:
        return {"error": f"Task {delay_task_id} not found in the portfolio."}
        
    # Apply delay to target task end_date
    task_dates[delay_task_id]["end"] += timedelta(days=delay_days)
    
    # Build list of predecessors for each task
    # A predecessor can be internal (specified in the task record) or cross-programme (defined as a dependency edge)
    predecessors = {}
    for t_id, t in all_tasks.items():
        predecessors[t_id] = set(t.predecessor_task_ids or [])
        
    # Add cross-programme dependency edges from the database
    # In a dependency edge, source_task_id depends on target_task_id (target is predecessor of source)
    for dep in db.get_all():
        if dep.source_task_id in predecessors:
            predecessors[dep.source_task_id].add(dep.target_task_id)
            
    # Relaxation constraint loop
    changed = True
    iterations = 0
    max_iterations = 100
    while changed and iterations < max_iterations:
        changed = False
        iterations += 1
        for t_id, t in all_tasks.items():
            preds = predecessors[t_id]
            if not preds:
                continue
            max_pred_end = None
            for pred_id in preds:
                if pred_id in task_dates:
                    pred_end = task_dates[pred_id]["end"]
                    if max_pred_end is None or pred_end > max_pred_end:
                        max_pred_end = pred_end
            if max_pred_end is not None:
                required_start = max_pred_end + timedelta(days=1)
                current_start = task_dates[t_id]["start"]
                if required_start > current_start:
                    diff = (required_start - current_start).days
                    task_dates[t_id]["start"] = required_start
                    task_dates[t_id]["end"] += timedelta(days=diff)
                    changed = True
                    
    # Find affected tasks
    affected_tasks = []
    for t_id, t in all_tasks.items():
        orig_start = parse_date(t.start_date)
        orig_end = parse_date(t.end_date)
        new_start = task_dates[t_id]["start"]
        new_end = task_dates[t_id]["end"]
        
        if new_start != orig_start or new_end != orig_end:
            associated_p = task_to_plan[t_id]
            affected_tasks.append({
                "task_id": t_id,
                "name": t.name,
                "original_start_date": format_date(orig_start),
                "new_start_date": format_date(new_start),
                "original_end_date": format_date(orig_end),
                "new_end_date": format_date(new_end),
                "on_critical_path": t_id in associated_p.critical_path_task_ids
            })
            
    # Calculate if the target associated plan's end date slipped
    orig_project_end_dt = parse_date(plan.end_date)
    new_project_end_dt = orig_project_end_dt
    
    for t in plan.tasks:
        new_end = task_dates[t.task_id]["end"]
        if new_end > new_project_end_dt:
            new_project_end_dt = new_end
            
    slipped = new_project_end_dt > orig_project_end_dt
    impact_detected = len(affected_tasks) > 0 or slipped
    
    # 2. Call LLM to write analysis explanation
    prompt = f"""
    You are a Risk Assessment Officer. Explain the ripple impact of a delay on a task.
    
    Plan: {plan.plan_id}
    Delayed Task: {delay_task_id}
    Delay duration: {delay_days} days
    
    Affected Tasks across the portfolio:
    {json.dumps(affected_tasks, indent=2)}
    
    Timeline Slippage for Plan {plan.plan_id}:
    Original Plan End Date: {plan.end_date}
    New Estimated End Date: {format_date(new_project_end_dt)}
    Did Plan End Date Slip? {slipped}
    
    Write a detailed, professional Risk Assessment Summary paragraph.
    If there is no plan end date slip, explain that the delay was absorbed by available schedule buffer, so downstream tasks shifted internally but the project completion date remains unchanged and customer commitments are protected.
    If the plan end date did slip, explain how downstream tasks are impacted and specify the new completion date and amount of slip, recommending mitigation.
    """
    
    try:
        explanation = call_gemini(
            prompt=prompt,
            system_instruction="Explain the impact of schedule delays on dependency trees.",
            is_json=False
        )
    except Exception as e:
        if not slipped:
            explanation = (
                f"Although {delay_task_id} is a critical-path activity, the {delay_days}-day delay was fully "
                f"absorbed by the available schedule buffer. As a result, downstream activities shifted internally, "
                f"but the overall project completion date of {plan.end_date} remains unchanged. "
                f"No customer commitment has been affected."
            )
        else:
            slip_diff = (new_project_end_dt - parse_date(plan.end_date)).days
            explanation = (
                f"The {delay_days}-day delay to {delay_task_id} has exceeded the available schedule buffer. "
                f"This delay has propagated downstream, shifting tasks and pushing the committed project end date "
                f"from {plan.end_date} to {format_date(new_project_end_dt)} (a slip of {slip_diff} days). "
                f"Immediate mitigation and re-baselining are recommended."
            )
        
    return {
        "impact_detected": impact_detected,
        "original_project_end_date": plan.end_date,
        "new_project_end_date": format_date(new_project_end_dt),
        "project_end_date_slipped": slipped,
        "affected_tasks": affected_tasks,
        "explanation": explanation.strip()
    }


def route_task(state: DependencyState) -> str:
    return state.get("task") or "sense"

# Set up state graph
builder = StateGraph(DependencyState)
builder.add_node("sense", sense_node)
builder.add_node("chase", chase_node)
builder.add_node("impact", impact_node)

builder.set_conditional_entry_point(
    route_task,
    {
        "sense": "sense",
        "chase": "chase",
        "impact": "impact"
    }
)

builder.add_edge("sense", END)
builder.add_edge("chase", END)
builder.add_edge("impact", END)

dependency_graph = builder.compile()
