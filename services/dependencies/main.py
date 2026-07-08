from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Literal

from models import (
    DependencyEdge,
    DependencySenseRequest,
    DependencySenseResponse,
    ChaseCommitmentResponse,
    CrossProgrammeImpactRequest,
    CrossProgrammeImpactResponse
)
from database import db, plan_loader
from orchestration.dependency_graph import dependency_graph

app = FastAPI(
    title="Dependencies Service (Stage 04)",
    description="Backend API for mapping task dependencies, status alerts, chasing commitments, and ripple impact forecasts.",
    version="1.0.0"
)

# Enable CORS for local environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_dependency_id() -> str:
    all_deps = db.get_all()
    if not all_deps:
        return "DEP-0001"
    max_num = 0
    for d in all_deps:
        try:
            parts = d.dependency_id.split("-")
            if len(parts) == 2:
                num = int(parts[1])
                if num > max_num:
                    max_num = num
        except (IndexError, ValueError):
            continue
    return f"DEP-{max_num + 1:04d}"


@app.get("/api/dependencies", response_model=List[DependencyEdge])
def get_dependencies():
    """List all dependency edges in the system."""
    return db.get_all()


@app.get("/api/dependencies/{dependency_id}", response_model=DependencyEdge)
def get_dependency(dependency_id: str):
    """Retrieve a specific dependency edge by ID."""
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    return dep


import os
import json

