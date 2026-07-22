from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any

from models import (
    TestGenerationRequest,
    TestSuiteRecord,
    TestDataRequest,
    TestDataProvisionRecord,
    DefectTriageRequest,
    DefectTriageRecord,
    SecurityTestRequest,
    SecurityTestRecord,
    TestExecutionRequest,
    TestRunRecord,
    TraceabilityUpdateRequest,
    TraceabilityMatrixRecord,
    QualityGateRequest,
    QualityGateRecord,
    DeliveryContext
)
from repositories.test_quality_repository import db
from quality_services.test_generation_service import test_generation_service
from quality_services.test_data_service import test_data_service
from quality_services.defect_triage_service import defect_triage_service
from quality_services.security_testing_service import security_testing_service
from quality_services.test_execution_service import test_execution_service
from quality_services.traceability_service import traceability_service
from quality_services.quality_gate_service import quality_gate_service

app = FastAPI(
    title="Test & Quality Service (Stage 07)",
    description="Service for continuous test generation, test data provisioning, defect triage, and security scanning.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/test-quality/health")
def health_check():
    return {"status": "healthy", "stage": 7}


@app.get("/api/test-quality")
def get_all_test_quality():
    """Root list endpoint — returns all test suite records."""
    return db.get_all_test_suites()




@app.get("/api/test-quality/suites", response_model=List[TestSuiteRecord])
def get_all_suites():
    return db.get_all_test_suites()

