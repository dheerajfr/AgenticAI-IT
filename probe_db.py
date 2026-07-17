import sqlite3

conn = sqlite3.connect('services/source.db')
cursor = conn.cursor()

specific_tables = ['resources', 'environments', 'demands', 'dependencies']
for t in specific_tables:
    cursor.execute(f"PRAGMA table_info({t})")
    cols = cursor.fetchall()
    print(f"Table: {t}")
    for col in cols:
        print(f"  {col[1]} ({col[2]})")
    try:
        cursor.execute(f"SELECT * FROM {t} LIMIT 1")
        row = cursor.fetchone()
        if row:
            print(f"  Sample row: {row}")
    except Exception as e:
         print(f"  Error: {e}")
    print()

conn.close()
