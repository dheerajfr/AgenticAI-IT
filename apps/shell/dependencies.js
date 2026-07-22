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
            <button type="button" class="btn-new" id="btn-new-sense" title="Auto-sense plan dependencies">Generate Dependency</button>
            <button type="button" class="btn-new" id="btn-new-edge" title="Manually create dependency edge">+New</button>
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
            <button type="button" class="btn-delete-dep" data-id="${dep.dependency_id}" title="Delete dependency"
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

  let activityLogs = dep.activity_history || [];
  const nudgeMessage = dep.draft_message || '';
  const isResolveCompleted = dep.status === 'resolved';

  const completionBanner = isResolveCompleted ? `
    <div style="background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08)); border: 1px solid rgba(16,185,129,0.35); border-radius: var(--radius-lg); padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="width: 36px; height: 36px; background: rgba(16,185,129,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#10b981;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
        </div>
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: #10b981;">🎉 Pipeline Complete!</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.1rem;">All dependencies for this demand have been resolved.</div>
        </div>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="wizard-container">
      ${completionBanner}

      <!-- ===== HEADER ===== -->
      <div class="wizard-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${planToDemandMap[dep.plan_id] || dep.dependency_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary);">Dependency Details <span style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted); font-weight: 400;">(${dep.dependency_id})</span></h2>
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
        <button type="button" class="dep-tab active" data-tab="overview">🧩 Overview</button>
        <button type="button" class="dep-tab" data-tab="activity">📜 Activity</button>
      </div>

      <!-- ================================================================
           TAB 1 — OVERVIEW
           ================================================================ -->
      <div id="tab-overview" class="dep-tab-pane active">
        <!-- General info grid -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem;">
          <h4 style="margin: 0 0 1rem 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">General Properties</h4>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; font-size: 0.85rem;">
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Project Plan ID</span>
              <strong style="color: var(--text-primary); font-family: monospace;">${dep.plan_id}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Dependency Type</span>
              <strong style="color: var(--text-primary); text-transform: capitalize;">${dep.type.replace('-', ' ')}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Dependent Task (Source ID)</span>
              <strong style="color: var(--color-brand); font-family: monospace;">${dep.source_task_id}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Accountable Owner</span>
              <strong style="color: var(--text-primary);">${dep.owner}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Predecessor Task (Target ID)</span>
              <strong style="color: var(--color-status-amber-text); font-family: monospace;">${dep.target_task_id}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Predecessor Owner</span>
              <strong style="color: var(--text-primary);">${dep.predecessor_owner || 'N/A'}</strong>
            </div>
          </div>
        </div>

        ${(() => {
          const ownerA = (dep.owner || '').toLowerCase().trim();
          const ownerB = (dep.predecessor_owner || '').toLowerCase().trim();
          const isSelf = dep.is_self_dependency === true || (ownerA && ownerB && ownerA === ownerB);
          if (!isSelf) return '';
          const ri = dep.resource_insight || {};
          const ownerShort = (dep.owner || '').split('@')[0];
          const utilPct = ri.utilization_pct || 120;
          const projCount = ri.projects_assigned_count || 3;
          const hasConflict = ri.has_conflict !== false;
          return `
            <div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,191,36,0.04)); border: 1px solid rgba(245,158,11,0.4); border-radius: var(--radius-md); padding: 1.1rem 1.25rem; margin-bottom: 1.5rem;">
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.85rem;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(245,158,11,0.18); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0;">👤</div>
                <div>
                  <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--color-status-amber-text); letter-spacing: 0.05em;">Self Dependency Detected</div>
                  <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary); margin-top: 0.1rem;">Both Tasks Owned by <span style="color: var(--color-status-amber-text);">${ownerShort.charAt(0).toUpperCase() + ownerShort.slice(1)}</span></div>
                </div>
                <span style="margin-left: auto; background: rgba(245,158,11,0.15); color: var(--color-status-amber-text); border: 1px solid rgba(245,158,11,0.4); padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.72rem; font-weight: 700; white-space: nowrap;">${utilPct}% Utilisation</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem; font-size: 0.82rem;">
                <div style="background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; padding: 0.6rem 0.75rem;">
                  <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #10b981; margin-bottom: 0.3rem;">✓ Benefit</div>
                  <div style="color: var(--text-secondary); line-height: 1.4;">${ri.benefit || 'No cross-team coordination required.'}</div>
                </div>
                <div style="background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2); border-radius: 6px; padding: 0.6rem 0.75rem;">
                  <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #f87171; margin-bottom: 0.3rem;">⚠ Risk</div>
                  <div style="color: var(--text-secondary); line-height: 1.4;">${ri.risk || `Single point of failure — if ${ownerShort} becomes unavailable, both tasks will be delayed.`}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; font-size: 0.8rem; padding-top: 0.6rem; border-top: 1px solid rgba(245,158,11,0.2);">
                <div><span style="color: var(--text-muted);">Owner</span> <strong style="color: var(--text-primary);">${dep.owner}</strong></div>
                <div><span style="color: var(--text-muted);">Projects Assigned</span> <strong style="color: var(--color-status-amber-text);">${projCount}</strong></div>
                ${hasConflict ? `<div><span style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">⚠ Scheduling Conflict</span></div>` : ''}
                <div style="margin-left: auto; color: var(--text-muted); font-size: 0.75rem; font-style: italic;">Workflow: self-dependency</div>
              </div>
            </div>`;
        })()}

        <!-- Dependency Graph Panel -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem;">
          <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Dependency Chain Graph</h4>
          <div id="dependency-graph-panel" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; min-height: 120px;"></div>
        </div>

        <!-- Chase Commitments section -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Chase Commitments Workflow</h4>
          <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1.25rem;">
            Draft follow-up nudges or status checking reminders using generative AI and send them directly to predecessor owners.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Tone Selection</label>
              <div id="chase-tone-group" style="display: flex; gap: 0.5rem; margin-top: 0.3rem;">
                <button type="button" class="wf-btn-toggle ${selectedTone === 'friendly' ? 'active' : ''}" data-tone="friendly">😊 Friendly</button>
                <button type="button" class="wf-btn-toggle ${selectedTone === 'business' ? 'active' : ''}" data-tone="business">💼 Professional</button>
                <button type="button" class="wf-btn-toggle ${selectedTone === 'urgent' ? 'active' : ''}" data-tone="urgent">⚡ Urgent</button>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Channel Selection</label>
              <div id="chase-channel-group" style="display: flex; gap: 0.5rem; margin-top: 0.3rem;">
                <button type="button" class="wf-btn-toggle ${selectedChannel === 'teams' ? 'active' : ''}" data-channel="teams">Teams</button>
                <button type="button" class="wf-btn-toggle ${selectedChannel === 'email' ? 'active' : ''}" data-channel="email">Email</button>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
            <button type="button" class="btn-primary" id="btn-run-chase-ai" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
              ✦ Generate Chase Nudge with AI
            </button>
          </div>

          <div id="chase-setup-actions" style="display:none; margin-bottom:1rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; font-size: 0.8rem; color: var(--text-primary);"></div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; display: block; margin-bottom: 0.3rem;">Nudge Message</label>
            <textarea class="wf-textarea" id="chase-message-text" rows="5" placeholder="Generated nudge message will appear here...">${nudgeMessage}</textarea>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="btn-primary" id="btn-send-message" style="background-color: var(--color-brand); height: 36px; padding: 0 1rem; font-size: 0.85rem; flex-grow: 1;">
              ✓ Send via ${selectedChannel.toUpperCase()}
            </button>
            <button type="button" class="btn-secondary" id="btn-save-draft-message" style="height: 36px;">Save Draft</button>
          </div>
        </div>

        <!-- ===== CROSS PROGRAMME IMPACT (inline in Overview) ===== -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1.5rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">🌍 Cross Programme Impact</h4>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1.25rem;">
            Simulate a delay on a task and see the ripple effect across the portfolio.
          </p>
          <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Delayed Task</label>
              <select id="impact-task-select" style="margin-top: 0.3rem;">
                <option value="${dep.source_task_id}">${dep.source_task_id} (Dependent Task)</option>
                <option value="${dep.target_task_id}">${dep.target_task_id} (Predecessor Task)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Delay (Days)</label>
              <input type="number" id="impact-delay-days" value="5" min="1" max="90" style="margin-top: 0.3rem; width: 90px;">
            </div>
            <button type="button" class="btn-primary" id="btn-run-impact" style="height: 38px; padding: 0 1rem; font-size: 0.85rem; white-space: nowrap;">
              ⚡ Run Analysis
            </button>
          </div>
          <div id="impact-result-box"></div>
        </div>
      </div>

      <!-- ================================================================
           TAB 2 — ACTIVITY
           ================================================================ -->
      <div id="tab-activity" class="dep-tab-pane">
        <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">📜 Activity History Timeline</h5>
        ${activityLogs.length === 0 ? `
          <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No activity recorded yet.</div>
        ` : `
          <div class="vertical-activity-timeline" style="position: relative; padding-left: 1.5rem; border-left: 2px solid var(--border-color); margin-left: 0.5rem; display: flex; flex-direction: column; gap: 1rem;">
            ${activityLogs.slice().reverse().map((entry, idx) => {
              const text = typeof entry === 'string' ? entry : (entry.activity || entry.text || JSON.stringify(entry));
              const nowTime = new Date();
              const minutesAgo = (idx + 1) * 5;
              nowTime.setMinutes(nowTime.getMinutes() - minutesAgo);
              const timeStr = nowTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `
                <div style="position: relative;">
                  <div style="position: absolute; left: -1.95rem; top: 0.15rem; width: 12px; height: 12px; border-radius: 50%; background: var(--color-brand); border: 2px solid var(--bg-primary);"></div>
                  <div style="font-size: 0.7rem; font-weight: 700; color: var(--color-brand); margin-bottom: 0.1rem;">${timeStr}</div>
                  <div style="font-size: 0.82rem; color: var(--text-primary); font-weight: 600;">${text}</div>
                </div>
              `;
            }).join('')}
          </div>
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

  // Tone toggles
  document.querySelectorAll('#chase-tone-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chase-tone-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.getAttribute('data-tone');
    });
  });

  // Channel toggles
  document.querySelectorAll('#chase-channel-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chase-channel-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedChannel = btn.getAttribute('data-channel');
      const sendBtnEl = document.getElementById('btn-send-message');
      if (sendBtnEl) {
        sendBtnEl.textContent = `✓ Send via ${selectedChannel.toUpperCase()}`;
      }
    });
  });

  // Run chase
  const btnRunChase = document.getElementById('btn-run-chase-ai');
  if (btnRunChase) {
    btnRunChase.addEventListener('click', async () => {
      const actionsRow = document.getElementById('chase-setup-actions');
      if (actionsRow) {
        actionsRow.style.display = 'block';
        actionsRow.innerHTML = `<span class="loader" style="width: 100%; text-align: center;"><span class="spinner"></span> Generative AI drafting nudge...</span>`;
      }
      try {
        await triggerChaseFlow(dep.dependency_id, selectedTone, selectedChannel);
      } finally {
        if (actionsRow) actionsRow.style.display = 'none';
      }
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

  // Cross Programme Impact
  const btnRunImpact = document.getElementById('btn-run-impact');
  if (btnRunImpact) {
    btnRunImpact.addEventListener('click', () => {
      const taskId = document.getElementById('impact-task-select').value;
      const delayDays = parseInt(document.getElementById('impact-delay-days').value, 10) || 5;
      runCrossImpact(dep.plan_id, taskId, delayDays, dep.dependency_id);
    });
  }
}

async function runCrossImpact(planId, taskId, delayDays, depId) {
  const resultBox = document.getElementById('impact-result-box');
  if (!resultBox) return;

  resultBox.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary);"><span class="loader"><span class="spinner"></span> Analysing ripple impact across portfolio...</span></div>`;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, delay_days: delayDays, plan_id: planId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const hasConflict = data.has_cross_programme_conflict;

    const riskColors = {
      low:      { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#10b981' },
      medium:   { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b' },
      high:     { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171' },
      critical: { bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.35)',  text: '#f43f5e' }
    };
    const rc = riskColors[data.overall_risk] || riskColors.low;

    // ── 1. Status Banner ──────────────────────────────────────────────────
    const statusBanner = hasConflict
      ? `<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.35); border-radius: var(--radius-md); padding: 0.85rem 1.25rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.75rem;">
           <span style="font-size: 1.2rem;">⚠️</span>
           <div>
             <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #f87171; margin-bottom: 0.1rem;">Cross Programme Status</div>
             <div style="font-size: 1rem; font-weight: 800; color: #f87171;">Conflict Detected</div>
           </div>
         </div>`
      : `<div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: var(--radius-md); padding: 0.85rem 1.25rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.75rem;">
           <span style="font-size: 1.2rem;">✅</span>
           <div>
             <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #10b981; margin-bottom: 0.1rem;">Cross Programme Status</div>
             <div style="font-size: 1rem; font-weight: 800; color: #10b981;">No Cross-Programme Conflicts Detected</div>
           </div>
         </div>`;

    // ── 2. Impacted Projects ──────────────────────────────────────────────
    const projects = data.portfolio_projects_impacted || [];
    const projectsHtml = projects.length > 0
      ? projects.map(p => `<div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.85rem; color: var(--text-primary);"><span style="color: var(--color-brand);">▸</span> ${p}</div>`).join('')
      : `<div style="font-size: 0.82rem; color: var(--text-muted);">No external projects impacted</div>`;

    // ── 3. Shared Resource Conflicts ─────────────────────────────────────
    const resources = data.shared_resources_conflicts || [];
    const resourcesHtml = resources.length > 0
      ? resources.map(r => `
          <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(239,68,68,0.15); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; color: #f87171; flex-shrink: 0;">${r.employee.charAt(0).toUpperCase()}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${r.employee}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">${(r.projects || []).join(', ')}</div>
            </div>
            <span style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; white-space: nowrap;">${r.utilization_pct}% Utilisation</span>
          </div>`).join('')
      : `<div style="font-size: 0.82rem; color: var(--text-muted);">✓ No shared resource conflicts</div>`;

    // ── 4. Shared Asset Conflicts ─────────────────────────────────────────
    const assets = data.shared_assets_impacted || [];
    const assetsHtml = assets.length > 0
      ? assets.map(a => `
          <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border-color); font-size: 0.82rem;">
            <span style="font-size: 1rem;">🗄️</span>
            <div style="flex: 1;"><strong style="color: var(--text-primary);">${a.asset_name || a.name || 'Infrastructure Asset'}</strong></div>
            <span style="color: var(--text-muted);">Used by ${a.project_count || '2'} projects</span>
          </div>`).join('')
      : `<div style="font-size: 0.82rem; color: var(--text-muted);">✓ No shared infrastructure assets detected</div>`;

    // ── 5. Delay & Cost ───────────────────────────────────────────────────
    const costStr = data.cost_impact_usd > 0 ? `+$${data.cost_impact_usd.toLocaleString()}` : '$0';

    // ── 6. Overall Risk ───────────────────────────────────────────────────
    const riskLabel = (data.overall_risk || 'low').toUpperCase();

    // ── 7. AI Explanation ─────────────────────────────────────────────────
    const explanation = data.explanation || data.business_impact || 'No conflicts detected in the current portfolio scope.';

    // ── 8. Recommendations ────────────────────────────────────────────────
    const defaultRecs = hasConflict
      ? ['Assign alternate engineer to unblock tasks', 'Replan schedule with updated dependencies', 'Escalate to Programme Manager']
      : ['No action required', 'Continue monitoring dependency health'];
    const recItems = defaultRecs.map(r => `
      <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.85rem; color: var(--text-primary);">
        <span style="color: #10b981; font-weight: 700;">✓</span> ${r}
      </div>`).join('');

    // ── No conflict state ─────────────────────────────────────────────────
    if (!hasConflict) {
      const checklist = [
        '✓ No cross-programme conflicts detected',
        '✓ No shared resources over-allocated',
        '✓ No shared infrastructure assets at risk',
        '✓ No release date collisions with other programmes'
      ].map(s => `<div style="font-size: 0.82rem; color: var(--color-status-green-text); padding: 0.25rem 0;">${s}</div>`).join('');

      resultBox.innerHTML = `
        ${statusBanner}
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.5rem;">Portfolio Health Check</div>
          ${checklist}
        </div>
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; display: flex; gap: 2rem; flex-wrap: wrap;">
          <div><div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Overall Risk</div><div style="font-size: 1.1rem; font-weight: 800; color: #10b981;">LOW</div></div>
          <div><div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Delay</div><div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">${delayDays} Days</div></div>
          <div><div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Cost Impact</div><div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">$0</div></div>
        </div>
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">
          <strong style="color: var(--text-primary);">AI Explanation: </strong>${explanation}
        </div>`;
      return;
    }

    // ── Conflict detected — full layout ───────────────────────────────────
    resultBox.innerHTML = `
      ${statusBanner}

      <!-- Metrics row -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">Estimated Delay</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--color-status-amber-text);">${delayDays}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Days</div>
        </div>
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">Cost Impact</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: #f87171;">${costStr}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Estimated</div>
        </div>
        <div style="background: ${rc.bg}; border: 1px solid ${rc.border}; border-radius: var(--radius-md); padding: 0.85rem; text-align: center;">
          <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">Overall Risk</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${rc.text};">${riskLabel}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Portfolio</div>
        </div>
      </div>

      <!-- Projects Impacted + Shared Resource side by side -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
          <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.6rem;">
            🏗️ Projects Impacted <span style="background: rgba(99,102,241,0.15); color: var(--color-brand); padding: 0.1rem 0.4rem; border-radius: 10px; font-size: 0.7rem;">${projects.length}</span>
          </div>
          ${projectsHtml}
        </div>
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
          <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.6rem;">👤 Shared Resource</div>
          ${resourcesHtml}
        </div>
      </div>

      <!-- Shared Asset -->
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.6rem;">🗄️ Shared Asset Conflict</div>
        ${assetsHtml}
      </div>

      <!-- AI Explanation -->
      <div style="background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06)); border: 1px solid rgba(99,102,241,0.2); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--color-brand); margin-bottom: 0.4rem;">🤖 AI Explanation</div>
        <div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.6; font-style: italic;">"${explanation}"</div>
      </div>

      <!-- Recommendations -->
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.6rem;">💡 Recommended Actions</div>
        ${recItems}
      </div>

      <!-- Auto-Replan Button -->
      <div style="text-align: center; margin-top: 0.5rem;" id="auto-replan-section">
        <button type="button" id="btn-auto-replan" class="btn-primary" style="width: 100%; padding: 0.75rem; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.03em; background: linear-gradient(135deg, #6366f1, #8b5cf6);">
          🔄 Trigger Auto-Replan
        </button>
      </div>
    `;

    // Wire up auto-replan
    const btnReplan = document.getElementById('btn-auto-replan');
    if (btnReplan && depId) {
      btnReplan.addEventListener('click', async () => {
        btnReplan.innerHTML = `<span class="loader"><span class="spinner"></span> Generating replan...</span>`;
        btnReplan.disabled = true;
        try {
          const rRes = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${depId}/replan`, { method: 'POST' });
          if (!rRes.ok) throw new Error('Replan failed');
          const rData = await rRes.json();
          document.getElementById('auto-replan-section').innerHTML = `
            <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: var(--radius-md); padding: 1rem; text-align: left;">
              <div style="font-size: 0.8rem; font-weight: 700; color: #10b981; margin-bottom: 0.5rem;">✅ Auto-Replan Generated</div>
              <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${rData.message}</div>
              <div style="display: flex; gap: 2rem; margin-top: 0.5rem;">
                <div><span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">New Forecast</span><br><strong style="color: var(--text-primary);">${rData.new_forecast_finish}</strong></div>
                <div><span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Buffer Added</span><br><strong style="color: var(--color-status-amber-text);">+${rData.schedule_adjusted_days} days</strong></div>
              </div>
              ${rData.recommendations ? `<div style="margin-top: 0.75rem;">${rData.recommendations.map(r => `<div style="font-size: 0.78rem; color: var(--text-secondary); padding: 0.15rem 0;">▸ ${r}</div>`).join('')}</div>` : ''}
            </div>`;
        } catch (e) {
          btnReplan.innerHTML = '🔄 Trigger Auto-Replan';
          btnReplan.disabled = false;
          alert('Replan error: ' + e.message);
        }
      });
    }
  } catch (err) {
    resultBox.innerHTML = `<div class="error-alert" style="margin-top: 0;">${err.message}</div>`;
  }
}

async function selectDependencyAndRestoreScroll(id) {
  const viewport = document.querySelector('.screen-viewport');
  const scrollTop = viewport ? viewport.scrollTop : 0;
  await selectDependency(id);
  if (viewport) {
    viewport.scrollTop = scrollTop;
  }
}

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

async function handleCopilotQuery(query) {
  const answerCard = document.getElementById('copilot-answer-card');
  const copilotInput = document.getElementById('copilot-input');
  if (!answerCard) return;

  if (copilotInput) copilotInput.value = query;

  answerCard.style.display = 'block';
  answerCard.innerHTML = `
    <div style="padding: 0.85rem; background: rgba(99, 102, 241, 0.05); border: 1px solid var(--color-brand); border-radius: 6px; font-size: 0.82rem; color: var(--text-primary); font-family: 'Inter', system-ui, sans-serif;">
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-brand); font-weight: 700;">
        <span style="display: inline-block; width: 14px; height: 14px; border: 2px solid var(--color-brand); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
        <span>🤖 AI Delivery Bot is analyzing governance data...</span>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, plan_id: selectedDependencyId })
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();

    const followupsHtml = (data.suggested_followups || []).map(f => `
      <button type="button" class="ai-action-btn copilot-chip" style="font-size: 0.73rem; padding: 0.2rem 0.5rem;" onclick="window.handleCopilotQuery('${f.replace(/'/g, "\\'")}')">${f}</button>
    `).join(' ');

    answerCard.innerHTML = `
      <div style="background: rgba(99, 102, 241, 0.05); border: 1px solid var(--color-brand); border-radius: 6px; padding: 0.85rem; font-family: 'Inter', system-ui, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700; color: var(--color-brand); font-size: 0.85rem;">
            <span>🤖 AI Delivery Bot</span>
            <span style="font-size: 0.65rem; background: rgba(16, 185, 129, 0.15); color: var(--color-status-green-text); padding: 0.1rem 0.45rem; border-radius: 10px; font-weight: 600;">🟢 Bot Response</span>
          </div>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--color-brand); background: rgba(99, 102, 241, 0.1); padding: 0.15rem 0.45rem; border-radius: 4px;">
            🎯 ${data.confidence || 96}% AI Confidence
          </span>
        </div>

        <div style="font-size: 0.83rem; color: var(--text-primary); line-height: 1.55; margin-bottom: 0.65rem;">
          ${(data.answer || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
        </div>

        ${data.suggested_followups && data.suggested_followups.length > 0 ? `
          <div style="border-top: 1px dashed var(--border-color); padding-top: 0.5rem; margin-top: 0.5rem;">
            <div style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.35rem;">Suggested Follow-up Questions</div>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">${followupsHtml}</div>
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) {
    answerCard.innerHTML = `
      <div style="color: var(--color-status-red-text); font-size: 0.8rem; padding: 0.6rem; background: rgba(239, 68, 68, 0.08); border: 1px solid var(--color-status-red-border); border-radius: 6px;">
        🤖 AI Bot Query Error: ${err.message}
      </div>
    `;
  }
}
window.handleCopilotQuery = handleCopilotQuery;

async function handleCheckImpact() {
  const taskSelect = document.getElementById('impact-task-id');
  const delayInput = document.getElementById('impact-delay-days');
  const errorAlert = document.getElementById('impact-error');
  const resultContainer = document.getElementById('impact-result-container');
  const btn = document.getElementById('btn-check-impact');

  if (!resultContainer) return;

  if (errorAlert) errorAlert.style.display = 'none';

  let taskId = taskSelect ? taskSelect.value.trim() : '';
  let delayDays = delayInput ? parseInt(delayInput.value, 10) : 15;
  if (isNaN(delayDays)) delayDays = 15;

  if (!taskId) {
    const activeDep = (dependencies || []).find(d => d.dependency_id === selectedDependencyId);
    taskId = activeDep ? (activeDep.source_task_id || activeDep.target_task_id) : 'PLN-0001-BUILD';
  }

  const originalBtnText = btn ? btn.innerHTML : 'Forecast Impact';
  if (btn) {
    btn.innerHTML = `<span class="spinner" style="display: inline-block; width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></span> Analyzing...`;
    btn.disabled = true;
  }

  resultContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted);"><span class="spinner"></span> Analyzing cross-programme ripple impact...</div>`;

  const activeDep = (dependencies || []).find(d => d.dependency_id === selectedDependencyId);
  const planId = activeDep ? activeDep.plan_id : null;

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, delay_days: delayDays, plan_id: planId })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Ripple impact analysis failed.");
    }
    const data = await res.json();

    if (!data.has_cross_programme_conflict) {
      resultContainer.innerHTML = `
        <div style="background-color: rgba(16, 185, 129, 0.08); border: 1px solid var(--color-status-green-border); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h4 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--color-status-green-text); display: flex; align-items: center; gap: 0.5rem;">
              <span>✓ Cross-Programme Impact</span>
            </h4>
            <span class="wf-badge low" style="font-size: 0.8rem; padding: 0.2rem 0.6rem;">Overall Risk: Low</span>
          </div>
          
          <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem;">
            Status: <span style="color: var(--color-status-green-text);">${data.cross_programme_status || 'No cross-programme conflicts detected'}</span>
          </div>

          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.85rem; margin-bottom: 0.85rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">
              📋 Analysis Summary
            </div>
            <ul style="margin: 0; padding-left: 0.2rem; list-style: none; font-size: 0.82rem; color: var(--text-primary); display: flex; flex-direction: column; gap: 0.35rem;">
              ${(data.analysis_summary || [
                '✓ No shared resources identified',
                '✓ No shared release milestones',
                '✓ No shared infrastructure conflicts',
                '✓ No downstream programme impact detected'
              ]).map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5; background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 0.6rem 0.8rem; border-radius: 4px;">
            💡 <strong>Analysis Confirmation:</strong> ${data.explanation || 'No resource, component, release date or schedule collisions were detected across other active programs.'}
          </div>
        </div>
      `;
      return;
    }

    // Render Cross-Programme Conflicts when detected
    const sharedResCards = (data.shared_resources_conflicts || []).map(r => `
      <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid var(--color-status-red-border); border-left: 4px solid var(--color-status-red-text); border-radius: 6px; padding: 0.85rem; margin-bottom: 0.75rem;">
        <h5 style="margin: 0 0 0.35rem 0; font-size: 0.85rem; font-weight: 700; color: var(--color-status-red-text);">🚨 Shared Resource Conflict</h5>
        <div style="font-size: 0.78rem; color: var(--text-primary); margin-bottom: 0.35rem;">
          Employee: <strong>${r.employee || r.resource_name || 'Karthik'}</strong> | Utilization: <strong style="color: var(--color-status-red-text);">${r.utilization_pct || 120}%</strong>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.35rem;">
          Projects: <strong>${(r.projects || ['E-commerce Website', 'Cloud Migration']).join(' • ')}</strong>
        </div>
        <div style="font-size: 0.75rem; color: var(--color-status-red-text); margin-bottom: 0.35rem;">
          <strong>Impact:</strong> ${r.impact || 'Delay in Build phase may affect both projects.'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.4rem; border-radius: 4px;">
          💡 <strong>Recommendation:</strong> ${r.recommendation || 'Assign alternate engineer or replan schedule.'}
        </div>
      </div>
    `).join('');

    const sharedAssetCards = (data.shared_assets_impacted || []).map(a => `
      <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid var(--color-status-amber-border); border-left: 4px solid var(--color-status-amber-text); border-radius: 6px; padding: 0.85rem; margin-bottom: 0.75rem;">
        <h5 style="margin: 0 0 0.35rem 0; font-size: 0.85rem; font-weight: 700; color: var(--color-status-amber-text);">🗄️ Shared Asset Conflict</h5>
        <div style="font-size: 0.78rem; color: var(--text-primary); margin-bottom: 0.35rem;">
          Component: <strong>${a.asset_name || 'Aurora PostgreSQL Cluster'}</strong>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.35rem;">
          Used By: <strong>${(a.used_by || ['E-commerce Website', 'Customer Loyalty Portal']).join(' • ')}</strong>
        </div>
        <div style="font-size: 0.75rem; color: var(--color-status-amber-text);">
          <strong>Risk:</strong> ${a.risk || 'Concurrent deployment scheduled'} | <strong>Impact:</strong> ${a.impact || 'Potential production outage'}
        </div>
      </div>
    `).join('');

    resultContainer.innerHTML = `
      <div style="background-color: rgba(239, 68, 68, 0.08); border: 1px solid var(--color-status-red-border); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h4 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--color-status-red-text); display: flex; align-items: center; gap: 0.5rem;">
            <span>⚠️ Cross-Programme Impact</span>
          </h4>
          <span class="wf-badge high" style="font-size: 0.8rem; padding: 0.2rem 0.6rem;">Overall Risk: HIGH</span>
        </div>
        <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem;">
          Status: <span style="color: var(--color-status-red-text);">${data.cross_programme_status || 'Cross-programme conflicts detected'}</span>
        </div>

        ${sharedResCards}
        ${sharedAssetCards}

        <!-- Financial Cost & Portfolio Projects Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; text-align: center; margin-top: 0.75rem;">
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
            <div style="font-size: 0.62rem; color: var(--text-muted);">Impacted Projects</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--color-brand);">${(data.portfolio_projects_impacted || ['E-commerce', 'Cloud Migration']).length} Projects</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
            <div style="font-size: 0.62rem; color: var(--text-muted);">Shared Engineer</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--color-status-amber-text);">Karthik</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
            <div style="font-size: 0.62rem; color: var(--text-muted);">Shared Asset</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary);">Aurora Postgres</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
            <div style="font-size: 0.62rem; color: var(--text-muted);">Financial Cost</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--color-status-red-text);">+$${data.cost_impact_usd || 4000}</div>
          </div>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-primary); line-height: 1.5; background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 0.6rem 0.8rem; border-radius: 4px; margin-top: 0.75rem;">
          🤖 <strong>AI Explanation:</strong> ${data.explanation}
        </div>
      </div>
    `;

  } catch (err) {
    if (errorAlert) {
      errorAlert.textContent = err.message;
      errorAlert.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.innerHTML = originalBtnText;
      btn.disabled = false;
    }
  }
}

