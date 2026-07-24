import sqlite3
import json
import os
import sys
from pathlib import Path
from typing import List, Optional, Dict

<<<<<<< HEAD
DB_PATH = Path(__file__).parent.parent / "source.db"
=======
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.append(str(_ROOT_DIR))
from shared_db.connection import get_db
>>>>>>> 806b04340c3dd1918d55fe238e058bf4afb4ea2e

def _get_conn():
    conn = get_db()
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _get_conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS vendor_records (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                sla_tracking TEXT,
                sow_discrepancies TEXT,
                access_alerts TEXT
            )
        ''')
        conn.commit()

init_db()

class DB:
    @staticmethod
    def get_by_demand(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM vendor_records WHERE demand_id = ?", (demand_id,)).fetchone()
            if row:
                d = dict(row)
                d['sla_tracking'] = json.loads(d['sla_tracking']) if d['sla_tracking'] else None
                d['sow_discrepancies'] = json.loads(d['sow_discrepancies']) if d['sow_discrepancies'] else []
                d['access_alerts'] = json.loads(d['access_alerts']) if d['access_alerts'] else []
                return d
            return None

    @staticmethod
    def save(record: Dict):
        with _get_conn() as conn:
            sla_str = json.dumps(record.get('sla_tracking')) if record.get('sla_tracking') else None
            sow_str = json.dumps(record.get('sow_discrepancies', [])) if record.get('sow_discrepancies') else None
            access_str = json.dumps(record.get('access_alerts', [])) if record.get('access_alerts') else None
            
            conn.execute('''
                INSERT INTO vendor_records (id, demand_id, sla_tracking, sow_discrepancies, access_alerts)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    sla_tracking=excluded.sla_tracking,
                    sow_discrepancies=excluded.sow_discrepancies,
                    access_alerts=excluded.access_alerts
            ''', (
                record.get('id'),
                record.get('demand_id'),
                sla_str,
                sow_str,
                access_str
            ))
            conn.commit()

db = DB()
