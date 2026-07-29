# Stage 06 — Build & deploy

> **Pipeline position**: Consumes `EnvironmentStateRecord`s from **Stage 05 (Config & environments)**
> (drift detection, baseline reconcile) and drives releases through to a
> tracked, communicated cutover.

All 5 functions of this module are built.

| Function | Row | Status |
|---|---|---|
| Runbook drafting | 22 | built |
| Cutover comms | 21 | built |
| Release-readiness | 19 | built |
| Rollback readiness | 20 | built |
| Deployment orchestration | 18 | built |

---

## Architecture

```
config-environments/
└── config-env.db  ───────────────┐  read directly (drift/baseline state)
                                   ▼
build-deploy/
├── main.py                  ← FastAPI app (Stage 06), mounts all 5 functions' routers
├── models.py                ← Pydantic models for every function; shared `deployment_id` FK
├── database.py              ← generic JsonRecordTable helper + one table per function
│                                + read_environment_state() cross-service reader into Module 05
├── routers/
│   ├── runbooks.py                  ← Runbook drafting        — /api/deployments/runbooks/*
│   ├── cutover.py                   ← Cutover comms            — /api/deployments/cutover/*
│   ├── release_readiness.py         ← Release-readiness        — /api/deployments/release-readiness/*
│   ├── rollback_readiness.py        ← Rollback readiness       — /api/deployments/rollback-readiness/*
│   └── deployment_orchestration.py  ← Deployment orchestration — /api/deployments/orchestration/*
├── fixtures/
│   ├── runbooks/*.json
│   ├── cutover/*.json
│   ├── release-readiness/*.json
│   ├── rollback-readiness/*.json
│   └── deployments/*.json
└── build-deploy.db          ← written at runtime (SQLite)
```

**Why split into `routers/`:** each function owns exactly one file plus its
own table in `database.py` (via `JsonRecordTable`). Deployment orchestration
calls Release-readiness's and Rollback readiness's core logic as plain Python
function imports (`evaluate_readiness`, `validate_rollback`) rather than over
HTTP, since they all run in the same process — see
`routers/deployment_orchestration.py`.

---

## The golden path

1. **Runbook drafting** — `POST /runbooks/draft` (LLM-generated steps) →
   `POST /runbooks/{id}/submit-review` → `POST /runbooks/{id}/approve`
2. **Deployment orchestration** — `POST /orchestration/start` with the
   approved `runbook_id` → `POST /orchestration/{id}/check-preconditions`
   (aggregates Release-readiness + Rollback readiness) → `POST
   /orchestration/{id}/go-no-go` with `decision: "go"`
3. Step 2's `go` **automatically opens a Cutover comms session** (calls
   `cutover.start_cutover()` directly) and links its `cutover_id` back onto
   the deployment.
4. **Cutover comms** — advance steps, post stakeholder updates, then
   `POST /cutover/{id}/end` with `status: "completed"`.
5. Back in orchestration, `POST /orchestration/{id}/complete` marks the
   deployment `done` once its linked cutover session is `completed`.

## Data flow into this module

| Function | Reads | From |
|---|---|---|
| Runbook drafting | change summary, architecture notes, prior runbook (freeform input) | caller-supplied; no "change record" or "architecture doc" service exists elsewhere in this repo |
| Cutover comms | the approved `RunbookRecord` it's executing | `routers/runbooks.py`, same service |
| Release-readiness | drift/baseline state; runbook approval status | `services/config-environments/config-env.db` (Module 05) via `database.read_environment_state()`; `routers/runbooks.py` |
| Rollback readiness | runbook's `rollback-trigger` steps; drift status | `routers/runbooks.py`; `database.read_environment_state()` |
| Deployment orchestration | Release-readiness + Rollback readiness results; runbook approval | `routers/release_readiness.py`, `routers/rollback_readiness.py`, `routers/runbooks.py` — all same-process function calls |

Per the process table, Release-readiness (19) and Deployment orchestration
(18, via Release-readiness) are the functions that actually cross into
Module 05's Drift detection / Baseline reconcile.

## What this module hands back

Nothing flows from this module back into Modules 01–05 today (no code here
writes to their databases or exports). Internally: Runbook drafting →
Cutover comms and → Deployment orchestration → (on `go`) opens a new Cutover
comms session automatically.

---

## Quick Start

```bash
cd ../..   # repo root
uvicorn gateway:app --reload
```

Then hit:
- `GET /api/deployments` — module index
- `POST /api/deployments/runbooks/draft` → `.../{id}/approve`
- `POST /api/deployments/orchestration/start` → `.../{id}/check-preconditions` → `.../{id}/go-no-go`
- `GET /api/deployments/cutover/{id}` — watch the auto-opened bridge

Interactive docs: `http://127.0.0.1:8000/docs` (gateway mounts each service's
FastAPI app, so all 5 stages' routes show up together).
