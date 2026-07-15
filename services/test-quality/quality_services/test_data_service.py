import sys
import os
from typing import Dict, Any, List, Optional

# Ensure local test-quality directory is at the front of sys.path to avoid import pollution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.test_data_agent import TestDataAgent
from repositories.test_quality_repository import db
from models import TestDataRequest

class TestDataService:
    def __init__(self) -> None:
        self.agent = TestDataAgent()

    def provision_data(self, req: TestDataRequest) -> Dict[str, Any]:
        suite_record = db.get_test_suite(req.suite_id)
        if not suite_record:
            raise ValueError(f"Test suite record with ID '{req.suite_id}' not found in the database.")


        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id
        )

        provision_record = self.agent.provision_data(
            context=context,
            suite_data=suite_record,
            target_environment=req.target_environment,
            schema_refs=req.schema_refs or [],
            data_volume=req.data_volume,
            privacy_classification=req.privacy_classification,
            expiry_hours=req.expiry_hours
        )

        db.save_test_data_provision(
            data_provision_id=provision_record["data_provision_id"],
            suite_id=req.suite_id,
            demand_id=req.demand_id,
            data=provision_record
        )

        return provision_record

test_data_service = TestDataService()
