const OPS_API_BASE = 'http://127.0.0.1:8000/api/ops-readiness';
const DEMAND_API_BASE = 'http://127.0.0.1:8000/api/demands';
const TQ_API_BASE = 'http://127.0.0.1:8000/api/test-quality';
const DEPLOY_API_BASE = 'http://127.0.0.1:8000/api/deployments';

let opsDemands = [];
let opsSelectedDemandId = null;
let opsActiveTab = 'validation'; // 'monitoring' | 'handover' | 'validation'

// In-memory data states
let opsRecord = null;
let opsAllRunbooks = [];
let opsAllDefects = [];
let opsEnvironments = [];
let opsPlan = null;
let opsReleaseLogs = [];

window.renderOpsReadinessScreen = function () {
  const viewport = document.getElementById('viewport');

  // Inject CSS Styles
  if (!document.getElementById('ops-readiness-styles')) {
    const style = document.createElement('style');
    style.id = 'ops-readiness-styles';
    style.textContent = `
      .ops-tab-header {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.75rem;
        margin-bottom: 1.25rem;
      }
      .ops-tab-btn {
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
      .ops-tab-btn:hover {
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
      }
      .ops-tab-btn.active {
        background: rgba(99, 102, 241, 0.1);
        color: var(--color-brand);
        border-color: rgba(99, 102, 241, 0.3);
      }
      .ops-tab-content {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding-right: 0.25rem;
      }
      .ops-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 1.25rem;
        margin-bottom: 1rem;
      }
      .ops-card-title {
        font-family: var(--font-display);
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-top: 0;
        margin-bottom: 1rem;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.5rem;
      }
      .ops-pill {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
      }
      .ops-pill.pass { background: rgba(16, 185, 129, 0.1); color: var(--color-status-green-text); }
      .ops-pill.warn { background: rgba(245, 158, 11, 0.1); color: var(--color-status-amber-text); }
      .ops-pill.fail { background: rgba(239, 68, 68, 0.1); color: var(--color-status-red-text); }
      .ops-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
      }
      .ops-form-group {
        margin-bottom: 1rem;
      }
      .ops-form-group label {
        display: block;
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-bottom: 0.35rem;
        font-weight: 600;
      }
      .ops-form-group input, .ops-form-group select, .ops-form-group textarea {
        width: 100%;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        padding: 0.5rem;
        font-size: 0.85rem;
      }
      .ops-btn {
        background: var(--color-brand);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: var(--radius-sm);
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      .ops-btn:hover {
        background: #4f46e5;
      }
      .ops-btn-secondary {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 0.5rem 1rem;
        border-radius: var(--radius-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .ops-btn-secondary:hover {
        color: var(--text-primary);
        border-color: var(--text-secondary);
      }
      .ops-check-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.01);
        margin-bottom: 0.5rem;
      }
    `;
    document.head.appendChild(style);
  }

  viewport.innerHTML = `
    <div class="intake-screen">
      <!-- Left Sidebar: Demands Queue -->
      <aside class="sidebar" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 100%; overflow: hidden; width: 300px;">
        <div class="panel-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <h3 class="sidebar-title" style="margin: 0; font-size: 0.85rem;">Demands Queue</h3>
            <button class="btn-new" id="ops-refresh-btn" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">↻ Refresh</button>
          </div>
          <ul class="demand-list" id="ops-demand-list-container" style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem;">
            <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 1rem;">
              Loading demands...
            </li>
          </ul>
        </div>
      </aside>

      <!-- Right Panel: Tabs and details view -->
      <main class="details-panel" id="ops-panel-container" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <!-- Tabs -->
        <div class="ops-tab-header">
          <button class="ops-tab-btn ${opsActiveTab === 'validation' ? 'active' : ''}" id="ops-tab-validation">09-A: Readiness Validation</button>
          <button class="ops-tab-btn ${opsActiveTab === 'handover' ? 'active' : ''}" id="ops-tab-handover">09-B: Handover & KT</button>
          <button class="ops-tab-btn ${opsActiveTab === 'monitoring' ? 'active' : ''}" id="ops-tab-monitoring">09-C: Monitoring Setup</button>
        </div>
        <div class="ops-tab-content" id="ops-content-container">
          <!-- Content loaded dynamically -->
        </div>
      </main>
    </div>
  `;

  document.getElementById('ops-refresh-btn').addEventListener('click', () => window.fetchOpsReadinessData());
  document.getElementById('ops-tab-monitoring').addEventListener('click', () => switchOpsTab('monitoring'));
  document.getElementById('ops-tab-handover').addEventListener('click', () => switchOpsTab('handover'));
  document.getElementById('ops-tab-validation').addEventListener('click', () => switchOpsTab('validation'));
};

