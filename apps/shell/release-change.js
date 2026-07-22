const RELEASE_CHANGE_API_BASE = 'http://127.0.0.1:8000/api/release-change';

let releaseList = [];
let selectedReleaseId = null;
let currentReleaseDetail = null;
let activeSubTab = 'overview';
let dropdownOptions = { demands: [], plans: [], environments: [], teams: [], approvers: [], windows: [] };

// Filtering state
let filterProject = sessionStorage.getItem('selectedDemandId') || '';
let filterStatus = '';
let filterEnvironment = '';
let filterRisk = '';

window.renderReleaseChangeScreen = function () {
  const viewport = document.getElementById('viewport');

  // Set up the container structure
  viewport.innerHTML = `
    <div id="release-change-wrapper" style="display: flex; flex-direction: column; gap: 1.5rem; font-family: var(--font-sans);">
      <!-- Rendered dynamically based on state -->
    </div>
  `;

  // Expose methods to window so onclick handlers resolve correctly
  window.navigateToRelease = navigateToRelease;
  window.closeReleaseDetails = closeReleaseDetails;
  window.changeTab = changeTab;
  window.openCreateModal = openCreateModal;
  window.closeCreateModal = closeCreateModal;
  window.handleCreateRelease = handleCreateRelease;
  window.triggerDraftChange = triggerDraftChange;
  window.triggerRiskAssessment = triggerRiskAssessment;
  window.saveChangeRequestEdit = saveChangeRequestEdit;
  window.submitChangeRequest = submitChangeRequest;
  window.submitCABReview = submitCABReview;
  window.triggerCollisionCheck = triggerCollisionCheck;
  window.triggerAuditUpdate = triggerAuditUpdate;
  window.handleFiltersChange = handleFiltersChange;
  window.onProjectSelectChange = onProjectSelectChange;
  window.deleteRelease = deleteRelease;

  // Initial load
  loadDropdownOptions();
  fetchReleases();
};

window.fetchReleaseChange = function () {
  // Empty implementation to satisfy App Shell trigger
};

