<<<<<<< HEAD
=======

>>>>>>> main
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import runbooks, cutover, release_readiness, rollback_readiness, deployment_orchestration

app = FastAPI(
    title="Build & Deploy Service (Stage 06)",
    description="Backend API for deployment orchestration, release-readiness, rollback readiness, cutover comms, and runbook drafting.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runbooks.router)
app.include_router(cutover.router)
app.include_router(release_readiness.router)
app.include_router(rollback_readiness.router)
app.include_router(deployment_orchestration.router)


@app.get("/api/deployments")
def service_info():
    """Lightweight index of what's live in Stage 06."""
    return {
        "stage": "06 Build & deploy",
        "implemented": [
            "runbook-drafting",
            "cutover-comms",
            "release-readiness",
            "rollback-readiness",
            "deployment-orchestration",
        ],
        "pending": [],
    }
<<<<<<< HEAD


@app.get("/api/build-deploy/health")
def health_check():
    return {"status": "healthy", "stage": 6}


@app.get("/api/deployments/change-records")
def get_all_change_records():
    try:
        from shared_db.connection import get_db
        with get_db() as conn:
            c = conn.cursor()
            c.execute("SELECT change_record_id, demand_id FROM change_records")
            rows = c.fetchall()
            return [{"change_record_id": r[0], "demand_id": r[1]} for r in rows]
    except Exception as e:
        print(f"Error fetching change records: {e}")
        return []
=======
>>>>>>> main
