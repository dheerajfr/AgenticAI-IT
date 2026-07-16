"""
migrate_resource_db.py
======================
Converts the 'resources' table in services/resource.db to match the
'employees' table schema in services/plan-schedule/plan.db.

Existing data (name, role, skills, total_capacity, allocated_capacity)
is migrated into the new employee schema columns with sensible defaults.
A backup of the original table is preserved as 'resources_backup'.
"""

import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from shared_db.connection import get_db, get_db_path

RESOURCE_DB = get_db_path()

# ── Read existing resources ──────────────────────────────────────────────────
# Using shared connection to check resources
print("Reading existing resources...")
with get_db() as conn:
    cursor = conn.cursor()

    # Check if already migrated
    cursor.execute("PRAGMA table_info(resources)")
    cols = [c[1] for c in cursor.fetchall()]
    if 'name' not in cols:
        print("  [OK] The table 'resources' is already migrated (no 'name' column). Skipping migration.")
        sys.exit(0)

    # Backup original table
    cursor.execute("DROP TABLE IF EXISTS resources_backup")
    cursor.execute("CREATE TABLE resources_backup AS SELECT * FROM resources")
    conn.commit()
    print("  [OK] Backed up original 'resources' table to 'resources_backup'.")

    cursor.execute("SELECT name, role, skills, total_capacity, allocated_capacity FROM resources")
    old_rows = cursor.fetchall()
    print(f"  [OK] Found {len(old_rows)} records.")

# ── Rebuild with new schema ───────────────────────────────────────────────────
print("\nRebuilding 'resources' table with employee schema...")
with get_db() as conn:
    cursor = conn.cursor()

    # Drop old table
    cursor.execute("DROP TABLE IF EXISTS resources")

    # Create new table matching employees schema in plan.db
    cursor.execute("""
        CREATE TABLE resources (
            employee_id           TEXT UNIQUE,
            employee_name         TEXT,
            email                 TEXT PRIMARY KEY,
            role                  TEXT,
            skill                 TEXT,
            skills                TEXT,
            experience            INTEGER,
            department            TEXT,
            status                TEXT DEFAULT 'Available',
            allocated             BOOLEAN DEFAULT 0,
            current_project       TEXT,
            current_task          TEXT,
            project_start_date    TEXT,
            project_end_date      TEXT,
            allocation_percentage REAL DEFAULT 0.0,
            leave_start_date      TEXT,
            leave_end_date        TEXT
        )
    """)

    # Migrate old rows
    for idx, (name, role, skills, total_cap, alloc_cap) in enumerate(old_rows, start=1):
        emp_id = f"EMP-2026-{idx:04d}"
        email  = name.lower() + "@example.com"

        # Parse first skill from JSON array or plain string
        try:
            skills_list = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills_list = [skills] if skills else []
        skill = skills_list[0] if skills_list else role

        # Derive allocation percentage from capacity figures
        allocation_pct = 0.0
        if total_cap and total_cap > 0 and alloc_cap:
            allocation_pct = round((alloc_cap / total_cap) * 100, 1)

        status    = "Allocated" if allocation_pct > 0 else "Available"
        allocated = 1 if status == "Allocated" else 0

        cursor.execute("""
            INSERT INTO resources (
                employee_id, employee_name, email, role, skill, skills,
                experience, department, status, allocated,
                current_project, current_task,
                project_start_date, project_end_date,
                allocation_percentage,
                leave_start_date, leave_end_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            emp_id, name, email, role, skill, skills,
            5, "Engineering", status, allocated,
            None, None,
            None, None,
            allocation_pct,
            None, None
        ))

        print(f"  [OK] Inserted {emp_id} | {name} | {role} | {status} ({allocation_pct}%)")

    conn.commit()

# ── Verify ───────────────────────────────────────────────────────────────────
print("\nVerifying migrated data...")
with get_db() as conn:
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(resources)")
    cols = cursor.fetchall()
    print("\nNew schema:")
    for col in cols:
        print(f"  {col[0]:>2}  {col[1]:<25} {col[2]}")

    cursor.execute("SELECT employee_id, employee_name, email, role, skill, status, allocation_percentage FROM resources")
    rows = cursor.fetchall()
    print(f"\nMigrated {len(rows)} records:")
    for r in rows:
        print(f"  {r}")

print("\n[DONE] Migration complete. Original data preserved in 'resources_backup'.")
