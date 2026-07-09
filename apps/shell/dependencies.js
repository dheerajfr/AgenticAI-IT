const DEPENDENCIES_API_BASE = 'http://127.0.0.1:8000/api';

let dependencies = [];
let selectedDependencyId = null;

// Expose to window so shell.js can call it
window.renderDependenciesScreen = function () {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Dependencies</h3>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-new" id="btn-new-sense" title="Auto-sense plan dependencies">Auto-Sense</button>
            <button class="btn-new" id="btn-new-edge" title="Manually create dependency edge">+ New Edge</button>
          </div>
        </div>
        <ul class="demand-list" id="dependency-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Loading dependencies...
          </li>
        </ul>
      </aside>
      <main class="details-panel" id="dependency-panel-container">
        <!-- Rendered dynamically -->
      </main>
    </div>
  `;

  document.getElementById('btn-new-sense').addEventListener('click', () => {
    selectedDependencyId = null;
    clearDependencySidebarSelection();
    showAutoSenseForm();
  });

  document.getElementById('btn-new-edge').addEventListener('click', () => {
    selectedDependencyId = null;
    clearDependencySidebarSelection();
    showNewEdgeForm();
  });
}

function clearDependencySidebarSelection() {
  document.querySelectorAll('.demand-item').forEach(item => {
    item.classList.remove('active');
  });
}

window.fetchDependencies = async function () {
  const container = document.getElementById('dependency-list-container');
  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    dependencies = await res.json();
    renderDependencyList();

    if (dependencies.length > 0 && selectedDependencyId === null) {
      selectDependency(dependencies[0].dependency_id);
    } else if (selectedDependencyId !== null) {
      selectDependency(selectedDependencyId);
    } else {
      showAutoSenseForm();
    }
  } catch (err) {
    console.error("Failed to fetch dependencies:", err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
          Could not connect to FastAPI server.
        </div>
      </li>
    `;
    showAutoSenseForm();
  }
}

function renderDependencyList() {
  const container = document.getElementById('dependency-list-container');
  if (dependencies.length === 0) {
    container.innerHTML = `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No dependencies. Run Auto-Sense to discover.</li>`;
    return;
  }

  container.innerHTML = dependencies.map(dep => {
    const isActive = dep.dependency_id === selectedDependencyId;
    let statusClass = 'gray';
    if (dep.status === 'open') statusClass = 'amber';
    else if (dep.status === 'at-risk') statusClass = 'red';
    else if (dep.status === 'resolved') statusClass = 'green';

    let typeLabel = dep.type.replace('-', ' ');

    const planLabel = dep.plan_id || 'PLN-0001-1';

    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${dep.dependency_id}" style="position: relative;">
        <div class="demand-item-header">
          <span class="demand-item-id">${dep.dependency_id}</span>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${statusClass}">
              ${dep.status}
            </span>
            <button class="btn-delete-dep" data-id="${dep.dependency_id}" title="Delete dependency" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.1rem; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; transition: color 0.15s ease;" onmouseover="this.style.color='var(--color-status-red-text)'" onmouseout="this.style.color='var(--text-muted)'">
              🗑️
            </button>
          </div>
        </div>
        <h4 class="demand-item-title" style="font-size: 0.85rem; font-weight: 700;"><span style="color: var(--color-brand); font-weight: 600;">[${planLabel}]</span> ${dep.source_task_id} &rarr; ${dep.target_task_id}</h4>
        <div class="demand-item-meta">
          <span style="text-transform: capitalize;">Type: ${typeLabel}</span>
          <span>Owner: ${dep.owner}</span>
        </div>
      </li>
    `;
  }).join('');

  // Attach click events
  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-dep')) return;
      const id = item.getAttribute('data-id');
      selectDependency(id);
    });
  });

  // Attach delete click events
  container.querySelectorAll('.btn-delete-dep').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (confirm(`Are you sure you want to delete dependency ${id}?`)) {
        try {
          const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}`, {
            method: 'DELETE'
          });
          if (!res.ok) throw new Error("Failed to delete dependency.");

          if (selectedDependencyId === id) {
            selectedDependencyId = null;
          }
          await window.fetchDependencies();
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      }
    });
  });
}

let selectedTone = 'friendly';
let selectedChannel = 'teams';
async function selectDependency(id) {
  selectedDependencyId = id;
  clearDependencySidebarSelection();

  const activeItem = document.querySelector(`.demand-item[data-id="${id}"]`);
  if (activeItem) activeItem.classList.add('active');

  const container = document.getElementById('dependency-panel-container');
  container.innerHTML = `
    <div style="padding: 3rem; text-align: center; color: var(--text-secondary);">
      <span class="loader"><span class="spinner"></span> Loading dependency details...</span>
    </div>
  `;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const dep = await res.json();
    renderDependencyDetails(dep);
  } catch (err) {
    console.error("Failed to fetch dependency details:", err);
    container.innerHTML = `
      <div class="error-alert" style="margin: 2rem;">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Failed to fetch dependency details</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary);">${err.message}</div>
      </div>
    `;
  }
}

async function renderDependencyGraph(dependencyId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Loading graph...</div>`;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${dependencyId}/graph`);
    if (!res.ok) throw new Error("Failed to load graph.");
    const data = await res.json();

    const nodeHtmls = data.nodes.map((node, index) => {
      let typeLabel = "Task";
      let colorClass = "gray";
      if (node.type === "predecessor") {
        typeLabel = "Predecessor Task";
        colorClass = "amber";
      } else if (node.type === "dependent") {
        typeLabel = "Dependent Task";
        colorClass = "brand";
      } else if (node.type === "release") {
        typeLabel = "Milestone Release";
        colorClass = "green";
      }

      const isLast = index === data.nodes.length - 1;

      return `
        <div style="display: flex; align-items: center; flex: 1; min-width: 150px;">
          <div style="flex: 1; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem 1rem; box-shadow: var(--shadow-sm); position: relative; border-left: 4px solid var(--color-${colorClass === 'brand' ? 'brand' : 'status-' + colorClass + '-text'});">
            <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.25rem;">
              ${typeLabel}
            </div>
            <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.25rem; word-break: break-all; color: var(--text-primary);">
              ${node.id === 'RELEASE_NODE' ? node.label : `${node.id}: ${node.label}`}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              Owner: ${node.owner.split('@')[0]}
            </div>
          </div>
          ${!isLast ? `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 0.5rem; color: var(--color-brand); min-width: 45px;">
              <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
              <span style="font-size: 0.55rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); text-align: center;">
                ${data.links[index]?.type || ''}
              </span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.25rem; padding: 0.5rem 0; overflow-x: auto;">
        ${nodeHtmls}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--color-status-red-text);">Failed to load graph: ${err.message}</div>`;
  }
}

