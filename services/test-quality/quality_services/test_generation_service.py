import sys
import os
from typing import Dict, Any, List, Optional

# Ensure local test-quality directory is at the front of sys.path to avoid import pollution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.test_generation_agent import TestGenerationAgent
from repositories.test_quality_repository import db
from models import TestGenerationRequest

class TestGenerationService:
    def __init__(self) -> None:
        self.agent = TestGenerationAgent()

    def generate_suite(self, req: TestGenerationRequest) -> Dict[str, Any]:
        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id,
            plan_id=req.plan_id
        )

        suite_record = self.agent.generate_suite(
            context=context,
            story_ids=req.story_ids or [],
            code_diff_ref=req.code_diff_ref,
            traceability_matrix_id=req.traceability_matrix_id
        )

        db.save_test_suite(
            suite_id=suite_record["suite_id"],
            demand_id=req.demand_id,
            plan_id=req.plan_id,
            data=suite_record
        )

        return suite_record

test_generation_service = TestGenerationService()
