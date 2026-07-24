import { getModuleName } from '../../packages/ui-kit/navigation-menu.js';

// App Shell Orchestrator & Screen Router
const API_BASE = '/api';

// Core State
let activeStage = (window.location.hash ? window.location.hash.substring(1) : sessionStorage.getItem('activeStage')) || 'demand-intake';
let demands = [];
let selectedDemandId = sessionStorage.getItem('selectedDemandId') || null;
let activeFormTab = 'text'; // 'text' or 'file'
let selectedFile = null;
let classificationSuggestions = null;
let capacitySuggestion = null;
let businessCaseSuggestion = null;

// Scroll state management for Demand & Intake wizard
let demandPanelScrollTop = 0;
let demandPanelScrollId = null;

// Global navigation helper
window.switchStage = function(stageId) {
  window.location.hash = stageId;
};

function saveDemandScrollPosition(id) {
  const panelCard = document.querySelector('#details-panel-container .panel-card');
  if (panelCard) {
    // Find the ID of the demand currently rendered in the panel card
    const idSpan = panelCard.querySelector('span[style*="font-family: monospace"]');
    const currentIdInDOM = idSpan ? idSpan.textContent.trim() : null;
    
    // If we are switching demands, start fresh at the top (scrollTop = 0)
    if (currentIdInDOM && currentIdInDOM !== id) {
      demandPanelScrollTop = 0;
      demandPanelScrollId = id;
      return;
    }
    
    // If a loader/spinner is active, do not overwrite a previously saved scroll position for the same ID
    const hasLoader = panelCard.querySelector('.loader, .spinner');
    if (hasLoader && demandPanelScrollId === id && demandPanelScrollTop > 0) {
      return;
    }
    
    demandPanelScrollTop = panelCard.scrollTop;
    demandPanelScrollId = id;
  }
}

function restoreDemandScrollPosition(id) {
  if (demandPanelScrollId === id) {
    const panelCard = document.querySelector('#details-panel-container .panel-card');
    if (panelCard) {
      panelCard.scrollTop = demandPanelScrollTop;
    }
  }
  // Reset after restore attempt unless we are currently in a loader state
  const panelCard = document.querySelector('#details-panel-container .panel-card');
  const hasLoader = panelCard ? panelCard.querySelector('.loader, .spinner') : false;
  if (demandPanelScrollId !== id && !hasLoader) {
    demandPanelScrollTop = 0;
    demandPanelScrollId = null;
  }
}


// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  // Sync with Hash Routing
  window.addEventListener('hashchange', () => {
    const stageId = window.location.hash.substring(1);
    if (stageId && stageId !== activeStage) {
      switchStage(stageId);
    }
  });

  // Ensure initial hash is set
  if (!window.location.hash) {
    window.location.hash = activeStage;
  }

  // Load initial view
  switchStage(activeStage);
}

