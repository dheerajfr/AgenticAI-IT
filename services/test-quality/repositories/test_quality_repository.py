import sys
import os
import sqlite3
import json
from typing import List, Optional, Dict, Any
from datetime import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from shared_db.connection import get_db

class TestQualityRepository:
    def __init__(self) -> None:
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return get_db()

    def _init_db(self) -> None:
        """
        Initializes the database by dropping the 7 old individual tables
        and creating the single unified source of truth table: test_and_quality.
        """
        with self._conn() as conn:
            cursor = conn.cursor()
            
            # 1. Drop old tables to consolidate schema
            tables_to_drop = [
                "test_suites",
                "test_data_provisions",
                "defect_triages",
                "security_tests",
                "test_runs",
                "traceability_matrices",
                "quality_gates"
            ]
            for table in tables_to_drop:
                cursor.execute(f"DROP TABLE IF EXISTS {table}")
            
            # 2. Create the unified table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS test_and_quality (
                    demand_id TEXT PRIMARY KEY,
                    data TEXT
                )
                """
            )
            conn.commit()

    def _get_consolidated(self, demand_id: str) -> Dict[str, Any]:
        """
        Retrieves the consolidated JSON record for a demand ID.
        If it doesn't exist, initializes an empty structured document.
        """
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
            return {
                "demand_id": demand_id,
                "updated_at": "",
                "test_generation": None,
                "test_data": None,
                "test_execution": None,
                "defect_triage": None,
                "security_testing": None,
                "traceability": None,
                "quality_gate": None
            }

    def _save_consolidated(self, demand_id: str, record: Dict[str, Any]) -> None:
        """
        Saves the consolidated JSON record back to the database
        and exports a human-readable JSON backup to the exports/ folder.
        """
        record["updated_at"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO test_and_quality (demand_id, data) VALUES (?, ?)",
                (demand_id, json.dumps(record))
            )
            conn.commit()

        # Save to physical file for readability
        exports_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "exports"))
        os.makedirs(exports_dir, exist_ok=True)
        export_path = os.path.join(exports_dir, f"test_quality_{demand_id}.json")
        try:
            with open(export_path, "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2)
        except Exception as e:
            print(f"Error exporting consolidated test quality JSON to {export_path}: {e}")

    def update_consolidated_stage(self, demand_id: str, step_key: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Updates a specific step key in the consolidated stage tracker and saves it.
        """
        record = self._get_consolidated(demand_id)
        record[step_key] = data
        self._save_consolidated(demand_id, record)
        return record

    # =========================================================================
    # Step 1: Test Suites (Test Generation)
    # =========================================================================
    def save_test_suite(self, suite_id: str, demand_id: str, plan_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "test_generation", data)

    def get_test_suite(self, suite_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                suite = record.get("test_generation")
                if suite and suite.get("suite_id") == suite_id:
                    return suite
            return None

    def get_all_test_suites(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            suites = []
            for r in rows:
                record = json.loads(r[0])
                suite = record.get("test_generation")
                if suite:
                    suites.append(suite)
            return suites

    # =========================================================================
    # Step 2: Test Data Provisions
    # =========================================================================
    def save_test_data_provision(self, data_provision_id: str, suite_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "test_data", data)

    def get_test_data_provision(self, data_provision_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                provision = record.get("test_data")
                if provision and provision.get("data_provision_id") == data_provision_id:
                    return provision
            return None

    def get_all_test_data_provisions(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            provisions = []
            for r in rows:
                record = json.loads(r[0])
                provision = record.get("test_data")
                if provision:
                    provisions.append(provision)
            return provisions

    # =========================================================================
    # Step 3: Test Runs (Test Execution)
    # =========================================================================
    def save_test_run(self, test_run_id: str, suite_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "test_execution", data)

    def get_test_run(self, test_run_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                run = record.get("test_execution")
                if run and run.get("test_run_id") == test_run_id:
                    return run
            return None

    def get_all_test_runs(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            runs = []
            for r in rows:
                record = json.loads(r[0])
                run = record.get("test_execution")
                if run:
                    runs.append(run)
            return runs

    # =========================================================================
    # Step 4: Defect Triages
    # =========================================================================
    def save_defect_triage(self, triage_id: str, test_run_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "defect_triage", data)

    def get_defect_triage(self, triage_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                triage = record.get("defect_triage")
                if triage and triage.get("triage_id") == triage_id:
                    return triage
            return None

    def get_all_defect_triages(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            triages = []
            for r in rows:
                record = json.loads(r[0])
                triage = record.get("defect_triage")
                if triage:
                    triages.append(triage)
            return triages

    # =========================================================================
    # Step 5: Security Tests
    # =========================================================================
    def save_security_test(self, security_test_id: str, demand_id: str, plan_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "security_testing", data)

    def get_security_test(self, security_test_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                sec = record.get("security_testing")
                if sec and sec.get("security_test_id") == security_test_id:
                    return sec
            return None

    def get_all_security_tests(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            security_scans = []
            for r in rows:
                record = json.loads(r[0])
                sec = record.get("security_testing")
                if sec:
                    security_scans.append(sec)
            return security_scans

    # =========================================================================
    # Step 6: Traceability Matrices
    # =========================================================================
    def save_traceability(self, traceability_id: str, demand_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "traceability", data)

    def get_traceability(self, traceability_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                matrix = record.get("traceability")
                if matrix and matrix.get("traceability_id") == traceability_id:
                    return matrix
            return None

    def get_all_traceabilities(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            matrices = []
            for r in rows:
                record = json.loads(r[0])
                matrix = record.get("traceability")
                if matrix:
                    matrices.append(matrix)
            return matrices

    # =========================================================================
    # Step 7: Quality Gates
    # =========================================================================
    def save_quality_gate(self, gate_id: str, demand_id: str, test_run_id: str, data: Dict[str, Any]) -> None:
        self.update_consolidated_stage(demand_id, "quality_gate", data)

    def get_quality_gate(self, gate_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            for r in rows:
                record = json.loads(r[0])
                gate = record.get("quality_gate")
                if gate and gate.get("gate_id") == gate_id:
                    return gate
            return None

    def get_all_quality_gates(self) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM test_and_quality")
            rows = cursor.fetchall()
            gates = []
            for r in rows:
                record = json.loads(r[0])
                gate = record.get("quality_gate")
                if gate:
                    gates.append(gate)
            return gates

db = TestQualityRepository()
