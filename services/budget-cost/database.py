import sqlite3
import json
import os
import uuid
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
        conn.execute('''
            CREATE TABLE IF NOT EXISTS burn_forecasts (
                id TEXT PRIMARY KEY,
                demand_id TEXT UNIQUE,
                actuals TEXT,
                forecast TEXT,
                narrative TEXT,
                variance_pct REAL,
                committed INTEGER DEFAULT 0,
                updated_at TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS invoice_matches (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                invoice_id TEXT,
                invoice_amount REAL,
                po_reference TEXT,
                sow_reference TEXT,
                delivered_items TEXT,
                match_status TEXT DEFAULT 'pending',
                discrepancies TEXT,
                ai_analysis TEXT,
                decision TEXT,
                decision_note TEXT,
                created_at TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS capex_opex_items (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                description TEXT,
                amount REAL,
                vendor TEXT,
                project_phase TEXT,
                classification TEXT,
                policy_evidence TEXT,
                ai_rationale TEXT,
                signed_off INTEGER DEFAULT 0,
                signed_off_by TEXT,
                created_at TEXT
            )
        ''')
        conn.commit()

init_db()

# ── Existing budget_records CRUD ──────────────────────────────────────────────

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

# ── Burn & Forecast CRUD ──────────────────────────────────────────────────────

class BurnDB:
    @staticmethod
    def get(demand_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM burn_forecasts WHERE demand_id = ?", (demand_id,)).fetchone()
            if row:
                d = dict(row)
                d['actuals'] = json.loads(d['actuals']) if d['actuals'] else []
                d['forecast'] = json.loads(d['forecast']) if d['forecast'] else []
                d['committed'] = bool(d['committed'])
                return d
            return None

    @staticmethod
    def upsert(demand_id: str, data: Dict):
        from datetime import datetime
        with _get_conn() as conn:
            existing = conn.execute("SELECT id FROM burn_forecasts WHERE demand_id = ?", (demand_id,)).fetchone()
            rec_id = existing['id'] if existing else f"BRN-{uuid.uuid4().hex[:8]}"
            conn.execute('''
                INSERT INTO burn_forecasts (id, demand_id, actuals, forecast, narrative, variance_pct, committed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(demand_id) DO UPDATE SET
                    actuals=excluded.actuals,
                    forecast=excluded.forecast,
                    narrative=excluded.narrative,
                    variance_pct=excluded.variance_pct,
                    committed=excluded.committed,
                    updated_at=excluded.updated_at
            ''', (
                rec_id, demand_id,
                json.dumps(data.get('actuals', [])),
                json.dumps(data.get('forecast', [])),
                data.get('narrative', ''),
                data.get('variance_pct', 0.0),
                1 if data.get('committed') else 0,
                datetime.utcnow().isoformat()
            ))
            conn.commit()

burn_db = BurnDB()

# ── Invoice & PO Match CRUD ───────────────────────────────────────────────────

class InvoiceDB:
    @staticmethod
    def get_all(demand_id: str) -> List[Dict]:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM invoice_matches WHERE demand_id = ? ORDER BY created_at DESC", (demand_id,)).fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d['delivered_items'] = json.loads(d['delivered_items']) if d['delivered_items'] else []
                d['discrepancies'] = json.loads(d['discrepancies']) if d['discrepancies'] else []
                result.append(d)
            return result

    @staticmethod
    def save(record: Dict):
        from datetime import datetime
        with _get_conn() as conn:
            conn.execute('''
                INSERT INTO invoice_matches
                    (id, demand_id, invoice_id, invoice_amount, po_reference, sow_reference,
                     delivered_items, match_status, discrepancies, ai_analysis, decision, decision_note, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    match_status=excluded.match_status,
                    discrepancies=excluded.discrepancies,
                    ai_analysis=excluded.ai_analysis,
                    decision=excluded.decision,
                    decision_note=excluded.decision_note
            ''', (
                record.get('id', f"INV-{uuid.uuid4().hex[:8]}"),
                record['demand_id'], record['invoice_id'],
                record['invoice_amount'], record['po_reference'],
                record.get('sow_reference', ''),
                json.dumps(record.get('delivered_items', [])),
                record.get('match_status', 'pending'),
                json.dumps(record.get('discrepancies', [])),
                record.get('ai_analysis', ''),
                record.get('decision', ''),
                record.get('decision_note', ''),
                record.get('created_at', datetime.utcnow().isoformat())
            ))
            conn.commit()

    @staticmethod
    def get_by_invoice_id(demand_id: str, invoice_id: str) -> Optional[Dict]:
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM invoice_matches WHERE demand_id = ? AND invoice_id = ?",
                (demand_id, invoice_id)
            ).fetchone()
            if row:
                d = dict(row)
                d['delivered_items'] = json.loads(d['delivered_items']) if d['delivered_items'] else []
                d['discrepancies'] = json.loads(d['discrepancies']) if d['discrepancies'] else []
                return d
            return None

invoice_db = InvoiceDB()

# ── Capex / Opex CRUD ─────────────────────────────────────────────────────────

class CapexOpexDB:
    @staticmethod
    def get_all(demand_id: str) -> List[Dict]:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM capex_opex_items WHERE demand_id = ? ORDER BY created_at DESC", (demand_id,)).fetchall()
            return [dict(row) for row in rows]

    @staticmethod
    def save_batch(items: List[Dict]):
        from datetime import datetime
        with _get_conn() as conn:
            for item in items:
                conn.execute('''
                    INSERT INTO capex_opex_items
                        (id, demand_id, description, amount, vendor, project_phase,
                         classification, policy_evidence, ai_rationale, signed_off, signed_off_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        classification=excluded.classification,
                        policy_evidence=excluded.policy_evidence,
                        ai_rationale=excluded.ai_rationale,
                        signed_off=excluded.signed_off,
                        signed_off_by=excluded.signed_off_by
                ''', (
                    item.get('id', f"CAP-{uuid.uuid4().hex[:8]}"),
                    item['demand_id'], item['description'], item['amount'],
                    item.get('vendor', ''), item.get('project_phase', ''),
                    item.get('classification', 'unclassified'),
                    item.get('policy_evidence', ''),
                    item.get('ai_rationale', ''),
                    1 if item.get('signed_off') else 0,
                    item.get('signed_off_by', ''),
                    item.get('created_at', datetime.utcnow().isoformat())
                ))
            conn.commit()

    @staticmethod
    def sign_off(demand_id: str, approved_by: str):
        with _get_conn() as conn:
            conn.execute(
                "UPDATE capex_opex_items SET signed_off=1, signed_off_by=? WHERE demand_id=?",
                (approved_by, demand_id)
            )
            conn.commit()

capex_db = CapexOpexDB()
