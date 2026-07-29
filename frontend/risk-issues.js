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
    <div class="intake-screen" style="padding: 1rem; height: calc(100vh - 70px); overflow: hidden; box-sizing: border-box;">
      <aside class="sidebar" style="display: flex; flex-direction: column; overflow: hidden;">
        <div class="sidebar-search" style="padding: 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none; overflow-y: auto; flex: 1;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" style="display: flex; flex-direction: column; overflow-y: hidden; height: 100%; align-self: stretch; padding: 0; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color); position: relative;">
  `;
  
  const layoutSuffix = `
        <div style="padding: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; background: var(--bg-primary);">
          <button onclick="window.location.hash = 'budget-cost';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Budget & Cost &rarr;
          </button>
        </div>
      </main>
    </div>
    
    <!-- Toast Container -->
    <div id="toast-container" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;"></div>
  `;

  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; flex: 1; overflow-y: auto;">
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
  
  // Skeleton Loading State
  viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; flex: 1; display: flex; flex-direction: column; gap: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="width: 250px; height: 30px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: pulse 1.5s infinite;"></div>
          ${dropdownHtml}
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
           ${[1,2,3,4].map(() => `<div style="height: 120px; background: rgba(255,255,255,0.05); border-radius: 8px; animation: pulse 1.5s infinite;"></div>`).join('')}
        </div>
        
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; flex: 1;">
          <div style="background: rgba(255,255,255,0.05); border-radius: 8px; animation: pulse 1.5s infinite;"></div>
          <div style="background: rgba(255,255,255,0.05); border-radius: 8px; animation: pulse 1.5s infinite;"></div>
        </div>
        
        <style>
          @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 0.3; }
            100% { opacity: 0.6; }
          }
        </style>
      </div>
  ` + layoutSuffix;

  try {
    const res = await fetch(`${BASE_URL}/risk-issues/project/${demandId}/aggregate`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      window.currentRiskData = data.record || data;
      window.riskActiveTab = window.riskActiveTab || 'overview';
      window.riskSortCol = window.riskSortCol || 'severity';
      window.riskSortAsc = window.riskSortAsc !== undefined ? window.riskSortAsc : false;
      window.riskFilterTerm = window.riskFilterTerm || '';
      window.renderRiskIssuesScreen();
    }
  } catch (err) {
    console.error("Risk Issues fetch error", err);
    if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast("Failed to fetch risk & issues data", "error");
  }
};

