import sys
import os
import json
from typing import Dict, Any, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from llm_client import call_gemini
from prompts.test_execution_prompt import (
    TEST_EXECUTION_SYSTEM_INSTRUCTION,
    TEST_EXECUTION_PROMPT_TEMPLATE
)
from models import DeliveryContext, TestRunRecord


class TestExecutionAgent:
    def execute(
        self,
        context: DeliveryContext,
        suite_data: Dict[str, Any],
        data_provision_id: Optional[str],
        environment: str,
        impact_scope: List[str],
        execution_mode: str
    ) -> Dict[str, Any]:
        """
        Calls Gemini to simulate test execution, producing pass/fail results per test case.
        """
        context_str = json.dumps(context.model_dump(), indent=2)
        suite_str = json.dumps(suite_data, indent=2)

        prompt = TEST_EXECUTION_PROMPT_TEMPLATE.format(
            delivery_context=context_str,
            test_suite=suite_str,
            environment=environment,
            impact_scope=impact_scope or [],
            execution_mode=execution_mode or "impact-based",
            data_provision_id=data_provision_id or "None provided"
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=TEST_EXECUTION_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force context IDs from source
        response_json["demand_id"] = context.demand_id
        response_json["suite_id"] = suite_data["suite_id"]

        # Validate against Pydantic contract
        validated = TestRunRecord(**response_json)
        return validated.model_dump()
