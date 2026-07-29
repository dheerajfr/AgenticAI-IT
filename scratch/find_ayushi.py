import sqlite3
conn = sqlite3.connect('services/source.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
for table in tables:
    try:
        cursor.execute(f"SELECT * FROM {table}")
        cols = [c[0] for c in cursor.description]
        rows = cursor.fetchall()
        for r in rows:
            if any('ayushi' in str(val).lower() for val in r):
                # truncate long JSON strings to keep output readable
                r_cleaned = [str(val)[:200] if len(str(val)) > 200 else val for val in r]
                print(f"Table: {table}, Row: {dict(zip(cols, r_cleaned))}")
    except Exception as e:
        print(f"Error in {table}: {e}")
