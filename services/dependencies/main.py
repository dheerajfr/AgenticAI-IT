from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Literal

from models import (
    DependencyEdge,
    DependencySenseRequest,
    DependencySenseResponse,
    ChaseCommitmentResponse,
    CrossProgrammeImpactRequest,
    CrossProgrammeImpactResponse,
    DependencyTaskDetails
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


def populate_is_self_dependency(dep: DependencyEdge) -> DependencyEdge:
    associated_plan = None
    all_plans = plan_loader.load_all_plans()

    # Prefer the plan whose plan_id matches the dependency's plan_id — this
    # avoids false negatives when the same task IDs exist in multiple plans
    # with different owners.
    if dep.plan_id:
        for p in all_plans:
            if p.plan_id == dep.plan_id:
                associated_plan = p
                break

    # Fallback: first plan that contains the source task
    if associated_plan is None:
        for p in all_plans:
            task_ids = [t.task_id for t in p.tasks]
            if dep.source_task_id in task_ids:
                associated_plan = p
                break

    source_owner = None
    target_owner = None

    if associated_plan:
        for t in associated_plan.tasks:
            if t.task_id == dep.source_task_id:
                source_owner = t.owner
            if t.task_id == dep.target_task_id:
                target_owner = t.owner

    # Lookup across all portfolio plans if not found in associated plan
    if not source_owner or not target_owner:
        for p in all_plans:
            for t in p.tasks:
                if not source_owner and t.task_id == dep.source_task_id:
                    source_owner = t.owner
                if not target_owner and t.task_id == dep.target_task_id:
                    target_owner = t.owner

    if source_owner and target_owner:
        dep.is_self_dependency = (source_owner.lower().strip() == target_owner.lower().strip())
    else:
        dep.is_self_dependency = False
    return dep


@app.get("/api/dependencies", response_model=List[DependencyEdge])
def get_dependencies():
    """List all dependency edges in the system."""
    return [populate_is_self_dependency(dep) for dep in db.get_all()]


@app.get("/api/dependencies/{dependency_id}", response_model=DependencyEdge)
def get_dependency(dependency_id: str):
    """Retrieve a specific dependency edge by ID."""
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    return populate_is_self_dependency(dep)


import os
import json

def derive_release_label(plan: Optional["PlanRecord"]) -> str:
    """
    Derives a human-readable release label for a plan using real, live data —
    never a static per-plan-id lookup table. Priority order:
      1. plan.release_name, if the plan record tracks one (from plan.db).
      2. release_name on the linked demand record, if the demand tracks one.
      3. A label computed from the plan's own real fields (plan_id + committed
         end date), so it stays accurate as plans change over time.
    """
    if not plan:
        return "Release Milestone"

    if getattr(plan, "release_name", None):
        return plan.release_name

    demand = load_demand_by_id(plan.demand_id)
    if demand and demand.get("release_name"):
        return demand["release_name"]

    return f"{plan.plan_id} Release (target {plan.end_date})"


def load_demand_by_id(demand_id: str) -> Optional[dict]:
    """Helper to locate demand and load demand record from SQLite or fixtures."""
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from shared_db.connection import get_db
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
    except Exception as e:
        print(f"Error querying demands from shared DB: {e}")

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
    """Manually add a single dependency record per project plan."""
    import datetime
    if not dep.dependency_id or dep.dependency_id.strip() == "":
        dep.dependency_id = generate_dependency_id()
    elif db.get_by_id(dep.dependency_id):
        raise HTTPException(status_code=400, detail="Dependency ID already exists.")
        
    # Resolve plan_id if empty using source_task_id lookup
    if not dep.plan_id or dep.plan_id.strip() == "":
        plans = plan_loader.load_all_plans()
        for p in plans:
            task_ids = [t.task_id for t in p.tasks]
            if dep.source_task_id in task_ids:
                dep.plan_id = p.plan_id
                break
                
    # Enforce only one dependency per plan
    for existing in db.get_all():
        if existing.plan_id == dep.plan_id:
            if existing.dependency_id == dep.dependency_id:
                continue
            raise HTTPException(
                status_code=400,
                detail=f"A dependency record for plan '{dep.plan_id}' already exists ({existing.dependency_id})."
            )
            
    # Load associated plan to fetch tasks
    plan = plan_loader.load_plan_by_id(dep.plan_id)
    if not plan:
        raise HTTPException(
            status_code=404,
            detail=f"Plan record with ID '{dep.plan_id}' not found."
        )
        
    dep.demand_id = plan.demand_id
    dep.created_date = datetime.datetime.now().isoformat()
    dep.last_updated = dep.created_date
    dep.task_list = [t.task_id for t in plan.tasks]
    dep.risk = dep.risk or "medium"
    
    # Set compatibility fallback fields
    if plan.tasks:
        first_task = plan.tasks[0]
        if not dep.owner:
            dep.owner = first_task.owner
        if not dep.source_task_id:
            dep.source_task_id = first_task.task_id
        if not dep.target_task_id:
            if first_task.predecessor_task_ids:
                dep.target_task_id = first_task.predecessor_task_ids[0]
            elif len(plan.tasks) > 1:
                dep.target_task_id = plan.tasks[1].task_id
            else:
                dep.target_task_id = first_task.task_id
            
    dep.activity_history = [
        "✓ Plan-level dependency registered",
        f"✓ Task List compiled: {', '.join(dep.task_list)}"
    ]
    dep.draft_message = ""
    db.save(dep)
    return dep


@app.post("/api/dependencies/sense", response_model=DependencySenseResponse)
def sense_dependencies(req: DependencySenseRequest):
    """
    Senses dependencies within a plan.
    Saves exactly one plan-level dependency record.
    """
    import datetime
    plan = plan_loader.load_plan_by_id(req.plan_id)
    if not plan:
        raise HTTPException(
            status_code=404,
            detail=f"Plan record with ID {req.plan_id} not found."
        )
        
    # Enforce coordination preconditions
    demand = load_demand_by_id(plan.demand_id)
    if demand:
        status = demand.get("status")
        if status not in ["classified", "capacity-checked", "approved"]:
            if status == "intake" and plan.tasks:
                pass
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Precondition failed: Associated demand {plan.demand_id} has status '{status}'. "
                    f"It must be classified and capacity-checked before sensing dependencies."
                )

    # Check if plan-level dependency already exists
    existing_dep = None
    for d in db.get_all():
        if d.plan_id == req.plan_id:
            existing_dep = d
            break
            
    now_str = datetime.datetime.now().isoformat()
    task_ids = [t.task_id for t in plan.tasks]
    
    if existing_dep:
        existing_dep.task_list = task_ids
        existing_dep.last_updated = now_str
        existing_dep.demand_id = plan.demand_id
        db.save(existing_dep)
        edge = existing_dep
    else:
        dep_id = generate_dependency_id()
        edge = DependencyEdge(
            dependency_id=dep_id,
            plan_id=req.plan_id,
            demand_id=plan.demand_id,
            status="open",
            risk="medium",
            created_date=now_str,
            last_updated=now_str,
            task_list=task_ids,
            activity_history=[
                "✓ Plan-level dependency auto-sensed",
                f"✓ Task List compiled: {', '.join(task_ids)}"
            ],
            draft_message=""
        )
        # Set compatibility fallback fields
        if plan.tasks:
            first_task = plan.tasks[0]
            edge.owner = first_task.owner
            edge.source_task_id = first_task.task_id
            if first_task.predecessor_task_ids:
                edge.target_task_id = first_task.predecessor_task_ids[0]
            elif len(plan.tasks) > 1:
                edge.target_task_id = plan.tasks[1].task_id
            else:
                edge.target_task_id = first_task.task_id
        db.save(edge)
        
    return DependencySenseResponse(detected_dependencies=[edge])


