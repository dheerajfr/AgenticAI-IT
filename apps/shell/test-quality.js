const TQ_API_BASE = 'http://127.0.0.1:8000/api';

let tqDemands = [];
let tqSelectedDemandId = sessionStorage.getItem('selectedDemandId') || null;
let tqActiveTab = 'dashboard'; // 'dashboard', 'generation', 'data', 'execution', 'triage', 'security', 'traceability', 'quality-gate'

// In-memory states synchronized with DB relational tables
let tqDeliveryContext = null;
let tqDashboardStats = null;
let generatedSuite = null;
let testDataProvision = null;
let testRun = null;
let defectTriage = null;
let securityScan = null;
let traceabilityMatrix = null;
let qualityGate = null;

// Expose to window so shell.js can call it
window.renderTestQualityScreen = function () {
  const viewport = document.getElementById('viewport');

  // ── Override viewport to a fixed-height flex container so the TQ layout
  //    can fill 100% height without being constrained by the scrollable
  //    .screen-viewport's overflow-y: auto. Restore on module teardown.
  const _origOverflow = viewport.style.overflow;
  const _origOverflowY = viewport.style.overflowY;
  const _origDisplay   = viewport.style.display;
  const _origFlexDir   = viewport.style.flexDirection;
  const _origPadding   = viewport.style.padding;

  viewport.style.overflow       = 'hidden';
  viewport.style.overflowY      = 'hidden';
  viewport.style.display        = 'flex';
  viewport.style.flexDirection  = 'column';
  viewport.style.padding        = '0';

  const _tqObserver = new MutationObserver(() => {
    if (!document.getElementById('tq-panel-container')) {
      viewport.style.overflow      = _origOverflow;
      viewport.style.overflowY     = _origOverflowY;
      viewport.style.display       = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding       = _origPadding;
      _tqObserver.disconnect();
    }
  });
  _tqObserver.observe(viewport, { childList: true, subtree: false });

  viewport.innerHTML = `
<<<<<<< HEAD
    <div class="intake-screen" style="padding: 1rem; flex: 1; min-height: 0; box-sizing: border-box; align-items: stretch;">
      <!-- Left Sidebar: Demands Queue & Test & Quality Queue -->
      <aside class="sidebar" style="display: flex; flex-direction: column; gap: 0.75rem; height: 100%; overflow: hidden; width: 300px; align-self: stretch;">
        <!-- Demands Queue -->
        <div class="panel-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <h3 class="sidebar-title" style="margin: 0; font-size: 0.85rem;">Demands Queue</h3>
          </div>
          <ul class="demand-list" id="tq-demand-list-container" style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem;">
            <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 1rem;">
              Loading demands...
            </li>
          </ul>
        </div>
        
        <!-- Test and Quality Queue -->
        <div class="panel-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <h3 class="sidebar-title" style="margin: 0; font-size: 0.85rem; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-display); font-weight: bold;">Test and Quality Queue</h3>
          </div>
          <ul class="demand-list" id="tq-active-queue-list" style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem;">
            <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 1rem;">
              Loading active queue...
            </li>
          </ul>
=======
    <div class="intake-screen">
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Test &amp; Quality</h3>
          <button class="btn-new" id="tq-refresh-btn" title="Refresh">&#x21BB;</button>
>>>>>>> 56cc6dd8739b28d2d42d1a7c3d1e55590562f35a
        </div>
        <ul class="demand-list" id="tq-sidebar-list">
          <li class="demand-item" style="text-align:center; color:var(--text-muted); padding:2rem;">
            Loading demands...
          </li>
        </ul>
      </aside>
<<<<<<< HEAD
      
      <!-- Right Panel: Capabilities Tabbed View -->
      <main class="details-panel" id="tq-panel-container" style="display: flex; flex-direction: column; overflow: hidden; min-height: 0; min-width: 0; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);"></main>
=======

      <!-- Right Detail Panel -->
      <main class="details-panel" id="tq-panel-container"></main>
>>>>>>> 56cc6dd8739b28d2d42d1a7c3d1e55590562f35a
    </div>
  `;

  document.getElementById('tq-refresh-btn').addEventListener('click', () => window.fetchTestQualityData());

  // Inject CSS styles if they do not exist
  if (!document.getElementById('tq-premium-styles')) {
    const style = document.createElement('style');
    style.id = 'tq-premium-styles';
    style.textContent = `
      .tq-tab-header {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.75rem;
        margin-bottom: 1.25rem;
      }
      .tq-tab-btn {
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-secondary);
        padding: 0.5rem 1rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-family: var(--font-sans);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .tq-tab-btn:hover {
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
      }
      .tq-tab-btn.active {
        background: rgba(99, 102, 241, 0.1);
        color: var(--color-brand);
        border-color: rgba(99, 102, 241, 0.3);
      }
      .tq-tab-content {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        scrollbar-width: none;       /* Firefox */
        -ms-overflow-style: none;    /* IE/Edge legacy */
      }
      .tq-tab-content::-webkit-scrollbar {
        display: none;               /* Chrome / Safari / Edge */
      }
      .tq-card {
        background: rgba(255,255,255,0.02);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 1.25rem;
      }
      .tq-card-title {
        font-family: var(--font-display);
        font-size: 1rem;
        font-weight: 700;
        margin-top: 0;
        margin-bottom: 0.75rem;
        color: var(--text-primary);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .tq-form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 1rem;
      }
      .tq-form-group label {
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .tq-input {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        padding: 0.5rem;
        font-family: var(--font-sans);
        font-size: 0.85rem;
      }
      .tq-input:focus {
        border-color: var(--color-brand);
        outline: none;
      }
      .tq-btn {
        background: linear-gradient(135deg, var(--color-brand), #4f46e5);
        color: var(--text-primary);
        border: none;
        padding: 0.65rem 1.25rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .tq-btn:hover {
        opacity: 0.9;
      }
      .tq-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .tq-json-viewer {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: 1rem;
        font-family: ui-monospace, monospace;
        font-size: 0.75rem;
        color: #a5b4fc;
        overflow-x: auto;
        white-space: pre-wrap;
        margin-top: 1rem;
      }
      .loader {
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        border-top: 2px solid var(--color-brand);
        width: 16px;
        height: 16px;
        animation: spin 0.8s linear infinite;
        display: inline-block;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .badge-priority {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 9999px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .badge-priority.critical, .badge-priority.Blocker { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
      .badge-priority.high, .badge-priority.Major { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }
      .badge-priority.medium, .badge-priority.Minor { background: rgba(59, 130, 246, 0.15); color: #93c5fd; }
      .badge-priority.low, .badge-priority.Cosmetic { background: rgba(75, 85, 99, 0.15); color: #d1d5db; }
      .badge-type {
        font-size: 12px;
        padding: 0.1rem 0.5rem;
        border-radius: 9999px;
        font-weight: 500;
        display: inline-block;
        white-space: nowrap;
      }
      .badge-type.functional-positive { background: rgba(16, 185, 129, 0.15); color: #34d399; }
      .badge-type.functional-negative { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
      .badge-type.non-functional { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
      .badge-type.functional { background: rgba(59, 130, 246, 0.15); color: #93c5fd; }
      .demand-item.active { background: rgba(99, 102, 241, 0.15); border-left: 3px solid var(--color-brand); }
      .tq-table-row:hover { background: rgba(255, 255, 255, 0.02) !important; }
    `;
    document.head.appendChild(style);
  }
}

window.fetchTestQualityData = async function () {
  tqSelectedDemandId = sessionStorage.getItem('selectedDemandId') || tqSelectedDemandId;
  try {
    const resDemands = await fetch(`${TQ_API_BASE}/demands`);
    if (!resDemands.ok) throw new Error(`HTTP Error: ${resDemands.status}`);
    tqDemands = await resDemands.json();

    const resConsolidated = await fetch(`${TQ_API_BASE}/test-quality/consolidated`);
    const consolidatedStates = resConsolidated.ok ? await resConsolidated.json() : [];
    const activeDemandIds = consolidatedStates.map(record => record.demand_id);

    renderTQQueues(activeDemandIds);

    // Auto-select: if no valid ID or saved ID doesn't exist in current demands, pick first available
    if (!tqSelectedDemandId || !tqDemands.some(d => d.demand_id === tqSelectedDemandId)) {
      const first = tqDemands.find(d => activeDemandIds.includes(d.demand_id)) || tqDemands[0];
      if (first) tqSelectedDemandId = first.demand_id;
    }

    if (tqSelectedDemandId) {
      selectTQDemand(tqSelectedDemandId);
    } else {
      renderEmptyTQDetails();
    }
  } catch (err) {
    console.error("Failed to fetch demands for Test & Quality:", err);
    const list = document.getElementById('tq-sidebar-list');
    if (list) list.innerHTML = `<li style="padding:1.5rem; text-align:center; color:var(--color-status-red-text);">Failed to load demands. Make sure the backend is running.</li>`;
  }
}

function renderTQQueues(activeDemandIds) {
  const list = document.getElementById('tq-sidebar-list');
  if (!list) return;

  if (tqDemands.length === 0) {
    list.innerHTML = `<li style="padding:2rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">No demands found.</li>`;
    return;
  }

  const activeDemands = tqDemands.filter(d => activeDemandIds.includes(d.demand_id));
  const otherDemands  = tqDemands.filter(d => !activeDemandIds.includes(d.demand_id));

  let html = '';

  if (activeDemands.length) {
    html += `<li style="padding:0.4rem 1rem 0.2rem; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#34d399; pointer-events:none;">&#x25CF; Active Test Runs</li>`;
    html += activeDemands.map(d => _tqSidebarItem(d, activeDemandIds)).join('');
  }

  if (otherDemands.length) {
    html += `<li style="padding:0.4rem 1rem 0.2rem; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-muted); margin-top:0.5rem; pointer-events:none;">All Demands</li>`;
    html += otherDemands.map(d => _tqSidebarItem(d, activeDemandIds)).join('');
  }

  list.innerHTML = html;

  list.querySelectorAll('.demand-item[data-id]').forEach(item => {
    item.addEventListener('click', () => selectTQDemand(item.getAttribute('data-id')));
  });
}

