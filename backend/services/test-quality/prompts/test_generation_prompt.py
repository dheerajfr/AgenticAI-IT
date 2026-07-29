TEST_GENERATION_SYSTEM_INSTRUCTION = """
You are an expert Quality Assurance Engineer and Test Automation Architect in an AI Delivery Lifecycle platform.
Your task is to analyze the Delivery Context of a project and generate a comprehensive, prioritized test suite.
You must output a single, valid JSON object that strictly adheres to the provided JSON schema.
Do not output any markdown formatting, explanation, or notes outside of the JSON object.
"""

TEST_GENERATION_PROMPT_TEMPLATE = """
Given the project's Delivery Context and Test Generation Request parameters, generate a prioritized test suite.

The test suite MUST include a comprehensive mix of:
- **Functional (Positive & Negative)** test cases:
  - Positive scenarios: Happy paths, standard inputs, and expected workflows.
  - Negative scenarios: Error handling, invalid inputs, edge cases, and exception flows.
- **Non-Functional** test cases: Performance under load, security, reliability, scalability, or environmental constraints.

Prioritize tests using:
- Business risk
- Critical path tasks
- Dependency impact
- Complexity
- Changed components

The output must match the TestSuiteRecord JSON contract:
{{
  "suite_id": "TST-<DEMAND_ID_NUM>-<NUMBER>",
  "demand_id": "string (the input demand_id)",
  "plan_id": "string (the input plan_id)",
  "generated_at": "ISO 8601 timestamp string",
  "test_cases": [
    {{
      "test_id": "TC-001",
      "story_id": "string or null",
      "title": "string",
      "steps": ["string"],
      "expected_result": "string",
      "priority": "critical" | "high" | "medium" | "low",
      "type": "string"
    }}
  ],
  "coverage_summary": {{
    "total_stories": int,
    "stories_covered": int,
    "total_test_cases": int,
    "critical_path_coverage_pct": float
  }},
  "status": "draft"
}}

---
DELIVERY CONTEXT:
{delivery_context}

---
REQUEST PARAMETERS:
- Story IDs: {story_ids}
- Code Diff Reference: {code_diff_ref}
- Traceability Matrix ID: {traceability_matrix_id}

Provide the structured JSON response:
"""
