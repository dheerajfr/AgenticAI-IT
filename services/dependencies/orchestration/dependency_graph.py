from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
import sys
import os
import random
from datetime import datetime, timedelta

# Append paths to access services-wide llm_client and current folder models/database
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))) # for llm_client
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))       # for models, database

import json
from llm_client import call_gemini
from models import DependencyEdge, PlanRecord, Task
from database import db, plan_loader

SIMULATED_RESOURCES = {
    "PLN-0001-1": {
        "work_item_links": [
            "ADO Link #45213 (Loyalty Portal UI) -> ADO Link #45211 (Loyalty API Backend)",
            "ADO Link #45211 (Loyalty API Backend) -> ADO Link #45209 (Loyalty Database Cluster)"
        ],
        "architecture_schema": (
            "The Loyalty UI service (React) communicates via REST API with `/api/loyalty/v1` "
            "hosted on the Loyalty API service. The Loyalty API service connects to the Loyalty "
            "PostgreSQL database cluster (db-loyalty-cluster-01) for state storage. "
            "Additionally, the Loyalty API service requires API Gateway routing configurations."
        ),
        "teams_communications": [
            "[07-02 10:14] d.chen: @m.rodriguez, is the loyalty database cluster ready for schema migration? We cannot start 'Loyalty Portal Schema Migration' (T-MIG-1) until 'Database Cluster Creation' (T-AWS-1) is finalized and we have the connection string.",
            "[07-02 10:18] m.rodriguez: The cluster (T-AWS-1) will be fully provisioned by June 30th. You can proceed with migration schema tests then.",
            "[07-02 11:02] alice.smith: Hey guys, 'Validation UAT Testing' (T-TST-2) is scheduled right after schema migration (T-MIG-1), so we need that migration running on schedule."
        ]
    },
    "PLN-0002-1": {
        "work_item_links": [
            "ADO Link #88432 (Apple Pay Integration) -> ADO Link #88430 (Payment Engine Core)"
        ],
        "architecture_schema": (
            "The Apple Pay Gateway service integrates with Payment Engine Core endpoint `/v2/charge`. "
            "Payment Engine Core depends on HSM modules for cryptographic signing of payloads."
        ),
        "teams_communications": [
            "[07-02 09:30] bob.jones: @alice.smith, we cannot proceed with 'Apple Pay Gateway' (T-PAY-2) test scripts until 'Payment Core API Endpoint' (T-PAY-1) is deployed in staging.",
            "[07-02 09:35] alice.smith: Correct, we are blocked on core APIs. Is the external vendor certificate ready for the endpoint setup?",
            "[07-02 09:40] bob.jones: No, we are chasing the security team for HSM keys as well."
        ]
    },
    "PLN-0003-1": {
        "work_item_links": [
            "ADO Link #99101 (SAST Scanner integration) -> ADO Link #99100 (Jenkins upgrade)"
        ],
        "architecture_schema": (
            "The SAST Scanner integrates directly into the Jenkins CI/CD pipeline agent pool. "
            "It queries the corporate Artifactory registry for scanning container images."
        ),
        "teams_communications": [
            "[07-02 14:10] s.security: Pipeline updates (T-SEC-1) are absolutely required before we inject SAST scanners (T-SEC-2).",
            "[07-02 14:15] admin: Agreed, we'll configure the Jenkins agents first."
        ]
    }
}

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
    nudge_message: Optional[str]
    escalation_required: Optional[bool]
    threat_level: Optional[str]
    
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
    
    # Retrieve simulated resource documents
    sim_data = SIMULATED_RESOURCES.get(plan_id, {
        "work_item_links": [],
        "architecture_schema": "No explicit architecture records found.",
        "teams_communications": []
    })
    
    # Format tasks list to pass to LLM
    tasks_info = []
    for t in plan.tasks:
        tasks_info.append({
            "task_id": t.task_id,
            "name": t.name,
            "owner": t.owner,
            "start_date": t.start_date,
            "end_date": t.end_date,
            "predecessor_task_ids": t.predecessor_task_ids
        })
        
    prompt = f"""
    You are an AI Project Management Analyst specializing in Knowledge Graph Analytics, NLP Entity Extraction, and Semantic Retrieval.
    
    Your task is to automatically discover dependencies and risk links within this project plan by analyzing and linking:
    1. The project task metadata list.
    2. Corporate Work-Item Links (ADO).
    3. Component Architecture and Infrastructure Schema definitions.
    4. Teams chat logs and communications transcripts between task owners.
    
    Plan Details:
    - Plan ID: {plan.plan_id}
    - Demand ID: {plan.demand_id}
    - Committed End Date: {plan.end_date}
    
    ---
    1. Tasks List:
    {json.dumps(tasks_info, indent=2)}
    
    ---
    2. Scanned ADO Work-Item Links:
    {json.dumps(sim_data["work_item_links"], indent=2)}
    
    ---
    3. Mapped Component Architecture & Schema:
    {sim_data["architecture_schema"]}
    
    ---
    4. Retrieved Teams Chat Logs & Comms Transcripts:
    {json.dumps(sim_data["teams_communications"], indent=2)}
    
    ---
    Using Knowledge Graph mapping, identify logical/technical dependencies between these tasks (e.g., if one task's work description or conversation indicates it relies on another task being completed first, or if the component architecture requires a database cluster/endpoint setup before API/schema deployment, etc.).
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
                "extraction and semantic retrieval over task meta, architecture schemas, and Teams chat transcripts."
            ),
            is_json=True
        )
        detected = res.get("detected_dependencies") or []
        print(f"[LangGraph Node: sense] Successfully sensed {len(detected)} dependencies.")
        return {"detected_dependencies": detected}
    except Exception as e:
        print(f"[LangGraph Node: sense] Failed: {e}")
        return {"error": f"Sensing failed: {e}"}


def chase_node(state: DependencyState) -> Dict[str, Any]:
    print(f"[LangGraph Node: chase] Assessing dependency commitment {state.get('dependency_id')}...")
    dep = state.get("dependency")
    if not dep:
        return {"error": "Dependency record is missing for chasing commitments."}
        
    plan = state.get("plan")
    
    # Gather task info from plan if available
    source_name = dep.source_task_id
    target_name = dep.target_task_id
    target_owner = dep.owner
    source_owner = dep.owner
    on_critical_path = False
    
    if plan:
        on_critical_path = dep.source_task_id in plan.critical_path_task_ids or dep.target_task_id in plan.critical_path_task_ids
        for t in plan.tasks:
            if t.task_id == dep.source_task_id:
                source_name = t.name
                source_owner = t.owner
            if t.task_id == dep.target_task_id:
                target_name = t.name
                target_owner = t.owner
                
    prompt = f"""
    You are an Automated Project Manager. You need to write a nudge email/slack message to check the status of a dependency.
    
    Dependency Details:
    Dependency ID: {dep.dependency_id}
    Source Task: {source_name} (ID: {dep.source_task_id}, Owner: {source_owner})
    Target Task: {target_name} (ID: {dep.target_task_id}, Owner: {target_owner})
    Type: {dep.type}
    Status: {dep.status}
    Is either task on Critical Path? {on_critical_path}
    
    Output a JSON object containing:
    - nudge_message: string (personalized nudge to {target_owner} from the perspective of {source_owner} or project admin)
    - escalation_required: boolean (True if status is 'at-risk' and on critical path, or 'open' and on critical path)
    - threat_level: one of "low", "medium", "high"
    """
    
    try:
        res = call_gemini(
            prompt=prompt,
            system_instruction="Generate project status nudges and risk alerts.",
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

        return {
            "nudge_message": res.get("nudge_message") or "Hi, just following up on this task dependency.",
            "escalation_required": res.get("escalation_required", False),
            "threat_level": threat
        }
    except Exception as e:
        print(f"[LangGraph Node: chase] Failed: {e}")
        return {"error": f"Chasing failed: {e}"}


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
    
    Explain the impact in a concise, professional paragraph, highlighting how the critical path is affected.
    """
    
    try:
        explanation = call_gemini(
            prompt=prompt,
            system_instruction="Explain the impact of schedule delays on dependency trees.",
            is_json=False
        )
    except Exception as e:
        explanation = f"Timeline delay check completed. End date slipped: {slipped}."
        
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