function switchOpsTab(tab) {
  opsActiveTab = tab;
  document.querySelectorAll('.ops-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`ops-tab-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderOpsActiveTab();
}

window.fetchOpsReadinessData = async function () {
  const container = document.getElementById('ops-demand-list-container');
  try {
    const [dRes, rbRes, tqRes, defectsRes] = await Promise.all([
      fetch(DEMAND_API_BASE),
      fetch(`${DEPLOY_API_BASE}/runbooks`),
      fetch(`${TQ_API_BASE}/defect-triage`),
      fetch(`${TQ_API_BASE}/defects`).catch(() => null)
    ]);

    if (!dRes.ok) throw new Error('Failed to fetch demands');
    const allDemands = await dRes.json();
    opsDemands = allDemands.filter(d => d.status === 'approved' || d.status === 'classified' || d.status === 'capacity-checked');
    opsAllRunbooks = rbRes.ok ? await rbRes.json() : [];
    
    // Process defects
    opsAllDefects = [];
    if (defectsRes && defectsRes.ok) {
      opsAllDefects = await defectsRes.json();
    }
    if (tqRes && tqRes.ok) {
      const triages = await tqRes.json();
      triages.forEach(t => {
        (t.triaged_defects || []).forEach(d => {
          d.demand_id = t.demand_id;
          if (!opsAllDefects.some(existing => (existing.defect_id || existing.id) === (d.defect_id || d.id))) {
            opsAllDefects.push(d);
          }
        });
      });
    }

    renderOpsDemandList();

    if (opsDemands.length > 0) {
      const activeDemandId = sessionStorage.getItem('selectedDemandId');
      if (activeDemandId && opsDemands.some(d => d.demand_id === activeDemandId)) {
        opsSelectedDemandId = activeDemandId;
      } else if (!opsSelectedDemandId || !opsDemands.some(d => d.demand_id === opsSelectedDemandId)) {
        opsSelectedDemandId = opsDemands[0].demand_id;
      }
      selectOpsDemand(opsSelectedDemandId);
    } else {
      document.getElementById('ops-content-container').innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          No approved demands in queue. Complete Stage 01 approval to route them here.
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to fetch ops readiness data:', err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
      </li>
    `;
  }
};

function renderOpsDemandList() {
  const container = document.getElementById('ops-demand-list-container');
  if (opsDemands.length === 0) {
    container.innerHTML = `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No demands available.</li>`;
    return;
  }

  container.innerHTML = opsDemands.map(d => {
    const isSelected = d.demand_id === opsSelectedDemandId;
    return `
      <li class="demand-item ${isSelected ? 'active' : ''}" data-id="${d.demand_id}" style="cursor: pointer; padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); margin-bottom: 0.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
          <span style="font-family: monospace; font-size: 0.75rem; color: var(--text-secondary); font-weight: bold;">${d.demand_id}</span>
          <span class="ops-pill pass" style="font-size:0.6rem; padding: 0.1rem 0.3rem;">Approved</span>
        </div>
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${d.title}</div>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.demand-item').forEach(el => {
    el.addEventListener('click', () => {
      const demand_id = el.getAttribute('data-id');
      selectOpsDemand(demand_id);
    });
  });
}

async function selectOpsDemand(demand_id) {
  opsSelectedDemandId = demand_id;
  
  // Highlight in sidebar
  document.querySelectorAll('#ops-demand-list-container .demand-item').forEach(el => {
    if (el.getAttribute('data-id') === demand_id) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const content = document.getElementById('ops-content-container');
  content.innerHTML = `<div style="padding: 2rem; text-align: center;"><span class="spinner"></span> Loading ops readiness state...</div>`;

  try {
    const res = await fetch(`${OPS_API_BASE}/records/${demand_id}`);
    if (res.ok) {
      opsRecord = await res.json();
    } else {
      opsRecord = { demand_id, monitoring: null, handover: null, validation: null };
    }

    // Fetch environments for this demand
    try {
      const envRes = await fetch(`http://127.0.0.1:8000/api/environments/${demand_id}`);
      opsEnvironments = envRes.ok ? await envRes.json() : [];
    } catch (e) {
      console.warn("Failed to fetch environments for demand", e);
      opsEnvironments = [];
    }

    // Fetch plans to extract plan details and task owners
    try {
      const planRes = await fetch(`http://127.0.0.1:8000/api/plans`);
      if (planRes.ok) {
        const allPlans = await planRes.json();
        opsPlan = allPlans.find(p => p.demand_id === demand_id) || null;
      } else {
        opsPlan = null;
      }
    } catch (e) {
      console.warn("Failed to fetch plans", e);
      opsPlan = null;
    }

    // Fetch release details to get audit logs
    const suffix = demand_id.split('-').pop() || '0068';
    try {
      const releaseRes = await fetch(`http://127.0.0.1:8000/api/release-change/releases/REL-${suffix}-1`);
      if (releaseRes.ok) {
        const releasePayload = await releaseRes.json();
        opsReleaseLogs = releasePayload.audit_logs || [];
      } else {
        opsReleaseLogs = [];
      }
    } catch (e) {
      console.warn("Failed to fetch release details for logs", e);
      opsReleaseLogs = [];
    }

    renderOpsActiveTab();
  } catch (err) {
    console.error('Error fetching ops record:', err);
    content.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-status-red-text);">Error loading state.</div>`;
  }
}

function renderOpsActiveTab() {
  if (opsActiveTab === 'monitoring') renderMonitoringSetup();
  else if (opsActiveTab === 'handover') renderHandoverKT();
  else if (opsActiveTab === 'validation') renderReadinessValidation();
}

// ----------------------------------------------------
// 09-C: Monitoring Setup Tab View
// ----------------------------------------------------
function renderMonitoringSetup() {
  const content = document.getElementById('ops-content-container');
  const mon = opsRecord ? opsRecord.monitoring : null;

  // Derive components from environments
  let derivedComponents = [];
  let derivedEnv = 'prod';
  if (opsEnvironments && opsEnvironments.length > 0) {
    const prodEnv = opsEnvironments.find(e => e.environment === 'prod') || opsEnvironments[0];
    if (prodEnv) {
      derivedEnv = prodEnv.environment;
      let svcName = prodEnv.cmdb_name || '';
      svcName = svcName.replace(/-prod-svr-\d+/, '')
                       .replace(/-staging-svr-\d+/, '')
                       .replace(/-test-svr-\d+/, '')
                       .replace(/-dev-svr-\d+/, '')
                       .replace(/-prod/, '')
                       .replace(/-staging/, '')
                       .replace(/-test/, '')
                       .replace(/-dev/, '');
      if (svcName) {
        derivedComponents.push(svcName);
      }
      if (prodEnv.expected_requirements && Array.isArray(prodEnv.expected_requirements)) {
        prodEnv.expected_requirements.forEach(req => {
          let cleanReq = req.toLowerCase()
                            .replace(/[^a-z0-9-_]/g, '-')
                            .replace(/-+/g, '-');
          if (cleanReq && !derivedComponents.includes(cleanReq)) {
            derivedComponents.push(cleanReq);
          }
        });
      }
    }
  }
  if (derivedComponents.length === 0) {
    derivedComponents = ['svc-payments-api', 'svc-auth'];
  }
  const defaultComponents = derivedComponents.join(', ');
  const suffix = opsSelectedDemandId ? opsSelectedDemandId.split('-').pop() : '0068';

  let headerHtml = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div>
        <h3 style="margin:0; font-family: var(--font-display); font-size:1.25rem;">09-C: AI-Driven Production Monitoring Setup Agent</h3>
        ${mon ? `
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">
            Monitoring Plan: <strong>${mon.monitoring_plan_id || 'MON-' + suffix}</strong> | Release: <strong>${mon.release_id || 'REL-' + suffix + '-1'}</strong>
          </div>
        ` : ''}
      </div>
      <div>
        ${mon ? `
          <span class="ops-pill ${mon.sre_reviewed ? 'pass' : 'warn'}">
            ${mon.sre_reviewed ? 'SRE Approved' : 'Pending SRE Approval'}
          </span>
        ` : `<span class="ops-pill fail">Not Configured</span>`}
      </div>
    </div>
  `;

  let formHtml = `
    <div class="ops-card">
      <div class="ops-card-title">Configure Dynamic AI Monitoring Policy & Scope</div>
      <div class="ops-grid">
        <div class="ops-form-group">
          <label for="mon-components">Components to Monitor (CMDB & SDLC Scope)</label>
          <input type="text" id="mon-components" value="${defaultComponents}" placeholder="Auto-detected from Stage 03/05">
        </div>
        <div class="ops-form-group">
          <label for="mon-env">Target Environment</label>
          <input type="text" id="mon-env" value="${derivedEnv}" placeholder="prod">
        </div>
      </div>
      <div class="ops-grid">
        <div class="ops-form-group">
          <label for="mon-availability">Target Availability SLO (%) [Optional Override]</label>
          <input type="number" id="mon-availability" step="0.01" placeholder="Auto-generated by AI Agent (e.g. 99.99%)">
        </div>
        <div class="ops-form-group">
          <label for="mon-latency">Target p99 Latency SLO (ms) [Optional Override]</label>
          <input type="number" id="mon-latency" placeholder="Auto-generated from Stage 07 baselines">
        </div>
      </div>
      <button class="ops-btn" id="ops-gen-mon-btn">Generate Monitoring Plan via AI Agent</button>
    </div>
  `;

  let resultsHtml = '';
  if (mon) {
    const scopePills = (mon.monitored_components_scope || mon.component_ids || []).map(c => `
      <span class="ops-pill info" style="font-size:0.65rem; padding:2px 6px; background: rgba(0, 150, 255, 0.1); color: #0096ff; border: 1px solid rgba(0, 150, 255, 0.2); text-transform:none;">${c}</span>
    `).join(' ');

    const sloList = (mon.slo_targets || []).map(s => {
      const spec = (mon.component_specs || []).find(cs => cs.component_id === s.component_id);
      const tech = spec ? spec.technology_stack : 'Service';
      const crit = spec ? spec.criticality : 'standard';
      return `
        <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.6rem; margin-bottom: 0.4rem; font-size: 0.78rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <strong style="color: var(--text-primary); font-size: 0.82rem;"><code>${s.component_id}</code></strong>
            <span class="ops-pill ${crit === 'critical' ? 'fail' : (crit === 'high' ? 'warn' : 'pass')}" style="font-size:0.6rem; padding:1px 5px;">${crit.toUpperCase()}</span>
          </div>
          <div style="color: var(--text-secondary); font-size: 0.72rem; margin-bottom: 0.3rem;">
            Tech Stack: <em>${tech}</em> | Source: <code style="color: var(--color-brand);">${s.source || 'ai_analysis'}</code>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem; text-align: center; font-size: 0.7rem; color: var(--text-muted);">
            <div style="background: rgba(255,255,255,0.03); padding: 0.25rem; border-radius: 3px;">Avail SLO<br><strong style="color: #10b981;">${s.availability_slo_pct}%</strong></div>
            <div style="background: rgba(255,255,255,0.03); padding: 0.25rem; border-radius: 3px;">p99 Latency<br><strong style="color: #6366f1;">${s.latency_p99_ms}ms</strong></div>
            <div style="background: rgba(255,255,255,0.03); padding: 0.25rem; border-radius: 3px;">Error Max<br><strong style="color: #f59e0b;">${s.error_rate_threshold_pct}%</strong></div>
            <div style="background: rgba(255,255,255,0.03); padding: 0.25rem; border-radius: 3px;">CPU/Mem Max<br><strong style="color: #ec4899;">${s.cpu_threshold_pct}% / ${s.memory_threshold_pct}%</strong></div>
          </div>
        </div>
      `;
    }).join('');

    const alertsList = (mon.proposed_alerts || []).map(a => {
      let icon = '⚡';
      const cLower = (a.component_type || a.component_id || '').toLowerCase();
      if (cLower.includes('db') || cLower.includes('mongo') || cLower.includes('database') || cLower.includes('postgres')) icon = '💾';
      else if (cLower.includes('kafka') || cLower.includes('queue')) icon = '📩';
      else if (cLower.includes('redis') || cLower.includes('cache')) icon = '🔑';
      
      return `
        <div class="ops-check-item" style="flex-direction: column; align-items: flex-start; gap: 0.25rem; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background: rgba(0,0,0,0.15); margin-bottom: 0.5rem;">
          <div style="display: flex; width:100%; justify-content: space-between; align-items: center;">
            <strong style="color: #818cf8; font-size:0.85rem;">${icon} ${a.name} (<code>${a.alert_id}</code>)</strong>
            <span class="ops-pill ${a.severity === 'critical' ? 'fail' : 'warn'}" style="font-size:0.6rem; padding:1px 5px;">${a.severity}</span>
          </div>
          <div style="font-size:0.78rem; color: var(--text-primary); margin-top:0.25rem;">
            <strong>Target Component:</strong> <code>${a.component_id}</code>
          </div>
          <div style="font-size:0.78rem; color: var(--text-secondary); margin-top:0.15rem;">
            <strong>Condition:</strong> <code style="color:var(--color-status-amber-text);">${a.condition}</code>
          </div>
          <div style="font-size:0.72rem; color: var(--text-muted); margin-top:0.15rem;">
            <strong>Notification Group:</strong> ${(a.notify || []).join(', ')}
          </div>
        </div>
      `;
    }).join('');

    const dashboardList = (mon.proposed_dashboards || []).map(d => `
      <div class="ops-check-item" style="flex-direction: column; align-items: flex-start; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background: rgba(0,0,0,0.15);">
        <strong style="color: var(--text-primary); font-size:0.85rem;">📊 ${d.title} (<code>${d.dashboard_id}</code>)</strong>
        <div style="font-size:0.75rem; color:var(--text-muted);">Detected Technologies: <code style="color: var(--color-brand);">${d.target_technology || 'multi-tech'}</code></div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Active Metrics Panels:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
          ${(d.panels || []).map(p => `<span style="background: rgba(255,255,255,0.05); padding: 0.15rem 0.45rem; border-radius: 4px; font-size:0.68rem; color: var(--text-secondary); border: 1px solid var(--border-color);">${p}</span>`).join('')}
        </div>
        ${d.widgets && d.widgets.length > 0 ? `
          <div style="margin-top: 0.4rem; width: 100%; border-top: 1px dashed var(--border-color); padding-top: 0.4rem;">
            <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom: 0.3rem;">Technology-Filtered Widget Specifications:</div>
            ${d.widgets.map(w => `
              <div style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:0.2rem; background: rgba(0,0,0,0.2); padding:0.3rem; border-radius:3px;">
                <strong>${w.title}</strong> (${w.type}): <code style="color:var(--color-brand); font-size:0.68rem;">${w.query}</code>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    resultsHtml = `
      <div class="ops-card">
        <div class="ops-card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Persisted Monitoring Plan Artifact (${mon.monitoring_plan_id || 'MON-PLAN-' + suffix})</span>
          <span class="ops-pill ${mon.sre_reviewed ? 'pass' : 'warn'}" style="font-size:0.65rem;">
            ${mon.sre_reviewed ? 'SRE Approved' : 'Pending SRE Approval'}
          </span>
        </div>

        <div style="margin-bottom: 1rem; padding: 0.6rem 0.8rem; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid var(--border-color);">
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom: 0.4rem;">
            <strong>Monitored Components Scope (${(mon.monitored_components_scope || []).length}):</strong>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:0.3rem;">
            ${scopePills || '<span>No scope defined</span>'}
          </div>
        </div>

        ${sloList ? `
          <div style="margin-bottom: 1rem;">
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--text-primary); border-bottom:1px solid var(--border-color); padding-bottom:0.3rem;">Dynamic Component Specs & AI SLO Targets</h4>
            ${sloList}
          </div>
        ` : ''}
        
        <div class="ops-grid">
          <div>
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--text-primary); border-bottom:1px solid var(--border-color); padding-bottom:0.3rem;">Dynamic Component Alert Rules</h4>
            ${alertsList || '<p style="color:var(--text-muted); font-size:0.8rem;">No alerts proposed</p>'}
          </div>
          <div>
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--text-primary); border-bottom:1px solid var(--border-color); padding-bottom:0.3rem;">Technology-Filtered Dashboard Specifications</h4>
            ${dashboardList || '<p style="color:var(--text-muted); font-size:0.8rem;">No dashboards proposed</p>'}
          </div>
        </div>

        ${!mon.sre_reviewed ? `
          <div style="border-top:1px solid var(--border-color); padding-top: 1rem; margin-top:1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem; align-items: center;">
            <label for="mon-sre-reviewer" style="font-size:0.8rem; color:var(--text-secondary);">SRE Reviewer Email: </label>
            <input type="email" id="mon-sre-reviewer" value="sre-oncall@company.com" style="width: 200px; background:var(--bg-tertiary); border: 1px solid var(--border-color); color:var(--text-primary); padding: 0.35rem 0.5rem; border-radius: 4px; font-size:0.8rem;">
            <button class="ops-btn" id="ops-sre-approve-btn">Approve Monitoring Plan (${mon.monitoring_plan_id || 'MON-PLAN-' + suffix})</button>
          </div>
        ` : `
          <div style="border-top:1px solid var(--border-color); padding-top: 1rem; margin-top:1.5rem; font-size: 0.8rem; color: var(--color-status-green-text); font-weight: bold; text-align: right;">
            ✓ Monitoring Plan ${mon.monitoring_plan_id || 'MON-PLAN-' + suffix} signed off by ${mon.sre_reviewed_by || 'SRE Lead'}. Ready for Stage 09-A Validation.
          </div>
        `}
      </div>
    `;
  }

  content.innerHTML = headerHtml + formHtml + resultsHtml;

  // Add Action Listeners
  document.getElementById('ops-gen-mon-btn').addEventListener('click', generateMonitoringConfig);
  const approveBtn = document.getElementById('ops-sre-approve-btn');
  if (approveBtn) {
    approveBtn.addEventListener('click', approveSreMonitoring);
  }
}

async function generateMonitoringConfig() {
  const compStr = document.getElementById('mon-components').value;
  const env = document.getElementById('mon-env').value;
  const availVal = document.getElementById('mon-availability').value;
  const latVal = document.getElementById('mon-latency').value;

  const availability = availVal ? parseFloat(availVal) : null;
  const latency = latVal ? parseInt(latVal) : null;

  const component_ids = compStr.split(',').map(c => c.trim()).filter(Boolean);

  const btn = document.getElementById('ops-gen-mon-btn');
  btn.disabled = true;
  btn.textContent = 'Generating Monitoring Plan via AI Agent...';

  const planId = opsPlan ? opsPlan.plan_id : `PLN-${opsSelectedDemandId.split('-').pop()}-1`;

  try {
    const res = await fetch(`${OPS_API_BASE}/monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demand_id: opsSelectedDemandId,
        plan_id: planId,
        component_ids,
        environment: env || 'prod',
        target_availability_slo: availability,
        target_latency_p99_ms: latency
      })
    });
    if (!res.ok) throw new Error('API Error');
    await selectOpsDemand(opsSelectedDemandId);
  } catch (err) {
    console.error(err);
    alert('Failed to generate monitoring config proposal.');
    btn.disabled = false;
    btn.textContent = 'Generate Monitoring Plan via AI Agent';
  }
}

async function approveSreMonitoring() {
  const reviewer = document.getElementById('mon-sre-reviewer').value.trim();
  if (!reviewer) {
    alert('Reviewer email is required.');
    return;
  }

  try {
    const res = await fetch(`${OPS_API_BASE}/monitoring/${opsSelectedDemandId}/sre-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_by: reviewer })
    });
    if (!res.ok) throw new Error('API Error');
    await selectOpsDemand(opsSelectedDemandId);
  } catch (err) {
    console.error(err);
    alert('SRE review submission failed.');
  }
}

