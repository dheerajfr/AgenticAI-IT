import os
import sys
import json
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

# Ensure services and plan-schedule package are on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from main import app
from database import db

client = TestClient(app)

def test_replan_validation_not_started():
    plan_id = "test-plan-future"
    plan_data = {
        "plan_id": plan_id,
        "demand_id": "DEM-2026-0099",
        "end_date": "2026-12-31",
        "critical_path_task_ids": ["T1"],
        "status": "accepted",
        "tasks": [
            {
                "task_id": "T1",
                "name": "Design & Setup",
                "start_date": "2026-12-01",
                "end_date": "2026-12-31",
                "owner": "diana@example.com",
                "status": "pending"
            }
        ],
        "_reasoning": {
            "estimate_id": "EST-99",
            "raw_effort_days": 10.0
        }
    }
    db.save(plan_data)
    
    resp = client.post(f"/api/plans/{plan_id}/replan", json={})
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["status"] == "success"
    assert res_data["started"] is False

def test_replan_validation_started_requires_reason():
    plan_id = "test-plan-past"
    plan_data = {
        "plan_id": plan_id,
        "demand_id": "DEM-2026-0098",
        "end_date": "2026-06-30",
        "critical_path_task_ids": ["T1"],
        "status": "accepted",
        "tasks": [
            {
                "task_id": "T1",
                "name": "Design & Setup",
                "start_date": "2026-06-01",
                "end_date": "2026-06-30",
                "owner": "diana@example.com",
                "status": "pending"
            }
        ],
        "_reasoning": {
            "estimate_id": "EST-98",
            "raw_effort_days": 10.0
        }
    }
    db.save(plan_data)
    
    resp = client.post(f"/api/plans/{plan_id}/replan", json={})
    assert resp.status_code == 400
    assert "Reason for replanning is mandatory" in resp.json()["detail"]

    with patch("llm_client.call_gemini") as mock_gemini:
        mock_gemini.return_value = {
            "employee_on_leave": None,
            "leave_start_date": None,
            "leave_end_date": None,
            "reallocation_required": False
        }
        resp = client.post(f"/api/plans/{plan_id}/replan", json={"reason": "Timeline updates"})
        assert resp.status_code == 200

def test_ai_reallocation_leaves():
    email_leave = "diana@example.com"
    email_replacement = "john@example.com"
    
    db.update_employee_status(email_leave, "Available")
    db.update_employee_status(email_replacement, "Available")
    
    plan_id = "test-reassign-plan"
    plan_data = {
        "plan_id": plan_id,
        "demand_id": "DEM-2026-0097",
        "end_date": "2026-12-31",
        "critical_path_task_ids": ["T1"],
        "status": "accepted",
        "tasks": [
            {
                "task_id": "T1",
                "name": "Design & Setup",
                "start_date": "2026-12-01",
                "end_date": "2026-12-31",
                "owner": email_leave,
                "status": "pending"
            }
        ],
        "_reasoning": {
            "estimate_id": "EST-97",
            "raw_effort_days": 10.0
        }
    }
    db.save(plan_data)

    with patch("llm_client.call_gemini") as mock_gemini:
        mock_gemini.return_value = {
            "employee_on_leave": email_leave,
            "leave_start_date": "2026-07-07",
            "leave_end_date": "2026-07-21",
            "reallocation_required": True
        }
        
        resp = client.post(f"/api/plans/{plan_id}/replan", json={"reason": "Gabriel is going on leave for two weeks"})
        assert resp.status_code == 200
        res_json = resp.json()
        assert len(res_json["reallocations"]) > 0
        
        employees = db.get_employees()
        gabriel = next(e for e in employees if e["email"] == email_leave)
        assert gabriel["status"] == "On Leave"
        assert gabriel["allocated"] is False