@app.get("/api/test-quality/suites/{suite_id}", response_model=TestSuiteRecord)
def get_suite(suite_id: str):
    suite = db.get_test_suite(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite record not found.")
    return suite

@app.post("/api/test-quality/test-generation", response_model=TestSuiteRecord)
def generate_suite(req: TestGenerationRequest):
    try:
        return test_generation_service.generate_suite(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test generation failed: {str(e)}")

# ==========================================
# Test Data Endpoints
# ==========================================

@app.get("/api/test-quality/test-data", response_model=List[TestDataProvisionRecord])
def get_all_test_data():
    return db.get_all_test_data_provisions()

@app.get("/api/test-quality/test-data/{data_provision_id}", response_model=TestDataProvisionRecord)
def get_test_data(data_provision_id: str):
    provision = db.get_test_data_provision(data_provision_id)
    if not provision:
        raise HTTPException(status_code=404, detail="Test data provision record not found.")
    return provision

@app.post("/api/test-quality/test-data", response_model=TestDataProvisionRecord)
def provision_test_data(req: TestDataRequest):
    try:
        return test_data_service.provision_data(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test data provisioning failed: {str(e)}")

# ==========================================
# Defect Triage Endpoints
# ==========================================

@app.get("/api/test-quality/defect-triage", response_model=List[DefectTriageRecord])
def get_all_triages():
    return db.get_all_defect_triages()

@app.get("/api/test-quality/defects")
def get_all_defects():
    """Returns all defects from the defects database table across all demands."""
    try:
        import json
        from shared_db.connection import get_db
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT demand_id, id, status, data FROM defects WHERE soft_delete = 0")
            rows = cursor.fetchall()
            results = []
            for r in rows:
                d_data = json.loads(r[3])
                d_data["demand_id"] = r[0]
                d_data["status"] = r[2] or d_data.get("status") or "Open"
                if "id" not in d_data:
                    d_data["id"] = r[1]
                if "defect_id" not in d_data:
                    d_data["defect_id"] = r[1]
                results.append(d_data)
            return results
    except Exception as e:
        print(f"[Test-Quality] Error querying defects: {e}")
        return []

@app.get("/api/test-quality/defect-triage/{triage_id}", response_model=DefectTriageRecord)
def get_triage(triage_id: str):
    triage = db.get_defect_triage(triage_id)
    if not triage:
        raise HTTPException(status_code=404, detail="Defect triage record not found.")
    return triage

@app.post("/api/test-quality/defect-triage", response_model=DefectTriageRecord)
def triage_defects(req: DefectTriageRequest):
    try:
        return defect_triage_service.triage_defects(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Defect triage failed: {str(e)}")

# ==========================================
# Security Testing Endpoints
# ==========================================

@app.get("/api/test-quality/security-testing", response_model=List[SecurityTestRecord])
def get_all_security_tests():
    return db.get_all_security_tests()

@app.get("/api/test-quality/security-testing/{security_test_id}", response_model=SecurityTestRecord)
def get_security_test_by_id(security_test_id: str):
    scan = db.get_security_test(security_test_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Security test record not found.")
    return scan

@app.post("/api/test-quality/security-testing", response_model=SecurityTestRecord)
def run_security_scan(req: SecurityTestRequest):
    try:
        return security_testing_service.execute_security_scan(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Security testing failed: {str(e)}")

# ==========================================
# Test Execution Endpoints
# ==========================================

@app.get("/api/test-quality/test-runs", response_model=List[TestRunRecord])
def get_all_test_runs():
    return db.get_all_test_runs()

@app.get("/api/test-quality/test-runs/{test_run_id}", response_model=TestRunRecord)
def get_test_run(test_run_id: str):
    run = db.get_test_run(test_run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Test run record not found.")
    return run

@app.post("/api/test-quality/test-execution", response_model=TestRunRecord)
def execute_test_suite(req: TestExecutionRequest):
    try:
        return test_execution_service.execute_suite(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test execution failed: {str(e)}")

# ==========================================
# Traceability Endpoints
# ==========================================

@app.get("/api/test-quality/traceability", response_model=List[TraceabilityMatrixRecord])
def get_all_traceabilities():
    return db.get_all_traceabilities()

@app.get("/api/test-quality/traceability/{traceability_id}", response_model=TraceabilityMatrixRecord)
def get_traceability(traceability_id: str):
    matrix = db.get_traceability(traceability_id)
    if not matrix:
        raise HTTPException(status_code=404, detail="Traceability matrix not found.")
    return matrix

@app.post("/api/test-quality/traceability", response_model=TraceabilityMatrixRecord)
def build_traceability_matrix(req: TraceabilityUpdateRequest):
    try:
        return traceability_service.build_matrix(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Traceability build failed: {str(e)}")

# ==========================================
# Quality Gate Endpoints
# ==========================================

@app.get("/api/test-quality/quality-gates", response_model=List[QualityGateRecord])
def get_all_quality_gates():
    return db.get_all_quality_gates()

@app.get("/api/test-quality/quality-gates/{gate_id}", response_model=QualityGateRecord)
def get_quality_gate(gate_id: str):
    gate = db.get_quality_gate(gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Quality gate record not found.")
    return gate

@app.post("/api/test-quality/quality-gate", response_model=QualityGateRecord)
def evaluate_quality_gate(req: QualityGateRequest):
    try:
        return quality_gate_service.evaluate_gate(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quality gate evaluation failed: {str(e)}")

# ==========================================
# Consolidated Stage Tracker Endpoint
# ==========================================

@app.get("/api/test-quality/consolidated/{demand_id}")
def get_consolidated_state(demand_id: str):
    try:
        return db._get_consolidated(demand_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/test-quality/consolidated")
def get_all_consolidated_states():
    import json
    try:
        with db._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/test-quality/delivery-context/{demand_id}", response_model=DeliveryContext)
def get_delivery_context_endpoint(demand_id: str):
    try:
        from context.delivery_context_builder import DeliveryContextBuilder
        return DeliveryContextBuilder.get_delivery_context(demand_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/test-quality/relational/{table}/{demand_id}")
def get_relational_records(table: str, demand_id: str):
    try:
        return db.get_records_by_demand(table, demand_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test-quality/relational/{table}/{demand_id}/{record_id}")
def save_relational_record(table: str, demand_id: str, record_id: str, data: Dict[str, Any]):
    try:
        db.save_relational_record(table, record_id, demand_id, data, data.get("status", "active"))
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/test-quality/relational/{table}/{record_id}")
def delete_relational_record(table: str, record_id: str):
    try:
        db.delete_relational_record(table, record_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/test-quality/dashboard-stats/{demand_id}")
def get_dashboard_stats(demand_id: str):
    try:
        test_cases = db.get_records_by_demand("test_cases", demand_id)
        test_data = db.get_records_by_demand("test_data", demand_id)
        executions = db.get_records_by_demand("test_execution", demand_id)
        defects = db.get_records_by_demand("defects", demand_id)
        security_findings = db.get_records_by_demand("security_findings", demand_id)
        traceability = db.get_records_by_demand("traceability", demand_id)
        quality_gates = db.get_records_by_demand("quality_gate", demand_id)

        # Execution stats
        latest_run = executions[-1] if len(executions) > 0 else {}
        results = latest_run.get("results", []) if latest_run else []
        if not results and latest_run:
            results = latest_run.get("executions", [])
            
        total_runs = len(results)
        passed_runs = sum(1 for e in results if e.get("status", "").lower() == "passed")
        failed_runs = sum(1 for e in results if e.get("status", "").lower() == "failed")
        blocked_runs = sum(1 for e in results if e.get("status", "").lower() == "blocked")
        skipped_runs = sum(1 for e in results if e.get("status", "").lower() == "skipped")
        pass_rate = (passed_runs / total_runs * 100) if total_runs > 0 else 0.0

        # Defect stats
        open_defects = 0
        closed_defects = 0
        for d in defects:
            status = d.get("status") or d.get("recommended_action") or "open"
            status_lower = str(status).lower()
            if status_lower in ["closed", "resolved", "close", "done"]:
                closed_defects += 1
            else:
                open_defects += 1

        # Security Findings stats
        critical_findings = sum(1 for f in security_findings if f.get("severity", "").lower() == "critical")
        high_findings = sum(1 for f in security_findings if f.get("severity", "").lower() == "high")
        medium_findings = sum(1 for f in security_findings if f.get("severity", "").lower() == "medium")
        low_findings = sum(1 for f in security_findings if f.get("severity", "").lower() == "low")
        info_findings = sum(1 for f in security_findings if f.get("severity", "").lower() == "informational")

        # Quality Gate latest status
        latest_gate = quality_gates[-1] if len(quality_gates) > 0 else {}
        gate_verdict = latest_gate.get("verdict", "N/A")
        quality_score = latest_gate.get("score") or latest_gate.get("quality_score", 0)

        # Traceability coverage
        coverage_pct = 0.0
        if len(traceability) > 0:
            coverage_pct = traceability[-1].get("coverage_percentage", 100.0)

        return {
            "total_test_cases": len(test_cases),
            "total_datasets": len(test_data),
            "executed_tests": total_runs,
            "passed_tests": passed_runs,
            "failed_tests": failed_runs,
            "blocked_tests": blocked_runs,
            "skipped_tests": skipped_runs,
            "pass_rate_pct": round(pass_rate, 2),
            "open_defects": open_defects,
            "closed_defects": closed_defects,
            "security_findings": {
                "critical": critical_findings,
                "high": high_findings,
                "medium": medium_findings,
                "low": low_findings,
                "informational": info_findings,
                "total": len(security_findings)
            },
            "traceability_coverage_pct": round(coverage_pct, 2),
            "quality_gate_status": gate_verdict,
            "quality_score": quality_score,
            "release_readiness": "Ready" if gate_verdict == "PASS" else "Not Ready"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


