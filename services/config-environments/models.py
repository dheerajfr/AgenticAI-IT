from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional, List

class EnvironmentStateRecord(BaseModel):
    demand_id: Optional[str] = Field(None, description="Unified demand ID — shared across all stages")
    component_id: Optional[str] = Field(None, description="Component ID (legacy mapping for demand_id)")
    environment: Literal["dev", "test", "staging", "prod"] = Field(..., description="Target environment")
    deployed_version: str = Field(..., description="What's actually running")
    expected_version: str = Field(..., description="What the release baseline says should be running")
    drift_status: Literal["in-sync", "drifted"] = Field(..., description="Whether reality matches the baseline")
    last_checked: str = Field(..., description="ISO 8601 datetime string")
    observed_name: Optional[str] = Field(None, description="Physical observed name")
    cmdb_name: Optional[str] = Field(None, description="Name in the CMDB")
    expected_requirements: List[str] = Field(default_factory=list)
    observed_requirements: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def populate_ids(cls, data):
        if isinstance(data, dict):
            if "component_id" in data and "demand_id" not in data:
                data["demand_id"] = data["component_id"]
            elif "demand_id" in data and "component_id" not in data:
                data["component_id"] = data["demand_id"]
        return data

class ReconcileDriftRequest(BaseModel):
    demand_id: str
    environment: Literal["dev", "test", "staging", "prod"]
    deployed_version: str
    expected_version: str

class RecordsHygieneRequest(BaseModel):
    demand_id: str
    environment: Literal["dev", "test", "staging", "prod"]

class ApplyHygieneFixRequest(BaseModel):
    demand_id: str
    environment: Literal["dev", "test", "staging", "prod"]
    new_cmdb_name: str

class AutoRemediateRequest(BaseModel):
    demand_id: str
    environment: Literal["dev", "test", "staging", "prod"]

class PromoteEnvironmentRequest(BaseModel):
    demand_id: str
    source_environment: Literal["dev", "test", "staging"]

class VerifyReadinessRequest(BaseModel):
    demand_id: str
    environment: Literal["dev", "test", "staging", "prod"]

class SeedEnvironmentRequest(BaseModel):
    demand_id: str

class UpdateEnvironmentRequest(BaseModel):
    deployed_version: Optional[str] = None
    expected_version: Optional[str] = None
    observed_name: Optional[str] = None
    cmdb_name: Optional[str] = None
    expected_requirements: Optional[List[str]] = None
    observed_requirements: Optional[List[str]] = None
