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
from prompts.test_data_prompt import (
    TEST_DATA_SYSTEM_INSTRUCTION,
    TEST_DATA_PROMPT_TEMPLATE
)
from models import DeliveryContext, TestSuiteRecord, TestDataProvisionRecord

class TestDataAgent:
    def provision_data(
        self,
        context: DeliveryContext,
        suite_data: Dict[str, Any],
        target_environment: str,
        schema_refs: List[str],
        data_volume: int,
        privacy_classification: str,
        expiry_hours: int
    ) -> Dict[str, Any]:
        """
        Calls Gemini to determine a compliant test data plan from delivery context and test suite.
        """
        context_str = json.dumps(context.model_dump(), indent=2)
        suite_str = json.dumps(suite_data, indent=2)

        prompt = TEST_DATA_PROMPT_TEMPLATE.format(
            delivery_context=context_str,
            test_suite=suite_str,
            target_environment=target_environment,
            schema_refs=schema_refs,
            data_volume=data_volume,
            privacy_classification=privacy_classification,
            expiry_hours=expiry_hours
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=TEST_DATA_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force context IDs matching
        response_json["demand_id"] = context.demand_id
        response_json["suite_id"] = suite_data["suite_id"]

        # Validate that the response conforms to the TestDataProvisionRecord Pydantic model
        validated = TestDataProvisionRecord(**response_json)
        return validated.model_dump(by_alias=True)
