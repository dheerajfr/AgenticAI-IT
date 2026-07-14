from fastapi import FastAPI

app = FastAPI(
    title="Release & Change Service (Stage 08)",
    description="Skeleton service for change record drafting, risk scoring, and CAB prep.",
    version="1.0.0"
)

@app.get("/api/release-change/health")
def health_check():
    return {"status": "healthy", "stage": 8}
