import os
import hashlib
import json
import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import (
    ChangeRecordDraftRequest,
    ChangeRecord,
    ChangeRiskScoringRequest,
    ChangeRiskScoreRecord,
    CABPrepRequest,
    CABPackRecord,
    CollisionDetectionRequest,
    CollisionDetectionRecord,
    AuditTrailRequest,
    AuditTrailRecord
)
from database import db
from shared_db.connection import get_db
from orchestration.release_change_graph import release_change_graph

app = FastAPI(
    title="Release & Change Service (Stage 08)",
    description="Backend API for change record drafting, risk scoring, CAB prep, collision detection, and audit trails.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/release-change/health")
def health_check():
    return {"status": "healthy", "stage": 8}


# 1. Change Record Drafting
@app.post("/api/release-change/draft", response_model=ChangeRecord)
def draft_change_record(req: ChangeRecordDraftRequest):
    state_input = {
        "task": "draft",
        "demand_id": req.demand_id,
        "plan_id": req.plan_id,
        "estimate_id": req.estimate_id,
        "readiness_id": req.readiness_id,
        "gate_id": req.gate_id,
        "test_run_id": req.test_run_id,
        "runbook_id": req.runbook_id,
        "rollback_id": req.rollback_id,
        "itsm_schema_version": req.itsm_schema_version
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["change_record"]


@app.get("/api/release-change/draft/{change_record_id}", response_model=ChangeRecord)
def get_change_record(change_record_id: str):
    record = db.get_change_record(change_record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Change record not found.")
    return record


# 2. Change Risk Scoring
@app.post("/api/release-change/risk-score", response_model=ChangeRiskScoreRecord)
def compute_risk_score(req: ChangeRiskScoringRequest):
    state_input = {
        "task": "risk_score",
        "demand_id": req.demand_id,
        "change_record_id": req.change_record_id,
        "component_ids": req.component_ids,
        "change_calendar_ref": req.change_calendar_ref,
        "historical_change_outcomes_ref": req.historical_change_outcomes_ref
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["risk_score_record"]


@app.get("/api/release-change/risk-score/{risk_score_id}", response_model=ChangeRiskScoreRecord)
def get_risk_score(risk_score_id: str):
    record = db.get_risk_score(risk_score_id)
    if not record:
        raise HTTPException(status_code=404, detail="Risk score not found.")
    return record


# 3. CAB Prep
@app.post("/api/release-change/cab-prep", response_model=CABPackRecord)
def prep_cab_pack(req: CABPrepRequest):
    state_input = {
        "task": "cab_prep",
        "risk_score_id": req.risk_score_id,
        "cab_policy_ref": req.cab_policy_ref,
        "prior_qa_ref": req.prior_qa_ref
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["cab_pack_record"]


@app.get("/api/release-change/cab-prep/{cab_pack_id}", response_model=CABPackRecord)
def get_cab_pack(cab_pack_id: str):
    record = db.get_cab_pack(cab_pack_id)
    if not record:
        raise HTTPException(status_code=404, detail="CAB pack not found.")
    return record


# 4. Collision Detection
@app.post("/api/release-change/collision", response_model=CollisionDetectionRecord)
def detect_collision(req: CollisionDetectionRequest):
    state_input = {
        "task": "collision",
        "change_record_id": req.change_record_id,
        "component_ids": req.component_ids,
        "scheduled_start": req.scheduled_start,
        "scheduled_end": req.scheduled_end,
        "change_calendar_ref": req.change_calendar_ref,
        "freeze_rules_ref": req.freeze_rules_ref
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["collision_record"]


@app.get("/api/release-change/collision/{collision_id}", response_model=CollisionDetectionRecord)
def get_collision(collision_id: str):
    record = db.get_collision_detection(collision_id)
    if not record:
        raise HTTPException(status_code=404, detail="Collision record not found.")
    return record


# 5. Audit Trail
@app.post("/api/release-change/audit", response_model=AuditTrailRecord)
def generate_audit_trail(req: AuditTrailRequest):
    state_input = {
        "task": "audit",
        "demand_id": req.demand_id,
        "change_record_id": req.change_record_id,
        "event_sources": req.event_sources
    }
    try:
        graph_output = release_change_graph.invoke(state_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow invocation failed: {e}")

    if "error" in graph_output and graph_output["error"]:
        raise HTTPException(status_code=500, detail=graph_output["error"])
    return graph_output["audit_trail_record"]


@app.get("/api/release-change/audit/{audit_id}", response_model=AuditTrailRecord)
def get_audit_trail(audit_id: str):
    record = db.get_audit_trail(audit_id)
    if not record:
        raise HTTPException(status_code=404, detail="Audit trail not found.")
    return record
