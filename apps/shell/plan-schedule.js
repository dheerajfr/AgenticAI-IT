// plan-schedule.js — Stage 03: Plan & Schedule Frontend Module
// Follows the same pattern as estimate-shape.js

const PLAN_API_BASE = 'http://127.0.0.1:8000/api';
const ESTIMATE_API_FOR_PLANS = 'http://127.0.0.1:8000/api';

let plans = [];
let availableEstimates = [];
let selectedPlanId = null;
let uploadedTeamConfig = null; // Dynamically parsed workforce directory

// Auto-accept confirm dialogs in webdriver/automation environments to allow testing
if (window.navigator.webdriver) {
  window.confirm = () => true;
}

function handleEmployeeFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      let rows = [];
      if (file.name.endsWith('.csv')) {
        const text = new TextDecoder().decode(evt.target.result);
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
            const row = {};
            headers.forEach((h, idx) => {
              row[h] = cols[idx] || '';
            });
            rows.push(row);
          }
        }
      } else {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet);
      }

      let nameKey = null, skillKey = null, statusKey = null;
      if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        keys.forEach(k => {
          const kl = k.toLowerCase();
          if (kl.includes('name')) nameKey = k;
          else if (kl.includes('skill') || kl.includes('role')) skillKey = k;
          else if (kl.includes('status') || kl.includes('avail') || kl.includes('project') || kl.includes('free')) statusKey = k;
        });
      }

      if (!nameKey || !skillKey || !statusKey) {
        throw new Error('Required columns (Name, Skill, Status) could not be identified in the sheet.');
      }

      const roles = ['backend', 'frontend', 'qa', 'devops'];
      const membersByRole = { backend: [], frontend: [], qa: [], devops: [] };

      rows.forEach(r => {
        const name = String(r[nameKey] || '').trim();
        const skill = String(r[skillKey] || '').trim().toLowerCase();
        const status = String(r[statusKey] || '').trim().toLowerCase();

        if (name && status === 'free') {
          roles.forEach(role => {
            if (skill.includes(role)) {
              membersByRole[role].push(name);
            }
          });
        }
      });

      const rolesPayload = [];
      let totalSize = 0;
      roles.forEach(role => {
        const list = membersByRole[role];
        const count = list.length > 0 ? list.length : 1;
        const members = list.length > 0 ? list : [role + '_default_1'];
        totalSize += count;
        rolesPayload.push({
          role: role,
          count: count,
          hours_per_day_per_person: 8.0,
          members: members
        });
      });

      uploadedTeamConfig = {
        team_size: totalSize,
        roles: rolesPayload
      };

      const summaryEl = document.getElementById('allocation-summary');
      if (summaryEl) {
        summaryEl.textContent = `✓ Allocated ${totalSize} free employee(s) (Backend: ${membersByRole.backend.length}, Frontend: ${membersByRole.frontend.length}, QA: ${membersByRole.qa.length}, DevOps: ${membersByRole.devops.length})`;
        summaryEl.style.display = 'block';
      }
    } catch (err) {
      alert('Error parsing employee directory: ' + err.message);
      uploadedTeamConfig = null;
      const summaryEl = document.getElementById('allocation-summary');
      if (summaryEl) summaryEl.style.display = 'none';
    }
  };

  if (file.name.endsWith('.csv')) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsBinaryString(file);
  }
}

// ─── Screen Entry Point ────────────────────────────────────────────────────

window.renderPlanScreen = function () {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar" style="display: flex; flex-direction: column; gap: 1.5rem; max-height: 100%; overflow: hidden;">
        <!-- Plans list card -->
        <div class="panel-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 class="sidebar-title" style="margin: 0; font-size: 1rem;">Plans Queue</h3>
            <button class="btn-new" id="btn-new-plan" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">+ Generate Plan</button>
          </div>
          <ul class="demand-list" id="plan-list-container" style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
            <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              Loading plans...
            </li>
          </ul>
        </div>
        
        <!-- Employee Directory widget (Hidden as per user request) -->
        <div class="panel-card" style="display: none; height: 250px; flex-direction: column; min-height: 0; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Resource Directory</span>
            <span id="employee-free-count" style="font-size: 0.75rem; color: var(--color-status-green-text); font-weight: 600;"></span>
          </div>
          <div id="employee-list-container" style="flex: 1; overflow-y: auto; font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; padding-right: 0.2rem;">
            <div style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Loading resources...</div>
          </div>
        </div>
      </aside>
      <main class="details-panel" id="plan-panel-container"></main>
    </div>
  `;
  document.getElementById('btn-new-plan').addEventListener('click', () => {
    selectedPlanId = null;
    clearPlanSidebarSelection();
    showNewPlanForm();
  });
};

window.fetchPlans = async function () {
  const container = document.getElementById('plan-list-container');
  if (!container) return;
  try {
    const res = await fetch(`${PLAN_API_BASE}/plans`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    plans = await res.json();
    renderPlanList();
    if (plans.length > 0 && selectedPlanId === null) {
      selectPlan(plans[0].plan_id);
    } else if (selectedPlanId !== null) {
      selectPlan(selectedPlanId);
    } else {
      showNewPlanForm();
    }
  } catch (err) {
    console.error('Failed to fetch plans:', err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
          Start the gateway at <code style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">uvicorn gateway:app --port 8000</code>
        </div>
      </li>
    `;
    showNewPlanForm();
  }
  window.fetchEmployees();
};

