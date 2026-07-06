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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS employees (
                    email  TEXT PRIMARY KEY,
                    name   TEXT,
                    skill  TEXT,
                    status TEXT
                )
                """
            )
            conn.commit()

            cursor.execute("SELECT COUNT(*) FROM employees")
            if cursor.fetchone()[0] == 0:
                self._seed_employees(conn)

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

    def _seed_employees(self, conn: sqlite3.Connection) -> None:
        import zipfile
        import xml.etree.ElementTree as ET
        path = r"C:\Users\2862049\Downloads\Employee_Data.xlsx"
        if not os.path.exists(path):
            print(f"[plan-schedule] Employee sheet not found at {path}, skipping database seeding.")
            return

        try:
            ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
            rows = {}
            with zipfile.ZipFile(path, 'r') as zip_ref:
                with zip_ref.open('xl/worksheets/sheet1.xml') as f:
                    tree = ET.parse(f)
                    root = tree.getroot()
                    for row in root.findall(f'.//{ns}row'):
                        r_idx = int(row.attrib['r'])
                        rows[r_idx] = {}
                        for c in row.findall(f'.//{ns}c'):
                            r_ref = c.attrib['r']
                            col_letter = ''.join([char for char in r_ref if char.isalpha()])
                            val = ""
                            is_elem = c.find(f'{ns}is')
                            if is_elem is not None:
                                t_elem = is_elem.find(f'{ns}t')
                                if t_elem is not None and t_elem.text is not None:
                                    val = t_elem.text
                            else:
                                v_elem = c.find(f'{ns}v')
                                if v_elem is not None and v_elem.text is not None:
                                    val = v_elem.text
                            rows[r_idx][col_letter] = val

            if not rows:
                return

            header_row = rows.get(1, {})
            headers = {col: str(val).strip() for col, val in header_row.items() if val}
            
            cursor = conn.cursor()
            count = 0
            for r_idx in sorted(rows.keys()):
                if r_idx == 1:
                    continue
                row_data = rows[r_idx]
                obj = {}
                for col, header in headers.items():
                    obj[header] = row_data.get(col, '')
                
                email = obj.get("Email", "").strip()
                name = obj.get("Name", "").strip()
                skill = obj.get("Skill", "").strip()
                status = obj.get("Status", "").strip()
                
                if email:
                    cursor.execute(
                        "INSERT OR IGNORE INTO employees (email, name, skill, status) VALUES (?, ?, ?, ?)",
                        (email, name, skill, status),
                    )
                    count += 1
            conn.commit()
            print(f"[plan-schedule] Seeded {count} employees into SQLite DB.")
        except Exception as exc:
            print(f"[plan-schedule] Error seeding employees: {exc}")

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

    def get_employees(self) -> List[dict]:
        """Return all employees from SQLite store."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT email, name, skill, status FROM employees")
            return [
                {"email": r[0], "name": r[1], "skill": r[2], "status": r[3]}
                for r in cursor.fetchall()
            ]

    def get_free_employees_by_role(self, role: str) -> List[str]:
        """Return list of emails of free employees with matching skill/role."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT email FROM employees WHERE status = 'free' AND LOWER(skill) LIKE ?",
                (f"%{role.lower()}%",),
            )
            return [r[0] for r in cursor.fetchall()]

    def update_employee_status(self, email: str, status: str) -> bool:
        """Update an employee's status in SQLite store."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE employees SET status = ? WHERE email = ?",
                (status, email),
            )
            conn.commit()
            return cursor.rowcount > 0

    def get_employees_by_skill_with_availability(self, skill: str) -> List[dict]:
        """Return all employees of a given skill with computed days_until_free.
        
        For free employees: days_until_free = 0.
        For working employees: scan all saved plan tasks to find the latest
        pending task end_date for that owner, then compute days from today.
        """
        import datetime
        today = datetime.date.today()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT email, name, skill, status FROM employees WHERE LOWER(skill) LIKE ?",
                (f"%{skill.lower()}%",),
            )
            employees = [
                {"email": r[0], "name": r[1], "skill": r[2], "status": r[3], "days_until_free": 0}
                for r in cursor.fetchall()
            ]

            if not employees:
                return employees

            # Build a map: owner_email -> latest pending task end_date from saved plans
            cursor.execute("SELECT data FROM plans")
            owner_to_latest: dict = {}
            for (raw,) in cursor.fetchall():
                try:
                    plan = json.loads(raw)
                    for task in plan.get("tasks", []):
                        owner = task.get("owner", "")
                        status = task.get("status", "pending")
                        end_date_str = task.get("end_date", "")
                        if owner and status != "completed" and end_date_str:
                            try:
                                end_date = datetime.date.fromisoformat(end_date_str)
                                if owner not in owner_to_latest or end_date > owner_to_latest[owner]:
                                    owner_to_latest[owner] = end_date
                            except ValueError:
                                pass
                except Exception:
                    pass

        for emp in employees:
            if emp["status"] == "free":
                emp["days_until_free"] = 0
            else:
                latest = owner_to_latest.get(emp["email"]) or owner_to_latest.get(emp["name"])
                if latest:
                    delta = (latest - today).days
                    emp["days_until_free"] = max(0, delta)
                else:
                    emp["days_until_free"] = None  # working but no task info found

        # Sort: free first, then by days_until_free ascending, then name
        employees.sort(key=lambda e: (
            0 if e["status"] == "free" else 1,
            e["days_until_free"] if e["days_until_free"] is not None else 9999,
            e["name"]
        ))
        return employees


# Global singleton — imported by main.py
db = PlanDatabase()