@app.get("/api/dependencies/{dependency_id}/task-details", response_model=DependencyTaskDetails)
def get_dependency_task_details(dependency_id: str, task_id: str):
    """Resolves dependency details dynamically for a selected task in a plan."""
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
        
    plan_id = dep.plan_id
    if not plan_id or plan_id.strip() == "":
        plans = plan_loader.load_all_plans()
        for p in plans:
            task_ids = [t.task_id for t in p.tasks]
            if task_id in task_ids:
                plan_id = p.plan_id
                break
                
    plan = plan_loader.load_plan_by_id(plan_id)
    
    selected_task_rec = None
    if plan:
        # Locate the selected task
        for t in plan.tasks:
            if t.task_id == task_id:
                selected_task_rec = t
                break
                
    if not selected_task_rec:
        # Fallback to legacy fields of dep
        return DependencyTaskDetails(
            dependency_id=dependency_id,
            plan_id=dep.plan_id or "PLN-0001-1",
            selected_task=task_id,
            current_owner=dep.owner or "admin@example.com",
            depends_on=dep.target_task_id or "N/A",
            depends_on_owner=dep.owner or "admin@example.com",
            status=dep.status,
            risk=dep.risk or "medium"
        )
        
    # Resolve predecessor task
    depends_on = ""
    depends_on_owner = ""
    if selected_task_rec.predecessor_task_ids:
        depends_on = selected_task_rec.predecessor_task_ids[0]
        # Find predecessor owner
        for t in plan.tasks:
            if t.task_id == depends_on:
                depends_on_owner = t.owner
                break
    else:
        # fallback: find sequential predecessor in plan tasks list
        idx = -1
        for i, t in enumerate(plan.tasks):
            if t.task_id == task_id:
                idx = i
                break
        if idx > 0:
            pred_t = plan.tasks[idx - 1]
            depends_on = pred_t.task_id
            depends_on_owner = pred_t.owner
        else:
            depends_on = "N/A"
            depends_on_owner = "N/A"
            
    return DependencyTaskDetails(
        dependency_id=dependency_id,
        plan_id=dep.plan_id,
        selected_task=task_id,
        current_owner=selected_task_rec.owner,
        depends_on=depends_on,
        depends_on_owner=depends_on_owner or "N/A",
        status=dep.status,
        risk=dep.risk or "medium"
    )


