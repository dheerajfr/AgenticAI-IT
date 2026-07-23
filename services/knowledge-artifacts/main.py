import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from models import (
    KnowledgeRequest,
    SearchRequest,
    SyncRequest,
    AddArtefactRequest,
    ApproveArtefactRequest,
)
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

# ==========================================
# Internal helper
# ==========================================

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    if not record:
        record = {
            "id": f"KNO-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "lessons_learned": [],
            "indexed_artefacts": [],
            "onboarding_updates": []
        }
        db.save(record)
    return record

# ==========================================
# Health
# ==========================================

@app.get("/api/knowledge-artifacts/health")
def health_check():
    return {"status": "healthy", "service": "knowledge-artifacts"}

# ==========================================
# Capability 52 — Knowledge & Onboarding
# ==========================================

@app.get("/api/knowledge-artifacts/project/{demand_id}")
def get_knowledge(demand_id: str):
    record = _get_or_create(demand_id)
    return record


@app.post("/api/knowledge-artifacts/extract-lessons")
def extract_lessons(req: KnowledgeRequest):
    record = _get_or_create(req.demand_id)
    prompt = (
        f"Extract lessons learned for project {req.demand_id} "
        f"regarding topic: {req.topic} from post-incident reports and retro boards."
    )
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
    prompt = (
        f"Update the standard engineering onboarding materials using the new architecture "
        f"patterns introduced in project {req.demand_id}."
    )
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

# ==========================================
# Capability 51 — Artefact Sync
# ==========================================

@app.get("/api/knowledge-artifacts/artefacts/{demand_id}")
def list_artefacts(demand_id: str):
    """Return all indexed artefacts registered for a demand."""
    record = _get_or_create(demand_id)
    return {
        "demand_id": demand_id,
        "artefacts": record.get("indexed_artefacts", []),
        "total": len(record.get("indexed_artefacts", []))
    }


@app.post("/api/knowledge-artifacts/artefacts/{demand_id}")
def add_artefact(demand_id: str, req: AddArtefactRequest):
    """
    Register a real artefact for a demand (Quick Win #2).
    Status starts as 'pending-review' until a human approves it.
    """
    artefact = {
        "name": req.name,
        "type": req.type,
        "url": req.url,
        "version": req.version or "1.0",
        "status": "pending-review",
        "approved_by": None,
        "registered_at": datetime.now(timezone.utc).isoformat()
    }
    updated_record = db.add_artefact(demand_id, artefact)
    return {
        "status": "success",
        "message": f"Artefact '{req.name}' registered and is pending human approval.",
        "artefact": artefact,
        "record": updated_record
    }


@app.post("/api/knowledge-artifacts/artefacts/{demand_id}/approve")
def approve_artefact(demand_id: str, req: ApproveArtefactRequest):
    """
    Human approval gate for a registered artefact (Quick Win #3).
    Marks artefact status as 'approved' and records who approved it.
    """
    updated_record = db.approve_artefact(demand_id, req.artefact_name, req.approved_by)
    if updated_record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Demand '{demand_id}' or artefact '{req.artefact_name}' not found."
        )
    # Return just the approved artefact for clarity
    approved = next(
        (a for a in updated_record.get("indexed_artefacts", []) if a.get("name") == req.artefact_name),
        None
    )
    return {
        "status": "success",
        "message": f"Artefact '{req.artefact_name}' approved by '{req.approved_by}'.",
        "artefact": approved,
        "record": updated_record
    }

# ==========================================
# Search — grounded in real indexed artefacts (Quick Win #1)
# ==========================================

@app.post("/api/knowledge-artifacts/search")
def search_artefacts(req: SearchRequest):
    """
    Semantic search across indexed artefacts.
    If demand_id is provided the search is scoped to that demand's artefacts;
    otherwise an AI summary is returned without document grounding.
    The AI summary is now grounded in the REAL indexed artefacts from the DB,
    not hardcoded mock documents.
    """
    real_artefacts = []

    if req.demand_id:
        record = db.get_by_demand(req.demand_id)
        if record:
            real_artefacts = record.get("indexed_artefacts", [])

    # Build artefact context string for the LLM prompt
    if real_artefacts:
        artefact_context = "The following artefacts are indexed for this project:\n"
        for a in real_artefacts:
            status_tag = f"[{a.get('status', 'pending-review')}]"
            url_info = f" — URL: {a['url']}" if a.get("url") else ""
            artefact_context += (
                f"  - {a['name']} (Type: {a['type']}, v{a.get('version', '1.0')}) "
                f"{status_tag}{url_info}\n"
            )
    else:
        artefact_context = "No artefacts have been indexed for this project yet."

    prompt = (
        f"You are a project knowledge assistant. "
        f"A team member asked: '{req.query}'\n\n"
        f"{artefact_context}\n\n"
        f"Based on the artefacts listed above, answer the question as helpfully as possible. "
        f"If none of the listed artefacts are relevant, say so clearly and suggest what document type would help."
    )

    ai_res = call_gemini(prompt)

    # Build result list from REAL artefacts (filter by relevance — return all for now)
    results = [
        {
            "doc": a["name"],
            "type": a.get("type", "Unknown"),
            "url": a.get("url"),
            "status": a.get("status", "pending-review"),
            "snippet": f"Version {a.get('version', '1.0')} — {a.get('type', '')} document"
        }
        for a in real_artefacts
    ]

    if not results:
        results = [{"doc": "No artefacts indexed yet", "type": "—", "url": None,
                    "status": "—", "snippet": "Register artefacts via POST /api/knowledge-artifacts/artefacts/{demand_id}"}]

    return {
        "status": "success",
        "demand_id": req.demand_id,
        "query": req.query,
        "ai_summary": ai_res,
        "results": results,
        "total_artefacts_searched": len(real_artefacts)
    }