// ----------------------------------------------------
// 09-B: Handover & KT Tab View
// ----------------------------------------------------
function renderHandoverKT() {
  const content = document.getElementById('ops-content-container');
  const ho = opsRecord ? opsRecord.handover : null;
  const suffix = opsSelectedDemandId.split('-').pop() || '0068';

  // Filter runbooks for this demand
  const demandRunbooks = opsAllRunbooks.filter(r => r.demand_id === opsSelectedDemandId);
  const runbookOptions = demandRunbooks.map(r => `<option value="${r.runbook_id}">${r.runbook_id} — ${r.title}</option>`).join('');

  // Extract relevant unresolved defects for this demand ID from Stage 07
  const demandDefects = opsAllDefects.filter(d => 
    d.demand_id === opsSelectedDemandId && 
    !['closed', 'resolved', 'rejected', 'duplicate'].includes((d.status || '').toLowerCase())
  );
  const defectOptions = demandDefects.map(d => `<option value="${d.defect_id || d.id}" selected>${d.defect_id || d.id}: ${d.summary || d.title || 'Bug'}</option>`).join('');

  // Extract delivery team contacts dynamically from tasks in opsPlan
  let derivedDeliveryTeam = [];
  if (opsPlan && opsPlan.tasks) {
    const ownersSet = new Set();
    opsPlan.tasks.forEach(t => {
      if (t.owner) {
        t.owner.split(',').forEach(o => {
          let email = o.trim();
          if (email) {
            if (!email.includes('@')) {
              email = email.toLowerCase().replace(/\s+/g, '.') + '@company.com';
            }
            ownersSet.add(email);
          }
        });
      }
      if (t.owners) {
        t.owners.forEach(o => {
          let email = o.trim();
          if (email) {
            if (!email.includes('@')) {
              email = email.toLowerCase().replace(/\s+/g, '.') + '@company.com';
            }
            ownersSet.add(email);
          }
        });
      }
    });
    derivedDeliveryTeam = Array.from(ownersSet);
  }
  if (derivedDeliveryTeam.length === 0) {
    derivedDeliveryTeam = ['d.chen@company.com', 'clara.davis@company.com'];
  }
  const defaultDeliveryTeam = derivedDeliveryTeam.join(', ');

  let headerHtml = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h3 style="margin:0; font-family: var(--font-display); font-size:1.25rem;">09-B: Operations Handover & KT</h3>
      <div>
        ${ho ? `
          <span class="ops-pill ${ho.status === 'reviewed' ? 'pass' : 'warn'}">
            ${ho.status === 'reviewed' ? 'Ops Approved' : 'Draft'}
          </span>
        ` : `<span class="ops-pill fail">Not Drafted</span>`}
      </div>
    </div>
  `;

  let formHtml = `
    <div class="ops-card">
      <div class="ops-card-title">Assemble Handover Information</div>
      <div class="ops-grid">
        <div class="ops-form-group" style="grid-column: span 2;">
          <label for="ho-runbook">Approved Deployment Runbook *</label>
          <select id="ho-runbook">
            ${runbookOptions || `<option value="RBK-${suffix}-1">RBK-${suffix}-1 (Dummy / Fallback)</option>`}
          </select>
          <div id="ho-runbook-meta" style="margin-top: 0.5rem; font-size: 0.78rem; line-height: 1.4; color: var(--text-secondary); background: rgba(255,255,255,0.02); padding: 0.5rem; border-radius: 4px; border: 1px dashed var(--border-color); display: none;"></div>
        </div>
      </div>
      <div class="ops-grid">
        <div class="ops-form-group">
          <label for="ho-delivery-team">Delivery Team Contacts (comma-separated)</label>
          <input type="text" id="ho-delivery-team" value="${defaultDeliveryTeam}">
        </div>
        <div class="ops-form-group">
          <label for="ho-run-team">Support Group Email</label>
          <input type="text" id="ho-run-team" value="ops-support@company.com">
        </div>
      </div>
      <button class="ops-btn" id="ops-gen-ho-btn">Draft Operations Handover Pack via AI</button>
    </div>
  `;

  let resultsHtml = '';
  if (ho) {
    const sectionsList = (ho.support_runbook.sections || []).map(s => `
      <div style="margin-bottom: 0.75rem;">
        <strong style="color: var(--text-primary); font-size: 0.8rem; display:block; margin-bottom: 0.2rem;">${s.section}</strong>
        <div style="font-size:0.78rem; color: var(--text-secondary); background: rgba(0,0,0,0.1); padding:0.4rem 0.6rem; border-radius: 4px; line-height: 1.4; border: 1px solid var(--border-color);">${s.content}</div>
      </div>
    `).join('');

    const activeKnownErrors = (ho.known_errors || []).filter(ke => ke.linked_defect !== 'None' && ke.ke_id !== 'KE-000');
    
    let keList = '';
    if (activeKnownErrors.length === 0) {
      keList = `
        <div style="padding: 1.25rem; text-align: center; color: var(--color-status-green-text); font-size: 0.85rem; font-weight: bold; background: rgba(0,200,83,0.05); border: 1px dashed rgba(0,200,83,0.3); border-radius: 6px;">
          ✓ No unresolved defects from Stage 07.<br/>
          <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: normal; display: inline-block; margin-top: 0.25rem;">Status: No Known Errors</span>
        </div>
      `;
    } else {
      keList = `
        <div style="overflow-x: auto; margin-top: 0.5rem;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; text-align: left; background: rgba(0,0,0,0.15); border-radius: 6px; border: 1px solid var(--border-color);">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); background: rgba(255,255,255,0.03); color: var(--text-muted); text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.5px;">
                <th style="padding: 0.65rem 0.75rem;">Known Error ID</th>
                <th style="padding: 0.65rem 0.75rem;">Related Defect</th>
                <th style="padding: 0.65rem 0.75rem;">Priority</th>
                <th style="padding: 0.65rem 0.75rem;">Severity</th>
                <th style="padding: 0.65rem 0.75rem;">Status</th>
                <th style="padding: 0.65rem 0.75rem;">Assigned Dev</th>
                <th style="padding: 0.65rem 0.75rem;">Issue, Impact &amp; Workaround</th>
              </tr>
            </thead>
            <tbody>
              ${activeKnownErrors.map(ke => {
                const priority = ke.priority || 'Medium';
                const severity = ke.severity || 'Major';
                const status = ke.status || 'Open';
                const assignee = ke.assigned_to || 'Unassigned';
                const impact = ke.operational_impact || 'Operational degradation possible in production.';
                const isAi = ke.workaround && ke.workaround.includes('[AI-Generated]');
                const cleanWorkaround = ke.workaround ? ke.workaround.replace('[AI-Generated]', '').trim() : 'No workaround specified.';
                
                let sevColor = 'var(--text-muted)';
                let sevBg = 'rgba(255,255,255,0.05)';
                const sLower = severity.toLowerCase();
                if (['blocker', 'critical'].includes(sLower)) {
                  sevColor = 'var(--color-status-red-text)';
                  sevBg = 'rgba(255, 75, 75, 0.12)';
                } else if (['high', 'major', 'medium'].includes(sLower)) {
                  sevColor = 'var(--color-status-amber-text)';
                  sevBg = 'rgba(255, 170, 0, 0.12)';
                } else {
                  sevColor = 'var(--color-status-green-text)';
                  sevBg = 'rgba(0, 200, 83, 0.12)';
                }

                return `
                  <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 0.65rem 0.75rem; font-weight: bold; color: var(--color-status-amber-text); white-space: nowrap;">${ke.ke_id}</td>
                    <td style="padding: 0.65rem 0.75rem; font-family: monospace; white-space: nowrap;"><a href="#" style="color: var(--color-brand); text-decoration: underline;">${ke.linked_defect}</a></td>
                    <td style="padding: 0.65rem 0.75rem; white-space: nowrap;">${priority}</td>
                    <td style="padding: 0.65rem 0.75rem; white-space: nowrap;"><span class="ops-pill" style="font-size:0.6rem; padding:1px 5px; color:${sevColor}; background:${sevBg}; border: 1px solid ${sevColor}33;">${severity}</span></td>
                    <td style="padding: 0.65rem 0.75rem; white-space: nowrap;"><span class="ops-pill warn" style="font-size:0.6rem; padding:1px 5px;">${status}</span></td>
                    <td style="padding: 0.65rem 0.75rem; white-space: nowrap;"><code>${assignee}</code></td>
                    <td style="padding: 0.65rem 0.75rem;">
                      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">${ke.title}</div>
                      ${ke.description && ke.description !== ke.title ? `<div style="color: var(--text-muted); font-size: 0.74rem; margin-bottom: 3px;"><em>${ke.description}</em></div>` : ''}
                      <div style="color: var(--text-secondary); margin-bottom: 3px; font-size: 0.75rem;"><strong>Impact:</strong> ${impact}</div>
                      <div style="color: var(--text-secondary); font-size: 0.74rem;">
                        <strong>Workaround:</strong> ${cleanWorkaround}
                        ${isAi ? '<span class="ops-pill info" style="font-size:0.55rem; padding:1px 3px; margin-left: 3px; background: rgba(0, 150, 255, 0.1); color: #0096ff; border: 1px solid rgba(0, 150, 255, 0.2);">AI-Generated</span>' : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    resultsHtml = `
      <div class="ops-card">
        <div class="ops-card-title">AI Generated Support Runbook & KT Pack</div>
        
        <div class="ops-form-group">
          <label>KT SharePoint Package URL</label>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <a href="#" id="ops-open-kt-link" style="color: var(--color-brand); font-size:0.85rem; font-weight:600; text-decoration: underline; cursor: pointer;">
              ${ho.kt_pack_url} &nbsp;🔗 (Click to View Complete SharePoint Package)
            </a>
          </div>
        </div>

        <div class="ops-grid" style="margin-top:1rem;">
          <div>
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.9rem; color: var(--text-primary); border-bottom:1px solid var(--border-color); padding-bottom: 0.35rem;">Operations Support Manual</h4>
            ${sectionsList || '<p style="color:var(--text-muted); font-size:0.8rem;">No sections drafted</p>'}
          </div>
          <div>
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.9rem; color: var(--text-primary); border-bottom:1px solid var(--border-color); padding-bottom: 0.35rem;">Known Errors Database (KB)</h4>
            ${keList || '<p style="color:var(--text-muted); font-size:0.8rem;">No known errors</p>'}
          </div>
        </div>

        ${ho.status !== 'reviewed' ? `
          <div style="border-top:1px solid var(--border-color); padding-top: 1rem; margin-top:1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem; align-items: center;">
            <label for="ho-ops-reviewer" style="font-size:0.8rem; color:var(--text-secondary);">Operations Manager Email: </label>
            <input type="email" id="ho-ops-reviewer" value="ops-manager@company.com" style="width: 200px; background:var(--bg-tertiary); border: 1px solid var(--border-color); color:var(--text-primary); padding: 0.35rem 0.5rem; border-radius: 4px; font-size:0.8rem;">
            <button class="ops-btn" id="ops-ho-approve-btn">Approve Operations Handover</button>
          </div>
        ` : `
          <div style="border-top:1px solid var(--border-color); padding-top: 1rem; margin-top:1.5rem; font-size: 0.8rem; color: var(--color-status-green-text); font-weight: bold; text-align: right;">
            ✓ Handover signed off by Operations Group. Briefing checklist updated.
          </div>
        `}
      </div>
    `;
  }

  content.innerHTML = headerHtml + formHtml + resultsHtml;

  // Listeners
  document.getElementById('ops-gen-ho-btn').addEventListener('click', generateHandoverPack);
  const hoApprove = document.getElementById('ops-ho-approve-btn');
  if (hoApprove) {
    hoApprove.addEventListener('click', approveHandoverPack);
  }
  const hoRunbookSelect = document.getElementById('ho-runbook');
  if (hoRunbookSelect) {
    hoRunbookSelect.addEventListener('change', updateRunbookMetadata);
    updateRunbookMetadata();
  }

  const ktLink = document.getElementById('ops-open-kt-link');
  if (ktLink) {
    ktLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.openKtPackageModal();
    });
  }
}

function updateRunbookMetadata() {
  const select = document.getElementById('ho-runbook');
  const metaDiv = document.getElementById('ho-runbook-meta');
  if (!select || !metaDiv) return;

  const runbookId = select.value;
  const rb = opsAllRunbooks.find(r => r.runbook_id === runbookId);
  if (rb) {
    const totalMinutes = (rb.steps || []).reduce((sum, s) => sum + (s.estimated_minutes || 0), 0);
    metaDiv.style.display = 'block';
    metaDiv.innerHTML = `
      <div style="margin-top: 4px;"><strong>Status:</strong> <span class="ops-pill pass" style="font-size:0.65rem; padding: 2px 6px; text-transform: capitalize;">${rb.status}</span></div>
      <div style="margin-top: 4px;"><strong>Component:</strong> <code>${rb.component_id}</code></div>
      <div style="margin-top: 4px;"><strong>Environment:</strong> <code style="text-transform: uppercase;">${rb.environment || 'prod'}</code></div>
      <div style="margin-top: 4px;"><strong>Estimated Duration:</strong> ${totalMinutes} minutes</div>
    `;
  } else {
    if (runbookId && (runbookId.includes('-prod-') || runbookId.includes('-staging-') || runbookId.includes('-test-') || runbookId.includes('-dev-'))) {
      const parts = runbookId.split('-');
      let comp = 'N/A';
      if (parts.length >= 4) {
        comp = parts.slice(3).join('-');
      }
      metaDiv.style.display = 'block';
      metaDiv.innerHTML = `
        <div style="margin-top: 4px;"><strong>Status:</strong> <span class="ops-pill pass" style="font-size:0.65rem; padding: 2px 6px;">Approved</span></div>
        <div style="margin-top: 4px;"><strong>Component:</strong> <code>${comp}</code></div>
        <div style="margin-top: 4px;"><strong>Environment:</strong> <code>prod</code></div>
        <div style="margin-top: 4px;"><strong>Estimated Duration:</strong> 65 minutes</div>
      `;
    } else if (runbookId) {
      metaDiv.style.display = 'block';
      metaDiv.innerHTML = `
        <div style="margin-top: 4px;"><strong>Status:</strong> <span class="ops-pill warn" style="font-size:0.65rem; padding: 2px 6px;">Fallback</span></div>
        <div style="margin-top: 4px;"><strong>Component:</strong> <code>N/A</code></div>
        <div style="margin-top: 4px;"><strong>Environment:</strong> <code>prod</code></div>
        <div style="margin-top: 4px;"><strong>Estimated Duration:</strong> 65 minutes</div>
      `;
    } else {
      metaDiv.style.display = 'none';
    }
  }
}

window.openKtPackageModal = function() {
  let modal = document.getElementById('ops-kt-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ops-kt-modal';
    modal.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 1000; align-items: center; justify-content: center; backdrop-filter: blur(5px); padding: 1rem;';
    document.body.appendChild(modal);
  }

  const demandId = opsSelectedDemandId;
  const suffix = demandId ? demandId.split('-').pop() : '0068';
  const ho = opsRecord ? opsRecord.handover : null;
  const mon = opsRecord ? opsRecord.monitoring : null;
  const val = opsRecord ? opsRecord.validation : null;

  if (!ho) {
    modal.innerHTML = `
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); width: 520px; padding: 1.5rem; text-align: center; color: var(--text-primary); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
        <h3 style="margin-top:0; color: var(--color-status-amber-text); font-family: var(--font-display);">KT Package Not Yet Generated</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 1rem 0; line-height: 1.5;">
          The SharePoint KT Package for demand <strong>${demandId}</strong> has not been drafted yet.
        </p>
        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
          Please navigate to the <strong>09-B: Operations Handover & KT</strong> tab and click <em>"Draft Operations Handover Pack via AI"</em> to generate the package.
        </p>
        <button class="ops-btn" onclick="document.getElementById('ops-kt-modal').style.display='none'" style="margin-top: 1.25rem;">Close</button>
      </div>
    `;
    modal.style.display = 'flex';
    return;
  }

  const demandObj = opsDemands.find(d => d.demand_id === demandId);
  const appName = demandObj ? (demandObj.project_name || demandObj.title || demandObj.name || 'Real Time Ecommerce Chatbot') : 'Real Time Ecommerce Chatbot';
  const rb = opsAllRunbooks.find(r => r.demand_id === demandId);
  const runbookId = rb ? rb.runbook_id : `DEM-2026-${suffix}-svc-ecom-chatbot-prod-svr-01`;
  const env = rb ? (rb.environment || 'Production') : 'Production';
  const todayStr = new Date().toISOString().split('T')[0];

  const components = (mon && mon.component_ids && mon.component_ids.length > 0) ? mon.component_ids : ['svc-ecom-chatbot', 'no-sql-database-mongo-4-x', 'realtime-message-queue-kafka-2-6'];
  const slos = (mon && mon.slos) ? mon.slos : { availability_slo: '99.9%', latency_p99_ms: 250 };
  const knownErrors = ho.known_errors || [];
  const valStatus = val ? (val.status === 'approved' ? 'Signed-Off' : val.overall_status.toUpperCase()) : 'Signed-Off';

  const sectionsList = (ho.support_runbook.sections || []).map(s => `
    <div style="margin-bottom: 0.75rem; border-left: 3px solid var(--color-brand); padding-left: 0.6rem;">
      <strong style="color: var(--text-primary); font-size: 0.82rem; display:block;">${s.section}</strong>
      <div style="font-size:0.78rem; color: var(--text-secondary); margin-top:0.2rem; line-height: 1.4;">${s.content}</div>
    </div>
  `).join('');

  const keList = knownErrors.map(ke => {
    if (ke.linked_defect === 'None' || ke.ke_id === 'KE-000') {
      return '<div style="color:var(--color-status-green-text); font-size:0.8rem; font-weight:bold;">✓ No unresolved defects from Stage 07.<br/><span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">Status: No Known Errors</span></div>';
    }
    const cleanWorkaround = ke.workaround ? ke.workaround.replace('[AI-Generated]', '').trim() : 'No workaround specified.';
    const isAi = ke.workaround && ke.workaround.includes('[AI-Generated]');
    return `
      <div style="margin-bottom: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 4px; border: 1px solid var(--border-color);">
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:bold; color:var(--color-status-amber-text);">
          <span>${ke.ke_id}: ${ke.title.split('\n\n')[0]}</span>
          <span style="font-size:0.72rem; color:var(--text-muted);">Defect: ${ke.linked_defect}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">
          <strong>Workaround:</strong> ${cleanWorkaround} ${isAi ? '<span class="ops-pill info" style="font-size:0.55rem; padding:1px 3px;">AI-Generated</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); width: 920px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
      <!-- Header -->
      <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-tertiary);">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.2rem;">📁</span>
            <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">SharePoint Operations KT Package</h3>
            <span class="ops-pill pass" style="font-size: 0.65rem; padding: 2px 6px;">Status: Ready</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
            Package ID: <strong>KT-${demandId}</strong> | Repository: <em>Operations Knowledge Repository (SharePoint)</em>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button class="ops-btn" onclick="window.print()" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; background: var(--bg-primary);">🖨️ Print / Export</button>
          <button onclick="document.getElementById('ops-kt-modal').style.display='none'" style="background: transparent; border: none; font-size: 1.5rem; color: var(--text-secondary); cursor: pointer; padding: 0 0.5rem;">&times;</button>
        </div>
      </div>

      <!-- Body Container -->
      <div style="padding: 1.25rem; overflow-y: auto; flex: 1; font-size: 0.82rem; line-height: 1.5; color: var(--text-primary);">
        
        <!-- Summary Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
          
          <!-- Release Info Card -->
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px;">
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">📋 Release Information</h4>
            <div><strong>Demand ID:</strong> <code>${demandId}</code></div>
            <div><strong>Project/Application Name:</strong> ${appName}</div>
            <div><strong>Environment:</strong> <code style="text-transform: uppercase;">${env}</code></div>
            <div><strong>Release Version:</strong> 1.0.0</div>
            <div><strong>Deployment Date:</strong> ${todayStr}</div>
            <div><strong>Prepared By:</strong> AI Ops Readiness Agent</div>
            <div><strong>Generated Date:</strong> ${todayStr}</div>
          </div>

          <!-- Operations Documents -->
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px;">
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">📄 Operations Documents</h4>
            <div style="color: var(--color-status-green-text);">✓ Approved Deployment Runbook (<code>${runbookId}</code>)</div>
            <div style="color: var(--color-status-green-text);">✓ Operations Support Manual</div>
            <div style="color: var(--color-status-green-text);">✓ Release Notes</div>
            <div style="color: var(--color-status-green-text);">✓ Rollback Procedure</div>
          </div>

          <!-- Deployment Summary -->
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px;">
            <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">🚀 Deployment Summary</h4>
            <div><strong>Deployment Status:</strong> <span class="ops-pill pass" style="font-size:0.6rem; padding:1px 4px;">Completed / Approved</span></div>
            <div><strong>Quality Gate Status:</strong> <span class="ops-pill pass" style="font-size:0.6rem; padding:1px 4px;">Evaluated (Stage 07)</span></div>
            <div><strong>CAB Approval:</strong> <span class="ops-pill pass" style="font-size:0.6rem; padding:1px 4px;">Approved (Stage 08)</span></div>
            <div><strong>Readiness Validation Result:</strong> <span class="ops-pill pass" style="font-size:0.6rem; padding:1px 4px;">${valStatus}</span></div>
          </div>

        </div>

        <!-- Operational Readiness Section -->
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px; margin-bottom: 1.25rem;">
          <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">⚡ Operational Readiness (Stage 09-C)</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <div><strong>Health Check Procedures:</strong> GET <code>/api/health</code> (Target SLA &lt; 150ms)</div>
              <div><strong>Monitoring Components:</strong> <code>${components.join(', ')}</code></div>
              <div><strong>Monitoring Dashboard Guide:</strong> <a href="#" style="color: var(--color-brand); font-family: monospace;">observability://dashboards/ops-readiness-${suffix}</a></div>
              <div><strong>Alert Configuration Summary:</strong> High Latency (&gt;250ms), 5xx Error Spike (&gt;1%), Memory Threshold (&gt;85%)</div>
            </div>
            <div>
              <div><strong>Availability SLO:</strong> <span style="color:var(--color-status-green-text); font-weight:bold;">${slos.availability_slo || '99.9%'}</span></div>
              <div><strong>p99 Latency SLO:</strong> <span style="color:var(--color-status-green-text); font-weight:bold;">${slos.latency_p99_ms || 250}ms</span></div>
            </div>
          </div>
        </div>

        <!-- Support Information Section -->
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px; margin-bottom: 1.25rem;">
          <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">☎️ Support Information</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <div><strong>Support Group:</strong> Operations Support Team</div>
              <div><strong>Support Email:</strong> <code>ops-support@company.com</code></div>
              <div><strong>On-call Team:</strong> Primary On-Call Roster</div>
            </div>
            <div>
              <div><strong>Delivery Team Contacts:</strong> <code>d.chen@company.com, clara.davis@company.com</code></div>
              <div><strong>Escalation Matrix:</strong> L1 Support -&gt; SRE On-Call -&gt; Delivery Lead</div>
            </div>
          </div>
        </div>

        <!-- Operations Support Manual -->
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px; margin-bottom: 1.25rem;">
          <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">📘 Operations Support Manual</h4>
          ${sectionsList || '<div style="color:var(--text-muted);">No sections available.</div>'}
        </div>

        <!-- Knowledge Base -->
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 6px;">
          <h4 style="margin:0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem;">📚 Knowledge Base</h4>
          <div><strong>KB References:</strong> <code>kb://payments-api/runbooks</code></div>
          <div style="margin-top: 0.5rem;">
            ${keList || '<div style="color:var(--color-status-green-text);">No known errors pending for this release.</div>'}
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-tertiary);">
        <div style="font-size: 0.75rem; color: var(--color-status-green-text); font-weight: bold;">
          ✓ Package Status: Ready for Production | Operations Approval: Approved
        </div>
        <button class="ops-btn" onclick="document.getElementById('ops-kt-modal').style.display='none'">Close Package</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
};

