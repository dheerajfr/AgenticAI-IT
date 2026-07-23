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
        
    tasks_info = [
        {
            "task_id": t.task_id,
            "name": t.name,
            "owner": t.owner,
            "start_date": str(t.start_date),
            "end_date": str(t.end_date),
            "predecessor_task_ids": t.predecessor_task_ids
        }
        for t in plan.tasks
    ]

    prompt = f"""
    You are an AI Project Management Analyst specializing in Knowledge Graph Analytics, NLP Entity Extraction, and Semantic Retrieval.
    
    Your task is to automatically discover dependencies and risk links within this project plan by analyzing:
    1. The project task metadata list.
    
    Plan Details:
    - Plan ID: {plan.plan_id}
    - Demand ID: {plan.demand_id}
    - Committed End Date: {plan.end_date}
    
    ---
    1. Tasks List:
    {json.dumps(tasks_info, indent=2)}
    
    ---
    Using Knowledge Graph mapping, identify logical/technical dependencies between these tasks (e.g., if one task's work description or predecessor_task_ids indicates it relies on another task being completed first, or if the component architecture requires a database cluster/endpoint setup before API/schema deployment, etc.).
    Also classify the type of dependency edge as:
    - "technical"
    - "resource"
    - "data"
    - "external-vendor"
    
    For each dependency discovered, output a JSON object with:
    - dependency_id: string (generate a unique code like DEP-XXXX)
    - source_task_id: string (task that depends on another)
    - target_task_id: string (task being depended on)
    - type: string, one of "technical", "resource", "data", "external-vendor"
    - status: string, "open"
    - owner: string (name of the owner responsible, usually the source task owner)
    
    Return a valid JSON array containing these dependency objects under the key "detected_dependencies".
    """
    
    try:
        res = call_gemini(
            prompt=prompt,
            system_instruction=(
                "Discover hidden dependencies in project schedules by performing NLP entity "
                "extraction and semantic retrieval over task metadata."
            ),
            is_json=True
        )
        detected = res.get("detected_dependencies") or []
        print(f"[LangGraph Node: sense] Successfully sensed {len(detected)} dependencies.")
        return {"detected_dependencies": detected}
    except Exception as e:
        print(f"[LangGraph Node: sense] Failed: {e}. Using fallback sensor.")
        # Fallback sensor: dynamically generate dependencies based on actual task predecessor relationships from DB
        detected = []
        dep_counter = 1
        for t in plan.tasks:
            for pred_id in (t.predecessor_task_ids or []):
                detected.append({
                    "dependency_id": f"DETECTED-DEP-{dep_counter:03d}",
                    "source_task_id": t.task_id,
                    "target_task_id": pred_id,
                    "type": "technical",
                    "status": "open",
                    "owner": t.owner
                })
                dep_counter += 1
        return {"detected_dependencies": detected}


