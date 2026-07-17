// config-environments.js — Stage 05: Config & Environments Frontend Module
// Matches the plan-schedule UI pattern

const ENV_API_BASE = 'http://127.0.0.1:8000/api';

let environments = [];
let demandTitles = {};
let selectedEnvKey = null;
let allDemandIds = [];

// ─── Screen Entry Point ────────────────────────────────────────────────────

window.renderConfigEnvironmentsScreen = function () {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <aside class="sidebar" style="display: flex; flex-direction: column; gap: 1.5rem; max-height: 100%; overflow: hidden;">
        <div class="panel-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 class="sidebar-title" style="margin: 0; font-size: 1rem;">Demands</h3>
          </div>

          <!-- Demand ID dropdown -->
          <div style="margin-bottom: 0.75rem;">
            <label style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; display: block; margin-bottom: 0.3rem;">Select Demand</label>
            <select id="demand-dropdown" style="width:100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); padding: 0.4rem 0.6rem; font-size: 0.85rem; outline: none; cursor: pointer;">
              <option value="">— loading… —</option>
            </select>
          </div>



          <ul class="demand-list" id="env-list-container" style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
            <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading…</li>
          </ul>
        </div>
      </aside>
      <main class="details-panel" id="env-panel-container"></main>
    </div>
  `;

  document.getElementById('demand-dropdown').addEventListener('change', e => {
    const v = e.target.value;
    if (v) selectEnvironment(v);
  });
};

// ─── Fetch ────────────────────────────────────────────────────────────────

window.fetchEnvironments = async function () {
  const container = document.getElementById('env-list-container');
  if (!container) return;
  try {
    // Demand titles
    try {
      const dRes = await fetch(`${ENV_API_BASE}/demands`);
      if (dRes.ok) {
        const demands = await dRes.json();
        demandTitles = {};
        demands.forEach(d => { demandTitles[d.demand_id] = d.title; });
      }
    } catch (e) { console.warn('Could not fetch demand titles', e); }

    // All environment records
    const res = await fetch(`${ENV_API_BASE}/environments`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    environments = await res.json();

    // Known demand IDs
    try {
      const idRes = await fetch(`${ENV_API_BASE}/environments/demand-ids`);
      if (idRes.ok) {
        const idData = await idRes.json();
        allDemandIds = idData.demand_ids;
      }
    } catch (e) { console.warn('Could not fetch demand IDs', e); }

    renderEnvironmentList();
    populateDemandDropdown();

    if (environments.length > 0 && selectedEnvKey === null) {
      selectEnvironment(environments[0].demand_id);
    } else if (selectedEnvKey !== null) {
      selectEnvironment(selectedEnvKey);
    } else {
      document.getElementById('env-panel-container').innerHTML = `
        <div class="panel-card" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); flex-direction:column; gap:1rem;">
          <div style="font-size:1.1rem; font-weight:600;">No environment records found</div>
          <div style="font-size:0.85rem;">Enter a Demand ID in the sidebar and click "Generate Sample Data" to get started.</div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to fetch environments:', err);
    if (container) container.innerHTML = `
      <li style="padding:1.5rem; text-align:center; color:var(--color-status-red-text);">
        <div style="font-weight:700; margin-bottom:0.5rem;">Backend Offline</div>
        <div style="font-size:0.8rem; color:var(--text-secondary);">Start the gateway at <code style="background:rgba(0,0,0,0.2);padding:2px 4px;border-radius:4px;">uvicorn gateway:app --port 8000</code></div>
      </li>
    `;
  }
};

function populateDemandDropdown() {
  const dropdown = document.getElementById('demand-dropdown');
  if (!dropdown) return;
  const current = selectedEnvKey || dropdown.value;

  // Always use ALL demands from Stage 1 (demand-intake), regardless of whether
  // environment records exist yet. demandTitles is keyed by demand_id.
  const intakeIds = Object.keys(demandTitles).sort();

  // Also include any env-only IDs that may not be in demand-intake (edge case)
  const envOnlyIds = environments.map(e => e.demand_id).filter(id => !demandTitles[id]);
  const ids = [...new Set([...intakeIds, ...envOnlyIds])].sort();

  if (ids.length === 0) {
    dropdown.innerHTML = `<option value="">— No demands found —</option>`;
    return;
  }

  dropdown.innerHTML = `<option value="">— Select demand —</option>` +
    ids.map(id => `<option value="${id}" ${id === current ? 'selected' : ''}>${id}${demandTitles[id] ? ' – ' + demandTitles[id] : ''}</option>`).join('');
}