// Swap content area between Module 01 screen and placeholders
function switchStage(stageId) {
  activeStage = stageId;
  sessionStorage.setItem('activeStage', stageId);
  window.location.hash = stageId;
  
  const viewport = document.getElementById('viewport');

  // Sync the navigation drawer highlight
  const navDrawer = document.getElementById('nav-drawer');
  if (navDrawer && navDrawer.getAttribute('active-stage') !== stageId) {
    navDrawer.setAttribute('active-stage', stageId);
  }
  
  // Update Breadcrumbs
  const breadcrumbs = document.getElementById('global-breadcrumbs');
  if (breadcrumbs) {
    breadcrumbs.style.display = stageId === 'dashboard' ? 'none' : 'flex';
  }
  const breadcrumbText = document.getElementById('breadcrumb-current-module');
  if (breadcrumbText) {
    breadcrumbText.textContent = getModuleName(stageId);
  }
  
  if (stageId === 'dashboard') {
    if (window.renderDashboardScreen) {
      window.renderDashboardScreen();
    } else {
      viewport.innerHTML = `<module-placeholder module-id="\${stageId}" module-title="Dashboard" style="animation: fade-in 0.3s ease; display: block; height: 100%;"></module-placeholder>`;
    }
  } else if (stageId === 'demand-intake') {
    renderIntakeScreen();
    fetchDemands();
  } else if (stageId === 'estimate-shape') {
    if (window.renderEstimateScreen) {
      window.renderEstimateScreen();
      window.fetchEstimates();
    }
  } else if (stageId === 'config-environments') {
    if (window.renderConfigEnvironmentsScreen) {
      window.renderConfigEnvironmentsScreen();
      window.fetchEnvironments();
    }
  } else if (stageId === 'plan-schedule') {
    if (window.renderPlanScreen) {
      window.renderPlanScreen();
      window.fetchPlans();
    }
  } else if (stageId === 'dependencies') {
    if (window.renderDependenciesScreen) {
      window.renderDependenciesScreen();
      window.fetchDependencies();
    }
  } else if (stageId === 'build-deploy') {
    if (window.renderBuildDeployScreen) {
      window.renderBuildDeployScreen();
      window.fetchBuildDeployData();
    }
  } else if (stageId === 'release-change') {
    if (window.renderReleaseChangeScreen) {
      window.renderReleaseChangeScreen();
      window.fetchReleaseChange();
    }
  } else if (stageId === 'test-quality') {
    if (window.renderTestQualityScreen) {
      window.renderTestQualityScreen();
      window.fetchTestQualityData();
    }
  } else if (['always-on', 'risk-issues', 'budget-cost', 'vendor-coordination', 'reporting-communication', 'knowledge-artifacts'].includes(stageId)) {
    renderAlwaysOnWrapper(stageId === 'always-on' ? 'risk-issues' : stageId);
  } else if (stageId === 'ops-readiness') {
    if (window.renderOpsReadinessScreen) {
      window.renderOpsReadinessScreen();
      window.fetchOpsReadinessData();
    }
  } else if (stageId === 'environment-state' && window.renderEnvironmentStateScreen) {
    window.renderEnvironmentStateScreen(viewport, { demandId: selectedDemandId, title: demands.find(d => d.demand_id === selectedDemandId)?.title });
  } else if (stageId === 'exports' && window.renderExportsScreen) {
    window.renderExportsScreen(viewport, { demandId: selectedDemandId, title: demands.find(d => d.demand_id === selectedDemandId)?.title });
  } else {
    // Render the placeholder web component for other stages
    viewport.innerHTML = `<module-placeholder module-id="${stageId}"></module-placeholder>`;
  }
}

// Expose switchStage globally so stage modules can redirect (e.g. HITL accept → Stage 04)
window.switchStage = switchStage;

