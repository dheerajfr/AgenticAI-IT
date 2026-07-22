const DEPLOY_API_BASE = '/api/deployments';
const DEMAND_API_BASE = '/api/demands';
const ENV_API_BASE = '/api/environments';

let runbooks = [];
let cutoverSessions = [];
let deployments = [];
let demands = [];              // Stage 1 demand records
let envRecords = [];           // All Stage 5 environment records

function formatSimpleName(compId) {
  if (!compId) return 'Unknown';
  let s = compId.toLowerCase();
  s = s.replace(/^svc-/, '');
  s = s.replace(/-api/, '');
  s = s.replace(/-prod.*/, '');
  s = s.replace(/-staging.*/, '');
  s = s.replace(/-test.*/, '');
  s = s.replace(/-dev.*/, '');
  s = s.replace(/-svr.*/, '');
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getEnvironment(record) {
  if (record.environment) return record.environment;
  if (record.cutover_id && record.deployment_id) {
    const dep = deployments.find(d => d.deployment_id === record.deployment_id);
    if (dep && dep.environment) return dep.environment;
  }
  if (record.steps && record.steps.length > 0) {
    const envOrder = ['dev', 'test', 'staging', 'prod'];
    let targetEnv = 'dev';
    for (const step of record.steps) {
      if (step.environment && envOrder.indexOf(step.environment) > envOrder.indexOf(targetEnv)) {
        targetEnv = step.environment;
      }
    }
    return targetEnv;
  }
  return 'N/A';
}

let envRecordsForDemand = []; // Stage 5 environment records for the selected demand
let activeDeployTab = 'runbooks'; // 'runbooks' | 'cutover' | 'orchestration'
let selectedRunbookId = null;
let selectedCutoverId = null;
let selectedDeploymentId = null;
let selectedRunbookDemandId = null; // tracks which demand is selected in the runbook form
let selectedDemandId = null; // tracks the globally selected demand from the sidebar

window.renderBuildDeployScreen = function () {
  const viewport = document.getElementById('viewport');

  if (!document.getElementById('stage-6-styles')) {
    const style = document.createElement('style');
    style.id = 'stage-6-styles';
    style.textContent = `
      .step-track { list-style: none; margin: 0; padding: 0; }
      .step-row {
        display: flex; align-items: center; gap: 0.75rem;
        padding: 0.6rem 0.75rem; border: 1px solid var(--border-color);
        border-radius: var(--radius-sm); margin-bottom: 0.5rem; background: var(--bg-primary);
      }
      .step-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .step-dot.pending { background: var(--text-muted); }
      .step-dot.in-progress { background: var(--color-status-amber-text); }
      .step-dot.done { background: var(--color-status-green-text); }
      .step-dot.blocked { background: var(--color-status-red-text); }
      .step-desc { flex: 1; font-size: 0.85rem; }
      .step-meta { font-size: 0.7rem; color: var(--text-muted); }
      .step-actions { display: flex; gap: 0.35rem; }
      .step-actions button {
        font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px;
        border: 1px solid var(--border-color); background: var(--bg-secondary);
        color: var(--text-secondary); cursor: pointer;
      }
      .step-actions button:hover { color: var(--text-primary); border-color: var(--text-secondary); }
      .comms-feed { max-height: 220px; overflow-y: auto; margin-top: 0.5rem; }
      .comms-entry {
        font-size: 0.8rem; padding: 0.5rem 0.75rem; border-left: 2px solid var(--color-brand);
        background: rgba(99,102,241,0.04); margin-bottom: 0.4rem; border-radius: 0 4px 4px 0;
      }
      .comms-entry .comms-meta { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.15rem; }
      .precondition-row {
        display: flex; align-items: flex-start; gap: 0.6rem;
        padding: 0.6rem 0.75rem; border: 1px solid var(--border-color);
        border-radius: var(--radius-sm); margin-bottom: 0.5rem; background: var(--bg-primary);
      }
      .precondition-icon { font-weight: 700; flex-shrink: 0; }
      .precondition-icon.pass { color: var(--color-status-green-text); }
      .precondition-icon.fail { color: var(--color-status-red-text); }
      .precondition-body { flex: 1; }
      .precondition-name { font-size: 0.8rem; font-weight: 600; text-transform: capitalize; margin-bottom: 0.2rem; }
      .precondition-detail { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; }
    `;
    document.head.appendChild(style);
  }

  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Build & deploy</h3>
          <div style="display:flex; gap:0.5rem;">
            ${activeDeployTab === 'runbooks' ? '<button class="btn-new" id="btn-new-deploy-item" title="Draft New Runbook">+</button>' : ''}
            <button class="btn-new" id="btn-refresh-deploy">↻ Refresh</button>
          </div>
        </div>
        <div class="tabs-container" style="margin: 0 1rem;">
          <button class="tab-btn ${activeDeployTab === 'runbooks' ? 'active' : ''}" id="tab-runbooks">Runbooks</button>
          <button class="tab-btn ${activeDeployTab === 'cutover' ? 'active' : ''}" id="tab-cutover">Cutover Bridge</button>
          <button class="tab-btn ${activeDeployTab === 'orchestration' ? 'active' : ''}" id="tab-orchestration">Orchestration</button>
        </div>
        <ul class="demand-list" id="deploy-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading...</li>
        </ul>
      </aside>
      <main class="details-panel" id="deploy-panel-container">
        <!-- Rendered dynamically -->
      </main>
    </div>
  `;

  document.getElementById('btn-refresh-deploy').addEventListener('click', () => window.fetchBuildDeployData());
  const newBtn = document.getElementById('btn-new-deploy-item');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      selectedDemandId = null;
      selectedRunbookId = null;
      selectedRunbookDemandId = null;
      window.renderBuildDeployScreen();
      window.fetchBuildDeployData(true);
    });
  }
  document.getElementById('tab-runbooks').addEventListener('click', () => switchDeployTab('runbooks'));
  document.getElementById('tab-cutover').addEventListener('click', () => switchDeployTab('cutover'));
  document.getElementById('tab-orchestration').addEventListener('click', () => switchDeployTab('orchestration'));
};

function switchDeployTab(tab) {
  activeDeployTab = tab;
  if (selectedDemandId) {
    sessionStorage.setItem('selectedDemandId', selectedDemandId);
  }
  window.renderBuildDeployScreen();
  window.fetchBuildDeployData();
}

window.fetchBuildDeployData = async function (forceNew = false) {
  if (forceNew) {
    selectedDemandId = null;
  } else if (!selectedDemandId) {
    selectedDemandId = sessionStorage.getItem('selectedDemandId') || null;
  }
  const container = document.getElementById('deploy-list-container');
  if (!container) return; // Screen not rendered yet
  try {
    // Fetch all data — treat demand/env failures as non-fatal
    const [rbRes, cutRes, depRes, demandRes, envRes] = await Promise.all([
      fetch(`${DEPLOY_API_BASE}/runbooks`).catch(() => null),
      fetch(`${DEPLOY_API_BASE}/cutover`).catch(() => null),
      fetch(`${DEPLOY_API_BASE}/orchestration`).catch(() => null),
      fetch(DEMAND_API_BASE).catch(() => null),
      fetch(ENV_API_BASE).catch(() => null)
    ]);

    if (!rbRes || !rbRes.ok) throw new Error('Could not reach runbooks endpoint');
    if (!cutRes || !cutRes.ok) throw new Error('Could not reach cutover endpoint');
    if (!depRes || !depRes.ok) throw new Error('Could not reach orchestration endpoint');

    runbooks        = await rbRes.json();
    cutoverSessions = await cutRes.json();
    deployments     = await depRes.json();
    demands         = (demandRes && demandRes.ok)  ? await demandRes.json() : [];
    envRecords      = (envRes    && envRes.ok)     ? await envRes.json()    : [];

    renderDeployList();

    const activeItems = activeDeployTab === 'runbooks' ? runbooks
      : activeDeployTab === 'cutover' ? cutoverSessions
      : deployments;

    if (activeDeployTab === 'runbooks') {
      if (selectedRunbookId && !runbooks.some(r => r.runbook_id === selectedRunbookId)) selectedRunbookId = null;
    } else if (activeDeployTab === 'cutover') {
      if (selectedCutoverId && !cutoverSessions.some(c => c.cutover_id === selectedCutoverId)) selectedCutoverId = null;
    } else {
      if (selectedDeploymentId && !deployments.some(d => d.deployment_id === selectedDeploymentId)) selectedDeploymentId = null;
    }

    if (selectedDemandId) {
      const hasItems = activeItems.some(i => (i.demand_id || 'Unknown') === selectedDemandId);
      if (!hasItems) selectedDemandId = null;
    }

    if (selectedDemandId) {
      renderDeployContent();
    } else {
      if (activeDeployTab === 'runbooks') showNewRunbookForm();
      else if (activeDeployTab === 'cutover') showNewCutoverForm();
      else showNewDeploymentForm();
    }
  } catch (err) {
    console.error('Failed to fetch build-deploy data:', err);
    const c = document.getElementById('deploy-list-container');
    if (c) {
      c.innerHTML = `
        <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
          <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">${err.message}<br>Make sure the gateway server is running.</div>
        </li>
      `;
    }
  }
};

function renderDeployList() {
  const container = document.getElementById('deploy-list-container');
  const items = activeDeployTab === 'runbooks' ? runbooks : activeDeployTab === 'cutover' ? cutoverSessions : deployments;
  const idField = activeDeployTab === 'runbooks' ? 'runbook_id' : activeDeployTab === 'cutover' ? 'cutover_id' : 'deployment_id';
  const selectedId = activeDeployTab === 'runbooks' ? selectedRunbookId : activeDeployTab === 'cutover' ? selectedCutoverId : selectedDeploymentId;

  let html = '';

  if (items.length === 0) {
    html += `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No records yet.</li>`;
  } else {
    const grouped = {};
    items.forEach(item => {
      const dId = item.demand_id || 'Unknown Demand';
      if (!grouped[dId]) grouped[dId] = [];
      grouped[dId].push(item);
    });

    for (const dId of Object.keys(grouped)) {
      const isActive = dId === selectedDemandId;
      const projName = formatSimpleName(grouped[dId][0].component_id);
      html += `
        <li class="demand-item ${isActive ? 'active' : ''}" data-did="${dId}" style="cursor:pointer;">
          <div class="demand-item-header">
            <span class="demand-item-id" style="font-size: 0.85rem; font-weight: 600;">Demand: ${dId}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-primary); font-weight: 500; margin-top: 0.1rem;">${projName}</div>
          <h4 class="demand-item-title" style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 0.2rem;">${grouped[dId].length} record(s)</h4>
        </li>
      `;
    }
  }

  container.innerHTML = html;


  container.querySelectorAll('.demand-item[data-did]').forEach(el => {
    el.addEventListener('click', () => {
      selectedDemandId = el.getAttribute('data-did');
      sessionStorage.setItem('selectedDemandId', selectedDemandId);
      renderDeployList();
      renderDeployContent();
    });
  });
}

// ---------------------------------------------------------------------------
// Runbook drafting — smart form pre-populated from upstream stages
// ---------------------------------------------------------------------------



function _buildArchNotes() {
  return '';
}

function _buildChangeSummary(demand) {
  let summary = '';
  if (demand) {
    summary += `Demand: ${demand.demand_id} — ${demand.title}\n`;
    if (demand.business_case_summary) summary += `Business case: ${demand.business_case_summary}\n`;
    summary += `Risk: ${demand.risk_level} | Domain: ${demand.domain} | Type: ${demand.type}\n`;
  }
  return summary.trim();
}

async function _loadEnvRecordsForDemand(demandId) {
  try {
    const res = await fetch(`${ENV_API_BASE}/${demandId}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (_) { return []; }
}

