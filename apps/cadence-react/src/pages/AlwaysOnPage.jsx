import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getDemands } from '../api/demandsApi';
import {
  getRiskIssues,
  createRiskIssue,
  deleteRiskIssue,
  getBudgetCost,
  saveBudgetCost,
  getVendorCoordination,
  saveVendorCoordination,
  getReportingCommunication,
  saveReportingCommunication,
  getKnowledgeArtifacts,
  saveKnowledgeArtifact
} from '../api/alwaysOnApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function AlwaysOnPage({ activeTab }) {
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm } = useConfirmDialog();

  const [demands, setDemands] = useState([]);
  const [selectedDemandKey, setSelectedDemandKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sub-module specific states
  const [riskData, setRiskData] = useState([]);
  const [budgetData, setBudgetData] = useState(null);
  const [vendorData, setVendorData] = useState([]);
  const [reportingData, setReportingData] = useState([]);
  const [knowledgeData, setKnowledgeData] = useState([]);

  // Form states for creating sub-records
  const [newRiskTitle, setNewRiskTitle] = useState('');
  const [newRiskProb, setNewRiskProb] = useState(3);
  const [newRiskImpact, setNewRiskImpact] = useState(3);

  // Budget sub-tabs
  const [budgetActiveTab, setBudgetActiveTab] = useState('invoice'); // 'invoice' | 'capex' | 'burn' | 'narrative'

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dList = await getDemands();
      setDemands(dList || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId') || (dList && dList[0]?.demand_id);
      if (activeDemandId) {
        setSelectedDemandKey(activeDemandId);
        await loadActiveTabDetails(activeDemandId, activeTab);
      }
    } catch (err) {
      setError(err.message || 'Failed to load AlwaysOn data.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const loadActiveTabDetails = async (demandId, tab) => {
    try {
      if (tab === 'risk-issues') {
        const data = await getRiskIssues(demandId);
        setRiskData(data || []);
      } else if (tab === 'budget-cost') {
        const data = await getBudgetCost(demandId);
        setBudgetData(data);
      } else if (tab === 'vendor-coordination') {
        const data = await getVendorCoordination(demandId);
        setVendorData(data || []);
      } else if (tab === 'reporting-communication') {
        const data = await getReportingCommunication(demandId);
        setReportingData(data || []);
      } else if (tab === 'knowledge-artifacts') {
        const data = await getKnowledgeArtifacts(demandId);
        setKnowledgeData(data || []);
      }
    } catch (e) {
      console.error(`Failed to load ${tab} data:`, e);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Risk & Issues Actions ---
  const handleAddRisk = async () => {
    if (!newRiskTitle) return;
    setActionLoading(true);
    try {
      await createRiskIssue(selectedDemandKey, {
        title: newRiskTitle,
        probability: newRiskProb,
        impact: newRiskImpact,
        status: 'identified'
      });
      addToast('Risk item logged.', 'success');
      setNewRiskTitle('');
      loadActiveTabDetails(selectedDemandKey, 'risk-issues');
    } catch (e) {
      addToast('Failed to add risk.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // --- Budget Actions ---
  const handleGenerateBudgetInsights = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/budget-cost/insights/generate/${selectedDemandKey}`, { method: 'POST' });
      if (!res.ok) throw new Error('Insights generation failed.');
      addToast('Financial insights and burn rate generated.', 'success');
      loadActiveTabDetails(selectedDemandKey, 'budget-cost');
    } catch (err) {
      addToast(err.message || 'Failed to generate insights.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveInvoice = async (invoiceId, status) => {
    try {
      const res = await fetch(`/api/budget-cost/invoice/${invoiceId}/approve?status=${status}`, { method: 'POST' });
      if (!res.ok) throw new Error('Invoice status update failed.');
      addToast(`Invoice marked as ${status}.`, 'success');
      loadActiveTabDetails(selectedDemandKey, 'budget-cost');
    } catch (err) {
      addToast(err.message || 'Failed to update invoice.', 'error');
    }
  };

  return (
    <div className="intake-screen">
      <ProjectSidebar
        items={demands}
        selectedId={selectedDemandKey}
        onSelect={(id) => {
          setSelectedDemandKey(id);
          selectDemand(id);
          loadActiveTabDetails(id, activeTab);
        }}
        idKey="demand_id"
        titleKey="title"
        subtitleKey={(item) => `Status: ${item.status}`}
        statusKey="status"
        loading={loading}
        error={error}
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', textTransform: 'capitalize' }}>
            {activeTab.replace('-', ' & ')}
          </h2>
          <div>
            <ProjectDropdown
              demands={demands}
              selectedId={selectedDemandKey}
              onChange={(val) => {
                setSelectedDemandKey(val);
                selectDemand(val);
                loadActiveTabDetails(val, activeTab);
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {activeTab === 'risk-issues' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Project Risk Register</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Risk Name / Blocker Description</label>
                  <input type="text" value={newRiskTitle} onChange={(e) => setNewRiskTitle(e.target.value)} placeholder="e.g. Database API timeout" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Probability (1-5)</label>
                  <input type="number" min="1" max="5" value={newRiskProb} onChange={(e) => setNewRiskProb(parseInt(e.target.value))} style={{ width: 80 }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Impact (1-5)</label>
                  <input type="number" min="1" max="5" value={newRiskImpact} onChange={(e) => setNewRiskImpact(parseInt(e.target.value))} style={{ width: 80 }} />
                </div>
                <button type="button" className="btn-primary" onClick={handleAddRisk} disabled={actionLoading} style={{ height: 'fit-content' }}>
                  Log Risk
                </button>
              </div>

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Risk Title</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Probability</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Impact</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Risk Score</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {riskData.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '1.5rem', textCenter: 'center', color: 'var(--text-secondary)' }}>No risk items recorded yet.</td></tr>
                  ) : riskData.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>{item.title}</td>
                      <td style={{ padding: '0.5rem' }}>{item.probability}</td>
                      <td style={{ padding: '0.5rem' }}>{item.impact}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{item.probability * item.impact}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span className={`badge ${item.probability * item.impact >= 12 ? 'red' : 'gray'}`}>{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'budget-cost' && (
            <div>
              {budgetData === null ? (
                <div className="panel-card" style={{ textAlign: 'center', maxWidth: 500, margin: '2rem auto' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>💰</div>
                  <h3>Generate Financial Insights</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    Run the AI financial variance auditor to generate sample invoices, PO matching, and CapEx/OpEx accounting schedules.
                  </p>
                  <button type="button" className="btn-primary" onClick={handleGenerateBudgetInsights} disabled={actionLoading}>
                    {actionLoading ? <Spinner size="sm" /> : 'Generate Financials (AI)'}
                  </button>
                </div>
              ) : (
                <div className="panel-card">
                  <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
                    <button className={`tab-btn${budgetActiveTab === 'invoice' ? ' active' : ''}`} onClick={() => setBudgetActiveTab('invoice')}>Invoices Audit</button>
                    <button className={`tab-btn${budgetActiveTab === 'capex' ? ' active' : ''}`} onClick={() => setBudgetActiveTab('capex')}>CapEx / OpEx</button>
                    <button className={`tab-btn${budgetActiveTab === 'burn' ? ' active' : ''}`} onClick={() => setBudgetActiveTab('burn')}>Burn Rate</button>
                  </div>

                  {budgetActiveTab === 'invoice' && (
                    <div>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Invoice Auditing &amp; PO Matching</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {(budgetData.invoices || []).map((inv, idx) => (
                          <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                              <span style={{ fontWeight: 'bold' }}>Invoice Ref: {inv.invoice_ref}</span>
                              <span className={`badge ${inv.matching_status === 'matched' ? 'green' : 'red'}`}>{inv.matching_status}</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                              Vendor: <b>{inv.vendor_name}</b> | Amount: <b>${inv.amount?.toLocaleString()}</b>
                            </div>
                            {inv.discrepancy_explanation && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-status-red-text)', margin: '0.5rem 0' }}>
                                <b>Discrepancy:</b> {inv.discrepancy_explanation}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                              <button type="button" className="btn-primary" onClick={() => handleApproveInvoice(inv.invoice_ref, 'approved')} style={{ background: 'var(--color-status-green-border)', border: 'none', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                Approve
                              </button>
                              <button type="button" className="btn-secondary" onClick={() => handleApproveInvoice(inv.invoice_ref, 'disputed')} style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                Dispute
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {budgetActiveTab === 'capex' && (
                    <div>
                      <h4 style={{ margin: '0 0 1rem 0' }}>IAS 38 CapEx vs. OpEx Classifications</h4>
                      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item Description</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Accounting Classification</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem' }}>IAS 38 Policy Evidence Rationale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(budgetData.capex_classifications || []).map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>{item.description}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <span className={`badge ${item.classification === 'CapEx' ? 'green' : 'gray'}`}>{item.classification}</span>
                              </td>
                              <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{item.policy_rationale}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {budgetActiveTab === 'burn' && (
                    <div>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Project Monthly Burn Forecast</h4>
                      <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Month</th>
                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Target Forecast</th>
                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actual Spent</th>
                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Variance Ratio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(budgetData.burn_forecast || []).map((b, idx) => {
                              const variance = b.actual - b.forecast;
                              const varianceColor = variance <= 0 ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)';
                              const varianceSign = variance <= 0 ? '-' : '+';
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <td style={{ padding: '0.5rem' }}>{b.month}</td>
                                  <td style={{ padding: '0.5rem' }}>${b.forecast?.toLocaleString()}</td>
                                  <td style={{ padding: '0.5rem' }}>${b.actual?.toLocaleString()}</td>
                                  <td style={{ padding: '0.5rem', fontWeight: 'bold', color: varianceColor }}>
                                    {varianceSign}${Math.abs(variance)?.toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'vendor-coordination' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Vendor SOW Contract Tracker</h3>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Deliverable / Milestone</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Vendor Partner</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Target SLA Target</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>SLA Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorData.length === 0 ? (
                    <tr><td colSpan="4" style={{ padding: '1.5rem', textCenter: 'center', color: 'var(--text-secondary)' }}>No vendor SOW records found.</td></tr>
                  ) : vendorData.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>{item.milestone_name || item.title}</td>
                      <td style={{ padding: '0.5rem' }}>{item.vendor_name || 'Vendor partner'}</td>
                      <td style={{ padding: '0.5rem' }}>{item.sla_target}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span className={`badge ${item.sla_status === 'met' ? 'green' : 'amber'}`}>{item.sla_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'reporting-communication' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Executive Communication Briefs</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {reportingData.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No communication reports compiled yet.</div>
                ) : reportingData.map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{item.report_title || item.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recipient: {item.recipient_group}</div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineStyle: 'italic' }}>"{item.summary || item.content}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'knowledge-artifacts' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Architecture Artifact Documentation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {knowledgeData.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No documentation files found.</div>
                ) : knowledgeData.map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{item.artifact_name || item.title}</div>
                    <pre style={{ margin: 0, background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: 4, fontSize: '0.8rem', overflowX: 'auto', fontFamily: 'monospace' }}>
                      {item.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
