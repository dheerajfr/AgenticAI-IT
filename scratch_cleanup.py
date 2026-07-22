import sqlite3, json, os
db_path = os.path.join(os.path.dirname(__file__), 'services', 'build-deploy', 'build-deploy.db')
if not os.path.exists(db_path):
    db_path = os.path.join(os.path.dirname(__file__), 'services', 'source.db')
conn = sqlite3.connect(db_path)
rows = conn.execute('SELECT deployment_id, data FROM deployments').fetchall()
comps = {}
deletes = []
for r in rows:
    dep_id = r[0]
    data = json.loads(r[1])
    comp = data.get('component_id')
    if comp not in comps:
        comps[comp] = dep_id
    else:
        deletes.append(dep_id)

for d in deletes:
    conn.execute('DELETE FROM deployments WHERE deployment_id=?', (d,))
conn.commit()
print(f"Deleted {len(deletes)} duplicate deployments.")
