from pydantic import BaseModel
from typing import List, Optional, Dict

class KnowledgeRequest(BaseModel):
    demand_id: str
    topic: str

class SearchRequest(BaseModel):
    query: str

class SyncRequest(BaseModel):
    demand_id: str

class KnowledgeRecord(BaseModel):
    id: str
    demand_id: str
    lessons_learned: Optional[List[Dict]] = None
    indexed_artefacts: Optional[List[Dict]] = None
    onboarding_updates: Optional[List[Dict]] = None
