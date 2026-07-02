from typing import TypedDict, Optional, Dict, Any
from langgraph.graph import StateGraph, END
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini
from database import db

class ClassifyState(TypedDict):
    demand_id: str
    title: str
    description: str
    type: Optional[str]
    domain: Optional[str]
    risk_level: Optional[str]
    duplicate_of: Optional[str]
    assigned_to: Optional[str]
    error: Optional[str]


def classify_node(state: ClassifyState) -> Dict[str, Any]:
    print(f"[LangGraph Node: classify] Analyzing demand {state.get('demand_id')}...")
    title = state.get("title") or ""
    description = state.get("description") or ""
    
    prompt = f"""
    You are an AI Architect. Analyze this project demand:
    Title: {title}
    Description: {description}
    
    Classify it into:
    - type: one of "project", "enhancement", "defect-fix", "compliance"
    - domain: the business or technical area (e.g., "Payments & Checkout", "Customer Digital", "Infrastructure", "Security & Compliance")
    - risk_level: one of "low", "medium", "high"
    
    Format response as valid JSON with fields: type, domain, risk_level.
    """
    
    try:
        classification = call_gemini(
            prompt=prompt,
            system_instruction="Classify development requests.",
            is_json=True
        )
        print(f"[LangGraph Node: classify] Suggested type={classification.get('type')}, domain={classification.get('domain')}, risk={classification.get('risk_level')}")
        return {
            "type": classification.get("type") or "project",
            "domain": classification.get("domain") or "General Platform",
            "risk_level": classification.get("risk_level") or "medium"
        }
    except Exception as e:
        print(f"[LangGraph Node: classify] Classification failed: {e}")
        return {"error": f"Classification failed: {e}"}


def check_duplicates_node(state: ClassifyState) -> Dict[str, Any]:
    print(f"[LangGraph Node: check-duplicates] Scanning database for duplicates of {state.get('demand_id')}...")
    title = (state.get("title") or "").lower().strip()
    demand_id = state.get("demand_id")
    
    # Query database records
    existing_records = db.get_all()
    duplicate_of = None
    
    for record in existing_records:
        if record.demand_id == demand_id:
            continue
            
        record_title = record.title.lower().strip()
        # Basic exact check or keyword matching to simulate duplicate check
        # E.g. check if the titles are identical or contain major keywords
        if record_title == title:
            duplicate_of = record.demand_id
            print(f"[LangGraph Node: check-duplicates] Found exact duplicate match: {record.demand_id}")
            break
            
        # Simulating keyword similarity
        words_a = set(title.split())
        words_b = set(record_title.split())
        common_words = words_a.intersection(words_b)
        
        # If they share a significant amount of content and are of similar nature
        if len(common_words) >= 3 and len(words_a) > 2 and len(words_b) > 2:
            # Simple threshold check
            overlap = len(common_words) / min(len(words_a), len(words_b))
            if overlap > 0.6:
                duplicate_of = record.demand_id
                print(f"[LangGraph Node: check-duplicates] Found high-similarity duplicate match: {record.demand_id} (overlap={overlap:.2f})")
                break
                
    if not duplicate_of:
        print("[LangGraph Node: check-duplicates] No duplicate records identified.")
        
    return {"duplicate_of": duplicate_of}


def route_node(state: ClassifyState) -> Dict[str, Any]:
    print(f"[LangGraph Node: route] Selecting owner and team queue for demand {state.get('demand_id')}...")
    domain = state.get("domain") or ""
    dtype = state.get("type") or ""
    
    assigned_to = "general-delivery-queue"
    
    domain_lower = domain.lower()
    if "payment" in domain_lower or "checkout" in domain_lower:
        assigned_to = "d.chen (Payments & Checkout Team)"
    elif "security" in domain_lower or "compliance" in domain_lower or dtype == "compliance":
        assigned_to = "clara.davis (Security & Governance Team)"
    elif "infrastructure" in domain_lower or "cloud" in domain_lower or "database" in domain_lower:
        assigned_to = "infra-platform-queue"
    elif "digital" in domain_lower or "customer" in domain_lower:
        assigned_to = "m.rodriguez (Customer Digital Team)"
    elif dtype == "defect-fix":
        assigned_to = "developer.dan (Core Maintenance Team)"
        
    print(f"[LangGraph Node: route] Routed demand to: {assigned_to}")
    return {"assigned_to": assigned_to}


# Define the graph
builder = StateGraph(ClassifyState)
builder.add_node("classify", classify_node)
builder.add_node("check_duplicates", check_duplicates_node)
builder.add_node("route", route_node)

builder.set_entry_point("classify")
builder.add_edge("classify", "check_duplicates")
builder.add_edge("check_duplicates", "route")
builder.add_edge("route", END)

# Compile
classify_graph = builder.compile()
