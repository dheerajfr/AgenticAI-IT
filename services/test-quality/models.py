from pydantic import BaseModel, Field
from typing import Optional, Literal, List, Dict, Any

# ==========================================
# Upstream Recap Schema Definitions
# ==========================================

class UpstreamDemandRecord(BaseModel):
    demand_id: str
    title: str
    description: str
    type: str
    domain: str
    risk_level: str
    status: str
    business_case_summary: Optional[str] = None
    capacity_verdict: Optional[str] = None
    resource_constraints: Optional[List[Dict[str, Any]]] = None
    skill_gaps: Optional[List[str]] = None

class UpstreamEstimateRecord(BaseModel):
    estimate_id: str
    demand_id: str
    effort_days: int
    cost_estimate: int
    duration_weeks: int
    confidence: str
    risk_factors: Optional[List[str]] = None
    requires_arb: Optional[bool] = False
    status: str

class TaskItem(BaseModel):
    task_id: str
    name: str
    start_date: str
    end_date: str
    owner: str
    predecessor_task_ids: Optional[List[str]] = None
    status: Optional[str] = None

class UpstreamPlanRecord(BaseModel):
    plan_id: str
    demand_id: str
    end_date: str
    critical_path_task_ids: List[str]
    tasks: List[TaskItem]

class UpstreamDependencyEdge(BaseModel):
    dependency_id: str
    plan_id: Optional[str] = None
    source_task_id: str
    target_task_id: str
    type: str
    status: str
    owner: str
    threat_level: Optional[str] = "low"

class UpstreamEnvironmentStateRecord(BaseModel):
    component_id: Optional[str] = None
    demand_id: Optional[str] = None
    environment: str
    deployed_version: str
    expected_version: str
    drift_status: str
    last_checked: str

class UpstreamBuildDeployRecord(BaseModel):
    build_id: Optional[str] = None
    code_diff_ref: Optional[str] = None
    changed_services: Optional[List[str]] = None
    build_artifacts: Optional[List[str]] = None
    deployment_metadata: Optional[Dict[str, Any]] = None
    component_ids: Optional[List[str]] = None

# ==========================================
# Delivery Context Object Schema
# ==========================================

class DeliveryContext(BaseModel):
    demand_id: str
    plan_id: Optional[str] = None
    demand: Optional[UpstreamDemandRecord] = None
    estimate: Optional[UpstreamEstimateRecord] = None
    plan: Optional[UpstreamPlanRecord] = None
    dependencies: List[UpstreamDependencyEdge] = []
    environments: List[UpstreamEnvironmentStateRecord] = []
    build_deploy: Optional[UpstreamBuildDeployRecord] = None

# ==========================================
# Capability 1: Test Generation Contracts
# ==========================================

class TestGenerationRequest(BaseModel):
    demand_id: str
    plan_id: str
    story_ids: Optional[List[str]] = Field(default_factory=list)
    code_diff_ref: Optional[str] = None
    traceability_matrix_id: Optional[str] = None

class TestCase(BaseModel):
    test_id: str
    story_id: Optional[str] = None
    title: str
    steps: List[str]
    expected_result: str
    priority: Literal["critical", "high", "medium", "low"]
    type: str  # functional, integration, regression, api, boundary, negative, edge, security, etc.

class CoverageSummary(BaseModel):
    total_stories: int
    stories_covered: int
    total_test_cases: int
    critical_path_coverage_pct: float

class TestSuiteRecord(BaseModel):
    suite_id: str
    demand_id: str
    plan_id: str
    generated_at: str
    test_cases: List[TestCase]
    coverage_summary: CoverageSummary
    status: Literal["draft", "approved"]

# ==========================================
# Capability 2: Test Data Contracts
# ==========================================

class TestDataRequest(BaseModel):
    suite_id: str
    demand_id: str
    target_environment: str
    schema_refs: Optional[List[str]] = Field(default_factory=list)
    data_volume: Optional[int] = 100
    privacy_classification: Optional[str] = "PII-masked"
    expiry_hours: Optional[int] = 48

class DatasetInfo(BaseModel):
    schema_ref: str = Field(..., alias="schema")  # handle serialization alias for 'schema'
    record_count: int
    masking_applied: bool
    location: str

    class Config:
        populate_by_name = True

class TestDataProvisionRecord(BaseModel):
    data_provision_id: str
    suite_id: str
    demand_id: str
    environment: str
    datasets: List[DatasetInfo]
    privacy_sign_off: Optional[str] = None
    signed_off_by: Optional[str] = None
    expires_at: str
    status: str

