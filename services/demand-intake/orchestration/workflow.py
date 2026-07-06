import io
import zipfile
import xml.etree.ElementTree as ET
from typing import TypedDict, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini
from database import db

# ---------------------------------------------------------------------------
# State Schema
# ---------------------------------------------------------------------------

class WorkflowState(TypedDict):
    # Control Parameter: tells the workflow what part of the pipeline to execute
    action: str  # Literal["extract", "classify", "business_case"]
    
    # State fields
    demand_id: Optional[str]
    title: Optional[str]
    description: Optional[str]
    type: Optional[str]
    domain: Optional[str]
    risk_level: Optional[str]
    duplicate_of: Optional[str]
    assigned_to: Optional[str]
    business_case_summary: Optional[str]
    
    # Extraction inputs/outputs
    text_content: Optional[str]
    file_bytes: Optional[bytes]
    file_name: Optional[str]
    file_type: Optional[str]
    extracted_data: Optional[Dict[str, Any]]
    
    error: Optional[str]

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def datetime_today() -> str:
    from datetime import datetime
    return datetime.today().strftime("%Y-%m-%d")


def clean_markdown(text: str) -> str:
    import re
    if not text:
        return ""
    # Remove bold markup (e.g. **, __)
    text = text.replace("**", "")
    text = text.replace("__", "")
    # Convert list bullet points (* or -) to a clean dash
    text = re.sub(r'^\s*[\*\-]\s+', '- ', text, flags=re.MULTILINE)
    # Remove single italic asterisks and underscores
    text = text.replace("*", "")
    text = text.replace("_", "")
    # Remove header markup like #, ##, ###
    text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
    return text

# ---------------------------------------------------------------------------
# Node 1 & 2: Document Parsing and Key Value Extraction Nodes
# ---------------------------------------------------------------------------

def parse_document_node(state: WorkflowState) -> Dict[str, Any]:
    print("[LangGraph Node: parse_document] Starting text extraction...")
    file_bytes = state.get("file_bytes")
    file_name = state.get("file_name") or ""
    
    if not file_bytes:
        return {"error": "No file bytes provided to parse."}
        
    text = ""
    try:
        if file_name.endswith(".txt"):
            text = file_bytes.decode("utf-8", errors="ignore")
            print(f"[LangGraph Node: parse_document] Parsed TXT file, length = {len(text)}")
            
        elif file_name.endswith(".pdf"):
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                pages_text = []
                for page in reader.pages:
                    pt = page.extract_text()
                    if pt:
                        pages_text.append(pt)
                text = "\n".join(pages_text)
                print(f"[LangGraph Node: parse_document] Parsed PDF using PyPDF, length = {len(text)}")
            except Exception as pdf_e:
                print(f"[LangGraph Node: parse_document] PyPDF failed, using fallback: {pdf_e}")
                text = f"--- Document Name: {file_name} ---\nPDF parsing placeholder content. (Install pypdf for local extraction)."
                
        elif file_name.endswith(".docx"):
            try:
                from docx import Document
                doc = Document(io.BytesIO(file_bytes))
                text = "\n".join([p.text for p in doc.paragraphs])
                print(f"[LangGraph Node: parse_document] Parsed DOCX using python-docx, length = {len(text)}")
            except Exception as docx_e:
                print(f"[LangGraph Node: parse_document] python-docx failed, trying xml parsing: {docx_e}")
                try:
                    with zipfile.ZipFile(io.BytesIO(file_bytes)) as docx_zip:
                        xml_content = docx_zip.read('word/document.xml')
                        root = ET.fromstring(xml_content)
                        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                        texts = [node.text for node in root.findall('.//w:t', ns) if node.text]
                        text = " ".join(texts)
                        print(f"[LangGraph Node: parse_document] Parsed DOCX xml structure directly, length = {len(text)}")
                except Exception as zip_e:
                    print(f"[LangGraph Node: parse_document] Direct DOCX XML parse failed: {zip_e}")
                    text = f"--- Document Name: {file_name} ---\nDOCX parsing placeholder. (Install python-docx or fix XML structures)."
        else:
            return {"error": f"Unsupported file type for file: {file_name}"}
            
    except Exception as e:
        print(f"[LangGraph Node: parse_document] Fatal extraction error: {e}")
        return {"error": f"Failed to extract document contents: {str(e)}"}
        
    return {"text_content": text}


def extract_node(state: WorkflowState) -> Dict[str, Any]:
    print("[LangGraph Node: extract] Initiating key value extraction via LLMClient...")
    text_content = state.get("text_content") or ""
    
    if not text_content.strip():
        return {"error": "Intake text content is empty."}
        
    prompt = f"""
    You are an AI Intake specialist. Please read the following demand request text and extract the key information.
    Format your response as a valid JSON object with the following fields:
    - title: A short concise title for the project or request
    - description: A detailed summary of the request
    - submitted_by: The email or user ID of the person making the request. (If not found, use "system.intake")
    
    REQUEST TEXT:
    \"\"\"{text_content}\"\"\"
    """
    
    try:
        extracted = call_gemini(
            prompt=prompt,
            system_instruction="Extract structured request details in JSON.",
            is_json=True
        )
        
        result = {
            "title": extracted.get("title") or "New Demand Request",
            "description": extracted.get("description") or text_content,
            "submitted_by": extracted.get("submitted_by") or "system.intake",
            "submitted_date": extracted.get("submitted_date") or datetime_today()
        }
        
        print(f"[LangGraph Node: extract] Successfully extracted title: {result['title']}")
        return {"extracted_data": result}
        
    except Exception as e:
        print(f"[LangGraph Node: extract] LLM extraction error: {e}")
        return {"error": f"LLM client failed to extract request details: {str(e)}"}