async function generateHandoverPack() {
  const runbook_id = document.getElementById('ho-runbook').value;
  const delivery_team = document.getElementById('ho-delivery-team').value.split(',').map(c => c.trim()).filter(Boolean);
  const run_team = [document.getElementById('ho-run-team').value.trim()];

  // Extract unresolved defects for this demand ID dynamically from Stage 07
  const demandDefects = opsAllDefects.filter(d => 
    d.demand_id === opsSelectedDemandId && 
    !['closed', 'resolved', 'rejected', 'duplicate'].includes((d.status || '').toLowerCase())
  );
  const defect_ids = demandDefects.map(d => d.defect_id || d.id).filter(Boolean);

  const btn = document.getElementById('ops-gen-ho-btn');
  btn.disabled = true;
  btn.textContent = 'Generating handover package via SRE Agent...';

  const planId = opsPlan ? opsPlan.plan_id : `PLN-${opsSelectedDemandId.split('-').pop()}-1`;

  try {
    const res = await fetch(`${OPS_API_BASE}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demand_id: opsSelectedDemandId,
        plan_id: planId,
        runbook_id,
        defect_ids,
        known_error_refs: [],
        kb_refs: [],
        delivery_team,
        run_team
      })
    });
    if (!res.ok) throw new Error('API Error');
    await selectOpsDemand(opsSelectedDemandId);
  } catch (err) {
    console.error(err);
    alert('Failed to generate operations handover pack.');
    btn.disabled = false;
    btn.textContent = 'Draft Operations Handover Pack via AI';
  }
}

async function approveHandoverPack() {
  const reviewer = document.getElementById('ho-ops-reviewer').value.trim();
  if (!reviewer) {
    alert('Reviewer email is required.');
    return;
  }

  try {
    const res = await fetch(`${OPS_API_BASE}/handover/${opsSelectedDemandId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_by: reviewer })
    });
    if (!res.ok) throw new Error('API Error');
    await selectOpsDemand(opsSelectedDemandId);
  } catch (err) {
    console.error(err);
    alert('Handover sign-off failed.');
  }
}

