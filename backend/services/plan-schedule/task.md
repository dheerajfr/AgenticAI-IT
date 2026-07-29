# Plan-Schedule Build Tasks

## Phase 1 — Project Scaffold
- [x] task.md (this file)
- [x] pyproject.toml
- [x] requirements.txt
- [x] .env.example

## Phase 2 — JSON Schemas
- [x] schemas/estimate_input.schema.json
- [x] schemas/team_config.schema.json
- [x] schemas/sprint_constraints.schema.json
- [x] schemas/plan_record.schema.json

## Phase 3 — Core Python Package
- [x] plan_schedule/__init__.py
- [x] plan_schedule/__main__.py
- [x] plan_schedule/models.py
- [x] plan_schedule/buffer.py
- [x] plan_schedule/wbs.py
- [x] plan_schedule/scheduler.py
- [x] plan_schedule/critical_path.py
- [x] plan_schedule/planner.py
- [x] plan_schedule/cli.py

## Phase 4 — Prompt Template
- [x] prompts/planning_prompt.md

## Phase 5 — Tests & Fixtures
- [x] tests/__init__.py
- [x] tests/fixtures/estimate_approved.json   (copy of estimate_1 — approved, high, data migration risk)
- [x] tests/fixtures/estimate_draft.json      (copy of estimate_2 — draft, gated)
- [x] tests/fixtures/estimate_approved_2.json (copy of estimate_3 — approved, high, clean)
- [x] tests/fixtures/estimate_rebaselined.json (re-baselined, low conf, 3 risks, WBS shift)
- [x] tests/fixtures/team_config.json
- [x] tests/fixtures/sprint_constraints.json
- [x] tests/test_buffer.py    (14 tests — all PASS)
- [x] tests/test_wbs.py       (14 tests — all PASS)
- [x] tests/test_scheduler.py (22 tests — all PASS)
- [x] tests/test_planner.py   (19 tests — all PASS)

## Phase 6 — Documentation
- [x] README.md

## Verification
- [x] 69/69 pytest tests pass
- [x] CLI end-to-end: PLN-0001-1.json + PLN-0003-1.json written to output/
- [x] EST-0002-1 (draft) correctly skipped with WARNING log
