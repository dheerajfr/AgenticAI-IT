import os
import random
import math
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import DemandRecord
from database import db, resource_db
from orchestration.workflow import pipeline_graph

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
    capacityScore: Optional[int] = None
    earliestStartDate: Optional[str] = None
    capacityReasoning: Optional[List[str]] = None
    resourceConstraints: Optional[List[Dict[str, Any]]] = None
    skillGaps: Optional[List[str]] = None



class ApproveBusinessCaseRequest(BaseModel):
    business_case_summary: str


class ResourceModel(BaseModel):
    name: str
    role: str
    skills: List[str]
    total_capacity: int
    allocated_capacity: int


@app.get("/api/demands/resources", response_model=List[ResourceModel])
def get_resources():
    """Retrieve all resources and skills in the system."""
    return resource_db.get_all_resources()


@app.post("/api/demands/resources", response_model=ResourceModel)
def save_resource(resource: ResourceModel):
    """Add or update resource capacity details."""
    resource_db.save_resource(resource.model_dump())
    return resource


@app.delete("/api/demands/resources/{name}")
def delete_resource(name: str):
    """Delete a resource by name."""
    success = resource_db.delete_resource(name)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found.")
    return {"status": "deleted"}


def sync_demand_resource_constraints_with_live_db(record: DemandRecord):
    if not record.resource_constraints:
        return
    try:
        resources = resource_db.get_all_resources()
        role_available_people = {}
        for res in resources:
            role = res["role"]
            avail = res["total_capacity"] - res["allocated_capacity"]
            if avail > 0:
                role_available_people[role] = role_available_people.get(role, 0) + 1
        updated_constraints = []
        for rc in record.resource_constraints:
            role = rc.get("role")
            if role:
                new_rc = dict(rc)
                new_rc["availableCapacity"] = role_available_people.get(role, 0)
                updated_constraints.append(new_rc)
            else:
                updated_constraints.append(rc)
        record.resource_constraints = updated_constraints
    except Exception as e:
        print(f"Error syncing demand resource constraints: {e}")


@app.get("/api/demands", response_model=List[DemandRecord])
def get_demands():
    """List all demand records in the system."""
    records = db.get_all()
    for r in records:
        sync_demand_resource_constraints_with_live_db(r)
    return records


@app.get("/api/demands/{demand_id}", response_model=DemandRecord)
def get_demand(demand_id: str):
    """Retrieve a specific demand record by its ID."""
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
    sync_demand_resource_constraints_with_live_db(record)
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
        "action": "extract",
        "text_content": description if has_text else None,
        "file_bytes": file_bytes,
        "file_name": file_name,
        "file_type": file_type,
        "extracted_data": None,
        "error": None
    }
    
    try:
        graph_output = pipeline_graph.invoke(state_input)
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
        "action": "classify",
        "demand_id": record.demand_id,
        "title": record.title,
        "description": record.description,
        "type": None,
        "domain": None,
        "risk_level": None,
        "duplicate_of": None,
        "domain_reason": None,
        "error": None
    }
    
    try:
        graph_output = pipeline_graph.invoke(state_input)
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
        "domain_reason": graph_output.get("domain_reason")
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