function renderAlwaysOnWrapper(activeTab) {
  const viewport = document.getElementById('viewport');
  
  const options = [
    { id: 'risk-issues', label: 'Risk & Issues', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' },
    { id: 'budget-cost', label: 'Budget & Cost', icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
    { id: 'vendor-coordination', label: 'Vendor Coordination', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
    { id: 'reporting-communication', label: 'Reporting & Comms', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
    { id: 'knowledge-artifacts', label: 'Knowledge & Artefacts', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' }
  ];
  
  const activeOption = options.find(o => o.id === activeTab) || options[0];
  
  const navItemsHtml = options.map((item, index) => {
    const isActive = item.id === activeTab;
    return `
      <div class="ao-nav-item ${isActive ? 'active' : ''}" data-id="${item.id}" style="
        display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1.25rem; margin-bottom: 0.5rem; 
        border-radius: var(--radius-sm); cursor: pointer; 
        color: ${isActive ? 'var(--color-brand)' : 'var(--text-secondary)'}; 
        background: ${isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent'}; 
        font-weight: ${isActive ? '600' : '500'}; font-size: 0.95rem; 
        border-left: 4px solid ${isActive ? 'var(--color-brand)' : 'transparent'}; 
        box-shadow: ${isActive ? '0 0 10px rgba(99, 102, 241, 0.15)' : 'none'};
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform-origin: left center;
        animation: slide-in-item 0.4s ease forwards ${index * 0.05}s;
        opacity: 0; transform: translateX(-20px);
      ">
        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;"><path d="${item.icon}"/></svg>
        <span>${item.label}</span>
      </div>
    `;
  }).join('');

  viewport.innerHTML = `
    <style>
      .ao-drawer-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
        z-index: 2000; opacity: 0; pointer-events: none;
        transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ao-drawer-overlay.open { opacity: 1; pointer-events: auto; }
      
      .ao-drawer {
        position: fixed; top: 0; left: -320px; width: 300px; height: 100vh;
        background-color: var(--bg-primary); border-right: 1px solid var(--border-color);
        z-index: 2001; display: flex; flex-direction: column;
        box-shadow: 4px 0 24px rgba(0,0,0,0.15);
        transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ao-drawer.open { left: 0; }
      
      .ao-nav-item:hover {
        transform: scale(1.02);
        color: var(--text-primary);
        background: var(--bg-secondary);
      }
      .ao-nav-item.active:hover {
        background: rgba(99, 102, 241, 0.15);
        color: var(--color-brand);
      }
      
      @keyframes slide-in-item {
        to { opacity: 1; transform: translateX(0); }
      }
      
      .page-transition-enter {
        animation: page-fade-up 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      @keyframes page-fade-up {
        from { opacity: 0; transform: translateY(15px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; background: var(--bg-primary);">
      
      <!-- Top Navigation Bar -->
      <div style="padding: 1rem 2rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; background: var(--bg-secondary); gap: 1.5rem; z-index: 10;">
        <button id="ao-menu-btn" style="background: none; border: none; cursor: pointer; color: var(--text-primary); padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </button>
        <div>
          <h2 style="font-family: var(--font-display); font-size: 1.15rem; margin: 0; color: var(--text-primary);">Always On Workspace</h2>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">
            Dashboard <span style="margin: 0 0.25rem;">/</span> Always On <span style="margin: 0 0.25rem;">/</span> <span style="color: var(--color-brand); font-weight: 600;">${activeOption.label}</span>
          </div>
        </div>
      </div>
      
      <!-- Module Viewport with Transition -->
      <div id="ao-content-viewport" class="page-transition-enter" style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
        <!-- Module content will be rendered here -->
      </div>
    </div>
    
    <!-- Slide-in Drawer -->
    <div id="ao-drawer-overlay" class="ao-drawer-overlay"></div>
    <div id="ao-drawer" class="ao-drawer">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
        <h2 style="font-family: var(--font-display); font-size: 1.15rem; margin: 0; color: var(--text-primary);">Modules</h2>
        <button id="ao-close-btn" style="background: none; border: none; cursor: pointer; color: var(--text-secondary); padding: 0.25rem; border-radius: var(--radius-sm);">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div style="flex: 1; overflow-y: auto; padding: 1rem;">
        ${navItemsHtml}
      </div>
    </div>
  `;
  
  const drawer = document.getElementById('ao-drawer');
  const overlay = document.getElementById('ao-drawer-overlay');
  
  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
  }
  
  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }
  
  document.getElementById('ao-menu-btn').addEventListener('click', openDrawer);
  document.getElementById('ao-close-btn').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });
  
  document.querySelectorAll('.ao-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const targetId = e.currentTarget.getAttribute('data-id');
      if (targetId !== activeTab) {
        closeDrawer();
        setTimeout(() => {
          window.switchStage(targetId);
        }, 300); // Wait for slide out animation
      } else {
        closeDrawer();
      }
    });
  });
  
  const subViewport = document.getElementById('ao-content-viewport');
  window.currentModuleTargetContainer = subViewport;
  const context = { demandId: selectedDemandId, title: demands.find(d => d.demand_id === selectedDemandId)?.title };
  
  if (activeTab === 'risk-issues') {
    if (window.renderRiskIssuesScreen) { window.renderRiskIssuesScreen(subViewport, context); if (window.fetchRiskIssuesData) window.fetchRiskIssuesData(subViewport); }
  } else if (activeTab === 'budget-cost') {
    if (window.renderBudgetCostScreen) { window.renderBudgetCostScreen(subViewport, context); if (window.fetchBudgetCostData) window.fetchBudgetCostData(subViewport); }
  } else if (activeTab === 'vendor-coordination') {
    if (window.renderVendorCoordinationScreen) { window.renderVendorCoordinationScreen(subViewport, context); if (window.fetchVendorCoordinationData) window.fetchVendorCoordinationData(subViewport); }
  } else if (activeTab === 'reporting-communication') {
    if (window.renderReportingCommunicationScreen) { window.renderReportingCommunicationScreen(subViewport, context); if (window.fetchReportingCommunicationData) window.fetchReportingCommunicationData(subViewport); }
  } else if (activeTab === 'knowledge-artifacts') {
    if (window.renderKnowledgeArtifactsScreen) { window.renderKnowledgeArtifactsScreen(subViewport, context); if (window.fetchKnowledgeArtifactsData) window.fetchKnowledgeArtifactsData(subViewport); }
  }
}

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
            <button type="button" class="btn-queue-delete" data-id="${demand.demand_id}" style="background: none; border: none; color: var(--color-status-red-text); cursor: pointer; padding: 0.2rem; display: flex; align-items: center; justify-content: center; opacity: 0.7; " title="Delete Demand" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
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

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        if (fileNameSpan) fileNameSpan.textContent = selectedFile.name;
        if (fileInfoDiv) fileInfoDiv.style.display = 'flex';
      }
    });
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', () => {
      selectedFile = null;
      if (fileInput) fileInput.value = '';
      if (fileInfoDiv) fileInfoDiv.style.display = 'none';
    });
  }

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
  saveDemandScrollPosition(demand.demand_id);
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
                <div class="data-item" style="margin-bottom: 1rem;">
                  <div class="data-label">Risk Level</div>
                  <div class="data-value" style="text-transform: uppercase;">${demand.risk_level}</div>
                </div>
                ${demand.resource_constraints && demand.resource_constraints.length > 0 ? `
                  <div class="data-item" style="margin-bottom: 1rem;">
                    <div class="data-label">Staffing Overview</div>
                    <div class="data-value">
                      <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 0.35rem;">
                        <thead>
                          <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                            <th style="padding: 4px 8px 4px 0; font-weight: 600; text-align: left;">Role</th>
                            <th style="padding: 4px 8px; font-weight: 600; text-align: center;">Required</th>
                            <th style="padding: 4px 8px; font-weight: 600; text-align: center;">Available</th>
                            <th style="padding: 4px 8px; font-weight: 600; text-align: center;">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${demand.resource_constraints.map(c => {
                            const role = c.role;
                            const req = c.requiredCapacity ?? 0;
                            const avail = c.availableCapacity ?? 0;
                            const isConstrained = avail < req;
                            return `<tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                              <td style="padding: 6px 8px 6px 0; font-weight: 600; color: var(--text-primary);">${role}</td>
                              <td style="padding: 6px 8px; text-align: center;">
                                <input type="number" class="approved-staffing-req-input" data-role="${role}" value="${req}" data-original="${req}" min="0" disabled style="width: 55px; text-align: center; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 3px; font-size: 0.8rem; padding: 2px 4px;">
                              </td>
                              <td style="padding: 6px 8px; text-align: center; color: ${isConstrained ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)'}; font-weight: 600;">${avail}</td>
                              <td style="padding: 6px 8px; text-align: center;">${isConstrained ? '<span style="color: var(--color-status-amber-text); font-size: 0.75rem; font-weight: 700;">⚠ Constrained</span>' : '<span style="color: var(--color-status-green-text); font-size: 0.75rem; font-weight: 700;">✓ OK</span>'}</td>
                            </tr>`;
                          }).join('')}
                        </tbody>
                      </table>
                      ${!isAllApproved ? `
                      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem;">
                        <button type="button" class="btn-secondary" id="btn-edit-headcount" style="padding: 4px 10px; font-size: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px;">Edit</button>
                        <button type="button" class="btn-primary" id="btn-save-headcount" style="padding: 4px 10px; font-size: 0.75rem;" disabled>Save Headcount</button>
                      </div>
                      ` : ''}
                    </div>
                  </div>
                ` : ''}
                ${demand.skill_gaps && demand.skill_gaps.length > 0 ? `
                  <div class="data-item" style="margin-bottom: 1rem;">
                    <div class="data-label" style="color: var(--color-status-amber-text);">Skill Gaps Detected</div>
                    <div class="data-value" style="color: var(--color-status-amber-text); font-size: 0.85rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                      ${demand.skill_gaps.map(g => `<span class="tag" style="background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); padding: 2px 6px; border-radius: 4px;">${g}</span>`).join('')}
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

              <!-- Capacity suggestion results appear here (above the pool) -->
              <div id="capacity-suggestion-container"></div>

              <!-- Workforce capacity pool editor -->
              <div id="workforce-manager-container" style="margin-bottom: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; background: var(--bg-secondary);">
                <h5 style="margin: 0 0 0.75rem 0; font-size: 0.9rem; font-family: var(--font-display); color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                  <span>Workforce Capacity &amp; Skills Pool</span>
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
              <!-- Redo + Next Step CTAs -->
              <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
                <button type="button" id="btn-redo-business-case" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-secondary); "
                  onmouseover="this.style.borderColor='var(--color-brand)';this.style.color='var(--color-brand)';"
                  onmouseout="this.style.borderColor='var(--border-color)';this.style.color='var(--text-secondary)';">
                  ↺ Re-run Business Case
                </button>
                <div style="flex:1;"></div>
                <button type="button" id="btn-proceed-to-estimate" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.2rem; border-radius: var(--radius-sm); font-size: 0.88rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg, #10b981, #059669); color: var(--text-primary); box-shadow: 0 2px 8px rgba(16,185,129,0.35); "
                  onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(16,185,129,0.45)';"
                  onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(16,185,129,0.35)';">
                  <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                  Next: Generate Estimate &nbsp;→
                </button>
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
    const editHeadcountBtn = document.getElementById('btn-edit-headcount');
    const saveHeadcountBtn = document.getElementById('btn-save-headcount');
    const inputs = document.querySelectorAll('.approved-staffing-req-input');
    
    if (editHeadcountBtn && saveHeadcountBtn && inputs.length > 0) {
      editHeadcountBtn.addEventListener('click', () => {
        const isEditing = editHeadcountBtn.innerText === "Cancel";
        
        if (isEditing) {
          // Cancel: Revert values and disable inputs
          inputs.forEach(input => {
            input.value = input.getAttribute('data-original') || "0";
            input.disabled = true;
          });
          editHeadcountBtn.innerText = "Edit";
          saveHeadcountBtn.disabled = true;
        } else {
          // Edit: Enable inputs
          inputs.forEach(input => {
            input.disabled = false;
          });
          editHeadcountBtn.innerText = "Cancel";
          inputs[0].focus();
        }
      });
      
      inputs.forEach(input => {
        input.addEventListener('input', () => {
          let hasChanges = false;
          inputs.forEach(inp => {
            const originalVal = parseInt(inp.getAttribute('data-original')) || 0;
            const currentVal = parseInt(inp.value) || 0;
            if (currentVal !== originalVal) {
              hasChanges = true;
            }
          });
          saveHeadcountBtn.disabled = !hasChanges;
        });
      });
      
      saveHeadcountBtn.addEventListener('click', () => {
        saveApprovedHeadcountChanges(demand.demand_id);
      });
    }
  }

  if (isCapacityApproved && !isAllApproved) {
    if (demand.business_case_summary) {
      attachBusinessCaseListeners(demand.demand_id);
    } else {
      const btnRunBusinessCase = document.getElementById('btn-run-business-case');
      if (btnRunBusinessCase) {
        btnRunBusinessCase.addEventListener('click', () => {
          runBusinessCaseFlow(demand.demand_id);
        });
      }
    }
  }

  if (isAllApproved) {
    const proceedBtn = document.getElementById('btn-proceed-to-estimate');
    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        sessionStorage.setItem('pendingEstimateDemandId', demand.demand_id);
        window.switchStage('estimate-shape');
      });
    }
    const redoBtn = document.getElementById('btn-redo-business-case');
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
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

  restoreDemandScrollPosition(demand.demand_id);
}

// -------------------------------------------------------------
// Stage 02: Classify Suggestion & Approval Flow
// -------------------------------------------------------------
async function runClassifyRouteFlow(id) {
  saveDemandScrollPosition(id);
  const container = document.getElementById('classify-suggestion-container');
  const actionRow = document.getElementById('classify-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Running classify -> duplicate-check -> route nodes...</span>`;
  restoreDemandScrollPosition(id);
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/classify-route`, { method: 'POST' });
    if (!res.ok) throw new Error("Classification call failed");
    classificationSuggestions = await res.json();
    
    saveDemandScrollPosition(id);
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
          <details style="margin-top: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem;">
            <summary style="font-size: 0.8rem; color: var(--color-brand); cursor: pointer; font-weight: 600; outline: none; user-select: none;">
              Why was this domain suggested?
            </summary>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.4rem; font-style: italic; line-height: 1.4;">
              ${classificationSuggestions.domain_reason || 'Classification domain suggested by AI analysis.'}
            </div>
          </details>
        </div>
        
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <div class="data-item">
            <div class="data-label">Duplicate Detection Check</div>
            <div class="data-value">
              ${classificationSuggestions.duplicate_of ? 
                `<strong style="color: var(--color-status-amber-text);">DUPLICATE MATCH: ${classificationSuggestions.duplicate_of}</strong>` : 
                '<span style="color: var(--color-status-green-text);">Clean (No duplicates found)</span>'}
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
    restoreDemandScrollPosition(id);
  } catch (err) {
    saveDemandScrollPosition(id);
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Failed to fetch classifications: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-classify">Retry Classify & Route</button>`;
    document.getElementById('btn-run-classify').addEventListener('click', () => {
      runClassifyRouteFlow(id);
    });
    restoreDemandScrollPosition(id);
  }
}

