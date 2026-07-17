# Data Contracts — Stages 06 to 09

> **Versioning rule (inherited from the platform):** Every contract starts at `v1`.
> Adding an optional field is safe. Removing/renaming a field or changing a type is a breaking change — bump to `v2` and give downstream owners one sprint's notice.

---

## Upstream Contracts from Stages 01–05 (recap — what arrives at Stage 06)

| Produced by | Record | Key fields relevant downstream |
|---|---|---|
| Stage 01 | `DemandRecord` | `demand_id`, `title`, `description`, `type`, `domain`, `risk_level`, `status="approved"`, `business_case_summary`, `capacity_verdict`, `resource_constraints`, `skill_gaps` |
| Stage 02 | `EstimateRecord` | `estimate_id`, `demand_id`, `effort_days`, `cost_estimate`, `duration_weeks`, `confidence`, `risk_factors`, `requires_arb`, `status` |
| Stage 03 | `PlanRecord` | `plan_id`, `demand_id`, `end_date`, `critical_path_task_ids`, `tasks[]` (task_id, name, start_date, end_date, owner, predecessor_task_ids) |
| Stage 04 | `DependencyEdge` | `dependency_id`, `plan_id`, `source_task_id`, `target_task_id`, `type`, `status`, `owner`, `threat_level` |
| Stage 05 | `EnvironmentStateRecord` | `component_id`, `environment`, `deployed_version`, `expected_version`, `drift_status`, `last_checked` |

---

## Stage 06 — Build & Deploy

### 06-A: Release-Readiness

**Use Case:** Verifies every go-live precondition; produces an evidence-backed go/no-go decision.

#### INPUT — `ReleaseReadinessRequest`
```json
{
  "plan_id": "PLN-0068-1",
  "demand_id": "DEM-2026-0068",
  "environment": "prod",
  "test_run_id": "TR-0068-1",
  "change_record_id": "CHG-0068-1",
  "component_ids": ["svc-payments-api", "svc-auth"],
  "dependency_ids": ["DEP-0023", "DEP-0041"],
  "checklist_overrides": []
}
```

| Field | Type | Source stage | Notes |
|---|---|---|---|
| `plan_id` | string | Stage 03 | Links to PlanRecord |
| `demand_id` | string | Stage 01 | Links to DemandRecord |
| `environment` | enum `dev/test/staging/prod` | Stage 05 | Target go-live environment |
| `test_run_id` | string | Stage 07 | Links to TestRunRecord |
| `change_record_id` | string | Stage 08 | Links to ChangeRecord |
| `component_ids` | string[] | Stage 05 | EnvironmentStateRecord keys |
| `dependency_ids` | string[] | Stage 04 | DependencyEdge keys |
| `checklist_overrides` | object[] | Human | Manual overrides to preconditions |

