import os

files = [
    "ops-readiness.js",
    "risk-issues.js",
    "budget-cost.js",
    "vendor-coordination.js",
    "reporting-communication.js",
    "knowledge-artifacts.js"
]

base_dir = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell"

for f in files:
    path = os.path.join(base_dir, f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    # We replace `if (!demandId) {\n    viewport.innerHTML`
    # with `if (!demandId) {\n    const viewport = document.getElementById('viewport');\n    viewport.innerHTML`
    
    content = content.replace(
        "if (!demandId) {\n    viewport.innerHTML",
        "if (!demandId) {\n    const viewport = document.getElementById('viewport');\n    viewport.innerHTML"
    )
    
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
    print(f"Fixed viewport in {f}")
