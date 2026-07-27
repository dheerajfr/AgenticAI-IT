const BASE_URL = 'http://127.0.0.1:8000/api';

window.fetchReportingCommunicationData = async function() {
  try {
    const demRes = await fetch('http://127.0.0.1:8000/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch(e) { console.warn("Could not fetch demands list", e); }

  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchReportingCommunicationData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
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
    if (!document.getElementById('reporting-panel-container')) {
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
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchReportingCommunicationData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
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
          <h3 class="sidebar-title">Reporting & Comms</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="reporting-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'knowledge-artifacts';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Knowledge & Artefacts &rarr;
          </button>
        </div>
      </main>
    </div>
  `;


  if (!demandId) {
    
  const activeTab = window.reportingActiveTab || 'summary';
  
  const tabBar = `
    <div style="display: flex; gap: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 2rem;">
      <button onclick="window.reportingActiveTab = 'summary'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'summary' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'summary' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Exec Summary & Rollup
      </button>
      <button onclick="window.reportingActiveTab = 'comms'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'comms' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'comms' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Comm Drafting
      </button>
      <button onclick="window.reportingActiveTab = 'history'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'history' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'history' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Past Reports
      </button>
    </div>
  `;
  
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
    const res = await fetch(`${BASE_URL}/reporting-communication/project/${demandId}`);
    if (res.ok) {
      window.currentReportingData = await res.json();
      window.renderReportingCommunicationScreen();
    }
  } catch (err) {
    console.error("Reporting fetch error", err);
  }
};

window.renderReportingCommunicationScreen = function(targetContainer) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchReportingCommunicationData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
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
    if (!document.getElementById('reporting-panel-container')) {
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
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchReportingCommunicationData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
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
          <h3 class="sidebar-title">Reporting & Comms</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="reporting-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'knowledge-artifacts';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Knowledge & Artefacts &rarr;
          </button>
        </div>
      </main>
    </div>
  `;

  if (!demandId) {
    
  const activeTab = window.reportingActiveTab || 'summary';
  
  const tabBar = `
    <div style="display: flex; gap: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 2rem;">
      <button onclick="window.reportingActiveTab = 'summary'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'summary' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'summary' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Exec Summary & Rollup
      </button>
      <button onclick="window.reportingActiveTab = 'comms'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'comms' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'comms' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Comm Drafting
      </button>
      <button onclick="window.reportingActiveTab = 'history'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'history' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'history' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Past Reports
      </button>
    </div>
  `;
  
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
  
  const data = window.currentReportingData || {};
  const summary = data.exec_summary || null;
  let comms = data.communications || [];
  
  // Backwards compatibility: if there's an old summary that isn't in comms, add it
  if (summary && !comms.find(c => c.content === summary.content)) {
    comms.unshift({
      type: summary.type || "Exec_Summary_" + summary.audience,
      status: summary.status || "generated",
      content: summary.content,
      audience: summary.audience
    });
  }

  // Find the latest communication draft (excluding Exec Summaries) for the Comm tab
  const commDrafts = comms.filter(c => !c.type.startsWith('Exec_Summary'));
  const latestComm = commDrafts.length > 0 ? commDrafts[commDrafts.length - 1] : null;
  const latestCommIdx = latestComm ? comms.lastIndexOf(latestComm) : -1;
  
  
  const activeTab = window.reportingActiveTab || 'summary';
  
  const tabBar = `
    <div style="display: flex; gap: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 2rem;">
      <button onclick="window.reportingActiveTab = 'summary'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'summary' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'summary' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Exec Summary & Rollup
      </button>
      <button onclick="window.reportingActiveTab = 'comms'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'comms' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'comms' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Comm Drafting
      </button>
      <button onclick="window.reportingActiveTab = 'history'; window.renderReportingCommunicationScreen();" 
              style="background: none; border: none; padding: 0.75rem 1rem; cursor: pointer; font-family: var(--font-sans); font-weight: 600; font-size: 0.9rem; color: ${activeTab === 'history' ? 'var(--color-brand)' : 'var(--text-muted)'}; border-bottom: ${activeTab === 'history' ? '2px solid var(--color-brand)' : '2px solid transparent'}; transition: all 0.2s ease;">
        Past Reports
      </button>
    </div>
  `;
  
  viewport.innerHTML = layoutPrefix + `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; animation: fade-in 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
        <div>
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Reporting & Comms</h2>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">Always-on Capability - Summaries & Notifications</p>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Monitoring"></status-pill>
        </div>
      </div>
      
      ${tabBar}
      <div>
        
        <!-- Exec Summary -->
        <div style="display: ${activeTab === 'summary' ? 'block' : 'none'}; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; animation: fade-in 0.3s ease;">
          <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Exec Summary & Rollup</span>
            <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
            AI aggregates info across all modules to generate audience-specific reports (CIO, Tech Lead, etc).
          </p>
          
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <select id="report-audience" style="padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.85rem;">
              <option value="CIO">CIO / Executive</option>
              <option value="Tech_Lead">Technical Lead</option>
              <option value="Business_Owner">Business Owner</option>
            </select>
            <button onclick="generateSummary('${demandId}')" class="btn-primary" style="padding: 0.4rem 1rem; font-size: 0.85rem;">Generate Report</button>
          </div>
          
          ${summary ? `
            <div id="summary-content" style="padding: 1rem; background: var(--bg-primary); border: 1px solid var(--color-brand); border-radius: var(--radius-sm); position: relative; overflow: hidden; margin-top: 1.5rem;">
              <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--color-brand);"></div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; margin-top: 0.5rem;">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-brand); text-transform: uppercase;">Latest Summary: ${summary.audience}</div>
                <div style="font-size: 0.75rem; padding: 2px 6px; border-radius: 12px; background: rgba(99,102,241,0.1); color: var(--color-brand); font-weight: 700;">Generated</div>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-primary); white-space: pre-wrap; margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.02); border-radius: 4px;">${summary.content}</div>
              <button onclick="window.exportSummaryPdf('${demandId}')" class="btn-primary" style="width: 100%; padding: 0.4rem; font-size: 0.75rem;">Download Document</button>
            </div>
          ` : `
            <div style="padding: 2rem; margin-top: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-sm);">
              Select an audience and click Generate Report above.
            </div>
          `}
        </div>

        <!-- Communications -->
        <div style="display: ${activeTab === 'comms' ? 'block' : 'none'}; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; animation: fade-in 0.3s ease;">
          <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Comm Drafting</span>
            <span style="font-size: 0.75rem; background: rgba(245, 158, 11, 0.1); color: var(--color-status-amber-text); padding: 2px 6px; border-radius: 4px;">Human Approves</span>
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
            AI drafts release notes, outage emails, and status updates.
          </p>
          
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <select id="comm-type" style="padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.85rem;">
              <option value="Release_Notes">Release Notes</option>
              <option value="Outage_Notification">Outage Notification</option>
              <option value="Weekly_Status">Weekly Status Update</option>
            </select>
            <button onclick="draftComm('${demandId}')" class="btn-secondary" style="padding: 0.4rem 1rem; font-size: 0.85rem;">Draft Comm</button>
          </div>
          
          
          <!-- Show only the LATEST draft in the Comm Drafting tab -->
          <div style="display: flex; flex-direction: column; gap: 1.5rem; height: auto;">
            ${latestComm ? `
              <div style="padding: 1rem; background: var(--bg-primary); border: 1px solid var(--color-brand); border-radius: var(--radius-sm); position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--color-brand);"></div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; margin-top: 0.5rem;">
                  <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-brand); text-transform: uppercase;">Latest Draft: ${latestComm.type.replace(/_/g, ' ')}</div>
                  <div style="font-size: 0.75rem; padding: 2px 6px; border-radius: 12px; background: rgba(99,102,241,0.1); color: var(--color-brand); font-weight: 700;">${latestComm.status}</div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-primary); white-space: pre-wrap; margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.02); border-radius: 4px;">${latestComm.content}</div>
                <button onclick="window.exportCommPdf('${demandId}', ${latestCommIdx})" class="btn-primary" style="width: 100%; padding: 0.4rem; font-size: 0.75rem;">Download Document</button>
              </div>
            ` : '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem; border: 1px dashed var(--border-color); border-radius: 4px;">Select a report type and click Draft Comm above.</div>'}
          </div>
        </div>
        
        <!-- Past Reports (History) -->
        <div style="display: ${activeTab === 'history' ? 'block' : 'none'}; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; animation: fade-in 0.3s ease;">
          <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Past Reports & Communications</span>
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
            A historical archive of all generated reports and drafts for this project.
          </p>
          
          <div style="display: flex; flex-direction: column; gap: 1.5rem; height: auto;">
            ${comms.length > 0 ? [...comms].reverse().map((c, revIdx) => {
              const idx = comms.length - 1 - revIdx; // Real index for export
              return `
              <div style="padding: 1.25rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                  <div>
                    <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.4rem;">${c.type.replace(/_/g, ' ')}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                      <span style="color: var(--text-muted);">Sent By:</span> <strong>Project Manager</strong><br>
                      <span style="color: var(--text-muted);">Audience:</span> <strong>${c.audience || 'Project Stakeholders'}</strong>
                    </div>
                  </div>
                  <div style="font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; background: rgba(99,102,241,0.1); color: var(--color-brand); font-weight: 700; text-transform: capitalize;">${c.status}</div>
                </div>
                <button onclick="window.exportCommPdf('${demandId}', ${idx})" class="btn-secondary" style="width: 100%; padding: 0.6rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                  <span style="margin-right: 6px;">&#8595;</span> Download Document
                </button>
              </div>
              `;
            }).join('') : '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem; border: 1px dashed var(--border-color); border-radius: 4px;">No historical reports available.</div>'}
          </div>

        </div>
      </div>
    </div>` + layoutSuffix;
};

