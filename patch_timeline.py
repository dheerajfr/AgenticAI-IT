import os
import json

file_path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\services\risk-issues\main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

import_logic = """
    # 2. Sync Dependency Blockers as Risks or Issues
    deps = external_data.get("dependencies", [])
    if isinstance(deps, list):
        for dep in deps:
            if isinstance(dep, dict):
                # Map to Timeline
                hist = dep.get("activity_history", [])
                for idx, h in enumerate(hist):
                    tl_id = f"TL-DEP-{dep.get('dependency_id')}-{idx}"
                    if not any(t.get("related_id") == tl_id for t in record["timeline"]):
                        record["timeline"].append({
                            "id": f"TL-{uuid.uuid4().hex[:6]}",
                            "timestamp": dep.get("last_updated", datetime.now().isoformat()),
                            "event_type": "Dependency Update",
                            "description": h,
                            "related_id": tl_id
                        })
                
                if dep.get("status") == "blocked":
                    rsk_id = f"RSK-DEP-{dep.get('dependency_id')}"
                    if not any(r["id"] == rsk_id for r in record["risks"]):
                        record["risks"].append({
                            "id": rsk_id,
                            "category": "Schedule",
                            "description": f"Dependency Blocker: {dep.get('source_task_id')} -> {dep.get('target_task_id')}",
                            "severity": "High",
                            "risk_score": 80,
                            "confidence_score": 90,
                            "owner": dep.get("owner", "Unassigned"),
                            "related_module": "Dependencies",
                            "status": "Open",
                            "created_at": datetime.now().isoformat()
                        })

    # 3. Sync Plan Tasks into Timeline
    plan_data = external_data.get("plan", {})
    if isinstance(plan_data, dict):
        tasks = plan_data.get("tasks", [])
        for t in tasks:
            tl_id = f"TL-TSK-{t.get('task_id')}"
            if not any(tl.get("related_id") == tl_id for tl in record["timeline"]):
                record["timeline"].append({
                    "id": f"TL-{uuid.uuid4().hex[:6]}",
                    "timestamp": t.get("start_date", datetime.now().isoformat()) + "T00:00:00",
                    "event_type": "Plan Task Scheduled",
                    "description": f"Task '{t.get('name')}' scheduled from {t.get('start_date')} to {t.get('end_date')} (Owner: {t.get('owner')})",
                    "related_id": tl_id
                })

    # 4. Sync Demand Events into Timeline
    if demand_data:
        tl_id = f"TL-DEM-{demand_id}"
        if not any(tl.get("related_id") == tl_id for tl in record["timeline"]):
            record["timeline"].append({
                "id": f"TL-{uuid.uuid4().hex[:6]}",
                "timestamp": demand_data.get("created_at", datetime.now().isoformat()),
                "event_type": "Project Intake",
                "description": f"Demand '{demand_data.get('title')}' created by {demand_data.get('business_unit')}.",
                "related_id": tl_id
            })
"""

old_logic = """
    # 2. Sync Dependency Blockers as Risks or Issues
    deps = external_data.get("dependencies", [])
    if isinstance(deps, list):
        for dep in deps:
            if isinstance(dep, dict) and dep.get("status") == "blocked":
                rsk_id = f"RSK-DEP-{dep.get('dependency_id')}"
                if not any(r["id"] == rsk_id for r in record["risks"]):
                    record["risks"].append({
                        "id": rsk_id,
                        "category": "Schedule",
                        "description": f"Dependency Blocker: {dep.get('source_task_id')} -> {dep.get('target_task_id')}",
                        "severity": "High",
                        "risk_score": 80,
                        "confidence_score": 90,
                        "owner": dep.get("owner", "Unassigned"),
                        "related_module": "Dependencies",
                        "status": "Open",
                        "created_at": datetime.now().isoformat()
                    })
"""

if old_logic.strip() in content:
    content = content.replace(old_logic.strip(), import_logic.strip())
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated main.py")
else:
    print("Could not find insertion point!")