async function approveClassification(id) {
  saveDemandScrollPosition(id);
  const type = document.getElementById('suggest-type').value;
  const risk_level = document.getElementById('suggest-risk').value;
  const domain = document.getElementById('suggest-domain').value;
  const duplicate_of = classificationSuggestions ? classificationSuggestions.duplicate_of : null;
  
  const actionRow = document.getElementById('classify-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Saving classification state...</span>`;
  restoreDemandScrollPosition(id);
  
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
    saveDemandScrollPosition(id);
    alert(`Failed to save suggestions: ${err.message}`);
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
    restoreDemandScrollPosition(id);
  }
}

// -------------------------------------------------------------
// Stage 03: Capacity Suggestion & Approval Flow
// -------------------------------------------------------------
async function runCapacityCheckFlow(id) {
  saveDemandScrollPosition(id);
  const container = document.getElementById('capacity-suggestion-container');
  const actionRow = document.getElementById('capacity-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Querying platform capacity logs...</span>`;
  restoreDemandScrollPosition(id);
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/capacity-check`, { method: 'POST' });
    if (!res.ok) throw new Error("Capacity stub failed");
    capacitySuggestion = await res.json();
    
    const isFeasible = capacitySuggestion.verdict === 'feasible';
    
    saveDemandScrollPosition(id);
    container.innerHTML = `
      <div class="suggestion-box" style="border-color: ${isFeasible ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}; margin-top: 1rem;">
        <h5 class="suggestion-title" style="color: ${isFeasible ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}; font-size: 1rem; margin-top: 0; margin-bottom: 0.75rem;">
          Resource Verdict: ${capacitySuggestion.verdict.toUpperCase()}
        </h5>
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 1rem; margin-bottom: 0.75rem;">
          <div class="data-item">
            <div class="data-label">Capacity Score</div>
            <div class="data-value" style="font-size: 1.1rem; font-weight: 700; color: ${isFeasible ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}">${capacitySuggestion.capacityScore}/100</div>
          </div>
        </div>

        ${capacitySuggestion.resourceConstraints && capacitySuggestion.resourceConstraints.length > 0 ? `
          <div class="data-item" style="margin-bottom: 0.75rem;">
            <div class="data-label">Staffing Overview</div>
            <div class="data-value">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.35rem;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                    <th style="padding: 4px 8px 4px 0; font-weight: 600; text-align: left;">Role</th>
                    <th style="padding: 4px 8px; font-weight: 600; text-align: center;">Required</th>
                    <th style="padding: 4px 8px; font-weight: 600; text-align: center;">Available</th>
                    <th style="padding: 4px 8px; font-weight: 600; text-align: center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${capacitySuggestion.resourceConstraints.map(c => {
                    const role = c.role;
                    const req = c.requiredCapacity ?? 0;
                    const avail = c.availableCapacity ?? 0;
                    const isConstrained = avail < req;
                    return `<tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <td style="padding: 6px 8px 6px 0; font-weight: 600; color: var(--text-primary);">${role}</td>
                      <td style="padding: 6px 8px; text-align: center;">
                        <input type="number" class="staffing-req-input" data-role="${role}" value="${req}" min="0" style="width: 55px; text-align: center; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 3px; font-size: 0.8rem; padding: 2px 4px;">
                      </td>
                      <td style="padding: 6px 8px; text-align: center; color: ${isConstrained ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)'}; font-weight: 600;">${avail}</td>
                      <td style="padding: 6px 8px; text-align: center;">${isConstrained ? '<span style="color: var(--color-status-amber-text); font-size: 0.75rem; font-weight: 700;">⚠ Constrained</span>' : '<span style="color: var(--color-status-green-text); font-size: 0.75rem; font-weight: 700;">✓ OK</span>'}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
              <div style="display: flex; justify-content: flex-end; margin-top: 0.75rem;">
                <button type="button" class="btn-primary" id="btn-save-suggestion-headcount" style="padding: 4px 10px; font-size: 0.75rem;">Save Headcount</button>
              </div>
            </div>
          </div>
        ` : ''}

        ${capacitySuggestion.skillGaps && capacitySuggestion.skillGaps.length > 0 ? `
          <div class="data-item" style="margin-bottom: 0.75rem;">
            <div class="data-label" style="color: var(--color-status-amber-text);">Skill Gaps Detected</div>
            <div class="data-value" style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem;">
              ${capacitySuggestion.skillGaps.map(g => `<span class="tag" style="background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${g}</span>`).join('')}
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
    
    const saveSuggestionBtn = document.getElementById('btn-save-suggestion-headcount');
    if (saveSuggestionBtn) {
      saveSuggestionBtn.addEventListener('click', () => {
        saveSuggestionHeadcountChanges(id);
      });
    }

    document.getElementById('btn-approve-capacity').addEventListener('click', () => {
      approveCapacity(id);
    });
    restoreDemandScrollPosition(id);
  } catch (err) {
    saveDemandScrollPosition(id);
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Capacity check query failure: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-capacity">Verify Capacity</button>`;
    document.getElementById('btn-run-capacity').addEventListener('click', () => {
      runCapacityCheckFlow(id);
    });
    restoreDemandScrollPosition(id);
  }
}

async function saveSuggestionHeadcountChanges(id) {
  saveDemandScrollPosition(id);
  const saveBtn = document.getElementById('btn-save-suggestion-headcount');
  const originalText = saveBtn.innerText;
  saveBtn.disabled = true;
  saveBtn.innerText = "Saving...";
  
  const resourceConstraints = [];
  document.querySelectorAll('.staffing-req-input').forEach(input => {
    const role = input.getAttribute('data-role');
    const val = parseInt(input.value) || 0;
    resourceConstraints.push({
      role: role,
      requiredCapacity: val
    });
  });
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/save-capacity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict: capacitySuggestion ? capacitySuggestion.verdict : "feasible",
        resourceConstraints: resourceConstraints
      })
    });
    if (!res.ok) throw new Error("Failed to save headcount changes.");
    
    saveBtn.innerText = "Saved";
    
    // Dynamically update demand record list in memory and trigger UI refresh 
    setTimeout(() => {
      runCapacityCheckFlow(id);
    }, 500);
  } catch (err) {
    saveDemandScrollPosition(id);
    alert(err.message);
    saveBtn.disabled = false;
    saveBtn.innerText = originalText;
    restoreDemandScrollPosition(id);
  }
}

