const ESTIMATE_API_BASE = '/api';
const DEMAND_API_BASE = '/api'; // To fetch demands

let estimates = [];
let availableDemands = [];
let selectedEstimateId = null;

// Expose to window so shell.js can call it
window.renderEstimateScreen = function () {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar">
        <div class="sidebar-search" style="padding: 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
        <ul class="demand-list" id="estimate-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Loading estimates...
          </li>
        </ul>
      </aside>
      <main class="details-panel" style="display: flex; flex-direction: column;">
        <header class="main-panel-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 1.25rem;">Estimates Queue</h2>
          <div id="estimate-dropdown-container"></div>
        </header>
        <div id="estimate-panel-container" style="flex: 1; overflow-y: auto;">
        </div>
      </main>
    </div>
  `;
}

window.selectEstimateAction = function(demandId) {
  if (demandId === 'new') {
    sessionStorage.removeItem('selectedDemandId');
    selectedEstimateId = null;
    clearEstimateSidebarSelection();
    showNewEstimateForm();
    return;
  }
  sessionStorage.setItem('selectedDemandId', demandId);
  const matchedEst = estimates.find(e => e.demand_id === demandId);
  if (matchedEst) {
    selectEstimate(matchedEst.estimate_id);
  } else {
    selectedEstimateId = null;
    clearEstimateSidebarSelection();
    showNewEstimateForm();
    setTimeout(() => {
      const selectEl = document.getElementById('select-demand');
      if (selectEl) {
        selectEl.value = demandId;
        selectEl.dispatchEvent(new Event('change'));
      }
    }, 100);
  }
};

function clearEstimateSidebarSelection() {
  document.querySelectorAll('.demand-item').forEach(item => {
    item.classList.remove('active');
  });
}

let allDemands = [];

window.fetchEstimates = async function () {
  const container = document.getElementById('estimate-list-container');
  try {
    try {
      const dRes = await fetch(`${DEMAND_API_BASE}/demands`);
      if (dRes.ok) {
        allDemands = await dRes.json();
      }
    } catch (e) {
      console.error("Could not fetch demands for title mapping", e);
    }

    const res = await fetch(`${ESTIMATE_API_BASE}/estimates`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    estimates = await res.json();
    renderEstimateList();

    // Check if we arrived from the Demand module with a specific demand pre-selected
    const pendingDemandId = sessionStorage.getItem('pendingEstimateDemandId');
    if (pendingDemandId) {
      sessionStorage.removeItem('pendingEstimateDemandId');
      selectedEstimateId = null;
      clearEstimateSidebarSelection();
      // Open new estimate form and auto-select the demand
      await showNewEstimateForm();
      setTimeout(() => {
        const selectEl = document.getElementById('select-demand');
        if (selectEl) {
          selectEl.value = pendingDemandId;
          // Trigger change event to show any associated UI
          selectEl.dispatchEvent(new Event('change'));
        }
      }, 80);
      return;
    }
    const activeDemandId = sessionStorage.getItem('selectedDemandId');
    const matchedEst = activeDemandId ? estimates.find(e => e.demand_id === activeDemandId) : null;
    
    if (activeDemandId && !matchedEst) {
      // No estimate exists for this demand, auto-open creation
      window.selectEstimateAction(activeDemandId);
    } else if (matchedEst && selectedEstimateId === null) {
      selectEstimate(matchedEst.estimate_id);
    } else if (estimates.length > 0 && selectedEstimateId === null) {
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
  const dropdownContainer = document.getElementById('estimate-dropdown-container');
  
  if (dropdownContainer && allDemands) {
    const activeDemandId = sessionStorage.getItem('selectedDemandId');
    const optionsHtml = allDemands.map(d => `<option value="${d.demand_id}" ${d.demand_id === activeDemandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
    dropdownContainer.innerHTML = `
      <select onchange="window.selectEstimateAction(this.value)" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
        <option value="new" ${!activeDemandId ? 'selected' : ''}>+ Create New Estimate</option>
        ${optionsHtml}
      </select>
    `;
  }

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

    const demand = allDemands.find(d => d.demand_id === est.demand_id);
    const displayTitle = demand ? demand.title : est.demand_id;

    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${est.estimate_id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${est.demand_id}</span>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${statusClass}">
              ${est.status}
            </span>
            <button type="button" class="btn-queue-delete" data-id="${est.estimate_id}" style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 0.2rem; display: flex; align-items: center; justify-content: center; opacity: 0.7; " title="Delete Estimate" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <h4 class="demand-item-title">Demand: ${displayTitle}</h4>
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

  container.querySelectorAll('.btn-queue-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent selectEstimate from firing
      const id = btn.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this estimate? This cannot be undone.')) {
        try {
          const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete estimate.");
          if (selectedEstimateId === id) {
            selectedEstimateId = null;
          }
          await window.fetchEstimates();
        } catch (err) {
          alert(err.message);
        }
      }
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
  } catch (e) {
    console.error("Could not fetch demands", e);
  }

  const demandOptions = availableDemands.map(d => `<option value="${d.demand_id}">${d.demand_id} - ${d.title}</option>`).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0; margin-bottom: 0.5rem; color: var(--text-primary);">
        Generate Estimate
      </h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Select an approved demand to estimate effort, cost, and duration.
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
let pendingRebaselineReason = null;

async function handleGenerateEstimate() {
  const demandId = document.getElementById('select-demand').value;
  if (!demandId) {
    showEstimateError("Please select a demand first.");
    return;
  }

  const demand = availableDemands.find(d => d.demand_id === demandId);
  const actionRow = document.getElementById('generate-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Sizing effort & cost...</span>`;

  const reqBody = { demand: demand };
  if (pendingRebaselineReason) {
    reqBody.rebaseline_reason = pendingRebaselineReason;
  }

  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    pendingRebaselineReason = null;

    if (!res.ok) throw new Error("Failed to generate estimate.");
    pendingEstimateData = await res.json();
    pendingDemandId = demandId;

    document.getElementById('estimate-suggestion-container').innerHTML = `
      <div class="suggestion-box" style="padding: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary); margin-top: 1rem;">
        <h5 class="suggestion-title" style="margin-top: 0; margin-bottom: 1rem; font-size: 1rem; color: var(--text-primary); font-family: var(--font-display);">Adjust & Verify Estimate</h5>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Effort Days</label>
            <input type="number" id="input-effort-days" value="${pendingEstimateData.effort_days}" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box;" min="2" />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Cost ($)</label>
            <input type="number" id="input-cost" value="${pendingEstimateData.cost_estimate}" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box;" />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Range Low</label>
            <input type="number" id="input-effort-low" value="${pendingEstimateData.effort_range_low}" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box;" min="2" />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Range High</label>
            <input type="number" id="input-effort-high" value="${pendingEstimateData.effort_range_high}" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box;" min="2" />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Duration (Weeks)</label>
            <input type="number" id="input-duration" value="${pendingEstimateData.duration_weeks}" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box;" min="1" />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Confidence</label>
            <select id="input-confidence" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box; cursor: pointer;">
              <option value="low" ${pendingEstimateData.confidence === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${pendingEstimateData.confidence === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${pendingEstimateData.confidence === 'high' ? 'selected' : ''}>High</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">ARB Required?</label>
            <select id="input-arb" style="padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; box-sizing: border-box; cursor: pointer;">
              <option value="false" ${!pendingEstimateData.requires_arb ? 'selected' : ''}>No</option>
              <option value="true" ${pendingEstimateData.requires_arb ? 'selected' : ''}>Yes</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
            <label style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Estimate Rationale / Reasoning</label>
            <textarea id="input-reasoning" style="padding: 0.45rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; height: 75px; box-sizing: border-box; font-family: var(--font-sans); font-size: 0.85rem; resize: vertical; line-height: 1.45;">${pendingEstimateData.reasoning || ''}</textarea>
          </div>
        </div>
        
        <div style="margin-top: 1rem;">
          <div class="data-label" style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.25rem;">Risk Factors</div>
          <ul style="margin: 0; padding-left: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
            ${pendingEstimateData.risk_factors.map(r => `<li>${r}</li>`).join('')}
          </ul>
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
       effort_days: parseInt(document.getElementById('input-effort-days').value),
       effort_range_low: parseInt(document.getElementById('input-effort-low').value),
       effort_range_high: parseInt(document.getElementById('input-effort-high').value),
       cost_estimate: parseInt(document.getElementById('input-cost').value),
       duration_weeks: parseInt(document.getElementById('input-duration').value),
       confidence: document.getElementById('input-confidence').value,
       methodology: pendingEstimateData.methodology,
       risk_factors: pendingEstimateData.risk_factors || [],
       requires_arb: document.getElementById('input-arb').value === 'true',
       reasoning: document.getElementById('input-reasoning').value,
       status: pendingEstimateData.suggested_status || 'draft'
     };
 
     const res = await fetch(`${ESTIMATE_API_BASE}/estimates/approve?demand_id=${pendingDemandId}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload)
     });

    if (!res.ok) throw new Error("Approval failed.");
    const newRecord = await res.json();
    selectedEstimateId = newRecord.estimate_id;
    // Handoff to Plan module
    sessionStorage.setItem('pendingPlanEstimateId', newRecord.estimate_id);
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

  const demand = allDemands.find(d => d.demand_id === est.demand_id);
  const displayTitle = demand ? demand.title : est.demand_id;

  const isDraft = est.status === 'draft';
  const isApproved = est.status === 'approved' || est.status === 're-baselined';
  const isRebaselined = est.status === 're-baselined';
  const isFinalized = est.status === 'approved' && est.rebaseline_reason != null;

  panel.innerHTML = `
    <div class="panel-card" style="padding-top: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${est.demand_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary);">Demand: ${displayTitle}</h2>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Estimate Status</div>
            <status-pill status="${est.status}"></status-pill>
          </div>
          <button type="button" class="btn-secondary" id="btn-delete-estimate" style="color: var(--color-status-red-text); border-color: var(--color-status-red-text); padding: 0.25rem 0.5rem; font-size: 0.75rem;">Delete Estimate</button>
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
              <div class="data-item"><div class="data-label">Methodology</div><div class="data-value">${est.methodology === 'comparable-history' ? 'LLM prediction' : est.methodology}</div></div>
              <div class="data-item"><div class="data-label">ARB Required</div><div class="data-value">${est.requires_arb ? 'Yes' : 'No'}</div></div>
            </div>
            ${est.reasoning ? `
            <div style="margin-top: 1rem;">
              <div class="data-label">Estimate Rationale / Reasoning</div>
              <div class="data-value" style="font-size: 0.85rem; line-height: 1.5; color: var(--text-secondary); background: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">${est.reasoning}</div>
            </div>
            ` : ''}
            <div style="margin-top: 1rem;">
              <div class="data-label">Risk Factors Identified</div>
              <div class="data-value">
                ${est.risk_factors && est.risk_factors.length > 0 ?
      `<ul style="margin:0; padding-left:1rem;">${est.risk_factors.map(r => `<li>${r}</li>`).join('')}</ul>`
      : 'No significant risks identified.'}
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 2: RE-BASELINE TRIGGERS -->
        <div class="wizard-step ${isApproved ? (isRebaselined || isFinalized ? 'completed' : 'active') : ''}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title"><span class="wizard-step-num">2</span> Re-estimate Triggers</h4>
            <status-pill status="${isRebaselined || isFinalized ? 'Approved' : (isApproved ? 'Monitoring' : 'Locked')}"></status-pill>
          </div>
          <div class="wizard-step-body">
            ${isRebaselined || isFinalized ? `
              <div class="data-item">
                <div class="data-label">Status</div>
                <div class="data-value" style="color: var(--color-status-${isRebaselined ? 'blue' : 'green'}-text);">${isRebaselined ? 'Re-baselined' : 'Approved (No Anomalies)'}</div>
              </div>
              <div class="data-item" style="margin-top: 1rem; grid-column: span 2;">
                <div class="data-label">${isRebaselined ? 'Re-baseline Reason' : 'Finalization Note'}</div>
                <div class="data-value">${est.rebaseline_reason || 'No reason recorded'}</div>
              </div>
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Check simulated live scope and actuals to see if a re-baseline is warranted.
              </p>
              <div id="trigger-suggestion-container"></div>
              <div class="submit-row" id="trigger-actions-row">
                <button type="button" class="btn-primary" id="btn-run-trigger" ${!isApproved ? 'disabled' : ''}>Check Triggers</button>
              </div>
            `}
          </div>
        </div>

      </div>

      ${(isApproved || isRebaselined) ? `
        <!-- Next Step + Redo CTAs for approved estimates -->
        <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
          <button type="button" id="btn-redo-estimate"
            style="display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-secondary); "
            onmouseover="this.style.borderColor='var(--color-brand)';this.style.color='var(--color-brand)';"
            onmouseout="this.style.borderColor='var(--border-color)';this.style.color='var(--text-secondary)';"
          >&#x21ba; Re-estimate</button>
          <div style="flex:1;"></div>
          <button type="button" id="btn-proceed-to-plan"
            style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.2rem; border-radius: var(--radius-sm); font-size: 0.88rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg, #6366f1, #4f46e5); color: var(--text-primary); box-shadow: 0 2px 8px rgba(99,102,241,0.35); "
            onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(99,102,241,0.5)';"
            onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(99,102,241,0.35)';"
          >
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            Next: Create Plan &nbsp;→
          </button>
        </div>
      ` : ''}
    </div>
  `;

  if (isApproved && !isRebaselined && !isFinalized) {
    document.getElementById('btn-run-trigger').addEventListener('click', () => runTriggerFlow(est.estimate_id));
  }

  if (isApproved || isRebaselined) {
    const proceedBtn = document.getElementById('btn-proceed-to-plan');
    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        sessionStorage.setItem('pendingPlanEstimateId', est.estimate_id);
        window.switchStage('plan-schedule');
      });
    }
    const redoBtn = document.getElementById('btn-redo-estimate');
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
        selectedEstimateId = null;
        clearEstimateSidebarSelection();
        showNewEstimateForm().then(() => {
          setTimeout(() => {
            const selectEl = document.getElementById('select-demand');
            if (selectEl) selectEl.value = est.demand_id;
          }, 80);
        });
      });
    }
  }

  const deleteBtn = document.getElementById('btn-delete-estimate');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this estimate? This cannot be undone.')) {
        try {
          const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${est.estimate_id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete estimate.");
          selectedEstimateId = null;
          await window.fetchEstimates();
        } catch (err) {
          alert(err.message);
        }
      }
    });
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
      actionRow.innerHTML = `
          <button type="button" class="btn-primary" id="btn-approve-rebaseline">Approve Re-baseline</button>
          <button type="button" class="btn-secondary" id="btn-revise-estimate" style="margin-left: 0.5rem; border-color: var(--color-status-amber-text); color: var(--color-status-amber-text);">Revise Estimate</button>
        `;
      document.getElementById('btn-approve-rebaseline').addEventListener('click', () => approveRebaseline(id, data.rebaseline_reason));
      document.getElementById('btn-revise-estimate').addEventListener('click', () => {
        pendingRebaselineReason = data.rebaseline_reason;
        const est = estimates.find(e => e.estimate_id === id);
        if (est) {
          selectedEstimateId = null;
          clearEstimateSidebarSelection();
          showNewEstimateForm();
          setTimeout(() => {
            const selectEl = document.getElementById('select-demand');
            if (selectEl) selectEl.value = est.demand_id;
            const btnGen = document.getElementById('btn-generate-estimate');
            if (btnGen) btnGen.click();
          }, 100);
        }
      });
    } else {
      container.innerHTML = `
          <div class="suggestion-box" style="border-color: rgba(52,211,153,0.3)">
            <h5 class="suggestion-title" style="color: var(--color-status-green-text)">All Good</h5>
            <p style="font-size:0.85rem; margin:0;">Forecasts stay honest. No anomalies detected.</p>
            <p style="font-size:0.85rem; margin: 0.5rem 0 0 0; color: var(--text-secondary);">Reason: ${data.rebaseline_reason || 'Resource pool is healthy'}</p>
          </div>
        `;
      actionRow.innerHTML = `
          <button type="button" class="btn-primary" id="btn-final-approve">Final Approve</button>
          <button type="button" class="btn-secondary" id="btn-run-trigger" style="margin-left: 0.5rem;">Check Again</button>
        `;
      document.getElementById('btn-final-approve').addEventListener('click', () => finalApproveEstimate(id, data.rebaseline_reason));
      document.getElementById('btn-run-trigger').addEventListener('click', () => runTriggerFlow(id));
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text);">Error: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-trigger">Retry</button>`;
    document.getElementById('btn-run-trigger').addEventListener('click', () => runTriggerFlow(id));
  }
}

async function approveRebaseline(id, reason) {
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}/rebaseline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || "No reason provided" })
    });
    if (!res.ok) throw new Error("Failed to rebaseline");
    await window.fetchEstimates();
  } catch (err) {
    alert(err.message);
  }
}

async function finalApproveEstimate(id, reason) {
  const actionRow = document.getElementById('trigger-actions-row');
  if (actionRow) {
    actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Finalizing...</span>`;
  }
  try {
    const res = await fetch(`${ESTIMATE_API_BASE}/estimates/${id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || "No anomalies detected" })
    });
    if (!res.ok) throw new Error("Failed to finalize estimate");
    await window.fetchEstimates();
  } catch (err) {
    alert(err.message);
    runTriggerFlow(id); // reset
  }
}
