import React, { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { budgetService } from '../services/budgetService';
import { demandService } from '../services/demandService';

export default function BudgetCost() {
  const { showLoader, hideLoader, showToast } = useUI();

  // Core project listings and selection
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);

  // Active sub tab inside panel
  const [bcActiveTab, setBcActiveTab] = useState('burn'); // 'burn' | 'invoice' | 'capex'

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Loaded Details state
  const [burnData, setBurnData] = useState({ actuals: [], forecast: [], narrative: '' });
  const [invoices, setInvoices] = useState([]);
  const [capexOpexItems, setCapexOpexItems] = useState([]);
  
  // Edit mode for actuals
  const [editMode, setEditMode] = useState(false);
  const [editActuals, setEditActuals] = useState([]);

  // Preview Invoice modal
  const [previewInvoice, setPreviewInvoice] = useState(null);

  const loadData = async () => {
    try {
      const dList = await demandService.getDemands().catch(() => []);
      setDemands(dList || []);

      const pendingDemandId = sessionStorage.getItem('selectedDemandId');
      if (pendingDemandId) {
        setSelectedDemandId(pendingDemandId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadBudgetDetails = async (id) => {
    if (!id) return;
    showLoader('Analyzing project ledger & allocations...');
    try {
      const burn = await budgetService.getBurn(id).catch(() => ({ actuals: [], forecast: [], narrative: '' }));
      const invs = await budgetService.getInvoices(id).catch(() => []);
      const capexItems = await budgetService.getCapexOpex(id).catch(() => []);

      setBurnData(burn || { actuals: [], forecast: [], narrative: '' });
      setInvoices(invs || []);
      setCapexOpexItems(capexItems || []);

      setEditActuals(JSON.parse(JSON.stringify(burn?.actuals || [])));
      setEditMode(false);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadBudgetDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    setSelectedDemandId(id);
    sessionStorage.setItem('selectedDemandId', id);
  };

  // AI Financial Forecast Engine trigger
  const handleGenerateInsights = async () => {
    if (!selectedDemandId) return;
    showLoader('Running AI Cost Allocator & forecaster...');
    try {
      await budgetService.generateInsights(selectedDemandId);
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ AI budget forecast constructed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Burn actuals edit actions
  const handleAddActualsPeriod = () => {
    const nextDate = new Date();
    const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setEditActuals([...editActuals, { date: dateStr, amount: 10000, category: 'actual' }]);
  };

  const handleRemoveActualsPeriod = (index) => {
    const copy = [...editActuals];
    copy.splice(index, 1);
    setEditActuals(copy);
  };

  const handleSaveActuals = async () => {
    if (!selectedDemandId) return;
    showLoader('Applying adjustments...');
    try {
      await budgetService.updateBurnActuals({
        demand_id: selectedDemandId,
        actuals: editActuals
      });
      await loadBudgetDetails(selectedDemandId);
      setEditMode(false);
      showToast('✓ Spend entries saved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Run AI forecast narrative
  const handleRunForecast = async () => {
    if (!selectedDemandId) return;
    showLoader('Constructing AI forecasting projections...');
    try {
      await budgetService.updateBurnForecast({ demand_id: selectedDemandId });
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ AI forecasting analysis finished');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Commit forecast
  const handleCommitForecast = async () => {
    if (!selectedDemandId) return;
    showLoader('Committing forecast numbers...');
    try {
      await budgetService.updateBurnCommit({ demand_id: selectedDemandId });
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ Forecast committed to baseline');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Approve / Dispute invoices
  const handleApproveInvoice = async (invoiceId, decision) => {
    showLoader('Submitting verification...');
    try {
      await budgetService.approveInvoice({
        demand_id: selectedDemandId,
        invoice_id: invoiceId,
        decision
      });
      await loadBudgetDetails(selectedDemandId);
      showToast(`✓ Invoice set to ${decision}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Final Approve Invoices
  const handleFinalApproveInvoices = async () => {
    showLoader('Applying final approvals...');
    try {
      await budgetService.finalApproveInvoice({ demand_id: selectedDemandId });
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ All invoices finalized & posted to burn rates');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Capex signoff item
  const handleSignOffCapexItem = async (itemId) => {
    showLoader('Signing-off allocation...');
    try {
      await budgetService.signOffCapexOpexItem({
        item_id: itemId,
        approved_by: 'Finance Controller'
      });
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ Asset class signed off');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Signoff all Capex
  const handleSignOffAllCapex = async () => {
    showLoader('Signing-off all assets classification...');
    try {
      await budgetService.signOffCapexOpex({
        demand_id: selectedDemandId,
        approved_by: 'Finance Controller'
      });
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ All allocations signed off');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Generate mock invoices
  const handleGenerateInvoices = async () => {
    showLoader('Generating SOW mock invoices...');
    try {
      await budgetService.generateProjectInvoices(selectedDemandId, {});
      await loadBudgetDetails(selectedDemandId);
      showToast('✓ Mock invoices generated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const totalActuals = burnData?.actuals?.reduce((sum, a) => sum + (a.amount || 0), 0) || 0;
  const capexTotal = capexOpexItems.filter(i => i.classification === 'capex').reduce((s, i) => s + i.amount, 0);
  const opexTotal = capexOpexItems.filter(i => i.classification === 'opex').reduce((s, i) => s + i.amount, 0);
  const totalCapexOpex = capexTotal + opexTotal;
  const capexPct = totalCapexOpex ? Math.round(capexTotal / totalCapexOpex * 100) : 0;
  const allSigned = capexOpexItems.length > 0 && capexOpexItems.every(i => i.signed_off);

  const matchedCount = invoices.filter(i => i.match_status === 'matched' || i.decision === 'approve').length;
  const allApproved = invoices.length > 0 && matchedCount === invoices.length;

  return (
    <div className="intake-screen">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="sidebar-search" style={{ padding: '1rem' }}>
          <input
            type="text"
            placeholder="Search project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
          />
        </div>
        <ul className="demand-list">
          {filteredDemands.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No projects found.
            </li>
          ) : (
            filteredDemands.map((d) => {
              const active = d.demand_id === selectedDemandId;
              return (
                <li
                  key={d.demand_id}
                  className={`demand-item ${active ? 'active' : ''}`}
                  onClick={() => handleSelectDemand(d.demand_id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{d.demand_id}</span>
                  </div>
                  <h4 className="demand-item-title">{d.title}</h4>
                  <div className="demand-item-meta">
                    <span>Status: {d.status}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main Details Workspace */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Budget &amp; Cost Intelligence</h2>
            {selectedDemandId && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Ledger tracking for Project <strong>{selectedDemandId}</strong>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {selectedDemandId && (
              <button onClick={handleGenerateInsights} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                🤖 Run AI Ledger Engine
              </button>
            )}
            <select
              value={selectedDemandId || ''}
              onChange={(e) => handleSelectDemand(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minWidth: '280px', cursor: 'pointer' }}
            >
              <option value="">Select a Project...</option>
              {demands.map((d) => (
                <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedDemandId ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a project from the left sidebar to load financial ledgers.
            </div>
          ) : (
            <div>
              {/* Tab headers */}
              <div className="tq-tab-header" style={{ flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button className={`tq-tab-btn ${bcActiveTab === 'burn' ? 'active' : ''}`} onClick={() => setBcActiveTab('burn')}>Burn Rate &amp; Forecasts</button>
                <button className={`tq-tab-btn ${bcActiveTab === 'invoice' ? 'active' : ''}`} onClick={() => setBcActiveTab('invoice')}>Invoice Verification</button>
                <button className={`tq-tab-btn ${bcActiveTab === 'capex' ? 'active' : ''}`} onClick={() => setBcActiveTab('capex')}>CapEx / OpEx Allocations</button>
              </div>

              {/* BURN RATE & FORECASTS TAB */}
              {bcActiveTab === 'burn' && (
                <div>
                  {editMode ? (
                    /* Edit mode Actuals spend */
                    <div style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ margin: 0 }}>Adjust Actuals Ledger</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Modify spend items to update AI forecast narrative.</p>
                        </div>
                        <button onClick={handleAddActualsPeriod} className="btn-secondary" style={{ fontSize: '0.8rem' }}>＋ Add Period</button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {editActuals.map((act, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '1rem', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', alignItems: 'center' }}>
                            <div className="tq-form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.65rem' }}>Period</label>
                              <input type="month" value={act.date} onChange={(e) => {
                                const copy = [...editActuals];
                                copy[idx].date = e.target.value;
                                setEditActuals(copy);
                              }} />
                            </div>
                            <div className="tq-form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.65rem' }}>Monthly Spend ($)</label>
                              <input type="number" value={act.amount} onChange={(e) => {
                                const copy = [...editActuals];
                                copy[idx].amount = parseFloat(e.target.value) || 0;
                                setEditActuals(copy);
                              }} />
                            </div>
                            <button onClick={() => handleRemoveActualsPeriod(idx)} className="btn-secondary" style={{ color: '#ef4444', borderColor: '#ef4444', marginLeft: 'auto', padding: '0.35rem 0.65rem' }}>Delete</button>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button onClick={() => setEditMode(false)} className="btn-secondary">Cancel</button>
                        <button onClick={handleSaveActuals} className="btn-primary">💾 Save &amp; Update Forecast</button>
                      </div>
                    </div>
                  ) : (
                    /* Read Mode overview */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        <div className="tq-card">
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Actual Spent</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                            ${totalActuals.toLocaleString()}
                          </div>
                        </div>
                        <div className="tq-card">
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining Forecast</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-brand)', marginTop: '0.2rem' }}>
                            ${(burnData?.forecast?.reduce((sum, f) => sum + (f.amount || 0), 0) || 0).toLocaleString()}
                          </div>
                        </div>
                        <div className="tq-card">
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Committed spend</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4ade80', marginTop: '0.2rem' }}>
                            ${(burnData?.committed_amount || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '1.5rem' }}>
                        {/* Historical table list */}
                        <div className="tq-card">
                          <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h4 style={{ margin: 0 }}>Financial Spend Ledger</h4>
                            <button onClick={() => setEditMode(true)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                              ✍️ Adjust Spend Items
                            </button>
                          </div>

                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '0.5rem' }}>Period</th>
                                <th style={{ padding: '0.5rem' }}>Category</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Spend Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...(burnData?.actuals || []), ...(burnData?.forecast || [])].map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{item.date}</td>
                                  <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>{item.category || 'forecast'}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>${item.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Forecast narrative analysis */}
                        <div className="tq-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <h4 style={{ margin: 0 }}>AI Forecast Insights</h4>
                          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '4px', borderLeft: '3px solid var(--color-brand)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                            {burnData?.narrative || 'No narrative generated yet. Run SOW forecast scanner.'}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handleRunForecast} className="btn-primary" style={{ flex: 1, fontSize: '0.8rem' }}>
                              🤖 Generate AI Forecast
                            </button>
                            {burnData?.narrative && (
                              <button onClick={handleCommitForecast} className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }}>
                                Commit Forecast
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* INVOICE VERIFICATION TAB */}
              {bcActiveTab === 'invoice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div className="tq-card">
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Invoiced</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                        ${invoices.reduce((s, i) => s + i.invoice_amount, 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="tq-card">
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Discrepancies / Disputed</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
                        {invoices.filter(i => i.match_status === 'discrepancy' || i.match_status === 'disputed').length}
                      </div>
                    </div>
                    <div className="tq-card">
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verification Status</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: allApproved ? '#10b981' : '#f59e0b' }}>
                        {matchedCount} / {invoices.length} Approved
                      </div>
                    </div>
                  </div>

                  <div className="tq-card">
                    <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0 }}>Invoice Register</h4>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleGenerateInvoices} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                          ＋ Generate Sample Invoices
                        </button>
                        {allApproved ? (
                          <button onClick={handleFinalApproveInvoices} className="btn-primary" style={{ fontSize: '0.8rem' }}>
                            ✓ Final Approve &amp; Post Invoices
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: '4px' }}>
                            ⏳ Pending approvals before posting
                          </span>
                        )}
                      </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '0.5rem' }}>Invoice ID</th>
                          <th style={{ padding: '0.5rem' }}>Amount</th>
                          <th style={{ padding: '0.5rem' }}>PO Ref</th>
                          <th style={{ padding: '0.5rem' }}>SOW Ref</th>
                          <th style={{ padding: '0.5rem' }}>Match Status</th>
                          <th style={{ padding: '0.5rem' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.length === 0 ? (
                          <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No invoice logs.</td></tr>
                        ) : (
                          invoices.map((inv) => (
                            <React.Fragment key={inv.invoice_id}>
                              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{inv.invoice_id}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 600 }}>${inv.invoice_amount.toLocaleString()}</td>
                                <td style={{ padding: '0.5rem' }}>{inv.po_reference}</td>
                                <td style={{ padding: '0.5rem' }}>{inv.sow_reference || '—'}</td>
                                <td style={{ padding: '0.5rem', textTransform: 'uppercase', fontWeight: 700 }}>{inv.match_status}</td>
                                <td style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                                  <button onClick={() => setPreviewInvoice(inv)} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Preview</button>
                                  {inv.match_status === 'discrepancy' && (
                                    <>
                                      <button onClick={() => handleApproveInvoice(inv.invoice_id, 'approve')} className="btn-primary" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Approve</button>
                                      <button onClick={() => handleApproveInvoice(inv.invoice_id, 'dispute')} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#ef4444', borderColor: '#ef4444' }}>Dispute</button>
                                    </>
                                  )}
                                </td>
                              </tr>
                              {inv.discrepancies && inv.discrepancies.length > 0 && inv.match_status === 'discrepancy' && (
                                <tr>
                                  <td colSpan="6" style={{ padding: '0.25rem 0.5rem 0.75rem 0.5rem' }}>
                                    <div style={{ background: 'rgba(245,158,11,0.07)', borderLeft: '3px solid #f59e0b', padding: '0.5rem', borderRadius: '4px', fontSize: '0.78rem' }}>
                                      {inv.discrepancies.map((d, dIdx) => <div key={dIdx}>⚠️ <strong>{d.item}</strong>: {d.detail}</div>)}
                                      {inv.ai_analysis && <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}>AI Evaluation: {inv.ai_analysis}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CAPEX OPEX ALLOCATIONS TAB */}
              {bcActiveTab === 'capex' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Spend</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>${totalCapexOpex.toLocaleString()}</div>
                      </div>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CAPEX</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6366f1' }}>${capexTotal.toLocaleString()} ({capexPct}%)</div>
                      </div>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>OPEX</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>${opexTotal.toLocaleString()} ({100 - capexPct}%)</div>
                      </div>
                    </div>

                    <div className="tq-card" style={{ display: 'flex', flexDirection: 'column', justifyValue: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CAPEX / OPEX Split ratio</div>
                      <div style={{ width: '100%', height: '14px', background: 'rgba(16,185,129,0.2)', borderRadius: '7px', overflow: 'hidden' }}>
                        <div style={{ width: `${capexPct}%`, height: '100%', background: '#6366f1', borderRadius: '7px' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="tq-card">
                    <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0 }}>Spend Classification Matrix</h4>
                      <div>
                        {allSigned ? (
                          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>✅ Finance Sign-off Complete</span>
                        ) : (
                          <button onClick={handleSignOffAllCapex} className="btn-primary" style={{ fontSize: '0.8rem' }}>
                            Sign Off All Items
                          </button>
                        )}
                      </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '0.5rem' }}>Description</th>
                          <th style={{ padding: '0.5rem' }}>Amount</th>
                          <th style={{ padding: '0.5rem' }}>Vendor</th>
                          <th style={{ padding: '0.5rem' }}>Phase</th>
                          <th style={{ padding: '0.5rem' }}>Classification</th>
                          <th style={{ padding: '0.5rem' }}>Evidence / Rule</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>Sign-Off</th>
                        </tr>
                      </thead>
                      <tbody>
                        {capexOpexItems.length === 0 ? (
                          <tr><td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No classified spend entries.</td></tr>
                        ) : (
                          capexOpexItems.map((item) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem' }}>{item.description}</td>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>${item.amount.toLocaleString()}</td>
                              <td style={{ padding: '0.5rem' }}>{item.vendor || '—'}</td>
                              <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>{item.project_phase || '—'}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <span style={{ fontSize: '0.73rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: item.classification === 'capex' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)', color: item.classification === 'capex' ? '#6366f1' : '#10b981' }}>
                                  {item.classification.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{item.policy_evidence}</td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                {item.signed_off ? (
                                  <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Signed</span>
                                ) : (
                                  <button onClick={() => handleSignOffCapexItem(item.id)} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>Sign Off</button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </main>

      {/* Invoice Preview modal */}
      {previewInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '2rem', minWidth: '450px', maxWidth: '600px' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Invoice Preview: {previewInvoice.invoice_id}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
              <div><strong>Billing Amount:</strong> ${previewInvoice.invoice_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div><strong>Purchase Order (PO):</strong> {previewInvoice.po_reference}</div>
              <div><strong>Statement of Work (SOW):</strong> {previewInvoice.sow_reference || '—'}</div>
              <div><strong>Classification status:</strong> {previewInvoice.match_status.toUpperCase()}</div>
              {previewInvoice.ai_analysis && (
                <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '4px', borderLeft: '3px solid var(--color-brand)', marginTop: '0.5rem' }}>
                  <strong>AI Match Reasoning:</strong> {previewInvoice.ai_analysis}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setPreviewInvoice(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
