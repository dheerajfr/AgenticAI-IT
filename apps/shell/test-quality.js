const TQ_API_BASE = 'http://127.0.0.1:8000/api';

let tqDemands = [];
let tqSelectedDemandId = null;
let tqActiveTab = 'generation'; // 'generation', 'data', 'triage', 'security', 'execution', 'traceability', 'quality-gate'

// Storage for API outputs to keep UI state
let generatedSuite = null;
let testDataProvision = null;
let defectTriage = null;
let securityScan = null;
let testRun = null;
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
        transition: all 0.2s ease;
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
        color: white;
        border: none;
        padding: 0.65rem 1.25rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: opacity 0.2s ease;
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
      .badge-priority.critical { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
      .badge-priority.high { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }
      .badge-priority.medium { background: rgba(59, 130, 246, 0.15); color: #93c5fd; }
      .badge-priority.low { background: rgba(75, 85, 99, 0.15); color: #d1d5db; }
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
        <li class="demand-item pending-item ${isActive ? 'active' : ''}" data-id="${d.demand_id}" style="padding: 0.75rem 1rem; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
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
        <li class="demand-item active-item ${isActive ? 'active' : ''}" data-id="${d.demand_id}" style="padding: 0.75rem 1rem; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
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

function selectTQDemand(id) {
  tqSelectedDemandId = id;
  // Re-fetch consolidated list dynamically to rebuild sidebar queues highlighting
  fetch(`${TQ_API_BASE}/test-quality/consolidated`)
    .then(res => res.json())
    .then(states => {
      renderTQQueues(states.map(s => s.demand_id));
    });
  
  // Reset outputs on switching demand
  generatedSuite = null;
  testDataProvision = null;
  defectTriage = null;
  securityScan = null;
  testRun = null;
  traceabilityMatrix = null;
  qualityGate = null;

  loadConsolidatedTQState(id).then(() => {
    renderTQDetailsPanel();
  });
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
    <div style="margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
      <div>
        <h2 style="margin: 0 0 0.25rem 0; font-size: 1.25rem; font-family: var(--font-display);">${demand.title}</h2>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          <span>ID: <strong>${demand.demand_id}</strong></span> &bull; 
          <span>Domain: <strong>${demand.domain}</strong></span> &bull; 
          <span>Status: <strong style="color: var(--color-status-green-text);">${demand.status}</strong></span>
        </div>
      </div>
      
      <!-- Horizontal DevSecOps Pipeline Checklist -->
      <div id="tq-horizontal-audit-tracker" style="display: flex; gap: 0.4rem; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.72rem; flex-wrap: wrap;">
        <!-- Hydrated dynamically -->
      </div>
    </div>

    <!-- Capabilities Tabs -->
    <div class="tq-tab-header" style="flex-wrap: wrap;">
      <button class="tq-tab-btn ${tqActiveTab === 'generation' ? 'active' : ''}" data-tab="generation">1. Test Generation</button>
      <button class="tq-tab-btn ${tqActiveTab === 'data' ? 'active' : ''}" data-tab="data">2. Test Data</button>
      <button class="tq-tab-btn ${tqActiveTab === 'execution' ? 'active' : ''}" data-tab="execution">3. Test Execution</button>
      <button class="tq-tab-btn ${tqActiveTab === 'triage' ? 'active' : ''}" data-tab="triage">4. Defect Triage</button>
      <button class="tq-tab-btn ${tqActiveTab === 'security' ? 'active' : ''}" data-tab="security">5. Security Scanner</button>
      <button class="tq-tab-btn ${tqActiveTab === 'traceability' ? 'active' : ''}" data-tab="traceability">6. Traceability</button>
      <button class="tq-tab-btn ${tqActiveTab === 'quality-gate' ? 'active' : ''}" data-tab="quality-gate">7. Quality Gate</button>
    </div>

    <!-- Tab Content Viewport -->
    <div class="tq-tab-content" id="tq-tab-viewport"></div>
  `;

  // Attach tab handlers
  panel.querySelectorAll('.tq-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tqActiveTab = btn.getAttribute('data-tab');
      renderTQDetailsPanel();
    });
  });

  renderActiveTabContent(demand);
  renderTQSidebarAudit();
}

function renderActiveTabContent(demand) {
  const container = document.getElementById('tq-tab-viewport');
  if (tqActiveTab === 'generation') {
    renderTestGenerationTab(container, demand);
  } else if (tqActiveTab === 'data') {
    renderTestDataTab(container, demand);
  } else if (tqActiveTab === 'triage') {
    renderDefectTriageTab(container, demand);
  } else if (tqActiveTab === 'security') {
    renderSecurityScanningTab(container, demand);
  } else if (tqActiveTab === 'execution') {
    renderTestExecutionTab(container, demand);
  } else if (tqActiveTab === 'traceability') {
    renderTraceabilityTab(container, demand);
  } else if (tqActiveTab === 'quality-gate') {
    renderQualityGateTab(container, demand);
  }
}

// -------------------------------------------------------------
// Capability 1: Test Generation UI
// -------------------------------------------------------------
function renderTestGenerationTab(container, demand) {
  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Test Generation Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1rem 0;">
        Consumes the project context, user stories, and git diff references to auto-generate functional, integration, regression, boundary, and negative test cases prioritized by risk.
      </p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="tq-form-group">
          <label>Story IDs (Comma separated)</label>
          <input type="text" class="tq-input" id="tq-gen-stories" placeholder="e.g. US-101, US-102" value="${demand.demand_id}">
        </div>
        <div class="tq-form-group">
          <label>Code Diff Reference (PR/Git)</label>
          <input type="text" class="tq-input" id="tq-gen-diff" value="pr://repo/${demand.title.toLowerCase().replace(/\\s+/g, '-')}/pr/88">
        </div>
      </div>
      
      <button class="tq-btn" id="btn-run-tq-gen">
        <span class="btn-text">Generate Test Suite</span>
      </button>
    </div>

    <div id="tq-gen-results-area"></div>
  `;

  const runBtn = document.getElementById('btn-run-tq-gen');
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="loader"></span> <span>Running Agent Analysis...</span>`;
    const resultsArea = document.getElementById('tq-gen-results-area');
    resultsArea.innerHTML = `<div style="text-align: center; padding: 2rem;"><span class="loader" style="width: 32px; height: 32px;"></span><p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">AI is analyzing delivery context and creating test cases...</p></div>`;

    try {
      const res = await fetch(`${TQ_API_BASE}/test-quality/test-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: demand.demand_id,
          plan_id: `PLN-${demand.demand_id.split('-')[-1]}-1`,
          story_ids: document.getElementById('tq-gen-stories').value.split(',').map(s => s.trim()).filter(s => s !== ''),
          code_diff_ref: document.getElementById('tq-gen-diff').value,
          traceability_matrix_id: `TRC-${demand.demand_id.split('-')[-1]}-1`
        })
      });
      
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      generatedSuite = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displaySuiteResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color: var(--color-status-red-text); padding: 1rem; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); border-radius: 4px;">Error running agent: ${err.message}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = `Generate Test Suite`;
    }
  });

  if (generatedSuite) {
    displaySuiteResults(document.getElementById('tq-gen-results-area'));
  }
}

function displaySuiteResults(container) {
  container.innerHTML = `
    <div class="tq-card" style="margin-top: 1rem;">
      <h4 class="tq-card-title" style="color: var(--color-status-green-text);">Suite Generated: ${generatedSuite.suite_id}</h4>
      
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Total Stories</div>
          <div style="font-size: 1.25rem; font-weight: 700;">${generatedSuite.coverage_summary.total_stories}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Stories Covered</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #818cf8;">${generatedSuite.coverage_summary.stories_covered}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Test Cases</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: var(--color-status-green-text);">${generatedSuite.coverage_summary.total_test_cases}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Critical Path Coverage</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #fbbf24;">${generatedSuite.coverage_summary.critical_path_coverage_pct}%</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${generatedSuite.test_cases.map(tc => `
          <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-weight: 600; font-size: 0.85rem;">${tc.test_id}: ${tc.title}</span>
              <div>
                <span class="badge-priority ${tc.priority}">${tc.priority}</span>
                <span style="font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(255,255,255,0.05); margin-left: 0.25rem;">${tc.type}</span>
              </div>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;"><strong>Steps:</strong></div>
            <ul style="font-size: 0.8rem; margin: 0; padding-left: 1.25rem; color: var(--text-secondary);">
              ${tc.steps.map(s => `<li>${s}</li>`).join('')}
            </ul>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;"><strong>Expected:</strong> ${tc.expected_result}</div>
          </div>
        `).join('')}
      </div>

      <pre class="tq-json-viewer">${JSON.stringify(generatedSuite, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Capability 2: Test Data UI
// -------------------------------------------------------------
function renderTestDataTab(container, demand) {
  const suiteId = generatedSuite ? generatedSuite.suite_id : '';

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Test Data Provisioning Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1rem 0;">
        Synthesizes / provisions privacy-compliant, masked datasets bound to the generated test suite requirements and database schemas.
      </p>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem;">
        <div class="tq-form-group">
          <label>Suite ID</label>
          <input type="text" class="tq-input" id="tq-data-suite-id" value="${suiteId}" placeholder="e.g. TST-0001-1 (from Tab 1)">
        </div>
        <div class="tq-form-group">
          <label>Target Environment</label>
          <select class="tq-input" id="tq-data-env">
            <option value="test">Test</option>
            <option value="dev">Dev</option>
            <option value="staging">Staging</option>
          </select>
        </div>
        <div class="tq-form-group">
          <label>Data Volume (records)</label>
          <input type="number" class="tq-input" id="tq-data-volume" value="250">
        </div>
        <div class="tq-form-group">
          <label>Privacy Classification</label>
          <select class="tq-input" id="tq-data-privacy">
            <option value="PII-masked">PII Masked</option>
            <option value="synthetic">Synthetic Only</option>
            <option value="anonymized">Anonymized</option>
          </select>
        </div>
      </div>

      <div class="tq-form-group">
        <label>Schema References (comma separated, optional)</label>
        <input type="text" class="tq-input" id="tq-data-schemas" value="" placeholder="e.g. db://payments/transactions, db://auth/users">
      </div>

      <button class="tq-btn" id="btn-run-tq-data">
        <span>Provision Test Data</span>
      </button>
    </div>

    <div id="tq-data-results-area"></div>
  `;

  const runBtn = document.getElementById('btn-run-tq-data');
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="loader"></span> <span>Running Agent Analysis...</span>`;
    const resultsArea = document.getElementById('tq-data-results-area');
    resultsArea.innerHTML = `<div style="text-align: center; padding: 2rem;"><span class="loader" style="width: 32px; height: 32px;"></span><p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">AI is analyzing schema definitions and generating data...</p></div>`;

    try {
      const suiteIdVal = document.getElementById('tq-data-suite-id').value.trim();
      if (!suiteIdVal) {
        throw new Error('Please enter a Suite ID. Run Test Generation (Tab 1) first.');
      }
      const schemaRaw = document.getElementById('tq-data-schemas').value.trim();
      const schemaRefs = schemaRaw ? schemaRaw.split(',').map(s => s.trim()).filter(s => s) : [];

      const res = await fetch(`${TQ_API_BASE}/test-quality/test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite_id: suiteIdVal,
          demand_id: demand.demand_id,
          target_environment: document.getElementById('tq-data-env').value,
          schema_refs: schemaRefs,
          data_volume: parseInt(document.getElementById('tq-data-volume').value) || 100,
          privacy_classification: document.getElementById('tq-data-privacy').value,
          expiry_hours: 48
        })
      });

      
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      testDataProvision = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displayDataResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color: var(--color-status-red-text); padding: 1rem; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); border-radius: 4px;">Error running agent: ${err.message}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = `Provision Test Data`;
    }
  });

  if (testDataProvision) {
    displayDataResults(document.getElementById('tq-data-results-area'));
  }
}

function displayDataResults(container) {
  container.innerHTML = `
    <div class="tq-card" style="margin-top: 1rem;">
      <h4 class="tq-card-title" style="color: var(--color-status-green-text);">Data Provisioned: ${testDataProvision.data_provision_id}</h4>
      
      <div style="font-size: 0.85rem; margin-bottom: 1rem;">
        <div>Environment: <strong>${testDataProvision.environment.toUpperCase()}</strong></div>
        <div>Expires At: <strong style="color: var(--color-status-red-text);">${new Date(testDataProvision.expires_at).toLocaleString()}</strong></div>
        <div>Status: <span style="font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(245,158,11,0.1); color: #fcd34d; font-weight: 700;">${testDataProvision.status.toUpperCase()}</span></div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${testDataProvision.datasets.map(ds => `
          <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px;">
            <div style="font-weight: 600; font-size: 0.85rem; color: #a5b4fc; margin-bottom: 0.25rem;">${ds.schema}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              <div>Record Count: <strong>${ds.record_count}</strong></div>
              <div>Masking Applied: <strong style="color: ${ds.masking_applied ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)'};">${ds.masking_applied ? 'Yes' : 'No'}</strong></div>
              <div style="margin-top: 0.25rem;">Storage Location: <code style="background: rgba(255,255,255,0.05); padding: 2px 4px; border-radius: 4px; font-family: monospace;">${ds.location}</code></div>
            </div>
          </div>
        `).join('')}
      </div>

      <pre class="tq-json-viewer">${JSON.stringify(testDataProvision, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Capability 3: Defect Triage UI
// -------------------------------------------------------------
function renderDefectTriageTab(container, demand) {
  // Auto-fill from upstream test run state if available
  const prefillRunId = testRun ? testRun.test_run_id : '';
  const prefillDefects = testRun && testRun.defect_ids_raised.length > 0
    ? testRun.defect_ids_raised.join(', ')
    : '';

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Defect Triage Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1rem 0;">
        Clusters similar defects, checks for duplicates, predicts severities/priorities, and proposes appropriate developer owners based on code ownership.
      </p>

      <div class="tq-form-group">
        <label>Test Run ID</label>
        <input type="text" class="tq-input" id="tq-triage-run-id" value="${prefillRunId}" placeholder="e.g. TR-0001-1 (auto-filled from Tab 5)">
      </div>

      <div class="tq-form-group">
        <label>Defect IDs to Triage (comma separated)</label>
        <input type="text" class="tq-input" id="tq-triage-ids" value="${prefillDefects}" placeholder="e.g. BUG-001, BUG-002 (auto-filled from Tab 5)">
      </div>

      <button class="tq-btn" id="btn-run-tq-triage">
        <span>Run Defect Triage</span>
      </button>
    </div>

    <div id="tq-triage-results-area"></div>
  `;

  const runBtn = document.getElementById('btn-run-tq-triage');
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="loader"></span> <span>Running Agent Analysis...</span>`;
    const resultsArea = document.getElementById('tq-triage-results-area');
    resultsArea.innerHTML = `<div style="text-align: center; padding: 2rem;"><span class="loader" style="width: 32px; height: 32px;"></span><p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">AI is clustering defects and parsing log stacks...</p></div>`;

    try {
      const runIdVal = document.getElementById('tq-triage-run-id').value.trim();
      const defectIdsRaw = document.getElementById('tq-triage-ids').value.trim();
      const defectIds = defectIdsRaw ? defectIdsRaw.split(',').map(s => s.trim()).filter(s => s) : [];

      const res = await fetch(`${TQ_API_BASE}/test-quality/defect-triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_run_id: runIdVal,
          demand_id: demand.demand_id,
          defect_ids: defectIds,
          code_ownership_map: {}
        })
      });
      
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      defectTriage = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displayTriageResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color: var(--color-status-red-text); padding: 1rem; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); border-radius: 4px;">Error running agent: ${err.message}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = `Run Defect Triage`;
    }
  });

  if (defectTriage) {
    displayTriageResults(document.getElementById('tq-triage-results-area'));
  }
}

function displayTriageResults(container) {
  container.innerHTML = `
    <div class="tq-card" style="margin-top: 1rem;">
      <h4 class="tq-card-title" style="color: var(--color-status-green-text);">Triage Report: ${defectTriage.triage_id}</h4>
      
      <div style="background: rgba(239, 68, 68, 0.05); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 0.75rem; font-size: 0.85rem; margin-bottom: 1.25rem;">
        <strong>Release Risk Summary:</strong> ${defectTriage.release_risk_summary}
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${defectTriage.triaged_defects.map(d => `
          <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-weight: 700; font-size: 0.85rem; color: #a5b4fc;">${d.defect_id}</span>
              <div>
                <span class="badge-priority ${d.severity}">${d.severity}</span>
                <span style="font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(255,255,255,0.05); margin-left: 0.25rem;">Priority ${d.priority}</span>
              </div>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
              <div>Cluster Name: <strong>${d.cluster}</strong></div>
              ${d.duplicate_of ? `<div style="color: #fbbf24;">Duplicate of: <strong>${d.duplicate_of}</strong></div>` : ''}
              <div>Assigned Developer: <strong>${d.assigned_to}</strong></div>
              <div>Recommended Action: <strong style="color: ${d.recommended_action === 'fix-before-release' ? 'var(--color-status-red-text)' : '#94a3b8'};">${d.recommended_action.toUpperCase()}</strong></div>
              <div style="margin-top: 0.5rem; background: rgba(0,0,0,0.1); padding: 0.5rem; border-radius: 4px; font-family: monospace; font-size: 0.75rem;">
                Root Cause: ${d.root_cause_hint}
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <pre class="tq-json-viewer">${JSON.stringify(defectTriage, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Capability 4: Security Testing UI
// -------------------------------------------------------------
function renderSecurityScanningTab(container, demand) {
  // Auto-fill components from environment state in delivery context if available
  const prefillPlanId = generatedSuite ? generatedSuite.plan_id : '';

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Security Scanner & Remediation Agent</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 1rem 0;">
        Executes pipeline scan triggers (SAST/DAST, secrets, vulnerabilities) and leverages LLM AppSec knowledge to triage findings and draft remediation PR code fixes.
      </p>

      <div class="tq-form-group" style="margin-bottom: 1rem;">
        <label>Components to Scan (comma separated)</label>
        <input type="text" class="tq-input" id="tq-sec-components" value="" placeholder="e.g. svc-auth, svc-payments-api">
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1rem; align-items: flex-end;">
        <div class="tq-form-group" style="margin-bottom: 0;">
          <label>Scan Types (comma separated)</label>
          <input type="text" class="tq-input" id="tq-sec-types" value="SAST, DAST, Secrets" placeholder="e.g. SAST, DAST, Secrets">
        </div>
        <div class="tq-form-group" style="margin-bottom: 0;">
          <label>Add Additional Scan</label>
          <select class="tq-input" id="tq-sec-types-dropdown" style="cursor: pointer;">
            <option value="" disabled selected>-- Select Scan Type --</option>
            <option value="SCA">Software Composition Analysis (SCA)</option>
            <option value="Container">Container Vulnerability Scan</option>
            <option value="Compliance">License Compliance Scan</option>
            <option value="IaC">Infrastructure as Code (IaC) Scan</option>
            <option value="API">API Security Scan</option>
            <option value="PenTest">Automated Pen Testing</option>
          </select>
        </div>
      </div>

      <button class="tq-btn" id="btn-run-tq-sec">
        <span>Run AppSec Scan</span>
      </button>
    </div>

    <div id="tq-sec-results-area"></div>
  `;

  // Attach event listener for scan types dropdown helper
  const typesDropdown = document.getElementById('tq-sec-types-dropdown');
  const typesInput = document.getElementById('tq-sec-types');
  typesDropdown.addEventListener('change', () => {
    const selected = typesDropdown.value;
    if (!selected) return;
    
    let current = typesInput.value.split(',').map(s => s.trim()).filter(s => s);
    if (!current.includes(selected)) {
      current.push(selected);
      typesInput.value = current.join(', ');
    }
    // Reset dropdown selector back to placeholder option
    typesDropdown.selectedIndex = 0;
  });

  const runBtn = document.getElementById('btn-run-tq-sec');
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="loader"></span> <span>Running Agent Analysis...</span>`;
    const resultsArea = document.getElementById('tq-sec-results-area');
    resultsArea.innerHTML = `<div style="text-align: center; padding: 2rem;"><span class="loader" style="width: 32px; height: 32px;"></span><p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">AI is auditing repository codes and running secrets checking...</p></div>`;

    try {
      const planIdVal = generatedSuite ? generatedSuite.plan_id : '';
      const componentRaw = document.getElementById('tq-sec-components').value.trim();
      const componentIds = componentRaw ? componentRaw.split(',').map(s => s.trim()).filter(s => s) : [];
      const scanTypesRaw = document.getElementById('tq-sec-types').value.trim();
      const scanTypes = scanTypesRaw ? scanTypesRaw.split(',').map(s => s.trim()).filter(s => s) : [];
      
      // Auto-generate a pipeline run ID matching context requirement
      const generatedPipelineId = "CI-RUN-" + demand.demand_id.split('-').pop() + "-1";

      const res = await fetch(`${TQ_API_BASE}/test-quality/security-testing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: demand.demand_id,
          plan_id: planIdVal,
          component_ids: componentIds,
          pipeline_run_id: generatedPipelineId,
          scan_types: scanTypes,
          vulnerability_db_version: undefined
        })
      });
      
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      securityScan = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displaySecurityResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color: var(--color-status-red-text); padding: 1rem; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); border-radius: 4px;">Error running agent: ${err.message}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = `Run AppSec Scan`;
    }
  });

  if (securityScan) {
    displaySecurityResults(document.getElementById('tq-sec-results-area'));
  }
}

function displaySecurityResults(container) {
  container.innerHTML = `
    <div class="tq-card" style="margin-top: 1rem;">
      <h4 class="tq-card-title" style="color: var(--color-status-green-text);">AppSec Report: ${securityScan.security_test_id}</h4>
      
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(239, 68, 68, 0.15); padding: 0.5rem; border-radius: 4px; text-align: center; border: 1px solid rgba(239, 68, 68, 0.2);">
          <div style="font-size: 0.65rem; color: #fca5a5; text-transform: uppercase;">Critical</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #fca5a5;">${securityScan.summary.critical}</div>
        </div>
        <div style="background: rgba(245, 158, 11, 0.15); padding: 0.5rem; border-radius: 4px; text-align: center; border: 1px solid rgba(245, 158, 11, 0.2);">
          <div style="font-size: 0.65rem; color: #fcd34d; text-transform: uppercase;">High</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #fcd34d;">${securityScan.summary.high}</div>
        </div>
        <div style="background: rgba(59, 130, 246, 0.15); padding: 0.5rem; border-radius: 4px; text-align: center; border: 1px solid rgba(59, 130, 246, 0.2);">
          <div style="font-size: 0.65rem; color: #93c5fd; text-transform: uppercase;">Medium</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #93c5fd;">${securityScan.summary.medium}</div>
        </div>
        <div style="background: rgba(75, 85, 99, 0.15); padding: 0.5rem; border-radius: 4px; text-align: center; border: 1px solid rgba(75, 85, 99, 0.2);">
          <div style="font-size: 0.65rem; color: #d1d5db; text-transform: uppercase;">Low</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #d1d5db;">${securityScan.summary.low}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${securityScan.findings.map(f => `
          <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-weight: 700; font-size: 0.85rem; color: #a5b4fc;">${f.finding_id}: ${f.category}</span>
              <span class="badge-priority ${f.severity}">${f.severity}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              <div>Component: <strong>${f.component_id}</strong></div>
              <div>Location: <code>${f.location}</code></div>
              <div>Exploitable: <strong style="color: ${f.exploitable ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)'};">${f.exploitable ? 'Confirmed' : 'No'}</strong></div>
              <div style="margin-top: 0.5rem;"><strong>Remediation Draft Fix:</strong></div>
              <pre style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; font-family: monospace; font-size: 0.75rem; white-space: pre-wrap; margin: 0.25rem 0 0 0; color: #fca5a5;">${f.draft_fix}</pre>
            </div>
          </div>
        `).join('')}
      </div>

      <pre class="tq-json-viewer">${JSON.stringify(securityScan, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Capability 5: Test Execution UI
// -------------------------------------------------------------
function renderTestExecutionTab(container, demand) {
  const suiteId = generatedSuite ? generatedSuite.suite_id : '';
  const provisionId = testDataProvision ? testDataProvision.data_provision_id : '';

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Test Execution Agent
        <span style="font-size:0.75rem; font-weight:400; color:var(--text-muted);">Impact-based suite runner with failure analysis</span>
      </h4>
      <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 1rem 0;">
        Selects and simulates execution of the generated test suite. AI analyses each failing test to produce a root-cause hint.
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="tq-form-group">
          <label>Suite ID</label>
          <input type="text" class="tq-input" id="tq-exec-suite-id" value="${suiteId}" placeholder="e.g. TST-0001-1">
        </div>
        <div class="tq-form-group">
          <label>Data Provision ID (optional)</label>
          <input type="text" class="tq-input" id="tq-exec-provision-id" value="${provisionId}" placeholder="e.g. TDP-0001-1">
        </div>
        <div class="tq-form-group">
          <label>Target Environment</label>
          <select class="tq-input" id="tq-exec-env">
            <option value="test">Test</option>
            <option value="staging">Staging</option>
            <option value="dev">Dev</option>
          </select>
        </div>
        <div class="tq-form-group">
          <label>Execution Mode</label>
          <select class="tq-input" id="tq-exec-mode">
            <option value="impact-based">Impact-Based</option>
            <option value="full">Full Suite</option>
            <option value="regression">Regression Only</option>
          </select>
        </div>
      </div>
      <button class="tq-btn" id="tq-exec-run-btn">▶ Run Test Suite</button>
    </div>
    <div id="tq-exec-results-area"></div>
  `;

  const runBtn = document.getElementById('tq-exec-run-btn');
  runBtn.addEventListener('click', async () => {
    const suiteIdVal = document.getElementById('tq-exec-suite-id').value.trim();
    if (!suiteIdVal) {
      alert('Please enter a Suite ID. Run Test Generation (Tab 1) first.');
      return;
    }
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="loader"></span> Running…`;
    const resultsArea = document.getElementById('tq-exec-results-area');
    resultsArea.innerHTML = `<div style="text-align:center;padding:2rem;"><span class="loader" style="width:32px;height:32px;"></span><p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.5rem;">AI is executing test suite against ${document.getElementById('tq-exec-env').value} environment…</p></div>`;

    try {
      const provisionVal = document.getElementById('tq-exec-provision-id').value.trim();
      const payload = {
        suite_id: suiteIdVal,
        demand_id: demand.demand_id,
        environment: document.getElementById('tq-exec-env').value,
        execution_mode: document.getElementById('tq-exec-mode').value
      };
      if (provisionVal) payload.data_provision_id = provisionVal;

      const res = await fetch(`${TQ_API_BASE}/test-quality/test-execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      testRun = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displayTestRunResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color:var(--color-status-red-text);padding:1rem;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.05);border-radius:4px;">Error: ${err.message}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = `▶ Run Test Suite`;
    }
  });

  if (testRun) displayTestRunResults(document.getElementById('tq-exec-results-area'));
}

function displayTestRunResults(container) {
  const s = testRun.summary;
  const passColor = s.pass_rate_pct >= 95 ? '#4ade80' : s.pass_rate_pct >= 80 ? '#fcd34d' : '#fca5a5';
  container.innerHTML = `
    <div class="tq-card" style="margin-top:1rem;">
      <h4 class="tq-card-title">Run Report: ${testRun.test_run_id}</h4>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.5rem;">
        <div style="background:rgba(99,102,241,0.1);padding:0.75rem;border-radius:6px;text-align:center;border:1px solid rgba(99,102,241,0.2);">
          <div style="font-size:0.65rem;color:#a5b4fc;text-transform:uppercase;">Total</div>
          <div style="font-size:1.5rem;font-weight:700;color:#a5b4fc;">${s.total}</div>
        </div>
        <div style="background:rgba(74,222,128,0.1);padding:0.75rem;border-radius:6px;text-align:center;border:1px solid rgba(74,222,128,0.2);">
          <div style="font-size:0.65rem;color:#4ade80;text-transform:uppercase;">Passed</div>
          <div style="font-size:1.5rem;font-weight:700;color:#4ade80;">${s.passed}</div>
        </div>
        <div style="background:rgba(239,68,68,0.1);padding:0.75rem;border-radius:6px;text-align:center;border:1px solid rgba(239,68,68,0.2);">
          <div style="font-size:0.65rem;color:#fca5a5;text-transform:uppercase;">Failed</div>
          <div style="font-size:1.5rem;font-weight:700;color:#fca5a5;">${s.failed}</div>
        </div>
        <div style="background:rgba(99,102,241,0.1);padding:0.75rem;border-radius:6px;text-align:center;border:1px solid rgba(99,102,241,0.3);">
          <div style="font-size:0.65rem;color:#a5b4fc;text-transform:uppercase;">Pass Rate</div>
          <div style="font-size:1.5rem;font-weight:700;color:${passColor};">${s.pass_rate_pct}%</div>
        </div>
      </div>

      ${testRun.defect_ids_raised.length > 0 ? `
        <div style="margin-bottom:1rem;padding:0.5rem 0.75rem;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:4px;font-size:0.8rem;color:#fca5a5;">
          🐛 Defects Raised: <strong>${testRun.defect_ids_raised.join(', ')}</strong>
        </div>` : ''}

      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${testRun.results.map(r => {
          const isPass = r.status === 'passed';
          const isSkip = r.status === 'skipped';
          const statusColor = isPass ? '#4ade80' : isSkip ? '#fcd34d' : '#fca5a5';
          const statusBg = isPass ? 'rgba(74,222,128,0.05)' : isSkip ? 'rgba(252,211,77,0.05)' : 'rgba(239,68,68,0.05)';
          
          // Match matching test case definition from generatedSuite
          const testCase = generatedSuite && generatedSuite.test_cases 
            ? generatedSuite.test_cases.find(tc => tc.test_id === r.test_id) 
            : null;
            
          const testTitle = testCase ? `: ${testCase.title}` : '';

          return `
            <div style="background:${statusBg};border:1px solid ${statusColor}33;padding:0.6rem 0.75rem;border-radius:4px;display:flex;flex-direction:column;gap:0.25rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:0.85rem;color:var(--text-primary);">${r.test_id}${testTitle}</span>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                  <span style="font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:9999px;background:${statusColor}22;color:${statusColor};font-weight:700;text-transform:uppercase;">${r.status}</span>
                </div>
              </div>
              
              ${testCase ? `
              <details style="margin-top:0.4rem; font-size:0.8rem; color:var(--text-secondary);">
                <summary style="cursor:pointer; color:#a5b4fc; font-weight:600; outline:none; user-select:none;">View Execution Details</summary>
                <div style="margin-top:0.4rem; padding:0.5rem; background:rgba(0,0,0,0.15); border-radius:4px; display:flex; flex-direction:column; gap:0.35rem;">
                  <div><strong>Steps:</strong></div>
                  <ol style="margin:0 0 0.4rem 1.25rem; padding:0; line-height:1.4;">
                    ${testCase.steps.map(step => `<li>${step}</li>`).join('')}
                  </ol>
                  <div><strong>Expected Result:</strong> ${testCase.expected_result}</div>
                  ${r.failure_analysis ? `
                    <div style="margin-top:0.25rem; color:#fca5a5; font-weight:600;">
                      ⚠ Failure Analysis: ${r.failure_analysis}
                    </div>
                  ` : `
                    <div style="margin-top:0.25rem; color:#4ade80; font-weight:600;">
                      ✓ Status: Executed successfully and matched expected result.
                    </div>
                  `}
                </div>
              </details>
              ` : `
                ${r.failure_analysis ? `<div style="font-size:0.78rem;color:#fca5a5;margin-top:0.25rem;">⚠ ${r.failure_analysis}</div>` : ''}
              `}
            </div>
          `;
        }).join('')}
      </div>
      <pre class="tq-json-viewer">${JSON.stringify(testRun, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Capability 6: Traceability UI
// -------------------------------------------------------------
function renderTraceabilityTab(container, demand) {
  const suiteId = generatedSuite ? generatedSuite.suite_id : '';
  const runId = testRun ? testRun.test_run_id : '';
  const defectIds = testRun ? testRun.defect_ids_raised.join(', ') : (defectTriage ? defectTriage.triaged_defects.map(d => d.defect_id).join(', ') : '');

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Traceability Agent
        <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">Requirement → Test → Defect matrix</span>
      </h4>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem 0;">
        Builds an audit-ready live matrix mapping every user story to its test cases and any raised defects.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="tq-form-group">
          <label>Suite ID</label>
          <input type="text" class="tq-input" id="tq-trc-suite-id" value="${suiteId}" placeholder="e.g. TST-0001-1">
        </div>
        <div class="tq-form-group">
          <label>Test Run ID</label>
          <input type="text" class="tq-input" id="tq-trc-run-id" value="${runId}" placeholder="e.g. TR-0001-1">
        </div>
        <div class="tq-form-group" style="grid-column:span 2;">
          <label>Additional Defect IDs (comma-separated, optional)</label>
          <input type="text" class="tq-input" id="tq-trc-defects" value="${defectIds}" placeholder="e.g. BUG-001, BUG-002">
        </div>
      </div>
      <button class="tq-btn" id="tq-trc-build-btn">🔗 Build Traceability Matrix</button>
    </div>
    <div id="tq-trc-results-area"></div>
  `;

  const buildBtn = document.getElementById('tq-trc-build-btn');
  buildBtn.addEventListener('click', async () => {
    const suiteIdVal = document.getElementById('tq-trc-suite-id').value.trim();
    const runIdVal = document.getElementById('tq-trc-run-id').value.trim();
    if (!suiteIdVal || !runIdVal) {
      alert('Suite ID and Test Run ID are required. Run Test Execution (Tab 5) first.');
      return;
    }
    buildBtn.disabled = true;
    buildBtn.innerHTML = `<span class="loader"></span> Building…`;
    const resultsArea = document.getElementById('tq-trc-results-area');
    resultsArea.innerHTML = `<div style="text-align:center;padding:2rem;"><span class="loader" style="width:32px;height:32px;"></span><p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.5rem;">AI is mapping stories to tests and defects…</p></div>`;

    try {
      const defectRaw = document.getElementById('tq-trc-defects').value.trim();
      const defectIds = defectRaw ? defectRaw.split(',').map(s => s.trim()).filter(s => s) : [];
      const res = await fetch(`${TQ_API_BASE}/test-quality/traceability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: demand.demand_id,
          suite_id: suiteIdVal,
          test_run_id: runIdVal,
          defect_ids: defectIds
        })
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      traceabilityMatrix = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displayTraceabilityResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color:var(--color-status-red-text);padding:1rem;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.05);border-radius:4px;">Error: ${err.message}</div>`;
    } finally {
      buildBtn.disabled = false;
      buildBtn.innerHTML = `🔗 Build Traceability Matrix`;
    }
  });

  if (traceabilityMatrix) displayTraceabilityResults(document.getElementById('tq-trc-results-area'));
}

function displayTraceabilityResults(container) {
  const tm = traceabilityMatrix;
  const auditBadge = tm.audit_ready
    ? `<span style="background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3);border-radius:9999px;padding:0.15rem 0.6rem;font-size:0.7rem;font-weight:700;">✓ AUDIT READY</span>`
    : `<span style="background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);border-radius:9999px;padding:0.15rem 0.6rem;font-size:0.7rem;font-weight:700;">✗ GAPS DETECTED</span>`;

  const coverageColorMap = { covered: '#4ade80', partial: '#fcd34d', uncovered: '#fca5a5' };

  container.innerHTML = `
    <div class="tq-card" style="margin-top:1rem;">
      <h4 class="tq-card-title">
        Matrix: ${tm.traceability_id}
        ${auditBadge}
      </h4>

      <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:1.25rem;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-color);text-align:left;">
            <th style="padding:0.5rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;font-size:0.7rem;">Story</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;font-size:0.7rem;">Tests</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;font-size:0.7rem;">Defects</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;font-size:0.7rem;">Coverage</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;font-size:0.7rem;">Passing</th>
          </tr>
        </thead>
        <tbody>
          ${tm.entries.map(e => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
              <td style="padding:0.5rem;font-weight:700;color:#a5b4fc;">${e.story_id}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${e.test_ids.join(', ') || '—'}</td>
              <td style="padding:0.5rem;color:${e.defect_ids.length > 0 ? '#fca5a5' : 'var(--text-muted)'};">${e.defect_ids.join(', ') || '—'}</td>
              <td style="padding:0.5rem;">
                <span style="color:${coverageColorMap[e.coverage_status] || '#d1d5db'};font-weight:600;font-size:0.75rem;">${e.coverage_status}</span>
              </td>
              <td style="padding:0.5rem;">
                <span style="color:${e.passing ? '#4ade80' : '#fca5a5'};font-weight:700;">${e.passing ? '✓' : '✗'}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${tm.uncovered_stories.length > 0 ? `
        <div style="padding:0.6rem 0.75rem;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:4px;margin-bottom:0.75rem;font-size:0.8rem;color:#fca5a5;">
          ⚠ Uncovered Stories: <strong>${tm.uncovered_stories.join(', ')}</strong>
        </div>` : ''}

      ${tm.coverage_gaps.length > 0 ? `
        <div style="padding:0.6rem 0.75rem;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:4px;margin-bottom:0.75rem;font-size:0.8rem;color:#fcd34d;">
          ⚠ Coverage Gaps: <strong>${tm.coverage_gaps.join(', ')}</strong>
        </div>` : ''}

      <pre class="tq-json-viewer">${JSON.stringify(tm, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Capability 7: Quality Gate UI
// -------------------------------------------------------------
function renderQualityGateTab(container, demand) {
  const runId = testRun ? testRun.test_run_id : '';
  const triageId = defectTriage ? defectTriage.triage_id : '';
  const secId = securityScan ? securityScan.security_test_id : '';
  const trcId = traceabilityMatrix ? traceabilityMatrix.traceability_id : '';

  container.innerHTML = `
    <div class="tq-card">
      <h4 class="tq-card-title">Quality Gate Agent
        <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">Release readiness verdict</span>
      </h4>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 1rem 0;">
        Evaluates all quality checks against policy thresholds and issues a PASS or FAIL verdict for release.
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <div class="tq-form-group">
          <label>Test Run ID *</label>
          <input type="text" class="tq-input" id="tq-qg-run-id" value="${runId}" placeholder="e.g. TR-0001-1">
        </div>
        <div class="tq-form-group">
          <label>Triage ID (optional)</label>
          <input type="text" class="tq-input" id="tq-qg-triage-id" value="${triageId}" placeholder="e.g. TRG-0001-1">
        </div>
        <div class="tq-form-group">
          <label>Security Test ID (optional)</label>
          <input type="text" class="tq-input" id="tq-qg-sec-id" value="${secId}" placeholder="e.g. SEC-0001-1">
        </div>
        <div class="tq-form-group">
          <label>Traceability ID (optional)</label>
          <input type="text" class="tq-input" id="tq-qg-trc-id" value="${trcId}" placeholder="e.g. TRC-0001-1">
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:1rem;margin-bottom:1rem;">
        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem;">Quality Policy Thresholds</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;">
          <div class="tq-form-group" style="margin-bottom:0;">
            <label>Min Pass Rate (%)</label>
            <input type="number" class="tq-input" id="tq-qg-pass-rate" value="95" min="0" max="100">
          </div>
          <div class="tq-form-group" style="margin-bottom:0;">
            <label>Max Critical Defects</label>
            <input type="number" class="tq-input" id="tq-qg-max-critical" value="0" min="0">
          </div>
          <div class="tq-form-group" style="margin-bottom:0;">
            <label>Max High Sec Findings</label>
            <input type="number" class="tq-input" id="tq-qg-max-sec" value="0" min="0">
          </div>
          <div class="tq-form-group" style="margin-bottom:0;">
            <label>Min Coverage (%)</label>
            <input type="number" class="tq-input" id="tq-qg-min-coverage" value="90" min="0" max="100">
          </div>
        </div>
      </div>

      <button class="tq-btn" id="tq-qg-evaluate-btn">⚖ Evaluate Quality Gate</button>
    </div>
    <div id="tq-qg-results-area"></div>
  `;

  const evalBtn = document.getElementById('tq-qg-evaluate-btn');
  evalBtn.addEventListener('click', async () => {
    const runIdVal = document.getElementById('tq-qg-run-id').value.trim();
    if (!runIdVal) {
      alert('Test Run ID is required. Run Test Execution (Tab 5) first.');
      return;
    }
    evalBtn.disabled = true;
    evalBtn.innerHTML = `<span class="loader"></span> Evaluating…`;
    const resultsArea = document.getElementById('tq-qg-results-area');
    resultsArea.innerHTML = `<div style="text-align:center;padding:2rem;"><span class="loader" style="width:32px;height:32px;"></span><p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.5rem;">AI is evaluating quality checks against policy thresholds…</p></div>`;

    try {
      const payload = {
        demand_id: demand.demand_id,
        test_run_id: runIdVal,
        quality_policy: {
          min_pass_rate_pct: parseFloat(document.getElementById('tq-qg-pass-rate').value),
          max_open_critical_defects: parseInt(document.getElementById('tq-qg-max-critical').value),
          max_open_high_security_findings: parseInt(document.getElementById('tq-qg-max-sec').value),
          min_coverage_pct: parseFloat(document.getElementById('tq-qg-min-coverage').value)
        }
      };
      const triageVal = document.getElementById('tq-qg-triage-id').value.trim();
      const secVal = document.getElementById('tq-qg-sec-id').value.trim();
      const trcVal = document.getElementById('tq-qg-trc-id').value.trim();
      if (triageVal) payload.triage_id = triageVal;
      if (secVal) payload.security_test_id = secVal;
      if (trcVal) payload.traceability_id = trcVal;

      const res = await fetch(`${TQ_API_BASE}/test-quality/quality-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      qualityGate = await res.json();
      renderTQSidebarAudit();
      refreshTQSidebar();
      displayQualityGateResults(resultsArea);
    } catch (err) {
      console.error(err);
      resultsArea.innerHTML = `<div style="color:var(--color-status-red-text);padding:1rem;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.05);border-radius:4px;">Error: ${err.message}</div>`;
    } finally {
      evalBtn.disabled = false;
      evalBtn.innerHTML = `⚖ Evaluate Quality Gate`;
    }
  });

  if (qualityGate) displayQualityGateResults(document.getElementById('tq-qg-results-area'));
}

function displayQualityGateResults(container) {
  const qg = qualityGate;
  const isPass = qg.verdict === 'pass';
  const verdictColor = isPass ? '#4ade80' : '#fca5a5';
  const verdictBg = isPass ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)';
  const verdictBorder = isPass ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)';

  const checkResultColor = { pass: '#4ade80', fail: '#fca5a5', warn: '#fcd34d' };
  const checkResultIcon = { pass: '✓', fail: '✗', warn: '⚠' };

  const scoreAngle = (qg.score / 100) * 180;

  container.innerHTML = `
    <div class="tq-card" style="margin-top:1rem;">
      <!-- Verdict Banner -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem;border-radius:8px;background:${verdictBg};border:2px solid ${verdictBorder};margin-bottom:1.5rem;">
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.1em;margin-bottom:0.25rem;">Gate ID: ${qg.gate_id}</div>
          <div style="font-size:2.5rem;font-weight:900;color:${verdictColor};line-height:1;">${qg.verdict.toUpperCase()}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.5rem;">Release ${isPass ? 'APPROVED — all quality thresholds met.' : 'BLOCKED — quality thresholds breached.'}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:3rem;font-weight:900;color:${verdictColor};">${qg.score}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Score / 100</div>
          <!-- Score bar -->
          <div style="width:100px;height:6px;background:rgba(255,255,255,0.1);border-radius:9999px;margin-top:0.5rem;overflow:hidden;">
            <div style="width:${qg.score}%;height:100%;background:${verdictColor};border-radius:9999px;transition:width 0.8s ease;"></div>
          </div>
        </div>
      </div>

      <!-- Checks Table -->
      <h5 style="margin:0 0 0.75rem 0;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Quality Checks</h5>
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:1.25rem;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-color);text-align:left;">
            <th style="padding:0.5rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Check</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Threshold</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Actual</th>
            <th style="padding:0.5rem;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;">Result</th>
          </tr>
        </thead>
        <tbody>
          ${qg.checks.map(c => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
              <td style="padding:0.5rem;font-weight:600;color:var(--text-primary);">${c.check.replace(/_/g, ' ')}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${c.threshold}</td>
              <td style="padding:0.5rem;color:var(--text-secondary);">${c.actual}</td>
              <td style="padding:0.5rem;">
                <span style="color:${checkResultColor[c.result] || '#d1d5db'};font-weight:700;font-size:0.85rem;">${checkResultIcon[c.result] || '?'} ${c.result.toUpperCase()}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Gap Explanation -->
      <div style="padding:0.75rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;margin-bottom:1rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:0.5rem;">AI Gap Analysis</div>
        <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">${qg.gap_explanation}</p>
      </div>

      <pre class="tq-json-viewer">${JSON.stringify(qg, null, 2)}</pre>
    </div>
  `;
}

// -------------------------------------------------------------
// Left Sidebar Saved Quality Audit Dashboard Logic
// -------------------------------------------------------------

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

    // Set memory state from consolidated record
    generatedSuite = record.test_generation;
    testDataProvision = record.test_data;
    testRun = record.test_execution;
    defectTriage = record.defect_triage;
    securityScan = record.security_testing;
    traceabilityMatrix = record.traceability;
    qualityGate = record.quality_gate;
  } catch (err) {
    console.error("Error loading consolidated TQ state:", err);
  }
}

function renderTQSidebarAudit() {
  // Checklist completely removed from UI
}
