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
                    component_id TEXT,
                    environment TEXT,
                    data TEXT,
                    PRIMARY KEY (component_id, environment)
                )
            ''')
            conn.commit()

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
                            "INSERT INTO environments (component_id, environment, data) VALUES (?, ?, ?)",
                            (record.component_id, record.environment, record.model_dump_json())
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

    def get_by_id_and_env(self, component_id: str, environment: str) -> Optional[EnvironmentStateRecord]:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM environments WHERE component_id = ? AND environment = ?", (component_id, environment))
            row = cursor.fetchone()
            if row:
                return EnvironmentStateRecord.model_validate_json(row[0])
            return None

    def save(self, record: EnvironmentStateRecord) -> EnvironmentStateRecord:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO environments (component_id, environment, data) 
                VALUES (?, ?, ?) 
                ON CONFLICT(component_id, environment) DO UPDATE SET data=excluded.data
                """,
                (record.component_id, record.environment, record.model_dump_json())
            )
            conn.commit()
        return record

# Initialize the global repository singleton
db = EnvironmentDatabase()