function _tqSidebarItem(d, activeDemandIds) {
  const isSelected = d.demand_id === tqSelectedDemandId;
  const isActive   = activeDemandIds.includes(d.demand_id);

  let statusBadge = '';
  if (isActive) {
    statusBadge = `<span style="font-size:0.62rem; padding:1px 5px; border-radius:9999px; font-weight:700; background:rgba(52,211,153,0.15); color:#34d399;">Active</span>`;
  } else {
    const statusColor = d.status === 'approved' ? 'var(--color-status-green-text)'
      : d.status === 'capacity-checked' ? 'var(--color-status-amber-text)'
      : 'var(--text-muted)';
    statusBadge = `<span style="font-size:0.62rem; padding:1px 5px; border-radius:9999px; font-weight:700; background:rgba(255,255,255,0.05); color:${statusColor};">${d.status}</span>`;
  }

  return `
    <li class="demand-item ${isSelected ? 'active' : ''}" data-id="${d.demand_id}" style="cursor:pointer;">
      <div class="demand-item-header">
        <span class="demand-item-id">${d.demand_id}</span>
        ${statusBadge}
      </div>
      <h4 class="demand-item-title" style="margin:0.2rem 0 0 0; font-size:0.82rem;">${d.title}</h4>
      <div class="demand-item-meta" style="margin-top:0.2rem;">
        <span>By: ${(d.submitted_by || '').split('@')[0] || 'N/A'}</span>
        <span>${d.submitted_date || ''}</span>
      </div>
    </li>
  `;
}

async function selectTQDemand(id) {
  tqSelectedDemandId = id;
  if (id) {
    sessionStorage.setItem('selectedDemandId', id);
  }
  // Re-fetch consolidated list dynamically to rebuild sidebar queues highlighting
  fetch(`${TQ_API_BASE}/test-quality/consolidated`)
    .then(res => res.json())
    .then(states => {
      renderTQQueues(states.map(s => s.demand_id));
    })
    .catch(err => console.warn("TQ consolidated fetch warning:", err));

  // Set memory state and call fetch context
  await loadConsolidatedTQState(id);

  try {
    const resCtx = await fetch(`${TQ_API_BASE}/test-quality/delivery-context/${id}`);
    if (resCtx.ok) {
      tqDeliveryContext = await resCtx.json();
    } else {
      tqDeliveryContext = null;
    }
  } catch (err) {
    console.error("Delivery context error:", err);
    tqDeliveryContext = null;
  }

  renderTQDetailsPanel();
}

function renderEmptyTQDetails() {
  const panel = document.getElementById('tq-panel-container');
  if (!panel) return;
  panel.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 4rem 2rem;">
      <h3>No Demand Selected</h3>
      <p>Select a demand from the left sidebar to begin Test &amp; Quality scans.</p>
    </div>
  `;
}

function renderTQDetailsPanel() {
  const panel = document.getElementById('tq-panel-container');
  const demand = tqDemands.find(d => d.demand_id === tqSelectedDemandId);
  if (!demand) {
    renderEmptyTQDetails();
    return;
  }

  panel.innerHTML = `
    <!-- Top Header -->
<<<<<<< HEAD
    <div style="margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
      <div>
        <h2 style="margin: 0; font-size: 1.35rem; font-family: var(--font-display); font-weight: 800;">
          Test & Quality Assurance Module
        </h2>
=======
    <div style="margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 0;">
        <h2 style="margin: 0 0 0.35rem 0; font-size: 1.35rem; font-family: var(--font-display); font-weight: 800;">
          ${demand.title || 'Test & Quality Assurance'}
        </h2>
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
          <span><span style="color:var(--text-muted); text-transform:uppercase; font-size:0.68rem; font-weight:700; letter-spacing:0.05em;">Demand ID</span><br><strong style="color:var(--text-primary);">${demand.demand_id}</strong></span>
          <span><span style="color:var(--text-muted); text-transform:uppercase; font-size:0.68rem; font-weight:700; letter-spacing:0.05em;">Domain</span><br><strong style="color:var(--text-primary);">${demand.domain || (tqDeliveryContext && tqDeliveryContext.demand ? tqDeliveryContext.demand.domain : '—')}</strong></span>
          <span><span style="color:var(--text-muted); text-transform:uppercase; font-size:0.68rem; font-weight:700; letter-spacing:0.05em;">Submitted By</span><br><strong style="color:var(--text-primary);">${(demand.submitted_by || '—').split('@')[0]}</strong></span>
          <span><span style="color:var(--text-muted); text-transform:uppercase; font-size:0.68rem; font-weight:700; letter-spacing:0.05em;">Date</span><br><strong style="color:var(--text-primary);">${demand.submitted_date || '—'}</strong></span>
          <span><span style="color:var(--text-muted); text-transform:uppercase; font-size:0.68rem; font-weight:700; letter-spacing:0.05em;">Status</span><br>
            <strong style="color:${demand.status === 'approved' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'};">${demand.status || '—'}</strong>
          </span>
          <span><span style="color:var(--text-muted); text-transform:uppercase; font-size:0.68rem; font-weight:700; letter-spacing:0.05em;">Risk</span><br>
            <strong style="color:${demand.risk_level === 'critical' || demand.risk_level === 'high' ? 'var(--color-status-red-text)' : demand.risk_level === 'medium' ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)'};">${demand.risk_level || '—'}</strong>
          </span>
          ${demand.description ? `<span style="flex-basis:100%; color:var(--text-secondary); font-size:0.8rem; line-height:1.5; margin-top:0.25rem;">${demand.description.substring(0, 180)}${demand.description.length > 180 ? '…' : ''}</span>` : ''}
        </div>
>>>>>>> 56cc6dd8739b28d2d42d1a7c3d1e55590562f35a
      </div>

      <!-- Searchable Dropdown Selector -->
      <div id="tq-searchable-demand-selector-container" style="flex-shrink:0;"></div>
    </div>

    <!-- Capabilities Tabs -->
    <div class="tq-tab-header" style="flex-wrap: wrap; margin-bottom: 1rem;">
      <button class="tq-tab-btn ${tqActiveTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">Dashboard</button>
      <button class="tq-tab-btn ${tqActiveTab === 'generation' ? 'active' : ''}" data-tab="generation">1. Test Generation</button>
      <button class="tq-tab-btn ${tqActiveTab === 'data' ? 'active' : ''}" data-tab="data">2. Test Data</button>
      <button class="tq-tab-btn ${tqActiveTab === 'execution' ? 'active' : ''}" data-tab="execution">3. Test Execution</button>
      <button class="tq-tab-btn ${tqActiveTab === 'triage' ? 'active' : ''}" data-tab="triage">4. Defect Triage</button>
      <button class="tq-tab-btn ${tqActiveTab === 'security' ? 'active' : ''}" data-tab="security">5. Security Testing</button>
      <button class="tq-tab-btn ${tqActiveTab === 'traceability' ? 'active' : ''}" data-tab="traceability">6. Traceability</button>
      <button class="tq-tab-btn ${tqActiveTab === 'quality-gate' ? 'active' : ''}" data-tab="quality-gate">7. Quality Gate</button>
    </div>

    <!-- Tab Content Viewport -->
    <div class="tq-tab-content" id="tq-tab-viewport"></div>
  `;

  // Hydrate Searchable Demand Selector Dropdown
  const searchContainer = document.getElementById('tq-searchable-demand-selector-container');
  renderSearchableDemandDropdown(searchContainer, demand);

  // Attach tab handlers
  panel.querySelectorAll('.tq-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tqActiveTab = btn.getAttribute('data-tab');
      renderTQDetailsPanel();
    });
  });

  renderActiveTabContent(demand);
}

function renderSearchableDemandDropdown(container, activeDemand) {
  if (!container) return;

  const optionsHtml = tqDemands.map(d => {
    const isSel = activeDemand && d.demand_id === activeDemand.demand_id ? 'selected' : '';
    return `<option value="${d.demand_id}" ${isSel}>${d.demand_id} - ${d.title}</option>`;
  }).join('');

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <select id="tq-demand-dropdown" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
        <option value="">Select a Project...</option>
        ${optionsHtml}
      </select>
    </div>
  `;

  const dropdown = document.getElementById('tq-demand-dropdown');
  if (dropdown) {
    if (activeDemand) {
      dropdown.value = activeDemand.demand_id;
    }
    dropdown.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      if (selectedId) {
        selectTQDemand(selectedId);
      }
    });
  }
<<<<<<< HEAD

  searchInput.addEventListener('focus', () => {
    searchInput.value = '';          // clear label so filter shows all
    showDropdown();
  });
  searchInput.addEventListener('blur', () => {
    hideDropdown();
    // Restore the selected demand label after blur
    setTimeout(() => {
      if (activeDemand && searchInput.value === '') {
        searchInput.value = `${activeDemand.demand_id} - ${activeDemand.title}`;
      }
    }, 300);
  });
  searchInput.addEventListener('input', (e) => {
    dropdownList.style.display = 'block';
    renderOptions(e.target.value);
  });
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdownList.style.display === 'block') {
      dropdownList.style.display = 'none';
    } else {
      searchInput.value = '';
      showDropdown();
    }
  });
=======
>>>>>>> 56cc6dd8739b28d2d42d1a7c3d1e55590562f35a
}

function renderActiveTabContent(demand) {
  const container = document.getElementById('tq-tab-viewport');
  if (tqActiveTab === 'dashboard') {
    renderDashboardTab(container, demand);
  } else if (tqActiveTab === 'generation') {
    renderTestGenerationTab(container, demand);
  } else if (tqActiveTab === 'data') {
    renderTestDataTab(container, demand);
  } else if (tqActiveTab === 'execution') {
    renderTestExecutionTab(container, demand);
  } else if (tqActiveTab === 'triage') {
    renderDefectTriageTab(container, demand);
  } else if (tqActiveTab === 'security') {
    renderSecurityScanningTab(container, demand);
  } else if (tqActiveTab === 'traceability') {
    renderTraceabilityTab(container, demand);
  } else if (tqActiveTab === 'quality-gate') {
    renderQualityGateTab(container, demand);
  }
}

