import sys
import os
import sqlite3
import json
from typing import List, Optional, Dict, Any

# Add the workspace root to path to import shared_db
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from services.shared_db.connection import get_db

class OpsReadinessRepository:
    def __init__(self) -> None:
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return get_db()

    def _init_db(self) -> None:
        """Creates the ops_readiness table in the shared source.db."""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS ops_readiness (
                    demand_id TEXT PRIMARY KEY,
                    data TEXT
                )
                """
            )
            conn.commit()

    def get_all_records(self) -> List[Dict[str, Any]]:
        """Retrieves all ops readiness records."""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM ops_readiness")
            rows = cursor.fetchall()
            return [json.loads(row[0]) for row in rows]

    def get_record(self, demand_id: str) -> Dict[str, Any]:
        """Retrieves the full ops readiness record for a demand ID."""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM ops_readiness WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
            return {
                "demand_id": demand_id,
                "monitoring": None,
                "handover": None,
                "validation": None
            }

    def save_record(self, demand_id: str, record: Dict[str, Any]) -> None:
        """Saves the full ops readiness record back to sqlite."""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO ops_readiness (demand_id, data) VALUES (?, ?)",
                (demand_id, json.dumps(record))
            )
            conn.commit()

        # Optional: Save a physical JSON file in an exports folder for backup/debugging
        exports_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "exports"))
        os.makedirs(exports_dir, exist_ok=True)
        export_path = os.path.join(exports_dir, f"ops_readiness_{demand_id}.json")
        try:
            with open(export_path, "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2)
        except Exception as e:
            print(f"Error exporting ops readiness JSON: {e}")

    def update_section(self, demand_id: str, section_key: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Updates a specific section (monitoring, handover, or validation) and saves."""
        record = self.get_record(demand_id)
        record[section_key] = data
        self.save_record(demand_id, record)
        return record

db = OpsReadinessRepository()
