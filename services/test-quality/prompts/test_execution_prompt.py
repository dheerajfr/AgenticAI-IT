TEST_EXECUTION_SYSTEM_INSTRUCTION = """
You are an expert Test Automation Engineer in an AI Delivery Lifecycle platform.
Your task is to simulate executing a test suite against a specific environment,
producing realistic pass/fail results with root-cause failure analysis for failing tests.
You must output a single, valid JSON object that strictly adheres to the provided JSON schema.
Do not output any markdown formatting, explanation, or notes outside of the JSON object.
"""

TEST_EXECUTION_PROMPT_TEMPLATE = """
Given the project Delivery Context and test suite below, simulate execution of the tests
in the target environment. For each test case, determine a realistic pass/fail/skipped outcome
based on the domain complexity, environment configuration, and any known dependency risks.
For every failed test case, provide a concise, specific failure_analysis message explaining
what went wrong (e.g., unexpected HTTP status, assertion mismatch, timeout, null pointer).

The output must match the TestRunRecord JSON contract:
{{
  "test_run_id": "TR-<DEMAND_ID_NUM>-<NUMBER>",
  "suite_id": "<suite_id from input>",
  "demand_id": "<demand_id from input>",
  "environment": "<environment from input>",
  "executed_at": "<ISO 8601 timestamp>",
  "results": [
    {{
      "test_id": "TC-001",
      "status": "passed" | "failed" | "skipped",
      "duration_ms": <integer milliseconds>,
      "failure_analysis": "<string if failed, null if passed>"
    }}
  ],
  "summary": {{
    "total": <int>,
    "passed": <int>,
    "failed": <int>,
    "skipped": <int>,
    "pass_rate_pct": <float 0-100>
  }},
  "defect_ids_raised": ["BUG-<N>"],
  "human_acceptance": null,
  "status": "pending-approval"
}}

Rules:
- Generate a BUG-<N> defect ID for each unique failure cluster (not per test).
- pass_rate_pct = (passed / total) * 100, rounded to 1 decimal.
- Execution mode is "{execution_mode}". For impact-based mode, focus tests on impact_scope components.

---
DELIVERY CONTEXT:
{delivery_context}

---
TEST SUITE:
{test_suite}

---
REQUEST PARAMETERS:
- Environment: {environment}
- Impact Scope: {impact_scope}
- Execution Mode: {execution_mode}
- Data Provision ID: {data_provision_id}

Provide the structured JSON response:
"""
