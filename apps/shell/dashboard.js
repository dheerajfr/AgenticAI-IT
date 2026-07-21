// Dashboard Component - End-to-End Project Tracking

const BASE_URL = '/api';

let allDemands = [];
let currentProject = null;

// Helper to safely fetch JSON
async function fetchSafe(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// 1. Data Aggregation
async function loadProjectData(demandId) {
  const data = { demandId };
  
  // Fetch parallel
  const [
    demandData,
    estimates,
    plans,
    environments,
    dependencies,
    deployOrch,
    deployCutover,
    tqConsolidated,
    tqQualityGate,
    releases
  ] = await Promise.all([
    fetchSafe(`${BASE_URL}/demands`),
    fetchSafe(`${BASE_URL}/estimates`),
    fetchSafe(`${BASE_URL}/plans`),
    fetchSafe(`${BASE_URL}/environments`),
    fetchSafe(`${BASE_URL}/dependencies`),
    fetchSafe(`${BASE_URL}/deployments/orchestration`),
    fetchSafe(`${BASE_URL}/deployments/cutover`),
    fetchSafe(`${BASE_URL}/test-quality/consolidated/${demandId}`),
    fetchSafe(`${BASE_URL}/test-quality/relational/quality_gate/${demandId}`),
    fetchSafe(`${BASE_URL}/release-change/releases`)
  ]);

  // Aggregate and Filter
  if (demandData) data.demand = demandData.find(d => d.demand_id === demandId);
  if (estimates) data.estimate = estimates.find(e => e.demand_id === demandId);
  if (plans) data.plan = plans.find(p => p.demand_id === demandId);
  if (environments) data.environments = environments.filter(e => e.demand_id === demandId);
  if (dependencies) data.dependencies = dependencies.filter(d => (d.plan_id && data.plan && d.plan_id === data.plan.plan_id) || (data.plan && d.plan_id === data.plan.plan_id) || d.demand_id === demandId); 
  // Fallback if deps map by plan_id
  if (dependencies && !data.dependencies.length && data.plan) {
      data.dependencies = dependencies.filter(d => d.plan_id === data.plan.plan_id);
  }
  
  if (deployOrch) data.deployments = deployOrch.filter(d => d.demand_id === demandId);
  if (deployCutover) data.cutover = deployCutover.filter(c => c.demand_id === demandId);
  data.testQuality = tqConsolidated || null;
  data.qualityGate = tqQualityGate ? tqQualityGate[0] || null : null; // usually returns array
  if (releases) data.releases = releases.filter(r => r.demand_id === demandId);

  return data;
}

// 2. Logic Calculations
function determineCurrentStage(data) {
  if (data.releases && data.releases.length > 0) return 'release-change';
  if (data.qualityGate) return 'test-quality';
  if (data.deployments && data.deployments.length > 0) return 'build-deploy';
  if (data.dependencies && data.dependencies.length > 0) return 'dependencies';
  if (data.plan) return 'plan-schedule';
  if (data.environments && data.environments.length > 0) return 'config-environments';
  if (data.estimate) return 'estimate-shape';
  return 'demand-intake';
}

function calculateHealth(data) {
  if (data.qualityGate && data.qualityGate.verdict === 'FAIL') return 'Blocked';
  if (data.dependencies && data.dependencies.some(d => d.status === 'blocked')) return 'Blocked';
  if (data.deployments && data.deployments.some(d => d.status === 'no-go')) return 'Delayed';
  if (data.releases && data.releases.some(r => r.cab_decision === 'Reject')) return 'At Risk';
  return 'Healthy';
}

function calculateProgress(stage) {
  const stages = [
    'demand-intake', 'estimate-shape', 'config-environments', 
    'plan-schedule', 'dependencies', 'build-deploy', 
    'test-quality', 'release-change'
  ];
  const idx = stages.indexOf(stage);
  return Math.round(((idx + 1) / stages.length) * 100);
}

// 3. UI Renderers
window.renderDashboardScreen = async function() {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div style="padding: 2rem; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; animation: fade-in 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <div>
          <h1 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Project Dashboard</h1>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">End-to-End Delivery Lifecycle Tracking</p>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <input type="text" id="dash-search" placeholder="Search by Demand ID or Title..." style="padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-secondary); width: 300px; color: var(--text-primary);">
          <select id="dash-dropdown" style="padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
            <option value="">Select a Project...</option>
          </select>
        </div>
      </div>
      <div id="dash-content" style="display: flex; flex-direction: column; gap: 2rem;">
        <div style="text-align: center; padding: 4rem; color: var(--text-muted);">
          Select a project to view its lifecycle tracking.
        </div>
      </div>
    </div>
  `;

  // Fetch initial demands
  allDemands = await fetchSafe(`${BASE_URL}/demands`) || [];
  
  const dropdown = document.getElementById('dash-dropdown');
  allDemands.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.demand_id;
    opt.textContent = `${d.demand_id} - ${d.title}`;
    dropdown.appendChild(opt);
  });

  dropdown.addEventListener('change', (e) => {
    if (e.target.value) renderProjectDetails(e.target.value);
  });

  const search = document.getElementById('dash-search');
  search.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const match = allDemands.find(d => d.demand_id.toLowerCase().includes(val) || d.title.toLowerCase().includes(val));
    if (match) {
      dropdown.value = match.demand_id;
      renderProjectDetails(match.demand_id);
    }
  });

  if (currentProject && currentProject.demandId) {
    dropdown.value = currentProject.demandId;
    renderProjectDetails(currentProject.demandId);
  }
};

async function renderProjectDetails(demandId) {
  const content = document.getElementById('dash-content');
  content.innerHTML = '<div style="text-align:center; padding: 3rem;"><span class="loader"><span class="spinner"></span> Fetching real-time data across all modules...</span></div>';
  
  const data = await loadProjectData(demandId);
  currentProject = data;

  if (!data.demand) {
    content.innerHTML = `<div style="color: var(--color-status-red-text);">Project ${demandId} not found.</div>`;
    return;
  }

  const currentStage = determineCurrentStage(data);
  const health = calculateHealth(data);
  const progressPct = calculateProgress(currentStage);

  content.innerHTML = `
    <!-- High-level Overview -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: var(--radius-md);">
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Project</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">${data.demand.title}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">${data.demand.demand_id}</div>
      </div>
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: var(--radius-md);">
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Current Stage</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--color-brand); margin-top: 0.25rem; text-transform: capitalize;">${currentStage.replace('-', ' ')}</div>
        <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; margin-top: 0.75rem;">
          <div style="width: ${progressPct}%; height: 100%; background: var(--color-brand); border-radius: 3px;"></div>
        </div>
      </div>
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: var(--radius-md);">
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Overall Health</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--color-status-${health==='Healthy'?'green':health==='Delayed'?'amber':'red'}-text); margin-top: 0.25rem;">${health}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">Progress: ${progressPct}%</div>
      </div>
    </div>

    <!-- Timeline visualization -->
    <div style="margin-top: 1rem;">
      <h3 style="font-family: var(--font-display); font-size: 1rem; color: var(--text-secondary); margin-bottom: 1rem;">Delivery Pipeline</h3>
      <div style="display: flex; justify-content: space-between; align-items: center; position: relative;">
        ${renderTimelineNode('Demand', 'demand-intake', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('demand-intake', currentStage)};"></div>
        ${renderTimelineNode('Estimate', 'estimate-shape', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('estimate-shape', currentStage)};"></div>
        ${renderTimelineNode('Config', 'config-environments', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('config-environments', currentStage)};"></div>
        ${renderTimelineNode('Plan', 'plan-schedule', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('plan-schedule', currentStage)};"></div>
        ${renderTimelineNode('Dependencies', 'dependencies', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('dependencies', currentStage)};"></div>
        ${renderTimelineNode('Deploy', 'build-deploy', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('build-deploy', currentStage)};"></div>
        ${renderTimelineNode('Test Quality', 'test-quality', currentStage, data)}
        <div style="flex:1; height: 2px; background: ${getTimelineLineColor('test-quality', currentStage)};"></div>
        ${renderTimelineNode('Release', 'release-change', currentStage, data)}
      </div>
    </div>

    <!-- Details Accordions -->
    <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
      ${renderDemandCard(data)}
      ${renderEstimateCard(data)}
      ${renderConfigCard(data)}
      ${renderPlanCard(data)}
      ${renderDepsCard(data)}
      ${renderDeployCard(data)}
      ${renderTestCard(data)}
      ${renderReleaseCard(data)}
    </div>
  `;
}

// ----------------------------------------------------------------------
// Timeline Helpers
// ----------------------------------------------------------------------
const stageOrder = [
  'demand-intake', 'estimate-shape', 'config-environments', 
  'plan-schedule', 'dependencies', 'build-deploy', 
  'test-quality', 'release-change'
];

function getStageStatus(stage, currentStage, data) {
  const currentIdx = stageOrder.indexOf(currentStage);
  const thisIdx = stageOrder.indexOf(stage);

  if (thisIdx > currentIdx) return 'pending';
  if (thisIdx === currentIdx) return 'current';
  
  // Specific failure checks for past/current stages
  if (stage === 'test-quality' && data.qualityGate && data.qualityGate.verdict === 'FAIL') return 'failed';
  if (stage === 'release-change' && data.releases && data.releases.some(r => r.cab_decision === 'Reject')) return 'failed';
  if (stage === 'build-deploy' && data.deployments && data.deployments.some(d => d.status === 'no-go')) return 'failed';
  
  return 'completed';
}

function renderTimelineNode(label, stageId, currentStage, data) {
  const status = getStageStatus(stageId, currentStage, data);
  let color = 'var(--text-muted)';
  let bg = 'var(--bg-secondary)';
  let border = 'var(--border-color)';
  
  if (status === 'completed') {
    color = 'var(--color-status-green-text)';
    bg = 'var(--color-status-green-bg)';
    border = 'var(--color-status-green-border)';
  } else if (status === 'current') {
    color = 'var(--color-brand)';
    bg = 'rgba(99,102,241,0.1)';
    border = 'var(--color-brand)';
  } else if (status === 'failed') {
    color = 'var(--color-status-red-text)';
    bg = 'var(--color-status-red-bg)';
    border = 'var(--color-status-red-border)';
  }

  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:0.5rem; width: 80px;">
      <div style="width: 24px; height: 24px; border-radius: 50%; background: ${bg}; border: 2px solid ${border}; display:flex; align-items:center; justify-content:center;">
        ${status === 'completed' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:var(--color-status-green-text)"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' : ''}
      </div>
      <div style="font-size: 0.7rem; text-align: center; color: ${color}; font-weight: 600;">${label}</div>
    </div>
  `;
}

function getTimelineLineColor(fromStage, currentStage) {
  const currentIdx = stageOrder.indexOf(currentStage);
  const fromIdx = stageOrder.indexOf(fromStage);
  return fromIdx < currentIdx ? 'var(--color-status-green-border)' : 'var(--border-color)';
}

// ----------------------------------------------------------------------
// Expandable Card Helpers
// ----------------------------------------------------------------------
function renderCard(title, moduleId, status, outputsHtml, approvalsHtml, errorsHtml = '') {
  let statusBadge = `<span style="padding: 0.2rem 0.6rem; font-size: 0.75rem; border-radius: 12px; font-weight: 700; background: var(--bg-tertiary); color: var(--text-secondary);">PENDING</span>`;
  
  if (status === 'Completed' || status === 'Approved') {
    statusBadge = `<span style="padding: 0.2rem 0.6rem; font-size: 0.75rem; border-radius: 12px; font-weight: 700; background: var(--color-status-green-bg); color: var(--color-status-green-text);">${status}</span>`;
  } else if (status === 'In Progress' || status === 'Waiting') {
    statusBadge = `<span style="padding: 0.2rem 0.6rem; font-size: 0.75rem; border-radius: 12px; font-weight: 700; background: rgba(99,102,241,0.1); color: var(--color-brand);">${status}</span>`;
  } else if (status === 'Failed' || status === 'Rejected') {
    statusBadge = `<span style="padding: 0.2rem 0.6rem; font-size: 0.75rem; border-radius: 12px; font-weight: 700; background: var(--color-status-red-bg); color: var(--color-status-red-text);">${status}</span>`;
  }

  return `
    <details class="dashboard-card" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
      <summary style="padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: var(--bg-secondary); outline: none; list-style: none;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <h4 style="margin: 0; font-family: var(--font-display); color: var(--text-primary); font-size: 1.1rem;">${title}</h4>
          ${statusBadge}
        </div>
        <button type="button" onclick="sessionStorage.setItem('selectedDemandId', '${currentProject.demandId}'); window.switchStage('${moduleId}')" style="padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
          View Details &rarr;
        </button>
      </summary>
      <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
        ${errorsHtml ? `<div style="background: var(--color-status-red-bg); border: 1px solid var(--color-status-red-border); padding: 1rem; border-radius: var(--radius-sm); color: var(--color-status-red-text); font-size: 0.85rem;">${errorsHtml}</div>` : ''}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
          <div>
            <h5 style="margin: 0 0 0.75rem 0; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Generated Outputs</h5>
            <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.6;">
              ${outputsHtml || '<span style="color:var(--text-muted);">No outputs yet.</span>'}
            </div>
          </div>
          <div>
            <h5 style="margin: 0 0 0.75rem 0; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Approval History</h5>
            <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.6;">
              ${approvalsHtml || '<span style="color:var(--text-muted);">N/A</span>'}
            </div>
          </div>
        </div>
      </div>
    </details>
  `;
}

// ----------------------------------------------------------------------
// Specific Card Renderers
// ----------------------------------------------------------------------

function renderDemandCard(data) {
  if (!data.demand) return renderCard('Demand & Intake', 'demand-intake', 'Pending', '', '');
  const outputs = `
    • Business Requirement Document (Auto-generated)<br>
    • Priority: <strong>${data.demand.priority}</strong><br>
    • Target Date: ${data.demand.target_date}
  `;
  const approvals = `
    Status: <strong>${data.demand.status}</strong><br>
    Requested By: ${data.demand.business_owner}
  `;
  return renderCard('Demand & Intake', 'demand-intake', data.demand.status === 'approved' ? 'Approved' : 'Completed', outputs, approvals);
}

function renderEstimateCard(data) {
  if (!data.estimate) return renderCard('Estimate & Shape', 'estimate-shape', 'Pending', '', '');
  const outputs = `
    • Effort Estimate: <strong>${data.estimate.effort_days} days</strong><br>
    • Confidence: ${data.estimate.confidence}<br>
    • Risk Factors: ${data.estimate.risk_factors ? data.estimate.risk_factors.join(', ') : 'None'}
  `;
  return renderCard('Estimate & Shape', 'estimate-shape', 'Completed', outputs, '');
}

function renderConfigCard(data) {
  if (!data.environments || !data.environments.length) return renderCard('Config Environments', 'config-environments', 'Pending', '', '');
  const syncCount = data.environments.filter(e => e.drift_status === 'in-sync').length;
  const total = data.environments.length;
  const outputs = `
    • Environments Provisioned: <strong>${total}</strong><br>
    • In-Sync: ${syncCount}<br>
    • Drifted: ${total - syncCount}
  `;
  return renderCard('Config Environments', 'config-environments', syncCount === total ? 'Completed' : 'In Progress', outputs, '');
}

function renderPlanCard(data) {
  if (!data.plan) return renderCard('Plan & Schedule', 'plan-schedule', 'Pending', '', '');
  const outputs = `
    • Project Plan ID: ${data.plan.plan_id}<br>
    • Sprints: ${data.plan.sprints ? data.plan.sprints.length : 0}<br>
    • Status: ${data.plan.status}
  `;
  const approvals = `
    Decision: <strong>${data.plan.human_decision || 'Pending'}</strong>
  `;
  return renderCard('Plan & Schedule', 'plan-schedule', data.plan.human_decision === 'approved' ? 'Approved' : 'In Progress', outputs, approvals);
}

function renderDepsCard(data) {
  if (!data.dependencies || !data.dependencies.length) return renderCard('Dependencies', 'dependencies', 'Pending', '', '');
  const resolvedCount = data.dependencies.filter(d => d.status === 'resolved').length;
  const total = data.dependencies.length;
  const outputs = `
    • Total Dependencies: <strong>${total}</strong><br>
    • Resolved: ${resolvedCount}<br>
    • Blocked: ${data.dependencies.filter(d => d.status === 'blocked').length}
  `;
  return renderCard('Dependencies', 'dependencies', resolvedCount === total ? 'Completed' : 'In Progress', outputs, '');
}

function renderDeployCard(data) {
  if (!data.deployments || !data.deployments.length) return renderCard('Build & Deploy', 'build-deploy', 'Pending', '', '');
  const dep = data.deployments[0];
  const outputs = `
    • Deployment ID: ${dep.deployment_id}<br>
    • Version: ${dep.version || 'unknown'}<br>
    • Cutover Session: ${dep.cutover_id || 'None'}
  `;
  const approvals = `
    Status: <strong>${dep.status}</strong><br>
    Decided By: ${dep.decided_by || 'Pending'}
  `;
  
  let errorsHtml = '';
  if (dep.status === 'no-go') errorsHtml = 'Deployment marked as No-Go. Resolve issues before proceeding.';
  
  const status = dep.status === 'completed' ? 'Completed' : (dep.status === 'no-go' ? 'Failed' : 'In Progress');
  
  return renderCard('Build & Deploy', 'build-deploy', status, outputs, approvals, errorsHtml);
}

function renderTestCard(data) {
  if (!data.testQuality) return renderCard('Test & Quality', 'test-quality', 'Pending', '', '');
  const tq = data.testQuality;
  const outputs = `
    • Passed Tests: <strong>${tq.passed_tests} / ${tq.total_tests}</strong><br>
    • Pass Rate: ${tq.pass_rate_pct}%<br>
    • Open Defects: ${tq.open_defects} (Critical: ${tq.critical_defects})<br>
    • AppSec Findings: ${tq.open_appsec_findings}
  `;
  
  let qgHtml = 'Quality Gate: Not Evaluated';
  let errorsHtml = '';
  let status = 'In Progress';
  if (data.qualityGate) {
    qgHtml = `Quality Gate Verdict: <strong>${data.qualityGate.verdict}</strong> (Score: ${data.qualityGate.score})`;
    if (data.qualityGate.verdict === 'PASS') status = 'Completed';
    else if (data.qualityGate.verdict === 'FAIL') {
      status = 'Failed';
      errorsHtml = 'Quality Gate Failed. Release is blocked until defects/vulnerabilities are resolved.';
    }
  }

  return renderCard('Test & Quality', 'test-quality', status, outputs, qgHtml, errorsHtml);
}

function renderReleaseCard(data) {
  if (!data.releases || !data.releases.length) return renderCard('Release & Change', 'release-change', 'Pending', '', '');
  const rel = data.releases[0];
  const outputs = `
    • Release ID: ${rel.release_id}<br>
    • Summary: ${rel.summary}<br>
    • Risk Class: ${rel.risk_assessment ? rel.risk_assessment.risk_class : 'Unknown'}
  `;
  
  let approvals = 'CAB Decision: Pending';
  let errorsHtml = '';
  let status = 'Waiting';
  
  if (rel.cab_decision) {
    approvals = `
      CAB Decision: <strong>${rel.cab_decision}</strong><br>
      Comments: ${rel.cab_comments}
    `;
    if (rel.cab_decision === 'Approve') status = 'Approved';
    else if (rel.cab_decision === 'Reject') {
      status = 'Rejected';
      errorsHtml = 'CAB Rejected the release request.';
    }
  }

  return renderCard('Release & Change', 'release-change', status, outputs, approvals, errorsHtml);
}

// Global style for detail dropdowns
document.head.insertAdjacentHTML('beforeend', `
<style>
details.dashboard-card > summary::-webkit-details-marker { display: none; }
details.dashboard-card > summary:hover { background: rgba(0,0,0,0.02) !important; }
</style>
`);