// ----------------------------------------------------
// 09-A: Readiness Validation Tab View
// ----------------------------------------------------
function renderReadinessValidation() {
  const content = document.getElementById('ops-content-container');
  const val = opsRecord ? opsRecord.validation : null;
  const suffix = opsSelectedDemandId.split('-').pop() || '0068';

  const isMonApproved = opsRecord && opsRecord.monitoring && opsRecord.monitoring.sre_reviewed;
  const isHoApproved = opsRecord && opsRecord.handover && opsRecord.handover.status === 'reviewed';

  let headerHtml = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h3 style="margin:0; font-family: var(--font-display); font-size:1.25rem;">09-A: Go-Live Readiness Validation</h3>
      <div>
        ${val ? `
          <span class="ops-pill ${val.status === 'approved' ? 'pass' : val.status === 'rejected' ? 'fail' : 'warn'}">
            ${val.status === 'approved' ? 'Signed-Off' : 'Pending Sign-Off'}
          </span>
        ` : `<span class="ops-pill fail">Not Evaluated</span>`}
      </div>
    </div>
  `;

  let checklistHtml = `
    <div class="ops-card">
      <div class="ops-card-title">Go-Live Readiness Checklist</div>
      
      <div class="ops-grid">
        <div class="ops-form-group">
          <label for="val-readiness-id">Release Readiness ID (Stage 6-A)</label>
          <input type="text" id="val-readiness-id" value="RDY-${suffix}-1" placeholder="RDY-XXXX-1">
        </div>
        <div class="ops-form-group">
          <label for="val-cutover-id">Cutover Bridge Session ID (Stage 6-C)</label>
          <input type="text" id="val-cutover-id" value="CUT-${suffix}-1" placeholder="CUT-XXXX-1">
        </div>
      </div>
      <div class="ops-form-group">
        <label for="val-mon-ref">Monitoring Config Dashboard Ref</label>
        <input type="text" id="val-mon-ref" value="observability://dashboards/ops-readiness-${suffix}" placeholder="observability://...">
      </div>

      <div style="margin-top: 1rem; margin-bottom: 1rem;">
        <label style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin-bottom:0.5rem; display:block;">Preconditions Evaluated</label>
        
        <div class="ops-check-item">
          <input type="checkbox" id="chk-monitoring" ${isMonApproved ? 'checked' : ''} ${!isMonApproved ? 'disabled' : ''}>
          <div>
            <strong style="font-size:0.85rem; color:var(--text-primary);">Monitoring Configured &amp; Approved</strong>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${isMonApproved ? '✓ SRE sign-off verified.' : '✗ SRE monitoring review pending in Step 1.'}</div>
          </div>
        </div>

        <div class="ops-check-item">
          <input type="checkbox" id="chk-briefed" ${isHoApproved ? 'checked' : ''}>
          <div>
            <strong style="font-size:0.85rem; color:var(--text-primary);">Support Team Briefed (KT Complete)</strong>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${isHoApproved ? 'Knowledge Transfer session carried out successfully with Operations center.' : 'Knowledge Transfer session pending.'}</div>
          </div>
        </div>

        <div class="ops-check-item">
          <input type="checkbox" id="chk-runbook" ${isHoApproved ? 'checked' : ''} ${!isHoApproved ? 'disabled' : ''}>
          <div>
            <strong style="font-size:0.85rem; color:var(--text-primary);">Support Runbook Reviewed &amp; Approved</strong>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${isHoApproved ? '✓ Operations team approved.' : '✗ Operations manual review pending in Step 2.'}</div>
          </div>
        </div>

        <div class="ops-check-item">
          <input type="checkbox" id="chk-errors" ${isHoApproved ? 'checked' : ''}>
          <div>
            <strong style="font-size:0.85rem; color:var(--text-primary);">Known Errors &amp; Workarounds Documented</strong>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${isHoApproved ? 'Unresolved critical/high defects translated into KB workaround notes.' : 'Defect workaround documentation pending.'}</div>
          </div>
        </div>

        <div class="ops-check-item">
          <input type="checkbox" id="chk-oncall" ${isHoApproved ? 'checked' : ''}>
          <div>
            <strong style="font-size:0.85rem; color:var(--text-primary);">On-call Roster Assigned</strong>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${isHoApproved ? 'Delivery and operations engineer roster assigned for the release window.' : 'On-call personnel assignment pending.'}</div>
          </div>
        </div>
      </div>

      <button class="ops-btn" id="ops-validate-btn">Evaluate Readiness Checklist</button>
    </div>
  `;

  let resultsHtml = '';
  if (val) {
    const resultsList = (val.criteria_results || []).map(r => `
      <div class="ops-check-item" style="justify-content: space-between; padding: 0.6rem 0.75rem;">
        <div>
          <span style="font-weight:700; font-size:0.82rem; color:var(--text-primary); text-transform: capitalize;">${r.criterion.replace(/_/g, ' ')}</span>
          <div style="font-size: 0.75rem; color:var(--text-secondary); margin-top:0.15rem;">${r.evidence}</div>
        </div>
        <span class="ops-pill ${r.status === 'pass' ? 'pass' : r.status === 'warn' ? 'warn' : 'fail'}">${r.status}</span>
      </div>
    `).join('');

    const gapsList = (val.gaps || []).map(g => `<li style="margin-bottom:0.35rem;">${g}</li>`).join('');

    resultsHtml = `
      <div class="ops-card">
        <div class="ops-card-title">Readiness Validation Results</div>

        <div class="ops-grid">
          <div>
            <h4 style="margin:0 0 0.5rem 0; font-size:0.9rem;">Checklist Criteria Outcomes</h4>
            ${resultsList}
          </div>
          <div>
            <div class="ops-check-item" style="flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 1.5rem; height: 100%; box-sizing: border-box;">
              <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Overall Verdict</span>
              <div style="font-family: var(--font-display); font-size:2rem; font-weight:bold; margin-top:0.35rem; color:${val.overall_status === 'pass' ? 'var(--color-status-green-text)' : val.overall_status === 'conditional-pass' ? 'var(--color-status-amber-text)' : 'var(--color-status-red-text)'};">
                ${val.overall_status.toUpperCase()}
              </div>
              
              ${gapsList ? `
                <div style="margin-top:1rem; text-align: left; width:100%; border-top:1px solid var(--border-color); padding-top:0.75rem;">
                  <strong style="font-size:0.78rem; color:var(--color-status-red-text); display:block; margin-bottom:0.25rem;">Detected Checklist Gaps:</strong>
                  <ul style="margin:0; padding-left:1.1rem; font-size:0.75rem; color:var(--text-secondary);">
                    ${gapsList}
                  </ul>
                </div>
              ` : `
                <div style="margin-top:1rem; font-size: 0.75rem; color:var(--color-status-green-text);">No outstanding gaps detected! Ready for sign-off.</div>
              `}
            </div>
          </div>
        </div>

        ${val.status !== 'approved' ? `
          <div style="border-top:1px solid var(--border-color); padding-top: 1rem; margin-top:1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem; align-items: center;">
            <label for="val-signoff-director" style="font-size:0.8rem; color:var(--text-secondary);">Approving Director: </label>
            <input type="text" id="val-signoff-director" value="director.delivery@company.com" style="width: 220px; background:var(--bg-tertiary); border: 1px solid var(--border-color); color:var(--text-primary); padding: 0.35rem 0.5rem; border-radius: 4px; font-size:0.8rem;">
            <button class="ops-btn" id="ops-signoff-btn">Sign-off &amp; Approve Release</button>
          </div>
        ` : `
          <div style="border-top:1px solid var(--border-color); padding-top: 1rem; margin-top:1.5rem; font-size: 0.85rem; color: var(--color-status-green-text); font-weight: bold; text-align: right;">
            ✓ Ops Readiness fully signed off by ${val.sign_off_by}. Production deployment precondition verified.
          </div>
        `}
      </div>
    `;
  }

  let logsHtml = '';
  if (opsReleaseLogs && opsReleaseLogs.length > 0) {
    const logsList = opsReleaseLogs.map(log => {
      const eventLower = log.event.toLowerCase();
      let icon = 'ℹ️';
      let color = 'var(--text-secondary)';
      if (eventLower.includes('fail') || eventLower.includes('reject') || eventLower.includes('drift') || eventLower.includes('error')) {
        icon = '❌';
        color = 'var(--color-status-red-text)';
      } else if (eventLower.includes('warn') || eventLower.includes('request changes')) {
        icon = '⚠️';
        color = 'var(--color-status-amber-text)';
      } else if (eventLower.includes('approve') || eventLower.includes('pass') || eventLower.includes('success') || eventLower.includes('accepted')) {
        icon = '✅';
        color = 'var(--color-status-green-text)';
      }
      
      return `
        <div class="ops-check-item" style="justify-content: space-between; padding: 0.5rem 0.75rem; margin-bottom: 0.35rem; border-color: rgba(255,255,255,0.05);">
          <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
            <span>${icon}</span>
            <div>
              <strong style="font-size:0.82rem; color:${color};">${log.event}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                Performed by: <code>${log.performed_by || 'system'}</code> | Module: <em>${log.module_name || 'Release'}</em>
              </div>
            </div>
          </div>
          <span style="font-family: monospace; font-size: 0.72rem; color: var(--text-muted);">${log.timestamp ? log.timestamp.split('T')[1].substring(0, 8) : ''}</span>
        </div>
      `;
    }).join('');

    logsHtml = `
      <div class="ops-card" style="margin-top: 1.25rem;">
        <div class="ops-card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Release Compliance Audit Trail (Stage 08 Logs)</span>
          <span style="font-size:0.75rem; font-weight:normal; color:var(--text-muted);">REL-${suffix}-1</span>
        </div>
        <div style="max-height: 220px; overflow-y: auto; padding-right:0.25rem;">
          ${logsList}
        </div>
      </div>
    `;
  } else {
    logsHtml = `
      <div class="ops-card" style="margin-top: 1.25rem;">
        <div class="ops-card-title">Release Compliance Audit Trail (Stage 08 Logs)</div>
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size:0.82rem;">
          No release compliance logs found for REL-${suffix}-1.
        </div>
      </div>
    `;
  }

  content.innerHTML = headerHtml + checklistHtml + resultsHtml + logsHtml;

  // Listeners
  document.getElementById('ops-validate-btn').addEventListener('click', runReadinessValidation);
  const signoffBtn = document.getElementById('ops-signoff-btn');
  if (signoffBtn) {
    signoffBtn.addEventListener('click', submitSignOffValidation);
  }
}

async function runReadinessValidation() {
  const readiness_id = document.getElementById('val-readiness-id').value.trim();
  const cutover_id = document.getElementById('val-cutover-id').value.trim();
  const monitoring_config_ref = document.getElementById('val-mon-ref').value.trim();

  const monitoring_configured = document.getElementById('chk-monitoring').checked;
  const support_team_briefed = document.getElementById('chk-briefed').checked;
  const runbook_reviewed = document.getElementById('chk-runbook').checked;
  const known_errors_documented = document.getElementById('chk-errors').checked;
  const on_call_assigned = document.getElementById('chk-oncall').checked;

  const btn = document.getElementById('ops-validate-btn');
  btn.disabled = true;
  btn.textContent = 'Evaluating criteria...';

  const planId = opsPlan ? opsPlan.plan_id : `PLN-${opsSelectedDemandId.split('-').pop()}-1`;

  try {
    const res = await fetch(`${OPS_API_BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demand_id: opsSelectedDemandId,
        plan_id: planId,
        readiness_id,
        cutover_id,
        readiness_criteria: {
          monitoring_configured,
          support_team_briefed,
          runbook_reviewed,
          known_errors_documented,
          on_call_assigned
        },
        monitoring_config_ref
      })
    });
    if (!res.ok) throw new Error('API Error');
    await selectOpsDemand(opsSelectedDemandId);
  } catch (err) {
    console.error(err);
    alert('Checklist evaluation failed.');
    btn.disabled = false;
    btn.textContent = 'Evaluate Readiness Checklist';
  }
}

async function submitSignOffValidation() {
  const director = document.getElementById('val-signoff-director').value.trim();
  if (!director) {
    alert('Director email is required.');
    return;
  }

  try {
    const res = await fetch(`${OPS_API_BASE}/validate/${opsSelectedDemandId}/sign-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sign_off_by: director,
        status: 'approved'
      })
    });
    if (!res.ok) throw new Error('API Error');
    await selectOpsDemand(opsSelectedDemandId);
    alert('Operations Readiness has been approved and signed off. Stage 6 Deployment Precondition updated.');
    if (window.switchStage) {
      window.switchStage('dashboard');
    }
  } catch (err) {
    console.error(err);
    alert('Validation sign-off failed.');
  }
}
