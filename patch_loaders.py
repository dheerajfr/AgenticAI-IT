import os
import re

targets = {
    "demand-intake.js": [
        ("window.generateWithAI = async function() {", "Generating AI Draft..."),
        ("window.submitDemand = async function() {", "Submitting Project Demand...")
    ],
    "estimate-shape.js": [
        ("window.generateEstimate = async function() {", "Sizing effort and cost..."),
        ("window.approveEstimate = async function() {", "Approving estimate..."),
        ("window.rebaselineEstimate = async function() {", "Rebaselining project...")
    ],
    "plan-schedule.js": [
        ("window.autoSensePlan = async function() {", "Generating schedule and WBS..."),
        ("window.acceptPlan = async function() {", "Saving project plan..."),
        ("window.triggerProjectReplan = async function() {", "Re-planning project...")
    ],
    "dependencies.js": [
        ("window.autoSenseDependencies = async function() {", "Sensing cross-project dependencies..."),
        ("window.resolveDependency = async function(id) {", "Resolving dependency..."),
        ("window.sendDependencyReminder = async function(id) {", "Drafting reminder...")
    ],
    "config-environments.js": [
        ("window.triggerSync = async function(env) {", "Syncing environment state..."),
        ("window.autoFixDrift = async function(env) {", "Auto-fixing drift...")
    ],
    "build-deploy.js": [
        ("window.draftRunbook = async function() {", "Drafting runbook..."),
        ("window.draftCutoverComms = async function() {", "Drafting cutover communication..."),
        ("window.startDeployment = async function() {", "Orchestrating deployment...")
    ],
    "test-quality.js": [
        ("window.runQualityGate = async function() {", "Evaluating quality gates..."),
        ("window.autoTriageDefects = async function() {", "Auto-triaging defects...")
    ],
    "release-change.js": [
        ("window.triggerAutomatedDraft = async function() {", "Drafting change record..."),
        ("window.analyzeCollisions = async function() {", "Analyzing release collisions...")
    ],
    "risk-issues.js": [
        ("window.convertRisk = async function(riskId) {", "Converting risk to issue..."),
        ("window.generateMitigation = async function(riskId) {", "Generating mitigation plan...")
    ],
    "reporting-communication.js": [
        ("window.generateReport = async function() {", "Compiling executive report..."),
        ("window.draftCommunication = async function() {", "Drafting email communication...")
    ],
    "knowledge-artifacts.js": [
        ("window.synthesizeArtifact = async function() {", "Synthesizing knowledge artifact...")
    ],
    "vendor-coordination.js": [
        ("window.analyzeSLA = async function() {", "Analyzing SLA discrepancies..."),
        ("window.revokeAccess = async function(vendor) {", "Revoking vendor access...")
    ]
}

base_dir = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell"

for filename, funcs in targets.items():
    file_path = os.path.join(base_dir, filename)
    if not os.path.exists(file_path):
        continue
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    for func_sig, msg in funcs:
        if "window.showGlobalLoader" in content and func_sig in content:
            # Check if this specific func already has the loader right after signature
            # Not perfectly robust but good enough for a one-off patch
            pass
            
        if func_sig in content:
            # Find the signature and insert the loader
            pattern = re.escape(func_sig)
            replacement = f"{func_sig}\n  if (window.showGlobalLoader) window.showGlobalLoader('{msg}');"
            content = re.sub(pattern, replacement, content)

    # Now we need to add hideGlobalLoader() before all returns and at the end of the function.
    # A simpler approach is to find all "window.showToast" or "console.error" or "catch" block ends?
    # Actually, a better regex is to wrap the inside of the function in a try...finally, but that's complex to inject.
    # Instead, let's just do a naive search and replace for "fetch" lines, but that's messy.
    
    # A safer approach for this codebase:
    # 1. Replace "window.showToast(" with "if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast("
    content = content.replace("window.showToast(", "if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast(")
    
    # Also replace "window.fetch..." at the end if there's no toast, but most actions have a toast.
    # Let's ensure every file has hideGlobalLoader at the start of fetch...Data just in case.
    fetch_func = f"window.fetch{filename.split('.')[0].replace('-', ' ').title().replace(' ', '')}Data = async function"
    # Actually, let's just make it simple: replace all "window.showToast" and also add hide to any UI render just in case
    if "window.render" in content:
        content = re.sub(r'(window\.render[A-Za-z0-9_]+Screen = function\([^\)]*\)\s*\{)', r'\1\n  if (window.hideGlobalLoader) window.hideGlobalLoader();', content)
        
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Patched {filename}")

