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
    
    prompt = f"""
    You are an AI Estimation Expert. Estimate the effort, cost, and duration for this project demand based on typical historical metrics for similar work.
    
    Demand Title: {title}
    Description: {description}
    Type: {dtype}
    Domain: {domain}
    
    Output a JSON object with:
    - effort_days: int (point estimate)
    - effort_range_low: int (lower bound)
    - effort_range_high: int (upper bound)
    - cost_estimate: int (in local currency, e.g., dollars/pounds)
    - duration_weeks: int (duration)
    - confidence: one of "low", "medium", "high"
    - methodology: string (e.g., "comparable-history", "expert-judgement")
    """
    
    try:
        estimation = call_gemini(
            prompt=prompt,
            system_instruction="Estimate project effort and cost.",
            is_json=True
        )
        print(f"[LangGraph Node: estimate] Generated estimate: {estimation}")
        return {
            "effort_days": estimation.get("effort_days", 50),
            "effort_range_low": estimation.get("effort_range_low", 40),
            "effort_range_high": estimation.get("effort_range_high", 70),
            "cost_estimate": estimation.get("cost_estimate", 100000),
            "duration_weeks": estimation.get("duration_weeks", 8),
            "confidence": estimation.get("confidence", "medium"),
            "methodology": estimation.get("methodology", "comparable-history")
        }
    except Exception as e:
        print(f"[LangGraph Node: estimate] Estimation failed: {e}")
        return {"error": f"Estimation failed: {e}"}


def challenge_node(state: EstimateState) -> Dict[str, Any]:
    print(f"[LangGraph Node: challenge] Stress-testing estimate for {state.get('demand_id')}...")
    title = state.get("title") or ""
    description = state.get("description") or ""
    effort_days = state.get("effort_days")
    cost_estimate = state.get("cost_estimate")
    
    prompt = f"""
    You are an AI Risk Assessor. Stress-test this estimate for optimism bias and missing scope.
    
    Demand Title: {title}
    Description: {description}
    Estimated Effort: {effort_days} days
    Estimated Cost: {cost_estimate}
    
    Identify potential risks or missing scope items. 
    Output a JSON object with a single field:
    - risk_factors: a list of strings (each string is a brief risk description)
    """
    
    try:
        challenge = call_gemini(
            prompt=prompt,
            system_instruction="Challenge software project estimates and identify risks.",
            is_json=True
        )
        risks = challenge.get("risk_factors") or []
        print(f"[LangGraph Node: challenge] Identified risks: {risks}")
        return {"risk_factors": risks}
    except Exception as e:
        print(f"[LangGraph Node: challenge] Challenge failed: {e}")
        return {"error": f"Challenge failed: {e}"}


def trigger_check_node(state: EstimateState) -> Dict[str, Any]:
    print(f"[LangGraph Node: trigger_check] Checking actuals and anomalies for {state.get('demand_id')}...")
    # In a real system, this would query timesheets and live scope changes.
    # We simulate anomaly detection here.
    
    is_anomaly = random.choice([True, False, False, False]) # 25% chance of triggering re-baseline
    
    if is_anomaly:
        reasons = [
            "Actual effort burn rate exceeds planned by 20%.",
            "Scope creep detected: 5 new epics added to ADO.",
            "Key dependency delayed, impacting critical path.",
            "Resource allocation is 30% below expected capacity."
        ]
        reason = random.choice(reasons)
        print(f"[LangGraph Node: trigger_check] Re-baseline warranted: {reason}")
        return {
            "rebaseline_warranted": True,
            "rebaseline_reason": reason
        }
    else:
        print("[LangGraph Node: trigger_check] Forecasts stay honest. No re-baseline needed.")
        return {
            "rebaseline_warranted": False,
            "rebaseline_reason": None
        }

def route_task(state: EstimateState) -> str:
    task = state.get("task")
    if task == "estimate":
        return "estimate"
    elif task == "challenge":
        return "challenge"
    elif task == "trigger_check":
        return "trigger_check"
    else:
        return "estimate" # fallback

# Define the graph
builder = StateGraph(EstimateState)

# Add nodes
builder.add_node("estimate", estimate_node)
builder.add_node("challenge", challenge_node)
builder.add_node("trigger_check", trigger_check_node)

# Set conditional entry point based on task
builder.set_conditional_entry_point(
    route_task,
    {
        "estimate": "estimate",
        "challenge": "challenge",
        "trigger_check": "trigger_check"
    }
)

builder.add_edge("estimate", END)
builder.add_edge("challenge", END)
builder.add_edge("trigger_check", END)

# Compile
estimate_graph = builder.compile()
