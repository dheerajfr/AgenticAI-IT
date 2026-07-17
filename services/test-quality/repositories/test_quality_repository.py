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
        Also creates the 16 normalized relational tables with proper columns.
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
            
            # 3. Create the normalized relational tables
            normalized_tables = [
                "test_generation",
                "generated_test_cases",
                "test_datasets",
                "test_execution_runs",
                "execution_results",
                "execution_logs",
                "defects",
                "defect_clusters",
                "vulnerability_scans",
                "vulnerabilities",
                "traceability_matrix",
                "quality_gate_results",
                "quality_gate_history",
                "ai_recommendations",
                "approval_history",
                "audit_logs",
                # Explicit tables from user request:
                "test_cases",
                "test_case_steps",
                "test_data",
                "test_execution",
                "security_findings",
                "traceability",
                "quality_gate",
                "approvals"
            ]
            for t in normalized_tables:
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {t} (
                        id TEXT PRIMARY KEY,
                        demand_id TEXT,
                        plan_id TEXT,
                        release_id TEXT,
                        created_by TEXT,
                        updated_by TEXT,
                        created_at TEXT,
                        updated_at TEXT,
                        status TEXT,
                        version TEXT,
                        soft_delete INTEGER DEFAULT 0,
                        data TEXT
                    )
                    """
                )
            conn.commit()

    def _insert_relational(
        self,
        table: str,
        record_id: str,
        demand_id: str,
        plan_id: Optional[str],
        release_id: Optional[str],
        user: str,
        timestamp: str,
        status: str,
        payload: Any,
        version: str = "1.0.0"
    ) -> None:
        """
        Saves a structured row into the specified normalized relational table.
        Also mirrors to equivalent explicit table from user spec.
        """
        extra_tables = []
        if table == "generated_test_cases":
            extra_tables.append("test_cases")
        elif table == "test_datasets":
            extra_tables.append("test_data")
        elif table == "test_execution_runs":
            extra_tables.append("test_execution")
        elif table == "vulnerabilities":
            extra_tables.append("security_findings")
        elif table == "traceability_matrix":
            extra_tables.append("traceability")
        elif table == "quality_gate_results":
            extra_tables.append("quality_gate")
        elif table == "approval_history":
            extra_tables.append("approvals")

        tables_to_write = [table] + extra_tables

        with self._conn() as conn:
            cursor = conn.cursor()
            for t in tables_to_write:
                cursor.execute(
                    f"""
                    INSERT OR REPLACE INTO {t} (
                        id, demand_id, plan_id, release_id, created_by, updated_by, created_at, updated_at, status, version, soft_delete, data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    """,
                    (
                        record_id,
                        demand_id,
                        plan_id,
                        release_id,
                        user,
                        user,
                        timestamp,
                        timestamp,
                        status,
                        version,
                        json.dumps(payload)
                    )
                )
            conn.commit()

    def _resolve_ids(self, demand_id: str, plan_id: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
        """
        Resolves the plan_id and release_id dynamically.
        """
        plan_id_resolved = plan_id
        release_id_resolved = None
        try:
            from context.delivery_context_builder import DeliveryContextBuilder
            ctx = DeliveryContextBuilder.get_delivery_context(demand_id, plan_id)
            if ctx:
                if not plan_id_resolved:
                    plan_id_resolved = ctx.plan_id
                release_id_resolved = ctx.release_id
        except Exception as e:
            print(f"Error resolving delivery context in repository: {e}")
        return plan_id_resolved, release_id_resolved

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id, plan_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # test_generation
        self._insert_relational("test_generation", suite_id, demand_id, plan_id_res, release_id_res, "QA-Engineer", now, data.get("status", "draft"), data)
        
        # generated_test_cases
        for tc in data.get("test_cases", []):
            self._insert_relational("generated_test_cases", tc.get("test_id"), demand_id, plan_id_res, release_id_res, "QA-Engineer", now, data.get("status", "draft"), tc)
            
        # ai_recommendations
        self._insert_relational("ai_recommendations", f"REC-{suite_id}", demand_id, plan_id_res, release_id_res, "Test-Generation-Agent", now, "active", {
            "agent": "Test Generation Agent",
            "coverage_summary": data.get("coverage_summary")
        })
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-GEN-{suite_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "test_suite_generated",
            "suite_id": suite_id
        })

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # test_datasets
        self._insert_relational("test_datasets", data_provision_id, demand_id, plan_id_res, release_id_res, "Test-Lead", now, data.get("status", "pending"), data)
        
        # ai_recommendations
        self._insert_relational("ai_recommendations", f"REC-{data_provision_id}", demand_id, plan_id_res, release_id_res, "Test-Data-Agent", now, "active", {
            "agent": "Test Data Agent",
            "environment": data.get("environment"),
            "dataset_count": len(data.get("datasets", []))
        })
        
        # approval_history (privacy sign off status)
        self._insert_relational("approval_history", f"APP-{data_provision_id}", demand_id, plan_id_res, release_id_res, "Privacy-Officer", now, data.get("status", "pending"), {
            "sign_off": data.get("privacy_sign_off"),
            "signed_by": data.get("signed_off_by")
        })
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-DATA-{data_provision_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "test_data_provisioned",
            "data_provision_id": data_provision_id
        })

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # test_execution_runs
        self._insert_relational("test_execution_runs", test_run_id, demand_id, plan_id_res, release_id_res, "QA-Engineer", now, data.get("status", "completed"), data)
        
        # execution_results
        for res in data.get("results", []):
            self._insert_relational("execution_results", f"{test_run_id}-{res.get('test_id')}", demand_id, plan_id_res, release_id_res, "QA-Engineer", now, res.get("status"), res)
            
        # execution_logs
        self._insert_relational("execution_logs", f"LOG-{test_run_id}", demand_id, plan_id_res, release_id_res, "System", now, "info", {
            "summary": data.get("summary")
        })
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-RUN-{test_run_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "test_run_executed",
            "test_run_id": test_run_id
        })

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # defect_clusters
        self._insert_relational("defect_clusters", triage_id, demand_id, plan_id_res, release_id_res, "Triage-Lead", now, data.get("status", "pending"), data)
        
        # defects
        for d in data.get("triaged_defects", []):
            self._insert_relational("defects", d.get("defect_id"), demand_id, plan_id_res, release_id_res, "Triage-Lead", now, d.get("recommended_action"), d)
            
        # ai_recommendations
        self._insert_relational("ai_recommendations", f"REC-{triage_id}", demand_id, plan_id_res, release_id_res, "Defect-Triage-Agent", now, "active", {
            "agent": "Defect Triage Agent",
            "risk_summary": data.get("release_risk_summary")
        })
        
        # approval_history
        self._insert_relational("approval_history", f"APP-{triage_id}", demand_id, plan_id_res, release_id_res, "QA-Lead", now, "confirmed" if data.get("human_confirmed") else "pending", {
            "human_confirmed": data.get("human_confirmed")
        })
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-TRG-{triage_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "defect_triage_completed",
            "triage_id": triage_id
        })

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id, plan_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # vulnerability_scans
        self._insert_relational("vulnerability_scans", security_test_id, demand_id, plan_id_res, release_id_res, "Security-Analyst", now, data.get("status", "completed"), data)
        
        # vulnerabilities
        for f in data.get("findings", []):
            self._insert_relational("vulnerabilities", f.get("finding_id"), demand_id, plan_id_res, release_id_res, "Security-Analyst", now, f.get("status"), f)
            
        # ai_recommendations
        self._insert_relational("ai_recommendations", f"REC-{security_test_id}", demand_id, plan_id_res, release_id_res, "Security-Analysis-Agent", now, "active", {
            "agent": "Security Analysis Agent",
            "summary": data.get("summary")
        })
        
        # approval_history
        self._insert_relational("approval_history", f"APP-{security_test_id}", demand_id, plan_id_res, release_id_res, "Security-Manager", now, "confirmed" if data.get("exploitable_confirmed") else "pending", {
            "exploitable_confirmed": data.get("exploitable_confirmed"),
            "signed_off_by": data.get("signed_off_by")
        })
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-SEC-{security_test_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "security_scan_completed",
            "security_test_id": security_test_id
        })

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # traceability_matrix
        self._insert_relational("traceability_matrix", traceability_id, demand_id, plan_id_res, release_id_res, "QA-Lead", now, "published", data)
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-TRC-{traceability_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "traceability_matrix_updated",
            "traceability_id": traceability_id
        })

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
        plan_id_res, release_id_res = self._resolve_ids(demand_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # quality_gate_results
        self._insert_relational("quality_gate_results", gate_id, demand_id, plan_id_res, release_id_res, "Release-Manager", now, data.get("verdict"), data)
        
        # quality_gate_history
        self._insert_relational("quality_gate_history", f"HIST-{gate_id}", demand_id, plan_id_res, release_id_res, "Release-Manager", now, data.get("status"), data)
        
        # approval_history
        self._insert_relational("approval_history", f"APP-{gate_id}", demand_id, plan_id_res, release_id_res, "Release-Manager", now, data.get("status"), {
            "human_decision": data.get("human_decision"),
            "decided_by": data.get("decided_by")
        })
        
        # audit_logs
        self._insert_relational("audit_logs", f"AUD-GATE-{gate_id}", demand_id, plan_id_res, release_id_res, "System", now, "success", {
            "event": "quality_gate_evaluated",
            "gate_id": gate_id,
            "verdict": data.get("verdict")
        })

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

    # =========================================================================
    # Explicit Relational CRUD Methods for Standalone UI Operations
    # =========================================================================
    def get_records_by_demand(self, table: str, demand_id: str) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT data FROM {table} WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
            return [json.loads(row[0]) for row in cursor.fetchall()]

    def save_relational_record(self, table: str, record_id: str, demand_id: str, data: Dict[str, Any], status: str = "active") -> None:
        plan_id_res, release_id_res = self._resolve_ids(demand_id)
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        self._insert_relational(table, record_id, demand_id, plan_id_res, release_id_res, "System-User", now, status, data)

    def delete_relational_record(self, table: str, record_id: str) -> None:
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE {table} SET soft_delete = 1 WHERE id = ?", (record_id,))
            # Handle mirrored tables
            if table in ["test_cases", "generated_test_cases"]:
                cursor.execute("UPDATE test_cases SET soft_delete = 1 WHERE id = ?", (record_id,))
                cursor.execute("UPDATE generated_test_cases SET soft_delete = 1 WHERE id = ?", (record_id,))
            elif table in ["test_data", "test_datasets"]:
                cursor.execute("UPDATE test_data SET soft_delete = 1 WHERE id = ?", (record_id,))
                cursor.execute("UPDATE test_datasets SET soft_delete = 1 WHERE id = ?", (record_id,))
            elif table in ["test_execution", "test_execution_runs"]:
                cursor.execute("UPDATE test_execution SET soft_delete = 1 WHERE id = ?", (record_id,))
                cursor.execute("UPDATE test_execution_runs SET soft_delete = 1 WHERE id = ?", (record_id,))
            elif table in ["security_findings", "vulnerabilities"]:
                cursor.execute("UPDATE security_findings SET soft_delete = 1 WHERE id = ?", (record_id,))
                cursor.execute("UPDATE vulnerabilities SET soft_delete = 1 WHERE id = ?", (record_id,))
            conn.commit()

db = TestQualityRepository()
