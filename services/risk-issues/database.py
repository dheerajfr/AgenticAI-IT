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
        # risk_records existed before risks/health_score (and project_summary/
        # timeline) were tracked as real columns; CREATE TABLE IF NOT EXISTS
        # won't retrofit columns onto an already-created table. Check via
        # PRAGMA table_info first so this is safe to run repeatedly against an
        # existing DB (mirrors the po_amount migration pattern in
        # services/budget-cost/database.py).
        existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(risk_records)").fetchall()}
        if "risks" not in existing_cols:
            conn.execute("ALTER TABLE risk_records ADD COLUMN risks TEXT")
        if "health_score" not in existing_cols:
            conn.execute("ALTER TABLE risk_records ADD COLUMN health_score INTEGER")
        if "project_summary" not in existing_cols:
            conn.execute("ALTER TABLE risk_records ADD COLUMN project_summary TEXT")
        if "timeline" not in existing_cols:
            conn.execute("ALTER TABLE risk_records ADD COLUMN timeline TEXT")
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
                # Mitigations are always a list (one entry per drafted mitigation);
                # the old `{}` fallback here is what forced main.py to defensively
                # coerce dict->list on every read.
                d['mitigations'] = json.loads(d['mitigations']) if d['mitigations'] else []
                d['risks'] = json.loads(d['risks']) if d.get('risks') else []
                d['health_score'] = d['health_score'] if d.get('health_score') is not None else 100
                d['project_summary'] = json.loads(d['project_summary']) if d.get('project_summary') else {}
                d['timeline'] = json.loads(d['timeline']) if d.get('timeline') else []
                return d
            return None

    @staticmethod
    def save(record: Dict):
        with _get_conn() as conn:
            sensing_str = json.dumps(record.get('sensing_data', {})) if record.get('sensing_data') else None
            issues_str = json.dumps(record.get('issues', [])) if record.get('issues') else None
            mitigations_str = json.dumps(record.get('mitigations', [])) if record.get('mitigations') else None
            risks_str = json.dumps(record.get('risks', [])) if record.get('risks') else None
            project_summary_str = json.dumps(record.get('project_summary', {})) if record.get('project_summary') else None
            timeline_str = json.dumps(record.get('timeline', [])) if record.get('timeline') else None
            health_score = record.get('health_score', 100)

            conn.execute('''
                INSERT INTO risk_records (id, demand_id, sensing_data, issues, mitigations, risks, health_score, project_summary, timeline)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    sensing_data=excluded.sensing_data,
                    issues=excluded.issues,
                    mitigations=excluded.mitigations,
                    risks=excluded.risks,
                    health_score=excluded.health_score,
                    project_summary=excluded.project_summary,
                    timeline=excluded.timeline
            ''', (
                record.get('id'),
                record.get('demand_id'),
                sensing_str,
                issues_str,
                mitigations_str,
                risks_str,
                health_score,
                project_summary_str,
                timeline_str
            ))
            conn.commit()

db = DB()
