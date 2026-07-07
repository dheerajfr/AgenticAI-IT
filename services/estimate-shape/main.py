import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import EstimateRecord, DemandRecord
from database import db
from orchestration.estimate_graph import estimate_graph

app = FastAPI(
    title="Estimate & Shape Service (Stage 02)",
    description="Backend API for sizing effort, cost, challenging estimates, and triggering re-baselines.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to generate unique estimate ID
def generate_estimate_id(demand_id: str) -> str:
    # Just a simple generator based on demand ID
    existing = db.get_by_demand_id(demand_id)
    return f"EST-{demand_id.split('-')[-1]}-{len(existing) + 1}"

class GenerateEstimateRequest(BaseModel):
    demand: DemandRecord
    rebaseline_reason: Optional[str] = None

class ApproveEstimateRequest(BaseModel):
    effort_days: int
    effort_range_low: int
    effort_range_high: int
    cost_estimate: int
    duration_weeks: int
    confidence: str
    methodology: str
    risk_factors: List[str] = []
    requires_arb: bool = False
    status: str = "draft"


class RebaselineRequest(BaseModel):
    reason: str


@app.get("/api/estimates", response_model=List[EstimateRecord])
def get_estimates():
    """List all estimate records in the system."""
    return db.get_all()


@app.get("/api/estimates/{estimate_id}", response_model=EstimateRecord)
def get_estimate(estimate_id: str):
    """Retrieve a specific estimate record by its ID."""
    record = db.get_by_id(estimate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Estimate record not found.")
    return record


@app.post("/api/estimates/generate")
def generate_estimate(req: GenerateEstimateRequest):
    """
    Runs the Estimate from history node (Requirement 1).
    Takes a DemandRecord and returns a draft EstimateRecord.
    """
    state_input = {
        "task": "estimate",
        "demand_id": req.demand.demand_id,
        "title": req.demand.title,
        "description": req.demand.description,
        "type": req.demand.type,
        "domain": req.demand.domain,
        "business_case_summary": req.demand.business_case_summary,
        "risk_level": req.demand.risk_level,
        "funding_status": req.demand.funding_status,
        "rebaseline_reason": req.rebaseline_reason,
        "error": None
    }
    
    try:
        graph_output = estimate_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LangGraph execution failed: {str(e)}")
        
    if graph_output.get("error"):
        raise HTTPException(status_code=422, detail=graph_output["error"])
        
    # Auto-approval condition: Since the challenge step was merged into the generation, 
    # when the user clicks "Approve Estimate" on the preview, it is considered fully approved.
    cost = graph_output.get("cost_estimate", 0)
    conf = graph_output.get("confidence", "low")
    risk_level = req.demand.risk_level
    
    suggested_status = "approved"

    # We return the suggested values, wait for approval to save
    return {
        "demand_id": req.demand.demand_id,
        "effort_days": graph_output.get("effort_days"),
        "effort_range_low": graph_output.get("effort_range_low"),
        "effort_range_high": graph_output.get("effort_range_high"),
        "cost_estimate": cost,
        "duration_weeks": graph_output.get("duration_weeks"),
        "confidence": conf,
        "methodology": graph_output.get("methodology"),
        "risk_factors": graph_output.get("risk_factors", []),
        "requires_arb": graph_output.get("requires_arb", False),
        "suggested_status": suggested_status
    }

@app.post("/api/estimates/approve", response_model=EstimateRecord)
def approve_estimate(demand_id: str, req: ApproveEstimateRequest):
    """
    Commits a generated estimate and creates a new EstimateRecord.
    """
    estimate_id = generate_estimate_id(demand_id)
    new_record = EstimateRecord(
        estimate_id=estimate_id,
        demand_id=demand_id,
        effort_days=req.effort_days,
        effort_range_low=req.effort_range_low,
        effort_range_high=req.effort_range_high,
        cost_estimate=req.cost_estimate,
        duration_weeks=req.duration_weeks,
        confidence=req.confidence,
        methodology=req.methodology,
        risk_factors=req.risk_factors,
        requires_arb=req.requires_arb,
        status=req.status
    )
    db.save(new_record)
    return new_record





@app.post("/api/estimates/{estimate_id}/trigger-check")
def trigger_check(estimate_id: str):
    """
    Runs the Re-estimate triggers node (Requirement 3).
    """
    record = db.get_by_id(estimate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Estimate not found.")
        
    import urllib.request
    import json
    
    demand_id = record.demand_id
    demand_data = {}
    try:
        req = urllib.request.Request(f"http://127.0.0.1:8000/api/demands/{demand_id}")
        with urllib.request.urlopen(req) as f:
            demand_data = json.loads(f.read().decode("utf-8"))
    except Exception as e:
        print(f"Failed to fetch demand {demand_id}: {e}")

    state_input = {
        "task": "trigger_check",
        "demand_id": record.demand_id,
        "title": demand_data.get("title", "Unknown"),
        "effort_days": record.effort_days,
        "cost_estimate": record.cost_estimate,
        "risk_factors": record.risk_factors,
        "capacity_verdict": demand_data.get("capacity_verdict"),
        "skill_gaps": demand_data.get("skill_gaps", []),
        "resource_constraints": demand_data.get("resource_constraints", []),
        "error": None
    }
    
    try:
        graph_output = estimate_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trigger LangGraph execution failed: {str(e)}")
        
    return {
        "rebaseline_warranted": graph_output.get("rebaseline_warranted"),
        "rebaseline_reason": graph_output.get("rebaseline_reason")
    }

@app.post("/api/estimates/{estimate_id}/rebaseline", response_model=EstimateRecord)
def rebaseline_estimate(estimate_id: str, req: RebaselineRequest):
    """
    Approves the re-baseline, changing the status and saving the reason.
    """
    record = db.get_by_id(estimate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Estimate not found.")
        
    record.status = "re-baselined"
    record.rebaseline_reason = req.reason
    db.save(record)
    return record



@app.post("/api/estimates/{estimate_id}/finalize", response_model=EstimateRecord)
def finalize_estimate(estimate_id: str):
    """
    Finalizes the estimate when no anomalies are found.
    """
    record = db.get_by_id(estimate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Estimate not found.")
        
    record.status = "finalized"
    db.save(record)
    return record


@app.delete("/api/estimates/{estimate_id}")
def delete_estimate(estimate_id: str):
    """
    Deletes an estimate record.
    """
    success = db.delete(estimate_id)
    if not success:
        raise HTTPException(status_code=404, detail="Estimate not found.")
    return {"status": "deleted"}
