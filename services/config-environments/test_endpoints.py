from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_get_environments():
    response = client.get("/api/environments")
    assert response.status_code == 200
    data = response.json()
    # Assuming fixtures are loaded, there should be at least one record
    assert isinstance(data, list)
    assert len(data) > 0

def test_reconcile_drift_in_sync():
    payload = {
        "component_id": "test-comp",
        "environment": "prod",
        "deployed_version": "1.0.0",
        "expected_version": "1.0.0"
    }
    response = client.post("/api/environments/reconcile-drift", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["drift_status"] == "in-sync"
    assert data["component_id"] == "test-comp"

def test_reconcile_drift_drifted():
    payload = {
        "component_id": "test-comp",
        "environment": "staging",
        "deployed_version": "1.0.0",
        "expected_version": "1.1.0"
    }
    response = client.post("/api/environments/reconcile-drift", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["drift_status"] == "drifted"

from database import db
from models import EnvironmentStateRecord

def test_records_hygiene_clean():
    db.save(EnvironmentStateRecord(
        component_id="test-comp",
        environment="dev",
        deployed_version="1.0",
        expected_version="1.0",
        drift_status="in-sync",
        last_checked="2026-07-06T12:00:00Z",
        observed_name="test-comp-svr",
        cmdb_name="test-comp-svr"
    ))
    payload = {
        "component_id": "test-comp",
        "environment": "dev"
    }
    response = client.post("/api/environments/records-hygiene", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "clean"

def test_records_hygiene_update_proposed():
    db.save(EnvironmentStateRecord(
        component_id="test-comp-update",
        environment="dev",
        deployed_version="1.0",
        expected_version="1.0",
        drift_status="in-sync",
        last_checked="2026-07-06T12:00:00Z",
        observed_name="test-comp-update-svr-01",
        cmdb_name="Test_Comp_Update_Server"
    ))
    payload = {
        "component_id": "test-comp-update",
        "environment": "dev"
    }
    response = client.post("/api/environments/records-hygiene", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "update_proposed"
    assert data["proposed_action"]["update_cmdb_name_to"] == "test-comp-update-svr-01"

def test_apply_hygiene_fix():
    db.save(EnvironmentStateRecord(
        component_id="hygiene-test",
        environment="dev",
        deployed_version="1.0",
        expected_version="1.0",
        drift_status="in-sync",
        last_checked="2026-07-06T12:00:00Z",
        cmdb_name="old-name"
    ))
    payload = {
        "component_id": "hygiene-test",
        "environment": "dev",
        "new_cmdb_name": "new-name"
    }
    response = client.post("/api/environments/apply-hygiene-fix", json=payload)
    assert response.status_code == 200
    assert response.json()["cmdb_name"] == "new-name"

def test_auto_remediate():
    db.save(EnvironmentStateRecord(
        component_id="remediate-test",
        environment="prod",
        deployed_version="1.0",
        expected_version="2.0",
        drift_status="drifted",
        last_checked="2026-07-06T12:00:00Z"
    ))
    payload = {
        "component_id": "remediate-test",
        "environment": "prod"
    }
    response = client.post("/api/environments/auto-remediate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["drift_status"] == "in-sync"
    assert data["deployed_version"] == "2.0"

def test_promote_environment():
    db.save(EnvironmentStateRecord(
        component_id="promote-test",
        environment="dev",
        deployed_version="2.0",
        expected_version="2.0",
        drift_status="in-sync",
        last_checked="2026-07-06T12:00:00Z"
    ))
    payload = {
        "component_id": "promote-test",
        "source_environment": "dev"
    }
    response = client.post("/api/environments/promote", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["environment"] == "test"
    assert data["expected_version"] == "2.0"

def test_verify_readiness():
    db.save(EnvironmentStateRecord(
        component_id="main-comp",
        environment="staging",
        deployed_version="1.0",
        expected_version="1.0",
        drift_status="in-sync",
        last_checked="2026-07-06T12:00:00Z",
        expected_requirements=["dep1"],
        observed_requirements=["dep1"]
    ))
    payload = {
        "component_id": "main-comp",
        "environment": "staging"
    }
    response = client.post("/api/environments/verify-readiness", json=payload)
    assert response.status_code == 200
    assert response.json()["ready"] == True

    db.save(EnvironmentStateRecord(
        component_id="main-comp",
        environment="staging",
        deployed_version="1.0",
        expected_version="1.0",
        drift_status="in-sync",
        last_checked="2026-07-06T12:00:00Z",
        expected_requirements=["dep1", "missing-dep"],
        observed_requirements=["dep1"]
    ))
    response2 = client.post("/api/environments/verify-readiness", json=payload)
    assert response2.status_code == 200
    assert response2.json()["ready"] == False
    assert len(response2.json()["issues"]) == 1
