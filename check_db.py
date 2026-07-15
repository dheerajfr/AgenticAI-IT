import sqlite3, json

conn = sqlite3.connect('services/source.db')
c = conn.cursor()

print("=== Dependencies table (first 5) ===")
c.execute("PRAGMA table_info(dependencies)")
print("Columns:", [r[1] for r in c.fetchall()])
c.execute("SELECT * FROM dependencies LIMIT 5")
rows = c.fetchall()
for r in rows:
    print(f"  dep_id={r[0]}, demand_id={r[1]}, data_preview={r[2][:80]}")

print("\n=== Dependencies for DEM-2026-0072 ===")
c.execute("SELECT * FROM dependencies WHERE demand_id = ?", ("DEM-2026-0072",))
rows = c.fetchall()
print(f"  Found {len(rows)} dependencies")
for r in rows:
    d = json.loads(r[2])
    print(f"  dep_id={r[0]}, status={d.get('status')}, type={d.get('type')}")

print("\n=== Release REL-0072-1 full data ===")
c.execute("SELECT * FROM release WHERE release_id = 'REL-0072-1'")
row = c.fetchone()
if row:
    print(f"  release_id={row[0]}, project_id={row[1]}, plan_id={row[2]}")
    print(f"  status={row[6]}, risk_score={row[9]}, cab_required={row[10]}")

print("\n=== Change request for REL-0072-1 ===")
c.execute("SELECT change_id, summary, status FROM change_request WHERE release_id = 'REL-0072-1'")
row = c.fetchone()
if row:
    print(f"  change_id={row[0]}, summary={row[1][:80]}, status={row[2]}")
else:
    print("  No change request found")

conn.close()