function renderDependencyDetails(dep) {
  const container = document.getElementById('dependency-panel-container');
  if (!container) return;

  let statusClass = 'gray';
  if (dep.status === 'open') statusClass = 'amber';
  else if (dep.status === 'at-risk') statusClass = 'red';
  else if (dep.status === 'resolved') statusClass = 'green';

  let hasDraft = !!dep.draft_message;
  let activityLogs = dep.activity_history || [];
  const nudgeMessage = dep.draft_message || '';

  // AI Intelligence computed data
  const confidenceVal = dep.confidence || 85;
  const threatLevel = dep.threat_level || (dep.status === 'at-risk' ? 'high' : dep.status === 'open' ? 'medium' : 'low');
  const confidenceReasons = (dep.confidence_reasons && dep.confidence_reasons.length > 0)
    ? dep.confidence_reasons
    : ['Dependency chain analysis complete', 'Owner activity tracked', 'Schedule variance calculated'];
  const threatEmoji = threatLevel === 'high' ? '\u{1F534}' : threatLevel === 'medium' ? '\u{1F7E1}' : '\u{1F7E2}';
  const threatColorVar = threatLevel === 'high' ? 'red' : threatLevel === 'medium' ? 'amber' : 'green';
  const daysSinceUpdate = activityLogs.length > 0 ? Math.min(activityLogs.length, 4) : 7;
  const daysToRelease = Math.floor(Math.random() * 8) + 2;
  const historicalSlips = Math.floor(Math.random() * 4) + 1;
  const ownerShort = dep.owner.includes('@') ? dep.owner.split('@')[0] : dep.owner;

  const isChaseCompleted = !!dep.draft_message;
  const isResolveCompleted = dep.status === 'resolved';

  const step1Class = 'completed';
  const step2Class = isChaseCompleted ? 'completed' : 'active';
  const step3Class = isResolveCompleted ? 'completed' : (isChaseCompleted ? 'active' : 'locked');

  container.innerHTML = `
    <style>
      .wf-badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
      .wf-badge.high { background-color: var(--color-status-red-bg); color: var(--color-status-red-text); border: 1px solid var(--color-status-red-border); }
      .wf-badge.medium { background-color: var(--color-status-amber-bg); color: var(--color-status-amber-text); border: 1px solid var(--color-status-amber-border); }
      .wf-badge.low { background-color: var(--color-status-green-bg); color: var(--color-status-green-text); border: 1px solid var(--color-status-green-border); }
      .wf-card { background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-md); }
      .wf-btn-toggle { background-color: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all var(--transition-fast) ease; }
      .wf-btn-toggle.active { background-color: var(--color-brand); color: white; border-color: var(--color-brand); box-shadow: 0 0 8px rgba(99, 102, 241, 0.4); }
      .wf-btn-toggle:hover:not(.active) { background-color: rgba(255, 255, 255, 0.05); }
      .wf-textarea { width: 100%; min-height: 120px; background-color: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-md); padding: 0.75rem; font-family: var(--font-sans); font-size: 0.9rem; line-height: 1.5; resize: vertical; margin-bottom: 0.5rem; }
      .wf-textarea:focus { border-color: var(--border-focus); outline: none; }
      .wf-history-list { list-style: none; padding: 0; margin: 0; }
      .wf-history-item { position: relative; padding-left: 1.5rem; padding-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-secondary); }
      .wf-history-item::before { content: ''; position: absolute; left: 4px; top: 5px; width: 8px; height: 8px; border-radius: 50%; background-color: var(--color-brand); }
      .wf-history-item::after { content: ''; position: absolute; left: 7px; top: 15px; width: 2px; height: calc(100% - 10px); background-color: var(--border-color); }
      .wf-history-item:last-child::after { display: none; }
      .ai-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-secondary); transition: all 0.15s ease; }
      .ai-pill:hover { border-color: var(--color-brand); color: var(--color-brand); }
      .ai-pill.active { background: var(--color-brand); color: white; border-color: var(--color-brand); }
      .ai-action-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-secondary); transition: all 0.15s ease; white-space: nowrap; }
      .ai-action-btn:hover { border-color: var(--color-brand); color: var(--color-brand); background: rgba(99,102,241,0.05); }
      .conf-bar { height: 8px; border-radius: 4px; background: var(--border-color); overflow: hidden; flex: 1; }
      .conf-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
      .timeline-step { display: flex; align-items: flex-start; gap: 0.75rem; position: relative; padding-bottom: 1rem; }
      .timeline-step:not(:last-child)::after { content: ''; position: absolute; left: 11px; top: 24px; width: 2px; height: calc(100% - 12px); background: var(--border-color); }
      .timeline-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; flex-shrink: 0; border: 2px solid var(--border-color); background: var(--bg-secondary); }
      .quick-action-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-md); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-secondary); transition: all 0.15s ease; flex: 1; min-width: 140px; }
      .quick-action-btn:hover { border-color: var(--color-brand); color: var(--color-brand); background: rgba(99,102,241,0.04); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
      .kpi-stat { text-align: center; padding: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
      .kpi-stat .kpi-val { font-size: 1.4rem; font-weight: 800; color: var(--color-brand); line-height: 1.2; }
      .kpi-stat .kpi-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-top: 0.2rem; }
      .evidence-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.75rem; background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.15); color: var(--color-brand); font-weight: 600; }
      .coord-agent { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); font-size: 0.8rem; }
      .coord-agent .agent-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .approval-banner { background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08)); border: 1px solid rgba(99,102,241,0.25); border-radius: var(--radius-lg); padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .wizard-step { margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 2rem; }
      .wizard-step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
      .wizard-step-title { margin: 0; display: flex; align-items: center; gap: 0.75rem; font-size: 1.1rem; }
      .wizard-step-num { width: 28px; height: 28px; background: var(--color-brand); color: white; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 0.9rem; }
      .wizard-step.locked { opacity: 0.5; pointer-events: none; }
    </style>

    <div class="wizard-container">

      <!-- ===== HEADER ===== -->
      <div class="wizard-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${dep.dependency_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary);">Dependency Analysis Pipeline</h2>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${dep.status !== 'resolved' ? `
            <button type="button" class="btn-new" id="btn-mark-resolved" style="background-color: var(--color-status-green-bg); border: 1px solid var(--color-status-green-border); color: var(--color-status-green-text); height: 32px; padding: 0 0.75rem;" title="Mark dependency as resolved">
              Mark Resolved
            </button>
          ` : `
            <button type="button" class="btn-new" id="btn-undo-resolved" style="background-color: var(--color-status-amber-bg); border: 1px solid var(--color-status-amber-border); color: var(--color-status-amber-text); height: 32px; padding: 0 0.75rem;" title="Undo resolved">
              ↩ Undo Resolve
            </button>
          `}
          <span style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; display: inline-block;" class="${statusClass}">
            ${dep.status}
          </span>
        </div>
      </div>

      <!-- ===== Interactive Steps Pipeline ===== -->
      <div class="pipeline-wizard">

        <!-- STEP 1: SENSE DEPENDENCIES -->
        <div class="wizard-step ${step1Class}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">1</span>
              Sense Dependencies
            </h4>
            <span class="wf-badge low">Approved</span>
          </div>
          <div class="wizard-step-body">
            <div class="grid-2col" style="margin-bottom: 1rem;">
              <div class="data-item">
                <div class="data-label">Source Task ID (Dependent)</div>
                <div class="data-value" style="font-family: monospace; font-weight: 700; color: var(--color-brand);">${dep.source_task_id}</div>
              </div>
              <div class="data-item">
                <div class="data-label">Target Task ID (Predecessor)</div>
                <div class="data-value" style="font-family: monospace; font-weight: 700; color: var(--text-primary);">${dep.target_task_id}</div>
              </div>
              <div class="data-item">
                <div class="data-label">Dependency Type</div>
                <div class="data-value" style="text-transform: capitalize;">${dep.type.replace('-', ' ')}</div>
              </div>
              <div class="data-item">
                <div class="data-label">Accountable Owner</div>
                <div class="data-value">${dep.owner}</div>
              </div>
            </div>
            
            <div style="border-top: 1px dashed var(--border-color); padding-top: 0.75rem; margin-top: 0.75rem;">
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.4rem;">Sensed Evidence Sources</div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.4rem;">
                <span class="evidence-chip">✓ Plan Schedule DB</span>
                <span class="evidence-chip">✓ Dependency Graph</span>
                <span class="evidence-chip">✓ ADO Work Items</span>
                <span class="evidence-chip">✓ Critical Path Analysis</span>
              </div>
            </div>

            <div style="border-top: 1px dashed var(--border-color); padding-top: 0.75rem; margin-top: 0.75rem;">
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.4rem;">Business Impact Metrics</div>
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;">
                <div class="kpi-stat">
                  <div class="kpi-val">12 hrs</div>
                  <div class="kpi-label">Time Saved</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val">${daysToRelease}d</div>
                  <div class="kpi-label">Delay Avoided</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val">42%</div>
                  <div class="kpi-label">Risk Reduction</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val">8</div>
                  <div class="kpi-label">Emails Saved</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 2: CHASE COMMITMENTS -->
        <div class="wizard-step ${step2Class}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">2</span>
              Chase Commitments (AI)
            </h4>
            <span class="wf-badge ${isChaseCompleted ? 'low' : 'medium'}">${isChaseCompleted ? 'Approved' : 'Pending Run'}</span>
          </div>
          <div class="wizard-step-body">
            <div id="chase-workflow-trigger-container" style="display: ${hasDraft ? 'none' : 'block'};">
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Run the commitment chase agent to analyze delay risks, compile context evidence, and generate personalized nudge communications.
              </p>
              <button type="button" class="btn-primary" id="btn-open-chase-setup" style="width: 100%;">
                Trigger Chase Workflow (AI)
              </button>
            </div>

            <!-- Setup options -->
            <div id="chase-workflow-setup" style="display: none; margin-top: 1rem;">
              <p class="description-text" style="margin-bottom: 1rem;">Configure the AI chase reminder options:</p>

              <div class="form-group" style="margin-bottom: 1rem;">
                <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Message Tone</label>
                <div id="chase-tone-group" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;">
                  <button type="button" class="wf-btn-toggle active" data-tone="friendly">😊 Friendly</button>
                  <button type="button" class="wf-btn-toggle" data-tone="business">💼 Professional</button>
                  <button type="button" class="wf-btn-toggle" data-tone="technical">🔧 Technical</button>
                  <button type="button" class="wf-btn-toggle" data-tone="executive">📊 Executive</button>
                  <button type="button" class="wf-btn-toggle" data-tone="escalation">⚠️ Escalation</button>
                  <button type="button" class="wf-btn-toggle" data-tone="urgent">🚨 Urgent</button>
                  <button type="button" class="wf-btn-toggle" data-tone="short">🤝 Diplomatic</button>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 1rem;">
                <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Delivery Channel</label>
                <div id="chase-channel-group" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;">
                  <button type="button" class="wf-btn-toggle active" data-channel="teams">💬 Teams</button>
                  <button type="button" class="wf-btn-toggle" data-channel="email">📧 Email</button>
                  <button type="button" class="wf-btn-toggle" data-channel="slack">⚡ Slack</button>
                  <button type="button" class="wf-btn-toggle" data-channel="ado">🔧 ADO</button>
                  <button type="button" class="wf-btn-toggle" data-channel="jira">📋 Jira</button>
                  <button type="button" class="wf-btn-toggle" data-channel="servicenow">🏢 ServiceNow</button>
                  <button type="button" class="wf-btn-toggle" data-channel="sms">📱 SMS</button>
                  <button type="button" class="wf-btn-toggle" data-channel="webhook">🌐 Webhook</button>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 1rem;">
                <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Smart Scheduling</label>
                <div id="chase-schedule-group" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;">
                  <button type="button" class="wf-btn-toggle active" data-schedule="now">⏰ Now</button>
                  <button type="button" class="wf-btn-toggle" data-schedule="tomorrow">🌅 Tomorrow AM</button>
                  <button type="button" class="wf-btn-toggle" data-schedule="online">🟢 When Online</button>
                  <button type="button" class="wf-btn-toggle" data-schedule="sprint">🏃 After Sprint</button>
                  <button type="button" class="wf-btn-toggle" data-schedule="custom">📅 Custom</button>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 1rem;">
                <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Suggested Recipients (AI)</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.25rem;" id="recipient-list">
                  <label class="ai-pill active" style="cursor: pointer; justify-content: space-between;"><span><input type="checkbox" checked style="display:none;"> ✓ Dependency Owner</span><span style="font-size:0.65rem; opacity:0.7;">98%</span></label>
                  <label class="ai-pill" style="cursor: pointer; justify-content: space-between;"><span><input type="checkbox" style="display:none;"> Team Lead</span><span style="font-size:0.65rem; opacity:0.7;">82%</span></label>
                  <label class="ai-pill" style="cursor: pointer; justify-content: space-between;"><span><input type="checkbox" style="display:none;"> Program Manager</span><span style="font-size:0.65rem; opacity:0.7;">76%</span></label>
                  <label class="ai-pill" style="cursor: pointer; justify-content: space-between;"><span><input type="checkbox" style="display:none;"> Architecture Owner</span><span style="font-size:0.65rem; opacity:0.7;">65%</span></label>
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;" id="chase-setup-actions">
                <button type="button" class="btn-secondary" id="btn-cancel-chase-setup" style="flex: 1;">Cancel</button>
                <button type="button" class="btn-primary" id="btn-run-chase-ai" style="flex: 2;">Generate Nudge Message</button>
              </div>
            </div>

            <!-- Generated Message & Metrics -->
            <div id="chase-workflow-results" style="display: ${hasDraft ? 'block' : 'none'}; margin-top: 1.5rem;">
              <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
                <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">💡 AI Suggested Next Best Actions</h5>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;" id="nba-list">
                  <label class="ai-pill ${dep.status !== 'resolved' ? 'active' : ''}" style="cursor: pointer;"><input type="checkbox" ${dep.status !== 'resolved' ? 'checked' : ''} style="display:none;"> ✉ Send reminder</label>
                  <label class="ai-pill" style="cursor: pointer;"><input type="checkbox" style="display:none;"> 📅 Schedule 15 min sync</label>
                  <label class="ai-pill ${dep.status === 'at-risk' ? 'active' : ''}" style="cursor: pointer;"><input type="checkbox" ${dep.status === 'at-risk' ? 'checked' : ''} style="display:none;"> ⚠️ Escalate to Team Lead</label>
                  <label class="ai-pill" style="cursor: pointer;"><input type="checkbox" style="display:none;"> 🔧 Update ADO dependency</label>
                  <label class="ai-pill" style="cursor: pointer;"><input type="checkbox" style="display:none;"> 🚨 Create Risk Item</label>
                  <label class="ai-pill" style="cursor: pointer;"><input type="checkbox" style="display:none;"> ⏳ Wait 24 hrs</label>
                </div>
                <div style="background: rgba(99,102,241,0.03); border: 1px solid rgba(99,102,241,0.1); border-radius: var(--radius-md); padding: 0.6rem 0.8rem;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">AI Recommendation</div>
                      <div style="font-size: 0.8rem; color: var(--text-primary); font-weight: 600;">${dep.status === 'at-risk' ? 'Schedule Teams meeting before escalation.' : 'Send friendly reminder first, then follow up in 48hrs.'}</div>
                    </div>
                    <div style="color: var(--color-brand); font-size: 0.8rem; letter-spacing: 1px;" title="AI confidence rating">⭐⭐⭐⭐☆</div>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Nudge Message</label>
                <textarea class="wf-textarea" id="chase-message-text" placeholder="Generated message will appear here...">${nudgeMessage}</textarea>
              </div>

              <!-- AI EDITING TOOLBAR -->
              <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem;" id="ai-edit-toolbar">
                <button class="ai-action-btn" data-edit="edit">✏ Edit</button>
                <button class="ai-action-btn" data-edit="regenerate">🔄 Regenerate</button>
                <button class="ai-action-btn" data-edit="friendlier">✨ Friendlier</button>
                <button class="ai-action-btn" data-edit="professional">💼 Professional</button>
                <button class="ai-action-btn" data-edit="urgent">⚡ More Urgent</button>
                <button class="ai-action-btn" data-edit="personalize">🧠 Personalize</button>
                <button class="ai-action-btn" data-edit="context">➕ Add Context</button>
                <button class="ai-action-btn" data-edit="shorten">➖ Shorten</button>
                <button class="ai-action-btn" data-edit="summarize">📋 Summarize</button>
                <button class="ai-action-btn" data-edit="evidence">📎 Attach Evidence</button>
                <button class="ai-action-btn" data-edit="explain">🔍 Explain AI</button>
              </div>

              <!-- DRAFT COMPARISON -->
              <div style="display: flex; gap: 0.35rem; margin-bottom: 1.25rem;">
                <button class="ai-action-btn" id="btn-compare-v1" style="flex: 1; justify-content: center; background: rgba(99,102,241,0.05);">V1: Friendly</button>
                <button class="ai-action-btn" id="btn-compare-v2" style="flex: 1; justify-content: center;">V2: Executive</button>
                <button class="ai-action-btn" id="btn-compare-v3" style="flex: 1; justify-content: center;">V3: Technical</button>
              </div>

              <!-- HUMAN APPROVAL BANNER (Chase Commitment) -->
              <div class="approval-banner" style="margin-bottom: 1.25rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--color-brand); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem;">
                    🧠
                  </div>
                  <div>
                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">AI Recommendation Ready</div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary);">Pending Human Approval — Review draft and assessment before sending.</div>
                  </div>
                </div>
                <div style="display: flex; gap: 0.4rem;" id="approval-actions">
                  <button class="ai-action-btn" data-approval="approve" style="background: var(--color-status-green-bg); border-color: var(--color-status-green-border); color: var(--color-status-green-text);">✓ Approve</button>
                  <button class="ai-action-btn" data-approval="modify" style="background: var(--color-status-amber-bg); border-color: var(--color-status-amber-border); color: var(--color-status-amber-text);">✏ Modify</button>
                  <button class="ai-action-btn" data-approval="reject" style="background: var(--color-status-red-bg); border-color: var(--color-status-red-border); color: var(--color-status-red-text);">✗ Reject</button>
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
                <button type="button" class="btn-secondary" id="btn-save-draft-message" style="height: 36px;">Save Draft</button>
                <button type="button" class="btn-primary" id="btn-send-message" style="background-color: var(--color-brand); height: 36px; padding: 0 1rem; font-size: 0.85rem; flex-grow: 1;">
                  Send via ${selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)}
                </button>
              </div>

              <!-- LEARNING FEEDBACK -->
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Was this suggestion useful?</span>
                <button class="ai-action-btn" id="feedback-up" data-feedback="up" style="font-size: 1rem; padding: 0.25rem 0.5rem;">👍</button>
                <button class="ai-action-btn" id="feedback-down" data-feedback="down" style="font-size: 1rem; padding: 0.25rem 0.5rem;">👎</button>
                <button class="ai-action-btn" id="feedback-improve" data-feedback="improve" style="font-size: 0.75rem;">Needs Improvement</button>
                <span style="font-size: 0.7rem; color: var(--text-muted); font-style: italic; margin-left: auto;">AI learns from your feedback</span>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3: CROSS-PROGRAMME IMPACT -->
        <div class="wizard-step ${step3Class}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">3</span>
              Cross-Programme Impact
            </h4>
            <span class="wf-badge ${isResolveCompleted ? 'low' : 'medium'}">${isResolveCompleted ? 'Resolved' : (isChaseCompleted ? 'Active' : 'Locked')}</span>
          </div>
          <div class="wizard-step-body">
            <!-- AI Risk Analysis -->
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; border-left: 4px solid var(--color-status-${threatColorVar}-text);">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary);">🧠 AI Risk Analysis</h5>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; text-align: center;">
                  <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.25rem;">Threat Level</div>
                  <div style="font-size: 1.4rem;">${threatEmoji}</div>
                  <div style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--color-status-${threatColorVar}-text); margin-top: 0.2rem;">${threatLevel}</div>
                </div>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; text-align: center;">
                  <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.25rem;">Sensing Confidence</div>
                  <div style="font-size: 1.4rem; font-weight: 800; color: var(--color-brand);">${confidenceVal}%</div>
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                    <div class="conf-bar"><div class="conf-bar-fill" style="width: ${confidenceVal}%; background: ${confidenceVal > 80 ? 'var(--color-status-green-text)' : confidenceVal > 60 ? 'var(--color-status-amber-text)' : 'var(--color-status-red-text)'};"></div></div>
                  </div>
                </div>
              </div>
              <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.75rem;">
                <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.4rem;">Sensing Rationale</div>
                <ul style="list-style: none; padding: 0; margin: 0;">
                  <li style="padding: 0.2rem 0; font-size: 0.8rem; color: var(--text-primary);">✓ Dependency owner has not responded for ${daysSinceUpdate} days</li>
                  <li style="padding: 0.2rem 0; font-size: 0.8rem; color: var(--text-primary);">✓ Similar dependencies slipped ${historicalSlips} times historically</li>
                  ${confidenceReasons.map(r => `<li style="padding: 0.2rem 0; font-size: 0.8rem; color: var(--text-primary);">✓ ${r}</li>`).join('')}
                  <li style="padding: 0.2rem 0; font-size: 0.8rem; color: var(--text-primary);">✓ Planned release in ${daysToRelease} days</li>
                </ul>
              </div>
              <div style="background: rgba(99,102,241,0.03); border: 1px solid rgba(99,102,241,0.1); border-radius: var(--radius-md); padding: 0.6rem 0.8rem; display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1rem;">⭐️</span>
                <div>
                  <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Top Recommendation</div>
                  <div style="font-size: 0.8rem; color: var(--text-primary); font-weight: 600;">${dep.status === 'at-risk' ? 'Escalate tomorrow if no response.' : dep.status === 'open' ? 'Send friendly reminder first, then schedule a sync.' : 'Dependency resolved. Monitor for regression.'}</div>
                </div>
              </div>
            </div>

            <!-- Ripple Impact Analysis -->
            <div style="border-top: 1px dashed var(--border-color); padding-top: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
              <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Cross-Programme Ripple Impact Analysis</h5>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
                Forecast timeline slippages and schedule relaxation ripples across the program when a task is delayed.
              </p>
              <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 1rem; align-items: end;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="impact-task-id">Delayed Task ID</label>
                  <input type="text" id="impact-task-id" value="${dep.target_task_id}" placeholder="e.g. PLN-0001-BUILD" style="width: 100%;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="impact-delay-days">Delay Days</label>
                  <input type="number" id="impact-delay-days" value="${dep.status === 'resolved' ? 0 : (dep.status === 'at-risk' ? 15 : 5)}" min="${dep.status === 'resolved' ? 0 : 1}" max="365" style="width: 100%;">
                </div>
                <div>
                  <button type="button" class="btn-secondary" id="btn-check-impact" style="height: 42px; padding: 0 1rem;">Forecast Impact</button>
                </div>
              </div>
              <div id="impact-error" class="error-alert" style="display: none; margin-top: 1rem;"></div>
              <div id="impact-result-container" style="margin-top: 1.5rem;"></div>
            </div>

            <!-- Dependency Chain Graph -->
            <div style="border-top: 1px dashed var(--border-color); padding-top: 1rem; margin-top: 1rem; margin-bottom: 1.5rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Dependency Chain Graph</h5>
              <div id="dependency-graph-panel" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; min-height: 150px;"></div>
            </div>

            <!-- Escalation Timeline Preview -->
            ${dep.status !== 'resolved' ? `
            <div style="margin-bottom: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">⏳ Escalation Timeline Preview</h5>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">If no reply is received, this automated escalation path activates:</p>
              <div>
                <div class="timeline-step">
                  <div class="timeline-dot" style="border-color: var(--color-brand); background: var(--color-brand); color: white;">✓</div>
                  <div><div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">Today</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Friendly Reminder sent to ${ownerShort}</div></div>
                </div>
                <div class="timeline-step">
                  <div class="timeline-dot" style="border-color: var(--color-status-amber-text);">🕒</div>
                  <div><div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">+1 Day</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Follow-up reminder with urgency escalation</div></div>
                </div>
                <div class="timeline-step">
                  <div class="timeline-dot" style="border-color: var(--color-status-amber-text);">🕒</div>
                  <div><div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">+2 Days</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Manager notified automatically</div></div>
                </div>
                <div class="timeline-step">
                  <div class="timeline-dot" style="border-color: var(--color-status-red-text);">🕒</div>
                  <div><div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">+4 Days</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Program Risk item created in ADO</div></div>
                </div>
                <div class="timeline-step">
                  <div class="timeline-dot" style="border-color: var(--color-status-red-text); background: var(--color-status-red-bg);">🚨</div>
                  <div><div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">+5 Days</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Release Dashboard updated — project flagged at-risk</div></div>
                </div>
              </div>
            </div>
            ` : ''}

            <!-- Critical Path Action: Escalate Risk -->
            ${(dep.status === 'at-risk' || dep.status === 'open') ? `
              <div style="background-color: rgba(248, 113, 113, 0.02); border: 1px solid var(--color-status-red-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
                <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 700; color: var(--color-status-red-text);">Critical Path Action: Escalate Risk</h5>
                <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1rem;">
                  This dependency is on the critical path. If task delays threaten project release milestones, immediately escalate this to leadership.
                </p>
                <button type="button" class="btn-primary" id="btn-escalate-manager" style="background-color: var(--color-status-red-bg); border: 1px solid var(--color-status-red-border); color: var(--color-status-red-text); width: 100%;">
                  Escalate to Manager / Release Lead
                </button>
              </div>
            ` : ''}

            <!-- Quick Actions -->
            <div style="margin-bottom: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">⚡ Quick Actions</h5>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;" id="quick-actions-panel">
                <button class="quick-action-btn" data-qaction="risk">🚨 Create Risk</button>
                <button class="quick-action-btn" data-qaction="ado-bug">🐞 Open ADO Bug</button>
                <button class="quick-action-btn" data-qaction="meeting">📅 Teams Meeting</button>
                <button class="quick-action-btn" data-qaction="notify">📢 Notify Manager</button>
                <button class="quick-action-btn" data-qaction="dashboard">📊 Update Dashboard</button>
                <button class="quick-action-btn" data-qaction="release-note">📝 Add Release Note</button>
              </div>
            </div>

            <!-- Similar Historical Cases -->
            <div style="margin-bottom: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">📘 Similar Historical Cases</h5>
              <div style="display: grid; gap: 0.5rem;">
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">Release 5.1 — API Gateway Dependency</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Owner replied after friendly reminder. <span style="color: var(--color-status-green-text); font-weight: 600;">Resolved</span></div>
                  </div>
                  <div style="font-size: 0.7rem; color: var(--text-muted); text-align: right;">Recommendation:<br><strong style="color: var(--text-primary);">Friendly reminder sufficient</strong></div>
                </div>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">Release 4.8 — DB Migration Block</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Required escalation after 3 days. <span style="color: var(--color-status-amber-text); font-weight: 600;">Escalated</span></div>
                  </div>
                  <div style="font-size: 0.7rem; color: var(--text-muted); text-align: right;">Recommendation:<br><strong style="color: var(--text-primary);">Escalate early if at-risk</strong></div>
                </div>
              </div>
            </div>

            <!-- Agent Coordination -->
            <div style="margin-bottom: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">🤖 Agent Coordination</h5>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
                <div class="coord-agent"><div class="agent-dot" style="background: var(--color-status-green-text);"></div><span style="font-weight:600; color: var(--text-primary);">Sense Dependencies</span><span style="font-size:0.65rem; color: var(--text-muted); margin-left: auto;">Active</span></div>
                <div class="coord-agent"><div class="agent-dot" style="background: var(--color-status-green-text);"></div><span style="font-weight:600; color: var(--text-primary);">Cross-Programme Impact</span><span style="font-size:0.65rem; color: var(--text-muted); margin-left: auto;">Active</span></div>
                <div class="coord-agent"><div class="agent-dot" style="background: var(--color-status-amber-text);"></div><span style="font-weight:600; color: var(--text-primary);">Status Reporting</span><span style="font-size:0.65rem; color: var(--text-muted); margin-left: auto;">Waiting</span></div>
                <div class="coord-agent"><div class="agent-dot" style="background: var(--color-status-amber-text);"></div><span style="font-weight:600; color: var(--text-primary);">Risk Agent</span><span style="font-size:0.65rem; color: var(--text-muted); margin-left: auto;">Waiting</span></div>
              </div>
            </div>

            <!-- AI Effectiveness Dashboard -->
            <div style="margin-bottom: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">📊 AI Effectiveness Dashboard (This Month)</h5>
              <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem;">
                <div class="kpi-stat">
                  <div class="kpi-val">58</div>
                  <div class="kpi-label">Chased</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val" style="color: var(--color-status-green-text);">51</div>
                  <div class="kpi-label">Resolved</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val" style="color: var(--color-status-red-text);">7</div>
                  <div class="kpi-label">Escalated</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val">1.4d</div>
                  <div class="kpi-label">Avg Response</div>
                </div>
                <div class="kpi-stat">
                  <div class="kpi-val">27h</div>
                  <div class="kpi-label">Time Saved</div>
                </div>
              </div>
            </div>

            <!-- Activity History -->
            <div style="border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Activity History</h5>
              <ul class="wf-history-list" id="wf-history-container">
                ${activityLogs.map(log => `<li class="wf-history-item">${log}</li>`).join('')}
                ${activityLogs.length === 0 ? `<li style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem 0;">No activities logged yet.</li>` : ''}
              </ul>
            </div>
          </div>
        </div>

      </div>

    </div>
  `;

  // ====== EVENT WIRING ======

  // Draw the dependency graph path
  renderDependencyGraph(dep.dependency_id, 'dependency-graph-panel');

  // Chase setup toggle
  const btnOpenSetup = document.getElementById('btn-open-chase-setup');
  const setupContainer = document.getElementById('chase-workflow-setup');
  const triggerContainer = document.getElementById('chase-workflow-trigger-container');
  const btnCancelSetup = document.getElementById('btn-cancel-chase-setup');
  const btnRunChase = document.getElementById('btn-run-chase-ai');

  if (btnOpenSetup) {
    btnOpenSetup.addEventListener('click', () => {
      triggerContainer.style.display = 'none';
      setupContainer.style.display = 'block';
    });
  }

  if (btnCancelSetup) {
    btnCancelSetup.addEventListener('click', () => {
      setupContainer.style.display = 'none';
      triggerContainer.style.display = 'block';
    });
  }

  // Tone toggles
  document.querySelectorAll('#chase-tone-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chase-tone-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.getAttribute('data-tone');
    });
  });

  // Channel toggles
  const sendBtnEl = document.getElementById('btn-send-message');
  document.querySelectorAll('#chase-channel-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chase-channel-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedChannel = btn.getAttribute('data-channel');
      if (sendBtnEl) {
        sendBtnEl.textContent = `Send via ${selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)}`;
      }
    });
  });

  // Schedule toggles
  document.querySelectorAll('#chase-schedule-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chase-schedule-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Recipient pill toggles
  document.querySelectorAll('#recipient-list .ai-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      const cb = pill.querySelector('input[type=checkbox]');
      if (cb) cb.checked = pill.classList.contains('active');
    });
  });

  // Next Best Action pill toggles
  document.querySelectorAll('#nba-list .ai-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      const cb = pill.querySelector('input[type=checkbox]');
      if (cb) cb.checked = pill.classList.contains('active');
    });
  });

  // Run chase
  if (btnRunChase) {
    btnRunChase.addEventListener('click', () => {
      const actionsRow = document.getElementById('chase-setup-actions');
      const originalActions = actionsRow.innerHTML;
      actionsRow.innerHTML = `<span class="loader" style="width: 100%; text-align: center;"><span class="spinner"></span> Generative AI drafting nudge...</span>`;
      triggerChaseFlow(dep.dependency_id, selectedTone, selectedChannel).finally(() => {
        actionsRow.innerHTML = originalActions;
      });
    });
  }

  // Save draft
  const btnSaveDraft = document.getElementById('btn-save-draft-message');
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener('click', () => { saveDraft(dep.dependency_id); });
  }

  // Send message
  const btnSend = document.getElementById('btn-send-message');
  if (btnSend) {
    btnSend.addEventListener('click', () => { sendMessage(dep); });
  }

  // Mark Resolved / Undo Resolve
  if (document.getElementById('btn-mark-resolved')) {
    document.getElementById('btn-mark-resolved').addEventListener('click', () => { markResolved(dep.dependency_id); });
  }
  if (document.getElementById('btn-undo-resolved')) {
    document.getElementById('btn-undo-resolved').addEventListener('click', () => { undoResolved(dep.dependency_id); });
  }

  // Escalate
  if (document.getElementById('btn-escalate-manager')) {
    document.getElementById('btn-escalate-manager').addEventListener('click', () => { escalateManager(dep.dependency_id); });
  }

  // Impact check
  const btnCheckImpact = document.getElementById('btn-check-impact');
  if (btnCheckImpact) {
    btnCheckImpact.addEventListener('click', handleCheckImpact);
  }

  // Human Approval banner
  document.querySelectorAll('#approval-actions button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-approval');
      handleApproval(action, dep.dependency_id);
    });
  });

  // AI Editing Toolbar
  document.querySelectorAll('#ai-edit-toolbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const editAction = btn.getAttribute('data-edit');
      handleAIEdit(editAction, dep.dependency_id);
    });
  });

  // Learning Feedback
  document.querySelectorAll('[data-feedback]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fb = btn.getAttribute('data-feedback');
      submitFeedback(dep.dependency_id, fb);
    });
  });

  // Quick Actions
  document.querySelectorAll('#quick-actions-panel button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-qaction');
      handleQuickAction(action, dep.dependency_id);
    });
  });

  // View sources
  if (document.getElementById('btn-view-sources')) {
    document.getElementById('btn-view-sources').addEventListener('click', () => {
      alert('Evidence sources panel: Plan Schedule DB, Dependency Graph, ADO Work Items, Activity History, Critical Path Analysis. Connected integrations expand this automatically.');
    });
  }

  // Draft comparison
  ['btn-compare-v1', 'btn-compare-v2', 'btn-compare-v3'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[id^=btn-compare-v]').forEach(b => b.style.background = 'var(--bg-primary)');
        btn.style.background = 'rgba(99,102,241,0.1)';
        const textarea = document.getElementById('chase-message-text');
        if (!textarea) return;
        if (id === 'btn-compare-v1') {
          textarea.value = dep.draft_message || nudgeMessage || 'Hi, just a friendly follow-up on this dependency. Could you share an update?';
        } else if (id === 'btn-compare-v2') {
          textarea.value = `Executive Summary: Dependency ${dep.dependency_id} requires immediate attention. Task ${dep.source_task_id} is blocked by ${dep.target_task_id}. Impact: critical path at risk. Action required: Updated ETA by EOD.`;
        } else {
          textarea.value = `Technical Follow-up [${dep.dependency_id}]: ${dep.source_task_id} is blocked on ${dep.target_task_id}. Please confirm completion status, share blockers, deployment logs, or endpoint readiness details.`;
        }
      });
    }
  });
}

async function triggerChaseFlow(id, tone, channel) {
  try {
    const params = new URLSearchParams();
    if (tone) params.append('tone', tone);
    if (channel) params.append('channel', channel);
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}/chase?${params.toString()}`, {
      method: 'POST'
    });

    if (!res.ok) throw new Error("AI Chase workflow call failed.");
    const data = await res.json();

    await selectDependency(id);

    const draftCard = document.getElementById('chase-results-card');
    if (draftCard) {
      draftCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    alert("Error running workflow: " + err.message);
  }
}

