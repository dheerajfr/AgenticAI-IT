import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid
import random

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import BudgetRequest, ROIRequest
from database import db
from llm_client import call_gemini

app = FastAPI(title="Budget & Cost Service (Always-on)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    if not record:
        record = {
            "id": f"BDG-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "cost_estimation": {
                "infrastructure_cost": random.randint(5000, 20000),
                "vendor_cost": random.randint(10000, 50000),
                "resource_cost": random.randint(20000, 80000)
            },
            "variances": [
                {
                    "environment": "staging",
                    "spike_amount": random.randint(100, 1000),
                    "reason": "Unknown high compute usage"
                }
            ],
            "roi_model": None
        }
        db.save(record)
    return record

@app.get("/api/budget-cost/project/{demand_id}")
def get_budget_cost(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/budget-cost/estimate")
def forecast_costs(req: BudgetRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Provide a bottom-up forecast for AWS/Azure and vendor costs for project {req.demand_id} based on typical enterprise web application architectures."
    ai_res = call_gemini(prompt)
    
    # Just save the LLM response as a note in the estimation dict
    est = record.get("cost_estimation", {})
    est["ai_analysis"] = ai_res
    record["cost_estimation"] = est
    db.save(record)
    
    return {"status": "success", "estimation": record["cost_estimation"], "record": record}

@app.post("/api/budget-cost/roi")
def model_roi(req: ROIRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Model the Resource ROI for project {req.demand_id}. Velocity data: {req.velocity_data}. Match team velocity to spend."
    ai_res = call_gemini(prompt)
    
    record["roi_model"] = {
        "analysis": ai_res,
        "velocity_score": random.randint(60, 100)
    }
    db.save(record)
    
    return {"status": "success", "roi_model": record["roi_model"], "record": record}
