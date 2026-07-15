const DEPLOY_API_BASE = 'http://127.0.0.1:8000/api/deployments';

let runbooks = [];
let cutoverSessions = [];
let deployments = [];
let activeDeployTab = 'runbooks'; // 'runbooks' | 'cutover' | 'orchestration'
let selectedRunbookId = null;
let selectedCutoverId = null;
let selectedDeploymentId = null;

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
          <button class="btn-new" id="btn-refresh-deploy">↻ Refresh</button>
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
  document.getElementById('tab-runbooks').addEventListener('click', () => switchDeployTab('runbooks'));
  document.getElementById('tab-cutover').addEventListener('click', () => switchDeployTab('cutover'));
  document.getElementById('tab-orchestration').addEventListener('click', () => switchDeployTab('orchestration'));
};

function switchDeployTab(tab) {
  activeDeployTab = tab;
  selectedRunbookId = null;
  selectedCutoverId = null;
  selectedDeploymentId = null;
  window.renderBuildDeployScreen();
  window.fetchBuildDeployData();
}

window.fetchBuildDeployData = async function () {
  const container = document.getElementById('deploy-list-container');
  try {
    const [rbRes, cutRes, depRes] = await Promise.all([
      fetch(`${DEPLOY_API_BASE}/runbooks`),
      fetch(`${DEPLOY_API_BASE}/cutover`),
      fetch(`${DEPLOY_API_BASE}/orchestration`)
    ]);
    if (!rbRes.ok || !cutRes.ok || !depRes.ok) throw new Error(`HTTP Error`);
    runbooks = await rbRes.json();
    cutoverSessions = await cutRes.json();
    deployments = await depRes.json();

    renderDeployList();

    if (activeDeployTab === 'runbooks') {
      if (selectedRunbookId && !runbooks.some(r => r.runbook_id === selectedRunbookId)) selectedRunbookId = null;
      if (!selectedRunbookId) showNewRunbookForm();
      else selectRunbook(selectedRunbookId);
    } else if (activeDeployTab === 'cutover') {
      if (selectedCutoverId && !cutoverSessions.some(c => c.cutover_id === selectedCutoverId)) selectedCutoverId = null;
      if (!selectedCutoverId) showNewCutoverForm();
      else selectCutover(selectedCutoverId);
    } else {
      if (selectedDeploymentId && !deployments.some(d => d.deployment_id === selectedDeploymentId)) selectedDeploymentId = null;
      if (!selectedDeploymentId) showNewDeploymentForm();
      else selectDeployment(selectedDeploymentId);
    }
  } catch (err) {
    console.error('Failed to fetch build-deploy data:', err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">Make sure gateway server is running.</div>
      </li>
    `;
  }
};

function renderDeployList() {
  const container = document.getElementById('deploy-list-container');
  const items = activeDeployTab === 'runbooks' ? runbooks : activeDeployTab === 'cutover' ? cutoverSessions : deployments;
  const idField = activeDeployTab === 'runbooks' ? 'runbook_id' : activeDeployTab === 'cutover' ? 'cutover_id' : 'deployment_id';
  const selectedId = activeDeployTab === 'runbooks' ? selectedRunbookId : activeDeployTab === 'cutover' ? selectedCutoverId : selectedDeploymentId;

  const newBtnLabel = activeDeployTab === 'runbooks' ? '+ Draft Runbook' : activeDeployTab === 'cutover' ? '+ Start Cutover' : '+ Start Deployment';
  let html = `<li style="padding: 0.75rem 1rem;">
    <button class="btn-new" id="btn-new-deploy-item" style="width: 100%;">${newBtnLabel}</button>
  </li>`;

  if (items.length === 0) {
    html += `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No records yet.</li>`;
  } else {
    html += items.map(item => {
      const isActive = item[idField] === selectedId;
      const title = activeDeployTab === 'runbooks' ? item.title
        : activeDeployTab === 'cutover' ? `Cutover — ${item.component_id}`
        : `Deployment — ${item.component_id} (${item.environment})`;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" data-id="${item[idField]}">
          <div class="demand-item-header">
            <span class="demand-item-id">${item[idField]}</span>
            <status-pill status="${item.status}"></status-pill>
          </div>
          <h4 class="demand-item-title">${title}</h4>
          <div class="demand-item-meta"><span>${item.component_id}</span></div>
        </li>
      `;
    }).join('');
  }

  container.innerHTML = html;

  document.getElementById('btn-new-deploy-item').addEventListener('click', () => {
    if (activeDeployTab === 'runbooks') { selectedRunbookId = null; showNewRunbookForm(); }
    else if (activeDeployTab === 'cutover') { selectedCutoverId = null; showNewCutoverForm(); }
    else { selectedDeploymentId = null; showNewDeploymentForm(); }
    renderDeployList();
  });

  container.querySelectorAll('.demand-item[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      if (activeDeployTab === 'runbooks') selectRunbook(id);
      else if (activeDeployTab === 'cutover') selectCutover(id);
      else selectDeployment(id);
    });
  });
}

