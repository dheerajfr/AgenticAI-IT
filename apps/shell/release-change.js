const RELEASE_CHANGE_API_BASE = 'http://127.0.0.1:8000/api';

let releaseChangePlans = [];
let selectedReleaseChangePlanId = null;

// Core Stage 08 record states for selected plan
let changeRecord = null;
let riskScoreRecord = null;
let cabPackRecord = null;
let collisionRecord = null;
let auditTrailRecord = null;

window.renderReleaseChangeScreen = function() {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar" style="display: flex; flex-direction: column; gap: 1.5rem; max-height: 100%; overflow: hidden;">
        <div class="panel-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 class="sidebar-title" style="margin: 0; font-size: 1rem;">Release Queue</h3>
          </div>
          <ul class="demand-list" id="release-plan-list-container" style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
            <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              Loading plans...
            </li>
          </ul>
        </div>
      </aside>
      <main class="details-panel" id="release-change-panel-container" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;"></main>
    </div>
  `;

  // Dynamically insert premium Stage 8 styles if they aren't loaded yet
  if (!document.getElementById('stage-8-premium-styles')) {
    const style = document.createElement('style');
    style.id = 'stage-8-premium-styles';
    style.textContent = `
      .stage-8-step-container {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .stage-8-step {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .stage-8-step.active {
        border-color: var(--color-brand);
        background: rgba(99, 102, 241, 0.03);
      }
      .stage-8-step-header {
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
      }
      .stage-8-step-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-family: var(--font-display);
        font-size: 0.95rem;
        font-weight: 600;
        margin: 0;
      }
      .stage-8-step-num {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 700;
        transition: all 0.3s;
      }
      .stage-8-step.active .stage-8-step-num {
        background: var(--color-brand);
        color: white;
        box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
      }
      .stage-8-step.completed .stage-8-step-num {
        background: var(--color-status-green-bg);
        color: var(--color-status-green-text);
        border: 1px solid var(--color-status-green-border);
      }
      .stage-8-step-body {
        padding: 1.25rem;
        display: none;
      }
      .stage-8-step.active .stage-8-step-body {
        display: block;
      }
      .stage-8-result-card {
        margin-top: 1rem;
        padding: 1rem;
        background: rgba(0,0,0,0.25);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
      }
      .stage-8-result-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.75rem;
      }
    `;
    document.head.appendChild(style);
  }
};

window.fetchReleaseChange = async function() {
  const container = document.getElementById('release-plan-list-container');
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/plans`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    releaseChangePlans = await res.json();
    renderReleasePlansList();
    if (releaseChangePlans.length > 0) {
      selectReleasePlan(releaseChangePlans[0].plan_id);
    } else {
      const panel = document.getElementById('release-change-panel-container');
      panel.innerHTML = `
        <div class="panel-card" style="justify-content: center; align-items: center; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">📋</div>
          <h3>No plans available</h3>
          <p style="color: var(--text-secondary); max-width: 400px; font-size: 0.9rem;">
            Please generate and approve a plan in the "Plan & schedule" stage first.
          </p>
        </div>
      `;
    }
  } catch (err) {
    console.error("Failed to load release change plans", err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        Backend connection offline.
      </li>
    `;
  }
};

function renderReleasePlansList() {
  const container = document.getElementById('release-plan-list-container');
  container.innerHTML = releaseChangePlans.map(p => {
    const isActive = p.plan_id === selectedReleaseChangePlanId;
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" onclick="selectReleasePlan('${p.plan_id}')">
        <div class="demand-item-header">
          <span class="demand-item-id">${p.plan_id}</span>
          <span style="font-size: 0.7rem; color: var(--color-status-green-text); font-weight: 700; text-transform: uppercase;">Plan Approved</span>
        </div>
        <div class="demand-item-title">Release for ${p.demand_id}</div>
        <div class="demand-item-meta">
          <span>End Date: ${p.end_date}</span>
        </div>
      </li>
    `;
  }).join('');
}