function showNewRunbookForm() {
  const panel = document.getElementById('deploy-panel-container');
  const priorOptions = runbooks.map(r => `<option value="${r.runbook_id}">${r.title}</option>`).join('');

  // Build component options from distinct component_ids in runbooks and envRecords
  const rawComponentIds = [
    ...runbooks.map(r => r.component_id),
    ...envRecords.map(e => e.cmdb_name || e.observed_name || e.demand_id)
  ].filter(Boolean);
  const componentIds = [...new Set(rawComponentIds)].sort();
  const componentOptions = componentIds.map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');

  // Build demand options grouped by status
  const approvedDemands = demands.filter(d => d.status === 'approved' || d.status === 'capacity-checked');
  const otherDemands = demands.filter(d => d.status !== 'approved' && d.status !== 'capacity-checked');
  const demandOptions = [
    approvedDemands.length ? `<optgroup label="Approved / Capacity-checked">${approvedDemands.map(d => `<option value="${d.demand_id}">${d.demand_id} — ${d.title}</option>`).join('')}</optgroup>` : '',
    otherDemands.length ? `<optgroup label="Other Demands">${otherDemands.map(d => `<option value="${d.demand_id}">${d.demand_id} — ${d.title}</option>`).join('')}</optgroup>` : ''
  ].join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0;">Draft a Runbook</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Select a demand to auto-populate the form from upstream stage outputs, then review and submit to generate AI-powered runbook steps.
      </p>

      <!-- Step 1: Demand picker -->
      <div class="form-group" style="border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.25rem;background:var(--bg-secondary);">
        <label for="rbk-demand-pick" style="font-size:0.8rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.35rem;display:block;">① Select Demand <span style="font-weight:400;text-transform:none;">(auto-fills form from Stages 1–4)</span></label>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <select id="rbk-demand-pick" style="flex:1;">
            <option value="">— choose a demand —</option>
            ${demandOptions}
          </select>
          <button type="button" class="btn-secondary" id="btn-load-demand" style="white-space:nowrap;">Load ↓</button>
        </div>
      </div>

      <!-- Step 2: Form fields (pre-populated) -->
      <div id="rbk-step2" style="display:${selectedRunbookDemandId ? 'block' : 'none'};">
      <div style="border-left:3px solid var(--color-brand);padding-left:0.9rem;margin-bottom:1rem;">
        <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);">② Review &amp; Edit — then Draft</span>
      </div>

      <div class="form-group">
        <label for="rbk-component">Component ID *</label>
        <select id="rbk-component">
          <option value="">— select a component —</option>
          ${componentOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="rbk-change-summary">Change Summary * <span style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">(auto-filled from Stage 1)</span></label>
        <textarea id="rbk-change-summary" style="min-height:110px;" placeholder="Select a demand above to auto-populate..."></textarea>
      </div>
      <div class="form-group">
        <label for="rbk-arch-notes">Architecture Notes <span style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">(manual entry)</span></label>
        <textarea id="rbk-arch-notes" style="min-height:90px;" placeholder="Select a demand above or enter architecture notes manually..."></textarea>
      </div>
      <div class="grid-2col">
        <div class="form-group">
          <label for="rbk-environment">Target Environment * <span style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">(auto-filled from component drift)</span></label>
          <select id="rbk-environment" disabled style="background:var(--bg-tertiary);cursor:not-allowed;">
            <option value="dev">Development (dev)</option>
            <option value="test">Test (test)</option>
            <option value="staging">Staging (staging)</option>
            <option value="prod" selected>Production (prod)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="rbk-prior">Prior Runbook (reuse steps)</label>
          <select id="rbk-prior">
            <option value="">None</option>
            ${priorOptions}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="rbk-change-ref">Change Record Ref</label>
        <input type="text" id="rbk-change-ref" placeholder="e.g. CHG-2026-0091">
      </div>
      <div class="error-message" id="rbk-error"></div>
      <div class="submit-row">
        <button type="button" class="btn-primary" id="btn-draft-runbook">✦ Draft Runbook with AI</button>
      </div>
      </div>
    </div>
  `;

  // Restore previously selected demand if any
  if (selectedRunbookDemandId) {
    const sel = document.getElementById('rbk-demand-pick');
    if (sel) sel.value = selectedRunbookDemandId;
  }

  // "Load" button — fetch demand + env data and populate form
  document.getElementById('btn-load-demand').addEventListener('click', async () => {
    const demandId = document.getElementById('rbk-demand-pick').value;
    if (!demandId) return;
    selectedRunbookDemandId = demandId;

    const btn = document.getElementById('btn-load-demand');
    btn.disabled = true;
    btn.textContent = 'Loading…';

    const demand = demands.find(d => d.demand_id === demandId);
    envRecordsForDemand = await _loadEnvRecordsForDemand(demandId);

    // Derive component ID from Stage 5 prod CMDB name, or fall back to demand_id
    const prodEnv = envRecordsForDemand.find(r => r.environment === 'prod');
    const componentId = prodEnv ? (prodEnv.cmdb_name || prodEnv.observed_name || demandId) : demandId;

    // Filter component options based on this demand
    const compSelect = document.getElementById('rbk-component');

    let relatedComps = [];
    for (const r of envRecordsForDemand) {
      if (r.cmdb_name) relatedComps.push(r.cmdb_name);
      if (r.observed_name) relatedComps.push(r.observed_name);
    }
    relatedComps = [...new Set(relatedComps)].filter(Boolean).sort();

    // Replace options in dropdown
    compSelect.innerHTML = relatedComps.map(c => `<option value="${c}">${c}</option>`).join('');

    if (componentId && relatedComps.includes(componentId)) {
      compSelect.value = componentId;
    } else {
      compSelect.value = relatedComps[0] || '';
    }

    function updateTargetEnv() {
      const currentCompId = compSelect.value;
      const envOrder = ['dev', 'test', 'staging', 'prod'];
      let targetEnv = 'dev'; // fallback
      for (const env of envOrder) {
        const rec = envRecordsForDemand.find(r => r.environment === env && (r.cmdb_name === currentCompId || r.observed_name === currentCompId));
        if (rec) {
          targetEnv = env;
          break;
        }
      }
      const envSelect = document.getElementById('rbk-environment');
      if (envSelect) {
        envSelect.value = targetEnv;
      }

      // Filter prior runbooks based on the selected demand AND the target environment
      const priorSelect = document.getElementById('rbk-prior');
      if (priorSelect) {
        const relatedRunbooks = runbooks.filter(r => r.demand_id === demandId && getEnvironment(r) === targetEnv);
        priorSelect.innerHTML = '<option value="">None</option>' + 
          relatedRunbooks.map(r => `<option value="${r.runbook_id}">${r.title}</option>`).join('');
      }
    }

    compSelect.addEventListener('change', updateTargetEnv);
    updateTargetEnv();

    document.getElementById('rbk-change-summary').value = _buildChangeSummary(demand);
    document.getElementById('rbk-arch-notes').value = _buildArchNotes();

    document.getElementById('rbk-step2').style.display = 'block';
    
    btn.disabled = false;
    btn.textContent = '↺ Reload';
  });

  // Draft button — POST to backend
  document.getElementById('btn-draft-runbook').addEventListener('click', async () => {
    const component_id = document.getElementById('rbk-component').value.trim();
    const environment = document.getElementById('rbk-environment').value.trim();
    const change_summary = document.getElementById('rbk-change-summary').value.trim();
    const architecture_notes = document.getElementById('rbk-arch-notes').value.trim() || null;
    const change_record_ref = document.getElementById('rbk-change-ref').value.trim() || null;
    const prior_runbook_id = document.getElementById('rbk-prior').value || null;
    const errorBox = document.getElementById('rbk-error');
    errorBox.style.display = 'none';

    if (!component_id || !change_summary || !environment) {
      errorBox.textContent = 'Component ID, Environment, and Change Summary are required.';
      errorBox.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btn-draft-runbook');
    btn.disabled = true;
    btn.innerHTML = `<div class="loader" style="display: flex; align-items: center; justify-content: center;"><div class="spinner" style="display: block;"></div> Drafting with AI…</div>`;

    try {
      const demand_id = document.getElementById('rbk-demand-pick').value;
      const res = await fetch(`${DEPLOY_API_BASE}/runbooks/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_id, component_id, environment, change_summary, architecture_notes, change_record_ref, prior_runbook_id })
      });
      if (!res.ok) throw new Error('Failed to draft runbook.');
      const record = await res.json();
      selectedRunbookId = record.runbook_id;
      selectedDemandId = record.demand_id || 'Unknown Demand';
      sessionStorage.setItem('selectedDemandId', selectedDemandId);
      await window.fetchBuildDeployData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '✦ Draft Runbook with AI';
    }
  });
}