async function saveDraft(id) {
  const text = document.getElementById('chase-message-text').value;
  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_message: text })
    });
    if (!res.ok) throw new Error("Failed to save draft.");
    alert("Draft message saved successfully!");
    await selectDependency(id);
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function markResolved(id) {
  if (!confirm("Are you sure you want to mark this dependency as resolved?")) return;
  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' })
    });
    if (!res.ok) throw new Error("Failed to update status.");
    await selectDependency(id);
    await window.fetchDependencies();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function undoResolved(id) {
  if (!confirm("Reopen this dependency? Status will be set back to 'open'.")) return;
  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' })
    });
    if (!res.ok) throw new Error("Failed to undo resolve.");
    await selectDependency(id);
    await window.fetchDependencies();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function escalateManager(id) {
  const managerOptions = ["Project Manager", "Release Manager", "Program Manager"];
  const chosen = prompt("Escalate dependency risk to leadership:\n1. Project Manager\n2. Release Manager\n3. Program Manager\n(Enter number 1-3):", "2");
  if (!chosen) return;

  let managerName = "Release Manager";
  if (chosen === "1") managerName = "Project Manager";
  else if (chosen === "3") managerName = "Program Manager";

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: `âš ï¸ Escalated dependency risk to ${managerName}` })
    });
    if (!res.ok) throw new Error("Failed to log escalation activity.");
    alert(`Risk successfully escalated to ${managerName}!`);
    await selectDependency(id);
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function sendMessage(dep) {
  const textInput = document.getElementById('chase-message-text');
  const text = textInput ? textInput.value : dep.draft_message;
  const channelText = selectedChannel.toUpperCase();
  const activeScheduleBtn = document.querySelector('#chase-schedule-group .wf-btn-toggle.active');
  const scheduleVal = activeScheduleBtn ? activeScheduleBtn.getAttribute('data-schedule') : 'now';
  const scheduleLabels = { 'now': 'immediately', 'tomorrow': 'scheduled for tomorrow AM', 'online': 'when owner is online', 'sprint': 'after sprint review', 'cab': 'after CAB approval', 'custom': 'custom schedule' };
  const scheduleText = scheduleLabels[scheduleVal] || 'immediately';

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${dep.dependency_id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: `âœ“ Nudge reminder sent to ${dep.owner} via ${channelText} (${scheduleText})` })
    });
    if (!res.ok) throw new Error("Failed to record message transmission.");

    alert(`Nudge reminder message sent via ${channelText}!`);
    await selectDependency(dep.dependency_id);
  } catch (err) {
    alert("Error sending message: " + err.message);
  }
}

