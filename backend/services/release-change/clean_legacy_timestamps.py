import sys
import os
import sqlite3
import json

# Setup import path for shared db connection helper
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from shared_db.connection import get_db

def sanitize_value(v):
    if isinstance(v, str):
        if v.endswith("+00:00Z"):
            return v.replace("+00:00Z", "Z")
    elif isinstance(v, dict):
        return {k: sanitize_value(val) for k, val in v.items()}
    elif isinstance(v, list):
        return [sanitize_value(item) for item in v]
    return v

def run_migration():
    print("Connecting to database...")
    db_conn = get_db()
    cursor = db_conn.cursor()
    
    # Select all records from release_change table
    cursor.execute("SELECT id, data FROM release_change")
    rows = cursor.fetchall()
    
    updated_count = 0
    for row_id, data_str in rows:
        try:
            data = json.loads(data_str)
            sanitized = sanitize_value(data)
            
            # If the data changed, save it back
            sanitized_str = json.dumps(sanitized)
            if sanitized_str != data_str:
                cursor.execute(
                    "UPDATE release_change SET data = ? WHERE id = ?",
                    (sanitized_str, row_id)
                )
                updated_count += 1
                print(f"Updated record: {row_id}")
        except Exception as e:
            print(f"Error processing record {row_id}: {e}")
            
    if updated_count > 0:
        db_conn.commit()
        print(f"Successfully migrated {updated_count} records.")
    else:
        print("No records needed updating.")
        
    db_conn.close()

if __name__ == "__main__":
    run_migration()