async function loadDropdownOptions() {
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/dropdowns`);
    if (res.ok) {
      dropdownOptions = await res.json();
      populateCreateModalDropdowns();
    }
  } catch (err) {
    console.error("Failed to load dropdowns", err);
  }
}

function populateCreateModalDropdowns() {
  const projectSelect = document.getElementById('modal-project-select');
  if (projectSelect && dropdownOptions.demands && dropdownOptions.demands.length > 0) {
    projectSelect.innerHTML = `
      <option value="">-- Choose Approved Demand --</option>
      ${dropdownOptions.demands.map(d => `<option value="${d.demand_id}">${d.demand_id} - ${d.title}</option>`).join('')}
    `;

    const activeDemandId = sessionStorage.getItem('selectedDemandId');
    if (activeDemandId && dropdownOptions.demands.some(d => d.demand_id === activeDemandId)) {
      projectSelect.value = activeDemandId;
      onProjectSelectChange();
    }
  }

  const envSelect = document.getElementById('modal-env-select');
  if (envSelect && dropdownOptions.environments && dropdownOptions.environments.length > 0) {
    envSelect.innerHTML = `
      ${dropdownOptions.environments.map(e => `<option value="${e}">${e}</option>`).join('')}
    `;
  }
}

async function fetchReleases() {
  filterProject = sessionStorage.getItem('selectedDemandId') || filterProject;
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    releaseList = await res.json();
    renderMainView();
  } catch (err) {
    console.error("Failed to load releases", err);
    const wrapper = document.getElementById('release-change-wrapper');
    wrapper.innerHTML = `
      <div class="panel-card" style="text-align: center; padding: 3rem; color: var(--color-status-red-text);">
        <h3>Backend Server Offline</h3>
        <p style="color: var(--text-secondary);">Could not connect to release api endpoints on port 8000.</p>
      </div>
    `;
  }
}

async function deleteRelease(releaseId) {
  if (!confirm(`Are you sure you want to delete release ${releaseId}? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${releaseId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed to delete: ${err.detail || res.status}`);
      return;
    }
    // If currently viewing this release, return to the list
    if (selectedReleaseId === releaseId) {
      selectedReleaseId = null;
      currentReleaseDetail = null;
    }
    await fetchReleases();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

function renderMainView() {

  const wrapper = document.getElementById('release-change-wrapper');
  if (selectedReleaseId) {
    renderReleaseDetailsView();
  } else {
    renderDashboardView();
  }
}

function renderDashboardView() {
  const wrapper = document.getElementById('release-change-wrapper');

  // Calculate metric values
  const activeCount = releaseList.length;
  const pendingCabCount = releaseList.filter(r => r.status === 'Pending Approval' || r.cab_status === 'pending-cab').length;
  const highRiskCount = releaseList.filter(r => r.risk_score >= 60).length;
  const successRate = activeCount > 0 ? Math.round(((activeCount - releaseList.filter(r => r.status === 'Failed').length) / activeCount) * 100) : 100;

  // Apply filters in JS
  let filteredReleases = [...releaseList];
  if (filterProject) {
    filteredReleases = filteredReleases.filter(r => r.project_id.toLowerCase().includes(filterProject.toLowerCase()));
  }
  if (filterStatus) {
    filteredReleases = filteredReleases.filter(r => r.status === filterStatus);
  }
  if (filterEnvironment) {
    filteredReleases = filteredReleases.filter(r => r.environment === filterEnvironment);
  }
  if (filterRisk) {
    if (filterRisk === 'high') filteredReleases = filteredReleases.filter(r => r.risk_score >= 60);
    if (filterRisk === 'medium') filteredReleases = filteredReleases.filter(r => r.risk_score >= 35 && r.risk_score < 60);
    if (filterRisk === 'low') filteredReleases = filteredReleases.filter(r => r.risk_score < 35 || r.risk_score === null);
  }

  wrapper.innerHTML = `
    <!-- Top Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
      <div>
        <h2 style="margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700;">Release & Change Governance</h2>
        <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">Continuous compliance, automated risk profiling, and CAB orchestration.</p>
      </div>
      <button class="btn-primary" onclick="openCreateModal()" style="display: flex; align-items: center; gap: 0.5rem; background: var(--color-brand); border: none; padding: 0.6rem 1.2rem; border-radius: var(--radius-md); font-weight: 600; color: var(--text-primary); cursor: pointer;">
        <span>+ Create Release Package</span>
      </button>
    </div>

    <!-- Metrics Widgets Row -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem;">
      <div class="panel-card" style="padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-color); display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 2.25rem; background: rgba(99, 102, 241, 0.1); width: 60px; height: 60px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--color-brand);">📦</div>
        <div>
          <div style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; font-weight: 700;">Total Releases</div>
          <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">${activeCount}</div>
        </div>
      </div>
      <div class="panel-card" style="padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-color); display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 2.25rem; background: rgba(251, 191, 36, 0.1); width: 60px; height: 60px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--color-status-amber-text);">⏳</div>
        <div>
          <div style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; font-weight: 700;">Pending CAB</div>
          <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">${pendingCabCount}</div>
        </div>
      </div>
      <div class="panel-card" style="padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-color); display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 2.25rem; background: rgba(248, 113, 113, 0.1); width: 60px; height: 60px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--color-status-red-text);">⚠️</div>
        <div>
          <div style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; font-weight: 700;">High Risk Changes</div>
          <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">${highRiskCount}</div>
        </div>
      </div>
      <div class="panel-card" style="padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-color); display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 2.25rem; background: rgba(52, 211, 153, 0.1); width: 60px; height: 60px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--color-status-green-text);">📈</div>
        <div>
          <div style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; font-weight: 700;">Release Success</div>
          <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">${successRate}%</div>
        </div>
      </div>
    </div>

    <!-- Filters Section -->
    <div style="display: flex; gap: 1rem; flex-wrap: wrap; background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
      <div style="flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 0.4rem;">
        <label style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700;">Search Project ID</label>
        <input type="text" id="filter-project-input" value="${filterProject}" placeholder="e.g. DEM-2026-0072" oninput="handleFiltersChange()" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); outline: none;">
      </div>
      <div style="flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 0.4rem;">
        <label style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700;">Status</label>
        <select id="filter-status-input" onchange="handleFiltersChange()" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); outline: none;">
          <option value="">All Statuses</option>
          <option value="Draft" ${filterStatus === 'Draft' ? 'selected' : ''}>Draft</option>
          <option value="Pending Approval" ${filterStatus === 'Pending Approval' ? 'selected' : ''}>Pending Approval</option>
          <option value="Approved" ${filterStatus === 'Approved' ? 'selected' : ''}>Approved</option>
          <option value="Failed" ${filterStatus === 'Failed' ? 'selected' : ''}>Failed</option>
        </select>
      </div>
      <div style="flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 0.4rem;">
        <label style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700;">Environment</label>
        <select id="filter-env-input" onchange="handleFiltersChange()" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); outline: none;">
          <option value="">All Environments</option>
          <option value="dev" ${filterEnvironment === 'dev' ? 'selected' : ''}>dev</option>
          <option value="test" ${filterEnvironment === 'test' ? 'selected' : ''}>test</option>
          <option value="staging" ${filterEnvironment === 'staging' ? 'selected' : ''}>staging</option>
          <option value="prod" ${filterEnvironment === 'prod' ? 'selected' : ''}>prod</option>
        </select>
      </div>
      <div style="flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 0.4rem;">
        <label style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700;">Risk Rating</label>
        <select id="filter-risk-input" onchange="handleFiltersChange()" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); outline: none;">
          <option value="">All Risks</option>
          <option value="low" ${filterRisk === 'low' ? 'selected' : ''}>Low Risk (&lt; 35)</option>
          <option value="medium" ${filterRisk === 'medium' ? 'selected' : ''}>Medium Risk (35-59)</option>
          <option value="high" ${filterRisk === 'high' ? 'selected' : ''}>High Risk (&gt;= 60)</option>
        </select>
      </div>
    </div>

    <!-- Main Dashboard Split Content -->
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;">
      
      <!-- Left: Release Table Grid -->
      <div class="panel-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); display: flex; flex-direction: column;">
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); font-weight: 700;">Active Release Governance Pipeline</div>
        <div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); background: rgba(255,255,255,0.01); color: var(--text-secondary);">
                <th style="padding: 1rem;">Release ID</th>
                <th style="padding: 1rem;">Project</th>
                <th style="padding: 1rem;">Version</th>
                <th style="padding: 1rem;">Environment</th>
                <th style="padding: 1rem;">Target Date</th>
                <th style="padding: 1rem;">Risk Score</th>
                <th style="padding: 1rem;">Status</th>
                <th style="padding: 1rem; text-align: center;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filteredReleases.map(r => {
    const badgeColor = r.status === 'Approved' ? 'green' : (r.status === 'Draft' ? 'gray' : (r.status === 'Failed' ? 'red' : 'amber'));
    const riskColor = (r.risk_score >= 60) ? 'red' : ((r.risk_score >= 35) ? 'amber' : 'green');
    const riskLabel = r.risk_score !== null ? `${r.risk_score} (${r.risk_score >= 60 ? 'HIGH' : (r.risk_score >= 35 ? 'MED' : 'LOW')})` : 'Pending';

    return `
                  <tr onclick="navigateToRelease('${r.release_id}')" class="stage-8-tr" style="border-bottom: 1px solid var(--border-color); cursor: pointer;">
                    <td style="padding: 1rem; font-family: monospace; color: var(--color-brand); font-weight: 700;">${r.release_id}</td>
                    <td style="padding: 1rem; font-weight: 600;">${r.project_id}</td>
                    <td style="padding: 1rem;">${r.version}</td>
                    <td style="padding: 1rem;"><span style="background: var(--bg-primary); padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.75rem;">${r.environment}</span></td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${r.planned_release_date.split('T')[0]}</td>
                    <td style="padding: 1rem;"><span style="color: var(--color-status-${riskColor}-text); font-weight: 700;">${riskLabel}</span></td>
                    <td style="padding: 1rem;"><span class="status-pill status-${badgeColor}" style="padding: 0.25rem 0.5rem; border-radius: var(--radius-round); font-size: 0.75rem; font-weight: 700;">${r.status}</span></td>
                    <td style="padding: 1rem; text-align: center;" onclick="event.stopPropagation()">
                      <button onclick="deleteRelease('${r.release_id}')" title="Delete release" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.35); color: #ef4444; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.75rem; font-weight: 700;">✕ Delete</button>
                    </td>
                  </tr>
                `;
  }).join('')}
              ${filteredReleases.length === 0 ? `
                <tr>
                  <td colspan="7" style="padding: 3rem; text-align: center; color: var(--text-secondary);">No release records found matching the active filters.</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right: Release Calendar Widget & Legend -->
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div class="panel-card" style="padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
          <h4 style="margin: 0 0 1rem 0; font-size: 0.95rem; font-family: var(--font-display);">Governed Release Calendar</h4>
          <div style="background: var(--bg-primary); border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
            ${releaseList.slice(0, 4).map(r => {
    const conflictLabel = r.planned_release_date.includes('-07-') || r.planned_release_date.includes('-12-')
      ? `<span style="font-size:0.65rem; color: var(--color-status-red-text); border: 1px solid var(--color-status-red-border); padding: 2px 4px; border-radius:3px; font-weight:700;">FREEZE CONFLICT</span>`
      : `<span style="font-size:0.65rem; color: var(--color-status-green-text); border: 1px solid var(--color-status-green-border); padding: 2px 4px; border-radius:3px;">CALENDAR CLEAR</span>`;
    return `
                <div style="border-left: 3px solid var(--color-brand); padding-left: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem;">
                  <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${r.release_id} (${r.version})</div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary);">Target: ${r.planned_release_date.split('T')[0]} | Env: ${r.environment}</div>
                  <div>${conflictLabel}</div>
                </div>
              `;
  }).join('')}
            ${releaseList.length === 0 ? '<div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center;">No scheduled releases.</div>' : ''}
          </div>
        </div>

        <div class="panel-card" style="padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-color); font-size: 0.8rem;">
          <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; font-family: var(--font-display);">Release Rules Legend</h4>
          <ul style="padding-left: 1.25rem; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; color: var(--text-secondary);">
            <li><strong>Low Risk (&lt;35)</strong>: Recommends automated, pre-approved change route without CAB.</li>
            <li><strong>High Risk (&gt;=60)</strong>: Strict CAB Review and formal approval flow mandatory.</li>
            <li><strong>Freeze Windows</strong>: Reassessed automatically for July and December calendar boundaries.</li>
          </ul>
        </div>
      </div>

    </div>

    <!-- Modal for Creation -->
    <div id="release-create-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); width: 90%; max-width: 600px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; font-family: var(--font-display);">Create Release Governance Package</h3>
          <span onclick="closeCreateModal()" style="cursor: pointer; font-size: 1.5rem; color: var(--text-secondary);">&times;</span>
        </div>
        
        <form onsubmit="handleCreateRelease(event)" style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.85rem;">
          <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label style="font-weight: 700; color: var(--text-secondary);">Select Project / Demand</label>
            <select id="modal-project-select" required onchange="onProjectSelectChange()" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
              <option value="">-- Choose Approved Demand --</option>
              ${dropdownOptions.demands.map(d => `<option value="${d.demand_id}">${d.demand_id} - ${d.title}</option>`).join('')}
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="font-weight: 700; color: var(--text-secondary);">Select Plan ID</label>
              <select id="modal-plan-select" required style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
                <option value="">-- Select Active Plan --</option>
              </select>
            </div>
            <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="font-weight: 700; color: var(--text-secondary);">Version Baseline</label>
              <input type="text" id="modal-version-input" value="v1.0.0" required style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="font-weight: 700; color: var(--text-secondary);">Build ID (Stage 06)</label>
              <input type="text" id="modal-build-input" value="" required placeholder="e.g. BLD-0072-1" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
            </div>
            <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="font-weight: 700; color: var(--text-secondary);">Target Environment</label>
              <select id="modal-env-select" required style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
                ${dropdownOptions.environments.map(e => `<option value="${e}">${e}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label style="font-weight: 700; color: var(--text-secondary);">Target Release Date</label>
            <input type="date" id="modal-date-input" required style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
            <button type="button" class="btn-secondary" onclick="closeCreateModal()" style="background: transparent; border: 1px solid var(--border-color); padding: 0.6rem 1.2rem; border-radius: var(--radius-md); color: var(--text-primary); cursor: pointer;">Cancel</button>
            <button type="submit" class="btn-primary" style="background: var(--color-brand); border: none; padding: 0.6rem 1.2rem; border-radius: var(--radius-md); color: var(--text-primary); cursor: pointer; font-weight:600;">Initialize Release</button>
          </div>
        </form>
      </div>
    </div>
  
    <!-- Redirection Footer -->
    <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
      <button onclick="window.location.hash = 'dashboard';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
        Return to Dashboard &rarr;
      </button>
    </div>
