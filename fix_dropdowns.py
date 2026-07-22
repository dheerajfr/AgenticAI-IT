import os
import re

files = [
    "ops-readiness.js",
    "risk-issues.js",
    "budget-cost.js",
    "vendor-coordination.js",
    "reporting-communication.js",
    "knowledge-artifacts.js"
]

base_dir = r"c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell"

def get_camel_case(filename):
    name = filename.replace('.js', '')
    parts = name.split('-')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])

for f in files:
    path = os.path.join(base_dir, f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    camel = get_camel_case(f)
    fetch_func_name = f"fetch{camel[0].upper() + camel[1:]}Data"
    
    # We want to replace exactly this snippet:
    #   const demandId = sessionStorage.getItem('selectedDemandId');
    #   
    #   if (!demandId) {
    #     viewport.innerHTML = `<div style="padding: 2rem; text-align: center;">Please select a Demand from the Dashboard first.</div>`;
    #     return;
    #   }
    
    # OR if it was already modified and failed, it might be slightly different.
    # Let's match from `const demandId = sessionStorage.getItem('selectedDemandId');`
    # up to `return;\n  }`
    
    pattern = re.compile(
        r"const demandId = sessionStorage\.getItem\('selectedDemandId'\);\s*if \(!demandId\) \{.*?return;\s*\}",
        re.DOTALL
    )
    
    new_render_check = f"""const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${{d.demand_id}}" ${{d.demand_id === demandId ? 'selected' : ''}}>${{d.demand_id}} - ${{d.title}}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.{fetch_func_name}();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${{optionsHtml}}
    </select>
  `;

  if (!demandId) {{
    viewport.innerHTML = `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${{dropdownHtml}}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>
    `;
    return;
  }}"""
    
    content, count = pattern.subn(new_render_check, content)
    
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
    print(f"Fixed {f}: {count} replacements")
