// ── Budget & Cost — Three Capabilities ──────────────────────────────────────
// All three tabs share the same demand_id selected from the sidebar.

const BC_API = '/api/budget-cost';
let bcActiveTab = 'burn';

// ── Entry point ──────────────────────────────────────────────────────────────
window.fetchBudgetCostData = async function () {
  try {
    const demRes = await fetch('/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch (e) { console.warn('Could not fetch demands', e); }

  const demandId = sessionStorage.getItem('selectedDemandId');
  if (demandId) {
    try {
      const invRes = await fetch(`/api/budget-cost/invoices/${demandId}`);
      if (invRes.ok) {
        window.currentInvoicesList = await invRes.json();
      } else {
        window.currentInvoicesList = [];
      }
    } catch (invErr) {
      console.error("Invoices fetch error", invErr);
      window.currentInvoicesList = [];
    }
  } else {
    window.currentInvoicesList = [];
  }

  window.renderBudgetCostScreen();
};

// ── Main render ───────────────────────────────────────────────────────────────
window.renderBudgetCostScreen = function (targetContainer) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];

  const tabs = [
    { id: 'burn', icon: '🔥', label: 'Burn & Forecast' },
    { id: 'invoice', icon: '📄', label: 'Invoice & PO Match' },
    { id: 'capex', icon: '📊', label: 'Capex / Opex' },
  ];

  const tabBar = tabs.map(t => `
    <button id="bc-tab-${t.id}" onclick="bcSwitchTab('${t.id}')"
      style="padding:0.55rem 1.1rem;border:none;border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-sans);font-size:0.85rem;font-weight:600;transition:all 0.2s;
        background:${bcActiveTab === t.id ? 'var(--color-brand)' : 'transparent'};
        color:${bcActiveTab === t.id ? '#fff' : 'var(--text-secondary)'};">
      ${t.icon} ${t.label}
    </button>`).join('');

  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); bcActiveTab='burn'; window.fetchBudgetCostData();"
      style="padding:0.4rem 0.75rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:0.85rem;font-family:var(--font-sans);cursor:pointer;outline:none;">
      <option value="">Select a project...</option>
      ${demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title || 'Untitled'}</option>`).join('')}
    </select>
  `;

  const viewport = targetContainer || window.currentModuleTargetContainer || document.getElementById('viewport');
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

  const deleteBtnHtml = demandId ? `
    <button onclick="window.bcDeleteDemand('${demandId}')" 
      style="padding:0.4rem 0.75rem; border-radius:var(--radius-sm); border:1px solid #ef4444; background:transparent; color:#ef4444; font-size:0.85rem; font-weight:600; font-family:var(--font-sans); cursor:pointer; margin-left:1rem; transition:all 0.2s;">
      🗑 Delete Project Data
    </button>
  ` : '';

  const hasInsights = window.currentInvoicesList && window.currentInvoicesList.length > 0;

  viewport.innerHTML = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">

        <div class="sidebar-search" style="padding: 0 1rem 0.5rem 1rem;">
          <input type="text" placeholder="Search project..." oninput="window.filterSidebarDemands(this)" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); box-sizing: border-box;" />
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="budget-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <!-- Header -->
        <div style="padding:1rem 1.5rem 0;border-bottom:1px solid var(--border-color);background:var(--bg-primary);border-radius: var(--radius-md) var(--radius-md) 0 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <div style="display:flex;align-items:center;gap:1.5rem;">
              <div>
                <h2 style="margin:0;font-family:var(--font-display);color:var(--text-primary);font-size:1.25rem;">Budget &amp; Cost</h2>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">Financial Intelligence</div>
              </div>
              <div style="display:flex;align-items:center;">
                ${dropdownHtml}
                ${deleteBtnHtml}
              </div>
            </div>
            <status-pill status="${demandId ? 'Monitoring' : 'Idle'}"></status-pill>
          </div>
          <!-- Tabs (hidden if no insights) -->
          ${hasInsights ? `<div style="display:flex;gap:0.35rem;padding-bottom:0.75rem;">${tabBar}</div>` : `<div style="padding-bottom:0.75rem;"></div>`}
        </div>

        <!-- Content -->
        <div id="bc-tab-content" style="flex:1;padding:1.5rem;background:var(--bg-secondary);display:flex;flex-direction:column;"></div>

        <!-- Footer nav -->
        <div style="padding:1rem 1.5rem;border-top:1px solid var(--border-color);background:var(--bg-primary);display:flex;justify-content:flex-end;border-radius: 0 0 var(--radius-md) var(--radius-md);">
          <button onclick="window.location.hash='vendor-coordination';"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;padding:0.65rem 1.4rem;border-radius:var(--radius-md);border:none;cursor:pointer;font-family:var(--font-sans);">
            Proceed to Vendor Coordination →
          </button>
        </div>
      </main>
    </div>`;

  const content = document.getElementById('bc-tab-content');

  if (!demandId) {
    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.9rem;">
        Please select a project from the left sidebar or the dropdown to begin.
      </div>`;
    return;
  }

  if (!hasInsights) {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;">
        <div style="text-align:center;max-width:400px;">
          <h3 style="margin:0 0 0.5rem 0;font-size:1.25rem;color:var(--text-primary);">Generate Insights</h3>
          <p style="margin:0;font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">
            Run our AI financial engine to automatically generate invoices, perform Capex/Opex classifications, and construct a full burn rate forecast.
          </p>
        </div>
        <button type="button" id="btn-generate-insights" onclick="event.preventDefault(); window.bcGenerateInsights('${demandId}')"
          style="background:linear-gradient(135deg,var(--color-brand),#4f46e5);color:#fff;border:none;padding:0.85rem 2rem;border-radius:var(--radius-md);font-size:1rem;font-weight:700;cursor:pointer;font-family:var(--font-sans);box-shadow:0 4px 14px rgba(99,102,241,0.4);transition:all 0.2s ease;">
          ✨ Generate Insights
        </button>
      </div>`;
    return;
  }

  bcLoadTab(bcActiveTab, demandId);
};

window.bcGenerateInsights = async function (demandId) {
  const btn = document.getElementById('btn-generate-insights');
  if (btn) {
    btn.innerHTML = '⚙️ Analyzing... (This may take ~15s)';
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }

  try {
    const res = await fetch(`/api/budget-cost/insights/generate/${demandId}`, { method: 'POST' });
    if (res.ok) {
      bcActiveTab = 'invoice';
      // Re-fetch all data to populate tabs
      await window.fetchBudgetCostData();
    } else {
      const err = await res.json();
      alert('Error generating insights: ' + (err.detail || err.message || JSON.stringify(err)));
      if (btn) {
        btn.innerHTML = '✨ Generate Insights';
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }
  } catch (e) {
    console.error('Insights error', e);
    alert('Network error while generating insights.');
    if (btn) {
      btn.innerHTML = '✨ Generate Insights';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
};

// ── Delete Demand Data ───────────────────────────────────────────────────────
window.bcDeleteDemand = async function (demandId) {
  if (!confirm(`Are you sure you want to permanently delete all budget, invoice, and capex data for project ${demandId}? This cannot be undone.`)) return;

  const btn = event.currentTarget;
  const origHtml = btn.innerHTML;
  btn.innerHTML = 'Deleting...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/budget-cost/project/${demandId}`, { method: 'DELETE' });
    if (res.ok) {
      alert(`Successfully deleted all data for ${demandId}. You can now generate fresh insights and perform a new approval.`);
      // Reset local state
      window.currentInvoicesList = [];
      window.bcBurnEditMode = undefined;
      window.bcBurnEditData = [];
      sessionStorage.setItem('selectedDemandId', demandId);
      await window.fetchBudgetCostData();
    } else {
      const err = await res.json();
      alert('Error deleting data: ' + JSON.stringify(err));
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  } catch (e) {
    console.error('Delete error', e);
    alert('Network error while deleting data.');
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
};

