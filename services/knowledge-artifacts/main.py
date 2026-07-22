import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import KnowledgeRequest, SearchRequest, SyncRequest
from database import db
from llm_client import call_gemini

app = FastAPI(title="Knowledge & Artefacts Service (Always-on)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    if not record:
        record = {
            "id": f"KNO-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "lessons_learned": [],
            "indexed_artefacts": [
                {"name": f"BRD_{demand_id}.pdf", "type": "Requirements"},
                {"name": f"Arch_{demand_id}.drawio", "type": "Architecture"}
            ],
            "onboarding_updates": []
        }
        db.save(record)
    return record

@app.get("/api/knowledge-artifacts/project/{demand_id}")
def get_knowledge(demand_id: str):
    record = _get_or_create(demand_id)
    return record

@app.post("/api/knowledge-artifacts/extract-lessons")
def extract_lessons(req: KnowledgeRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Extract lessons learned for project {req.demand_id} regarding topic: {req.topic} from post-incident reports and retro boards."
    ai_res = call_gemini(prompt)
    
    lesson = {
        "id": f"LES-{uuid.uuid4().hex[:4]}",
        "topic": req.topic,
        "content": ai_res
    }
    
    lessons = record.get("lessons_learned", [])
    lessons.append(lesson)
    record["lessons_learned"] = lessons
    db.save(record)
    
    return {"status": "success", "lesson": lesson, "record": record}

@app.post("/api/knowledge-artifacts/sync-onboarding")
def sync_onboarding(req: SyncRequest):
    record = _get_or_create(req.demand_id)
    prompt = f"Update the standard engineering onboarding materials using the new architecture patterns introduced in project {req.demand_id}."
    ai_res = call_gemini(prompt)
    
    update = {
        "id": f"ONB-{uuid.uuid4().hex[:4]}",
        "description": "Onboarding Wiki Updated",
        "details": ai_res
    }
    
    updates = record.get("onboarding_updates", [])
    updates.append(update)
    record["onboarding_updates"] = updates
    db.save(record)
    
    return {"status": "success", "update": update, "record": record}

@app.post("/api/knowledge-artifacts/search")
def search_artefacts(req: SearchRequest):
    prompt = f"Perform a semantic search across all project artefacts for query: '{req.query}'. Return the top 3 relevant documents."
    ai_res = call_gemini(prompt)
    
    # Mock search results for UI
    results = [
        {"doc": "Arch_Review.md", "snippet": "The new caching layer uses Redis..."},
        {"doc": "PostMortem_12.pdf", "snippet": "Memory leak detected in module X..."}
    ]
    
    return {"status": "success", "ai_summary": ai_res, "results": results}
