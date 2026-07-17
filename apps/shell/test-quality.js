const TQ_API_BASE = 'http://127.0.0.1:8000/api';

let tqDemands = [];
let tqSelectedDemandId = null;
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
window.renderTestQualityScreen = function() {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <!-- Left Sidebar: Demands Queue & Test & Quality Queue -->
      <aside class="sidebar" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 100%; overflow: hidden; width: 300px;">
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
        </div>
      </aside>
      
      <!-- Right Panel: Capabilities Tabbed View -->
      <main class="details-panel" id="tq-panel-container" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);"></main>
    </div>
  `;

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
        padding-right: 0.25rem;
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
      .demand-item.active { background: rgba(99, 102, 241, 0.15); border-left: 3px solid var(--color-brand); }
    `;
    document.head.appendChild(style);
  }
}

window.fetchTestQualityData = async function() {
  try {
    const resDemands = await fetch(`${TQ_API_BASE}/demands`);
    if (!resDemands.ok) throw new Error(`HTTP Error: ${resDemands.status}`);
    tqDemands = await resDemands.json();

    const resConsolidated = await fetch(`${TQ_API_BASE}/test-quality/consolidated`);
    if (!resConsolidated.ok) throw new Error(`HTTP Error: ${resConsolidated.status}`);
    const consolidatedStates = await resConsolidated.json();

    const activeDemandIds = consolidatedStates.map(record => record.demand_id);
    renderTQQueues(activeDemandIds);

    const approvedDemands = tqDemands.filter(d => d.status === 'approved');
    const pendingApproved = approvedDemands.filter(d => !activeDemandIds.includes(d.demand_id));
    const activeDemands = approvedDemands.filter(d => activeDemandIds.includes(d.demand_id));

    if (tqSelectedDemandId === null) {
      if (activeDemands.length > 0) {
        selectTQDemand(activeDemands[0].demand_id);
      } else if (pendingApproved.length > 0) {
        selectTQDemand(pendingApproved[0].demand_id);
      } else if (tqDemands.length > 0) {
        selectTQDemand(tqDemands[0].demand_id);
      } else {
        renderEmptyTQDetails();
      }
    } else {
      selectTQDemand(tqSelectedDemandId);
    }
  } catch (err) {
    console.error("Failed to fetch demands for Test & Quality:", err);
    document.getElementById('tq-demand-list-container').innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        Failed to load demands queue.
      </li>
    `;
  }
}

function renderTQQueues(activeDemandIds) {
  const pendingContainer = document.getElementById('tq-demand-list-container');
  const activeContainer = document.getElementById('tq-active-queue-list');
  if (!pendingContainer || !activeContainer) return;

  const approvedDemands = tqDemands.filter(d => d.status === 'approved');
  const pendingDemands = approvedDemands.filter(d => !activeDemandIds.includes(d.demand_id));
  const activeDemands = approvedDemands.filter(d => activeDemandIds.includes(d.demand_id));

  // Render pending demands
  if (pendingDemands.length === 0) {
    pendingContainer.innerHTML = `<li style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No pending demands.</li>`;
  } else {
    pendingContainer.innerHTML = pendingDemands.map(d => {
      const isActive = d.demand_id === tqSelectedDemandId;
      return `
        <li class="demand-item pending-item ${isActive ? 'active' : ''}" data-id="${d.demand_id}" style="padding: 0.75rem 1rem; border-radius: var(--radius-sm); cursor: pointer; ">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.25rem;">${d.title}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-secondary);">
            <span>${d.demand_id}</span>
            <span class="badge-priority ${d.risk_level}">${d.risk_level}</span>
          </div>
        </li>
      `;
    }).join('');
  }

  // Render active demands
  if (activeDemands.length === 0) {
    activeContainer.innerHTML = `<li style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No active test runs.</li>`;
  } else {
    activeContainer.innerHTML = activeDemands.map(d => {
      const isActive = d.demand_id === tqSelectedDemandId;
      return `
        <li class="demand-item active-item ${isActive ? 'active' : ''}" data-id="${d.demand_id}" style="padding: 0.75rem 1rem; border-radius: var(--radius-sm); cursor: pointer; ">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.25rem;">${d.title}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-secondary);">
            <span>${d.demand_id}</span>
            <span class="badge-priority ${d.risk_level}">${d.risk_level}</span>
          </div>
        </li>
      `;
    }).join('');
  }

  // Attach event handlers
  const allItems = [...pendingContainer.querySelectorAll('.demand-item'), ...activeContainer.querySelectorAll('.demand-item')];
  allItems.forEach(item => {
    item.addEventListener('click', () => {
      selectTQDemand(item.getAttribute('data-id'));
    });
  });
}

async function selectTQDemand(id) {
  tqSelectedDemandId = id;
  // Re-fetch consolidated list dynamically to rebuild sidebar queues highlighting
  fetch(`${TQ_API_BASE}/test-quality/consolidated`)
    .then(res => res.json())
    .then(states => {
      renderTQQueues(states.map(s => s.demand_id));
    });
  
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
  panel.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 4rem 2rem;">
      <h3>No Demand Selected</h3>
      <p>Please select a demand from the left sidebar queues to run capability scans.</p>
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
    <div style="margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
      <div>
        <h2 style="margin: 0 0 0.25rem 0; font-size: 1.35rem; font-family: var(--font-display); font-weight: 800;">
          Test & Quality Assurance Module
        </h2>
        <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          <span>Current Context: <strong>${demand.demand_id}</strong></span> &bull; 
          <span>Project: <strong>${tqDeliveryContext && tqDeliveryContext.demand ? tqDeliveryContext.demand.title : 'Unified Platform Core'}</strong></span> &bull; 
          <span>Customer: <strong>${tqDeliveryContext && tqDeliveryContext.demand ? 'Global Retail' : 'Global Retail'}</strong></span> &bull; 
          <span>Business Unit: <strong>${tqDeliveryContext && tqDeliveryContext.demand ? tqDeliveryContext.demand.domain : 'Digital Payments'}</strong></span> &bull;
          <span>Manager: <strong>${tqDeliveryContext && tqDeliveryContext.demand ? tqDeliveryContext.demand.submitted_by : 'Sarah Jenkins'}</strong></span>
        </div>
      </div>
      
      <!-- Searchable Dropdown Selector -->
      <div id="tq-searchable-demand-selector-container"></div>
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
  container.innerHTML = `
    <div style="position: relative; width: 320px;">
      <div style="display: flex; gap: 0.25rem; align-items: center; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.35rem 0.5rem;">
        <svg style="width: 16px; height: 16px; fill: var(--text-muted);" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input type="text" id="tq-search-input" value="${activeDemand ? activeDemand.demand_id + ' - ' + activeDemand.title : ''}" placeholder="Search Demand ID..." style="background: transparent; border: none; color: var(--text-primary); font-size: 0.82rem; width: 100%; outline: none;" autocomplete="off">
        <button id="tq-dropdown-toggle-btn" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0;">▼</button>
      </div>
      <div id="tq-dropdown-list" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); max-height: 250px; overflow-y: auto; z-index: 9999; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5);">
        <!-- Options populated dynamically -->
      </div>
    </div>
  `;

  const searchInput = document.getElementById('tq-search-input');
  const dropdownList = document.getElementById('tq-dropdown-list');
  const toggleBtn = document.getElementById('tq-dropdown-toggle-btn');

  function showDropdown() {
    dropdownList.style.display = 'block';
    renderOptions(searchInput.value.trim());
  }

  function hideDropdown() {
    setTimeout(() => {
      dropdownList.style.display = 'none';
    }, 250);
  }

  function renderOptions(query) {
    const q = query.toLowerCase();
    const filtered = tqDemands.filter(d => 
      d.demand_id.toLowerCase().includes(q) || 
      d.title.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      dropdownList.innerHTML = `<div style="padding: 0.5rem 0.75rem; color: var(--text-muted); font-size: 0.8rem;">No matching demands found</div>`;
      return;
    }

    dropdownList.innerHTML = filtered.map(d => {
      const isSelected = activeDemand && d.demand_id === activeDemand.demand_id;
      return `
        <div class="tq-dropdown-option" data-id="${d.demand_id}" style="padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center; ${isSelected ? 'background: rgba(99, 102, 241, 0.15); color: var(--color-brand); font-weight: bold;' : 'color: var(--text-primary);'}">
          <div>
            <div style="font-weight: 600;">${d.demand_id}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.title}</div>
          </div>
          <span style="font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 9999px; font-weight: bold; background: rgba(255,255,255,0.05);">${d.status}</span>
        </div>
      `;
    }).join('');

    dropdownList.querySelectorAll('.tq-dropdown-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const id = opt.getAttribute('data-id');
        const selected = tqDemands.find(d => d.demand_id === id);
        searchInput.value = `${selected.demand_id} - ${selected.title}`;
        dropdownList.style.display = 'none';
        selectTQDemand(id);
      });
    });
  }

  searchInput.addEventListener('focus', showDropdown);
  searchInput.addEventListener('blur', hideDropdown);
  searchInput.addEventListener('input', (e) => {
    dropdownList.style.display = 'block';
    renderOptions(e.target.value);
  });
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdownList.style.display === 'block') {
      dropdownList.style.display = 'none';
    } else {
      showDropdown();
    }
  });
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
        <div class="tq-form-group">
          <label>Code Diff Reference (PR/Git)</label>
          <input type="text" class="tq-input" id="tq-gen-diff" value="pr://repo/${demand.demand_id.toLowerCase()}/pr/1" placeholder="e.g. pr://repo/loyalty-portal/pr/12 (Fetched from Build & Deploy)">
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
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;">${cases.filter(c => c.automation_candidate === 'Yes').length}</div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Manual Tests</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem;">${cases.filter(c => c.automation_candidate !== 'Yes').length}</div>
      </div>
      <div class="tq-card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Coverage Target</div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem; color: #4ade80;">96%</div>
      </div>
    </div>

    <!-- Active List -->
    <div class="tq-card">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Active Test Suite</h5>
      
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem;">Test ID</th>
              <th style="padding: 0.5rem;">Title / Objective</th>
              <th style="padding: 0.5rem;">Requirement</th>
              <th style="padding: 0.5rem;">Priority</th>
              <th style="padding: 0.5rem;">Risk</th>
              <th style="padding: 0.5rem;">Automation</th>
              <th style="padding: 0.5rem;">Status</th>
              <th style="padding: 0.5rem; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cases.length === 0 ? `
              <tr>
                <td colspan="8" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No test cases generated. Click "Generate Test Suite" above to build AI test scripts.
                </td>
              </tr>
            ` : cases.map(c => {
              const testId = c.test_id || c.id || '';
              const testPriority = c.priority || 'medium';
              const testRisk = c.risk_level || 'medium';
              const testAuto = c.automation_candidate || (c.type && c.type !== 'manual' ? 'Yes' : 'No');
              const testStatus = c.status || 'Approved';
              const testReq = c.requirement || c.type || 'Functional';
              const stepsStr = Array.isArray(c.steps) ? c.steps.join('; ') : (c.steps || '');
              
              return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${testId}</td>
                <td style="padding: 0.5rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  <strong>${c.title}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${stepsStr}</div>
                </td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${testReq}</td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${testPriority}">${testPriority}</span></td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${testRisk}">${testRisk}</span></td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${testAuto}</td>
                <td style="padding: 0.5rem;">
                  <span style="font-size: 0.75rem; font-weight: bold; color: ${testStatus === 'Approved' ? '#4ade80' : '#fcd34d'};">
                    ${testStatus}
                  </span>
                </td>
                <td style="padding: 0.5rem; text-align: right; white-space: nowrap;">
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

  // Attach handlers
  const generateBtn = document.getElementById('btn-tq-generate');
  generateBtn.addEventListener('click', async () => {
    generateBtn.disabled = true;
    generateBtn.innerHTML = `<span class="loader"></span> Generating...`;
    
    // Save generated test cases
    const defaultCases = getDefaultMockTestCases(demand.demand_id);
    for (const c of defaultCases) {
      await fetch(`${TQ_API_BASE}/test-quality/relational/test_cases/${demand.demand_id}/${c.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c)
      });
    }

    await loadConsolidatedTQState(demand.demand_id);
    renderTQDetailsPanel();
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
  return [
    { id: `TC-${suffix}-01`, test_id: `TC-${suffix}-01`, title: "Verify checkout authorization validation", requirement: "Checkout Gateway", type: "Checkout Gateway", story_id: `${demandId}-US-01`, preconditions: "User has cart loaded", steps: "1. Select cart checkout\n2. Authorize via mock api", expected: "Verifies correct payment status response", expected_result: "Verifies correct payment status response", priority: "High", risk_level: "High", automation_candidate: "Yes", status: "Approved", traceability: `${demandId}-US-01` },
    { id: `TC-${suffix}-02`, test_id: `TC-${suffix}-02`, title: "Regression check for loyalty ledger points rollback", requirement: "Loyalty Ledger", type: "Loyalty Ledger", story_id: `${demandId}-US-02`, preconditions: "Ledger details active", steps: "1. Perform checkout\n2. Rollback points on error", expected: "Points correctly roll back in db transaction", expected_result: "Points correctly roll back in db transaction", priority: "Critical", risk_level: "High", automation_candidate: "Yes", status: "Approved", traceability: `${demandId}-US-02` },
    { id: `TC-${suffix}-03`, test_id: `TC-${suffix}-03`, title: "Dark mode theme layout overlap boundary check", requirement: "Customer UI", type: "Customer UI", story_id: `${demandId}-US-03`, preconditions: "Anonymized db mock running", steps: "1. Toggle dark mode\n2. Inspect overlaps on mobile view", expected: "No layout breaks or unreadable overlaps", expected_result: "No layout breaks or unreadable overlaps", priority: "Low", risk_level: "Low", automation_candidate: "No", status: "Draft", traceability: `${demandId}-US-03` }
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
        <div class="tq-form-group">
          <label>Database Schemas (comma separated)</label>
          <input type="text" class="tq-input" id="tq-data-schemas" value="db://payments/transactions, db://auth/users" placeholder="e.g. db://payments/transactions">
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

    const env = document.getElementById('tq-data-env').value;
    const type = document.getElementById('tq-data-type').value;
    const volume = document.getElementById('tq-data-volume').value;
    const schemas = document.getElementById('tq-data-schemas').value;

    // Each dataset is saved as its own flat record in the relational table
    const datasetId = `DS-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;
    const newDataset = {
      dataset_id: datasetId,
      environment: env,
      data_type: type,
      record_count: parseInt(volume) || 250,
      schemas: schemas,
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
  const executions = testRun ? testRun.executions || [] : [];

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
              const eId = e.id || e.run_id || e.test_run_id || '—';
              const eTitle = e.test_case_title || e.title || e.test_name || e.test_case_id || '—';
              const eCategory = e.category || e.execution_type || e.type || '—';
              const eEnv = e.environment || e.env || '—';
              const eDate = e.run_date || e.executed_at || e.created_at || '—';
              const eStatus = e.status || '—';
              const statusColor = eStatus === 'Passed' || eStatus === 'passed' ? '#4ade80' : (eStatus === 'Failed' || eStatus === 'failed' ? '#ef4444' : '#fbbf24');
              return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${eId}</td>
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
                    <button class="btn-tq-record-failure tq-btn" data-id="${eId}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5;">Triage Log</button>
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
    execBtn.innerHTML = `<span class="loader"></span> Running Suite...`;

    if (cases.length === 0) {
      alert("No generated test cases to execute! Generate tests first.");
      execBtn.disabled = false;
      execBtn.innerHTML = `▶ Execute Test Cases`;
      return;
    }

    const type = document.getElementById('tq-exec-type').value;
    const env = document.getElementById('tq-exec-env').value;

    const mockRunId = `TR-${demand.demand_id.split('-').pop()}-1`;
    const newExecutions = cases.map((c, i) => {
      // Mock some failures to allow triaging defects
      let mockStatus = "Passed";
      if (i === 1) mockStatus = "Failed";
      return {
        id: `RUN-${demand.demand_id.split('-').pop()}-0${i + 1}`,
        test_case_id: c.test_id || c.id,
        test_case_title: c.title,
        category: type,
        environment: env,
        run_date: new Date().toLocaleString(),
        status: mockStatus,
        failure_reason: mockStatus === 'Failed' ? 'Transaction rollback mismatch error on backend ledger balance check' : null,
        root_cause: mockStatus === 'Failed' ? 'Incorrect ledger calculation validation trigger' : null,
        assignee: mockStatus === 'Failed' ? 'Sarah Jenkins' : null,
        resolution_status: mockStatus === 'Failed' ? 'Investigating' : null
      };
    });

    await fetch(`${TQ_API_BASE}/test-quality/relational/test_execution/${demand.demand_id}/${mockRunId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executions: newExecutions, test_run_id: mockRunId, defect_ids_raised: [`BUG-${demand.demand_id.split('-').pop()}-01`] })
    });

    await loadConsolidatedTQState(demand.demand_id);
    renderTQDetailsPanel();
  });

  // Triage log click
  container.querySelectorAll('.btn-tq-record-failure').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const exec = executions.find(e => (e.id || e.run_id || e.test_run_id) === id);
      if (!exec) return;

      const newReason = prompt("Record failure reason:", exec.failure_reason || "API response mismatch");
      if (newReason === null) return;
      exec.failure_reason = newReason;
      exec.root_cause = prompt("Record root cause:", exec.root_cause || "Incorrect state checker");
      exec.assignee = prompt("Assignee Employee:", exec.assignee || "Sarah Jenkins");
      exec.resolution_status = prompt("Resolution Status:", exec.resolution_status || "In-Progress");

      await fetch(`${TQ_API_BASE}/test-quality/relational/test_execution/${demand.demand_id}/test_execution_record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executions: executions, test_run_id: `TR-${demand.demand_id.split('-').pop()}-1`, defect_ids_raised: [`BUG-${demand.demand_id.split('-').pop()}-01`] })
      });

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
  if (defects.length === 0) {
    const defaultDefects = getDefaultMockDefects(demand.demand_id);
    for (const d of defaultDefects) {
      await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}/${d.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      });
    }
    defects = defaultDefects;
  }

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
            ${defects.map(d => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem;"><input type="checkbox" class="chk-defect-merge" value="${d.id}"></td>
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${d.id}</td>
                <td style="padding: 0.5rem;">
                  <strong>${d.summary}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${d.description || ''}</div>
                </td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${d.priority}">${d.priority}</span></td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${d.severity}">${d.severity}</span></td>
                <td style="padding: 0.5rem; color: var(--text-secondary); font-weight: 600;">${d.assignee || 'Unassigned'}</td>
                <td style="padding: 0.5rem;">
                  <span style="font-size: 0.75rem; font-weight: bold; color: ${d.status === 'Closed' ? '#4ade80' : '#ef4444'};">
                    ${d.status}
                  </span>
                </td>
                <td style="padding: 0.5rem; text-align: right; white-space: nowrap;">
                  <button class="btn-tq-defect-assign tq-btn" data-id="${d.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text-primary); margin-right: 0.25rem;">Reassign</button>
                  <button class="btn-tq-defect-close tq-btn" data-id="${d.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(74, 222, 128, 0.15); color: #4ade80;">Close</button>
                </td>
              </tr>
            `).join('')}
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
  if (findings.length === 0) {
    const defaultFindings = getDefaultMockFindings(demand.demand_id);
    for (const f of defaultFindings) {
      await fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demand.demand_id}/${f.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f)
      });
    }
    findings = defaultFindings;
  }

  container.innerHTML = `
    <!-- Top action card -->
    <div class="tq-card">
      <h4 class="tq-card-title">Security & Remediation Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1.25rem 0;">
        Executes SAST/DAST audits and secrets scanner triggers, providing recommended patch alerts.
      </p>

      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <button class="tq-btn" id="btn-tq-sec-add">+ Add Security Finding</button>
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
            ${findings.map(f => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 0.5rem; font-weight: bold; color: var(--color-brand);">${f.id}</td>
                <td style="padding: 0.5rem; font-weight: 600;">${f.category}</td>
                <td style="padding: 0.5rem;"><span class="badge-priority ${f.severity}">${f.severity}</span></td>
                <td style="padding: 0.5rem; color: var(--text-secondary); max-width: 250px;">${f.description}</td>
                <td style="padding: 0.5rem; color: #818cf8; font-family: ui-monospace, monospace; font-size: 0.75rem;">${f.suggested_fix || ''}</td>
                <td style="padding: 0.5rem;">
                  <span style="font-size: 0.75rem; font-weight: bold; color: ${f.status === 'Closed' ? '#4ade80' : '#ef4444'};">
                    ${f.status}
                  </span>
                </td>
                <td style="padding: 0.5rem; text-align: right; white-space: nowrap;">
                  <button class="btn-tq-sec-edit tq-btn" data-id="${f.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text-primary); margin-right: 0.25rem;">Edit</button>
                  <button class="btn-tq-sec-close tq-btn" data-id="${f.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(74, 222, 128, 0.15); color: #4ade80;">Resolve</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Handlers
  document.getElementById('btn-tq-sec-add').addEventListener('click', async () => {
    const cat = prompt("Enter vulnerability category (e.g. SQL Injection, Secrets Leak):");
    if (!cat) return;
    const severity = prompt("Enter Severity (Critical, High, Medium, Low, Informational):", "High");
    const desc = prompt("Enter short description:");

    const mockId = `SEC-${demand.demand_id.split('-').pop()}-${Date.now().toString().slice(-4)}`;
    const newFinding = {
      id: mockId,
      category: cat,
      severity: severity,
      description: desc || "Auto detected vulnerability during sandbox scan triggers.",
      suggested_fix: "Check parameter bounds checks and sanitize input string templates.",
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
      const finding = findings.find(f => f.id === id);
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
      const finding = findings.find(f => f.id === id);
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

  if (traceabilityList.length === 0) {
    const mockTrcId = `TRC-${demand.demand_id.split('-').pop()}-1`;
    const defaultMatrix = {
      traceability_id: mockTrcId,
      coverage_percentage: 90,
      rows: [
        { requirement: "Checkout Gateway", story: `${demand.demand_id}-US-01`, task: `${demand.demand_id}-TSK-01`, test_id: `TC-${demand.demand_id.split('-').pop()}-01`, execution: "Passed", defect: "None", release_id: "REL-001" },
        { requirement: "Loyalty Ledger", story: `${demand.demand_id}-US-02`, task: `${demand.demand_id}-TSK-02`, test_id: `TC-${demand.demand_id.split('-').pop()}-02`, execution: "Failed", defect: `BUG-${demand.demand_id.split('-').pop()}-01`, release_id: "REL-001" },
        { requirement: "Customer UI", story: `${demand.demand_id}-US-03`, task: `${demand.demand_id}-TSK-03`, test_id: `TC-${demand.demand_id.split('-').pop()}-03`, execution: "Missing", defect: "None", release_id: "REL-002" }
      ]
    };

    await fetch(`${TQ_API_BASE}/test-quality/relational/traceability/${demand.demand_id}/${mockTrcId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultMatrix)
    });
    traceabilityMatrix = defaultMatrix;
    traceabilityList = [defaultMatrix];
  } else {
    traceabilityMatrix = traceabilityList[0];
  }

  const matrix = traceabilityMatrix;

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
            ${matrix.rows.map(r => {
              const isMissing = r.test_id === 'Missing' || r.execution === 'Missing';
              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); ${isMissing ? 'background: rgba(239,68,68,0.04);' : ''}">
                  <td style="padding: 0.5rem; font-weight: 600;">${r.requirement}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${r.story}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${r.task}</td>
                  <td style="padding: 0.5rem; font-weight: bold; color: ${r.test_id === 'Missing' ? '#ef4444' : 'var(--color-brand)'};">${r.test_id}</td>
                  <td style="padding: 0.5rem; font-weight: 700; color: ${r.execution === 'Passed' ? '#4ade80' : (r.execution === 'Failed' ? '#ef4444' : '#f87171')};">${r.execution}</td>
                  <td style="padding: 0.5rem; font-weight: 700; color: ${r.defect !== 'None' ? '#ef4444' : 'var(--text-muted)'};">${r.defect}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${r.release_id}</td>
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
// Tab 7: Quality Gate UI
// -------------------------------------------------------------
async function renderQualityGateTab(container, demand) {
  // Fetch gate records
  const res = await fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demand.demand_id}`);
  let gateList = res.ok ? await res.json() : [];

  if (gateList.length === 0) {
    const mockGateId = `QG-${demand.demand_id.split('-').pop()}-1`;
    const defaultGate = {
      gate_id: mockGateId,
      verdict: "FAIL",
      score: 65,
      checks: [
        { check: "min_pass_rate_pct", threshold: ">= 95%", actual: "83.3%", result: "failed" },
        { check: "max_open_critical_defects", threshold: "0", actual: "1", result: "failed" },
        { check: "max_open_high_security_findings", threshold: "0", actual: "1", result: "failed" },
        { check: "min_coverage_pct", threshold: ">= 90%", actual: "90%", result: "passed" }
      ],
      gap_explanation: "One open blocker bug and AWS secret leak finding are violating release policy threshold guidelines.",
      history: [
        { event: "Evaluated Gate", timestamp: new Date().toLocaleString(), status: "FAIL", decision: "None", user: "Release-Manager" }
      ]
    };

    await fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demand.demand_id}/${mockGateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultGate)
    });
    qualityGate = defaultGate;
    gateList = [defaultGate];
  } else {
    qualityGate = gateList[0];
  }

  const qg = qualityGate;
  const isPass = qg.verdict === 'PASS';
  const isFail = qg.verdict === 'FAIL';
  
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
      </div>

      <!-- Verdict Banner -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem;border-radius:8px;background:${verdictBg};border:1px solid ${verdictBorder};margin-bottom:1.5rem;">
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.1em;margin-bottom:0.25rem;">Gate ID: ${qg.gate_id}</div>
          <div style="font-size:2.5rem;font-weight:900;color:${verdictColor};line-height:1;">${qg.verdict}</div>
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
          ${qg.checks.map(c => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
              <td style="padding:0.5rem;font-weight:600;color:var(--text-primary);">${c.check.replace(/_/g, ' ')}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${c.threshold}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${c.actual}</td>
              <td style="padding:0.5rem;">
                <span style="color:${c.result === 'passed' ? '#4ade80' : '#ef4444'};font-weight:700;">${c.result.toUpperCase()}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- AI recommendations block -->
      <div style="padding:0.75rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;margin-bottom:1.25rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:0.5rem;">AI Recommendation</div>
        <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">${qg.gap_explanation}</p>
      </div>

      <!-- Audit History -->
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
                <td style="padding: 0.4rem; font-weight: bold; color: ${h.status === 'PASS' ? '#4ade80' : '#ef4444'};">${h.status}</td>
                <td style="padding: 0.4rem; color: var(--text-secondary);">${h.decision}</td>
                <td style="padding: 0.4rem; color: var(--text-muted);">${h.user}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach handlers
  document.getElementById('btn-tq-qg-evaluate').addEventListener('click', async () => {
    // Call evaluate policy logic
    alert("Re-evaluating all policy thresholds in the background...");
    
    // Simulate updating values if bugs/vulns have been resolved
    const resBugs = await fetch(`${TQ_API_BASE}/test-quality/relational/defects/${demand.demand_id}`);
    const bugs = await resBugs.json();
    const openBugs = bugs.filter(b => b.status === 'Open').length;

    const resSec = await fetch(`${TQ_API_BASE}/test-quality/relational/security_findings/${demand.demand_id}`);
    const sec = await resSec.json();
    const openSec = sec.filter(s => s.status === 'Open').length;

    const newVerdict = (openBugs === 0 && openSec === 0) ? "PASS" : "FAIL";
    const newScore = (openBugs === 0 && openSec === 0) ? 98 : 65;

    qg.verdict = newVerdict;
    qg.score = newScore;
    qg.checks[1].actual = openBugs.toString();
    qg.checks[1].result = openBugs === 0 ? "passed" : "failed";
    qg.checks[2].actual = openSec.toString();
    qg.checks[2].result = openSec === 0 ? "passed" : "failed";
    qg.gap_explanation = (openBugs === 0 && openSec === 0) 
      ? "All release policy thresholds met successfully. Release approved."
      : "One open blocker bug and AWS secret leak finding are violating release policy threshold guidelines.";

    qg.history.push({
      event: "Re-Evaluated Gate",
      timestamp: new Date().toLocaleString(),
      status: newVerdict,
      decision: "Auto-re-evaluation query complete",
      user: "System-Evaluator"
    });

    await fetch(`${TQ_API_BASE}/test-quality/relational/quality_gate/${demand.demand_id}/${qg.gate_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(qg)
    });

    renderActiveTabContent(demand);
  });

  document.getElementById('btn-tq-qg-approve').addEventListener('click', async () => {
    const comments = prompt("Enter approval override comments/justification:");
    if (comments === null) return;
    
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
