import os
import re

files = [
    ("ops-readiness.js", "dashboard", "Return to Dashboard"),
    ("risk-issues.js", "budget-cost", "Proceed to Budget & Cost"),
    ("budget-cost.js", "vendor-coordination", "Proceed to Vendor Coordination"),
    ("vendor-coordination.js", "reporting-communication", "Proceed to Reporting & Comms"),
    ("reporting-communication.js", "knowledge-artifacts", "Proceed to Knowledge & Artefacts"),
    ("knowledge-artifacts.js", "dashboard", "Return to Dashboard")
]

base_dir = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell"

for f, target_hash, btn_text in files:
    path = os.path.join(base_dir, f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    button_html = f"""
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = '{target_hash}';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            {btn_text} &rarr;
          </button>
        </div>"""
        
    pattern = re.compile(r"const layoutSuffix = `\s*</main>\s*</div>\s*`;")
    
    new_suffix = f"""const layoutSuffix = `{button_html}
      </main>
    </div>
  `;"""
    
    content, count = pattern.subn(new_suffix, content)
    
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
    print(f"Added redirection to {f}: {count} replacements")
