import sys
import os

filepath = r'c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\services\dependencies\main.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoint = '''
@app.get("/dependencies/{dependency_id}/task-details")
def get_task_details(dependency_id: str, task_id: str):
    dep = db.get_by_id(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
    
    plan = plan_loader.load_plan_by_id(dep.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    task = next((t for t in plan.tasks if t.task_id == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    depends_on = "None"
    depends_on_owner = "N/A"
    if task.predecessor_task_ids and len(task.predecessor_task_ids) > 0:
        pred_id = task.predecessor_task_ids[0]
        depends_on = pred_id
        pred_task = next((t for t in plan.tasks if t.task_id == pred_id), None)
        if pred_task:
            depends_on_owner = pred_task.owner
            
    # Calculate mock status/risk for prototype
    status = "Not Started"
    risk = "Low"
    if depends_on != "None":
        risk = "Medium"
        
    return {
        "selected_task": task.name,
        "current_owner": task.owner,
        "depends_on": depends_on,
        "depends_on_owner": depends_on_owner,
        "status": status,
        "risk": risk
    }
'''

if 'get_task_details' not in content:
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write('\n' + new_endpoint + '\n')
    print('Endpoint added.')
else:
    print('Endpoint already exists.')
