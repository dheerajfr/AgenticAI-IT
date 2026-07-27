import os
import json

file_path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\services\risk-issues\main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

import_logic = """
    # Update project summary from demand
    demand_data = external_data.get("demand", {})
    if demand_data and "title" in demand_data:
        record["project_summary"] = {
            "title": demand_data.get("title", "Unknown"),
            "customer": demand_data.get("business_unit", "Unknown"),
            "status": demand_data.get("status", "Active")
        }
        
    # --- Auto-Sync Issues & Timeline from external data ---
    
    # 1. Sync Test Quality Defects as Issues
    tq_data = external_data.get("test_quality", {})
    if isinstance(tq_data, dict):
        # Sync defects
        defects = tq_data.get("defect_triage", {}).get("triaged_defects", [])
        for d in defects:
            issue_id = f"ISS-DEFECT-{d.get('defect_id')}"
            if not any(iss["issue_id"] == issue_id for iss in record["issues"]):
                record["issues"].append({
                    "issue_id": issue_id,
                    "risk_id": None,
                    "description": f"Test Defect ({d.get('severity')}): {d.get('cluster', 'Testing Issue')}",
                    "rca_result": d.get("root_cause_hint", ""),
                    "owner": d.get("assigned_to", "QA"),
                    "status": "Open",
                    "target_date": "",
                    "progress": 0,
                    "related_tasks": [],
                    "related_sprint": "",
                    "assigned_employees": [d.get("assigned_to", "QA")],
                    "dependencies": [],
                    "test_failures": [d.get("defect_id", "")],
                    "build_failures": [],
                    "release_info": "",
                    "environment_details": "",
                    "created_at": datetime.now().isoformat()
                })
                record["timeline"].append({
                    "id": f"TL-{uuid.uuid4().hex[:6]}",
                    "timestamp": datetime.now().isoformat(),
                    "event_type": "Issue Synced",
                    "description": f"Synced defect {d.get('defect_id')} from Test & Quality.",
                    "related_id": issue_id
                })
                
        # Sync Security Findings as Risks
        findings = tq_data.get("security_testing", {}).get("findings", [])
        for f in findings:
            rsk_id = f"RSK-SEC-{f.get('finding_id')}"
            if not any(r["id"] == rsk_id for r in record["risks"]):
                record["risks"].append({
                    "id": rsk_id,
                    "category": "Security",
                    "description": f"Security Vulnerability: {f.get('category')} at {f.get('location')}",
                    "probability": "High",
                    "impact": "High" if f.get('severity') == "high" else "Medium",
                    "severity": f.get('severity', "medium").capitalize(),
                    "risk_score": 85 if f.get('severity') == "high" else 50,
                    "confidence_score": 100,
                    "owner": "Security Team",
                    "related_module": "Test & Quality",
                    "linked_tasks": [],
                    "suggested_mitigation": f.get("draft_fix", ""),
                    "expected_resolution_date": "",
                    "root_cause_analysis": "Automated SAST/DAST Scan",
                    "ai_recommendation": "Address before release.",
                    "status": "Open",
                    "created_at": datetime.now().isoformat(),
                    "due_date": ""
                })

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

old_logic = """
    # Update project summary from demand
    demand_data = external_data.get("demand", {})
    if demand_data and "title" in demand_data:
        record["project_summary"] = {
            "title": demand_data.get("title", "Unknown"),
            "customer": demand_data.get("business_unit", "Unknown"),
            "status": demand_data.get("status", "Active")
        }
"""

if old_logic.strip() in content:
    content = content.replace(old_logic.strip(), import_logic.strip())
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated main.py")
else:
    print("Could not find insertion point!")

