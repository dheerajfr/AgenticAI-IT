import os
import re

path = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\release-change.js"
with open(path, "r", encoding="utf-8") as file:
    content = file.read()

button_html = """
    <!-- Redirection Footer -->
    <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
      <button onclick="window.location.hash = 'ops-readiness';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
        Proceed to Ops Readiness &rarr;
      </button>
    </div>
"""

# In renderDashboardView(), before the modal starts:
# Look for `      <!-- Create Modal -->`
# and insert the button right above it.
content = content.replace("    <!-- Create Modal -->", button_html + "\n    <!-- Create Modal -->")

# In renderReleaseDetailsView(), look for the end of the wrapper innerHTML.
# It ends with `      </div>\n    </div>\n  `;\n\n  // After rendering, if we are in change-request`
content = content.replace("      </div>\n    </div>\n  `;\n\n  // After rendering, if we are in change-request", 
                          "      </div>\n    </div>\n" + button_html + "  `;\n\n  // After rendering, if we are in change-request")

with open(path, "w", encoding="utf-8") as file:
    file.write(content)

print("Redirection added to release-change.js")
