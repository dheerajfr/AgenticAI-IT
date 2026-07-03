import os
import random
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import DemandRecord
from database import db
from orchestration.extract_graph import extract_graph
from orchestration.classify_graph import classify_graph
from orchestration.business_case import business_case_graph

app = FastAPI(
    title="Demand & Intake Service (Stage 01)",
    description="Backend API for capturing, extracting, classifying, routing, checking capacity, and drafting business cases.",
    version="1.0.0"
)

# Enable CORS for frontend shell local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to generate unique demand ID
def generate_demand_id() -> str:
    all_records = db.get_all()
    if not all_records:
        return "DEM-2026-0001"
    # Find max numeric suffix
    max_num = 0
    for r in all_records:
        try:
            parts = r.demand_id.split("-")
            if len(parts) == 3:
                num = int(parts[2])
                if num > max_num:
                    max_num = num
        except ValueError:
            continue
    next_num = max_num + 1
    return f"DEM-2026-{next_num:04d}"


# Request Models for approval endpoints
class ApproveClassifyRequest(BaseModel):
    type: str
    domain: str
    risk_level: str
    duplicate_of: Optional[str] = None

class ApproveCapacityRequest(BaseModel):
    verdict: str

class ApproveBusinessCaseRequest(BaseModel):
    business_case_summary: str


@app.get("/api/demands", response_model=List[DemandRecord])
def get_demands():
    """List all demand records in the system."""
    return db.get_all()


@app.get("/api/demands/{demand_id}", response_model=DemandRecord)
def get_demand(demand_id: str):
    """Retrieve a specific demand record by its ID."""
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
    return record


@app.post("/api/demands/intake", response_model=DemandRecord)
async def submit_intake(
    title: Optional[str] = Form(None),
    submitted_by: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """
    Submits a demand intake via text entry or document upload.
    Runs the intake LangGraph workflow for structure extraction.
    """
    # 1. Validation check
    has_text = bool(description and description.strip())
    has_file = file is not None and bool(file.filename)
    
    if not has_text and not has_file:
        raise HTTPException(
            status_code=400,
            detail="Submission rejected: You must either provide description text or upload a document."
        )
        
    file_bytes = None
    file_name = None
    file_type = None
    
    if has_file:
        file_name = file.filename
        file_type = file.content_type
        # Verify supported extensions (.txt, .pdf, .docx)
        ext = os.path.splitext(file_name)[1].lower()
        if ext not in [".txt", ".pdf", ".docx"]:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Only .txt, .pdf, and .docx files are allowed."
            )
        file_bytes = await file.read()
        
    # 2. Invoke Capture & Structure LangGraph
    state_input = {
        "text_content": description if has_text else None,
        "file_bytes": file_bytes,
        "file_name": file_name,
        "file_type": file_type,
        "extracted_data": None,
        "error": None
    }
    
    try:
        graph_output = extract_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"LangGraph execution failed: {str(e)}"
        )
        
    if graph_output.get("error"):
        raise HTTPException(
            status_code=422,
            detail=graph_output["error"]
        )
        
    extracted = graph_output.get("extracted_data") or {}
    
    # 3. Create DemandRecord
    demand_id = generate_demand_id()
    new_record = DemandRecord(
        demand_id=demand_id,
        title=title if (title and title.strip()) else extracted.get("title", "New Demand"),
        description=extracted.get("description", description or "No description extracted"),
        type="project",  # default placeholder until classification runs
        domain="General Platform",  # default
        risk_level="low",  # default
        funding_status="pending",  # default
        submitted_by=submitted_by if (submitted_by and submitted_by.strip()) else extracted.get("submitted_by", "anonymous"),
        submitted_date=datetime.today().strftime("%Y-%m-%d"),
        source="document" if has_file else "text",
        source_filename=file_name,
        duplicate_of=None,
        business_case_summary=None,
        status="intake"
    )
    
    # 4. Save to in-memory store
    db.save(new_record)
    return new_record


@app.post("/api/demands/{demand_id}/classify-route")
def run_classify_route(demand_id: str):
    """
    Runs the Classify & Route LangGraph workflow for classification suggestions.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    state_input = {
        "demand_id": record.demand_id,
        "title": record.title,
        "description": record.description,
        "type": None,
        "domain": None,
        "risk_level": None,
        "duplicate_of": None,
        "assigned_to": None,
        "error": None
    }
    
    try:
        graph_output = classify_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Classification LangGraph execution failed: {str(e)}"
        )
        
    if graph_output.get("error"):
        raise HTTPException(
            status_code=422,
            detail=graph_output["error"]
        )
        
    return {
        "type": graph_output.get("type"),
        "domain": graph_output.get("domain"),
        "risk_level": graph_output.get("risk_level"),
        "duplicate_of": graph_output.get("duplicate_of"),
        "assigned_to": graph_output.get("assigned_to")
    }


@app.post("/api/demands/{demand_id}/approve-classify", response_model=DemandRecord)
def approve_classify(demand_id: str, req: ApproveClassifyRequest):
    """
    Commits approved classification suggestions to the demand record.
    Transitions status to 'classified'.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    record.type = req.type
    record.domain = req.domain
    record.risk_level = req.risk_level
    record.duplicate_of = req.duplicate_of
    record.status = "classified"
    
    db.save(record)
    return record


@app.post("/api/demands/{demand_id}/capacity-check")
def run_capacity_check(demand_id: str):
    """
    Stub capacity check. Returns static verdict feasibility.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    # Return dynamic-looking stub verdict
    # E.g., if risk is high, flag as at risk, otherwise feasible
    verdict = "feasible"
    reason = "Standard delivery resource queue has open backlog bandwidth for current quarter."
    
    if record.risk_level == "high":
        verdict = "at risk"
        reason = "High risk assessment requires specialized Senior Architect resources, currently at 95% utilization."
        
    return {
        "verdict": verdict,
        "reason": reason
    }


@app.post("/api/demands/{demand_id}/approve-capacity", response_model=DemandRecord)
def approve_capacity(demand_id: str, req: ApproveCapacityRequest):
    """
    Commits approved capacity verdict, transitioning status to 'capacity-checked'.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    record.status = "capacity-checked"
    db.save(record)
    return record


@app.post("/api/demands/{demand_id}/business-case")
def run_business_case_draft(demand_id: str):
    """
    Runs the Business Case draft LangGraph generation node.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    state_input = {
        "demand_id": record.demand_id,
        "title": record.title,
        "description": record.description,
        "type": record.type,
        "domain": record.domain,
        "risk_level": record.risk_level,
        "business_case_summary": None,
        "error": None
    }
    
    try:
        graph_output = business_case_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Business Case LangGraph execution failed: {str(e)}"
        )
        
    if graph_output.get("error"):
        raise HTTPException(
            status_code=422,
            detail=graph_output["error"]
        )
        
    return {
        "business_case_summary": graph_output.get("business_case_summary")
    }


@app.post("/api/demands/{demand_id}/approve-business-case", response_model=DemandRecord)
def approve_business_case(demand_id: str, req: ApproveBusinessCaseRequest):
    """
    Commits approved business case text, transitioning status to 'approved'.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    record.business_case_summary = req.business_case_summary
    record.status = "approved"
    record.funding_status = "approved" # Set to approved as well as part of final sign-off
    
    db.save(record)
    return record


@app.delete("/api/demands/{demand_id}")
def delete_demand(demand_id: str):
    """
    Deletes a demand record.
    """
    success = db.delete(demand_id)
    if not success:
        raise HTTPException(status_code=404, detail="Demand not found.")
    return {"status": "deleted"}
