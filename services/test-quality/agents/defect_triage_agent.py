import sys
import os
import json
from typing import Dict, Any, List, Optional

# Ensure local test-quality directory is at the front of sys.path to avoid import pollution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from llm_client import call_gemini
from prompts.defect_triage_prompt import (
    DEFECT_TRIAGE_SYSTEM_INSTRUCTION,
    DEFECT_TRIAGE_PROMPT_TEMPLATE
)
from models import DeliveryContext, DefectTriageRecord

class DefectTriageAgent:
    def triage_defects(
        self,
        context: DeliveryContext,
        test_run_id: str,
        defect_ids: List[str],
        code_ownership_map: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Calls Gemini to cluster, prioritise, and route defects.
        """
        context_str = json.dumps(context.model_dump(), indent=2)

        prompt = DEFECT_TRIAGE_PROMPT_TEMPLATE.format(
            delivery_context=context_str,
            test_run_id=test_run_id,
            defect_ids=defect_ids,
            code_ownership_map=code_ownership_map
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=DEFECT_TRIAGE_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force context IDs matching
        response_json["demand_id"] = context.demand_id
        response_json["test_run_id"] = test_run_id

        # Validate that the response conforms to the DefectTriageRecord Pydantic model
        validated = DefectTriageRecord(**response_json)
        return validated.model_dump()
