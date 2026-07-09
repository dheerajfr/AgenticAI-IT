from pydantic import BaseModel, Field
from typing import Literal, Optional, List

class EnvironmentStateRecord(BaseModel):
    component_id: str = Field(..., description="Unique ID of the component")
    environment: Literal["dev", "test", "staging", "prod"] = Field(..., description="Target environment")
    deployed_version: str = Field(..., description="What's actually running")
    expected_version: str = Field(..., description="What the release baseline says should be running")
    drift_status: Literal["in-sync", "drifted"] = Field(..., description="Whether reality matches the baseline")
    last_checked: str = Field(..., description="ISO 8601 datetime string")
    observed_name: Optional[str] = Field(None, description="Physical observed name")
    cmdb_name: Optional[str] = Field(None, description="Name in the CMDB")
    expected_requirements: List[str] = Field(default_factory=list)
    observed_requirements: List[str] = Field(default_factory=list)

class ReconcileDriftRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]
    deployed_version: str
    expected_version: str

class RecordsHygieneRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]

class ApplyHygieneFixRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]
    new_cmdb_name: str

class AutoRemediateRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]

class PromoteEnvironmentRequest(BaseModel):
    component_id: str
    source_environment: Literal["dev", "test", "staging"]

class VerifyReadinessRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]