// -------------------------------------------------------------
// Tab: Dashboard View
// -------------------------------------------------------------
async function renderDashboardTab(container, demand) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem;"><span class="loader" style="width: 32px; height: 32px;"></span><p style="margin-top: 0.5rem; color: var(--text-secondary);">Analyzing stats...</p></div>`;

  try {
    const res = await fetch(`${TQ_API_BASE}/test-quality/dashboard-stats/${demand.demand_id}`);
    const stats = res.ok ? await res.json() : getMockDashboardStats();

    const isGatePass = stats.quality_gate_status === 'PASS';
    const isGateFail = stats.quality_gate_status === 'FAIL';

    let gateColor = '#4ade80';
    if (isGateFail) gateColor = '#ef4444';
    else if (stats.quality_gate_status === 'CONDITIONAL_PASS') gateColor = '#fbbf24';

    container.innerHTML = `
      <!-- Dashboard Cards -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
        <div class="tq-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Test Cases</div>
          <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary); margin: 0.5rem 0;">${stats.total_test_cases}</div>
          <div style="font-size: 0.75rem; color: #818cf8;">✓ All active in suite</div>
        </div>

        <div class="tq-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Test Pass Rate</div>
          <div style="font-size: 2rem; font-weight: 800; color: #4ade80; margin: 0.5rem 0;">${stats.pass_rate_pct}%</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${stats.passed_tests} / ${stats.executed_tests} passed</div>
        </div>

        <div class="tq-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Open Defects</div>
          <div style="font-size: 2rem; font-weight: 800; color: #f87171; margin: 0.5rem 0;">${stats.open_defects}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${stats.closed_defects} resolved / closed</div>
        </div>

        <div class="tq-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Quality Gate Status</div>
          <div style="font-size: 1.75rem; font-weight: 900; color: ${gateColor}; margin: 0.65rem 0;">${stats.quality_gate_status}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">Score: ${stats.quality_score} / 100</div>
        </div>
      </div>

      <!-- Release Readiness Status -->
      <div style="padding: 1.25rem; border-radius: var(--radius-md); background: ${isGatePass ? 'rgba(74, 222, 128, 0.08)' : 'rgba(239, 68, 68, 0.08)'}; border: 1px solid ${isGatePass ? '#4ade80' : '#ef4444'}; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h4 style="margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
            <span>${isGatePass ? '✓ RELEASE STATUS: APPROVED' : '✗ RELEASE STATUS: BLOCKED'}</span>
          </h4>
          <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">
            ${isGatePass ? 'All gate verification criteria met successfully. Ready for deployment.' : 'Critical defects or security issues are blocking release. Check detailed audit results.'}
          </p>
        </div>
        <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: ${isGatePass ? '#4ade80' : '#ef4444'}; padding: 0.25rem 0.75rem; border-radius: 9999px; background: rgba(255,255,255,0.03);">
          ${stats.release_readiness}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1rem;">
        <!-- Execution Analytics -->
        <div class="tq-card">
          <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Test Execution Analytics</h5>
          
          <div style="display: flex; flex-direction: column; gap: 0.8rem;">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                <span style="color: var(--text-secondary);">Pass Ratio</span>
                <span style="font-weight: bold; color: #4ade80;">${stats.pass_rate_pct}%</span>
              </div>
              <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 9999px; overflow: hidden;">
                <div style="width: ${stats.pass_rate_pct}%; height: 100%; background: #4ade80; border-radius: 9999px;"></div>
              </div>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                <span style="color: var(--text-secondary);">Requirements Coverage</span>
                <span style="font-weight: bold; color: #818cf8;">${stats.traceability_coverage_pct}%</span>
              </div>
              <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 9999px; overflow: hidden;">
                <div style="width: ${stats.traceability_coverage_pct}%; height: 100%; background: #818cf8; border-radius: 9999px;"></div>
              </div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; text-align: center; margin-top: 1.25rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
            <div>
              <div style="font-size: 1.15rem; font-weight: bold; color: #4ade80;">${stats.passed_tests}</div>
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Passed</div>
            </div>
            <div>
              <div style="font-size: 1.15rem; font-weight: bold; color: #f87171;">${stats.failed_tests}</div>
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Failed</div>
            </div>
            <div>
              <div style="font-size: 1.15rem; font-weight: bold; color: #fbbf24;">${stats.blocked_tests}</div>
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Blocked</div>
            </div>
            <div>
              <div style="font-size: 1.15rem; font-weight: bold; color: #9ca3af;">${stats.skipped_tests}</div>
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Skipped</div>
            </div>
          </div>
        </div>

        <!-- Security posture -->
        <div class="tq-card">
          <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Security Posture</h5>
          <div style="display: flex; flex-direction: column; gap: 0.65rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <span style="color: #fca5a5; font-weight: bold;">Critical</span>
              <span style="font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); padding: 0.15rem 0.5rem; border-radius: 4px; color: #fca5a5;">${stats.security_findings.critical}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <span style="color: #fcd34d; font-weight: bold;">High</span>
              <span style="font-size: 0.8rem; background: rgba(245, 158, 11, 0.2); padding: 0.15rem 0.5rem; border-radius: 4px; color: #fcd34d;">${stats.security_findings.high}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <span style="color: #93c5fd; font-weight: bold;">Medium</span>
              <span style="font-size: 0.8rem; background: rgba(59, 130, 246, 0.2); padding: 0.15rem 0.5rem; border-radius: 4px; color: #93c5fd;">${stats.security_findings.medium}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <span style="color: #d1d5db; font-weight: bold;">Low</span>
              <span style="font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 0.15rem 0.5rem; border-radius: 4px; color: #d1d5db;">${stats.security_findings.low}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Dashboard tab loading error:", err);
    container.innerHTML = `<div style="color: var(--color-status-red-text);">Error loading dashboard stats.</div>`;
  }
}

function getMockDashboardStats() {
  return {
    total_test_cases: generatedSuite ? generatedSuite.test_cases.length : 12,
    total_datasets: 3,
    executed_tests: testRun ? 12 : 0,
    passed_tests: testRun ? 10 : 0,
    failed_tests: testRun ? 2 : 0,
    blocked_tests: 0,
    skipped_tests: 0,
    pass_rate_pct: testRun ? 83.33 : 0.0,
    open_defects: defectTriage ? defectTriage.triaged_defects.length : 2,
    closed_defects: 4,
    security_findings: { critical: 0, high: 1, medium: 2, low: 4, informational: 3, total: 10 },
    traceability_coverage_pct: traceabilityMatrix ? traceabilityMatrix.coverage_percentage : 90.0,
    quality_gate_status: qualityGate ? qualityGate.verdict : 'FAIL',
    quality_score: qualityGate ? qualityGate.score : 65,
    release_readiness: qualityGate && qualityGate.verdict === 'PASS' ? 'Ready' : 'Not Ready'
  };
}

// -------------------------------------------------------------
// Tab 1: Test Generation UI
// -------------------------------------------------------------
function renderTestGenerationTab(container, demand) {
  const cases = generatedSuite ? generatedSuite.test_cases : [];

  container.innerHTML = `
    <!-- Top Configuration card -->
    <div class="tq-card">
      <h4 class="tq-card-title">Test Case Generator Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Extracts requirements from the database and automatically drafts functional, regression, API, integration, and boundary test cases.
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
        <div class="tq-form-group">
          <label>Requirement Context / User Stories</label>
          <input type="text" class="tq-input" id="tq-gen-stories" value="${demand.demand_id}" placeholder="e.g. US-101, US-102">
        </div>
      </div>

      <div style="display: flex; gap: 0.75rem;">
        <button class="tq-btn" id="btn-tq-generate">
          <span>Generate Test Suite</span>
        </button>
        <button class="tq-btn" id="btn-tq-add-manual" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); color: var(--text-primary);">
          <span>+ Add Manual Test</span>
        </button>
      </div>
    </div>

    <!-- Metrics row -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;">
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Total Test Cases</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;">${cases.length}</div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Generated Tests</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;">${cases.filter(c => (c.automation_candidate || (c.type && c.type !== 'manual' ? 'Yes' : 'No')) === 'Yes').length}</div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Manual Tests</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;">${cases.filter(c => (c.automation_candidate || (c.type && c.type !== 'manual' ? 'Yes' : 'No')) !== 'Yes').length}</div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Coverage Target</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem; color: ${cases.length === 0 ? 'var(--text-muted)' : '#4ade80'};">
          ${cases.length === 0 ? '—' : Math.round((cases.filter(c => (c.automation_candidate || (c.type && c.type !== 'manual' ? 'Yes' : 'No')) === 'Yes').length / cases.length) * 100) + '%'}
        </div>
      </div>
    </div>

    <!-- Active List -->
    <div class="tq-card" style="max-width: 100%;">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Active Test Suite</h5>
      
      <div style="overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: var(--radius-sm); max-width: 100%;">
        <table style="width: 100%; min-width: 1050px; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); background: rgba(255, 255, 255, 0.015); color: var(--text-muted);">
              <th style="padding: 0.75rem 0.75rem; width: 110px; white-space: nowrap;">Test ID</th>
              <th style="padding: 0.75rem 0.75rem; min-width: 280px; max-width: 320px;">Title / Objective</th>
              <th style="padding: 0.75rem 0.75rem; width: 140px; white-space: nowrap;">Type</th>
              <th style="padding: 0.75rem 0.75rem; width: 100px;">Priority</th>
              <th style="padding: 0.75rem 0.75rem; width: 100px;">Risk</th>
              <th style="padding: 0.75rem 0.75rem; width: 100px;">Automation</th>
              <th style="padding: 0.75rem 0.75rem; width: 100px;">Status</th>
              <th style="padding: 0.75rem 0.75rem; width: 130px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cases.length === 0 ? `
              <tr>
                <td colspan="9" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No test cases generated. Click "Generate Test Suite" above to build AI test scripts.
                </td>
              </tr>
            ` : cases.map(c => {
    const testId = c.test_id || c.id || '';
    const testPriority = c.priority || 'medium';
    const testRisk = c.risk_level || 'medium';
    const testAuto = c.automation_candidate || (c.type && c.type !== 'manual' ? 'Yes' : 'No');
    const testStatus = c.status || 'Approved';
    const testReq = c.requirement || 'Functional';
    const testType = c.type || 'functional';
    
    // Parse steps list
    let stepsList = [];
    if (Array.isArray(c.steps)) {
      stepsList = c.steps;
    } else if (typeof c.steps === 'string') {
      if (c.steps.includes('\n')) {
        stepsList = c.steps.split('\n');
      } else if (c.steps.includes('; ')) {
        stepsList = c.steps.split('; ');
      } else if (c.steps.includes(';')) {
        stepsList = c.steps.split(';');
      } else {
        stepsList = [c.steps];
      }
    }
    stepsList = stepsList.map(s => s.trim()).filter(s => s.length > 0);
    const stepsCount = stepsList.length;

    // Format badge text (Title Case / Space Separated)
    const displayType = testType === 'functional-positive' ? 'Functional Positive' :
                        testType === 'functional-negative' ? 'Functional Negative' :
                        testType === 'non-functional' ? 'Non-Functional' :
                        testType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); vertical-align: middle;" class="tq-table-row">
                <td style="padding: 0.75rem 0.75rem; font-weight: bold; font-family: monospace; color: var(--color-brand); white-space: nowrap;">${testId}</td>
                <td style="padding: 0.75rem 0.75rem; min-width: 280px; max-width: 320px; white-space: normal; word-break: break-word;">
                  <strong style="color: var(--text-primary); display: block; margin-bottom: 0.3rem;">${c.title}</strong>
                  <div style="margin-top: 0.35rem;">
                    <span class="tq-steps-toggle" data-id="${testId}" data-count="${stepsCount}" style="cursor: pointer; color: var(--color-brand); font-size: 0.72rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.2rem; user-select: none;">
                      ▼ Steps (${stepsCount})
                    </span>
                    <div class="tq-steps-content" data-id="${testId}" style="display: none; margin-top: 0.4rem; font-size: 0.74rem; color: var(--text-muted); line-height: 1.45; border-left: 2px solid rgba(255, 255, 255, 0.08); padding-left: 0.5rem;">
                      ${stepsList.map(step => `<div style="margin-bottom: 0.25rem;">${step}</div>`).join('')}
                    </div>
                  </div>
                </td>
                <td style="padding: 0.75rem 0.75rem; color: var(--text-secondary); white-space: nowrap;">${displayType}</td>
                <td style="padding: 0.75rem 0.75rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">${testPriority}</td>
                <td style="padding: 0.75rem 0.75rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">${testRisk}</td>
                <td style="padding: 0.75rem 0.75rem; color: var(--text-secondary);">${testAuto}</td>
                <td style="padding: 0.75rem 0.75rem;">
                  <span style="font-size: 0.75rem; font-weight: bold; color: ${testStatus === 'Approved' ? '#4ade80' : '#fcd34d'};">
                    ${testStatus}
                  </span>
                </td>
                <td style="padding: 0.75rem 0.75rem; text-align: right; white-space: nowrap;">
                  <button class="btn-tq-edit tq-btn" data-id="${testId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text-primary); margin-right: 0.25rem;">Edit</button>
                  <button class="btn-tq-delete tq-btn" data-id="${testId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5;">Delete</button>
                </td>
              </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach delegated steps toggle listener
  container.addEventListener('click', (e) => {
    const toggle = e.target.closest('.tq-steps-toggle');
    if (toggle) {
      const id = toggle.getAttribute('data-id');
      const count = toggle.getAttribute('data-count');
      const content = container.querySelector(`.tq-steps-content[data-id="${id}"]`);
      if (content) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        toggle.innerHTML = isHidden ? `▲ Steps (${count})` : `▼ Steps (${count})`;
      }
    }
  });

  // Attach handlers
  const generateBtn = document.getElementById('btn-tq-generate');
  generateBtn.addEventListener('click', async () => {
    generateBtn.disabled = true;
    generateBtn.innerHTML = `<span class="loader"></span> Generating...`;

    try {
      const planId = (tqDeliveryContext && tqDeliveryContext.plan) 
        ? tqDeliveryContext.plan.plan_id 
        : ((tqDeliveryContext && tqDeliveryContext.plan_id) 
            ? tqDeliveryContext.plan_id 
            : `PLN-${demand.demand_id.split('-').pop()}-1`);

      const storiesInput = document.getElementById('tq-gen-stories').value || '';
      const storyIds = storiesInput.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const codeDiffRef = (tqDeliveryContext && tqDeliveryContext.build_deploy)
        ? tqDeliveryContext.build_deploy.code_diff_ref
        : null;

      const payload = {
        demand_id: demand.demand_id,
        plan_id: planId,
        story_ids: storyIds,
        code_diff_ref: codeDiffRef,
        traceability_matrix_id: null
      };

      const response = await fetch(`${TQ_API_BASE}/test-quality/test-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server returned status ${response.status}`);
      }

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    } catch (err) {
      console.error('Test generation error:', err);
      alert(`Failed to generate test suite: ${err.message}`);
      generateBtn.disabled = false;
      generateBtn.innerHTML = `<span>Generate Test Suite</span>`;
    }
  });


  const addManualBtn = document.getElementById('btn-tq-add-manual');
  addManualBtn.addEventListener('click', async () => {
    const title = prompt("Enter Test Case Title:");
    if (!title) return;
    const reqName = prompt("Enter Requirement Area:", "Functional Check");
    const priority = prompt("Enter Priority (Critical, High, Medium, Low):", "High");

    const mockId = `TC-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;
    const newCase = {
      id: mockId,
      title: title,
      requirement: reqName || "General",
      story_id: `${demand.demand_id}-US-1`,
      preconditions: "User logged in",
      steps: "1. Navigate to view\n2. Perform check",
      expected: "Verifies correct display and action logs.",
      priority: priority,
      risk_level: "Medium",
      automation_candidate: "No",
      status: "Approved",
      traceability: `${demand.demand_id}-US-1`
    };

    await fetch(`${TQ_API_BASE}/test-quality/relational/test_cases/${demand.demand_id}/${mockId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCase)
    });

    await loadConsolidatedTQState(demand.demand_id);
    renderTQDetailsPanel();
  });

  // Edit / Delete handlers
  container.querySelectorAll('.btn-tq-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const cCase = cases.find(c => (c.test_id || c.id) === id);
      const newTitle = prompt("Edit Test Title:", cCase.title);
      if (newTitle === null) return;
      cCase.title = newTitle;
      cCase.status = 'Approved';

      await fetch(`${TQ_API_BASE}/test-quality/relational/test_cases/${demand.demand_id}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cCase)
      });

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    });
  });

  container.querySelectorAll('.btn-tq-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirm(`Are you sure you want to delete test case ${id}?`)) return;

      await fetch(`${TQ_API_BASE}/test-quality/relational/test_cases/${id}`, {
        method: 'DELETE'
      });

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    });
  });
}

