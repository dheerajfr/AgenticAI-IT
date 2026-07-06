# Stage 03 — Plan & Schedule

> **Pipeline position**: Receives approved `EstimateRecord`s from **Stage 02 (Estimate & Shape)**  
> and produces committed, resourced, dated **`PlanRecord`** artifacts for downstream tracking  
> (Azure DevOps, Planview-style systems, etc.).

---

## Architecture

```
estimate-shape/
└── fixtures/
    ├── estimate_1.json  ─────┐
    ├── estimate_2.json  ─────┤  read-only upstream inputs
    └── estimate_3.json  ─────┘
                              │
                              ▼
plan-schedule/
├── plan_schedule/
│   ├── models.py          ← Pydantic v2 input/output models
│   ├── buffer.py          ← confidence & risk buffer math
│   ├── wbs.py             ← WBS phase-split (15/50/25/10 default)
│   ├── scheduler.py       ← working-day scheduler + round-robin owners
│   ├── critical_path.py   ← single-plan + multi-plan CP computation
│   ├── planner.py         ← orchestrator (status gate → buffer → wbs → schedule)
│   └── cli.py             ← python -m plan_schedule entry point
├── schemas/               ← JSON Schema (draft-07) for all inputs + output
├── prompts/               ← LLM co-pilot prompt template
├── tests/                 ← pytest unit + integration tests
│   └── fixtures/          ← test data (copied from upstream, never written back)
├── fixtures/              ← sample PlanRecord output examples
├── output/                ← written at runtime (git-ignored)
├── pyproject.toml
└── requirements.txt
```

---

## Planning Rules (summary)

| Rule | Detail |
|------|--------|
| **Status gate** | Only `approved` or `re-baselined` estimates are scheduled. `draft` / `challenged` → logged + skipped |
| **Effort → hours** | `total_hours = effort_days × hours_per_day_per_person` |
| **Confidence buffer** | `low` +20%, `medium` +10%, `high` +0% |
| **Extra risk buffer** | +10% if `risk_factors ≥ 3` OR `status == re-baselined` |
| **WBS default split** | Design 15% / Build 50% / Test 25% / Deploy 10% |
| **WBS keyword shift** | If risk mentions *integration / security / compliance / data migration* → Build −5%, Test +5% |
| **Scheduling** | Sequential phases; dates push forward before breaching capacity ceiling |
| **Utilization cap** | `max_daily_utilization_percentage` respected on every role, every day |
| **Owner assignment** | Round-robin across named members within each role; balanced across multi-plan batches |
| **Critical path** | Single plan → all tasks critical. Multi-plan → longest-path DAG across cross-plan deps |

---

## Quick Start

### 1. Install

```bash
cd plan-schedule
pip install -e ".[dev]"
```

### 2. Run against the real upstream estimates

```bash
python -m plan_schedule \
  --estimates ../estimate-shape/fixtures/estimate_1.json \
              ../estimate-shape/fixtures/estimate_3.json \
  --team      tests/fixtures/team_config.json \
  --constraints tests/fixtures/sprint_constraints.json \
  --output    output/
```

Expected output (in `output/`):
- `PLN-0001-1.json` — plan for DEM-2026-0001 (EST-0001-1, approved, 120 days)
- `PLN-0003-1.json` — plan for DEM-2026-0003 (EST-0003-1, approved, 18 days)

`estimate_2.json` (draft) is skipped with a `WARNING` log line.

### 3. Run tests

```bash
pytest tests/ -v
```

Expected: **all tests pass** ✅

---

## Input Files

### EstimateRecord (`schemas/estimate_input.schema.json`)

```json
{
  "estimate_id": "EST-0001-1",
  "demand_id": "DEM-2026-0001",
  "effort_days": 120,
  "confidence": "high",
  "risk_factors": ["AWS database instance setup complexity", "Data migration script validation time"],
  "status": "approved",
  ...
}
```

### TeamConfig (`schemas/team_config.schema.json`)

```json
{
  "team_size": 6,
  "roles": [
    { "role": "backend", "count": 2, "hours_per_day_per_person": 8, "members": ["m.rodriguez", "d.chen"] },
    { "role": "qa",      "count": 2, "hours_per_day_per_person": 8, "members": ["alice.smith", "bob.jones"] },
    { "role": "devops",  "count": 1, "hours_per_day_per_person": 8, "members": ["clara.davis"] },
    { "role": "frontend","count": 1, "hours_per_day_per_person": 8, "members": ["f.nguyen"] }
  ]
}
```

### SprintConstraints (`schemas/sprint_constraints.schema.json`)

```json
{
  "planning_start_date": "2026-07-07",
  "working_days_per_week": 5,
  "max_daily_utilization_percentage": 85
}
```

---

## Output — `PlanRecord` (`schemas/plan_record.schema.json`)

```json
{
  "plan_id": "PLN-0001-1",
  "demand_id": "DEM-2026-0001",
  "end_date": "YYYY-MM-DD",
  "critical_path_task_ids": ["PLN-0001-DESIGN", "PLN-0001-BUILD", "PLN-0001-TEST", "PLN-0001-DEPLOY"],
  "tasks": [
    {
      "task_id": "PLN-0001-DESIGN",
      "name": "Design & Setup",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "owner": "m.rodriguez",
      "predecessor_task_ids": []
    }
  ]
}
```

> **No additional properties** beyond this schema may appear in emitted `PlanRecord` JSON.
> Buffer math, utilization checks, and WBS fractions live in logs / debug only.

---

## CLI Reference

```
usage: plan-schedule [--estimates FILE [FILE ...]] [--team FILE]
                     [--constraints FILE] [--deps FILE] [--output DIR]
                     [--log-level LEVEL]

Options:
  --estimates   One or more EstimateRecord JSON files (required)
  --team        TeamConfig JSON file (required)
  --constraints SprintConstraints JSON file (required)
  --deps        Cross-plan dependency mapping JSON (optional)
  --output      Output directory [default: output/  or $OUTPUT_DIR]
  --log-level   DEBUG | INFO | WARNING | ERROR [default: INFO or $LOG_LEVEL]
```

**Exit codes**: `0` = success, `1` = no plans produced, `2` = parse/config error.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OUTPUT_DIR` | `output` | Where PlanRecord JSON files are written |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

Copy `.env.example` to `.env` to override locally.

---

## Integration Notes (for pipeline owners)

The following **root-level** wiring is needed to integrate this module into
the broader pipeline — these changes are **outside `plan-schedule/`** and
must be made by the pipeline owner:

1. **Root orchestrator** — add `plan-schedule` as a step after `estimate-shape`,
   passing approved `EstimateRecord` output files to `--estimates`.
2. **CI/CD** — add `cd plan-schedule && pip install -e ".[dev]" && pytest` to
   the test stage.
3. **Output routing** — wire `plan-schedule/output/*.json` into downstream
   stages (e.g., `dependencies/`, `azure-devops-sync/`).
