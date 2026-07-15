import sys
import os
from typing import Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.test_execution_agent import TestExecutionAgent
from repositories.test_quality_repository import db
from models import TestExecutionRequest


class TestExecutionService:
    def __init__(self) -> None:
        self.agent = TestExecutionAgent()

    def execute_suite(self, req: TestExecutionRequest) -> Dict[str, Any]:
        # Fetch the test suite from source.db — raises if not found
        suite_data = db.get_test_suite(req.suite_id)
        if not suite_data:
            raise ValueError(
                f"Test suite '{req.suite_id}' not found in database. "
                "Run Test Generation (Tab 1) first."
            )

        # Optionally fetch test data provision record
        data_provision = None
        if req.data_provision_id:
            data_provision = db.get_test_data_provision(req.data_provision_id)

        # Build delivery context from source.db
        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id,
            plan_id=suite_data.get("plan_id")
        )

        # Execute via AI agent
        run_record = self.agent.execute(
            context=context,
            suite_data=suite_data,
            data_provision_id=req.data_provision_id,
            environment=req.environment,
            impact_scope=req.impact_scope or [],
            execution_mode=req.execution_mode or "impact-based"
        )

        # Persist to source.db
        db.save_test_run(
            test_run_id=run_record["test_run_id"],
            suite_id=req.suite_id,
            demand_id=req.demand_id,
            data=run_record
        )

        return run_record


test_execution_service = TestExecutionService()