#### OUTPUT — `ReleaseReadinessRecord`
```json
{
  "readiness_id": "RDY-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "environment": "prod",
  "go_no_go": "go",
  "overall_score": 87,
  "preconditions": [
    {
      "check": "all_tests_passed",
      "status": "pass",
      "evidence": "TR-0068-1: 98/100 passed"
    },
    {
      "check": "change_approved",
      "status": "pass",
      "evidence": "CHG-0068-1 approved 2026-07-13"
    },
    {
      "check": "config_in_sync",
      "status": "warn",
      "evidence": "svc-auth drifted on staging"
    },
    {
      "check": "dependencies_resolved",
      "status": "fail",
      "evidence": "DEP-0041 still at-risk"
    }
  ],
  "blocking_issues": ["DEP-0041 unresolved"],
  "warnings": ["svc-auth config drift on staging"],
  "human_decision": null,
  "decided_by": null,
  "decided_at": null,
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 08 (`Release-readiness` → `Change-record drafting`), Stage 09 (`Readiness validation`)

---

### 06-B: Rollback Readiness

**Use Case:** Prepares and validates the rollback plan before cutover.

#### INPUT — `RollbackReadinessRequest`
```json
{
  "plan_id": "PLN-0068-1",
  "demand_id": "DEM-2026-0068",
  "environment": "prod",
  "component_ids": ["svc-payments-api", "svc-auth"],
  "rollback_window_minutes": 60
}
```

| Field | Type | Source stage | Notes |
|---|---|---|---|
| `plan_id` | string | Stage 03 | |
| `demand_id` | string | Stage 01 | |
| `component_ids` | string[] | Stage 05 | Components being deployed |
| `rollback_window_minutes` | int | Human | SLA window for rollback |

#### OUTPUT — `RollbackReadinessRecord`
```json
{
  "rollback_id": "RBK-0068-1",
  "plan_id": "PLN-0068-1",
  "demand_id": "DEM-2026-0068",
  "environment": "prod",
  "rollback_viable": true,
  "rollback_steps": [
    "Trigger blue-green switch to v2.4.1 on svc-payments-api",
    "Restore auth DB snapshot from 2026-07-14T04:00Z",
    "Invalidate CDN cache for affected endpoints"
  ],
  "estimated_rollback_duration_minutes": 18,
  "backup_verified": true,
  "blast_radius": "payments checkout flow, auth sessions",
  "rollback_owner": "clara.davis",
  "validated_at": "2026-07-14T06:00:00Z",
  "status": "validated"
}
```

**Output consumed by:** Stage 06-A (`Release-readiness` preconditions check), Stage 06-C (`Cutover comms` as part of bridge pack)

---

### 06-C: Cutover Comms

**Use Case:** Runs the cutover bridge — live status, step tracking, stakeholder updates.

#### INPUT — `CutoverCommsRequest`
```json
{
  "plan_id": "PLN-0068-1",
  "demand_id": "DEM-2026-0068",
  "readiness_id": "RDY-0068-1",
  "rollback_id": "RBK-0068-1",
  "stakeholder_ids": ["j.alvarez", "m.rodriguez"],
  "cutover_steps": [
    { "step_id": "CS-01", "name": "Deploy svc-payments-api v2.4.2", "owner": "clara.davis" },
    { "step_id": "CS-02", "name": "Smoke test payments flow", "owner": "alice.smith" }
  ]
}
```

#### OUTPUT — `CutoverStatusRecord`
```json
{
  "cutover_id": "CUT-0068-1",
  "plan_id": "PLN-0068-1",
  "demand_id": "DEM-2026-0068",
  "started_at": "2026-07-14T22:00:00Z",
  "completed_at": null,
  "steps": [
    {
      "step_id": "CS-01",
      "name": "Deploy svc-payments-api v2.4.2",
      "owner": "clara.davis",
      "status": "complete",
      "completed_at": "2026-07-14T22:12:00Z",
      "notes": ""
    }
  ],
  "stakeholder_updates": [
    {
      "sent_at": "2026-07-14T22:12:00Z",
      "message": "Step 1 complete. Payments API v2.4.2 deployed successfully. Proceeding to smoke tests.",
      "recipients": ["j.alvarez", "m.rodriguez"]
    }
  ],
  "overall_status": "in-progress",
  "rollback_invoked": false
}
```

**Output consumed by:** Stage 09 (`Readiness validation`), audit trail for Stage 08

---

### 06-D: Runbook Drafting

**Use Case:** Drafts and maintains deployment runbooks from the change and prior runbooks.

#### INPUT — `RunbookDraftRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "change_record_id": "CHG-0068-1",
  "component_ids": ["svc-payments-api", "svc-auth"],
  "prior_runbook_ids": ["RBK-PREV-0042"],
  "architecture_doc_refs": ["sharepoint://arch/payments-api-v2"]
}
```

#### OUTPUT — `RunbookRecord`
```json
{
  "runbook_id": "RBK-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "change_record_id": "CHG-0068-1",
  "title": "Deployment Runbook: Payments API v2.4.2",
  "sections": [
    {
      "section": "Pre-deployment checks",
      "steps": ["Confirm staging smoke tests green", "Verify backup snapshot taken at T-2h"]
    },
    {
      "section": "Deployment steps",
      "steps": ["Scale down svc-payments-api replica set", "Deploy image v2.4.2", "Health check /api/health"]
    },
    {
      "section": "Post-deployment verification",
      "steps": ["Run end-to-end payment flow", "Monitor error rate for 15 min"]
    },
    {
      "section": "Rollback procedure",
      "steps": ["kubectl rollout undo deployment/payments-api", "Restore DB snapshot"]
    }
  ],
  "reviewed_by": null,
  "status": "draft",
  "created_at": "2026-07-14T06:30:00Z"
}
```

**Output consumed by:** Stage 06-C (cutover steps), Stage 09 (`Handover & KT`)

---

## Stage 07 — Test & Quality

### 07-A: Test Generation

**Use Case:** Derives test cases from requirements and code changes.

#### INPUT — `TestGenerationRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "story_ids": ["US-101", "US-102"],
  "code_diff_ref": "pr://repo/payments-api/pr/88",
  "traceability_matrix_id": "TRC-0068-1"
}
```

#### OUTPUT — `TestSuiteRecord`
```json
{
  "suite_id": "TST-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "generated_at": "2026-07-13T10:00:00Z",
  "test_cases": [
    {
      "test_id": "TC-001",
      "story_id": "US-101",
      "title": "Successful payment with valid card",
      "steps": ["POST /api/payments with valid card", "Assert 200 and transaction_id returned"],
      "expected_result": "Payment accepted, transaction recorded",
      "priority": "critical",
      "type": "functional"
    },
    {
      "test_id": "TC-002",
      "story_id": "US-101",
      "title": "Payment rejected for expired card",
      "steps": ["POST /api/payments with expired card", "Assert 402 returned"],
      "expected_result": "Payment declined error returned",
      "priority": "high",
      "type": "negative"
    }
  ],
  "coverage_summary": {
    "total_stories": 2,
    "stories_covered": 2,
    "total_test_cases": 12,
    "critical_path_coverage_pct": 95
  },
  "status": "draft"
}
```

**Output consumed by:** Stage 07-B (`Test data on demand`), Stage 07-E (`Test execution`), Stage 07-F (`Traceability`)

---

### 07-B: Test Data on Demand

**Use Case:** Provisions compliant masked/synthetic data matched to test needs.

#### INPUT — `TestDataRequest`
```json
{
  "suite_id": "TST-0068-1",
  "demand_id": "DEM-2026-0068",
  "target_environment": "test",
  "schema_refs": ["db://payments/transactions", "db://auth/users"],
  "data_volume": 500,
  "privacy_classification": "PII-masked",
  "expiry_hours": 48
}
```

#### OUTPUT — `TestDataProvisionRecord`
```json
{
  "data_provision_id": "TDP-0068-1",
  "suite_id": "TST-0068-1",
  "demand_id": "DEM-2026-0068",
  "environment": "test",
  "datasets": [
    {
      "schema": "db://payments/transactions",
      "record_count": 500,
      "masking_applied": true,
      "location": "test-db://payments/synthetic_20260714"
    }
  ],
  "privacy_sign_off": null,
  "signed_off_by": null,
  "expires_at": "2026-07-16T10:00:00Z",
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 07-E (`Test execution`)

---

### 07-C: Defect Triage

**Use Case:** Clusters, deduplicates, prioritises and routes defects.

#### INPUT — `DefectTriageRequest`
```json
{
  "test_run_id": "TR-0068-1",
  "demand_id": "DEM-2026-0068",
  "defect_ids": ["BUG-4421", "BUG-4422", "BUG-4423"],
  "code_ownership_map": {
    "svc-payments-api": "d.chen",
    "svc-auth": "m.rodriguez"
  }
}
```

#### OUTPUT — `DefectTriageRecord`
```json
{
  "triage_id": "TRG-0068-1",
  "test_run_id": "TR-0068-1",
  "demand_id": "DEM-2026-0068",
  "triaged_defects": [
    {
      "defect_id": "BUG-4421",
      "severity": "critical",
      "priority": 1,
      "cluster": "payments-timeout",
      "duplicate_of": null,
      "root_cause_hint": "Connection pool exhausted under load > 200 rps",
      "assigned_to": "d.chen",
      "recommended_action": "fix-before-release"
    },
    {
      "defect_id": "BUG-4422",
      "severity": "minor",
      "priority": 3,
      "cluster": "ui-cosmetic",
      "duplicate_of": "BUG-4401",
      "root_cause_hint": "Duplicate of known CSS issue",
      "assigned_to": "f.nguyen",
      "recommended_action": "defer"
    }
  ],
  "release_risk_summary": "1 critical defect blocks release",
  "human_confirmed": false,
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 07-G (`Quality gate`), Stage 06-A (`Release-readiness` preconditions)

---

### 07-D: Security Testing

**Use Case:** Runs continuous in-pipeline security testing, triages findings, drafts fixes.

#### INPUT — `SecurityTestRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "component_ids": ["svc-payments-api"],
  "pipeline_run_id": "CI-RUN-9901",
  "scan_types": ["SAST", "DAST"],
  "vulnerability_db_version": "2026-07-14"
}
```

#### OUTPUT — `SecurityTestRecord`
```json
{
  "security_test_id": "SEC-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "pipeline_run_id": "CI-RUN-9901",
  "scanned_at": "2026-07-13T08:00:00Z",
  "findings": [
    {
      "finding_id": "FND-001",
      "component_id": "svc-payments-api",
      "severity": "high",
      "category": "SQL Injection",
      "location": "src/routes/payments.py:L88",
      "exploitable": true,
      "draft_fix": "Use parameterised query: cursor.execute('SELECT * FROM tx WHERE id=?', (tx_id,))",
      "status": "open"
    }
  ],
  "summary": {
    "critical": 0,
    "high": 1,
    "medium": 3,
    "low": 7
  },
  "exploitable_confirmed": false,
  "signed_off_by": null,
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 07-G (`Quality gate`), Stage 06-A (`Release-readiness`)

---

### 07-E: Test Execution

**Use Case:** Selects and runs the right impact-based suite; reports results with failure analysis.

#### INPUT — `TestExecutionRequest`
```json
{
  "suite_id": "TST-0068-1",
  "data_provision_id": "TDP-0068-1",
  "demand_id": "DEM-2026-0068",
  "environment": "test",
  "impact_scope": ["svc-payments-api"],
  "execution_mode": "impact-based"
}
```

#### OUTPUT — `TestRunRecord`
```json
{
  "test_run_id": "TR-0068-1",
  "suite_id": "TST-0068-1",
  "demand_id": "DEM-2026-0068",
  "environment": "test",
  "executed_at": "2026-07-13T11:00:00Z",
  "results": [
    {
      "test_id": "TC-001",
      "status": "passed",
      "duration_ms": 340,
      "failure_analysis": null
    },
    {
      "test_id": "TC-002",
      "status": "failed",
      "duration_ms": 210,
      "failure_analysis": "Received 500 instead of 402 — null-pointer in card validator"
    }
  ],
  "summary": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "skipped": 0,
    "pass_rate_pct": 91.7
  },
  "defect_ids_raised": ["BUG-4421"],
  "human_acceptance": null,
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 07-C (`Defect triage`), Stage 07-G (`Quality gate`), Stage 06-A (`Release-readiness`)

---

### 07-F: Traceability

**Use Case:** Maintains the live requirement → test → defect matrix.

#### INPUT — `TraceabilityUpdateRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "suite_id": "TST-0068-1",
  "test_run_id": "TR-0068-1",
  "defect_ids": ["BUG-4421"]
}
```

#### OUTPUT — `TraceabilityMatrixRecord`
```json
{
  "traceability_id": "TRC-0068-1",
  "demand_id": "DEM-2026-0068",
  "last_updated": "2026-07-13T12:00:00Z",
  "entries": [
    {
      "story_id": "US-101",
      "test_ids": ["TC-001", "TC-002"],
      "defect_ids": ["BUG-4421"],
      "coverage_status": "covered",
      "passing": false
    },
    {
      "story_id": "US-102",
      "test_ids": ["TC-003"],
      "defect_ids": [],
      "coverage_status": "covered",
      "passing": true
    }
  ],
  "uncovered_stories": [],
  "coverage_gaps": [],
  "audit_ready": true
}
```

**Output consumed by:** Stage 07-G (`Quality gate`), Stage 08 (`Audit evidence`), Stage 06-A (`Release-readiness`)

---

### 07-G: Quality Gate

**Use Case:** Judges whether quality thresholds are met for release.

#### INPUT — `QualityGateRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "test_run_id": "TR-0068-1",
  "triage_id": "TRG-0068-1",
  "security_test_id": "SEC-0068-1",
  "traceability_id": "TRC-0068-1",
  "quality_policy": {
    "min_pass_rate_pct": 95,
    "max_open_critical_defects": 0,
    "max_open_high_security_findings": 0,
    "min_coverage_pct": 90
  }
}
```

#### OUTPUT — `QualityGateRecord`
```json
{
  "gate_id": "QGT-0068-1",
  "demand_id": "DEM-2026-0068",
  "test_run_id": "TR-0068-1",
  "evaluated_at": "2026-07-13T13:00:00Z",
  "verdict": "fail",
  "score": 72,
  "checks": [
    { "check": "pass_rate", "threshold": "95%", "actual": "91.7%", "result": "fail" },
    { "check": "critical_defects", "threshold": "0", "actual": "1", "result": "fail" },
    { "check": "security_high_findings", "threshold": "0", "actual": "1", "result": "fail" },
    { "check": "coverage", "threshold": "90%", "actual": "95%", "result": "pass" }
  ],
  "gap_explanation": "1 critical defect (BUG-4421) and 1 high security finding (FND-001) block release. Pass rate 91.7% below 95% threshold.",
  "human_decision": null,
  "decided_by": null,
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 06-A (`Release-readiness`), Stage 08 (`Change-record drafting`)

---

## Stage 08 — Release & Change

### 08-A: Change-Record Drafting

**Use Case:** Auto-authors the change record (plan, backout, evidence) from delivery artefacts.

#### INPUT — `ChangeRecordDraftRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "estimate_id": "EST-0068-1",
  "readiness_id": "RDY-0068-1",
  "gate_id": "QGT-0068-1",
  "test_run_id": "TR-0068-1",
  "runbook_id": "RBK-0068-1",
  "rollback_id": "RBK-ROLLBACK-0068-1",
  "itsm_schema_version": "v2"
}
```

| Field | Type | Source stage |
|---|---|---|
| `demand_id` | string | Stage 01 |
| `plan_id` | string | Stage 03 |
| `estimate_id` | string | Stage 02 |
| `readiness_id` | string | Stage 06-A |
| `gate_id` | string | Stage 07-G |
| `test_run_id` | string | Stage 07-E |
| `runbook_id` | string | Stage 06-D |
| `rollback_id` | string | Stage 06-B |

#### OUTPUT — `ChangeRecord`
```json
{
  "change_record_id": "CHG-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "title": "Deploy Payments API v2.4.2 — Mobile App Refresh",
  "change_type": "standard",
  "risk_rating": null,
  "description": "Deployment of Payments SDK integration and mobile app UI refresh as per DEM-2026-0068.",
  "implementation_plan_ref": "PLN-0068-1",
  "backout_plan_ref": "RBK-ROLLBACK-0068-1",
  "test_evidence_ref": "TR-0068-1",
  "quality_gate_ref": "QGT-0068-1",
  "runbook_ref": "RBK-0068-1",
  "scheduled_start": "2026-07-14T22:00:00Z",
  "scheduled_end": "2026-07-15T02:00:00Z",
  "submitted_by": "m.rodriguez",
  "approved_by": null,
  "status": "draft"
}
```

**Output consumed by:** Stage 08-B (`Change-risk scoring`), Stage 08-C (`CAB prep`), Stage 06-A (`Release-readiness`)

---

### 08-B: Change-Risk Scoring

**Use Case:** Scores change risk and blast radius; recommends the approval path.

#### INPUT — `ChangeRiskScoringRequest`
```json
{
  "change_record_id": "CHG-0068-1",
  "demand_id": "DEM-2026-0068",
  "component_ids": ["svc-payments-api", "svc-auth"],
  "change_calendar_ref": "calendar://freeze-windows/2026-07",
  "historical_change_outcomes_ref": "itsm://history/payments-api"
}
```

#### OUTPUT — `ChangeRiskScoreRecord`
```json
{
  "risk_score_id": "RSK-0068-1",
  "change_record_id": "CHG-0068-1",
  "demand_id": "DEM-2026-0068",
  "risk_score": 42,
  "risk_band": "medium",
  "blast_radius": "Payments checkout flow, ~15k transactions/hour affected during window",
  "recommended_path": "standard-cab",
  "risk_factors": [
    "High-traffic component (svc-payments-api)",
    "2 open dependency edges at time of scoring"
  ],
  "mitigations": [
    "Rollback tested and validated",
    "Off-peak deployment window selected"
  ],
  "freeze_window_conflict": false,
  "human_reviewed": false,
  "status": "pending-review"
}
```

**Output consumed by:** Stage 08-C (`CAB prep`), Stage 08-D (`Collision detection`)

---

### 08-C: CAB Prep

**Use Case:** Assembles the CAB pack, checks calendar conflicts, pre-answers likely questions.

#### INPUT — `CABPrepRequest`
```json
{
  "change_record_id": "CHG-0068-1",
  "risk_score_id": "RSK-0068-1",
  "cab_policy_ref": "itsm://cab-policy/standard",
  "prior_qa_ref": "kb://cab-qa/payments"
}
```

#### OUTPUT — `CABPackRecord`
```json
{
  "cab_pack_id": "CAB-0068-1",
  "change_record_id": "CHG-0068-1",
  "demand_id": "DEM-2026-0068",
  "assembled_at": "2026-07-14T09:00:00Z",
  "calendar_conflicts": [],
  "pack_sections": [
    { "section": "Change Summary", "content": "Deploy Payments API v2.4.2..." },
    { "section": "Risk Assessment", "content": "Risk score 42/100 (medium)..." },
    { "section": "Test Evidence", "content": "91.7% pass rate, 1 deferred defect..." },
    { "section": "Rollback Plan", "content": "Validated rollback in 18 min..." }
  ],
  "anticipated_qa": [
    {
      "question": "What is the rollback strategy?",
      "answer": "Blue-green switch + DB snapshot restore, estimated 18 minutes."
    }
  ],
  "cab_decision": null,
  "chaired_by": null,
  "status": "pending-cab"
}
```

**Output consumed by:** Stage 08-A (status update on `ChangeRecord`), Stage 08-E (`Audit evidence`)

---

### 08-D: Collision Detection

**Use Case:** Finds clashing changes on shared assets and freeze windows.

#### INPUT — `CollisionDetectionRequest`
```json
{
  "change_record_id": "CHG-0068-1",
  "component_ids": ["svc-payments-api", "svc-auth"],
  "scheduled_start": "2026-07-14T22:00:00Z",
  "scheduled_end": "2026-07-15T02:00:00Z",
  "change_calendar_ref": "itsm://calendar/2026-07",
  "freeze_rules_ref": "itsm://freeze-rules/july"
}
```

#### OUTPUT — `CollisionDetectionRecord`
```json
{
  "collision_id": "COL-0068-1",
  "change_record_id": "CHG-0068-1",
  "demand_id": "DEM-2026-0068",
  "evaluated_at": "2026-07-14T09:30:00Z",
  "collisions": [],
  "freeze_window_conflicts": [],
  "shared_asset_clashes": [],
  "safe_to_proceed": true,
  "human_decision": null,
  "status": "clear"
}
```

**Output consumed by:** Stage 08-B (`Change-risk scoring` factor), Stage 08-C (`CAB prep` calendar section)

---

### 08-E: Audit Evidence

**Use Case:** Continuously assembles the who/what/when/approval trail, regulator-ready.

#### INPUT — (event-driven, aggregates from all upstream records)
```json
{
  "demand_id": "DEM-2026-0068",
  "change_record_id": "CHG-0068-1",
  "event_sources": [
    "demand-intake", "estimate-shape", "plan-schedule",
    "dependencies", "config-environments",
    "release-readiness", "quality-gate", "cab-prep"
  ]
}
```

#### OUTPUT — `AuditTrailRecord`
```json
{
  "audit_id": "AUD-0068-1",
  "demand_id": "DEM-2026-0068",
  "change_record_id": "CHG-0068-1",
  "generated_at": "2026-07-15T02:30:00Z",
  "events": [
    { "timestamp": "2026-07-14T05:29:52Z", "actor": "system", "action": "demand_approved", "ref": "DEM-2026-0068" },
    { "timestamp": "2026-07-14T06:00:00Z", "actor": "alice.smith", "action": "estimate_approved", "ref": "EST-0068-1" },
    { "timestamp": "2026-07-14T07:00:00Z", "actor": "m.rodriguez", "action": "plan_generated", "ref": "PLN-0068-1" },
    { "timestamp": "2026-07-14T09:00:00Z", "actor": "j.alvarez", "action": "change_record_submitted", "ref": "CHG-0068-1" },
    { "timestamp": "2026-07-14T10:00:00Z", "actor": "cab-chair", "action": "cab_approved", "ref": "CAB-0068-1" },
    { "timestamp": "2026-07-14T22:00:00Z", "actor": "clara.davis", "action": "cutover_started", "ref": "CUT-0068-1" }
  ],
  "immutable_hash": "sha256:a3f9b2...",
  "regulator_ready": true
}
```

**Output consumed by:** Stage 09 (`Readiness validation`), external audit/regulator

---

## Stage 09 — Ops Readiness

### 09-A: Readiness Validation

**Use Case:** Checks readiness criteria and reports gaps before go-live.

#### INPUT — `ReadinessValidationRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "readiness_id": "RDY-0068-1",
  "cutover_id": "CUT-0068-1",
  "readiness_criteria": {
    "monitoring_configured": true,
    "support_team_briefed": true,
    "runbook_reviewed": true,
    "known_errors_documented": true,
    "on_call_assigned": true
  },
  "monitoring_config_ref": "observability://dashboards/payments-api-v2"
}
```

| Field | Type | Source stage |
|---|---|---|
| `readiness_id` | string | Stage 06-A |
| `cutover_id` | string | Stage 06-C |
| `monitoring_config_ref` | string | Stage 09-C |

#### OUTPUT — `ReadinessValidationRecord`
```json
{
  "validation_id": "RV-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "validated_at": "2026-07-14T20:00:00Z",
  "criteria_results": [
    { "criterion": "monitoring_configured", "status": "pass", "evidence": "observability://dashboards/payments-api-v2 active" },
    { "criterion": "support_team_briefed", "status": "pass", "evidence": "KT session completed 2026-07-13" },
    { "criterion": "runbook_reviewed", "status": "pass", "evidence": "RBK-0068-1 reviewed by d.chen" },
    { "criterion": "known_errors_documented", "status": "warn", "evidence": "2 known errors pending KB article" },
    { "criterion": "on_call_assigned", "status": "pass", "evidence": "clara.davis primary on-call" }
  ],
  "gaps": ["2 known errors not yet documented in KB"],
  "overall_status": "conditional-pass",
  "sign_off_by": null,
  "status": "pending-approval"
}
```

**Output consumed by:** Stage 06-A (`Release-readiness` final precondition), Stage 08-E (`Audit evidence`)

---

### 09-B: Handover & KT

**Use Case:** Generates the support runbook, known-error notes and KT pack for run teams.

#### INPUT — `HandoverKTRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "runbook_id": "RBK-0068-1",
  "defect_ids": ["BUG-4421"],
  "known_error_refs": [],
  "kb_refs": ["kb://payments-api/runbooks"],
  "delivery_team": ["d.chen", "m.rodriguez", "clara.davis"],
  "run_team": ["ops-support@company.com"]
}
```

#### OUTPUT — `HandoverPackRecord`
```json
{
  "handover_id": "HO-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "created_at": "2026-07-14T21:00:00Z",
  "support_runbook": {
    "title": "Payments API v2.4.2 — Operations Runbook",
    "sections": [
      { "section": "Health checks", "content": "GET /api/health — expect 200 in < 200ms" },
      { "section": "Common alerts", "content": "PaymentsTimeout alert: restart pod svc-payments-api-*" }
    ]
  },
  "known_errors": [
    {
      "ke_id": "KE-001",
      "title": "Connection pool exhaustion under 200+ rps",
      "workaround": "Restart pod; permanent fix in next release",
      "linked_defect": "BUG-4421"
    }
  ],
  "kt_pack_url": "sharepoint://kt/payments-api-v2-20260714",
  "reviewed_by": null,
  "status": "draft"
}
```

**Output consumed by:** Stage 09-A (`Readiness validation` — known errors criterion), Stage 09-C feeds back monitoring needs

---

### 09-C: Monitoring Setup

**Use Case:** Proposes alerts and dashboards a change needs from its components and SLOs.

#### INPUT — `MonitoringSetupRequest`
```json
{
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "component_ids": ["svc-payments-api", "svc-auth"],
  "slos": [
    { "component_id": "svc-payments-api", "availability_pct": 99.9, "latency_p99_ms": 500 }
  ],
  "environment": "prod"
}
```

#### OUTPUT — `MonitoringConfigRecord`
```json
{
  "monitoring_id": "MON-0068-1",
  "demand_id": "DEM-2026-0068",
  "plan_id": "PLN-0068-1",
  "environment": "prod",
  "proposed_alerts": [
    {
      "alert_id": "ALT-001",
      "component_id": "svc-payments-api",
      "name": "PaymentsAPI latency p99 > 500ms",
      "condition": "p99_latency > 500",
      "severity": "critical",
      "notify": ["clara.davis", "ops-support@company.com"]
    },
    {
      "alert_id": "ALT-002",
      "component_id": "svc-payments-api",
      "name": "PaymentsAPI availability < 99.9%",
      "condition": "availability_5m < 0.999",
      "severity": "critical",
      "notify": ["clara.davis"]
    }
  ],
  "proposed_dashboards": [
    {
      "dashboard_id": "DSH-001",
      "title": "Payments API — Production Health",
      "panels": ["latency_p50_p99", "error_rate", "throughput_rps", "pod_restart_count"]
    }
  ],
  "sre_reviewed": false,
  "status": "draft"
}
```

**Output consumed by:** Stage 09-A (`Readiness validation` — monitoring criterion)

---

## Complete Flow Summary

```
Stage 01: DemandRecord (approved)
    ↓
