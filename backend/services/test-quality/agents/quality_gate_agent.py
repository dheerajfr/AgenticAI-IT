import sys
import os
import json
from typing import Dict, Any, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from llm_client import call_gemini
from prompts.quality_gate_prompt import (
    QUALITY_GATE_SYSTEM_INSTRUCTION,
    QUALITY_GATE_PROMPT_TEMPLATE
)
from models import DeliveryContext, QualityGateRecord, QualityPolicy


class QualityGateAgent:
    def evaluate(
        self,
        context: DeliveryContext,
        test_run_data: Dict[str, Any],
        triage_data: Optional[Dict[str, Any]],
        security_data: Optional[Dict[str, Any]],
        traceability_data: Optional[Dict[str, Any]],
        quality_policy: QualityPolicy
    ) -> Dict[str, Any]:
        """
        Calls Gemini to evaluate all quality checks against policy thresholds
        and produce a PASS/FAIL gate verdict with score.
        """
        prompt = QUALITY_GATE_PROMPT_TEMPLATE.format(
            quality_policy=json.dumps(quality_policy.model_dump(), indent=2),
            test_run=json.dumps(test_run_data, indent=2),
            triage=json.dumps(triage_data or {}, indent=2),
            security=json.dumps(security_data or {}, indent=2),
            traceability=json.dumps(traceability_data or {}, indent=2),
            demand_id=context.demand_id,
            test_run_id=test_run_data["test_run_id"]
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=QUALITY_GATE_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force IDs from context
        response_json["demand_id"] = context.demand_id
        response_json["test_run_id"] = test_run_data["test_run_id"]

        # Validate against Pydantic contract
        validated = QualityGateRecord(**response_json)
        return validated.model_dump()
