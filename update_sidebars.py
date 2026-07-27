import os
import re

search_bar_html = """
        <div class="sidebar-search" style="padding: 0 1rem 0.5rem 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
"""

files_to_update = [
    'dependencies.js',
    'estimate-shape.js',
    'knowledge-artifacts.js',
    'ops-readiness.js',
    'plan-schedule.js',
    'reporting-communication.js',
    'risk-issues.js',
    'test-quality.js',
    'vendor-coordination.js'
]

for filename in files_to_update:
    filepath = os.path.join('apps', 'shell', filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find <div class="sidebar-header"...</div> and inject the search_bar_html after it.
    # But wait, some have <div class="sidebar-header">...</div> and some have inline styles or buttons inside.
    # The safest way is to replace `</div>` of the sidebar-header. We can find the opening tag, then find its matching closing div.
    # Alternatively, we can just replace `<h3 class="sidebar-title"[^>]*>.*?</h3>\s*</div>` with `<h3 class="sidebar-title"...>...</h3></div>` + search_bar_html.
    
    def repl(m):
        return m.group(0) + search_bar_html
    
    # We look for the closing </div> of the sidebar-header by looking at where the title is
    new_content = re.sub(r'(<h3 class="sidebar-title"[^>]*>.*?</h3>\s*</div>)', repl, content, flags=re.DOTALL)
    
    # Wait, some sidebar-headers have buttons after the title, like ops-readiness.js might.
    # Let's check test-quality.js, vendor-coordination.js, etc.
    # We can just match the whole sidebar-header div.
    new_content2 = re.sub(r'(<div class="sidebar-header"[^>]*>.*?</div>)', repl, content, flags=re.DOTALL)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content2)
    print(f"Updated {filename}")
