import sys
import os

filepath = r'c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\services\dependencies\main.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('@app.get("/dependencies/{dependency_id}/task-details")', '@app.get("/api/dependencies/{dependency_id}/task-details")')
content = content.replace('@app.get("/dependencies/plan/{plan_id}/tasks")', '@app.get("/api/dependencies/plan/{plan_id}/tasks")')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated route prefixes.')
