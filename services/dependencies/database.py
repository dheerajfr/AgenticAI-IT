import os
import json
from typing import List, Optional, Dict
from models import DependencyEdge, PlanRecord

class InMemoryDependencyDatabase:
    def __init__(self):
        self.records: Dict[str, DependencyEdge] = {}
        self._load_fixtures()

    def _load_fixtures(self):
        """Loads DependencyEdge JSON files from the fixtures directory."""
        fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        if not os.path.exists(fixtures_dir):
            return

        for filename in os.listdir(fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        record = DependencyEdge(**data)
                        self.records[record.dependency_id] = record
                except Exception as e:
                    print(f"Error loading fixture {filename}: {e}")

    def get_all(self) -> List[DependencyEdge]:
        return list(self.records.values())

    def get_by_id(self, dependency_id: str) -> Optional[DependencyEdge]:
        return self.records.get(dependency_id)

    def get_by_task_id(self, task_id: str) -> List[DependencyEdge]:
        """Finds any dependency where the task is either the source or target."""
        return [
            r for r in self.records.values()
            if r.source_task_id == task_id or r.target_task_id == task_id
        ]

    def save(self, record: DependencyEdge):
        self.records[record.dependency_id] = record


class PlanLoader:
    @staticmethod
    def get_plan_fixtures_dir() -> str:
        # Navigate relative to this file: services/dependencies/../../services/plan-schedule/fixtures
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "plan-schedule", "fixtures")
        )

    @classmethod
    def load_all_plans(cls) -> List[PlanRecord]:
        plans = []
        fixtures_dir = cls.get_plan_fixtures_dir()
        if not os.path.exists(fixtures_dir):
            return plans

        for filename in os.listdir(fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        plans.append(PlanRecord(**data))
                except Exception as e:
                    print(f"Error loading plan fixture {filename}: {e}")
        return plans

    @classmethod
    def load_plan_by_id(cls, plan_id: str) -> Optional[PlanRecord]:
        for plan in cls.load_all_plans():
            if plan.plan_id == plan_id:
                return plan
        return None


# Global instances
db = InMemoryDependencyDatabase()
plan_loader = PlanLoader()
