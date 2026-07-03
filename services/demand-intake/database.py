import os
import json
import sqlite3
from typing import Dict, List, Optional
from models import DemandRecord

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
            
            # Check if empty, then seed
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

# Initialize the global repository singleton
FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "fixtures")
db = DemandDatabase(FIXTURES_PATH)
