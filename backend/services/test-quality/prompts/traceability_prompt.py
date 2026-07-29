TRACEABILITY_SYSTEM_INSTRUCTION = """
You are an expert QA Traceability and Audit Engineer in an AI Delivery Lifecycle platform.
Your task is to build a live requirement-to-test-to-defect traceability matrix from
a test suite and its execution results. Each user story must be mapped to all test cases
that cover it, the defects raised against those tests, and a coverage verdict.
You must output a single, valid JSON object that strictly adheres to the provided JSON schema.
Do not output any markdown formatting, explanation, or notes outside of the JSON object.
"""

TRACEABILITY_PROMPT_TEMPLATE = """
Given the delivery context, test suite (containing story_id per test case),
test run results (pass/fail per test case), and raised defect IDs,
build a complete traceability matrix.

For each unique story_id found in the test suite:
- Collect all test_ids linked to that story.
- Determine which of those tests failed and map their defect IDs.
- Set coverage_status:
    "covered" = has at least one test
    "partial"  = has tests but some failed
    "uncovered"= no tests reference this story
- Set passing = true only if ALL linked tests passed.

List any story_ids from the demand context that have zero test coverage
in uncovered_stories.

Set audit_ready = true only if uncovered_stories is empty and coverage_gaps is empty.

The output must match the TraceabilityMatrixRecord JSON contract:
{{
  "traceability_id": "TRC-<DEMAND_ID_NUM>-1",
  "demand_id": "<demand_id from input>",
  "last_updated": "<ISO 8601 timestamp>",
  "entries": [
    {{
      "story_id": "US-101",
      "test_ids": ["TC-001", "TC-002"],
      "defect_ids": ["BUG-4421"],
      "coverage_status": "covered" | "partial" | "uncovered",
      "passing": false
    }}
  ],
  "uncovered_stories": [],
  "coverage_gaps": [],
  "audit_ready": true
}}

---
DELIVERY CONTEXT:
{delivery_context}

---
TEST SUITE:
{test_suite}

---
TEST RUN RESULTS:
{test_run}

---
REQUEST PARAMETERS:
- Demand ID: {demand_id}
- Defect IDs raised: {defect_ids}

Provide the structured JSON response:
"""
