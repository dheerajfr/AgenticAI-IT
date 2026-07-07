import os
import json
from typing import Dict, List, Optional
from models import EnvironmentStateRecord

class EnvironmentDatabase:
    def __init__(self, fixtures_dir: str):
        self._store: Dict[str, EnvironmentStateRecord] = {}
        self.fixtures_dir = fixtures_dir
        self.load_fixtures()

    def _generate_key(self, component_id: str, environment: str) -> str:
        return f"{component_id}_{environment}"

    def load_fixtures(self):
        if not os.path.exists(self.fixtures_dir):
            print(f"Fixtures directory not found at: {self.fixtures_dir}")
            return
        for filename in os.listdir(self.fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        record = EnvironmentStateRecord(**data)
                        self.save(record)
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        print(f"Initialized database with {len(self._store)} records.")

    def get_all(self) -> List[EnvironmentStateRecord]:
        return list(self._store.values())

    def get_by_id_and_env(self, component_id: str, environment: str) -> Optional[EnvironmentStateRecord]:
        key = self._generate_key(component_id, environment)
        return self._store.get(key)

    def save(self, record: EnvironmentStateRecord) -> EnvironmentStateRecord:
        key = self._generate_key(record.component_id, record.environment)
        self._store[key] = record
        return record

# Initialize the global repository singleton
FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "fixtures")
db = EnvironmentDatabase(FIXTURES_PATH)