# ==========================================
# Capability 3: Defect Triage Contracts
# ==========================================

class DefectTriageRequest(BaseModel):
    test_run_id: str
    demand_id: str
    defect_ids: List[str]
    code_ownership_map: Optional[Dict[str, str]] = Field(default_factory=dict)

class TriagedDefect(BaseModel):
    defect_id: str
    severity: Literal["critical", "high", "medium", "minor", "low"]
    priority: int
    cluster: str
    duplicate_of: Optional[str] = None
    root_cause_hint: str
    assigned_to: str
    recommended_action: Literal["fix-before-release", "defer", "close"]

class DefectTriageRecord(BaseModel):
    triage_id: str
    test_run_id: str
    demand_id: str
    triaged_defects: List[TriagedDefect]
    release_risk_summary: str
    human_confirmed: bool = False
    status: str

# ==========================================
# Capability 4: Security Testing Contracts
# ==========================================

class SecurityTestRequest(BaseModel):
    demand_id: str
    plan_id: str
    component_ids: List[str]
    pipeline_run_id: str
    scan_types: Optional[List[str]] = Field(default_factory=list)
    vulnerability_db_version: Optional[str] = None

class SecurityFinding(BaseModel):
    finding_id: str
    component_id: str
    severity: Literal["critical", "high", "medium", "low"]
    category: str
    location: str
    exploitable: bool
    draft_fix: str
    status: str

class SecuritySummary(BaseModel):
    critical: int
    high: int
    medium: int
    low: int

class SecurityTestRecord(BaseModel):
    security_test_id: str
    demand_id: str
    plan_id: str
    pipeline_run_id: str
    scanned_at: str
    findings: List[SecurityFinding]
    summary: SecuritySummary
    exploitable_confirmed: bool = False
    signed_off_by: Optional[str] = None
    status: str

# ==========================================
# Capability 5: Test Execution Contracts
# ==========================================

class TestExecutionRequest(BaseModel):
    suite_id: str
    demand_id: str
    data_provision_id: Optional[str] = None
    environment: str = "test"
    impact_scope: Optional[List[str]] = Field(default_factory=list)
    execution_mode: Optional[str] = "impact-based"

class TestResult(BaseModel):
    test_id: str
    status: Literal["passed", "failed", "skipped"]
    duration_ms: int
    failure_analysis: Optional[str] = None

class TestRunSummary(BaseModel):
    total: int
    passed: int
    failed: int
    skipped: int
    pass_rate_pct: float

class TestRunRecord(BaseModel):
    test_run_id: str
    suite_id: str
    demand_id: str
    environment: str
    executed_at: str
    results: List[TestResult]
    summary: TestRunSummary
    defect_ids_raised: List[str] = Field(default_factory=list)
    human_acceptance: Optional[str] = None
    status: str

# ==========================================
# Capability 6: Traceability Contracts
# ==========================================

class TraceabilityUpdateRequest(BaseModel):
    demand_id: str
    suite_id: str
    test_run_id: str
    defect_ids: Optional[List[str]] = Field(default_factory=list)

class TraceabilityEntry(BaseModel):
    story_id: str
    test_ids: List[str]
    defect_ids: List[str]
    coverage_status: Literal["covered", "partial", "uncovered"]
    passing: bool

class TraceabilityMatrixRecord(BaseModel):
    traceability_id: str
    demand_id: str
    last_updated: str
    entries: List[TraceabilityEntry]
    uncovered_stories: List[str] = Field(default_factory=list)
    coverage_gaps: List[str] = Field(default_factory=list)
    audit_ready: bool

# ==========================================
# Capability 7: Quality Gate Contracts
# ==========================================

class QualityPolicy(BaseModel):
    min_pass_rate_pct: float = 95.0
    max_open_critical_defects: int = 0
    max_open_high_security_findings: int = 0
    min_coverage_pct: float = 90.0

class QualityGateRequest(BaseModel):
    demand_id: str
    test_run_id: str
    triage_id: Optional[str] = None
    security_test_id: Optional[str] = None
    traceability_id: Optional[str] = None
    quality_policy: Optional[QualityPolicy] = None

class GateCheck(BaseModel):
    check: str
    threshold: str
    actual: str
    result: Literal["pass", "fail", "warn"]

class QualityGateRecord(BaseModel):
    gate_id: str
    demand_id: str
    test_run_id: str
    evaluated_at: str
    verdict: Literal["pass", "fail"]
    score: int
    checks: List[GateCheck]
    gap_explanation: str
    human_decision: Optional[str] = None
    decided_by: Optional[str] = None
    status: str
