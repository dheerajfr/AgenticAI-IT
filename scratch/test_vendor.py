import requests

try:
    res = requests.post(
        "http://127.0.0.1:8000/api/vendor-coordination/check-sow",
        json={"demand_id": "DEM-001", "sow_document_id": "SOW-1234"}
    )
    print("Status code:", res.status_code)
    print("Response:", res.text)
except Exception as e:
    print("Error:", e)
