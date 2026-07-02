import io
import zipfile
import xml.etree.ElementTree as ET
from typing import TypedDict, Optional, Dict, Any
from langgraph.graph import StateGraph, END
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from llm_client import call_gemini

class IntakeState(TypedDict):
    text_content: Optional[str]
    file_bytes: Optional[bytes]
    file_name: Optional[str]
    file_type: Optional[str]
    extracted_data: Optional[Dict[str, Any]]
    error: Optional[str]


def parse_document_node(state: IntakeState) -> Dict[str, Any]:
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
            # Try python-docx first
            try:
                from docx import Document
                doc = Document(io.BytesIO(file_bytes))
                text = "\n".join([p.text for p in doc.paragraphs])
                print(f"[LangGraph Node: parse_document] Parsed DOCX using python-docx, length = {len(text)}")
            except Exception as docx_e:
                print(f"[LangGraph Node: parse_document] python-docx failed, trying xml parsing: {docx_e}")
                # Fallback XML parsing
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


def extract_node(state: IntakeState) -> Dict[str, Any]:
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
        
        # Verify fields are present, set defaults if not
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


def datetime_today() -> str:
    from datetime import datetime
    return datetime.today().strftime("%Y-%m-%d")


def route_entry(state: IntakeState) -> str:
    # Router logic: check if there's a file to parse or text to extract directly
    if state.get("file_bytes") is not None:
        print("[LangGraph Router] File bytes detected. Routing to: parse_document")
        return "parse_document"
    print("[LangGraph Router] Text input detected. Routing directly to: extract")
    return "extract"


# Define the graph
workflow = StateGraph(IntakeState)
workflow.add_node("parse_document", parse_document_node)
workflow.add_node("extract", extract_node)

# Connect edges using conditional entry
workflow.set_conditional_entry_point(
    route_entry,
    {
        "parse_document": "parse_document",
        "extract": "extract"
    }
)

workflow.add_edge("parse_document", "extract")
workflow.add_edge("extract", END)

# Compile graph
extract_graph = workflow.compile()