from pydantic import BaseModel

class LogActivityRequest(BaseModel):
    activity: str

class UpdateStatusRequest(BaseModel):
    status: Literal["open", "at-risk", "resolved"]

class SaveDraftRequest(BaseModel):
    draft_message: str


@app.post("/api/dependencies/{dependency_id}/chase", response_model=ChaseCommitmentResponse)
def chase_commitment(dependency_id: str, tone: Optional[str] = None, selected_task: Optional[str] = None):
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
<<<<<<< HEAD
    for p in all_plans:
        if p.plan_id == dep.plan_id:
            associated_plan = p
            break
=======
    if dep.plan_id:
        for p in all_plans:
            if p.plan_id == dep.plan_id:
                associated_plan = p
                break
    if not associated_plan:
        for p in all_plans:
            task_ids = [t.task_id for t in p.tasks]
            if dep.source_task_id in task_ids:
                associated_plan = p
                break
>>>>>>> main
            
    state_input = {
        "task": "chase",
        "dependency_id": dependency_id,
        "dependency": dep,
        "plan": associated_plan,
        "tone": tone,
        "selected_task": selected_task,
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
    if req.status == "resolved":
        dep.threat_level = "low"
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
def get_dependency_graph(dependency_id: str, selected_task: Optional[str] = None):
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
        
    # Find associated plan
    associated_plan = None
    all_plans = plan_loader.load_all_plans()
<<<<<<< HEAD
    for p in all_plans:
        if p.plan_id == dep.plan_id:
            associated_plan = p
            break
=======
    if dep.plan_id:
        for p in all_plans:
            if p.plan_id == dep.plan_id:
                associated_plan = p
                break
    if not associated_plan:
        for p in all_plans:
            task_ids = [t.task_id for t in p.tasks]
            if dep.source_task_id in task_ids:
                associated_plan = p
                break
>>>>>>> main
            
    # Fallback default IDs/names
    pred_id = dep.target_task_id or "Planning"
    pred_name = pred_id
    pred_owner = dep.owner or "admin@example.com"
    
    dep_id = dep.source_task_id or "Development"
    dep_name = dep_id
    dep_owner = dep.owner or "admin@example.com"
    
    if associated_plan:
        if selected_task:
            selected_task_rec = None
            for t in associated_plan.tasks:
                if t.task_id == selected_task:
                    selected_task_rec = t
                    break
            if selected_task_rec:
                dep_id = selected_task_rec.task_id
                dep_name = selected_task_rec.name
                dep_owner = selected_task_rec.owner
                
                pred_task_id = None
                if selected_task_rec.predecessor_task_ids:
                    pred_task_id = selected_task_rec.predecessor_task_ids[0]
                else:
                    idx = -1
                    for i, t in enumerate(associated_plan.tasks):
                        if t.task_id == selected_task:
                            idx = i
                            break
                    if idx > 0:
                        pred_task_id = associated_plan.tasks[idx - 1].task_id
                
                if pred_task_id:
                    for t in associated_plan.tasks:
                        if t.task_id == pred_task_id:
                            pred_id = t.task_id
                            pred_name = t.name
                            pred_owner = t.owner
                            break
                else:
                    pred_id = "N/A"
                    pred_name = "No Predecessor"
                    pred_owner = "N/A"
        else:
            # Resolve labels if not selected_task but default task IDs are set
            for t in associated_plan.tasks:
                if t.task_id == pred_id:
                    pred_name = t.name
                    pred_owner = t.owner
                if t.task_id == dep_id:
                    dep_name = t.name
                    dep_owner = t.owner
                    
    nodes = []
    links = []
    
    # Predecessor node
<<<<<<< HEAD
=======
    pred_task = None
    if associated_plan:
        for t in associated_plan.tasks:
            if t.task_id == dep.target_task_id:
                pred_task = t
                break
    if not pred_task:
        for p in all_plans:
            for t in p.tasks:
                if t.task_id == dep.target_task_id:
                    pred_task = t
                    break
            if pred_task:
                break
                
    pred_name = pred_task.name if pred_task else dep.target_task_id
    pred_owner = pred_task.owner if pred_task else dep.owner
>>>>>>> main
    nodes.append({
        "id": pred_id,
        "label": pred_name,
        "type": "predecessor",
        "owner": pred_owner,
        "status": "pending"
    })
    
    # Dependent node
<<<<<<< HEAD
=======
    dep_task = None
    if associated_plan:
        for t in associated_plan.tasks:
            if t.task_id == dep.source_task_id:
                dep_task = t
                break
    if not dep_task:
        for p in all_plans:
            for t in p.tasks:
                if t.task_id == dep.source_task_id:
                    dep_task = t
                    break
            if dep_task:
                break
                
    dep_name = dep_task.name if dep_task else dep.source_task_id
    dep_owner = dep_task.owner if dep_task else dep.owner
>>>>>>> main
    nodes.append({
        "id": dep_id,
        "label": dep_name,
        "type": "dependent",
        "owner": dep_owner,
        "status": dep.status
    })
    
    links.append({
        "source": pred_id,
        "target": dep_id,
        "type": dep.type or "technical"
    })
    
    # Release node
    release_label = derive_release_label(associated_plan)
 
    nodes.append({
        "id": "RELEASE_NODE",
        "label": release_label,
        "type": "release",
        "owner": "Release Manager",
        "status": "scheduled"
    })
    
    links.append({
        "source": dep_id,
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
    if req.plan_id:
        for p in all_plans:
            if p.plan_id == req.plan_id:
                associated_plan = p
                break
    if not associated_plan:
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


@app.delete("/api/dependencies/{dependency_id}")
def delete_dependency(dependency_id: str):
    """Delete a dependency edge by ID."""
    success = db.delete(dependency_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Dependency with ID {dependency_id} not found."
        )
    return {"message": "Dependency deleted successfully."}

