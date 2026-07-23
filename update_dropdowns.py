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
    render_func_name = f"render{camel[0].upper() + camel[1:]}Screen"
    data_var_name = f"current{camel[0].upper() + camel[1:]}Data"
    
    # 1. Update Fetch Function to also fetch demands list
    fetch_pattern = re.compile(
        rf"window\.{fetch_func_name}\s*=\s*async\s*function\(\)\s*\{{.*?(const\s+demandId\s*=\s*sessionStorage\.getItem\('selectedDemandId'\);)",
        re.DOTALL
    )
    
    new_fetch_start = f"""window.{fetch_func_name} = async function() {{
  try {{
    const demRes = await fetch('http://127.0.0.1:8000/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  }} catch(e) {{ console.warn("Could not fetch demands list", e); }}

  const demandId = sessionStorage.getItem('selectedDemandId');"""
    
    # Handle the early return if !demandId in the fetch function
    content = re.sub(
        r"const demandId = sessionStorage\.getItem\('selectedDemandId'\);\s*if \(!demandId\) return;",
        "const demandId = sessionStorage.getItem('selectedDemandId');\n  if (!demandId) {\n    window.render" + render_func_name[6:] + "();\n    return;\n  }",
        content
    )
    
    content = fetch_pattern.sub(new_fetch_start, content)

    # 2. Update Render Function to include the Dropdown
    # We look for the viewport check
    render_check_pattern = re.compile(
        r"const demandId = sessionStorage\.getItem\('selectedDemandId'\);\s*if \(!demandId\) \{(.*?)\}\s*const data = window\." + data_var_name,
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
  }}
  
  const data = window.{data_var_name}"""
    
    content = render_check_pattern.sub(new_render_check, content)
    
    # 3. Inject the dropdown into the header of the main view
    # Look for `<div style="text-align: right;">` where we have the status-pill
    header_right_pattern = re.compile(
        r'<div style="text-align: right;">\s*<status-pill status="Monitoring"></status-pill>\s*</div>'
    )
    
    new_header_right = """<div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Monitoring"></status-pill>
        </div>"""
        
    content = header_right_pattern.sub(new_header_right, content)
    
    # Check if there are other status pills (like in ops-readiness)
    header_right_ops = re.compile(
        r'<div style="text-align: right;">\s*<status-pill status="Active"></status-pill>\s*</div>'
    )
    new_header_ops = """<div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Active"></status-pill>
        </div>"""
    content = header_right_ops.sub(new_header_ops, content)

    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
    print(f"Updated {f}")
