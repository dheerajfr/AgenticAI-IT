import sqlite3
import json

try:
    conn = sqlite3.connect('services/source.db')
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in c.fetchall()]
    print('Tables:', tables)
    for t in tables:
        c.execute(f"SELECT * FROM {t} LIMIT 1")
        print(f'{t} cols:', [d[0] for d in c.description])
        row = c.fetchone()
        if row:
            print(f'{t} first row data lengths:', [len(str(val)) for val in row])
except Exception as e:
    print('Error:', e)