window.fetchEmployees = async function () {
  const container = document.getElementById('employee-list-container');
  const countEl = document.getElementById('employee-free-count');
  if (!container) return;
  try {
    const res = await fetch(`${PLAN_API_BASE}/plans/employees`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const employees = await res.json();
    
    // Sort employees: free first, then by name
    employees.sort((a, b) => {
      if (a.status === 'free' && b.status !== 'free') return -1;
      if (a.status !== 'free' && b.status === 'free') return 1;
      return a.name.localeCompare(b.name);
    });

    const freeCount = employees.filter(e => e.status === 'free').length;
    if (countEl) countEl.textContent = `${freeCount}/${employees.length} Free`;

    container.innerHTML = employees.map(emp => {
      const isFree = emp.status === 'free';
      const isWorking = emp.status === 'working';
      const statusText = emp.status.toUpperCase();
      
      let statusColor = 'var(--text-muted)';
      if (isFree) statusColor = 'var(--color-status-green-text)';
      else if (isWorking) statusColor = 'var(--color-status-amber-text)';
      
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.78rem;">${emp.name}</div>
            <div style="font-size: 0.68rem; color: var(--text-muted); font-family: monospace;">${emp.skill}</div>
          </div>
          <span style="font-size: 0.65rem; font-weight: 700; color: ${statusColor}; text-transform: uppercase;">
            ${statusText}
          </span>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text); text-align: center; padding: 1rem;">Failed to load resources: ${err.message}</div>`;
  }
};

// ─── Sidebar List ─────────────────────────────────────────────────────────

function clearPlanSidebarSelection() {
  document.querySelectorAll('#plan-list-container .demand-item').forEach(i => i.classList.remove('active'));
}

function renderPlanList() {
  const container = document.getElementById('plan-list-container');
  if (!container) return;
  if (plans.length === 0) {
    container.innerHTML = `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No plans yet. Generate one.</li>`;
    return;
  }
  container.innerHTML = plans.map(plan => {
    const isActive = plan.plan_id === selectedPlanId;
    const taskCount = plan.tasks ? plan.tasks.length : 0;
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${plan.plan_id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${plan.plan_id}</span>
          <button type="button" class="btn-queue-delete plan-delete-btn" data-id="${plan.plan_id}"
            style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 0.2rem; display: flex; align-items: center; opacity: 0.7; transition: opacity 0.2s;"
            title="Delete Plan"
            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
        <h4 class="demand-item-title">Demand: ${plan.demand_id}</h4>
        <div class="demand-item-meta">
          <span>End: ${plan.end_date}</span>
          <span>${taskCount} tasks</span>
        </div>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => selectPlan(item.getAttribute('data-id')));
  });
  container.querySelectorAll('.plan-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (confirm('Delete this plan? This cannot be undone.')) {
        plans = plans.filter(p => p.plan_id !== id);
        if (selectedPlanId === id) {
          selectedPlanId = plans.length > 0 ? plans[0].plan_id : null;
        }
        renderPlanList();
        if (selectedPlanId !== null) {
          selectPlan(selectedPlanId);
        } else {
          showNewPlanForm();
        }
      }
    });
  });
}

function selectPlan(id) {
  selectedPlanId = id;
  clearPlanSidebarSelection();
  const item = document.querySelector(`#plan-list-container .demand-item[data-id="${id}"]`);
  if (item) item.classList.add('active');
  const plan = plans.find(p => p.plan_id === id);
  if (plan) renderPlanDetail(plan);
}

// ─── Generate Plan Form ────────────────────────────────────────────────────

