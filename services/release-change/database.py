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
            
            # Create single unified table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS release_change (
                    id TEXT PRIMARY KEY,
                    type TEXT,
                    release_id TEXT,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            conn.commit()

    # Change Records
    def save_change_record(self, record_id: str, demand_id: str, plan_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (record_id, 'change_record', None, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_change_record(self, record_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'change_record'", (record_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Risk Scores
    def save_risk_score(self, score_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (score_id, 'risk_score', None, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_risk_score(self, score_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'risk_score'", (score_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # CAB Packs
    def save_cab_pack(self, pack_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (pack_id, 'cab_pack', None, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_cab_pack(self, pack_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'cab_pack'", (pack_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Collision Detections
    def save_collision_detection(self, collision_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (collision_id, 'collision_detection', None, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_collision_detection(self, collision_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'collision_detection'", (collision_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Audit Trails
    def save_audit_trail(self, audit_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (audit_id, 'audit_trail', None, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_audit_trail(self, audit_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'audit_trail'", (audit_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Release methods
    def save_release(self, release_id: str, project_id: str, plan_id: str, build_id: str, version: str, environment: str, status: str, planned_release_date: str, actual_release_date: str, risk_score: int, cab_required: bool, cab_status: str, created_at: str, updated_at: str) -> None:
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
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (release_id, 'release', release_id, project_id, json.dumps(data))
            )
            conn.commit()

    def get_release(self, release_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'release'", (release_id,))
            row = cursor.fetchone()
            if not row:
                return None
            res = json.loads(row[0])
            if "cab_required" in res and res["cab_required"] is not None:
                res["cab_required"] = bool(res["cab_required"])
            return res

    def get_all_releases(self) -> list[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE type = 'release'")
            rows = cursor.fetchall()
            releases = []
            for row in rows:
                res = json.loads(row[0])
                if "cab_required" in res and res["cab_required"] is not None:
                    res["cab_required"] = bool(res["cab_required"])
                releases.append(res)
            releases.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return releases

    # Change Request methods
    def save_change_request(self, change_id: str, release_id: str, summary: str, business_justification: str, impact_analysis: str, deployment_plan: str, validation_plan: str, rollback_plan: str, known_issues: str, status: str, created_by: str, created_at: str) -> None:
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
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (change_id, 'change_request', release_id, None, json.dumps(data))
            )
            conn.commit()

    def get_change_request(self, change_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'change_request'", (change_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_change_request_by_release(self, release_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE release_id = ? AND type = 'change_request'", (release_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Risk Assessment methods
    def save_risk_assessment(self, risk_id: str, release_id: str, database_changes: str, configuration_changes: str, security_score: int, critical_defects: int, dependency_score: int, overall_score: int, risk_level: str, recommendation: str, generated_at: str) -> None:
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
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (risk_id, 'risk_assessment', release_id, None, json.dumps(data))
            )
            conn.commit()

    def get_risk_assessment(self, risk_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'risk_assessment'", (risk_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_risk_assessment_by_release(self, release_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE release_id = ? AND type = 'risk_assessment'", (release_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # CAB methods
    def save_cab(self, cab_id: str, release_id: str, meeting_date: str, chairperson: str, decision: str, comments: str, approved_by: str, approval_time: str) -> None:
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
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (cab_id, 'cab', release_id, None, json.dumps(data))
            )
            conn.commit()

    def get_cab(self, cab_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE id = ? AND type = 'cab'", (cab_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_cab_by_release(self, release_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE release_id = ? AND type = 'cab'", (release_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Release Collision methods
    def save_release_collision(self, collision_id: str, release_id: str, conflicting_release: str, shared_server: str, shared_database: str, shared_environment: str, reason: str, recommended_schedule: str, status: str) -> None:
        data = {
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
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (collision_id, 'release_collision', release_id, None, json.dumps(data))
            )
            conn.commit()

    def get_release_collisions(self, release_id: str) -> list[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE release_id = ? AND type = 'release_collision'", (release_id,))
            rows = cursor.fetchall()
            return [json.loads(row[0]) for row in rows]

    # Audit Log methods
    def add_audit_log(self, audit_id: str, release_id: str, event: str, performed_by: str, timestamp: str, evidence_link: str, module_name: str) -> None:
        data = {
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
            cursor.execute(
                "INSERT OR REPLACE INTO release_change (id, type, release_id, demand_id, data) VALUES (?, ?, ?, ?, ?)",
                (audit_id, 'audit_log', release_id, None, json.dumps(data))
            )
            conn.commit()

    def get_audit_logs(self, release_id: str) -> list[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM release_change WHERE release_id = ? AND type = 'audit_log'", (release_id,))
            rows = cursor.fetchall()
            logs = [json.loads(row[0]) for row in rows]
            logs.sort(key=lambda x: x.get("timestamp", ""))
            return logs

db = ChangeDatabase()
