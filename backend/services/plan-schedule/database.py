"""
database.py — SQLite persistence for Stage 03: Plan & Schedule.

Mirrors the pattern used by services/estimate-shape/database.py and
services/demand-intake/database.py so that PlanRecords survive gateway
restarts.

# Resource/employee data is read and written directly from the shared
# source.db (resources table) — no local copy is kept.
# source.db also contains: plans, plan_history.
"""

from __future__ import annotations

import json
import os
import sqlite3
import datetime
from typing import List, Optional


class PlanDatabase:
    def __init__(self) -> None:
        import sys
        import os
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        from shared_db.connection import get_db_path
        self.db_path = get_db_path()
        self._init_db()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_resource_db_path(self) -> str:
        from shared_db.connection import get_db_path
        return get_db_path()

    def _resource_conn(self) -> sqlite3.Connection:
        """Return an open connection to the shared DB."""
        from shared_db.connection import get_db
        return get_db()

    def _plan_conn(self) -> sqlite3.Connection:
        """Return an open connection to the shared DB."""
        from shared_db.connection import get_db
        return get_db()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------


    def _init_db(self) -> None:
        with self._plan_conn() as conn:
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
                CREATE TABLE IF NOT EXISTS task_employee_assignments (
                    plan_id         TEXT,
                    task_id         TEXT,
                    employee_email  TEXT,
                    PRIMARY KEY (plan_id, task_id, employee_email)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS plan_history (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    plan_id     TEXT,
                    demand_id   TEXT,
                    version     INTEGER,
                    reason      TEXT,
                    data        TEXT,
                    timestamp   TEXT
                )
                """
            )
            conn.commit()

        # Reset allocations to Available, then immediately re-derive correct
        # statuses from active plans — so allocated employees stay Allocated
        # across service restarts instead of being wiped to Available.
        self._reset_all_allocations()
        self.sync_employee_allocations()

    def _reset_all_allocations(self) -> None:
        """Reset every resource to unallocated/Available in source.db.

        This is a clean-slate step — must always be followed by
        sync_employee_allocations() to restore correct statuses from active
        plans.  Leave date fields are preserved so on-leave windows survive
        service restarts.
        """
        db_path = self._get_resource_db_path()
        if not os.path.exists(db_path):
            return
        with self._resource_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE resources
                SET allocated             = 0,
                    status                = 'Available',
                    current_project       = NULL,
                    current_task          = NULL,
                    project_start_date    = NULL,
                    project_end_date      = NULL,
                    allocation_percentage = 0.0
                """
            )
            conn.commit()

    # ------------------------------------------------------------------
    # Public API (mirrors estimate-shape/database.py naming)
    # ------------------------------------------------------------------

    def get_all(self) -> List[dict]:
        """Return all PlanRecords as dicts."""
        with self._plan_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans")
            return [json.loads(row[0]) for row in cursor.fetchall()]

    def get_by_id(self, plan_id: str) -> Optional[dict]:
        """Return a single PlanRecord dict or None."""
        with self._plan_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def save(self, plan_dict: dict) -> None:
        """Upsert a PlanRecord dict (keyed by plan_id)."""
        plan_dict.setdefault("status", "draft")
        with self._plan_conn() as conn:
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
            
            # Sync many-to-many task employee assignments
            cursor.execute("DELETE FROM task_employee_assignments WHERE plan_id = ?", (plan_dict["plan_id"],))
            for task in plan_dict.get("tasks", []):
                task_id = task.get("task_id")
                owner_str = task.get("owner", "")
                if owner_str and owner_str != "unassigned":
                    owners = [o.strip() for o in owner_str.split(",") if o.strip()]
                    for owner in owners:
                        cursor.execute(
                            """
                            INSERT OR REPLACE INTO task_employee_assignments (plan_id, task_id, employee_email)
                            VALUES (?, ?, ?)
                            """,
                            (plan_dict["plan_id"], task_id, owner),
                        )
            conn.commit()
        self.sync_employee_allocations()

    def delete(self, plan_id: str) -> bool:
        """Delete a plan by plan_id. Returns True if a row was removed."""
        with self._plan_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM plans WHERE plan_id = ?", (plan_id,))
            deleted = cursor.rowcount > 0
            cursor.execute("DELETE FROM task_employee_assignments WHERE plan_id = ?", (plan_id,))
            conn.commit()
        if deleted:
            self.sync_employee_allocations()
        return deleted

    def _read_resources(self) -> List[dict]:
        """Read all rows from the resources table in source.db and return as list of dicts."""
        db_path = self._get_resource_db_path()
        if not os.path.exists(db_path):
            return []
        with self._resource_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT employee_id, employee_name, email, role, skill, skills,
                       experience, department, status, allocated,
                       current_project, current_task,
                       project_start_date, project_end_date,
                       allocation_percentage,
                       leave_start_date, leave_end_date
                FROM resources
                """
            )
            rows = cursor.fetchall()
        return [
            {
                "employee_id": r[0],
                "employee_name": r[1],
                "name": r[1],           # alias for backward compat
                "email": r[2],
                "role": r[3],
                "skill": r[4],
                "skills": r[5],
                "experience": r[6],
                "department": r[7],
                "status": r[8],
                "allocated": bool(r[9]),
                "current_project": r[10],
                "current_task": r[11],
                "project_start_date": r[12],
                "project_end_date": r[13],
                "allocation_percentage": r[14],
                "leave_start_date": r[15],
                "leave_end_date": r[16],
            }
            for r in rows
        ]

    def get_employees(self) -> List[dict]:
        """Return all resources from source.db with up-to-date allocation state."""
        self.sync_employee_allocations()
        return self._read_resources()

    def get_employees_by_role(self, role: str, only_available: bool = True) -> List[dict]:
        """Return resource dicts matching a standardised planning role."""
        self.sync_employee_allocations()
        all_resources = self._read_resources()

        matched = []
        for r in all_resources:
            db_role_lower = (r.get("role") or "").lower()
            db_skills_lower = (r.get("skills") or "").lower()
            status = r.get("status", "Available")

            if only_available and status != "Available":
                continue

            role_match = False
            if role == "backend":
                is_dev = (
                    "developer" in db_role_lower
                    or "architect" in db_role_lower
                    or "backend" in db_role_lower
                    or "backend" in db_skills_lower
                )
                is_other = (
                    "frontend" in db_role_lower or "frontend" in db_skills_lower
                    or "qa" in db_role_lower or "qa" in db_skills_lower
                    or "devops" in db_role_lower or "devops" in db_skills_lower
                    or "security" in db_role_lower or "security" in db_skills_lower
                    or "test" in db_role_lower or "test" in db_skills_lower
                )
                if is_dev and not is_other:
                    role_match = True
            elif role == "frontend":
                if (
                    "frontend" in db_role_lower
                    or "frontend" in db_skills_lower
                    or "ui" in db_role_lower
                    or "ux" in db_role_lower
                ):
                    role_match = True
            elif role == "qa":
                if (
                    "qa" in db_role_lower
                    or "qa" in db_skills_lower
                    or "test" in db_role_lower
                    or "test" in db_skills_lower
                ):
                    role_match = True
            elif role == "devops":
                if (
                    "devops" in db_role_lower
                    or "devops" in db_skills_lower
                    or "security" in db_role_lower
                    or "security" in db_skills_lower
                    or "infra" in db_role_lower
                    or "cloud" in db_role_lower
                ):
                    role_match = True

            if role_match:
                matched.append({
                    "email": r["email"],
                    "name": r["employee_name"],
                    "role": r["role"],
                    "skills": r["skills"],
                    "status": status,
                    "allocated": r["allocated"],
                })
        return matched

    def get_free_employees_by_role(self, role: str) -> List[str]:
        """Return list of emails of free employees with matching skill/role."""
        matched = self.get_employees_by_role(role, only_available=False)
        return [emp["email"] for emp in matched]


    def update_employee_status(self, email: str, status: str) -> bool:
        """Update a resource's status directly in source.db."""
        if status == "free":
            status = "Available"
        elif status == "working":
            status = "Allocated"
        allocated = 1 if status == "Allocated" else 0
        db_path = self._get_resource_db_path()
        if not os.path.exists(db_path):
            return False
        with self._resource_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE resources SET status = ?, allocated = ? WHERE email = ?",
                (status, allocated, email),
            )
            conn.commit()
            success = cursor.rowcount > 0
        if success:
            self.sync_employee_allocations()
        return success

    def get_employees_by_skill_with_availability(self, skill: str) -> List[dict]:
        """Return all resources matching a skill with computed days_until_free."""
        self.sync_employee_allocations()
        today = datetime.date.today()

        db_path = self._get_resource_db_path()
        if not os.path.exists(db_path):
            return []

        with self._resource_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT email, employee_name, skill, status,
                       leave_start_date, leave_end_date,
                       project_start_date, project_end_date
                FROM resources
                WHERE LOWER(skill) LIKE ? OR LOWER(role) = ?
                """,
                (f"%{skill.lower()}%", skill.lower()),
            )
            employees = [
                {
                    "email": r[0],
                    "name": r[1],
                    "skill": r[2],
                    "status": r[3],
                    "days_until_free": 0,
                    "leave_start_date": r[4],
                    "leave_end_date": r[5],
                    "project_start_date": r[6],
                    "project_end_date": r[7],
                }
                for r in cursor.fetchall()
            ]

        if not employees:
            return employees

        # Build owner -> latest pending task end_date map from saved plans
        owner_to_latest: dict = {}
        with self._plan_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM plans")
            for (raw,) in cursor.fetchall():
                try:
                    plan = json.loads(raw)
                    if plan.get("status") != "accepted":
                        continue
                    for task in plan.get("tasks", []):
                        owner = task.get("owner", "")
                        task_status = task.get("status", "pending")
                        end_date_str = task.get("end_date", "")
                        if owner and task_status != "completed" and end_date_str:
                            try:
                                end_date = datetime.date.fromisoformat(end_date_str)
                                if owner not in owner_to_latest or end_date > owner_to_latest[owner]:
                                    owner_to_latest[owner] = end_date
                            except ValueError:
                                pass
                except Exception:
                    pass

        for emp in employees:
            if emp["status"] == "Available":
                emp["days_until_free"] = 0
            else:
                latest = owner_to_latest.get(emp["email"]) or owner_to_latest.get(emp["name"])
                if latest:
                    delta = (latest - today).days
                    emp["days_until_free"] = max(0, delta)
                else:
                    emp["days_until_free"] = None

        # Sort: Available first, then by days_until_free ascending, then name
        employees.sort(
            key=lambda e: (
                0 if e["status"] == "Available" else 1,
                e["days_until_free"] if e["days_until_free"] is not None else 9999,
                e["name"],
            )
        )
        return employees

    def set_employee_leave(self, email: str, start_date: str, end_date: str) -> bool:
        """Mark a resource on leave in source.db."""
        db_path = self._get_resource_db_path()
        if not os.path.exists(db_path):
            return False
        with self._resource_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE resources
                SET leave_start_date = ?,
                    leave_end_date   = ?,
                    status           = 'On Leave',
                    allocated        = 0
                WHERE email = ?
                """,
                (start_date, end_date, email),
            )
            conn.commit()
            success = cursor.rowcount > 0
        if success:
            self.sync_employee_allocations()
        return success

    def get_plan_history(self, plan_id: str) -> List[dict]:
        """Fetch historical replan records for a plan."""
        with self._plan_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT version, reason, data, timestamp FROM plan_history WHERE plan_id = ? ORDER BY version DESC",
                (plan_id,),
            )
            return [
                {
                    "version": r[0],
                    "reason": r[1],
                    "data": json.loads(r[2]),
                    "timestamp": r[3],
                }
                for r in cursor.fetchall()
            ]

    def save_plan_history(
        self, plan_id: str, demand_id: str, version: int, reason: str, data_dict: dict
    ) -> None:
        """Save a plan snapshot to history."""
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        with self._plan_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO plan_history (plan_id, demand_id, version, reason, data, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (plan_id, demand_id, version, reason, json.dumps(data_dict), timestamp),
            )
            conn.commit()

    def sync_employee_allocations(self) -> None:
        """Re-derive resource allocation state from accepted plans in source.db.

        Reads:  source.db    -> plans table
        Writes: source.db    -> resources table
                (allocated, status, current_project, current_task,
                 project_start_date, project_end_date, allocation_percentage,
                 leave_start_date, leave_end_date)
        """
        db_path = self._get_resource_db_path()
        if not os.path.exists(db_path):
            return

        today = datetime.date.today()
        today_str = today.isoformat()

        # 1. Load all resources from source.db
        with self._resource_conn() as rconn:
            rcursor = rconn.cursor()
            rcursor.execute(
                "SELECT email, employee_name, leave_start_date, leave_end_date FROM resources"
            )
            db_resources = rcursor.fetchall()

        # 2. Load all accepted plans from source.db
        with self._plan_conn() as pconn:
            pcursor = pconn.cursor()
            pcursor.execute("SELECT data FROM plans")
            db_plans = [json.loads(row[0]) for row in pcursor.fetchall()]

        # 3. Build email/name -> assignments map from accepted plans
        assignments: dict = {}
        for plan in db_plans:
            if plan.get("status") != "accepted":
                continue

            plan_id = plan.get("plan_id")
            demand_id = plan.get("demand_id")
            tasks = plan.get("tasks", [])

            # Compute plan-level date range
            plan_dates = []
            for t in tasks:
                for date_key in ("start_date", "end_date"):
                    raw = t.get(date_key)
                    if raw:
                        try:
                            plan_dates.append(datetime.date.fromisoformat(raw))
                        except ValueError:
                            pass

            plan_start_str = min(plan_dates).isoformat() if plan_dates else None
            plan_end_str = max(plan_dates).isoformat() if plan_dates else None

            for t in tasks:
                owner_str = t.get("owner")
                if not owner_str or owner_str == "unassigned":
                    continue
                if t.get("status") == "completed":
                    continue
                # Auto-expire tasks whose end_date has already passed
                t_end_str = t.get("end_date")
                if t_end_str:
                    try:
                        if datetime.date.fromisoformat(t_end_str) < today:
                            continue
                    except ValueError:
                        pass

                # Split owner string to assign to all owners
                owners = [o.strip() for o in owner_str.split(",") if o.strip()]
                for owner in owners:
                    assignments.setdefault(owner, []).append({
                        "plan_id": plan_id,
                        "demand_id": demand_id,
                        "plan_start": plan_start_str,
                        "plan_end": plan_end_str,
                        "task_id": t.get("task_id"),
                        "task_name": t.get("name"),
                        "start_date": t.get("start_date"),
                        "end_date": t.get("end_date"),
                    })

        # 4. Write updated state back to source.db
        with self._resource_conn() as rconn:
            rcursor = rconn.cursor()

            for email, name, l_start, l_end in db_resources:
                # Determine leave status
                on_leave = False
                leave_completed = False
                if l_start and l_end:
                    try:
                        if l_start <= today_str <= l_end:
                            on_leave = True
                        elif today_str > l_end:
                            leave_completed = True
                    except Exception:
                        pass

                # Match assignments by email or name
                emp_assignments = assignments.get(email, [])
                if not emp_assignments and name:
                    emp_assignments = assignments.get(name, [])

                if emp_assignments and not on_leave:
                    # Find active assignment first, fallback to next sorted by start date
                    active_assignments = [
                        a for a in emp_assignments
                        if a.get("start_date") and a.get("end_date")
                        and a["start_date"] <= today_str <= a["end_date"]
                    ]
                    if active_assignments:
                        primary = active_assignments[0]
                    else:
                        emp_assignments.sort(key=lambda x: x.get("start_date") or "")
                        primary = emp_assignments[0]
                    allocated = 1
                    status = "Allocated"
                    current_project = primary["demand_id"]
                    current_task = primary["task_name"]
                    project_start_date = primary["plan_start"]
                    project_end_date = primary["plan_end"]
                    allocation_percentage = 100.0
                elif on_leave:
                    allocated = 0
                    status = "On Leave"
                    current_project = None
                    current_task = None
                    project_start_date = None
                    project_end_date = None
                    allocation_percentage = 0.0
                else:
                    allocated = 0
                    status = "Available"
                    current_project = None
                    current_task = None
                    project_start_date = None
                    project_end_date = None
                    allocation_percentage = 0.0

                # Clear expired leave dates
                update_l_start = None if leave_completed else l_start
                update_l_end = None if leave_completed else l_end

                rcursor.execute(
                    """
                    UPDATE resources
                    SET allocated             = ?,
                        status                = ?,
                        current_project       = ?,
                        current_task          = ?,
                        project_start_date    = ?,
                        project_end_date      = ?,
                        allocation_percentage = ?,
                        leave_start_date      = ?,
                        leave_end_date        = ?
                    WHERE email = ?
                    """,
                    (
                        allocated,
                        status,
                        current_project,
                        current_task,
                        project_start_date,
                        project_end_date,
                        allocation_percentage,
                        update_l_start,
                        update_l_end,
                        email,
                    ),
                )
            rconn.commit()

db = PlanDatabase()

