const BASE_URL = '/api';

window.fetchRiskIssuesData = async function(targetContainer) {
  try {
    const demRes = await fetch('/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch(e) { console.warn("Could not fetch demands list", e); }

  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchRiskIssuesData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;

  const viewport = targetContainer || window.currentModuleTargetContainer || document.getElementById('viewport');

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchRiskIssuesData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-search" style="padding: 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 0; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="padding: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; background: var(--bg-primary);">
          <button onclick="window.location.hash = 'budget-cost';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Budget & Cost &rarr;
          </button>
        </div>
      </main>
    </div>
  `;

  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the sidebar or dropdown to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  // Render loading state
  viewport.innerHTML = layoutPrefix + `
      <div style="padding: 4rem; text-align: center; color: var(--text-muted); flex: 1;">
        <div style="margin-bottom: 1rem; font-size: 1.5rem;">⚙️</div>
        <div>Aggregating data from all modules...</div>
      </div>
  ` + layoutSuffix;

  try {
    const res = await fetch(`${BASE_URL}/risk-issues/project/${demandId}/aggregate`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      window.currentRiskData = data.record;
      window.riskActiveTab = window.riskActiveTab || 'overview';
      window.renderRiskIssuesScreen();
    }
  } catch (err) {
    console.error("Risk Issues fetch error", err);
  }
};

window.renderRiskIssuesScreen = function(targetContainer) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const data = window.currentRiskData || {};
  const risks = data.risks || [];
  const issues = data.issues || [];
  const mitigations = data.mitigations || [];
  const timeline = data.timeline || [];
  const health = data.health_score || 0;
  
  const viewport = targetContainer || window.currentModuleTargetContainer || document.getElementById('viewport');
  
  const demands = window.allDemandsList || [];
  let sidebarItemsHtml = '';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchRiskIssuesData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  // Define tabs
  const tabs = [
    { id: 'overview', label: 'Dashboard' },
    { id: 'risks', label: 'Risks' },
    { id: 'issues', label: 'Issues' },
    { id: 'timeline', label: 'Timeline' },
  ];
  const tabHtml = tabs.map(t => `
    <button onclick="window.riskActiveTab='${t.id}'; window.renderRiskIssuesScreen();" 
            style="padding: 0.75rem 1.25rem; font-weight: 600; background: transparent; border: none; border-bottom: 2px solid ${window.riskActiveTab === t.id ? 'var(--color-brand)' : 'transparent'}; color: ${window.riskActiveTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)'}; cursor: pointer; transition: all 0.2s;">
      ${t.label}
    </button>
  `).join('');

  // Overview Tab
  let contentHtml = '';
  if (window.riskActiveTab === 'overview') {
    contentHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem;">
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Project Health</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: ${health > 80 ? 'var(--color-status-green-text)' : health > 50 ? 'var(--color-status-yellow-text)' : 'var(--color-status-red-text)'};">${health}%</div>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Active Risks</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--text-primary);">${risks.filter(r => r.status !== 'Converted').length}</div>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Active Issues</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--text-primary);">${issues.length}</div>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Mitigations</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--text-primary);">${mitigations.length}</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <h3 style="margin-top: 0; color: var(--text-primary);">AI Detected Critical Risks</h3>
          <ul style="list-style: none; padding: 0;">
            ${risks.filter(r => r.severity === 'Critical' || r.severity === 'High').map(r => `
              <li style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between;">
                  <strong style="color: var(--color-status-red-text);">${r.description}</strong>
                  <span style="font-size: 0.8rem; background: rgba(239,68,68,0.2); padding: 0.2rem 0.5rem; border-radius: 4px; color: #fca5a5;">${r.severity}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Confidence: ${r.confidence_score}%</div>
              </li>
            `).join('') || '<li style="color: var(--text-muted);">No critical risks detected.</li>'}
          </ul>
        </div>
        
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <h3 style="margin-top: 0; color: var(--text-primary);">Recent Timeline</h3>
          <ul style="list-style: none; padding: 0; position: relative;">
            ${timeline.slice(-5).reverse().map(t => `
              <li style="padding-left: 1.5rem; position: relative; margin-bottom: 1rem; border-left: 2px solid var(--border-color);">
                <div style="position: absolute; left: -6px; top: 0; width: 10px; height: 10px; border-radius: 50%; background: var(--color-brand);"></div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(t.timestamp).toLocaleString()}</div>
                <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">${t.event_type}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">${t.description}</div>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
  } else if (window.riskActiveTab === 'risks') {
    contentHtml = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: var(--text-primary);">
        <thead>
          <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-muted); text-align: left;">
            <th style="padding: 1rem;">ID</th>
            <th style="padding: 1rem;">Description</th>
            <th style="padding: 1rem;">Category</th>
            <th style="padding: 1rem;">Severity</th>
            <th style="padding: 1rem;">Status</th>
            <th style="padding: 1rem;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${risks.map(r => `
            <tr style="border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary);">
              <td style="padding: 1rem; font-family: monospace;">${r.id}</td>
              <td style="padding: 1rem; font-weight: 500;">${r.description}</td>
              <td style="padding: 1rem;">${r.category}</td>
              <td style="padding: 1rem;">
                <span style="background: ${r.severity === 'Critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${r.severity}</span>
              </td>
              <td style="padding: 1rem;">${r.status}</td>
              <td style="padding: 1rem;">
                ${r.status !== 'Converted' ? `<button onclick="window.convertRiskToIssue('${r.id}')" style="background: var(--color-brand); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Convert to Issue</button>` : '<span style="color: var(--text-muted);">Converted</span>'}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No risks found.</td></tr>'}
        </tbody>
      </table>
    `;
  } else if (window.riskActiveTab === 'issues') {
    contentHtml = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: var(--text-primary);">
        <thead>
          <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-muted); text-align: left;">
            <th style="padding: 1rem;">Issue ID</th>
            <th style="padding: 1rem;">Description</th>
            <th style="padding: 1rem;">Origin Risk</th>
            <th style="padding: 1rem;">Status</th>
            <th style="padding: 1rem;">RCA</th>
          </tr>
        </thead>
        <tbody>
          ${issues.map(i => `
            <tr style="border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary);">
              <td style="padding: 1rem; font-family: monospace;">${i.issue_id}</td>
              <td style="padding: 1rem; font-weight: 500;">${i.description}</td>
              <td style="padding: 1rem; font-family: monospace;">${i.risk_id || 'Direct'}</td>
              <td style="padding: 1rem;">${i.status}</td>
              <td style="padding: 1rem;">
                ${i.rca_result ? `<div style="font-size:0.8rem; color:var(--text-secondary); max-height: 50px; overflow: hidden; text-overflow: ellipsis;">${i.rca_result}</div>` : 
                `<button onclick="window.performRCA('${i.issue_id}', '${i.description}')" style="background: #3b82f6; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Run RCA (AI)</button>`}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No issues found.</td></tr>'}
        </tbody>
      </table>
    `;
  } else if (window.riskActiveTab === 'timeline') {
    contentHtml = `
      <div style="background: var(--bg-tertiary); padding: 2rem; border-radius: var(--radius-md);">
        <h3 style="margin-top: 0; margin-bottom: 2rem; color: var(--text-primary);">Full Activity Timeline</h3>
        <ul style="list-style: none; padding: 0; position: relative;">
          ${timeline.slice().reverse().map(t => `
            <li style="padding-left: 2rem; position: relative; margin-bottom: 1.5rem; border-left: 2px solid var(--border-color);">
              <div style="position: absolute; left: -8px; top: 0; width: 14px; height: 14px; border-radius: 50%; background: var(--color-brand); border: 2px solid var(--bg-tertiary);"></div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">${new Date(t.timestamp).toLocaleString()}</div>
              <div style="font-size: 1.1rem; font-weight: 600; margin-top: 0.2rem; color: var(--text-primary);">${t.event_type}</div>
              <div style="font-size: 0.95rem; color: var(--text-secondary); margin-top: 0.4rem; background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">${t.description}</div>
              ${t.related_id ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; font-family: monospace; color: var(--color-brand);">Ref: ${t.related_id}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  viewport.innerHTML = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-search" style="padding: 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" style="display: flex; flex-direction: column; overflow: hidden; height: 100%; align-self: stretch; padding: 0; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <header class="main-panel-header" style="padding: 1.5rem 2rem; border-bottom: 1px solid var(--border-color); background: var(--bg-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h2 style="margin: 0; font-size: 1.5rem; color: var(--text-primary);">Risk & Issues</h2>
              <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">Project: ${demandId} | AI Control Center</div>
            </div>
            <button onclick="window.fetchRiskIssuesData()" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s;">
              <span>↻ Synchronize & Detect</span>
            </button>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${tabHtml}
          </div>
        </header>
        
        <div style="flex: 1; overflow: hidden; padding: 2rem;">
          ${contentHtml}
        </div>
        
        <div style="padding: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; background: var(--bg-primary);">
          <button onclick="window.location.hash = 'budget-cost';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Budget & Cost &rarr;
          </button>
        </div>
      </main>
    </div>
  `;
};

window.convertRiskToIssue = async function(riskId) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  try {
    const res = await fetch(`${BASE_URL}/risk-issues/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, risk_id: riskId })
    });
    if (res.ok) {
      const data = await res.json();
      window.currentRiskData = data.record;
      window.renderRiskIssuesScreen();
      showToast('Risk converted to Issue successfully!');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to convert risk to issue.');
  }
};

window.performRCA = async function(issueId, description) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  try {
    // Optimistic UI
    showToast('Running Root Cause Analysis via Gemini AI...');
    const res = await fetch(`${BASE_URL}/risk-issues/rca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, incident_details: description })
    });
    if (res.ok) {
      window.fetchRiskIssuesData();
    }
  } catch (err) {
    console.error(err);
    alert('Failed to perform RCA.');
  }
};

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '2rem';
  toast.style.right = '2rem';
  toast.style.background = 'var(--bg-tertiary)';
  toast.style.color = 'var(--text-primary)';
  toast.style.padding = '1rem 1.5rem';
  toast.style.borderRadius = 'var(--radius-md)';
  toast.style.border = '1px solid var(--border-color)';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
  toast.style.zIndex = '9999';
  toast.innerText = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}
