import os
import sqlite3
import json

SERVICES_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DB_PATH = os.path.join(SERVICES_DIR, "source.db")

DATABASES_TO_MIGRATE = [
    os.path.join(SERVICES_DIR, "resource.db"),
    os.path.join(SERVICES_DIR, "config-environments", "config-env.db"),
    os.path.join(SERVICES_DIR, "demand-intake", "demand.db"),
    os.path.join(SERVICES_DIR, "dependencies", "dependencies.db"),
    os.path.join(SERVICES_DIR, "estimate-shape", "estimate.db"),
    os.path.join(SERVICES_DIR, "plan-schedule", "plan.db")
]

def get_db():
    conn = sqlite3.connect(SOURCE_DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def migrate_db(old_db_path, new_db_conn):
    if not os.path.exists(old_db_path):
        print(f"[-] Old database not found at {old_db_path}, skipping.")
        return
    print(f"[*] Migrating {old_db_path}...")
    old_conn = sqlite3.connect(old_db_path)
    old_cursor = old_conn.cursor()
    
    # Get all tables
    old_cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = old_cursor.fetchall()
    
    new_cursor = new_db_conn.cursor()
    for table_name, create_sql in tables:
        print(f"  [+] Migrating table: {table_name}")
        # Create table in new db
        try:
            new_cursor.execute(create_sql)
        except sqlite3.OperationalError as e:
            if "already exists" in str(e):
                print(f"    Table {table_name} already exists. Appending/replacing rows.")
            else:
                raise
        
        # Get all rows
        old_cursor.execute(f"SELECT * FROM {table_name}")
        rows = old_cursor.fetchall()
        if not rows:
            print(f"    Table {table_name} is empty.")
            continue
            
        # Get column count to format insert
        col_count = len(rows[0])
        
        # Check column count in target table
        new_cursor.execute(f"PRAGMA table_info({table_name})")
        target_columns = new_cursor.fetchall()
        if target_columns and len(target_columns) != col_count:
            print(f"    [!] Skipping table {table_name} from {old_db_path}: column count mismatch ({col_count} vs {len(target_columns)}).")
            continue
            
        placeholders = ",".join(["?"] * col_count)
        
        # Insert into new db using REPLACE to prevent unique constraint failures
        new_cursor.executemany(
            f"INSERT OR REPLACE INTO {table_name} VALUES ({placeholders})",
            rows
        )
        print(f"    Copied {len(rows)} rows into {table_name}.")
    new_db_conn.commit()
    old_conn.close()

def main():
    os.makedirs(os.path.dirname(SOURCE_DB_PATH), exist_ok=True)
    new_conn = get_db()
    
    for db_path in DATABASES_TO_MIGRATE:
        migrate_db(db_path, new_conn)
        
    new_conn.close()
    print("[*] Migration completed successfully.")

if __name__ == "__main__":
    main()
