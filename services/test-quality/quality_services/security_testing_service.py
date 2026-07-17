import sys
import os
from typing import Dict, Any, List, Optional

# Ensure local test-quality directory is at the front of sys.path to avoid import pollution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.security_testing_agent import SecurityTestingAgent
from repositories.test_quality_repository import db
from models import SecurityTestRequest

class SecurityTestingService:
    def __init__(self) -> None:
        self.agent = SecurityTestingAgent()

    def execute_security_scan(self, req: SecurityTestRequest) -> Dict[str, Any]:
        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id,
            plan_id=req.plan_id
        )

        security_record = self.agent.execute_security_scan(
            context=context,
            component_ids=req.component_ids or [],
            pipeline_run_id=req.pipeline_run_id,
            scan_types=req.scan_types or [],
            vulnerability_db_version=req.vulnerability_db_version
        )

        db.save_security_test(
            security_test_id=security_record["security_test_id"],
            demand_id=req.demand_id,
            plan_id=req.plan_id,
            data=security_record
        )

        db.update_consolidated_stage(
            demand_id=req.demand_id,
            step_key="security_testing",
            data=security_record
        )

        return security_record

security_testing_service = SecurityTestingService()
