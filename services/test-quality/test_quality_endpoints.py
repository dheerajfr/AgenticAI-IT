import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add current folder and services folder to path, and mock call_gemini globally before app import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import llm_client

original_call_gemini = llm_client.call_gemini

def dummy_call_gemini(prompt, system_instruction=None, is_json=False, **kwargs):
    sys_lower = (system_instruction or "").lower()
    if is_json:
        if "quality assurance" in sys_lower:
            return {
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
                    }
                ],
                "coverage_summary": {
                    "total_stories": 1,
                    "stories_covered": 1,
                    "total_test_cases": 1,
                    "critical_path_coverage_pct": 100.0
                },
                "status": "draft"
            }
        elif "test data" in sys_lower:
            return {
                "data_provision_id": "TDP-0068-1",
                "suite_id": "TST-0068-1",
                "demand_id": "DEM-2026-0068",
                "environment": "test",
                "datasets": [
                    {
                        "schema": "db://payments/transactions",
                        "record_count": 100,
                        "masking_applied": True,
                        "location": "test-db://payments/synthetic_20260714"
                    }
                ],
                "privacy_sign_off": None,
                "signed_off_by": None,
                "expires_at": "2026-07-16T10:00:00Z",
                "status": "pending-approval"
            }
        elif "defect triage" in sys_lower:
            return {
                "triage_id": "TRG-0068-1",
                "test_run_id": "TR-0068-1",
                "demand_id": "DEM-2026-0068",
                "triaged_defects": [
                    {
                        "defect_id": "BUG-4421",
                        "severity": "critical",
                        "priority": 1,
                        "cluster": "payments-timeout",
                        "duplicate_of": None,
                        "root_cause_hint": "Connection pool exhausted",
                        "assigned_to": "d.chen",
                        "recommended_action": "fix-before-release"
                    }
                ],
                "release_risk_summary": "1 critical defect blocks release",
                "human_confirmed": False,
                "status": "pending-approval"
            }
        elif "devsecops" in sys_lower:
            return {
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
                        "exploitable": True,
                        "draft_fix": "Use parameterised query",
                        "status": "open"
                    }
                ],
                "summary": {
                    "critical": 0,
                    "high": 1,
                    "medium": 0,
                    "low": 0
                },
                "exploitable_confirmed": False,
                "signed_off_by": None,
                "status": "pending-approval"
            }
    return {}

llm_client.call_gemini = dummy_call_gemini

@pytest.fixture(autouse=True, scope="module")
def mock_gemini_global_cleanup():
    yield
    llm_client.call_gemini = original_call_gemini

# Clear cached local modules
for m in ['main', 'models', 'database', 'repositories.test_quality_repository', 'quality_services.test_generation_service']:
    sys.modules.pop(m, None)

from main import app
from context.delivery_context_builder import DeliveryContextBuilder

client = TestClient(app)

def test_health_check():
    response = client.get("/api/test-quality/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "stage": 7}

def test_delivery_context_builder():
    # Use real DEM-2026-0001 from the seeded database
    ctx = DeliveryContextBuilder.get_delivery_context("DEM-2026-0001")
    assert ctx.demand_id == "DEM-2026-0001"
    assert ctx.demand is not None
    assert ctx.demand.title == "Cloud Migration for Customer Loyalty Portal"
    assert ctx.estimate is not None
    assert ctx.estimate.estimate_id == "EST-0001-1"

def test_test_generation():
    payload = {
        "demand_id": "DEM-2026-0001",
        "plan_id": "PLN-0001-1",
        "story_ids": ["US-101"],
        "code_diff_ref": "pr://repo/payments-api/pr/88",
        "traceability_matrix_id": "TRC-0001"
    }
    response = client.post("/api/test-quality/test-generation", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["suite_id"] == "TST-0068-1"
    assert data["demand_id"] == "DEM-2026-0001"
    assert len(data["test_cases"]) == 1
    assert data["test_cases"][0]["title"] == "Successful payment with valid card"

    # Get suite back
    response_get = client.get("/api/test-quality/suites/TST-0068-1")
    assert response_get.status_code == 200
    assert response_get.json()["suite_id"] == "TST-0068-1"

def test_test_data_provision():
    payload = {
        "suite_id": "TST-0068-1",
        "demand_id": "DEM-2026-0001",
        "target_environment": "test",
        "schema_refs": ["db://payments/transactions"],
        "data_volume": 100,
        "privacy_classification": "PII-masked",
        "expiry_hours": 48
    }
    response = client.post("/api/test-quality/test-data", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["data_provision_id"] == "TDP-0068-1"
    assert data["environment"] == "test"
    assert len(data["datasets"]) == 1
    assert data["datasets"][0]["schema"] == "db://payments/transactions"

    # Get provision back
    response_get = client.get("/api/test-quality/test-data/TDP-0068-1")
    assert response_get.status_code == 200
    assert response_get.json()["data_provision_id"] == "TDP-0068-1"

def test_defect_triage():
    payload = {
        "test_run_id": "TR-0068-1",
        "demand_id": "DEM-2026-0001",
        "defect_ids": ["BUG-4421"],
        "code_ownership_map": {"svc-payments-api": "d.chen"}
    }
    response = client.post("/api/test-quality/defect-triage", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["triage_id"] == "TRG-0068-1"
    assert len(data["triaged_defects"]) == 1
    assert data["triaged_defects"][0]["defect_id"] == "BUG-4421"

    # Get triage back
    response_get = client.get("/api/test-quality/defect-triage/TRG-0068-1")
    assert response_get.status_code == 200
    assert response_get.json()["triage_id"] == "TRG-0068-1"

def test_security_testing():
    payload = {
        "demand_id": "DEM-2026-0001",
        "plan_id": "PLN-0001-1",
        "component_ids": ["svc-payments-api"],
        "pipeline_run_id": "CI-RUN-9901",
        "scan_types": ["SAST"],
        "vulnerability_db_version": "2026-07-14"
    }
    response = client.post("/api/test-quality/security-testing", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["security_test_id"] == "SEC-0068-1"
    assert len(data["findings"]) == 1
    assert data["findings"][0]["finding_id"] == "FND-001"

    # Get security test back
    response_get = client.get("/api/test-quality/security-testing/SEC-0068-1")
    assert response_get.status_code == 200
    assert response_get.json()["security_test_id"] == "SEC-0068-1"
