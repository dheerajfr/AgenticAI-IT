from fastapi import FastAPI

app = FastAPI(
    title="Build & Deploy Service (Stage 06)",
    description="Skeleton service for build & deploy orchestration.",
    version="1.0.0"
)

@app.get("/api/build-deploy/health")
def health_check():
    return {"status": "healthy", "stage": 6}
