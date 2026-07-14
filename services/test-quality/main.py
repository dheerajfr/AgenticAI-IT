from fastapi import FastAPI

app = FastAPI(
    title="Test & Quality Service (Stage 07)",
    description="Skeleton service for continuous test generation, execution, and quality gates.",
    version="1.0.0"
)

@app.get("/api/test-quality/health")
def health_check():
    return {"status": "healthy", "stage": 7}