function renderRunbookDetails(record) {
  const panel = document.getElementById('deploy-panel-container');
  const totalMinutes = record.steps.reduce((sum, s) => sum + (s.estimated_minutes || 0), 0);
  const isSmeReview = record.status === 'sme-review';

  const stepTypeColor = { 'pre-check': '#818cf8', 'execute': '#60a5fa', 'verify': '#34d399', 'rollback-trigger': '#f87171' };

  // Build steps — unified view: all steps in one card, no step-by-step wizard
  const stepsHtml = record.steps.map((s, i) => `
    <li class="step-row" style="position:relative;">
      <div style="width:26px;height:26px;border-radius:50%;background:${stepTypeColor[s.step_type] || '#6366f1'}22;border:1.5px solid ${stepTypeColor[s.step_type] || '#6366f1'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-size:0.68rem;font-weight:800;color:${stepTypeColor[s.step_type] || '#6366f1'};">${i + 1}</span>
      </div>
      <div style="flex:1;">
        <div class="step-desc" style="font-weight:500;">${s.description}</div>
        <div class="step-meta" style="margin-top:0.2rem;">
          <span style="background:${stepTypeColor[s.step_type] || '#6366f1'}22;color:${stepTypeColor[s.step_type] || '#6366f1'};padding:1px 6px;border-radius:8px;font-size:0.68rem;font-weight:700;text-transform:uppercase;">${s.step_type}</span>
          &nbsp;${s.environment} &nbsp;·&nbsp; ${s.owner} &nbsp;·&nbsp; ~${s.estimated_minutes}min
        </div>
      </div>
    </li>
  `).join('');

  // Inline edit form for SME Review — allows editing title + each step
  const editFormHtml = isSmeReview ? `
    <div id="rbk-edit-section" style="display:none;margin-top:1.5rem;border-top:1px solid var(--border-color);padding-top:1.25rem;">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
        <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);">✏ Edit Runbook</span>
        <span style="font-size:0.75rem;color:var(--text-muted);">— SME Review Mode</span>
      </div>
      <div class="form-group">
        <label for="rbk-edit-title">Runbook Title</label>
        <input type="text" id="rbk-edit-title" value="${record.title.replace(/"/g, '&quot;')}">
      </div>
      <div class="data-label" style="margin-bottom:0.5rem;margin-top:0.75rem;">Steps</div>
      <div id="rbk-edit-steps">
        ${record.steps.map((s, i) => `
          <div class="panel-card" style="padding:0.75rem;margin-bottom:0.75rem;background:var(--bg-secondary);">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.5rem;">Step ${i + 1} — ${s.step_id}</div>
            <div class="form-group" style="margin-bottom:0.4rem;">
              <label style="font-size:0.72rem;">Description</label>
              <input type="text" class="edit-step-desc" data-idx="${i}" value="${s.description.replace(/"/g, '&quot;')}">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px;gap:0.4rem;">
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.72rem;">Owner</label>
                <input type="text" class="edit-step-owner" data-idx="${i}" value="${s.owner.replace(/"/g, '&quot;')}">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.72rem;">Environment</label>
                <select class="edit-step-env" data-idx="${i}">
                  ${['dev', 'test', 'staging', 'prod'].map(e => `<option value="${e}" ${s.environment === e ? 'selected' : ''}>${e}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.72rem;">Type</label>
                <select class="edit-step-type" data-idx="${i}">
                  ${['pre-check', 'execute', 'verify', 'rollback-trigger'].map(t => `<option value="${t}" ${s.step_type === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:0.72rem;">Minutes</label>
                <input type="number" class="edit-step-mins" data-idx="${i}" value="${s.estimated_minutes}" min="1" style="width:100%;">
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="error-message" id="rbk-edit-error"></div>
      <div class="submit-row" style="margin-top:1rem;">
        <button type="button" class="btn-secondary" id="btn-cancel-edit">Cancel</button>
        <button type="button" class="btn-primary" id="btn-save-edit">Save Changes</button>
      </div>
    </div>
  ` : '';

  panel.innerHTML = `
    <div class="panel-card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${record.runbook_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0;">${record.title}</h2>
        </div>
        <status-pill status="${record.status}"></status-pill>
      </div>

      <div class="grid-2col">
        <div class="data-item"><div class="data-label">Component</div><div class="data-value">${record.component_id}</div></div>
        <div class="data-item"><div class="data-label">Change Record</div><div class="data-value">${record.change_record_ref || 'N/A'}</div></div>
      </div>
      <div class="data-item" style="margin-bottom: 1.5rem;">
        <div class="data-label">Total Estimated Duration</div>
        <div class="data-value">${totalMinutes} minutes across ${record.steps.length} steps</div>
      </div>

      <div class="data-label" style="margin-bottom: 0.6rem;">All Steps</div>
      <ul class="step-track">${stepsHtml}</ul>

      <div class="submit-row" style="margin-top: 1.5rem; flex-wrap: wrap;">
        ${record.status === 'draft' ? `<button type="button" class="btn-secondary" id="btn-submit-review">Submit for SME Review</button>` : ''}
        ${isSmeReview ? `<button type="button" class="btn-secondary" id="btn-toggle-edit">✏ Edit Runbook</button>` : ''}
        ${record.status !== 'approved' ? `<button type="button" class="btn-primary" id="btn-approve-runbook">Approve Runbook</button>` : ''}
        ${record.status === 'approved' ? `<button type="button" class="btn-secondary" id="btn-start-cutover-from-runbook">Start Cutover Directly</button>` : ''}
        ${record.status === 'approved' ? `<button type="button" class="btn-primary" id="btn-start-deployment-from-runbook">Start Deployment (Orchestration)</button>` : ''}
      </div>

      ${editFormHtml}
    </div>
  `;

  const submitReviewBtn = document.getElementById('btn-submit-review');
  if (submitReviewBtn) {
    submitReviewBtn.addEventListener('click', async () => {
      await fetch(`${DEPLOY_API_BASE}/runbooks/${record.runbook_id}/submit-review`, { method: 'POST' });
      await window.fetchBuildDeployData();
    });
  }

  const approveBtn = document.getElementById('btn-approve-runbook');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      await fetch(`${DEPLOY_API_BASE}/runbooks/${record.runbook_id}/approve`, { method: 'POST' });
      switchDeployTab('orchestration');
    });
  }

  // SME Review edit toggle
  const toggleEditBtn = document.getElementById('btn-toggle-edit');
  if (toggleEditBtn) {
    toggleEditBtn.addEventListener('click', () => {
      const editSection = document.getElementById('rbk-edit-section');
      const isOpen = editSection.style.display !== 'none';
      editSection.style.display = isOpen ? 'none' : 'block';
      toggleEditBtn.textContent = isOpen ? '✏ Edit Runbook' : '✕ Close Editor';
    });
  }

  // Cancel edit
  const cancelEditBtn = document.getElementById('btn-cancel-edit');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      document.getElementById('rbk-edit-section').style.display = 'none';
      if (toggleEditBtn) toggleEditBtn.textContent = '✏ Edit Runbook';
    });
  }

  // Save edited steps
  const saveEditBtn = document.getElementById('btn-save-edit');
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', async () => {
      const errorBox = document.getElementById('rbk-edit-error');
      errorBox.style.display = 'none';

      const newTitle = document.getElementById('rbk-edit-title').value.trim();
      if (!newTitle) { errorBox.textContent = 'Title cannot be empty.'; errorBox.style.display = 'block'; return; }

      // Rebuild steps from edit form
      const updatedSteps = record.steps.map((s, i) => ({
        step_id: s.step_id,
        description: document.querySelector(`.edit-step-desc[data-idx="${i}"]`).value.trim() || s.description,
        owner: document.querySelector(`.edit-step-owner[data-idx="${i}"]`).value.trim() || s.owner,
        environment: document.querySelector(`.edit-step-env[data-idx="${i}"]`).value,
        step_type: document.querySelector(`.edit-step-type[data-idx="${i}"]`).value,
        estimated_minutes: parseInt(document.querySelector(`.edit-step-mins[data-idx="${i}"]`).value, 10) || s.estimated_minutes,
      }));

      saveEditBtn.disabled = true;
      saveEditBtn.textContent = 'Saving…';
      try {
        const res = await fetch(`${DEPLOY_API_BASE}/runbooks/${record.runbook_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle, steps: updatedSteps })
        });
        if (!res.ok) throw new Error('Failed to save changes.');
        await window.fetchBuildDeployData();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
        saveEditBtn.disabled = false;
        saveEditBtn.textContent = 'Save Changes';
      }
    });
  }

  const startCutoverBtn = document.getElementById('btn-start-cutover-from-runbook');
  if (startCutoverBtn) {
    startCutoverBtn.addEventListener('click', () => {
      activeDeployTab = 'cutover';
      selectedCutoverId = null;
      window.renderBuildDeployScreen();
      showNewCutoverForm(record.runbook_id);
      renderDeployList();
    });
  }

  const startDeploymentBtn = document.getElementById('btn-start-deployment-from-runbook');
  if (startDeploymentBtn) {
    startDeploymentBtn.addEventListener('click', () => {
      activeDeployTab = 'orchestration';
      selectedDeploymentId = null;
      window.renderBuildDeployScreen();
      showNewDeploymentForm(record.runbook_id);
      renderDeployList();
    });
  }
}

