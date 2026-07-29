import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add current folder and services folder to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Clear cached local modules
for m in list(sys.modules.keys()):
    if m.startswith("agents.") or m.startswith("quality_services.") or m.startswith("context.") or m in ['main', 'models', 'database']:
        sys.modules.pop(m, None)

from main import app
from context.delivery_context_builder import DeliveryContextBuilder

client = TestClient(app)

# Global variables to share generated IDs across sequential integration test cases
generated_suite_id = None
generated_data_provision_id = None
generated_test_run_id = None
generated_triage_id = None
generated_security_test_id = None
generated_traceability_id = None


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
    global generated_suite_id
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
    assert "suite_id" in data
    assert data["demand_id"] == "DEM-2026-0001"
    assert len(data["test_cases"]) > 0
    assert "title" in data["test_cases"][0]
    assert "type" in data["test_cases"][0]
    
    generated_suite_id = data["suite_id"]

    # Get suite back
    response_get = client.get(f"/api/test-quality/suites/{generated_suite_id}")
    assert response_get.status_code == 200
    assert response_get.json()["suite_id"] == generated_suite_id


def test_test_data_provision():
    global generated_data_provision_id
    assert generated_suite_id is not None, "Test generation must run first to produce suite_id"
    
    payload = {
        "suite_id": generated_suite_id,
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
    assert "data_provision_id" in data
    assert data["suite_id"] == generated_suite_id
    assert data["environment"] == "test"
    assert len(data["datasets"]) > 0
    
    generated_data_provision_id = data["data_provision_id"]

    # Get provision back
    response_get = client.get(f"/api/test-quality/test-data/{generated_data_provision_id}")
    assert response_get.status_code == 200
    assert response_get.json()["data_provision_id"] == generated_data_provision_id


def test_test_execution():
    global generated_test_run_id
    assert generated_suite_id is not None
    assert generated_data_provision_id is not None
    
    payload = {
        "suite_id": generated_suite_id,
        "demand_id": "DEM-2026-0001",
        "data_provision_id": generated_data_provision_id,
        "environment": "test",
        "impact_scope": ["svc-payments-api"],
        "execution_mode": "impact-based"
    }
    response = client.post("/api/test-quality/test-execution", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "test_run_id" in data
    assert data["suite_id"] == generated_suite_id
    assert len(data["results"]) > 0
    
    generated_test_run_id = data["test_run_id"]

    # Get test run back
    response_get = client.get(f"/api/test-quality/test-runs/{generated_test_run_id}")
    assert response_get.status_code == 200
    assert response_get.json()["test_run_id"] == generated_test_run_id


def test_defect_triage():
    global generated_triage_id
    assert generated_test_run_id is not None
    
    payload = {
        "test_run_id": generated_test_run_id,
        "demand_id": "DEM-2026-0001",
        "defect_ids": ["BUG-4421"],
        "code_ownership_map": {"svc-payments-api": "d.chen"}
    }
    response = client.post("/api/test-quality/defect-triage", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "triage_id" in data
    assert data["test_run_id"] == generated_test_run_id
    assert len(data["triaged_defects"]) > 0
    
    generated_triage_id = data["triage_id"]

    # Get triage back
    response_get = client.get(f"/api/test-quality/defect-triage/{generated_triage_id}")
    assert response_get.status_code == 200
    assert response_get.json()["triage_id"] == generated_triage_id


def test_security_testing():
    global generated_security_test_id
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
    assert "security_test_id" in data
    assert "findings" in data
    
    generated_security_test_id = data["security_test_id"]

    # Get security test back
    response_get = client.get(f"/api/test-quality/security-testing/{generated_security_test_id}")
    assert response_get.status_code == 200
    assert response_get.json()["security_test_id"] == generated_security_test_id


def test_traceability():
    global generated_traceability_id
    assert generated_suite_id is not None
    assert generated_test_run_id is not None
    
    payload = {
        "demand_id": "DEM-2026-0001",
        "suite_id": generated_suite_id,
        "test_run_id": generated_test_run_id,
        "defect_ids": ["BUG-4421"]
    }
    response = client.post("/api/test-quality/traceability", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "traceability_id" in data
    assert data["demand_id"] == "DEM-2026-0001"
    assert len(data["entries"]) > 0
    
    generated_traceability_id = data["traceability_id"]

    # Get traceability back
    response_get = client.get(f"/api/test-quality/traceability/{generated_traceability_id}")
    assert response_get.status_code == 200
    assert response_get.json()["traceability_id"] == generated_traceability_id


def test_quality_gate():
    assert generated_test_run_id is not None
    assert generated_triage_id is not None
    assert generated_security_test_id is not None
    assert generated_traceability_id is not None
    
    payload = {
        "demand_id": "DEM-2026-0001",
        "test_run_id": generated_test_run_id,
        "triage_id": generated_triage_id,
        "security_test_id": generated_security_test_id,
        "traceability_id": generated_traceability_id,
        "quality_policy": {
            "min_pass_rate_pct": 95.0,
            "max_open_critical_defects": 0,
            "max_open_high_security_findings": 0,
            "min_coverage_pct": 90.0
        }
    }
    response = client.post("/api/test-quality/quality-gate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "gate_id" in data
    assert data["demand_id"] == "DEM-2026-0001"
    assert data["test_run_id"] == generated_test_run_id
    assert "verdict" in data
    assert data["verdict"] in ["pass", "fail"]