// ── Tab switch ────────────────────────────────────────────────────────────────
window.bcSwitchTab = function (tab) {
  bcActiveTab = tab;
  const demandId = sessionStorage.getItem('selectedDemandId');
  // Update button styles
  ['burn', 'invoice', 'capex'].forEach(t => {
    const btn = document.getElementById(`bc-tab-${t}`);
    if (!btn) return;
    btn.style.background = t === tab ? 'var(--color-brand)' : 'transparent';
    btn.style.color = t === tab ? '#fff' : 'var(--text-secondary)';
  });
  bcLoadTab(tab, demandId);
};

// ── Tab content loader ────────────────────────────────────────────────────────
async function bcLoadTab(tab, demandId) {
  const content = document.getElementById('bc-tab-content');
  if (!content || !demandId) return;
  content.innerHTML = '<div style="padding:2rem;color:var(--text-muted);">Loading...</div>';
  if (tab === 'burn') await bcRenderBurn(demandId, content);
  if (tab === 'invoice') await bcRenderInvoice(demandId, content);
  if (tab === 'capex') await bcRenderCapex(demandId, content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Burn & Forecast
// ═══════════════════════════════════════════════════════════════════════════════
window.bcBurnEditMode = false;
window.bcBurnEditData = [];

async function bcRenderBurn(demandId, content) {
  let data = {};
  try {
    const res = await fetch(`${BC_API}/burn/${demandId}`);
    if (res.ok) data = await res.json();
  } catch (e) { }

  const actuals = data.actuals || [];
  const forecast = data.forecast || [];

  const totalActuals = actuals.reduce((sum, a) => sum + (a.amount || 0), 0);

  // Manage edit mode state without forcefully overriding user's toggle
  if (window.bcBurnEditMode === undefined) {
    if (totalActuals === 0 && forecast.length === 0) {
      window.bcBurnEditMode = true;
      window.bcBurnEditData = JSON.parse(JSON.stringify(actuals));
    } else {
      window.bcBurnEditMode = false;
    }
  }

  if (window.bcBurnEditMode) {
    if (!window.bcBurnEditData || window.bcBurnEditData.length === 0) {
      window.bcBurnEditData = JSON.parse(JSON.stringify(actuals));
    }
    // ── EDIT MODE ─────────────────────────────────────────────────────────────
    const rows = window.bcBurnEditData.map((a, i) => `
      <div style="display:flex;align-items:center;gap:0.75rem;background:var(--bg-primary);padding:0.75rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:0.5rem;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:0.2rem;">
          <label style="font-size:0.7rem;color:var(--text-muted);">Period</label>
          <input type="month" value="${a.date}" onchange="window.bcBurnEditData[${i}].date = this.value"
            style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:0.4rem;border-radius:4px;font-family:var(--font-sans);font-size:0.85rem;">
        </div>
        
        <div style="display:flex;flex-direction:column;gap:0.2rem;">
          <label style="font-size:0.7rem;color:var(--text-muted);">Monthly Spend ($)</label>
          <div style="display:flex;align-items:center;gap:0.3rem;">
            <button type="button" onclick="bcAdjustAmount(${i}, -1000, '${demandId}')" style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);width:30px;height:32px;border-radius:4px;cursor:pointer;font-weight:bold;">-</button>
            <input type="number" step="1000" min="0" value="${a.amount}" onchange="window.bcBurnEditData[${i}].amount = Math.max(0, parseFloat(this.value) || 0); bcRenderBurn('${demandId}', document.getElementById('bc-tab-content'))"
              style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:0.4rem;border-radius:4px;font-family:monospace;width:120px;font-size:0.9rem;text-align:right;">
            <button type="button" onclick="bcAdjustAmount(${i}, 1000, '${demandId}')" style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);width:30px;height:32px;border-radius:4px;cursor:pointer;font-weight:bold;">+</button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.2rem;">
          <label style="font-size:0.7rem;color:var(--text-muted);">Category</label>
          <select onchange="window.bcBurnEditData[${i}].category = this.value" style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:0.4rem;border-radius:4px;font-size:0.85rem;">
            <option value="actual" ${a.category === 'actual' || !a.category ? 'selected' : ''}>Actual</option>
            <option value="infrastructure" ${a.category === 'infrastructure' ? 'selected' : ''}>Infrastructure</option>
            <option value="vendor" ${a.category === 'vendor' ? 'selected' : ''}>Vendor</option>
            <option value="resource" ${a.category === 'resource' ? 'selected' : ''}>Resource</option>
          </select>
        </div>

        <button type="button" onclick="bcRemoveMonth(${i}, '${demandId}')" style="background:transparent;border:none;color:#ef4444;cursor:pointer;margin-left:auto;font-size:1.1rem;" title="Delete Period">❌</button>
      </div>
    `).join('');

    content.innerHTML = `
      <div style="max-width:650px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3 style="margin:0 0 0.25rem 0;font-size:1.1rem;">✏️ Edit Monthly Expenditure</h3>
            <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);">Modify or add monthly actual spend entries. Saving will recalculate variance and refresh AI forecasts.</p>
          </div>
        </div>
        <div>
          ${rows || '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem;">No data entries yet. Click below to add a month.</div>'}
          <button type="button" onclick="bcAddMonth('${demandId}')" style="background:var(--bg-secondary);border:1px dashed var(--border-color);color:var(--text-primary);padding:0.6rem 1rem;border-radius:4px;cursor:pointer;width:100%;font-weight:600;">+ Add Month</button>
        </div>
        <div style="display:flex;gap:1rem;justify-content:flex-end;">
          <button type="button" onclick="window.bcBurnEditMode=false;bcLoadTab('burn','${demandId}')" style="background:transparent;border:1px solid var(--border-color);color:var(--text-primary);padding:0.5rem 1rem;border-radius:4px;cursor:pointer;">Cancel</button>
          <button type="button" onclick="bcSaveActuals('${demandId}')" style="background:var(--color-brand);color:#fff;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;font-weight:600;">💾 Save & Update Forecast</button>
        </div>
      </div>
    `;
    return;
  }

  // ── VIEW MODE ─────────────────────────────────────────────────────────────
  const all = [...actuals, ...forecast];
  const maxAmt = all.length ? Math.max(...all.map(a => a.amount)) : 1;
  const varPct = data.variance_pct ?? 0;
  const varColor = varPct > 0 ? '#ef4444' : '#10b981';
  const committed = data.committed;

  const barChart = all.map(a => {
    const pct = Math.round((a.amount / maxAmt) * 100);
    const isActual = a.category !== 'projected';
    return `
      <div style="display:flex;align-items:flex-end;flex-direction:column;gap:0.2rem;flex:1;min-width:52px;">
        <div style="font-size:0.7rem;color:var(--text-muted);">$${(a.amount / 1000).toFixed(1)}k</div>
        <div style="width:100%;background:${isActual ? 'var(--color-brand)' : 'rgba(99,102,241,0.3)'};border-radius:4px 4px 0 0;height:${pct}%;min-height:4px;transition:height 0.4s ease;"></div>
        <div style="font-size:0.68rem;color:var(--text-muted);text-align:center;">${a.date}</div>
        <div style="font-size:0.62rem;color:${isActual ? 'var(--color-brand)' : 'var(--text-muted)'};text-align:center;">${isActual ? 'Actual' : 'Fcst'}</div>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div style="max-width:900px;display:flex;flex-direction:column;gap:1.5rem;">
      <!-- KPI row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
        ${[
      ['Total Actuals', '$' + actuals.reduce((s, a) => s + a.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), 'var(--text-primary)'],
      ['Variance vs Plan', (varPct > 0 ? '+' : '') + varPct + '%', varColor],
      ['Status', committed ? '✅ Committed' : '⏳ Draft', committed ? '#10b981' : 'var(--color-status-amber-text)']
    ].map(([lbl, val, col]) => `
          <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1rem;text-align:center;">
            <div style="font-size:0.73rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">${lbl}</div>
            <div style="font-size:1.6rem;font-weight:700;color:${col};margin-top:0.3rem;">${val}</div>
          </div>`).join('')}
      </div>

      <!-- Bar chart -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3 style="margin:0;font-size:1rem;">Burn vs Forecast</h3>
          <div style="display:flex;gap:0.75rem;font-size:0.75rem;">
            <button onclick="bcEditActuals('${demandId}')" style="background:transparent;border:1px solid var(--border-color);color:var(--text-primary);padding:0.2rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.7rem;">✏️ Edit Data</button>
            <span style="display:flex;align-items:center;gap:0.3rem;"><span style="width:10px;height:10px;border-radius:2px;background:var(--color-brand);display:inline-block;"></span>Actuals</span>
            <span style="display:flex;align-items:center;gap:0.3rem;"><span style="width:10px;height:10px;border-radius:2px;background:rgba(99,102,241,0.3);display:inline-block;"></span>Forecast</span>
          </div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:0.5rem;height:150px;">${barChart || '<div style="color:var(--text-muted);font-size:0.85rem;">No data yet</div>'}</div>
      </div>

      <!-- Narrative -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
          <h3 style="margin:0;font-size:1rem;">📝 Variance Narrative</h3>
          <span style="font-size:0.73rem;background:rgba(59,130,246,0.12);color:#3b82f6;padding:2px 8px;border-radius:4px;">Human Directs</span>
        </div>
        ${data.narrative
      ? `<div style="font-size:0.85rem;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;">${data.narrative}</div>`
      : `<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;">No narrative yet — run AI forecast to generate one.</div>`}
        <div style="display:flex;gap:0.75rem;margin-top:1rem;">
          <button onclick="bcRunForecast('${demandId}')" id="bc-forecast-btn"
            style="background:var(--color-brand);color:#fff;border:none;border-radius:var(--radius-sm);padding:0.55rem 1.1rem;cursor:pointer;font-size:0.83rem;font-weight:600;font-family:var(--font-sans);">
            ${data.narrative ? '🔄 Re-run AI Forecast' : '🤖 Generate AI Forecast'}
          </button>
          ${data.narrative && !committed ? `<button onclick="bcCommitForecast('${demandId}')"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:var(--radius-sm);padding:0.55rem 1.1rem;cursor:pointer;font-size:0.83rem;font-weight:600;font-family:var(--font-sans);">
            ✅ Commit Forecast
          </button>` : ''}
        </div>
      </div>
    </div>`;
}

window.bcEditActuals = async function (demandId) {
  try {
    const res = await fetch(`${BC_API}/burn/${demandId}`);
    if (res.ok) {
      const data = await res.json();
      window.bcBurnEditData = [...(data.actuals || [])];
    }
  } catch (e) { window.bcBurnEditData = []; }
  window.bcBurnEditMode = true;
  bcLoadTab('burn', demandId);
};

window.bcAddMonth = function (demandId) {
  let nextDate = '2026-01';
  if (window.bcBurnEditData.length > 0) {
    const last = window.bcBurnEditData[window.bcBurnEditData.length - 1].date;
    const [y, m] = last.split('-');
    const nextM = parseInt(m) + 1;
    if (nextM > 12) nextDate = `${parseInt(y) + 1}-01`;
    else nextDate = `${y}-${nextM.toString().padStart(2, '0')}`;
  }
  window.bcBurnEditData.push({ date: nextDate, amount: 10000, category: 'blended' });
  bcRenderBurn(demandId, document.getElementById('bc-tab-content'));
};

window.bcRemoveMonth = function (idx, demandId) {
  window.bcBurnEditData.splice(idx, 1);
  bcRenderBurn(demandId, document.getElementById('bc-tab-content'));
};

window.bcAdjustAmount = function (idx, delta, demandId) {
  window.bcBurnEditData[idx].amount = Math.max(0, window.bcBurnEditData[idx].amount + delta);
  bcRenderBurn(demandId, document.getElementById('bc-tab-content'));
};

window.bcSaveActuals = async function (demandId) {
  try {
    await fetch(`${BC_API}/burn/actuals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, actuals: window.bcBurnEditData })
    });
    await fetch(`${BC_API}/burn/forecast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId })
    });
    window.bcBurnEditMode = false;
    await bcLoadTab('burn', demandId);
  } catch (e) { console.error(e); }
};

window.bcRunForecast = async function (demandId) {
  const btn = document.getElementById('bc-forecast-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  try {
    await fetch(`${BC_API}/burn/forecast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId })
    });
    await bcLoadTab('burn', demandId);
  } catch (e) { console.error(e); }
};

