// App Shell Orchestrator & Screen Router
const API_BASE = 'http://127.0.0.1:8000/api';

// Core State
let activeStage = sessionStorage.getItem('activeStage') || 'demand-intake';
let demands = [];
let selectedDemandId = sessionStorage.getItem('selectedDemandId') || null;
let activeFormTab = 'text'; // 'text' or 'file'
let selectedFile = null;
let classificationSuggestions = null;
let capacitySuggestion = null;
let businessCaseSuggestion = null;

// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  const rail = document.getElementById('pipeline-rail');
  if (rail) {
    // Sync the rail with activeStage
    rail.setAttribute('active-stage', activeStage);
    rail.addEventListener('stage-change', (e) => {
      switchStage(e.detail.stageId);
    });
  }

  // Load initial view
  switchStage(activeStage);
}

// Swap content area between Module 01 screen and placeholders
function switchStage(stageId) {
  activeStage = stageId;
  sessionStorage.setItem('activeStage', stageId);
  const viewport = document.getElementById('viewport');

  // Sync the stage rail highlight
  const rail = document.getElementById('pipeline-rail');
  if (rail && rail.getAttribute('active-stage') !== stageId) {
    rail.setAttribute('active-stage', stageId);
  }
  
  if (stageId === 'demand-intake') {
    renderIntakeScreen();
    fetchDemands();
  } else if (stageId === 'estimate-shape') {
    if (window.renderEstimateScreen) {
      window.renderEstimateScreen();
      window.fetchEstimates();
    }
  } else if (stageId === 'plan-schedule') {
    if (window.renderPlanScreen) {
      window.renderPlanScreen();
      window.fetchPlans();
    }
  } else {
    // Render the placeholder web component for other stages
    viewport.innerHTML = `<module-placeholder module-id="${stageId}"></module-placeholder>`;
  }
}

// Expose switchStage globally so stage modules can redirect (e.g. HITL accept → Stage 04)
window.switchStage = switchStage;

// Render the Stage 01 Demand & Intake viewport layout
function renderIntakeScreen() {
  const viewport = document.getElementById('viewport');
  viewport.innerHTML = `
    <div class="intake-screen">
      <!-- Left Sidebar for Demands Listing -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Demands Queue</h3>
          <button class="btn-new" id="btn-new-intake">+ New Intake</button>
        </div>
        <ul class="demand-list" id="demand-list-container">
          <li class="demand-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Loading demands...
          </li>
        </ul>
      </aside>

      <!-- Right Panel for Form or Active Details Wizard -->
      <main class="details-panel" id="details-panel-container">
        <!-- Rendered dynamically -->
      </main>
    </div>
  `;

  document.getElementById('btn-new-intake').addEventListener('click', () => {
    selectedDemandId = null;
    sessionStorage.removeItem('selectedDemandId');
    clearSidebarSelection();
    showNewIntakeForm();
  });
}

// Helper to remove active classes on list items
function clearSidebarSelection() {
  document.querySelectorAll('.demand-item').forEach(item => {
    item.classList.remove('active');
  });
}