async function approveCapacity(id) {
  saveDemandScrollPosition(id);
  
  const resourceConstraints = [];
  document.querySelectorAll('.staffing-req-input').forEach(input => {
    const role = input.getAttribute('data-role');
    const val = parseInt(input.value) || 0;
    resourceConstraints.push({
      role: role,
      requiredCapacity: val
    });
  });

  const actionRow = document.getElementById('capacity-actions-row');
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Committing capacity sign-off...</span>`;
  restoreDemandScrollPosition(id);
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/approve-capacity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        verdict: capacitySuggestion ? capacitySuggestion.verdict : "feasible",
        resourceConstraints: resourceConstraints
      })
    });
    
    if (!res.ok) throw new Error("Failed to save capacity validation.");
    
    await fetchDemands();
  } catch (err) {
    saveDemandScrollPosition(id);
    alert(err.message);
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-approve-capacity">Approve Capacity Verdict</button>`;
    document.getElementById('btn-approve-capacity').addEventListener('click', () => {
      approveCapacity(id);
    });
    restoreDemandScrollPosition(id);
  }
}

async function saveApprovedHeadcountChanges(id) {
  saveDemandScrollPosition(id);
  const demand = demands.find(d => d.demand_id === id);
  const saveBtn = document.getElementById('btn-save-headcount');
  const originalText = saveBtn.innerText;
  saveBtn.disabled = true;
  saveBtn.innerText = "Saving...";
  
  const resourceConstraints = [];
  document.querySelectorAll('.approved-staffing-req-input').forEach(input => {
    const role = input.getAttribute('data-role');
    const val = parseInt(input.value) || 0;
    resourceConstraints.push({
      role: role,
      requiredCapacity: val
    });
  });
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/approve-capacity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict: demand ? (demand.capacity_verdict || "feasible") : "feasible",
        resourceConstraints: resourceConstraints
      })
    });
    if (!res.ok) throw new Error("Failed to save headcount changes.");
    await fetchDemands();
  } catch (err) {
    saveDemandScrollPosition(id);
    alert(err.message);
    saveBtn.disabled = false;
    saveBtn.innerText = originalText;
    restoreDemandScrollPosition(id);
  }
}

