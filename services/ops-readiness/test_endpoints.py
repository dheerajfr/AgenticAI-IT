import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add current folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app

client = TestClient(app)

def test_health():
    response = client.get("/api/ops-readiness/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "stage": 9}

def test_monitoring():
    payload = {
        "demand_id": "DEM-2026-0068",
        "plan_id": "PLN-0068-1",
        "component_ids": ["svc-payments-api", "svc-auth"],
        "slos": [
            { "component_id": "svc-payments-api", "availability_pct": 99.9, "latency_p99_ms": 500 }
        ],
        "environment": "prod"
    }
    response = client.post("/api/ops-readiness/monitoring", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["monitoring_id"] == "MON-0068-1"
    assert data["monitoring_plan_id"] == "MON-PLAN-DEM-2026-0068"
    assert len(data["proposed_alerts"]) > 0
    assert len(data["proposed_dashboards"]) > 0
    assert data["sre_reviewed"] is False

def test_dynamic_multi_tech_monitoring():
    payload = {
        "demand_id": "DEM-2026-0128",
        "plan_id": "PLN-0128-1",
        "component_ids": [
            "svc-order-api",
            "postgres-db-cluster",
            "mongodb-analytics",
            "kafka-event-stream",
            "redis-cache-cluster",
            "rabbitmq-order-queue"
        ],
        "environment": "production"
    }
    response = client.post("/api/ops-readiness/monitoring", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["monitoring_plan_id"] == "MON-PLAN-DEM-2026-0128"
    assert len(data["component_specs"]) == 6
    assert len(data["slo_targets"]) == 6

    # Verify alerts for different technologies
    alert_ids = [a["alert_id"] for a in data["proposed_alerts"]]
    assert any("LATENCY" in aid for aid in alert_ids)
    assert any("CONNPOOL" in aid for aid in alert_ids)
    assert any("LAG" in aid for aid in alert_ids)
    assert any("MEMORY" in aid for aid in alert_ids)
    assert any("QUEUE-DEPTH" in aid for aid in alert_ids)
    assert any("DLQ" in aid for aid in alert_ids)

    # Verify dashboards contain widget specs
    dashboards = data["proposed_dashboards"]
    assert len(dashboards) > 0
    widgets = dashboards[0].get("widgets", [])
    assert len(widgets) > 0

def test_sre_review():
    payload = {"reviewed_by": "sre-lead@company.com"}
    response = client.post("/api/ops-readiness/monitoring/DEM-2026-0068/sre-review", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["sre_reviewed"] is True
    assert data["status"] == "approved"

def test_handover():
    payload = {
        "demand_id": "DEM-2026-0068",
        "plan_id": "PLN-0068-1",
        "runbook_id": "RBK-0068-1",
        "defect_ids": ["BUG-4421"],
        "known_error_refs": [],
        "kb_refs": ["kb://payments-api/runbooks"],
        "delivery_team": ["d.chen", "m.rodriguez"],
        "run_team": ["ops-support@company.com"]
    }
    response = client.post("/api/ops-readiness/handover", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["handover_id"] == "HO-0068-1"
    assert len(data["support_runbook"]["sections"]) > 0
    assert len(data["known_errors"]) > 0

def test_handover_review():
    payload = {"reviewed_by": "ops-manager@company.com"}
    response = client.post("/api/ops-readiness/handover/DEM-2026-0068/review", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["reviewed_by"] == "ops-manager@company.com"
    assert data["status"] == "reviewed"

def test_validate():
    payload = {
        "demand_id": "DEM-2026-0068",
        "plan_id": "PLN-0068-1",
        "readiness_id": "RDY-0068-1",
        "cutover_id": "CUT-0068-1",
        "readiness_criteria": {
            "monitoring_configured": True,
            "support_team_briefed": True,
            "runbook_reviewed": True,
            "known_errors_documented": True,
            "on_call_assigned": True
        },
        "monitoring_config_ref": "observability://dashboards/payments-api-v2"
    }
    response = client.post("/api/ops-readiness/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["validation_id"] == "RV-0068-1"
    assert data["overall_status"] == "pass"
    assert len(data["criteria_results"]) == 5

def test_sign_off():
    payload = {
        "sign_off_by": "ops-director@company.com",
        "status": "approved"
    }
    response = client.post("/api/ops-readiness/validate/DEM-2026-0068/sign-off", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["sign_off_by"] == "ops-director@company.com"
    assert data["status"] == "approved"
