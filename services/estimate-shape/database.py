import os
import json
from typing import List, Optional, Dict
from models import EstimateRecord

class InMemoryEstimateDatabase:
    def __init__(self):
        self.records: Dict[str, EstimateRecord] = {}
        self._load_fixtures()

    def _load_fixtures(self):
        """Loads JSON files from the fixtures directory."""
        fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        if not os.path.exists(fixtures_dir):
            return

        for filename in os.listdir(fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        record = EstimateRecord(**data)
                        self.records[record.estimate_id] = record
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")

    def get_all(self) -> List[EstimateRecord]:
        return list(self.records.values())

    def get_by_id(self, estimate_id: str) -> Optional[EstimateRecord]:
        return self.records.get(estimate_id)

    def get_by_demand_id(self, demand_id: str) -> List[EstimateRecord]:
        return [r for r in self.records.values() if r.demand_id == demand_id]

    def save(self, record: EstimateRecord):
        self.records[record.estimate_id] = record

# Global instance
db = InMemoryEstimateDatabase()
