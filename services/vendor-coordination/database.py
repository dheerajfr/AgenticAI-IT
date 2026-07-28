import sqlite3
import json
import os
import sys
from pathlib import Path
from typing import List, Optional, Dict

_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.append(str(_ROOT_DIR))
from shared_db.connection import get_db

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
        conn.execute('''
            CREATE TABLE IF NOT EXISTS vendor_checklists (
                request_id TEXT PRIMARY KEY,
                demand_id TEXT,
                vendor_employee_name TEXT,
                onboarding_type TEXT,
                status TEXT,
                checklist_items TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS normalized_status_reports (
                id TEXT PRIMARY KEY,
                demand_id TEXT,
                vendor_name TEXT,
                reporting_period TEXT,
                overall_status TEXT,
                key_achievements TEXT,
                risks_escalations TEXT,
                metrics TEXT,
                parsed_at TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS onboarding_checklist_templates (
                onboarding_type TEXT,
                step_name TEXT,
                sort_order INTEGER,
                PRIMARY KEY (onboarding_type, step_name)
            )
        ''')
        cursor = conn.execute("SELECT COUNT(*) FROM onboarding_checklist_templates")
        if cursor.fetchone()[0] == 0:
            templates = [
                ("join", "NDA Signature", 1),
                ("join", "Compliance Training", 2),
                ("join", "IAM Account Created", 3),
                ("join", "VPN Access Configured", 4),
                ("leave", "Equipment Returned", 1),
                ("leave", "ITSM Revocation Ticket Opened", 2),
                ("leave", "IAM Account Deactivated", 3),
                ("leave", "Security Exit Interview", 4),
            ]
            conn.executemany('''
                INSERT INTO onboarding_checklist_templates (onboarding_type, step_name, sort_order)
                VALUES (?, ?, ?)
            ''', templates)
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

    @staticmethod
    def get_checklists(demand_id: str) -> List[Dict]:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM vendor_checklists WHERE demand_id = ?", (demand_id,)).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d['checklist_items'] = json.loads(d['checklist_items']) if d['checklist_items'] else []
                results.append(d)
            return results

    @staticmethod
    def save_checklist(checklist: Dict):
        with _get_conn() as conn:
            items_str = json.dumps(checklist.get('checklist_items', []))
            conn.execute('''
                INSERT INTO vendor_checklists (request_id, demand_id, vendor_employee_name, onboarding_type, status, checklist_items)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(request_id) DO UPDATE SET
                    status=excluded.status,
                    checklist_items=excluded.checklist_items
            ''', (
                checklist.get('request_id'),
                checklist.get('demand_id'),
                checklist.get('vendor_employee_name'),
                checklist.get('onboarding_type'),
                checklist.get('status'),
                items_str
            ))
            conn.commit()

    @staticmethod
    def get_reports(demand_id: str) -> List[Dict]:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM normalized_status_reports WHERE demand_id = ?", (demand_id,)).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d['key_achievements'] = json.loads(d['key_achievements']) if d['key_achievements'] else []
                d['risks_escalations'] = json.loads(d['risks_escalations']) if d['risks_escalations'] else []
                d['metrics'] = json.loads(d['metrics']) if d['metrics'] else {}
                results.append(d)
            return results

    @staticmethod
    def save_report(report: Dict):
        with _get_conn() as conn:
            ach_str = json.dumps(report.get('key_achievements', []))
            risk_str = json.dumps(report.get('risks_escalations', []))
            met_str = json.dumps(report.get('metrics', {}))
            conn.execute('''
                INSERT INTO normalized_status_reports (id, demand_id, vendor_name, reporting_period, overall_status, key_achievements, risks_escalations, metrics, parsed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    overall_status=excluded.overall_status,
                    key_achievements=excluded.key_achievements,
                    risks_escalations=excluded.risks_escalations,
                    metrics=excluded.metrics
            ''', (
                report.get('id'),
                report.get('demand_id'),
                report.get('vendor_name'),
                report.get('reporting_period'),
                report.get('overall_status'),
                ach_str,
                risk_str,
                met_str,
                report.get('parsed_at')
            ))
            conn.commit()

    @staticmethod
    def get_checklist_template(onboarding_type: str) -> List[Dict]:
        with _get_conn() as conn:
            rows = conn.execute(
                "SELECT step_name FROM onboarding_checklist_templates WHERE onboarding_type = ? ORDER BY sort_order ASC",
                (onboarding_type,)
            ).fetchall()
            return [{"step_name": r["step_name"], "completed": False} for r in rows]

db = DB()