# ---------------------------------------------------------------------------
# Node 3, 4 & 5: Classification and Routing Nodes
# ---------------------------------------------------------------------------

def classify_node(state: WorkflowState) -> Dict[str, Any]:
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


def check_duplicates_node(state: WorkflowState) -> Dict[str, Any]:
    print(f"[LangGraph Node: check-duplicates] Scanning database for duplicates of {state.get('demand_id')}...")
    title = (state.get("title") or "").lower().strip()
    demand_id = state.get("demand_id")
    
    existing_records = db.get_all()
    duplicate_of = None
    
    for record in existing_records:
        if record.demand_id == demand_id:
            continue
            
        record_title = record.title.lower().strip()
        if record_title == title:
            duplicate_of = record.demand_id
            print(f"[LangGraph Node: check-duplicates] Found exact duplicate match: {record.demand_id}")
            break
            
        words_a = set(title.split())
        words_b = set(record_title.split())
        common_words = words_a.intersection(words_b)
        
        if len(common_words) >= 3 and len(words_a) > 2 and len(words_b) > 2:
            overlap = len(common_words) / min(len(words_a), len(words_b))
            if overlap > 0.6:
                duplicate_of = record.demand_id
                print(f"[LangGraph Node: check-duplicates] Found high-similarity duplicate match: {record.demand_id} (overlap={overlap:.2f})")
                break
                
    if not duplicate_of:
        print("[LangGraph Node: check-duplicates] No duplicate records identified.")
        
    return {"duplicate_of": duplicate_of}


def route_node(state: WorkflowState) -> Dict[str, Any]:
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

# ---------------------------------------------------------------------------
# Node 6: Business Case Generation Node
# ---------------------------------------------------------------------------

def generate_draft_node(state: WorkflowState) -> Dict[str, Any]:
    print(f"[LangGraph Node: generate_draft] Generating business case for demand {state.get('demand_id')}...")
    title = state.get("title") or ""
    description = state.get("description") or ""
    dtype = state.get("type") or ""
    domain = state.get("domain") or ""
    risk_level = state.get("risk_level") or ""
    demand_id = state.get("demand_id") or ""
    
    prompt = f"""
    Draft a business case summary for the following project request.
    
    PROJECT DETAILS:
    ID: {demand_id}
    Title: {title}
    Description: {description}
    Type: {dtype}
    Domain: {domain}
    Risk Level: {risk_level}
    
    At the very beginning of your response, you MUST include the following title line:
    Business Case Summary: {title} ({demand_id})
    
    Provide an executive summary, direct business value/impact, and potential risk mitigation.
    Keep the draft concise, professional, and well-structured.
    Do NOT use any markdown formatting like asterisks (** or *), hashes (#), or list symbols. Use plain text headings on their own lines instead.
    """
    
    try:
        draft = call_gemini(
            prompt=prompt,
            system_instruction=f"Draft a brief business case summary in plain text. Start with 'Business Case Summary: {title} ({demand_id})'. Do not use markdown tags like #, *, or **."
        )
        cleaned_draft = clean_markdown(draft)
        print(f"[LangGraph Node: generate_draft] Business case drafted successfully, length = {len(cleaned_draft)}")
        return {"business_case_summary": cleaned_draft}
    except Exception as e:
        print(f"[LangGraph Node: generate_draft] Business case drafting failed: {e}")
        return {"error": f"Business case generation failed: {e}"}

# ---------------------------------------------------------------------------
# Routing Rules
# ---------------------------------------------------------------------------

def route_entry(state: WorkflowState) -> str:
    action = state.get("action")
    print(f"[LangGraph Entry Router] Routing action '{action}'...")
    if action == "extract":
        if state.get("file_bytes") is not None:
            return "parse_document"
        return "extract"
    elif action == "classify":
        return "classify"
    elif action == "business_case":
        return "generate_draft"
    
    # Default fallback
    print(f"[LangGraph Entry Router] Unknown action '{action}'. Defaulting to END.")
    return "END"

# ---------------------------------------------------------------------------
# Compile Unified State Graph
# ---------------------------------------------------------------------------

builder = StateGraph(WorkflowState)

# Add all nodes
builder.add_node("parse_document", parse_document_node)
builder.add_node("extract", extract_node)
builder.add_node("classify", classify_node)
builder.add_node("check_duplicates", check_duplicates_node)
builder.add_node("route", route_node)
builder.add_node("generate_draft", generate_draft_node)

# Set conditional entry point
builder.set_conditional_entry_point(
    route_entry,
    {
        "parse_document": "parse_document",
        "extract": "extract",
        "classify": "classify",
        "generate_draft": "generate_draft",
        "END": END
    }
)

# Define internal transitions
builder.add_edge("parse_document", "extract")
builder.add_edge("extract", END)

builder.add_edge("classify", "check_duplicates")
builder.add_edge("check_duplicates", "route")
builder.add_edge("route", END)

builder.add_edge("generate_draft", END)

pipeline_graph = builder.compile()
