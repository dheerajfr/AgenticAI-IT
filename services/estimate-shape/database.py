import os
import json
import sqlite3
from typing import List, Optional, Dict
from models import EstimateRecord

class EstimateDatabase:
    def __init__(self):
        self.db_path = os.path.join(os.path.dirname(__file__), "estimate.db")
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS estimates (
                    estimate_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    data TEXT
                )
            ''')
            conn.commit()
            
            # Check if empty, then seed
            cursor.execute('SELECT COUNT(*) FROM estimates')
            if cursor.fetchone()[0] == 0:
                self._load_fixtures(conn)

    def _load_fixtures(self, conn):
        fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        if not os.path.exists(fixtures_dir):
            print(f"Fixtures directory not found at: {fixtures_dir}")
            return
            
        cursor = conn.cursor()
        count = 0
        for filename in os.listdir(fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        record = EstimateRecord(**data)
                        cursor.execute(
                            "INSERT INTO estimates (estimate_id, demand_id, data) VALUES (?, ?, ?)",
                            (record.estimate_id, record.demand_id, record.model_dump_json())
                        )
                        count += 1
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        conn.commit()
        print(f"Initialized SQLite database with {count} records from fixtures.")

    def get_all(self) -> List[EstimateRecord]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM estimates")
            rows = cursor.fetchall()
            return [EstimateRecord.model_validate_json(row[0]) for row in rows]

    def get_by_id(self, estimate_id: str) -> Optional[EstimateRecord]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM estimates WHERE estimate_id = ?", (estimate_id,))
            row = cursor.fetchone()
            if row:
                return EstimateRecord.model_validate_json(row[0])
            return None

    def get_by_demand_id(self, demand_id: str) -> List[EstimateRecord]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,))
            rows = cursor.fetchall()
            return [EstimateRecord.model_validate_json(row[0]) for row in rows]

    def save(self, record: EstimateRecord):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO estimates (estimate_id, demand_id, data) 
                VALUES (?, ?, ?) 
                ON CONFLICT(estimate_id) DO UPDATE SET data=excluded.data, demand_id=excluded.demand_id
                """,
                (record.estimate_id, record.demand_id, record.model_dump_json())
            )
            conn.commit()

    def delete(self, estimate_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM estimates WHERE estimate_id = ?", (estimate_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
            return deleted

# Global instance
db = EstimateDatabase()