`;
}

function handleFiltersChange() {
  filterProject = document.getElementById('filter-project-input').value;
  filterStatus = document.getElementById('filter-status-input').value;
  filterEnvironment = document.getElementById('filter-env-input').value;
  filterRisk = document.getElementById('filter-risk-input').value;
  renderMainView();
}

function onProjectSelectChange() {
  const projectId = document.getElementById('modal-project-select').value;
  const planSelect = document.getElementById('modal-plan-select');
  const buildInput = document.getElementById('modal-build-input');
  const versionInput = document.getElementById('modal-version-input');
  const dateInput = document.getElementById('modal-date-input');

  if (!projectId) {
    planSelect.innerHTML = '<option value="">-- Select Active Plan --</option>';
    if (versionInput) versionInput.value = 'v1.0.0';
    if (buildInput) buildInput.value = '';
    if (dateInput) dateInput.value = '';
    return;
  }

  const suffix = projectId.split('-').pop();
  if (buildInput) buildInput.value = `BLD-${suffix}-1`;
  if (versionInput) versionInput.value = `v1.0.${parseInt(suffix) || 0}`;

  // Filter plans matching this project
  const relevantPlans = dropdownOptions.plans.filter(p => p.demand_id === projectId);
  if (planSelect) {
    planSelect.innerHTML = relevantPlans.map(p => `<option value="${p.plan_id}">${p.plan_id} (End Date: ${p.end_date})</option>`).join('');
  }
  if (relevantPlans.length > 0 && dateInput) {
    dateInput.value = relevantPlans[0].end_date;
  }
}

function openCreateModal() {
  populateCreateModalDropdowns();

  const activeDemandId = sessionStorage.getItem('selectedDemandId');
  if (activeDemandId) {
    const projectSelect = document.getElementById('modal-project-select');
    if (projectSelect) {
      projectSelect.value = activeDemandId;
      onProjectSelectChange();
    }
  }

  document.getElementById('release-create-modal').style.display = 'flex';
}

function closeCreateModal() {
  document.getElementById('release-create-modal').style.display = 'none';
}

async function handleCreateRelease(e) {
  e.preventDefault();

  const payload = {
    project_id: document.getElementById('modal-project-select').value,
    plan_id: document.getElementById('modal-plan-select').value,
    build_id: document.getElementById('modal-build-input').value,
    version: document.getElementById('modal-version-input').value,
    environment: document.getElementById('modal-env-select').value,
    planned_release_date: document.getElementById('modal-date-input').value + 'T22:00:00Z'
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Creation failed");
    const data = await res.json();
    closeCreateModal();
    navigateToRelease(data.release_id);
  } catch (err) {
    alert("Error initializing release: " + err.message);
  }
}

async function navigateToRelease(releaseId, targetTab = null) {
  selectedReleaseId = releaseId;
  if (targetTab) {
    activeSubTab = targetTab;
  } else if (!activeSubTab) {
    activeSubTab = 'overview';
  }

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${releaseId}`);
    if (res.ok) {
      currentReleaseDetail = await res.json();
      renderMainView();
    } else {
      alert("Failed to load release details.");
    }
  } catch (err) {
    console.error(err);
  }
}

