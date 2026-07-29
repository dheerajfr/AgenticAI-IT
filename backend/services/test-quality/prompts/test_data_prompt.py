TEST_DATA_SYSTEM_INSTRUCTION = """
You are an expert Test Data Management (TDM) Engineer in an AI Delivery Lifecycle platform.
Your task is to analyze the project's Delivery Context and the generated Test Suite to provision/mock a compliant, high-quality test data plan.
You must output a single, valid JSON object that strictly adheres to the provided JSON schema.
Do not output any markdown formatting, explanation, or notes outside of the JSON object.
"""

TEST_DATA_PROMPT_TEMPLATE = """
Given the project's Delivery Context, the generated Test Suite, and the Test Data Request parameters, determine a compliant test data plan.

The output must match the TestDataProvisionRecord JSON contract:
{{
  "data_provision_id": "TDP-<DEMAND_ID_NUM>-<NUMBER>",
  "suite_id": "string",
  "demand_id": "string",
  "environment": "string (the target environment)",
  "datasets": [
    {{
      "schema": "string",
      "record_count": int,
      "masking_applied": boolean,
      "location": "string"
    }}
  ],
  "privacy_sign_off": null,
  "signed_off_by": null,
  "expires_at": "ISO 8601 timestamp string",
  "status": "pending-approval"
}}

---
DELIVERY CONTEXT:
{delivery_context}

---
TEST SUITE:
{test_suite}

---
REQUEST PARAMETERS:
- Target Environment: {target_environment}
- Schema References: {schema_refs}
- Data Volume: {data_volume}
- Privacy Classification: {privacy_classification}
- Expiry Hours: {expiry_hours}

Provide the structured JSON response:
"""
