import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from shared_db.connection import get_db

with get_db() as conn:
    cursor = conn.cursor()
    
    # 1. Reset all resources to Available/unallocated
    cursor.execute("""
        UPDATE resources
        SET allocated             = 0,
            status                = 'Available',
            current_project       = NULL,
            current_task          = NULL,
            project_start_date    = NULL,
            project_end_date      = NULL,
            allocation_percentage = 0.0,
            leave_start_date      = NULL,
            leave_end_date        = NULL
    """)
    print(f"Updated {cursor.rowcount} records in resources to unallocated/Available.")
    
    # 2. Update all plans with 'accepted' status to 'draft' in their JSON data
    cursor.execute("SELECT plan_id, data FROM plans")
    plans = cursor.fetchall()
    updated_plans_count = 0
    for plan_id, data_str in plans:
        try:
            data = json.loads(data_str)
            if data.get("status") == "accepted":
                data["status"] = "draft"
                cursor.execute("UPDATE plans SET data = ? WHERE plan_id = ?", (json.dumps(data), plan_id))
                updated_plans_count += 1
        except Exception as e:
            print(f"Error updating plan {plan_id}: {e}")
            
    print(f"Updated {updated_plans_count} plans to 'draft' status.")
    
    # 3. Clear task employee assignments
    cursor.execute("DELETE FROM task_employee_assignments")
    print(f"Cleared task employee assignments.")
    
    conn.commit()

    # 4. Verify and print current resources
    print("\nCurrent resource state:")
    cursor.execute("SELECT employee_id, employee_name, status, allocated, current_project, current_task, leave_start_date, leave_end_date FROM resources")
    for row in cursor.fetchall():
        print(row)