def perform_capacity_check(record: DemandRecord, custom_required_people: Optional[Dict[str, int]] = None):
    required_skills = []
    required_roles = []
    required_capacity = {}
    required_people = {}
    
    # 1. Fetch dynamic resources from Resource DB with error handling
    try:
        resources = resource_db.get_all_resources()
        if not resources:
            raise ValueError("Resource database is empty.")
    except Exception as e:
        print(f"Error fetching capacity data from Resource DB: {e}")
        # Graceful fallback: return a verdict indicating capacity data is currently unavailable
        current_date = datetime.today()
        earliest_start_date = (current_date + timedelta(days=30)).strftime("%Y-%m-%d")
        return {
            "verdict": "at risk",
            "riskLevel": record.risk_level,
            "capacityScore": 0,
            "earliestStartDate": earliest_start_date,
            "resourceConstraints": [],
            "skillGaps": [],
            "staffingOverview": {},
            "reasoning": [
                f"ERROR: Capacity check failed because Resource DB is unreachable or empty: {str(e)}",
                "Start date has been deferred by 30 days as a placeholder safeguard."
            ]
        }

    # Extract dynamic lists of available roles and skills from Resource DB
    available_roles_list = list(set(res["role"] for res in resources))
    available_roles_str = ", ".join(f'"{role}"' for role in available_roles_list)
    
    # 2. Prompt Gemini for requirement extraction using the dynamic roles list
    prompt = f"""
    You are an AI Architect. Analyze the following project demand:
    Title: {record.title}
    Description: {record.description}
    
    Available Roles: {available_roles_str}
    
    Extract:
    - requiredSkills: A list of technical skills required to deliver this request (e.g. ["Java", "Cloud", "Payments", "Architecture", "Python", "React", "UI Design", "Security"]).
    - requiredRoles: A list of roles from the Available Roles list needed for this request.
    - requiredCapacity: A dictionary mapping each required role to the weekly effort units needed (integer, e.g. 5, 10, 15, 20).
    - requiredPeople: A dictionary mapping each required role to the number of people (headcount) needed to staff this demand (integer, e.g. 1, 2, 3). This must represent the total staffing demand regardless of availability.
    
    Format your response as a valid JSON object with fields: requiredSkills (list of strings), requiredRoles (list of strings), requiredCapacity (object/dict), and requiredPeople (object/dict).
    """
    
    try:
        from llm_client import call_gemini
        res_json = call_gemini(
            prompt=prompt,
            system_instruction="Extract project delivery resource requirements.",
            is_json=True
        )
        if isinstance(res_json, dict):
            required_skills = res_json.get("requiredSkills", [])
            required_roles = res_json.get("requiredRoles", [])
            required_capacity = res_json.get("requiredCapacity", {})
            required_people = res_json.get("requiredPeople", {})
    except Exception as e:
        print(f"Gemini capacity extraction failed, falling back to dynamic rules: {e}")
        
    # 3. Dynamic Fallback Rules (derived directly from Resource DB data)
    if not required_skills or not required_roles or not required_capacity:
        title_lower = record.title.lower()
        description_lower = record.description.lower()
        
        # Get all skills in the DB
        skills_in_db = list(set(s for r in resources for s in r["skills"]))
        
        # Match roles based on keywords
        matched_roles = []
        for role in available_roles_list:
            role_words = set(role.lower().replace("&", " ").replace("-", " ").split())
            if any(w in title_lower or w in description_lower for w in role_words if len(w) > 2):
                matched_roles.append(role)
                
        # Default role fallback if no match
        if not matched_roles:
            if "Backend Developer" in available_roles_list:
                matched_roles = ["Backend Developer"]
            else:
                matched_roles = [available_roles_list[0]]
                
        # Match skills based on keywords
        matched_skills = []
        for skill in skills_in_db:
            if skill.lower() in title_lower or skill.lower() in description_lower:
                matched_skills.append(skill)
                
        # Default skill fallback if no match
        if not matched_skills:
            matched_skills = ["Java", "Cloud"]
            
        required_skills = matched_skills
        required_roles = matched_roles
        
        required_capacity = {}
        for role in required_roles:
            if "senior" in role.lower() or "architect" in role.lower() or "lead" in role.lower():
                required_capacity[role] = 15
            else:
                required_capacity[role] = 10

    # Derive required_people from required_capacity if not provided by Gemini (ceil of hours/40, minimum 1)
    if not required_people:
        required_people = {role: max(1, math.ceil(hrs / 40)) for role, hrs in required_capacity.items()}

    # 3.5 Apply custom headcount overrides if saving customized values from frontend
    if custom_required_people is not None:
        required_people = custom_required_people
        required_roles = list(custom_required_people.keys())
        required_capacity = {}
        for role in required_roles:
            count = required_people.get(role, 1)
            if "senior" in role.lower() or "architect" in role.lower() or "lead" in role.lower():
                required_capacity[role] = 15 * count
            else:
                required_capacity[role] = 10 * count
    elif record.resource_constraints:
        required_people = {c.get("role"): c.get("requiredCapacity", 1) for c in record.resource_constraints if c.get("role")}
        required_roles = list(required_people.keys())
        required_capacity = {}
        for role in required_roles:
            count = required_people.get(role, 1)
            if "senior" in role.lower() or "architect" in role.lower() or "lead" in role.lower():
                required_capacity[role] = 15 * count
            else:
                required_capacity[role] = 10 * count
                
    # Ensure High Risk demands require Senior Architect (if Senior Architect role exists in DB)
    if record.risk_level == "high" and "Senior Architect" in available_roles_list:
        if "Senior Architect" not in required_roles:
            required_roles.append("Senior Architect")
            required_capacity["Senior Architect"] = 15
            required_people["Senior Architect"] = required_people.get("Senior Architect", 1)
        if "Architecture" not in required_skills:
            required_skills.append("Architecture")
            
    # Filter to only keep roles with > 0 required headcount
    required_people = {role: count for role, count in required_people.items() if count > 0}
    required_roles = [role for role in required_roles if required_people.get(role, 0) > 0]
            
    # 4. Skill availability check against dynamic workforce pool
    all_workforce_skills = set()
    for res in resources:
        all_workforce_skills.update(res["skills"])
        
    skill_gaps = [skill for skill in required_skills if skill not in all_workforce_skills]
    
    # 5. Resource capacity check against dynamic workforce pool
    role_available_capacity = {}
    role_available_people = {}   # count of people with any free capacity per role
    for res in resources:
        role = res["role"]
        avail = res["total_capacity"] - res["allocated_capacity"]
        role_available_capacity[role] = role_available_capacity.get(role, 0) + avail
        if avail > 0:
            role_available_people[role] = role_available_people.get(role, 0) + 1
        
    resource_constraints = []
    for role in required_roles:
        resource_constraints.append({
            "role": role,
            "requiredCapacity": required_people.get(role, 1),
            "availableCapacity": role_available_people.get(role, 0)
        })
            
    # 6. Earliest Start Date calculation
    current_date = datetime.today()
    max_delay_days = 0
    for constraint in resource_constraints:
        if constraint["availableCapacity"] < constraint["requiredCapacity"]:
            gap = constraint["requiredCapacity"] - constraint["availableCapacity"]
            delay_days = min(84, gap * 14)
            if delay_days > max_delay_days:
                max_delay_days = delay_days
            
    if skill_gaps:
        max_delay_days = max(max_delay_days, 30)
        
    earliest_start_date = (current_date + timedelta(days=max_delay_days)).strftime("%Y-%m-%d")
    
    # 7. Verdict and capacity score
    verdict = "feasible"
    has_constraints = any(c["availableCapacity"] < c["requiredCapacity"] for c in resource_constraints)
    if record.risk_level == "high" and any(c["role"] == "Senior Architect" and c["availableCapacity"] < c["requiredCapacity"] for c in resource_constraints):
        verdict = "at risk"
    elif skill_gaps:
        verdict = "at risk"
    elif has_constraints:
        verdict = "at risk"
        
    total_req_people = sum(c["requiredCapacity"] for c in resource_constraints)
    if total_req_people > 0:
        total_avail_people = sum(min(c["availableCapacity"], c["requiredCapacity"]) for c in resource_constraints)
        people_ratio = total_avail_people / total_req_people
        score = int(people_ratio * 100)
    else:
        score = 100

    if skill_gaps:
        score -= min(15, 2 * len(skill_gaps))
    if record.risk_level == "high":
        score -= 5
    capacity_score = max(0, min(100, score))
    
    # 8. Reasoning list
    reasoning = []
    unique_skills = set()
    for res in resources:
        unique_skills.update(res["skills"])
    
    unique_skills_count = len(unique_skills)
    total_total_cap = sum(res["total_capacity"] for res in resources)
    total_alloc_cap = sum(res["allocated_capacity"] for res in resources)
    
    reasoning.append(f"Workforce pool database scanning: {len(resources)} total active team members evaluated.")
    reasoning.append(f"Technical capability profiling: {unique_skills_count} unique validated skills registered in workforce pool.")
    reasoning.append(f"Global resource utilization: {total_alloc_cap}/{total_total_cap} total weekly effort units currently allocated.")
    
    return {
        "verdict": verdict,
        "riskLevel": record.risk_level,
        "capacityScore": capacity_score,
        "earliestStartDate": earliest_start_date,
        "resourceConstraints": resource_constraints,
        "skillGaps": skill_gaps,
        "reasoning": reasoning
    }


