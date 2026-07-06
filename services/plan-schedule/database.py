"""
database.py — SQLite persistence for Stage 03: Plan & Schedule.

Mirrors the pattern used by services/estimate-shape/database.py and
services/demand-intake/database.py so that PlanRecords survive gateway
restarts.

Schema: one table `plans(plan_id TEXT PK, demand_id TEXT, data TEXT)`
        where `data` is the full PlanRecord serialised as JSON (ISO dates).

Fixture seeding: on first start (empty table), load plan_*.json files from
the `fixtures/` directory alongside this file. Subsequent restarts read from
SQLite only — fixtures are NOT re-loaded once any plan exists.
"""

from __future__ import annotations

import json
import os
import sqlite3
from typing import List, Optional


class PlanDatabase:
    def __init__(self) -> None:
        self.db_path = os.path.join(os.path.dirname(__file__), "plan.db")
        self._init_db()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS plans (
                    plan_id   TEXT PRIMARY KEY,
                    demand_id TEXT,
                    data      TEXT
                )
                """
            )
            conn.commit()

            # Seed from fixtures only when the table is empty (Disabled as per user request)
            # cursor.execute("SELECT COUNT(*) FROM plans")
            # if cursor.fetchone()[0] == 0:
            #     self._load_fixtures(conn)
            pass

    def _load_fixtures(self, conn: sqlite3.Connection) -> None:
        fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        if not os.path.exists(fixtures_dir):
            print(f"[plan-schedule] Fixtures directory not found at: {fixtures_dir}")
            return

        cursor = conn.cursor()
        count = 0
        for filename in sorted(os.listdir(fixtures_dir)):
            if filename.startswith("plan_") and filename.endswith(".json"):
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, encoding="utf-8") as fh:
                        data = json.load(fh)
                    cursor.execute(
                        "INSERT INTO plans (plan_id, demand_id, data) VALUES (?, ?, ?)",
                        (data["plan_id"], data["demand_id"], json.dumps(data)),
                    )
                    count += 1
                except Exception as exc:
                    print(f"[plan-schedule] Error loading fixture {filename}: {exc}")
        conn.commit()
        print(f"[plan-schedule] Initialised SQLite DB with {count} plans from fixtures.")

    # ------------------------------------------------------------------
    # Public API (mirrors estimate-shape/database.py naming)
    # ------------------------------------------------------------------

    def get_all(self) -> List[dict]:
        """Return all PlanRecords as dicts (ISO date strings)."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans")
            return [json.loads(row[0]) for row in cursor.fetchall()]

    def get_by_id(self, plan_id: str) -> Optional[dict]:
        """Return a single PlanRecord dict or None."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def save(self, plan_dict: dict) -> None:
        """Upsert a PlanRecord dict (keyed by plan_id)."""
        plan_dict.setdefault("status", "draft")
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO plans (plan_id, demand_id, data)
                VALUES (?, ?, ?)
                ON CONFLICT(plan_id) DO UPDATE SET
                    data = excluded.data,
                    demand_id = excluded.demand_id
                """,
                (plan_dict["plan_id"], plan_dict["demand_id"], json.dumps(plan_dict)),
            )
            conn.commit()

    def delete(self, plan_id: str) -> bool:
        """Delete a plan by plan_id. Returns True if a row was removed."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM plans WHERE plan_id = ?", (plan_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
            return deleted


# Global singleton — imported by main.py
db = PlanDatabase()