def calculate_dependency_risk(dep: DependencyEdge, plan: Optional[PlanRecord]) -> Dict[str, Any]:
    """
    Deterministically calculates threat level, escalation, critical-path membership,
    and days-to-release for a dependency, based on backend business rules.

    This keeps risk classification auditable and out of the LLM's hands; the LLM
    is only responsible for generating the nudge message and explaining the
    already-calculated risk (confidence + confidence_reasons).
    """

    on_critical_path = False
    days_to_release = None

    if plan:
        on_critical_path = (
            dep.source_task_id in plan.critical_path_task_ids or
            dep.target_task_id in plan.critical_path_task_ids
        )

        try:
            release_date = datetime.strptime(plan.end_date, "%Y-%m-%d").date()
            today = datetime.today().date()
            days_to_release = (release_date - today).days
        except Exception:
            days_to_release = None

    # Threat level
    if dep.status == "resolved":
        threat_level = "low"
    elif dep.status == "open":
        threat_level = "medium" if on_critical_path else "low"
    elif dep.status == "at-risk":
        threat_level = "high" if on_critical_path else "medium"
    else:
        threat_level = "low"

    # Escalation rules
    escalation_required = False

    if threat_level == "high":
        escalation_required = True
    elif (
        on_critical_path and
        days_to_release is not None and
        days_to_release <= 5 and
        dep.status != "resolved"
    ):
        escalation_required = True

    return {
        "threat_level": threat_level,
        "escalation_required": escalation_required,
        "on_critical_path": on_critical_path,
        "days_to_release": days_to_release
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
    source_owner = None
    target_owner = None

    if plan and selected_task:
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

    # If not resolved via selected_task, resolve via dependency source/target task IDs
    if not source_owner or not target_owner:
        if plan:
            for t in plan.tasks:
                if t.task_id == dep.source_task_id:
                    source_name = t.name
                    source_owner = t.owner
                if t.task_id == dep.target_task_id:
                    target_name = t.name
                    target_owner = t.owner

        # If tasks are in different plans (cross-programme), look up across all portfolio plans
        if not source_owner or not target_owner:
            all_plans = plan_loader.load_all_plans()
            for p in all_plans:
                for t in p.tasks:
                    if not source_owner and t.task_id == dep.source_task_id:
                        source_name = t.name
                        source_owner = t.owner
                    if not target_owner and t.task_id == dep.target_task_id:
                        target_name = t.name
                        target_owner = t.owner

    # Fallback to dep.owner if still not found
    if not source_owner:
        source_owner = dep.owner or "admin@example.com"
    if not target_owner:
        target_owner = dep.owner or "admin@example.com"

    # Risk is calculated deterministically by the backend, not the LLM.
    risk = calculate_dependency_risk(dep, plan)
    on_critical_path = risk["on_critical_path"]
    if plan and selected_task:
        on_critical_path = source_id in plan.critical_path_task_ids or target_id in plan.critical_path_task_ids
        
    threat_level = risk["threat_level"]
    escalation_required = risk["escalation_required"]
    days_to_release = risk["days_to_release"]

    # Determine self-dependency status
    is_self_dependency = False
    if source_owner and target_owner:
        is_self_dependency = (source_owner.lower().strip() == target_owner.lower().strip())

    # Workflow selection
    if escalation_required:
        workflow = "escalation"
    elif is_self_dependency:
        workflow = "self_dependency"
    else:
        workflow = "owner_chase"

    if workflow == "self_dependency":
        prompt_instruction = f"""
        Since both the predecessor task ('{target_name}') and the downstream task ('{source_name}') are owned by the same person ({target_owner}), this is a SELF-DEPENDENCY workflow.
        
        Generate a self-action reminder message.
        - Do NOT address the owner by name (do NOT say "Hi {target_owner}" or use any greetings).
        - Do NOT say that they are waiting on themselves (do NOT say "{target_owner} is waiting on {target_owner}").
        - Describe that their task '{target_name}' (ID: {dep.target_task_id}) is currently blocking their downstream task '{source_name}' (ID: {dep.source_task_id}).
        - Suggest they update the predecessor task's status or expected completion date.
        """
    elif workflow == "escalation":
        prompt_instruction = f"""
        Since escalation_required is True, this is an ESCALATION workflow.
        
        Generate an escalation nudge message addressed to the project manager/release lead.
        - Highlight that task '{target_name}' (owned by {target_owner}) is currently blocking task '{source_name}' on the project critical path.
        - Keep it concise, highlighting SLA impact and requesting leadership help to resolve the block.
        """
    else:
        prompt_instruction = f"""
        This is a normal OWNER-CHASE workflow.
        
        Generate a reminder to the target task owner '{target_owner}'.
        - Address them politely (e.g. "Hi {target_owner.split('@')[0] if '@' in target_owner else target_owner}").
        - Explain that '{source_owner}' (or downstream task '{source_name}') is waiting on the completion of '{target_name}'.
        - Request an updated ETA or status.
        """
    prompt = f"""
    You are an Automated Project Manager. You need to write a nudge message to check the status of a dependency.

    The dependency risk has already been calculated by the project management system.
    Do NOT determine threat level, escalation, or criticality yourself. Use the values
    provided below exactly as given, and use them only to explain your confidence and
    to inform the tone/urgency of the nudge message.

    Dependency Details:
    Dependency ID: {dep.dependency_id}
    Source Task: {source_name} (ID: {source_id}, Owner: {source_owner})
    Target Task: {target_name} (ID: {target_id}, Owner: {target_owner})
    Type: {dep.type}
    Status: {dep.status}
    Is either task on Critical Path? {on_critical_path}
    Days Until Release: {days_to_release}
    Threat Level (already calculated - do not change): {threat_level}
    Escalation Required (already calculated - do not change): {escalation_required}
    Is Self Dependency: {is_self_dependency}
    Active Workflow Type: {workflow}
    
    Instruction for active workflow type ({workflow}):
    {prompt_instruction}

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
    
    Generate ONLY a JSON object containing:
    - nudge_message: string (personalized nudge message matching the {workflow} instructions, formatted for {channel} channel, matching the {tone} tone)
    - confidence: integer between 70 and 99 (how confident you are that the supplied threat level and framing are well-communicated in the message)
    - confidence_reasons: list of strings (reasons that explain WHY the supplied threat level makes sense, e.g. ["Critical path task has zero float", "Predecessor owner has not updated ETA in 3 days", "Resource dependency constraint"])

    Rules:
    - Do not change the supplied threat level.
    - Do not calculate escalation.
    - Confidence should be between 70 and 99.
    - Tailor the message to the requested tone, communication channel, and workflow type.
    - Return ONLY valid JSON.
    """
    
    try:
        res = call_gemini(
            prompt=prompt,
            system_instruction="Generate project status nudges and explain risk confidence, tailored for the specified communication channel, tone, and workflow type.",
            is_json=True
        )
        print(f"[LangGraph Node: chase] Nudge generated: {res.get('nudge_message', '')[:50]}... Threat level: {threat_level}")

        confidence = res.get("confidence", 85)
        try:
            confidence = int(confidence)
        except Exception:
            confidence = 85
        confidence = max(70, min(99, confidence))

        reasons = res.get("confidence_reasons") or []
        if not isinstance(reasons, list):
            reasons = [str(reasons)]
        if not reasons:
            reasons = [
                "Critical path dependency." if on_critical_path else "Standard dependency path.",
                f"Current dependency status is '{dep.status}'."
            ]

        return {
            "nudge_message": res.get("nudge_message") or "Hi, just following up on this task dependency.",
            "escalation_required": escalation_required,
            "threat_level": threat_level,
            "confidence": confidence,
            "confidence_reasons": reasons
        }
    except Exception as e:
        print(f"[LangGraph Node: chase] Failed: {e}. Using fallback nudge generator.")
        target_display = target_owner.split('@')[0] if '@' in target_owner else target_owner
        source_display = source_owner.split('@')[0] if '@' in source_owner else source_owner

        if workflow == "escalation":
            nudge = (
                f"Escalation Alert: Dependency {dep.dependency_id} is currently blocking '{source_name}' ({dep.source_task_id}). "
                f"Predecessor task '{target_name}' ({dep.target_task_id}) is past its scheduled timeline, "
                f"impacting critical path milestones. Immediate attention and updated ETA required."
            )
        elif workflow == "self_dependency":
            if channel in ["teams", "slack"]:
                nudge = f"Reminder: Your task '{target_name}' is currently blocking your own task '{source_name}'. Please update the predecessor task status or expected completion date."
            else:
                nudge = (
                    f"Action Required\n\n"
                    f"You currently own both dependent tasks in this dependency chain.\n\n"
                    f"Task:\n{dep.target_task_id} – {target_name}\n\nis blocking\n\n"
                    f"{dep.source_task_id} – {source_name}\n\n"
                    f"Please update the predecessor task status or ETA before starting the downstream task."
                )
        else: # owner_chase
            if tone == "executive":
                nudge = (
                    f"Ref: {dep.dependency_id} | '{source_name}' is blocked by '{target_name}' (owned by {target_owner}). "
                    f"Critical path block detected. Escalated follow-up requested."
                )
            elif tone == "technical":
                nudge = (
                    f"Technical Follow-up [{dep.dependency_id}]: '{source_name}' ({dep.source_task_id}) is blocked on "
                    f"'{target_name}' ({dep.target_task_id}). "
                    f"Please confirm completion status, share blockers, deployment logs, or endpoint readiness details."
                )
            elif tone == "business":
                nudge = (
                    f"Business Impact Notice: The dependency {dep.dependency_id} is at risk of impacting delivery timelines. "
                    f"'{source_name}' cannot proceed until '{target_name}' is complete. "
                    f"Please provide an updated ETA."
                )
            elif tone == "short":
                nudge = f"Hi {target_display}, quick check — any update on '{target_name}' ({dep.target_task_id})? It's blocking '{source_name}'. Thanks!"
            else:  # friendly (default)
                nudge = (
                    f"Hi {target_display}, I'm reaching out regarding dependency {dep.dependency_id}. "
                    f"{source_display} is waiting on the completion of '{target_name}' (ID: {dep.target_task_id}) "
                    f"before they can begin '{source_name}' (ID: {dep.source_task_id}). "
                    f"Could you please provide an updated ETA or let us know if there are blockers? Thank you!"
                )

        # Format for channel
        if channel == "slack":
            nudge = f":wave: {nudge}"
        elif channel == "teams":
            if workflow != "self_dependency":
                nudge = f"@{target_display} — {nudge}"
        elif channel == "ado":
            nudge = f"[Work Item Comment] Ref: {dep.dependency_id} | {dep.source_task_id} -> {dep.target_task_id}\n{nudge}"

        return {
            "nudge_message": nudge,
            "threat_level": threat_level,
            "escalation_required": escalation_required,
            "confidence": 92 if on_critical_path else 82,
            "confidence_reasons": [
                "Threat level calculated by project rules.",
                "Critical path considered." if on_critical_path else "Non-critical dependency.",
                "Fallback response generated."
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
        matched_id = None
        for dep in db.get_all():
            if dep.dependency_id == delay_task_id or dep.plan_id == delay_task_id:
                if dep.source_task_id in task_dates:
                    matched_id = dep.source_task_id
                    break
                elif dep.target_task_id in task_dates:
                    matched_id = dep.target_task_id
                    break
        if not matched_id and delay_task_id:
            last_seg = delay_task_id.split('-')[-1]
            for tid in task_dates:
                if last_seg in tid:
                    matched_id = tid
                    break
        if matched_id:
            delay_task_id = matched_id
        else:
            if plan and plan.tasks and plan.tasks[0].task_id in task_dates:
                delay_task_id = plan.tasks[0].task_id
            elif task_dates:
                delay_task_id = list(task_dates.keys())[0]
            else:
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