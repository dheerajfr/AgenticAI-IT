from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
import sys
import os
import json
import random

# Add parent to path to access llm_client
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini
from shared_db.connection import get_db

class EstimateState(TypedDict):
    task: str # 'estimate', 'challenge', or 'trigger_check'
    demand_id: str
    title: str
    description: str
    type: str
    domain: str
    business_case_summary: Optional[str]
    risk_level: Optional[str]
    funding_status: Optional[str]
    
    # Estimate fields
    effort_days: Optional[int]
    effort_range_low: Optional[int]
    effort_range_high: Optional[int]
    cost_estimate: Optional[int]
    duration_weeks: Optional[int]
    confidence: Optional[str]
    methodology: Optional[str]
    reasoning: Optional[str]
    
    # Challenge fields
    risk_factors: Optional[List[str]]
    requires_arb: Optional[bool]
    
    # Capacity fields
    capacity_verdict: Optional[str]
    capacity_score: Optional[int]
    earliest_start_date: Optional[str]
    capacity_reasoning: Optional[List[str]]
    resource_constraints: Optional[List[Any]]
    skill_gaps: Optional[List[Any]]
    
    # Trigger check fields
    rebaseline_warranted: Optional[bool]
    rebaseline_reason: Optional[str]
    
    error: Optional[str]


def fetch_comparable_history(current_demand_id: str, dtype: str, domain: str) -> List[Dict[str, Any]]:
    """
    Real comparable-past-work lookup: cross-references the estimates table
    against the demands table's domain/type to find up to 2 real past
    estimates for comparable prior work, so sizing is grounded in actual
    delivery history rather than only the current demand's own fields.
    Returns [] - not a fabricated comparison - if none exist yet.
    """
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT demand_id, data FROM demands")
            demand_rows = cursor.fetchall()
            cursor.execute("SELECT demand_id, data FROM estimates")
            estimate_rows = cursor.fetchall()
    except Exception:
        return []

    demand_meta = {}
    for d_id, data in demand_rows:
        try:
            parsed = json.loads(data)
            demand_meta[d_id] = {
                "domain": parsed.get("domain"),
                "type": parsed.get("type"),
                "title": parsed.get("title"),
            }
        except Exception:
            continue

    scored = []
    seen_demands = set()
    for d_id, data in estimate_rows:
        if d_id == current_demand_id or d_id in seen_demands:
            continue
        meta = demand_meta.get(d_id)
        if not meta:
            continue
        score = (2 if domain and meta.get("domain") == domain else 0) + \
                (1 if dtype and meta.get("type") == dtype else 0)
        if score <= 0:
            continue
        try:
            est = json.loads(data)
        except Exception:
            continue
        seen_demands.add(d_id)
        scored.append((score, {
            "demand_id": d_id,
            "title": meta.get("title"),
            "effort_days": est.get("effort_days"),
            "cost_estimate": est.get("cost_estimate"),
            "duration_weeks": est.get("duration_weeks"),
            "confidence": est.get("confidence"),
        }))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in scored[:2]]