window.bcCommitForecast = async function (demandId) {
  try {
    await fetch(`${BC_API}/burn/commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId })
    });
    await bcLoadTab('burn', demandId);
  } catch (e) { console.error(e); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Invoice & PO Match
// ═══════════════════════════════════════════════════════════════════════════════
async function bcRenderInvoice(demandId, content) {
  let invoices = [];
  try {
    const res = await fetch(`${BC_API}/invoices/${demandId}`);
    if (res.ok) invoices = await res.json();
  } catch (e) { }
  window.currentInvoicesList = invoices;

  const statusBadge = (status) => {
    const map = {
      matched: ['#10b981', 'rgba(16,185,129,0.1)', 'Matched'],
      discrepancy: ['#f59e0b', 'rgba(245,158,11,0.1)', '⚠ Discrepancy'],
      approved: ['#6366f1', 'rgba(99,102,241,0.1)', 'Approved'],
      disputed: ['#ef4444', 'rgba(239,68,68,0.1)', 'Disputed'],
      pending: ['#94a3b8', 'rgba(148,163,184,0.1)', 'Pending'],
    };
    const [color, bg, label] = map[status] || map.pending;
    return `<span style="font-size:0.73rem;font-weight:700;padding:3px 9px;border-radius:12px;background:${bg};color:${color};">${label}</span>`;
  };

  const rows = invoices.map(inv => `
    <tr style="border-bottom:1px solid var(--border-color);">
      <td style="padding:0.75rem 0.5rem;font-family:monospace;font-size:0.8rem;color:var(--color-brand);">${inv.invoice_id}</td>
      <td style="padding:0.75rem 0.5rem;font-size:0.85rem;color:var(--text-primary);font-weight:600;">$${inv.invoice_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td style="padding:0.75rem 0.5rem;font-size:0.8rem;color:var(--text-secondary);">${inv.po_reference}</td>
      <td style="padding:0.75rem 0.5rem;font-size:0.8rem;color:var(--text-secondary);">${inv.sow_reference || '—'}</td>
      <td style="padding:0.75rem 0.5rem;">${statusBadge(inv.match_status)}</td>
      <td style="padding:0.75rem 0.5rem; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
        <button onclick="window.bcPreviewInvoice('${inv.invoice_id}')" style="font-size:0.75rem;padding:3px 9px;border-radius:4px;border:1px solid var(--border-color);cursor:pointer;background:transparent;color:var(--text-primary);font-weight:600;">Preview</button>
        ${inv.match_status === 'discrepancy'
      ? `<div style="display:flex;gap:0.5rem;">
               <button onclick="bcApproveInvoice('${demandId}','${inv.invoice_id}','approve')"
                style="font-size:0.75rem;padding:3px 9px;border-radius:4px;border:none;cursor:pointer;background:rgba(16,185,129,0.15);color:#10b981;font-weight:600;">Approve</button>
               <button onclick="bcApproveInvoice('${demandId}','${inv.invoice_id}','dispute')"
                style="font-size:0.75rem;padding:3px 9px;border-radius:4px;border:none;cursor:pointer;background:rgba(239,68,68,0.12);color:#ef4444;font-weight:600;">Dispute</button>
             </div>`
      : (inv.match_status === 'disputed' || inv.decision === 'dispute')
      ? `<div style="display:flex;gap:0.5rem;align-items:center;">
               <button onclick="bcApproveInvoice('${demandId}','${inv.invoice_id}','approve')"
                style="font-size:0.75rem;padding:3px 9px;border-radius:4px;border:1px solid #10b981;cursor:pointer;background:rgba(16,185,129,0.1);color:#10b981;font-weight:600;">Approve</button>
             </div>`
      : `<span style="font-size:0.75rem;color:#10b981;font-weight:600;">Approved</span>`}
      </td>
    </tr>
    ${(inv.discrepancies || []).length > 0 && inv.match_status === 'discrepancy' ? `
    <tr>
      <td colspan="6" style="padding:0 0.5rem 0.75rem 0.5rem;">
        <div style="background:rgba(245,158,11,0.07);border-left:3px solid #f59e0b;padding:0.6rem 0.85rem;border-radius:0 4px 4px 0;font-size:0.8rem;color:var(--text-secondary);">
          ${inv.discrepancies.map(d => `⚠ <b>${d.item}</b>: ${d.detail}`).join('<br>')}
          ${inv.ai_analysis ? `<div style="margin-top:0.5rem;color:var(--text-muted);font-size:0.78rem;">AI: ${inv.ai_analysis.substring(0, 200)}${inv.ai_analysis.length > 200 ? '…' : ''}</div>` : ''}
        </div>
      </td>
    </tr>` : ''}`).join('');

  const total = invoices.reduce((s, i) => s + i.invoice_amount, 0);
  const flagged = invoices.filter(i => i.match_status === 'discrepancy').length;
  const disputed = invoices.filter(i => i.match_status === 'disputed' || i.decision === 'dispute').length;
  const matched = invoices.filter(i => i.match_status === 'matched' || i.decision === 'approve').length;
  const allApproved = invoices.length > 0 && matched === invoices.length;

  content.innerHTML = `
    <div style="max-width:1000px;display:flex;flex-direction:column;gap:1.5rem;">
      <!-- Summary KPIs -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
        ${[
      ['Total Invoiced', '$' + total.toLocaleString(undefined, { maximumFractionDigits: 0 }), 'var(--text-primary)'],
      ['Pending / Disputed', (flagged + disputed) + ' invoice' + ((flagged + disputed) !== 1 ? 's' : ''), (flagged + disputed) > 0 ? '#f59e0b' : '#10b981'],
      ['Approved', matched + ' / ' + invoices.length, matched === invoices.length ? '#10b981' : 'var(--text-primary)']
    ].map(([l, v, c]) => `
          <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1rem;text-align:center;">
            <div style="font-size:0.73rem;color:var(--text-muted);text-transform:uppercase;">${l}</div>
            <div style="font-size:1.5rem;font-weight:700;color:${c};margin-top:0.3rem;">${v}</div>
          </div>`).join('')}
      </div>

      <!-- Submit invoice for matching -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1.25rem;">
        <h3 style="margin:0 0 0.85rem 0;font-size:0.95rem;">Submit Invoice for PO Match</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.6rem;margin-bottom:0.75rem;">
          <input id="inv-invoice-id-${demandId}" type="text" placeholder="Invoice ID" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="inv-amount-${demandId}" type="number" placeholder="Invoice amount ($)" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="inv-po-ref-${demandId}" type="text" placeholder="PO reference" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="inv-po-amount-${demandId}" type="number" placeholder="PO amount ($, optional)" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="inv-sow-ref-${demandId}" type="text" placeholder="SOW reference (optional)" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="inv-delivered-${demandId}" type="text" placeholder="Delivered items (comma-separated)" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
        </div>
        <button onclick="bcSubmitInvoiceMatch('${demandId}')" class="btn-primary" style="padding:0.5rem 1rem;font-size:0.85rem;">Submit for AI Matching</button>
      </div>

      <!-- Invoice table -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden;">
        <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:1rem;">Invoice Register</h3>
          <div style="display:flex;gap:0.75rem;align-items:center;">
            ${allApproved 
              ? `<button onclick="window.bcFinalApprove('${demandId}')" id="btn-final-approve" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:0.78rem;font-weight:600;cursor:pointer;">✅ Final Approve</button>` 
              : `<span style="font-size:0.78rem;color:#f59e0b;font-weight:600;background:rgba(245,158,11,0.1);padding:4px 10px;border-radius:4px;">
                   ⏳ ${disputed > 0 ? disputed + ' Disputed' : (invoices.length - matched) + ' Pending'} (All must be Approved to Finalize)
                 </span>`
            }
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-primary);">
              ${['Invoice ID', 'Amount', 'PO Ref', 'SOW Ref', 'Status', 'Action'].map(h => `<th style="padding:0.6rem 0.5rem;text-align:left;font-size:0.73rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" style="padding:2rem;text-align:center;color:var(--text-muted);">No invoices found</td></tr>'}</tbody>
        </table>
      </div>

    </div>`;
}

window.bcSubmitInvoiceMatch = async function(demandId) {
  const val = (id) => document.getElementById(id)?.value.trim() || '';
  const invoiceId = val(`inv-invoice-id-${demandId}`);
  const amountStr = val(`inv-amount-${demandId}`);
  const poRef = val(`inv-po-ref-${demandId}`);
  const poAmountStr = val(`inv-po-amount-${demandId}`);
  const sowRef = val(`inv-sow-ref-${demandId}`);
  const deliveredStr = val(`inv-delivered-${demandId}`);

  if (!invoiceId || !amountStr || !poRef) {
    alert('Invoice ID, invoice amount, and PO reference are required.');
    return;
  }

  try {
    await fetch(`${BC_API}/invoices/match`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        demand_id: demandId,
        invoice_id: invoiceId,
        invoice_amount: parseFloat(amountStr),
        po_reference: poRef,
        po_amount: poAmountStr ? parseFloat(poAmountStr) : null,
        sow_reference: sowRef || null,
        delivered_items: deliveredStr ? deliveredStr.split(',').map(s => s.trim()).filter(Boolean) : []
      })
    });
    await bcLoadTab('invoice', demandId);
  } catch(e) { console.error(e); }
};

window.bcApproveInvoice = async function (demandId, invoiceId, decision) {
  try {
    const res = await fetch(`${BC_API}/invoices/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, invoice_id: invoiceId, decision })
    });
    const data = await res.json();
    await bcLoadTab('invoice', demandId);

    // Only notify after ALL invoices have been reviewed/handled
    if (data.all_handled) {
      if (data.all_approved) {
        alert("All invoices are now approved! You can click Final Approve to populate Burn & Forecast actuals.");
      } else if (data.disputed_count > 0) {
        alert(`All invoices have been reviewed. Note: ${data.disputed_count} invoice(s) remain Disputed. All invoices must be approved before Final Approval can proceed.`);
      }
    }
  } catch (e) { console.error(e); }
};

window.bcFinalApprove = async function (demandId) {
  const btn = document.getElementById('btn-final-approve');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Processing...'; }
  try {
    const res = await fetch(`${BC_API}/invoices/final-approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId })
    });
    if (res.ok) {
      alert("Final approval complete! Capex classifications and Burn actuals populated.");
      window.bcBurnEditMode = false;
      bcActiveTab = 'burn';
      await window.fetchBudgetCostData();
    } else {
      alert("Error during final approval.");
      if (btn) { btn.disabled = false; btn.innerHTML = '✅ Final Approve'; }
    }
  } catch (e) { console.error(e); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Capex / Opex
// ═══════════════════════════════════════════════════════════════════════════════
async function bcRenderCapex(demandId, content) {
  let items = [];
  try {
    const res = await fetch(`${BC_API}/capex-opex/${demandId}`);
    if (res.ok) items = await res.json();
  } catch (e) { }

  const capexTotal = items.filter(i => i.classification === 'capex').reduce((s, i) => s + i.amount, 0);
  const opexTotal = items.filter(i => i.classification === 'opex').reduce((s, i) => s + i.amount, 0);
  const total = capexTotal + opexTotal;
  const capexPct = total ? Math.round(capexTotal / total * 100) : 0;
  const allSigned = items.length > 0 && items.every(i => i.signed_off);

  const rows = items.map(item => {
    const isCapex = item.classification === 'capex';
    return `
      <tr style="border-bottom:1px solid var(--border-color);">
        <td style="padding:0.75rem 0.5rem;font-size:0.85rem;color:var(--text-primary);">${item.description}</td>
        <td style="padding:0.75rem 0.5rem;font-size:0.85rem;font-weight:600;color:var(--text-primary);">$${item.amount.toLocaleString()}</td>
        <td style="padding:0.75rem 0.5rem;font-size:0.8rem;color:var(--text-secondary);">${item.vendor || '—'}</td>
        <td style="padding:0.75rem 0.5rem;font-size:0.8rem;color:var(--text-secondary);text-transform:capitalize;">${item.project_phase || '—'}</td>
        <td style="padding:0.75rem 0.5rem;">
          <span style="font-size:0.73rem;font-weight:700;padding:3px 9px;border-radius:12px;
            background:${isCapex ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.1)'};
            color:${isCapex ? '#6366f1' : '#10b981'};">
            ${isCapex ? '🏗 CAPEX' : '💸 OPEX'}
          </span>
        </td>
        <td style="padding:0.75rem 0.5rem;font-size:0.78rem;color:var(--text-muted);">${item.policy_evidence || '—'}</td>
        <td style="padding:0.75rem 0.5rem;text-align:center;">
          ${item.signed_off 
            ? `<span style="font-size:0.75rem;color:#10b981;font-weight:600;" title="Approved by ${item.signed_off_by || 'Finance'}">✅ Signed Off</span>`
            : `<button onclick="bcSignOffItem('${item.id}', '${demandId}')" style="background:var(--bg-secondary);border:1px solid var(--color-brand);color:var(--color-brand);padding:0.25rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;">✍️ Sign Off</button>`
          }
        </td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <div style="max-width:1000px;display:flex;flex-direction:column;gap:1.5rem;">
      <!-- KPIs + donut-style split -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:1rem;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
          ${[
      ['Total Spend', '$' + total.toLocaleString(), 'var(--text-primary)'],
      ['CAPEX', '$' + capexTotal.toLocaleString() + ' (' + capexPct + '%)', '#6366f1'],
      ['OPEX', '$' + opexTotal.toLocaleString() + ' (' + (100 - capexPct) + '%)', '#10b981'],
    ].map(([l, v, c]) => `
            <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1rem;text-align:center;">
              <div style="font-size:0.73rem;color:var(--text-muted);text-transform:uppercase;">${l}</div>
              <div style="font-size:1.3rem;font-weight:700;color:${c};margin-top:0.3rem;">${v}</div>
            </div>`).join('')}
        </div>
        <!-- Split bar -->
        <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1rem;display:flex;flex-direction:column;justify-content:center;gap:0.6rem;">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">CAPEX / OPEX Split</div>
          <div style="width:100%;height:14px;border-radius:7px;overflow:hidden;background:rgba(16,185,129,0.2);">
            <div style="width:${capexPct}%;height:100%;background:#6366f1;border-radius:7px;transition:width 0.5s ease;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.73rem;">
            <span style="color:#6366f1;">🏗 ${capexPct}% Capex</span>
            <span style="color:#10b981;">${100 - capexPct}% Opex 💸</span>
          </div>
        </div>
      </div>

      <!-- Submit spend item for classification -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1.25rem;">
        <h3 style="margin:0 0 0.85rem 0;font-size:0.95rem;">Submit Spend Item for AI Classification</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem;margin-bottom:0.75rem;">
          <input id="capex-description-${demandId}" type="text" placeholder="Description" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="capex-amount-${demandId}" type="number" placeholder="Amount ($)" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <input id="capex-vendor-${demandId}" type="text" placeholder="Vendor" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);" />
          <select id="capex-phase-${demandId}" style="padding:0.5rem 0.65rem;font-size:0.82rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);">
            <option value="planning">Planning</option>
            <option value="build">Build</option>
            <option value="post-go-live">Post-Go-Live</option>
          </select>
        </div>
        <button onclick="bcSubmitSpendClassification('${demandId}')" class="btn-primary" style="padding:0.5rem 1rem;font-size:0.85rem;">Submit Spend Item</button>
      </div>

      <!-- Classification table -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden;">
        <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <h3 style="margin:0;font-size:1rem;">Spend Classification</h3>
          <div style="display:flex;gap:0.75rem;align-items:center;">
            <span style="font-size:0.73rem;background:rgba(239,68,68,0.1);color:#ef4444;padding:2px 8px;border-radius:4px;">Finance Signs Off</span>
            ${allSigned
      ? `<span style="font-size:0.8rem;color:#10b981;font-weight:600;">✅ All Signed Off</span>`
      : `<button onclick="bcSignOff('${demandId}')"
                  style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:var(--radius-sm);padding:0.45rem 1rem;cursor:pointer;font-size:0.8rem;font-weight:600;font-family:var(--font-sans);">
                  Sign Off All
                </button>`}
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-primary);">
              ${['Description', 'Amount', 'Vendor', 'Phase', 'Classification', 'Policy Evidence', 'Sign-Off'].map(h => `<th style="padding:0.6rem 0.5rem;text-align:left;font-size:0.73rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-muted);">No items found</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

window.bcSignOffItem = async function (itemId, demandId) {
  try {
    await fetch(`${BC_API}/capex-opex/sign-off-item`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, approved_by: 'Finance Controller' })
    });
    bcRenderCapex(demandId, document.getElementById('bc-tab-content'));
  } catch (e) { console.error(e); }
};

<<<<<<< HEAD
window.bcSubmitSpendClassification = async function(demandId) {
  const val = (id) => document.getElementById(id)?.value.trim() || '';
  const description = val(`capex-description-${demandId}`);
  const amountStr = val(`capex-amount-${demandId}`);
  const vendor = val(`capex-vendor-${demandId}`);
  const projectPhase = val(`capex-phase-${demandId}`);

  if (!description || !amountStr) {
    alert('Description and amount are required.');
    return;
  }

  try {
    const res = await fetch(`${BC_API}/capex-opex/classify`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        demand_id: demandId,
        spend_items: [{
          description: description,
          amount: parseFloat(amountStr),
          vendor: vendor || null,
          project_phase: projectPhase || null
        }]
      })
    });
    if (res.ok) {
      if (document.getElementById(`capex-description-${demandId}`)) document.getElementById(`capex-description-${demandId}`).value = '';
      if (document.getElementById(`capex-amount-${demandId}`)) document.getElementById(`capex-amount-${demandId}`).value = '';
      if (document.getElementById(`capex-vendor-${demandId}`)) document.getElementById(`capex-vendor-${demandId}`).value = '';
      await bcLoadTab('capex', demandId);
    } else {
      const err = await res.json();
      alert('Error classifying spend item: ' + (err.detail || 'unknown error'));
    }
  } catch(e) {
    console.error(e);
    alert('Connection error: ' + e.message);
  }
};

