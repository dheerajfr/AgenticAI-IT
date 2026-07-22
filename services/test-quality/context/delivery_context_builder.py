import sys
import os
import sqlite3
import json
from typing import Optional, List, Dict, Any

services_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
tq_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if services_dir not in sys.path:
    sys.path.insert(0, services_dir)
if tq_dir in sys.path:
    sys.path.remove(tq_dir)
sys.path.insert(0, tq_dir)

from shared_db.connection import get_db
from models import (
    DeliveryContext,
    UpstreamDemandRecord,
    UpstreamEstimateRecord,
    UpstreamPlanRecord,
    UpstreamDependencyEdge,
    UpstreamEnvironmentStateRecord,
    UpstreamBuildDeployRecord
)

class DeliveryContextBuilder:
    @staticmethod
    def get_delivery_context(demand_id: str, plan_id: Optional[str] = None) -> DeliveryContext:
        """
        Builds a consolidated DeliveryContext object by retrieving records from 
        previous lifecycle stages in source.db.
        """
        demand_rec = None
        estimate_rec = None
        plan_rec = None
        release_id_rec = None
        dependencies_list: List[UpstreamDependencyEdge] = []
        environments_list: List[UpstreamEnvironmentStateRecord] = []
        build_deploy_rec = None

        with get_db() as conn:
            cursor = conn.cursor()

            # 1. Fetch Demand
            cursor.execute("SELECT data FROM demands WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                try:
                    data = json.loads(row[0])
                    demand_rec = UpstreamDemandRecord(**data)
                except Exception as e:
                    print(f"Error parsing demand data: {e}")

            # 1.5 Fetch Release ID associated with demand_id
            try:
                cursor.execute("SELECT release_id FROM release_change WHERE demand_id = ?", (demand_id,))
                row = cursor.fetchone()
                if row:
                    release_id_rec = row[0]
            except Exception as e:
                print(f"Error querying release_change table: {e}")

            # 2. Fetch Estimate
            cursor.execute("SELECT data FROM estimates WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                try:
                    data = json.loads(row[0])
                    estimate_rec = UpstreamEstimateRecord(**data)
                except Exception as e:
                    print(f"Error parsing estimate data: {e}")

            # 3. Fetch Plan
            if plan_id:
                cursor.execute("SELECT data FROM plans WHERE plan_id = ?", (plan_id,))
            else:
                cursor.execute("SELECT data FROM plans WHERE demand_id = ?", (demand_id,))
            row = cursor.fetchone()
            if row:
                try:
                    data = json.loads(row[0])
                    plan_rec = UpstreamPlanRecord(**data)
                    if not plan_id:
                        plan_id = plan_rec.plan_id
                except Exception as e:
                    print(f"Error parsing plan data: {e}")

            # 4. Fetch Dependencies
            cursor.execute("SELECT data FROM dependencies WHERE demand_id = ?", (demand_id,))
            rows = cursor.fetchall()
            for r in rows:
                try:
                    data = json.loads(r[0])
                    dependencies_list.append(UpstreamDependencyEdge(**data))
                except Exception as e:
                    print(f"Error parsing dependency data: {e}")

            # 5. Fetch Environments matching the active demand ID
            cursor.execute("SELECT data FROM environments WHERE demand_id = ?", (demand_id,))
            rows = cursor.fetchall()
            for r in rows:
                try:
                    data = json.loads(r[0])
                    environments_list.append(UpstreamEnvironmentStateRecord(**data))
                except Exception as e:
                    print(f"Error parsing environment data: {e}")

            # 6. Fetch Build & Deploy record (if available)
            if plan_rec:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS build_deploys (
                        build_id TEXT PRIMARY KEY,
                        demand_id TEXT,
                        data TEXT
                    )
                """)
                conn.commit()

                cursor.execute("SELECT data FROM build_deploys WHERE demand_id = ?", (demand_id,))
                row = cursor.fetchone()
                if row:
                    try:
                        data = json.loads(row[0])
                        build_deploy_rec = UpstreamBuildDeployRecord(**data)
                    except Exception as e:
                        print(f"Error parsing build_deploy data: {e}")
                # No record found — leave build_deploy_rec as None.
                # Agents will reason from demand/plan/environment context.


        return DeliveryContext(
            demand_id=demand_id,
            plan_id=plan_id,
            release_id=release_id_rec,
            demand=demand_rec,
            estimate=estimate_rec,
            plan=plan_rec,
            dependencies=dependencies_list,
            environments=environments_list,
            build_deploy=build_deploy_rec
        )
