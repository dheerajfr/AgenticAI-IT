const BASE_URL = '/api';

window.fetchVendorCoordinationData = async function() {
  try {
    const demRes = await fetch('/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch(e) { console.warn("Could not fetch demands list", e); }

  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchVendorCoordinationData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;
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

  const _observer = new MutationObserver(() => {
    if (!document.getElementById('vendor-panel-container')) {
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }
  });
  _observer.observe(viewport, { childList: true, subtree: false });

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchVendorCoordinationData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
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
      <main class="details-panel" id="vendor-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'reporting-communication';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Reporting & Comms &rarr;
          </button>
        </div>
      </main>
    </div>
  `;


  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  try {
    const res = await fetch(`${BASE_URL}/vendor-coordination/project/${demandId}`);
    if (res.ok) {
      window.currentVendorData = await res.json();
      
      // Fetch checklists
      try {
        const checkRes = await fetch(`${BASE_URL}/vendor-coordination/project/${demandId}/checklists`);
        if (checkRes.ok) window.currentChecklists = await checkRes.json();
        else window.currentChecklists = [];
      } catch (e) { window.currentChecklists = []; }

      // Fetch reports
      try {
        const repRes = await fetch(`${BASE_URL}/vendor-coordination/project/${demandId}/reports`);
        if (repRes.ok) window.currentReports = await repRes.json();
        else window.currentReports = [];
      } catch (e) { window.currentReports = []; }

      // Fetch generated invoices for the project to display invoice count
      try {
        const invRes = await fetch(`${BASE_URL}/budget-cost/project/${demandId}/invoices`);
        if (invRes.ok) {
          window.currentInvoicesList = await invRes.json();
        } else {
          window.currentInvoicesList = [];
        }
      } catch (invErr) {
        console.error("Failed to fetch invoices in Vendor Coordination", invErr);
        window.currentInvoicesList = [];
      }
      
      window.renderVendorCoordinationScreen();
    }
  } catch (err) {
    console.error("Vendor Coordination fetch error", err);
  }
};

window.renderVendorCoordinationScreen = function(targetContainer) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchVendorCoordinationData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;

  const viewport = targetContainer || window.currentModuleTargetContainer || document.getElementById('viewport');
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

  const _observer = new MutationObserver(() => {
    if (!document.getElementById('vendor-panel-container')) {
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }
  });
  _observer.observe(viewport, { childList: true, subtree: false });

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchVendorCoordinationData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Vendor Coordination</h3>
        </div>
        <div class="sidebar-search" style="padding: 0 1rem 0.5rem 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>

        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="vendor-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'reporting-communication';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Reporting & Comms &rarr;
          </button>
        </div>
      </main>
    </div>
  `;

  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  const data = window.currentVendorData || {};
  const sla = data.sla_tracking || {};
  const discrepancies = data.sow_discrepancies || [];
  const alerts = data.access_alerts || [];
  const checklists = window.currentChecklists || [];
  const reports = window.currentReports || [];
  
  // Render status normaliser reports list
  let reportsHtml = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 1rem;">No reports uploaded yet.</div>';
  if (reports && reports.length > 0) {
    reportsHtml = reports.map(r => {
      const statusColor = r.overall_status === 'Green' ? 'var(--color-status-green-text)' : (r.overall_status === 'Red' ? 'var(--color-status-red-text)' : 'var(--color-status-amber-text)');
      return `
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <strong style="font-size:0.9rem; color:var(--text-primary);">${r.vendor_name}</strong>
            <span style="font-size:0.75rem; font-weight:700; color:${statusColor}; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${r.overall_status}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">Period: ${r.reporting_period}</div>
          <div style="margin-bottom:0.5rem;">
            <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.25rem;">Key Achievements:</span>
            <ul style="margin:0; padding-left:1.1rem; font-size:0.8rem; color:var(--text-secondary);">
              ${r.key_achievements.map(a => `<li>${a}</li>`).join('')}
            </ul>
          </div>
          ${r.risks_escalations.length > 0 ? `
          <div style="margin-bottom:0.5rem;">
            <span style="font-size:0.75rem; text-transform:uppercase; color:var(--color-status-red-text); display:block; margin-bottom:0.25rem;">Risks & Escalations:</span>
            <ul style="margin:0; padding-left:1.1rem; font-size:0.8rem; color:var(--color-status-red-text);">
              ${r.risks_escalations.map(re => `<li>${re}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Render checklists list
  let checklistsHtml = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 1.5rem;">No active onboarding/offboarding workflows.</div>';
  if (checklists && checklists.length > 0) {
    checklistsHtml = checklists.map(c => {
      const typeLabel = c.onboarding_type === 'join' ? 'Onboarding (Join)' : 'Offboarding (Leave)';
      const typeColor = c.onboarding_type === 'join' ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)';
      return `
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <div>
              <strong style="font-size:0.9rem; color:var(--text-primary);">${c.vendor_employee_name}</strong>
              <div style="font-size:0.75rem; color:${typeColor}; font-weight:700; margin-top:2px;">${typeLabel}</div>
            </div>
            <span style="font-size:0.75rem; background: ${c.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'}; color:${c.status === 'completed' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}; padding:2px 6px; border-radius:4px; font-weight:700;">${c.status}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.75rem;">
            ${c.checklist_items.map(step => `
              <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-secondary); cursor:pointer;">
                <input type="checkbox" ${step.completed ? 'checked' : ''} onchange="toggleChecklistStep('${c.request_id}', '${step.step_name}', this.checked)" style="cursor:pointer;" />
                <span style="${step.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${step.step_name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  viewport.innerHTML = layoutPrefix + `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; animation: fade-in 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
        <div>
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Vendor Coordination</h2>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">Always-on Capability - SOW, Access & Status Tracking</p>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Monitoring"></status-pill>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        
        <!-- Left Column: SLA Tracking, SOW check, and Status Normaliser -->
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>SLA & Milestone Tracking</span>
              <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); color: var(--color-status-green-text); padding: 2px 6px; border-radius: 4px;">Human Monitors</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              AI reconciles vendor claims vs. actual code/ticket output.
            </p>
            <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Vendor Claims</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${sla.vendor_claims || 0} items</div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Actual Outputs</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${(sla.vendor_claims > sla.actual_outputs) ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)'};">${sla.actual_outputs || 0} items</div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Generated Invoices</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-brand);">${(window.currentInvoicesList || []).length} invoices</div>
              </div>
            </div>
            ${(sla.vendor_claims > sla.actual_outputs) ? '<div style="font-size: 0.85rem; color: var(--color-status-amber-text);">Discrepancy detected between claims and outputs.</div>' : ''}
          </div>

          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>SOW Discrepancy Check</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              AI flags missing deliverables between SOW and PM tool.
            </p>
            <button onclick="checkSOW('${demandId}')" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem; margin-bottom: 1rem;">Check SOW vs Tools</button>
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${discrepancies.map(d => `
                <div style="background: var(--bg-primary); border: 1px solid var(--color-status-amber-border); border-left: 3px solid var(--color-status-amber-text); border-radius: var(--radius-sm); padding: 0.75rem;">
                  <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">${d.description}</div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary);">${d.ai_analysis}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Status Normaliser -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Status Normaliser</span>
              <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); color: var(--color-status-green-text); padding: 2px 6px; border-radius: 4px;">Human Monitors</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
              Upload raw vendor text status reports to parse into unified views.
            </p>
            
            <div style="border: 1px dashed var(--border-color); border-radius: var(--radius-sm); padding: 1.25rem; margin-bottom: 1.5rem; text-align: center; background: rgba(255,255,255,0.02);">
              <input type="file" id="vendor-report-file" style="display: none;" onchange="uploadVendorReport('${demandId}', this)" />
              <label for="vendor-report-file" class="btn-secondary" style="display: inline-block; cursor: pointer; padding: 0.5rem 1rem; font-size: 0.85rem; font-family: var(--font-sans);">
                ✦ Select & Upload Status Report
              </label>
              <div id="upload-status-msg" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Accepts plain text status logs</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${reportsHtml}
            </div>
          </div>
        </div>
        
        <!-- Right Column: Access alerts & Onboarding/Offboarding checklists -->
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Access & Offboarding Alerts</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Approves</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
              AI recommends disabling stale vendor access.
            </p>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${alerts.map(a => `
                <div style="padding: 1rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${a.user}</div>
                    <div style="font-size: 0.8rem; color: var(--color-status-red-text);">Status: ${a.last_active}</div>
                  </div>
                  <button onclick="revokeAccess('${demandId}', '${a.user}')" class="btn-primary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; background: var(--color-status-red-bg); color: var(--color-status-red-text); border: 1px solid var(--color-status-red-border);">Revoke Access</button>
                </div>
              `).join('')}
              ${alerts.length === 0 ? '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">No stale access detected.</div>' : ''}
            </div>
          </div>

          <!-- Onboarding / Offboarding Checklists -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Supplier Checklists</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Approves</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
              Track compliance and access tasks when suppliers join or leave.
            </p>

            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.5rem;">
              <h4 style="margin:0 0 0.75rem 0; font-size:0.85rem; color:var(--text-primary);">Initiate New Checklist</h4>
              <div style="display:flex; flex-direction:column; gap:0.75rem;">
                <input type="text" id="checklist-employee-name" placeholder="Employee Name" style="padding: 0.45rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size:0.8rem;" />
                <div style="display:flex; gap:0.5rem;">
                  <select id="checklist-type" style="flex:1; padding: 0.45rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size:0.8rem;">
                    <option value="join">Onboard (Join)</option>
                    <option value="leave">Offboard (Leave)</option>
                  </select>
                  <button onclick="onboardSupplier('${demandId}')" class="btn-primary" style="padding: 0.45rem 1rem; font-size:0.8rem;">Start</button>
                </div>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${checklistsHtml}
            </div>
          </div>
        </div>
      </div>
    </div>` + layoutSuffix;
};

window.checkSOW = async function(demandId) {
  try {
    await fetch(`${BASE_URL}/vendor-coordination/check-sow`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId, sow_document_id: 'SOW-1234' })
    });
    window.fetchVendorCoordinationData();
  } catch(e) { console.error(e); }
};

window.revokeAccess = async function(demandId, user) {
  try {
    await fetch(`${BASE_URL}/vendor-coordination/revoke-access/${demandId}?user=${user}`, {
      method: 'POST'
    });
    window.fetchVendorCoordinationData();
  } catch(e) { console.error(e); }
};

window.onboardSupplier = async function(demandId) {
  const nameInput = document.getElementById('checklist-employee-name');
  const typeSelect = document.getElementById('checklist-type');
  const name = nameInput.value.trim();
  const type = typeSelect.value;
  if (!name) return;

  try {
    const res = await fetch(`${BASE_URL}/vendor-coordination/onboard`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        demand_id: demandId,
        vendor_employee_name: name,
        onboarding_type: type
      })
    });
    if (res.ok) {
      nameInput.value = '';
      window.fetchVendorCoordinationData();
    }
  } catch(e) { console.error("Error onboarding supplier", e); }
};

window.toggleChecklistStep = async function(requestId, stepName, completed) {
  try {
    const res = await fetch(`${BASE_URL}/vendor-coordination/checklists/${requestId}/step`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        step_name: stepName,
        completed: completed
      })
    });
    if (res.ok) {
      window.fetchVendorCoordinationData();
    }
  } catch(e) { console.error("Error updating checklist step", e); }
};

window.uploadVendorReport = async function(demandId, fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const msgDiv = document.getElementById('upload-status-msg');
  msgDiv.textContent = "Uploading & parsing report...";
  msgDiv.style.color = "var(--color-brand)";

  const formData = new FormData();
  formData.append('demand_id', demandId);
  formData.append('file', file);

  try {
    const res = await fetch(`${BASE_URL}/vendor-coordination/upload-report`, {
      method: 'POST',
      body: formData
    });
    if (res.ok) {
      msgDiv.textContent = "Report parsed successfully!";
      msgDiv.style.color = "var(--color-status-green-text)";
      setTimeout(() => {
        window.fetchVendorCoordinationData();
      }, 1000);
    } else {
      msgDiv.textContent = "Failed to upload or parse report.";
      msgDiv.style.color = "var(--color-status-red-text)";
    }
  } catch(e) {
    console.error("Error uploading report", e);
    msgDiv.textContent = "Error uploading report.";
    msgDiv.style.color = "var(--color-status-red-text)";
  }
};
