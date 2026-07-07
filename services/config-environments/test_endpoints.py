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

def test_records_hygiene_clean():
    payload = {
        "component_id": "test-comp",
        "environment": "dev",
        "observed_name": "test-comp-svr",
        "cmdb_name": "test-comp-svr"
    }
    response = client.post("/api/environments/records-hygiene", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "clean"

def test_records_hygiene_update_proposed():
    payload = {
        "component_id": "test-comp",
        "environment": "dev",
        "observed_name": "test-comp-svr-01",
        "cmdb_name": "Test_Component_Server"
    }
    response = client.post("/api/environments/records-hygiene", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "update_proposed"
    assert data["proposed_action"]["update_cmdb_name_to"] == "test-comp-svr-01"