// Fetch demand list from FastAPI backend
async function fetchDemands() {
  const container = document.getElementById('demand-list-container');
  try {
    const res = await fetch(`${API_BASE}/demands`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    demands = await res.json();
    renderDemandList();
    
    // Automatically select the first demand if none is selected, or if the selected demand doesn't exist anymore
    const exists = demands.some(d => d.demand_id === selectedDemandId);
    if (demands.length > 0 && (selectedDemandId === null || !exists)) {
      selectDemand(demands[0].demand_id);
    } else if (selectedDemandId !== null && exists) {
      selectDemand(selectedDemandId);
    } else {
      showNewIntakeForm();
    }
  } catch (err) {
    console.error("Failed to fetch demands:", err);
    container.innerHTML = `
      <li style="padding: 1.5rem; text-align: center; color: var(--color-status-red-text);">
        <div style="font-weight: 700; margin-bottom: 0.5rem;">Backend Offline</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
          Start FastAPI backend at <code style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">uvicorn main:app --reload</code> to connect real data and AI orchestration.
        </div>
      </li>
    `;
    // Render empty state or default new form
    showNewIntakeForm();
  }
}

// Update the list of demands in the sidebar
function renderDemandList() {
  const container = document.getElementById('demand-list-container');
  if (demands.length === 0) {
    container.innerHTML = `<li style="padding: 2rem; text-align: center; color: var(--text-muted);">No demands found. Submit one below.</li>`;
    return;
  }

  container.innerHTML = demands.map(demand => {
    const isActive = demand.demand_id === selectedDemandId;
    // Map record status to color strings
    let statusClass = 'gray';
    if (demand.status === 'approved') statusClass = 'green';
    else if (demand.status === 'classified' || demand.status === 'capacity-checked') statusClass = 'amber';
    else if (demand.status === 'rejected') statusClass = 'red';
    
    return `
      <li class="demand-item ${isActive ? 'active' : ''}" data-id="${demand.demand_id}">
        <div class="demand-item-header">
          <span class="demand-item-id">${demand.demand_id}</span>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;" class="${statusClass}">
              ${demand.status}
            </span>
            <button type="button" class="btn-queue-delete" data-id="${demand.demand_id}" style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 0.2rem; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: opacity 0.2s;" title="Delete Demand" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <h4 class="demand-item-title">${demand.title}</h4>
        <div class="demand-item-meta">
          <span>By: ${demand.submitted_by.split('@')[0]}</span>
          <span>${demand.submitted_date}</span>
        </div>
      </li>
    `;
  }).join('');

  // Add click listeners to items
  container.querySelectorAll('.demand-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      selectDemand(id);
    });
  });

  // Add click listeners for delete buttons
  container.querySelectorAll('.btn-queue-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent selectDemand from firing
      const id = btn.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this demand? This cannot be undone.')) {
        try {
          const res = await fetch(`${API_BASE}/demands/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete demand.");
          if (selectedDemandId === id) {
              selectedDemandId = null;
          }
          await fetchDemands();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  });
}

// Select a demand, update list states, and render the details wizard
function selectDemand(id) {
  selectedDemandId = id;
  sessionStorage.setItem('selectedDemandId', id);
  clearSidebarSelection();
  const activeItem = document.querySelector(`.demand-item[data-id="${id}"]`);
  if (activeItem) activeItem.classList.add('active');

  const demand = demands.find(d => d.demand_id === id);
  if (demand) {
    renderDemandWizard(demand);
  }
}

// Render the Intake Creation Form (supporting Text & Document tabs)
function showNewIntakeForm() {
  const panel = document.getElementById('details-panel-container');
  panel.innerHTML = `
    <div class="panel-card">
      <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-top: 0; margin-bottom: 0.5rem; color: var(--text-primary);">
        Capture & Structure Demand
      </h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Submit a new business request description or upload an extraction document to start the delivery lifecycle pipeline.
      </p>

      <!-- Input Mode Tabs -->
      <div class="tabs-container">
        <button class="tab-btn ${activeFormTab === 'text' ? 'active' : ''}" id="tab-text">Text Entry</button>
        <button class="tab-btn ${activeFormTab === 'file' ? 'active' : ''}" id="tab-file">Document Upload</button>
      </div>

      <!-- Error alert -->
      <div class="error-message" id="intake-error"></div>

      <!-- Submission Form -->
      <form id="intake-form">
        <div class="form-group">
          <label for="intake-title">Request Title (Optional - AI will generate if blank)</label>
          <input type="text" id="intake-title" placeholder="e.g. Mobile Checkout Redesign">
        </div>

        <div class="form-group">
          <label for="intake-submitter">Submitter Email (Optional)</label>
          <input type="text" id="intake-submitter" placeholder="e.g. developer.user@company.com">
        </div>

        <!-- Text tab field -->
        <div id="tab-content-text" style="display: ${activeFormTab === 'text' ? 'block' : 'none'};">
          <div class="form-group">
            <label for="intake-desc">Request Description *</label>
            <textarea id="intake-desc" placeholder="Describe the business requirement, objectives, context, and desired outcomes..."></textarea>
          </div>
        </div>

        <!-- File tab field -->
        <div id="tab-content-file" style="display: ${activeFormTab === 'file' ? 'block' : 'none'};">
          <div class="form-group">
            <label>Request Document * (.txt, .pdf, .docx only)</label>
            <div class="file-dropzone">
              <svg style="width: 40px; height: 40px; fill: var(--text-muted); margin-bottom: 0.5rem;" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
              <div>Drag file here or click to select</div>
              <input type="file" id="intake-file" accept=".txt,.pdf,.docx">
            </div>
            <div id="selected-file-info" style="display: none;" class="file-info">
              <span id="selected-file-name" style="font-weight: 600;">document.pdf</span>
              <button type="button" class="btn-remove" id="btn-remove-file">Remove</button>
            </div>
          </div>
        </div>

        <div class="submit-row" style="margin-top: 2rem;">
          <button type="submit" class="btn-primary" id="btn-submit-intake">
            Submit Intake & Extract
          </button>
        </div>
      </form>
    </div>
  `;

  // Attach Tab switcher events
  document.getElementById('tab-text').addEventListener('click', (e) => {
    e.preventDefault();
    activeFormTab = 'text';
    document.getElementById('tab-text').classList.add('active');
    document.getElementById('tab-file').classList.remove('active');
    document.getElementById('tab-content-text').style.display = 'block';
    document.getElementById('tab-content-file').style.display = 'none';
  });

  document.getElementById('tab-file').addEventListener('click', (e) => {
    e.preventDefault();
    activeFormTab = 'file';
    document.getElementById('tab-file').classList.add('active');
    document.getElementById('tab-text').classList.remove('active');
    document.getElementById('tab-content-file').style.display = 'block';
    document.getElementById('tab-content-text').style.display = 'none';
  });

  // Attach File selection events
  const fileInput = document.getElementById('intake-file');
  const fileInfoDiv = document.getElementById('selected-file-info');
  const fileNameSpan = document.getElementById('selected-file-name');
  const removeFileBtn = document.getElementById('btn-remove-file');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      selectedFile = e.target.files[0];
      fileNameSpan.textContent = selectedFile.name;
      fileInfoDiv.style.display = 'flex';
    }
  });

  removeFileBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfoDiv.style.display = 'none';
  });

  // Attach Form Submit event
  document.getElementById('intake-form').addEventListener('submit', handleIntakeSubmit);
}

// Handle submitting demand form to FastAPI
async function handleIntakeSubmit(e) {
  e.preventDefault();
  const errorAlert = document.getElementById('intake-error');
  errorAlert.style.display = 'none';

  const title = document.getElementById('intake-title').value;
  const submitter = document.getElementById('intake-submitter').value;

  const formData = new FormData();
  if (title) formData.append('title', title);
  if (submitter) formData.append('submitted_by', submitter);

  // Validation based on active tab
  if (activeFormTab === 'text') {
    const desc = document.getElementById('intake-desc').value;
    if (!desc || !desc.trim()) {
      showIntakeError("Validation Error: Please fill in the description field.");
      return;
    }
    formData.append('description', desc);
  } else {
    if (!selectedFile) {
      showIntakeError("Validation Error: Please choose a file to upload.");
      return;
    }
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['txt', 'pdf', 'docx'].includes(ext)) {
      showIntakeError(`Validation Error: Unsupported file type '.${ext}'. Only .txt, .pdf, and .docx are supported.`);
      return;
    }
    formData.append('file', selectedFile);
  }

  // Visual feedback: disable submit button and show loading spinner
  const submitBtn = document.getElementById('btn-submit-intake');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="loader"><span class="spinner"></span> Running Extraction Node...</span>`;

  try {
    const res = await fetch(`${API_BASE}/demands/intake`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errBody = await res.json();
      throw new Error(errBody.detail || "Failed to process intake request.");
    }

    const newRecord = await res.json();
    selectedDemandId = newRecord.demand_id;
    selectedFile = null;
    
    // Refresh sidebar and select the new record
    await fetchDemands();
  } catch (err) {
    showIntakeError(err.message || "An unexpected error occurred during submission.");
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

function showIntakeError(msg) {
  const errorAlert = document.getElementById('intake-error');
  errorAlert.textContent = msg;
  errorAlert.style.display = 'block';
  errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// Render the 4-step wizard workflow details for the selected demand
function renderDemandWizard(demand) {
  const panel = document.getElementById('details-panel-container');
  
  // Determine states of each step based on the status attribute
  // Status levels: 'intake', 'classified', 'capacity-checked', 'approved', 'rejected'
  const isIntakeApproved = ['intake', 'classified', 'capacity-checked', 'approved'].includes(demand.status);
  const isClassifyApproved = ['classified', 'capacity-checked', 'approved'].includes(demand.status);
  const isCapacityApproved = ['capacity-checked', 'approved'].includes(demand.status);
  const isAllApproved = demand.status === 'approved';

  panel.innerHTML = `
    <div class="panel-card" style="padding-top: 1rem;">
      <!-- Title block -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${demand.demand_id}</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0.2rem 0 0 0; color: var(--text-primary);">${demand.title}</h2>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Global lifecycle status</div>
            <status-pill status="${demand.status}"></status-pill>
          </div>
          <button type="button" class="btn-secondary" id="btn-delete-demand" style="color: var(--color-status-red-text); border-color: var(--color-status-red-text); padding: 0.25rem 0.5rem; font-size: 0.75rem;">Delete Demand</button>
        </div>
      </div>

      <!-- Interactive Steps Pipeline -->
      <div class="pipeline-wizard">

        <!-- STEP 1: CAPTURE & STRUCTURE -->
        <div class="wizard-step completed">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">1</span>
              Capture & Structure Demand
            </h4>
            <status-pill status="Approved"></status-pill>
          </div>
          <div class="wizard-step-body">
            <div class="grid-2col">
              <div class="data-item">
                <div class="data-label">Extracted Title</div>
                <div class="data-value">${demand.title}</div>
              </div>
              <div class="data-item">
                <div class="data-label">Submitter</div>
                <div class="data-value">${demand.submitted_by}</div>
              </div>
            </div>
            <div class="data-item">
              <div class="data-label">Structured Description</div>
              <div class="data-value" style="background: var(--bg-primary); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.85rem; line-height: 1.5;">
                ${demand.description}
              </div>
            </div>
            <div class="grid-2col" style="margin-top: 0.75rem;">
              <div class="data-item">
                <div class="data-label">Intake Source</div>
                <div class="data-value" style="text-transform: capitalize;">${demand.source}</div>
              </div>
              <div class="data-item">
                <div class="data-label">Source Filename</div>
                <div class="data-value">${demand.source_filename || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 2: CLASSIFY & ROUTE -->
        <div class="wizard-step ${isIntakeApproved ? (isClassifyApproved ? 'completed' : 'active') : ''}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">2</span>
              Classify & Route
            </h4>
            <status-pill status="${isClassifyApproved ? 'Approved' : (isIntakeApproved ? 'Pending Run' : 'Locked')}"></status-pill>
          </div>
          
          <div class="wizard-step-body">
            <!-- If classified, show locked details. Else show runner screen -->
            ${isClassifyApproved ? `
              <div class="grid-2col">
                <div class="data-item">
                  <div class="data-label">Request Type</div>
                  <div class="data-value" style="text-transform: uppercase; font-weight: 700; color: var(--color-brand);">${demand.type}</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Delivery Domain</div>
                  <div class="data-value">${demand.domain}</div>
                </div>
              </div>
              <div class="grid-2col">
                <div class="data-item">
                  <div class="data-label">Risk Assessment</div>
                  <div class="data-value" style="text-transform: uppercase; font-weight: 700;">${demand.risk_level}</div>
                </div>
                <div class="data-item">
                  <div class="data-label">Duplicate Status</div>
                  <div class="data-value">${demand.duplicate_of ? `Flagged as duplicate of <strong style="color: var(--color-status-amber-text);">${demand.duplicate_of}</strong>` : 'Clean record (No duplicates found)'}</div>
                </div>
              </div>
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Run the agent classification graph to scan duplicates and suggest type, domain, and risk assessment parameters.
              </p>
              
              <div id="classify-suggestion-container"></div>
              
              <div class="submit-row" id="classify-actions-row">
                <button type="button" class="btn-primary" id="btn-run-classify">Run Classify & Route Agent</button>
              </div>
            `}
          </div>
        </div>

        <!-- STEP 3: CAPACITY CHECK -->
        <div class="wizard-step ${isClassifyApproved ? (isCapacityApproved ? 'completed' : 'active') : ''}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">3</span>
              Capacity Check
            </h4>
            <status-pill status="${isCapacityApproved ? 'Approved' : (isClassifyApproved ? 'Pending Run' : 'Locked')}"></status-pill>
          </div>
          
          <div class="wizard-step-body">
            ${isCapacityApproved ? `
              ${(demand.capacity_score !== undefined && demand.capacity_score !== null) ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                  <div class="data-item">
                    <div class="data-label">Capacity Verdict</div>
                    <div class="data-value" style="display: flex; align-items: center; gap: 0.5rem; text-transform: uppercase; font-weight: 700; color: ${demand.capacity_verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}">
                      <span class="${demand.capacity_verdict === 'feasible' ? 'green' : 'amber'}" style="display:inline-block; width: 10px; height: 10px; border-radius:50%;"></span>
                      ${demand.capacity_verdict}
                    </div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Capacity Score</div>
                    <div class="data-value"><strong>${demand.capacity_score}/100</strong></div>
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                  <div class="data-item">
                    <div class="data-label">Risk Level</div>
                    <div class="data-value" style="text-transform: uppercase;">${demand.risk_level}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Earliest Start Date</div>
                    <div class="data-value"><strong>${demand.earliest_start_date}</strong></div>
                  </div>
                </div>
                ${demand.skill_gaps && demand.skill_gaps.length > 0 ? `
                  <div class="data-item" style="margin-bottom: 1rem;">
                    <div class="data-label" style="color: var(--color-status-amber-text);">Skill Gaps Detected</div>
                    <div class="data-value" style="color: var(--color-status-amber-text); font-size: 0.85rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                      ${demand.skill_gaps.map(g => `<span class="tag" style="background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); padding: 2px 6px; border-radius: 4px;">${g}</span>`).join('')}
                    </div>
                  </div>
                ` : ''}
                ${demand.resource_constraints && demand.resource_constraints.length > 0 ? `
                  <div class="data-item" style="margin-bottom: 1rem;">
                    <div class="data-label" style="color: var(--color-status-amber-text);">Resource Constraints</div>
                    <div class="data-value" style="font-size: 0.85rem;">
                      <ul style="margin: 0; padding-left: 1.2rem; line-height: 1.5;">
                        ${demand.resource_constraints.map(c => `<li><strong>${c.role}</strong>: Only ${c.availableCapacity} units available (requires ${c.requiredCapacity})</li>`).join('')}
                      </ul>
                    </div>
                  </div>
                ` : ''}
                <div class="data-item">
                  <div class="data-label">AI Feasibility Reasoning</div>
                  <div class="data-value" style="font-size: 0.85rem; line-height: 1.5;">
                    <ul style="margin: 0; padding-left: 1.2rem; color: var(--text-secondary);">
                      ${(demand.capacity_reasoning || []).map(r => `<li>${r}</li>`).join('')}
                    </ul>
                  </div>
                </div>
              ` : `
                <div class="data-item">
                  <div class="data-label">Capacity Status</div>
                  <div class="data-value" style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="green" style="display:inline-block; width: 10px; height: 10px; border-radius:50%;"></span>
                    <strong>Feasible</strong>
                  </div>
                </div>
                <div class="data-item">
                  <div class="data-label">Analysis Summary</div>
                  <div class="data-value" style="font-size: 0.85rem;">
                    Automated delivery queue verified. Staging environments and core developer logs confirm bandwidth.
                  </div>
                </div>
              `}
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Query resource scheduling stubs to evaluate delivery feasibility guidelines.
              </p>
              
              <!-- Workforce capacity pool editor -->
              <div id="workforce-manager-container" style="margin-bottom: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; background: var(--bg-secondary);">
                <h5 style="margin: 0 0 0.75rem 0; font-size: 0.9rem; font-family: var(--font-display); color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                  <span>Workforce Capacity & Skills Pool</span>
                  <button type="button" class="btn-secondary" id="btn-toggle-workforce" style="padding: 2px 8px; font-size: 0.75rem; background: transparent;">Hide Pool</button>
                </h5>
                
                <div id="workforce-pool-details">
                  <div id="workforce-table-container" style="max-height: 200px; overflow-y: auto; margin-bottom: 1rem;">
                    Loading workforce pool...
                  </div>
                  
                  <div style="border-top: 1px dashed var(--border-color); padding-top: 0.75rem; margin-top: 0.75rem;">
                    <h6 style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary);">Add Resource</h6>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                      <input type="text" id="new-res-name" placeholder="Name (e.g. Emma)" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                      <select id="new-res-role" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                        <option value="Backend Developer">Backend Developer</option>
                        <option value="Frontend Developer">Frontend Developer</option>
                        <option value="Senior Architect">Senior Architect</option>
                        <option value="Security Engineer">Security Engineer</option>
                      </select>
                      <input type="text" id="new-res-skills" placeholder="Skills (comma separated)" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.5rem; align-items: center;">
                      <input type="number" id="new-res-total" placeholder="Total Cap (e.g. 40)" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                      <input type="number" id="new-res-alloc" placeholder="Alloc Cap (e.g. 20)" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                      <button type="button" class="btn-primary" id="btn-add-resource" style="padding: 4px 12px; font-size: 0.75rem;">Add</button>
                    </div>
                    <div id="add-resource-error" style="color: var(--color-status-red-text); font-size: 0.7rem; margin-top: 0.25rem; display: none;"></div>
                  </div>
                </div>
              </div>

              <div id="capacity-suggestion-container"></div>
              
              <div class="submit-row" id="capacity-actions-row">
                <button type="button" class="btn-primary" id="btn-run-capacity" ${!isClassifyApproved ? 'disabled' : ''}>
                  Verify Capacity
                </button>
              </div>
            `}
          </div>
        </div>

        <!-- STEP 4: BUSINESS CASE DRAFT -->
        <div class="wizard-step ${isCapacityApproved ? (isAllApproved ? 'completed' : 'active') : ''}">
          <div class="wizard-step-header">
            <h4 class="wizard-step-title">
              <span class="wizard-step-num">4</span>
              Business Case Draft
            </h4>
            <status-pill status="${isAllApproved ? 'Approved' : (isCapacityApproved ? 'Pending Run' : 'Locked')}"></status-pill>
          </div>
          
          <div class="wizard-step-body">
            ${isAllApproved ? `
              <div class="data-item">
                <div class="data-label">Signed-off Business Case Document</div>
                <div class="data-value formatted-business-case" style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: var(--radius-md); font-size: 0.85rem; line-height: 1.6; font-family: var(--font-sans);">
                  ${renderMarkdown(demand.business_case_summary)}
                </div>
              </div>
            ` : (demand.business_case_summary ? `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Review and refine your business case draft below. You can save updates as draft or submit for final sign-off.
              </p>
              
              <div id="business-case-suggestion-container">
                <div class="suggestion-box">
                  <h5 class="suggestion-title">Saved Business Case Draft (Edit details below)</h5>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 0.5rem;">
                    <div class="form-group" style="margin-bottom: 0;">
                      <label style="font-weight: 600; text-transform: uppercase; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Raw Markdown Editor</label>
                      <textarea id="edit-business-case" style="min-height: 280px; font-family: monospace; font-size: 0.85rem; line-height: 1.5; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">${demand.business_case_summary}</textarea>
                    </div>
                    <div>
                      <label style="font-weight: 600; text-transform: uppercase; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Formatted Live Preview</label>
                      <div id="business-case-preview" class="formatted-business-case" style="min-height: 280px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-color); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; line-height: 1.6;"></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="submit-row" id="business-case-actions-row">
                <button type="button" class="btn-secondary" id="btn-re-run-business-case">Re-run Draft</button>
                <button type="button" class="btn-secondary" id="btn-save-business-case-draft" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); margin-left: 0.5rem; margin-right: 0.5rem;">Save as Draft</button>
                <button type="button" class="btn-primary" id="btn-approve-business-case">Approve & Sign-off Demand</button>
              </div>
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Orchestrate a draft business case document from the structured details to complete final sign-off.
              </p>
              
              <div id="business-case-suggestion-container"></div>
              
              <div class="submit-row" id="business-case-actions-row">
                <button type="button" class="btn-primary" id="btn-run-business-case" ${!isCapacityApproved ? 'disabled' : ''}>
                  Generate Business Case Draft
                </button>
              </div>
            `)}
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach button triggers for non-completed steps
  if (isIntakeApproved && !isClassifyApproved) {
    document.getElementById('btn-run-classify').addEventListener('click', () => {
      runClassifyRouteFlow(demand.demand_id);
    });
  }

  if (isClassifyApproved && !isCapacityApproved) {
    document.getElementById('btn-run-capacity').addEventListener('click', () => {
      runCapacityCheckFlow(demand.demand_id);
    });
    // Load and bind workforce pool UI
    loadWorkforcePool();
    attachWorkforceListeners();
  }

  if (isCapacityApproved && !isAllApproved) {
    if (demand.business_case_summary) {
      attachBusinessCaseListeners(demand.demand_id);
    } else {
      document.getElementById('btn-run-business-case').addEventListener('click', () => {
        runBusinessCaseFlow(demand.demand_id);
      });
    }
  }

  const deleteBtn = document.getElementById('btn-delete-demand');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this demand? This cannot be undone.')) {
        try {
          const res = await fetch(`${API_BASE}/demands/${demand.demand_id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete demand.");
          selectedDemandId = null;
          await fetchDemands();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  }
}

// -------------------------------------------------------------
// Stage 02: Classify Suggestion & Approval Flow
// -------------------------------------------------------------
async function runClassifyRouteFlow(id) {
  const container = document.getElementById('classify-suggestion-container');
  const actionRow = document.getElementById('classify-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Running classify -> duplicate-check -> route nodes...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/classify-route`, { method: 'POST' });
    if (!res.ok) throw new Error("Classification call failed");
    classificationSuggestions = await res.json();
    
    // Display interactive values that can be approved
    container.innerHTML = `
      <div class="suggestion-box">
        <h5 class="suggestion-title">LangGraph Suggestions (Verify & Edit)</h5>
        
        <div class="grid-2col">
          <div class="form-group">
            <label for="suggest-type">Type</label>
            <select id="suggest-type">
              <option value="project" ${classificationSuggestions.type === 'project' ? 'selected' : ''}>Project</option>
              <option value="enhancement" ${classificationSuggestions.type === 'enhancement' ? 'selected' : ''}>Enhancement</option>
              <option value="defect-fix" ${classificationSuggestions.type === 'defect-fix' ? 'selected' : ''}>Defect Fix</option>
              <option value="compliance" ${classificationSuggestions.type === 'compliance' ? 'selected' : ''}>Compliance</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="suggest-risk">Risk Level</label>
            <select id="suggest-risk">
              <option value="low" ${classificationSuggestions.risk_level === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${classificationSuggestions.risk_level === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${classificationSuggestions.risk_level === 'high' ? 'selected' : ''}>High</option>
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label for="suggest-domain">Domain</label>
          <input type="text" id="suggest-domain" value="${classificationSuggestions.domain || 'General Platform'}">
        </div>
        
        <div class="grid-2col" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <div class="data-item">
            <div class="data-label">Duplicate Detection Check</div>
            <div class="data-value">
              ${classificationSuggestions.duplicate_of ? 
                `<strong style="color: var(--color-status-amber-text);">DUPLICATE MATCH: ${classificationSuggestions.duplicate_of}</strong>` : 
                '<span style="color: var(--color-status-green-text);">Clean (No duplicates found)</span>'}
            </div>
          </div>
          <div class="data-item">
            <div class="data-label">Routed Queue Owner</div>
            <div class="data-value" style="font-family: monospace; font-size: 0.85rem;">
              ${classificationSuggestions.assigned_to || 'General Queue'}
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add Approval button
    actionRow.innerHTML = `
      <button type="button" class="btn-secondary" id="btn-re-run-classify">Re-run</button>
      <button type="button" class="btn-primary" id="btn-approve-classify">Approve Suggestions</button>
    `;
    
    document.getElementById('btn-re-run-classify').addEventListener('click', () => {
      runClassifyRouteFlow(id);
    });
    
    document.getElementById('btn-approve-classify').addEventListener('click', () => {
      approveClassification(id);
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Failed to fetch classifications: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-classify">Retry Classify & Route</button>`;
    document.getElementById('btn-run-classify').addEventListener('click', () => {
      runClassifyRouteFlow(id);
    });
  }
}

async function approveClassification(id) {
  const type = document.getElementById('suggest-type').value;
  const risk_level = document.getElementById('suggest-risk').value;
  const domain = document.getElementById('suggest-domain').value;
  const duplicate_of = classificationSuggestions ? classificationSuggestions.duplicate_of : null;
  
  const actionRow = document.getElementById('classify-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Saving classification state...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/approve-classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, risk_level, domain, duplicate_of })
    });
    
    if (!res.ok) throw new Error("Approval submission failed");
    
    // Success, refetch and reselect
    await fetchDemands();
  } catch (err) {
    alert(`Failed to save suggestions: ${err.message}`);
    actionRow.innerHTML = `
      <button type="button" class="btn-secondary" id="btn-re-run-classify">Re-run</button>
      <button type="button" class="btn-primary" id="btn-approve-classify">Approve Suggestions</button>
    `;
  }
}

// -------------------------------------------------------------
// Stage 03: Capacity Suggestion & Approval Flow
// -------------------------------------------------------------
async function runCapacityCheckFlow(id) {
  const container = document.getElementById('capacity-suggestion-container');
  const actionRow = document.getElementById('capacity-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Querying platform capacity logs...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/capacity-check`, { method: 'POST' });
    if (!res.ok) throw new Error("Capacity stub failed");
    capacitySuggestion = await res.json();
    
    const isFeasible = capacitySuggestion.verdict === 'feasible';
    
    container.innerHTML = `
      <div class="suggestion-box" style="border-color: ${isFeasible ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}; margin-top: 1rem;">
        <h5 class="suggestion-title" style="color: ${isFeasible ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}; font-size: 1rem; margin-top: 0; margin-bottom: 0.75rem;">
          Resource Verdict: ${capacitySuggestion.verdict.toUpperCase()}
        </h5>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.75rem;">
          <div class="data-item">
            <div class="data-label">Capacity Score</div>
            <div class="data-value" style="font-size: 1.1rem; font-weight: 700; color: ${isFeasible ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}">${capacitySuggestion.capacityScore}/100</div>
          </div>
          <div class="data-item">
            <div class="data-label">Earliest Start Date</div>
            <div class="data-value" style="font-size: 1.1rem; font-weight: 700;">${capacitySuggestion.earliestStartDate}</div>
          </div>
        </div>

        ${capacitySuggestion.skillGaps && capacitySuggestion.skillGaps.length > 0 ? `
          <div class="data-item" style="margin-bottom: 0.75rem;">
            <div class="data-label" style="color: var(--color-status-amber-text);">Skill Gaps Detected</div>
            <div class="data-value" style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem;">
              ${capacitySuggestion.skillGaps.map(g => `<span class="tag" style="background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${g}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${capacitySuggestion.resourceConstraints && capacitySuggestion.resourceConstraints.length > 0 ? `
          <div class="data-item" style="margin-bottom: 0.75rem;">
            <div class="data-label" style="color: var(--color-status-amber-text);">Resource Constraints</div>
            <div class="data-value">
              <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.8rem; line-height: 1.4;">
                ${capacitySuggestion.resourceConstraints.map(c => `<li><strong>${c.role}</strong>: Only ${c.availableCapacity} units available (requires ${c.requiredCapacity})</li>`).join('')}
              </ul>
            </div>
          </div>
        ` : ''}

        <div class="data-item" style="margin-bottom: 0;">
          <div class="data-label">AI Feasibility Reasoning</div>
          <div class="data-value">
            <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.8rem; line-height: 1.4; color: var(--text-secondary);">
              ${capacitySuggestion.reasoning.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
    
    actionRow.innerHTML = `
      <button type="button" class="btn-primary" id="btn-approve-capacity">Approve Capacity Verdict</button>
    `;
    
    document.getElementById('btn-approve-capacity').addEventListener('click', () => {
      approveCapacity(id);
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Capacity check query failure: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-capacity">Verify Capacity</button>`;
    document.getElementById('btn-run-capacity').addEventListener('click', () => {
      runCapacityCheckFlow(id);
    });
  }
}

async function approveCapacity(id) {
  const actionRow = document.getElementById('capacity-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Committing capacity sign-off...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/approve-capacity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: capacitySuggestion ? capacitySuggestion.verdict : "feasible" })
    });
    
    if (!res.ok) throw new Error("Failed to save capacity validation.");
    
    await fetchDemands();
  } catch (err) {
    alert(err.message);
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-approve-capacity">Approve Capacity Verdict</button>`;
  }
}

async function loadWorkforcePool() {
  const container = document.getElementById('workforce-table-container');
  if (!container) return;
  
  try {
    const res = await fetch(`${API_BASE}/demands/resources`);
    if (!res.ok) throw new Error("Failed to fetch workforce pool");
    const pool = await res.json();
    
    if (pool.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem;">No resources in pool. Add one below.</div>`;
      return;
    }
    
    container.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
            <th style="padding: 4px 0;">Name</th>
            <th>Role</th>
            <th>Skills</th>
            <th>Total</th>
            <th>Alloc</th>
            <th style="text-align: right; padding-right: 4px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${pool.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-name="${r.name}">
              <td style="padding: 6px 0; font-weight: 600; color: var(--text-primary);">${r.name}</td>
              <td style="color: var(--text-secondary);">${r.role}</td>
              <td style="color: var(--text-muted); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.skills.join(', ')}">${r.skills.join(', ')}</td>
              <td>
                <input type="number" class="res-edit-total" value="${r.total_capacity}" style="width: 40px; padding: 2px; font-size: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 3px; text-align: center;">
              </td>
              <td>
                <input type="number" class="res-edit-alloc" value="${r.allocated_capacity}" style="width: 40px; padding: 2px; font-size: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 3px; text-align: center;">
              </td>
              <td style="text-align: right; white-space: nowrap; padding-right: 4px;">
                <button type="button" class="btn-res-save" style="background: none; border: none; color: var(--color-status-green-text); cursor: pointer; padding: 2px 4px; font-weight: 700; font-size: 0.7rem;">Save</button>
                <button type="button" class="btn-res-delete" style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 2px 4px; font-weight: 700; font-size: 0.7rem;">Del</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    // Attach listener events
    container.querySelectorAll('tr[data-name]').forEach(row => {
      const name = row.getAttribute('data-name');
      const resource = pool.find(r => r.name === name);
      
      row.querySelector('.btn-res-save').addEventListener('click', async () => {
        const total = parseInt(row.querySelector('.res-edit-total').value);
        const alloc = parseInt(row.querySelector('.res-edit-alloc').value);
        
        if (isNaN(total) || isNaN(alloc)) {
          alert("Total and Allocated capacities must be valid integers.");
          return;
        }
        
        row.querySelector('.btn-res-save').textContent = '...';
        
        try {
          const resSave = await fetch(`${API_BASE}/demands/resources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: resource.name,
              role: resource.role,
              skills: resource.skills,
              total_capacity: total,
              allocated_capacity: alloc
            })
          });
          if (!resSave.ok) throw new Error("Failed to save resource changes");
          loadWorkforcePool();
        } catch (err) {
          alert(err.message);
          row.querySelector('.btn-res-save').textContent = 'Save';
        }
      });
      
      row.querySelector('.btn-res-delete').addEventListener('click', async () => {
        if (confirm(`Remove ${name} from available capacity resources?`)) {
          row.querySelector('.btn-res-delete').textContent = '...';
          try {
            const resDel = await fetch(`${API_BASE}/demands/resources/${name}`, {
              method: 'DELETE'
            });
            if (!resDel.ok) throw new Error("Failed to delete resource");
            loadWorkforcePool();
          } catch (err) {
            alert(err.message);
            row.querySelector('.btn-res-delete').textContent = 'Del';
          }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text); font-size: 0.85rem;">${err.message}</div>`;
  }
}

function attachWorkforceListeners() {
  const btnToggle = document.getElementById('btn-toggle-workforce');
  const poolDetails = document.getElementById('workforce-pool-details');
  if (btnToggle && poolDetails) {
    btnToggle.addEventListener('click', () => {
      const isHidden = poolDetails.style.display === 'none';
      poolDetails.style.display = isHidden ? 'block' : 'none';
      btnToggle.textContent = isHidden ? 'Hide Pool' : 'Show Pool';
    });
  }
  
  const btnAdd = document.getElementById('btn-add-resource');
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const errorDiv = document.getElementById('add-resource-error');
      errorDiv.style.display = 'none';
      
      const name = document.getElementById('new-res-name').value.trim();
      const role = document.getElementById('new-res-role').value;
      const skillsStr = document.getElementById('new-res-skills').value.trim();
      const total = parseInt(document.getElementById('new-res-total').value);
      const alloc = parseInt(document.getElementById('new-res-alloc').value);
      
      if (!name) {
        errorDiv.textContent = "Name is required.";
        errorDiv.style.display = 'block';
        return;
      }
      if (isNaN(total) || isNaN(alloc)) {
        errorDiv.textContent = "Total and Allocated capacities must be valid numbers.";
        errorDiv.style.display = 'block';
        return;
      }
      
      const skills = skillsStr ? skillsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      
      btnAdd.disabled = true;
      btnAdd.textContent = '...';
      
      try {
        const res = await fetch(`${API_BASE}/demands/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            role,
            skills,
            total_capacity: total,
            allocated_capacity: alloc
          })
        });
        if (!res.ok) throw new Error("Failed to add resource.");
        
        // Reset form
        document.getElementById('new-res-name').value = '';
        document.getElementById('new-res-skills').value = '';
        document.getElementById('new-res-total').value = '';
        document.getElementById('new-res-alloc').value = '';
        
        loadWorkforcePool();
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
      } finally {
        btnAdd.disabled = false;
        btnAdd.textContent = 'Add';
      }
    });
  }
}

// -------------------------------------------------------------
// Stage 04: Business Case Suggestion & Approval Flow
// -------------------------------------------------------------
async function runBusinessCaseFlow(id) {
  const container = document.getElementById('business-case-suggestion-container');
  const actionRow = document.getElementById('business-case-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Running draft generation node...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/business-case`, { method: 'POST' });
    if (!res.ok) throw new Error("Business case draft generation failed.");
    businessCaseSuggestion = await res.json();
    
    container.innerHTML = `
      <div class="suggestion-box">
        <h5 class="suggestion-title">Generated Business Case Draft (Edit details below)</h5>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 0.5rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-weight: 600; text-transform: uppercase; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Raw Markdown Editor</label>
            <textarea id="edit-business-case" style="min-height: 280px; font-family: monospace; font-size: 0.85rem; line-height: 1.5; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">${businessCaseSuggestion.business_case_summary}</textarea>
          </div>
          <div>
            <label style="font-weight: 600; text-transform: uppercase; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Formatted Live Preview</label>
            <div id="business-case-preview" class="formatted-business-case" style="min-height: 280px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-color); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; line-height: 1.6;"></div>
          </div>
        </div>
      </div>
    `;
    
    actionRow.innerHTML = `
      <button type="button" class="btn-secondary" id="btn-re-run-business-case">Re-run Draft</button>
      <button type="button" class="btn-secondary" id="btn-save-business-case-draft" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); margin-left: 0.5rem; margin-right: 0.5rem;">Save as Draft</button>
      <button type="button" class="btn-primary" id="btn-approve-business-case">Approve & Sign-off Demand</button>
    `;
    
    attachBusinessCaseListeners(id);
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Draft generation error: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-business-case">Generate Business Case Draft</button>`;
    document.getElementById('btn-run-business-case').addEventListener('click', () => {
      runBusinessCaseFlow(id);
    });
  }
}

async function saveBusinessCaseDraft(id) {
  const currentSummary = document.getElementById('edit-business-case').value;
  const actionRow = document.getElementById('business-case-actions-row');
  
  const originalHTML = actionRow.innerHTML;
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Saving draft...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/save-business-case-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_case_summary: currentSummary })
    });
    
    if (!res.ok) throw new Error("Failed to save draft.");
    
    await fetchDemands();
    
    const newActionRow = document.getElementById('business-case-actions-row');
    if (newActionRow) {
      const msg = document.createElement('span');
      msg.textContent = '✓ Draft saved successfully';
      msg.style.color = 'var(--color-status-green-text, #10b981)';
      msg.style.fontSize = '0.85rem';
      msg.style.marginRight = '1rem';
      msg.style.fontWeight = '600';
      msg.style.alignSelf = 'center';
      newActionRow.prepend(msg);
      setTimeout(() => msg.remove(), 3000);
    }
  } catch (err) {
    alert(err.message);
    actionRow.innerHTML = originalHTML;
    attachBusinessCaseListeners(id);
  }
}

async function approveBusinessCase(id) {
  const finalSummary = document.getElementById('edit-business-case').value;
  const actionRow = document.getElementById('business-case-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Committing final approval & release parameters...</span>`;
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/approve-business-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_case_summary: finalSummary })
    });
    
    if (!res.ok) throw new Error("Approval commit failed.");
    
    await fetchDemands();
  } catch (err) {
    alert(err.message);
    actionRow.innerHTML = `
      <button type="button" class="btn-secondary" id="btn-re-run-business-case">Re-run Draft</button>
      <button type="button" class="btn-secondary" id="btn-save-business-case-draft" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); margin-left: 0.5rem; margin-right: 0.5rem;">Save as Draft</button>
      <button type="button" class="btn-primary" id="btn-approve-business-case">Approve & Sign-off Demand</button>
    `;
    attachBusinessCaseListeners(id);
  }
}

