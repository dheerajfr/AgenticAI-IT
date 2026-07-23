from pydantic import BaseModel
from typing import List, Optional, Dict

# ==========================================
# Request Models
# ==========================================

class KnowledgeRequest(BaseModel):
    demand_id: str
    topic: str

class SyncRequest(BaseModel):
    demand_id: str

class SearchRequest(BaseModel):
    query: str
    demand_id: Optional[str] = None  # if provided, search is scoped to this demand's artefacts

class AddArtefactRequest(BaseModel):
    """Register a real artefact (document, spec, wiki) for a demand."""
    name: str
    type: str            # e.g. Requirements, Architecture, Test Evidence, Runbook, ADR, etc.
    url: Optional[str] = None       # link to the actual file/document
    version: Optional[str] = "1.0"

class ApproveArtefactRequest(BaseModel):
    """Human approval step for an artefact registered under a demand."""
    artefact_name: str   # name of the artefact to approve (matches AddArtefactRequest.name)
    approved_by: str     # username / email of the approver

# ==========================================
# Response / Record Models
# ==========================================

class ArtefactItem(BaseModel):
    name: str
    type: str
    url: Optional[str] = None
    version: Optional[str] = "1.0"
    status: str = "pending-review"   # pending-review | approved
    approved_by: Optional[str] = None
    registered_at: Optional[str] = None

class KnowledgeRecord(BaseModel):
    id: str
    demand_id: str
    lessons_learned: Optional[List[Dict]] = None
    indexed_artefacts: Optional[List[Dict]] = None
    onboarding_updates: Optional[List[Dict]] = None
