import sqlite3
import json
import os
from pathlib import Path
from typing import List, Optional, Dict

DB_PATH = Path(__file__).parent / "budget_cost.db"

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _get_conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS budget_records (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                cost_estimation TEXT,
                variances TEXT,
                roi_model TEXT
            )
        ''')
        conn.commit()

init_db()

class DB:
    @staticmethod
    def get_by_demand(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM budget_records WHERE demand_id = ?", (demand_id,)).fetchone()
            if row:
                d = dict(row)
                d['cost_estimation'] = json.loads(d['cost_estimation']) if d['cost_estimation'] else None
                d['variances'] = json.loads(d['variances']) if d['variances'] else []
                d['roi_model'] = json.loads(d['roi_model']) if d['roi_model'] else None
                return d
            return None

    @staticmethod
    def save(record: Dict):
        with _get_conn() as conn:
            cost_str = json.dumps(record.get('cost_estimation')) if record.get('cost_estimation') else None
            var_str = json.dumps(record.get('variances', [])) if record.get('variances') else None
            roi_str = json.dumps(record.get('roi_model')) if record.get('roi_model') else None
            
            conn.execute('''
                INSERT INTO budget_records (id, demand_id, cost_estimation, variances, roi_model)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    cost_estimation=excluded.cost_estimation,
                    variances=excluded.variances,
                    roi_model=excluded.roi_model
            ''', (
                record.get('id'),
                record.get('demand_id'),
                cost_str,
                var_str,
                roi_str
            ))
            conn.commit()

db = DB()