function attachBusinessCaseListeners(id) {
  const btnReRun = document.getElementById('btn-re-run-business-case');
  const btnSave = document.getElementById('btn-save-business-case-draft');
  const btnApprove = document.getElementById('btn-approve-business-case');

  // Handle live preview
  const textarea = document.getElementById('edit-business-case');
  const preview = document.getElementById('business-case-preview');
  if (textarea && preview) {
    const updatePreview = () => {
      preview.innerHTML = renderMarkdown(textarea.value);
    };
    textarea.addEventListener('input', updatePreview);
    updatePreview(); // initial render
  }

  if (btnReRun) {
    btnReRun.addEventListener('click', () => {
      runBusinessCaseFlow(id);
    });
  }
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      saveBusinessCaseDraft(id);
    });
  }
  if (btnApprove) {
    btnApprove.addEventListener('click', () => {
      approveBusinessCase(id);
    });
  }
}

// Simple and safe Markdown renderer to HTML
function renderMarkdown(md) {
  if (!md) return '';
  
  // Escape HTML to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // Headers:
  html = html.replace(/^###\s+(.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#\s+(.*?)$/gm, '<h5>$1</h5>');
  
  // Bold: **text** or __text__ -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_ -> <em>text</em>
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Lists: * item or - item -> <li>item</li>
  let lines = html.split('\n');
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('* ') || line.startsWith('- ')) {
      let content = line.substring(2);
      if (!inList) {
        lines[i] = '<ul>\n<li>' + content + '</li>';
        inList = true;
      } else {
        lines[i] = '<li>' + content + '</li>';
      }
    } else {
      if (inList) {
        lines[i] = '</ul>\n' + lines[i];
        inList = false;
      }
    }
  }
  if (inList) {
    lines.push('</ul>');
  }
  html = lines.join('\n');
  
  // Paragraphs / line breaks
  let blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    let trimmed = block.trim();
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li') || trimmed.startsWith('</ul')) {
      return block;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  
  return html;
}