async function loadWorkforcePool() {
  const container = document.getElementById('workforce-table-container');
  if (!container) return;
  
  const workforceScrollTop = container.scrollTop;
  
  try {
    const res = await fetch(`${API_BASE}/demands/resources?t=${Date.now()}`);
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
    
    container.scrollTop = workforceScrollTop;
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
  saveDemandScrollPosition(id);
  const container = document.getElementById('business-case-suggestion-container');
  const actionRow = document.getElementById('business-case-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Running draft generation node...</span>`;
  restoreDemandScrollPosition(id);
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/business-case`, { method: 'POST' });
    if (!res.ok) throw new Error("Business case draft generation failed.");
    businessCaseSuggestion = await res.json();
    
    saveDemandScrollPosition(id);
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
    restoreDemandScrollPosition(id);
  } catch (err) {
    saveDemandScrollPosition(id);
    container.innerHTML = `<div style="color: var(--color-status-red-text); margin-bottom: 1rem;">Draft generation error: ${err.message}</div>`;
    actionRow.innerHTML = `<button type="button" class="btn-primary" id="btn-run-business-case">Generate Business Case Draft</button>`;
    document.getElementById('btn-run-business-case').addEventListener('click', () => {
      runBusinessCaseFlow(id);
    });
    restoreDemandScrollPosition(id);
  }
}

async function saveBusinessCaseDraft(id) {
  saveDemandScrollPosition(id);
  const currentSummary = document.getElementById('edit-business-case').value;
  const actionRow = document.getElementById('business-case-actions-row');
  
  const originalHTML = actionRow.innerHTML;
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Saving draft...</span>`;
  restoreDemandScrollPosition(id);
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/save-business-case-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_case_summary: currentSummary })
    });
    
    if (!res.ok) throw new Error("Failed to save draft.");
    
    await fetchDemands();
    
    saveDemandScrollPosition(id);
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
      setTimeout(() => {
        saveDemandScrollPosition(id);
        msg.remove();
        restoreDemandScrollPosition(id);
      }, 3000);
    }
    restoreDemandScrollPosition(id);
  } catch (err) {
    saveDemandScrollPosition(id);
    alert(err.message);
    actionRow.innerHTML = originalHTML;
    attachBusinessCaseListeners(id);
    restoreDemandScrollPosition(id);
  }
}

