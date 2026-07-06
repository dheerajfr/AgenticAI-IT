import os
import json
import sqlite3
from typing import Dict, List, Optional
from models import DemandRecord


# ---------------------------------------------------------------------------
# DemandDatabase — backed by demand.db
# ---------------------------------------------------------------------------

class DemandDatabase:
    def __init__(self, fixtures_dir: str):
        self.fixtures_dir = fixtures_dir
        self.db_path = os.path.join(os.path.dirname(__file__), "demand.db")
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
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
        print(f"Initialized demand.db with {count} records from fixtures.")

    def get_all(self) -> List[DemandRecord]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands ORDER BY demand_id")
            rows = cursor.fetchall()
            return [DemandRecord.model_validate_json(row[0]) for row in rows]

    def get_by_id(self, demand_id: str) -> Optional[DemandRecord]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                return DemandRecord.model_validate_json(row[0])
            return None

    def save(self, record: DemandRecord) -> DemandRecord:
        with sqlite3.connect(self.db_path) as conn:
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
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM demands WHERE demand_id = ?", (demand_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
            return deleted


# ---------------------------------------------------------------------------
# ResourceDatabase — backed by resource.db (separate file)
# ---------------------------------------------------------------------------

class ResourceDatabase:
    def __init__(self, fixtures_dir: str):
        self.fixtures_dir = fixtures_dir
        self.db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "resource.db"))
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS resources (
                    name TEXT PRIMARY KEY,
                    role TEXT,
                    skills TEXT,
                    total_capacity INTEGER,
                    allocated_capacity INTEGER
                )
            ''')
            conn.commit()

            # Seed from resources.json if table is empty
            cursor.execute('SELECT COUNT(*) FROM resources')
            if cursor.fetchone()[0] == 0:
                self._seed_resources(conn)

    def _seed_resources(self, conn):
        resources_path = os.path.join(self.fixtures_dir, "resources.json")
        if not os.path.exists(resources_path):
            print(f"Resources seed file not found at: {resources_path}")
            return

        try:
            with open(resources_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                cursor = conn.cursor()
                rows = [
                    (
                        res["name"],
                        res["role"],
                        json.dumps(res["skills"]),
                        res["total_capacity"],
                        res["allocated_capacity"],
                    )
                    for res in data
                ]
                cursor.executemany(
                    "INSERT OR REPLACE INTO resources "
                    "(name, role, skills, total_capacity, allocated_capacity) "
                    "VALUES (?, ?, ?, ?, ?)",
                    rows,
                )
                conn.commit()
                print(f"Initialized resource.db with {len(rows)} records from {resources_path}.")
        except Exception as e:
            print(f"Error seeding resource.db: {e}")

    def get_all_resources(self) -> List[dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name, role, skills, total_capacity, allocated_capacity FROM resources"
            )
            rows = cursor.fetchall()
            return [
                {
                    "name": row[0],
                    "role": row[1],
                    "skills": json.loads(row[2]),
                    "total_capacity": row[3],
                    "allocated_capacity": row[4],
                }
                for row in rows
            ]

    def save_resource(self, resource: dict) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO resources
                (name, role, skills, total_capacity, allocated_capacity)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    resource["name"],
                    resource["role"],
                    json.dumps(resource["skills"]),
                    resource["total_capacity"],
                    resource["allocated_capacity"],
                ),
            )
            conn.commit()
        return resource

    def delete_resource(self, name: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM resources WHERE name = ?", (name,))
            deleted = cursor.rowcount > 0
            conn.commit()
            return deleted


# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "fixtures")

db = DemandDatabase(FIXTURES_PATH)
resource_db = ResourceDatabase(FIXTURES_PATH)
