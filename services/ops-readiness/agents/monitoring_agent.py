import os
import sys
import json
import datetime
from typing import List, Dict, Any, Optional

# Add root directory to sys.path for shared modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
from services.shared_db.connection import get_db
from services.llm_client import call_gemini

from models import (
    MonitoringSetupRequest,
    MonitoringConfigRecord,
    ComponentSpec,
    SLOTargetSpec,
    ProposedAlert,
    ProposedDashboard,
    WidgetSpec
)

class MonitoringSetupAgent:
    """
    AI-Driven Monitoring Setup Agent.
    Gathers context across previous SDLC stages (03 Architecture, 05 Environment,
    06 Deployment Scope, 07 Performance/Quality, 08 Release Metadata) and dynamically
    generates SLO targets, technology-specific alert rules, dashboard widget specifications,
    and notification groups.
    """

    def __init__(self, db_conn_func=get_db):
        self.db_conn_func = db_conn_func

    def load_policy(self) -> Dict[str, Any]:
        """Loads configurable monitoring policy thresholds from monitoring_policy.json."""
        policy_path = os.path.join(os.path.dirname(__file__), "..", "monitoring_policy.json")
        if os.path.exists(policy_path):
            try:
                with open(policy_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[MonitoringAgent] Error reading monitoring_policy.json: {e}")
        # Default policy fallback schema
        return {
            "policy_version": "MON-POLICY-v1.0",
            "policy_name": "Production Monitoring Policy",
            "environment": "production",
            "categories": {
                "api": {"availability_pct": 99.95, "latency_p95_ms": 180.0, "latency_p99_ms": 350.0, "error_rate_pct": 0.1, "cpu_threshold_pct": 90.0, "memory_threshold_pct": 92.0},
                "authentication": {"availability_pct": 99.99, "latency_p95_ms": 120.0, "latency_p99_ms": 250.0, "error_rate_pct": 0.05, "cpu_threshold_pct": 85.0, "memory_threshold_pct": 88.0},
                "database": {"availability_pct": 99.99, "latency_p95_ms": 45.0, "latency_p99_ms": 90.0, "error_rate_pct": 0.01, "connection_pool_pct": 85.0, "slow_query_ms": 90.0, "replication_lag_sec": 5.0, "cpu_threshold_pct": 85.0, "memory_threshold_pct": 90.0},
                "kafka": {"availability_pct": 99.99, "latency_p95_ms": 50.0, "latency_p99_ms": 120.0, "error_rate_pct": 0.01, "consumer_lag_messages": 1000, "queue_depth_messages": 5000, "cpu_threshold_pct": 85.0, "memory_threshold_pct": 90.0},
                "redis": {"availability_pct": 99.99, "latency_p95_ms": 15.0, "latency_p99_ms": 35.0, "error_rate_pct": 0.01, "memory_threshold_pct": 92.0, "cache_hit_ratio_pct": 90.0, "cpu_threshold_pct": 85.0},
                "queue": {"availability_pct": 99.95, "latency_p95_ms": 50.0, "latency_p99_ms": 120.0, "error_rate_pct": 0.05, "queue_depth_messages": 5000, "dlq_messages_count": 0, "cpu_threshold_pct": 85.0, "memory_threshold_pct": 90.0},
                "infrastructure": {"availability_pct": 99.99, "latency_p95_ms": 20.0, "latency_p99_ms": 50.0, "error_rate_pct": 0.01, "cpu_threshold_pct": 85.0, "memory_threshold_pct": 90.0}
            }
        }

    def get_category_policy(self, comp_type: str, comp_name: str, policy: Dict[str, Any]) -> Dict[str, Any]:
        """Maps a component to its category threshold policy."""
        categories = policy.get("categories", {})
        comp_lower = comp_name.lower()
        if "auth" in comp_lower or "oauth" in comp_lower or "sso" in comp_lower:
            return categories.get("authentication", categories.get("api", {}))
        elif comp_type in categories:
            return categories.get(comp_type, {})
        elif comp_type in ["postgresql", "mongodb"]:
            return categories.get("database", {})
        elif comp_type == "rest_api":
            return categories.get("api", {})
        return categories.get("api", {})

    def gather_sdlc_context(self, demand_id: str, requested_components: Optional[List[str]] = None) -> Dict[str, Any]:
        """Reads data from previous SDLC stages (03, 05, 06, 07, 08)."""
        sdlc_components = set(requested_components or [])
        arch_dependencies = []
        env_components = []
        test_runs = []
        test_defects = []
        release_info = {}

        try:
            with self.db_conn_func() as conn:
                cursor = conn.cursor()

                # Stage 03: Architecture & Dependencies
                try:
                    cursor.execute("SELECT data FROM dependencies WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
                    for row in cursor.fetchall():
                        dep_d = json.loads(row[0])
                        arch_dependencies.append(dep_d)
                        for field in ["service", "depends_on", "source_task_id", "target_task_id", "component"]:
                            if dep_d.get(field):
                                sdlc_components.add(dep_d.get(field))
                except Exception as e:
                    print(f"[MonitoringAgent] Stage 03 query notice: {e}")

                # Stage 05: Environments, CMDB & Technology Stack
                try:
                    cursor.execute("SELECT data FROM environments WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
                    for row in cursor.fetchall():
                        env_d = json.loads(row[0])
                        env_components.append(env_d)
                        cmdb = env_d.get("cmdb_server_name") or env_d.get("cmdb_name")
                        if cmdb:
                            sdlc_components.add(cmdb)
                        reqs = env_d.get("expected_requirements") or []
                        for r in reqs:
                            sdlc_components.add(r)
                except Exception as e:
                    print(f"[MonitoringAgent] Stage 05 query notice: {e}")

                # Stage 07: Performance Test Results & Load Test Baselines
                try:
                    cursor.execute("SELECT data FROM test_runs WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
                    for row in cursor.fetchall():
                        tr_d = json.loads(row[0])
                        test_runs.append(tr_d)
                except Exception as e:
                    print(f"[MonitoringAgent] Stage 07 test runs query notice: {e}")

                try:
                    cursor.execute("SELECT data FROM defects WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
                    for row in cursor.fetchall():
                        df_d = json.loads(row[0])
                        test_defects.append(df_d)
                except Exception as e:
                    print(f"[MonitoringAgent] Stage 07 defects query notice: {e}")

                # Stage 08: Release Metadata, Risk Assessment & Team Ownership
                try:
                    cursor.execute("SELECT data FROM release_change WHERE demand_id = ? AND soft_delete = 0", (demand_id,))
                    row = cursor.fetchone()
                    if row:
                        release_info = json.loads(row[0])
                except Exception as e:
                    print(f"[MonitoringAgent] Stage 08 query notice: {e}")

        except Exception as e:
            print(f"[MonitoringAgent] Context gathering exception: {e}")

        return {
            "demand_id": demand_id,
            "sdlc_components": list(sdlc_components),
            "arch_dependencies": arch_dependencies,
            "env_components": env_components,
            "test_runs": test_runs,
            "test_defects": test_defects,
            "release_info": release_info
        }

    def classify_component(self, comp_name: str, env: str, release_info: Dict[str, Any]) -> ComponentSpec:
        """Classifies a component's technology stack, type, business criticality, and monitoring strategy reason dynamically."""
        comp_lower = comp_name.lower()

        if any(k in comp_lower for k in ["mongo", "nosql"]):
            comp_type = "mongodb"
            tech_stack = "MongoDB Enterprise NoSQL Database"
            reason = "Primary NoSQL persistence layer for document storage."
        elif any(k in comp_lower for k in ["sql", "db", "postgres"]):
            comp_type = "postgresql"
            tech_stack = "PostgreSQL RDBMS"
            reason = "Primary relational persistence layer for transactional storage."
        elif any(k in comp_lower for k in ["kafka"]):
            comp_type = "kafka"
            tech_stack = "Apache Kafka Event Streaming Platform"
            reason = "Processes asynchronous events and event-driven data streaming."
        elif any(k in comp_lower for k in ["redis", "cache"]):
            comp_type = "redis"
            tech_stack = "Redis In-Memory Cache Cluster"
            reason = "In-memory caching layer for fast state retrieval and session storage."
        elif any(k in comp_lower for k in ["queue", "mq", "amqp", "rabbitmq"]):
            comp_type = "queue"
            tech_stack = "RabbitMQ Message Broker"
            reason = "Asynchronous message queue handling background task processing."
        elif any(k in comp_lower for k in ["host", "vm", "cmdb", "node", "infra", "cluster"]):
            comp_type = "infrastructure"
            tech_stack = "Kubernetes Cluster Infrastructure Node"
            reason = "Core container host infrastructure and cluster node capacity."
        else:
            comp_type = "rest_api"
            tech_stack = "Java Spring Boot Microservice"
            if any(k in comp_lower for k in ["auth", "oauth", "sso"]):
                reason = "Authentication & security dependency."
            elif any(k in comp_lower for k in ["payment", "checkout", "billing", "order"]):
                reason = "Critical business transaction processing service."
            else:
                reason = "Customer-facing API handling production traffic."

        # Determine Criticality dynamically from Stage 08 risk rating and component naming
        risk_rating = (release_info.get("risk_rating") or release_info.get("risk") or "Medium").lower()
        if risk_rating in ["critical", "high"] or any(k in comp_lower for k in ["auth", "payment", "checkout", "order", "core", "master"]):
            criticality = "critical"
        elif env.lower() in ["prod", "production"]:
            criticality = "high"
        else:
            criticality = "standard"

        owner_team = release_info.get("owner_team") or release_info.get("lead") or "core-engineering"
        team_slug = owner_team.lower().replace(" ", "-").replace("@company.com", "")
        owner_email = f"team-{team_slug}@company.com"

        return ComponentSpec(
            component_id=comp_name,
            component_name=comp_name.replace("-", " ").title(),
            component_type=comp_type,
            criticality=criticality,
            environment=env,
            technology_stack=tech_stack,
            owner_team=owner_team,
            owner_email=owner_email,
            reason=reason
        )

    def calculate_slo_target(
        self,
        spec: ComponentSpec,
        load_test_results: List[Dict[str, Any]],
        req_availability: Optional[float] = None,
        req_latency_p99: Optional[int] = None,
        policy: Optional[Dict[str, Any]] = None
    ) -> SLOTargetSpec:
        """Loads threshold targets from Stage 07 Performance Results or the configurable Monitoring Policy."""
        cat_policy = self.get_category_policy(spec.component_type, spec.component_id, policy or self.load_policy())

        # Check Stage 07 performance test baselines
        hist_p99_ms = None
        hist_p95_ms = None
        for lt in load_test_results:
            p99 = lt.get("p99_latency_ms") or lt.get("latency_p99") or lt.get("p99")
            p95 = lt.get("p95_latency_ms") or lt.get("latency_p95") or lt.get("p95")
            if p99 and hist_p99_ms is None:
                hist_p99_ms = float(p99)
            if p95 and hist_p95_ms is None:
                hist_p95_ms = float(p95)

        spec.historical_p99_latency_ms = hist_p99_ms

        if req_latency_p99 is not None and req_latency_p99 > 0:
            p99_target = float(req_latency_p99)
            p95_target = round(p99_target * 0.75, 1)
            slo_source = "user_override"
        elif hist_p99_ms:
            p99_target = round(hist_p99_ms * 1.2, 1)
            p95_target = round((hist_p95_ms or (hist_p99_ms * 0.75)) * 1.15, 1)
            slo_source = "stage_07_load_test_baseline"
        else:
            p99_target = float(cat_policy.get("latency_p99_ms", 350.0))
            p95_target = float(cat_policy.get("latency_p95_ms", 180.0))
            slo_source = "monitoring_policy"

        avail_slo = float(req_availability) if (req_availability and req_availability > 0) else float(cat_policy.get("availability_pct", 99.95))
        err_rate_threshold = float(cat_policy.get("error_rate_pct", 0.1))
        cpu_threshold = float(cat_policy.get("cpu_threshold_pct", 85.0))
        mem_threshold = float(cat_policy.get("memory_threshold_pct", 90.0))

        return SLOTargetSpec(
            component_id=spec.component_id,
            availability_slo_pct=avail_slo,
            latency_p95_ms=p95_target,
            latency_p99_ms=p99_target,
            error_rate_threshold_pct=err_rate_threshold,
            cpu_threshold_pct=cpu_threshold,
            memory_threshold_pct=mem_threshold,
            source=slo_source
        )

    def generate_notification_groups(self, spec_list: List[ComponentSpec], env: str, release_info: Dict[str, Any]) -> List[str]:
        """Generates notification groups dynamically from environment, release config, and team ownership."""
        env_slug = env.lower().replace(" ", "-")
        owner_team = release_info.get("owner_team") or release_info.get("lead") or "core-engineering"
        team_slug = owner_team.lower().replace(" ", "-").replace("@company.com", "")

        notify_set = {
            f"oncall-{env_slug}@company.com",
            f"sre-{env_slug}-lead@company.com",
            f"release-leads@company.com",
            f"team-{team_slug}@company.com"
        }

        for spec in spec_list:
            if spec.owner_email:
                notify_set.add(spec.owner_email)

        return sorted(list(notify_set))

    def generate_dynamic_alerts(self, spec: ComponentSpec, slo: SLOTargetSpec, notify_group: List[str], policy: Optional[Dict[str, Any]] = None) -> List[ProposedAlert]:
        """Generates dynamic, policy-driven alert rules for a component with explicit threshold source tracking."""
        alerts: List[ProposedAlert] = []
        comp_id = spec.component_id
        comp_type = spec.component_type
        comp_upper = comp_id.upper().replace("-", "_")
        comp_notify = list(set(notify_group + [f"team-{spec.owner_team.lower().replace(' ', '-')}-alerts@company.com"]))

        pol = policy or self.load_policy()
        cat_policy = self.get_category_policy(comp_type, comp_id, pol)
        pol_version = pol.get("policy_version", "MON-POLICY-v1.0")
        pol_name = pol.get("policy_name", "Production Monitoring Policy")

        if slo.source == "stage_07_load_test_baseline":
            thresh_source = "Stage 07 Performance Baseline"
        elif slo.source == "user_override":
            thresh_source = "User Request Override"
        else:
            thresh_source = f"{pol_name} ({pol_version})"

        if comp_type in ["postgresql", "mongodb"]:
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-CONNPOOL",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="connection_pool",
                name=f"{spec.component_name} – Connection Pool Saturation",
                condition="Connection pool utilization exceeds configured operational threshold",
                threshold="Configured Operational Policy",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="critical" if spec.criticality in ["critical", "high"] else "high",
                notify=comp_notify + [f"dba-oncall-{spec.environment.lower()}@company.com"]
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-SLOWQUERY",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="slow_queries",
                name=f"{spec.component_name} – Slow Query Execution",
                condition="Query execution duration exceeds configured latency baseline",
                threshold="Configured Performance Baseline",
                threshold_source=thresh_source,
                severity="high",
                notify=comp_notify
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-REPLAG",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="replication_lag",
                name=f"{spec.component_name} – Replication Lag Warning",
                condition="Replica lag exceeds configured synchronization threshold",
                threshold="Configured Synchronization Policy",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="high",
                notify=comp_notify
            ))
        elif comp_type == "kafka":
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-LAG",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="consumer_lag",
                name=f"{spec.component_name} – Consumer Lag Saturation",
                condition="Unconsumed message backlog exceeds configured consumer threshold",
                threshold="Configured Messaging Policy",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="critical",
                notify=comp_notify + [f"messaging-oncall-{spec.environment.lower()}@company.com"]
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-ISR",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="broker_isr",
                name=f"{spec.component_name} – Broker Replica Offline",
                condition="Active in-sync brokers fall below required replica threshold",
                threshold="Min In-Sync Replicas",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="critical",
                notify=comp_notify
            ))
        elif comp_type == "redis":
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-MEMORY",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="memory_usage",
                name=f"{spec.component_name} – High Memory Utilization",
                condition="Cache memory utilization exceeds configured capacity threshold",
                threshold="Configured Memory Limit",
                threshold_source=thresh_source,
                severity="high",
                notify=comp_notify
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-HITRATIO",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="cache_hit_ratio",
                name=f"{spec.component_name} – Low Cache Hit Ratio",
                condition="Cache hit ratio falls below configured performance baseline",
                threshold="Configured Hit Ratio Policy",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="high",
                notify=comp_notify
            ))
        elif comp_type == "queue":
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-QUEUE-DEPTH",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="queue_depth",
                name=f"{spec.component_name} – Queue Backlog Warning",
                condition="Queue depth exceeds configured message backlog threshold",
                threshold="Configured Queue Depth",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="high",
                notify=comp_notify
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-DLQ",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="dead_letter_queue",
                name=f"{spec.component_name} – Dead Letter Queue Spike",
                condition="Unprocessable messages detected in Dead Letter Queue",
                threshold="0 Messages",
                threshold_source=f"{pol_name} ({pol_version})",
                severity="critical",
                notify=comp_notify
            ))
        else:  # rest_api / microservice
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-LATENCY",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="latency",
                name=f"{spec.component_name} – High Response Latency",
                condition="Response latency exceeds configured operational threshold",
                threshold="Configured Latency Policy",
                threshold_source=thresh_source,
                severity="critical" if spec.criticality == "critical" else "high",
                notify=comp_notify
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-AVAIL",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="availability",
                name=f"{spec.component_name} – Service Availability Drop",
                condition="Service availability drops below required SLO threshold",
                threshold="Configured Availability SLO",
                threshold_source=thresh_source,
                severity="critical",
                notify=comp_notify
            ))
            alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-5XX",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="http_5xx",
                name=f"{spec.component_name} – High Error Rate Spike",
                condition="HTTP 5xx server error rate exceeds configured threshold",
                threshold="Configured Error Budget",
                threshold_source=thresh_source,
                severity="critical" if spec.criticality == "critical" else "high",
                notify=comp_notify
            ))

        return alerts

    def generate_ai_monitoring_insights(
        self,
        ctx: Dict[str, Any],
        component_specs: List[ComponentSpec],
        slo_targets: List[SLOTargetSpec]
    ) -> Optional[Dict[str, Any]]:
        """
        Calls the LLM to generate/refine SLO thresholds and propose additional,
        context-aware alert recommendations grounded in the real SDLC context already
        gathered by gather_sdlc_context (Stage 03 dependencies, Stage 05 environment/CMDB,
        Stage 07 test runs/defects, Stage 08 release risk/ownership).

        Returns the parsed JSON payload on success, or None if the LLM call fails or
        returns an unusable payload -- callers must keep the deterministic rule-based
        thresholds from calculate_slo_target as the genuine fallback in that case.
        """
        components_summary = []
        for spec, slo in zip(component_specs, slo_targets):
            components_summary.append({
                "component_id": spec.component_id,
                "component_type": spec.component_type,
                "criticality": spec.criticality,
                "environment": spec.environment,
                "technology_stack": spec.technology_stack,
                "historical_p99_latency_ms": spec.historical_p99_latency_ms,
                "rule_based_availability_slo_pct": slo.availability_slo_pct,
                "rule_based_latency_p95_ms": slo.latency_p95_ms,
                "rule_based_latency_p99_ms": slo.latency_p99_ms,
                "rule_based_source": slo.source
            })

        defects_summary = [
            {
                "id": d.get("id") or d.get("defect_id"),
                "severity": d.get("severity"),
                "status": d.get("status"),
                "summary": d.get("summary") or d.get("title")
            }
            for d in (ctx.get("test_defects") or [])[:15]
        ]

        prompt = f"""
        You are a Senior Site Reliability Engineer setting up production observability for demand {ctx.get('demand_id')}.

        Real context gathered from prior SDLC stages for this demand:
        - Components in scope, with rule-engine baseline thresholds shown as a reference floor:
        {json.dumps(components_summary, indent=2)}
        - Architecture dependencies (Stage 03): {json.dumps((ctx.get('arch_dependencies') or [])[:10])}
        - Environment/CMDB records (Stage 05): {json.dumps((ctx.get('env_components') or [])[:10])}
        - Recent test runs / load test baselines (Stage 07): {json.dumps((ctx.get('test_runs') or [])[:10])}
        - Open/recent defects (Stage 07): {json.dumps(defects_summary)}
        - Release metadata & risk rating (Stage 08): {json.dumps(ctx.get('release_info') or {{}})}

        Task:
        1. For each component_id, propose a refined SLO target. You may keep the rule-engine value if it is
           already appropriate, or tighten/loosen it based on criticality, defect history, and dependency risk.
           Only propose realistic, internally consistent values (latency_p95_ms must be less than latency_p99_ms;
           percentages must be in valid ranges).
        2. Propose up to 2 additional alert recommendations (beyond the standard rule-based alerts) for any
           component you judge to be at elevated operational risk -- e.g. because of open critical/high defects,
           fragile dependencies, or unusually tight SLOs.

        Respond ONLY with JSON matching this schema:
        {{
          "slo_targets": [
            {{
              "component_id": "...",
              "availability_slo_pct": 99.9,
              "latency_p95_ms": 120.0,
              "latency_p99_ms": 250.0,
              "error_rate_threshold_pct": 0.1,
              "cpu_threshold_pct": 85.0,
              "memory_threshold_pct": 88.0,
              "rationale": "1-sentence reasoning grounded in the context above."
            }}
          ],
          "additional_alerts": [
            {{
              "component_id": "...",
              "name": "...",
              "condition": "...",
              "threshold": "...",
              "severity": "critical|high|medium|low",
              "rationale": "1-sentence reasoning."
            }}
          ]
        }}
        """

        try:
            result = call_gemini(prompt=prompt, is_json=True)
            if isinstance(result, dict) and ("slo_targets" in result or "additional_alerts" in result):
                return result
            print("[MonitoringAgent] AI SLO/alert refinement returned an unexpected payload shape, using rule-based fallback.")
        except Exception as e:
            print(f"[MonitoringAgent] AI SLO/alert refinement call failed, using rule-based fallback thresholds. Error: {e}")
        return None

    def apply_ai_monitoring_insights(
        self,
        ai_insights: Optional[Dict[str, Any]],
        component_specs: List[ComponentSpec],
        slo_targets: List[SLOTargetSpec],
        notification_group: List[str]
    ) -> List[ProposedAlert]:
        """
        Validates and merges the LLM's proposed SLO refinements into slo_targets in place
        (marking source="ai_dynamic_analysis" only for entries the LLM actually and validly
        refined), and returns any additional AI-recommended alerts as ProposedAlert objects.
        Invalid or missing LLM output for a given component is silently discarded and that
        component's rule-based SLOTargetSpec (from calculate_slo_target) is left untouched.
        """
        ai_alerts: List[ProposedAlert] = []
        if not ai_insights:
            return ai_alerts

        valid_component_ids = {s.component_id for s in component_specs}

        for item in (ai_insights.get("slo_targets") or []):
            comp_id = item.get("component_id")
            if comp_id not in valid_component_ids:
                continue
            try:
                avail = float(item["availability_slo_pct"])
                p95 = float(item["latency_p95_ms"])
                p99 = float(item["latency_p99_ms"])
                err = float(item["error_rate_threshold_pct"])
                cpu = float(item["cpu_threshold_pct"])
                mem = float(item["memory_threshold_pct"])
                if not (0 < avail <= 100 and 0 < p95 < p99 and 0 <= err <= 100 and 0 < cpu <= 100 and 0 < mem <= 100):
                    raise ValueError("AI-proposed SLO values failed sanity range checks")
            except (KeyError, TypeError, ValueError) as ve:
                print(f"[MonitoringAgent] Discarding invalid AI SLO proposal for {comp_id}: {ve}")
                continue

            for slo in slo_targets:
                if slo.component_id == comp_id:
                    slo.availability_slo_pct = avail
                    slo.latency_p95_ms = p95
                    slo.latency_p99_ms = p99
                    slo.error_rate_threshold_pct = err
                    slo.cpu_threshold_pct = cpu
                    slo.memory_threshold_pct = mem
                    slo.source = "ai_dynamic_analysis"
                    break

        for item in (ai_insights.get("additional_alerts") or []):
            comp_id = item.get("component_id")
            name = item.get("name")
            condition = item.get("condition")
            if comp_id not in valid_component_ids or not name or not condition:
                continue
            severity = item.get("severity") if item.get("severity") in ["critical", "high", "medium", "low"] else "medium"
            comp_upper = comp_id.upper().replace("-", "_")
            comp_type = next((s.component_type for s in component_specs if s.component_id == comp_id), "rest_api")
            ai_alerts.append(ProposedAlert(
                alert_id=f"ALT-{comp_upper}-AI-{len(ai_alerts) + 1}",
                component_id=comp_id,
                component_type=comp_type,
                alert_type="ai_recommended",
                name=name,
                condition=condition,
                threshold=item.get("threshold"),
                severity=severity,
                notify=notification_group
            ))

        return ai_alerts

    def generate_dynamic_dashboards(self, demand_id: str, env: str, spec_list: List[ComponentSpec]) -> List[ProposedDashboard]:
        """Generates dashboard widget specifications filtered strictly by detected component technology stacks."""
        detected_types = set(s.component_type for s in spec_list)
        widgets: List[Dict[str, Any]] = []

        # REST API Widgets
        if "rest_api" in detected_types or any(t not in ["postgresql", "mongodb", "kafka", "redis", "queue"] for t in detected_types):
            widgets.append({
                "widget_id": "WID-API-LATENCY",
                "type": "timeseries",
                "title": "Application Response Latency (p50, p95, p99)",
                "query": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))",
                "target_metric": "http_request_duration_seconds",
                "reason": "Tracks response latency percentiles to detect API degradation and user-facing slow responses."
            })
            widgets.append({
                "widget_id": "WID-API-ERRORS",
                "type": "stat",
                "title": "HTTP 5xx Error Rate %",
                "query": "sum(rate(http_requests_total{status=~'5..'}[5m])) / sum(rate(http_requests_total[5m])) * 100",
                "target_metric": "http_requests_total_5xx",
                "reason": "Monitors application-level HTTP 5xx server failure rates to protect error budget."
            })
            widgets.append({
                "widget_id": "WID-API-RPS",
                "type": "gauge",
                "title": "Throughput (Requests / Sec)",
                "query": "sum(rate(http_requests_total[5m]))",
                "target_metric": "http_requests_throughput",
                "reason": "Measures active request throughput to analyze incoming traffic spikes."
            })

        # PostgreSQL & MongoDB Database Widgets
        if "postgresql" in detected_types or "mongodb" in detected_types:
            widgets.append({
                "widget_id": "WID-DB-CONNPOOL",
                "type": "gauge",
                "title": "Database Connection Pool Utilization",
                "query": "database_connections_active / database_connections_max * 100",
                "target_metric": "database_connection_pool",
                "reason": "Tracks active connection pool capacity to prevent database connection exhaustion."
            })
            widgets.append({
                "widget_id": "WID-DB-SLOWQUERIES",
                "type": "bar",
                "title": "Slow Queries & Lock Contention",
                "query": "rate(database_slow_queries_total[5m])",
                "target_metric": "database_slow_queries",
                "reason": "Identifies unindexed or blocking query performance bottlenecks."
            })

        # Kafka / Queue Widgets
        if "kafka" in detected_types or "queue" in detected_types:
            widgets.append({
                "widget_id": "WID-KAFKA-LAG",
                "type": "timeseries",
                "title": "Kafka Consumer Group Lag & Queue Depth",
                "query": "sum(kafka_consumergroup_lag) by (consumergroup, topic)",
                "target_metric": "kafka_consumergroup_lag",
                "reason": "Monitors unconsumed message backlog across topics to prevent pipeline delays."
            })

        # Redis Cache Widgets
        if "redis" in detected_types:
            widgets.append({
                "widget_id": "WID-REDIS-HITRATIO",
                "type": "stat",
                "title": "Redis Cache Hit Ratio %",
                "query": "rate(redis_keyspace_hits_total[5m]) / (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m])) * 100",
                "target_metric": "redis_cache_hit_ratio",
                "reason": "Ensures caching efficiency to minimize direct database lookups."
            })

        # Infrastructure Widgets (Always included)
        widgets.append({
            "widget_id": "WID-INFRA-RESOURCES",
            "type": "timeseries",
            "title": "Cluster Resource Utilization (CPU, Memory, Network I/O)",
            "query": "sum(container_cpu_usage_seconds_total) by (pod) / sum(container_spec_cpu_quota) by (pod)",
            "target_metric": "container_cpu_memory",
            "reason": "Monitors host node CPU and memory saturation to prevent OOM kills."
        })

        suffix = demand_id.split('-')[-1]
        panels = [w["widget_id"].replace("WID-", "").lower() for w in widgets]

        return [
            ProposedDashboard(
                dashboard_id=f"DSH-{suffix}",
                title=f"{demand_id} Enterprise Production Monitoring Dashboard ({env.upper()})",
                target_technology=", ".join(sorted(list(detected_types))),
                panels=panels,
                widgets=widgets
            )
        ]

    def create_monitoring_plan(self, req: MonitoringSetupRequest) -> MonitoringConfigRecord:
        """Executes full policy-driven AI monitoring setup process."""
        demand_id = req.demand_id
        plan_id = req.plan_id
        env = req.environment or "production"
        suffix = demand_id.split('-')[-1]
        monitoring_id = f"MON-{suffix}-1"
        monitoring_plan_id = f"MON-PLAN-{demand_id}"
        release_id = f"REL-{suffix}-1"

        # 1. Load policy configuration
        policy = self.load_policy()

        # 2. Gather SDLC context
        ctx = self.gather_sdlc_context(demand_id, req.component_ids)

        monitored_scope = ctx["sdlc_components"]
        if not monitored_scope:
            monitored_scope = req.component_ids or ["svc-ecom-chatbot", "nosql-database-mongo-4-2", "realtime-message-queue-kafka-2-6", "oauth2-auth-service", "redis-cache-cluster"]

        # 3. Build Component Specifications & Dynamic SLO Targets
        component_specs: List[ComponentSpec] = []
        slo_targets: List[SLOTargetSpec] = []

        for comp in monitored_scope:
            spec = self.classify_component(comp, env, ctx["release_info"])
            component_specs.append(spec)

            # Check matching user request override for SLO if provided
            user_avail = req.target_availability_slo
            user_lat = req.target_latency_p99_ms
            if req.slos:
                matching_slo = next((s for s in req.slos if s.component_id == comp), None)
                if matching_slo:
                    user_avail = matching_slo.availability_pct
                    user_lat = matching_slo.latency_p99_ms

            slo = self.calculate_slo_target(spec, ctx["test_runs"], user_avail, user_lat, policy)
            slo_targets.append(slo)

        # 4. Dynamic Notification Groups
        notification_group = self.generate_notification_groups(component_specs, env, ctx["release_info"])

        # 5. Policy-Driven Alerts Generation
        proposed_alerts: List[ProposedAlert] = []
        for spec in component_specs:
            slo = next((s for s in slo_targets if s.component_id == spec.component_id), slo_targets[0])
            alerts = self.generate_dynamic_alerts(spec, slo, notification_group, policy)
            proposed_alerts.extend(alerts)
        proposed_alerts.extend(ai_recommended_alerts)

        # 6. Dynamic Dashboard Specifications Generation
        proposed_dashboards = self.generate_dynamic_dashboards(demand_id, env, component_specs)

        # 7. Policy Summary
        has_baseline = any(s.source == "stage_07_load_test_baseline" for s in slo_targets)
        primary_source = "Stage 07 Performance Baseline" if has_baseline else f"{policy.get('policy_name', 'Production Monitoring Policy')} ({policy.get('policy_version', 'MON-POLICY-v1.0')})"

        policy_summary = {
            "policy_version": policy.get("policy_version", "MON-POLICY-v1.0"),
            "policy_name": policy.get("policy_name", "Production Monitoring Policy"),
            "environment": env.title(),
            "component_types": sorted(list(set(s.component_type for s in component_specs))),
            "primary_threshold_source": primary_source,
            "has_performance_baseline": has_baseline
        }

        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        return MonitoringConfigRecord(
            monitoring_id=monitoring_id,
            monitoring_plan_id=monitoring_plan_id,
            release_id=release_id,
            demand_id=demand_id,
            plan_id=plan_id,
            environment=env,
            monitored_components_scope=monitored_scope,
            component_specs=component_specs,
            slo_targets=slo_targets,
            proposed_alerts=proposed_alerts,
            proposed_dashboards=proposed_dashboards,
            policy_summary=policy_summary,
            generated_at=timestamp,
            sre_reviewed=False,
            sre_reviewed_by=None,
            status="draft"
        )
