"""
release_change_test.py
======================
Interactive end-to-end test runner for the Release & Change service.

- Pulls REAL demand/plan/estimate IDs from the shared source.db
- Falls back to generated dummy IDs when no real data exists
- Runs all 5 workflow tasks in sequence: draft -> risk_score -> cab_prep -> collision -> audit
- Prints human-readable results at every step

Usage (from workspace root):
    python services/release-change/release_change_test.py
Or interactively choose which task to test.
"""

import sys
import os
import json
import sqlite3
import datetime

# Path setup
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SVC  = os.path.abspath(os.path.dirname(__file__))

sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "services"))
sys.path.insert(0, SVC)

# Shared DB helpers
DB_PATH = os.path.join(ROOT, "services", "source.db")

def query_db(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    try:
        c = conn.cursor()
        c.execute(sql, params)
        return c.fetchall()
    finally:
        conn.close()

# Pull real IDs from the DB
def get_real_ids():
    rows = query_db(
        "SELECT p.plan_id, p.demand_id, p.data FROM plans p "
        "JOIN demands d ON d.demand_id = p.demand_id LIMIT 5"
    )

    if rows:
        plan_id, demand_id, plan_data = rows[0]
        plan_info = json.loads(plan_data) if plan_data else {}
        end_date   = plan_info.get("end_date", "2026-08-01")
    else:
        demand_id = "DEM-2026-DUMMY"
        plan_id   = "PLN-DUMMY-1"
        end_date  = "2026-08-01"

    est_rows = query_db(
        "SELECT estimate_id FROM estimates WHERE demand_id = ? LIMIT 1", (demand_id,)
    )
    estimate_id = est_rows[0][0] if est_rows else "EST-DUMMY-1"

    suffix = demand_id.split("-")[-1]

    chg_rows = query_db(
        "SELECT change_record_id FROM change_records WHERE demand_id = ? LIMIT 1", (demand_id,)
    )
    change_record_id = chg_rows[0][0] if chg_rows else f"CHG-{suffix}-1"

    rsk_rows = query_db(
        "SELECT risk_score_id FROM change_risk_scores WHERE demand_id = ? LIMIT 1", (demand_id,)
    )
    risk_score_id = rsk_rows[0][0] if rsk_rows else f"RSK-{suffix}-1"

    return {
        "demand_id":         demand_id,
        "plan_id":           plan_id,
        "estimate_id":       estimate_id,
        "end_date":          end_date,
        "suffix":            suffix,
        "change_record_id":  change_record_id,
        "risk_score_id":     risk_score_id,
    }


def pp(label, data):
    print("\n" + "="*60)
    print(f"  {label}")
    print("="*60)
    print(json.dumps(data, indent=2, default=str))
    print()


print("[*] Importing release_change_graph ...")
from orchestration.release_change_graph import release_change_graph
print("[OK] Graph compiled\n")

ids = get_real_ids()
print("[*] Using IDs from source.db:")
for k, v in ids.items():
    print(f"    {k:25s} = {v}")
print()

suffix = ids["suffix"]

TASK_DRAFT = {
    "task":               "draft",
    "demand_id":          ids["demand_id"],
    "plan_id":            ids["plan_id"],
    "estimate_id":        ids["estimate_id"],
    "readiness_id":       f"RDY-{suffix}-1",
    "gate_id":            f"QGT-{suffix}-1",
    "test_run_id":        f"TR-{suffix}-1",
    "runbook_id":         f"RBK-{suffix}-1",
    "rollback_id":        f"RBK-ROLLBACK-{suffix}-1",
    "itsm_schema_version": "v2",
}

TASK_RISK = {
    "task":                          "risk_score",
    "demand_id":                     ids["demand_id"],
    "change_record_id":              ids["change_record_id"],
    "component_ids":                 ["api-gateway", "auth-service", "db-postgres"],
    "change_calendar_ref":           "CAL-2026-Q3",
    "historical_change_outcomes_ref": "HIST-2026-REF",
}

TASK_CAB = {
    "task":           "cab_prep",
    "risk_score_id":  ids["risk_score_id"],
    "cab_policy_ref": "CAB-POLICY-STANDARD-V3",
    "prior_qa_ref":   "QA-REPORT-DUMMY-1",
}

TASK_COLLISION = {
    "task":                "collision",
    "demand_id":           ids["demand_id"],
    "change_record_id":    ids["change_record_id"],
    "component_ids":       ["api-gateway", "auth-service", "db-postgres"],
    "scheduled_start":     f"{ids['end_date']}T22:00:00Z",
    "scheduled_end":       f"{ids['end_date']}T23:59:59Z",
    "change_calendar_ref": "CAL-2026-Q3",
    "freeze_rules_ref":    "FREEZE-RULES-PROD-2026",
}

TASK_AUDIT = {
    "task":             "audit",
    "demand_id":        ids["demand_id"],
    "change_record_id": ids["change_record_id"],
    "event_sources":    ["demand-intake", "estimate-shape", "plan-schedule", "release-change"],
}

ALL_TASKS = {
    "1": ("Draft Change Record",  TASK_DRAFT),
    "2": ("Risk Score",           TASK_RISK),
    "3": ("CAB Prep",             TASK_CAB),
    "4": ("Collision Detection",  TASK_COLLISION),
    "5": ("Audit Trail",          TASK_AUDIT),
    "6": ("Run ALL in sequence",  None),
}


def run_task(name, payload):
    print(f"\n[-] Invoking graph  task: {payload['task']}")
    print(f"    Input payload:")
    print(json.dumps(payload, indent=4))
    try:
        result = release_change_graph.invoke(payload)
        for key in ("change_record", "risk_score_record", "cab_pack_record",
                    "collision_record", "audit_trail_record", "error"):
            if result.get(key):
                pp(f"[OK] {name}  ->  {key}", result[key])
                return result[key]
        pp(f"[!] Raw result for {name}", result)
    except Exception as e:
        print(f"\n[ERR] ERROR running {name}: {e}")
        raise


def main():
    print("\n" + "="*60)
    print("  Release & Change - Graph Test Runner")
    print("="*60)
    print("  Choose a task to test:\n")
    for k, (label, _) in ALL_TASKS.items():
        print(f"    [{k}] {label}")
    print()

    choice = input("  Enter choice (default = 6 for ALL): ").strip() or "6"
    print()

    if choice == "6":
        print("[*] Running all tasks in sequence ...\n")

        cr = run_task("Draft Change Record", TASK_DRAFT)
        if cr:
            real_chg_id = cr.get("change_record_id", ids["change_record_id"])
            TASK_RISK["change_record_id"]      = real_chg_id
            TASK_COLLISION["change_record_id"] = real_chg_id
            TASK_AUDIT["change_record_id"]     = real_chg_id

        rs = run_task("Risk Score", TASK_RISK)
        if rs:
            real_rsk_id = rs.get("risk_score_id", ids["risk_score_id"])
            TASK_CAB["risk_score_id"] = real_rsk_id

        run_task("CAB Prep", TASK_CAB)
        run_task("Collision Detection", TASK_COLLISION)
        run_task("Audit Trail", TASK_AUDIT)

        print("\n[OK] All 5 tasks completed.\n")

    elif choice in ALL_TASKS:
        name, payload = ALL_TASKS[choice]
        run_task(name, payload)
    else:
        print(f"[!] Unknown choice: {choice}")


if __name__ == "__main__":
    main()
