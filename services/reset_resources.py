import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from shared_db.connection import get_db

with get_db() as conn:
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE resources
        SET allocated             = 0,
            status                = 'Available',
            current_project       = NULL,
            current_task          = NULL,
            project_start_date    = NULL,
            project_end_date      = NULL,
            allocation_percentage = 0.0
    """)
    conn.commit()
    print(f"Updated {cursor.rowcount} records to unallocated/Available.")

    cursor.execute("SELECT employee_id, employee_name, status, allocated, allocation_percentage FROM resources")
    for row in cursor.fetchall():
        print(row)
