const ESTIMATE_API_BASE = 'http://127.0.0.1:8000/api';
const DEMAND_API_BASE = 'http://127.0.0.1:8000/api'; // To fetch demands

let estimates = [];
let availableDemands = [];
let selectedEstimateId = null;

// Expose to window so shell.js can call it
window.renderEstimateScreen = function() {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Estimates Queue</h3>
          <button class="btn-new" id="btn-new-estimate">+ Generate Estimate</button>
        </div>
        <ul class="demand-list" id="estimate-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Loading estimates...
          </li>
        </ul>
      </aside>
      <main class="details-panel" id="estimate-panel-container">
      </main>
    </div>
  `;

  document.getElementById('btn-new-estimate').addEventListener('click', () => {
    selectedEstimateId = null;
    clearEstimateSidebarSelection();
    showNewEstimateForm();
  });
}

function clearEstimateSidebarSelection() {
  document.querySelectorAll('.demand-item').forEach(item => {
    item.classList.remove('active');
  });
}

window.fetchEstimates = async function() {
  const container = document.getElementById('estimate-list-container');
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    estimates = await res.json();
    renderEstimateList();
    
    if (estimates.length > 0 && selectedEstimateId === null) {
      selectEstimate(estimates[0].estimate_id);
    } else if (selectedEstimateId !== null) {
      selectEstimate(selectedEstimateId);
    } else {
      showNewEstimateForm();
    }
  } catch (err) {
    console.error("Failed to fetch estimates:", err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
          Start FastAPI backend at <code style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">uvicorn main:app --port 8001</code> for estimates.
        </div>
      </li>
    `;
    showNewEstimateForm();
  }
}

function renderEstimateList() {
  const container = document.getElementById('estimate-list-container');
  if (estimates.length === 0) {
    container.innerHTML = `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No estimates found. Generate one.</li>`;
    return;
  }

  container.innerHTML = estimates.map(est => {
    const isActive = est.estimate_id === selectedEstimateId;
    let statusClass = 'gray';
    if (est.status === 'draft') statusClass = 'amber';
    else if (est.status === 'challenged') statusClass = 'amber';
    else if (est.status === 'approved') statusClass = 'green';
    else if (est.status === 're-baselined') statusClass = 'blue';
    
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${est.estimate_id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${est.estimate_id}</span>
          <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${statusClass}">
            ${est.status}
          </span>
        </div>
        <h4 class="demand-item-title">Demand: ${est.demand_id}</h4>
        <div class="demand-item-meta">
          <span>Cost: $${est.cost_estimate}</span>
          <span>Effort: ${est.effort_days}d</span>
        </div>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => {
      selectEstimate(item.getAttribute('data-id'));
    });
  });
}

function selectEstimate(id) {
  selectedEstimateId = id;
  clearEstimateSidebarSelection();
  const activeItem = document.querySelector(`#estimate-list-container .demand-item[data-id="${id}"]`);
  if (activeItem) activeItem.classList.add('active');

  const est = estimates.find(e => e.estimate_id === id);
  if (est) {
    renderEstimateWizard(est);
  }
}

async function showNewEstimateForm() {
  const panel = document.getElementById('estimate-panel-container');
  
  // Fetch available approved demands from stage 01
  try {
    const res = await fetch(`${DEMAND_API_BASE}/demands`);
    if (res.ok) {
        const demands = await res.json();
        availableDemands = demands.filter(d => d.status === 'approved');
    }
  } catch(e) {
    console.error("Could not fetch demands", e);
  }

  const demandOptions = availableDemands.map(d => `<option value="${d.demand_id}">${d.demand_id} - ${d.title}</option>`).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0; margin-bottom: 0.5rem; color: var(--text-primary);">
        Generate Estimate
      </h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Select an approved demand to estimate effort, cost, and duration from historical data.
      </p>

      <div class="error-message" id="estimate-error"></div>

      <div class="form-group">
        <label for="select-demand">Select Approved Demand</label>
        <select id="select-demand">
          <option value="">-- Select a Demand --</option>
          ${demandOptions}
        </select>
      </div>

      <div id="generate-actions-row" class="submit-row" style="margin-top: 2rem;">
        <button type="button" class="btn-primary" id="btn-generate-estimate">Generate Estimate (AI)</button>
      </div>
      
      <div id="estimate-suggestion-container" style="margin-top: 1rem;"></div>
    </div>
  `;

  document.getElementById('btn-generate-estimate').addEventListener('click', handleGenerateEstimate);
}

let pendingEstimateData = null;
let pendingDemandId = null;

async function handleGenerateEstimate() {
  const demandId = document.getElementById('select-demand').value;
  if (!demandId) {
    showEstimateError("Please select a demand first.");
    return;
  }
  
  const demand = availableDemands.find(d => d.demand_id === demandId);
  const actionRow = document.getElementById('generate-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Sizing effort & cost...</span>`;

  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand: demand })
    });

    if (!res.ok) throw new Error("Failed to generate estimate.");
    pendingEstimateData = await res.json();
    pendingDemandId = demandId;
    
    document.getElementById('estimate-suggestion-container').innerHTML = `
      <div class="suggestion-box">
        <h5 class="suggestion-title">Suggested Estimate</h5>
        <div class="grid-2col">
          <div class="data-item"><div class="data-label">Effort Days</div><div class="data-value">${pendingEstimateData.effort_days} (${pendingEstimateData.effort_range_low}-${pendingEstimateData.effort_range_high})</div></div>
          <div class="data-item"><div class="data-label">Cost</div><div class="data-value">$${pendingEstimateData.cost_estimate}</div></div>
          <div class="data-item"><div class="data-label">Duration Weeks</div><div class="data-value">${pendingEstimateData.duration_weeks}</div></div>
          <div class="data-item"><div class="data-label">Confidence</div><div class="data-value" style="text-transform: capitalize;">${pendingEstimateData.confidence}</div></div>
        </div>
      </div>
    `;
    
    actionRow.innerHTML = `
      <button type="button" class="btn-primary" id="btn-approve-generated">Approve Estimate</button>
    `;
    document.getElementById('btn-approve-generated').addEventListener('click', approveGeneratedEstimate);
  } catch (err) {
    showEstimateError(err.message);
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-generate-estimate">Generate Estimate (AI)</button>`;
    document.getElementById('btn-generate-estimate').addEventListener('click', handleGenerateEstimate);
  }
}