async function approveBusinessCase(id) {
  saveDemandScrollPosition(id);
  const finalSummary = document.getElementById('edit-business-case').value;
  const actionRow = document.getElementById('business-case-actions-row');
  
  actionRow.innerHTML = `<span class="loader"><span class="spinner"></span> Committing final approval & release parameters...</span>`;
  restoreDemandScrollPosition(id);
  
  try {
    const res = await fetch(`${API_BASE}/demands/${id}/approve-business-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_case_summary: finalSummary })
    });
    
    if (!res.ok) throw new Error("Approval commit failed.");
    
    // Pre-set the handoff key so Estimate screen auto-selects this demand
    sessionStorage.setItem('pendingEstimateDemandId', id);
    await fetchDemands();
  } catch (err) {
    saveDemandScrollPosition(id);
    alert(err.message);
    actionRow.innerHTML = `
      <button type="button" class="btn-secondary" id="btn-re-run-business-case">Re-run Draft</button>
      <button type="button" class="btn-secondary" id="btn-save-business-case-draft" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); margin-left: 0.5rem; margin-right: 0.5rem;">Save as Draft</button>
      <button type="button" class="btn-primary" id="btn-approve-business-case">Approve & Sign-off Demand</button>
    `;
    attachBusinessCaseListeners(id);
    restoreDemandScrollPosition(id);
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
