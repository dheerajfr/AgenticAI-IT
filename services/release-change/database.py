import sys
import os
import sqlite3
import json
from typing import List, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from shared_db.connection import get_db

class ChangeDatabase:
    def __init__(self) -> None:
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return get_db()

    def _get_suffix(self, ident: str) -> str:
        if not ident:
            return ""
        parts = ident.split("-")
        if len(parts) >= 2 and parts[-1].isdigit() and len(parts[-1]) <= 2:
            return parts[-2]
        return parts[-1]

    def _get_or_create_row(self, cursor, demand_id: str = None, release_id: str = None) -> str:
        suffix = None
        if demand_id:
            suffix = self._get_suffix(demand_id)
        elif release_id:
            suffix = self._get_suffix(release_id)
            
        if not suffix:
            raise ValueError("Must provide either demand_id or release_id")
            
        cursor.execute("SELECT demand_id, release_id FROM release_change WHERE id = ?", (suffix,))
        row = cursor.fetchone()
        if not row:
            cursor.execute(
                "INSERT INTO release_change (id, demand_id, release_id) VALUES (?, ?, ?)",
                (suffix, demand_id, release_id)
            )
        else:
            curr_demand, curr_release = row
            if demand_id and not curr_demand:
                cursor.execute("UPDATE release_change SET demand_id = ? WHERE id = ?", (demand_id, suffix))
            if release_id and not curr_release:
                cursor.execute("UPDATE release_change SET release_id = ? WHERE id = ?", (release_id, suffix))
                
        return suffix

    def _init_db(self) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            
            # Drop old tables if they exist
            old_tables = [
                'change_records', 'change_risk_scores', 'cab_packs',
                'collision_detections', 'audit_trails', 'release',
                'change_request', 'risk_assessment', 'cab',
                'release_collision', 'audit_log'
            ]
            for table in old_tables:
                cursor.execute(f"DROP TABLE IF EXISTS {table}")
            
            # Create single unified table with columns for different functions
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS release_change (
                    id TEXT PRIMARY KEY,
                    release_id TEXT,
                    demand_id TEXT,
                    change_record TEXT,
                    risk_score TEXT,
                    cab_pack TEXT,
                    collision_detection TEXT,
                    audit_trail TEXT,
                    release_data TEXT,
                    change_request TEXT,
                    risk_assessment TEXT,
                    cab TEXT,
                    release_collision TEXT,
                    audit_log TEXT
                )
                """
            )
            conn.commit()

    # Change Records
    def save_change_record(self, record_id: str, demand_id: str, plan_id: str, data: dict) -> None:
        suffix = self._get_suffix(demand_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, demand_id=demand_id)
            cursor.execute(
                "UPDATE release_change SET change_record = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_change_record(self, record_id: str) -> Optional[dict]:
        suffix = self._get_suffix(record_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT change_record FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # Risk Scores
    def save_risk_score(self, score_id: str, demand_id: str, data: dict) -> None:
        suffix = self._get_suffix(demand_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, demand_id=demand_id)
            cursor.execute(
                "UPDATE release_change SET risk_score = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_risk_score(self, score_id: str) -> Optional[dict]:
        suffix = self._get_suffix(score_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT risk_score FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # CAB Packs
    def save_cab_pack(self, pack_id: str, demand_id: str, data: dict) -> None:
        suffix = self._get_suffix(demand_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, demand_id=demand_id)
            cursor.execute(
                "UPDATE release_change SET cab_pack = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_cab_pack(self, pack_id: str) -> Optional[dict]:
        suffix = self._get_suffix(pack_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT cab_pack FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # Collision Detections
    def save_collision_detection(self, collision_id: str, demand_id: str, data: dict) -> None:
        suffix = self._get_suffix(demand_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, demand_id=demand_id)
            cursor.execute(
                "UPDATE release_change SET collision_detection = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_collision_detection(self, collision_id: str) -> Optional[dict]:
        suffix = self._get_suffix(collision_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT collision_detection FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # Audit Trails
    def save_audit_trail(self, audit_id: str, demand_id: str, data: dict) -> None:
        suffix = self._get_suffix(demand_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, demand_id=demand_id)
            cursor.execute(
                "UPDATE release_change SET audit_trail = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_audit_trail(self, audit_id: str) -> Optional[dict]:
        suffix = self._get_suffix(audit_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT audit_trail FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # Release methods
    def save_release(self, release_id: str, project_id: str, plan_id: str, build_id: str, version: str, environment: str, status: str, planned_release_date: str, actual_release_date: str, risk_score: int, cab_required: bool, cab_status: str, created_at: str, updated_at: str) -> None:
        suffix = self._get_suffix(release_id)
        data = {
            "release_id": release_id,
            "project_id": project_id,
            "plan_id": plan_id,
            "build_id": build_id,
            "version": version,
            "environment": environment,
            "status": status,
            "planned_release_date": planned_release_date,
            "actual_release_date": actual_release_date,
            "risk_score": risk_score,
            "cab_required": cab_required,
            "cab_status": cab_status,
            "created_at": created_at,
            "updated_at": updated_at
        }
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, demand_id=project_id, release_id=release_id)
            cursor.execute(
                "UPDATE release_change SET release_data = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_release(self, release_id: str) -> Optional[dict]:
        suffix = self._get_suffix(release_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT release_data FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            if not row or not row[0]:
                return None
            res = json.loads(row[0])
            if "cab_required" in res and res["cab_required"] is not None:
                res["cab_required"] = bool(res["cab_required"])
            return res

    def get_all_releases(self) -> list[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT release_data FROM release_change WHERE release_data IS NOT NULL")
            rows = cursor.fetchall()
            releases = []
            for row in rows:
                if not row[0]:
                    continue
                res = json.loads(row[0])
                if "cab_required" in res and res["cab_required"] is not None:
                    res["cab_required"] = bool(res["cab_required"])
                releases.append(res)
            releases.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return releases

    # Change Request methods
    def save_change_request(self, change_id: str, release_id: str, summary: str, business_justification: str, impact_analysis: str, deployment_plan: str, validation_plan: str, rollback_plan: str, known_issues: str, status: str, created_by: str, created_at: str) -> None:
        suffix = self._get_suffix(release_id)
        data = {
            "change_id": change_id,
            "release_id": release_id,
            "summary": summary,
            "business_justification": business_justification,
            "impact_analysis": impact_analysis,
            "deployment_plan": deployment_plan,
            "validation_plan": validation_plan,
            "rollback_plan": rollback_plan,
            "known_issues": known_issues,
            "status": status,
            "created_by": created_by,
            "created_at": created_at
        }
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, release_id=release_id)
            cursor.execute(
                "UPDATE release_change SET change_request = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_change_request(self, change_id: str) -> Optional[dict]:
        suffix = self._get_suffix(change_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT change_request FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    def get_change_request_by_release(self, release_id: str) -> Optional[dict]:
        suffix = self._get_suffix(release_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT change_request FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # Risk Assessment methods
    def save_risk_assessment(self, risk_id: str, release_id: str, database_changes: str, configuration_changes: str, security_score: int, critical_defects: int, dependency_score: int, overall_score: int, risk_level: str, recommendation: str, generated_at: str) -> None:
        suffix = self._get_suffix(release_id)
        data = {
            "risk_id": risk_id,
            "release_id": release_id,
            "database_changes": database_changes,
            "configuration_changes": configuration_changes,
            "security_score": security_score,
            "critical_defects": critical_defects,
            "dependency_score": dependency_score,
            "overall_score": overall_score,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "generated_at": generated_at
        }
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, release_id=release_id)
            cursor.execute(
                "UPDATE release_change SET risk_assessment = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_risk_assessment(self, risk_id: str) -> Optional[dict]:
        suffix = self._get_suffix(risk_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT risk_assessment FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    def get_risk_assessment_by_release(self, release_id: str) -> Optional[dict]:
        suffix = self._get_suffix(release_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT risk_assessment FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # CAB methods
    def save_cab(self, cab_id: str, release_id: str, meeting_date: str, chairperson: str, decision: str, comments: str, approved_by: str, approval_time: str) -> None:
        suffix = self._get_suffix(release_id)
        data = {
            "cab_id": cab_id,
            "release_id": release_id,
            "meeting_date": meeting_date,
            "chairperson": chairperson,
            "decision": decision,
            "comments": comments,
            "approved_by": approved_by,
            "approval_time": approval_time
        }
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, release_id=release_id)
            cursor.execute(
                "UPDATE release_change SET cab = ? WHERE id = ?",
                (json.dumps(data), suffix)
            )
            conn.commit()

    def get_cab(self, cab_id: str) -> Optional[dict]:
        suffix = self._get_suffix(cab_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT cab FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    def get_cab_by_release(self, release_id: str) -> Optional[dict]:
        suffix = self._get_suffix(release_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT cab FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row and row[0] else None

    # Release Collision methods
    def save_release_collision(self, collision_id: str, release_id: str, conflicting_release: str, shared_server: str, shared_database: str, shared_environment: str, reason: str, recommended_schedule: str, status: str) -> None:
        suffix = self._get_suffix(release_id)
        new_col = {
            "collision_id": collision_id,
            "release_id": release_id,
            "conflicting_release": conflicting_release,
            "shared_server": shared_server,
            "shared_database": shared_database,
            "shared_environment": shared_environment,
            "reason": reason,
            "recommended_schedule": recommended_schedule,
            "status": status
        }
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, release_id=release_id)
            
            cursor.execute("SELECT release_collision FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            collisions = []
            if row and row[0]:
                try:
                    collisions = json.loads(row[0])
                except Exception:
                    pass
            
            collisions = [c for c in collisions if c.get("collision_id") != collision_id]
            collisions.append(new_col)
            
            cursor.execute(
                "UPDATE release_change SET release_collision = ? WHERE id = ?",
                (json.dumps(collisions), suffix)
            )
            conn.commit()

    def get_release_collisions(self, release_id: str) -> list[dict]:
        suffix = self._get_suffix(release_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT release_collision FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            if row and row[0]:
                try:
                    return json.loads(row[0])
                except Exception:
                    pass
            return []

    # Audit Log methods
    def add_audit_log(self, audit_id: str, release_id: str, event: str, performed_by: str, timestamp: str, evidence_link: str, module_name: str) -> None:
        suffix = self._get_suffix(release_id)
        new_log = {
            "audit_id": audit_id,
            "release_id": release_id,
            "event": event,
            "performed_by": performed_by,
            "timestamp": timestamp,
            "evidence_link": evidence_link,
            "module_name": module_name
        }
        with self._conn() as conn:
            cursor = conn.cursor()
            self._get_or_create_row(cursor, release_id=release_id)
            
            cursor.execute("SELECT audit_log FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            logs = []
            if row and row[0]:
                try:
                    logs = json.loads(row[0])
                except Exception:
                    pass
                    
            logs = [l for l in logs if l.get("audit_id") != audit_id]
            logs.append(new_log)
            
            cursor.execute(
                "UPDATE release_change SET audit_log = ? WHERE id = ?",
                (json.dumps(logs), suffix)
            )
            conn.commit()

    def get_audit_logs(self, release_id: str) -> list[dict]:
        suffix = self._get_suffix(release_id)
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT audit_log FROM release_change WHERE id = ?", (suffix,))
            row = cursor.fetchone()
            logs = []
            if row and row[0]:
                try:
                    logs = json.loads(row[0])
                except Exception:
                    pass
            logs.sort(key=lambda x: x.get("timestamp", ""))
            return logs

db = ChangeDatabase()
