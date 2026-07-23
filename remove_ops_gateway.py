import os

path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\gateway.py"
with open(path, "r", encoding="utf-8") as file:
    content = file.read()

# 1. Remove load_service
content = content.replace("ops_readiness_app = load_service(\"ops-readiness\")\n", "")

# 2. Remove router block
content = content.replace("        elif path.startswith(\"/api/ops-readiness\"):\n            await ops_readiness_app(scope, receive, send)\n            return\n", "")

with open(path, "w", encoding="utf-8") as file:
    file.write(content)

print("Removed Ops Readiness API from gateway.py")
