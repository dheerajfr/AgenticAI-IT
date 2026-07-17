from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
import sys
import os
import random

# Add parent to path to access llm_client
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini

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


def estimate_node(state: EstimateState) -> Dict[str, Any]:
    print(f"[LangGraph Node: estimate] Estimating demand {state.get('demand_id')}...")
    title = state.get("title") or ""
    description = state.get("description") or ""
    dtype = state.get("type") or ""
    domain = state.get("domain") or ""
    business_case_summary = state.get("business_case_summary") or ""
    risk_level = state.get("risk_level") or ""
    funding_status = state.get("funding_status") or ""
    
    prompt = f"""
    You are an AI Estimation Expert. Estimate the effort, cost, and duration for this project demand based on typical historical metrics for similar work.
    
    Demand Title: {title}
    Description: {description}
    Type: {dtype}
    Domain: {domain}
    Business Case Summary: {business_case_summary}
    Risk Level: {risk_level}
    Funding Status: {funding_status}
    """
    
    reason = state.get("rebaseline_reason")
    if reason:
        prompt += f"\nCRITICAL NOTE: This is a REVISION of a previous estimate. The project went off-track due to the following anomaly: '{reason}'. Please adjust your cost, effort, and duration estimates accordingly (e.g. increase them) to account for these constraints/anomalies.\n"
        
    prompt += """
    Output a JSON object with:
    - effort_days: int (point estimate)
    - effort_range_low: int (lower bound)
    - effort_range_high: int (upper bound)
    - cost_estimate: int (in local currency, e.g., dollars/pounds)
    - duration_weeks: int (duration)
    - confidence: one of "low", "medium", "high"
    - methodology: string (e.g., "comparable-history", "expert-judgement")
    - risk_factors: list of strings (maximum 3 short and concise risk factors)
    - requires_arb: boolean (true if Architecture Review Board is needed, e.g., for cloud migrations or new databases, else false)
    """
    
    try:
        estimation = call_gemini(
            prompt=prompt,
            system_instruction="Estimate project effort and cost.",
            is_json=True
        )
        print("---------------- Prompt: ",prompt)
        print(f"[LangGraph Node: estimate] Generated estimate: {estimation}")
        return {
            "effort_days": estimation.get("effort_days", 50),
            "effort_range_low": estimation.get("effort_range_low", 40),
            "effort_range_high": estimation.get("effort_range_high", 70),
            "cost_estimate": estimation.get("cost_estimate", 100000),
            "duration_weeks": estimation.get("duration_weeks", 8),
            "confidence": estimation.get("confidence", "medium"),
            "methodology": estimation.get("methodology", "comparable-history"),
            "risk_factors": estimation.get("risk_factors", []),
            "requires_arb": estimation.get("requires_arb", False)
        }
    except Exception as e:
        print(f"[LangGraph Node: estimate] Estimation failed: {e}")
        return {"error": f"Estimation failed: {e}"}





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
        print(f"[LangGraph Node: trigger_check] Trigger check failed: {e}")
        return {"error": f"Trigger check failed: {e}"}

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
