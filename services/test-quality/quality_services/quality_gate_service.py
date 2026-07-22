import sys
import os
from typing import Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.quality_gate_agent import QualityGateAgent
from repositories.test_quality_repository import db
from models import QualityGateRequest, QualityPolicy


class QualityGateService:
    def __init__(self) -> None:
        self.agent = QualityGateAgent()

    def evaluate_gate(self, req: QualityGateRequest) -> Dict[str, Any]:
        # Fetch test run from source.db — required
        test_run_data = db.get_test_run(req.test_run_id)
        if not test_run_data:
            raise ValueError(
                f"Test run '{req.test_run_id}' not found in database. "
                "Run Test Execution (Tab 5) first."
            )

        # Fetch optional upstream records
        triage_data = db.get_defect_triage(req.triage_id) if req.triage_id else None
        security_data = db.get_security_test(req.security_test_id) if req.security_test_id else None
        traceability_data = db.get_traceability(req.traceability_id) if req.traceability_id else None

        # Resolve suite_id to get plan_id for context
        suite_id = test_run_data.get("suite_id")
        suite_data = db.get_test_suite(suite_id) if suite_id else None
        plan_id = suite_data.get("plan_id") if suite_data else None

        # Build delivery context
        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id,
            plan_id=plan_id
        )

        # Use provided policy or defaults
        policy = req.quality_policy or QualityPolicy()

        # Evaluate gate via AI agent
        gate_record = self.agent.evaluate(
            context=context,
            test_run_data=test_run_data,
            triage_data=triage_data,
            security_data=security_data,
            traceability_data=traceability_data,
            quality_policy=policy
        )

        # Programmatically compute/override the quality gate score and verdict based on actual checks
        checks = gate_record.get("checks", [])
        if checks:
            passed_checks = sum(1 for c in checks if str(c.get("result", "")).lower() in ["pass", "passed"])
            gate_record["score"] = int((passed_checks / len(checks)) * 100)
            
            # Ensure verdict is "pass" only if ALL checks passed
            all_pass = all(str(c.get("result", "")).lower() in ["pass", "passed"] for c in checks)
            gate_record["verdict"] = "pass" if all_pass else "fail"
        else:
            gate_record["score"] = 0
            gate_record["verdict"] = "fail"

        # Persist to source.db
        db.save_quality_gate(
            gate_id=gate_record["gate_id"],
            demand_id=req.demand_id,
            test_run_id=req.test_run_id,
            data=gate_record
        )

        db.update_consolidated_stage(
            demand_id=req.demand_id,
            step_key="quality_gate",
            data=gate_record
        )

        return gate_record


quality_gate_service = QualityGateService()
