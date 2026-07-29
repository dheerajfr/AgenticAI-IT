import sqlite3
conn = sqlite3.connect('services/source.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
for table in tables:
    try:
        cursor.execute(f"SELECT * FROM {table}")
        rows = cursor.fetchall()
        for i, r in enumerate(rows):
            r_str = str(r).lower()
            if any(name in r_str for name in ['fardeen', 'dheeraj', 'sajja', 'nagaraju', 'pravallika', 'ayushi']):
                print(f"{table} row {i}: {r}")
    except Exception as e:
        print(f"Error reading {table}: {e}")
