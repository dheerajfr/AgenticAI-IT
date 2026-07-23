const BASE_URL = 'http://127.0.0.1:8000/api';

window.fetchBudgetCostData = async function() {
  try {
    const demRes = await fetch('http://127.0.0.1:8000/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch(e) { console.warn("Could not fetch demands list", e); }

  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchBudgetCostData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;
  const viewport = document.getElementById('viewport');
  const _origOverflow = viewport.style.overflow;
  const _origOverflowY = viewport.style.overflowY;
  const _origDisplay = viewport.style.display;
  const _origFlexDir = viewport.style.flexDirection;
  const _origPadding = viewport.style.padding;

  viewport.style.overflow = 'hidden';
  viewport.style.overflowY = 'hidden';
  viewport.style.display = 'flex';
  viewport.style.flexDirection = 'column';
  viewport.style.padding = '0';

  const _observer = new MutationObserver(() => {
    if (!document.getElementById('budget-panel-container')) {
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }
  });
  _observer.observe(viewport, { childList: true, subtree: false });

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchBudgetCostData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Budget & Cost</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="budget-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'vendor-coordination';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Vendor Coordination &rarr;
          </button>
        </div>
      </main>
    </div>
  `;


  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  try {
    const res = await fetch(`${BASE_URL}/budget-cost/project/${demandId}`);
    if (res.ok) {
      window.currentBudgetData = await res.json();
      window.renderBudgetCostScreen();
    }
  } catch (err) {
    console.error("Budget & Cost fetch error", err);
  }
};

window.renderBudgetCostScreen = function() {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchBudgetCostData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;

  const viewport = document.getElementById('viewport');
  const _origOverflow = viewport.style.overflow;
  const _origOverflowY = viewport.style.overflowY;
  const _origDisplay = viewport.style.display;
  const _origFlexDir = viewport.style.flexDirection;
  const _origPadding = viewport.style.padding;

  viewport.style.overflow = 'hidden';
  viewport.style.overflowY = 'hidden';
  viewport.style.display = 'flex';
  viewport.style.flexDirection = 'column';
  viewport.style.padding = '0';

  const _observer = new MutationObserver(() => {
    if (!document.getElementById('budget-panel-container')) {
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }
  });
  _observer.observe(viewport, { childList: true, subtree: false });

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchBudgetCostData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Budget & Cost</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="budget-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'vendor-coordination';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Proceed to Vendor Coordination &rarr;
          </button>
        </div>
      </main>
    </div>
  `;

  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  const data = window.currentBudgetData || {};
  const est = data.cost_estimation || {};
  const vars = data.variances || [];
  const roi = data.roi_model || null;
  
  viewport.innerHTML = layoutPrefix + `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; animation: fade-in 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
        <div>
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Budget & Cost</h2>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">Always-on Capability - Financial Tracking & Forecasting</p>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Monitoring"></status-pill>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 2rem;">
        
        <!-- Cost Estimation -->
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Cost Estimation & Forecasting</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              AI provides bottom-up forecasting of AWS/Azure and vendor costs based on FinOps and Architecture data.
            </p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
              <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Infrastructure</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">$${est.infrastructure_cost || 0}</div>
              </div>
              <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Vendor Services</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">$${est.vendor_cost || 0}</div>
              </div>
              <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Resources</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">$${est.resource_cost || 0}</div>
              </div>
            </div>
            
            ${est.ai_analysis ? `
              <div style="padding: 1rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-brand); margin-bottom: 0.5rem;">AI Financial Forecast</div>
                <div style="font-size: 0.85rem; color: var(--text-primary);">${est.ai_analysis}</div>
              </div>
            ` : `
              <button onclick="forecastCosts('${demandId}')" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">Generate AI Forecast</button>
            `}
          </div>
          
          <!-- Resource ROI Modelling -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Resource ROI Modelling</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Matches team velocity to spend using Finance and Agile data.
            </p>
            
            ${roi ? `
              <div style="display: flex; gap: 1.5rem; align-items: center;">
                <div style="width: 80px; height: 80px; border-radius: 50%; border: 4px solid var(--color-brand); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: var(--color-brand);">
                  ${roi.velocity_score}
                </div>
                <div style="flex: 1; font-size: 0.85rem; color: var(--text-primary);">
                  ${roi.analysis}
                </div>
              </div>
            ` : `
              <button onclick="modelROI('${demandId}')" class="btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">Model ROI via AI</button>
            `}
          </div>
        </div>

        <!-- Variance Detection -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
          <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Variance Detection</span>
            <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); color: var(--color-status-green-text); padding: 2px 6px; border-radius: 4px;">Human Monitors</span>
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
            AI spots spend spikes in non-prod environments automatically.
          </p>
          
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${vars.map(v => `
              <div style="padding: 1rem; border-left: 4px solid var(--color-status-amber-border); background: var(--bg-primary); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                  <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); text-transform: capitalize;">${v.environment} Env</span>
                  <span style="color: var(--color-status-amber-text); font-weight: 700; font-size: 0.85rem;">+$${v.spike_amount} Spike</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${v.reason}</div>
              </div>
            `).join('')}
            ${vars.length === 0 ? '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">No spend anomalies detected.</div>' : ''}
          </div>
        </div>
      </div>
    </div>` + layoutSuffix;
};

window.forecastCosts = async function(demandId) {
  try {
    await fetch(`${BASE_URL}/budget-cost/estimate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId })
    });
    window.fetchBudgetCostData();
  } catch(e) { console.error(e); }
};

window.modelROI = async function(demandId) {
  try {
    await fetch(`${BASE_URL}/budget-cost/roi`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId, velocity_data: { story_points: 42, sprint_cost: 15000 } })
    });
    window.fetchBudgetCostData();
  } catch(e) { console.error(e); }
};
