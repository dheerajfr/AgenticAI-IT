import sqlite3
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict

DB_PATH = Path(__file__).parent / "knowledge_artifacts.db"

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    with _get_conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS knowledge_records (
                id                TEXT PRIMARY KEY,
                demand_id         TEXT UNIQUE,
                lessons_learned   TEXT,
                indexed_artefacts TEXT,
                onboarding_updates TEXT
            )
        ''')
        # Check if validated_qas column exists, if not, add it
        try:
            conn.execute("SELECT validated_qas FROM knowledge_records LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE knowledge_records ADD COLUMN validated_qas TEXT")
        conn.commit()

init_db()

# ==========================================
# DB class
# ==========================================

class DB:
    @staticmethod
    def get_by_demand(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM knowledge_records WHERE demand_id = ?", (demand_id,)
            ).fetchone()
            if row:
                d = dict(row)
                d['lessons_learned']    = json.loads(d['lessons_learned'])    if d['lessons_learned']    else []
                d['indexed_artefacts']  = json.loads(d['indexed_artefacts'])  if d['indexed_artefacts']  else []
                d['onboarding_updates'] = json.loads(d['onboarding_updates']) if d['onboarding_updates'] else []
                # Handle migrations for newly added validated_qas field
                d['validated_qas']      = json.loads(d['validated_qas'])      if ('validated_qas' in d and d['validated_qas']) else []
                return d
            return None

    @staticmethod
    def save(record: Dict) -> None:
        """Persist a full knowledge record. Always serialises all list fields."""
        with _get_conn() as conn:
            conn.execute('''
                INSERT INTO knowledge_records
                    (id, demand_id, lessons_learned, indexed_artefacts, onboarding_updates, validated_qas)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    lessons_learned    = excluded.lessons_learned,
                    indexed_artefacts  = excluded.indexed_artefacts,
                    onboarding_updates = excluded.onboarding_updates,
                    validated_qas      = excluded.validated_qas
            ''', (
                record.get('id'),
                record.get('demand_id'),
                json.dumps(record.get('lessons_learned')    or []),
                json.dumps(record.get('indexed_artefacts')  or []),
                json.dumps(record.get('onboarding_updates') or []),
                json.dumps(record.get('validated_qas')        or []),
            ))
            conn.commit()

    @staticmethod
    def add_artefact(demand_id: str, artefact: dict) -> dict:
        """
        Register a new artefact for a demand.
        Upserts by name — if an artefact with the same name already exists it is replaced.
        """
        record = DB.get_by_demand(demand_id)
        if not record:
            record = {
                "id": f"KNO-{uuid.uuid4().hex[:8]}",
                "demand_id": demand_id,
                "lessons_learned": [],
                "indexed_artefacts": [],
                "onboarding_updates": []
            }

        artefacts = record.get("indexed_artefacts", [])
        artefacts = [a for a in artefacts if a.get("name") != artefact.get("name")]
        artefacts.append(artefact)
        record["indexed_artefacts"] = artefacts
        DB.save(record)
        return record

    @staticmethod
    def approve_artefact(demand_id: str, artefact_name: str, approved_by: str) -> Optional[dict]:
        """
        Human approval gate — marks an artefact as approved and records who approved it.
        Returns the updated record, or None if the demand / artefact is not found.
        """
        record = DB.get_by_demand(demand_id)
        if not record:
            return None

        artefacts = record.get("indexed_artefacts", [])
        found = False
        for a in artefacts:
            if a.get("name") == artefact_name:
                a["status"]      = "approved"
                a["approved_by"] = approved_by
                a["approved_at"] = datetime.now(timezone.utc).isoformat()
                found = True

        if not found:
            return None

        record["indexed_artefacts"] = artefacts
        DB.save(record)
        return record

    @staticmethod
    def delete_artefact(demand_id: str, artefact_name: str) -> bool:
        """Remove an artefact from the index by name. Returns True if removed."""
        record = DB.get_by_demand(demand_id)
        if not record:
            return False
        artefacts = record.get("indexed_artefacts", [])
        new_artefacts = [a for a in artefacts if a.get("name") != artefact_name]
        if len(new_artefacts) == len(artefacts):
            return False  # nothing removed
        record["indexed_artefacts"] = new_artefacts
        DB.save(record)
        return True

db = DB()