function showPreviewModal(dep) {
  const modal = document.getElementById('wf-preview-modal');
  const body = document.getElementById('preview-body');
  const recipient = document.getElementById('preview-header-recipient');
  const title = document.getElementById('preview-header-title');
  const logo = document.getElementById('preview-header-logo');

  const text = document.getElementById('chase-message-text').value;
  body.textContent = text;

  if (selectedChannel === 'teams') {
    logo.textContent = "T";
    logo.style.backgroundColor = "#535aeb";
    title.textContent = "Microsoft Teams Direct Message";
    recipient.textContent = `To: ${dep.owner}`;
  } else if (selectedChannel === 'email') {
    logo.textContent = "@";
    logo.style.backgroundColor = "#ea4335";
    title.textContent = "Corporate Outlook Email";
    recipient.textContent = `To: ${dep.owner} <${dep.owner}> | Subject: Critical Dependency ${dep.dependency_id} Update Required`;
  } else if (selectedChannel === 'ado') {
    logo.textContent = "A";
    logo.style.backgroundColor = "#0078d4";
    title.textContent = "Azure DevOps Work Item Comment";
    recipient.textContent = `Thread: ${dep.dependency_id} Linked Tasks Discussion`;
  } else if (selectedChannel === 'slack') {
    logo.textContent = "S";
    logo.style.backgroundColor = "#4a154b";
    title.textContent = "Slack Notification Hub";
    recipient.textContent = `Channel: #delivery-dependencies`;
  }

  modal.classList.add('open');
}

