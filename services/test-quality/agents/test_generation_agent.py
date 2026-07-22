import sys
import os
import json
from typing import Dict, Any, List, Optional

services_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
tq_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if services_dir not in sys.path:
    sys.path.insert(0, services_dir)
if tq_dir in sys.path:
    sys.path.remove(tq_dir)
sys.path.insert(0, tq_dir)

from llm_client import call_gemini
from prompts.test_generation_prompt import (
    TEST_GENERATION_SYSTEM_INSTRUCTION,
    TEST_GENERATION_PROMPT_TEMPLATE
)
from models import DeliveryContext, TestSuiteRecord

class TestGenerationAgent:
    def generate_suite(
        self,
        context: DeliveryContext,
        story_ids: List[str],
        code_diff_ref: Optional[str] = None,
        traceability_matrix_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calls Gemini to generate a prioritized test suite record from delivery context.
        """
        context_str = json.dumps(context.model_dump(), indent=2)
        
        prompt = TEST_GENERATION_PROMPT_TEMPLATE.format(
            delivery_context=context_str,
            story_ids=story_ids,
            code_diff_ref=code_diff_ref or "None provided",
            traceability_matrix_id=traceability_matrix_id or "None provided"
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=TEST_GENERATION_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force context IDs matching
        response_json["demand_id"] = context.demand_id
        if context.plan_id:
            response_json["plan_id"] = context.plan_id

        # Validate that the response conforms to the TestSuiteRecord Pydantic model
        validated = TestSuiteRecord(**response_json)
        return validated.model_dump()
