import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add services folder to path and mock call_gemini globally before app import
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import llm_client

# Save original function for teardown restoration
original_call_gemini = llm_client.call_gemini

def dummy_call_gemini(prompt, system_instruction=None, is_json=False, **kwargs):
    prompt_lower = prompt.lower()
    if is_json:
        if "stress-test" in prompt_lower:
            return {
                "risk_factors": ["Uncertain integration", "Missing API docs"]
            }
        elif "estimate" in prompt_lower or "effort" in prompt_lower:
            return {
                "effort_days": 60,
                "effort_range_low": 50,
                "effort_range_high": 75,
                "cost_estimate": 120000,
                "duration_weeks": 8,
                "confidence": "medium",
                "methodology": "comparable-history"
            }
    return {}

llm_client.call_gemini = dummy_call_gemini

@pytest.fixture(autouse=True, scope="module")
def mock_gemini_global_cleanup():
    yield
    llm_client.call_gemini = original_call_gemini

from main import app
from database import db

client = TestClient(app)

def test_get_estimates():
    response = client.get("/api/estimates")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3 # from fixtures

def test_full_pipeline_flow():
    demand_payload = {
        "demand": {
            "demand_id": "DEM-2026-0999",
            "title": "Test Demand",
            "description": "Test description",
            "type": "project",
            "domain": "Test Domain",
            "risk_level": "medium",
            "funding_status": "pending",
            "submitted_by": "tester",
            "submitted_date": "2026-07-02",
            "status": "approved"
        }
    }
    
    # 1. Generate Estimate
    resp = client.post("/api/estimates/generate", json=demand_payload)
    assert resp.status_code == 200
    est_data = resp.json()
    assert est_data["effort_days"] == 60
    
    # 2. Approve Estimate
    approve_payload = {
        "effort_days": est_data["effort_days"],
        "effort_range_low": est_data["effort_range_low"],
        "effort_range_high": est_data["effort_range_high"],
        "cost_estimate": est_data["cost_estimate"],
        "duration_weeks": est_data["duration_weeks"],
        "confidence": est_data["confidence"],
        "methodology": est_data["methodology"]
    }
    resp = client.post("/api/estimates/approve?demand_id=DEM-2026-0999", json=approve_payload)
    assert resp.status_code == 200
    record = resp.json()
    estimate_id = record["estimate_id"]
    assert record["status"] == "draft"
    
    # 3. Challenge Estimate
    resp = client.post(f"/api/estimates/{estimate_id}/challenge")
    assert resp.status_code == 200
    challenge_data = resp.json()
    assert len(challenge_data["risk_factors"]) == 2
    
    # 4. Approve Challenge
    resp = client.post(f"/api/estimates/{estimate_id}/approve-challenge", json={"risk_factors": challenge_data["risk_factors"]})
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"
    
    # 5. Trigger Check
    resp = client.post(f"/api/estimates/{estimate_id}/trigger-check")
    assert resp.status_code == 200
    trigger_data = resp.json()
    assert "rebaseline_warranted" in trigger_data
    
    # 6. Rebaseline
    resp = client.post(f"/api/estimates/{estimate_id}/rebaseline")
    assert resp.status_code == 200
    assert resp.json()["status"] == "re-baselined"
