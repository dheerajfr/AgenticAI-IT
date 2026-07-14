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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS change_records (
                    change_record_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    plan_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS change_risk_scores (
                    risk_score_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cab_packs (
                    cab_pack_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS collision_detections (
                    collision_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_trails (
                    audit_id TEXT PRIMARY KEY,
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
                "INSERT OR REPLACE INTO change_records (change_record_id, demand_id, plan_id, data) VALUES (?, ?, ?, ?)",
                (record_id, demand_id, plan_id, json.dumps(data)),
            )
            conn.commit()

    def get_change_record(self, record_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM change_records WHERE change_record_id = ?", (record_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Risk Scores
    def save_risk_score(self, score_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO change_risk_scores (risk_score_id, demand_id, data) VALUES (?, ?, ?)",
                (score_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_risk_score(self, score_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM change_risk_scores WHERE risk_score_id = ?", (score_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # CAB Packs
    def save_cab_pack(self, pack_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO cab_packs (cab_pack_id, demand_id, data) VALUES (?, ?, ?)",
                (pack_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_cab_pack(self, pack_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM cab_packs WHERE cab_pack_id = ?", (pack_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Collision Detections
    def save_collision_detection(self, collision_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO collision_detections (collision_id, demand_id, data) VALUES (?, ?, ?)",
                (collision_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_collision_detection(self, collision_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM collision_detections WHERE collision_id = ?", (collision_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    # Audit Trails
    def save_audit_trail(self, audit_id: str, demand_id: str, data: dict) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO audit_trails (audit_id, demand_id, data) VALUES (?, ?, ?)",
                (audit_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_audit_trail(self, audit_id: str) -> Optional[dict]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM audit_trails WHERE audit_id = ?", (audit_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

db = ChangeDatabase()
