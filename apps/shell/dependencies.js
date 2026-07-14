const DEPENDENCIES_API_BASE = 'http://127.0.0.1:8000/api';

let dependencies = [];
let selectedDependencyId = null;
let planToDemandMap = {};

// ====== DYNAMIC RISK TRACKING ======
// Tracks, per dependency, when a nudge was last sent and when the owner last
// responded, plus an optional deadline. Stored client-side (no backend field
// for this exists yet) so the threat level / confidence score can be
// recomputed live from real elapsed time instead of the old static heuristic.
const CHASE_TRACKING_KEY_PREFIX = 'depChaseTracking_';

function getChaseTracking(depId) {
  try {
    const raw = localStorage.getItem(CHASE_TRACKING_KEY_PREFIX + depId);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function setChaseTracking(depId, patch) {
  try {
    const current = getChaseTracking(depId);
    const updated = { ...current, ...patch };
    localStorage.setItem(CHASE_TRACKING_KEY_PREFIX + depId, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return patch;
  }
}

function daysSince(iso) {
  if (!iso) return null;
  const from = new Date(iso);
  if (isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function daysUntil(iso) {
  if (!iso) return null;
  const to = new Date(iso);
  if (isNaN(to.getTime())) return null;
  return Math.ceil((to.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Recomputed every time it's called (every render) from real dates, so the
// threat level / confidence naturally drift day over day instead of being
// frozen at whatever the backend returned once.
function computeDynamicRisk(dep) {
  const tracking = getChaseTracking(dep.dependency_id);
  const respondedAfterLastSend = !!(tracking.lastSentAt && tracking.lastResponseAt &&
    new Date(tracking.lastResponseAt) > new Date(tracking.lastSentAt));

  const daysSinceContact = daysSince(tracking.lastSentAt);
  const daysToDeadline = daysUntil(tracking.deadline);

  let level = dep.status === 'at-risk' ? 'high' : (dep.status === 'open' ? 'medium' : 'low');
  let score = dep.confidence || 60;

  if (daysSinceContact !== null && !respondedAfterLastSend) {
    if (daysSinceContact >= 3) { level = 'high'; score = Math.max(score, 88); }
    else if (daysSinceContact >= 1) { if (level !== 'high') level = 'medium'; score = Math.max(score, 70); }
  }

  if (daysToDeadline !== null) {
    if (daysToDeadline <= 2) { level = 'high'; score = Math.max(score, 92); }
    else if (daysToDeadline <= 7 && level === 'low') { level = 'medium'; score = Math.max(score, 65); }
  }

  if (dep.status === 'resolved') { level = 'low'; score = Math.max(score, 90); }

  score = Math.max(5, Math.min(99, score));

  const reasons = [];
  if (daysSinceContact !== null) {
    reasons.push(respondedAfterLastSend
      ? `Owner replied after the last nudge (sent ${daysSinceContact} day${daysSinceContact === 1 ? '' : 's'} ago)`
      : `No reply ${daysSinceContact} day${daysSinceContact === 1 ? '' : 's'} after the last nudge was sent`);
  }
  if (daysToDeadline !== null) {
    reasons.push(daysToDeadline >= 0
      ? `Deadline in ${daysToDeadline} day${daysToDeadline === 1 ? '' : 's'}`
      : `Deadline passed ${Math.abs(daysToDeadline)} day${Math.abs(daysToDeadline) === 1 ? '' : 's'} ago`);
  }

  return { level, confidence: Math.round(score), reasons, daysSinceContact, daysToDeadline, tracking };
}

// Inject dependency panel styles once into <head> (avoids global leakage from innerHTML injection)
(function injectDepStyles() {
  if (document.getElementById('dep-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'dep-panel-styles';
  style.textContent = `
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
    .dep-tab-bar { display: flex; gap: 0; border-bottom: 2px solid var(--border-color); margin-bottom: 1.5rem; }
    .dep-tab { flex: 1; padding: 0.65rem 0.5rem; background: none; border: none; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: color 0.15s, border-color 0.15s; white-space: nowrap; }
    .dep-tab:hover { color: var(--color-brand); }
    .dep-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }
    .dep-tab-pane { display: none; }
    .dep-tab-pane.active { display: block; }
    .hist-timeline { display: flex; flex-direction: column; gap: 0; }
    .hist-entry { display: flex; align-items: flex-start; gap: 0.75rem; position: relative; padding-bottom: 1.1rem; }
    .hist-entry:not(:last-child)::after { content: ''; position: absolute; left: 14px; top: 28px; width: 2px; height: calc(100% - 16px); background: var(--border-color); }
    .hist-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; border: 2px solid var(--border-color); background: var(--bg-secondary); }
    .hist-dot.complete { background: var(--color-status-green-bg); border-color: var(--color-status-green-border); }
    .hist-dot.warn { background: var(--color-status-amber-bg); border-color: var(--color-status-amber-border); }
    .hist-dot.info { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.25); }
    .hist-case-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .hist-case-card:hover { border-color: var(--color-brand); }
    .risk-deadline-row { display: flex; align-items: flex-end; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
  `;
  document.head.appendChild(style);
})();

// Expose to window so shell.js can call it
window.renderDependenciesScreen = function () {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Dependencies</h3>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-new" id="btn-new-sense" title="Auto-sense plan dependencies">Generate Dependency</button>
            <button class="btn-new" id="btn-new-edge" title="Manually create dependency edge">+New</button>
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
    try {
      const pRes = await fetch(`${DEPENDENCIES_API_BASE}/plans`);
      if (pRes.ok) {
        const plans = await pRes.json();
        planToDemandMap = {};
        plans.forEach(p => {
          planToDemandMap[p.plan_id] = p.demand_id;
        });
      }
    } catch (e) {
      console.error("Could not fetch plans for mapping", e);
    }

    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    dependencies = await res.json();
    renderDependencyList();

    // Check if we arrived from the Plan module — auto-trigger sense form
    const pendingAutoSense = sessionStorage.getItem('pendingDepsAutoSense');
    if (pendingAutoSense) {
      sessionStorage.removeItem('pendingDepsAutoSense');
      selectedDependencyId = null;
      clearDependencySidebarSelection();
      showAutoSenseForm();
      return;
    }

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
          <span class="demand-item-id">${planToDemandMap[dep.plan_id] || dep.dependency_id}</span>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${statusClass}">
              ${dep.status}
            </span>
            <button class="btn-delete-dep" data-id="${dep.dependency_id}" title="Delete dependency"
              style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 0.2rem; display: flex; align-items: center; opacity: 0.7; transition: opacity 0.2s;"
              onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <h4 class="demand-item-title" style="font-size: 0.85rem; font-weight: 700;">Plan: ${dep.plan_id}</h4>
        <div class="demand-item-meta">
          <span style="font-family: monospace; font-size: 0.72rem; color: var(--text-muted);">${dep.dependency_id}</span>
          <span>Risk: <b style="text-transform: uppercase; color: ${dep.risk === 'high' ? 'var(--color-status-red-text)' : 'inherit'};">${dep.risk || 'medium'}</b></span>
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

async function renderDependencyGraph(dependencyId, containerId, selectedTask = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Loading graph...</div>`;

  try {
    let url = `${DEPENDENCIES_API_BASE}/dependencies/${dependencyId}/graph`;
    if (selectedTask) {
      url += `?selected_task=${selectedTask}`;
    }
    const res = await fetch(url);
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

<<<<<<< HEAD
  // AI Intelligence computed data
  const confidenceVal = dep.confidence || 85;
  const threatLevel = dep.status === 'resolved' ? 'low' : (dep.threat_level || (dep.status === 'at-risk' ? 'high' : dep.status === 'open' ? 'medium' : 'low'));
  const confidenceReasons = (dep.confidence_reasons && dep.confidence_reasons.length > 0)
    ? dep.confidence_reasons
    : ['Dependency chain analysis complete', 'Owner activity tracked', 'Schedule variance calculated'];
=======
  // AI Intelligence computed data — now driven by computeDynamicRisk() instead of
  // a static snapshot, so it reflects real elapsed time since the last nudge and
  // how close the deadline is. Recomputed on every render (naturally "daily").
  const risk = computeDynamicRisk(dep);
  const confidenceVal = risk.confidence;
  const threatLevel = risk.level;
  const confidenceReasons = risk.reasons.length > 0
    ? risk.reasons
    : (dep.confidence_reasons && dep.confidence_reasons.length > 0
        ? dep.confidence_reasons
        : ['Dependency chain analysis complete', 'Owner activity tracked', 'Schedule variance calculated']);
>>>>>>> main
  const threatEmoji = threatLevel === 'high' ? '\u{1F534}' : threatLevel === 'medium' ? '\u{1F7E1}' : '\u{1F7E2}';
  const threatColorVar = threatLevel === 'high' ? 'red' : threatLevel === 'medium' ? 'amber' : 'green';
  const daysSinceUpdate = risk.daysSinceContact !== null
    ? risk.daysSinceContact
    : (activityLogs.length > 0 ? Math.min(activityLogs.length, 4) : 7);
  const ownerShort = dep.owner.includes('@') ? dep.owner.split('@')[0] : dep.owner;
  const deadlineValue = risk.tracking.deadline || '';

  const isChaseCompleted = !!dep.draft_message;
  const isResolveCompleted = dep.status === 'resolved';

  const step1Class = 'completed';
  const step2Class = isChaseCompleted ? 'completed' : 'active';
  const step3Class = isResolveCompleted ? 'completed' : (isChaseCompleted ? 'active' : 'locked');

  // Pipeline completion banner for resolved dependencies
  const completionBanner = isResolveCompleted ? `
    <div style="background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08)); border: 1px solid rgba(16,185,129,0.35); border-radius: var(--radius-lg); padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="width: 36px; height: 36px; background: rgba(16,185,129,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#10b981;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
        </div>
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: #10b981;">&#x1F389; Pipeline Complete!</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.1rem;">All dependencies for this demand have been resolved.</div>
        </div>
      </div>
      <button id="btn-resense-deps" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.9rem;border-radius:var(--radius-sm);font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid var(--border-color);background:var(--bg-tertiary);color:var(--text-secondary);transition:all 0.15s ease;"
        onmouseover="this.style.borderColor='var(--color-brand)';this.style.color='var(--color-brand)';"
        onmouseout="this.style.borderColor='var(--border-color)';this.style.color='var(--text-secondary)';">
        &#x21ba; Re-sense Dependencies
      </button>
    </div>
  ` : '';

  container.innerHTML = `

    <div class="wizard-container">

      ${completionBanner}

      <!-- ===== HEADER ===== -->
      <div class="wizard-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${planToDemandMap[dep.plan_id] || dep.dependency_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary);">Dependency Analysis <span style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted); font-weight: 400;">(${dep.dependency_id})</span></h2>
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

      <!-- ===== TAB BAR ===== -->
      <div class="dep-tab-bar">
        <button class="dep-tab active" data-tab="overview">🧩 Overview</button>
        <button class="dep-tab" data-tab="ai-insights">🤖 AI Insights</button>
        <button class="dep-tab" data-tab="activity">📜 Activity</button>
      </div>

<<<<<<< HEAD
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
            <div style="margin-bottom: 1.25rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem;">
              <label for="detail-task-select" style="font-weight: 700; color: var(--color-brand); display: block; margin-bottom: 0.4rem;">Select Task</label>
              <select id="detail-task-select" style="font-size: 0.9rem; padding: 0.4rem; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary);">
                ${(dep.task_list || []).map((tId, idx) => `<option value="${tId}" ${idx === 0 ? 'selected' : ''}>${tId.includes('-') ? tId.split('-')[tId.split('-').length - 1] : tId}</option>`).join('')}
              </select>
            </div>

            <div id="dynamic-task-details-container">
              <div class="grid-2col" style="margin-bottom: 1rem;">
                <div class="data-item">
                  <div class="data-label">Current Task</div>
                  <div class="data-value" id="task-detail-current" style="font-weight: 700; color: var(--color-brand);">Loading...</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Owner</div>
                  <div class="data-value" id="task-detail-owner">Loading...</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Depends On</div>
                  <div class="data-value" id="task-detail-predecessor" style="font-weight: 700; color: var(--text-primary);">Loading...</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Previous Owner</div>
                  <div class="data-value" id="task-detail-prev-owner">Loading...</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Dependency Status</div>
                  <div class="data-value" id="task-detail-status" style="text-transform: capitalize;">Loading...</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Risk</div>
                  <div class="data-value" id="task-detail-risk" style="text-transform: capitalize;">Loading...</div>
                </div>
              </div>
            </div>
            
=======
      <!-- ================================================================
           TAB 1 — OVERVIEW
           ================================================================ -->
      <div id="tab-overview" class="dep-tab-pane active">
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
              ${dep.is_self_dependency ? `
                <div style="background-color: rgba(245, 158, 11, 0.05); border: 1px solid var(--color-status-amber-border); border-left: 4px solid var(--color-status-amber-text); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 1rem;">
                  <h5 style="margin: 0 0 0.25rem 0; font-size: 0.85rem; font-weight: 700; color: var(--color-status-amber-text); display: flex; align-items: center; gap: 0.35rem;">
                    <span>⚠️ Self Dependency</span>
                  </h5>
                  <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                    Both tasks are assigned to <strong>${dep.owner}</strong>. Since you own both tasks in this dependency chain, please update your predecessor task status.
                  </p>
                </div>
              ` : ''}
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

              <!-- Dependency Chain Graph -->
              <div style="border-top: 1px dashed var(--border-color); padding-top: 1rem; margin-top: 0.75rem; margin-bottom: 1.5rem;">
                <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Dependency Chain Graph</h5>
                <div id="dependency-graph-panel" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; min-height: 150px;"></div>
              </div>
            </div>
>>>>>>> main
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
                    <button type="button" class="wf-btn-toggle" data-channel="ado">🔷 ADO</button>
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                  <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Schedule</label>
                  <div id="chase-schedule-group" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;">
                    <button type="button" class="wf-btn-toggle active" data-schedule="now">Send Now</button>
                    <button type="button" class="wf-btn-toggle" data-schedule="1hour">In 1 Hour</button>
                    <button type="button" class="wf-btn-toggle" data-schedule="tomorrow">Tomorrow 9am</button>
                    <button type="button" class="wf-btn-toggle" data-schedule="custom">Custom</button>
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                  <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Suggested Recipients</label>
                  <div id="recipient-list" style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.25rem;">
                    <label class="ai-pill active" style="cursor: pointer; justify-content: space-between;"><span><input type="checkbox" checked style="display:none;"> ✓ Dependency Owner (${ownerShort})</span><span style="font-size:0.65rem; opacity:0.7;">92%</span></label>
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
                <div id="chase-results-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
                  <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">💡 AI Suggested Next Best Actions</h5>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;" id="nba-list">
                    ${dep.is_self_dependency ? `
                      <label class="ai-pill active" data-nba="update-predecessor" style="cursor: pointer;"><input type="checkbox" checked style="display:none;"> Update predecessor task</label>
                      <label class="ai-pill" data-nba="mark-complete" style="cursor: pointer;"><input type="checkbox" style="display:none;"> Mark task complete</label>
                      <label class="ai-pill" data-nba="revise-eta" style="cursor: pointer;"><input type="checkbox" style="display:none;"> Revise ETA</label>
                      <label class="ai-pill" data-nba="notify-stakeholders" style="cursor: pointer;"><input type="checkbox" style="display:none;"> Notify stakeholders if delayed</label>
                    ` : `
                      <label class="ai-pill ${dep.status !== 'resolved' ? 'active' : ''}" data-nba="send-reminder" style="cursor: pointer;"><input type="checkbox" ${dep.status !== 'resolved' ? 'checked' : ''} style="display:none;"> ✉ Send reminder</label>
                      <label class="ai-pill" data-nba="schedule-sync" style="cursor: pointer;"><input type="checkbox" style="display:none;"> 📅 Schedule 15 min sync</label>
                      <label class="ai-pill ${dep.status === 'at-risk' ? 'active' : ''}" data-nba="escalate-lead" style="cursor: pointer;"><input type="checkbox" ${dep.status === 'at-risk' ? 'checked' : ''} style="display:none;"> ⚠️ Escalate to Team Lead</label>
                      <label class="ai-pill" data-nba="create-risk" style="cursor: pointer;"><input type="checkbox" style="display:none;"> 🚨 Create Risk Item</label>
                      <label class="ai-pill" data-nba="wait-24h" style="cursor: pointer;"><input type="checkbox" style="display:none;"> ⏳ Wait 24 hrs</label>
                    `}
                  </div>
                  <div style="background: rgba(99,102,241,0.03); border: 1px solid rgba(99,102,241,0.1); border-radius: var(--radius-md); padding: 0.6rem 0.8rem;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">AI Recommendation</div>
                    <div style="font-size: 0.8rem; color: var(--text-primary); font-weight: 600;">${dep.is_self_dependency ? 'Both tasks are owned by you. Update predecessor task details directly.' : (dep.status === 'at-risk' ? 'Schedule Teams meeting before escalation.' : 'Send friendly reminder first, then follow up in 48hrs.')}</div>
                  </div>
                </div>

                <div class="form-group" style="display: ${dep.is_self_dependency ? 'none' : 'block'};">
                  <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Nudge Message</label>
                  <textarea class="wf-textarea" id="chase-message-text" placeholder="Generated message will appear here...">${nudgeMessage}</textarea>
                </div>

                <!-- AI EDITING TOOLBAR -->
                <div style="display: ${dep.is_self_dependency ? 'none' : 'flex'}; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem;" id="ai-edit-toolbar">
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
                <div style="display: ${dep.is_self_dependency ? 'none' : 'flex'}; gap: 0.35rem; margin-bottom: 1.25rem;">
                  <button class="ai-action-btn" id="btn-compare-v1" style="flex: 1; justify-content: center; background: rgba(99,102,241,0.05);">V1: Friendly</button>
                  <button class="ai-action-btn" id="btn-compare-v2" style="flex: 1; justify-content: center;">V2: Executive</button>
                  <button class="ai-action-btn" id="btn-compare-v3" style="flex: 1; justify-content: center;">V3: Technical</button>
                </div>

                <!-- HUMAN APPROVAL BANNER -->
                <div class="approval-banner" style="margin-bottom: 1.25rem; display: ${dep.is_self_dependency ? 'none' : 'flex'};">
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--color-brand); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem;">🧠</div>
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
                  ${dep.is_self_dependency ? `
                    <button type="button" class="btn-primary" id="btn-nba-take-action" style="background-color: var(--color-brand); height: 36px; padding: 0 1rem; font-size: 0.85rem; flex-grow: 1;">
                      Take Action (Update Predecessor Task)
                    </button>
                  ` : `
                    <button type="button" class="btn-secondary" id="btn-save-draft-message" style="height: 36px;">Save Draft</button>
                    <button type="button" class="btn-primary" id="btn-send-message" style="background-color: var(--color-brand); height: 36px; padding: 0 1rem; font-size: 0.85rem; flex-grow: 1;">
                      Send via ${selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)}
                    </button>
                  `}
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
              <!-- Ripple Impact Analysis -->
              <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Cross-Programme Ripple Impact Analysis</h5>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
                Forecast timeline slippages and schedule relaxation ripples across the program when a task is delayed.
              </p>
              <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 1rem; align-items: end;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="impact-task-id">Delayed Task ID</label>
                  <select id="impact-task-id" style="width: 100%;">
                    ${(dep.task_list || []).map(tId => `<option value="${tId}">${tId}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="impact-delay-days">Delay Days</label>
                  <input type="number" id="impact-delay-days" value="${dep.status === 'resolved' ? 0 : (dep.status === 'at-risk' ? 15 : 5)}" min="${dep.status === 'resolved' ? 0 : 1}" max="365" style="width: 100%;">
                </div>
                <div>
                  <button type="button" class="btn-secondary" id="btn-check-impact" disabled title="Trigger the &quot;Cross-Programme Impact&quot; agent in AI Insights → Agent Coordination first" style="height: 42px; padding: 0 1rem; opacity: 0.5; cursor: not-allowed;">Forecast Impact</button>
                </div>
              </div>
              <div id="impact-error" class="error-alert" style="display: none; margin-top: 1rem;"></div>
              <div id="impact-result-container" style="margin-top: 1.5rem;"></div>
            </div>
          </div>

          <!-- Critical Path: Escalate Risk -->
          ${(dep.status === 'at-risk' || dep.status === 'open') ? `
            <div style="background-color: rgba(248, 113, 113, 0.02); border: 1px solid var(--color-status-red-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem;">
              <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 700; color: var(--color-status-red-text);">Critical Path Action: Escalate Risk</h5>
              <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1rem;">
                This dependency is on the critical path. If task delays threaten project release milestones, immediately escalate to leadership.
              </p>
              <button type="button" class="btn-primary" id="btn-escalate-manager" style="background-color: var(--color-status-red-bg); border: 1px solid var(--color-status-red-border); color: var(--color-status-red-text); width: 100%;">
                Escalate to Manager / Release Lead
              </button>
            </div>
          ` : ''}

          <!-- Quick Actions -->
          <div style="margin-bottom: 1.5rem;">
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

        </div>
      </div>

      <!-- ================================================================
           TAB 2 — AI INSIGHTS
           ================================================================ -->
      <div id="tab-ai-insights" class="dep-tab-pane">

        <!-- AI Risk Assessment -->
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; border-left: 4px solid var(--color-status-${threatColorVar}-text);">
          <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary);">🧠 AI Risk Assessment</h5>

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
            <ul style="list-style: none; padding: 0; margin: 0;" id="sensing-rationale-list">
              <li style="padding: 0.2rem 0; font-size: 0.8rem; color: var(--text-primary);">✓ Dependency owner has not responded for ${daysSinceUpdate} day${daysSinceUpdate === 1 ? '' : 's'}</li>
              ${confidenceReasons.map(r => `<li style="padding: 0.2rem 0; font-size: 0.8rem; color: var(--text-primary);">✓ ${r}</li>`).join('')}
            </ul>
          </div>

<<<<<<< HEAD
            

            <!-- Activity History -->
            <div style="border-top: 1px dashed var(--border-color); padding-top: 1rem;">
              <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Activity History</h5>
              <ul class="wf-history-list" id="wf-history-container">
                ${activityLogs.map(log => `<li class="wf-history-item">${log}</li>`).join('')}
                ${activityLogs.length === 0 ? `<li style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem 0;">No activities logged yet.</li>` : ''}
              </ul>
=======
          <!-- Live tracking controls: these are what actually drive the numbers above,
               recomputed from real timestamps every time this panel renders. -->
          <div class="risk-deadline-row">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="risk-deadline-input" style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted);">Deadline</label>
              <input type="date" id="risk-deadline-input" value="${deadlineValue}" style="height: 34px;">
            </div>
            <button type="button" class="ai-action-btn" id="btn-save-deadline">💾 Save Deadline</button>
            <button type="button" class="ai-action-btn" id="btn-mark-responded" title="Record that the owner replied just now">✓ Owner Responded Today</button>
            <span style="font-size: 0.7rem; color: var(--text-muted); align-self: center;">
              ${risk.tracking.lastSentAt ? `Last nudge sent ${new Date(risk.tracking.lastSentAt).toLocaleDateString()}` : 'No nudge sent yet'}
            </span>
          </div>
        </div>

        <!-- Agent Coordination -->
        <div style="margin-bottom: 1.5rem;">
          <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">🕸️ Agent Coordination</h5>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <div class="coord-agent" data-agent="cross-impact" style="cursor: pointer;">
              <span class="agent-dot" style="background: var(--color-brand);"></span>
              <span class="agent-name" style="flex: 1;">Cross-Programme Impact</span>
              <span class="agent-status" style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">Idle — click to trigger</span>
            </div>
            <div class="coord-agent" data-agent="sensing" style="cursor: pointer;">
              <span class="agent-dot" style="background: var(--color-status-green-text);"></span>
              <span class="agent-name" style="flex: 1;">Dependency Sensing</span>
              <span class="agent-status" style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">Complete</span>
            </div>
            <div class="coord-agent" data-agent="chase" style="cursor: pointer;">
              <span class="agent-dot" style="background: ${isChaseCompleted ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'};"></span>
              <span class="agent-name" style="flex: 1;">Commitment Chase</span>
              <span class="agent-status" style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">${isChaseCompleted ? 'Complete' : 'Pending'}</span>
>>>>>>> main
            </div>
          </div>
        </div>

        <!-- Evidence Sources -->
        <div style="margin-bottom: 0.5rem;">
          <button type="button" class="ai-action-btn" id="btn-view-sources">📎 View Evidence Sources</button>
        </div>
      </div>

      <!-- ================================================================
           TAB 3 — ACTIVITY
           ================================================================ -->
      <div id="tab-activity" class="dep-tab-pane">
        <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">📜 Activity History</h5>
        ${activityLogs.length === 0 ? `
          <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No activity recorded yet.</div>
        ` : `
          <ul class="hist-timeline" style="list-style: none; padding: 0; margin: 0;">
            ${activityLogs.slice().reverse().map(entry => {
              const text = typeof entry === 'string' ? entry : (entry.activity || entry.text || JSON.stringify(entry));
              const ts = typeof entry === 'object' && entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
              return `
                <li class="hist-entry">
                  <span class="hist-dot info">•</span>
                  <div>
                    <div style="font-size: 0.85rem; color: var(--text-primary);">${text}</div>
                    ${ts ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">${ts}</div>` : ''}
                  </div>
                </li>
              `;
            }).join('')}
          </ul>
        `}
      </div>

    </div>
  `;

  // ====== EVENT WIRING ======

  // ── Tab switching ──
  document.querySelectorAll('.dep-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.dep-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dep-tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = document.getElementById(`tab-${target}`);
      if (pane) pane.classList.add('active');
    });
  });

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
      if (pill.classList.contains('active')) {
        const nba = pill.getAttribute('data-nba');
        if (nba === 'send-reminder') nbaSendReminder(dep);
        else if (nba === 'schedule-sync') nbaScheduleSync(dep);
        else if (nba === 'escalate-lead') nbaEscalateTeamLead(dep);
        else if (nba === 'create-risk') nbaCreateRiskItem(dep);
        else if (nba === 'wait-24h') nbaWait24h(dep);
        else if (nba === 'update-predecessor') nbaUpdatePredecessor(dep);
        else if (nba === 'mark-complete') nbaMarkComplete(dep);
        else if (nba === 'revise-eta') nbaReviseEta(dep);
        else if (nba === 'notify-stakeholders') nbaNotifyStakeholders(dep);
      }
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

  // Take Action button for self dependency
  const btnTakeAction = document.getElementById('btn-nba-take-action');
  if (btnTakeAction) {
    btnTakeAction.addEventListener('click', () => {
      nbaUpdatePredecessor(dep);
    });
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

  

  // Re-sense button (shown in completion banner for resolved deps)
  const resenseBtn = document.getElementById('btn-resense-deps');
  if (resenseBtn) {
    resenseBtn.addEventListener('click', () => {
      selectedDependencyId = null;
      clearDependencySidebarSelection();
      showAutoSenseForm();
    });
  }

  // Undo resolved button
  const undoBtn = document.getElementById('btn-undo-resolved');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => undoResolved(dep.dependency_id));
  }

  // Mark resolved button
  const markResolvedBtn = document.getElementById('btn-mark-resolved');
  if (markResolvedBtn) {
    markResolvedBtn.addEventListener('click', () => markResolved(dep.dependency_id));
  }

  // Agent Coordination
  document.querySelectorAll('.coord-agent').forEach(item => {
    item.addEventListener('click', () => {
      const agent = item.getAttribute('data-agent');
      if (agent === 'cross-impact') {
        // Don't auto-run anything here — just unlock the Forecast Impact tool.
        const impactBtn = document.getElementById('btn-check-impact');
        if (impactBtn) {
          impactBtn.disabled = false;
          impactBtn.title = '';
          impactBtn.style.opacity = '1';
          impactBtn.style.cursor = 'pointer';
        }
        const statusEl = item.querySelector('.agent-status');
        if (statusEl) statusEl.textContent = 'Triggered';
      } else {
        const agentName = item.querySelector('.agent-name')?.textContent || 'Agent';
        sendAgentStatusMail(agentName, dep);
      }
    });
  });

  // View sources
  if (document.getElementById('btn-view-sources')) {
    document.getElementById('btn-view-sources').addEventListener('click', () => {
      alert('Evidence sources panel: Plan Schedule DB, Dependency Graph, ADO Work Items, Activity History, Critical Path Analysis. Connected integrations expand this automatically.');
    });
  }

  // Live risk tracking controls: deadline + "owner responded" — these feed
  // computeDynamicRisk() so Threat Level / Sensing Confidence / Rationale
  // update automatically, without needing any backend changes.
  const btnSaveDeadline = document.getElementById('btn-save-deadline');
  if (btnSaveDeadline) {
    btnSaveDeadline.addEventListener('click', () => {
      const input = document.getElementById('risk-deadline-input');
      const val = input ? input.value : '';
      setChaseTracking(dep.dependency_id, { deadline: val || null });
      selectDependencyAndRestoreScroll(dep.dependency_id);
    });
  }

  const btnMarkResponded = document.getElementById('btn-mark-responded');
  if (btnMarkResponded) {
    btnMarkResponded.addEventListener('click', () => {
      setChaseTracking(dep.dependency_id, { lastResponseAt: new Date().toISOString() });
      logActivity(dep.dependency_id, `✓ Owner response recorded manually`);
      selectDependencyAndRestoreScroll(dep.dependency_id);
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
        const currentTask = window.currentSelectedTaskId || dep.source_task_id || "BUILD";
        if (id === 'btn-compare-v1') {
          textarea.value = dep.draft_message || nudgeMessage || `Hi, just a friendly follow-up on this dependency. Could you share an update?`;
        } else if (id === 'btn-compare-v2') {
          textarea.value = `Executive Summary: Dependency ${dep.dependency_id} requires immediate attention. Task ${currentTask} requires status check. Impact: critical path at risk. Action required: Updated ETA by EOD.`;
        } else {
          textarea.value = `Technical Follow-up [${dep.dependency_id}]: Task ${currentTask} is awaiting predecessor status. Please confirm completion status, share blockers, deployment logs, or endpoint readiness details.`;
        }
      });
    }
  });

  // Task Selector Dynamic Interaction Hook
  const taskSelect = document.getElementById('detail-task-select');
  if (taskSelect) {
    const updateDynamicTaskDetails = async (tId) => {
      try {
        const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${dep.dependency_id}/task-details?task_id=${tId}`);
        if (!res.ok) throw new Error("Failed to load task details");
        const data = await res.json();
        
        document.getElementById('task-detail-current').textContent = data.selected_task;
        document.getElementById('task-detail-owner').textContent = data.current_owner;
        document.getElementById('task-detail-predecessor').textContent = data.depends_on;
        document.getElementById('task-detail-prev-owner').textContent = data.depends_on_owner;
        document.getElementById('task-detail-status').textContent = data.status;
        document.getElementById('task-detail-risk').textContent = data.risk;
        
        window.currentSelectedTaskId = data.selected_task;
        
        renderDependencyGraph(dep.dependency_id, 'dependency-graph-panel', data.selected_task);
        
        const impactInput = document.getElementById('impact-task-id');
        if (impactInput) {
          impactInput.value = data.selected_task;
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    taskSelect.addEventListener('change', () => {
      updateDynamicTaskDetails(taskSelect.value);
    });
    
    if (taskSelect.value) {
      updateDynamicTaskDetails(taskSelect.value);
    }
  }
}

<<<<<<< HEAD
=======
async function selectDependencyAndRestoreScroll(id) {
  const viewport = document.querySelector('.screen-viewport');
  const scrollTop = viewport ? viewport.scrollTop : 0;
  await selectDependency(id);
  if (viewport) {
    viewport.scrollTop = scrollTop;
  }
}
>>>>>>> main

async function triggerChaseFlow(id, tone, channel) {
  try {
    const params = new URLSearchParams();
    if (tone) params.append('tone', tone);
    if (channel) params.append('channel', channel);
    if (window.currentSelectedTaskId) params.append('selected_task', window.currentSelectedTaskId);
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${id}/chase?${params.toString()}`, {
      method: 'POST'
    });

    if (!res.ok) throw new Error("AI Chase workflow call failed.");
    const data = await res.json();

    // A nudge was just generated/sent by the AI — record it so the dynamic
    // threat level starts counting "days since last contact" from now.
    setChaseTracking(id, { lastSentAt: new Date().toISOString() });

    await selectDependencyAndRestoreScroll(id);

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
    await selectDependencyAndRestoreScroll(id);
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
    await selectDependencyAndRestoreScroll(id);
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
    await selectDependencyAndRestoreScroll(id);
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
      body: JSON.stringify({ activity: `⚠️ Escalated dependency risk to ${managerName}` })
    });
    if (!res.ok) throw new Error("Failed to log escalation activity.");
    alert(`Risk successfully escalated to ${managerName}!`);
    await selectDependencyAndRestoreScroll(id);
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
  const scheduleLabels = { 'now': 'immediately', '1hour': 'in 1 hour', 'tomorrow': 'tomorrow at 9am', 'custom': 'custom schedule' };
  const scheduleText = scheduleLabels[scheduleVal] || 'immediately';

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${dep.dependency_id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: `✓ Nudge reminder sent to ${dep.owner} via ${channelText} (${scheduleText})` })
    });
    if (!res.ok) throw new Error("Failed to record message transmission.");

    // Record the send time so "days since last contact" (and the threat level
    // it drives) starts counting from right now.
    setChaseTracking(dep.dependency_id, { lastSentAt: new Date().toISOString(), lastResponseAt: null });

    alert(`Nudge reminder message sent via ${channelText}!`);
    await selectDependencyAndRestoreScroll(dep.dependency_id);
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

  // Retrieve plan_id from the selected dependency record to resolve duplicate task IDs correctly
  const activeDep = dependencies.find(d => d.dependency_id === selectedDependencyId);
  const planId = activeDep ? activeDep.plan_id : null;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, delay_days: delayDays, plan_id: planId })
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
            const planName = p.release_name || `Plan ${idx + 1}: ${p.demand_id}`;
            return `<option value="${p.plan_id}">${planName} (${p.demand_id})</option>`;
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
          <h2 class="wizard-title">New Plan-Level Dependency</h2>
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
              <label for="edge-status">Status</label>
              <select id="edge-status">
                <option value="open">Open</option>
                <option value="at-risk">At Risk</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edge-risk">Risk Level</label>
              <select id="edge-risk">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div id="edge-actions-row" class="submit-row" style="margin-top: 2rem;">
            <button type="button" class="btn-primary" id="btn-save-edge" disabled>Create Dependency Record</button>
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
            const planName = p.release_name || `Plan ${idx + 1}: ${p.demand_id}`;
            return `<option value="${p.plan_id}">${planName} (${p.demand_id})</option>`;
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
  const planId = document.getElementById('edge-plan-id').value;
  const status = document.getElementById('edge-status').value;
  const risk = document.getElementById('edge-risk').value;
  let customId = document.getElementById('edge-id-custom').value.trim();

  const errorAlert = document.getElementById('edge-error');
  const actionRow = document.getElementById('edge-actions-row');

  errorAlert.style.display = 'none';

  if (!planId) {
    errorAlert.textContent = "Please select a Project Plan.";
    errorAlert.style.display = 'block';
    return;
  }

  if (!customId) {
    customId = "";
  }

  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Creating dependency record...</span>`;

  try {
    const payload = {
      dependency_id: customId,
      plan_id: planId,
      status: status,
      risk: risk
    };

    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Failed to create dependency record.");
    }
    const newRecord = await res.json();
    selectedDependencyId = newRecord.dependency_id;

    await window.fetchDependencies();
  } catch (err) {
    errorAlert.textContent = err.message;
    errorAlert.style.display = 'block';
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-save-edge">Create Dependency Record</button>`;
    document.getElementById('btn-save-edge').addEventListener('click', handleSaveEdge);
  }
}

// ====== AI-FIRST UX HELPER FUNCTIONS ======

function logActivity(depId, text) {
  return fetch(`${DEPENDENCIES_API_BASE}/dependencies/${depId}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activity: text })
  }).catch(e => console.error('Activity log failed:', e));
}

function buildMailtoUrl(to, subject, body) {
  const toPart = to ? encodeURIComponent(to) : '';
  return `mailto:${toPart}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function nbaSendReminder(dep) {
  const textEl = document.getElementById('chase-message-text');
  const text = (textEl && textEl.value) ? textEl.value : (dep.draft_message || `Following up on ${dep.dependency_id} — could you share a status update?`);
  window.location.href = buildMailtoUrl(dep.owner, `Reminder: ${dep.dependency_id} needs your update`, text);
  setChaseTracking(dep.dependency_id, { lastSentAt: new Date().toISOString(), lastResponseAt: null });
  logActivity(dep.dependency_id, `✉ Reminder email drafted for ${dep.owner}`);
}

function nbaScheduleSync(dep) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const title = encodeURIComponent(`15 min sync: ${dep.dependency_id}`);
  const details = encodeURIComponent(`Quick sync to unblock dependency ${dep.dependency_id} (${dep.source_task_id} \u2192 ${dep.target_task_id}). Owner: ${dep.owner}`);
  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
  window.open(calUrl, '_blank');
  logActivity(dep.dependency_id, `📅 15-min sync drafted in calendar with ${dep.owner}`);
}

function nbaEscalateTeamLead(dep) {
  const subject = `Escalation needed: ${dep.dependency_id}`;
  const body = `Dependency ${dep.dependency_id} (${dep.source_task_id} \u2192 ${dep.target_task_id}) is currently "${dep.status}" and needs Team Lead attention.\n\nOwner: ${dep.owner}`;
  window.location.href = buildMailtoUrl('', subject, body);
  logActivity(dep.dependency_id, '⚠️ Escalation email drafted for Team Lead');
}

async function nbaCreateRiskItem(dep) {
  const text = `Title: Risk — ${dep.dependency_id}\nDescription: Dependency ${dep.source_task_id} \u2192 ${dep.target_task_id} is "${dep.status}" and may impact the release.\nOwner: ${dep.owner}`;
  try {
    await navigator.clipboard.writeText(text);
    alert('Risk item details copied to clipboard — paste into ADO to create the work item.');
  } catch (e) {
    prompt('Copy this risk item text to create it in ADO:', text);
  }
  logActivity(dep.dependency_id, '🚨 Risk item details copied for ADO');
}

function nbaWait24h(dep) {
  logActivity(dep.dependency_id, '⏳ Follow-up snoozed for 24 hours');
}

function nbaUpdatePredecessor(dep) {
  const newStatus = prompt(`Update status/ETA for predecessor task ${dep.target_task_id}:\n1. Open\n2. At Risk\n3. Resolved\nEnter number 1-3:`, "3");
  if (!newStatus) return;
  let statusVal = "resolved";
  if (newStatus === "1") statusVal = "open";
  else if (newStatus === "2") statusVal = "at-risk";

  fetch(`${DEPENDENCIES_API_BASE}/dependencies/${dep.dependency_id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: statusVal })
  }).then(res => {
    if (res.ok) {
      alert(`Predecessor task status updated to ${statusVal.toUpperCase()}`);
      selectDependencyAndRestoreScroll(dep.dependency_id);
      window.fetchDependencies();
    }
  });
}

function nbaMarkComplete(dep) {
  if (!confirm(`Mark predecessor task ${dep.target_task_id} as complete and resolve dependency?`)) return;
  fetch(`${DEPENDENCIES_API_BASE}/dependencies/${dep.dependency_id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' })
  }).then(res => {
    if (res.ok) {
      alert('Dependency marked as RESOLVED.');
      selectDependencyAndRestoreScroll(dep.dependency_id);
      window.fetchDependencies();
    }
  });
}

function nbaReviseEta(dep) {
  const newEta = prompt(`Enter revised ETA for predecessor task ${dep.target_task_id} (YYYY-MM-DD):`);
  if (!newEta) return;
  logActivity(dep.dependency_id, `✓ Revise ETA: Predecessor task ETA updated to ${newEta}`).then(() => {
    alert(`Expected timeline updated to ${newEta}`);
    selectDependencyAndRestoreScroll(dep.dependency_id);
  });
}

function nbaNotifyStakeholders(dep) {
  const subject = `Delay Notice: ${dep.dependency_id} blocked`;
  const body = `Predecessor task ${dep.target_task_id} blocks ${dep.source_task_id}. Both tasks are assigned to ${dep.owner}.\n\nExpected timeline adjustment is in progress.`;
  window.location.href = buildMailtoUrl('', subject, body);
  logActivity(dep.dependency_id, '✓ Stakeholders notified of timeline adjustment draft');
}

function sendAgentStatusMail(agentName, dep) {
  const subject = `Agent Update: ${agentName} — ${dep.dependency_id}`;
  const bodyLines = [
    `Agent: ${agentName}`,
    `Dependency: ${dep.dependency_id} (${dep.source_task_id} \u2192 ${dep.target_task_id})`,
    `Owner: ${dep.owner}`,
    `Status: ${dep.status}`,
    '',
    'This is an automated agent status notification.'
  ];
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
  window.location.href = mailtoUrl;
}

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
    await selectDependencyAndRestoreScroll(depId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Re-render the currently open dependency panel periodically so "days since
// last contact" / "days to deadline" (and the threat level they drive) keep
// advancing even if the tab is left open across a day boundary, without
// needing any backend cron job.
setInterval(() => {
  if (selectedDependencyId !== null && document.getElementById('dependency-panel-container')) {
    selectDependencyAndRestoreScroll(selectedDependencyId);
  }
}, 60 * 60 * 1000); // hourly is enough to catch a date rollover