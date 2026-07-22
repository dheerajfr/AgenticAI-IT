import sys
import os

filepath = r'c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\services\dependencies\main.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoint = '''
@app.get("/dependencies/plan/{plan_id}/tasks")
def get_plan_tasks(plan_id: str):
    plan = plan_loader.load_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return [{"task_id": t.task_id, "name": t.name} for t in plan.tasks]
'''

if 'get_plan_tasks' not in content:
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write('\n' + new_endpoint + '\n')
    print('Endpoint added.')
else:
    print('Endpoint already exists.')