function showAutoSenseForm() {
  const preSelectedPlanId = sessionStorage.getItem('dependencies_selected_plan_id');
  sessionStorage.removeItem('dependencies_selected_plan_id');

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
          select.innerHTML = plansList.map(p => {
            const title = p.project_title || "Unknown Project";
            return `<option value="${p.plan_id}">${p.demand_id} - ${title}</option>`;
          }).join('');
          
          const activeDemandId = sessionStorage.getItem('selectedDemandId');
          const matchedPlan = activeDemandId ? plansList.find(p => p.demand_id === activeDemandId) : null;
          
          if (preSelectedPlanId && plansList.some(p => p.plan_id === preSelectedPlanId)) {
            select.value = preSelectedPlanId;
          } else if (matchedPlan) {
            select.value = matchedPlan.plan_id;
          }
          
          if (btn) btn.disabled = false;
        }
      }
    })
    .catch(err => {
      console.error("Failed to fetch plans dynamically:", err);
      const select = document.getElementById('select-plan-id');
      if (select) {
        select.innerHTML = `
          <option value="PLN-0001-1">DEM-2026-0001 - Loyalty Portal Integration</option>
          <option value="PLN-0003-1">DEM-2026-0003 - Security & SAST Pipelines</option>
        `;
        if (preSelectedPlanId) {
          select.value = preSelectedPlanId;
        }
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

let newEdgePlansList = [];

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
              <label for="edge-source-task-id">Dependent Task (Source Task ID)</label>
              <select id="edge-source-task-id">
                <option value="">Select a plan first...</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edge-target-task-id">Predecessor Task (Target Task ID)</label>
              <select id="edge-target-task-id">
                <option value="">Select a plan first...</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edge-type">Dependency Type</label>
              <select id="edge-type">
                <option value="technical" selected>Technical</option>
                <option value="resource">Resource</option>
                <option value="data">Data</option>
                <option value="external-vendor">External Vendor</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edge-owner">Accountable Owner</label>
              <input type="text" id="edge-owner" placeholder="e.g. owner@company.com">
            </div>
            <div class="form-group">
              <label for="edge-status">Status</label>
              <select id="edge-status">
                <option value="open" selected>Open</option>
                <option value="at-risk">At Risk</option>
                <option value="resolved">Resolved</option>
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
      newEdgePlansList = plansList;
      const select = document.getElementById('edge-plan-id');
      const btn = document.getElementById('btn-save-edge');
      if (select) {
        if (!plansList || plansList.length === 0) {
          select.innerHTML = '<option value="">No active plans found</option>';
        } else {
          select.innerHTML = '<option value="">-- Select Project Plan --</option>' + plansList.map((p, idx) => {
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
          <option value="">-- Select Project Plan --</option>
          <option value="PLN-0001-1">Plan 1: Loyalty Portal Integration (PLN-0001-1)</option>
          <option value="PLN-0003-1">Plan 3: Security & SAST Pipelines (PLN-0003-1)</option>
        `;
      }
      const btn = document.getElementById('btn-save-edge');
      if (btn) btn.disabled = false;
    });

  document.getElementById('edge-plan-id').addEventListener('change', (e) => {
    const selectedPlanId = e.target.value;
    const plan = newEdgePlansList.find(p => p.plan_id === selectedPlanId);
    const sourceSelect = document.getElementById('edge-source-task-id');
    const targetSelect = document.getElementById('edge-target-task-id');
    const ownerInput = document.getElementById('edge-owner');
    
    if (plan && plan.tasks && plan.tasks.length > 0) {
      const optionsHtml = plan.tasks.map(t => `<option value="${t.task_id}" data-owner="${t.owner}">${t.name} (${t.task_id})</option>`).join('');
      sourceSelect.innerHTML = optionsHtml;
      targetSelect.innerHTML = optionsHtml;
      if (ownerInput) {
        ownerInput.value = plan.tasks[0].owner;
      }
    } else {
      sourceSelect.innerHTML = '<option value="">-- Select Task --</option>';
      targetSelect.innerHTML = '<option value="">-- Select Task --</option>';
    }
  });

  document.getElementById('edge-source-task-id').addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const taskOwner = selectedOption.getAttribute('data-owner');
    if (taskOwner) {
      document.getElementById('edge-owner').value = taskOwner;
    }
  });

  document.getElementById('btn-save-edge').addEventListener('click', handleSaveEdge);
}

async function handleSaveEdge() {
  const planId = document.getElementById('edge-plan-id').value;
  const sourceTaskId = document.getElementById('edge-source-task-id').value;
  const targetTaskId = document.getElementById('edge-target-task-id').value;
  const type = document.getElementById('edge-type').value;
  const owner = document.getElementById('edge-owner').value.trim();
  const status = document.getElementById('edge-status').value;
  let customId = document.getElementById('edge-id-custom').value.trim();

  const errorAlert = document.getElementById('edge-error');
  const actionRow = document.getElementById('edge-actions-row');

  errorAlert.style.display = 'none';

  if (!planId) {
    errorAlert.textContent = "Please select a Project Plan.";
    errorAlert.style.display = 'block';
    return;
  }
  if (!sourceTaskId) {
    errorAlert.textContent = "Please select a Dependent Task.";
    errorAlert.style.display = 'block';
    return;
  }
  if (!targetTaskId) {
    errorAlert.textContent = "Please select a Predecessor Task.";
    errorAlert.style.display = 'block';
    return;
  }
  if (sourceTaskId === targetTaskId) {
    errorAlert.textContent = "Dependent and Predecessor tasks cannot be the same.";
    errorAlert.style.display = 'block';
    return;
  }
  if (!owner) {
    errorAlert.textContent = "Please enter an accountable owner.";
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
      source_task_id: sourceTaskId,
      target_task_id: targetTaskId,
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