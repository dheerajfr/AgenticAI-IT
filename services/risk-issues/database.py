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
            CREATE TABLE IF NOT EXISTS risk_records (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                sensing_data TEXT,
                issues TEXT,
                mitigations TEXT
            )
        ''')
        conn.commit()

init_db()

class DB:
    @staticmethod
    def get_by_demand(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM risk_records WHERE demand_id = ?", (demand_id,)).fetchone()
            if row:
                d = dict(row)
                d['sensing_data'] = json.loads(d['sensing_data']) if d['sensing_data'] else None
                d['issues'] = json.loads(d['issues']) if d['issues'] else []
                d['mitigations'] = json.loads(d['mitigations']) if d['mitigations'] else {}
                return d
            return None

    @staticmethod
    def save(record: Dict):
        with _get_conn() as conn:
            sensing_str = json.dumps(record.get('sensing_data', {})) if record.get('sensing_data') else None
            issues_str = json.dumps(record.get('issues', [])) if record.get('issues') else None
            mitigations_str = json.dumps(record.get('mitigations', {})) if record.get('mitigations') else None
            
            conn.execute('''
                INSERT INTO risk_records (id, demand_id, sensing_data, issues, mitigations)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    sensing_data=excluded.sensing_data,
                    issues=excluded.issues,
                    mitigations=excluded.mitigations
            ''', (
                record.get('id'),
                record.get('demand_id'),
                sensing_str,
                issues_str,
                mitigations_str
            ))
            conn.commit()

db = DB()
