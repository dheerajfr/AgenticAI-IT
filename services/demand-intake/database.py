import os
import json
from typing import Dict, List, Optional
from models import DemandRecord

class DemandDatabase:
    def __init__(self, fixtures_dir: str):
        self._store: Dict[str, DemandRecord] = {}
        self.fixtures_dir = fixtures_dir
        self.load_fixtures()

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
                        record = DemandRecord(**data)
                        self._store[record.demand_id] = record
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")
        print(f"Initialized database with {len(self._store)} records.")

    def get_all(self) -> List[DemandRecord]:
        # Return sorted by ID
        return sorted(list(self._store.values()), key=lambda r: r.demand_id)

    def get_by_id(self, demand_id: str) -> Optional[DemandRecord]:
        return self._store.get(demand_id)

    def save(self, record: DemandRecord) -> DemandRecord:
        self._store[record.demand_id] = record
        return record

    def delete(self, demand_id: str) -> bool:
        if demand_id in self._store:
            del self._store[demand_id]
            return True
        return False

# Initialize the global repository singleton
FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "fixtures")
db = DemandDatabase(FIXTURES_PATH)
