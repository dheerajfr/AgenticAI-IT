import sys
import uuid
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

# Shared source DB (all other modules write here)
_SOURCE_DB = Path(__file__).parent.parent / "source.db"

# Upload storage directory
_UPLOAD_DIR = _THIS_DIR / "uploads"
_UPLOAD_DIR.mkdir(exist_ok=True)

from models import (
    KnowledgeRequest,
    SearchRequest,
    SyncRequest,
    AddArtefactRequest,
    ApproveArtefactRequest,
    GenerateStubsRequest,
    ValidateQARequest,
    ValidateUpdateRequest,
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
# Internal helpers
# ==========================================

def _get_or_create(demand_id: str) -> dict:
    record = db.get_by_demand(demand_id)
    if not record:
        record = {
            "id": f"KNO-{uuid.uuid4().hex[:8]}",
            "demand_id": demand_id,
            "lessons_learned": [],
            "indexed_artefacts": [],
            "onboarding_updates": [],
            "validated_qas": []
        }
        db.save(record)
    else:
        if "validated_qas" not in record or not record.get("validated_qas"):
            record["validated_qas"] = []
    return record


def _source_conn():
    """Read-only connection to the shared source.db."""
    conn = sqlite3.connect(_SOURCE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _fetch_demand_data(demand_id: str) -> dict:
    """Pull demand metadata from source.db for use in prompts."""
    try:
        with _source_conn() as conn:
            row = conn.execute(
                "SELECT data FROM demands WHERE demand_id = ?", (demand_id,)
            ).fetchone()
            if row and row["data"]:
                return json.loads(row["data"])
    except Exception:
        pass
    return {"demand_id": demand_id}


def _fetch_resources_data() -> list:
    """Fetch all resources and their skills from source.db."""
    res_list = []
    try:
        with _source_conn() as conn:
            rows = conn.execute(
                "SELECT employee_name, role, skills FROM resources"
            ).fetchall()
            for r in rows:
                try:
                    skills_list = json.loads(r["skills"]) if r["skills"] else []
                except Exception:
                    skills_list = [r["skills"]] if r["skills"] else []
                res_list.append({
                    "name": r["employee_name"],
                    "role": r["role"],
                    "skills": skills_list
                })
    except Exception as e:
        print("Error fetching resource skills:", e)
    return res_list


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
    demand_data = _fetch_demand_data(req.demand_id)
    
    # Ingest actual skills data from source.db
    resources_data = _fetch_resources_data()
    if resources_data:
        resources_str = "\n".join([
            f"- {r['name']} ({r['role']}) — Skills: {', '.join(r['skills'])}"
            for r in resources_data
        ])
    else:
        resources_str = "No specific resources allocated yet."

    prompt = (
        f"Update the standard engineering onboarding materials using the new architecture "
        f"patterns introduced in project {req.demand_id} titled '{demand_data.get('title', 'Unknown')}'.\n"
        f"Description: {demand_data.get('description', '')}.\n\n"
        f"Here are the available team members and their skillsets for this project:\n"
        f"{resources_str}\n\n"
        f"Produce a concise, well-structured onboarding wiki section covering:\n"
        f"1. Team Context & Key Contacts (specifically mapping the available team members/skills to the project needs. "
        f"In the Key Contacts table, include ONLY these columns: 'Team Member', 'Role', 'Key Skills', and 'Project Contribution'. "
        f"Do NOT include any 'Contact Info' or chat references column in this table).\n"
        f"2. Key Decisions & Architecture Overview\n"
        f"3. First-week Checklist (what technical setup is required and who to ask for help on Python/frontend/GenAI/ML based on their skills).\n\n"
        f"Do NOT include any footnotes or placeholder text warning lines at the end, such as '* Replace with actual contact details or internal chat references.'\n\n"
        f"Format the output nicely with markdown headings."
    )
    ai_res = call_gemini(prompt)

    # Clean up any trailing placeholder warnings
    unwanted = [
        "\\* Replace with actual contact details or internal chat references.",
        "* Replace with actual contact details or internal chat references.",
        "Replace with actual contact details or internal chat references."
    ]
    for text in unwanted:
        ai_res = ai_res.replace(text, "")
    ai_res = ai_res.strip()

    update = {
        "id": f"ONB-{uuid.uuid4().hex[:4]}",
        "description": f"Onboarding Wiki Updated — {demand_data.get('title', req.demand_id)}",
        "details": ai_res,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "validated": False,
        "validated_by": None,
        "validated_at": None
    }

    # Overwrite history - only keep the latest generated onboarding guide
    record["onboarding_updates"] = [update]
    db.save(record)

    return {"status": "success", "update": update, "record": record}


# ==========================================
# Capability 51 — Artefact Sync (manual)
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
    """Register a real artefact for a demand. Status starts as pending-review."""
    artefact = {
        "name": req.name,
        "type": req.type,
        "url": req.url,
        "version": req.version or "1.0",
        "status": "pending-review",
        "approved_by": None,
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "source": req.source or "manual",
        "content": req.content or None,
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
    """Human approval gate for a registered artefact."""
    updated_record = db.approve_artefact(demand_id, req.artefact_name, req.approved_by)
    if updated_record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Demand '{demand_id}' or artefact '{req.artefact_name}' not found."
        )
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


@app.delete("/api/knowledge-artifacts/artefacts/{demand_id}/{artefact_name}")
def delete_artefact(demand_id: str, artefact_name: str):
    """Remove an artefact from the index (e.g. to replace an uploaded file)."""
    removed = db.delete_artefact(demand_id, artefact_name)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Artefact '{artefact_name}' not found.")
    # Also delete uploaded file if it exists
    upload_dir = _UPLOAD_DIR / demand_id
    for f in upload_dir.glob("*") if upload_dir.exists() else []:
        if f.stem == artefact_name or f.name == artefact_name:
            f.unlink(missing_ok=True)
    return {"status": "success", "message": f"Artefact '{artefact_name}' removed."}


# ==========================================
# TIER 1 — Auto-Harvest from source.db
# ==========================================

# Map of (table_name, artefact_type, label_template)
_HARVEST_SOURCES = [
    ("demands",             "Business Requirements",  "{demand_id} — Business Requirements"),
    ("estimates",           "Estimate",               "{demand_id} — Effort & Cost Estimate"),
    ("plans",               "Project Plan",           "{demand_id} — Project Plan"),
    ("release_change",      "Change Record",          "{demand_id} — Release & Change Record"),
    ("ops_readiness",       "Ops Readiness Report",   "{demand_id} — Ops Readiness Report"),
    ("test_cases",          "Test Evidence",          "{demand_id} — Test Cases"),
    ("quality_gate_results","Quality Gate Report",    "{demand_id} — Quality Gate Report"),
    ("vulnerability_scans", "Security Report",        "{demand_id} — Vulnerability Scan Report"),
    ("traceability_matrix", "Traceability Matrix",    "{demand_id} — Traceability Matrix"),
    ("audit_logs",          "Audit Log",              "{demand_id} — Audit Log"),
]


@app.post("/api/knowledge-artifacts/auto-harvest/{demand_id}")
def auto_harvest(demand_id: str):
    """
    TIER 1: Scan source.db for real delivery outputs produced by other modules
    for this demand and automatically register them as indexed artefacts.
    """
    if not _SOURCE_DB.exists():
        raise HTTPException(status_code=500, detail="source.db not found.")

    harvested = []
    skipped = []

    try:
        with _source_conn() as conn:
            for table, art_type, label_tmpl in _HARVEST_SOURCES:
                try:
                    # Check if table exists
                    exists = conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                        (table,)
                    ).fetchone()
                    if not exists:
                        skipped.append(f"{table} (table not found)")
                        continue

                    # Query rows for this demand
                    cols = [r[1] for r in conn.execute(f"PRAGMA table_info([{table}])").fetchall()]
                    if "demand_id" not in cols:
                        skipped.append(f"{table} (no demand_id column)")
                        continue

                    rows = conn.execute(
                        f"SELECT * FROM [{table}] WHERE demand_id = ?", (demand_id,)
                    ).fetchall()
                    if not rows:
                        skipped.append(f"{table} (no rows for {demand_id})")
                        continue

                    # Build a content summary from the data JSON column (if present)
                    content_parts = []
                    for row in rows:
                        row_dict = dict(row)
                        data_raw = row_dict.get("data")
                        if data_raw:
                            try:
                                parsed = json.loads(data_raw)
                                if isinstance(parsed, dict):
                                    content_parts.append(json.dumps(parsed, indent=2))
                                elif isinstance(parsed, list):
                                    content_parts.append(json.dumps(parsed[:5], indent=2))
                            except Exception:
                                content_parts.append(str(data_raw)[:500])
                        else:
                            # For tables like release_change with multiple JSON cols
                            for key, val in row_dict.items():
                                if key not in ("id", "demand_id", "plan_id", "release_id") and val:
                                    try:
                                        parsed = json.loads(val) if isinstance(val, str) else val
                                        content_parts.append(f"## {key}\n{json.dumps(parsed, indent=2)[:300]}")
                                    except Exception:
                                        pass

                    label = label_tmpl.format(demand_id=demand_id)
                    content_text = "\n\n".join(content_parts)[:3000] if content_parts else None

                    artefact = {
                        "name": label,
                        "type": art_type,
                        "url": None,
                        "version": "1.0",
                        "status": "approved",       # auto-harvested real data is auto-approved
                        "approved_by": "system:auto-harvest",
                        "registered_at": datetime.now(timezone.utc).isoformat(),
                        "source": "auto-harvested",
                        "content": content_text,
                    }
                    db.add_artefact(demand_id, artefact)
                    harvested.append(label)

                except Exception as e:
                    skipped.append(f"{table} (error: {str(e)[:80]})")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Harvest failed: {e}")

    return {
        "status": "success",
        "demand_id": demand_id,
        "harvested_count": len(harvested),
        "harvested": harvested,
        "skipped": skipped,
    }


# ==========================================
# TIER 2 — File Upload
# ==========================================

@app.post("/api/knowledge-artifacts/upload/{demand_id}")
async def upload_artefact(
    demand_id: str,
    file: UploadFile = File(...),
    art_type: str = Form("Other"),
    version: str = Form("1.0"),
):
    """
    TIER 2: Upload a real document (PDF, DOCX, TXT, etc.) and register it as an artefact.
    File is stored server-side under uploads/{demand_id}/.
    """
    demand_upload_dir = _UPLOAD_DIR / demand_id
    demand_upload_dir.mkdir(parents=True, exist_ok=True)

    safe_name = file.filename.replace(" ", "_") if file.filename else f"upload_{uuid.uuid4().hex[:6]}"
    dest = demand_upload_dir / safe_name

    # Stream file to disk
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    # Try to read text content for searchability
    content_text = None
    if dest.suffix.lower() in (".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml"):
        try:
            content_text = dest.read_text(encoding="utf-8", errors="ignore")[:4000]
        except Exception:
            pass

    file_url = f"/api/knowledge-artifacts/files/{demand_id}/{safe_name}"
    artefact = {
        "name": safe_name,
        "type": art_type,
        "url": file_url,
        "version": version,
        "status": "pending-review",
        "approved_by": None,
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "source": "uploaded",
        "content": content_text,
    }
    db.add_artefact(demand_id, artefact)

    return {
        "status": "success",
        "message": f"'{safe_name}' uploaded and registered — pending human approval.",
        "artefact": artefact,
        "file_url": file_url,
        "size_bytes": dest.stat().st_size,
    }


@app.get("/api/knowledge-artifacts/files/{demand_id}/{filename}")
def serve_uploaded_file(demand_id: str, filename: str):
    """Serve a previously uploaded artefact file."""
    file_path = _UPLOAD_DIR / demand_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(str(file_path), filename=filename)


# ==========================================
# TIER 3 — AI-Generated Document Stubs
# ==========================================

_DEFAULT_DOC_TYPES = [
    ("Business Requirements Document (BRD)", "Requirements"),
    ("Architecture Design Document",         "Architecture"),
    ("Operations Runbook",                   "Runbook"),
]

@app.post("/api/knowledge-artifacts/generate-stubs/{demand_id}")
def generate_stubs(demand_id: str, req: GenerateStubsRequest = None):
    """
    TIER 3: Use the demand's metadata to AI-generate realistic draft documents
    (BRD, Architecture doc, Runbook) and auto-register them as artefacts.
    These give the search engine real, meaningful content to work with immediately.
    """
    demand_data = _fetch_demand_data(demand_id)
    title       = demand_data.get("title", demand_id)
    description = demand_data.get("description", "No description available.")
    domain      = demand_data.get("domain", "General")
    risk_level  = demand_data.get("risk_level", "Medium")

    doc_types = _DEFAULT_DOC_TYPES
    if req and req.doc_types:
        doc_types = [(dt, dt.split("(")[0].strip()) for dt in req.doc_types]

    generated = []
    for doc_name, doc_type in doc_types:
        prompt = (
            f"You are a senior delivery consultant. Generate a realistic, structured "
            f"{doc_name} for the following IT delivery project.\n\n"
            f"Project ID: {demand_id}\n"
            f"Title: {title}\n"
            f"Description: {description}\n"
            f"Domain: {domain}\n"
            f"Risk Level: {risk_level}\n\n"
            f"The document should be detailed, use proper headings, and be 300-500 words. "
            f"Do NOT add any preamble — start directly with the document title as a heading."
        )
        content = call_gemini(prompt)

        artefact_name = f"{demand_id}_{doc_name.replace(' ', '_').replace('(', '').replace(')', '')}_v1.0"
        artefact = {
            "name": artefact_name,
            "type": doc_type,
            "url": None,
            "version": "1.0",
            "status": "pending-review",
            "approved_by": None,
            "registered_at": datetime.now(timezone.utc).isoformat(),
            "source": "ai-generated",
            "content": content,
        }
        db.add_artefact(demand_id, artefact)
        generated.append({"name": artefact_name, "type": doc_type})

    return {
        "status": "success",
        "demand_id": demand_id,
        "generated_count": len(generated),
        "generated": generated,
    }


# ==========================================
# Search — grounded in real indexed artefacts
# ==========================================

@app.post("/api/knowledge-artifacts/search")
def search_artefacts(req: SearchRequest):
    """
    Semantic search across indexed artefacts.
    Now includes content from auto-harvested, uploaded, and AI-generated artefacts.
    """
    real_artefacts = []
    if req.demand_id:
        record = db.get_by_demand(req.demand_id)
        if record:
            real_artefacts = record.get("indexed_artefacts", [])

    # Build artefact context string for the LLM prompt (include content snippets)
    if real_artefacts:
        artefact_context = "The following artefacts are indexed for this project:\n"
        for a in real_artefacts:
            status_tag = f"[{a.get('status', 'pending-review')}]"
            source_tag = f"[{a.get('source', 'manual')}]"
            url_info   = f" — URL: {a['url']}" if a.get("url") else ""
            content_snippet = ""
            if a.get("content"):
                content_snippet = f"\n    Content snippet: {a['content'][:400]}..."
            artefact_context += (
                f"  - {a['name']} (Type: {a['type']}, v{a.get('version', '1.0')}) "
                f"{status_tag} {source_tag}{url_info}{content_snippet}\n"
            )
    else:
        artefact_context = "No artefacts have been indexed for this project yet."

    prompt = (
        f"You are a project knowledge assistant. "
        f"A team member asked: '{req.query}'\n\n"
        f"{artefact_context}\n\n"
        f"Based on the artefacts listed above (including any content snippets), "
        f"answer the question as helpfully and specifically as possible. "
        f"If none of the listed artefacts are relevant, say so clearly and suggest "
        f"what document type would help."
    )

    ai_res = call_gemini(prompt)

    results = [
        {
            "doc": a["name"],
            "type": a.get("type", "Unknown"),
            "url": a.get("url"),
            "status": a.get("status", "pending-review"),
            "source": a.get("source", "manual"),
            "snippet": (a.get("content") or "")[:120] + "..." if a.get("content") else f"Version {a.get('version', '1.0')} — {a.get('type', '')} document",
        }
        for a in real_artefacts
    ]

    if not results:
        results = [{"doc": "No artefacts indexed yet", "type": "—", "url": None,
                    "status": "—", "source": "—",
                    "snippet": "Use Auto-Harvest or Generate Stubs to populate the index."}]

    return {
        "status": "success",
        "demand_id": req.demand_id,
        "query": req.query,
        "ai_summary": ai_res,
        "results": results,
        "total_artefacts_searched": len(real_artefacts)
    }


# ==========================================
# Human validation of answers & onboarding updates
# ==========================================

@app.post("/api/knowledge-artifacts/validate-qa")
def validate_qa(req: ValidateQARequest):
    """
    Human directs - Validates sourced answers.
    Saves a validated question & answer pair to the project's knowledge wiki.
    """
    record = _get_or_create(req.demand_id)
    
    qa_item = {
        "id": f"QA-{uuid.uuid4().hex[:4]}",
        "query": req.query,
        "answer": req.answer,
        "validated_by": req.validated_by,
        "validated_at": datetime.now(timezone.utc).isoformat()
    }
    
    qas = record.get("validated_qas", [])
    # Prevent duplicate questions
    qas = [q for q in qas if q.get("query").strip().lower() != req.query.strip().lower()]
    qas.append(qa_item)
    record["validated_qas"] = qas
    db.save(record)
    
    return {"status": "success", "qa": qa_item, "record": record}


@app.post("/api/knowledge-artifacts/validate-update")
def validate_update(req: ValidateUpdateRequest):
    """
    Human directs - Validates/signs off on a generated onboarding wiki update.
    """
    record = _get_or_create(req.demand_id)
    updates = record.get("onboarding_updates", [])
    
    found = False
    for u in updates:
        if u.get("id") == req.update_id:
            u["validated"] = True
            u["validated_by"] = req.validated_by;
            u["validated_at"] = datetime.now(timezone.utc).isoformat()
            found = True
            break
            
    if not found:
        raise HTTPException(
            status_code=404,
            detail=f"Onboarding update '{req.update_id}' not found."
        )
        
    record["onboarding_updates"] = updates
    db.save(record)
    
    return {"status": "success", "record": record}


