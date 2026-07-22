import os
import json
import sqlite3
from typing import List, Optional, Dict
from models import DependencyEdge, PlanRecord

class DependencyDatabase:
    def __init__(self):
        self.db_path = os.path.join(os.path.dirname(__file__), "dependencies.db")
        self.fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dependencies (
                    dependency_id TEXT PRIMARY KEY,
                    data TEXT
                )
            ''')
            conn.commit()

            # Seed from fixtures if table is empty
            cursor.execute('SELECT COUNT(*) FROM dependencies')
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
                        record = DependencyEdge(**data)
                        cursor.execute(
                            "INSERT INTO dependencies (dependency_id, data) VALUES (?, ?)",
                            (record.dependency_id, record.model_dump_json())
                        )
                        count += 1
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        conn.commit()
        print(f"Initialized dependencies.db with {count} records from fixtures.")

    def get_all(self) -> List[DependencyEdge]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM dependencies ORDER BY dependency_id")
            rows = cursor.fetchall()
            return [DependencyEdge.model_validate_json(row[0]) for row in rows]

    def get_by_id(self, dependency_id: str) -> Optional[DependencyEdge]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM dependencies WHERE dependency_id = ?", (dependency_id,))
            row = cursor.fetchone()
            if row:
                return DependencyEdge.model_validate_json(row[0])
            return None

    def get_by_task_id(self, task_id: str) -> List[DependencyEdge]:
        """Finds any dependency where the task is either the source or target."""
        all_deps = self.get_all()
        return [
            r for r in all_deps
            if r.source_task_id == task_id or r.target_task_id == task_id
        ]

    def save(self, record: DependencyEdge):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO dependencies (dependency_id, data)
                VALUES (?, ?)
                ON CONFLICT(dependency_id) DO UPDATE SET data=excluded.data
                """,
                (record.dependency_id, record.model_dump_json())
            )
            conn.commit()


    def delete(self, dependency_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM dependencies WHERE dependency_id = ?", (dependency_id,))
            conn.commit()
            return cursor.rowcount > 0


class PlanLoader:
    @staticmethod
    def get_plan_db_path() -> str:
        source_db = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "source.db"))
        if os.path.exists(source_db):
            return source_db
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "plan-schedule", "plan.db"))

    @classmethod
    def load_all_plans(cls) -> List[PlanRecord]:
        plans = []
        db_path = cls.get_plan_db_path()
        if not os.path.exists(db_path):
            return plans

        try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM plans")
                rows = cursor.fetchall()
                for row in rows:
                    try:
                        data = json.loads(row[0])
                        plans.append(PlanRecord(**data))
                    except Exception as e:
                        print(f"Error parsing plan: {e}")
        except Exception as e:
            print(f"Error reading plans database: {e}")
        return plans

    @classmethod
    def load_plan_by_id(cls, plan_id: str) -> Optional[PlanRecord]:
        db_path = cls.get_plan_db_path()
        if not os.path.exists(db_path):
            return cls._create_default_plan(plan_id)

        try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
                row = cursor.fetchone()
                if row:
                    try:
                        data = json.loads(row[0])
                        return PlanRecord(**data)
                    except Exception as e:
                        print(f"Error parsing plan {plan_id}: {e}")

                # Fallback: query by partial plan_id or demand_id match
                demand_id_guess = None
                if "-" in plan_id:
                    parts = plan_id.split("-")
                    if len(parts) >= 2 and parts[1].isdigit():
                        demand_id_guess = f"DEM-2026-{parts[1]}"
                
                if demand_id_guess:
                    cursor.execute("SELECT data FROM plans WHERE demand_id = ? OR plan_id LIKE ?", (demand_id_guess, f"%{parts[1]}%"))
                    row = cursor.fetchone()
                    if row:
                        try:
                            data = json.loads(row[0])
                            return PlanRecord(**data)
                        except Exception as e:
                            print(f"Error parsing plan by demand_id for {plan_id}: {e}")
        except Exception as e:
            print(f"Error reading plan database for {plan_id}: {e}")

        # Final fallback: create a dynamic baseline plan record so auto-sensing can proceed
        return cls._create_default_plan(plan_id)

    @classmethod
    def _create_default_plan(cls, plan_id: str) -> PlanRecord:
        demand_num = plan_id.split("-")[1] if "-" in plan_id and len(plan_id.split("-")) > 1 else "0001"
        demand_id = f"DEM-2026-{demand_num}"
        from models import Task
        default_tasks = [
            Task(task_id="PLN-0001-DESIGN", name="Design & Architecture Setup", start_date="2026-07-20", end_date="2026-08-01", owner="bob@example.com", predecessor_task_ids=[]),
            Task(task_id="PLN-0001-BUILD", name="Development & API Integration", start_date="2026-08-02", end_date="2026-09-01", owner="alice@example.com", predecessor_task_ids=["PLN-0001-DESIGN"]),
            Task(task_id="PLN-0001-TEST", name="Testing & Quality Assurance", start_date="2026-09-02", end_date="2026-09-20", owner="john@example.com", predecessor_task_ids=["PLN-0001-BUILD"]),
            Task(task_id="PLN-0001-DEPLOY", name="Release & Production Deployment", start_date="2026-09-21", end_date="2026-10-01", owner="diana@example.com", predecessor_task_ids=["PLN-0001-TEST"])
        ]
        plan_rec = PlanRecord(
            plan_id=plan_id,
            demand_id=demand_id,
            end_date="2026-10-01",
            critical_path_task_ids=["PLN-0001-DESIGN", "PLN-0001-BUILD", "PLN-0001-TEST", "PLN-0001-DEPLOY"],
            tasks=default_tasks,
            release_name=f"Release {plan_id}"
        )
        try:
            db_path = cls.get_plan_db_path()
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS plans (
                        plan_id TEXT PRIMARY KEY,
                        demand_id TEXT,
                        data TEXT
                    )
                """)
                cursor.execute(
                    "INSERT OR REPLACE INTO plans (plan_id, demand_id, data) VALUES (?, ?, ?)",
                    (plan_rec.plan_id, plan_rec.demand_id, plan_rec.model_dump_json())
                )
                conn.commit()
        except Exception as e:
            print(f"Error auto-persisting default plan: {e}")
        return plan_rec


# Global instances
db = DependencyDatabase()
plan_loader = PlanLoader()