function closeReleaseDetails() {
  selectedReleaseId = null;
  currentReleaseDetail = null;
  fetchReleases();
}

function changeTab(tabId) {
  activeSubTab = tabId;
  renderReleaseDetailsView();
}

function renderReleaseDetailsView() {
  const wrapper = document.getElementById('release-change-wrapper');
  if (!currentReleaseDetail) return;

  const r = currentReleaseDetail.release;
  const statusColor = r.status === 'Approved' ? 'green' : (r.status === 'Draft' ? 'gray' : (r.status === 'Failed' ? 'red' : 'amber'));
  const riskColor = (r.risk_score >= 60) ? 'red' : ((r.risk_score >= 35) ? 'amber' : 'green');
  const riskLabel = r.risk_score !== null ? `${r.risk_score}/100 (${r.risk_score >= 60 ? 'HIGH' : (r.risk_score >= 35 ? 'MED' : 'LOW')})` : 'Unscored';

  wrapper.innerHTML = `
    <!-- Header Back Panel -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <button onclick="closeReleaseDetails()" style="background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.5rem 1rem; color: var(--text-primary); cursor: pointer;">
          ← Back to Dashboard
        </button>
        <div>
          <h2 style="margin: 0; font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">
            Release: <span style="font-family: monospace; color: var(--color-brand);">${r.release_id}</span> (${r.version})
          </h2>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Project Ref: <strong>${r.project_id}</strong> | Plan ID: <strong>${r.plan_id}</strong></span>
        </div>
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <span class="status-pill status-${riskColor}" style="padding: 0.35rem 0.75rem; border-radius: var(--radius-round); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
          Risk: ${riskLabel}
        </span>
        <span class="status-pill status-${statusColor}" style="padding: 0.35rem 0.75rem; border-radius: var(--radius-round); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
          ${r.status}
        </span>
      </div>
    </div>

    <!-- Main Content Split layout -->
    <div style="display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem;">
      
      <!-- Left Column: Tabbed Area -->
      <div style="display: flex; flex-direction: column; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg);">
        
        <!-- Tab Headers -->
        <div style="display: flex; overflow-x: auto; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.15); scrollbar-width: none;">
          ${renderTabHeader('overview', 'Overview')}
          ${renderTabHeader('change', 'Change Request')}
          ${renderTabHeader('risk', 'Risk Assessment')}
          ${renderTabHeader('cab', 'CAB Review')}
          ${renderTabHeader('collision', 'Collision Detection')}
          ${renderTabHeader('audit', 'Audit Trail')}
        </div>

        <!-- Tab Body Content -->
        <div style="padding: 1.5rem;">
          ${renderActiveTabBody()}
        </div>

      </div>

      <!-- Right Column: AI Insights Panel -->
      <div class="panel-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem;">
        <div>
          <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>✨</span> AI Insights & Recommendations
          </h3>
          <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: var(--text-secondary);">Governance recommendations for production readiness.</p>
        </div>

        <!-- Readiness Score Gauge -->
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; text-align: center; display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Release Readiness Score</div>
          <div style="font-size: 2.25rem; font-weight: 800; color: ${r.risk_score !== null ? (r.risk_score >= 60 ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)') : 'var(--text-muted)'};">
            ${r.risk_score !== null ? (100 - r.risk_score) : '—'}%
          </div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">
            ${r.risk_score !== null ? (r.risk_score >= 60 ? 'Critical blockers or freeze rules alert.' : 'Low risk profile. Automation-ready.') : 'Evaluate risk profile to calculate.'}
          </div>
        </div>

        <!-- Insights Checklist -->
        <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8rem;">
          <div style="font-weight: 700; color: var(--text-primary);">Next Recommended Action:</div>
          <div style="background: rgba(99, 102, 241, 0.05); border: 1px dashed var(--color-brand); border-radius: var(--radius-sm); padding: 0.75rem; color: var(--text-primary); line-height: 1.4;">
            ${getNextRecommendedAction(r)}
          </div>

          <div style="font-weight: 700; color: var(--text-primary); margin-top: 0.5rem;">Release Checks Status:</div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${renderInsightCheck('ITSM Change Ticket', currentReleaseDetail.change_request ? 'passed' : 'fail')}
            ${renderInsightCheck('AI Risk Profiling', currentReleaseDetail.risk_assessment ? 'passed' : 'fail')}
            ${renderInsightCheck('Stage 07 Quality Gate', currentReleaseDetail.upstream.quality.quality_gate === 'Passed' ? 'passed' : 'fail')}
            ${renderInsightCheck('Freeze overlaps checker', currentReleaseDetail.collisions.length === 0 ? 'passed' : 'warn')}
            ${renderInsightCheck('Audit evidence bundle', currentReleaseDetail.audit_logs.length >= 3 ? 'passed' : 'fail')}
          </div>
        </div>

        <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 0.75rem; text-align: center;">
          Stage 08 Governance Engine v1.0
        </div>
      </div>

    </div>
  `;
}

function renderTabHeader(tabId, label) {
  const isActive = activeSubTab === tabId;
  return `
    <div onclick="changeTab('${tabId}')" class="stage-8-tab" style="padding: 1rem 1.25rem; font-weight: 600; font-size: 0.85rem; color: ${isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${isActive ? 'var(--color-brand)' : 'transparent'}; background: ${isActive ? 'rgba(99,102,241,0.05)' : 'transparent'}; cursor: pointer; white-space: nowrap;">
      ${label}
    </div>
  `;
}

