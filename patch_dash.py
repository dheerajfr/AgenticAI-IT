import os
import re

file_path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\dashboard.js"
if os.path.exists(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    funcs = [
        ("window.generateWithAI = async function() {", "Generating AI Draft..."),
        ("window.submitDemand = async function() {", "Submitting Project Demand...")
    ]

    for func_sig, msg in funcs:
        pattern = re.escape(func_sig)
        replacement = f"{func_sig}\n  if (window.showGlobalLoader) window.showGlobalLoader('{msg}');"
        content = re.sub(pattern, replacement, content)

    content = content.replace("window.showToast(", "if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast(")
    if "window.render" in content:
        content = re.sub(r'(window\.render[A-Za-z0-9_]+Screen = function\([^\)]*\)\s*\{)', r'\1\n  if (window.hideGlobalLoader) window.hideGlobalLoader();', content)
        
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched dashboard.js")