window.selectReleasePlan = async function(planId) {
  selectedReleaseChangePlanId = planId;
  renderReleasePlansList();
  
  const plan = releaseChangePlans.find(p => p.plan_id === planId);
  if (!plan) return;

  // Reset or fetch existing records
  const demandId = plan.demand_id;
  const suffix = demandId.split("-")[-1] || "0068";
  
  changeRecord = null;
  riskScoreRecord = null;
  cabPackRecord = null;
  collisionRecord = null;
  auditTrailRecord = null;

  // Load existing records if available
  try {
    const r1 = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/draft/CHG-${suffix}-1`);
    if (r1.ok) changeRecord = await r1.json();
  } catch(e){}

  try {
    const r2 = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/risk-score/RSK-${suffix}-1`);
    if (r2.ok) riskScoreRecord = await r2.json();
  } catch(e){}

  try {
    const r3 = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/cab-prep/CAB-${suffix}-1`);
    if (r3.ok) cabPackRecord = await r3.json();
  } catch(e){}

  try {
    const r4 = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/collision/COL-${suffix}-1`);
    if (r4.ok) collisionRecord = await r4.json();
  } catch(e){}

  try {
    const r5 = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/audit/AUD-${suffix}-1`);
    if (r5.ok) auditTrailRecord = await r5.json();
  } catch(e){}

  renderReleaseChangePanel(plan);
};

function renderReleaseChangePanel(plan) {
  const panel = document.getElementById('release-change-panel-container');
  const demandId = plan.demand_id;
  const suffix = demandId.split("-").pop();

  // Wizard state indicators
  const step1Class = changeRecord ? 'completed' : 'active';
  const step2Class = riskScoreRecord ? 'completed' : (changeRecord ? 'active' : '');
  const step3Class = cabPackRecord ? 'completed' : (riskScoreRecord ? 'active' : '');
  const step4Class = collisionRecord ? 'completed' : (cabPackRecord ? 'active' : '');
  const step5Class = auditTrailRecord ? 'completed' : (collisionRecord ? 'active' : '');

  panel.innerHTML = `
    <div class="panel-card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; height: 100%; overflow-y: auto;">
      <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <h2 style="margin: 0 0 0.25rem 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; color: #fff;">
          Stage 08: Release & Change Gate
        </h2>
        <span style="font-size: 0.8rem; color: var(--text-muted);">
          Draft change tickets, score risks, run freeze collisions, and generate regulatory compliance audit trails.
        </span>
      </div>

      <div class="stage-8-step-container">
        
        <!-- STEP 1: CHANGE RECORD DRAFTING -->
        <div class="stage-8-step ${step1Class}" id="step-1-card">
          <div class="stage-8-step-header" onclick="toggleStepBody('step-1-body')">
            <h4 class="stage-8-step-title">
              <span class="stage-8-step-num">1</span>
              Draft Change Record
            </h4>
            <span style="font-size: 0.75rem; font-weight: 600;" id="step-1-status">
              ${changeRecord ? '✓ Completed' : 'Pending'}
            </span>
          </div>
          <div class="stage-8-step-body" id="step-1-body" style="${step1Class === 'active' ? 'display:block;' : ''}">
            <div class="grid-2col" style="margin-bottom: 1rem;">
              <div class="form-group">
                <label>Demand ID</label>
                <input type="text" id="draft-demand-id" value="${demandId}" readonly>
              </div>
              <div class="form-group">
                <label>Plan ID</label>
                <input type="text" id="draft-plan-id" value="${plan.plan_id}" readonly>
              </div>
              <div class="form-group">
                <label>Readiness ID</label>
                <input type="text" id="draft-readiness-id" value="RDY-${suffix}-1">
              </div>
              <div class="form-group">
                <label>Quality Gate ID</label>
                <input type="text" id="draft-gate-id" value="QGT-${suffix}-1">
              </div>
              <div class="form-group">
                <label>Test Run ID</label>
                <input type="text" id="draft-test-run-id" value="TR-${suffix}-1">
              </div>
              <div class="form-group">
                <label>Runbook ID</label>
                <input type="text" id="draft-runbook-id" value="RBK-${suffix}-1">
              </div>
            </div>
            <div class="submit-row">
              <button class="btn-primary" onclick="submitDraft('${suffix}')">Draft Change Record</button>
            </div>
            <div id="step-1-result">
              ${changeRecord ? renderChangeRecordResult() : ''}
            </div>
          </div>
        </div>

        <!-- STEP 2: CHANGE RISK SCORING -->
        <div class="stage-8-step ${step2Class}" id="step-2-card">
          <div class="stage-8-step-header" onclick="toggleStepBody('step-2-body')">
            <h4 class="stage-8-step-title">
              <span class="stage-8-step-num">2</span>
              Compute Risk Score
            </h4>
            <span style="font-size: 0.75rem; font-weight: 600;" id="step-2-status">
              ${riskScoreRecord ? '✓ Completed' : 'Locked'}
            </span>
          </div>
          <div class="stage-8-step-body" id="step-2-body" style="${step2Class === 'active' ? 'display:block;' : ''}">
            <div class="grid-2col" style="margin-bottom: 1rem;">
              <div class="form-group">
                <label>Target Components (comma separated)</label>
                <input type="text" id="risk-components" value="svc-payments-api, svc-auth">
              </div>
              <div class="form-group">
                <label>Change Calendar Reference</label>
                <input type="text" id="risk-calendar" value="calendar://freeze-windows/2026-07">
              </div>
            </div>
            <div class="submit-row">
              <button class="btn-primary" onclick="submitRiskScore('${suffix}')">Evaluate Risk Profile</button>
            </div>
            <div id="step-2-result">
              ${riskScoreRecord ? renderRiskScoreResult() : ''}
            </div>
          </div>
        </div>

        <!-- STEP 3: CAB PREPARATION -->
        <div class="stage-8-step ${step3Class}" id="step-3-card">
          <div class="stage-8-step-header" onclick="toggleStepBody('step-3-body')">
            <h4 class="stage-8-step-title">
              <span class="stage-8-step-num">3</span>
              CAB Assembly
            </h4>
            <span style="font-size: 0.75rem; font-weight: 600;" id="step-3-status">
              ${cabPackRecord ? '✓ Completed' : 'Locked'}
            </span>
          </div>
          <div class="stage-8-step-body" id="step-3-body" style="${step3Class === 'active' ? 'display:block;' : ''}">
            <div class="grid-2col" style="margin-bottom: 1rem;">
              <div class="form-group">
                <label>CAB Policy Reference</label>
                <input type="text" id="cab-policy" value="itsm://cab-policy/standard">
              </div>
              <div class="form-group">
                <label>Prior QA Artifact Knowledge base</label>
                <input type="text" id="cab-qa-ref" value="kb://cab-qa/payments">
              </div>
            </div>
            <div class="submit-row">
              <button class="btn-primary" onclick="submitCABPack('${suffix}')">Assemble CAB Pack</button>
            </div>
            <div id="step-3-result">
              ${cabPackRecord ? renderCABPackResult() : ''}
            </div>
          </div>
        </div>

        <!-- STEP 4: COLLISION DETECTION -->
        <div class="stage-8-step ${step4Class}" id="step-4-card">
          <div class="stage-8-step-header" onclick="toggleStepBody('step-4-body')">
            <h4 class="stage-8-step-title">
              <span class="stage-8-step-num">4</span>
              Collision Detection
            </h4>
            <span style="font-size: 0.75rem; font-weight: 600;" id="step-4-status">
              ${collisionRecord ? '✓ Completed' : 'Locked'}
            </span>
          </div>
          <div class="stage-8-step-body" id="step-4-body" style="${step4Class === 'active' ? 'display:block;' : ''}">
            <div class="grid-2col" style="margin-bottom: 1rem;">
              <div class="form-group">
                <label>Environment Freeze Rules Reference</label>
                <input type="text" id="collision-freeze-rules" value="itsm://freeze-rules/july-freeze">
              </div>
            </div>
            <div class="submit-row">
              <button class="btn-primary" onclick="submitCollision('${suffix}')">Detect Collisions</button>
            </div>
            <div id="step-4-result">
              ${collisionRecord ? renderCollisionResult() : ''}
            </div>
          </div>
        </div>

        <!-- STEP 5: REGULATORY AUDIT TRAIL -->
        <div class="stage-8-step ${step5Class}" id="step-5-card">
          <div class="stage-8-step-header" onclick="toggleStepBody('step-5-body')">
            <h4 class="stage-8-step-title">
              <span class="stage-8-step-num">5</span>
              Verify Audit Trail
            </h4>
            <span style="font-size: 0.75rem; font-weight: 600;" id="step-5-status">
              ${auditTrailRecord ? '✓ Completed' : 'Locked'}
            </span>
          </div>
          <div class="stage-8-step-body" id="step-5-body" style="${step5Class === 'active' ? 'display:block;' : ''}">
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Generates a cryptographically signed compliance audit trail aggregating upstream requirements, estimates, and schedules.
            </p>
            <div class="submit-row">
              <button class="btn-primary" onclick="submitAuditTrail('${suffix}')">Aggregate Compliance Trail</button>
            </div>
            <div id="step-5-result">
              ${auditTrailRecord ? renderAuditTrailResult() : ''}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

window.toggleStepBody = function(bodyId) {
  const body = document.getElementById(bodyId);
  if (body) {
    body.style.display = body.style.display === 'block' ? 'none' : 'block';
  }
};

// Step 1: Draft
window.submitDraft = async function(suffix) {
  const payload = {
    demand_id: `DEM-2026-${suffix}`,
    plan_id: `PLN-${suffix}-1`,
    estimate_id: `EST-${suffix}-1`,
    readiness_id: document.getElementById('draft-readiness-id').value,
    gate_id: document.getElementById('draft-gate-id').value,
    test_run_id: document.getElementById('draft-test-run-id').value,
    runbook_id: document.getElementById('draft-runbook-id').value,
    rollback_id: `RBK-ROLLBACK-${suffix}-1`,
    itsm_schema_version: 'v2'
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API call failed");
    changeRecord = await res.json();
    
    // UI update
    document.getElementById('step-1-card').classList.add('completed');
    document.getElementById('step-1-status').textContent = '✓ Completed';
    document.getElementById('step-1-result').innerHTML = renderChangeRecordResult();
    
    // Unlock step 2
    document.getElementById('step-2-card').classList.add('active');
    document.getElementById('step-2-status').textContent = 'Pending';
    toggleStepBody('step-2-body');
  } catch(e) {
    alert("Error drafting change record: " + e.message);
  }
};

function renderChangeRecordResult() {
  return `
    <div class="stage-8-result-card">
      <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand);">Change Record Created</h5>
      <div class="stage-8-result-grid">
        <div class="data-item">
          <div class="data-label">Change ID</div>
          <div class="data-value" style="font-family: monospace; color:#fff;">${changeRecord.change_record_id}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Title</div>
          <div class="data-value">${changeRecord.title}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Scheduled Start</div>
          <div class="data-value" style="font-size: 0.8rem;">${changeRecord.scheduled_start}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Status</div>
          <div class="data-value" style="color:var(--color-status-amber-text); text-transform: uppercase; font-weight:700;">${changeRecord.status}</div>
        </div>
      </div>
    </div>
  `;
}

// Step 2: Risk
window.submitRiskScore = async function(suffix) {
  const componentsText = document.getElementById('risk-components').value;
  const payload = {
    change_record_id: `CHG-${suffix}-1`,
    demand_id: `DEM-2026-${suffix}`,
    component_ids: componentsText.split(',').map(c => c.trim()).filter(Boolean),
    change_calendar_ref: document.getElementById('risk-calendar').value,
    historical_change_outcomes_ref: `itsm://history/${suffix}`
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/risk-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API call failed");
    riskScoreRecord = await res.json();
    
    // UI update
    document.getElementById('step-2-card').classList.add('completed');
    document.getElementById('step-2-status').textContent = '✓ Completed';
    document.getElementById('step-2-result').innerHTML = renderRiskScoreResult();
    
    // Unlock step 3
    document.getElementById('step-3-card').classList.add('active');
    document.getElementById('step-3-status').textContent = 'Pending';
    toggleStepBody('step-3-body');
  } catch(e) {
    alert("Error evaluating risk: " + e.message);
  }
};

function renderRiskScoreResult() {
  const badgeColor = riskScoreRecord.risk_band === 'high' ? 'red' : riskScoreRecord.risk_band === 'medium' ? 'amber' : 'green';
  return `
    <div class="stage-8-result-card">
      <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand);">Risk Profile Evaluated</h5>
      <div class="stage-8-result-grid">
        <div class="data-item">
          <div class="data-label">Risk Score</div>
          <div class="data-value" style="font-size:1.5rem; font-weight:800; color:#fff;">${riskScoreRecord.risk_score} / 100</div>
        </div>
        <div class="data-item">
          <div class="data-label">Risk Band</div>
          <div class="data-value" style="color: var(--color-status-${badgeColor}-text); font-weight:700; text-transform:uppercase;">${riskScoreRecord.risk_band}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Recommended CAB Path</div>
          <div class="data-value" style="text-transform: capitalize;">${riskScoreRecord.recommended_path.replace('-', ' ')}</div>
        </div>
      </div>
      <div style="margin-top:0.75rem; font-size:0.8rem;">
        <strong>Risk Factors:</strong>
        <ul style="padding-left:1.25rem; margin: 0.25rem 0;">
          ${riskScoreRecord.risk_factors.map(f => `<li style="color:var(--text-secondary);">${f}</li>`).join('')}
          ${riskScoreRecord.risk_factors.length === 0 ? '<li style="color:var(--text-muted);">None</li>' : ''}
        </ul>
      </div>
    </div>
  `;
}

// Step 3: CAB Pack
window.submitCABPack = async function(suffix) {
  const payload = {
    change_record_id: `CHG-${suffix}-1`,
    risk_score_id: `RSK-${suffix}-1`,
    cab_policy_ref: document.getElementById('cab-policy').value,
    prior_qa_ref: document.getElementById('cab-qa-ref').value
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/cab-prep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API call failed");
    cabPackRecord = await res.json();
    
    // UI update
    document.getElementById('step-3-card').classList.add('completed');
    document.getElementById('step-3-status').textContent = '✓ Completed';
    document.getElementById('step-3-result').innerHTML = renderCABPackResult();
    
    // Unlock step 4
    document.getElementById('step-4-card').classList.add('active');
    document.getElementById('step-4-status').textContent = 'Pending';
    toggleStepBody('step-4-body');
  } catch(e) {
    alert("Error preparing CAB pack: " + e.message);
  }
};

function renderCABPackResult() {
  return `
    <div class="stage-8-result-card">
      <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand);">CAB Pack Assembled</h5>
      <div class="stage-8-result-grid">
        <div class="data-item">
          <div class="data-label">Pack ID</div>
          <div class="data-value" style="font-family: monospace;">${cabPackRecord.cab_pack_id}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Assembled At</div>
          <div class="data-value" style="font-size:0.8rem;">${new Date(cabPackRecord.assembled_at).toLocaleString()}</div>
        </div>
        <div class="data-item">
          <div class="data-label">CAB Status</div>
          <div class="data-value" style="color:var(--color-status-amber-text); text-transform:uppercase; font-weight:700;">${cabPackRecord.status}</div>
        </div>
      </div>
      <div style="margin-top:0.75rem; font-size:0.8rem; background:rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px;">
        <strong>Anticipated QA Question:</strong>
        <div style="color:var(--text-primary); margin-top:0.2rem; font-style:italic;">"${cabPackRecord.anticipated_qa[0].question}"</div>
        <div style="color:var(--color-status-green-text); margin-top:0.1rem;">Answer: ${cabPackRecord.anticipated_qa[0].answer}</div>
      </div>
    </div>
  `;
}

// Step 4: Collision
window.submitCollision = async function(suffix) {
  const payload = {
    change_record_id: `CHG-${suffix}-1`,
    component_ids: ['svc-payments-api', 'svc-auth'],
    scheduled_start: '2026-07-14T22:00:00Z',
    scheduled_end: '2026-07-15T02:00:00Z',
    change_calendar_ref: 'itsm://calendar/2026-07',
    freeze_rules_ref: document.getElementById('collision-freeze-rules').value
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/collision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API call failed");
    collisionRecord = await res.json();
    
    // UI update
    document.getElementById('step-4-card').classList.add('completed');
    document.getElementById('step-4-status').textContent = '✓ Completed';
    document.getElementById('step-4-result').innerHTML = renderCollisionResult();
    
    // Unlock step 5
    document.getElementById('step-5-card').classList.add('active');
    document.getElementById('step-5-status').textContent = 'Pending';
    toggleStepBody('step-5-body');
  } catch(e) {
    alert("Error evaluating collisions: " + e.message);
  }
};

function renderCollisionResult() {
  const badgeColor = collisionRecord.safe_to_proceed ? 'green' : 'red';
  const label = collisionRecord.safe_to_proceed ? 'Safe to Proceed' : 'Conflicts Detected';
  return `
    <div class="stage-8-result-card">
      <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-brand);">Collision Check Completed</h5>
      <div class="stage-8-result-grid">
        <div class="data-item">
          <div class="data-label">Safety Status</div>
          <div class="data-value" style="color: var(--color-status-${badgeColor}-text); font-weight:700; text-transform:uppercase;">${label}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Evaluated At</div>
          <div class="data-value" style="font-size:0.8rem;">${new Date(collisionRecord.evaluated_at).toLocaleString()}</div>
        </div>
      </div>
      ${collisionRecord.freeze_window_conflicts.length > 0 ? `
        <div style="margin-top:0.75rem; border-left: 3px solid var(--color-status-red-text); padding-left: 0.5rem; font-size:0.8rem; color:var(--color-status-red-text);">
          <strong>Warnings:</strong>
          <div style="margin-top:0.1rem;">${collisionRecord.freeze_window_conflicts[0]}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// Step 5: Audit
window.submitAuditTrail = async function(suffix) {
  const payload = {
    demand_id: `DEM-2026-${suffix}`,
    change_record_id: `CHG-${suffix}-1`,
    event_sources: [
      "demand-intake", "estimate-shape", "plan-schedule",
      "dependencies", "config-environments",
      "release-readiness", "quality-gate", "cab-prep"
    ]
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/release-change/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API call failed");
    auditTrailRecord = await res.json();
    
    // UI update
    document.getElementById('step-5-card').classList.add('completed');
    document.getElementById('step-5-status').textContent = '✓ Completed';
    document.getElementById('step-5-result').innerHTML = renderAuditTrailResult();
  } catch(e) {
    alert("Error generating audit trail: " + e.message);
  }
};

function renderAuditTrailResult() {
  return `
    <div class="stage-8-result-card" style="border: 1px solid var(--color-status-green-border); background: rgba(16, 185, 129, 0.03);">
      <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--color-status-green-text);">Compliance Audit Trail Certified</h5>
      <div class="stage-8-result-grid" style="margin-bottom:0.75rem;">
        <div class="data-item">
          <div class="data-label">Audit Certificate ID</div>
          <div class="data-value" style="font-family: monospace;">${auditTrailRecord.audit_id}</div>
        </div>
        <div class="data-item">
          <div class="data-label">Regulatory Ready</div>
          <div class="data-value" style="color:var(--color-status-green-text); font-weight:700;">TRUE</div>
        </div>
      </div>
      <div class="data-item" style="margin-bottom: 0.75rem;">
        <div class="data-label">Cryptographic Immutable Hash</div>
        <div class="data-value" style="font-family: monospace; font-size: 0.75rem; color:#fff; word-break: break-all; background: rgba(0,0,0,0.3); padding:0.4rem; border-radius: 4px; border: 1px solid var(--border-color);">${auditTrailRecord.immutable_hash}</div>
      </div>
      <div style="font-size:0.75rem;">
        <strong>Aggregated Pipeline Logs:</strong>
        <div style="margin-top:0.3rem; display:flex; flex-direction:column; gap:0.3rem;">
          ${auditTrailRecord.events.map(ev => `
            <div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.02); padding:0.25rem 0.5rem; border-radius:3px;">
              <span style="color:var(--color-brand); font-family:monospace;">${ev.action}</span>
              <span style="color:var(--text-muted); font-size:0.7rem;">${ev.actor}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