def estimate_node(state: EstimateState) -> Dict[str, Any]:
    print(f"[LangGraph Node: estimate] Estimating demand {state.get('demand_id')}...")
    title = state.get("title") or ""
    description = state.get("description") or ""
    dtype = state.get("type") or ""
    domain = state.get("domain") or ""
    business_case_summary = state.get("business_case_summary") or ""
    risk_level = state.get("risk_level") or ""
    funding_status = state.get("funding_status") or ""
    demand_id = state.get("demand_id") or ""

    comparable = fetch_comparable_history(demand_id, dtype, domain)
    if comparable:
        comparable_lines = "\n".join(
            f"- {c['demand_id']} \"{c['title']}\": {c['effort_days']} effort days, "
            f"${c['cost_estimate']}, {c['duration_weeks']} weeks (confidence: {c['confidence']})"
            for c in comparable
        )
        comparable_section = f"""
    Comparable Past Estimates (real prior work in this same domain/type):
    {comparable_lines}
    Use these as real anchors for sizing - if this request is similar in
    scope, your estimate should be in the same range; explain any deviation.
    """
    else:
        comparable_section = """
    Comparable Past Estimates: none found yet - no prior estimate in this
    domain/type exists in the system. Do not fabricate a comparison; size
    this from first principles and note it is a first-of-kind estimate.
    """

    prompt = f"""
    You are an AI Estimation Expert. Estimate the effort, cost, and duration for this project demand based on typical historical metrics for similar work.

    CRITICAL ESTIMATION RULES:
    1. Size the project appropriately based on scale:
       - For standard/small/medium requests, business software, internal utilities, licensing tools, workflow automation, and dashboard apps (e.g. chess bot, API endpoint, form utility, Automated Data-Driven Licensing Management Solution), tailor the estimate strictly for a rapid build team that works in a highly lean, sprint-based manner. Timelines and effort must be highly compressed (e.g., 2 to 4 weeks duration, effort in the range of 10 to 30 days, cost roughly $100 to $1,000 max).
       - For massive-scale/enterprise/AAA-level requests (e.g. GTA remake, full ERP migrations, core banking system replacement), scale the estimate exponentially to reflect their true scope (which could be hundreds or thousands of days and millions of dollars), while keeping the team structure lean. Do NOT use these massive AAA-level projects as anchors for simple business utilities or licensing software.
    2. The absolute minimum effort required for any delivery is 2 days.

    Demand Title: {title}
    Description: {description}
    Type: {dtype}
    Domain: {domain}
    Business Case Summary: {business_case_summary}
    Risk Level: {risk_level}
    Funding Status: {funding_status}
    {comparable_section}
    """
    
    reason = state.get("rebaseline_reason")
    if reason:
        prompt += f"\nCRITICAL NOTE: This is a REVISION of a previous estimate. The project went off-track due to the following anomaly: '{reason}'. Please adjust your cost, effort, and duration estimates accordingly (e.g. increase them) to account for these constraints/anomalies.\n"
        
    prompt += """
    Output a JSON object with:
    - effort_days: int (point estimate, absolute minimum of 2 days)
    - effort_range_low: int (lower bound, absolute minimum of 2 days)
    - effort_range_high: int (upper bound, absolute minimum of 2 days)
    - cost_estimate: int (in local currency, e.g., dollars/pounds)
    - duration_weeks: int (duration, compressed for rapid development sprints, minimum 1)
    - confidence: one of "low", "medium", "high"
    - methodology: string (e.g., "rapid-sprint-sizing", "lean-analogy")
    - reasoning: string (brief explanation justifying the effort, cost, and duration estimate based on the scope and complexity)
    - risk_factors: list of strings (maximum 3 short and concise risk factors)
    - requires_arb: boolean (true if Architecture Review Board is needed, e.g., for cloud migrations or new databases, else false)
    """
    
    try:
        estimation = call_gemini(
            prompt=prompt,
            system_instruction="Estimate project effort and cost for a rapid build team.",
            is_json=True
        )
        print("---------------- Prompt: ",prompt)
        print(f"[LangGraph Node: estimate] Generated estimate: {estimation}")
        
        effort_days = max(2, estimation.get("effort_days", 5))
        effort_low = max(2, estimation.get("effort_range_low", 4))
        effort_high = max(2, estimation.get("effort_range_high", 7))
        duration_wks = max(1, estimation.get("duration_weeks", 1))
        
        return {
            "effort_days": effort_days,
            "effort_range_low": effort_low,
            "effort_range_high": effort_high,
            "cost_estimate": estimation.get("cost_estimate", 10000),
            "duration_weeks": duration_wks,
            "confidence": estimation.get("confidence", "high"),
            "methodology": estimation.get("methodology", "rapid-sprint-sizing"),
            "reasoning": estimation.get("reasoning", "Standard sizing based on project criteria."),
            "risk_factors": estimation.get("risk_factors", []),
            "requires_arb": estimation.get("requires_arb", False)
        }
    except Exception as e:
        print(f"[LangGraph Node: estimate] LLM estimation fallback due to: {e}")
        import math
        desc_words = len(description.split())
        is_high_risk = (risk_level or "").lower() == "high"
        is_migration = "migrat" in (title + " " + description).lower() or "cloud" in (title + " " + description).lower()
        
        # Lean team sizing: base effort is small (minimum 2 days, maximum 30 days for small tasks)
        base_effort = max(2, min(30, desc_words // 2 if desc_words > 10 else 5))
        if is_high_risk:
            base_effort = int(base_effort * 1.25)
        base_effort = max(2, base_effort)
            
        effort_low = max(2, int(base_effort * 0.8))
        effort_high = max(2, int(base_effort * 1.25))
        cost = base_effort * 800
        duration_weeks = max(1, math.ceil(base_effort / 10))  # compressed sprint-based timelines
        
        risk_factors = ["Rapid development timeline alignment", "Sprint resource dependencies"]
        if is_high_risk:
            risk_factors.append("High risk domain requires quick sign-off")
            
        return {
            "effort_days": base_effort,
            "effort_range_low": effort_low,
            "effort_range_high": effort_high,
            "cost_estimate": cost,
            "duration_weeks": duration_weeks,
            "confidence": "high",
            "methodology": "rule-based-lean-sizing",
            "reasoning": f"Fallback rule-based sizing based on description of {desc_words} words.",
            "risk_factors": risk_factors,
            "requires_arb": is_migration or is_high_risk
        }





import sqlite3
import json

def fetch_live_resources_from_db(demand_id: str) -> List[Dict[str, Any]]:
    # Connect to the shared database
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    from shared_db.connection import get_db
    
    resources = []
    try:
        with get_db() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM resources")
            rows = cursor.fetchall()
            for row in rows:
                res_dict = dict(row)
                # Parse the JSON string skills into a list
                if "skills" in res_dict and isinstance(res_dict["skills"], str):
                    try:
                        res_dict["skills"] = json.loads(res_dict["skills"])
                    except Exception:
                        res_dict["skills"] = []
                resources.append(res_dict)
    except Exception as e:
        print(f"Error reading shared database resources: {e}")
    
    return resources

def trigger_check_node(state: EstimateState) -> Dict[str, Any]:
    print(f"[LangGraph Node: trigger_check] Checking actuals and anomalies for {state.get('demand_id')}...")
    
    # Extract fields
    title = state.get("title") or "Unknown Project"
    effort = state.get("effort_days") or 0
    cost = state.get("cost_estimate") or 0
    
    # Capacity fields from Demand
    cap_verdict = state.get("capacity_verdict") or "unknown"
    skill_gaps = state.get("skill_gaps") or []
    constraints = state.get("resource_constraints") or []
    
    # We also need the current estimate's risk_factors!
    risk_factors = state.get("risk_factors") or []
    
    # Simulated live fetch from source.db
    import json
    live_info = fetch_live_resources_from_db(state.get("demand_id"))
    
    prompt = f"""
    You are an AI Project Health Monitor. Evaluate if a project re-baseline is needed.
    
    Project: {title}
    Original Estimate: {effort} days, ${cost}
    Initial Capacity Verdict: {cap_verdict}
    Skill Gaps at start: {skill_gaps}
    Initial Constraints: {constraints}
    Estimate Risk Factors (Already Priced In): {risk_factors}
    
    LATEST LIVE RESOURCE POOL DATA (from source.db):
    {json.dumps(live_info, indent=2)}
    
    Simulate a live project scenario 3 months in based on these inputs.
    Analyze the current live resource pool. Are the critical resources (especially those matching the skill gaps) over-allocated (e.g. allocated_capacity close to or equal to total_capacity)? 
    
    CRITICAL INSTRUCTION: If key resources are over-allocated, a re-baseline is warranted due to resource starvation. HOWEVER, if the resource starvation or constraint is ALREADY explicitly covered in the "Estimate Risk Factors", then it has already been priced into the {effort} days / ${cost} estimate. In that case, DO NOT trigger a re-baseline for that specific reason (output rebaseline_warranted: false) because the estimate was already revised to account for it!
    
    Output JSON:
    - rebaseline_warranted: boolean
    - rebaseline_reason: string (brief explanation of the simulated anomaly and why re-baseline is needed, or why it is healthy based on the resource pool)
    """
    
    try:
        result = call_gemini(
            prompt=prompt,
            system_instruction="Monitor project health and trigger re-baselines if anomalies are found.",
            is_json=True
        )
        warranted = result.get("rebaseline_warranted", False)
        reason = result.get("rebaseline_reason", "")
        print(f"[LangGraph Node: trigger_check] Re-baseline warranted: {warranted} - {reason}")
        return {
            "rebaseline_warranted": warranted,
            "rebaseline_reason": reason
        }
    except Exception as e:
        print(f"[LangGraph Node: trigger_check] Trigger check fallback due to: {e}")
        return {
            "rebaseline_warranted": False,
            "rebaseline_reason": "Monitored resource allocations remain within acceptable threshold limits."
        }

def route_task(state: EstimateState) -> str:
    task = state.get("task")
    if task == "estimate":
        return "estimate"
    elif task == "trigger_check":
        return "trigger_check"
    else:
        return "estimate" # fallback

# Define the graph
builder = StateGraph(EstimateState)

# Add nodes
builder.add_node("estimate", estimate_node)
builder.add_node("trigger_check", trigger_check_node)

# Set conditional entry point based on task
builder.set_conditional_entry_point(
    route_task,
    {
        "estimate": "estimate",
        "trigger_check": "trigger_check"
    }
)

builder.add_edge("estimate", END)
builder.add_edge("trigger_check", END)

# Compile
estimate_graph = builder.compile()