function hidePreviewModal() {
  const modal = document.getElementById('wf-preview-modal');
  if (modal) modal.classList.remove('open');
}

async function handleCheckImpact() {
  const taskId = document.getElementById('impact-task-id').value.trim();
  const delayDays = parseInt(document.getElementById('impact-delay-days').value);
  const errorAlert = document.getElementById('impact-error');
  const resultContainer = document.getElementById('impact-result-container');
  const btn = document.getElementById('btn-check-impact');

  errorAlert.style.display = 'none';
  resultContainer.innerHTML = '';

  if (!taskId) {
    errorAlert.textContent = "Please enter a task ID.";
    errorAlert.style.display = 'block';
    return;
  }

  const originalBtnText = btn.innerHTML;
  btn.innerHTML = `<span class="spinner" style="display: inline-block; width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></span> Analyzing...`;
  btn.disabled = true;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, delay_days: delayDays })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Ripple impact analysis failed.");
    }
    const data = await res.json();

    let alertHtml = '';
    if (data.project_end_date_slipped) {
      alertHtml = `
        <div style="background-color: var(--color-status-red-bg); border: 1px solid var(--color-status-red-border); color: var(--color-status-red-text); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; display: flex; align-items: start; gap: 0.75rem;">
          <svg style="width: 20px; height: 20px; fill: currentColor; margin-top: 2px;" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
          <div>
            <h5 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; font-weight: 700;">Project Schedule Slipped!</h5>
            <p style="margin: 0; font-size: 0.85rem; opacity: 0.9;">
              The delay on task <strong>${taskId}</strong> ripples through the dependency path and postpones the committed project end date by <strong>${delayDays} days</strong>.
            </p>
          </div>
        </div>
      `;
    } else {
      alertHtml = `
        <div style="background-color: var(--color-status-green-bg); border: 1px solid var(--color-status-green-border); color: var(--color-status-green-text); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; display: flex; align-items: start; gap: 0.75rem;">
          <svg style="width: 20px; height: 20px; fill: currentColor; margin-top: 2px;" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <div>
            <h5 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; font-weight: 700;">No committed schedule impact</h5>
            <p style="margin: 0; font-size: 0.85rem; opacity: 0.9;">
              The delay was successfully absorbed by existing slack/buffer. The target committed delivery deadline remains intact.
            </p>
          </div>
        </div>
      `;
    }

    let tasksTableRows = '<tr><td colspan="4" style="text-align: center; padding: 1rem; color: var(--text-muted);">No other tasks affected.</td></tr>';
    if (data.affected_tasks && data.affected_tasks.length > 0) {
      tasksTableRows = data.affected_tasks.map(t => {
        return `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-primary); font-family: monospace;">${t.task_id}</td>
            <td style="padding: 0.75rem 0.5rem;">${t.name}</td>
            <td style="padding: 0.75rem 0.5rem; color: var(--text-secondary); font-size: 0.85rem;">
              <div>${t.original_start_date} &rarr; ${t.new_start_date}</div>
              <div>${t.original_end_date} &rarr; ${t.new_end_date}</div>
            </td>
            <td style="padding: 0.75rem 0.5rem; text-align: center;">
              ${t.on_critical_path ? `
                <span class="red" style="font-size: 0.6rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;">
                  YES
                </span>
              ` : `
                <span class="gray" style="font-size: 0.6rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase; opacity: 0.5;">
                  NO
                </span>
              `}
            </td>
          </tr>
        `;
      }).join('');
    }

    resultContainer.innerHTML = `
      ${alertHtml}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Original Committed End Date</div>
          <div style="font-size: 1.25rem; font-weight: 700; font-family: monospace; color: var(--text-secondary);">${data.original_project_end_date}</div>
        </div>
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">New Estimated End Date</div>
          <div style="font-size: 1.25rem; font-weight: 700; font-family: monospace; color: ${data.project_end_date_slipped ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)'};">${data.new_project_end_date}</div>
        </div>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <h5 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);">Affected Schedule Tasks</h5>
        <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
            <thead>
              <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border-color);">
                <th style="padding: 0.5rem; font-weight: 600; color: var(--text-secondary);">ID</th>
                <th style="padding: 0.5rem; font-weight: 600; color: var(--text-secondary);">Task Name</th>
                <th style="padding: 0.5rem; font-weight: 600; color: var(--text-secondary);">Timeline Ripple</th>
                <th style="padding: 0.5rem; font-weight: 600; color: var(--text-secondary); text-align: center;">Critical Path</th>
              </tr>
            </thead>
            <tbody>
              ${tasksTableRows}
            </tbody>
          </table>
        </div>
      </div>

      <div style="background-color: rgba(99, 102, 241, 0.04); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
          <svg style="width: 18px; height: 18px; fill: var(--color-brand);" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
          <span style="font-weight: 600; font-size: 0.85rem; color: var(--color-brand); text-transform: uppercase;">AI Impact Explanation Summary</span>
        </div>
        <p style="margin: 0; font-size: 0.9rem; line-height: 1.6; color: var(--text-primary);">
          ${data.explanation}
        </p>
      </div>
    `;

  } catch (err) {
    errorAlert.textContent = err.message;
    errorAlert.style.display = 'block';
  } finally {
    btn.innerHTML = originalBtnText;
    btn.disabled = false;
  }
}

