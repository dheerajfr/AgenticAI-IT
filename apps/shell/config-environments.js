const ENV_API_BASE = 'http://127.0.0.1:8000/api';

let environments = [];
let selectedEnvKey = null;

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
      .env-badge.dev { background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }
      
      .version-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .version-box {
        background: rgba(0,0,0,0.2);
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.05);
      }
      .version-box.danger {
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.05);
      }
      .version-label {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.5rem;
        display: block;
      }
      .version-value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 1.1rem;
        color: #e2e8f0;
      }
      
      .action-row {
        display: flex;
        gap: 1rem;
      }
      .btn-premium {
        background: linear-gradient(135deg, #4f46e5, #3b82f6);
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
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
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-secondary:hover {
        background: rgba(255,255,255,0.1);
      }
      .status-pill {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
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
    `;
    document.head.appendChild(style);
  }

  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Monitored Environments</h3>
          <button class="btn-new" id="btn-refresh-envs" style="padding: 0.4rem; border-radius: 4px;">↻ Refresh</button>
        </div>
        <ul class="demand-list" id="env-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Loading environments...
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
}

window.fetchEnvironments = async function() {
  const container = document.getElementById('env-list-container');
  try {
    const res = await fetch(`${ENV_API_BASE}/environments`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    environments = await res.json();
    renderEnvironmentList();
    
    if (environments.length > 0 && selectedEnvKey === null) {
      selectEnvironment(environments[0].component_id, environments[0].environment);
    } else if (selectedEnvKey !== null) {
      const [comp, env] = selectedEnvKey.split('::');
      selectEnvironment(comp, env);
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

  container.innerHTML = environments.map(env => {
    const key = `${env.component_id}::${env.environment}`;
    const isActive = key === selectedEnvKey;
    
    let statusIndicator = env.drift_status === 'in-sync' ? 
      '<span style="color: #4ade80;">●</span>' : 
      '<span style="color: #f87171;">●</span>';
      
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-key="${key}">
        <div class="demand-item-header">
          <span class="demand-item-id" style="font-size: 0.75rem;">${env.environment.toUpperCase()}</span>
          ${statusIndicator}
        </div>
        <h4 class="demand-item-title">${env.component_id}</h4>
        <div class="demand-item-meta">
          <span>Status: ${env.drift_status}</span>
        </div>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.getAttribute('data-key');
      const [comp, env] = key.split('::');
      selectEnvironment(comp, env);
    });
  });
}

function selectEnvironment(component_id, environment) {
  selectedEnvKey = `${component_id}::${environment}`;
  
  // Update sidebar active state
  document.querySelectorAll('#env-list-container .demand-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-key') === selectedEnvKey) {
      item.classList.add('active');
    }
  });

  const record = environments.find(e => e.component_id === component_id && e.environment === environment);
  if (record) {
    renderEnvironmentDetails(record);
  }
}

function renderEnvironmentDetails(record) {
  const panel = document.getElementById('env-panel-container');
  
  const isDrifted = record.drift_status !== 'in-sync';
  
  panel.innerHTML = `
    <div style="padding: 2rem; max-width: 800px; margin: 0 auto;">
      <div class="env-card">
        <div class="env-header">
          <div>
            <h2 class="env-title">${record.component_id}</h2>
            <div style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.85rem;">
              Last Checked: ${new Date(record.last_checked).toLocaleString()}
            </div>
          </div>
          <div style="text-align: right;">
            <span class="env-badge ${record.environment}">${record.environment}</span>
            <div style="margin-top: 0.5rem;">
               <span class="status-pill ${record.drift_status}">${record.drift_status.toUpperCase()}</span>
            </div>
          </div>
        </div>
        
        <div class="version-grid">
          <div class="version-box">
            <span class="version-label">Expected Version (Baseline)</span>
            <span class="version-value">${record.expected_version}</span>
          </div>
          <div class="version-box ${isDrifted ? 'danger' : ''}">
            <span class="version-label">Deployed Version (Observed)</span>
            <span class="version-value">${record.deployed_version}</span>
          </div>
        </div>
        
        <div class="action-row">
          <button class="btn-premium" id="btn-simulate-drift">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Simulate Drift Check
          </button>
          <button class="btn-secondary" id="btn-simulate-hygiene">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Run Records Hygiene
          </button>
        </div>
        
        <div id="action-result" style="margin-top: 1.5rem; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; display: none;"></div>
      </div>
    </div>
  `;
  
  document.getElementById('btn-simulate-drift').addEventListener('click', () => simulateDrift(record));
  document.getElementById('btn-simulate-hygiene').addEventListener('click', () => simulateHygiene(record));
}

async function simulateDrift(record) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
  resultBox.style.border = '1px solid rgba(59, 130, 246, 0.3)';
  resultBox.style.color = '#93c5fd';
  resultBox.innerHTML = 'Sending simulation payload...';
  
  // We flip the deployed version to simulate a drift, or flip it back to expected to simulate a fix
  const newDeployed = record.drift_status === 'in-sync' ? record.expected_version + '-drifted' : record.expected_version;
  
  const payload = {
    component_id: record.component_id,
    environment: record.environment,
    deployed_version: newDeployed,
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
    
    resultBox.style.background = 'rgba(34, 197, 94, 0.1)';
    resultBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
    resultBox.style.color = '#86efac';
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

async function simulateHygiene(record) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(245, 158, 11, 0.1)';
  resultBox.style.border = '1px solid rgba(245, 158, 11, 0.3)';
  resultBox.style.color = '#fcd34d';
  resultBox.innerHTML = 'Running hygiene check against CMDB...';
  
  // Simulate a messy observed name differing from CMDB
  const payload = {
    component_id: record.component_id,
    environment: record.environment,
    observed_name: record.component_id + "-svr-01", 
    cmdb_name: "ServiceNow_Component_" + record.component_id 
  };
  
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/records-hygiene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    
    let html = `Hygiene Check Complete!\nStatus: ${data.status}\nMessage: ${data.message}`;
    if (data.proposed_action) {
      html += `<br/><br/>Proposed CMDB Update:\n`;
      html += `<pre style="margin-top:0.5rem; background:rgba(0,0,0,0.3); padding:0.5rem; border-radius:4px;">${JSON.stringify(data.proposed_action, null, 2)}</pre>`;
    }
    
    resultBox.innerHTML = html.replace(/\n/g, '<br/>');
    
  } catch (e) {
    resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
    resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
}
