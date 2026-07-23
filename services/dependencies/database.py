import os
import json
import sqlite3
from typing import List, Optional, Dict
from models import DependencyEdge, PlanRecord
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from shared_db.connection import get_db

class DependencyDatabase:
    def __init__(self):
        self.fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        self._init_db()

    def _init_db(self):
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dependencies (
                    dependency_id TEXT PRIMARY KEY,
                    demand_id TEXT,
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
                        
                        # Serialize data without demand_id
                        data_dict = record.model_dump()
                        data_dict.pop("demand_id", None)
                        data_json = json.dumps(data_dict)

                        cursor.execute(
                            "INSERT INTO dependencies (dependency_id, demand_id, data) VALUES (?, ?, ?)",
                            (record.dependency_id, record.demand_id, data_json)
                        )
                        count += 1
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        conn.commit()
        print(f"Initialized dependencies with {count} records from fixtures.")

    def get_all(self) -> List[DependencyEdge]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data, demand_id FROM dependencies ORDER BY dependency_id")
            rows = cursor.fetchall()
            deps = []
            for row in rows:
                dep = DependencyEdge.model_validate_json(row[0])
                dep.demand_id = row[1]
                deps.append(dep)
            return deps

    def get_by_id(self, dependency_id: str) -> Optional[DependencyEdge]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data, demand_id FROM dependencies WHERE dependency_id = ?", (dependency_id,))
            row = cursor.fetchone()
            if row:
                dep = DependencyEdge.model_validate_json(row[0])
                dep.demand_id = row[1]
                return dep
            return None

    def get_by_task_id(self, task_id: str) -> List[DependencyEdge]:
        """Finds any dependency where the task is either the source or target."""
        all_deps = self.get_all()
        return [
            r for r in all_deps
            if r.source_task_id == task_id or r.target_task_id == task_id
        ]

    def save(self, record: DependencyEdge):
        data_dict = record.model_dump()
        data_dict.pop("demand_id", None)
        data_json = json.dumps(data_dict)

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO dependencies (dependency_id, demand_id, data)
                VALUES (?, ?, ?)
                ON CONFLICT(dependency_id) DO UPDATE SET demand_id=excluded.demand_id, data=excluded.data
                """,
                (record.dependency_id, record.demand_id, data_json)
            )
            conn.commit()

    def delete(self, dependency_id: str) -> bool:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM dependencies WHERE dependency_id = ?", (dependency_id,))
            conn.commit()
            return cursor.rowcount > 0


class PlanLoader:
    @classmethod
    def load_all_plans(cls) -> List[PlanRecord]:
        plans = []
        try:
            with get_db() as conn:
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
            print(f"Error reading plans from shared DB: {e}")
        return plans

    @classmethod
    def load_plan_by_id(cls, plan_id: str) -> Optional[PlanRecord]:
        try:
            with get_db() as conn:
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
            print(f"Error reading plan from shared DB for {plan_id}: {e}")
        return None


# Global instances
db = DependencyDatabase()
plan_loader = PlanLoader()