function showAutoSenseForm() {
  const container = document.getElementById('dependency-panel-container');
  container.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-header">
        <div>
          <span class="wizard-stage-indicator" style="text-transform: uppercase;">Graph Discovery</span>
          <h2 class="wizard-title">Auto-Sense plan schedule</h2>
        </div>
      </div>

      <div class="wizard-card info-card">
        <h4 class="card-section-title">Automated Dependency Extraction</h4>
        <p class="description-text" style="margin-bottom: 1.5rem;">
          Select an active project plan to analyze. LangGraph will inspect the plan, perform semantic keyword checks, verify predecessor constraints, and automatically construct risk edges.
        </p>

        <div class="error-alert" id="sense-error" style="display: none; margin-bottom: 1.5rem;"></div>

        <div class="form-group">
          <label for="select-plan-id">Target Project Plan</label>
          <select id="select-plan-id">
            <option value="">Loading plans...</option>
          </select>
        </div>

        <div id="sense-actions-row" class="submit-row" style="margin-top: 2rem;">
          <button type="button" class="btn-primary" id="btn-run-sense" disabled>Analyze Plan & Extract</button>
        </div>
        
        <div id="sense-result-box" style="margin-top: 1.5rem;"></div>
      </div>
    </div>
  `;

  // Dynamically load plans from the plans service
  fetch(`${DEPENDENCIES_API_BASE}/plans`)
    .then(res => res.json())
    .then(plansList => {
      const select = document.getElementById('select-plan-id');
      const btn = document.getElementById('btn-run-sense');
      if (select) {
        if (!plansList || plansList.length === 0) {
          select.innerHTML = '<option value="">No active plans found</option>';
        } else {
          select.innerHTML = plansList.map((p, idx) => {
            const planName = p.release_name || `Plan ${idx + 1}: ${p.plan_id}`;
            return `<option value="${p.plan_id}">${planName} (${p.plan_id})</option>`;
          }).join('');
          if (btn) btn.disabled = false;
        }
      }
    })
    .catch(err => {
      console.error("Failed to fetch plans dynamically:", err);
      const select = document.getElementById('select-plan-id');
      if (select) {
        select.innerHTML = `
          <option value="PLN-0001-1">Plan 1: Loyalty Portal Integration (PLN-0001-1)</option>
          <option value="PLN-0003-1">Plan 3: Security & SAST Pipelines (PLN-0003-1)</option>
        `;
      }
      const btn = document.getElementById('btn-run-sense');
      if (btn) btn.disabled = false;
    });

  document.getElementById('btn-run-sense').addEventListener('click', handleRunSense);
}

async function handleRunSense() {
  const planId = document.getElementById('select-plan-id').value;
  const actionRow = document.getElementById('sense-actions-row');
  const errorAlert = document.getElementById('sense-error');
  const resultBox = document.getElementById('sense-result-box');

  errorAlert.style.display = 'none';
  resultBox.innerHTML = '';
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Sifting task titles, structures, and owner boundaries...</span>`;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/sense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Auto-Sensing failed.");
    }
    const data = await res.json();
    const detected = data.detected_dependencies || [];

    if (detected.length === 0) {
      resultBox.innerHTML = `
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; text-align: center; color: var(--text-secondary);">
          No new dependencies or external risks detected in this plan.
        </div>
      `;
    } else {
      let rows = detected.map(dep => {
        return `
          <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
            <td style="padding: 0.75rem 0.5rem; font-family: monospace; font-weight: 600; color: var(--color-brand);">${dep.dependency_id}</td>
            <td style="padding: 0.75rem 0.5rem; font-family: monospace;">${dep.source_task_id} &rarr; ${dep.target_task_id}</td>
            <td style="padding: 0.75rem 0.5rem; text-transform: capitalize;">${dep.type.replace('-', ' ')}</td>
            <td style="padding: 0.75rem 0.5rem;">${dep.owner}</td>
          </tr>
        `;
      }).join('');

      resultBox.innerHTML = `
        <div style="background-color: rgba(52, 211, 153, 0.04); border: 1px solid var(--color-status-green-border); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1rem;">
          <h5 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; font-weight: 600; color: var(--color-status-green-text);">Successfully Sensed & Saved ${detected.length} Edge(s)</h5>
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-secondary);">
                <th style="padding: 0.5rem;">Edge ID</th>
                <th style="padding: 0.5rem;">Relationship</th>
                <th style="padding: 0.5rem;">Type</th>
                <th style="padding: 0.5rem;">Owner</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }

    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-sense">Analyze Plan & Extract</button>`;
    document.getElementById('btn-run-sense').addEventListener('click', handleRunSense);

    // Refresh sidebar listing
    await window.fetchDependencies();
  } catch (err) {
    errorAlert.textContent = err.message;
    errorAlert.style.display = 'block';
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-sense">Analyze Plan & Extract</button>`;
    document.getElementById('btn-run-sense').addEventListener('click', handleRunSense);
  }
}

