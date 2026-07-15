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
    QualityGateRecord
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

# ==========================================
# Test Suite Endpoints
# ==========================================

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