function getDefaultMockTestCases(demandId) {
  const suffix = demandId.split('-').pop();
  const demand = tqDemands.find(d => d.demand_id === demandId);
  const titleText = demand ? demand.title : "Unified Platform Core";
  const domainText = demand ? (demand.domain || "Digital Payments") : "Digital Payments";

  return [
    { 
      id: `TC-${suffix}-01`, 
      test_id: `TC-${suffix}-01`, 
      title: `Verify ${titleText} functionality and access validation`, 
      requirement: `${domainText}`, 
      type: "functional-positive", 
      story_id: `${demandId}-US-01`, 
      preconditions: "System initialized", 
      steps: `1. Log in to dashboard\n2. Navigate to ${titleText} component\n3. Verify successful validation status`, 
      expected: `Successful access to ${titleText}`, 
      expected_result: `Successful access to ${titleText}`, 
      priority: "High", 
      risk_level: "High", 
      automation_candidate: "Yes", 
      status: "Approved", 
      traceability: `${demandId}-US-01` 
    },
    { 
      id: `TC-${suffix}-02`, 
      test_id: `TC-${suffix}-02`, 
      title: `Boundary test for ${titleText} transaction processing on invalid inputs`, 
      requirement: `${domainText}`, 
      type: "functional-negative", 
      story_id: `${demandId}-US-02`, 
      preconditions: "Services running", 
      steps: `1. Attempt transaction with empty credentials\n2. Verify system throws error response`, 
      expected: "Validation error returned gracefully", 
      expected_result: "Validation error returned gracefully", 
      priority: "Critical", 
      risk_level: "High", 
      automation_candidate: "Yes", 
      status: "Approved", 
      traceability: `${demandId}-US-02` 
    },
    { 
      id: `TC-${suffix}-03`, 
      test_id: `TC-${suffix}-03`, 
      title: `Performance SLA load check under high user concurrency for ${titleText}`, 
      requirement: `${domainText}`, 
      type: "non-functional", 
      story_id: `${demandId}-US-03`, 
      preconditions: "Mock environment ready", 
      steps: `1. Run load test script with 500 concurrent threads\n2. Verify response time SLA < 200ms`, 
      expected: "No latency degradation observed", 
      expected_result: "No latency degradation observed", 
      priority: "Low", 
      risk_level: "Low", 
      automation_candidate: "No", 
      status: "Draft", 
      traceability: `${demandId}-US-03` 
    }
  ];
}