@app.post("/api/demands/{demand_id}/capacity-check")
def run_capacity_check(demand_id: str):
    """
    Runs the advanced capacity check feasibility engine.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    check_result = perform_capacity_check(record)
    # Add backward compatible 'reason' field for client code
    check_result["reason"] = "; ".join(check_result["reasoning"])
    return check_result


@app.post("/api/demands/{demand_id}/approve-capacity", response_model=DemandRecord)
def approve_capacity(demand_id: str, req: ApproveCapacityRequest):
    """
    Commits approved capacity verdict, transitioning status to 'capacity-checked'.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    custom_required_people = None
    if req.resourceConstraints:
        custom_required_people = {c.get("role"): c.get("requiredCapacity", 1) for c in req.resourceConstraints}
        
    # Evaluate capacity metrics dynamically with custom required headcounts to save on the record
    check_result = perform_capacity_check(record, custom_required_people)
    
    record.capacity_verdict = check_result["verdict"]
    record.capacity_score = check_result["capacityScore"]
    record.earliest_start_date = check_result["earliestStartDate"]
    record.capacity_reasoning = check_result["reasoning"]
    record.resource_constraints = check_result["resourceConstraints"]
    record.skill_gaps = check_result["skillGaps"]
    
    record.status = "capacity-checked"
    db.save(record)
    return record


