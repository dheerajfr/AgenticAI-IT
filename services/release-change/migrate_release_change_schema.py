import sys
import os
import sqlite3
import json

# Setup import path for shared db connection helper
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from shared_db.connection import get_db

def _get_suffix(ident: str) -> str:
    if not ident:
        return ""
    parts = ident.split("-")
    if len(parts) >= 2 and parts[-1].isdigit() and len(parts[-1]) <= 2:
        return parts[-2]
    return parts[-1]

def get_suffix_from_row(row):
    for val in [row[0], row[2], row[3]]: # id, release_id, demand_id
        if val:
            suffix = _get_suffix(val)
            if suffix:
                return suffix
    return ""

def run_migration():
    print("Connecting to database...")
    db_conn = get_db()
    cursor = db_conn.cursor()
    
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='release_change'")
    if not cursor.fetchone():
        print("release_change table not found. Nothing to migrate.")
        db_conn.close()
        return

    # Check if schema is already updated by checking columns
    cursor.execute("PRAGMA table_info(release_change)")
    columns = [col[1] for col in cursor.fetchall()]
    if "change_record" in columns:
        print("Schema is already migrated.")
        db_conn.close()
        return

    print("Fetching existing data...")
    cursor.execute("SELECT id, type, release_id, demand_id, data FROM release_change")
    rows = cursor.fetchall()
    print(f"Loaded {len(rows)} records.")

    # Group by suffix
    grouped = {}
    for row in rows:
        row_id, row_type, release_id, demand_id, data_str = row
        suffix = get_suffix_from_row(row)
        if not suffix:
            print(f"Skipping row with unknown suffix: {row}")
            continue

        if suffix not in grouped:
            grouped[suffix] = {
                'demand_id': None,
                'release_id': None,
                'change_record': None,
                'risk_score': None,
                'cab_pack': None,
                'collision_detection': None,
                'audit_trail': None,
                'release_data': None,
                'change_request': None,
                'risk_assessment': None,
                'cab': None,
                'release_collision': [],
                'audit_log': []
            }

        g = grouped[suffix]
        if demand_id:
            g['demand_id'] = demand_id
        if release_id:
            g['release_id'] = release_id

        if row_type == 'change_record':
            g['change_record'] = data_str
        elif row_type == 'risk_score':
            g['risk_score'] = data_str
        elif row_type == 'cab_pack':
            g['cab_pack'] = data_str
        elif row_type == 'collision_detection':
            g['collision_detection'] = data_str
        elif row_type == 'audit_trail':
            g['audit_trail'] = data_str
        elif row_type == 'release':
            g['release_data'] = data_str
        elif row_type == 'change_request':
            g['change_request'] = data_str
        elif row_type == 'risk_assessment':
            g['risk_assessment'] = data_str
        elif row_type == 'cab':
            g['cab'] = data_str
        elif row_type == 'release_collision':
            try:
                val = json.loads(data_str)
                if isinstance(val, list):
                    g['release_collision'].extend(val)
                else:
                    g['release_collision'].append(val)
            except Exception:
                pass
        elif row_type == 'audit_log':
            try:
                val = json.loads(data_str)
                if isinstance(val, list):
                    g['audit_log'].extend(val)
                else:
                    g['audit_log'].append(val)
            except Exception:
                pass

    print(f"Consolidated into {len(grouped)} unified records.")

    # Recreate the table
    print("Renaming old table...")
    cursor.execute("ALTER TABLE release_change RENAME TO release_change_old")
    
    print("Creating new table...")
    cursor.execute(
        """
        CREATE TABLE release_change (
            id TEXT PRIMARY KEY,
            release_id TEXT,
            demand_id TEXT,
            change_record TEXT,
            risk_score TEXT,
            cab_pack TEXT,
            collision_detection TEXT,
            audit_trail TEXT,
            release_data TEXT,
            change_request TEXT,
            risk_assessment TEXT,
            cab TEXT,
            release_collision TEXT,
            audit_log TEXT
        )
        """
    )
    
    print("Inserting consolidated records...")
    for suffix, g in grouped.items():
        collision_str = json.dumps(g['release_collision']) if g['release_collision'] else None
        audit_str = json.dumps(g['audit_log']) if g['audit_log'] else None
        
        cursor.execute(
            """
            INSERT INTO release_change (
                id, release_id, demand_id, change_record, risk_score, cab_pack,
                collision_detection, audit_trail, release_data, change_request,
                risk_assessment, cab, release_collision, audit_log
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                suffix, g['release_id'], g['demand_id'], g['change_record'], g['risk_score'],
                g['cab_pack'], g['collision_detection'], g['audit_trail'], g['release_data'],
                g['change_request'], g['risk_assessment'], g['cab'], collision_str, audit_str
            )
        )
        
    print("Dropping old table...")
    cursor.execute("DROP TABLE release_change_old")
    
    db_conn.commit()
    print("Migration completed successfully!")
    db_conn.close()

if __name__ == "__main__":
    run_migration()