// -------------------------------------------------------------
// Tab 2: Test Data UI
// -------------------------------------------------------------
function renderTestDataTab(container, demand) {
  // datasets comes from relational test_data table (loaded by loadConsolidatedTQState)
  // testDataProvision.datasets is set by our fixed loader
  const datasets = testDataProvision ? (testDataProvision.datasets || []) : [];

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Test Data Provisioning Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Generates and provisions privacy-compliant, synthetic, or masked datasets mapped to the database schemas.
      </p>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.25rem;">
        <div class="tq-form-group">
          <label>Target Environment</label>
          <select class="tq-input" id="tq-data-env">
            <option value="Development">Development</option>
            <option value="QA" selected>QA</option>
            <option value="UAT">UAT</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
        </div>
        <div class="tq-form-group">
          <label>Data Type Classification</label>
          <select class="tq-input" id="tq-data-type">
            <option value="Synthetic" selected>Synthetic Only</option>
            <option value="Masked">PII Masked</option>
            <option value="Mixed">Mixed Data</option>
          </select>
        </div>
        <div class="tq-form-group">
          <label>Record Count Target</label>
          <input type="number" class="tq-input" id="tq-data-volume" value="250" min="10" max="10000">
        </div>

      </div>

      <div style="display: flex; gap: 0.75rem;">
        <button class="tq-btn" id="btn-tq-data-generate">Generate Dataset</button>
      </div>
    </div>

    <!-- History list -->
    <div class="tq-card">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Dataset Generation History</h5>
      
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem;">Dataset ID</th>
              <th style="padding: 0.5rem;">Environment</th>
              <th style="padding: 0.5rem;">Data Type</th>
              <th style="padding: 0.5rem;">Record Count</th>
              <th style="padding: 0.5rem;">Created Date</th>
              <th style="padding: 0.5rem;">Status</th>
              <th style="padding: 0.5rem; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${datasets.length === 0 ? `
              <tr>
                <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No datasets provisioned. Click "Generate Dataset" above.
                </td>
              </tr>
            ` : datasets.map(d => {
    const dId = d.dataset_id || d.id || d.name || '—';
    const dEnv = d.environment || d.env || '—';
    const dType = d.data_type || d.type || '—';
    const dCount = d.record_count || d.count || '—';
    const dDate = d.created_date || d.created_at || d.provisioned_at || '—';
    const dStatus = d.status || 'Provisioned';
    return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${dId}</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${dEnv}</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${dType}</td>
                <td style="padding: 0.5rem; font-weight: bold;">${dCount}</td>
                <td style="padding: 0.5rem; color: var(--text-muted);">${dDate}</td>
                <td style="padding: 0.5rem;"><span style="color: #4ade80; font-weight: bold;">${dStatus}</span></td>
                <td style="padding: 0.5rem; text-align: right;">
                  <button class="btn-tq-data-download tq-btn" data-id="${dId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text-primary); margin-right: 0.25rem;">Download</button>
                  <button class="btn-tq-data-delete tq-btn" data-id="${dId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5;">Delete</button>
                </td>
              </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Generate Dataset handler
  const genBtn = document.getElementById('btn-tq-data-generate');
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    genBtn.innerHTML = `<span class="loader"></span> Generating...`;

    try {
      const env = document.getElementById('tq-data-env').value;
      const type = document.getElementById('tq-data-type').value;
      const volume = document.getElementById('tq-data-volume').value;

      // Each dataset is saved as its own flat record in the relational table
      const datasetId = `DS-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;
      const newDataset = {
        dataset_id: datasetId,
        environment: env,
        data_type: type,
        record_count: parseInt(volume) || 250,
        created_date: new Date().toLocaleDateString(),
        status: 'Provisioned',
        demand_id: demand.demand_id
      };

      await fetch(`${TQ_API_BASE}/test-quality/relational/test_data/${demand.demand_id}/${datasetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDataset)
      });

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    } catch (err) {
      console.error('Dataset generation error:', err);
      genBtn.disabled = false;
      genBtn.innerHTML = 'Generate Dataset';
      alert('Failed to generate dataset. Please try again.');
    }
  });

  // Download handler
  container.querySelectorAll('.btn-tq-data-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      alert(`Downloading CSV test dataset ${id} in background...`);
    });
  });

  // Delete handler — uses proper DELETE endpoint per record
  container.querySelectorAll('.btn-tq-data-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirm(`Are you sure you want to delete dataset ${id}?`)) return;

      await fetch(`${TQ_API_BASE}/test-quality/relational/test_data/${id}`, {
        method: 'DELETE'
      });

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    });
  });
}


// -------------------------------------------------------------
// Tab 3: Test Execution UI
// -------------------------------------------------------------
function renderTestExecutionTab(container, demand) {
  const cases = generatedSuite ? generatedSuite.test_cases : [];
  const rawExecutions = testRun ? (testRun.results || testRun.executions || []) : [];
  const executions = rawExecutions.map(res => {
    // Find matching test case title from generatedSuite
    let title = res.test_case_title || res.title || res.test_id || '—';
    if (generatedSuite && generatedSuite.test_cases) {
      const matchingCase = generatedSuite.test_cases.find(c => (c.test_id || c.id) === res.test_id);
      if (matchingCase) title = matchingCase.title;
    }
    return {
      id: res.test_id || res.id || '—',
      run_id: testRun.test_run_id || testRun.id || '—',
      test_case_title: title,
      category: res.category || testRun.category || 'System Test',
      environment: testRun.environment || '—',
      run_date: testRun.executed_at || testRun.created_at || '—',
      status: res.status || '—',
      failure_reason: res.failure_reason || res.failure_analysis || null,
      root_cause: res.root_cause || null,
      assignee: res.assignee || null,
      resolution_status: res.resolution_status || null
    };
  });

  // Summary counts — case-insensitive status checks
  const total = executions.length;
  const passed = executions.filter(e => (e.status || '').toLowerCase() === 'passed').length;
  const failed = executions.filter(e => (e.status || '').toLowerCase() === 'failed').length;
  const blocked = executions.filter(e => (e.status || '').toLowerCase() === 'blocked').length;
  const skipped = executions.filter(e => (e.status || '').toLowerCase() === 'skipped').length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;


  container.innerHTML = `
    <!-- Top Configuration card -->
    <div class="tq-card">
      <h4 class="tq-card-title">Test Runner Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Executes active test suites against sandbox deployment servers and records verification results.
      </p>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.25rem;">
        <div class="tq-form-group">
          <label>Execution Category</label>
          <select class="tq-input" id="tq-exec-type">
            <option value="Smoke">Smoke Test</option>
            <option value="Regression" selected>Regression</option>
            <option value="Sanity">Sanity</option>
            <option value="API">API Suite</option>
            <option value="UI">UI Suite</option>
            <option value="Performance">Performance Test</option>
            <option value="Security">Security Test</option>
          </select>
        </div>
        <div class="tq-form-group">
          <label>Target Environment</label>
          <select class="tq-input" id="tq-exec-env">
            <option value="Development">Development</option>
            <option value="QA" selected>QA</option>
            <option value="UAT">UAT</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
        </div>
        <div class="tq-form-group">
          <label>Filter Target Test Cases</label>
          <select class="tq-input" id="tq-exec-filter">
            <option value="All" selected>All Test Cases (${cases.length})</option>
            <option value="High-Risk">High/Critical Risk Only</option>
          </select>
        </div>
      </div>

      <div style="display: flex; gap: 0.75rem;">
        <button class="tq-btn" id="btn-tq-exec-run">
          <span>▶ Execute Test Cases</span>
        </button>
      </div>
    </div>

    <!-- Execution Stats Cards -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;">
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Total Runs</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;">${total}</div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Passed / Failed</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;"><span style="color:#4ade80;">${passed}</span> / <span style="color:#ef4444;">${failed}</span></div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Blocked / Skipped</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;"><span style="color:#fbbf24;">${blocked}</span> / <span style="color:#9ca3af;">${skipped}</span></div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Pass Percentage</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem; color: ${passRate >= 90 ? '#4ade80' : '#fbbf24'};">${passRate}%</div>
      </div>
    </div>

    <!-- Execution Log list -->
    <div class="tq-card">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Execution Runs History</h5>
      
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem;">Run ID</th>
              <th style="padding: 0.5rem;">Test Case</th>
              <th style="padding: 0.5rem;">Category</th>
              <th style="padding: 0.5rem;">Environment</th>
              <th style="padding: 0.5rem;">Execution Date</th>
              <th style="padding: 0.5rem;">Status</th>
              <th style="padding: 0.5rem; text-align: right;">Action Details</th>
            </tr>
          </thead>
          <tbody>
            ${executions.length === 0 ? `
              <tr>
                <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No execution runs found. Click "Execute Test Cases" above to trigger test script checks.
                </td>
              </tr>
            ` : executions.map(e => {
    const eTitle = e.test_case_title || e.title || e.test_name || e.test_case_id || '—';
    const eCategory = e.category || e.execution_type || e.type || '—';
    const eEnv = e.environment || e.env || '—';
    const eDate = e.run_date || e.executed_at || e.created_at || '—';
    const eStatus = e.status || '—';
    const statusColor = eStatus === 'Passed' || eStatus === 'passed' ? '#4ade80' : (eStatus === 'Failed' || eStatus === 'failed' ? '#ef4444' : '#fbbf24');
    return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${e.run_id}</td>
                <td style="padding: 0.5rem;">${eTitle}</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${eCategory}</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${eEnv}</td>
                <td style="padding: 0.5rem; color: var(--text-muted);">${eDate}</td>
                <td style="padding: 0.5rem;">
                  <span style="font-weight: bold; color: ${statusColor};">
                    ${eStatus}
                  </span>
                </td>
                <td style="padding: 0.5rem; text-align: right;">
                  ${eStatus === 'Failed' || eStatus === 'failed' ? `
                    <button class="btn-tq-record-failure tq-btn" data-id="${e.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5;">Triage Log</button>
                  ` : `<span style="font-size: 0.75rem; color: var(--text-muted);">No Action</span>`}
                </td>
              </tr>
            `}).join('')}

          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach handlers
  const execBtn = document.getElementById('btn-tq-exec-run');
  execBtn.addEventListener('click', async () => {
    execBtn.disabled = true;
    execBtn.innerHTML = `<span class="loader"></span> Executing Agent Suite...`;

    if (!generatedSuite || !generatedSuite.test_cases || generatedSuite.test_cases.length === 0) {
      alert("No generated test cases to execute! Generate tests first (Tab 1).");
      execBtn.disabled = false;
      execBtn.innerHTML = `▶ Execute Test Cases`;
      return;
    }

    const type = document.getElementById('tq-exec-type').value;
    const env = document.getElementById('tq-exec-env').value;

    try {
      const suiteId = generatedSuite.suite_id || generatedSuite.id || `TST-${demand.demand_id.split('-').pop()}-1`;
      const dataProvId = testDataProvision ? (testDataProvision.data_provision_id || testDataProvision.id) : null;

      const payload = {
        suite_id: suiteId,
        demand_id: demand.demand_id,
        data_provision_id: dataProvId,
        environment: env,
        impact_scope: [],
        execution_mode: type.toLowerCase()
      };

      const response = await fetch(`${TQ_API_BASE}/test-quality/test-execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Server error ${response.status}`);
      }

      const runRecord = await response.json();
      const failedResults = (runRecord.results || []).filter(r => (r.status || '').toLowerCase() === 'failed');

      if (failedResults.length > 0) {
        // Automatically trigger defect triage for these failures
        const triagePayload = {
          test_run_id: runRecord.test_run_id,
          demand_id: demand.demand_id,
          defect_ids: failedResults.map(r => r.test_id || r.id),
          code_ownership_map: {}
        };

        const triageResponse = await fetch(`${TQ_API_BASE}/test-quality/defect-triage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(triagePayload)
        });

        if (!triageResponse.ok) {
          console.warn("Automated defect triage warning:", await triageResponse.text());
        }
      }

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    } catch (err) {
      console.error('Test execution run error:', err);
      alert(`Execution run failed: ${err.message}`);
      execBtn.disabled = false;
      execBtn.innerHTML = `▶ Execute Test Cases`;
    }
  });

  // Triage log click
  container.querySelectorAll('.btn-tq-record-failure').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const exec = executions.find(e => e.id === id);
      if (!exec) return;

      const newReason = prompt("Record failure reason:", exec.failure_reason || "API response mismatch");
      if (newReason === null) return;
      exec.failure_reason = newReason;
      exec.root_cause = prompt("Record root cause:", exec.root_cause || "Incorrect state checker");
      exec.assignee = prompt("Assignee Employee:", exec.assignee || "Sarah Jenkins");
      exec.resolution_status = prompt("Resolution Status:", exec.resolution_status || "In-Progress");

      if (testRun && testRun.results) {
        const matchingResult = testRun.results.find(r => r.test_id === id);
        if (matchingResult) {
          matchingResult.failure_reason = exec.failure_reason;
          matchingResult.root_cause = exec.root_cause;
          matchingResult.assignee = exec.assignee;
          matchingResult.resolution_status = exec.resolution_status;
        }

        await fetch(`${TQ_API_BASE}/test-quality/relational/test_execution/${demand.demand_id}/${testRun.test_run_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testRun)
        });
      }

      await loadConsolidatedTQState(demand.demand_id);
      renderTQDetailsPanel();
    });
  });
}

// -------------------------------------------------------------
// Tab 4: Defect Triage UI
// -------------------------------------------------------------
async function renderDefectTriageTab(container, demand) {
  // Fetch defects from DB relational defects table
  const res = await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}`);
  let defects = res.ok ? await res.json() : [];

  container.innerHTML = `
    <!-- Top action card -->
    <div class="tq-card">
      <h4 class="tq-card-title">Defect Triage Control Centre</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Review open software bugs, prioritize risks, reassign developers, and close fixed records.
      </p>

      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <button class="tq-btn" id="btn-tq-defect-add">+ Create Defect</button>
        <button class="tq-btn" id="btn-tq-defect-merge" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); color: var(--text-primary);">Merge Duplicates</button>
      </div>
    </div>

    <!-- Defects Grid List -->
    <div class="tq-card">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Active Defects Queue</h5>
      
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem; width: 30px;">Select</th>
              <th style="padding: 0.5rem; width: 100px;">Defect ID</th>
              <th style="padding: 0.5rem;">Summary</th>
              <th style="padding: 0.5rem;">Priority</th>
              <th style="padding: 0.5rem;">Severity</th>
              <th style="padding: 0.5rem;">Developer</th>
              <th style="padding: 0.5rem;">Status</th>
              <th style="padding: 0.5rem; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${defects.length === 0 ? `
              <tr>
                <td colspan="8" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No open defects found for this demand.
                </td>
              </tr>
            ` : defects.map(d => {
              const defId = d.defect_id || d.id || 'BUG-—';
              const defSummary = d.summary || d.cluster || 'Triaged Defect';
              const defDesc = d.description || d.root_cause_hint || '';
              const defPriority = d.priority || 'Medium';
              const defSeverity = d.severity || 'Medium';
              const defAssignee = d.assignee || d.assigned_to || 'Unassigned';
              const defStatus = d.status || d.recommended_action || 'Open';
              return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem;"><input type="checkbox" class="chk-defect-merge" value="${defId}"></td>
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${defId}</td>
                <td style="padding: 0.5rem;">
                  <strong>${defSummary}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${defDesc}</div>
                </td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${defPriority}">${defPriority}</span></td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${defSeverity}">${defSeverity}</span></td>
                <td style="padding: 0.5rem; color: var(--text-secondary); font-weight: 600;">${defAssignee}</td>
                <td style="padding: 0.5rem;">
                  <span style="font-size: 0.75rem; font-weight: bold; color: ${defStatus === 'Closed' || defStatus === 'close' || defStatus === 'resolved' ? '#4ade80' : '#ef4444'};">
                    ${defStatus.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 0.5rem; text-align: right; white-space: nowrap;">
                  <button class="btn-tq-defect-assign tq-btn" data-id="${defId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text-primary); margin-right: 0.25rem;">Reassign</button>
                  <button class="btn-tq-defect-close tq-btn" data-id="${defId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(74, 222, 128, 0.15); color: #4ade80;">Close</button>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach handlers
  document.getElementById('btn-tq-defect-add').addEventListener('click', async () => {
    const summary = prompt("Enter bug summary:");
    if (!summary) return;
    const severity = prompt("Enter Severity (Blocker, Major, Minor, Cosmetic):", "Major");
    const priority = prompt("Enter Priority (Critical, High, Medium, Low):", "High");

    const mockId = `BUG-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;
    const newDefect = {
      id: mockId,
      summary: summary,
      description: "Manually registered QA bug report",
      priority: priority,
      severity: severity,
      assignee: "Sarah Jenkins",
      related_test: "Manual Test Case",
      status: "Open",
      created_at: new Date().toISOString()
    };

    await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}/${mockId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDefect)
    });

    renderActiveTabContent(demand);
  });

  document.getElementById('btn-tq-defect-merge').addEventListener('click', async () => {
    const selected = Array.from(container.querySelectorAll('.chk-defect-merge:checked')).map(chk => chk.value);
    if (selected.length < 2) {
      alert("Please select at least two defects to merge.");
      return;
    }

    if (confirm(`Are you sure you want to merge defects: ${selected.join(', ')}?`)) {
      // Retain first defect, close others
      const survivorId = selected[0];
      const survivor = defects.find(d => d.id === survivorId);
      survivor.summary = `[Merged] ${survivor.summary}`;

      for (let i = 1; i < selected.length; i++) {
        const idToClose = selected[i];
        const defectToClose = defects.find(d => d.id === idToClose);
        defectToClose.status = 'Closed';
        defectToClose.description += ` (Merged into ${survivorId})`;
        await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}/${idToClose}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defectToClose)
        });
      }

      await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}/${survivorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(survivor)
      });

      alert("Defects merged successfully!");
      renderActiveTabContent(demand);
    }
  });

  container.querySelectorAll('.btn-tq-defect-assign').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const defect = defects.find(d => d.id === id);
      const newDev = prompt("Enter developer email/name:", defect.assignee);
      if (newDev === null) return;
      defect.assignee = newDev;
      defect.status = 'Assigned';

      await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defect)
      });

      renderActiveTabContent(demand);
    });
  });

  container.querySelectorAll('.btn-tq-defect-close').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const defect = defects.find(d => d.id === id);
      defect.status = 'Closed';

      await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defect)
      });

      renderActiveTabContent(demand);
    });
  });
}