function renderInsightCheck(label, status) {
  const symbol = status === 'passed' ? '✓' : (status === 'fail' ? '✗' : '⚠');
  const colorClass = status === 'passed' ? 'green' : (status === 'fail' ? 'red' : 'amber');
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
      <span style="color: var(--text-secondary);">${label}</span>
      <span style="color: var(--color-status-${colorClass}-text); font-weight: 800; font-family: monospace;">${symbol}</span>
    </div>
  `;
}

function getNextRecommendedAction(r) {
  if (r.status === 'Draft') {
    return "Complete change documentation and click <strong>Submit Change</strong> to evaluate risk and start approvals.";
  }
  if (r.status === 'Pending Approval') {
    return "Change request is pending formal CAB review. Chairperson must review notes in the <strong>CAB Review Tab</strong> and sign off.";
  }
  if (r.status === 'Approved') {
    return "Release is officially certified. Hand off to Operations module to schedule production deployment.";
  }
  if (r.status === 'Failed') {
    return "Release was rejected or deployment failed. Re-run tests, adjust plan dates, or request exceptions.";
  }
  return "Draft release documentation to get started.";
}

function renderActiveTabBody() {
  switch (activeSubTab) {
    case 'overview':
      return renderOverviewTab();
    case 'build':
      return renderBuildTab();
    case 'quality':
      return renderQualityTab();
    case 'dependencies':
      return renderDependenciesTab();
    case 'change':
      return renderChangeTab();
    case 'risk':
      return renderRiskTab();
    case 'cab':
      return renderCABTab();
    case 'collision':
      return renderCollisionTab();
    case 'audit':
      return renderAuditTab();
    default:
      return 'Overview';
  }
}

// ─── TABS IMPLEMENTATION ──────────────────────────────────────────────────────

function renderOverviewTab() {
  const d = currentReleaseDetail.upstream.demand || {};
  const p = currentReleaseDetail.upstream.plan || {};
  const r = currentReleaseDetail.release;
  return `
    <div style="display: flex; flex-direction: column; gap: 2rem;">
      <!-- Overview & Metadata -->
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Release Overview & Metadata</h3>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Project / Demand Details</div>
            <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem;">
              <div><strong>Title:</strong> ${d.title || 'N/A'}</div>
              <div><strong>Type:</strong> ${d.type || 'N/A'}</div>
              <div><strong>Business Domain:</strong> ${d.domain || 'N/A'}</div>
              <div><strong>Submitted By:</strong> ${d.submitted_by || 'N/A'}</div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Planning & Timeline</div>
            <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem;">
              <div><strong>Plan End Date:</strong> ${p.end_date || 'N/A'}</div>
              <div><strong>Committed Target Date:</strong> ${r.planned_release_date.split('T')[0]}</div>
              <div><strong>Active Sprint Tasks:</strong> ${p.tasks ? p.tasks.length : 0} items</div>
              <div><strong>Status:</strong> <span style="color: var(--color-status-green-text); font-weight:700;">Plan Accepted</span></div>
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 1.25rem;">
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Business Case Justification</div>
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-size: 0.85rem; line-height: 1.5; color: var(--text-primary);">
            ${d.business_case_summary || 'No approved business case summary was authored for this demand record.'}
          </div>
        </div>
      </div>

      <!-- Build & Deployment Artifacts -->
      <div style="border-top: 2px solid var(--border-color); padding-top: 1.5rem;">
        ${renderBuildTab()}
      </div>

      <!-- Quality Gate & Test Summary -->
      <div style="border-top: 2px solid var(--border-color); padding-top: 1.5rem;">
        ${renderQualityTab()}
      </div>

      <!-- Upstream Project Dependencies -->
      <div style="border-top: 2px solid var(--border-color); padding-top: 1.5rem;">
        ${renderDependenciesTab()}
      </div>
    </div>
  `;
}

function renderBuildTab() {
  const b = currentReleaseDetail.upstream.build || {};
  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Build & Deployment Artifacts (Stage 06)</h3>
        <span style="font-size: 0.75rem; color: var(--text-secondary);">Source: <strong>Build & Deploy Pipeline</strong></span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.8rem;">
          <div style="color: var(--text-secondary);">Build ID</div>
          <div style="font-weight: 700; color: var(--color-brand); font-family: monospace; font-size: 0.9rem; margin-top:0.2rem;">${b.build_id}</div>
        </div>
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.8rem;">
          <div style="color: var(--text-secondary);">Artifact Version</div>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem; margin-top:0.2rem;">${b.artifact_version}</div>
        </div>
        <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.8rem;">
          <div style="color: var(--text-secondary);">Rollback Package</div>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; font-family: monospace; margin-top:0.2rem;">${b.rollback_package}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary);">CI/CD Pipeline Logs</div>
        <pre style="background: #020617; border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-family: monospace; font-size: 0.75rem; color: #10b981; line-height: 1.5; overflow-x: auto; max-height: 250px; overflow-y: auto; margin: 0;">${b.deployment_logs}</pre>
      </div>


    </div>
  `;
}

