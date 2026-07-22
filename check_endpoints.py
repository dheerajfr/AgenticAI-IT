import urllib.request, json

base = "http://127.0.0.1:8000/api"
endpoints = [
    ("demands", f"{base}/demands"),
    ("estimates", f"{base}/estimates"),
    ("environments", f"{base}/environments"),
    ("plans", f"{base}/plans"),
    ("dependencies", f"{base}/dependencies"),
    ("release-change", f"{base}/release-change"),
    ("deployments", f"{base}/deployments/orchestration"),
    ("test-quality", f"{base}/test-quality"),
    ("ops-readiness", f"{base}/ops-readiness"),
]

print("=" * 55)
print("API Gateway Health Check")
print("=" * 55)
all_ok = True
for name, url in endpoints:
    try:
        r = urllib.request.urlopen(url, timeout=5)
        data = json.loads(r.read())
        count = len(data) if isinstance(data, list) else "object"
        print(f"  OK    /api/{name:<22} {count} records")
    except Exception as e:
        print(f"  FAIL  /api/{name:<22} {e}")
        all_ok = False
print("=" * 55)
print("Result:", "ALL PASS" if all_ok else "SOME FAILURES")
