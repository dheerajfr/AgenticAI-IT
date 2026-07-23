import os

path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\dashboard.js"
with open(path, "r", encoding="utf-8") as file:
    content = file.read()

# 1. Remove ops-readiness from timeline
content = content.replace("        <div style=\"flex:1; height: 2px; background: ${getTimelineLineColor('release-change', currentStage)};\"></div>\n        ${renderTimelineNode('Ops Ready', 'ops-readiness', currentStage, data)}\n", "")

# 2. Remove ops-readiness from details accordions
content = content.replace("      ${renderOpsReadinessCard(data)}\n", "")

# 3. Remove ops-readiness from stageOrder
content = content.replace("'test-quality', 'release-change', 'ops-readiness'", "'test-quality', 'release-change'")

# 4. Remove renderOpsReadinessCard function
import re
content = re.sub(r"function renderOpsReadinessCard\(data\) \{.*?\}\n", "", content, flags=re.DOTALL)

with open(path, "w", encoding="utf-8") as file:
    file.write(content)

print("Removed Ops Readiness from dashboard.js")