function renderQualityTab() {
  const q = currentReleaseDetail.upstream.quality || {};
  const openIssues = Array.isArray(q.open_issues) ? q.open_issues : [];
  const gateStatus = q.quality_gate || 'Not Evaluated';
  const statusColor = gateStatus === 'Passed' ? 'green' : (gateStatus === 'Not Evaluated' ? 'amber' : 'red');
  const isLiveData = q.source && q.source.includes('Stage 07');
  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Quality Gate &amp; Test Summary (Stage 07)</h3>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          ${isLiveData ? `<span style="font-size: 0.7rem; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); color: #10b981; padding: 0.2rem 0.6rem; border-radius: 999px; font-weight: 700;">● LIVE DATA</span>` : ''}
          <span style="font-size: 0.75rem; color: var(--text-secondary);">Source: <strong>${q.source || 'Test &amp; Quality Module'}</strong></span>
        </div>
      </div>

      <!-- Summary Counters Row -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;">
        <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary);">${q.total_executions ?? '—'}</div>
          <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem;">Test Runs</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--color-status-green-text);">${q.total_executions != null ? (q.total_executions === 0 ? '—' : q.test_results.split(',')[1]?.trim().split(' ')[0] ?? '—') : '—'}</div>
          <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem;">Passed</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: ${q.total_defects > 0 ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)'};">${q.total_defects ?? '—'}</div>
          <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem;">Open Defects</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: ${q.total_security_findings > 0 ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)'};">${q.total_security_findings ?? '—'}</div>
          <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem;">Sec Findings</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>Quality Gate Status:</strong>
              <span class="status-pill status-${statusColor}" style="padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size:0.75rem; font-weight:700; text-transform:uppercase;">${gateStatus}</span>
            </div>
            <div><strong>Code Coverage:</strong> ${q.code_coverage || 'N/A'}</div>
            <div><strong>Test Execution:</strong> ${q.test_results || 'No executions recorded'}</div>
            <div><strong>Pass Rate:</strong> ${q.performance_results || 'N/A'}</div>
          </div>

          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-size: 0.8rem; border-left: 3px solid var(--color-status-${statusColor}-border);">
            <strong>Defect Verdict Summary:</strong>
            <p style="margin: 0.4rem 0 0 0; color: var(--text-secondary); line-height: 1.4;">${q.defect_summary || '0 open critical defects'}</p>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Vulnerability Scan Report</div>
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-size: 0.8rem; color: var(--text-primary); line-height: 1.5;">
            <strong>SAST/DAST Scan Summary:</strong>
            <div style="color: var(--text-secondary); margin-top: 0.25rem;">${q.security_scan || 'No security scan data available'}</div>
          </div>
          
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Open Defects Detail</div>
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem;">
            ${openIssues.map(bug => `
              <div style="border-left: 2px solid var(--color-status-red-border); padding-left: 0.5rem;">
                <span style="font-weight:700; color:var(--color-status-red-text);">${bug.defect_id || 'DEF-?'} (${bug.severity || 'unknown'})</span>
                <div style="color:var(--text-secondary); font-size:0.75rem; margin-top:0.1rem;">${bug.summary || 'No description'}</div>
              </div>
            `).join('')}
            ${openIssues.length === 0 ? '<div style="color:var(--text-muted);">No open blocking issues.</div>' : ''}
          </div>

          <div style="font-size: 0.75rem; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
            Full test evidence available in the <strong>Test &amp; Quality</strong> module (Stage 07)
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDependenciesTab() {
  const deps = currentReleaseDetail.upstream.dependencies || [];
  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Upstream Project Dependencies (Stage 04)</h3>
      
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${deps.map(d => {
    return `
            <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
              <div style="display:flex; flex-direction:column; gap:0.25rem;">
                <div style="font-weight: 700; color: var(--text-primary);">Dependency ${d.dependency_id}</div>
                <div style="color: var(--text-secondary); font-size:0.8rem;">Task <strong>${d.source_task_id}</strong> relies on <strong>${d.target_task_id}</strong></div>
              </div>
              <div style="display:flex; gap: 0.75rem; align-items:center;">
                <span class="status-pill status-${d.status === 'resolved' ? 'green' : 'amber'}" style="padding: 0.2rem 0.5rem; border-radius:var(--radius-sm); font-size:0.7rem; font-weight:700; text-transform:uppercase;">${d.status}</span>
                <span style="font-size:0.75rem; color:var(--text-secondary);">Threat: <strong>${d.threat_level || 'low'}</strong></span>
              </div>
            </div>
          `;
  }).join('')}
        ${deps.length === 0 ? `
          <div style="text-align:center; padding: 2rem; color:var(--text-secondary);">No upstream dependencies found.</div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderChangeTab() {
  const cr = currentReleaseDetail.change_request;
  const rel = currentReleaseDetail.release;

  if (!cr) {
    return `
      <div style="text-align: center; padding: 3rem;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">✍️</div>
        <h3>No Change Request Drafted</h3>
        <p style="color: var(--text-secondary); max-width: 400px; margin: 0.5rem auto 1.5rem auto;">Run the change authoring agent to generate complete deployment, rollback, and validation plans.</p>
        <button class="btn-primary" onclick="triggerDraftChange()" style="background: var(--color-brand); border: none; padding: 0.6rem 1.2rem; border-radius: var(--radius-md); font-weight: 600; color: var(--text-primary); cursor: pointer;">
          Draft Change Request
        </button>
      </div>
    `;
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Drafted ITSM Change Request</h3>
        <div>
          <button class="btn-primary" onclick="submitChangeRequest()" style="background: var(--color-brand); border: none; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight: 600; color: var(--text-primary); cursor: pointer; font-size: 0.8rem;">
            Submit Change Request
          </button>
        </div>
      </div>

      <form id="change-edit-form" onsubmit="saveChangeRequestEdit(event)" style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.85rem;">
        <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label style="font-weight: 700; color: var(--text-secondary);">Release Summary</label>
          <input type="text" id="edit-summary" value="${cr.summary || ''}" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary);">
        </div>

        <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label style="font-weight: 700; color: var(--text-secondary);">Business Justification</label>
          <textarea id="edit-justification" rows="2" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;">${cr.business_justification || ''}</textarea>
        </div>

        <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label style="font-weight: 700; color: var(--text-secondary);">Impact Analysis</label>
          <textarea id="edit-impact" rows="2" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;">${cr.impact_analysis || ''}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label style="font-weight: 700; color: var(--text-secondary);">Deployment Steps</label>
            <textarea id="edit-deployment" rows="4" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;">${cr.deployment_plan || ''}</textarea>
          </div>
          <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label style="font-weight: 700; color: var(--text-secondary);">Rollback Plan</label>
            <textarea id="edit-rollback" rows="4" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;">${cr.rollback_plan || ''}</textarea>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label style="font-weight: 700; color: var(--text-secondary);">Validation Plan</label>
            <textarea id="edit-validation" rows="3" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;">${cr.validation_plan || ''}</textarea>
          </div>
          <div class="form-group" style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label style="font-weight: 700; color: var(--text-secondary);">Known Issues / Notes</label>
            <textarea id="edit-issues" rows="3" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;">${cr.known_issues || ''}</textarea>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="submit" class="btn-primary" style="background: transparent; border: 1px solid var(--color-brand); color: var(--color-brand); padding: 0.5rem 1rem; border-radius: var(--radius-md); cursor: pointer; font-weight:600;">Save Draft</button>
        </div>
      </form>
    </div>
  `;
}

async function triggerDraftChange() {
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/draft`, { method: 'POST' });
    if (res.ok) {
      navigateToRelease(selectedReleaseId, 'change');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function saveChangeRequestEdit(e) {
  e.preventDefault();
  const payload = {
    summary: document.getElementById('edit-summary').value,
    business_justification: document.getElementById('edit-justification').value,
    impact_analysis: document.getElementById('edit-impact').value,
    deployment_plan: document.getElementById('edit-deployment').value,
    validation_plan: document.getElementById('edit-validation').value,
    rollback_plan: document.getElementById('edit-rollback').value,
    known_issues: document.getElementById('edit-issues').value
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/change`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert("Draft saved successfully.");
      navigateToRelease(selectedReleaseId, 'change');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function submitChangeRequest() {
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/submit`, { method: 'POST' });
    if (res.ok) {
      alert("Change request submitted. AI risk assessment and collision scans completed.");
      navigateToRelease(selectedReleaseId, 'risk');
    }
  } catch (err) {
    alert(err.message);
  }
}

function renderRiskTab() {
  const ra = currentReleaseDetail.risk_assessment;

  if (!ra) {
    return `
      <div style="text-align: center; padding: 3rem;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚖️</div>
        <h3>No Risk Assessment Calculated</h3>
        <p style="color: var(--text-secondary); max-width: 400px; margin: 0.5rem auto 1.5rem auto;">Generate the release risk profile to evaluate blast radius and required approvals.</p>
        <button class="btn-primary" onclick="triggerRiskAssessment()" style="background: var(--color-brand); border: none; padding: 0.6rem 1.2rem; border-radius: var(--radius-md); font-weight: 600; color: var(--text-primary); cursor: pointer;">
          Run AI Risk Assessment
        </button>
      </div>
    `;
  }

  const riskClass = ra.risk_level === 'high' ? 'red' : (ra.risk_level === 'medium' ? 'amber' : 'green');

  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">AI Risk Analysis & Blast Radius</h3>
        <button class="btn-primary" onclick="triggerRiskAssessment()" style="background: transparent; border: 1px solid var(--border-color); padding: 0.4rem 0.8rem; border-radius: var(--radius-md); color: var(--text-primary); cursor: pointer; font-size: 0.8rem;">
          Re-evaluate Risk
        </button>
      </div>

      <!-- Risk Score Widget -->
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem;">
        
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Overall Risk Score</div>
          <div style="font-size: 3.5rem; font-weight: 800; color: var(--color-status-${riskClass}-text); line-height: 1;">${ra.overall_score}</div>
          <span class="status-pill status-${riskClass}" style="padding: 0.25rem 0.6rem; border-radius: var(--radius-round); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-top: 0.25rem;">
            ${ra.risk_level}
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem; justify-content: center;">
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Risk Score Factor Breakdown</div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem;">
            ${renderRiskMeterRow('Database Migrations', ra.database_changes.includes('DDL') || ra.database_changes.includes('migrations') ? 60 : 10)}
            ${renderRiskMeterRow('Config File Drift', ra.configuration_changes.includes('drift') ? 50 : 10)}
            ${renderRiskMeterRow('Security Vulnerabilities', ra.security_score < 80 ? 65 : 15)}
            ${renderRiskMeterRow('Critical Open Defects', ra.critical_defects > 0 ? 80 : 0)}
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 1.25rem;">
        <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">AI Governance Recommendation</div>
        <div style="background: rgba(99, 102, 241, 0.05); border: 1px dashed var(--color-brand); padding: 1rem; border-radius: var(--radius-md); font-size: 0.85rem; line-height: 1.5; color: var(--text-primary);">
          ${ra.recommendation}
        </div>
      </div>
    </div>
  `;
}

function renderRiskMeterRow(label, pct) {
  const barColor = pct >= 60 ? 'red' : (pct >= 35 ? 'amber' : 'green');
  return `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
      <span style="flex: 1; color: var(--text-secondary);">${label}</span>
      <div style="width: 150px; background: rgba(0,0,0,0.3); height: 8px; border-radius: 4px; border: 1px solid var(--border-color); overflow: hidden;">
        <div style="width: ${pct}%; background: var(--color-status-${barColor}-text); height: 100%;"></div>
      </div>
      <span style="width: 30px; text-align: right; color: var(--text-primary); font-weight: 700;">${pct}%</span>
    </div>
  `;
}

async function triggerRiskAssessment() {
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/evaluate-risk`, { method: 'POST' });
    if (res.ok) {
      navigateToRelease(selectedReleaseId, 'cab');
    }
  } catch (err) {
    alert(err.message);
  }
}

function renderCABTab() {
  const ra = currentReleaseDetail.risk_assessment;
  const cab = currentReleaseDetail.cab;
  const rel = currentReleaseDetail.release;

  if (!ra) {
    return `
      <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
        <h3>AI Risk Assessment Required</h3>
        <p>You must evaluate the risk assessment before entering CAB review.</p>
      </div>
    `;
  }



  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Change Advisory Board (CAB) Review</h3>

      <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 1.5rem;">
        
        <!-- CAB Chairperson Decision Panel -->
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Submit Chairperson Verdict</div>
          
          <form onsubmit="submitCABReview(event)" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                <label style="color: var(--text-secondary); font-weight:700;">Meeting Date</label>
                <input type="date" id="cab-meeting-date" required value="2026-07-14" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.4rem; color: var(--text-primary);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                <label style="color: var(--text-secondary); font-weight:700;">Chairperson</label>
                <select id="cab-chairperson" required style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.4rem; color: var(--text-primary);">
                  ${dropdownOptions.approvers.map(a => `<option value="${a}">${a}</option>`).join('')}
                </select>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="color: var(--text-secondary); font-weight:700;">Comments & Directives</label>
              <textarea id="cab-comments" rows="3" required placeholder="Chairperson's feedback, rollback guarantees, and constraints." style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem; color: var(--text-primary); resize: vertical;"></textarea>
            </div>

            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
              <button type="submit" value="Approve" onclick="this.form.submittedDecision=this.value" class="btn-primary" style="background: var(--color-status-green-border); border: none; color: var(--color-status-green-text); font-weight: 700; padding: 0.5rem 1rem; border-radius: var(--radius-md); cursor: pointer;">Approve Release</button>
              <button type="submit" value="Reject" onclick="this.form.submittedDecision=this.value" class="btn-primary" style="background: var(--color-status-red-border); border: none; color: var(--color-status-red-text); font-weight: 700; padding: 0.5rem 1rem; border-radius: var(--radius-md); cursor: pointer;">Reject</button>
              <button type="submit" value="Request Changes" onclick="this.form.submittedDecision=this.value" class="btn-primary" style="background: var(--color-status-amber-border); border: none; color: var(--color-status-amber-text); font-weight: 700; padding: 0.5rem 1rem; border-radius: var(--radius-md); cursor: pointer;">Request Changes</button>
            </div>
          </form>
        </div>

        <!-- CAB Evidence / Checklist column -->
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Required Release Evidence</div>
          
          <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.4rem;">Compliance Preconditions:</div>
            
            <div style="display: flex; justify-content: space-between;">
              <span>Quality Gate Verdict</span>
              <span style="color: ${currentReleaseDetail.upstream.quality.quality_gate === 'Passed' ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)'}; font-weight:700;">
                ${currentReleaseDetail.upstream.quality.quality_gate}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Code Coverage (>=80%)</span>
              <span style="color: ${parseInt(currentReleaseDetail.upstream.quality.code_coverage) >= 80 ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}; font-weight:700;">
                ${currentReleaseDetail.upstream.quality.code_coverage}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Collision Conflicts</span>
              <span style="color: ${currentReleaseDetail.collisions.length === 0 ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)'}; font-weight:700;">
                ${currentReleaseDetail.collisions.length === 0 ? 'CLEAR' : 'CONFLICT'}
              </span>
            </div>
          </div>
        </div>

      </div>

      ${cab ? `
        <div style="border-top: 1px solid var(--border-color); padding-top: 1.25rem;">
          <h4 style="margin:0 0 0.5rem 0; font-size:0.9rem; color: var(--text-primary);">Latest CAB Decision</h4>
          <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-md); font-size: 0.85rem; display:flex; flex-direction:column; gap:0.4rem;">
            <div><strong>Decision:</strong> <span style="font-weight:700; text-transform:uppercase; color: var(--color-status-${cab.decision === 'Approve' ? 'green' : 'red'}-text);">${cab.decision}</span></div>
            <div><strong>Chairperson:</strong> ${cab.chairperson}</div>
            <div><strong>Comments:</strong> "${cab.comments}"</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function submitCABReview(e) {
  e.preventDefault();
  const decision = e.target.submittedDecision;

  const payload = {
    meeting_date: document.getElementById('cab-meeting-date').value,
    chairperson: document.getElementById('cab-chairperson').value,
    decision: decision,
    comments: document.getElementById('cab-comments').value
  };

  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/cab-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert(`CAB Review successfully submitted: ${decision}`);
      navigateToRelease(selectedReleaseId, 'collision');
    }
  } catch (err) {
    alert(err.message);
  }
}