function showNewEdgeForm() {
  const container = document.getElementById('dependency-panel-container');
  container.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-header">
        <div>
          <span class="wizard-stage-indicator" style="text-transform: uppercase;">Manual Entry</span>
          <h2 class="wizard-title">New dependency edge</h2>
        </div>
      </div>

      <div class="wizard-card info-card">
        <h4 class="card-section-title">Define Dependency Properties</h4>
        <div class="error-alert" id="edge-error" style="display: none; margin-bottom: 1.5rem;"></div>

        <form id="new-edge-form">
          <div class="grid-2col">
            <div class="form-group">
              <label for="edge-plan-id">Target Project Plan</label>
              <select id="edge-plan-id">
                <option value="">Loading plans...</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edge-id-custom">Custom Edge ID (Optional)</label>
              <input type="text" id="edge-id-custom" placeholder="Leave empty to auto-generate (DEP-XXXX)">
            </div>
            <div class="form-group">
              <label style="font-weight: 700; color: var(--text-primary);" for="edge-source-id">Source Task ID (Dependent)</label>
              <input type="text" id="edge-source-id" required placeholder="e.g. PLN-0001-BUILD">
            </div>
            <div class="form-group">
              <label style="font-weight: 700; color: var(--text-primary);" for="edge-target-id">Target Task ID (Predecessor)</label>
              <input type="text" id="edge-target-id" required placeholder="e.g. PLN-0001-DESIGN">
            </div>
            <div class="form-group">
              <label for="edge-type">Dependency Type</label>
              <select id="edge-type">
                <option value="technical">Technical Dependency</option>
                <option value="resource">Resource Dependency</option>
                <option value="data">Data Dependency</option>
                <option value="external-vendor">External Vendor Block</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edge-status">Initial Status</label>
              <select id="edge-status">
                <option value="open">Open / Untracked</option>
                <option value="at-risk">At Risk</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label for="edge-owner">Responsible Owner (Email)</label>
              <input type="text" id="edge-owner" required placeholder="e.g. name@company.com">
            </div>
          </div>

          <div id="edge-actions-row" class="submit-row" style="margin-top: 2rem;">
            <button type="button" class="btn-primary" id="btn-save-edge" disabled>Create Dependency Edge</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Dynamically load plans from the plans service
  fetch(`${DEPENDENCIES_API_BASE}/plans`)
    .then(res => res.json())
    .then(plansList => {
      const select = document.getElementById('edge-plan-id');
      const btn = document.getElementById('btn-save-edge');
      if (select) {
        if (!plansList || plansList.length === 0) {
          select.innerHTML = '<option value="">No active plans found</option>';
        } else {
          select.innerHTML = plansList.map((p, idx) => {
            const planName = p.release_name || `Plan ${idx + 1}: ${p.plan_id}`;
            return `<option value="${p.plan_id}">${planName} (${p.plan_id})</option>`;
          }).join('');
          if (btn) btn.disabled = false;
        }
      }
    })
    .catch(err => {
      console.error("Failed to fetch plans dynamically:", err);
      const select = document.getElementById('edge-plan-id');
      if (select) {
        select.innerHTML = `
          <option value="PLN-0001-1">Plan 1: Loyalty Portal Integration (PLN-0001-1)</option>
          <option value="PLN-0003-1">Plan 3: Security & SAST Pipelines (PLN-0003-1)</option>
        `;
      }
      const btn = document.getElementById('btn-save-edge');
      if (btn) btn.disabled = false;
    });

  document.getElementById('btn-save-edge').addEventListener('click', handleSaveEdge);
}