async function showNewPlanForm() {
  const panel = document.getElementById('plan-panel-container');
  if (!panel) return;

  // Fetch approved estimates
  try {
    const res = await fetch(`${ESTIMATE_API_FOR_PLANS}/estimates`);
    if (res.ok) {
      const all = await res.json();
      availableEstimates = all.filter(e => e.status === 'approved' || e.status === 're-baselined');
    }
  } catch (e) {
    availableEstimates = [];
  }

  const estimateOptions = availableEstimates.length
    ? availableEstimates.map(e =>
        `<option value="${e.estimate_id}">${e.estimate_id} — ${e.demand_id} (${e.confidence} conf, ${e.effort_days}d)</option>`
      ).join('')
    : `<option value="" disabled>No approved estimates found</option>`;

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0; margin-bottom: 0.5rem; color: var(--text-primary);">
        Generate Plan
      </h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Select one or more approved estimates. The planning engine applies confidence buffers,
        WBS decomposition, and capacity-aware scheduling to produce a dated PlanRecord.
      </p>

      <div class="error-message" id="plan-error"></div>

      <div class="form-group">
        <label for="select-estimates">Approved / Re-baselined Estimates</label>
        <select id="select-estimates" multiple style="height: 130px; font-size: 0.85rem;">
          ${estimateOptions}
        </select>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.4rem;">Hold Ctrl / ⌘ to select multiple</div>
      </div>

      <!-- Team Config (collapsible defaults) -->
      <details style="margin-top: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; background: var(--bg-tertiary);">
        <summary style="cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); user-select: none;">
          ⚙ Team & Sprint Constraints (using defaults — click to override)
        </summary>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 1rem;">
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Planning Start Date</label>
            <input type="date" id="cfg-start-date" value="2026-07-07"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Working Days/Week</label>
            <input type="number" id="cfg-work-days" value="5" min="1" max="7"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Max Utilization %</label>
            <input type="number" id="cfg-util" value="85" min="1" max="100"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
        </div>
      </details>

      <!-- Workforce Allocation File Upload -->
      <div class="form-group" style="margin-top: 1.25rem;">
        <label for="employee-file" style="font-weight: 600;">Workforce Directory (Upload Employee Excel / CSV)</label>
        <input type="file" id="employee-file" accept=".xlsx, .xls, .csv" style="padding: 0.4rem; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); width: 100%; background: var(--bg-tertiary);">
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.4rem; line-height: 1.3;">
          Columns required: <b>Name</b>, <b>Skill</b> (backend / frontend / qa / devops), and <b>Status</b> (free / working). Only free employees will be allocated to tasks.
        </div>
        <div id="allocation-summary" style="font-size: 0.75rem; color: var(--color-status-green-text); margin-top: 0.4rem; display: none; font-weight: 600;"></div>
      </div>

      <div id="plan-actions-row" class="submit-row" style="margin-top: 2rem;">
        <button type="button" class="btn-primary" id="btn-run-planning">Run Planning Engine</button>
      </div>

      <div id="plan-preview-container" style="margin-top: 1.5rem;"></div>
    </div>
  `;
  document.getElementById('btn-run-planning').addEventListener('click', handleGeneratePlan);
  document.getElementById('employee-file').addEventListener('change', handleEmployeeFileUpload);
}

let pendingPlans = null;
let selectedEstimateObjs = null;

async function handleGeneratePlan() {
  const selectEl = document.getElementById('select-estimates');
  const selectedIds = Array.from(selectEl.selectedOptions).map(o => o.value).filter(Boolean);
  if (!selectedIds.length) {
    showPlanError('Please select at least one estimate.');
    return;
  }

  const actionsRow = document.getElementById('plan-actions-row');
  actionsRow.innerHTML = `<span class="loader"><span class="spinner"></span> Running planning engine…</span>`;

  selectedEstimateObjs = availableEstimates.filter(e => selectedIds.includes(e.estimate_id));

  const startDate = document.getElementById('cfg-start-date')?.value || '2026-07-07';
  const workDays = parseInt(document.getElementById('cfg-work-days')?.value || '5');
  const util = parseFloat(document.getElementById('cfg-util')?.value || '85');

  const sprintConstraints = {
    planning_start_date: startDate,
    working_days_per_week: workDays,
    max_daily_utilization_percentage: util,
  };

  const bodyData = {
    estimates: selectedEstimateObjs,
    sprint_constraints: sprintConstraints,
  };
  if (uploadedTeamConfig) {
    bodyData.team_config = uploadedTeamConfig;
  }

  try {
    const res = await fetch(`${PLAN_API_BASE}/plans/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    pendingPlans = await res.json();
    renderPlanPreview(pendingPlans, actionsRow);
  } catch (err) {
    showPlanError(err.message);
    actionsRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-planning">Run Planning Engine</button>`;
    document.getElementById('btn-run-planning').addEventListener('click', handleGeneratePlan);
  }
}

