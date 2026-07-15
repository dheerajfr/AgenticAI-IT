import os
import json
import sqlite3
from typing import Dict, List, Optional
from models import DemandRecord
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from shared_db.connection import get_db

# ---------------------------------------------------------------------------
# DemandDatabase — backed by source.db (demands table)
# ---------------------------------------------------------------------------

class DemandDatabase:
    def __init__(self, fixtures_dir: str):
        self.fixtures_dir = fixtures_dir
        self._init_db()

    def _init_db(self):
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS demands (
                    demand_id TEXT PRIMARY KEY,
                    data TEXT
                )
            ''')
            conn.commit()

            # Seed from fixtures if table is empty
            cursor.execute('SELECT COUNT(*) FROM demands')
            if cursor.fetchone()[0] == 0:
                self._load_fixtures(conn)

    def _load_fixtures(self, conn):
        if not os.path.exists(self.fixtures_dir):
            print(f"Fixtures directory not found at: {self.fixtures_dir}")
            return

        cursor = conn.cursor()
        count = 0
        for filename in os.listdir(self.fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        record = DemandRecord(**data)
                        cursor.execute(
                            "INSERT INTO demands (demand_id, data) VALUES (?, ?)",
                            (record.demand_id, record.model_dump_json())
                        )
                        count += 1
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        conn.commit()
        print(f"Initialized SQLite database with {count} records from fixtures.")

    def get_all(self) -> List[DemandRecord]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands ORDER BY demand_id")
            rows = cursor.fetchall()
            return [DemandRecord.model_validate_json(row[0]) for row in rows]

    def get_by_id(self, demand_id: str) -> Optional[DemandRecord]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                return DemandRecord.model_validate_json(row[0])
            return None

    def save(self, record: DemandRecord) -> DemandRecord:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO demands (demand_id, data)
                VALUES (?, ?)
                ON CONFLICT(demand_id) DO UPDATE SET data=excluded.data
                """,
                (record.demand_id, record.model_dump_json())
            )
            conn.commit()
        return record

    def delete(self, demand_id: str) -> bool:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM demands WHERE demand_id = ?", (demand_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
            return deleted


# ---------------------------------------------------------------------------
# ResourceDatabase — reads directly from source.db (resources table)
# ---------------------------------------------------------------------------

class ResourceDatabase:
    def __init__(self, fixtures_dir: str):
        self.fixtures_dir = fixtures_dir

    def _conn(self) -> sqlite3.Connection:
        return get_db()

    def get_all_resources(self) -> List[dict]:
        """Return all resources from source.db using the employee schema.

        Derives total_capacity and allocated_capacity from allocation_percentage
        so that perform_capacity_check() in main.py works without changes.
        Capacity unit = 40 hours/week (standard)
        """
        with self._conn() as conn:
            cursor = conn.cursor()
            # Ensure resources table exists (e.g. if config or source.db was missing)
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='resources'"
            )
            if not cursor.fetchone():
                return []
            cursor.execute(
                """
                SELECT employee_name, role, skills, allocation_percentage, status
                FROM resources
                """
            )
            rows = cursor.fetchall()

        result = []
        for name, role, skills_raw, alloc_pct, status in rows:
            try:
                skills = json.loads(skills_raw) if skills_raw else []
            except (json.JSONDecodeError, TypeError):
                skills = [skills_raw] if skills_raw else []

            alloc_pct = alloc_pct or 0.0
            total_capacity = 40  # standard weekly hours
            allocated_capacity = int(round(total_capacity * alloc_pct / 100))

            result.append({
                "name": name,
                "role": role,
                "skills": skills,
                "total_capacity": total_capacity,
                "allocated_capacity": allocated_capacity,
                # extra fields for richer capacity logic
                "allocation_percentage": alloc_pct,
                "status": status or "Available",
            })
        return result

    def save_resource(self, resource: dict) -> dict:
        """Upsert a resource into source.db using the employee schema.

        - If an employee with the same email already exists: update role, skills,
          allocation_percentage.
        - If the employee is new: insert a full row with a generated employee_id,
          derived email, and Available/unallocated defaults.
        """
        name = resource.get("name", "").strip()
        role = resource.get("role", "")
        skills_list = resource.get("skills", [])
        skills_str = json.dumps(skills_list)
        skill = skills_list[0] if skills_list else role

        # Derive allocation_percentage from provided capacity fields
        total = resource.get("total_capacity", 40) or 40
        alloc = resource.get("allocated_capacity", 0) or 0
        alloc_pct = round((alloc / total) * 100, 1)

        # Generate a deterministic email from the name
        email = name.lower().replace(" ", ".") + "@example.com"

        status = "Allocated" if alloc_pct > 0 else "Available"
        allocated = 1 if status == "Allocated" else 0

        with self._conn() as conn:
            cursor = conn.cursor()

            # Check if this employee already exists
            cursor.execute(
                "SELECT COUNT(*) FROM resources WHERE email = ? OR employee_name = ?",
                (email, name),
            )
            exists = cursor.fetchone()[0] > 0

            if exists:
                # Update mutable fields including status and allocated
                cursor.execute(
                    """
                    UPDATE resources
                    SET role = ?, skill = ?, skills = ?, allocation_percentage = ?,
                        status = ?, allocated = ?
                    WHERE email = ? OR employee_name = ?
                    """,
                    (role, skill, skills_str, alloc_pct, status, allocated, email, name),
                )
            else:
                # Generate next employee_id
                cursor.execute("SELECT COUNT(*) FROM resources")
                count = cursor.fetchone()[0]
                emp_id = f"EMP-2026-{count + 1:04d}"

                cursor.execute(
                    """
                    INSERT INTO resources (
                        employee_id, employee_name, email, role, skill, skills,
                        experience, department, status, allocated,
                        current_project, current_task,
                        project_start_date, project_end_date,
                        allocation_percentage,
                        leave_start_date, leave_end_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                              NULL, NULL, NULL, NULL, ?, NULL, NULL)
                    """,
                    (emp_id, name, email, role, skill, skills_str,
                     5, "Engineering", status, allocated, alloc_pct),
                )
            conn.commit()
        return resource

    def delete_resource(self, name: str) -> bool:
        """Delete a resource by employee_name."""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM resources WHERE employee_name = ?", (name,))
            deleted = cursor.rowcount > 0
            conn.commit()
        return deleted


# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "fixtures")

db = DemandDatabase(FIXTURES_PATH)
resource_db = ResourceDatabase(FIXTURES_PATH)