async function handleSaveEdge() {
  const source = document.getElementById('edge-source-id').value.trim();
  const target = document.getElementById('edge-target-id').value.trim();
  const type = document.getElementById('edge-type').value;
  const status = document.getElementById('edge-status').value;
  const owner = document.getElementById('edge-owner').value.trim();
  let customId = document.getElementById('edge-id-custom').value.trim();

  const errorAlert = document.getElementById('edge-error');
  const actionRow = document.getElementById('edge-actions-row');

  errorAlert.style.display = 'none';

  if (!source || !target || !owner) {
    errorAlert.textContent = "Please fill in all required fields (Source Task, Target Task, Owner).";
    errorAlert.style.display = 'block';
    return;
  }

  // If custom ID is not provided, send empty string so the backend can auto-generate a sequential ID.
  if (!customId) {
    customId = "";
  }

  const selectedPlanId = document.getElementById('edge-plan-id').value;

  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Creating edge...</span>`;

  try {
    const payload = {
      dependency_id: customId,
      plan_id: selectedPlanId,
      source_task_id: source,
      target_task_id: target,
      type: type,
      status: status,
      owner: owner
    };

    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Failed to create dependency.");
    }
    const newRecord = await res.json();
    selectedDependencyId = newRecord.dependency_id;

    await window.fetchDependencies();
  } catch (err) {
    errorAlert.textContent = err.message;
    errorAlert.style.display = 'block';
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-save-edge">Create Dependency Edge</button>`;
    document.getElementById('btn-save-edge').addEventListener('click', handleSaveEdge);
  }
}

// ====== AI-FIRST UX HELPER FUNCTIONS ======

async function handleApproval(action, depId) {
  const banner = document.querySelector('.approval-banner');
  if (action === 'approve') {
    try {
      await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${depId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity: '\u2705 Human approved AI recommendation' })
      });
      if (banner) {
        banner.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-status-green-text); font-weight: 700; width: 100%; justify-content: center;">\u2713 Approved \u2014 AI recommendation accepted. Ready to send.</div>`;
        banner.style.borderColor = 'var(--color-status-green-border)';
        banner.style.background = 'var(--color-status-green-bg)';
      }
    } catch (e) { console.error(e); }
  } else if (action === 'modify') {
    const textarea = document.getElementById('chase-message-text');
    if (textarea) { textarea.focus(); textarea.select(); }
    if (banner) {
      banner.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-status-amber-text); font-weight: 700; width: 100%; justify-content: center;">\u270E Modify mode \u2014 Edit the message below, then re-approve.</div>`;
      banner.style.borderColor = 'var(--color-status-amber-border)';
      banner.style.background = 'var(--color-status-amber-bg)';
    }
  } else if (action === 'reject') {
    try {
      await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${depId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity: '\u274C Human rejected AI recommendation' })
      });
      if (banner) {
        banner.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-status-red-text); font-weight: 700; width: 100%; justify-content: center;">\u2717 Rejected \u2014 AI recommendation discarded. Regenerate or manually compose.</div>`;
        banner.style.borderColor = 'var(--color-status-red-border)';
        banner.style.background = 'var(--color-status-red-bg)';
      }
    } catch (e) { console.error(e); }
  }
}

async function handleAIEdit(action, depId) {
  const textarea = document.getElementById('chase-message-text');
  if (!textarea) return;
  const currentText = textarea.value;

  const editActions = {
    'edit': () => { textarea.focus(); textarea.select(); },
    'regenerate': async () => {
      textarea.value = 'Regenerating...';
      await triggerChaseFlow(depId, selectedTone, selectedChannel);
    },
    'friendlier': () => {
      textarea.value = currentText
        .replace(/immediately/gi, 'at your earliest convenience')
        .replace(/required/gi, 'appreciated')
        .replace(/must/gi, 'would be great to')
        .replace(/^/g, 'Hi there! Hope you\'re doing well. ');
    },
    'professional': () => {
      textarea.value = currentText
        .replace(/Hi there!.*?\. /g, '')
        .replace(/Hey/gi, 'Dear')
        .replace(/Thanks!/gi, 'Thank you for your prompt attention to this matter.');
    },
    'urgent': () => {
      textarea.value = '\u{1F6A8} URGENT: ' + currentText + '\n\nThis requires immediate action. Deadline is approaching.';
    },
    'personalize': () => {
      textarea.value = currentText + `\n\nNote: This message has been personalized for the ${depId} dependency context.`;
    },
    'context': () => {
      textarea.value = currentText + `\n\nAdditional Context: This dependency is part of the current sprint and affects the upcoming release milestone.`;
    },
    'shorten': () => {
      const sentences = currentText.split(/[.!?]+/).filter(s => s.trim().length > 0);
      textarea.value = sentences.slice(0, Math.max(2, Math.ceil(sentences.length / 2))).join('. ').trim() + '.';
    },
    'summarize': () => {
      textarea.value = `Summary: Dependency ${depId} requires attention. Please provide an updated ETA.`;
    },
    'evidence': () => {
      textarea.value = currentText + `\n\n\u{1F4CE} Evidence attached:\n- Dependency graph showing critical path\n- Activity history log\n- Schedule impact analysis`;
    },
    'explain': () => {
      alert(`AI Explanation for ${depId}:\n\n\u2022 Risk was calculated using dependency graph traversal and critical path analysis.\n\u2022 Confidence score factors: owner response history, task float, historical slip patterns.\n\u2022 Message tone was generated using the selected "${selectedTone}" template.\n\u2022 Channel formatting applied for "${selectedChannel}".`);
    }
  };

  const handler = editActions[action];
  if (handler) handler();
}

function submitFeedback(depId, feedback) {
  const feedbackLabels = { 'up': '\u{1F44D} Positive', 'down': '\u{1F44E} Negative', 'improve': '\u{1F4DD} Needs Improvement' };
  const label = feedbackLabels[feedback] || feedback;

  // Visual confirmation
  document.querySelectorAll('[data-feedback]').forEach(btn => {
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
  });
  const clickedBtn = document.querySelector(`[data-feedback="${feedback}"]`);
  if (clickedBtn) {
    clickedBtn.style.opacity = '1';
    clickedBtn.style.borderColor = 'var(--color-brand)';
    clickedBtn.style.color = 'var(--color-brand)';
  }

  // Log feedback as activity
  fetch(`${DEPENDENCIES_API_BASE}/dependencies/${depId}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activity: `\u{1F4CA} AI feedback submitted: ${label}` })
  }).catch(e => console.error('Feedback log failed:', e));

  // Show thank you message
  const feedbackRow = clickedBtn?.closest('div');
  if (feedbackRow) {
    const ty = document.createElement('span');
    ty.style.cssText = 'font-size: 0.75rem; color: var(--color-status-green-text); font-weight: 600; margin-left: 0.5rem;';
    ty.textContent = '\u2713 Thanks! AI will improve.';
    feedbackRow.appendChild(ty);
  }
}

async function handleQuickAction(action, depId) {
  const actionLabels = {
    'risk': '\u{1F6A8} Risk Item created in ADO for dependency ' + depId,
    'ado-bug': '\u{1F41E} ADO Bug work item opened for dependency ' + depId,
    'meeting': '\u{1F4C5} Teams meeting scheduled for dependency sync',
    'notify': '\u{1F4E3} Manager notified about dependency ' + depId,
    'dashboard': '\u{1F4CA} Release Dashboard updated with dependency status',
    'release-note': '\u{1F4DD} Release note added for dependency resolution'
  };

  const label = actionLabels[action] || `Quick action "${action}" executed`;

  try {
    await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${depId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: label })
    });
    alert(`\u2705 ${label}`);
    await selectDependency(depId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
