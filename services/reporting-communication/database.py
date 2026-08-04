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
            CREATE TABLE IF NOT EXISTS report_records (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                exec_summary TEXT,
                communications TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS meeting_actions (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                type TEXT,
                description TEXT,
                owner TEXT,
                status TEXT DEFAULT 'Open',
                due_date TEXT,
                created_at TEXT
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

class MeetingActionsDB:
    @staticmethod
    def get_by_demand(demand_id: str) -> List[Dict]:
        with _get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM meeting_actions WHERE demand_id = ? ORDER BY created_at DESC",
                (demand_id,)
            ).fetchall()
            return [dict(row) for row in rows]

    @staticmethod
    def get_by_id(action_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM meeting_actions WHERE id = ?", (action_id,)).fetchone()
            return dict(row) if row else None

    @staticmethod
    def save(action: Dict):
        with _get_conn() as conn:
            conn.execute('''
                INSERT INTO meeting_actions (id, demand_id, type, description, owner, status, due_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    type=excluded.type,
                    description=excluded.description,
                    owner=excluded.owner,
                    status=excluded.status,
                    due_date=excluded.due_date
            ''', (
                action.get('id'),
                action.get('demand_id'),
                action.get('type', 'action_item'),
                action.get('description', ''),
                action.get('owner', 'Unassigned'),
                action.get('status', 'Open'),
                action.get('due_date', ''),
                action.get('created_at')
            ))
            conn.commit()

meeting_actions_db = MeetingActionsDB()