window.generateInvoices = async function(demandId) {
=======
window.bcSignOff = async function (demandId) {
  try {
    await fetch(`${BC_API}/capex-opex/sign-off`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand_id: demandId, approved_by: 'Finance Controller' })
    });
    bcRenderCapex(demandId, document.getElementById('bc-tab-content'));
  } catch (e) { console.error(e); }
};

window.generateInvoices = async function (demandId) {
>>>>>>> main
  try {
    const res = await fetch(`${BASE_URL}/budget-cost/project/${demandId}/invoices/generate`, {
      method: 'POST'
    });
    if (res.ok) {
      window.fetchBudgetCostData();
    } else {
      const err = await res.json();
      alert("Error: " + (err.detail || "Failed to generate invoices. Check if project plan is generated."));
    }
  } catch (e) {
    console.error(e);
    alert("Connection error: " + e.message);
  }
};

window.generateSampleInvoices = async function (demandId) {
  try {
    const res = await fetch(`${BC_API}/invoices/${demandId}/generate-samples`, {
      method: 'POST'
    });
    if (res.ok) {
      await bcLoadTab('invoice', demandId);
    } else {
      const err = await res.json();
      alert("Error: " + (err.detail || "Failed to generate sample invoices."));
    }
  } catch (e) {
    console.error(e);
    alert("Connection error: " + e.message);
  }
};