@app.post("/api/demands/{demand_id}/save-capacity", response_model=DemandRecord)
def save_capacity(demand_id: str, req: ApproveCapacityRequest):
    """
    Saves resource capacity check metrics on the record without advancing lifecycle status.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    custom_required_people = None
    if req.resourceConstraints:
        custom_required_people = {c.get("role"): c.get("requiredCapacity", 1) for c in req.resourceConstraints}
        
    check_result = perform_capacity_check(record, custom_required_people)
    
    record.capacity_verdict = check_result["verdict"]
    record.capacity_score = check_result["capacityScore"]
    record.earliest_start_date = check_result["earliestStartDate"]
    record.capacity_reasoning = check_result["reasoning"]
    record.resource_constraints = check_result["resourceConstraints"]
    record.skill_gaps = check_result["skillGaps"]
    
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
        "action": "business_case",
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
        graph_output = pipeline_graph.invoke(state_input)
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
    Also exports the full demand record as a JSON file to the outputs/ folder.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    record.business_case_summary = req.business_case_summary
    record.status = "approved"
    record.funding_status = "approved"
    
    # 1. Save to database
    db.save(record)
    
    # 2. Export to outputs/ folder
    try:
        from datetime import datetime
        import json as _json
        
        # Build path: services/demand-intake/outputs/<demand_id>/
        outputs_root = os.path.join(os.path.dirname(__file__), "outputs")
        demand_output_dir = os.path.join(outputs_root, demand_id)
        os.makedirs(demand_output_dir, exist_ok=True)
        
        # Timestamped filename so re-approvals don't overwrite previous exports
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        output_filename = f"{demand_id}_approved_{timestamp}.json"
        output_path = os.path.join(demand_output_dir, output_filename)
        
        with open(output_path, "w", encoding="utf-8") as f:
            _json.dump(record.model_dump(), f, indent=2, default=str)
        
        print(f"[Approve] Exported approved demand to: {output_path}")
    except Exception as e:
        # Non-fatal: log the error but do not fail the approval
        print(f"[Approve] WARNING: Failed to export output file for {demand_id}: {e}")
    
    return record



@app.post("/api/demands/{demand_id}/save-business-case-draft", response_model=DemandRecord)
def save_business_case_draft(demand_id: str, req: ApproveBusinessCaseRequest):
    """
    Saves a draft of the business case text without transitioning status.
    """
    record = db.get_by_id(demand_id)
    if not record:
        raise HTTPException(status_code=404, detail="Demand record not found.")
        
    record.business_case_summary = req.business_case_summary
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
