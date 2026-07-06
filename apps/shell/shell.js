// App Shell Orchestrator & Screen Router
const API_BASE = 'http://127.0.0.1:8000/api';

// Core State
let activeStage = 'demand-intake';
let demands = [];
let selectedDemandId = null;
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
    
    // Automatically select the first demand if none is selected
    if (demands.length > 0 && selectedDemandId === null) {
      selectDemand(demands[0].demand_id);
    } else if (selectedDemandId !== null) {
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
  const isIntakeApproved = ['classified', 'capacity-checked', 'approved'].includes(demand.status);
  const isClassifyApproved = ['capacity-checked', 'approved'].includes(demand.status);
  const isCapacityApproved = ['approved'].includes(demand.status);
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
            ` : `
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 1rem;">
                Query resource scheduling stubs to evaluate delivery feasibility guidelines.
              </p>
              
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
                <div class="data-value" style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap; font-family: var(--font-sans);">
                  ${demand.business_case_summary}
                </div>
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
            `}
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
  }

  if (isCapacityApproved && !isAllApproved) {
    document.getElementById('btn-run-business-case').addEventListener('click', () => {
      runBusinessCaseFlow(demand.demand_id);
    });
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
      <div class="suggestion-box" style="border-color: ${isFeasible ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}">
        <h5 class="suggestion-title" style="color: ${isFeasible ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}">
          Resource Verdict: ${capacitySuggestion.verdict.toUpperCase()}
        </h5>
        <p style="font-size: 0.85rem; margin: 0; line-height: 1.4;">${capacitySuggestion.reason}</p>
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
        <div class="form-group">
          <textarea id="edit-business-case" style="min-height: 180px; font-family: var(--font-sans); line-height:1.5;">${businessCaseSuggestion.business_case_summary}</textarea>
        </div>
      </div>
    `;
    
    actionRow.innerHTML = `
      <button type="button" class="btn-secondary" id="btn-re-run-business-case">Re-run Draft</button>
      <button type="button" class="btn-primary" id="btn-approve-business-case">Approve & Sign-off Demand</button>
    `;
    
    document.getElementById('btn-re-run-business-case').addEventListener('click', () => {
      runBusinessCaseFlow(id);
    });
    
    document.getElementById('btn-approve-business-case').addEventListener('click', () => {
      approveBusinessCase(id);
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Draft generation error: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-business-case">Generate Business Case Draft</button>`;
    document.getElementById('btn-run-business-case').addEventListener('click', () => {
      runBusinessCaseFlow(id);
    });
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
      <button type="button" class="btn-primary" id="btn-approve-business-case">Approve & Sign-off Demand</button>
    `;
  }
}
