from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

# --- 1. Dynamic Monitoring Setup & Plan ---
class SLOItem(BaseModel):
    component_id: str
    availability_pct: float
    latency_p99_ms: int

class ComponentSpec(BaseModel):
    component_id: str
    component_name: str
    component_type: str = "rest_api"  # rest_api, postgresql, mongodb, redis, kafka, queue, infrastructure
    criticality: str = "standard"  # critical, high, standard
    environment: str = "production"
    technology_stack: str = "java-spring-boot"
    owner_team: Optional[str] = "core-engineering"
    owner_email: Optional[str] = "team-core@company.com"
    historical_p99_latency_ms: Optional[float] = None
    historical_availability_pct: Optional[float] = None

class SLOTargetSpec(BaseModel):
    component_id: str
    availability_slo_pct: float
    latency_p95_ms: float
    latency_p99_ms: float
    error_rate_threshold_pct: float
    cpu_threshold_pct: float
    memory_threshold_pct: float
    source: str = "ai_dynamic_analysis"  # ai_dynamic_analysis or historical_baseline

class ProposedAlert(BaseModel):
    alert_id: str
    component_id: str
    component_type: Optional[str] = "rest_api"
    alert_type: Optional[str] = "latency"
    name: str
    condition: str
    threshold: Optional[str] = None
    severity: str  # critical, high, medium, low
    notify: List[str]

class WidgetSpec(BaseModel):
    widget_id: str
    type: str  # timeseries, gauge, stat, bar, logs
    title: str
    query: str
    target_metric: Optional[str] = None
    component_id: Optional[str] = None

class ProposedDashboard(BaseModel):
    dashboard_id: str
    title: str
    target_technology: Optional[str] = "multi-tech"
    panels: List[str]
    widgets: Optional[List[Dict[str, Any]]] = []

class MonitoringSetupRequest(BaseModel):
    demand_id: str
    plan_id: str
    component_ids: Optional[List[str]] = []
    slos: Optional[List[SLOItem]] = []
    environment: Optional[str] = "production"
    target_availability_slo: Optional[float] = None
    target_latency_p99_ms: Optional[int] = None

class MonitoringConfigRecord(BaseModel):
    monitoring_id: str
    monitoring_plan_id: Optional[str] = None
    release_id: Optional[str] = None
    demand_id: str
    plan_id: str
    environment: str
    monitored_components_scope: Optional[List[str]] = []
    component_specs: Optional[List[ComponentSpec]] = []
    slo_targets: Optional[List[SLOTargetSpec]] = []
    proposed_alerts: List[ProposedAlert]
    proposed_dashboards: List[ProposedDashboard]
    generated_at: Optional[str] = None
    sre_reviewed: bool = False
    sre_reviewed_by: Optional[str] = None
    status: str = "draft"  # draft, approved, rejected

class SreReviewRequest(BaseModel):
    reviewed_by: str

# --- 2. Handover & KT ---
class RunbookSection(BaseModel):
    section: str
    content: str

class SupportRunbook(BaseModel):
    title: str
    sections: List[RunbookSection]

class KnownError(BaseModel):
    ke_id: str
    title: str
    workaround: str
    linked_defect: str
    priority: Optional[str] = "Medium"
    severity: Optional[str] = "Major"
    assigned_to: Optional[str] = "Unassigned"
    status: Optional[str] = "Open"
    description: Optional[str] = None
    operational_impact: Optional[str] = None

class HandoverKTRequest(BaseModel):
    demand_id: str
    plan_id: str
    runbook_id: str
    defect_ids: List[str]
    known_error_refs: List[str] = []
    kb_refs: List[str] = []
    delivery_team: List[str] = []
    run_team: List[str] = []

class HandoverPackRecord(BaseModel):
    handover_id: str
    demand_id: str
    plan_id: str
    created_at: str
    support_runbook: SupportRunbook
    known_errors: List[KnownError]
    kt_pack_url: str
    reviewed_by: Optional[str] = None
    status: str = "draft"

class HandoverReviewRequest(BaseModel):
    reviewed_by: str

# --- 3. Readiness Validation ---
class ReadinessCriteria(BaseModel):
    monitoring_configured: bool = False
    support_team_briefed: bool = False
    runbook_reviewed: bool = False
    known_errors_documented: bool = False
    on_call_assigned: bool = False

class ReadinessValidationRequest(BaseModel):
    demand_id: str
    plan_id: str
    readiness_id: str
    cutover_id: str
    readiness_criteria: ReadinessCriteria
    monitoring_config_ref: str

class CriterionResult(BaseModel):
    criterion: str
    status: Literal["pass", "fail", "warn"]
    evidence: str

class ReadinessValidationRecord(BaseModel):
    validation_id: str
    demand_id: str
    plan_id: str
    validated_at: str
    criteria_results: List[CriterionResult]
    gaps: List[str]
    overall_status: Literal["pass", "conditional-pass", "fail"]
    sign_off_by: Optional[str] = None
    status: str = "pending-approval"

class SignOffValidationRequest(BaseModel):
    sign_off_by: str
    status: Literal["approved", "rejected"]