// ─── Sidebar List ─────────────────────────────────────────────────────────

function renderEnvironmentList() {
  const container = document.getElementById('env-list-container');
  if (!container) return;
  if (environments.length === 0) {
    container.innerHTML = `<li style="padding:2rem; text-align:center; color:var(--text-muted);">No records yet. Generate sample data.</li>`;
    return;
  }
  const demands = [...new Set(environments.map(e => e.demand_id))];
  container.innerHTML = demands.map(id => {
    const isActive = id === selectedEnvKey;
    const hasDrift = environments.some(e => e.demand_id === id && e.drift_status !== 'in-sync');
    const envCount = environments.filter(e => e.demand_id === id).length;
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-key="${id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${id}</span>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            ${hasDrift
              ? `<span style="font-size:0.65rem;font-weight:700;color:var(--color-status-red-text);text-transform:uppercase;">Drifted</span>`
              : `<span style="font-size:0.65rem;font-weight:700;color:var(--color-status-green-text);text-transform:uppercase;">In Sync</span>`}
            <button type="button" class="env-delete-btn" data-id="${id}"
              style="background:none;border:none;color:var(--color-status-red-text);cursor:pointer;padding:0.15rem;opacity:0.65;display:flex;align-items:center;"
              title="Delete all environment records for ${id}"
              onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.65'">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <div class="demand-item-meta">
          ${demandTitles[id] ? `<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${demandTitles[id]}</span>` : ''}
          <span>${envCount} env${envCount !== 1 ? 's' : ''}</span>
        </div>
      </li>
    `;
  }).join('');

  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => selectEnvironment(item.getAttribute('data-key')));
  });

  container.querySelectorAll('.env-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const listItem = btn.closest('li');
      if (!listItem) return;

      const existing = listItem.querySelector('.inline-delete-confirm');
      if (existing) { existing.remove(); return; }

      const confirmRow = document.createElement('div');
      confirmRow.className = 'inline-delete-confirm';
      confirmRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;padding:0.4rem 0;border-top:1px solid rgba(239,68,68,0.3);';
      confirmRow.innerHTML = `
        <span style="font-size:0.72rem;color:var(--color-status-red-text);flex:1;font-weight:600;">Delete all records?</span>
        <button class="btn-confirm-delete" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:var(--color-status-red-text);color: var(--text-primary);border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:700;">Yes</button>
        <button class="btn-cancel-delete" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:transparent;color:var(--text-muted);border:1px solid var(--border-color);border-radius:var(--radius-sm);cursor:pointer;">Cancel</button>
      `;
      listItem.appendChild(confirmRow);

      confirmRow.querySelector('.btn-cancel-delete').addEventListener('click', e2 => { e2.stopPropagation(); confirmRow.remove(); });
      confirmRow.querySelector('.btn-confirm-delete').addEventListener('click', async e2 => {
        e2.stopPropagation();
        try {
          const res = await fetch(`${ENV_API_BASE}/environments/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          if (selectedEnvKey === id) selectedEnvKey = null;
          await window.fetchEnvironments();
          showToast(`✓ Deleted records for ${id}`);
        } catch (err) {
          confirmRow.remove();
          alert(err.message);
        }
      });
    });
  });
}

function selectEnvironment(demand_id) {
  selectedEnvKey = demand_id;
  // Sync dropdown
  const dd = document.getElementById('demand-dropdown');
  if (dd) dd.value = demand_id;

  document.querySelectorAll('#env-list-container .demand-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-key') === demand_id);
  });
  renderEnvDetail(demand_id);
}

// ─── Detail Panel ─────────────────────────────────────────────────────────

