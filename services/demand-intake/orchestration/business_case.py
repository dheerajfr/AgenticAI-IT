from typing import TypedDict, Optional, Dict, Any
from langgraph.graph import StateGraph, END
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini

class BusinessCaseState(TypedDict):
    demand_id: str
    title: str
    description: str
    type: str
    domain: str
    risk_level: str
    business_case_summary: Optional[str]
    error: Optional[str]


def generate_draft_node(state: BusinessCaseState) -> Dict[str, Any]:
    print(f"[LangGraph Node: generate_draft] Generating business case for demand {state.get('demand_id')}...")
    title = state.get("title") or ""
    description = state.get("description") or ""
    dtype = state.get("type") or ""
    domain = state.get("domain") or ""
    risk_level = state.get("risk_level") or ""
    
    prompt = f"""
    Draft a business case summary for the following project request.
    
    PROJECT DETAILS:
    ID: {state.get('demand_id')}
    Title: {title}
    Description: {description}
    Type: {dtype}
    Domain: {domain}
    Risk Level: {risk_level}
    
    Provide an executive summary, direct business value/impact, and potential risk mitigation.
    Keep the draft concise, professional, and well-structured.
    """
    
    try:
        draft = call_gemini(
            prompt=prompt,
            system_instruction="Draft a brief business case summary."
        )
        print(f"[LangGraph Node: generate_draft] Business case drafted successfully, length = {len(draft)}")
        return {"business_case_summary": draft}
    except Exception as e:
        print(f"[LangGraph Node: generate_draft] Business case drafting failed: {e}")
        return {"error": f"Business case generation failed: {e}"}


# Define the graph
builder = StateGraph(BusinessCaseState)
builder.add_node("generate_draft", generate_draft_node)
builder.set_entry_point("generate_draft")
builder.add_edge("generate_draft", END)

# Compile
business_case_graph = builder.compile()
