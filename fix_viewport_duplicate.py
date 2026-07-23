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
    
    # In renderXScreen, it looks like:
    # window.renderOpsReadinessScreen = function() {
    #   const viewport = document.getElementById('viewport');
    #   const demandId = sessionStorage.getItem('selectedDemandId');
    # We want to remove `const viewport = document.getElementById('viewport');\n  `
    
    # Let's do a simple replace, but ONLY the first one inside the render function?
    # Actually, the file now has:
    # window.renderXScreen = function() {
    #   const viewport = document.getElementById('viewport');
    #   const demandId = sessionStorage.getItem('selectedDemandId');
    #   ...
    #   const viewport = document.getElementById('viewport');
    
    # If we just replace the exact string `window.renderXScreen = function() {\n  const viewport = document.getElementById('viewport');` 
    # with `window.renderXScreen = function() {`
    
    # We need to construct the function name dynamically or just use regex
    import re
    pattern = re.compile(r"(window\.render\w+Screen = function\(\) \{\s*)const viewport = document\.getElementById\('viewport'\);\s*", re.DOTALL)
    
    # This will match the function declaration and the very first viewport definition.
    content, count = pattern.subn(r"\1", content)
    
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
    print(f"Fixed {f}: {count} occurrences removed.")