// ---------------------------------------------------------------------------
// Runbook drafting
// ---------------------------------------------------------------------------

function showNewRunbookForm() {
  const panel = document.getElementById('deploy-panel-container');
  const priorOptions = runbooks.map(r => `<option value="${r.runbook_id}">${r.runbook_id} — ${r.title}</option>`).join('');
  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0;">Draft a Runbook</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Drafts and maintains deployment runbooks from the change and prior runbooks.
      </p>
      <div class="form-group">
        <label for="rbk-component">Component ID *</label>
        <input type="text" id="rbk-component" placeholder="e.g. svc-payments-api">
      </div>
      <div class="form-group">
        <label for="rbk-change-summary">Change Summary *</label>
        <textarea id="rbk-change-summary" placeholder="What is being deployed and why..."></textarea>
      </div>
      <div class="form-group">
        <label for="rbk-arch-notes">Architecture Notes</label>
        <textarea id="rbk-arch-notes" placeholder="Relevant architecture context (optional)"></textarea>
      </div>
      <div class="grid-2col">
        <div class="form-group">
          <label for="rbk-change-ref">Change Record Ref</label>
          <input type="text" id="rbk-change-ref" placeholder="e.g. CHG-2026-0091">
        </div>
        <div class="form-group">
          <label for="rbk-prior">Prior Runbook (reuse steps)</label>
          <select id="rbk-prior">
            <option value="">None</option>
            ${priorOptions}
          </select>
        </div>
      </div>
      <div class="error-message" id="rbk-error"></div>
      <div class="submit-row">
        <button type="button" class="btn-primary" id="btn-draft-runbook">Draft Runbook</button>
      </div>
    </div>
  `;

  document.getElementById('btn-draft-runbook').addEventListener('click', async () => {
    const component_id = document.getElementById('rbk-component').value.trim();
    const change_summary = document.getElementById('rbk-change-summary').value.trim();
    const architecture_notes = document.getElementById('rbk-arch-notes').value.trim() || null;
    const change_record_ref = document.getElementById('rbk-change-ref').value.trim() || null;
    const prior_runbook_id = document.getElementById('rbk-prior').value || null;
    const errorBox = document.getElementById('rbk-error');
    errorBox.style.display = 'none';

    if (!component_id || !change_summary) {
      errorBox.textContent = 'Component ID and Change Summary are required.';
      errorBox.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btn-draft-runbook');
    btn.disabled = true;
    btn.innerHTML = `<span class="loader"><span class="spinner"></span> Drafting...</span>`;

    try {
      const res = await fetch(`${DEPLOY_API_BASE}/runbooks/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component_id, change_summary, architecture_notes, change_record_ref, prior_runbook_id })
      });
      if (!res.ok) throw new Error('Failed to draft runbook.');
      const record = await res.json();
      selectedRunbookId = record.runbook_id;
      await window.fetchBuildDeployData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Draft Runbook';
    }
  });
}

function selectRunbook(id) {
  selectedRunbookId = id;
  document.querySelectorAll('#deploy-list-container .demand-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === id);
  });
  const record = runbooks.find(r => r.runbook_id === id);
  if (!record) return;
  renderRunbookDetails(record);
}

