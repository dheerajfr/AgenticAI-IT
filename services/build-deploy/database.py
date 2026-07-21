import os
import json
import sqlite3
from typing import List, Optional, Type, TypeVar
from pydantic import BaseModel

from models import RunbookRecord, CutoverSession, DeploymentRecord, ReleaseReadinessCheck, RollbackPlan

T = TypeVar("T", bound=BaseModel)

DB_PATH = os.path.join(os.path.dirname(__file__), "build-deploy.db")
FIXTURES_ROOT = os.path.join(os.path.dirname(__file__), "fixtures")


class JsonRecordTable:
    """
    Generic helper for storing a Pydantic model as a JSON blob keyed by its id field.
    Shared by every function in this service (runbooks, cutover sessions, and -
    once added - deployment orchestration / release-readiness / rollback-readiness)
    so each owner just instantiates one of these per table instead of hand-rolling
    SQLite plumbing. Each function gets its own table, so there's nothing to
    merge-conflict over.
    """

    def __init__(self, table_name: str, id_field: str, model: Type[T], db_path: str = DB_PATH):
        self.table_name = table_name
        self.id_field = id_field
        self.model = model
        self.db_path = db_path
        self._init_table()

    def _init_table(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f'''
                CREATE TABLE IF NOT EXISTS {self.table_name} (
                    {self.id_field} TEXT PRIMARY KEY,
                    data TEXT
                )
            ''')
            conn.commit()

    def load_fixtures(self, fixtures_dir: str):
        if not os.path.exists(fixtures_dir):
            return
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT COUNT(*) FROM {self.table_name}")
            if cursor.fetchone()[0] != 0:
                return
            count = 0
            for filename in sorted(os.listdir(fixtures_dir)):
                if not filename.endswith(".json"):
                    continue
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    record = self.model(**data)
                    record_id = getattr(record, self.id_field)
                    cursor.execute(
                        f"INSERT INTO {self.table_name} ({self.id_field}, data) VALUES (?, ?)",
                        (record_id, record.model_dump_json())
                    )
                    count += 1
                except Exception as e:
                    print(f"Error loading fixture {filename} into {self.table_name}: {e}")
            conn.commit()
            print(f"Initialized {self.table_name} with {count} records from fixtures.")

    def get_all(self) -> List[T]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT data FROM {self.table_name} ORDER BY {self.id_field}")
            rows = cursor.fetchall()
            return [self.model.model_validate_json(row[0]) for row in rows]

    def get_by_id(self, record_id: str) -> Optional[T]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT data FROM {self.table_name} WHERE {self.id_field} = ?", (record_id,))
            row = cursor.fetchone()
            return self.model.model_validate_json(row[0]) if row else None

    def save(self, record: T) -> T:
        record_id = getattr(record, self.id_field)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                f"""
                INSERT INTO {self.table_name} ({self.id_field}, data)
                VALUES (?, ?)
                ON CONFLICT({self.id_field}) DO UPDATE SET data=excluded.data
                """,
                (record_id, record.model_dump_json())
            )
            conn.commit()
        return record

    def delete(self, record_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"DELETE FROM {self.table_name} WHERE {self.id_field} = ?", (record_id,))
            conn.commit()
            return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Table instances - one per function.
# ---------------------------------------------------------------------------

runbooks_db = JsonRecordTable("runbooks", "runbook_id", RunbookRecord)
runbooks_db.load_fixtures(os.path.join(FIXTURES_ROOT, "runbooks"))

cutover_db = JsonRecordTable("cutover_sessions", "cutover_id", CutoverSession)
cutover_db.load_fixtures(os.path.join(FIXTURES_ROOT, "cutover"))

release_readiness_db = JsonRecordTable("release_readiness_checks", "check_id", ReleaseReadinessCheck)
release_readiness_db.load_fixtures(os.path.join(FIXTURES_ROOT, "release-readiness"))

rollback_readiness_db = JsonRecordTable("rollback_plans", "rollback_id", RollbackPlan)
rollback_readiness_db.load_fixtures(os.path.join(FIXTURES_ROOT, "rollback-readiness"))

deployments_db = JsonRecordTable("deployments", "deployment_id", DeploymentRecord)
deployments_db.load_fixtures(os.path.join(FIXTURES_ROOT, "deployments"))


# ---------------------------------------------------------------------------
# Cross-service read: Module 05 (Config & environments) owns drift/baseline
# state. Read its SQLite db directly, matching the PlanLoader pattern in
# services/dependencies/database.py. Returns a plain dict (not a pydantic
# model import) so this service has zero import-time coupling to Module 05.
# ---------------------------------------------------------------------------

def read_environment_state(component_id: str, environment: str) -> Optional[dict]:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    try:
        from shared_db.connection import get_db
    except ImportError:
        print("Error: Could not import shared_db.connection")
        return None

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT data FROM environments WHERE environment = ?",
                (environment,)
            )
            for row in cursor.fetchall():
                data = json.loads(row[0])
                if component_id in (data.get("demand_id"), data.get("cmdb_name"), data.get("observed_name")):
                    return data
            return None
    except Exception as e:
        print(f"Error reading shared DB for environments of {component_id}/{environment}: {e}")
        return None

def fetch_runbook_context(demand_id: str, component_id: str, environment: str) -> dict:
    context = {
        "risk_level": "unknown",
        "risk_factors": [],
        "owners": [],
        "dependencies": [],
        "expected_requirements": []
    }
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "source.db"))
    if not os.path.exists(db_path):
        return context
    
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            
            try:
                cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
                row = cursor.fetchone()
                if row:
                    data = json.loads(row[0])
                    context["risk_level"] = data.get("risk_level", "unknown")
            except Exception: pass
            
            try:
                cursor.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,))
                row = cursor.fetchone()
                if row:
                    data = json.loads(row[0])
                    context["risk_factors"] = data.get("risk_factors", [])
            except Exception: pass
            
            try:
                cursor.execute("SELECT data FROM plans WHERE demand_id = ?", (demand_id,))
                for row in cursor.fetchall():
                    data = json.loads(row[0])
                    for task in data.get("tasks", []):
                        if task.get("owner"):
                            for o in task["owner"].split(","):
                                o = o.strip()
                                if o and o not in context["owners"] and "unassigned" not in o.lower():
                                    context["owners"].append(o)
            except Exception: pass
            
            try:
                cursor.execute("SELECT data FROM dependencies")
                for row in cursor.fetchall():
                    data = json.loads(row[0])
                    if data.get("source_demand_id") == demand_id or data.get("target_demand_id") == demand_id:
                        context["dependencies"].append(data)
            except Exception: pass
            
            try:
                cursor.execute("SELECT data FROM environments WHERE environment = ?", (environment,))
                for row in cursor.fetchall():
                    data = json.loads(row[0])
                    if component_id in (data.get("demand_id"), data.get("cmdb_name"), data.get("observed_name"), data.get("component_id")):
                        context["expected_requirements"] = data.get("expected_requirements", [])
                        break
            except Exception: pass
            
    except Exception as e:
        print(f"Error fetching runbook context: {e}")
        
    return context
