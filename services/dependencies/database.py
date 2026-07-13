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
                    demand_id TEXT,
                    data TEXT
                )
            ''')
            conn.commit()

            # Migration: check if demand_id column exists
            cursor.execute("PRAGMA table_info(dependencies)")
            columns = [info[1] for info in cursor.fetchall()]
            if "demand_id" not in columns:
                try:
                    cursor.execute("ALTER TABLE dependencies ADD COLUMN demand_id TEXT")
                    conn.commit()
                    print("Successfully added demand_id column to dependencies table.")
                except Exception as e:
                    print(f"Error migrating dependencies table schema: {e}")

            # Migration to populate missing demand_ids
            cursor.execute("SELECT dependency_id, data FROM dependencies")
            rows = cursor.fetchall()
            updated = False
            for dep_id, json_data in rows:
                try:
                    data_dict = json.loads(json_data)
                    # Check if demand_id is empty/missing in database column or in the JSON
                    cursor.execute("SELECT demand_id FROM dependencies WHERE dependency_id = ?", (dep_id,))
                    db_row = cursor.fetchone()
                    db_demand_id = db_row[0] if db_row else None
                    
                    if not db_demand_id or not data_dict.get("demand_id"):
                        plan_id = data_dict.get("plan_id")
                        if plan_id:
                            plan_demand_id = None
                            plan_db_path = os.path.abspath(
                                os.path.join(os.path.dirname(__file__), "..", "plan-schedule", "plan.db")
                            )
                            if os.path.exists(plan_db_path):
                                try:
                                    with sqlite3.connect(plan_db_path) as plan_conn:
                                        plan_cursor = plan_conn.cursor()
                                        plan_cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
                                        plan_row = plan_cursor.fetchone()
                                        if plan_row:
                                            plan_data = json.loads(plan_row[0])
                                            plan_demand_id = plan_data.get("demand_id")
                                except Exception as e:
                                    print(f"Error querying plan.db during migration: {e}")
                            
                            if plan_demand_id:
                                data_dict["demand_id"] = plan_demand_id
                                updated_json = json.dumps(data_dict)
                                cursor.execute(
                                    "UPDATE dependencies SET demand_id = ?, data = ? WHERE dependency_id = ?",
                                    (plan_demand_id, updated_json, dep_id)
                                )
                                updated = True
                except Exception as e:
                    print(f"Error migrating dependency record {dep_id}: {e}")
            if updated:
                conn.commit()
                print("Successfully populated missing demand_ids for existing dependencies.")

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
                            "INSERT INTO dependencies (dependency_id, demand_id, data) VALUES (?, ?, ?)",
                            (record.dependency_id, record.demand_id, record.model_dump_json())
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
                INSERT INTO dependencies (dependency_id, demand_id, data)
                VALUES (?, ?, ?)
                ON CONFLICT(dependency_id) DO UPDATE SET demand_id=excluded.demand_id, data=excluded.data
                """,
                (record.dependency_id, record.demand_id, record.model_dump_json())
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
        # Navigate relative to this file: services/dependencies/../plan-schedule/plan.db
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "plan-schedule", "plan.db")
        )

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
            print(f"Error reading plan.db: {e}")
        return plans

    @classmethod
    def load_plan_by_id(cls, plan_id: str) -> Optional[PlanRecord]:
        db_path = cls.get_plan_db_path()
        if not os.path.exists(db_path):
            return None

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
        except Exception as e:
            print(f"Error reading plan.db for {plan_id}: {e}")
        return None


# Global instances
db = DependencyDatabase()
plan_loader = PlanLoader()
