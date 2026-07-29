import sqlite3
import os

db_files = []
for r, d, files in os.walk('.'):
    for f in files:
        if f.endswith('.db'):
            db_files.append(os.path.join(r, f))

for db in db_files:
    print(f"\n================ SEARCHING IN DB: {db} ================")
    try:
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cursor.fetchall()]
        for table in tables:
            try:
                cursor.execute(f"SELECT * FROM {table}")
                cols = [c[0] for c in cursor.description]
                rows = cursor.fetchall()
                for i, r in enumerate(rows):
                    r_str = str(r).lower()
                    found = [n for n in ['fardeen', 'dheeraj', 'karthik', 'sajja', 'nagaraju', 'pravallika', 'ayushi'] if n in r_str]
                    if found:
                        r_cleaned = [str(val)[:200] if len(str(val)) > 200 else val for val in r]
                        print(f"Table: {table}, Row {i}: {dict(zip(cols, r_cleaned))} (found: {found})")
            except Exception as e:
                print(f"Error reading {table} in {db}: {e}")
    except Exception as e:
        print(f"Error connecting to {db}: {e}")