function renderRunbookDetails(record) {
  const panel = document.getElementById('deploy-panel-container');
  const totalMinutes = record.steps.reduce((sum, s) => sum + (s.estimated_minutes || 0), 0);

  panel.innerHTML = `
    <div class="panel-card">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
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

      <div class="data-label" style="margin-bottom: 0.5rem;">Steps</div>
      <ul class="step-track">
        ${record.steps.map(s => `
          <li class="step-row">
            <div style="flex: 1;">
              <div class="step-desc">${s.description}</div>
              <div class="step-meta">${s.step_type} · ${s.environment} · ${s.owner} · ~${s.estimated_minutes}min</div>
            </div>
          </li>
        `).join('')}
      </ul>

      <div class="submit-row" style="margin-top: 1.5rem;">
        ${record.status === 'draft' ? `<button type="button" class="btn-secondary" id="btn-submit-review">Submit for SME Review</button>` : ''}
        ${record.status !== 'approved' ? `<button type="button" class="btn-primary" id="btn-approve-runbook">Approve Runbook</button>` : ''}
        ${record.status === 'approved' ? `<button type="button" class="btn-secondary" id="btn-start-cutover-from-runbook">Start Cutover Directly</button>` : ''}
        ${record.status === 'approved' ? `<button type="button" class="btn-primary" id="btn-start-deployment-from-runbook">Start Deployment (Orchestration)</button>` : ''}
      </div>
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
      await window.fetchBuildDeployData();
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
    `<option value="${r.runbook_id}" ${r.runbook_id === prefillRunbookId ? 'selected' : ''}>${r.runbook_id} — ${r.title}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0;">Start a Cutover Bridge</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Runs the cutover bridge: live status, step tracking, stakeholder updates.
      </p>
      <div class="form-group">
        <label for="cut-component">Component ID *</label>
        <input type="text" id="cut-component" placeholder="e.g. svc-payments-api">
      </div>
      <div class="form-group">
        <label for="cut-runbook">Runbook (approved only)</label>
        <select id="cut-runbook">
          <option value="">None — track manually</option>
          ${runbookOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="cut-stakeholders">Stakeholders (comma separated)</label>
        <input type="text" id="cut-stakeholders" placeholder="e.g. release-manager, qa-lead">
      </div>
      <div class="error-message" id="cut-error"></div>
      <div class="submit-row">
        <button type="button" class="btn-primary" id="btn-start-cutover">Open Cutover Bridge</button>
      </div>
    </div>
  `;

  document.getElementById('btn-start-cutover').addEventListener('click', async () => {
    const component_id = document.getElementById('cut-component').value.trim();
    const runbook_id = document.getElementById('cut-runbook').value || null;
    const stakeholders = document.getElementById('cut-stakeholders').value
      .split(',').map(s => s.trim()).filter(Boolean);
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
      const res = await fetch(`${DEPLOY_API_BASE}/cutover/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component_id, runbook_id, stakeholders })
      });
      if (!res.ok) throw new Error('Failed to start cutover.');
      const record = await res.json();
      selectedCutoverId = record.cutover_id;
      await window.fetchBuildDeployData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Open Cutover Bridge';
    }
  });
}

function selectCutover(id) {
  selectedCutoverId = id;
  document.querySelectorAll('#deploy-list-container .demand-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === id);
  });
  const record = cutoverSessions.find(c => c.cutover_id === id);
  if (!record) return;
  renderCutoverDetails(record);
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
      await window.fetchBuildDeployData();
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
      await window.fetchBuildDeployData();
    });
  }
}

// ---------------------------------------------------------------------------
// Deployment orchestration
// ---------------------------------------------------------------------------

function showNewDeploymentForm(prefillRunbookId) {
  const panel = document.getElementById('deploy-panel-container');
  const approvedRunbooks = runbooks.filter(r => r.status === 'approved');
  const runbookOptions = approvedRunbooks.map(r =>
    `<option value="${r.runbook_id}" ${r.runbook_id === prefillRunbookId ? 'selected' : ''}>${r.runbook_id} — ${r.title}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0;">Start a Deployment</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Drives the deployment runbook across environments and teams; checks pre-conditions and holds go/no-go on production steps.
      </p>
      <div class="form-group">
        <label for="dep-component">Component ID *</label>
        <input type="text" id="dep-component" placeholder="e.g. svc-payments-api">
      </div>
      <div class="grid-2col">
        <div class="form-group">
          <label for="dep-runbook">Approved Runbook *</label>
          <select id="dep-runbook">
            <option value="">Select a runbook</option>
            ${runbookOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="dep-environment">Environment</label>
          <select id="dep-environment">
            <option value="dev">dev</option>
            <option value="test">test</option>
            <option value="staging">staging</option>
            <option value="prod" selected>prod</option>
          </select>
        </div>
      </div>
      <div class="error-message" id="dep-error"></div>
      <div class="submit-row">
        <button type="button" class="btn-primary" id="btn-start-deployment">Start Deployment</button>
      </div>
    </div>
  `;

  document.getElementById('btn-start-deployment').addEventListener('click', async () => {
    const component_id = document.getElementById('dep-component').value.trim();
    const runbook_id = document.getElementById('dep-runbook').value;
    const environment = document.getElementById('dep-environment').value;
    const errorBox = document.getElementById('dep-error');
    errorBox.style.display = 'none';

    if (!component_id || !runbook_id) {
      errorBox.textContent = 'Component ID and an approved Runbook are required.';
      errorBox.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btn-start-deployment');
    btn.disabled = true;
    btn.innerHTML = `<span class="loader"><span class="spinner"></span> Starting...</span>`;

    try {
      const res = await fetch(`${DEPLOY_API_BASE}/orchestration/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component_id, runbook_id, environment })
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.detail || 'Failed to start deployment.'); }
      const record = await res.json();
      selectedDeploymentId = record.deployment_id;
      await window.fetchBuildDeployData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Start Deployment';
    }
  });
}

function selectDeployment(id) {
  selectedDeploymentId = id;
  document.querySelectorAll('#deploy-list-container .demand-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === id);
  });
  const record = deployments.find(d => d.deployment_id === id);
  if (!record) return;
  renderDeploymentDetails(record);
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
      await window.fetchBuildDeployData();
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
      activeDeployTab = 'cutover';
      selectedCutoverId = record.cutover_id;
      window.renderBuildDeployScreen();
      window.fetchBuildDeployData();
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
}
