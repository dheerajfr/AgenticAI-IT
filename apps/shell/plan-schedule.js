// plan-schedule.js — Stage 03: Plan & Schedule Frontend Module
// Follows the same pattern as estimate-shape.js

const PLAN_API_BASE = '/api';
const ESTIMATE_API_FOR_PLANS = '/api';


let plans = [];
let availableEstimates = [];
let selectedPlanId = null;
let uploadedTeamConfig = null; // Dynamically parsed workforce directory
let demandTitleMap = {}; // Map demand_id -> title

// Auto-accept confirm dialogs in webdriver/automation environments to allow testing
if (window.navigator.webdriver) {
  window.confirm = () => true;
}

function handleEmployeeFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
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
    // Pre-fetch demands to populate project titles in sidebar
    try {
      const demRes = await fetch(`${ESTIMATE_API_FOR_PLANS}/demands`);
      if (demRes.ok) {
        const allDemands = await demRes.json();
        allDemands.forEach(d => {
          demandTitleMap[d.demand_id] = d.title;
        });
      }
    } catch (e) {
      console.error('Failed to pre-fetch demands for sidebar titles:', e);
    }

    const res = await fetch(`${PLAN_API_BASE}/plans`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    plans = await res.json();
    renderPlanList();

    // Check if we arrived from Estimate module with a specific estimate pre-selected
    const pendingEstimateId = sessionStorage.getItem('pendingPlanEstimateId');
    if (pendingEstimateId) {
      sessionStorage.removeItem('pendingPlanEstimateId');
      selectedPlanId = null;
      clearPlanSidebarSelection();
      await showNewPlanForm();
      setTimeout(() => {
        const selectEl = document.getElementById('select-estimates');
        if (selectEl) {
          selectEl.value = pendingEstimateId;
          selectEl.dispatchEvent(new Event('change'));
        }
      }, 80);
      window.fetchEmployees();
      return;
    }

    const activeDemandId = sessionStorage.getItem('selectedDemandId');
    if (activeDemandId) {
      const matchedPlan = plans.find(p => p.demand_id === activeDemandId);
      if (matchedPlan) selectedPlanId = matchedPlan.plan_id;
    }
    if (plans.length > 0 && selectedPlanId === null) {
      selectedPlanId = plans[0].plan_id;
    }
    
    if (selectedPlanId !== null) {
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
    window.allEmployees = employees;

    // Reactively update detail panel with employee availability checks if plans are loaded
    if (selectedPlanId !== null && plans.length > 0) {
      const activePlan = plans.find(p => p.plan_id === selectedPlanId);
      if (activePlan) {
        renderPlanDetail(activePlan);
      }
    }

    // Sort employees: free first, then by name
    employees.sort((a, b) => {
      const isAFree = a.status === 'free' || a.status === 'Available';
      const isBFree = b.status === 'free' || b.status === 'Available';
      if (isAFree && !isBFree) return -1;
      if (!isAFree && isBFree) return 1;
      return a.name.localeCompare(b.name);
    });

    const freeCount = employees.filter(e => e.status === 'free' || e.status === 'Available').length;
    if (countEl) countEl.textContent = `${freeCount}/${employees.length} Free`;

    container.innerHTML = employees.map(emp => {
      const isFree = emp.status === 'free' || emp.status === 'Available';
      const isWorking = emp.status === 'working' || emp.status === 'Allocated';
      const isOnLeave = emp.status === 'On Leave';
      const statusText = emp.status.toUpperCase();

      let statusColor = 'var(--text-muted)';
      if (isFree) statusColor = 'var(--color-status-green-text)';
      else if (isWorking) statusColor = 'var(--color-status-amber-text)';
      else if (isOnLeave) statusColor = 'var(--color-status-red-text)';

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
    const projectTitle = demandTitleMap[plan.demand_id] || 'Loading Title...';
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${plan.plan_id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${plan.demand_id}</span>
          <button type="button" class="btn-queue-delete plan-delete-btn" data-id="${plan.plan_id}"
            style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 0.2rem; display: flex; align-items: center; opacity: 0.7; "
            title="Delete Plan"
            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
        <h4 class="demand-item-title" style="margin: 0.2rem 0 0.4rem 0;" title="${projectTitle}">${projectTitle}</h4>
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
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const listItem = btn.closest('li');
      if (!listItem) return;

      // Show inline confirm row inside the list item
      const existingConfirm = listItem.querySelector('.inline-delete-confirm');
      if (existingConfirm) {
        existingConfirm.remove();
        return;
      }

      const confirmRow = document.createElement('div');
      confirmRow.className = 'inline-delete-confirm';
      confirmRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;padding:0.4rem 0;border-top:1px solid rgba(239,68,68,0.3);';
      confirmRow.innerHTML = `
        <span style="font-size:0.72rem;color:var(--color-status-red-text);flex:1;font-weight:600;">Delete this plan?</span>
        <button class="btn-confirm-delete" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:var(--color-status-red-text);color: var(--text-primary);border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:700;">Yes, Delete</button>
        <button class="btn-cancel-delete" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:transparent;color:var(--text-muted);border:1px solid var(--border-color);border-radius:var(--radius-sm);cursor:pointer;">Cancel</button>
      `;
      listItem.appendChild(confirmRow);

      confirmRow.querySelector('.btn-cancel-delete').addEventListener('click', e2 => {
        e2.stopPropagation();
        confirmRow.remove();
      });

      confirmRow.querySelector('.btn-confirm-delete').addEventListener('click', async e2 => {
        e2.stopPropagation();
        try {
          const res = await fetch(`${PLAN_API_BASE}/plans/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete plan from database');

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
        } catch (err) {
          confirmRow.remove();
          const errDiv = document.createElement('div');
          errDiv.style.cssText = 'font-size:0.72rem;color:var(--color-status-red-text);padding:0.3rem 0;';
          errDiv.textContent = err.message;
          listItem.appendChild(errDiv);
        }
      });
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

  demandTitleMap = {};
  // Fetch approved estimates and demands
  try {
    const [estRes, demRes] = await Promise.all([
      fetch(`${ESTIMATE_API_FOR_PLANS}/estimates`),
      fetch(`${ESTIMATE_API_FOR_PLANS}/demands`)
    ]);
    if (estRes.ok) {
      const all = await estRes.json();
      availableEstimates = all.filter(e => e.status === 'approved' || e.status === 're-baselined');
    }
    if (demRes.ok) {
      const allDemands = await demRes.json();
      allDemands.forEach(d => {
        demandTitleMap[d.demand_id] = d.title;
      });
    }
  } catch (e) {
    availableEstimates = [];
  }

  const estimateOptions = availableEstimates.length
    ? `<option value="" disabled selected>— Select an Estimate —</option>` + availableEstimates.map(e => {
      const title = demandTitleMap[e.demand_id];
      const displayLabel = title ? `${e.demand_id} — ${title}` : e.demand_id;
      return `<option value="${e.estimate_id}">${displayLabel}</option>`;
    }).join('')
    : `<option value="" disabled selected>No approved estimates found</option>`;

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0; margin-bottom: 0.5rem; color: var(--text-primary);">
        Generate Plan
      </h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Select an approved estimate from the dropdown list. The planning engine applies confidence buffers,
        WBS decomposition, and capacity-aware scheduling to produce a dated PlanRecord.
      </p>

      <div class="error-message" id="plan-error"></div>

      <div class="form-group">
        <label for="select-estimates">Approved / Re-baselined Estimates Dropdown</label>
        <select id="select-estimates" style="font-size: 0.85rem; padding: 0.5rem; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary);">
          ${estimateOptions}
        </select>
        <div id="estimate-detail-preview" style="margin-top: 1rem; display: none;"></div>
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

      <div id="plan-actions-row" class="submit-row" style="margin-top: 2rem;">
        <button type="button" class="btn-primary" id="btn-run-planning">Run Planning Engine</button>
      </div>

      <div id="plan-preview-container" style="margin-top: 1.5rem;"></div>
    </div>
  `;

  // Attach change listener to show estimate details dynamically
  const selectEl = document.getElementById('select-estimates');
  const detailPreview = document.getElementById('estimate-detail-preview');
  selectEl.addEventListener('change', () => {
    const val = selectEl.value;
    const est = availableEstimates.find(e => e.estimate_id === val);
    if (est) {
      const riskList = est.risk_factors && est.risk_factors.length
        ? `<div style="grid-column: span 2; margin-top: 0.25rem;"><strong>Risk Factors:</strong><ul style="margin: 0.2rem 0 0 1rem; padding: 0;">${est.risk_factors.map(r => `<li>${r}</li>`).join('')}</ul></div>`
        : '';
      detailPreview.innerHTML = `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4;">
          <div style="font-weight: 700; color: var(--color-brand); margin-bottom: 0.5rem; font-size: 0.88rem;">Selected Estimate Details</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1rem;">
            <div><strong>Effort Days:</strong> ${est.effort_days}d (${est.effort_range_low}d - ${est.effort_range_high}d)</div>
            <div><strong>Cost Estimate:</strong> $${(est.cost_estimate || 0).toLocaleString()}</div>
            <div><strong>Duration:</strong> ${est.duration_weeks} weeks</div>
            <div><strong>Confidence:</strong> ${est.confidence.toUpperCase()}</div>
            <div style="grid-column: span 2;"><strong>Methodology:</strong> ${est.methodology}</div>
            ${riskList}
          </div>
        </div>
      `;
      detailPreview.style.display = 'block';
    } else {
      detailPreview.style.display = 'none';
    }
  });

  document.getElementById('btn-run-planning').addEventListener('click', handleGeneratePlan);
}

let pendingPlans = null;
let selectedEstimateObjs = null;

async function handleGeneratePlan() {
  const selectEl = document.getElementById('select-estimates');
  const selectedIds = [selectEl.value].filter(Boolean);
  if (!selectedIds.length) {
    showPlanError('Please select an estimate.');
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

// Helper to infer skill from task name
function inferSkillFromTask(taskName) {
  const n = taskName.toLowerCase();
  if (n.includes('test') || n.includes('qa')) return 'qa';
  if (n.includes('deploy') || n.includes('release')) return 'devops';
  if (n.includes('design') || n.includes('setup')) return 'frontend';
  return 'backend';
}

function getEmployeeDisplayName(owner) {
  if (!owner) return 'unassigned';
  if (owner.includes(',')) {
    return owner.split(',').map(o => getEmployeeDisplayName(o.trim())).join(', ');
  }
  if (window.allEmployees) {
    const emp = window.allEmployees.find(e => (e.email || '').toLowerCase() === owner.toLowerCase() || (e.name || '').toLowerCase() === owner.toLowerCase());
    if (emp && emp.name) return emp.name;
  }
  // Fallback: strip domain from email if it is an email
  if (owner.includes('@')) {
    const part = owner.split('@')[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
  }
  return owner;
}

function getAvailabilityStatusForTask(emp, task) {
  const taskEnd = new Date(task.end_date);
  taskEnd.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let availDate = new Date(today);

  if (emp.leave_start_date && emp.leave_end_date) {
    const leaveStart = new Date(emp.leave_start_date);
    const leaveEnd = new Date(emp.leave_end_date);
    const taskStart = new Date(task.start_date);
    taskStart.setHours(0, 0, 0, 0);
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(0, 0, 0, 0);

    // Overlap checking
    if (Math.max(taskStart, leaveStart) <= Math.min(taskEnd, leaveEnd)) {
      const nextDay = new Date(leaveEnd);
      nextDay.setDate(nextDay.getDate() + 1);
      if (nextDay > availDate) {
        availDate = nextDay;
      }
    }
  }

  if (emp.days_until_free != null && emp.days_until_free > 0) {
    const busyEnd = new Date(today);
    busyEnd.setDate(busyEnd.getDate() + emp.days_until_free);
    if (busyEnd > availDate) {
      availDate = busyEnd;
    }
  }

  const tooLong = availDate > taskEnd;
  
  return {
    availDate,
    tooLong,
    availDateStr: availDate.toISOString().split('T')[0]
  };
}

function renderPlanPreview(newPlans, actionsRow) {
  const preview = document.getElementById('plan-preview-container');
  const plansArray = Array.isArray(newPlans) ? newPlans : (newPlans.plans || []);

  // Track which task cells need availability dropdowns: { cellId, skill }
  const pendingAvailability = [];

  let html = plansArray.map(plan => {
    return `
      <div class="suggestion-box" style="margin-bottom: 1rem;">
        <h5 class="suggestion-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>${plan.demand_id}</span>
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
              <th style="text-align:left; padding: 0.3rem 0.5rem; min-width: 200px;">Owner</th>
            </tr>
          </thead>
          <tbody>
            ${plan.tasks.map((t, ti) => {
      const isOwnerNotAvailable = !t.owner || t.owner === 'unassigned' ||
        t.owner.toLowerCase().includes('default') ||
        t.owner.toLowerCase().includes('unassigned');

      const cellId = `avail-cell-${plan.plan_id}-${ti}`.replace(/[^a-zA-Z0-9-]/g, '-');

      let hasConflict = false;
      let conflictingOwner = '';
      if (!isOwnerNotAvailable && window.allEmployees) {
        const ownersList = t.owner.split(',').map(o => o.trim());
        for (const owner of ownersList) {
          const emp = window.allEmployees.find(e => (e.email || '').toLowerCase() === owner.toLowerCase() || (e.name || '').toLowerCase() === owner.toLowerCase());
          if (emp) {
            const check = getAvailabilityStatusForTask(emp, t);
            if (check.tooLong) {
              hasConflict = true;
              conflictingOwner = emp.name || owner;
              break;
            }
          }
        }
      }

      if (isOwnerNotAvailable || hasConflict) {
        const skill = inferSkillFromTask(t.name);
        pendingAvailability.push({ cellId, skill, taskName: t.name, taskObj: t, planObj: plan, originalOwner: t.owner });
      }

      let ownerCell = '';
      if (isOwnerNotAvailable || hasConflict) {
        ownerCell = `<td id="${cellId}" style="padding: 0.35rem 0.5rem;">
            <div style="display: flex; flex-direction: column; gap: 0.2rem;">
              <span style="color: var(--color-status-red-text); font-weight: 600; font-size: 0.72rem;">
                ⚠ ${isOwnerNotAvailable && t.owner.includes(',') ? 'Shortage: Some positions Unfilled' : 'Not Available — loading options…'}
              </span>
              <span style="font-size: 0.72rem; color: var(--color-status-red-text); font-weight: 700;">
                hire a new employee with the skills for this task
              </span>
            </div>
           </td>`;
      } else {
        const ownersList = t.owner.split(',').map(o => o.trim());
        const chips = ownersList.map(o => {
          const name = getEmployeeDisplayName(o);
          return `<span style="display: inline-block; background-color: var(--color-brand-light, #e0f2fe); color: var(--color-brand, #0369a1); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; margin-right: 0.25rem; font-weight: 500; border: 1px solid var(--color-brand-border, #bae6fd);">${name}</span>`;
        }).join('');
        ownerCell = `<td style="padding: 0.35rem 0.5rem;">${chips}</td>`;
      }

      return `
                <tr style="border-bottom: 1px solid rgba(46,60,84,0.5);">
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-primary);">${t.name}</td>
                  <td style="padding: 0.35rem 0.5rem; font-family: monospace;">${t.start_date}</td>
                  <td style="padding: 0.35rem 0.5rem; font-family: monospace;">${t.end_date}</td>
                  ${ownerCell}
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

  // Add the review/preview buttons container at the bottom of the preview HTML
  html += `
    <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem;" id="preview-review-section">
      <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
        Human-in-the-loop Review
      </div>
      <div style="display: flex; gap: 1.2rem; align-items: center;">
        <button type="button" class="btn-primary" id="btn-accept-preview" style="background-color: var(--color-status-green-border); border: 1px solid var(--color-status-green-text); color: var(--color-status-green-text); cursor: pointer; font-weight: 700; padding: 0.4rem 1.2rem; border-radius: var(--radius-sm);">
          ✓ Accept & Save
        </button>
        <button type="button" class="btn-secondary" id="btn-replan-preview" style="color: var(--color-status-amber-text); border-color: var(--color-status-amber-text); cursor: pointer; font-weight: 700; padding: 0.4rem 1.2rem; border-radius: var(--radius-sm);">
          ⚠ Request Replan (Edit Scope)
        </button>
      </div>
      <div id="preview-replan-section" style="margin-top: 1.5rem; display: none; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;"></div>
      <div id="preview-success-msg" style="font-size: 0.85rem; color: var(--color-status-green-text); display: none; font-weight: 600; margin-top: 0.75rem;"></div>
    </div>
  `;

  preview.innerHTML = html;

  // Restore the "Run Planning Engine" button in actionsRow above
  actionsRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-planning">Run Planning Engine</button>`;
  document.getElementById('btn-run-planning').addEventListener('click', handleGeneratePlan);

  // Asynchronously populate availability dropdowns for unavailable tasks
  if (pendingAvailability.length > 0) {
    // Group by skill to minimise fetch calls
    const skillFetches = {};
    pendingAvailability.forEach(({ cellId, skill, taskName, taskObj, planObj, originalOwner }) => {
      if (!skillFetches[skill]) skillFetches[skill] = [];
      skillFetches[skill].push({ cellId, taskName, taskObj, planObj, originalOwner });
    });

    Object.entries(skillFetches).forEach(async ([skill, cells]) => {
      let employees = [];
      try {
        const res = await fetch(`${PLAN_API_BASE}/plans/employees/availability?skill=${encodeURIComponent(skill)}`);
        if (res.ok) employees = await res.json();
      } catch (e) {
        employees = [];
      }

      cells.forEach(({ cellId, taskName, taskObj, planObj, originalOwner }) => {
        const cell = document.getElementById(cellId);
        if (!cell) return;

        if (employees.length === 0) {
          cell.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.2rem;">
              <span style="color: var(--color-status-red-text); font-size: 0.72rem; font-weight: 600;">⚠ No ${skill} employees found</span>
              <span style="font-size: 0.72rem; color: var(--color-status-red-text); font-weight: 700;">
                hire a new employee with the skills for this task
              </span>
            </div>
          `;
          return;
        }

        const options = employees.map(emp => {
          const check = getAvailabilityStatusForTask(emp, taskObj);
          let label = '';
          let optStyle = '';
          if (emp.status === 'free' || emp.status === 'Available' || emp.days_until_free === 0) {
            label = `${emp.name} — ✓ Available Now`;
            optStyle = 'color: #16a34a;';
          } else if (emp.days_until_free != null) {
            label = `${emp.name} — Free in ${emp.days_until_free} day${emp.days_until_free !== 1 ? 's' : ''}${check.tooLong ? ' (Too Late)' : ''}`;
            optStyle = check.tooLong ? 'color: #ef4444; font-weight: 600;' : 'color: #d97706;';
          } else {
            label = `${emp.name} — Currently Busy`;
            optStyle = 'color: #92400e;';
          }
          return `<option value="${emp.email}" style="${optStyle}">${label}</option>`;
        }).join('');

        cell.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            <select
              id="sel-${cellId}"
              style="
                font-size: 0.73rem;
                padding: 0.3rem 0.4rem;
                background: var(--bg-tertiary);
                border: 1px solid var(--color-status-amber-text);
                border-radius: var(--radius-sm);
                color: var(--text-primary);
                cursor: pointer;
                max-width: 220px;
              "
              title="Select alternate ${skill} employee for task: ${taskName}"
            >
              <option value="" disabled selected>— Pick alternate (${skill}) —</option>
              ${options}
            </select>
            <div id="msg-${cellId}" style="margin-top: 0.1rem;">
              <span style="font-size: 0.72rem; color: var(--color-status-red-text); font-weight: 700;">
                hire a new employee with the skills for this task
              </span>
            </div>
          </div>
        `;

        // Bind change listener — update cell to show selected employee details
        const selectEl = document.getElementById(`sel-${cellId}`);
        if (selectEl) {
          // Named handler so it can be re-bound when the dropdown is restored
          const handleChange = () => {
            const currentSel = document.getElementById(`sel-${cellId}`);
            const selectedEmail = currentSel ? currentSel.value : selectEl.value;
            const emp = employees.find(e => e.email === selectedEmail);
            if (!emp) return;

            const check = getAvailabilityStatusForTask(emp, taskObj);

            // Determine availability label
            let availLabel, availColor;
            if (emp.status === 'free' || emp.days_until_free === 0) {
              availLabel = '✓ Available Now';
              availColor = 'var(--color-status-green-text)';
            } else if (emp.days_until_free != null) {
              availLabel = `Free in ${emp.days_until_free} day${emp.days_until_free !== 1 ? 's' : ''}`;
              availColor = 'var(--color-status-amber-text)';
            } else {
              availLabel = 'Currently Busy';
              availColor = 'var(--color-status-amber-text)';
            }

            let warningHtml = '';
            if (check.tooLong) {
              warningHtml = `
                <div style="margin-top: 0.15rem; font-size: 0.72rem; color: var(--color-status-red-text); font-weight: 700; line-height: 1.2;">
                  ⚠ availability time is too long than the deadline of the task. hire a new employee with the skills for this task
                </div>
              `;
            }

            // Replace cell with selected employee card + a "Change" link
            cell.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                <div style="font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${emp.name}</div>
                <div style="font-size: 0.68rem; color: var(--text-muted); font-family: monospace;">${emp.email}</div>
                <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: capitalize;">${emp.skill}</div>
                <span style="font-size: 0.68rem; font-weight: 700; color: ${check.tooLong ? 'var(--color-status-red-text)' : availColor};">
                  ${check.tooLong ? 'Too Late' : availLabel}
                </span>
                ${warningHtml}
                <button
                  type="button"
                  id="change-btn-${cellId}"
                  style="
                    margin-top: 0.2rem;
                    font-size: 0.65rem;
                    padding: 0.15rem 0.4rem;
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    background: transparent;
                    color: var(--text-muted);
                    cursor: pointer;
                    width: fit-content;
                  "
                >↩ Change</button>
              </div>
            `;

            // Update the in-memory plan so Accept & Save commits the new owner
            const arr = Array.isArray(newPlans) ? newPlans : (newPlans.plans || []);
            arr.forEach(plan => {
              plan.tasks.forEach((task, tIdx) => {
                const expectedCellId = `avail-cell-${plan.plan_id}-${tIdx}`.replace(/[^a-zA-Z0-9-]/g, '-');
                if (expectedCellId === cellId) {
                  task.owner = emp.email;
                }
              });
            });

            // "Change" button re-renders the dropdown and re-binds the named handler
            const changeBtn = document.getElementById(`change-btn-${cellId}`);
            if (changeBtn) {
              changeBtn.addEventListener('click', () => {
                cell.innerHTML = `
                  <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <select
                      id="sel-${cellId}"
                      style="
                        font-size: 0.73rem;
                        padding: 0.3rem 0.4rem;
                        background: var(--bg-tertiary);
                        border: 1px solid var(--color-status-amber-text);
                        border-radius: var(--radius-sm);
                        color: var(--text-primary);
                        cursor: pointer;
                        max-width: 220px;
                      "
                      title="Select alternate ${skill} employee"
                    >
                      <option value="" disabled selected>— Pick alternate (${skill}) —</option>
                      ${options}
                    </select>
                    <div id="msg-${cellId}" style="margin-top: 0.1rem;">
                      <span style="font-size: 0.72rem; color: var(--color-status-red-text); font-weight: 700;">
                        hire a new employee with the skills for this task
                      </span>
                    </div>
                  </div>
                `;
          // Re-bind the named handler to the restored select
                const newSel = document.getElementById(`sel-${cellId}`);
                if (newSel) newSel.addEventListener('change', handleChange);
              });
            }
          };

          selectEl.addEventListener('change', handleChange);
        }
      });
    });
  }

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

      successMsg.textContent = '✓ Plan approved and saved!';
      successMsg.style.display = 'block';

      // Show Next Step CTA
      const reviewSection = document.getElementById('preview-review-section');
      if (reviewSection) {
        const nextBanner = document.createElement('div');
        nextBanner.style.cssText = 'display:flex;gap:0.75rem;align-items:center;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border-color);flex-wrap:wrap;';
        nextBanner.innerHTML = `
          <span style="font-size:0.85rem;color:var(--text-secondary);">&#x2713; Plan accepted &mdash; ready for dependency sensing.</span>
          <div style="flex:1;"></div>
          <button id="btn-proceed-to-deps-preview" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 1.2rem;border-radius:var(--radius-sm);font-size:0.88rem;font-weight:700;cursor:pointer;border:none;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color: var(--text-primary);box-shadow:0 2px 8px rgba(139,92,246,0.35);"
            onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(139,92,246,0.5)';"
            onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(139,92,246,0.35)';">
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            Next: Sense Dependencies &nbsp;&rarr;
          </button>
        `;
        reviewSection.appendChild(nextBanner);
        nextBanner.querySelector('#btn-proceed-to-deps-preview').addEventListener('click', () => {
          sessionStorage.setItem('pendingDepsAutoSense', '1');
          if (selectedPlanId) {
            sessionStorage.setItem('dependencies_selected_plan_id', selectedPlanId);
          }
          window.switchStage('dependencies');
        });
      }

      await window.fetchPlans();
      if (plansArray.length > 0) {
        selectPlan(plansArray[0].plan_id);
      }
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
      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem; flex-shrink: 0;" id="review-section">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
          Human-in-the-loop Review
        </div>
        <div style="font-size: 0.85rem; color: var(--color-status-green-text); font-weight: 600; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          ✓ Plan has been accepted and advanced to Stage 04: Dependencies.
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <button type="button" id="btn-replan-project"
            class="btn-primary"
            style="background-color: var(--color-status-amber-border); border: 1px solid var(--color-status-amber-text); color: var(--color-status-amber-text); cursor: pointer; padding: 0.4rem 1rem; display: flex; align-items: center; gap: 4px; font-weight: 700; font-size: 0.82rem; border-radius: var(--radius-sm);">
            <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: currentColor;"><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.77-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.78.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>
            Replan Project
          </button>
          <div style="flex:1;"></div>
          <button type="button" id="btn-proceed-to-deps"
            style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 1.2rem;border-radius:var(--radius-sm);font-size:0.88rem;font-weight:700;cursor:pointer;border:none;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color: var(--text-primary);box-shadow:0 2px 8px rgba(139,92,246,0.35);"
            onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(139,92,246,0.5)';"
            onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(139,92,246,0.35]';">
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            Next: Sense Dependencies &nbsp;&rarr;
          </button>
        </div>
      </div>
    `;
  } else {
    reviewHtml = `
      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem; flex-shrink: 0;" id="review-section">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
          Human-in-the-loop Review
        </div>
        <div style="display: flex; gap: 1.2rem; align-items: center;">
          <button type="button" class="btn-primary" id="btn-accept-plan" style="background-color: var(--color-status-green-border); border: 1px solid var(--color-status-green-text); color: var(--color-status-green-text); cursor: pointer; font-weight: 700; padding: 0.4rem 1.2rem; border-radius: var(--radius-sm);">
            ✓ Accept & Save
          </button>
          <button type="button" class="btn-secondary" id="btn-replan-trigger" style="color: var(--color-status-amber-text); border-color: var(--color-status-amber-text); cursor: pointer; font-weight: 700; padding: 0.4rem 1.2rem; border-radius: var(--radius-sm);">
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
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${plan.demand_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.75rem;">
            Plan
            <span style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-weight: 600; text-transform: uppercase; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeColor};">
              ${badgeText}
            </span>
          </h2>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-secondary);">Plan End Date</div>
          <div style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700;
                      color: var(--color-brand); margin-bottom: 0.25rem;">${plan.end_date}</div>
          <button type="button" id="btn-delete-plan"
            class="btn-secondary"
            style="color: var(--color-status-red-text); border-color: var(--color-status-red-text); padding: 0.25rem 0.5rem; font-size: 0.75rem;">
            Delete Plan
          </button>
        </div>
      </div>

      <!-- Replan Form Section Container -->
      <div id="replan-section-container" style="display:none; margin-bottom: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; background: var(--bg-secondary);"></div>

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
    if (isCompleted) {
      statusCell = `
                  <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--color-status-green-text);">
                    Done
                  </span>
                `;
    } else if (status === 'accepted') {
      statusCell = `
                  <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--color-brand);">
                    Active
                  </span>
                `;
    } else {
      statusCell = `
                  <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
                    Pending
                  </span>
                `;
    }

    const isOwnerNotAvailable = !t.owner || t.owner === 'unassigned' || t.owner.includes('default') || t.owner.includes('unassigned');
    let hasConflict = false;
    let conflictingOwner = '';
    if (!isOwnerNotAvailable && window.allEmployees) {
      const ownersList = t.owner.split(',').map(o => o.trim());
      for (const owner of ownersList) {
        const emp = window.allEmployees.find(e => (e.email || '').toLowerCase() === owner.toLowerCase() || (e.name || '').toLowerCase() === owner.toLowerCase());
        if (emp) {
          const check = getAvailabilityStatusForTask(emp, t);
          if (check.tooLong) {
            hasConflict = true;
            conflictingOwner = emp.name || owner;
            break;
          }
        }
      }
    }

    const displayName = getEmployeeDisplayName(t.owner);

    let ownerDisplay = '';
    if (isOwnerNotAvailable || hasConflict) {
      ownerDisplay = `
        <div style="display: flex; flex-direction: column; gap: 0.2rem; background: rgba(239, 68, 68, 0.08); padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--color-status-red-text); line-height: 1.25;">
          <span style="color: var(--color-status-red-text); font-weight: 600; font-size: 0.78rem;">
            ⚠ ${isOwnerNotAvailable ? 'employee for this task is currently not available' : conflictingOwner + ' is currently not available'}
          </span>
          <span style="font-size: 0.75rem; color: var(--color-status-red-text); font-weight: 700; display: block;">
            hire a new employee with the skills for this task
          </span>
        </div>
      `;
    } else {
      const ownersList = t.owner.split(',').map(o => o.trim());
      ownerDisplay = ownersList.map(o => {
        const name = getEmployeeDisplayName(o);
        return `<span class="employee-chip" style="display: inline-block; background-color: var(--color-brand-light, #e0f2fe); color: var(--color-brand, #0369a1); padding: 0.15rem 0.45rem; border-radius: 12px; font-size: 0.75rem; margin-right: 0.25rem; font-weight: 600; border: 1px solid var(--color-brand-border, #bae6fd);">${name}</span>`;
      }).join('');
    }

    return `
                <tr style="background: ${rowBg};">
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; font-size: 0.75rem; color: ${isCritical ? 'var(--color-brand)' : 'var(--text-secondary)'};">
                    ${t.task_id}
                    ${isCritical ? '<span style="font-size: 0.6rem; margin-left: 4px; color: var(--color-brand);">★ CRIT</span>' : ''}
                  </td>
                  <td style="padding: 0.6rem 0.75rem; color: var(--text-primary); font-weight: 600;">${t.name}</td>
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; color: var(--text-secondary);">${t.start_date}</td>
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; color: var(--text-secondary);">${t.end_date}</td>
                  <td style="padding: 0.6rem 0.75rem;">${ownerDisplay}</td>
                  <td style="padding: 0.6rem 0.75rem; font-family: monospace; font-size: 0.72rem; color: var(--text-muted);">
                    ${(t.predecessor_task_ids && t.predecessor_task_ids.length) ? t.predecessor_task_ids.join(', ') : '—'}
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

      <!-- Replan History Section -->
      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; flex-shrink: 0;">
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
          Replan History & Audit Log
        </div>
        <div id="replan-history-container" style="max-height: 250px; overflow-y: auto;">Loading replan history...</div>
      </div>
    </div>
  `;

  // Attach Replan Project click listener
  const replanBtn = document.getElementById('btn-replan-project');
  const proceedToDepsBtn = document.getElementById('btn-proceed-to-deps');

  if (proceedToDepsBtn) {
    proceedToDepsBtn.addEventListener('click', () => {
      sessionStorage.setItem('pendingDepsAutoSense', '1');
      if (selectedPlanId) {
        sessionStorage.setItem('dependencies_selected_plan_id', selectedPlanId);
      }
      window.switchStage('dependencies');
    });
  }

  if (replanBtn) {
    replanBtn.addEventListener('click', () => {
      const replanContainer = document.getElementById('replan-section-container');
      if (!replanContainer) return;

      const hasStarted = plan.tasks.some(t => t.status === 'completed') ||
        (plan.tasks[0] && new Date(plan.tasks[0].start_date) <= new Date());

      replanContainer.style.display = 'block';
      replanContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      const rawEffort = plan._reasoning?.raw_effort_days || 10;
      const workDays = 5;
      const util = 85;

      replanContainer.innerHTML = `
        <h4 style="margin: 0 0 1rem 0; font-family: var(--font-display); font-size: 1.1rem; color: var(--color-status-amber-text); display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.77-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.78.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>
          Replan Project: ${plan.demand_id}
        </h4>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Scope Effort (Person-Days)</label>
            <input type="number" id="project-replan-effort" value="${rawEffort}" min="1" step="0.5"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); width: 100%;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Planning Start Date</label>
            <input type="date" id="project-replan-start-date" value="${plan.tasks[0]?.start_date || '2026-07-07'}"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); width: 100%;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Working Days/Week</label>
            <input type="number" id="project-replan-work-days" value="${workDays}" min="1" max="7"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); width: 100%;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Max Utilization %</label>
            <input type="number" id="project-replan-util" value="${util}" min="1" max="100"
              style="font-size: 0.85rem; padding: 0.4rem 0.6rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); width: 100%;">
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label style="font-size: 0.75rem; font-weight: 700; color: var(--color-status-amber-text);">
            Reason for Replanning * (Mandatory)
          </label>
          <textarea id="project-replan-reason" placeholder="e.g. Employee Gabriel Morris is on leave for two weeks..." 
            style="font-size: 0.85rem; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); width: 100%; min-height: 80px;"></textarea>
        </div>

        <div style="display: flex; gap: 1rem; align-items: center;">
          <button type="button" class="btn-primary" id="btn-submit-project-replan" style="background-color: var(--color-status-amber-border); border: 1px solid var(--color-status-amber-text); color: var(--color-status-amber-text); cursor: pointer; padding: 0.4rem 1rem;">
            Submit Replan
          </button>
          <button type="button" class="btn-secondary" id="btn-cancel-project-replan" style="cursor: pointer; padding: 0.4rem 1rem;">
            Cancel
          </button>
        </div>
        <div id="project-replan-error-msg" style="font-size: 0.85rem; color: var(--color-status-red-text); display: none; margin-top: 0.5rem; font-weight: 600;"></div>
      `;

      document.getElementById('btn-cancel-project-replan').addEventListener('click', () => {
        replanContainer.style.display = 'none';
      });

      document.getElementById('btn-submit-project-replan').addEventListener('click', async () => {
        const effort = parseFloat(document.getElementById('project-replan-effort').value);
        const startDate = document.getElementById('project-replan-start-date').value;
        const workDays = parseInt(document.getElementById('project-replan-work-days').value);
        const util = parseFloat(document.getElementById('project-replan-util').value);
        const reasonEl = document.getElementById('project-replan-reason');
        const reasonVal = reasonEl ? reasonEl.value.trim() : "";

        if (!reasonVal) {
          const errEl = document.getElementById('project-replan-error-msg');
          errEl.textContent = 'Validation Error: Reason for replanning is required.';
          errEl.style.display = 'block';
          return;
        }

        if (isNaN(effort) || effort <= 0) {
          const errEl = document.getElementById('project-replan-error-msg');
          errEl.textContent = 'Validation Error: Please enter a valid effort count.';
          errEl.style.display = 'block';
          return;
        }

        const submitBtn = document.getElementById('btn-submit-project-replan');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="loader"><span class="spinner"></span> AI Reallocating & Rescheduling...</span>`;

        try {
          const response = await fetch(`${PLAN_API_BASE}/plans/${plan.plan_id}/replan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: reasonVal,
              effort_days: effort,
              planning_start_date: startDate,
              working_days_per_week: workDays,
              max_daily_utilization_percentage: util
            })
          });

          if (!response.ok) {
            const errBody = await response.json();
            throw new Error(errBody.detail || 'Replan API call failed');
          }

          const result = await response.json();

          // Display reallocations and updated dates
          let summaryHtml = `
            <div style="border: 1px solid var(--color-status-green-border); background: rgba(52,211,153,0.05); padding: 1.25rem; border-radius: var(--radius-md);">
              <h4 style="color: var(--color-status-green-text); margin: 0 0 0.5rem 0; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
                ✓ Replan Complete
              </h4>
              <p style="font-size: 0.85rem; margin: 0 0 1rem 0; color: var(--text-secondary);">
                Project plan updated successfully. An audit snapshot has been stored in history.
              </p>
          `;

          if (result.reallocations && result.reallocations.length > 0) {
            summaryHtml += `
              <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; color: var(--text-primary);">AI Resource Reallocations:</div>
              <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 1rem;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">
                    <th style="padding: 6px; text-align: left;">Task</th>
                    <th style="padding: 6px; text-align: left;">Previous Assignee</th>
                    <th style="padding: 6px; text-align: left;">New Assignee</th>
                    <th style="padding: 6px; text-align: left;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${result.reallocations.map(r => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 6px;"><strong>${r.task_name}</strong></td>
                      <td style="padding: 6px; color: var(--color-status-red-text); font-family: monospace;">${r.previous_assignee}</td>
                      <td style="padding: 6px; color: var(--color-status-green-text); font-weight: 600; font-family: monospace;">${r.new_assignee}</td>
                      <td style="padding: 6px;"><span class="tag green" style="background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.3); color: var(--color-status-green-text); padding: 2px 6px; border-radius: 4px; font-size:0.65rem;">${r.allocation_status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          } else {
            summaryHtml += `
              <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 1rem 0; font-style: italic;">
                No resource reallocations were required.
              </p>
            `;
          }

          summaryHtml += `
            <div style="font-size: 0.85rem; color: var(--text-primary); margin-top: 0.75rem; border-top: 1px dashed var(--border-color); padding-top: 0.75rem;">
              <strong>Updated Project Dates:</strong> 
              <span style="color: var(--color-brand); font-family: monospace; font-weight: 700; font-size: 0.9rem;">
                ${result.plan.tasks[0]?.start_date || startDate} to ${result.plan.end_date}
              </span>
            </div>
            
            <div style="margin-top: 1.25rem;">
              <button type="button" class="btn-primary" id="btn-replan-summary-done" style="padding: 0.4rem 1.2rem; cursor: pointer;">
                Done
              </button>
            </div>
          </div>`;

          replanContainer.innerHTML = summaryHtml;

          document.getElementById('btn-replan-summary-done').addEventListener('click', async () => {
            replanContainer.style.display = 'none';
            await window.fetchPlans();
            selectPlan(plan.plan_id);
          });

        } catch (err) {
          const errEl = document.getElementById('project-replan-error-msg');
          errEl.textContent = 'Replan Error: ' + err.message;
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Replan';
        }
      });
    });
  }

  // Load replan history trace
  loadReplanHistory(plan.plan_id);

  document.getElementById('btn-delete-plan').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    // Show / hide inline confirm bar below the button
    const existingBar = document.getElementById('delete-plan-confirm-bar');
    if (existingBar) { existingBar.remove(); return; }

    const bar = document.createElement('div');
    bar.id = 'delete-plan-confirm-bar';
    bar.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;padding:0.5rem 0.75rem;background:rgba(239,68,68,0.08);border:1px solid var(--color-status-red-text);border-radius:var(--radius-sm);';
    bar.innerHTML = `
      <span style="font-size:0.78rem;color:var(--color-status-red-text);flex:1;font-weight:600;">⚠ Permanently delete this plan?</span>
      <button id="btn-confirm-delete-yes" style="font-size:0.75rem;padding:0.25rem 0.7rem;background:var(--color-status-red-text);color: var(--text-primary);border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:700;">Yes, Delete</button>
      <button id="btn-confirm-delete-no" style="font-size:0.75rem;padding:0.25rem 0.7rem;background:transparent;color:var(--text-muted);border:1px solid var(--border-color);border-radius:var(--radius-sm);cursor:pointer;">Cancel</button>
    `;
    btn.closest('div').parentElement.insertBefore(bar, btn.closest('div').nextSibling);

    document.getElementById('btn-confirm-delete-no').addEventListener('click', () => bar.remove());

    document.getElementById('btn-confirm-delete-yes').addEventListener('click', async () => {
      const id = plan.plan_id;
      try {
        bar.innerHTML = `<span style="font-size:0.78rem;color:var(--text-muted);padding:0.25rem;">Deleting...</span>`;
        const res = await fetch(`${PLAN_API_BASE}/plans/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete plan from database');

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
      } catch (err) {
        bar.innerHTML = `<span style="font-size:0.78rem;color:var(--color-status-red-text);padding:0.25rem;">✗ ${err.message}</span><button onclick="this.parentElement.remove()" style="margin-left:auto;font-size:0.72rem;background:transparent;border:none;color:var(--text-muted);cursor:pointer;">✕</button>`;
      }
    });
  });


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
        successMsg.textContent = '✓ Plan Accepted!';
        successMsg.style.display = 'block';

        document.getElementById('btn-accept-plan').disabled = true;
        document.getElementById('btn-replan-trigger').disabled = true;

        // Show Next Step CTA
        const reviewSection = document.getElementById('review-section');
        if (reviewSection) {
          const nextBanner = document.createElement('div');
          nextBanner.style.cssText = 'display:flex;gap:0.75rem;align-items:center;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border-color);flex-wrap:wrap;';
          nextBanner.innerHTML = `
            <span style="font-size:0.85rem;color:var(--text-secondary);">Plan accepted — ready for dependency sensing.</span>
            <div style="flex:1;"></div>
            <button id="btn-proceed-to-deps-detail" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 1.2rem;border-radius:var(--radius-sm);font-size:0.88rem;font-weight:700;cursor:pointer;border:none;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color: var(--text-primary);box-shadow:0 2px 8px rgba(139,92,246,0.35);"
              onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(139,92,246,0.5)';"
              onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(139,92,246,0.35)';">
              <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
              Next: Sense Dependencies &nbsp;&rarr;
            </button>
          `;
          reviewSection.appendChild(nextBanner);
          nextBanner.querySelector('#btn-proceed-to-deps-detail').addEventListener('click', () => {
            sessionStorage.setItem('pendingDepsAutoSense', '1');
            if (selectedPlanId) {
              sessionStorage.setItem('dependencies_selected_plan_id', selectedPlanId);
            }
            window.switchStage('dependencies');
          });
        }

        await window.fetchPlans();
        selectPlan(plan.plan_id);
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

          newPlan.status = 'replan';
          const saveRes = await fetch(`${PLAN_API_BASE}/plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPlan)
          });
          if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(err.detail || 'Failed to save replanned plan');
          }

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
    'Design & Setup': '#818cf8',
    'Build': '#6366f1',
    'Test & QA': '#fbbf24',
    'Deploy & Release': '#34d399',
  };

  return plan.tasks.map(t => {
    const start = new Date(t.start_date);
    const end = new Date(t.end_date);
    const leftPct = ((start - minDate) / totalMs * 100).toFixed(1);
    const widthPct = Math.max(1, ((end - start) / totalMs * 100)).toFixed(1);
    const color = phaseColors[t.name] || 'var(--color-brand)';
    const isCritical = plan.critical_path_task_ids.includes(t.task_id);
    const displayName = getEmployeeDisplayName(t.owner);
    return `
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
        <div style="width: 130px; flex-shrink: 0; font-size: 0.75rem; color: var(--text-secondary); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${t.name}
        </div>
        <div style="flex: 1; position: relative; height: 22px; background: rgba(30,41,59,0.5); border-radius: 4px;">
          <div style="
            position: absolute;
            left: ${leftPct}%;
            width: ${widthPct}%;
            height: 100%;
            background: ${color};
            opacity: ${isCritical ? '1' : '0.8'};
            border-radius: 3px;
            display: flex;
            align-items: center;
            padding-left: 6px;
            font-size: 0.68rem;
            color: var(--text-primary);
            text-shadow: 0px 1px 3px rgba(0,0,0,0.9);
            font-weight: 700;
            white-space: nowrap;
          ">${displayName}</div>
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

async function loadReplanHistory(planId) {
  const historyContainer = document.getElementById('replan-history-container');
  if (!historyContainer) return;
  try {
    const res = await fetch(`${PLAN_API_BASE}/plans/${planId}/history`);
    if (!res.ok) throw new Error('Failed to load history');
    const history = await res.json();
    if (!history || history.length === 0) {
      historyContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; font-style: italic; margin-top: 0.5rem;">No replan history recorded.</div>`;
      return;
    }
    historyContainer.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; border: 1px solid var(--border-color); background: var(--bg-tertiary); border-radius: var(--radius-sm);">
        <thead>
          <tr style="background: var(--bg-secondary); color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; border-bottom: 1px solid var(--border-color);">
            <th style="text-align:left; padding: 6px; font-weight: 600;">Ver</th>
            <th style="text-align:left; padding: 6px; font-weight: 600;">Reason for Replanning</th>
            <th style="text-align:left; padding: 6px; font-weight: 600;">Timestamp</th>
            <th style="text-align:left; padding: 6px; font-weight: 600;">New Dates</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(h => {
      const tasks = h.data.tasks || [];
      const start = tasks[0]?.start_date || 'N/A';
      const end = h.data.end_date || 'N/A';
      return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 6px; font-weight: 700; color: var(--color-brand);">v${h.version}</td>
                <td style="padding: 6px; color: var(--text-primary); font-size: 0.8rem;">${h.reason}</td>
                <td style="padding: 6px; color: var(--text-muted); font-size: 0.75rem;">${new Date(h.timestamp).toLocaleString()}</td>
                <td style="padding: 6px; font-family: monospace; font-size: 0.75rem; color: var(--color-status-amber-text);">${start} to ${end}</td>
              </tr>
            `;
    }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    historyContainer.innerHTML = `<div style="color: var(--color-status-red-text); font-size: 0.8rem;">Error loading history: ${err.message}</div>`;
  }
}
