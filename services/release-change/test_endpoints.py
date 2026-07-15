import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add current folder and services folder to path, and mock call_gemini globally before app import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import llm_client

# Save original function for teardown restoration
original_call_gemini = llm_client.call_gemini

def dummy_call_gemini(prompt, system_instruction=None, is_json=False, **kwargs):
    prompt_lower = prompt.lower()
    if is_json:
        if "itsm change ticket" in prompt_lower or "draft" in prompt_lower:
            return {
                "title": "Deploy Migration Pipeline — Demand DEM-2026-0068",
                "description": "Deployment run for components as specified in plan PLN-0068-1."
            }
        elif "cab advisory sections" in prompt_lower or "anticipated questions" in prompt_lower:
            return {
                "pack_sections": [
                    { "section": "Change Summary", "content": "Automated deployment pack for demand DEM-2026-0068." },
                    { "section": "Risk Assessment", "content": "Risk score: 60/100. Band: high." },
                    { "section": "Mitigation Strategy", "content": "Validated fallback rollback plan verified." }
                ],
                "anticipated_qa": [
                    {
                        "question": "What is the rollback strategy?",
                        "answer": "Restore component versions to prior release configurations."
                    }
                ]
            }
        elif "ai risk analyst" in prompt_lower or "blast radius" in prompt_lower:
            return {
                "risk_score": 60,
                "risk_band": "high",
                "recommended_path": "standard-cab",
                "risk_factors": ["Multiple components affected: svc-payments-api, svc-auth", "Freeze window proximity warning"],
                "mitigations": ["Rollback tested and validated", "Off-peak deployment window selected"]
            }
        elif "production freeze window rules" in prompt_lower or "safe_to_proceed" in prompt_lower:
            return {
                "collisions": [],
                "freeze_window_conflicts": ["Scheduled window overlaps with July production freeze."],
                "safe_to_proceed": False
            }
    return {}

llm_client.call_gemini = dummy_call_gemini

@pytest.fixture(autouse=True, scope="module")
def mock_gemini_global_cleanup():
    yield
    llm_client.call_gemini = original_call_gemini

# Clear cached local modules to prevent cross-contamination
for m in ['main', 'models', 'database', 'orchestration']:
    sys.modules.pop(m, None)
for m in list(sys.modules.keys()):
    if m.startswith('orchestration.'):
        sys.modules.pop(m, None)

from main import app
from database import db

client = TestClient(app)


def test_health_check():
    response = client.get("/api/release-change/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "stage": 8}

def test_draft_change_record():
    payload = {
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
    response = client.post("/api/release-change/draft", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["change_record_id"] == "CHG-0068-1"
    assert data["demand_id"] == "DEM-2026-0068"
    assert data["status"] == "draft"

    # Verify retrieval
    get_resp = client.get(f"/api/release-change/draft/{data['change_record_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["change_record_id"] == "CHG-0068-1"

def test_compute_risk_score():
    payload = {
        "change_record_id": "CHG-0068-1",
        "demand_id": "DEM-2026-0068",
        "component_ids": ["svc-payments-api", "svc-auth"],
        "change_calendar_ref": "calendar://freeze-windows/2026-07",
        "historical_change_outcomes_ref": "itsm://history/payments-api"
    }
    response = client.post("/api/release-change/risk-score", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_score_id"] == "RSK-0068-1"
    assert data["risk_band"] == "high"  # 30 base + 2*5 components + 15 freeze + 5 api = 60 (high)
    assert data["freeze_window_conflict"] is True

    # Verify retrieval
    get_resp = client.get(f"/api/release-change/risk-score/{data['risk_score_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["risk_score"] == 60

def test_prep_cab_pack():
    # Ensure risk score exists
    db.save_risk_score("RSK-0068-1", "DEM-2026-0068", {
        "risk_score_id": "RSK-0068-1",
        "change_record_id": "CHG-0068-1",
        "demand_id": "DEM-2026-0068",
        "risk_score": 55,
        "risk_band": "medium",
        "blast_radius": "svc-payments-api, svc-auth",
        "recommended_path": "standard-cab",
        "risk_factors": ["Multiple components"],
        "mitigations": ["Rollback tested"],
        "freeze_window_conflict": True,
        "human_reviewed": False,
        "status": "pending-review"
    })

    payload = {
        "change_record_id": "CHG-0068-1",
        "risk_score_id": "RSK-0068-1",
        "cab_policy_ref": "itsm://cab-policy/standard",
        "prior_qa_ref": "kb://cab-qa/payments"
    }
    response = client.post("/api/release-change/cab-prep", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["cab_pack_id"] == "CAB-0068-1"
    assert len(data["pack_sections"]) > 0
    assert data["status"] == "pending-cab"

    # Verify retrieval
    get_resp = client.get(f"/api/release-change/cab-prep/{data['cab_pack_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["cab_pack_id"] == "CAB-0068-1"

def test_detect_collision():
    # Ensure change record exists
    db.save_change_record("CHG-0068-1", "DEM-2026-0068", "PLN-0068-1", {
        "change_record_id": "CHG-0068-1",
        "demand_id": "DEM-2026-0068",
        "plan_id": "PLN-0068-1",
        "title": "Deploy Migration",
        "change_type": "standard",
        "description": "Deploy run",
        "implementation_plan_ref": "PLN-0068-1",
        "backout_plan_ref": "RBK-ROLLBACK-0068-1",
        "test_evidence_ref": "TR-0068-1",
        "quality_gate_ref": "QGT-0068-1",
        "runbook_ref": "RBK-0068-1",
        "scheduled_start": "2026-07-14T22:00:00Z",
        "scheduled_end": "2026-07-15T02:00:00Z",
        "submitted_by": "system.delivery",
        "status": "draft"
    })

    payload = {
        "change_record_id": "CHG-0068-1",
        "component_ids": ["svc-payments-api", "svc-auth"],
        "scheduled_start": "2026-07-14T22:00:00Z",
        "scheduled_end": "2026-07-15T02:00:00Z",
        "change_calendar_ref": "itsm://calendar/2026-07",
        "freeze_rules_ref": "itsm://freeze-rules/july-freeze"
    }
    response = client.post("/api/release-change/collision", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["collision_id"] == "COL-0068-1"
    assert data["safe_to_proceed"] is False
    assert len(data["freeze_window_conflicts"]) == 1

    # Verify retrieval
    get_resp = client.get(f"/api/release-change/collision/{data['collision_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["safe_to_proceed"] is False

def test_generate_audit_trail():
    payload = {
        "demand_id": "DEM-2026-0068",
        "change_record_id": "CHG-0068-1",
        "event_sources": [
            "demand-intake", "estimate-shape", "plan-schedule",
            "dependencies", "config-environments",
            "release-readiness", "quality-gate", "cab-prep"
        ]
    }
    response = client.post("/api/release-change/audit", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["audit_id"] == "AUD-0068-1"
    assert data["regulator_ready"] is True
    assert "sha256:" in data["immutable_hash"]

    # Verify retrieval
    get_resp = client.get(f"/api/release-change/audit/{data['audit_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["audit_id"] == "AUD-0068-1"
