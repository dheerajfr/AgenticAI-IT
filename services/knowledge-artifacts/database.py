import sqlite3
import json
import os
from pathlib import Path
from typing import List, Optional, Dict

DB_PATH = Path(__file__).parent.parent / "source.db"

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _get_conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS knowledge_records (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                lessons_learned TEXT,
                indexed_artefacts TEXT,
                onboarding_updates TEXT
            )
        ''')
        conn.commit()

init_db()

class DB:
    @staticmethod
    def get_by_demand(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM knowledge_records WHERE demand_id = ?", (demand_id,)).fetchone()
            if row:
                d = dict(row)
                d['lessons_learned'] = json.loads(d['lessons_learned']) if d['lessons_learned'] else []
                d['indexed_artefacts'] = json.loads(d['indexed_artefacts']) if d['indexed_artefacts'] else []
                d['onboarding_updates'] = json.loads(d['onboarding_updates']) if d['onboarding_updates'] else []
                return d
            return None

    @staticmethod
    def save(record: Dict):
        with _get_conn() as conn:
            lessons_str = json.dumps(record.get('lessons_learned', [])) if record.get('lessons_learned') else None
            idx_str = json.dumps(record.get('indexed_artefacts', [])) if record.get('indexed_artefacts') else None
            onb_str = json.dumps(record.get('onboarding_updates', [])) if record.get('onboarding_updates') else None
            
            conn.execute('''
                INSERT INTO knowledge_records (id, demand_id, lessons_learned, indexed_artefacts, onboarding_updates)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    lessons_learned=excluded.lessons_learned,
                    indexed_artefacts=excluded.indexed_artefacts,
                    onboarding_updates=excluded.onboarding_updates
            ''', (
                record.get('id'),
                record.get('demand_id'),
                lessons_str,
                idx_str,
                onb_str
            ))
            conn.commit()

db = DB()
