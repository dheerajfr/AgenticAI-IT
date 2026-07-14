import os
import json
import sqlite3
from typing import List, Optional
from models import EnvironmentStateRecord
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from shared_db.connection import get_db

class EnvironmentDatabase:
    def __init__(self):
        self._init_db()

    def _init_db(self):
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS environments (
                    demand_id TEXT,
                    environment TEXT,
                    data TEXT,
                    PRIMARY KEY (demand_id, environment)
                )
            ''')
            conn.commit()

            # Check if empty, then seed
            cursor.execute('SELECT COUNT(*) FROM environments')
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
                        record = EnvironmentStateRecord(**data)
                        cursor.execute(
                            "INSERT INTO environments (demand_id, environment, data) VALUES (?, ?, ?)",
                            (record.demand_id, record.environment, record.model_dump_json())
                        )
                        count += 1
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        conn.commit()
        print(f"Initialized SQLite database with {count} records from fixtures.")

    def get_all(self) -> List[EnvironmentStateRecord]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM environments")
            rows = cursor.fetchall()
            return [EnvironmentStateRecord.model_validate_json(row[0]) for row in rows]

    def get_by_demand_and_env(self, demand_id: str, environment: str) -> Optional[EnvironmentStateRecord]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM environments WHERE demand_id = ? AND environment = ?", (demand_id, environment))
            row = cursor.fetchone()
            if row:
                return EnvironmentStateRecord.model_validate_json(row[0])
            return None

    def get_by_demand_id(self, demand_id: str) -> List[EnvironmentStateRecord]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM environments WHERE demand_id = ?", (demand_id,))
            rows = cursor.fetchall()
            return [EnvironmentStateRecord.model_validate_json(row[0]) for row in rows]

    def save(self, record: EnvironmentStateRecord) -> EnvironmentStateRecord:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO environments (demand_id, environment, data) 
                VALUES (?, ?, ?) 
                ON CONFLICT(demand_id, environment) DO UPDATE SET data=excluded.data
                """,
                (record.demand_id, record.environment, record.model_dump_json())
            )
            conn.commit()
        return record

# Initialize the global repository singleton
db = EnvironmentDatabase()
