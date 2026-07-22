import sqlite3
import json
import os
from pathlib import Path
from typing import List, Optional, Dict

DB_PATH = Path(__file__).parent / "reporting_communication.db"

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _get_conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS report_records (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                exec_summary TEXT,
                communications TEXT
            )
        ''')
        conn.commit()

init_db()

class DB:
    @staticmethod
    def get_by_demand(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM report_records WHERE demand_id = ?", (demand_id,)).fetchone()
            if row:
                d = dict(row)
                d['exec_summary'] = json.loads(d['exec_summary']) if d['exec_summary'] else None
                d['communications'] = json.loads(d['communications']) if d['communications'] else []
                return d
            return None

    @staticmethod
    def save(record: Dict):
        with _get_conn() as conn:
            exec_str = json.dumps(record.get('exec_summary')) if record.get('exec_summary') else None
            comm_str = json.dumps(record.get('communications', [])) if record.get('communications') else None
            
            conn.execute('''
                INSERT INTO report_records (id, demand_id, exec_summary, communications)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    exec_summary=excluded.exec_summary,
                    communications=excluded.communications
            ''', (
                record.get('id'),
                record.get('demand_id'),
                exec_str,
                comm_str
            ))
            conn.commit()

db = DB()