// ---------------------------------------------------------------------------
// Cutover comms
// ---------------------------------------------------------------------------

function showNewCutoverForm(prefillRunbookId) {
  const panel = document.getElementById('deploy-panel-container');
  const approvedRunbooks = runbooks.filter(r => r.status === 'approved');
  const runbookOptions = approvedRunbooks.map(r =>
    `<option value="${r.runbook_id}" ${r.runbook_id === prefillRunbookId ? 'selected' : ''}>${formatSimpleName(r.component_id)} - ${getEnvironment(r)}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0;">Start a Cutover Bridge</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Runs the cutover bridge: live status, step tracking, stakeholder updates.
      </p>
      <div class="form-group">
        <label for="cut-component">Component ID *</label>
        <select id="cut-component">
          <option value="">— select a component —</option>
          ${[...new Set(runbooks.map(r => r.component_id).filter(Boolean))].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="cut-runbook">Runbook (approved only)</label>
        <select id="cut-runbook">
          <option value="">None — track manually</option>
          ${runbookOptions}
        </select>
      </div>

      <div class="error-message" id="cut-error"></div>
      <div class="submit-row">
        <button type="button" class="btn-primary" id="btn-start-cutover">Open Cutover Bridge</button>
      </div>
    </div>
  `;

  const cutRunbookSelect = document.getElementById('cut-runbook');
  const cutComponentSelect = document.getElementById('cut-component');

  cutRunbookSelect.addEventListener('change', () => {
    const selectedRbkId = cutRunbookSelect.value;
    if (selectedRbkId) {
      const rb = approvedRunbooks.find(r => r.runbook_id === selectedRbkId);
      if (rb && rb.component_id) {
        cutComponentSelect.value = rb.component_id;
      }
    }
  });

  if (prefillRunbookId) {
    cutRunbookSelect.dispatchEvent(new Event('change'));
  }

  document.getElementById('btn-start-cutover').addEventListener('click', async () => {
    const component_id = document.getElementById('cut-component').value.trim();
    const runbook_id = document.getElementById('cut-runbook').value || null;
    const stakeholders = [];
    const errorBox = document.getElementById('cut-error');
    errorBox.style.display = 'none';

    if (!component_id) {
      errorBox.textContent = 'Component ID is required.';
      errorBox.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btn-start-cutover');
    btn.disabled = true;
    btn.innerHTML = `<span class="loader"><span class="spinner"></span> Opening bridge...</span>`;

    try {
      const runbook = approvedRunbooks.find(r => r.runbook_id === runbook_id);
      const demand_id = runbook ? runbook.demand_id : (component_id.split('-').slice(0, 2).join('-')); // fallback guess
      const res = await fetch(`${DEPLOY_API_BASE}/cutover/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_id, component_id, runbook_id, stakeholders })
      });
      if (!res.ok) throw new Error('Failed to start cutover.');
      const record = await res.json();
      selectedCutoverId = record.cutover_id;
      selectedDemandId = record.demand_id || 'Unknown Demand';
      await window.fetchBuildDeployData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Open Cutover Bridge';
    }
  });
}


function renderCutoverDetails(record) {
  const panel = document.getElementById('deploy-panel-container');
  const isOpen = record.status === 'in-progress' || record.status === 'scheduled';

  panel.innerHTML = `
    <div class="panel-card">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${record.cutover_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0;">${record.component_id}</h2>
        </div>
        <status-pill status="${record.status}"></status-pill>
      </div>

      <div class="data-item" style="margin-bottom: 1rem;">
        <div class="data-label">Stakeholders</div>
        <div class="data-value">${record.stakeholders.length ? record.stakeholders.join(', ') : 'None listed'}</div>
      </div>

      ${record.steps.length ? `
        <div class="data-label" style="margin-bottom: 0.5rem;">Live Step Tracker</div>
        <ul class="step-track">
          ${record.steps.map(s => `
            <li class="step-row">
              <span class="step-dot ${s.status}"></span>
              <div style="flex: 1;">
                <div class="step-desc">${s.description}</div>
                <div class="step-meta">${s.status}${s.notes ? ' · ' + s.notes : ''}</div>
              </div>
              ${isOpen ? `
                <div class="step-actions">
                  <button data-step="${s.step_id}" data-status="in-progress">Start</button>
                  <button data-step="${s.step_id}" data-status="done">Done</button>
                  <button data-step="${s.step_id}" data-status="blocked">Block</button>
                </div>
              ` : ''}
            </li>
          `).join('')}
        </ul>
      ` : '<div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">No runbook steps linked — tracking manually via updates below.</div>'}

      <div class="data-label" style="margin-top: 1.25rem; margin-bottom: 0.25rem;">Stakeholder Comms Feed</div>
      <div class="comms-feed" id="comms-feed">
        ${record.updates.slice().reverse().map(u => `
          <div class="comms-entry">
            <div class="comms-meta">${u.author} · ${new Date(u.timestamp).toLocaleString()}</div>
            <div>${u.message}</div>
          </div>
        `).join('')}
      </div>

      ${isOpen ? `
        <div class="form-group" style="margin-top: 1rem;">
          <label for="cut-update-author">Post Update — Author</label>
          <input type="text" id="cut-update-author" placeholder="e.g. release-manager">
        </div>
        <div class="form-group">
          <label for="cut-update-message">Message</label>
          <textarea id="cut-update-message" placeholder="Status update for stakeholders..." style="min-height: 60px;"></textarea>
        </div>
        <div class="submit-row">
          <button type="button" class="btn-secondary" id="btn-post-update">Post Update</button>
          <button type="button" class="btn-secondary" id="btn-abort-cutover" style="color: var(--color-status-red-text); border-color: var(--color-status-red-text);">Abort</button>
          <button type="button" class="btn-primary" id="btn-complete-cutover">Mark Completed</button>
        </div>
      ` : ''}
    </div>
  `;

  panel.querySelectorAll('.step-actions button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stepId = btn.getAttribute('data-step');
      const status = btn.getAttribute('data-status');
      await fetch(`${DEPLOY_API_BASE}/cutover/${record.cutover_id}/step/${stepId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await window.fetchBuildDeployData();
    });
  });

  const postUpdateBtn = document.getElementById('btn-post-update');
  if (postUpdateBtn) {
    postUpdateBtn.addEventListener('click', async () => {
      const author = document.getElementById('cut-update-author').value.trim() || 'unknown';
      const message = document.getElementById('cut-update-message').value.trim();
      if (!message) return;
      await fetch(`${DEPLOY_API_BASE}/cutover/${record.cutover_id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, message })
      });
      await window.fetchBuildDeployData();
    });
  }

  const completeBtn = document.getElementById('btn-complete-cutover');
  if (completeBtn) {
    completeBtn.addEventListener('click', async () => {
      await fetch(`${DEPLOY_API_BASE}/cutover/${record.cutover_id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      if (record.deployment_id) {
        selectedDeploymentId = record.deployment_id;
        switchDeployTab('orchestration');
      } else {
        await window.fetchBuildDeployData();
      }
    });
  }

  const abortBtn = document.getElementById('btn-abort-cutover');
  if (abortBtn) {
    abortBtn.addEventListener('click', async () => {
      if (!confirm('Abort this cutover session?')) return;
      await fetch(`${DEPLOY_API_BASE}/cutover/${record.cutover_id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aborted' })
      });
      if (record.deployment_id) {
        selectedDeploymentId = record.deployment_id;
        switchDeployTab('orchestration');
      } else {
        await window.fetchBuildDeployData();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Deployment orchestration
// ---------------------------------------------------------------------------

function showNewDeploymentForm(prefillRunbookId) {
  const panel = document.getElementById('deploy-panel-container');
  const approvedRunbooks = runbooks.filter(r => r.status === 'approved');

  // Build component options from distinct component_ids in approved runbooks
  const componentIds = [...new Set(approvedRunbooks.map(r => r.component_id))].sort();
  const componentOptions = componentIds.map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');

  // Build runbook options — optionally pre-select one
  const runbookOptions = approvedRunbooks.map(r =>
    `<option value="${r.runbook_id}" data-component="${r.component_id}" ${r.runbook_id === prefillRunbookId ? 'selected' : ''}>${formatSimpleName(r.component_id)} - ${getEnvironment(r)}</option>`
  ).join('');

  // Derive initial component ID from prefilled runbook (if any)
  const prefillRunbook = prefillRunbookId ? approvedRunbooks.find(r => r.runbook_id === prefillRunbookId) : null;
  const prefillComponent = prefillRunbook ? prefillRunbook.component_id : '';

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0;">Start a Deployment</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Drives the deployment runbook across environments and teams; checks pre-conditions and holds go/no-go on production steps.
      </p>



      <div class="grid-2col">
        <div class="form-group">
          <label for="dep-runbook">Approved Runbook *</label>
          <select id="dep-runbook">
            <option value="">Select a runbook</option>
            ${runbookOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="dep-environment">Environment <span style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">(auto-filled from runbook)</span></label>
          <input type="text" id="dep-environment" readonly style="background:var(--bg-tertiary);cursor:not-allowed;" placeholder="e.g. prod">
        </div>
      </div>
      <input type="hidden" id="dep-component" value="">
      
      <div class="form-group" style="margin-top:1rem;">
        <label for="dep-version">Version to Deploy <span style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">(auto-filled from Stage 5 baseline, but editable)</span></label>
        <div style="display:flex; gap:0.2rem; align-items:stretch; width:100%;">
          <input type="text" id="dep-version" placeholder="e.g. 1.2.0" value="" style="flex:1;">
          <div style="display:flex; flex-direction:column; justify-content:center; gap:2px;">
            <button type="button" style="background:var(--bg-secondary); border:1px solid #6366f1; border-radius:3px; color:var(--text-primary); cursor:pointer; font-size:0.6rem; padding:2px 4px; line-height:1;" onclick="window.bumpDepVersion(1)">▲</button>
            <button type="button" style="background:var(--bg-secondary); border:1px solid #6366f1; border-radius:3px; color:var(--text-primary); cursor:pointer; font-size:0.6rem; padding:2px 4px; line-height:1;" onclick="window.bumpDepVersion(-1)">▼</button>
          </div>
        </div>
      </div>
      
      <div id="req-checklist-container" style="display:none; margin-top:1.5rem;">
        <span style="font-weight:700;font-size:0.75rem;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:0.5rem;letter-spacing:0.04em;">Upstream Release Requirements</span>
        <div id="req-checklist" style="background:var(--bg-tertiary); padding:0.8rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
           <!-- checkboxes will be injected here -->
        </div>
      </div>
      
      <div class="preconditions-list" style="margin-top:1.5rem; background:var(--bg-tertiary); border-radius:var(--radius-sm); padding:1rem; border:1px solid var(--border-color);">
        <span style="font-weight:700;font-size:0.75rem;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:0.5rem;letter-spacing:0.04em;">Automated Preconditions to be Checked</span>
        <ul style="margin:0;padding-left:1.2rem;font-size:0.75rem;color:var(--text-secondary);list-style-type:disc;line-height:1.6;">
          <li id="version-precondition"><strong>Version check:</strong> Target version matches Stage 5 environment baseline</li>
          <li id="req-precondition"><strong>Requirements check:</strong> <span class="req-status-text">All upstream release requirements are met</span></li>
          <li><strong>Runbook check:</strong> Runbook is SME approved &amp; contains a rollback trigger</li>
          <li><strong>Test execution:</strong> Pre-deployment test suites have passed</li>
          <li><strong>Rollback readiness:</strong> Target environment is in-sync and backups verified</li>
        </ul>
      </div>

      <div class="error-message" id="dep-error"></div>
      <div class="submit-row">
        <button type="button" class="btn-primary" id="btn-start-deployment">Start Deployment</button>
      </div>
    </div>
  `;

  window.currentRequirements = [];
  window.checkedRequirements = new Set();
  
  window.renderRequirementsChecklist = function() {
    const container = document.getElementById('req-checklist-container');
    const checklist = document.getElementById('req-checklist');
    const preconditionLi = document.getElementById('req-precondition');
    if (!container || !checklist || !preconditionLi) return;
    
    container.style.display = 'block';
    checklist.innerHTML = '';

    if (!window.currentRequirements || window.currentRequirements.length === 0) {
      checklist.innerHTML = '<div style="font-size:0.8rem; color:var(--text-secondary); font-style:italic;">No upstream requirements configured for this environment.</div>';
      preconditionLi.style.color = '#34d399';
      preconditionLi.innerHTML = `<strong>Requirements check:</strong> <span class="req-status-text">No upstream dependencies (Satisfied)</span>`;
      return;
    }
    
    window.currentRequirements.forEach(req => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '0.5rem';
      label.style.fontSize = '0.82rem';
      label.style.marginBottom = '0.4rem';
      label.style.cursor = 'pointer';
      label.style.color = 'var(--text-primary)';
      
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.style.accentColor = '#6366f1';
      cb.checked = window.checkedRequirements.has(req);
      cb.onchange = (e) => {
        if (e.target.checked) window.checkedRequirements.add(req);
        else window.checkedRequirements.delete(req);
        window.updatePreconditionStatus();
      };
      
      label.appendChild(cb);
      label.appendChild(document.createTextNode(req));
      checklist.appendChild(label);
    });
    
    window.updatePreconditionStatus();
  };
  
  window.updatePreconditionStatus = function() {
    const preconditionLi = document.getElementById('req-precondition');
    if (!preconditionLi || !window.currentRequirements || window.currentRequirements.length === 0) return;
    
    const allChecked = window.currentRequirements.length === window.checkedRequirements.size;
    if (allChecked) {
      preconditionLi.style.color = '#34d399';
      preconditionLi.innerHTML = `<strong>Requirements check:</strong> <span class="req-status-text">All ${window.currentRequirements.length} upstream requirements verified! ✓</span>`;
    } else {
      preconditionLi.style.color = 'var(--text-secondary)';
      preconditionLi.innerHTML = `<strong>Requirements check:</strong> <span class="req-status-text">Pending verification (${window.checkedRequirements.size}/${window.currentRequirements.length})</span>`;
    }
  };

  const runbookSelect = document.getElementById('dep-runbook');
  const envInput = document.getElementById('dep-environment');
  const verInput = document.getElementById('dep-version');

  window.baseExpectedVersion = '1.0.0';

  window.updateVersionStatus = function() {
    const preconditionLi = document.getElementById('version-precondition');
    if (!preconditionLi || !verInput) return;
    const currentVal = verInput.value.trim();
    if (currentVal === window.baseExpectedVersion) {
      preconditionLi.style.color = 'var(--text-secondary)';
      preconditionLi.innerHTML = `<strong>Version check:</strong> <span class="ver-status-text">Target version matches Stage 5 environment baseline</span>`;
    } else {
      preconditionLi.style.color = '#ef4444';
      preconditionLi.innerHTML = `<strong>Version check:</strong> <span class="ver-status-text" style="font-weight:600;">Drift detected!</span> (Baseline expects ${window.baseExpectedVersion}, but deploying ${currentVal})`;
    }
  };

  if (verInput) verInput.addEventListener('input', window.updateVersionStatus);

  window.bumpDepVersion = function(dir) {
    const val = verInput.value.trim() || '1.0.0';
    const match = val.match(/(.*?)(\d+)$/);
    if (match) {
      let newNum = parseInt(match[2], 10) + dir;
      if (newNum < 0) newNum = 0;
      verInput.value = match[1] + newNum;
    } else {
      verInput.value = val + (dir > 0 ? '.1' : '.0');
    }
    if (window.updateVersionStatus) window.updateVersionStatus();
  };

  async function updateFromRunbook() {
    const runbookId = runbookSelect.value;
    const compSelect = document.getElementById('dep-component');

    if (!runbookId) {
      compSelect.value = '';
      envInput.value = '';
      verInput.value = '';
      return;
    }

    const runbook = approvedRunbooks.find(r => r.runbook_id === runbookId);
    if (!runbook) return;

    // Auto-fill component
    const compId = runbook.component_id;
    document.getElementById('dep-component').value = compId || '';

    // Auto-fill environment based on runbook steps (highest priority: prod > staging > test > dev)
    const envOrder = ['dev', 'test', 'staging', 'prod'];
    let targetEnv = 'dev';
    for (const step of (runbook.steps || [])) {
      if (envOrder.indexOf(step.environment) > envOrder.indexOf(targetEnv)) {
        targetEnv = step.environment;
      }
    }
    envInput.value = targetEnv;

    // Auto-fill version from Stage 5 by fetching it live
    try {
      let baseVersion = '1.0.0';
      window.currentRequirements = [];
      if (window.checkedRequirements) window.checkedRequirements.clear();
      
      const res = await fetch('/api/environments');
      if (res.ok) {
        const allEnvs = await res.json();
        const rec = allEnvs.find(r => r.environment === targetEnv && (r.cmdb_name === compId || r.observed_name === compId || r.demand_id === runbook.demand_id));
        if (rec) {
          if (rec.expected_version) {
            baseVersion = rec.expected_version;
            window.baseExpectedVersion = rec.expected_version;
          }
          if (rec.expected_requirements) window.currentRequirements = rec.expected_requirements;
        }
      }
      if (window.renderRequirementsChecklist) window.renderRequirementsChecklist();
      
      // Check if we have deployed this before to auto-increment
      const pastDeps = deployments.filter(d => d.component_id === compId);
      if (pastDeps.length > 0) {
        let lastVer = pastDeps[pastDeps.length - 1].version || baseVersion;
        const match = lastVer.match(/(.*?)(\d+)$/);
        if (match) {
          baseVersion = match[1] + (parseInt(match[2], 10) + 1);
        } else {
          baseVersion = lastVer + '.1';
        }
      }
      
      verInput.value = baseVersion;
      if (window.updateVersionStatus) window.updateVersionStatus();
      return;
    } catch (err) {
      console.warn("Failed to fetch environment state for version fallback", err);
    }
    verInput.value = '1.0.0'; // Fallback
  }

  runbookSelect.addEventListener('change', updateFromRunbook);

  // Set initial component ID if we have a prefill
  if (prefillComponent) {
    document.getElementById('dep-component').value = prefillComponent;
    updateFromRunbook();
  }

  document.getElementById('btn-start-deployment').addEventListener('click', async () => {
    const component_id = document.getElementById('dep-component').value.trim();
    const version = document.getElementById('dep-version').value.trim();
    const runbook_id = document.getElementById('dep-runbook').value;
    const environment = document.getElementById('dep-environment').value;
    const errorBox = document.getElementById('dep-error');
    errorBox.style.display = 'none';

    if (!component_id || !runbook_id || !version) {
      errorBox.textContent = 'Component ID, Version, and an approved Runbook are required.';
      errorBox.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btn-start-deployment');
    btn.disabled = true;
    btn.innerHTML = `<span class="loader"><span class="spinner"></span> Starting...</span>`;

    try {
      const runbook = approvedRunbooks.find(r => r.runbook_id === runbook_id);
      const demand_id = runbook ? runbook.demand_id : null;
      const res = await fetch(`${DEPLOY_API_BASE}/orchestration/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_id, component_id, version, runbook_id, environment })
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.detail || 'Failed to start deployment.'); }
      const record = await res.json();
      selectedDeploymentId = record.deployment_id;
      selectedDemandId = record.demand_id || 'Unknown Demand';
      await window.fetchBuildDeployData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Start Deployment';
    }
  });
}



function renderDeploymentDetails(record) {
  const panel = document.getElementById('deploy-panel-container');
  const hasPreconditions = record.preconditions.length > 0;
  const allPassed = hasPreconditions && record.preconditions.every(p => p.passed);
  const linkedCutover = record.cutover_id ? cutoverSessions.find(c => c.cutover_id === record.cutover_id) : null;

  panel.innerHTML = `
    <div class="panel-card">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${record.deployment_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0;">${record.component_id}</h2>
        </div>
        <status-pill status="${record.status}"></status-pill>
      </div>

      <div class="grid-2col">
        <div class="data-item"><div class="data-label">Environment</div><div class="data-value">${record.environment}</div></div>
        <div class="data-item"><div class="data-label">Runbook</div><div class="data-value">${record.runbook_id || 'N/A'}</div></div>
      </div>
      <div class="data-item" style="margin-bottom: 1rem;">
        <div class="data-label">Version Deployed</div>
        <div class="data-value" style="font-family: monospace; font-size: 1rem;">${record.version || 'unknown'}</div>
      </div>
      ${record.decided_by ? `<div class="data-item" style="margin-bottom: 1rem;"><div class="data-label">Decided By</div><div class="data-value">${record.decided_by}</div></div>` : ''}

      ${hasPreconditions ? `
        <div class="data-label" style="margin-bottom: 0.5rem;">Preconditions</div>
        ${record.preconditions.map(p => `
          <div class="precondition-row">
            <span class="precondition-icon ${p.passed ? 'pass' : 'fail'}">${p.passed ? '✓' : '✗'}</span>
            <div class="precondition-body">
              <div class="precondition-name">${p.name.replace(/-/g, ' ')}</div>
              <div class="precondition-detail">${p.detail}</div>
            </div>
          </div>
        `).join('')}
      ` : `<div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Preconditions not checked yet.</div>`}

      ${linkedCutover ? `
        <div class="data-item" style="margin-top: 1rem;">
          <div class="data-label">Linked Cutover Session</div>
          <div class="data-value">${linkedCutover.cutover_id} <status-pill status="${linkedCutover.status}"></status-pill></div>
        </div>
      ` : ''}

      <div class="error-message" id="orch-error"></div>

      <div class="submit-row" style="margin-top: 1.5rem; flex-wrap: wrap;">
        ${record.status === 'planned' || record.status === 'checking' ? `<button type="button" class="btn-secondary" id="btn-check-preconditions">Check Preconditions</button>` : ''}
        ${hasPreconditions && (record.status === 'checking' || record.status === 'no-go') ? `
          <input type="text" id="orch-decided-by" placeholder="Decided by (e.g. release-manager)" style="max-width: 220px;">
          <input type="text" id="orch-stakeholders" placeholder="Stakeholders (comma separated)" style="max-width: 260px;">
          <button type="button" class="btn-secondary" id="btn-no-go">No-Go</button>
          <button type="button" class="btn-primary" id="btn-go" ${allPassed ? '' : 'disabled title="Resolve failing preconditions first"'}>Go</button>
        ` : ''}
        ${record.cutover_id ? `<button type="button" class="btn-secondary" id="btn-view-cutover">View Cutover Bridge</button>` : ''}
        ${record.cutover_id && record.status === 'in-progress' ? `<button type="button" class="btn-primary" id="btn-complete-deployment">Mark Deployment Done</button>` : ''}
        ${record.status === 'done' ? `<button type="button" class="btn-primary" id="btn-next-stage">Proceed to Test &amp; Quality →</button>` : ''}
      </div>
    </div>
  `;

  const checkBtn = document.getElementById('btn-check-preconditions');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      checkBtn.innerHTML = `<span class="loader"><span class="spinner"></span> Checking...</span>`;
      await fetch(`${DEPLOY_API_BASE}/orchestration/${record.deployment_id}/check-preconditions`, { method: 'POST' });
      await window.fetchBuildDeployData();
    });
  }

  const goBtn = document.getElementById('btn-go');
  const noGoBtn = document.getElementById('btn-no-go');
  const errorBox = document.getElementById('orch-error');

  async function submitDecision(decision) {
    const decided_by = document.getElementById('orch-decided-by').value.trim() || 'release-manager';
    const stakeholders = document.getElementById('orch-stakeholders').value.split(',').map(s => s.trim()).filter(Boolean);
    errorBox.style.display = 'none';
    try {
      const res = await fetch(`${DEPLOY_API_BASE}/orchestration/${record.deployment_id}/go-no-go`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decided_by, stakeholders })
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.detail || 'Decision failed.'); }
      if (decision === 'go') {
        switchDeployTab('cutover');
      } else {
        await window.fetchBuildDeployData();
      }
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    }
  }

  if (goBtn) goBtn.addEventListener('click', () => submitDecision('go'));
  if (noGoBtn) noGoBtn.addEventListener('click', () => submitDecision('no-go'));

  const viewCutoverBtn = document.getElementById('btn-view-cutover');
  if (viewCutoverBtn) {
    viewCutoverBtn.addEventListener('click', () => {
      selectedCutoverId = record.cutover_id;
      switchDeployTab('cutover');
    });
  }

  const completeDeploymentBtn = document.getElementById('btn-complete-deployment');
  if (completeDeploymentBtn) {
    completeDeploymentBtn.addEventListener('click', async () => {
      errorBox.style.display = 'none';
      try {
        const res = await fetch(`${DEPLOY_API_BASE}/orchestration/${record.deployment_id}/complete`, { method: 'POST' });
        if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.detail || 'Could not mark deployment done.'); }
        await window.fetchBuildDeployData();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
      }
    });
  }

  const nextStageBtn = document.getElementById('btn-next-stage');
  if (nextStageBtn) {
    nextStageBtn.addEventListener('click', () => {
      if (window.switchStage) {
        window.switchStage('test-quality');
      } else {
        window.location.hash = 'test-quality';
      }
    });
  }
}


function renderDeployContent() {
  const panel = document.getElementById('deploy-panel-container');
  if (!panel) return;

  if (!selectedDemandId) {
    panel.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">Select a Demand from the left sidebar or create a new record.</div>`;
    return;
  }

  const items = activeDeployTab === 'runbooks' ? runbooks : activeDeployTab === 'cutover' ? cutoverSessions : deployments;
  const idField = activeDeployTab === 'runbooks' ? 'runbook_id' : activeDeployTab === 'cutover' ? 'cutover_id' : 'deployment_id';
  const demandItems = items.filter(i => (i.demand_id || 'Unknown') === selectedDemandId);

  if (demandItems.length === 0) {
    panel.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">No records found for this demand.</div>`;
    return;
  }

  const currentSelectedId = activeDeployTab === 'runbooks' ? selectedRunbookId : activeDeployTab === 'cutover' ? selectedCutoverId : selectedDeploymentId;
  let activeItem = demandItems.find(i => i[idField] === currentSelectedId);
  if (!activeItem) {
    activeItem = demandItems[0];
    if (activeDeployTab === 'runbooks') selectedRunbookId = activeItem.runbook_id;
    else if (activeDeployTab === 'cutover') selectedCutoverId = activeItem.cutover_id;
    else selectedDeploymentId = activeItem.deployment_id;
  }

  const typeLabel = activeDeployTab === 'runbooks' ? 'Runbook' : activeDeployTab === 'cutover' ? 'Cutover' : 'Deployment';

  // Render the header bar + inner container directly into the panel
  panel.innerHTML = `
    <div style="background:var(--bg-tertiary); padding:1rem; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:1rem;">
      <label for="demand-component-select" style="font-weight:600;font-size:0.9rem;">Select ${typeLabel}:</label>
      <select id="demand-component-select" style="flex:1;max-width:400px;padding:0.4rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);">
        ${demandItems.map(i => {
          const cName = formatSimpleName(i.component_id);
          const env = getEnvironment(i);
          const label = `${cName} - ${env}`;
          return `<option value="${i[idField]}" ${i[idField] === activeItem[idField] ? 'selected' : ''}>${label}</option>`;
        }).join('')}
      </select>
      <button id="btn-delete-active-item" class="btn-secondary" style="color:var(--color-status-red-text); border-color:var(--color-status-red-text);">Delete Active ${typeLabel}</button>
    </div>
    <div id="deploy-content-inner" style="flex:1; overflow-y:auto; padding-top:1rem;"></div>
  `;

  document.getElementById('demand-component-select').addEventListener('change', (e) => {
    const newId = e.target.value;
    if (activeDeployTab === 'runbooks') selectedRunbookId = newId;
    else if (activeDeployTab === 'cutover') selectedCutoverId = newId;
    else selectedDeploymentId = newId;
    renderDeployContent();
  });

  document.getElementById('btn-delete-active-item').addEventListener('click', async () => {
    if (!confirm(`Delete this ${typeLabel}?`)) return;
    try {
      const apiPath = activeDeployTab === 'runbooks' ? 'runbooks' : activeDeployTab === 'cutover' ? 'cutover' : 'orchestration';
      const res = await fetch(`${DEPLOY_API_BASE}/${apiPath}/${encodeURIComponent(activeItem[idField])}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');

      if (activeDeployTab === 'runbooks') selectedRunbookId = null;
      else if (activeDeployTab === 'cutover') selectedCutoverId = null;
      else selectedDeploymentId = null;

      await window.fetchBuildDeployData();
    } catch (err) {
      alert(err.message);
    }
  });

  // Render the detail view into the inner container
  // We pass the inner element directly — no monkey-patching needed
  const innerEl = document.getElementById('deploy-content-inner');
  const fakePanel = { get innerHTML() { return innerEl.innerHTML; }, set innerHTML(v) { innerEl.innerHTML = v; } };

  // Temporarily expose fakePanel under 'deploy-panel-container' id via a data attr trick
  innerEl.id = 'deploy-panel-container';
  panel.removeAttribute('id'); // Detach real panel id temporarily

  try {
    if (activeDeployTab === 'runbooks') renderRunbookDetails(activeItem);
    else if (activeDeployTab === 'cutover') renderCutoverDetails(activeItem);
    else renderDeploymentDetails(activeItem);
  } finally {
    // Restore ids
    panel.id = 'deploy-panel-container';
    innerEl.id = 'deploy-content-inner';
  }
}