function getDefaultMockDefects(demandId) {
  const suffix = demandId.split('-').pop();
  return [
    { id: `BUG-${suffix}-01`, summary: "Payment authorization validation returns 500 error", description: "Authorization service fails transaction verification payload bounds check.", priority: "Critical", severity: "Blocker", assignee: "Sarah Jenkins", related_test: `TC-${suffix}-01`, status: "Open", created_at: new Date().toISOString() },
    { id: `BUG-${suffix}-02`, summary: "UI points calculation text overlaps in mobile view", description: "Layout boundaries overlap inside transaction sidebar panel.", priority: "Medium", severity: "Cosmetic", assignee: "Dave Miller", related_test: `TC-${suffix}-03`, status: "Open", created_at: new Date().toISOString() }
  ];
}

// -------------------------------------------------------------
// Tab 5: Security Testing UI
// -------------------------------------------------------------
async function renderSecurityScanningTab(container, demand) {
  // Fetch security findings from DB
  const res = await fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demand.demand_id}`);
  let findings = res.ok ? await res.json() : [];

  container.innerHTML = `
    <!-- Top action card -->
    <div class="tq-card">
      <h4 class="tq-card-title">Security & Remediation Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Executes SAST/DAST audits and secrets scanner triggers, providing recommended patch alerts.
      </p>

      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <button class="tq-btn" id="btn-tq-sec-scan">🛡 Run Security Audit Scan</button>
        <button class="tq-btn" id="btn-tq-sec-add" style="background: rgba(255,255,255,0.05); color: var(--text-primary);">+ Add Security Finding</button>
      </div>
    </div>

    <!-- Active Findings Queue -->
    <div class="tq-card">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">AppSec Vulnerabilities Detected</h5>
      
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem; width: 100px;">Finding ID</th>
              <th style="padding: 0.5rem;">Category</th>
              <th style="padding: 0.5rem;">Severity</th>
              <th style="padding: 0.5rem;">Description</th>
              <th style="padding: 0.5rem;">Remediation Patch</th>
              <th style="padding: 0.5rem;">Status</th>
              <th style="padding: 0.5rem; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${findings.length === 0 ? `
              <tr>
                <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No security vulnerabilities detected.
                </td>
              </tr>
            ` : findings.map(f => {
              const findId = f.finding_id || f.id || 'SEC-—';
              const findCat = f.category || 'Security Finding';
              const findSev = f.severity || 'Medium';
              const findDesc = f.description || '';
              const findFix = f.draft_fix || f.suggested_fix || 'No suggested fix';
              const findStatus = f.status || 'Open';
              return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${findId}</td>
                <td style="padding: 0.5rem; font-weight: 600;">${findCat}</td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${findSev}">${findSev}</span></td>
                <td style="padding: 0.5rem; color: var(--text-secondary); max-width: 250px;">${findDesc}</td>
                <td style="padding: 0.5rem; color: #818cf8; font-family: ui-monospace, monospace; font-size: 0.75rem;">${findFix}</td>
                <td style="padding: 0.5rem;">
                  <span style="font-size: 0.75rem; font-weight: bold; color: ${findStatus === 'Closed' || findStatus === 'closed' ? '#4ade80' : '#ef4444'};">
                    ${findStatus.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 0.5rem; text-align: right; white-space: nowrap;">
                  <button class="btn-tq-sec-edit tq-btn" data-id="${findId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text-primary); margin-right: 0.25rem;">Edit</button>
                  <button class="btn-tq-sec-close tq-btn" data-id="${findId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(74, 222, 128, 0.15); color: #4ade80;">Resolve</button>
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Scan trigger handler
  const secScanBtn = document.getElementById('btn-tq-sec-scan');
  if (secScanBtn) {
    secScanBtn.addEventListener('click', async () => {
      secScanBtn.disabled = true;
      secScanBtn.innerHTML = `<span class="loader"></span> Running Security Scan...`;

      try {
        const planId = generatedSuite ? (generatedSuite.plan_id || generatedSuite.id) : `PL-${demand.demand_id.split('-').pop()}-1`;
        const pipelineId = `PL-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;

        const payload = {
          demand_id: demand.demand_id,
          plan_id: planId,
          component_ids: ["source-code", "database-configurations"],
          pipeline_run_id: pipelineId,
          scan_types: ["SAST", "DAST", "Secrets"],
          vulnerability_db_version: "v2026.3.1"
        };

        const response = await fetch(`${TQ_API_BASE}/test-quality/security-testing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `Server error ${response.status}`);
        }

        await loadConsolidatedTQState(demand.demand_id);
        renderTQDetailsPanel();
      } catch (err) {
        console.error('Security scan execution error:', err);
        alert(`Security scan failed: ${err.message}`);
        secScanBtn.disabled = false;
        secScanBtn.innerHTML = `🛡 Run Security Audit Scan`;
      }
    });
  }

  // Handlers
  document.getElementById('btn-tq-sec-add').addEventListener('click', async () => {
    const cat = prompt("Enter vulnerability category (e.g. SQL Injection, Secrets Leak):");
    if (!cat) return;
    const severity = prompt("Enter Severity (Critical, High, Medium, Low, Informational):", "High");
    const desc = prompt("Enter short description:");

    const mockId = `SEC-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;
    const newFinding = {
      finding_id: mockId,
      component_id: "source-code",
      category: cat,
      severity: severity.toLowerCase(),
      location: "src/api/auth.py",
      exploitable: true,
      description: desc || "Auto detected vulnerability during sandbox scan triggers.",
      draft_fix: "Check parameter bounds checks and sanitize input string templates.",
      status: "Open"
    };

    await fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demand.demand_id}/${mockId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFinding)
    });

    renderActiveTabContent(demand);
  });

  container.querySelectorAll('.btn-tq-sec-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const finding = findings.find(f => (f.finding_id || f.id) === id);
      if (!finding) return;
      const newDesc = prompt("Edit Description:", finding.description);
      if (newDesc === null) return;
      finding.description = newDesc;

      await fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demand.demand_id}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding)
      });

      renderActiveTabContent(demand);
    });
  });

  container.querySelectorAll('.btn-tq-sec-close').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const finding = findings.find(f => (f.finding_id || f.id) === id);
      if (!finding) return;
      finding.status = 'Closed';

      await fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demand.demand_id}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding)
      });

      renderActiveTabContent(demand);
    });
  });
}