function renderCollisionTab() {
  const col = currentReleaseDetail.collisions;
  const rel = currentReleaseDetail.release;
  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Environment Collision & Schedule Conflicts</h3>
        <button class="btn-primary" onclick="triggerCollisionCheck()" style="background: transparent; border: 1px solid var(--border-color); padding: 0.4rem 0.8rem; border-radius: var(--radius-md); color: var(--text-primary); cursor: pointer; font-size: 0.8rem;">
          Run Collision Scan
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 1rem;">
        ${col.map(c => `
          <div style="background: var(--color-status-red-bg); border: 1px solid var(--color-status-red-border); padding: 1rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:var(--color-status-red-text); font-size:0.9rem;">⚠️ Conflict Alert: ${c.conflicting_release}</strong>
              <span class="status-pill status-red" style="padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight:700;">BLOCKED</span>
            </div>
            <div style="color: var(--text-primary); line-height: 1.4;">${c.reason}</div>
            <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">
              <strong>Shared Target Server:</strong> ${c.shared_server} | <strong>Database:</strong> ${c.shared_database}
            </div>
            <div style="color: var(--color-status-green-text); font-size: 0.8rem; margin-top: 0.25rem; font-weight:700;">
              💡 Recommended Alternate Date: ${c.recommended_schedule}
            </div>
          </div>
        `).join('')}

        ${col.length === 0 ? `
          <div style="background: var(--color-status-green-bg); border: 1px solid var(--color-status-green-border); padding: 1.5rem; border-radius: var(--radius-md); text-align: center; color: var(--color-status-green-text);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
            <h4 style="margin:0;">No Release Calendar Conflicts Detected</h4>
            <p style="color: var(--text-secondary); font-size:0.8rem; margin-top:0.3rem;">This scheduled window is clear of production freeze windows and same-environment server clashes.</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function triggerCollisionCheck() {
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/collision`, { method: 'POST' });
    if (res.ok) {
      alert("Collision detection scan completed.");
      navigateToRelease(selectedReleaseId, 'audit');
    }
  } catch (err) {
    alert(err.message);
  }
}