function renderEnvDetail(demand_id) {
  const panel = document.getElementById('env-panel-container');
  if (!panel) return;

  const demandEnvs = environments.filter(e => e.demand_id === demand_id);

  // No records yet — show one-time initialise card
  if (demandEnvs.length === 0) {
    panel.innerHTML = `
      <div class="panel-card" style="padding-top:1rem;">
        <div style="border-bottom:1px solid var(--border-color); padding-bottom:1rem; margin-bottom:1.5rem;">
          <span style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${demand_id}</span>
          <h2 style="font-family:var(--font-display); font-size:1.5rem; margin:0.2rem 0 0 0; color:var(--text-primary);">Config &amp; Environments</h2>
          ${demandTitles[demand_id] ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.3rem;">${demandTitles[demand_id]}</div>` : ''}
        </div>
        <div style="background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:2rem; text-align:center; max-width:480px; margin:0 auto;">
          <div style="font-size:2rem; margin-bottom:1rem;">🛠</div>
          <div style="font-weight:700; font-size:1rem; color:var(--text-primary); margin-bottom:0.5rem;">No Environment Records</div>
          <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1.5rem; line-height:1.5;">
            Click below to let the AI analyse this demand's business summary and generate
            realistic environment configuration data across all four environments.
            This can only be done once.
          </div>
          <button id="btn-init-envs" class="btn-primary"
            style="background:linear-gradient(135deg,#059669,#10b981);border:none;color: var(--text-primary);padding:0.6rem 1.5rem;border-radius:var(--radius-sm);font-size:0.9rem;font-weight:700;cursor:pointer;">
            ✦ Initialise Environments with AI
          </button>
          <div id="init-status" style="margin-top:1rem; font-size:0.82rem; color:var(--text-muted);"></div>
        </div>
      </div>
    `;
    document.getElementById('btn-init-envs').addEventListener('click', async () => {
      const btn = document.getElementById('btn-init-envs');
      const status = document.getElementById('init-status');
      btn.disabled = true;
      btn.textContent = '⏳ Generating with AI…';
      status.textContent = 'Fetching demand summary and calling LLM. This may take a moment…';
      try {
        const res = await fetch(`${ENV_API_BASE}/environments/seed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demand_id })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        showToast('✓ Environments initialised');
        await window.fetchEnvironments();
        selectEnvironment(demand_id);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '✦ Initialise Environments with AI';
        status.textContent = '⚠ ' + e.message;
        status.style.color = 'var(--color-status-red-text)';
      }
    });
    return;
  }
  const envOrder = ['dev', 'test', 'staging', 'prod'];
  const hasDrift = demandEnvs.some(e => e.drift_status !== 'in-sync');

  const badgeColor = hasDrift ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)';
  const badgeBg = hasDrift ? 'var(--color-status-red-bg)' : 'var(--color-status-green-bg)';
  const badgeText = hasDrift ? 'Drifted' : 'In Sync';

  // Build environment cards in pipeline style
  const envCardsHtml = envOrder.map(envName => {
    const record = demandEnvs.find(e => e.environment === envName);
    if (!record) {
      return `
        <div style="flex: 1; min-width: 220px;">
          <div style="margin-bottom: 0.6rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); font-size: 0.72rem; letter-spacing: 0.1em;">${envName}</div>
          <div style="border: 1px dashed rgba(255,255,255,0.1); border-radius: var(--radius-md); min-height: 160px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.85rem; background:rgba(0,0,0,0.1);">
            Not Deployed
          </div>
        </div>
      `;
    }

    const isDrifted = record.drift_status !== 'in-sync';
    const expReqs = (record.expected_requirements || []);
    const expReqDisplay = expReqs.length
      ? expReqs.map(r => `<span style="display:inline-block;background:rgba(99,102,241,0.12);color:#a5b4fc;border:1px solid rgba(99,102,241,0.25);border-radius:4px;padding:0.1rem 0.4rem;font-size:0.7rem;margin:0.1rem;">${r}</span>`).join(' ')
      : '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';

    const driftStyle = isDrifted
      ? 'border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.04);'
      : '';

    return `
      <div style="flex: 1; min-width: 220px;">
        <div style="margin-bottom: 0.6rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); font-size: 0.72rem; letter-spacing: 0.1em;">${envName}</div>
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; display:flex; flex-direction:column; gap:0.75rem; height:100%; ${driftStyle}">
          <!-- Status badge -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; padding:0.2rem 0.55rem; border-radius:999px;
              color:${isDrifted ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)'};
              background:${isDrifted ? 'var(--color-status-red-bg)' : 'var(--color-status-green-bg)'};
              border: 1px solid ${isDrifted ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)'};">
              ${record.drift_status.toUpperCase()}
            </span>
            <span style="font-size:0.68rem; color:var(--text-muted);">
              ${new Date(record.last_checked).toLocaleDateString()}
            </span>
          </div>

          <!-- Expected Version (editable) -->
          <div>
            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-bottom:0.3rem;">Expected Version</div>
            <div id="field-expected_version-${demand_id}-${envName}" class="env-editable-field">
              <span class="field-display" style="font-family:monospace; font-size:0.9rem; color:var(--text-primary);">${record.expected_version}</span>
              <button class="btn-edit-inline" onclick="window.startEdit('${demand_id}','${envName}','expected_version')" title="Edit">✎</button>
            </div>
          </div>

          <!-- CMDB Name (editable) -->
          <div>
            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-bottom:0.3rem;">CMDB Name</div>
            <div id="field-cmdb_name-${demand_id}-${envName}" class="env-editable-field">
              <span class="field-display" style="font-size:0.83rem; color:var(--text-primary); font-family:monospace;">${record.cmdb_name || '—'}</span>
              <button class="btn-edit-inline" onclick="window.startEdit('${demand_id}','${envName}','cmdb_name')" title="Edit">✎</button>
            </div>
          </div>

          <!-- Expected Requirements (editable) -->
          <div>
            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-bottom:0.3rem;">Expected Requirements</div>
            <div id="field-expected_requirements-${demand_id}-${envName}" class="env-editable-field" style="flex-wrap:wrap;">
              <div class="field-display" style="flex:1; line-height:1.6;">${expReqDisplay}</div>
              <button class="btn-edit-inline" onclick="window.startEdit('${demand_id}','${envName}','expected_requirements')" title="Edit">✎</button>
            </div>
          </div>


        </div>
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="panel-card" style="padding-top:1rem;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start;
                  border-bottom:1px solid var(--border-color); padding-bottom:1rem; margin-bottom:1.5rem; flex-shrink:0;">
        <div>
          <span style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${demand_id}</span>
          <h2 style="font-family:var(--font-display); font-size:1.5rem; margin:0.2rem 0 0 0; color:var(--text-primary); display:flex; align-items:center; gap:0.75rem;">
            Config &amp; Environments
            <span style="font-size:0.7rem; padding:0.2rem 0.5rem; border-radius:var(--radius-sm); font-weight:600; text-transform:uppercase;
              color:${badgeColor}; background:${badgeBg}; border:1px solid ${badgeColor};">
              ${badgeText}
            </span>
          </h2>
          ${demandTitles[demand_id] ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.3rem;">${demandTitles[demand_id]}</div>` : ''}
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
          <div style="font-size:0.75rem; color:var(--text-secondary);">Environments tracked</div>
          <div style="font-family:var(--font-display); font-size:1.1rem; font-weight:700; color:var(--color-brand);">
            ${demandEnvs.length} / 4
          </div>
        </div>
      </div>

      <!-- Summary stats row -->
      <div class="grid-2col" style="margin-bottom:1.5rem; flex-shrink:0;">
        <div class="data-item">
          <div class="data-label">In-Sync Environments</div>
          <div class="data-value" style="color:var(--color-status-green-text);">
            ${demandEnvs.filter(e => e.drift_status === 'in-sync').length}
          </div>
        </div>
        <div class="data-item">
          <div class="data-label">Drifted Environments</div>
          <div class="data-value" style="color:var(--color-status-red-text);">
            ${demandEnvs.filter(e => e.drift_status !== 'in-sync').length}
          </div>
        </div>
      </div>

      <!-- Pipeline section label -->
      <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.75rem; flex-shrink:0;">
        Environment Pipeline
      </div>

      <!-- Pipeline cards (horizontal scroll) -->
      <div style="display:flex; gap:1rem; overflow-x:auto; padding-bottom:1rem; align-items:stretch; flex-shrink:0;">
        ${envCardsHtml}
      </div>

      <!-- Result box for actions -->
      <div id="action-result" style="margin-top:1.25rem; padding:1rem 1.25rem; border-radius:var(--radius-md); font-family:monospace; font-size:0.85rem; display:none; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); line-height:1.5;"></div>
    </div>
  `;

  // inject inline-edit styles once
  if (!document.getElementById('env-edit-styles')) {
    const s = document.createElement('style');
    s.id = 'env-edit-styles';
    s.textContent = `
      .env-editable-field {
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
      }
      .env-editable-field .field-display { flex: 1; }
      .btn-edit-inline {
        background: none;
        border: none;
        cursor: pointer;
        color: rgba(255,255,255,0.25);
        font-size: 0.82rem;
        padding: 0.1rem 0.2rem;
        flex-shrink: 0;
        line-height: 1;
      }
      .btn-edit-inline:hover { color: #a5b4fc; }
      .env-field-input {
        flex: 1;
        background: rgba(255,255,255,0.06);
        border: 1px solid #6366f1;
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-family: monospace;
        font-size: 0.83rem;
        padding: 0.3rem 0.5rem;
        outline: none;
        width: 100%;
        box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
      }
      .env-field-textarea {
        flex: 1;
        background: rgba(255,255,255,0.06);
        border: 1px solid #6366f1;
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-family: monospace;
        font-size: 0.78rem;
        padding: 0.3rem 0.5rem;
        outline: none;
        width: 100%;
        resize: vertical;
        min-height: 52px;
        box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
      }
      .btn-save-inline {
        background: linear-gradient(135deg,#4f46e5,#3b82f6);
        color: var(--text-primary);
        border: none;
        padding: 0.25rem 0.6rem;
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        cursor: pointer;
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .btn-cancel-inline {
        background: transparent;
        color: var(--text-muted);
        border: 1px solid var(--border-color);
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        cursor: pointer;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }
}

// ─── Inline Field Editing ──────────────────────────────────────────────────

window.startEdit = function (demand_id, environment, field) {
  const container = document.getElementById(`field-${field}-${demand_id}-${environment}`);
  if (!container) return;

  const displayEl = container.querySelector('.field-display');
  const currentRaw = displayEl ? displayEl.textContent.trim() : '';

  // For requirements, the display shows badge spans — read from data instead
  const record = environments.find(e => e.demand_id === demand_id && e.environment === environment);
  let currentVal = currentRaw;
  if (field === 'expected_requirements' && record) {
    currentVal = (record.expected_requirements || []).join(', ');
  }

  const isTextarea = field === 'expected_requirements';
  const inputId = `inp-${field}-${demand_id}-${environment}`;

  if (isTextarea) {
    container.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; gap:0.35rem; width:100%;">
        <textarea id="${inputId}" class="env-field-textarea" rows="2">${currentVal}</textarea>
        <div style="display:flex; gap:0.3rem;">
          <button class="btn-save-inline" onclick="window.saveField('${demand_id}','${environment}','${field}')">Save</button>
          <button class="btn-cancel-inline" onclick="window.fetchEnvironments()">Cancel</button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <input id="${inputId}" class="env-field-input" type="text" value="${(currentVal === '—' ? '' : currentVal)}" />
      <button class="btn-save-inline" onclick="window.saveField('${demand_id}','${environment}','${field}')">Save</button>
      <button class="btn-cancel-inline" onclick="window.fetchEnvironments()">Cancel</button>
    `;
  }

  const inp = document.getElementById(inputId);
  if (inp) { inp.focus(); inp.select(); }
};

window.saveField = async function (demand_id, environment, field) {
  const inp = document.getElementById(`inp-${field}-${demand_id}-${environment}`);
  if (!inp) return;
  const value = inp.value.trim();

  let payload = {};
  if (field === 'expected_requirements') {
    payload[field] = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else {
    payload[field] = value;
  }

  try {
    const res = await fetch(
      `${ENV_API_BASE}/environments/${encodeURIComponent(demand_id)}/${encodeURIComponent(environment)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const updated = await res.json();
    const idx = environments.findIndex(e => e.demand_id === demand_id && e.environment === environment);
    if (idx !== -1) environments[idx] = updated;
    renderEnvDetail(demand_id);
    renderEnvironmentList();
    showToast('✓ Saved');
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
};

// ─── Toast ────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:2rem;right:2rem;background:linear-gradient(135deg,#059669,#10b981);color: var(--text-primary);padding:0.65rem 1.3rem;border-radius:8px;font-size:0.88rem;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.4);z-index:9999;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ─── Action Handlers ──────────────────────────────────────────────────────

window.simulateDrift = async function (demand_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(59,130,246,0.08)';
  resultBox.style.borderColor = 'rgba(59,130,246,0.3)';
  resultBox.style.color = '#93c5fd';
  resultBox.innerHTML = 'Running drift detection…';

  const record = environments.find(e => e.demand_id === demand_id && e.environment === environment);
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/reconcile-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demand_id: record.demand_id,
        environment: record.environment,
        deployed_version: record.deployed_version,
        expected_version: record.expected_version
      })
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    if (data.drift_status === 'drifted') {
      resultBox.style.background = 'rgba(239,68,68,0.08)';
      resultBox.style.borderColor = 'rgba(239,68,68,0.3)';
      resultBox.style.color = '#fca5a5';
    } else {
      resultBox.style.background = 'rgba(34,197,94,0.08)';
      resultBox.style.borderColor = 'rgba(34,197,94,0.3)';
      resultBox.style.color = '#86efac';
    }
    resultBox.innerHTML = `Drift Detection Complete — <strong>${environment.toUpperCase()}</strong><br/>Status: <strong>${data.drift_status.toUpperCase()}</strong><br/>Refreshing…`;
    setTimeout(() => window.fetchEnvironments(), 1500);
  } catch (e) {
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
};

window.simulateHygiene = async function (demand_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(245,158,11,0.08)';
  resultBox.style.borderColor = 'rgba(245,158,11,0.3)';
  resultBox.style.color = '#fcd34d';
  resultBox.innerHTML = 'Running records hygiene check…';
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/records-hygiene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id, environment })
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    const record = environments.find(e => e.demand_id === demand_id && e.environment === environment);
    let html = `<strong>Records Hygiene — ${environment.toUpperCase()}</strong><br/>Status: <strong>${data.status}</strong><br/>${data.message}`;
    if (record) {
      html += `<br/><br/>Observed: <code>${record.observed_name || '—'}</code> &nbsp;|&nbsp; CMDB: <code>${record.cmdb_name || '—'}</code>`;
    }
    if (data.proposed_action) {
      html += `<br/><br/><pre style="margin:0.5rem 0 0;background:rgba(0,0,0,0.3);padding:0.5rem;border-radius:4px;">${JSON.stringify(data.proposed_action, null, 2)}</pre>`;
      html += `<button class="btn-primary" style="margin-top:0.75rem;font-size:0.8rem;" onclick="window.applyHygieneFix('${demand_id}','${environment}','${data.proposed_action.update_cmdb_name_to}')">Apply Fix</button>`;
    }
    resultBox.innerHTML = html;
  } catch (e) {
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
};

window.applyHygieneFix = async function (demand_id, environment, new_cmdb_name) {
  const resultBox = document.getElementById('action-result');
  resultBox.innerHTML = 'Applying fix…';
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/apply-hygiene-fix`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id, environment, new_cmdb_name })
    });
    if (!res.ok) throw new Error('API request failed');
    resultBox.innerHTML = '✓ Fix applied. Refreshing…';
    setTimeout(() => window.fetchEnvironments(), 1000);
  } catch (e) { resultBox.innerHTML = 'Error: ' + e.message; }
};

window.verifyReadiness = async function (demand_id, environment) {
  const resultBox = document.getElementById('action-result');
  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(59,130,246,0.08)';
  resultBox.style.borderColor = 'rgba(59,130,246,0.3)';
  resultBox.style.color = '#93c5fd';
  resultBox.innerHTML = 'Verifying baseline readiness…';
  try {
    const res = await fetch(`${ENV_API_BASE}/environments/verify-readiness`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id, environment })
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    if (data.ready) {
      resultBox.style.background = 'rgba(34,197,94,0.08)';
      resultBox.style.borderColor = 'rgba(34,197,94,0.3)';
      resultBox.style.color = '#86efac';
      resultBox.innerHTML = `<strong>Baseline Reconcile — ${environment.toUpperCase()}</strong><br/>✓ All requirements satisfied. Ready to proceed.`;
    } else {
      resultBox.style.background = 'rgba(239,68,68,0.08)';
      resultBox.style.borderColor = 'rgba(239,68,68,0.3)';
      resultBox.style.color = '#fca5a5';
      resultBox.innerHTML = `<strong>Baseline Reconcile — ${environment.toUpperCase()}</strong><br/>Issues found:<br/><br/>` + data.issues.join('<br/>');
    }
  } catch (e) {
    resultBox.style.color = '#fca5a5';
    resultBox.innerHTML = 'Error: ' + e.message;
  }
};
