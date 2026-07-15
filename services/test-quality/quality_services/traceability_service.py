import sys
import os
from typing import Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.traceability_agent import TraceabilityAgent
from repositories.test_quality_repository import db
from models import TraceabilityUpdateRequest


class TraceabilityService:
    def __init__(self) -> None:
        self.agent = TraceabilityAgent()

    def build_matrix(self, req: TraceabilityUpdateRequest) -> Dict[str, Any]:
        # Fetch test suite from source.db
        suite_data = db.get_test_suite(req.suite_id)
        if not suite_data:
            raise ValueError(
                f"Test suite '{req.suite_id}' not found in database. "
                "Run Test Generation (Tab 1) first."
            )

        # Fetch test run from source.db
        test_run_data = db.get_test_run(req.test_run_id)
        if not test_run_data:
            raise ValueError(
                f"Test run '{req.test_run_id}' not found in database. "
                "Run Test Execution (Tab 5) first."
            )

        # Merge defect IDs: from request + from test run's raised defects
        combined_defects = list(set(
            (req.defect_ids or []) + test_run_data.get("defect_ids_raised", [])
        ))

        # Build delivery context
        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id,
            plan_id=suite_data.get("plan_id")
        )

        # Build matrix via AI agent
        matrix_record = self.agent.build_matrix(
            context=context,
            suite_data=suite_data,
            test_run_data=test_run_data,
            defect_ids=combined_defects
        )

        # Persist to source.db
        db.save_traceability(
            traceability_id=matrix_record["traceability_id"],
            demand_id=req.demand_id,
            data=matrix_record
        )

        return matrix_record


traceability_service = TraceabilityService()
