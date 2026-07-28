
import requests
import json
res = requests.post('http://127.0.0.1:8000/api/budget-cost/invoices/final-approve', json={'demand_id': 'DEM-2026-0003'})
print(res.text)

