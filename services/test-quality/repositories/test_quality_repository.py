import sys
import os
import sqlite3
import json
from typing import List, Optional, Dict, Any

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from shared_db.connection import get_db

class TestQualityRepository:
    def __init__(self) -> None:
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return get_db()

    def _init_db(self) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS test_suites (
                    suite_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    plan_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS test_data_provisions (
                    data_provision_id TEXT PRIMARY KEY,
                    suite_id TEXT,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS defect_triages (
                    triage_id TEXT PRIMARY KEY,
                    test_run_id TEXT,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS security_tests (
                    security_test_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    plan_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS test_runs (
                    test_run_id TEXT PRIMARY KEY,
                    suite_id TEXT,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS traceability_matrices (
                    traceability_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    data TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS quality_gates (
                    gate_id TEXT PRIMARY KEY,
                    demand_id TEXT,
                    test_run_id TEXT,
                    data TEXT
                )
                """
            )
            conn.commit()

    # Test Suites
    def save_test_suite(self, suite_id: str, demand_id: str, plan_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO test_suites (suite_id, demand_id, plan_id, data) VALUES (?, ?, ?, ?)",
                (suite_id, demand_id, plan_id, json.dumps(data)),
            )
            conn.commit()

    def get_test_suite(self, suite_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_suites WHERE suite_id = ?", (suite_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_test_suites(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_suites")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

    # Test Data Provisions
    def save_test_data_provision(self, data_provision_id: str, suite_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO test_data_provisions (data_provision_id, suite_id, demand_id, data) VALUES (?, ?, ?, ?)",
                (data_provision_id, suite_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_test_data_provision(self, data_provision_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_data_provisions WHERE data_provision_id = ?", (data_provision_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_test_data_provisions(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_data_provisions")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

    # Defect Triages
    def save_defect_triage(self, triage_id: str, test_run_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO defect_triages (triage_id, test_run_id, demand_id, data) VALUES (?, ?, ?, ?)",
                (triage_id, test_run_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_defect_triage(self, triage_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM defect_triages WHERE triage_id = ?", (triage_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_defect_triages(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM defect_triages")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

    # Security Tests
    def save_security_test(self, security_test_id: str, demand_id: str, plan_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO security_tests (security_test_id, demand_id, plan_id, data) VALUES (?, ?, ?, ?)",
                (security_test_id, demand_id, plan_id, json.dumps(data)),
            )
            conn.commit()

    def get_security_test(self, security_test_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM security_tests WHERE security_test_id = ?", (security_test_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_security_tests(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM security_tests")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

    # Test Runs
    def save_test_run(self, test_run_id: str, suite_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO test_runs (test_run_id, suite_id, demand_id, data) VALUES (?, ?, ?, ?)",
                (test_run_id, suite_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_test_run(self, test_run_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_runs WHERE test_run_id = ?", (test_run_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_test_runs(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_runs")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

    # Traceability Matrices
    def save_traceability(self, traceability_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO traceability_matrices (traceability_id, demand_id, data) VALUES (?, ?, ?)",
                (traceability_id, demand_id, json.dumps(data)),
            )
            conn.commit()

    def get_traceability(self, traceability_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM traceability_matrices WHERE traceability_id = ?", (traceability_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_traceabilities(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM traceability_matrices")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

    # Quality Gates
    def save_quality_gate(self, gate_id: str, demand_id: str, test_run_id: str, data: Dict[str, Any]) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO quality_gates (gate_id, demand_id, test_run_id, data) VALUES (?, ?, ?, ?)",
                (gate_id, demand_id, test_run_id, json.dumps(data)),
            )
            conn.commit()

    def get_quality_gate(self, gate_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM quality_gates WHERE gate_id = ?", (gate_id,))
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None

    def get_all_quality_gates(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM quality_gates")
            rows = cursor.fetchall()
            return [json.loads(r[0]) for r in rows]

db = TestQualityRepository()
