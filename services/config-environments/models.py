from pydantic import BaseModel, Field
from typing import Literal

class EnvironmentStateRecord(BaseModel):
    component_id: str = Field(..., description="Unique ID of the component")
    environment: Literal["dev", "test", "staging", "prod"] = Field(..., description="Target environment")
    deployed_version: str = Field(..., description="What's actually running")
    expected_version: str = Field(..., description="What the release baseline says should be running")
    drift_status: Literal["in-sync", "drifted"] = Field(..., description="Whether reality matches the baseline")
    last_checked: str = Field(..., description="ISO 8601 datetime string")

class ReconcileDriftRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]
    deployed_version: str
    expected_version: str

class RecordsHygieneRequest(BaseModel):
    component_id: str
    environment: Literal["dev", "test", "staging", "prod"]
    observed_name: str
    cmdb_name: str
