from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class ChangeRecordDraftRequest(BaseModel):
    demand_id: str
    plan_id: str
    estimate_id: str
    readiness_id: str
    gate_id: str
    test_run_id: str
    runbook_id: str
    rollback_id: str
    itsm_schema_version: Optional[str] = "v2"

class ChangeRecord(BaseModel):
    change_record_id: str
    demand_id: str
    plan_id: str
    title: str
    change_type: str
    risk_rating: Optional[str] = None
    description: str
    implementation_plan_ref: str
    backout_plan_ref: str
    test_evidence_ref: str
    quality_gate_ref: str
    runbook_ref: str
    scheduled_start: str
    scheduled_end: str
    submitted_by: str
    approved_by: Optional[str] = None
    status: str

class ChangeRiskScoringRequest(BaseModel):
    change_record_id: str
    demand_id: str
    component_ids: List[str]
    change_calendar_ref: str
    historical_change_outcomes_ref: str

class ChangeRiskScoreRecord(BaseModel):
    risk_score_id: str
    change_record_id: str
    demand_id: str
    risk_score: int
    risk_band: str
    blast_radius: str
    recommended_path: str
    risk_factors: List[str]
    mitigations: List[str]
    freeze_window_conflict: bool
    human_reviewed: bool
    status: str

class CABPrepRequest(BaseModel):
    change_record_id: str
    risk_score_id: str
    cab_policy_ref: str
    prior_qa_ref: str

class CABPackRecord(BaseModel):
    cab_pack_id: str
    change_record_id: str
    demand_id: str
    assembled_at: str
    calendar_conflicts: List[str]
    pack_sections: List[Dict[str, Any]]
    anticipated_qa: List[Dict[str, Any]]
    cab_decision: Optional[str] = None
    chaired_by: Optional[str] = None
    status: str

class CollisionDetectionRequest(BaseModel):
    change_record_id: str
    component_ids: List[str]
    scheduled_start: str
    scheduled_end: str
    change_calendar_ref: str
    freeze_rules_ref: str

class CollisionDetectionRecord(BaseModel):
    collision_id: str
    change_record_id: str
    demand_id: str
    evaluated_at: str
    collisions: List[str]
    freeze_window_conflicts: List[str]
    shared_asset_clashes: List[str]
    safe_to_proceed: bool
    human_decision: Optional[str] = None
    status: str

class AuditTrailRecord(BaseModel):
    audit_id: str
    demand_id: str
    change_record_id: str
    generated_at: str
    events: List[Dict[str, Any]]
    immutable_hash: str
    regulator_ready: bool

class AuditTrailRequest(BaseModel):
    demand_id: str
    change_record_id: str
    event_sources: List[str]
