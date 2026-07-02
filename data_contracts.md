# Data contracts — first 5 modules

Purpose: let all 5 people build in parallel. Each person builds against these shapes using stub data from day one, then swaps to the real upstream feed as soon as it's live. Nobody outside the owning stage should be able to make a breaking change to a contract without a version bump and a heads-up to downstream owners.

**Versioning rule:** every contract starts at `v1`. Adding an optional field is safe. Removing a field, renaming a field, or changing a field's type is a breaking change — bump to `v2` and give downstream owners at least one sprint's notice before switching.

---

## 1. Demand record
**Produced by:** Person 1 — 01 Demand & intake
**Consumed by:** Person 2 (Estimate & shape), and later by Person 3 for context

| Field | Type | Required | Notes |
|---|---|---|---|
| `demand_id` | string | yes | Stable unique ID, never reused |
| `title` | string | yes | Short human-readable name |
| `description` | string | yes | Full request text, structured from intake |
| `type` | enum | yes | `project`, `enhancement`, `defect-fix`, `compliance` |
| `domain` | string | yes | Owning business/technical domain |
| `risk_level` | enum | yes | `low`, `medium`, `high` |
| `funding_status` | enum | yes | `unfunded`, `pending`, `approved` |
| `submitted_by` | string | yes | Requestor identity |
| `submitted_date` | date (ISO 8601) | yes | |
| `duplicate_of` | string, nullable | no | `demand_id` if flagged as duplicate |
| `business_case_summary` | string | no | Populated once business-case draft runs |
| `status` | enum | yes | `intake`, `classified`, `capacity-checked`, `approved`, `rejected` |

```json
{
  "demand_id": "DEM-2026-0142",
  "title": "Mobile app refresh",
  "description": "Refresh the customer mobile app UI and update the payments SDK.",
  "type": "enhancement",
  "domain": "Customer digital",
  "risk_level": "medium",
  "funding_status": "pending",
  "submitted_by": "j.alvarez",
  "submitted_date": "2026-06-15",
  "duplicate_of": null,
  "business_case_summary": null,
  "status": "classified"
}
```

---

## 2. Estimate record
**Produced by:** Person 2 — 02 Estimate & shape
**Consumed by:** Person 3 (Plan & schedule)

| Field | Type | Required | Notes |
|---|---|---|---|
| `estimate_id` | string | yes | |
| `demand_id` | string | yes | Foreign key to demand record |
| `effort_days` | number | yes | Point estimate |
| `effort_range_low` / `effort_range_high` | number | yes | Confidence range |
| `cost_estimate` | number | yes | In local currency, whole units |
| `duration_weeks` | number | yes | |
| `confidence` | enum | yes | `low`, `medium`, `high` |
| `methodology` | string | yes | e.g. `comparable-history`, `expert-judgement` |
| `risk_factors` | array of string | no | From "Challenge the estimate" |
| `status` | enum | yes | `draft`, `challenged`, `approved`, `re-baselined` |

```json
{
  "estimate_id": "EST-0142-1",
  "demand_id": "DEM-2026-0142",
  "effort_days": 85,
  "effort_range_low": 70,
  "effort_range_high": 105,
  "cost_estimate": 145000,
  "duration_weeks": 10,
  "confidence": "medium",
  "methodology": "comparable-history",
  "risk_factors": ["Vendor SDK dependency unconfirmed"],
  "status": "approved"
}
```

---

## 3. Plan record
**Produced by:** Person 3 — 03 Plan & schedule
**Consumed by:** Person 4 (Dependencies)

| Field | Type | Required | Notes |
|---|---|---|---|
| `plan_id` | string | yes | |
| `demand_id` | string | yes | Foreign key to demand record |
| `tasks` | array of object | yes | See task shape below |
| `critical_path_task_ids` | array of string | yes | Subset of task IDs on the critical path |
| `end_date` | date | yes | Plan's current committed end date |

**Task shape** (each entry in `tasks`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `task_id` | string | yes | |
| `name` | string | yes | |
| `start_date` / `end_date` | date | yes | |
| `owner` | string | yes | |
| `predecessor_task_ids` | array of string | no | Empty array if none |

```json
{
  "plan_id": "PLN-0142-1",
  "demand_id": "DEM-2026-0142",
  "end_date": "2026-09-04",
  "critical_path_task_ids": ["T-3", "T-7"],
  "tasks": [
    { "task_id": "T-1", "name": "Design review", "start_date": "2026-06-29", "end_date": "2026-07-10", "owner": "m.rodriguez", "predecessor_task_ids": [] },
    { "task_id": "T-3", "name": "Payments SDK integration", "start_date": "2026-07-13", "end_date": "2026-08-07", "owner": "d.chen", "predecessor_task_ids": ["T-1"] }
  ]
}
```

---

## 4. Dependency edge
**Produced by:** Person 4 — 04 Dependencies
**Consumed by:** Person 3 (feeds back into re-planning), and used cross-programme

| Field | Type | Required | Notes |
|---|---|---|---|
| `dependency_id` | string | yes | |
| `source_task_id` | string | yes | References a `task_id` from a plan record |
| `target_task_id` | string | yes | The task it depends on (may be in another plan) |
| `type` | enum | yes | `technical`, `resource`, `data`, `external-vendor` |
| `status` | enum | yes | `open`, `at-risk`, `resolved` |
| `owner` | string | yes | Person accountable for resolving it |

```json
{
  "dependency_id": "DEP-0091",
  "source_task_id": "T-3",
  "target_task_id": "T-9",
  "type": "external-vendor",
  "status": "at-risk",
  "owner": "d.chen"
}
```

---

## 5. Environment state record
**Produced by:** Person 5 — 05 Config & environments
**Consumed by:** downstream build/deploy stage (out of scope for the first 5 modules, but keep the shape stable since stage 6 will need it)

| Field | Type | Required | Notes |
|---|---|---|---|
| `component_id` | string | yes | |
| `environment` | enum | yes | `dev`, `test`, `staging`, `prod` |
| `deployed_version` | string | yes | What's actually running |
| `expected_version` | string | yes | What the release baseline says should be running |
| `drift_status` | enum | yes | `in-sync`, `drifted` |
| `last_checked` | datetime (ISO 8601) | yes | |

```json
{
  "component_id": "svc-payments-api",
  "environment": "staging",
  "deployed_version": "2.4.1",
  "expected_version": "2.4.2",
  "drift_status": "drifted",
  "last_checked": "2026-07-01T14:32:00Z"
}
```

---

## Using these before the real feed exists

Each owner should create 3–5 hardcoded sample records matching their contract (like the examples above) and share them with the downstream owner in week 1. Downstream builds against those samples. When the real capability goes live, the downstream owner points at the real feed instead — no code change needed if the shape matches exactly.