function renderAuditTab() {
  const logs = currentReleaseDetail.audit_logs || [];

  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-primary);">Compliance Audit Trail & Traceability</h3>
          <p style="margin: 0.25rem 0 0 0; font-size: 0.78rem; color: var(--text-secondary);">End-to-End Immutable Governance Records across all delivery lifecycle stages.</p>
        </div>
        <button class="btn-primary" onclick="triggerAuditUpdate()" style="background: transparent; border: 1px solid var(--border-color); padding: 0.4rem 0.8rem; border-radius: var(--radius-md); color: var(--text-primary); cursor: pointer; font-size: 0.8rem; font-weight: 600;">
          Recalculate Audit Trail
        </button>
      </div>

      <!-- Timeline List -->
      <div style="position: relative; padding-left: 2rem; display: flex; flex-direction: column; gap: 1.25rem; margin-top: 0.5rem;">
        <!-- Vertical line -->
        <div style="position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: var(--border-color);"></div>

        ${logs.map(log => {
          let formattedDate = '—';
          if (log.timestamp) {
            try {
              const cleanTs = String(log.timestamp).replace(/\+00:00Z?$/, 'Z');
              const d = new Date(cleanTs);
              formattedDate = isNaN(d.getTime()) ? String(log.timestamp) : d.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
            } catch (e) {
              formattedDate = String(log.timestamp);
            }
          }
          return `
            <div style="position: relative; font-size: 0.85rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem 1rem;">
              <!-- Node dot -->
              <div style="position: absolute; left: -29px; top: 12px; width: 14px; height: 14px; border-radius: 50%; background: var(--color-brand); border: 3px solid var(--bg-secondary);"></div>
              
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <div>
                  <strong style="color: var(--text-primary); font-size: 0.88rem;">${log.event}</strong>
                  <span style="font-size: 0.72rem; color: var(--color-brand); font-weight: 700; margin-left: 0.5rem; background: rgba(99, 102, 241, 0.1); padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.2);">${log.module_name}</span>
                </div>
                <span style="font-size: 0.78rem; color: var(--text-primary); font-family: monospace; font-weight: 700; background: var(--bg-tertiary); padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid var(--border-color);">${formattedDate}</span>
              </div>
              <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.4rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                <span>Performed by: <strong style="color: var(--text-primary);">${log.performed_by}</strong></span>
                <span>Evidence: <a href="${log.evidence_link}" target="_blank" style="color: var(--color-brand); font-weight: 600; text-decoration: underline;">${log.evidence_link}</a></span>
              </div>
            </div>
          `;
        }).join('')}
        ${logs.length === 0 ? `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No audit logs captured. Click "Recalculate Audit Trail" to aggregate milestone events.</div>` : ''}
      </div>
    </div>
  `;
}

async function triggerAuditUpdate() {
  try {
    const res = await fetch(`${RELEASE_CHANGE_API_BASE}/releases/${selectedReleaseId}/audit`, { method: 'POST' });
    if (res.ok) {
      alert("Milestone audit trails consolidated.");
      navigateToRelease(selectedReleaseId, 'audit');
    }
  } catch (err) {
    alert(err.message);
  }
}
