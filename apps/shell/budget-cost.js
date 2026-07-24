// ── Budget & Cost — Three Capabilities ──────────────────────────────────────
// All three tabs share the same demand_id selected from the sidebar.

const BC_API = '/api/budget-cost';
let bcActiveTab = 'burn';

// ── Entry point ──────────────────────────────────────────────────────────────
window.fetchBudgetCostData = async function() {
  try {
    const demRes = await fetch('/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch(e) { console.warn('Could not fetch demands', e); }
  
  const demandId = sessionStorage.getItem('selectedDemandId');
  if (demandId) {
    try {
      const invRes = await fetch(`/api/budget-cost/project/${demandId}/invoices`);
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
window.renderBudgetCostScreen = function(targetContainer) {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands  = window.allDemandsList || [];

  const tabs = [
    { id: 'burn',    icon: '🔥', label: 'Burn & Forecast' },
    { id: 'invoice', icon: '📄', label: 'Invoice & PO Match' },
    { id: 'capex',   icon: '📊', label: 'Capex / Opex' },
  ];

  const tabBar = tabs.map(t => `
    <button id="bc-tab-${t.id}" onclick="bcSwitchTab('${t.id}')"
      style="padding:0.55rem 1.1rem;border:none;border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-sans);font-size:0.85rem;font-weight:600;transition:all 0.2s;
        background:${bcActiveTab===t.id ? 'var(--color-brand)' : 'transparent'};
        color:${bcActiveTab===t.id ? '#fff' : 'var(--text-secondary)'};">
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

  viewport.innerHTML = `
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
        <!-- Header + tabs -->
        <div style="padding:1rem 1.5rem 0;border-bottom:1px solid var(--border-color);background:var(--bg-primary);border-radius: var(--radius-md) var(--radius-md) 0 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <div style="display:flex;align-items:center;gap:1.5rem;">
              <div>
                <h2 style="margin:0;font-family:var(--font-display);color:var(--text-primary);font-size:1.25rem;">Budget &amp; Cost</h2>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">Financial Intelligence</div>
              </div>
              ${dropdownHtml}
            </div>
            <status-pill status="${demandId ? 'Monitoring' : 'Idle'}"></status-pill>
          </div>
          <div style="display:flex;gap:0.35rem;padding-bottom:0.75rem;">${tabBar}</div>
        </div>

        <!-- Tab content -->
        <div id="bc-tab-content" style="flex:1;overflow-y:auto;padding:1.5rem;background:var(--bg-secondary);"></div>

        <!-- Footer nav -->
        <div style="padding:1rem 1.5rem;border-top:1px solid var(--border-color);background:var(--bg-primary);display:flex;justify-content:flex-end;border-radius: 0 0 var(--radius-md) var(--radius-md);">
          <button onclick="window.location.hash='vendor-coordination';"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;padding:0.65rem 1.4rem;border-radius:var(--radius-md);border:none;cursor:pointer;font-family:var(--font-sans);">
            Proceed to Vendor Coordination →
          </button>
        </div>
      </main>
    </div>`;

  if (!demandId) {
    document.getElementById('bc-tab-content').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.9rem;">
        Please select a project from the left sidebar or the dropdown to begin.
      </div>`;
    return;
  }

  bcLoadTab(bcActiveTab, demandId);
};

// ── Tab switch ────────────────────────────────────────────────────────────────
window.bcSwitchTab = function(tab) {
  bcActiveTab = tab;
  const demandId = sessionStorage.getItem('selectedDemandId');
  // Update button styles
  ['burn','invoice','capex'].forEach(t => {
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
  if (tab === 'burn')    await bcRenderBurn(demandId, content);
  if (tab === 'invoice') await bcRenderInvoice(demandId, content);
  if (tab === 'capex')   await bcRenderCapex(demandId, content);
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
  } catch(e) {}

  const actuals  = data.actuals  || [];
  const forecast = data.forecast || [];
  
  if (actuals.length === 0 && forecast.length === 0 && !window.bcBurnEditMode) {
    window.bcBurnEditMode = true;
    window.bcBurnEditData = [];
  }

  if (window.bcBurnEditMode) {
    // ── EDIT MODE ─────────────────────────────────────────────────────────────
    const rows = window.bcBurnEditData.map((a, i) => `
      <div style="display:flex;align-items:center;gap:1rem;background:var(--bg-primary);padding:0.75rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:0.5rem;">
        <input type="month" value="${a.date}" onchange="window.bcBurnEditData[${i}].date = this.value; window.bcRenderBurn('${demandId}', document.getElementById('bc-tab-content'))"
          style="background:transparent;border:1px solid var(--border-color);color:var(--text-primary);padding:0.4rem;border-radius:4px;font-family:var(--font-sans);">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <button onclick="bcAdjustAmount(${i}, -1000, '${demandId}')" style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);width:30px;height:30px;border-radius:4px;cursor:pointer;">-</button>
          <div style="font-family:monospace;font-size:0.9rem;width:80px;text-align:center;">$${a.amount.toLocaleString()}</div>
          <button onclick="bcAdjustAmount(${i}, 1000, '${demandId}')" style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);width:30px;height:30px;border-radius:4px;cursor:pointer;">+</button>
        </div>
        <button onclick="bcRemoveMonth(${i}, '${demandId}')" style="background:transparent;border:none;color:#ef4444;cursor:pointer;margin-left:auto;">❌</button>
      </div>
    `).join('');

    content.innerHTML = `
      <div style="max-width:600px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;">
        <div>
          <h3 style="margin:0 0 0.5rem 0;font-size:1.1rem;">Enter Actual Spend</h3>
          <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);">Input monthly actuals before generating an AI forecast.</p>
        </div>
        <div>
          ${rows || '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem;">No data entered yet.</div>'}
          <button onclick="bcAddMonth('${demandId}')" style="background:var(--bg-secondary);border:1px dashed var(--border-color);color:var(--text-primary);padding:0.6rem 1rem;border-radius:4px;cursor:pointer;width:100%;font-weight:600;">+ Add Month</button>
        </div>
        <div style="display:flex;gap:1rem;justify-content:flex-end;">
          ${actuals.length > 0 ? `<button onclick="window.bcBurnEditMode=false;bcLoadTab('burn','${demandId}')" style="background:transparent;border:1px solid var(--border-color);color:var(--text-primary);padding:0.5rem 1rem;border-radius:4px;cursor:pointer;">Cancel</button>` : ''}
          <button onclick="bcSaveActuals('${demandId}')" style="background:var(--color-brand);color:#fff;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;font-weight:600;">Save Actuals</button>
        </div>
      </div>
    `;
    return;
  }

  // ── VIEW MODE ─────────────────────────────────────────────────────────────
  const all      = [...actuals, ...forecast];
  const maxAmt   = all.length ? Math.max(...all.map(a => a.amount)) : 1;
  const varPct   = data.variance_pct ?? 0;
  const varColor = varPct > 0 ? '#ef4444' : '#10b981';
  const committed = data.committed;

  const barChart = all.map(a => {
    const pct = Math.round((a.amount / maxAmt) * 100);
    const isActual = a.category !== 'projected';
    return `
      <div style="display:flex;align-items:flex-end;flex-direction:column;gap:0.2rem;flex:1;min-width:52px;">
        <div style="font-size:0.7rem;color:var(--text-muted);">$${(a.amount/1000).toFixed(1)}k</div>
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
          ['Total Actuals', '$' + actuals.reduce((s,a)=>s+a.amount,0).toLocaleString(undefined,{maximumFractionDigits:0}), 'var(--text-primary)'],
          ['Variance vs Plan', (varPct > 0 ? '+' : '') + varPct + '%', varColor],
          ['Status', committed ? '✅ Committed' : '⏳ Draft', committed ? '#10b981' : 'var(--color-status-amber-text)']
        ].map(([lbl,val,col])=>`
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

window.bcEditActuals = async function(demandId) {
  try {
    const res = await fetch(`${BC_API}/burn/${demandId}`);
    if (res.ok) {
      const data = await res.json();
      window.bcBurnEditData = [...(data.actuals || [])];
    }
  } catch(e) { window.bcBurnEditData = []; }
  window.bcBurnEditMode = true;
  bcLoadTab('burn', demandId);
};

window.bcAddMonth = function(demandId) {
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

window.bcRemoveMonth = function(idx, demandId) {
  window.bcBurnEditData.splice(idx, 1);
  bcRenderBurn(demandId, document.getElementById('bc-tab-content'));
};

window.bcAdjustAmount = function(idx, delta, demandId) {
  window.bcBurnEditData[idx].amount = Math.max(0, window.bcBurnEditData[idx].amount + delta);
  bcRenderBurn(demandId, document.getElementById('bc-tab-content'));
};

window.bcSaveActuals = async function(demandId) {
  try {
    await fetch(`${BC_API}/burn/actuals`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ demand_id: demandId, actuals: window.bcBurnEditData })
    });
    window.bcBurnEditMode = false;
    await bcLoadTab('burn', demandId);
  } catch(e) { console.error(e); }
};

window.bcRunForecast = async function(demandId) {
  const btn = document.getElementById('bc-forecast-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  try {
    await fetch(`${BC_API}/burn/forecast`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ demand_id: demandId })
    });
    await bcLoadTab('burn', demandId);
  } catch(e) { console.error(e); }
};

window.bcCommitForecast = async function(demandId) {
  try {
    await fetch(`${BC_API}/burn/commit`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ demand_id: demandId })
    });
    await bcLoadTab('burn', demandId);
  } catch(e) { console.error(e); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Invoice & PO Match
// ═══════════════════════════════════════════════════════════════════════════════
async function bcRenderInvoice(demandId, content) {
  let invoices = [];
  try {
    const res = await fetch(`${BC_API}/invoices/${demandId}`);
    if (res.ok) invoices = await res.json();
  } catch(e) {}

  const statusBadge = (status) => {
    const map = {
      matched:     ['#10b981','rgba(16,185,129,0.1)','Matched'],
      discrepancy: ['#f59e0b','rgba(245,158,11,0.1)','⚠ Discrepancy'],
      approved:    ['#6366f1','rgba(99,102,241,0.1)','Approved'],
      disputed:    ['#ef4444','rgba(239,68,68,0.1)','Disputed'],
      pending:     ['#94a3b8','rgba(148,163,184,0.1)','Pending'],
    };
    const [color, bg, label] = map[status] || map.pending;
    return `<span style="font-size:0.73rem;font-weight:700;padding:3px 9px;border-radius:12px;background:${bg};color:${color};">${label}</span>`;
  };

  const rows = invoices.map(inv => `
    <tr style="border-bottom:1px solid var(--border-color);">
      <td style="padding:0.75rem 0.5rem;font-family:monospace;font-size:0.8rem;color:var(--color-brand);">${inv.invoice_id}</td>
      <td style="padding:0.75rem 0.5rem;font-size:0.85rem;color:var(--text-primary);font-weight:600;">$${inv.invoice_amount.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td style="padding:0.75rem 0.5rem;font-size:0.8rem;color:var(--text-secondary);">${inv.po_reference}</td>
      <td style="padding:0.75rem 0.5rem;font-size:0.8rem;color:var(--text-secondary);">${inv.sow_reference || '—'}</td>
      <td style="padding:0.75rem 0.5rem;">${statusBadge(inv.match_status)}</td>
      <td style="padding:0.75rem 0.5rem;">
        ${inv.match_status === 'discrepancy'
          ? `<div style="display:flex;gap:0.5rem;">
               <button onclick="bcApproveInvoice('${demandId}','${inv.invoice_id}','approve')"
                style="font-size:0.75rem;padding:3px 9px;border-radius:4px;border:none;cursor:pointer;background:rgba(16,185,129,0.15);color:#10b981;font-weight:600;">Approve</button>
               <button onclick="bcApproveInvoice('${demandId}','${inv.invoice_id}','dispute')"
                style="font-size:0.75rem;padding:3px 9px;border-radius:4px;border:none;cursor:pointer;background:rgba(239,68,68,0.12);color:#ef4444;font-weight:600;">Dispute</button>
             </div>`
          : inv.decision ? `<span style="font-size:0.75rem;color:var(--text-muted);">${inv.decision}</span>` : '—'}
      </td>
    </tr>
    ${(inv.discrepancies||[]).length > 0 ? `
    <tr>
      <td colspan="6" style="padding:0 0.5rem 0.75rem 0.5rem;">
        <div style="background:rgba(245,158,11,0.07);border-left:3px solid #f59e0b;padding:0.6rem 0.85rem;border-radius:0 4px 4px 0;font-size:0.8rem;color:var(--text-secondary);">
          ${inv.discrepancies.map(d=>`⚠ <b>${d.item}</b>: ${d.detail}`).join('<br>')}
          ${inv.ai_analysis ? `<div style="margin-top:0.5rem;color:var(--text-muted);font-size:0.78rem;">AI: ${inv.ai_analysis.substring(0,200)}${inv.ai_analysis.length>200?'…':''}</div>` : ''}
        </div>
      </td>
    </tr>` : ''}`).join('');

  const total = invoices.reduce((s,i)=>s+i.invoice_amount,0);
  const flagged = invoices.filter(i=>i.match_status==='discrepancy').length;

  content.innerHTML = `
    <div style="max-width:1000px;display:flex;flex-direction:column;gap:1.5rem;">
      <!-- Summary KPIs -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
        ${[
          ['Total Invoiced', '$'+total.toLocaleString(undefined,{maximumFractionDigits:0}), 'var(--text-primary)'],
          ['Flagged', flagged + ' invoice' + (flagged!==1?'s':''), flagged>0?'#f59e0b':'#10b981'],
          ['Matched', (invoices.length - flagged) + ' / ' + invoices.length, 'var(--text-primary)']
        ].map(([l,v,c])=>`
          <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1rem;text-align:center;">
            <div style="font-size:0.73rem;color:var(--text-muted);text-transform:uppercase;">${l}</div>
            <div style="font-size:1.5rem;font-weight:700;color:${c};margin-top:0.3rem;">${v}</div>
          </div>`).join('')}
      </div>

      <!-- Invoice table -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden;">
        <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:1rem;">Invoice Register</h3>
          <span style="font-size:0.73rem;background:rgba(99,102,241,0.12);color:#6366f1;padding:2px 8px;border-radius:4px;">Human Approves Disputes</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-primary);">
              ${['Invoice ID','Amount','PO Ref','SOW Ref','Status','Action'].map(h=>`<th style="padding:0.6rem 0.5rem;text-align:left;font-size:0.73rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" style="padding:2rem;text-align:center;color:var(--text-muted);">No invoices found</td></tr>'}</tbody>
        </table>
      </div>

      <!-- Monthly Project Billing Invoices (Generated from Plan) -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1.5rem;">
        <h3 style="margin: 0 0 1rem 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <span>Monthly Billing Invoices (From Schedule Plan)</span>
          <button onclick="window.generateInvoices('${demandId}')" class="btn-primary" style="padding: 0.4rem 0.85rem; font-size: 0.78rem; background: linear-gradient(135deg, var(--color-brand), #4f46e5); color: #fff; border: none; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600;">
            Generate Monthly Invoices
          </button>
        </h3>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Generate monthly billing invoices based on active tasks and scheduled timelines (start to end date) for this project.
        </p>
        
        <div>
          ${(() => {
            const billingInvoices = window.currentInvoicesList || [];
            if (billingInvoices.length > 0) {
              return `
                <div style="overflow-x: auto;">
                  <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
                    <thead>
                      <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 600; background: var(--bg-primary);">
                        <th style="padding: 0.6rem 0.5rem; font-size: 0.73rem; text-transform: uppercase;">Invoice ID</th>
                        <th style="padding: 0.6rem 0.5rem; font-size: 0.73rem; text-transform: uppercase;">Month</th>
                        <th style="padding: 0.6rem 0.5rem; font-size: 0.73rem; text-transform: uppercase;">Billing Period</th>
                        <th style="padding: 0.6rem 0.5rem; font-size: 0.73rem; text-transform: uppercase; text-align: right;">Amount</th>
                        <th style="padding: 0.6rem 0.5rem; font-size: 0.73rem; text-transform: uppercase; text-align: center;">Status</th>
                        <th style="padding: 0.6rem 0.5rem; font-size: 0.73rem; text-transform: uppercase; text-align: center;">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${billingInvoices.map(inv => {
                        const detailsList = inv.details || [];
                        const detailsStr = detailsList.map(d => `${d.item}: $${d.amount.toLocaleString()}`).join('\\n');
                        return `
                          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-primary);">
                            <td style="padding: 0.75rem 0.5rem; font-family: monospace; font-weight: 700; color: var(--color-brand);">${inv.invoice_id}</td>
                            <td style="padding: 0.75rem 0.5rem; font-weight: 600;">${inv.month}</td>
                            <td style="padding: 0.75rem 0.5rem; color: var(--text-secondary);">${inv.billing_start} to ${inv.billing_end}</td>
                            <td style="padding: 0.75rem 0.5rem; text-align: right; font-weight: 700; color: var(--text-primary);">$${inv.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td style="padding: 0.75rem 0.5rem; text-align: center;">
                              <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${inv.status}</span>
                            </td>
                            <td style="padding: 0.75rem 0.5rem; text-align: center;">
                              <button onclick="alert('Invoice Line Items:\\n\\n${detailsStr}')" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">
                                View
                              </button>
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            } else {
              return `
                <div style="padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 0.8rem;">
                  No monthly billing invoices generated yet. Click 'Generate Monthly Invoices' above to create them.
                </div>
              `;
            }
          })()}
        </div>
      </div>
    </div>`;
}

window.bcApproveInvoice = async function(demandId, invoiceId, decision) {
  try {
    await fetch(`${BC_API}/invoices/approve`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ demand_id: demandId, invoice_id: invoiceId, decision })
    });
    await bcLoadTab('invoice', demandId);
  } catch(e) { console.error(e); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Capex / Opex
// ═══════════════════════════════════════════════════════════════════════════════
async function bcRenderCapex(demandId, content) {
  let items = [];
  try {
    const res = await fetch(`${BC_API}/capex-opex/${demandId}`);
    if (res.ok) items = await res.json();
  } catch(e) {}

  const capexTotal = items.filter(i=>i.classification==='capex').reduce((s,i)=>s+i.amount,0);
  const opexTotal  = items.filter(i=>i.classification==='opex').reduce((s,i)=>s+i.amount,0);
  const total      = capexTotal + opexTotal;
  const capexPct   = total ? Math.round(capexTotal/total*100) : 0;
  const allSigned  = items.length > 0 && items.every(i=>i.signed_off);

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
          ${item.signed_off ? '✅' : '<span style="color:var(--text-muted);">—</span>'}
        </td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <div style="max-width:1000px;display:flex;flex-direction:column;gap:1.5rem;">
      <!-- KPIs + donut-style split -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:1rem;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
          ${[
            ['Total Spend', '$'+total.toLocaleString(), 'var(--text-primary)'],
            ['CAPEX', '$'+capexTotal.toLocaleString() + ' (' + capexPct + '%)', '#6366f1'],
            ['OPEX',  '$'+opexTotal.toLocaleString()  + ' (' + (100-capexPct) + '%)', '#10b981'],
          ].map(([l,v,c])=>`
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
            <span style="color:#10b981;">${100-capexPct}% Opex 💸</span>
          </div>
        </div>
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
                  Finance Sign-Off
                </button>`}
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-primary);">
              ${['Description','Amount','Vendor','Phase','Classification','Policy Evidence','Sign-Off'].map(h=>`<th style="padding:0.6rem 0.5rem;text-align:left;font-size:0.73rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-muted);">No items found</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

window.bcSignOff = async function(demandId) {
  try {
    await fetch(`${BC_API}/capex-opex/sign-off`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ demand_id: demandId, approved_by: 'Finance' })
    });
    await bcLoadTab('capex', demandId);
  } catch(e) { console.error(e); }
};

window.generateInvoices = async function(demandId) {
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
  } catch(e) {
    console.error(e);
    alert("Connection error: " + e.message);
  }
};
