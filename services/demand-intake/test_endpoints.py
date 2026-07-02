import sys
import os
import pytest

# Add services folder to path and mock call_gemini globally before app import
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import llm_client

# Save original function for teardown restoration
original_call_gemini = llm_client.call_gemini

def dummy_call_gemini(prompt, system_instruction=None, is_json=False, **kwargs):
    prompt_lower = prompt.lower()
    if is_json:
        if "classify" in prompt_lower:
            return {
                "type": "compliance",
                "domain": "Security & Compliance",
                "risk_level": "high"
            }
        elif "extract" in prompt_lower or "structure" in prompt_lower:
            import re
            text_block_match = re.search(r'"""(.*?)"""', prompt, re.DOTALL)
            text_content = text_block_match.group(1).strip() if text_block_match else prompt
            title_line = re.search(r"(?:Title|Subject|Name):\s*(.*?)(?:\n|$)", text_content, re.IGNORECASE)
            if title_line:
                title = title_line.group(1).strip()
            else:
                first_line = text_content.split('\n')[0].strip()
                title = first_line[:60] if first_line else "New Demand Request"
            return {
                "title": title,
                "description": text_content,
                "submitted_by": "file.user@company.com" if "file.user" in prompt_lower else "tester@example.com",
                "submitted_date": "2026-07-02"
            }
    else:
        if "business case" in prompt_lower or "draft" in prompt_lower:
            return "Approved final draft case summary details."
        return "Mock response"

# Set mock globally during import phase
llm_client.call_gemini = dummy_call_gemini

@pytest.fixture(autouse=True, scope="module")
def mock_gemini_global_cleanup():
    # Keep the mock active during tests
    yield
    # Restore the original function to prevent polluting other test files
    llm_client.call_gemini = original_call_gemini

from fastapi.testclient import TestClient
from main import app
from database import db

client = TestClient(app)

def test_get_demands():
    """Verify loading and retrieving of default fixture demands."""
    response = client.get("/api/demands")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 5
    assert data[0]["demand_id"] == "DEM-2026-0001"
    assert data[0]["status"] == "approved"


def test_intake_text_only():
    """Verify that posting standard text inputs triggers extraction and stores as 'intake' status."""
    response = client.post(
        "/api/demands/intake",
        data={
            "title": "Manual Test Title",
            "submitted_by": "tester@example.com",
            "description": "This is a detailed description of the test intake proposal."
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Manual Test Title"
    assert data["source"] == "text"
    assert data["status"] == "intake"
    assert data["demand_id"] is not None


def test_intake_file_txt():
    """Verify that file uploads parse successfully and converge on identical extraction states."""
    file_content = b"Title: Text File Project\nSubmitted by: file.user@company.com\nThis is the content from an uploaded text file."
    response = client.post(
        "/api/demands/intake",
        data={"title": "", "submitted_by": ""},
        files={"file": ("test_doc.txt", file_content, "text/plain")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "document"
    assert data["source_filename"] == "test_doc.txt"
    assert data["title"] == "Text File Project"
    assert data["submitted_by"] == "file.user@company.com"


def test_intake_validation_error():
    """Verify error responses for empty submissions or unsupported formats."""
    # 1. Empty submission
    response = client.post("/api/demands/intake", data={})
    assert response.status_code == 400
    assert "submission rejected" in response.json()["detail"].lower()
    
    # 2. Unsupported file type
    response = client.post(
        "/api/demands/intake",
        files={"file": ("unsupported_image.png", b"bytes", "image/png")}
    )
    assert response.status_code == 400
    assert "unsupported file type" in response.json()["detail"].lower()


def test_full_pipeline_flow():
    """Verify step-by-step progress, suggestions, and human-in-the-loop approvals."""
    # 1. Intake Submit
    resp = client.post(
        "/api/demands/intake",
        data={
            "title": "Pipeline Security Compliance Integration",
            "submitted_by": "security.architect@company.com",
            "description": "Integrate SAST and DAST scanner tooling into the core microservices pipeline."
        }
    )
    assert resp.status_code == 200
    record = resp.json()
    demand_id = record["demand_id"]
    assert record["status"] == "intake"
    
    # 2. Classify Suggestion (LangGraph Node 1-3 run)
    resp = client.post(f"/api/demands/{demand_id}/classify-route")
    assert resp.status_code == 200
    suggestions = resp.json()
    assert "type" in suggestions
    assert "domain" in suggestions
    assert suggestions["type"] == "compliance"
    
    # 3. Classify Approve
    resp = client.post(
        f"/api/demands/{demand_id}/approve-classify",
        json={
            "type": "compliance",
            "domain": "Security & Compliance",
            "risk_level": "high",
            "duplicate_of": None
        }
    )
    assert resp.status_code == 200
    updated_rec = resp.json()
    assert updated_rec["status"] == "classified"
    assert updated_rec["type"] == "compliance"
    
    # 4. Capacity Verify (Stub)
    resp = client.post(f"/api/demands/{demand_id}/capacity-check")
    assert resp.status_code == 200
    capacity_data = resp.json()
    assert "verdict" in capacity_data
    
    # 5. Capacity Approve
    resp = client.post(
        f"/api/demands/{demand_id}/approve-capacity",
        json={"verdict": capacity_data["verdict"]}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "capacity-checked"
    
    # 6. Business Case Draft (LangGraph Node)
    resp = client.post(f"/api/demands/{demand_id}/business-case")
    assert resp.status_code == 200
    case_data = resp.json()
    assert "business_case_summary" in case_data
    
    # 7. Business Case Approve (Final approval sign-off)
    resp = client.post(
        f"/api/demands/{demand_id}/approve-business-case",
        json={"business_case_summary": "Approved final draft case summary details."}
    )
    assert resp.status_code == 200
    final_record = resp.json()
    assert final_record["status"] == "approved"
    assert final_record["funding_status"] == "approved"
    assert final_record["business_case_summary"] == "Approved final draft case summary details."
