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
