import os
import re

files = [
    ("ops-readiness.js", "Ops Readiness", "ops"),
    ("risk-issues.js", "Risk & Issues", "risk"),
    ("budget-cost.js", "Budget & Cost", "budget"),
    ("vendor-coordination.js", "Vendor Coordination", "vendor"),
    ("reporting-communication.js", "Reporting & Comms", "reporting"),
    ("knowledge-artifacts.js", "Knowledge & Artefacts", "ka")
]

base_dir = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell"

def get_camel_case(filename):
    name = filename.replace('.js', '')
    parts = name.split('-')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])

for f, title, short_id in files:
    path = os.path.join(base_dir, f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    camel = get_camel_case(f)
    fetch_func_name = f"fetch{camel[0].upper() + camel[1:]}Data"
    render_func_name = f"render{camel[0].upper() + camel[1:]}Screen"
    
    # 1. We need to inject the mutation observer setup right after `const dropdownHtml = ... ;`
    # Let's find: `    </select>\n  `;`
    
    setup_code = f"""
  const viewport = document.getElementById('viewport');
  const _origOverflow = viewport.style.overflow;
  const _origOverflowY = viewport.style.overflowY;
  const _origDisplay = viewport.style.display;
  const _origFlexDir = viewport.style.flexDirection;
  const _origPadding = viewport.style.padding;

  viewport.style.overflow = 'hidden';
  viewport.style.overflowY = 'hidden';
  viewport.style.display = 'flex';
  viewport.style.flexDirection = 'column';
  viewport.style.padding = '0';

  const _observer = new MutationObserver(() => {{
    if (!document.getElementById('{short_id}-panel-container')) {{
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }}
  }});
  _observer.observe(viewport, {{ childList: true, subtree: false }});

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {{
    sidebarItemsHtml = demands.map(d => {{
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${{isActive ? 'active' : ''}}" onclick="sessionStorage.setItem('selectedDemandId', '${{d.demand_id}}'); window.{fetch_func_name}();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${{isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}}; background: ${{isActive ? 'rgba(99,102,241,0.1)' : 'transparent'}};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${{d.demand_id}}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${{d.title || 'Untitled Demand'}}</h4>
        </li>
      `;
    }}).join('');
  }}

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">{title}</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${{sidebarItemsHtml}}
        </ul>
      </aside>
      <main class="details-panel" id="{short_id}-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
      </main>
    </div>
  `;
"""
    
    # We replace `  if (!demandId) {` with `setup_code + "  if (!demandId) {"`
    # and we also wrap the `viewport.innerHTML`
    
    pattern1 = re.compile(r"(\s*if \(!demandId\) \{)")
    content, count1 = pattern1.subn(setup_code + r"\1", content, count=1)
    
    # Now for the `viewport.innerHTML = ...` blocks, we need to inject layoutPrefix and layoutSuffix
    
    # Find `viewport.innerHTML = \``
    # Replace with `viewport.innerHTML = layoutPrefix + \``
    pattern2 = re.compile(r"viewport\.innerHTML\s*=\s*`")
    content, count2 = pattern2.subn(r"viewport.innerHTML = layoutPrefix + `", content)
    
    # Find the ends of the template strings.
    # We'll just look for `    `;\n    return;` and `  `;\n};`
    pattern3 = re.compile(r"(\s+`;\s+return;)")
    content, count3 = pattern3.subn(r"` + layoutSuffix;\n    return;", content)
    
    pattern4 = re.compile(r"(\s+`;\s*\};)")
    content, count4 = pattern4.subn(r"` + layoutSuffix;\n};", content)
    
    # We should also strip out the duplicate `const viewport = document.getElementById('viewport');` that we added inside `if (!demandId)` before.
    content = content.replace(
        "if (!demandId) {\n    const viewport = document.getElementById('viewport');\n    viewport.innerHTML",
        "if (!demandId) {\n    viewport.innerHTML"
    )

    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
    print(f"Added sidebar to {f}: {count1} {count2} {count3} {count4}")
