import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000/api"
DEMAND_ID = "DEM-TEST-001"
RELEASE_ID = "REL-TEST-001"

def print_result(module, endpoint, res):
    if res.status_code in [200, 201]:
        print(f"[OK] {module} - {endpoint}")
    else:
        print(f"[FAIL] {module} - {endpoint} - Status: {res.status_code}, {res.text}")

print(f"--- Starting End-to-End API Test for {DEMAND_ID} ---\n")

# 1. Ops Readiness
print("Testing Ops Readiness...")
res = requests.post(f"{BASE_URL}/ops-readiness/generate-runbook", json={"demand_id": DEMAND_ID, "target_environment": "production"})
print_result("Ops Readiness", "/generate-runbook", res)
res = requests.post(f"{BASE_URL}/ops-readiness/suggest-alerts", json={"demand_id": DEMAND_ID, "services": ["backend", "frontend"]})
print_result("Ops Readiness", "/suggest-alerts", res)
res = requests.post(f"{BASE_URL}/ops-readiness/calculate-score", json={"demand_id": DEMAND_ID, "release_id": RELEASE_ID})
print_result("Ops Readiness", "/calculate-score", res)
res = requests.get(f"{BASE_URL}/ops-readiness/score/{DEMAND_ID}")
print_result("Ops Readiness", "/score (GET)", res)

# 2. Risk & Issues
print("\nTesting Risk & Issues...")
res = requests.get(f"{BASE_URL}/risk-issues/project/{DEMAND_ID}")
print_result("Risk & Issues", "/project (GET)", res)
res = requests.post(f"{BASE_URL}/risk-issues/rca", json={"demand_id": DEMAND_ID, "incident_details": "Database connection timeout"})
print_result("Risk & Issues", "/rca", res)
res = requests.post(f"{BASE_URL}/risk-issues/mitigate", json={"demand_id": DEMAND_ID, "risk_id": "RSK-01"})
print_result("Risk & Issues", "/mitigate", res)

# 3. Budget & Cost
print("\nTesting Budget & Cost...")
res = requests.get(f"{BASE_URL}/budget-cost/project/{DEMAND_ID}")
print_result("Budget & Cost", "/project (GET)", res)
res = requests.post(f"{BASE_URL}/budget-cost/estimate", json={"demand_id": DEMAND_ID})
print_result("Budget & Cost", "/estimate", res)
res = requests.post(f"{BASE_URL}/budget-cost/roi", json={"demand_id": DEMAND_ID, "velocity_data": {"story_points": 50, "sprint_cost": 20000}})
print_result("Budget & Cost", "/roi", res)

# 4. Vendor Coordination
print("\nTesting Vendor Coordination...")
res = requests.get(f"{BASE_URL}/vendor-coordination/project/{DEMAND_ID}")
print_result("Vendor Coordination", "/project (GET)", res)
res = requests.post(f"{BASE_URL}/vendor-coordination/check-sow", json={"demand_id": DEMAND_ID, "sow_document_id": "SOW-123"})
print_result("Vendor Coordination", "/check-sow", res)
res = requests.post(f"{BASE_URL}/vendor-coordination/revoke-access/{DEMAND_ID}?user=vendor_contractor_1")
print_result("Vendor Coordination", "/revoke-access", res)

# 5. Reporting & Communication
print("\nTesting Reporting & Communication...")
res = requests.get(f"{BASE_URL}/reporting-communication/project/{DEMAND_ID}")
print_result("Reporting", "/project (GET)", res)
res = requests.post(f"{BASE_URL}/reporting-communication/generate-summary", json={"demand_id": DEMAND_ID, "audience": "CIO"})
print_result("Reporting", "/generate-summary", res)
res = requests.post(f"{BASE_URL}/reporting-communication/draft-comm", json={"demand_id": DEMAND_ID, "comm_type": "Weekly_Status"})
print_result("Reporting", "/draft-comm", res)

# 6. Knowledge & Artefacts
print("\nTesting Knowledge & Artefacts...")
res = requests.get(f"{BASE_URL}/knowledge-artifacts/project/{DEMAND_ID}")
print_result("Knowledge", "/project (GET)", res)
res = requests.post(f"{BASE_URL}/knowledge-artifacts/extract-lessons", json={"demand_id": DEMAND_ID, "topic": "Deployment Failures"})
print_result("Knowledge", "/extract-lessons", res)
res = requests.post(f"{BASE_URL}/knowledge-artifacts/sync-onboarding", json={"demand_id": DEMAND_ID})
print_result("Knowledge", "/sync-onboarding", res)
res = requests.post(f"{BASE_URL}/knowledge-artifacts/search", json={"query": "architecture diagrams"})
print_result("Knowledge", "/search", res)

print("\n--- Test Complete ---")