function renderPlanPreview(newPlans, actionsRow) {
  const preview = document.getElementById('plan-preview-container');
  const plansArray = Array.isArray(newPlans) ? newPlans : (newPlans.plans || []);
  preview.innerHTML = plansArray.map(plan => {
    return `
      <div class="suggestion-box" style="margin-bottom: 1rem;">
        <h5 class="suggestion-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>${plan.plan_id}</span>
          <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary);">Demand: ${plan.demand_id}</span>
        </h5>
        <div class="grid-2col" style="margin-bottom: 1rem;">
          <div class="data-item"><div class="data-label">End Date</div><div class="data-value">${plan.end_date}</div></div>
          <div class="data-item"><div class="data-label">Tasks</div><div class="data-value">${plan.tasks.length}</div></div>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; font-weight: 600;">Task Schedule</div>
        <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
          <thead>
            <tr style="color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
              <th style="text-align:left; padding: 0.3rem 0.5rem;">Task</th>
              <th style="text-align:left; padding: 0.3rem 0.5rem;">Start</th>
              <th style="text-align:left; padding: 0.3rem 0.5rem;">End</th>
              <th style="text-align:left; padding: 0.3rem 0.5rem;">Owner</th>
            </tr>
          </thead>
          <tbody>
            ${plan.tasks.map(t => {
              const isOwnerNotAvailable = !t.owner || t.owner === 'unassigned' || t.owner.includes('default') || t.owner.includes('unassigned');
              const ownerDisplay = isOwnerNotAvailable
                ? `<span style="color: var(--color-status-red-text); font-weight: 600; font-size: 0.72rem;">Not Available</span>`
                : t.owner;
              return `
                <tr style="border-bottom: 1px solid rgba(46,60,84,0.5);">
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-primary);">${t.name}</td>
                  <td style="padding: 0.35rem 0.5rem; font-family: monospace;">${t.start_date}</td>
                  <td style="padding: 0.35rem 0.5rem; font-family: monospace;">${t.end_date}</td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--color-brand);">${ownerDisplay}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted);">
          Critical Path: ${plan.critical_path_task_ids.join(' → ')}
        </div>
      </div>
    `;
  }).join('');

  actionsRow.innerHTML = `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <button type="button" class="btn-primary" id="btn-accept-preview" style="background-color: var(--color-status-green-border); border: 1px solid var(--color-status-green-text); color: var(--color-status-green-text); cursor: pointer;">
        ✓ Accept & Save
      </button>
      <button type="button" class="btn-secondary" id="btn-replan-preview" style="color: var(--color-status-amber-text); border-color: var(--color-status-amber-text); cursor: pointer;">
        ⚠ Request Replan (Edit Scope)
      </button>
    </div>
    <div id="preview-replan-section" style="margin-top: 1.5rem; display: none; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;"></div>
    <div id="preview-success-msg" style="font-size: 0.85rem; color: var(--color-status-green-text); display: none; font-weight: 600; margin-top: 0.75rem;"></div>
  `;

  const acceptBtn = document.getElementById('btn-accept-preview');
  const replanBtn = document.getElementById('btn-replan-preview');
  const replanSection = document.getElementById('preview-replan-section');
  const successMsg = document.getElementById('preview-success-msg');

  acceptBtn.addEventListener('click', async () => {
    acceptBtn.disabled = true;
    replanBtn.disabled = true;
    try {
      const plansArray = Array.isArray(newPlans) ? newPlans : (newPlans.plans || []);
      for (const p of plansArray) {
        p.status = 'accepted';
        const res = await fetch(`${PLAN_API_BASE}/plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
        if (!res.ok) throw new Error('Failed to save plan.');
      }
      
      successMsg.textContent = '✓ Plan approved and saved successfully! Redirecting to Stage 04...';
      successMsg.style.display = 'block';
      
      await window.fetchPlans();
      
      setTimeout(() => {
        if (window.switchStage) {
          window.switchStage(4);
        }
      }, 1500);
    } catch (err) {
      alert(err.message);
      acceptBtn.disabled = false;
      replanBtn.disabled = false;
    }
  });

  replanBtn.addEventListener('click', () => {
    if (replanSection.style.display === 'block') {
      replanSection.style.display = 'none';
      return;
    }
    
    const plansArray = Array.isArray(newPlans) ? newPlans : (newPlans.plans || []);
    if (plansArray.length === 0) return;
    const plan = plansArray[0];
    
    // Fallback scope values
    const currentEffort = 12.0;
    
    replanSection.innerHTML = `
      <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem;">
        Replan Scope & Schedule Constraints
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
        <div class="form-group" style="margin: 0;">
          <label style="font-size: 0.75rem;">Scope Effort (Person-Days)</label>
          <input type="number" id="preview-replan-effort" value="${currentEffort}" min="1" step="0.5"
            style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
        </div>
        <div class="form-group" style="margin: 0;">
          <label style="font-size: 0.75rem;">Planning Start Date</label>
          <input type="date" id="preview-replan-start-date" value="2026-07-07"
            style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
        </div>
        <div class="form-group" style="margin: 0;">
          <label style="font-size: 0.75rem;">Working Days/Week</label>
          <input type="number" id="preview-replan-work-days" value="5" min="1" max="7"
            style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
        </div>
        <div class="form-group" style="margin: 0;">
          <label style="font-size: 0.75rem;">Max Utilization %</label>
          <input type="number" id="preview-replan-util" value="85" min="1" max="100"
            style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
        </div>
      </div>

      <div style="display: flex; gap: 1rem; align-items: center;">
        <button type="button" class="btn-primary" id="btn-submit-preview-replan" style="background-color: var(--color-status-amber-border); border: 1px solid var(--color-status-amber-text); color: var(--color-status-amber-text); cursor: pointer;">
          Submit Replan
        </button>
        <button type="button" class="btn-secondary" id="btn-cancel-preview-replan" style="cursor: pointer;">
          Cancel
        </button>
      </div>
      <div id="preview-replan-error" style="font-size: 0.85rem; color: var(--color-status-red-text); display: none; margin-top: 0.5rem;"></div>
    `;
    replanSection.style.display = 'block';

    document.getElementById('btn-cancel-preview-replan').addEventListener('click', () => {
      replanSection.style.display = 'none';
    });

    document.getElementById('btn-submit-preview-replan').addEventListener('click', async () => {
      const effort = parseFloat(document.getElementById('preview-replan-effort').value);
      const startDate = document.getElementById('preview-replan-start-date').value;
      const workDays = parseInt(document.getElementById('preview-replan-work-days').value);
      const util = parseFloat(document.getElementById('preview-replan-util').value);

      if (isNaN(effort) || effort <= 0) {
        const errEl = document.getElementById('preview-replan-error');
        errEl.textContent = 'Please enter a valid effort count.';
        errEl.style.display = 'block';
        return;
      }

      const submitBtn = document.getElementById('btn-submit-preview-replan');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Planning…';

      const updatedEstimates = selectedEstimateObjs.map(est => {
        const updated = { ...est };
        updated.effort_days = effort;
        const ratio = est.effort_days > 0 ? effort / est.effort_days : 1;
        updated.effort_range_low = (est.effort_range_low || effort) * ratio;
        updated.effort_range_high = (est.effort_range_high || effort) * ratio;
        updated.cost_estimate = (est.cost_estimate || 0) * ratio;
        updated.duration_weeks = (est.duration_weeks || 1) * ratio;
        return updated;
      });

      const bodyData = {
        estimates: updatedEstimates,
        sprint_constraints: {
          planning_start_date: startDate,
          working_days_per_week: workDays,
          max_daily_utilization_percentage: util
        }
      };
      if (uploadedTeamConfig) {
        bodyData.team_config = uploadedTeamConfig;
      }

      try {
        const res = await fetch(`${PLAN_API_BASE}/plans/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        pendingPlans = await res.json();
        renderPlanPreview(pendingPlans, actionsRow);
      } catch (err) {
        const errEl = document.getElementById('preview-replan-error');
        errEl.textContent = 'Replan failed: ' + err.message;
        errEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Replan';
      }
    });
  });
}

// ─── Plan Detail View ──────────────────────────────────────────────────────

function renderPlanDetail(plan) {
  const panel = document.getElementById('plan-panel-container');
  if (!panel) return;

  const status = plan.status || 'draft';
  let badgeColor = 'var(--text-muted)';
  let badgeText = 'Draft';
  let badgeBg = 'rgba(255, 255, 255, 0.05)';
  
  if (status === 'accepted') {
    badgeColor = 'var(--color-status-green-text)';
    badgeText = 'Accepted';
    badgeBg = 'var(--color-status-green-bg)';
  } else if (status === 'replan') {
    badgeColor = 'var(--color-status-amber-text)';
    badgeText = 'Requires Replanning';
    badgeBg = 'var(--color-status-amber-bg)';
  }

  let reviewHtml = '';
  if (status === 'accepted') {
    reviewHtml = `
      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem; flex-shrink: 0;">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
          Human-in-the-loop Review
        </div>
        <div style="font-size: 0.85rem; color: var(--color-status-green-text); font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
          ✓ Plan has been accepted and advanced to Stage 04: Dependencies.
        </div>
      </div>
    `;
  } else {
    reviewHtml = `
      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem; flex-shrink: 0;" id="review-section">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
          Human-in-the-loop Review
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <button type="button" class="btn-primary" id="btn-accept-plan" style="background-color: var(--color-status-green-border); border: 1px solid var(--color-status-green-text); color: var(--color-status-green-text); cursor: pointer;">
            ✓ Accept & Advance
          </button>
          <button type="button" class="btn-secondary" id="btn-replan-trigger" style="color: var(--color-status-amber-text); border-color: var(--color-status-amber-text); cursor: pointer;">
            ⚠ Request Replan (Edit Scope)
          </button>
        </div>
        <div id="review-success-msg" style="font-size: 0.85rem; color: var(--color-status-green-text); display: none; font-weight: 600; margin-top: 0.5rem;"></div>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="panel-card" style="padding-top: 1rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start;
                  border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem; flex-shrink: 0;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${plan.plan_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.75rem;">
            Demand: ${plan.demand_id}
            <span style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-weight: 600; text-transform: uppercase; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeColor};">
              ${badgeText}
            </span>
          </h2>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-secondary);">Plan End Date</div>
          <div style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700;
                      color: var(--color-brand);">${plan.end_date}</div>
          <button type="button" id="btn-delete-plan"
            class="btn-secondary"
            style="color: var(--color-status-red-text); border-color: var(--color-status-red-text); padding: 0.25rem 0.5rem; font-size: 0.75rem;">
            Delete Plan
          </button>
        </div>
      </div>

      <!-- Critical Path Banner -->
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color);
                  border-radius: var(--radius-md); padding: 0.75rem 1rem; margin-bottom: 1.5rem;
                  display: flex; align-items: flex-start; gap: 0.75rem; flex-shrink: 0;">
        <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--color-brand); flex-shrink: 0; margin-top: 2px;">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/>
        </svg>
        <div>
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Critical Path</div>
          <div style="font-size: 0.8rem; color: var(--text-primary); font-family: monospace;">
            ${plan.critical_path_task_ids.join(' → ')}
          </div>
        </div>
      </div>

      <!-- Gantt-style Task Table -->
      <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; flex-shrink: 0;">
        Task Breakdown
      </div>
      <div style="overflow-x: auto; flex-shrink: 0; margin-bottom: 1.5rem;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead>
            <tr style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em;">
              <th style="text-align:left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">Task ID</th>
              <th style="text-align:left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">Phase</th>
              <th style="text-align:left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">Start</th>
              <th style="text-align:left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">End</th>
              <th style="text-align:left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">Owner</th>
              <th style="text-align:left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">Predecessors</th>
              <th style="text-align:center; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border-color);">Status</th>
            </tr>
          </thead>
          <tbody>
            ${plan.tasks.map((t, idx) => {
              const isCritical = plan.critical_path_task_ids.includes(t.task_id);
              const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(30,41,59,0.4)';
              const isCompleted = t.status === 'completed';
              
              let statusCell = '';
              if (status === 'accepted') {
                statusCell = `
                  <label class="task-checkbox-label" style="display: flex; align-items: center; justify-content: center; gap: 0.35rem; cursor: pointer; user-select: none; margin: 0;">
                    <input type="checkbox" class="task-complete-chk" data-task-id="${t.task_id}" ${isCompleted ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">
                    <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: ${isCompleted ? 'var(--color-status-green-text)' : 'var(--text-muted)'};">
                      ${isCompleted ? 'Done' : 'Active'}
                    </span>
                  </label>
                `;
              } else {
                statusCell = `
                  <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
                    Pending
                  </span>
                `;
              }

              const isOwnerNotAvailable = !t.owner || t.owner === 'unassigned' || t.owner.includes('default') || t.owner.includes('unassigned');
              const ownerDisplay = isOwnerNotAvailable
                ? `<span style="color: var(--color-status-red-text); font-weight: 600; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--color-status-red-text);">employee for this task is currently is not available</span>`
                : `<span style="color: var(--color-brand); font-weight: 500;">${t.owner}</span>`;

              return `
                <tr style="background: ${rowBg}; transition: background 0.15s;">
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; font-size: 0.75rem; color: ${isCritical ? 'var(--color-brand)' : 'var(--text-secondary)'};">
                    ${t.task_id}
                    ${isCritical ? '<span style="font-size: 0.6rem; margin-left: 4px; color: var(--color-brand);">★ CRIT</span>' : ''}
                  </td>
                  <td style="padding: 0.6rem 0.75rem; color: var(--text-primary); font-weight: 600;">${t.name}</td>
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; color: var(--text-secondary);">${t.start_date}</td>
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; color: var(--text-secondary);">${t.end_date}</td>
                  <td style="padding: 0.6rem 0.75rem;">${ownerDisplay}</td>
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; font-size: 0.72rem; color: var(--text-muted);">
                    ${t.predecessor_task_ids.length ? t.predecessor_task_ids.join(', ') : '—'}
                  </td>
                  <td style="padding: 0.6rem 0.75rem; text-align: center;">
                    ${statusCell}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Visual Timeline Bar Chart -->
      <div style="margin-top: 1rem; flex-shrink: 0;">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">
          Timeline (relative)
        </div>
        ${renderTimelineBars(plan)}
      </div>

      <!-- Human-in-the-loop Review Section -->
      ${reviewHtml}
    </div>
  `;

  document.getElementById('btn-delete-plan').addEventListener('click', () => {
    if (confirm(`Delete plan ${plan.plan_id}?`)) {
      const id = plan.plan_id;
      plans = plans.filter(p => p.plan_id !== id);
      if (selectedPlanId === id) {
        selectedPlanId = plans.length > 0 ? plans[0].plan_id : null;
      }
      renderPlanList();
      if (selectedPlanId !== null) {
        selectPlan(selectedPlanId);
      } else {
        showNewPlanForm();
      }
    }
  });

  if (status === 'accepted') {
    panel.querySelectorAll('.task-complete-chk').forEach(chk => {
      chk.addEventListener('change', async () => {
        const taskId = chk.getAttribute('data-task-id');
        const newStatus = chk.checked ? 'completed' : 'pending';
        try {
          const res = await fetch(`${PLAN_API_BASE}/plans/${plan.plan_id}/tasks/${taskId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          if (!res.ok) throw new Error('Failed to update task status.');
          
          const taskObj = plan.tasks.find(t => t.task_id === taskId);
          if (taskObj) taskObj.status = newStatus;
          
          await window.fetchPlans();
          selectPlan(plan.plan_id);
        } catch (err) {
          alert(err.message);
          chk.checked = !chk.checked;
        }
      });
    });
  }

  if (status !== 'accepted') {
    document.getElementById('btn-accept-plan').addEventListener('click', async () => {
      try {
        const res = await fetch(`${PLAN_API_BASE}/plans/${plan.plan_id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted' }),
        });
        if (!res.ok) throw new Error('Failed to update status.');
        
        plan.status = 'accepted';
        const plansItem = plans.find(p => p.plan_id === plan.plan_id);
        if (plansItem) plansItem.status = 'accepted';
        
        const successMsg = document.getElementById('review-success-msg');
        successMsg.textContent = '✓ Plan Accepted! Advancing to Stage 04: Dependencies…';
        successMsg.style.display = 'block';
        
        document.getElementById('btn-accept-plan').disabled = true;
        document.getElementById('btn-replan-trigger').disabled = true;
        
        setTimeout(() => {
          if (window.switchStage) {
            window.switchStage('dependencies');
          }
        }, 1500);
      } catch (err) {
        alert(err.message);
      }
    });

    document.getElementById('btn-replan-trigger').addEventListener('click', () => {
      const reviewSection = document.getElementById('review-section');
      const est = availableEstimates.find(e => e.demand_id === plan.demand_id) || {
        effort_days: 10,
        estimate_id: 'EST-' + plan.plan_id.split('-')[1] + '-1',
        demand_id: plan.demand_id,
        confidence: 'medium',
        status: 'approved',
        risk_factors: []
      };

      reviewSection.innerHTML = `
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem;">
          Replan Scope & Schedule Constraints
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Scope Effort (Person-Days)</label>
            <input type="number" id="replan-effort" value="${est.effort_days}" min="1" step="0.5"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Planning Start Date</label>
            <input type="date" id="replan-start-date" value="2026-07-07"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Working Days/Week</label>
            <input type="number" id="replan-work-days" value="5" min="1" max="7"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem;">Max Utilization %</label>
            <input type="number" id="replan-util" value="85" min="1" max="100"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">
          </div>
        </div>

        <div style="display: flex; gap: 1rem; align-items: center;">
          <button type="button" class="btn-primary" id="btn-submit-replan" style="background-color: var(--color-status-amber-border); border: 1px solid var(--color-status-amber-text); color: var(--color-status-amber-text); cursor: pointer;">
            Submit Replan
          </button>
          <button type="button" class="btn-secondary" id="btn-cancel-replan" style="cursor: pointer;">
            Cancel
          </button>
        </div>
        <div id="replan-error-msg" style="font-size: 0.85rem; color: var(--color-status-red-text); display: none; margin-top: 0.5rem;"></div>
      `;

      document.getElementById('btn-cancel-replan').addEventListener('click', () => {
        renderPlanDetail(plan);
      });

      document.getElementById('btn-submit-replan').addEventListener('click', async () => {
        const effort = parseFloat(document.getElementById('replan-effort').value);
        const startDate = document.getElementById('replan-start-date').value;
        const workDays = parseInt(document.getElementById('replan-work-days').value);
        const util = parseFloat(document.getElementById('replan-util').value);

        if (isNaN(effort) || effort <= 0) {
          const errEl = document.getElementById('replan-error-msg');
          errEl.textContent = 'Please enter a valid effort count.';
          errEl.style.display = 'block';
          return;
        }

        const submitBtn = document.getElementById('btn-submit-replan');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Planning…';

        const updatedEst = { ...est };
        updatedEst.effort_days = effort;
        const ratio = est.effort_days > 0 ? effort / est.effort_days : 1;
        updatedEst.effort_range_low = (est.effort_range_low || effort) * ratio;
        updatedEst.effort_range_high = (est.effort_range_high || effort) * ratio;
        updatedEst.cost_estimate = (est.cost_estimate || 0) * ratio;
        updatedEst.duration_weeks = (est.duration_weeks || 1) * ratio;

        const bodyData = {
          estimates: [updatedEst],
          sprint_constraints: {
            planning_start_date: startDate,
            working_days_per_week: workDays,
            max_daily_utilization_percentage: util
          }
        };
        if (uploadedTeamConfig) {
          bodyData.team_config = uploadedTeamConfig;
        }

        try {
          const res = await fetch(`${PLAN_API_BASE}/plans/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(err.detail || `HTTP ${res.status}`);
          }
          const result = await res.json();
          const newPlan = result.plans[0];
          
          await fetch(`${PLAN_API_BASE}/plans/${newPlan.plan_id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'replan' })
          });
          newPlan.status = 'replan';

          await window.fetchPlans();
          selectPlan(newPlan.plan_id);
        } catch (err) {
          const errEl = document.getElementById('replan-error-msg');
          errEl.textContent = 'Replan failed: ' + err.message;
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Replan';
        }
      });
    });
  }
}

// ─── Visual Timeline Bars ─────────────────────────────────────────────────

function renderTimelineBars(plan) {
  if (!plan.tasks || plan.tasks.length === 0) return '';
  const dates = plan.tasks.flatMap(t => [new Date(t.start_date), new Date(t.end_date)]);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const totalMs = maxDate - minDate || 1;

  const phaseColors = {
    'Design & Setup':   '#818cf8',
    'Build':            '#6366f1',
    'Test & QA':        '#fbbf24',
    'Deploy & Release': '#34d399',
  };

  return plan.tasks.map(t => {
    const start = new Date(t.start_date);
    const end   = new Date(t.end_date);
    const leftPct  = ((start - minDate) / totalMs * 100).toFixed(1);
    const widthPct = Math.max(1, ((end - start) / totalMs * 100)).toFixed(1);
    const color    = phaseColors[t.name] || 'var(--color-brand)';
    const isCritical = plan.critical_path_task_ids.includes(t.task_id);
    return `
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
        <div style="width: 130px; flex-shrink: 0; font-size: 0.75rem; color: var(--text-secondary); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${t.name}
        </div>
        <div style="flex: 1; position: relative; height: 22px; background: rgba(30,41,59,0.5); border-radius: 4px; overflow: hidden;">
          <div style="
            position: absolute;
            left: ${leftPct}%;
            width: ${widthPct}%;
            height: 100%;
            background: ${color};
            opacity: ${isCritical ? '1' : '0.6'};
            border-radius: 3px;
            display: flex;
            align-items: center;
            padding-left: 6px;
            font-size: 0.65rem;
            color: #0b0f19;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
          ">${t.owner}</div>
        </div>
        <div style="width: 80px; flex-shrink: 0; font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${t.end_date}</div>
      </div>
    `;
  }).join('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function showPlanError(msg) {
  const el = document.getElementById('plan-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
