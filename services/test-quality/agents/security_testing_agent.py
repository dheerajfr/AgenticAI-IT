import sys
import os
import json
from typing import Dict, Any, List, Optional

# Ensure local test-quality directory is at the front of sys.path to avoid import pollution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from llm_client import call_gemini
from prompts.security_testing_prompt import (
    SECURITY_TESTING_SYSTEM_INSTRUCTION,
    SECURITY_TESTING_PROMPT_TEMPLATE
)
from models import DeliveryContext, SecurityTestRecord

class SecurityTestingAgent:
    def execute_security_scan(
        self,
        context: DeliveryContext,
        component_ids: List[str],
        pipeline_run_id: str,
        scan_types: List[str],
        vulnerability_db_version: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calls Gemini to perform app sec analysis and draft fixes.
        """
        context_str = json.dumps(context.model_dump(), indent=2)

        prompt = SECURITY_TESTING_PROMPT_TEMPLATE.format(
            delivery_context=context_str,
            component_ids=component_ids,
            pipeline_run_id=pipeline_run_id,
            scan_types=scan_types,
            vulnerability_db_version=vulnerability_db_version or "Latest"
        )

        response_json = call_gemini(
            prompt=prompt,
            system_instruction=SECURITY_TESTING_SYSTEM_INSTRUCTION,
            is_json=True
        )

        # Force context IDs matching
        response_json["demand_id"] = context.demand_id
        if context.plan_id:
            response_json["plan_id"] = context.plan_id

        # Validate that the response conforms to the SecurityTestRecord Pydantic model
        validated = SecurityTestRecord(**response_json)
        return validated.model_dump()
