import sys
import os
import json
from typing import Dict, Any, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from llm_client import call_gemini
from prompts.traceability_prompt import (
    TRACEABILITY_SYSTEM_INSTRUCTION,
    TRACEABILITY_PROMPT_TEMPLATE
)
from models import DeliveryContext, TraceabilityMatrixRecord


class TraceabilityAgent:
    def build_matrix(
        self,
        context: DeliveryContext,
        suite_data: Dict[str, Any],
        test_run_data: Dict[str, Any],
        defect_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Calls Gemini to build a requirement → test → defect traceability matrix.
        """
        context_str = json.dumps(context.model_dump(), indent=2)
        suite_str = json.dumps(suite_data, indent=2)
        test_run_str = json.dumps(test_run_data, indent=2)

        prompt = TRACEABILITY_PROMPT_TEMPLATE.format(
            delivery_context=context_str,
            test_suite=suite_str,
            test_run=test_run_str,
            demand_id=context.demand_id,
            defect_ids=defect_ids or []
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=TRACEABILITY_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force demand_id from context
        response_json["demand_id"] = context.demand_id

        # Validate against Pydantic contract
        validated = TraceabilityMatrixRecord(**response_json)
        return validated.model_dump()
