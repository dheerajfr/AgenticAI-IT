import sys, os
sys.path.append(os.path.abspath('..'))
from database import db
record = db.get_by_id_and_env('svc-sast-scanner', 'dev')
print('Record:', record)
from llm_client import call_gemini
print(call_gemini('return {"status": "clean"}', is_json=True))
