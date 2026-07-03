const DEPENDENCIES_API_BASE = 'http://127.0.0.1:8000/api';

let dependencies = [];
let selectedDependencyId = null;

// Expose to window so shell.js can call it
window.renderDependenciesScreen = function() {
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

window.fetchDependencies = async function() {
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

    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${dep.dependency_id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${dep.dependency_id}</span>
          <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${statusClass}">
            ${dep.status}
          </span>
        </div>
        <h4 class="demand-item-title">${dep.source_task_id} &rarr; ${dep.target_task_id}</h4>
        <div class="demand-item-meta">
          <span style="text-transform: capitalize;">Type: ${typeLabel}</span>
          <span>Owner: ${dep.owner}</span>
        </div>
      </li>
    `;
  }).join('');

  // Attach click events
  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      selectDependency(id);
    });
  });
}

async function selectDependency(id) {
  selectedDependencyId = id;
  clearDependencySidebarSelection();
  
  const item = document.querySelector(`.demand-item[data-id="${id}"]`);
  if (item) item.classList.add('active');

  const container = document.getElementById('dependency-panel-container');
  const dep = dependencies.find(d => d.dependency_id === id);
  if (!dep) return;

  let statusClass = 'gray';
  if (dep.status === 'open') statusClass = 'amber';
  else if (dep.status === 'at-risk') statusClass = 'red';
  else if (dep.status === 'resolved') statusClass = 'green';

  container.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-header">
        <div>
          <span class="wizard-stage-indicator" style="text-transform: uppercase;">Dependency Details</span>
          <h2 class="wizard-title">${dep.dependency_id}</h2>
        </div>
        <span style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; display: inline-block;" class="${statusClass}">
          ${dep.status}
        </span>
      </div>

      <div class="wizard-card info-card">
        <h4 class="card-section-title">Relationship Mapping</h4>
        <div class="grid-2col">
          <div class="data-item">
            <div class="data-label">Source Task ID (Dependent)</div>
            <div class="data-value" style="font-family: monospace; font-size: 1.1rem; color: var(--color-brand);">${dep.source_task_id}</div>
          </div>
          <div class="data-item">
            <div class="data-label">Target Task ID (Predecessor)</div>
            <div class="data-value" style="font-family: monospace; font-size: 1.1rem; color: var(--text-primary);">${dep.target_task_id}</div>
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
      </div>

      <!-- Chase Commitment Tool Section -->
      <div class="wizard-card" style="margin-top: 1.5rem;">
        <h4 class="card-section-title">Chase Commitment Workflow</h4>
        <p class="description-text" style="margin-bottom: 1rem;">
          Triggers an automated analysis of this dependency. Senses critical path context and compiles an actionable follow-up nudge draft.
        </p>
        <div id="chase-action-row">
          <button type="button" class="btn-primary" id="btn-trigger-chase">Trigger Chase Workflow (AI)</button>
        </div>
        <div id="chase-result-container" style="margin-top: 1rem;"></div>
      </div>

      <!-- Cross-Programme Impact Delay Tool Section -->
      <div class="wizard-card" style="margin-top: 1.5rem;">
        <h4 class="card-section-title">Cross-Programme Ripple Impact Analysis</h4>
        <p class="description-text" style="margin-bottom: 1rem;">
          Forecast timeline slippages and schedule relaxation ripples across the program when a task is delayed.
        </p>
        <div class="grid-2col" style="gap: 1rem; align-items: end;">
          <div class="form-group" style="margin-bottom: 0;">
            <label for="impact-task-id">Delayed Task ID</label>
            <input type="text" id="impact-task-id" value="${dep.target_task_id}" placeholder="e.g. T-AWS-1" style="width: 100%;">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label for="impact-delay-days">Delay Days</label>
            <input type="number" id="impact-delay-days" value="10" min="1" max="365" style="width: 100%;">
          </div>
          <div>
            <button type="button" class="btn-secondary" id="btn-check-impact" style="width: 100%; height: 42px;">Forecast Impact</button>
          </div>
        </div>
        <div id="impact-error" class="error-alert" style="display: none; margin-top: 1rem;"></div>
        <div id="impact-result-container" style="margin-top: 1.5rem;"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-trigger-chase').addEventListener('click', handleTriggerChase);
  document.getElementById('btn-check-impact').addEventListener('click', handleCheckImpact);
}

async function handleTriggerChase() {
  const actionRow = document.getElementById('chase-action-row');
  const resultContainer = document.getElementById('chase-result-container');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Running LangGraph orchestration...</span>`;
  resultContainer.innerHTML = '';

  try {
    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies/${selectedDependencyId}/chase`, {
      method: 'POST'
    });

    if (!res.ok) throw new Error("Chase workflow failed to complete.");
    const data = await res.json();

    let threatClass = 'gray';
    if (data.threat_level === 'low') threatClass = 'green';
    else if (data.threat_level === 'medium') threatClass = 'amber';
    else if (data.threat_level === 'high') threatClass = 'red';

    resultContainer.innerHTML = `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h5 style="margin: 0; font-size: 0.95rem; font-weight: 600;">Chase commitment result</h5>
          <span style="font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${threatClass}">
            Threat Level: ${data.threat_level}
          </span>
        </div>
        
        ${data.escalation_required ? `
          <div style="background-color: var(--color-status-red-bg); border: 1px solid var(--color-status-red-border); color: var(--color-status-red-text); border-radius: var(--radius-sm); padding: 0.75rem; font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <svg style="width: 18px; height: 18px; fill: currentColor;" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            Critical Path Escalation Required!
          </div>
        ` : ''}

        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; position: relative;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            <span style="background-color: var(--color-brand); width: 8px; height: 8px; border-radius: 50%;"></span>
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Suggested Follow-Up Nudge Message:</span>
          </div>
          <p style="margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); font-style: italic;">
            "${data.nudge_message}"
          </p>
        </div>
      </div>
    `;

    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-trigger-chase">Trigger Chase Workflow (AI)</button>`;
    document.getElementById('btn-trigger-chase').addEventListener('click', handleTriggerChase);
  } catch (err) {
    resultContainer.innerHTML = `<div class="error-alert">${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-trigger-chase">Trigger Chase Workflow (AI)</button>`;
    document.getElementById('btn-trigger-chase').addEventListener('click', handleTriggerChase);
  }
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
      headers: {'Content-Type': 'application/json'},
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
            <option value="PLN-0001-1">Plan 1: Loyalty Portal Integration (PLN-0001-1)</option>
            <option value="PLN-0002-1">Plan 2: Apple Pay Integration (PLN-0002-1)</option>
            <option value="PLN-0003-1">Plan 3: Security & SAST Pipelines (PLN-0003-1)</option>
          </select>
        </div>

        <div id="sense-actions-row" class="submit-row" style="margin-top: 2rem;">
          <button type="button" class="btn-primary" id="btn-run-sense">Analyze Plan & Extract</button>
        </div>
        
        <div id="sense-result-box" style="margin-top: 1.5rem;"></div>
      </div>
    </div>
  `;

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
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ plan_id: planId })
    });

    if (!res.ok) throw new Error("Auto-Sensing failed.");
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
              <label for="edge-source-id">Source Task ID (Dependent)</label>
              <input type="text" id="edge-source-id" required placeholder="e.g. T-PAY-2">
            </div>
            <div class="form-group">
              <label for="edge-target-id">Target Task ID (Predecessor)</label>
              <input type="text" id="edge-target-id" required placeholder="e.g. T-PAY-1">
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
            <div class="form-group">
              <label for="edge-owner">Responsible Owner (Email)</label>
              <input type="text" id="edge-owner" required placeholder="e.g. name@company.com">
            </div>
            <div class="form-group">
              <label for="edge-id-custom">Custom Edge ID (Optional)</label>
              <input type="text" id="edge-id-custom" placeholder="Leave empty to auto-generate (DEP-XXXX)">
            </div>
          </div>

          <div id="edge-actions-row" class="submit-row" style="margin-top: 2rem;">
            <button type="button" class="btn-primary" id="btn-save-edge">Create Dependency Edge</button>
          </div>
        </form>
      </div>
    </div>
  `;

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

  // Generate a random-looking ID if not provided, backend will auto-generate if not specified, 
  // but to avoid empty schema issues let's make it or let the backend do it.
  if (!customId) {
    // We will let backend generate it or we generate a placeholder.
    // Let's generate a temporary unique string or guess DEP-XXXX.
    customId = "DEP-" + Math.floor(1000 + Math.random() * 9000);
  }

  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Creating edge...</span>`;

  try {
    const payload = {
      dependency_id: customId,
      source_task_id: source,
      target_task_id: target,
      type: type,
      status: status,
      owner: owner
    };

    const res = await fetch(`${DEPENDENCIES_API_BASE}/dependencies`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
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
