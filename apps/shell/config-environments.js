const ENV_API_BASE = 'http://127.0.0.1:8000/api';

let environments = [];
let selectedEnvKey = null; // This will now just be component_id

// Expose to window so shell.js can call it
window.renderConfigEnvironmentsScreen = function() {
  const viewport = document.getElementById('viewport');
  
  // Inject some Stage 5 specific premium CSS dynamically
  if (!document.getElementById('stage-5-styles')) {
    const style = document.createElement('style');
    style.id = 'stage-5-styles';
    style.textContent = `
      .env-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        backdrop-filter: blur(12px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 24px -8px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .env-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 8px 32px -8px rgba(0,0,0,0.3);
      }
      .env-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .env-title {
        font-size: 1.25rem;
        font-weight: 600;
        background: linear-gradient(90deg, #fff, #a5b4fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
      }
      .env-badge {
        font-size: 0.75rem;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .env-badge.prod { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
      .env-badge.staging { background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3); }
      .env-badge.test { background: rgba(167, 139, 250, 0.15); color: #c4b5fd; border: 1px solid rgba(167, 139, 250, 0.3); }
      .env-badge.dev { background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }
      
      .version-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      .version-box {
        background: rgba(0,0,0,0.2);
        padding: 0.75rem;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.05);
      }
      .version-box.danger {
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.05);
      }
      .version-label {
        font-size: 0.65rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.25rem;
        display: block;
      }
      .version-value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9rem;
        color: #e2e8f0;
      }
      
      .action-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: auto;
      }
      .btn-premium {
        background: linear-gradient(135deg, #4f46e5, #3b82f6);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-weight: 500;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .btn-premium:hover {
        opacity: 0.9;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }
      .btn-secondary {
        background: rgba(255,255,255,0.05);
        color: #e2e8f0;
        border: 1px solid rgba(255,255,255,0.1);
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-weight: 500;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .btn-secondary:hover {
        background: rgba(255,255,255,0.1);
      }
      .status-pill {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: bold;
        text-transform: uppercase;
      }
      .status-pill.in-sync { background: rgba(34, 197, 94, 0.2); color: #86efac; }
      .status-pill.drifted { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
      
      #env-list-container {
        overflow-y: auto;
        max-height: calc(100vh - 150px);
      }
      #env-panel-container {
        overflow-y: auto;
        max-height: calc(100vh - 100px);
      }
      
      .pipeline-container {
        display: flex;
        gap: 1.5rem;
        overflow-x: auto;
        padding-bottom: 2rem;
        padding-top: 1rem;
        align-items: stretch;
      }
      .pipeline-stage {
        flex: 0 0 280px;
        display: flex;
        flex-direction: column;
      }
      .stage-empty {
        border: 1px dashed rgba(255,255,255,0.1);
        border-radius: 12px;
        height: 100%;
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        font-size: 0.9rem;
        background: rgba(0,0,0,0.1);
      }
      .stage-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255,255,255,0.2);
        padding-top: 100px;
      }
    `;
    document.head.appendChild(style);
  }

  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Components</h3>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-new" id="btn-refresh-envs" style="padding: 0.4rem; border-radius: 4px;">↻ Refresh</button>
            <button class="btn-new" id="btn-export-json" style="padding: 0.4rem; border-radius: 4px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);">Export JSON</button>
          </div>
        </div>
        <ul class="demand-list" id="env-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Loading components...
          </li>
        </ul>
      </aside>
      <main class="details-panel" id="env-panel-container">
        <!-- Rendered dynamically -->
      </main>
    </div>
  `;

  document.getElementById('btn-refresh-envs').addEventListener('click', () => {
    window.fetchEnvironments();
  });

  document.getElementById('btn-export-json').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-json');
    const oldText = btn.textContent;
    btn.textContent = 'Exporting...';
    try {
      const res = await fetch(`${ENV_API_BASE}/environments/export`, { method: 'POST' });
      const data = await res.json();
      alert(`Export successful!\n\nSaved files:\n${data.files.join('\n')}\n\nThese JSONs contain component, environment, version, and CMDB information.`);
    } catch(e) {
      alert("Export failed: " + e.message);
    }
    btn.textContent = oldText;
  });
}

window.fetchEnvironments = async function() {
  const container = document.getElementById('env-list-container');
  try {
    const res = await fetch(`${ENV_API_BASE}/environments`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    environments = await res.json();
    renderEnvironmentList();
    
    if (selectedEnvKey && selectedEnvKey.includes('::')) {
      selectedEnvKey = selectedEnvKey.split('::')[0];
    }
    
    if (environments.length > 0 && selectedEnvKey === null) {
      selectEnvironment(environments[0].component_id);
    } else if (selectedEnvKey !== null) {
      selectEnvironment(selectedEnvKey);
    } else {
      document.getElementById('env-panel-container').innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; color: var(--text-muted);">
          No environment records found in database.
        </div>
      `;
    }
  } catch (err) {
    console.error("Failed to fetch environments:", err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
          Make sure gateway server is running.
        </div>
      </li>
    `;
  }
}

function renderEnvironmentList() {
  const container = document.getElementById('env-list-container');
  if (environments.length === 0) {
    container.innerHTML = `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No records found.</li>`;
    return;
  }
  
  // Extract unique components
  const components = [...new Set(environments.map(e => e.component_id))];

  container.innerHTML = components.map(compId => {
    const isActive = compId === selectedEnvKey;
    
    // Check if any env is drifted for this component
    const hasDrift = environments.some(e => e.component_id === compId && e.drift_status !== 'in-sync');
    const statusIndicator = hasDrift ? 
      '<span style="color: #f87171;">●</span>' : 
      '<span style="color: #4ade80;">●</span>';
      
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-key="${compId}">
        <div class="demand-item-header">
          <span class="demand-item-id" style="font-size: 0.75rem;">COMPONENT</span>
          ${statusIndicator}
        </div>
        <h4 class="demand-item-title">${compId}</h4>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => {
      selectEnvironment(item.getAttribute('data-key'));
    });
  });
}

function selectEnvironment(component_id) {
  selectedEnvKey = component_id;
  
  // Update sidebar active state
  document.querySelectorAll('#env-list-container .demand-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-key') === selectedEnvKey) {
      item.classList.add('active');
    }
  });

  renderPipelineDetails(component_id);
}

function renderPipelineDetails(component_id) {
  const panel = document.getElementById('env-panel-container');
  const existingPipeline = panel.querySelector('.pipeline-container');
  const scrollPos = existingPipeline ? existingPipeline.scrollLeft : 0;
  
  const existingResultBox = document.getElementById('action-result');
  const resultBoxHTML = existingResultBox ? existingResultBox.outerHTML : '<div id="action-result" style="margin-top: 1rem; padding: 1.5rem; border-radius: 8px; font-family: monospace; font-size: 0.95rem; display: none; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);"></div>';
  
  const envOrder = ['dev', 'test', 'staging', 'prod'];
  
  const componentEnvs = environments.filter(e => e.component_id === component_id);
  
  let html = `
    <div style="padding: 2rem; max-width: 1400px;">
      <h2 class="env-title" style="margin-bottom: 1rem; font-size: 2rem;">${component_id} Pipeline</h2>
      <div style="color: var(--text-muted); margin-bottom: 2rem;">Track and manage this component across all environments.</div>
      
      <div class="pipeline-container">
  `;
  
  envOrder.forEach((envName, index) => {
    const record = componentEnvs.find(e => e.environment === envName);
    
    html += `<div class="pipeline-stage">
      <div style="margin-bottom: 1rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); text-align: center; letter-spacing: 0.1em;">${envName}</div>`;
      
    if (record) {
      const isDrifted = record.drift_status !== 'in-sync';
      html += `
        <div class="env-card">
          <div class="env-header">
            <span class="env-badge ${record.environment}">${record.environment}</span>
            <span class="status-pill ${record.drift_status}">${record.drift_status.toUpperCase()}</span>
          </div>
          
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;">
            Last Checked:<br/>${new Date(record.last_checked).toLocaleString()}
          </div>
          
          <div class="version-grid">
            <div class="version-box">
              <span class="version-label">Expected (Baseline)</span>
              <span class="version-value">${record.expected_version}</span>
            </div>
            <div class="version-box ${isDrifted ? 'danger' : ''}">
              <span class="version-label">Deployed (Observed)</span>
              <span class="version-value">${record.deployed_version}</span>
            </div>
          </div>
          
          <div class="action-row">
            <button class="btn-secondary" title="View the list of requirements for this release" onclick="window.viewDependencies('${record.component_id}', '${record.environment}')">View Requirements</button>
            <button class="btn-secondary" title="Reconciles records against what is actually deployed and flags drift" onclick="window.simulateDrift('${record.component_id}', '${record.environment}')">Drift Detection</button>
            <button class="btn-secondary" title="Maintains release baselines and verifies the right versions are bundled" onclick="window.verifyReadiness('${record.component_id}', '${record.environment}')">Baseline Reconcile</button>
            <button class="btn-secondary" title="Proposes configuration-record updates from observed reality" onclick="window.simulateHygiene('${record.component_id}', '${record.environment}')">Records Hygiene</button>
          </div>
        </div>
      `;
    } else {
      html += `<div class="stage-empty">Not Deployed</div>`;
    }
    
    html += `</div>`;
    
    // Removed arrow per user request
  });
  
  html += `
      </div>
      ${resultBoxHTML}
    </div>
  `;
  
  panel.innerHTML = html;
  
  const newPipeline = panel.querySelector('.pipeline-container');
  if (newPipeline && scrollPos > 0) {
    newPipeline.scrollLeft = scrollPos;
  }
}

window.simulateDrift = async function(component_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
  resultBox.style.border = '1px solid rgba(59, 130, 246, 0.3)';
  resultBox.style.color = '#93c5fd';
  resultBox.innerHTML = 'Sending simulation payload...';
  
  const record = environments.find(e => e.component_id === component_id && e.environment === environment);
  
  const payload = {
    component_id: record.component_id,
    environment: record.environment,
    deployed_version: record.deployed_version,
    expected_version: record.expected_version
  };
  
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/reconcile-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    
    if (data.drift_status === 'drifted') {
      resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
      resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      resultBox.style.color = '#fca5a5';
    } else {
      resultBox.style.background = 'rgba(34, 197, 94, 0.1)';
      resultBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
      resultBox.style.color = '#86efac';
    }
    resultBox.innerHTML = `Simulation Complete!\nNew Status: ${data.drift_status.toUpperCase()}\n<br/>Refreshing UI...`;
    
    setTimeout(() => {
      window.fetchEnvironments();
    }, 1500);
    
  } catch (e) {
    resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
    resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
}

window.simulateHygiene = async function(component_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(245, 158, 11, 0.1)';
  resultBox.style.border = '1px solid rgba(245, 158, 11, 0.3)';
  resultBox.style.color = '#fcd34d';
  resultBox.innerHTML = 'Running hygiene check against CMDB...';
  
  const payload = { component_id, environment };
  
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/records-hygiene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    
    let html = `Hygiene Check Complete!\nStatus: ${data.status}\nMessage: ${data.message}`;
    
    const record = environments.find(e => e.component_id === component_id && e.environment === environment);
    if (data.status === 'clean') {
      html += `\n\nCompared Names (Matched Okay):\n- Observed: ${record.observed_name}\n- CMDB: ${record.cmdb_name}`;
    } else {
      html += `\n\nCompared Names (Mismatch):\n- Observed: ${record.observed_name}\n- CMDB: ${record.cmdb_name}`;
    }
    
    if (data.proposed_action) {
      html += `<br/><br/>Proposed CMDB Update:\n`;
      html += `<pre style="margin-top:0.5rem; background:rgba(0,0,0,0.3); padding:0.5rem; border-radius:4px;">${JSON.stringify(data.proposed_action, null, 2)}</pre>`;
      html += `<button class="btn-premium" style="margin-top: 1rem;" onclick="window.applyHygieneFix('${component_id}', '${environment}', '${data.proposed_action.update_cmdb_name_to}')">Apply Fix</button>`;
    }
    
    resultBox.innerHTML = html.replace(/\n/g, '<br/>');
    
  } catch (e) {
    resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
    resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
}

window.applyHygieneFix = async function(component_id, environment, new_cmdb_name) {
  const resultBox = document.getElementById('action-result');
  resultBox.innerHTML = 'Applying fix...';
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/apply-hygiene-fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ component_id, environment, new_cmdb_name })
    });
    if (!res.ok) throw new Error('API request failed');
    resultBox.innerHTML = 'Fix Applied successfully! Refreshing...';
    setTimeout(() => window.fetchEnvironments(), 1000);
  } catch(e) {
    resultBox.innerHTML = 'Error: ' + e.message;
  }
}


window.verifyReadiness = async function(component_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
  resultBox.style.border = '1px solid rgba(59, 130, 246, 0.3)';
  resultBox.style.color = '#93c5fd';
  resultBox.innerHTML = 'Verifying readiness...';
  
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/verify-readiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ component_id, environment })
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    if (data.ready) {
        resultBox.style.background = 'rgba(34, 197, 94, 0.1)';
        resultBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
        resultBox.style.color = '#86efac';
        resultBox.innerHTML = 'Readiness check passed. All dependencies are healthy.';
    } else {
        resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
        resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        resultBox.style.color = '#fca5a5';
        resultBox.innerHTML = 'Readiness check failed:<br/><br/>' + data.issues.join('<br/>');
    }
  } catch(e) {
    resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
    resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
}

window.viewDependencies = function(component_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(255, 255, 255, 0.05)';
  resultBox.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  resultBox.style.color = '#e2e8f0';
  
  const record = environments.find(e => e.component_id === component_id && e.environment === environment);
  
  resultBox.innerHTML = `<strong>Requirements for ${component_id} in ${environment}:</strong><br/><br/>` + 
                        `<strong>Expected:</strong><br/>` +
                        (record.expected_requirements && record.expected_requirements.length ? record.expected_requirements.map(d => `- ${d}`).join('<br/>') : 'None (Empty)') + 
                        `<br/><br/><strong>Currently Met:</strong><br/>` +
                        (record.observed_requirements && record.observed_requirements.length ? record.observed_requirements.map(d => `- ${d}`).join('<br/>') : 'None (Empty)') +
                        `<br/><br/><em>The Baseline Reconcile step will ensure all these conditions are satisfied before proceeding.</em>`;
}
