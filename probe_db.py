import sqlite3
import json

conn = sqlite3.connect('services/source.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cursor.fetchall()]
print('Tables:', tables)

if 'demands' in tables:
    cursor.execute("SELECT demand_id, data FROM demands LIMIT 3")
    rows = cursor.fetchall()
    print('\n--- demands ---')
    for r in rows:
        d = json.loads(r[1]) if r[1] else {}
        print(f"  demand_id={r[0]}, title={d.get('title','')}")

if 'plans' in tables:
    cursor.execute("SELECT plan_id, demand_id, data FROM plans LIMIT 3")
    rows = cursor.fetchall()
    print('\n--- plans ---')
    for r in rows:
        d = json.loads(r[2]) if r[2] else {}
        print(f"  plan_id={r[0]}, demand_id={r[1]}, end_date={d.get('end_date','')}")

if 'estimates' in tables:
    cursor.execute("SELECT estimate_id, demand_id FROM estimates LIMIT 3")
    rows = cursor.fetchall()
    print('\n--- estimates ---')
    for r in rows:
        print(f"  estimate_id={r[0]}, demand_id={r[1]}")

if 'change_records' in tables:
    cursor.execute("SELECT change_record_id, demand_id, plan_id FROM change_records LIMIT 5")
    rows = cursor.fetchall()
    print('\n--- change_records ---')
    for r in rows:
        print(f"  change_record_id={r[0]}, demand_id={r[1]}, plan_id={r[2]}")

if 'change_risk_scores' in tables:
    cursor.execute("SELECT risk_score_id, demand_id FROM change_risk_scores LIMIT 5")
    rows = cursor.fetchall()
    print('\n--- change_risk_scores ---')
    for r in rows:
        print(f"  risk_score_id={r[0]}, demand_id={r[1]}")

conn.close()