window.generateSummary = async function(demandId) {
  const audience = document.getElementById('report-audience').value;
  try {
    await fetch(`${BASE_URL}/reporting-communication/generate-summary`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId, audience: audience })
    });
    window.fetchReportingCommunicationData();
  } catch(e) { console.error(e); }
};

window.draftComm = async function(demandId) {
  const type = document.getElementById('comm-type').value;
  try {
    await fetch(`${BASE_URL}/reporting-communication/draft-comm`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId, comm_type: type })
    });
    window.fetchReportingCommunicationData();
  } catch(e) { console.error(e); }
};




window.exportProfessionalPdf = function(title, subtitle, content, filename) {
  // Convert filename to .html to ensure native viewing
  const docFilename = filename.replace('.pdf', '.html');
  
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; line-height: 1.6; background: #fff; }
    .header { border-bottom: 2px solid #0052cc; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { margin: 0; font-size: 28px; color: #0052cc; }
    .subtitle { margin: 5px 0 0 0; font-size: 16px; color: #666; font-weight: normal; }
    .meta { text-align: right; color: #999; font-size: 12px; }
    .content { font-size: 14px; white-space: pre-wrap; color: #222; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${title}</h1>
      <h3 class="subtitle">${subtitle}</h3>
    </div>
    <div class="meta">
      Generated: ${new Date().toLocaleDateString()}<br>
      AgenticAI Delivery System
    </div>
  </div>
  <div class="content">${content}</div>
  <div class="footer">CONFIDENTIAL - Internal Use Only</div>
</body>
</html>`;

  // Use a Blob to trigger an instant native download with ZERO dependencies
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = docFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

window.exportSummaryPdf = function(demandId) {
  const data = window.currentReportingData || {};
  if (!data.exec_summary) return;
  window.exportProfessionalPdf('Executive Summary', `Audience: ${data.exec_summary.audience}`, data.exec_summary.content, `Executive_Summary_${demandId}.pdf`);
};

window.exportCommPdf = function(demandId, index) {
  const data = window.currentReportingData || {};
  let comms = data.communications || [];
  
  // Re-apply backwards compatibility array merge so indices match
  const summary = data.exec_summary || null;
  if (summary && !comms.find(x => x.content === summary.content)) {
    comms = [{
      type: summary.type || "Exec_Summary_" + summary.audience,
      status: summary.status || "generated",
      content: summary.content,
      audience: summary.audience
    }, ...comms];
  }

  const c = comms[index];
  if (!c) return;
  
  const title = c.type.replace(/_/g, ' ');
  window.exportProfessionalPdf(title, `Project: ${demandId}`, c.content, `${c.type}_${demandId}.pdf`);
};