window.bcPreviewInvoice = function (invoiceId) {
  const inv = (window.currentInvoicesList || []).find(i => i.invoice_id === invoiceId);
  if (!inv) {
    alert("Invoice details not found.");
    return;
  }

  const projectTitle = inv.project_title || inv.demand_id;
  const domain = inv.domain || 'Technology';
  const taskName = inv.task_name || 'Project Services';
  const taskStart = inv.task_start || '—';
  const taskEnd = inv.task_end || '—';
  const invoiceDate = new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Line items table rows for the INVOICE (shows inflated qty/amount if discrepant)
  const lineItems = inv.line_items || inv.delivered_items.map(d => ({ description: d, qty: 1, unit: 'Lump Sum', amount: '—' }));
  const invoiceLineItemsHtml = lineItems.map(li => {
    const qty = li.qty_invoiced !== undefined ? li.qty_invoiced : li.qty;
    const amount = li.amount_invoiced !== undefined ? li.amount_invoiced : li.amount;
    const formattedAmount = typeof amount === 'number' ? amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : amount;
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">${li.description}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">${li.unit}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">$${formattedAmount}</td>
    </tr>`;
  }).join('');

  const total = inv.invoice_amount;
  const statusColor = inv.match_status === 'discrepancy' ? '#f59e0b' : '#10b981';
  const statusLabel = inv.match_status === 'discrepancy' ? '⚠ DISCREPANCY' : '✓ MATCHED';

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Documents – ${invoiceId}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', sans-serif; background: #4a4a4a; padding: 2rem; display: flex; flex-direction: column; align-items: center; gap: 2.5rem; }
      .controls { position: fixed; top: 1rem; right: 1rem; display: flex; gap: 0.5rem; z-index: 100; }
      .btn { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
      .btn-print { background: #10b981; color: #fff; }
      .btn-close { background: #ef4444; color: #fff; }
      .page { background: #fff; width: 210mm; min-height: 297mm; padding: 48px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); position: relative; page-break-after: always; }
      .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #1e1e2e; margin-bottom: 28px; }
      .doc-type { font-size: 2rem; font-weight: 700; letter-spacing: 2px; color: #1e1e2e; text-transform: uppercase; }
      .doc-meta { text-align: right; font-size: 0.82rem; line-height: 1.8; color: #555; }
      .doc-meta strong { color: #1e1e2e; }
      .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; margin-top: 6px; }
      .address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 28px; }
      .address-block { font-size: 0.85rem; line-height: 1.7; }
      .address-block h4 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
      .project-info { background: #f8f9fa; border-radius: 8px; padding: 14px 18px; margin-bottom: 28px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.82rem; }
      .project-info div strong { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 2px; }
      table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      table.items thead tr { background: #1e1e2e; color: #fff; }
      table.items th { padding: 10px 12px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
      table.items th:not(:first-child) { text-align: center; }
      table.items th:last-child { text-align: right; }
      .total-row { display: flex; justify-content: flex-end; margin-top: 16px; }
      .total-box { background: #1e1e2e; color: #fff; padding: 14px 24px; border-radius: 6px; text-align: right; }
      .total-box .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; }
      .total-box .amount { font-size: 1.6rem; font-weight: 700; margin-top: 4px; }
      .footer-note { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.75rem; color: #aaa; text-align: center; line-height: 1.6; }
      .watermark { position: absolute; bottom: 48px; right: 48px; font-size: 6rem; font-weight: 700; color: rgba(0,0,0,0.03); letter-spacing: 4px; text-transform: uppercase; pointer-events: none; }
      @media print { body { background: #fff; padding: 0; } .controls { display: none; } .page { box-shadow: none; width: 100%; padding: 24px; } }
    </style>
  </head>
  <body>
    <div class="controls">
      <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
      <button class="btn btn-close" onclick="window.close()">✕ Close</button>
    </div>

    <!-- ═══════════════════ INVOICE PAGE ═══════════════════ -->
    <div class="page">
      <div class="watermark">Invoice</div>
      <div class="doc-header">
        <div>
          <div class="doc-type">Invoice</div>
          <div style="font-size:0.85rem;color:#555;margin-top:6px;">${projectTitle}</div>
          <span class="status-badge" style="background:${statusColor}20;color:${statusColor};">${statusLabel}</span>
        </div>
        <div class="doc-meta">
          <strong>Invoice #</strong> ${inv.invoice_id}<br>
          <strong>PO Reference</strong> ${inv.po_reference}<br>
          <strong>SOW Reference</strong> ${inv.sow_reference || 'N/A'}<br>
          <strong>Date</strong> ${invoiceDate}
        </div>
      </div>

      <div class="address-grid">
        <div class="address-block">
          <h4>Billed To</h4>
          <strong>${projectTitle}</strong><br>
          ${domain} Division<br>
          Enterprise Procurement Office<br>
          1 Corporate Drive, Suite 100
        </div>
        <div class="address-block">
          <h4>Service Provider</h4>
          <strong>Digital Delivery Partners Ltd.</strong><br>
          Technology &amp; Professional Services<br>
          456 Innovation Boulevard<br>
          Tech City, TC1 9PL
        </div>
      </div>

      <div class="project-info">
        <div><strong>Project Phase</strong>${taskName}</div>
        <div><strong>Service Period</strong>${taskStart} → ${taskEnd}</div>
        <div><strong>Project ID</strong>${inv.demand_id}</div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Description of Services</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:center;">Unit</th>
            <th style="text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${invoiceLineItemsHtml}</tbody>
      </table>

      <div class="total-row">
        <div class="total-box">
          <div class="label">Total Due (USD)</div>
          <div class="amount">$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div class="footer-note">
        Payment due within 30 days of invoice date. Please reference Invoice # ${inv.invoice_id} on all payments.<br>
        This document is system-generated as part of the ${projectTitle} project (${inv.demand_id}).
      </div>
    </div>

    <!-- ═══════════════════ PURCHASE ORDER PAGE ═══════════════════ -->
    <div class="page">
      <div class="watermark">PO</div>
      <div class="doc-header">
        <div>
          <div class="doc-type">Purchase Order</div>
          <div style="font-size:0.85rem;color:#555;margin-top:6px;">${projectTitle}</div>
        </div>
        <div class="doc-meta">
          <strong>PO Number</strong> ${inv.po_reference}<br>
          <strong>SOW Reference</strong> ${inv.sow_reference || 'N/A'}<br>
          <strong>Invoice Ref</strong> ${inv.invoice_id}<br>
          <strong>Date Issued</strong> ${invoiceDate}
        </div>
      </div>

      <div class="address-grid">
        <div class="address-block">
          <h4>Purchaser / Buyer</h4>
          <strong>${projectTitle}</strong><br>
          ${domain} Division<br>
          Enterprise Procurement Office<br>
          1 Corporate Drive, Suite 100
        </div>
        <div class="address-block">
          <h4>Vendor / Supplier</h4>
          <strong>Digital Delivery Partners Ltd.</strong><br>
          Technology &amp; Professional Services<br>
          456 Innovation Boulevard<br>
          Tech City, TC1 9PL
        </div>
      </div>

      <div class="project-info">
        <div><strong>Scope / Phase</strong>${taskName}</div>
        <div><strong>Delivery Period</strong>${taskStart} → ${taskEnd}</div>
        <div><strong>Demand ID</strong>${inv.demand_id}</div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Authorised Service / Deliverable</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:center;">Unit</th>
            <th style="text-align:right;">Authorised Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map(li => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #eee;">${li.description}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">${li.qty_po || li.qty}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">${li.unit}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">$${typeof li.amount === 'number' ? li.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : li.amount}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div class="total-row">
        <div class="total-box">
          <div class="label">Total Authorised (USD)</div>
          <div class="amount">$${lineItems.reduce((acc, li) => acc + (typeof li.amount === 'number' ? li.amount : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div class="footer-note">
        This Purchase Order is issued under Statement of Work ${inv.sow_reference || 'N/A'}.<br>
        The vendor is authorised to invoice up to the total amount above for the scope described.<br>
        Any variation must be formally approved in writing by ${projectTitle} Procurement.
      </div>
    </div>
  </body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
};