Stage 02: EstimateRecord (approved)
    ↓
Stage 03: PlanRecord
    ↓
Stage 04: DependencyEdge[]
    ↓
Stage 05: EnvironmentStateRecord[]
    ↓
Stage 06: RunbookRecord ────────────────────────────────────────────┐
          RollbackReadinessRecord ──────────────────────────────────┤
          CutoverStatusRecord ────────────────────────────────────┐ │
          ReleaseReadinessRecord ──────────────────────────────── │ │
                                                                  │ │
Stage 07: TestSuiteRecord ──────────────────────────────┐         │ │
          TestDataProvisionRecord ──────────────────────┤         │ │
          TestRunRecord ────────────────────────────────┤         │ │
          DefectTriageRecord ───────────────────────────┤─────────┘ │
          SecurityTestRecord ───────────────────────────┤           │
          TraceabilityMatrixRecord ─────────────────────┤           │
          QualityGateRecord ────────────────────────────┘           │
                                                                    │
Stage 08: ChangeRecord ─────────────────────────────────────────────┘
          ChangeRiskScoreRecord
          CABPackRecord
          CollisionDetectionRecord
          AuditTrailRecord
              ↓
Stage 09: MonitoringConfigRecord ──────────────────────────────┐
          HandoverPackRecord ────────────────────────────────── │
          ReadinessValidationRecord ◄──────────────────────────┘
              ↓
          GO / NO-GO → Cutover (Stage 06-C)
```
