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
        if "auto-discover" in prompt_lower or "detected_dependencies" in prompt_lower or "tasks list" in prompt_lower:
            return {
                "detected_dependencies": [
                    {
                        "dependency_id": "DEP-TEST-01",
                        "source_task_id": "T-TST-2",
                        "target_task_id": "T-MIG-1",
                        "type": "technical",
                        "status": "open",
                        "owner": "alice.smith@example.com"
                    }
                ]
            }
        elif "nudge" in prompt_lower or "chase" in prompt_lower or "dependency details" in prompt_lower:
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

@pytest.fixture(autouse=True, scope="module")
def mock_plan_loader_global():
    from database import plan_loader, PlanRecord
    import json
    
    def mock_load_all():
        plans = []
        fixtures_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "plan-schedule", "fixtures")
        )
        if not os.path.exists(fixtures_dir):
            return plans
        for filename in os.listdir(fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        plans.append(PlanRecord(**data))
                except Exception as e:
                    print(f"Error loading mock plan fixture {filename}: {e}")
        return plans

    def mock_load_by_id(plan_id):
        for plan in mock_load_all():
            if plan.plan_id == plan_id:
                return plan
        return None

    original_load_all = plan_loader.load_all_plans
    original_load_by_id = plan_loader.load_plan_by_id
    
    plan_loader.load_all_plans = mock_load_all
    plan_loader.load_plan_by_id = mock_load_by_id
    
    yield
    
    plan_loader.load_all_plans = original_load_all
    plan_loader.load_plan_by_id = original_load_by_id

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

test_records = {}

@pytest.fixture(autouse=True)
def reset_db_records():
    from models import DependencyEdge
    from database import plan_loader, PlanRecord
    import json
    
    # Mock plan_loader on the active database module instance
    def mock_load_all():
        plans = []
        fixtures_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "plan-schedule", "fixtures")
        )
        if os.path.exists(fixtures_dir):
            for filename in os.listdir(fixtures_dir):
                if filename.endswith(".json"):
                    filepath = os.path.join(fixtures_dir, filename)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            plans.append(PlanRecord(**data))
                    except Exception as e:
                        print(f"Error loading mock plan: {e}")
        return plans

    def mock_load_by_id(plan_id):
        for plan in mock_load_all():
            if plan.plan_id == plan_id:
                return plan
        return None

    plan_loader.load_all_plans = mock_load_all
    plan_loader.load_plan_by_id = mock_load_by_id

    test_records.clear()
    test_records.update({
        "DEP-0001": DependencyEdge(
            dependency_id="DEP-0001",
            source_task_id="PLN-0001-BUILD",
            target_task_id="PLN-0001-DESIGN",
            type="technical",
            status="open",
            owner="umar.roy@example.com"
        ),
        "DEP-0002": DependencyEdge(
            dependency_id="DEP-0002",
            source_task_id="PLN-0001-TEST",
            target_task_id="PLN-0001-BUILD",
            type="technical",
            status="resolved",
            owner="ivan.rivera@example.com"
        ),
        "DEP-0003": DependencyEdge(
            dependency_id="DEP-0003",
            source_task_id="PLN-0001-DEPLOY",
            target_task_id="PLN-0001-TEST",
            type="technical",
            status="at-risk",
            owner="gabriel.morris1@example.com"
        )
    })

# Apply mocks to the database singleton db
db.get_all = lambda: list(test_records.values())
db.get_by_id = lambda dep_id: test_records.get(dep_id)
db.save = lambda record: test_records.__setitem__(record.dependency_id, record)

def test_get_dependencies():
    """Verify loading and retrieving default fixture dependencies."""
    response = client.get("/api/dependencies")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3
    
    # Check default fixture DEP-0001
    dep1 = next((x for x in data if x["dependency_id"] == "DEP-0001"), None)
    assert dep1 is not None
    assert dep1["source_task_id"] == "PLN-0001-BUILD"
    assert dep1["target_task_id"] == "PLN-0001-DESIGN"
    assert dep1["type"] == "technical"
    assert dep1["status"] == "open"


def test_create_dependency():
    """Verify that manually adding a dependency saves correctly."""
    new_dep = {
        "dependency_id": "DEP-9999",
        "source_task_id": "T-SEC-1",
        "target_task_id": "T-AWS-1",
        "type": "data",
        "status": "open",
        "owner": "test.owner@example.com"
    }
    response = client.post("/api/dependencies", json=new_dep)
    assert response.status_code == 200
    data = response.json()
    assert data["dependency_id"] == "DEP-9999"
    assert data["demand_id"] == "DEM-2026-0003"
    
    # Retrieve it back
    response = client.get("/api/dependencies/DEP-9999")
    assert response.status_code == 200
    assert response.json()["owner"] == "test.owner@example.com"
    assert response.json()["demand_id"] == "DEM-2026-0003"


def test_create_duplicate_dependency():
    """Verify error on creating duplicate dependency ID."""
    duplicate_dep = {
        "dependency_id": "DEP-0001",
        "source_task_id": "PLN-0001-BUILD",
        "target_task_id": "PLN-0001-DESIGN",
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
    assert len(data["detected_dependencies"]) == 1
    dep = data["detected_dependencies"][0]
    assert dep["plan_id"] == "PLN-0001-1"
    assert dep["demand_id"] == "DEM-2026-0001"
    assert len(dep["task_list"]) > 0


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
    response = client.get("/api/dependencies/DEP-0001/task-details?task_id=PLN-0001-BUILD")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "open"
    assert data["risk"] == "medium"

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


def test_create_dependency_auto_generate_id():
    """Verify that creating a dependency without an ID auto-generates a sequential ID."""
    new_dep = {
        "source_task_id": "T-SEC-1",
        "target_task_id": "T-AWS-1",
        "type": "technical",
        "status": "open",
        "owner": "auto.owner@example.com"
    }
    response = client.post("/api/dependencies", json=new_dep)
    assert response.status_code == 200
    data = response.json()
    # Should generate sequential ID (e.g. starting with DEP-)
    assert data["dependency_id"].startswith("DEP-")
    
    # Check that it retrieves successfully using the generated ID
    generated_id = data["dependency_id"]
    response = client.get(f"/api/dependencies/{generated_id}")
    assert response.status_code == 200
    assert response.json()["owner"] == "auto.owner@example.com"
