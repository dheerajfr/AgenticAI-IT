import sys
import os
from typing import Dict, Any, List, Optional

# Ensure local test-quality directory is at the front of sys.path to avoid import pollution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from context.delivery_context_builder import DeliveryContextBuilder
from agents.defect_triage_agent import DefectTriageAgent
from repositories.test_quality_repository import db
from models import DefectTriageRequest

class DefectTriageService:
    def __init__(self) -> None:
        self.agent = DefectTriageAgent()

    def triage_defects(self, req: DefectTriageRequest) -> Dict[str, Any]:
        context = DeliveryContextBuilder.get_delivery_context(
            demand_id=req.demand_id
        )

        triage_record = self.agent.triage_defects(
            context=context,
            test_run_id=req.test_run_id,
            defect_ids=req.defect_ids,
            code_ownership_map=req.code_ownership_map or {}
        )

        db.save_defect_triage(
            triage_id=triage_record["triage_id"],
            test_run_id=req.test_run_id,
            demand_id=req.demand_id,
            data=triage_record
        )

        db.update_consolidated_stage(
            demand_id=req.demand_id,
            step_key="defect_triage",
            data=triage_record
        )

        return triage_record

defect_triage_service = DefectTriageService()