function getDefaultMockFindings(demandId) {
  const suffix = demandId.split('-').pop();
  return [
    { id: `SEC-${suffix}-01`, category: "Hardcoded API Token", severity: "High", description: "AWS API secret key token found hardcoded in ledger deployment script config.", suggested_fix: "Migrate to environment config lookup variables", status: "Open" },
    { id: `SEC-${suffix}-02`, category: "XSS Vulnerability", severity: "Medium", description: "Vulnerability in loyalty points view display allows scripting tags payload injection.", suggested_fix: "HTML encode output balance templates", status: "Open" }
  ];
}

// -------------------------------------------------------------
// Tab 6: Traceability Matrix UI
// -------------------------------------------------------------
async function renderTraceabilityTab(container, demand) {
  // Fetch traceability matrix records
  const res = await fetch(`${TQ_API_BASE}/test-quality/relational/traceability/${demand.demand_id}`);
  let traceabilityList = res.ok ? await res.json() : [];

  if (traceabilityList.length > 0) {
    traceabilityMatrix = traceabilityList[0];
  } else {
    traceabilityMatrix = null;
  }

  const matrix = traceabilityMatrix;

  if (!matrix) {
    const hasSuite = !!generatedSuite;
    const hasExec = !!testRun;
    const canBuild = hasSuite && hasExec;

    container.innerHTML = `
      <div class="tq-card" style="text-align: center; padding: 3rem 2rem;">
        <h4 class="tq-card-title">Requirement Traceability Matrix</h4>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.5rem 0;">
          Builds a live traceability matrix linking User Stories to Test Cases, Execution Runs, and open defects.
        </p>
        ${!canBuild ? `
          <div style="padding: 0.75rem; background: rgba(239, 68, 68, 0.08); border: 1px solid #ef4444; border-radius: var(--radius-sm); font-size: 0.82rem; color: #fca5a5; display: inline-block; margin-bottom: 1rem; text-align: left;">
            <strong>Prerequisites Missing:</strong>
            <ul style="margin: 0.25rem 0 0 0; padding-left: 1.25rem;">
              ${!hasSuite ? '<li>Test suite has not been generated yet (Tab 1).</li>' : ''}
              ${!hasExec ? '<li>Test runs have not been executed yet (Tab 3).</li>' : ''}
            </ul>
          </div>
          <div>
            <button class="tq-btn" id="btn-tq-trc-build" disabled style="opacity: 0.5; cursor: not-allowed;">
              <span>Build Traceability Matrix</span>
            </button>
          </div>
        ` : `
          <div>
            <button class="tq-btn" id="btn-tq-trc-build">
              <span>Build Traceability Matrix</span>
            </button>
          </div>
        `}
      </div>
    `;

    if (canBuild) {
      document.getElementById('btn-tq-trc-build').addEventListener('click', async () => {
        const buildBtn = document.getElementById('btn-tq-trc-build');
        buildBtn.disabled = true;
        buildBtn.innerHTML = `<span class="loader"></span> Building Matrix...`;

        try {
          const suiteId = generatedSuite ? (generatedSuite.suite_id || generatedSuite.id) : '';
          const testRunId = testRun ? (testRun.test_run_id || testRun.id) : '';

          const payload = {
            demand_id: demand.demand_id,
            suite_id: suiteId,
            test_run_id: testRunId,
            defect_ids: []
          };

          const response = await fetch(`${TQ_API_BASE}/test-quality/traceability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || `Server error ${response.status}`);
          }

          await loadConsolidatedTQState(demand.demand_id);
          renderTQDetailsPanel();
        } catch (err) {
          console.error('Traceability matrix generation error:', err);
          alert(`Failed to build traceability matrix: ${err.message}`);
          buildBtn.disabled = false;
          buildBtn.innerHTML = `<span>Build Traceability Matrix</span>`;
        }
      });
    }
    return;
  }

  const entries = matrix.entries || matrix.rows || [];

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Requirement Traceability Matrix
        <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">Story → Test → Run → Bug</span>
      </h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Builds a live verification matrix. Rows highlighted in red indicate coverage gaps (e.g. missing test scripts or executions).
      </p>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem;">Requirement Feature</th>
              <th style="padding: 0.5rem;">User Story ID</th>
              <th style="padding: 0.5rem;">Linked Task</th>
              <th style="padding: 0.5rem;">Test Case ID</th>
              <th style="padding: 0.5rem;">Run Execution</th>
              <th style="padding: 0.5rem;">Active Defect</th>
              <th style="padding: 0.5rem;">Target Release</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(r => {
              const story = r.story_id || r.story || '—';
              const req = r.requirement || (r.coverage_status ? r.coverage_status.charAt(0).toUpperCase() + r.coverage_status.slice(1) : 'User Story');
              const task = r.task || '—';
              const testId = r.test_ids ? r.test_ids.join(', ') : (r.test_id || '—');
              
              let execution = '—';
              if (r.execution) {
                execution = r.execution;
              } else if (r.passing !== undefined) {
                execution = r.passing ? 'Passed' : 'Failed';
              }
              
              const defect = r.defect_ids ? (r.defect_ids.length > 0 ? r.defect_ids.join(', ') : 'None') : (r.defect || '—');
              const release = r.release_id || '—';

              const isMissing = testId === 'Missing' || execution === 'Missing' || r.coverage_status === 'uncovered';
              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); ${isMissing ? 'background: rgba(239,68,68,0.04);' : ''}">
                  <td style="padding: 0.5rem; font-weight: 600;">${req}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${story}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${task}</td>
                  <td style="padding: 0.5rem; font-weight: bold; color: ${testId === 'Missing' ? '#ef4444' : 'var(--color-brand)'};">${testId}</td>
                  <td style="padding: 0.5rem; font-weight: 700; color: ${execution === 'Passed' ? '#4ade80' : (execution === 'Failed' ? '#ef4444' : '#f87171')};">${execution}</td>
                  <td style="padding: 0.5rem; font-weight: 700; color: ${defect !== 'None' ? '#ef4444' : 'var(--text-muted)'};">${defect}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${release}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
async function triggerQualityGateEvaluation(demandId) {
  try {
    const suiteId = generatedSuite ? (generatedSuite.suite_id || generatedSuite.id) : '';
    const testRunId = testRun ? (testRun.test_run_id || testRun.id) : '';
    const triageId = defectTriage ? (defectTriage.triage_id || defectTriage.id) : '';
    const securityTestId = securityScan ? (securityScan.security_test_id || securityScan.id) : '';
    const traceabilityId = traceabilityMatrix ? (traceabilityMatrix.traceability_id || traceabilityMatrix.id) : '';

    const payload = {
      demand_id: demandId,
      test_run_id: testRunId,
      triage_id: triageId,
      security_test_id: securityTestId,
      traceability_id: traceabilityId,
      quality_policy: {
        min_pass_rate_pct: 95.0,
        max_open_critical_defects: 0,
        max_open_high_security_findings: 0,
        min_coverage_pct: 90.0
      }
    };

    const response = await fetch(`${TQ_API_BASE}/test-quality/quality-gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Server error ${response.status}`);
    }

    await loadConsolidatedTQState(demandId);
  } catch (err) {
    console.error('Quality gate evaluation error:', err);
    alert(`Failed to evaluate quality gate: ${err.message}`);
  }
}

// -------------------------------------------------------------
// Tab 7: Quality Gate UI
// -------------------------------------------------------------
async function renderQualityGateTab(container, demand) {
  // Fetch gate records
  const res = await fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demand.demand_id}`);
  let gateList = res.ok ? await res.json() : [];

  if (gateList.length > 0) {
    qualityGate = gateList[0];
  } else {
    qualityGate = null;
  }

  const qg = qualityGate;

  if (!qg) {
    const hasSuite = !!generatedSuite;
    const hasExec = !!testRun;
    const canEvaluate = hasSuite && hasExec;

    container.innerHTML = `
      <div class="tq-card" style="text-align: center; padding: 3rem 2rem;">
        <h4 class="tq-card-title">Quality Gate Policies & Verdict</h4>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.5rem 0;">
          Reviews release policy thresholds and issues automatic pass/fail logs based on test execution and security scans.
        </p>
        ${!canEvaluate ? `
          <div style="padding: 0.75rem; background: rgba(239, 68, 68, 0.08); border: 1px solid #ef4444; border-radius: var(--radius-sm); font-size: 0.82rem; color: #fca5a5; display: inline-block; margin-bottom: 1rem; text-align: left;">
            <strong>Prerequisites Missing:</strong>
            <ul style="margin: 0.25rem 0 0 0; padding-left: 1.25rem;">
              ${!hasSuite ? '<li>Test suite has not been generated yet (Tab 1).</li>' : ''}
              ${!hasExec ? '<li>Test runs have not been executed yet (Tab 3).</li>' : ''}
            </ul>
          </div>
          <div>
            <button class="tq-btn" id="btn-tq-qg-evaluate" disabled style="opacity: 0.5; cursor: not-allowed;">
              <span>⚖ Evaluate Policy</span>
            </button>
          </div>
        ` : `
          <div>
            <button class="tq-btn" id="btn-tq-qg-evaluate">
              <span>⚖ Evaluate Policy</span>
            </button>
          </div>
        `}
      </div>
    `;

    if (canEvaluate) {
      document.getElementById('btn-tq-qg-evaluate').addEventListener('click', async () => {
        const btn = document.getElementById('btn-tq-qg-evaluate');
        btn.disabled = true;
        btn.innerHTML = `<span class="loader"></span> Evaluating...`;
        await triggerQualityGateEvaluation(demand.demand_id);
        renderActiveTabContent(demand);
      });
    }
    return;
  }

  const isPass = qg.verdict === 'PASS' || qg.verdict === 'pass';
  const isFail = qg.verdict === 'FAIL' || qg.verdict === 'fail';

  let verdictBg = 'rgba(74, 222, 128, 0.06)';
  let verdictBorder = '#4ade80';
  let verdictColor = '#4ade80';
  if (isFail) {
    verdictBg = 'rgba(239, 68, 68, 0.06)';
    verdictBorder = '#ef4444';
    verdictColor = '#fca5a5';
  } else if (qg.verdict === 'CONDITIONAL_PASS') {
    verdictBg = 'rgba(251, 191, 36, 0.06)';
    verdictBorder = '#fbbf24';
    verdictColor = '#fcd34d';
  }

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Quality Gate Policies & Verdict</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Reviews the release thresholds and issues automatic pass/fail logs based on test and AppSec execution records.
      </p>

      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
        <button class="tq-btn" id="btn-tq-qg-evaluate">⚖ Re-evaluate Policy</button>
        <button class="tq-btn" id="btn-tq-qg-approve" style="background: rgba(74, 222, 128, 0.15); color: #4ade80;">Approve Gate Override</button>
        <button class="tq-btn" id="btn-tq-qg-reject" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5;">Reject Release</button>
        <div style="flex: 1;"></div>
        <button class="tq-btn" id="btn-tq-proceed-release" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700;"
          onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(16,185,129,0.45)';"
          onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(16,185,129,0.35)';"
        >Proceed to Release &amp; Change →</button>
      </div>

      <!-- Verdict Banner -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem;border-radius:8px;background:${verdictBg};border:1px solid ${verdictBorder};margin-bottom:1.5rem;">
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.1em;margin-bottom:0.25rem;">Gate ID: ${qg.gate_id}</div>
          <div style="font-size:2.5rem;font-weight:900;color:${verdictColor};line-height:1;">${qg.verdict.toUpperCase()}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.5rem;">Release ${isPass ? 'APPROVED — all criteria checked.' : 'BLOCKED — threshold breaches detected.'}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:3rem;font-weight:900;color:${verdictColor};">${qg.score}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Score / 100</div>
        </div>
      </div>

      <!-- Checks Table -->
      <h5 style="margin:0 0 0.75rem 0;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Evaluation Metrics</h5>
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:1.25rem;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-color);text-align:left;color:var(--text-muted);">
            <th style="padding:0.5rem;">Threshold Policy</th>
            <th style="padding:0.5rem;">Target Threshold</th>
            <th style="padding:0.5rem;">Actual Value</th>
            <th style="padding:0.5rem;">Status Result</th>
          </tr>
        </thead>
        <tbody>
          ${(qg.checks || []).map(c => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
              <td style="padding:0.5rem;font-weight:600;color:var(--text-primary);">${(c.check || '').replace(/_/g, ' ')}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${c.threshold || ''}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${c.actual || ''}</td>
              <td style="padding:0.5rem;">
                <span style="color:${c.result === 'passed' || c.result === 'pass' ? '#4ade80' : '#ef4444'};font-weight:700;">${(c.result || '').toUpperCase()}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- AI recommendations block -->
      <div style="padding:0.75rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;margin-bottom:1.25rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:0.5rem;">AI Recommendation</div>
        <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">${qg.gap_explanation || 'No recommendation issues identified.'}</p>
      </div>

      <!-- Audit History -->
      ${qg.history && qg.history.length > 0 ? `
      <h5 style="margin:0 0 0.75rem 0;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Approval Audit History</h5>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.4rem;">Action Event</th>
              <th style="padding: 0.4rem;">Timestamp</th>
              <th style="padding: 0.4rem;">Verdict</th>
              <th style="padding: 0.4rem;">Decision/Comments</th>
              <th style="padding: 0.4rem;">User</th>
            </tr>
          </thead>
          <tbody>
            ${qg.history.map(h => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                <td style="padding: 0.4rem; font-weight: 600;">${h.event}</td>
                <td style="padding: 0.4rem; color: var(--text-muted);">${h.timestamp}</td>
                <td style="padding: 0.4rem; font-weight: bold; color: ${h.status === 'PASS' || h.status === 'pass' ? '#4ade80' : '#ef4444'};">${h.status}</td>
                <td style="padding: 0.4rem; color: var(--text-secondary);">${h.decision}</td>
                <td style="padding: 0.4rem; color: var(--text-muted);">${h.user}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}
    </div>
  `;

  // Attach handlers
  document.getElementById('btn-tq-qg-evaluate').addEventListener('click', async () => {
    const btn = document.getElementById('btn-tq-qg-evaluate');
    btn.disabled = true;
    btn.innerHTML = `<span class="loader"></span> Re-evaluating...`;
    await triggerQualityGateEvaluation(demand.demand_id);
    renderActiveTabContent(demand);
  });

  document.getElementById('btn-tq-qg-approve').addEventListener('click', async () => {
    const comments = prompt("Enter approval override comments/justification:");
    if (comments === null) return;

    if (!qg.history) qg.history = [];
    qg.verdict = 'PASS';
    qg.score = 100;
    qg.history.push({
      event: "Approve Gate Override",
      timestamp: new Date().toLocaleString(),
      status: "PASS",
      decision: comments || "Override approved by Release Manager",
      user: "Release-Manager"
    });

    await fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demand.demand_id}/${qg.gate_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(qg)
    });

    renderActiveTabContent(demand);
  });

  document.getElementById('btn-tq-qg-reject').addEventListener('click', async () => {
    const comments = prompt("Enter rejection comments:");
    if (comments === null) return;

    if (!qg.history) qg.history = [];
    qg.verdict = 'FAIL';
    qg.score = 0;
    qg.history.push({
      event: "Reject Gate",
      timestamp: new Date().toLocaleString(),
      status: "FAIL",
      decision: comments || "Release rejected due to unresolved issues",
      user: "Release-Manager"
    });

    await fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demand.demand_id}/${qg.gate_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(qg)
    });

    renderActiveTabContent(demand);
  });

  const proceedBtn = document.getElementById('btn-tq-proceed-release');
  if (proceedBtn) {
    proceedBtn.addEventListener('click', () => {
      if (window.switchStage) {
        window.switchStage('release-change');
      } else {
        window.location.hash = 'release-change';
      }
    });
  }
}

async function refreshTQSidebar() {
  try {
    const resDemands = await fetch(`${TQ_API_BASE}/demands`);
    if (!resDemands.ok) return;
    tqDemands = await resDemands.json();

    const resConsolidated = await fetch(`${TQ_API_BASE}/test-quality/consolidated`);
    if (!resConsolidated.ok) return;
    const consolidatedStates = await resConsolidated.json();

    const activeDemandIds = consolidatedStates.map(record => record.demand_id);
    renderTQQueues(activeDemandIds);
  } catch (err) {
    console.error("Error refreshing sidebar queues:", err);
  }
}

async function loadConsolidatedTQState(demandId) {
  try {
    const res = await fetch(`${TQ_API_BASE}/test-quality/consolidated/${demandId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const record = await res.json();

    // Set memory state from consolidated record (base)
    generatedSuite = record.test_generation || null;
    testDataProvision = record.test_data || null;
    testRun = record.test_execution || null;
    defectTriage = record.defect_triage || null;
    securityScan = record.security_testing || null;
    traceabilityMatrix = record.traceability || null;
    qualityGate = record.quality_gate || null;
  } catch (err) {
    console.error("Error loading consolidated TQ state:", err);
  }

  // ── Also read from relational tables for live UI state ──────────────────
  // These tables are written directly by the UI and may have more recent data
  // than the consolidated snapshot.
  try {
    const [casesRes, execRes, defectsRes, secRes, gateRes] = await Promise.all([
      fetch(`${TQ_API_BASE}/test-quality/relational/test_cases/${demandId}`),
      fetch(`${TQ_API_BASE}/test-quality/relational/test_execution/${demandId}`),
      fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demandId}`),
      fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demandId}`),
      fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demandId}`)
    ]);

    // Test Cases → merge into generatedSuite
    if (casesRes.ok) {
      const casesData = await casesRes.json();
      if (casesData.length > 0) {
        if (!generatedSuite) generatedSuite = {};
        // casesData items are the saved payload objects
        generatedSuite.test_cases = casesData;
      }
    }

    // Fetch test_data relational records and map to testDataProvision.datasets
    const dataRes = await fetch(`${TQ_API_BASE}/test-quality/relational/test_data/${demandId}`);
    if (dataRes.ok) {
      const dataRecords = await dataRes.json();
      if (dataRecords.length > 0) {
        if (!testDataProvision) testDataProvision = {};
        const allDatasets = [];
        for (const rec of dataRecords) {
          if (Array.isArray(rec.datasets)) {
            // Old wrapped format: {datasets: [...items]} — flatten
            for (const ds of rec.datasets) {
              allDatasets.push({
                dataset_id: ds.dataset_id || ds.id || ds.name,
                name: ds.dataset_id || ds.id || ds.name,
                environment: ds.environment || ds.env || '—',
                data_type: ds.data_type || ds.type || '—',
                record_count: ds.record_count || ds.count || '—',
                created_date: ds.created_date || ds.created_at || '—',
                status: ds.status || 'Provisioned',
                schemas: ds.schemas || ''
              });
            }
          } else if (rec.dataset_id || rec.environment) {
            // New flat format: each record IS a dataset
            allDatasets.push({
              dataset_id: rec.dataset_id || rec.id || rec.name,
              name: rec.dataset_id || rec.id || rec.name,
              environment: rec.environment || rec.env || '—',
              data_type: rec.data_type || rec.type || '—',
              record_count: rec.record_count || rec.count || '—',
              created_date: rec.created_date || rec.created_at || '—',
              status: rec.status || 'Provisioned',
              schemas: rec.schemas || ''
            });
          }
        }
        if (allDatasets.length > 0) {
          testDataProvision.datasets = allDatasets;
        }
      }
    }

    // Test Executions → merge into testRun
    if (execRes.ok) {
      const execData = await execRes.json();
      if (execData.length > 0) {
        // Each saved record is {executions: [...], test_run_id: ...}
        // Flatten all executions across all saved run records
        const allExecs = [];
        for (const record of execData) {
          const execs = record.executions || record.results || [];
          if (Array.isArray(execs)) {
            allExecs.push(...execs);
          } else if (typeof record.status === 'string') {
            // Individual execution result row
            allExecs.push(record);
          }
        }
        if (allExecs.length > 0) {
          if (!testRun) testRun = {};
          testRun.executions = allExecs;
        }
      }
    }

    // Defects → merge into defectTriage
    if (defectsRes.ok) {
      const defectsData = await defectsRes.json();
      if (defectsData.length > 0) {
        defectTriage = defectTriage || {};
        defectTriage.defects = defectsData;
      }
    }

    // Security Findings → merge into securityScan
    if (secRes.ok) {
      const secData = await secRes.json();
      if (secData.length > 0) {
        securityScan = securityScan || {};
        securityScan.findings = secData;
      }
    }

    // Quality Gate → merge
    if (gateRes.ok) {
      const gateData = await gateRes.json();
      if (gateData.length > 0) {
        qualityGate = gateData[gateData.length - 1]; // use latest
      }
    }
  } catch (err) {
    console.warn("Error loading relational TQ state (non-fatal):", err);
  }
}


function renderTQSidebarAudit() {
  // Checklist completely removed from UI
}