window.showToast = function(message, type="info") {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';
  toast.style.cssText = `
    background: ${bg}; color: white; padding: 1rem 1.5rem; border-radius: 8px; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: var(--font-sans);
    font-size: 0.9rem; font-weight: 600; opacity: 0; transform: translateY(20px);
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  `;
  toast.innerText = message;
  container.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  
  // Remove after 3s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

window.renderRiskIssuesScreen = function(targetContainer) {
  if (window.hideGlobalLoader) window.hideGlobalLoader();
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

  // Filter & Sort Risks
  const filteredRisks = risks.filter(r => {
    if (!window.riskFilterTerm) return true;
    const term = window.riskFilterTerm.toLowerCase();
    return (r.description && r.description.toLowerCase().includes(term)) || 
           (r.category && r.category.toLowerCase().includes(term)) ||
           (r.id && r.id.toLowerCase().includes(term)) ||
           (r.related_module && r.related_module.toLowerCase().includes(term));
  });
  
  const severityVal = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
  filteredRisks.sort((a, b) => {
    let valA = a[window.riskSortCol];
    let valB = b[window.riskSortCol];
    if (window.riskSortCol === 'severity') {
      valA = severityVal[a.severity] || 0;
      valB = severityVal[b.severity] || 0;
    }
    if (valA < valB) return window.riskSortAsc ? -1 : 1;
    if (valA > valB) return window.riskSortAsc ? 1 : -1;
    return 0;
  });

  // Calculate some analytics
  const risksBySeverity = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  risks.forEach(r => risksBySeverity[r.severity] = (risksBySeverity[r.severity] || 0) + 1);

  // Define tabs
  const tabs = [
    { id: 'overview', label: 'Dashboard' },
    { id: 'risks', label: 'Risks' },
    { id: 'issues', label: 'Issues & Mitigations' },
    { id: 'timeline', label: 'Project Timeline' },
  ];
  
  const tabHtml = tabs.map(t => `
    <button onclick="window.riskActiveTab='${t.id}'; window.renderRiskIssuesScreen();" 
            style="padding: 0.75rem 1.25rem; font-weight: 600; background: transparent; border: none; border-bottom: 2px solid ${window.riskActiveTab === t.id ? 'var(--color-brand)' : 'transparent'}; color: ${window.riskActiveTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)'}; cursor: pointer; transition: all 0.2s; white-space: nowrap;">
      ${t.label}
    </button>
  `).join('');

  // Dropdown
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchRiskIssuesData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;

  let contentHtml = '';
  
  // DASHBOARD
  if (window.riskActiveTab === 'overview') {
    contentHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem;">
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center; position: relative; overflow: hidden;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Overall Health</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: ${health > 80 ? 'var(--color-status-green-text)' : health > 50 ? 'var(--color-status-yellow-text)' : 'var(--color-status-red-text)'};">${health}%</div>
          <div style="position: absolute; bottom: 0; left: 0; height: 4px; background: ${health > 80 ? 'var(--color-status-green-text)' : health > 50 ? 'var(--color-status-yellow-text)' : 'var(--color-status-red-text)'}; width: ${health}%;"></div>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Critical / High Risks</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--color-status-red-text);">${risksBySeverity.Critical + risksBySeverity.High}</div>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Active Issues</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--color-status-yellow-text);">${issues.length}</div>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Open Mitigations</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--color-brand);">${mitigations.length}</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;">
        
        <!-- Risk Chart / Heatmap mock -->
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; flex-direction: column;">
          <h3 style="margin-top: 0; color: var(--text-primary); margin-bottom: 1.5rem;">Risks by Severity Analytics</h3>
          <div style="flex: 1; display: flex; align-items: flex-end; gap: 1rem; padding-top: 2rem; border-bottom: 1px solid var(--border-color);">
            ${['Critical', 'High', 'Medium', 'Low'].map(sev => {
              const count = risksBySeverity[sev] || 0;
              const maxCount = Math.max(...Object.values(risksBySeverity), 1);
              const height = (count / maxCount) * 100;
              const color = sev === 'Critical' ? '#ef4444' : sev === 'High' ? '#f97316' : sev === 'Medium' ? '#eab308' : '#3b82f6';
              return `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 0.5rem; height: 100%;">
                  <span style="font-size: 0.85rem; font-weight: bold; color: ${color};">${count}</span>
                  <div style="width: 100%; background: ${color}; height: ${height}%; border-radius: 4px 4px 0 0; min-height: 5px; transition: height 0.5s ease;"></div>
                  <span style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">${sev}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <!-- Recent Timeline -->
        <div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); overflow-y: auto; max-height: 400px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0; color: var(--text-primary);">Recent Events</h3>
            <button onclick="window.riskActiveTab='timeline'; window.renderRiskIssuesScreen();" style="background: transparent; border: none; color: var(--color-brand); cursor: pointer; font-size: 0.8rem;">View All</button>
          </div>
          <ul style="list-style: none; padding: 0; position: relative;">
            ${timeline.slice(-6).reverse().map((t, idx) => `
              <li style="padding-left: 1.5rem; position: relative; margin-bottom: ${idx === 5 ? '0' : '1.5rem'}; border-left: 2px solid rgba(255,255,255,0.1);">
                <div style="position: absolute; left: -6px; top: 0; width: 10px; height: 10px; border-radius: 50%; background: ${t.event_type.includes('Risk') ? '#ef4444' : t.event_type.includes('Issue') ? '#f97316' : 'var(--color-brand)'};"></div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">${new Date(t.timestamp).toLocaleString()}</div>
                <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">${t.event_type}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">${t.description}</div>
              </li>
            `).join('') || '<li style="color: var(--text-muted); text-align: center; padding: 2rem;">No events yet.</li>'}
          </ul>
        </div>
      </div>
    `;
  } 
  // RISKS TAB
  else if (window.riskActiveTab === 'risks') {
    contentHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; gap: 1rem; align-items: center;">
          <input type="text" placeholder="Smart Search risks..." value="${window.riskFilterTerm || ''}" onkeyup="window.riskFilterTerm = this.value; window.renderRiskIssuesScreen();" style="padding: 0.5rem 1rem; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 300px;" />
          <button style="background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer;">Filters</button>
        </div>
        <button onclick="window.fetchRiskIssuesData()" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">
          &#8635; Refresh AI Analysis
        </button>
      </div>
      
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; color: var(--text-primary);">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); background: rgba(0,0,0,0.2); text-align: left;">
              ${['ID', 'Description', 'Category', 'Severity', 'Score', 'Status', 'Actions'].map(col => {
                const key = col === 'Score' ? 'risk_score' : col.toLowerCase();
                const isSort = window.riskSortCol === key;
                return `
                  <th style="padding: 1rem; cursor: pointer; user-select: none;" onclick="window.riskSortCol='${key}'; window.riskSortAsc=!window.riskSortAsc; window.renderRiskIssuesScreen();">
                    ${col} ${isSort ? (window.riskSortAsc ? '↑' : '↓') : ''}
                  </th>
                `;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${filteredRisks.map(r => {
              const sevColor = r.severity === 'Critical' ? '#ef4444' : r.severity === 'High' ? '#f97316' : r.severity === 'Medium' ? '#eab308' : '#3b82f6';
              const sevBg = r.severity === 'Critical' ? 'rgba(239,68,68,0.1)' : r.severity === 'High' ? 'rgba(249,115,22,0.1)' : r.severity === 'Medium' ? 'rgba(234,179,8,0.1)' : 'rgba(59,130,246,0.1)';
              return `
                <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                  <td style="padding: 1rem; font-family: monospace; color: var(--text-muted);">${r.id}</td>
                  <td style="padding: 1rem; max-width: 300px;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">${r.description}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Module: ${r.related_module} | Owner: ${r.owner}</div>
                  </td>
                  <td style="padding: 1rem;">
                    <span style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem;">${r.category}</span>
                  </td>
                  <td style="padding: 1rem;">
                    <span style="background: ${sevBg}; color: ${sevColor}; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600;">${r.severity}</span>
                  </td>
                  <td style="padding: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <div style="width: 40px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${r.risk_score}%; height: 100%; background: ${sevColor};"></div>
                      </div>
                      <span style="font-size: 0.75rem;">${r.risk_score}</span>
                    </div>
                  </td>
                  <td style="padding: 1rem; color: ${r.status === 'Converted' ? 'var(--text-muted)' : 'var(--text-primary)'};">${r.status}</td>
                  <td style="padding: 1rem;">
                    ${r.status !== 'Converted' ? `<button onclick="window.convertRisk('${r.id}')" style="background: var(--color-brand); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;">Convert to Issue</button>` : '<span style="font-size: 0.75rem; color: var(--text-muted);">Escalated</span>'}
                    <button onclick="window.viewRiskDetails('${r.id}')" style="background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem; margin-left: 0.5rem;">Details</button>
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="7" style="padding: 3rem; text-align: center; color: var(--text-muted);">No risks match the current filters.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }
  // ISSUES & MITIGATIONS TAB
  else if (window.riskActiveTab === 'issues') {
    contentHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        
        <div>
          <h3 style="margin-top: 0; color: var(--text-primary); margin-bottom: 1rem;">Active Issues</h3>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${issues.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-muted); background: var(--bg-tertiary); border-radius: 8px; border: 1px dashed var(--border-color);">No active issues.</div>' : ''}
            ${issues.map(iss => `
              <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                  <span style="font-family: monospace; color: var(--color-brand); font-size: 0.8rem;">${iss.issue_id}</span>
                  <span style="background: rgba(249,115,22,0.1); color: #f97316; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${iss.status}</span>
                </div>
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 1rem;">${iss.description}</div>
                ${iss.rca_result ? `
                  <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 4px; border-left: 3px solid var(--color-brand); margin-bottom: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                    <strong>AI RCA:</strong> ${iss.rca_result}
                  </div>
                ` : ''}
                <div style="display: flex; gap: 1rem; align-items: center; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                  <button onclick="window.generateMitigation('${iss.risk_id}')" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Suggest AI Mitigation</button>
                  <span style="font-size: 0.75rem; color: var(--text-muted);">Owner: ${iss.owner}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <h3 style="margin-top: 0; color: var(--text-primary); margin-bottom: 1rem;">Open Mitigations</h3>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${mitigations.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-muted); background: var(--bg-tertiary); border-radius: 8px; border: 1px dashed var(--border-color);">No active mitigations.</div>' : ''}
            ${mitigations.map(m => `
              <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                  <span style="font-family: monospace; color: #10b981; font-size: 0.8rem;">${m.id}</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted);">Risk: ${m.risk_id}</span>
                </div>
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem;">${m.description}</div>
                ${m.ai_recommendation ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">${m.ai_recommendation}</div>` : ''}
                
                <div style="margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.25rem; color: var(--text-muted);">
                    <span>Progress</span>
                    <span>${m.progress}%</span>
                  </div>
                  <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${m.progress}%; height: 100%; background: #10b981;"></div>
                  </div>
                </div>

                <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                  <span style="font-size: 0.75rem; color: var(--text-muted);">Owner: ${m.owner}</span>
                  <button style="background: #10b981; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;">Update Progress</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    `;
  }
  // TIMELINE TAB
  else if (window.riskActiveTab === 'timeline') {
    contentHtml = `
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 2rem;">
        <h3 style="margin-top: 0; color: var(--text-primary); margin-bottom: 2rem;">Full Project Audit Timeline</h3>
        <ul style="list-style: none; padding: 0; position: relative;">
          <div style="position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: var(--border-color);"></div>
          ${timeline.reverse().map(t => `
            <li style="padding-left: 3rem; position: relative; margin-bottom: 2rem;">
              <div style="position: absolute; left: 0; top: 0; width: 14px; height: 14px; border-radius: 50%; background: var(--bg-primary); border: 2px solid ${t.event_type.includes('Risk') ? '#ef4444' : t.event_type.includes('Issue') ? '#f97316' : 'var(--color-brand)'}; z-index: 1;"></div>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">${new Date(t.timestamp).toLocaleString()}</div>
              <div style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">${t.event_type}</div>
              <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">${t.description}</div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: calc(100vh - 70px); overflow: hidden; box-sizing: border-box;">
      <aside class="sidebar" style="display: flex; flex-direction: column; overflow: hidden;">
        <div class="sidebar-search" style="padding: 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none; overflow-y: auto; flex: 1;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" style="display: flex; flex-direction: column; overflow-y: hidden; height: 100%; align-self: stretch; padding: 0; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color); position: relative;">
  `;
  
  const layoutSuffix = `
      </main>
    </div>
    
    <!-- Toast Container -->
    <div id="toast-container" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;"></div>
    
    <!-- Side Panel Overlay -->
    <div id="risk-side-panel" style="position: fixed; top: 0; right: -600px; width: 500px; height: 100vh; background: var(--bg-secondary); border-left: 1px solid var(--border-color); box-shadow: -10px 0 30px rgba(0,0,0,0.5); z-index: 10000; transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column;">
    </div>
    <div id="risk-side-panel-overlay" onclick="window.closeRiskDetails()" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;"></div>
  `;

  viewport.innerHTML = layoutPrefix + `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid var(--border-color); background: var(--bg-primary);">
      <div>
        <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary); margin-bottom: 0.25rem;">Risk & Issues Intelligence</h2>
        <div style="font-size: 0.85rem; color: var(--text-muted);">Always-On AI Monitoring for Project <strong>${data.project_summary?.title || demandId}</strong></div>
      </div>
      ${dropdownHtml}
    </div>
    
    <div style="padding: 0 1.5rem; background: var(--bg-primary); border-bottom: 1px solid var(--border-color); display: flex; gap: 1rem; overflow-x: auto;">
      ${tabHtml}
    </div>
    
    <div style="flex: 1; overflow-y: auto; padding: 1.5rem; background: var(--bg-secondary);">
      ${contentHtml}
    </div>
  ` + layoutSuffix;
};

window.convertRisk = async function(riskId) {
  if (window.showGlobalLoader) window.showGlobalLoader('Converting risk to issue...');
  const demandId = sessionStorage.getItem('selectedDemandId');
  if (!demandId) return;
  try {
    const res = await fetch(`${BASE_URL}/risk-issues/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, risk_id: riskId })
    });
    if (res.ok) {
      if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast('Successfully converted Risk to Issue!', 'success');
      window.fetchRiskIssuesData();
    }
  } catch(e) { console.error(e); if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast('Failed to convert risk', 'error'); }
};

window.generateMitigation = async function(riskId) {
  if (window.showGlobalLoader) window.showGlobalLoader('Generating mitigation plan...');
  const demandId = sessionStorage.getItem('selectedDemandId');
  if (!demandId) return;
  try {
    const res = await fetch(`${BASE_URL}/risk-issues/mitigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, risk_id: riskId })
    });
    if (res.ok) {
      if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast('AI Generated Mitigation successfully!', 'success');
      window.fetchRiskIssuesData();
    }
  } catch(e) { console.error(e); if (window.hideGlobalLoader) window.hideGlobalLoader(); window.showToast('Failed to generate mitigation', 'error'); }
};

window.viewRiskDetails = function(riskId) {
  const risk = window.currentRiskData.risks.find(r => r.id === riskId);
  if (!risk) return;
  
  const panel = document.getElementById('risk-side-panel');
  const overlay = document.getElementById('risk-side-panel-overlay');
  if (!panel || !overlay) return;
  
  panel.innerHTML = `
    <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-primary);">
      <h3 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Risk Details</h3>
      <button onclick="window.closeRiskDetails()" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">&times;</button>
    </div>
    <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
      <div style="margin-bottom: 1.5rem;">
        <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">ID & Category</div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <span style="font-family: monospace; font-weight: bold; color: var(--text-primary);">${risk.id}</span>
          <span style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem;">${risk.category}</span>
        </div>
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Description</div>
        <div style="font-size: 1rem; color: var(--text-primary); line-height: 1.5;">${risk.description}</div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Severity</div>
          <div style="font-weight: bold; color: var(--text-primary);">${risk.severity}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Risk Score</div>
          <div style="font-weight: bold; color: var(--text-primary);">${risk.risk_score} / 100</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Owner</div>
          <div style="font-weight: bold; color: var(--text-primary);">${risk.owner}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Related Module</div>
          <div style="font-weight: bold; color: var(--text-primary);">${risk.related_module}</div>
        </div>
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">AI Root Cause Analysis</div>
        <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border-left: 3px solid var(--color-brand); font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
          ${risk.root_cause_analysis || 'No detailed RCA available yet.'}
        </div>
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Suggested Mitigation</div>
        <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border-left: 3px solid #10b981; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
          ${risk.suggested_mitigation || 'No suggested mitigation.'}
        </div>
      </div>
      
    </div>
    <div style="padding: 1.5rem; border-top: 1px solid var(--border-color); background: var(--bg-primary); display: flex; justify-content: flex-end; gap: 1rem;">
      <button onclick="window.closeRiskDetails()" style="background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-weight: 600;">Close</button>
      ${risk.status !== 'Converted' ? `<button onclick="window.convertRisk('${risk.id}'); window.closeRiskDetails();" style="background: var(--color-brand); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-weight: 600;">Convert to Issue</button>` : ''}
    </div>
  `;
  
  overlay.style.pointerEvents = 'auto';
  overlay.style.opacity = '1';
  panel.style.right = '0';
};

window.closeRiskDetails = function() {
  const panel = document.getElementById('risk-side-panel');
  const overlay = document.getElementById('risk-side-panel-overlay');
  if (!panel || !overlay) return;
  
  panel.style.right = '-600px';
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
};