async function approveGeneratedEstimate() {
  const actionRow = document.getElementById('generate-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Saving...</span>`;
  
  try {
    const payload = {
        effort_days: pendingEstimateData.effort_days,
        effort_range_low: pendingEstimateData.effort_range_low,
        effort_range_high: pendingEstimateData.effort_range_high,
        cost_estimate: pendingEstimateData.cost_estimate,
        duration_weeks: pendingEstimateData.duration_weeks,
        confidence: pendingEstimateData.confidence,
        methodology: pendingEstimateData.methodology
    };
    
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/approve?demand_id=${pendingDemandId}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Approval failed.");
    const newRecord = await res.json();
    selectedEstimateId = newRecord.estimate_id;
    await window.fetchEstimates();
  } catch (err) {
    showEstimateError(err.message);
  }
}

function showEstimateError(msg) {
  const errorAlert = document.getElementById('estimate-error');
  errorAlert.textContent = msg;
  errorAlert.style.display = 'block';
}

function renderEstimateWizard(est) {
  const panel = document.getElementById('estimate-panel-container');
  
  const isDraft = est.status === 'draft';
  const isChallenged = est.status === 'challenged' || est.status === 'approved' || est.status === 're-baselined';
  const isApproved = est.status === 'approved' || est.status === 're-baselined';
  const isRebaselined = est.status === 're-baselined';

  panel.innerHTML = `
    <div class="panel-card" style="padding-top: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${est.estimate_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary);">Demand: ${est.demand_id}</h2>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Estimate Status</div>
          <status-pill status="${est.status}"></status-pill>
        </div>
      </div>

      <div class="pipeline-wizard">
        
        <!-- STEP 1: INITIAL ESTIMATE -->
        <div class="wizard-step completed">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title"><span class="wizard-step-num">1</span> Estimate Details</h4>
            <status-pill status="Approved"></status-pill>
          </div>
          <div class="wizard-step-body">
            <div class="grid-2col">
              <div class="data-item"><div class="data-label">Effort Days</div><div class="data-value">${est.effort_days} (Range: ${est.effort_range_low}-${est.effort_range_high})</div></div>
              <div class="data-item"><div class="data-label">Cost</div><div class="data-value">$${est.cost_estimate}</div></div>
              <div class="data-item"><div class="data-label">Duration Weeks</div><div class="data-value">${est.duration_weeks}</div></div>
              <div class="data-item"><div class="data-label">Confidence</div><div class="data-value" style="text-transform: capitalize;">${est.confidence}</div></div>
              <div class="data-item"><div class="data-label">Methodology</div><div class="data-value">${est.methodology}</div></div>
            </div>
          </div>
        </div>

        <!-- STEP 2: CHALLENGE ESTIMATE -->
        <div class="wizard-step ${isChallenged ? 'completed' : 'active'}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title"><span class="wizard-step-num">2</span> Challenge & Stress-test</h4>
            <status-pill status="${isChallenged ? 'Approved' : 'Pending Run'}"></status-pill>
          </div>
          <div class="wizard-step-body">
            ${isChallenged ? `
              <div class="data-item">
                <div class="data-label">Risk Factors Identified</div>
                <div class="data-value">
                  ${est.risk_factors && est.risk_factors.length > 0 ? 
                    `<ul style="margin:0; padding-left:1rem;">${est.risk_factors.map(r => `<li>${r}</li>`).join('')}</ul>` 
                    : 'No significant risks identified.'}
                </div>
              </div>
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Stress-test this estimate for optimism bias and missing scope using AI reasoning.
              </p>
              <div id="challenge-suggestion-container"></div>
              <div class="submit-row" id="challenge-actions-row">
                <button type="button" class="btn-primary" id="btn-run-challenge">Run Challenge Agent</button>
              </div>
            `}
          </div>
        </div>

        <!-- STEP 3: RE-BASELINE TRIGGERS -->
        <div class="wizard-step ${isChallenged ? (isRebaselined ? 'completed' : 'active') : ''}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title"><span class="wizard-step-num">3</span> Re-estimate Triggers</h4>
            <status-pill status="${isRebaselined ? 'Approved' : (isChallenged ? 'Monitoring' : 'Locked')}"></status-pill>
          </div>
          <div class="wizard-step-body">
            ${isRebaselined ? `
              <div class="data-item">
                <div class="data-label">Status</div>
                <div class="data-value" style="color: var(--color-status-blue-text);">Re-baselined</div>
              </div>
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Check simulated live scope and actuals to see if a re-baseline is warranted.
              </p>
              <div id="trigger-suggestion-container"></div>
              <div class="submit-row" id="trigger-actions-row">
                <button type="button" class="btn-primary" id="btn-run-trigger" ${!isChallenged ? 'disabled' : ''}>Check Triggers</button>
              </div>
            `}
          </div>
        </div>

      </div>
    </div>
  `;

  if (!isChallenged) {
    document.getElementById('btn-run-challenge').addEventListener('click', () => runChallengeFlow(est.estimate_id));
  }
  
  if (isChallenged && !isRebaselined) {
    document.getElementById('btn-run-trigger').addEventListener('click', () => runTriggerFlow(est.estimate_id));
  }
}

let pendingRiskFactors = [];

async function runChallengeFlow(id) {
  const container = document.getElementById('challenge-suggestion-container');
  const actionRow = document.getElementById('challenge-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Stress-testing estimate...</span>`;
  
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}/challenge`, { method: 'POST' });
    if (!res.ok) throw new Error("Challenge failed.");
    const data = await res.json();
    pendingRiskFactors = data.risk_factors || [];
    
    container.innerHTML = `
      <div class="suggestion-box">
        <h5 class="suggestion-title">Identified Risks</h5>
        <ul style="padding-left:1rem; margin:0; font-size:0.85rem;">
            ${pendingRiskFactors.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-approve-challenge">Accept Risks</button>`;
    document.getElementById('btn-approve-challenge').addEventListener('click', () => approveChallenge(id));
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text);">Error: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-challenge">Retry</button>`;
    document.getElementById('btn-run-challenge').addEventListener('click', () => runChallengeFlow(id));
  }
}

async function approveChallenge(id) {
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}/approve-challenge`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ risk_factors: pendingRiskFactors })
    });
    if (!res.ok) throw new Error("Failed to approve");
    await window.fetchEstimates();
  } catch (err) {
    alert(err.message);
  }
}

