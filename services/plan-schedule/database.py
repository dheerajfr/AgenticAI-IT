"""
database.py — SQLite persistence for Stage 03: Plan & Schedule.

Mirrors the pattern used by services/estimate-shape/database.py and
services/demand-intake/database.py so that PlanRecords survive gateway
restarts.
"""

from __future__ import annotations

import json
import os
import sqlite3
import datetime
from typing import List, Optional


class PlanDatabase:
    def __init__(self) -> None:
        self.db_path = os.path.join(os.path.dirname(__file__), "plan.db")
        self._init_db()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _get_resource_db_path(self) -> str:
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "resource.db"))

    def sync_resources_to_employees(self) -> None:
        """Sync resources from services/resource.db into local employees table in plan.db."""
        resource_db_path = self._get_resource_db_path()
        if not os.path.exists(resource_db_path):
            return
            
        with sqlite3.connect(resource_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name, role, skills FROM resources")
            resources = cursor.fetchall()
            
        resource_emails = {name.lower() + "@example.com" for name, _, _ in resources}
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Delete employees that are no longer in resource.db
            cursor.execute("SELECT email FROM employees")
            db_emails = [r[0] for r in cursor.fetchall()]
            for email in db_emails:
                if email not in resource_emails:
                    cursor.execute("DELETE FROM employees WHERE email = ?", (email,))
            
            # Insert or update employees from resource.db
            for name, role, skills in resources:
                email = name.lower() + "@example.com"
                cursor.execute("SELECT COUNT(*) FROM employees WHERE email = ?", (email,))
                exists = cursor.fetchone()[0] > 0
                
                skills_list = json.loads(skills) if skills.startswith("[") else [skills]
                skill = skills_list[0] if skills_list else role
                
                if not exists:
                    cursor.execute("SELECT COUNT(*) FROM employees")
                    count = cursor.fetchone()[0]
                    emp_id = f"EMP-2026-{count+1:04d}"
                    cursor.execute(
                        """
                        INSERT INTO employees (
                            employee_id, employee_name, email, role, skill, skills,
                            experience, department, status, allocated, allocation_percentage
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Available', 0, 0.0)
                        """,
                        (emp_id, name, email, role, skill, skills, 5, "Engineering")
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE employees
                        SET employee_name = ?, role = ?, skill = ?, skills = ?
                        WHERE email = ?
                        """,
                        (name, role, skill, skills, email)
                    )
            conn.commit()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Check if employees table has the old schema (does not contain employee_id)
            try:
                cursor.execute("PRAGMA table_info(employees)")
                cols = [col[1] for col in cursor.fetchall()]
                if cols and "employee_id" not in cols:
                    print("[plan-schedule] Dropping old employees table to upgrade schema.")
                    cursor.execute("DROP TABLE employees")
            except Exception as e:
                print(f"[plan-schedule] Schema check error: {e}")

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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS employees (
                    employee_id           TEXT UNIQUE,
                    employee_name         TEXT,
                    email                 TEXT PRIMARY KEY,
                    role                  TEXT,
                    skill                 TEXT,
                    skills                TEXT,
                    experience            INTEGER,
                    department            TEXT,
                    status                TEXT,
                    allocated             BOOLEAN,
                    current_project       TEXT,
                    current_task          TEXT,
                    project_start_date    TEXT,
                    project_end_date      TEXT,
                    allocation_percentage REAL,
                    leave_start_date      TEXT,
                    leave_end_date        TEXT
                )
                """
            )
            conn.commit()

            self.sync_resources_to_employees()

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
        self.sync_employee_allocations()

    def delete(self, plan_id: str) -> bool:
        """Delete a plan by plan_id. Returns True if a row was removed."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM plans WHERE plan_id = ?", (plan_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
        if deleted:
            self.sync_employee_allocations()
        return deleted

    def get_employees(self) -> List[dict]:
        """Return all employees from SQLite store."""
        self.sync_employee_allocations()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT employee_id, employee_name, email, role, skills, experience, department,
                       status, allocated, current_project, current_task,
                       project_start_date, project_end_date, allocation_percentage,
                       leave_start_date, leave_end_date
                FROM employees
                """
            )
            return [
                {
                    "employee_id": r[0],
                    "employee_name": r[1],
                    "name": r[1],  # alias
                    "email": r[2],
                    "role": r[3],
                    "skill": r[4],  # alias
                    "skills": r[4],
                    "experience": r[5],
                    "department": r[6],
                    "status": r[7],
                    "allocated": bool(r[8]),
                    "current_project": r[9],
                    "current_task": r[10],
                    "project_start_date": r[11],
                    "project_end_date": r[12],
                    "allocation_percentage": r[13],
                    "leave_start_date": r[14],
                    "leave_end_date": r[15],
                }
                for r in cursor.fetchall()
            ]

    def get_employees_by_role(self, role: str, only_available: bool = True) -> List[dict]:
        """Return list of employee dicts matching standardized planning role."""
        self.sync_employee_allocations()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.conn.cursor() if hasattr(conn, "conn") else conn.cursor()
            cursor.execute(
                """
                SELECT email, employee_name, role, skills, status, allocated
                FROM employees
                """
            )
            rows = cursor.fetchall()
            
            matched = []
            for r in rows:
                email, name, db_role, db_skills, status, allocated = r
                db_role_lower = (db_role or "").lower()
                db_skills_lower = (db_skills or "").lower()
                
                if only_available and status != "Available":
                    continue
                
                role_match = False
                if role == "backend":
                    is_dev = "developer" in db_role_lower or "architect" in db_role_lower or "backend" in db_role_lower or "backend" in db_skills_lower
                    is_other = "frontend" in db_role_lower or "frontend" in db_skills_lower or \
                               "qa" in db_role_lower or "qa" in db_skills_lower or \
                               "devops" in db_role_lower or "devops" in db_skills_lower or \
                               "security" in db_role_lower or "security" in db_skills_lower or \
                               "test" in db_role_lower or "test" in db_skills_lower
                    if is_dev and not is_other:
                        role_match = True
                elif role == "frontend":
                    if "frontend" in db_role_lower or "frontend" in db_skills_lower or "ui" in db_role_lower or "ux" in db_role_lower:
                        role_match = True
                elif role == "qa":
                    if "qa" in db_role_lower or "qa" in db_skills_lower or "test" in db_role_lower or "test" in db_skills_lower:
                        role_match = True
                elif role == "devops":
                    if "devops" in db_role_lower or "devops" in db_skills_lower or "security" in db_role_lower or "security" in db_skills_lower or "infra" in db_role_lower or "cloud" in db_role_lower:
                        role_match = True
                        
                if role_match:
                    matched.append({
                        "email": email,
                        "name": name,
                        "role": db_role,
                        "skills": db_skills,
                        "status": status,
                        "allocated": bool(allocated)
                    })
            return matched

    def get_free_employees_by_role(self, role: str) -> List[str]:
        """Return list of emails of free employees with matching skill/role."""
        matched = self.get_employees_by_role(role, only_available=False)
        return [emp["email"] for emp in matched]


    def update_employee_status(self, email: str, status: str) -> bool:
        """Update an employee's status in SQLite store."""
        if status == "free":
            status = "Available"
        elif status == "working":
            status = "Allocated"
        allocated = 1 if status == "Allocated" else 0
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE employees SET status = ?, allocated = ? WHERE email = ?",
                (status, allocated, email),
            )
            conn.commit()
            success = cursor.rowcount > 0
        if success:
            self.sync_employee_allocations()
        return success

    def get_employees_by_skill_with_availability(self, skill: str) -> List[dict]:
        """Return all employees of a given skill with computed days_until_free."""
        self.sync_employee_allocations()
        import datetime
        today = datetime.date.today()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT email, employee_name, skill, status, leave_start_date, leave_end_date, project_start_date, project_end_date FROM employees WHERE LOWER(skill) LIKE ? OR LOWER(role) = ?",
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

            # Build a map: owner_email -> latest pending task end_date from saved plans
            cursor.execute("SELECT data FROM plans")
            owner_to_latest: dict = {}
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
        employees.sort(key=lambda e: (
            0 if e["status"] == "Available" else 1,
            e["days_until_free"] if e["days_until_free"] is not None else 9999,
            e["name"]
        ))
        return employees

    def set_employee_leave(self, email: str, start_date: str, end_date: str) -> bool:
        """Mark an employee on leave and store start/end dates."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE employees
                SET leave_start_date = ?,
                    leave_end_date = ?,
                    status = 'On Leave',
                    allocated = 0
                WHERE email = ?
                """,
                (start_date, end_date, email)
            )
            conn.commit()
            success = cursor.rowcount > 0
        if success:
            self.sync_employee_allocations()
        return success

    def get_plan_history(self, plan_id: str) -> List[dict]:
        """Fetch historical replan records for a plan."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT version, reason, data, timestamp FROM plan_history WHERE plan_id = ? ORDER BY version DESC",
                (plan_id,)
            )
            return [
                {
                    "version": r[0],
                    "reason": r[1],
                    "data": json.loads(r[2]),
                    "timestamp": r[3]
                }
                for r in cursor.fetchall()
            ]

    def save_plan_history(self, plan_id: str, demand_id: str, version: int, reason: str, data_dict: dict) -> None:
        """Save a plan snapshot to history."""
        import datetime
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO plan_history (plan_id, demand_id, version, reason, data, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (plan_id, demand_id, version, reason, json.dumps(data_dict), timestamp)
            )
            conn.commit()

    def sync_employee_allocations(self) -> None:
        """
        Dynamically synchronize employee fields (allocated, status, current_project,
        current_task, project_start_date, project_end_date, allocation_percentage)
        based on active/accepted plans and task states.
        
        Also checks if today is within leave_start_date and leave_end_date.
        """
        self.sync_resources_to_employees()
        import datetime
        today = datetime.date.today()
        today_str = today.isoformat()
        
        # 1. Fetch all employees
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT email, leave_start_date, leave_end_date, status, allocated FROM employees")
            db_employees = cursor.fetchall()
            
            # 2. Fetch all plans
            cursor.execute("SELECT data FROM plans")
            db_plans = [json.loads(row[0]) for row in cursor.fetchall()]
            
        # Map employee email/name -> list of assigned tasks from accepted plans
        # We will only look at plans that have status = 'accepted'
        assignments = {}
        for plan in db_plans:
            if plan.get("status") != "accepted":
                continue
            
            plan_id = plan.get("plan_id")
            demand_id = plan.get("demand_id")
            tasks = plan.get("tasks", [])
            
            # Find earliest/latest dates for the plan
            plan_dates = []
            for t in tasks:
                t_start = t.get("start_date")
                t_end = t.get("end_date")
                if t_start: 
                    try:
                        plan_dates.append(datetime.date.fromisoformat(t_start))
                    except ValueError:
                        pass
                if t_end: 
                    try:
                        plan_dates.append(datetime.date.fromisoformat(t_end))
                    except ValueError:
                        pass
                
            plan_start_str = min(plan_dates).isoformat() if plan_dates else None
            plan_end_str = max(plan_dates).isoformat() if plan_dates else None
            
            for t in tasks:
                owner = t.get("owner")
                if not owner or owner == "unassigned":
                    continue
                
                # Skip completed tasks
                t_status = t.get("status", "pending")
                if t_status == "completed":
                    continue
                
                # Skip tasks whose end_date has already passed today
                # (treat as auto-expired — employee should be freed)
                t_end_str = t.get("end_date")
                if t_end_str:
                    try:
                        t_end_date = datetime.date.fromisoformat(t_end_str)
                        if t_end_date < today:
                            continue  # task period elapsed — free the employee
                    except ValueError:
                        pass
                
                assignment = {
                    "plan_id": plan_id,
                    "demand_id": demand_id,
                    "plan_start": plan_start_str,
                    "plan_end": plan_end_str,
                    "task_id": t.get("task_id"),
                    "task_name": t.get("name"),
                    "start_date": t.get("start_date"),
                    "end_date": t.get("end_date")
                }
                
                assignments.setdefault(owner, []).append(assignment)
                
        # 3. Update each employee
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            for email, l_start, l_end, current_status, current_allocated in db_employees:
                cursor.execute("SELECT employee_name FROM employees WHERE email = ?", (email,))
                row_name = cursor.fetchone()
                name = row_name[0] if row_name else ""
                
                # Check if employee is on leave today
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
                
                # Get assignments by email or name
                emp_assignments = assignments.get(email, [])
                if not emp_assignments and name:
                    emp_assignments = assignments.get(name, [])
                    
                if emp_assignments and not on_leave:
                    emp_assignments.sort(key=lambda x: x["start_date"] or "")
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
                
                # Clear leave dates if leave has completed
                update_l_start = None if leave_completed else l_start
                update_l_end = None if leave_completed else l_end

                cursor.execute(
                    """
                    UPDATE employees
                    SET allocated = ?,
                        status = ?,
                        current_project = ?,
                        current_task = ?,
                        project_start_date = ?,
                        project_end_date = ?,
                        allocation_percentage = ?,
                        leave_start_date = ?,
                        leave_end_date = ?
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
                        email
                        )
                )
            conn.commit()

db = PlanDatabase()