def load_demand_by_id(demand_id: str) -> Optional[dict]:
    """Helper to locate demand fixtures and load demand record."""
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "demand-intake", "fixtures"))
    if not os.path.exists(fixtures_dir):
        return None
    for filename in os.listdir(fixtures_dir):
        if filename.endswith(".json"):
            filepath = os.path.join(fixtures_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("demand_id") == demand_id:
                        return data
            except Exception:
                continue
    return None


@app.post("/api/dependencies", response_model=DependencyEdge)
def create_dependency(dep: DependencyEdge):
    """Manually add a dependency edge."""
    if db.get_by_id(dep.dependency_id):
        raise HTTPException(status_code=400, detail="Dependency ID already exists.")
    # Check for duplicate dependency edge (same source and target task ID)
    for existing in db.get_all():
        if existing.source_task_id == dep.source_task_id and existing.target_task_id == dep.target_task_id:
            raise HTTPException(
                status_code=400,
                detail=f"A dependency edge from {dep.source_task_id} to {dep.target_task_id} already exists ({existing.dependency_id})."
            )
    dep.activity_history = [
        "✓ Dependency edge registered",
        f"✓ Predecessor mapped to {dep.target_task_id}"
    ]
    dep.draft_message = ""
    db.save(dep)
    return dep


@app.post("/api/dependencies/sense", response_model=DependencySenseResponse)
def sense_dependencies(req: DependencySenseRequest):
    """
    Senses dependencies within a plan.
    Scans the plan schedule from the plan fixtures and runs LLM detection.
    """
    plan = plan_loader.load_plan_by_id(req.plan_id)
    if not plan:
        raise HTTPException(
            status_code=404,
            detail=f"Plan record with ID {req.plan_id} not found."
        )
        
    # Coordination checkpoint: confirm scope with Classify & Route and Capacity Check stages
    demand = load_demand_by_id(plan.demand_id)
    if demand:
        status = demand.get("status")
        # Enforce that scope must be confirmed (classified, capacity-checked, or approved)
        if status not in ["classified", "capacity-checked", "approved"]:
            raise HTTPException(
                status_code=400,
                detail=f"Precondition failed: Associated demand {plan.demand_id} has status '{status}'. "
                f"It must be classified and capacity-checked before sensing dependencies."
            )
        
    state_input = {
        "task": "sense",
        "plan_id": req.plan_id,
        "plan": plan,
        "error": None
    }
    
    try:
        graph_output = dependency_graph.invoke(state_input)
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
        
    raw_edges = graph_output.get("detected_dependencies") or []
    detected_edges = []
    
    for raw in raw_edges:
        source_task = raw.get("source_task_id") or "UNKNOWN"
        target_task = raw.get("target_task_id") or "UNKNOWN"
        
        # Verify no duplicate source/target edge already exists in DB
        is_duplicate = False
        for existing in db.get_all():
            if existing.source_task_id == source_task and existing.target_task_id == target_task:
                is_duplicate = True
                break
        if is_duplicate:
            continue

        # Construct and validate DependencyEdge records
        dep_id = raw.get("dependency_id") or generate_dependency_id()
        # Verify it doesn't already exist
        if db.get_by_id(dep_id):
            dep_id = generate_dependency_id()
            
        # Normalize and sanitize type
        raw_type = raw.get("type") or "technical"
        if raw_type not in ["technical", "resource", "data", "external-vendor"]:
            raw_type_lower = str(raw_type).lower()
            if "tech" in raw_type_lower:
                raw_type = "technical"
            elif "resource" in raw_type_lower:
                raw_type = "resource"
            elif "data" in raw_type_lower:
                raw_type = "data"
            elif "vendor" in raw_type_lower or "external" in raw_type_lower:
                raw_type = "external-vendor"
            else:
                raw_type = "technical"

        # Normalize and sanitize status
        raw_status = raw.get("status") or "open"
        if raw_status not in ["open", "at-risk", "resolved"]:
            raw_status_lower = str(raw_status).lower()
            if "open" in raw_status_lower:
                raw_status = "open"
            elif "risk" in raw_status_lower:
                raw_status = "at-risk"
            elif "resolved" in raw_status_lower or "resolve" in raw_status_lower:
                raw_status = "resolved"
            else:
                raw_status = "open"

        edge = DependencyEdge(
            dependency_id=dep_id,
            source_task_id=source_task,
            target_task_id=target_task,
            type=raw_type,
            status=raw_status,
            owner=raw.get("owner") or "admin@example.com",
            activity_history=[
                "✓ Dependency sensed by AI",
                f"✓ Predecessor mapped to {target_task}"
            ],
            draft_message=""
        )
        db.save(edge)
        detected_edges.append(edge)
        
    return DependencySenseResponse(detected_dependencies=detected_edges)


from pydantic import BaseModel

class LogActivityRequest(BaseModel):
    activity: str

class UpdateStatusRequest(BaseModel):
    status: Literal["open", "at-risk", "resolved"]

class SaveDraftRequest(BaseModel):
    draft_message: str


@app.post("/api/dependencies/{dependency_id}/chase", response_model=ChaseCommitmentResponse)
def chase_commitment(dependency_id: str, tone: Optional[str] = None):
    """
    Triggers chase commitment graph.
    Generates status update nudges and checks critical path escalation.
    """
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    if dep.status == "resolved":
        raise HTTPException(
            status_code=400,
            detail="Dependency has already been resolved. No follow-up action required."
        )
        
    # Attempt to locate associated plan
    associated_plan = None
    all_plans = plan_loader.load_all_plans()
    for p in all_plans:
        task_ids = [t.task_id for t in p.tasks]
        if dep.source_task_id in task_ids:
            associated_plan = p
            break
            
    state_input = {
        "task": "chase",
        "dependency_id": dependency_id,
        "dependency": dep,
        "plan": associated_plan,
        "tone": tone,
        "error": None
    }
    
    try:
        graph_output = dependency_graph.invoke(state_input)
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
        
    # Update dependency state with draft and activity history
    if not dep.activity_history:
        dep.activity_history = []
    dep.activity_history.append(f"✓ AI analysis completed & reminder generated (tone: {tone or 'default'})")
    dep.draft_message = graph_output.get("nudge_message", "")
    dep.threat_level = graph_output.get("threat_level", "medium")
    dep.confidence = graph_output.get("confidence", 90)
    dep.confidence_reasons = graph_output.get("confidence_reasons", [])
    db.save(dep)
    return ChaseCommitmentResponse(
        dependency_id=dependency_id,
        nudge_message=graph_output.get("nudge_message", ""),
        escalation_required=graph_output.get("escalation_required", False),
        threat_level=graph_output.get("threat_level", "medium"),
        confidence=graph_output.get("confidence", 90),
        confidence_reasons=graph_output.get("confidence_reasons", [])
    )


@app.post("/api/dependencies/{dependency_id}/activity", response_model=DependencyEdge)
def add_activity(dependency_id: str, req: LogActivityRequest):
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    if not dep.activity_history:
        dep.activity_history = []
    dep.activity_history.append(req.activity)
    db.save(dep)
    return dep


@app.post("/api/dependencies/{dependency_id}/status", response_model=DependencyEdge)
def update_status(dependency_id: str, req: UpdateStatusRequest):
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    dep.status = req.status
    if not dep.activity_history:
        dep.activity_history = []
    dep.activity_history.append(f"✓ Status updated to {req.status.upper()}")
    db.save(dep)
    return dep


@app.post("/api/dependencies/{dependency_id}/draft", response_model=DependencyEdge)
def save_draft_message(dependency_id: str, req: SaveDraftRequest):
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    dep.draft_message = req.draft_message
    if not dep.activity_history:
        dep.activity_history = []
    dep.activity_history.append("✓ Draft follow-up message updated")
    db.save(dep)
    return dep


@app.get("/api/dependencies/{dependency_id}/graph")
def get_dependency_graph(dependency_id: str):
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
        
    # Find associated plan
    associated_plan = None
    all_plans = plan_loader.load_all_plans()
    for p in all_plans:
        task_ids = [t.task_id for t in p.tasks]
        if dep.source_task_id in task_ids:
            associated_plan = p
            break
            
    # Build graph nodes and links
    nodes = []
    links = []
    
    # Predecessor node
    pred_task = None
    if associated_plan:
        for t in associated_plan.tasks:
            if t.task_id == dep.target_task_id:
                pred_task = t
                break
                
    pred_name = pred_task.name if pred_task else dep.target_task_id
    pred_owner = pred_task.owner if pred_task else dep.owner
    nodes.append({
        "id": dep.target_task_id,
        "label": pred_name,
        "type": "predecessor",
        "owner": pred_owner,
        "status": "pending"
    })
    
    # Dependent node
    dep_task = None
    if associated_plan:
        for t in associated_plan.tasks:
            if t.task_id == dep.source_task_id:
                dep_task = t
                break
                
    dep_name = dep_task.name if dep_task else dep.source_task_id
    dep_owner = dep_task.owner if dep_task else dep.owner
    nodes.append({
        "id": dep.source_task_id,
        "label": dep_name,
        "type": "dependent",
        "owner": dep_owner,
        "status": dep.status
    })
    
    links.append({
        "source": dep.target_task_id,
        "target": dep.source_task_id,
        "type": dep.type
    })
    
    # Release node
    release_label = "Release Milestone"
    if associated_plan:
        if associated_plan.plan_id == "PLN-0002-1":
            release_label = "Release 2.3"
        elif associated_plan.plan_id == "PLN-0001-1":
            release_label = "Release 1.0"
        elif associated_plan.plan_id == "PLN-0003-1":
            release_label = "Release 1.5"
            
    nodes.append({
        "id": "RELEASE_NODE",
        "label": release_label,
        "type": "release",
        "owner": "Release Manager",
        "status": "scheduled"
    })
    
    links.append({
        "source": dep.source_task_id,
        "target": "RELEASE_NODE",
        "type": "milestone"
    })
    
    return {
        "nodes": nodes,
        "links": links
    }

@app.post("/api/dependencies/impact", response_model=CrossProgrammeImpactResponse)
def check_cross_programme_impact(req: CrossProgrammeImpactRequest):
    """
    Performs critical path delay analysis.
    Calculates forecast slippage when a specific task is delayed.
    """
    # Locate plan containing the task
    associated_plan = None
    all_plans = plan_loader.load_all_plans()
    for p in all_plans:
        task_ids = [t.task_id for t in p.tasks]
        if req.task_id in task_ids:
            associated_plan = p
            break
            
    if not associated_plan:
        raise HTTPException(
            status_code=404,
            detail=f"No plan found containing task ID {req.task_id}."
        )
        
    state_input = {
        "task": "impact",
        "plan_id": associated_plan.plan_id,
        "plan": associated_plan,
        "delay_task_id": req.task_id,
        "delay_days": req.delay_days,
        "error": None
    }
    
    try:
        graph_output = dependency_graph.invoke(state_input)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"LangGraph execution failed: {str(e)}"
        )
        
    if graph_output.get("error"):
        raise HTTPException(
            status_code=422,
            detail=graph_output["error"]
        )
        
    return CrossProgrammeImpactResponse(
        impact_detected=graph_output.get("impact_detected", False),
        original_project_end_date=graph_output.get("original_project_end_date", ""),
        new_project_end_date=graph_output.get("new_project_end_date", ""),
        project_end_date_slipped=graph_output.get("project_end_date_slipped", False),
        affected_tasks=graph_output.get("affected_tasks") or [],
        explanation=graph_output.get("explanation", "")
    )
