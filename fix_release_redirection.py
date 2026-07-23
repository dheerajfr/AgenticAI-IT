import os

path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\release-change.js"
with open(path, "r", encoding="utf-8") as file:
    content = file.read()

content = content.replace("window.location.hash = 'ops-readiness';", "window.location.hash = 'dashboard';")
content = content.replace("Proceed to Ops Readiness", "Return to Dashboard")

with open(path, "w", encoding="utf-8") as file:
    file.write(content)

print("Updated release-change.js redirection")
