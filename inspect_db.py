import sqlite3, json

conn = sqlite3.connect('services/source.db')
c = conn.cursor()

tables_to_sample = [
    'demands', 'estimates', 'plans', 'release_change',
    'ops_readiness', 'test_cases', 'quality_gate_results',
    'vulnerability_scans', 'traceability_matrix', 'audit_logs'
]

for t in tables_to_sample:
    try:
        c.execute(f"SELECT * FROM [{t}] LIMIT 1")
        row = c.fetchone()
        if row:
            cols = [d[0] for d in c.description]
            print(f"\n=== {t} ===")
            print("Cols:", cols)
            # Try to parse the data column if it exists
            data_idx = next((i for i,col in enumerate(cols) if col == 'data'), None)
            if data_idx is not None and row[data_idx]:
                try:
                    parsed = json.loads(row[data_idx])
                    if isinstance(parsed, dict):
                        print("Data keys:", list(parsed.keys())[:10])
                    else:
                        print("Data type:", type(parsed).__name__)
                except:
                    print("Data (raw):", str(row[data_idx])[:100])
            # Print demand_id col
            did_idx = next((i for i,col in enumerate(cols) if col == 'demand_id'), None)
            if did_idx is not None:
                print("demand_id:", row[did_idx])
        else:
            print(f"\n=== {t} === (empty)")
    except Exception as e:
        print(f"\n=== {t} === ERROR: {e}")

conn.close()
