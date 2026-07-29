import re

js_file = r"c:\Users\2869041\Desktop\AgenticAI-IT\apps\shell\build-deploy.js"

with open(js_file, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update fetchBuildDeployData (lines 121-133 approximately)
old_fetch_logic = """    if (activeDeployTab === 'runbooks') {
      if (selectedRunbookId && !runbooks.some(r => r.runbook_id === selectedRunbookId)) selectedRunbookId = null;
      if (!selectedRunbookId) showNewRunbookForm();
      else selectRunbook(selectedRunbookId);
    } else if (activeDeployTab === 'cutover') {
      if (selectedCutoverId && !cutoverSessions.some(c => c.cutover_id === selectedCutoverId)) selectedCutoverId = null;
      if (!selectedCutoverId) showNewCutoverForm();
      else selectCutover(selectedCutoverId);
    } else {
      if (selectedDeploymentId && !deployments.some(d => d.deployment_id === selectedDeploymentId)) selectedDeploymentId = null;
      if (!selectedDeploymentId) showNewDeploymentForm();
      else selectDeployment(selectedDeploymentId);
    }"""

new_fetch_logic = """    const activeItems = activeDeployTab === 'runbooks' ? runbooks : activeDeployTab === 'cutover' ? cutoverSessions : deployments;
    
    if (activeDeployTab === 'runbooks') {
      if (selectedRunbookId && !runbooks.some(r => r.runbook_id === selectedRunbookId)) selectedRunbookId = null;
    } else if (activeDeployTab === 'cutover') {
      if (selectedCutoverId && !cutoverSessions.some(c => c.cutover_id === selectedCutoverId)) selectedCutoverId = null;
    } else {
      if (selectedDeploymentId && !deployments.some(d => d.deployment_id === selectedDeploymentId)) selectedDeploymentId = null;
    }
    
    if (selectedDemandId) {
      const hasItems = activeItems.some(i => (i.demand_id || 'Unknown') === selectedDemandId);
      if (!hasItems) selectedDemandId = null;
    }
    
    if (selectedDemandId) {
      renderDeployContent();
    } else {
      if (activeDeployTab === 'runbooks') showNewRunbookForm();
      else if (activeDeployTab === 'cutover') showNewCutoverForm();
      else showNewDeploymentForm();
    }"""

code = code.replace(old_fetch_logic, new_fetch_logic)

# 2. Update renderDeployList event listeners
# Let's replace everything from `document.getElementById('btn-new-deploy-item').addEventListener`
# down to the end of `renderDeployList` block.

start_idx = code.find("document.getElementById('btn-new-deploy-item').addEventListener('click'")
if start_idx != -1:
    end_idx = code.find("}\n\n// ---------------------------------------------------------------------------", start_idx)
    if end_idx != -1:
        new_listeners = """document.getElementById('btn-new-deploy-item').addEventListener('click', () => {
    selectedDemandId = null;
    if (activeDeployTab === 'runbooks') { selectedRunbookId = null; showNewRunbookForm(); }
    else if (activeDeployTab === 'cutover') { selectedCutoverId = null; showNewCutoverForm(); }
    else { selectedDeploymentId = null; showNewDeploymentForm(); }
    renderDeployList();
  });

  container.querySelectorAll('.demand-item[data-did]').forEach(el => {
    el.addEventListener('click', () => {
      selectedDemandId = el.getAttribute('data-did');
      renderDeployList();
      renderDeployContent();
    });
  });
}
"""
        code = code[:start_idx] + new_listeners + code[end_idx + 2:] # skip the `}\n\n`

# 3. Insert `renderDeployContent` at the very end of the file.
render_deploy_content_code = """
function renderDeployContent() {
  const panel = document.getElementById('deploy-panel-container');
  if (!selectedDemandId) {
    panel.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">Select a Demand from the left sidebar or create a new record.</div>`;
    return;
  }

  const items = activeDeployTab === 'runbooks' ? runbooks : activeDeployTab === 'cutover' ? cutoverSessions : deployments;
  const idField = activeDeployTab === 'runbooks' ? 'runbook_id' : activeDeployTab === 'cutover' ? 'cutover_id' : 'deployment_id';
  const demandItems = items.filter(i => (i.demand_id || 'Unknown') === selectedDemandId);
  
  if (demandItems.length === 0) {
    panel.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">No records found for this demand.</div>`;
    return;
  }
  
  const currentSelectedId = activeDeployTab === 'runbooks' ? selectedRunbookId : activeDeployTab === 'cutover' ? selectedCutoverId : selectedDeploymentId;
  let activeItem = demandItems.find(i => i[idField] === currentSelectedId);
  if (!activeItem) {
    activeItem = demandItems[0];
    if (activeDeployTab === 'runbooks') selectedRunbookId = activeItem.runbook_id;
    else if (activeDeployTab === 'cutover') selectedCutoverId = activeItem.cutover_id;
    else selectedDeploymentId = activeItem.deployment_id;
  }
  
  const typeLabel = activeDeployTab === 'runbooks' ? 'Runbook' : activeDeployTab === 'cutover' ? 'Cutover' : 'Deployment';
  
  panel.innerHTML = r`
    <div style="background:var(--bg-tertiary); padding:1rem; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:1rem;">
      <label for="demand-component-select" style="font-weight:600;font-size:0.9rem;">Select ${typeLabel}:</label>
      <select id="demand-component-select" style="flex:1;max-width:400px;padding:0.4rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);">
        ${demandItems.map(i => {
           const label = activeDeployTab === 'runbooks' ? (i.environment ? `${i.title} (${i.environment})` : i.title) : activeDeployTab === 'cutover' ? `${i.component_id}` : `${i.component_id} (${i.environment || 'N/A'})`;
           return `<option value="${i[idField]}" ${i[idField] === activeItem[idField] ? 'selected' : ''}>${label}</option>`;
        }).join('')}
      </select>
      <button id="btn-delete-active-item" class="btn-secondary" style="color:var(--color-status-red-text); border-color:var(--color-status-red-text);">Delete Active ${typeLabel}</button>
    </div>
    <div id="deploy-content-inner" style="padding-top:1rem;"></div>
  `;
  
  document.getElementById('demand-component-select').addEventListener('change', (e) => {
    const newId = e.target.value;
    if (activeDeployTab === 'runbooks') selectedRunbookId = newId;
    else if (activeDeployTab === 'cutover') selectedCutoverId = newId;
    else selectedDeploymentId = newId;
    renderDeployContent();
  });
  
  document.getElementById('btn-delete-active-item').addEventListener('click', async () => {
    if(!confirm(`Delete this ${typeLabel}?`)) return;
    try {
      const apiPath = activeDeployTab === 'runbooks' ? 'runbooks' : activeDeployTab === 'cutover' ? 'cutover' : 'orchestration';
      const res = await fetch(`${DEPLOY_API_BASE}/${apiPath}/${encodeURIComponent(activeItem[idField])}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      
      if (activeDeployTab === 'runbooks') selectedRunbookId = null;
      else if (activeDeployTab === 'cutover') selectedCutoverId = null;
      else selectedDeploymentId = null;
      
      await window.fetchBuildDeployData();
    } catch (err) {
      alert(err.message);
    }
  });
  
  const innerContainer = document.getElementById('deploy-content-inner');
  const tempPanel = Object.defineProperty({}, 'innerHTML', {
    set(html) { innerContainer.innerHTML = html; },
    get() { return innerContainer.innerHTML; }
  });
  
  // Actually, a better way is to redefine them to return the inner wrapper.
  const originalGetElementById = document.getElementById.bind(document);
  document.getElementById = function(id) {
    if (id === 'deploy-panel-container') return innerContainer;
    return originalGetElementById(id);
  };
  
  try {
    if (activeDeployTab === 'runbooks') renderRunbookDetails(activeItem);
    else if (activeDeployTab === 'cutover') renderCutoverDetails(activeItem);
    else renderDeploymentDetails(activeItem);
  } finally {
    document.getElementById = originalGetElementById;
  }
}
"""

code = code + "\n" + render_deploy_content_code

# 4. Remove `selectRunbook`, `selectCutover`, `selectDeployment` definitions
def remove_func(name):
    global code
    pattern = re.compile(rf"function {name}\([^\)]*\)\s*{{.*?}}\n\n", re.DOTALL)
    code = pattern.sub("\n", code)

remove_func("selectRunbook")
remove_func("selectCutover")
remove_func("selectDeployment")

# 5. Fix renderRunbookDetails, renderCutoverDetails, renderDeploymentDetails calls
# The backend already has `renderRunbookDetails` and `renderCutoverDetails`.
# Let's check `showDeploymentDetails`.
code = code.replace("function showDeploymentDetails", "function renderDeploymentDetails")

with open(js_file, 'w', encoding='utf-8') as f:
    f.write(code)
