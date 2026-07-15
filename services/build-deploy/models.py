from typing import List, Literal, Optional
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Stage 06 - Build & deploy - all 5 functions.
#
# Shared join key: every record below carries an optional `deployment_id`,
# minted by Deployment orchestration per release.
# ---------------------------------------------------------------------------


# --- Runbook drafting (row 22) ---------------------------------------------

class RunbookStep(BaseModel):
    step_id: str
    description: str
    owner: str
    environment: Literal["dev", "test", "staging", "prod"] = "prod"
    step_type: Literal["pre-check", "execute", "verify", "rollback-trigger"] = "execute"
    estimated_minutes: int = 10


class RunbookRecord(BaseModel):
    runbook_id: str
    deployment_id: Optional[str] = Field(None, description="FK to the Deployment orchestration run, once that exists")
    component_id: str
    title: str
    change_record_ref: Optional[str] = Field(None, description="Change record this runbook was drafted from")
    prior_runbook_id: Optional[str] = Field(None, description="Runbook this one was adapted from, if any")
    architecture_refs: List[str] = Field(default_factory=list, description="Architecture docs consulted")
    steps: List[RunbookStep] = Field(default_factory=list)
    status: Literal["draft", "sme-review", "approved"] = "draft"
    generated_by: Literal["llm", "manual"] = "llm"
    created_at: str
    updated_at: str


class DraftRunbookRequest(BaseModel):
    component_id: str
    change_summary: str = Field(..., description="What the change/release is, for the LLM to draft steps from")
    architecture_notes: Optional[str] = Field(None, description="Freeform architecture context")
    prior_runbook_id: Optional[str] = None
    change_record_ref: Optional[str] = None
    deployment_id: Optional[str] = None


class UpdateRunbookRequest(BaseModel):
    title: Optional[str] = None
    steps: Optional[List[RunbookStep]] = None


# --- Cutover comms (row 21) --------------------------------------------------

class CutoverUpdate(BaseModel):
    timestamp: str
    author: str
    message: str


class CutoverStepStatus(BaseModel):
    step_id: str
    description: str
    status: Literal["pending", "in-progress", "done", "blocked"] = "pending"
    updated_at: Optional[str] = None
    notes: Optional[str] = None


class CutoverSession(BaseModel):
    cutover_id: str
    deployment_id: Optional[str] = Field(None, description="FK to the Deployment orchestration run, once that exists")
    component_id: str
    runbook_id: Optional[str] = Field(None, description="Runbook this cutover is executing")
    stakeholders: List[str] = Field(default_factory=list)
    status: Literal["scheduled", "in-progress", "completed", "aborted"] = "scheduled"
    steps: List[CutoverStepStatus] = Field(default_factory=list)
    updates: List[CutoverUpdate] = Field(default_factory=list)
    started_at: Optional[str] = None
    ended_at: Optional[str] = None


class StartCutoverRequest(BaseModel):
    component_id: str
    runbook_id: Optional[str] = None
    stakeholders: List[str] = Field(default_factory=list)
    deployment_id: Optional[str] = None


class AdvanceStepRequest(BaseModel):
    status: Literal["pending", "in-progress", "done", "blocked"]
    notes: Optional[str] = None


class PostUpdateRequest(BaseModel):
    author: str
    message: str


class EndCutoverRequest(BaseModel):
    status: Literal["completed", "aborted"]


# --- Release-readiness (row 19) ---------------------------------------------

class ReadinessCheckItem(BaseModel):
    name: str
    passed: bool
    detail: str


class ReleaseReadinessCheck(BaseModel):
    check_id: str
    deployment_id: Optional[str] = None
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"] = "prod"
    checks: List[ReadinessCheckItem] = Field(default_factory=list)
    ready: bool
    evidence_summary: str
    created_at: str


class EvaluateReadinessRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"] = "prod"
    runbook_id: Optional[str] = None
    deployment_id: Optional[str] = None


# --- Rollback readiness (row 20) ---------------------------------------------

class RollbackPlan(BaseModel):
    rollback_id: str
    deployment_id: Optional[str] = None
    component_id: str
    runbook_id: Optional[str] = None
    backup_verified: bool
    rollback_steps: List[RunbookStep] = Field(default_factory=list)
    viable: bool
    issues: List[str] = Field(default_factory=list)
    created_at: str


class ValidateRollbackRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"] = "prod"
    runbook_id: Optional[str] = None
    deployment_id: Optional[str] = None
    backup_verified: bool = False


# --- Deployment orchestration (row 18) --------------------------------------

class PreconditionCheck(BaseModel):
    name: str
    source: str  # "release-readiness" | "rollback-readiness"
    passed: bool
    detail: str


class DeploymentRecord(BaseModel):
    deployment_id: str
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"] = "prod"
    runbook_id: Optional[str] = Field(None, description="Approved runbook this deployment executes")
    cutover_id: Optional[str] = Field(None, description="Cutover session opened once the go decision is made")
    preconditions: List[PreconditionCheck] = Field(default_factory=list)
    status: Literal["planned", "checking", "go", "no-go", "in-progress", "done", "rolled-back"] = "planned"
    decided_by: Optional[str] = None
    created_at: str
    updated_at: str


class StartDeploymentRequest(BaseModel):
    component_id: str
    runbook_id: str = Field(..., description="Must reference an approved RunbookRecord")
    environment: Literal["dev", "test", "staging", "prod"] = "prod"


class GoNoGoRequest(BaseModel):
    decision: Literal["go", "no-go"]
    decided_by: str
    stakeholders: List[str] = Field(default_factory=list, description="Passed through to Cutover comms if decision is 'go'")