async function runTriggerFlow(id) {
  const container = document.getElementById('trigger-suggestion-container');
  const actionRow = document.getElementById('trigger-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Checking anomalies...</span>`;
  
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}/trigger-check`, { method: 'POST' });
    if (!res.ok) throw new Error("Trigger check failed.");
    const data = await res.json();
    
    if (data.rebaseline_warranted) {
        container.innerHTML = `
          <div class="suggestion-box" style="border-color: rgba(239,68,68,0.3)">
            <h5 class="suggestion-title" style="color: var(--color-status-red-text)">Re-baseline Warranted!</h5>
            <p style="font-size:0.85rem; margin:0;">Reason: ${data.rebaseline_reason}</p>
          </div>
        `;
        actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-approve-rebaseline">Approve Re-baseline</button>`;
        document.getElementById('btn-approve-rebaseline').addEventListener('click', () => approveRebaseline(id));
    } else {
        container.innerHTML = `
          <div class="suggestion-box" style="border-color: rgba(52,211,153,0.3)">
            <h5 class="suggestion-title" style="color: var(--color-status-green-text)">All Good</h5>
            <p style="font-size:0.85rem; margin:0;">Forecasts stay honest. No anomalies detected.</p>
          </div>
        `;
        actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-trigger">Check Again</button>`;
        document.getElementById('btn-run-trigger').addEventListener('click', () => runTriggerFlow(id));
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text);">Error: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-trigger">Retry</button>`;
    document.getElementById('btn-run-trigger').addEventListener('click', () => runTriggerFlow(id));
  }
}

async function approveRebaseline(id) {
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}/rebaseline`, { method: 'POST' });
    if (!res.ok) throw new Error("Failed to rebaseline");
    await window.fetchEstimates();
  } catch (err) {
    alert(err.message);
  }
}
