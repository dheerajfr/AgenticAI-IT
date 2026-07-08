import sys
import os
import pytest

# Add current folder and services folder to path, and mock call_gemini globally before app import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import llm_client

original_call_gemini = llm_client.call_gemini

def dummy_call_gemini(prompt, system_instruction=None, is_json=False, **kwargs):
    prompt_lower = prompt.lower()
    if is_json:
        if "auto-discover" in prompt_lower or "detected_dependencies" in prompt_lower:
            return {
                "detected_dependencies": [
                    {
                        "dependency_id": "DEP-TEST-01",
                        "source_task_id": "T-TST-2",
                        "target_task_id": "T-MIG-1",
                        "type": "technical",
                        "status": "open",
                        "owner": "d.chen"
                    }
                ]
            }
        elif "nudge" in prompt_lower or "chase" in prompt_lower:
            return {
                "nudge_message": "Friendly reminder to check the dependency.",
                "escalation_required": True,
                "threat_level": "high"
            }
    else:
        if "impact" in prompt_lower or "risk" in prompt_lower:
            return "Mock Explanation: The critical path has slipped due to database cluster delays."
    return "Mock response"

# Apply mock globally for testing
llm_client.call_gemini = dummy_call_gemini

@pytest.fixture(autouse=True, scope="module")
def mock_gemini_global_cleanup():
    yield
    # Restore original function to avoid cross-test contamination
    llm_client.call_gemini = original_call_gemini

# Clear cached local modules to prevent cross-contamination
for m in ['main', 'models', 'database', 'orchestration']:
    sys.modules.pop(m, None)
for m in list(sys.modules.keys()):
    if m.startswith('orchestration.'):
        sys.modules.pop(m, None)

from fastapi.testclient import TestClient
from main import app
from database import db

client = TestClient(app)

def test_get_dependencies():
    """Verify loading and retrieving default fixture dependencies."""
    response = client.get("/api/dependencies")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3
    
    # Check default fixture DEP-0001
    dep1 = next((x for x in data if x["dependency_id"] == "DEP-0001"), None)
    assert dep1 is not None
    assert dep1["source_task_id"] == "T-PAY-2"
    assert dep1["target_task_id"] == "T-PAY-1"
    assert dep1["type"] == "technical"
    assert dep1["status"] == "open"


def test_create_dependency():
    """Verify that manually adding a dependency saves correctly."""
    new_dep = {
        "dependency_id": "DEP-9999",
        "source_task_id": "T-TEST-SRC",
        "target_task_id": "T-TEST-TGT",
        "type": "data",
        "status": "open",
        "owner": "test.owner@example.com"
    }
    response = client.post("/api/dependencies", json=new_dep)
    assert response.status_code == 200
    data = response.json()
    assert data["dependency_id"] == "DEP-9999"
    
    # Retrieve it back
    response = client.get("/api/dependencies/DEP-9999")
    assert response.status_code == 200
    assert response.json()["owner"] == "test.owner@example.com"


def test_create_duplicate_dependency():
    """Verify error on creating duplicate dependency ID."""
    duplicate_dep = {
        "dependency_id": "DEP-0001",
        "source_task_id": "T-PAY-2",
        "target_task_id": "T-PAY-1",
        "type": "technical",
        "status": "open",
        "owner": "bob.jones@example.com"
    }
    response = client.post("/api/dependencies", json=duplicate_dep)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_sense_dependencies():
    """Verify automatic sensing of dependencies using plan_1 fixture."""
    response = client.post("/api/dependencies/sense", json={"plan_id": "PLN-0001-1"})
    assert response.status_code == 200
    data = response.json()
    assert "detected_dependencies" in data
    assert len(data["detected_dependencies"]) > 0
    assert data["detected_dependencies"][0]["dependency_id"] == "DEP-TEST-01"


def test_sense_dependencies_not_found():
    """Verify 404 error when sensing dependencies for non-existent plan."""
    response = client.post("/api/dependencies/sense", json={"plan_id": "PLN-NON-EXISTENT"})
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_chase_commitment():
    """Verify tracking nudge generation and escalation checks."""
    response = client.post("/api/dependencies/DEP-0001/chase")
    assert response.status_code == 200
    data = response.json()
    assert data["dependency_id"] == "DEP-0001"
    assert "nudge_message" in data
    assert data["escalation_required"] is True
    assert data["threat_level"] == "high"


def test_chase_commitment_not_found():
    """Verify 404 error for chasing non-existent dependency."""
    response = client.post("/api/dependencies/DEP-NON-EXISTENT/chase")
    assert response.status_code == 404


def test_chase_commitment_resolved():
    """Verify 400 Bad Request when trying to chase an already resolved dependency."""
    response = client.post("/api/dependencies/DEP-0002/chase")
    assert response.status_code == 400
    assert "already been resolved" in response.json()["detail"]
def test_cross_programme_impact_critical_path():
    """Verify ripple impact logic when delaying a critical path task."""
    # In plan_1.json, T-AWS-1 is on the critical path and predecessor of T-MIG-1 (which is predecessor of T-TST-2).
    # original end date is 2026-09-15.
    response = client.post(
        "/api/dependencies/impact",
        json={"task_id": "T-AWS-1", "delay_days": 50}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["impact_detected"] is True
    assert data["project_end_date_slipped"] is True
    
    # Verify that T-MIG-1 and T-TST-2 are in affected tasks
    affected_ids = [x["task_id"] for x in data["affected_tasks"]]
    assert "T-MIG-1" in affected_ids
    assert "T-TST-2" in affected_ids
    
    # Check date formats
    assert data["new_project_end_date"] is not None


def test_cross_programme_impact_task_not_found():
    """Verify 404 when assessing delay on non-existent task."""
    response = client.post(
        "/api/dependencies/impact",
        json={"task_id": "T-NON-EXISTENT", "delay_days": 5}
    )
    assert response.status_code == 404


def test_normalization(monkeypatch):
    """Verify that type, status, and threat_level values are normalized correctly."""
    import orchestration.dependency_graph
    def mock_sense(prompt, system_instruction=None, is_json=False, **kwargs):
        return {
            "detected_dependencies": [
                {
                    "dependency_id": "DEP-NORM-01",
                    "source_task_id": "T-TST-2",
                    "target_task_id": "T-AWS-1",
                    "type": "Technical dependency with external vendors",
                    "status": "at risk",
                    "owner": "test.owner"
                }
            ]
        }
    monkeypatch.setattr(orchestration.dependency_graph, "call_gemini", mock_sense)
    response = client.post("/api/dependencies/sense", json={"plan_id": "PLN-0001-1"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["detected_dependencies"]) > 0
    edge = data["detected_dependencies"][0]
    assert edge["type"] == "technical"
    assert edge["status"] == "at-risk"

    def mock_chase(prompt, system_instruction=None, is_json=False, **kwargs):
        return {
            "nudge_message": "Please update.",
            "escalation_required": True,
            "threat_level": "critical situation"
        }
    monkeypatch.setattr(orchestration.dependency_graph, "call_gemini", mock_chase)
    response = client.post("/api/dependencies/DEP-0001/chase")
    assert response.status_code == 200
    data = response.json()
    assert data["threat_level"] == "high"
