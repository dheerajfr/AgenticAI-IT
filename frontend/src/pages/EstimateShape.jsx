import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { estimateService } from '../services/estimateService';
import { demandService } from '../services/demandService';
import StatusPill from '../components/common/StatusPill';

export default function EstimateShape() {
  const { selectedDemand } = useProject();
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Component state
  const [estimates, setEstimates] = useState([]);
  const [demands, setDemands] = useState([]);
  const [selectedEstId, setSelectedEstId] = useState(null);
  const [selectedDemandId, setSelectedDemandId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Generation suggestions
  const [suggestedEstimate, setSuggestedEstimate] = useState(null);
  const [triggerCheckData, setTriggerCheckData] = useState(null);

  // Load demands and estimates
  const loadData = async () => {
    try {
      const estList = await estimateService.getEstimates();
      setEstimates(estList || []);

      const demandList = await demandService.getDemands();
      setDemands(demandList || []);

      // Check if there is a pending demand handoff in sessionStorage
      const pendingDemandId = sessionStorage.getItem('pendingEstimateDemandId');
      if (pendingDemandId) {
        setSelectedDemandId(pendingDemandId);
        sessionStorage.removeItem('pendingEstimateDemandId');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const approvedDemands = demands.filter((d) => d.status === 'approved');

  // Sidebar selection helper
  const handleSelectEstimate = (id) => {
    setSelectedEstId(id);
    setSuggestedEstimate(null);
    setTriggerCheckData(null);
  };

  // Generate estimate call
  const handleGenerateEstimate = async () => {
    if (!selectedDemandId) {
      setErrorMsg('Please select a demand first.');
      return;
    }
    setErrorMsg('');
    const targetDemand = demands.find((d) => d.demand_id === selectedDemandId);
    if (!targetDemand) return;

    showLoader('Sizing effort & cost...');
    try {
      const payload = { demand: targetDemand };
      const res = await estimateService.generateEstimate(payload);
      setSuggestedEstimate(res);
      showToast('AI effort & cost sizing complete');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate estimate.');
    } finally {
      hideLoader();
    }
  };

  // Approve generated estimate
  const handleApproveGenerated = async () => {
    if (!suggestedEstimate || !selectedDemandId) return;
    showLoader('Saving estimate details...');
    try {
      const payload = {
        effort_days: suggestedEstimate.effort_days,
        effort_range_low: suggestedEstimate.effort_range_low,
        effort_range_high: suggestedEstimate.effort_range_high,
        cost_estimate: suggestedEstimate.cost_estimate,
        duration_weeks: suggestedEstimate.duration_weeks,
        confidence: suggestedEstimate.confidence,
        methodology: suggestedEstimate.methodology,
        risk_factors: suggestedEstimate.risk_factors || [],
        requires_arb: suggestedEstimate.requires_arb || false,
        status: suggestedEstimate.suggested_status || 'draft'
      };

      const res = await estimateService.approveEstimate(selectedDemandId, payload);
      // Pre-set the handoff key so Plan screen auto-selects this estimate
      sessionStorage.setItem('pendingPlanEstimateId', res.estimate_id);
      
      setSelectedEstId(res.estimate_id);
      setSuggestedEstimate(null);
      await loadData();
      showToast('Estimate approved and created successfully');
    } catch (err) {
      setErrorMsg(err.message || 'Approval failed.');
    } finally {
      hideLoader();
    }
  };

  // Trigger Sizing Review anomaly check
  const handleCheckTriggers = async (id) => {
    showLoader('Checking anomalies...');
    try {
      const checkRes = await estimateService.triggerCheck(id);
      setTriggerCheckData(checkRes);
      showToast('AI sizing review complete');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Approve Rebaseline suggestion
  const handleApproveRebaseline = async (id, reason) => {
    showLoader('Rebaselining estimate...');
    try {
      await estimateService.rebaselineEstimate(id, { reason: reason || 'No reason provided' });
      setTriggerCheckData(null);
      await loadData();
      showToast('Estimate re-baselined');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Final approve estimate
  const handleFinalApprove = async (id, reason) => {
    showLoader('Finalizing estimate...');
    try {
      await estimateService.finalizeEstimate(id, { reason: reason || 'No anomalies detected' });
      setTriggerCheckData(null);
      await loadData();
      showToast('Estimate finalized');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Delete estimate
  const handleDeleteEstimate = async (id) => {
    if (window.confirm('Are you sure you want to delete this estimate? This cannot be undone.')) {
      showLoader('Deleting estimate...');
      try {
        await estimateService.deleteEstimate(id);
        if (selectedEstId === id) {
          setSelectedEstId(null);
        }
        await loadData();
        showToast('Estimate deleted successfully');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  const activeEst = estimates.find((e) => e.estimate_id === selectedEstId);
  const activeDemand = activeEst ? demands.find((d) => d.demand_id === activeEst.demand_id) : null;
  const displayTitle = activeDemand ? activeDemand.title : (activeEst ? activeEst.demand_id : '');

  const isApproved = activeEst && (activeEst.status === 'approved' || activeEst.status === 're-baselined');
  const isRebaselined = activeEst && activeEst.status === 're-baselined';
  const isFinalized = activeEst && activeEst.status === 'approved' && activeEst.rebaseline_reason != null;

  return (
    <div className="intake-screen">
      {/* Sidebar listing */}
      <aside className="sidebar">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
          Sizing Estimates Queue
        </div>
        <ul className="demand-list">
          {estimates.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No estimates yet. Create one below.
            </li>
          ) : (
            estimates.map((e) => {
              const demand = demands.find((d) => d.demand_id === e.demand_id);
              const title = demand ? demand.title : e.demand_id;
              const isActive = e.estimate_id === selectedEstId;

              return (
                <li
                  key={e.estimate_id}
                  className={`demand-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectEstimate(e.estimate_id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{e.estimate_id}</span>
                    <StatusPill status={e.status} />
                  </div>
                  <h4 className="demand-item-title">{title}</h4>
                  <div className="demand-item-meta">
                    <span>Effort: {e.effort_days} days</span>
                    <span>Cost: ${e.cost_estimate}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main Panel */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Estimate Shape Workspace</h2>
          <div>
            <select
              value={selectedEstId || 'new'}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setSelectedEstId(null);
                  setSuggestedEstimate(null);
                  setTriggerCheckData(null);
                } else {
                  handleSelectEstimate(e.target.value);
                }
              }}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.85rem',
                minWidth: '280px',
                maxWidth: '380px',
                cursor: 'pointer'
              }}
            >
              <option value="new">+ Create New Estimate</option>
              {estimates.map((e) => {
                const d = demands.find((dm) => dm.demand_id === e.demand_id);
                return (
                  <option key={e.estimate_id} value={e.estimate_id}>
                    {e.estimate_id} - {d ? d.title : e.demand_id}
                  </option>
                );
              })}
            </select>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!activeEst ? (
            /* NEW ESTIMATE CREATION FORM */
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                Generate Sizing & Cost Estimate
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Select an approved demand to estimate effort, cost, and duration using Comparable History graph tools.
              </p>

              {errorMsg && <div className="error-message" style={{ display: 'block' }}>{errorMsg}</div>}

              <div className="form-group">
                <label htmlFor="select-demand">Select Approved Demand</label>
                <select
                  id="select-demand"
                  value={selectedDemandId}
                  onChange={(e) => setSelectedDemandId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Select a Demand --</option>
                  {approvedDemands.map((d) => (
                    <option key={d.demand_id} value={d.demand_id}>
                      {d.demand_id} - {d.title}
                    </option>
                  ))}
                </select>
              </div>

              {suggestedEstimate && (
                <div className="suggestion-box" style={{ marginTop: '1.5rem' }}>
                  <h5 className="suggestion-title">Suggested Sizing Breakdown</h5>
                  <div className="grid-2col">
                    <div className="data-item">
                      <div className="data-label">Effort Days</div>
                      <div className="data-value">{suggestedEstimate.effort_days} ({suggestedEstimate.effort_range_low}-{suggestedEstimate.effort_range_high})</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">Cost</div>
                      <div className="data-value">${suggestedEstimate.cost_estimate}</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">Duration Weeks</div>
                      <div className="data-value">{suggestedEstimate.duration_weeks}</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">Confidence</div>
                      <div className="data-value" style={{ textTransform: 'capitalize' }}>{suggestedEstimate.confidence}</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">ARB Required</div>
                      <div className="data-value">{suggestedEstimate.requires_arb ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">Auto-Status</div>
                      <div className="data-value" style={{ textTransform: 'capitalize', fontWeight: 'bold', color: suggestedEstimate.suggested_status === 'approved' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}>
                        {suggestedEstimate.suggested_status}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <div className="data-label">Risk Factors</div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {(suggestedEstimate.risk_factors || []).map((rf, idx) => (
                        <li key={idx}>{rf}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="submit-row" style={{ marginTop: '2rem' }}>
                {suggestedEstimate ? (
                  <button type="button" className="btn-primary" onClick={handleApproveGenerated}>
                    Approve Estimate
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={handleGenerateEstimate}>
                    Generate Estimate (AI)
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* RENDER PIPELINE WIZARD DETAILS */
            <div>
              {/* Header Title block */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activeEst.demand_id}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)' }}>
                    Demand: {displayTitle}
                  </h2>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Estimate Status</div>
                    <StatusPill status={activeEst.status} />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleDeleteEstimate(activeEst.estimate_id)}
                    style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Delete Estimate
                  </button>
                </div>
              </div>

              {/* Wizard pipeline */}
              <div className="pipeline-wizard">
                
                {/* STEP 1: ESTIMATE DETAILS */}
                <div className="wizard-step completed">
                  <div className="wizard-step-header">
                    <h4 className="wizard-step-title"><span className="wizard-step-num">1</span> Estimate Details</h4>
                    <StatusPill status="Approved" />
                  </div>
                  <div className="wizard-step-body">
                    <div className="grid-2col">
                      <div className="data-item">
                        <div className="data-label">Effort Days</div>
                        <div className="data-value">{activeEst.effort_days} (Range: {activeEst.effort_range_low}-{activeEst.effort_range_high})</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Cost</div>
                        <div className="data-value">${activeEst.cost_estimate}</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Duration Weeks</div>
                        <div className="data-value">{activeEst.duration_weeks}</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Confidence</div>
                        <div className="data-value" style={{ textTransform: 'capitalize' }}>{activeEst.confidence}</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Methodology</div>
                        <div className="data-value">{activeEst.methodology === 'comparable-history' ? 'LLM prediction' : activeEst.methodology}</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">ARB Required</div>
                        <div className="data-value">{activeEst.requires_arb ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <div className="data-label">Risk Factors Identified</div>
                      <div className="data-value">
                        {activeEst.risk_factors && activeEst.risk_factors.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                            {activeEst.risk_factors.map((rf, idx) => (
                              <li key={idx}>{rf}</li>
                            ))}
                          </ul>
                        ) : (
                          'No significant risks identified.'
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* STEP 2: RE-ESTIMATE TRIGGERS */}
                <div className={`wizard-step ${isApproved ? (isRebaselined || isFinalized ? 'completed' : 'active') : ''}`}>
                  <div className="wizard-step-header">
                    <h4 className="wizard-step-title"><span class="wizard-step-num">2</span> Re-estimate Triggers</h4>
                    <StatusPill status={isRebaselined || isFinalized ? 'Approved' : (isApproved ? 'Monitoring' : 'Locked')} />
                  </div>
                  <div className="wizard-step-body">
                    {isRebaselined || isFinalized ? (
                      <div>
                        <div className="data-item">
                          <div className="data-label">Status</div>
                          <div className="data-value" style={{ color: isRebaselined ? 'var(--color-status-blue-text)' : 'var(--color-status-green-text)' }}>
                            {isRebaselined ? 'Re-baselined' : 'Approved (No Anomalies)'}
                          </div>
                        </div>
                        <div className="data-item" style={{ marginTop: '1rem' }}>
                          <div className="data-label">{isRebaselined ? 'Re-baseline Reason' : 'Finalization Note'}</div>
                          <div className="data-value">{activeEst.rebaseline_reason || 'No reason recorded'}</div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                          Check simulated live scope and actuals to see if a re-baseline is warranted.
                        </p>

                        {triggerCheckData && (
                          <div className="suggestion-box" style={{ borderColor: triggerCheckData.rebaseline_warranted ? 'rgba(239,68,68,0.3)' : 'rgba(52,211,153,0.3)' }}>
                            <h5 className="suggestion-title" style={{ color: triggerCheckData.rebaseline_warranted ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)' }}>
                              {triggerCheckData.rebaseline_warranted ? 'Re-baseline Warranted!' : 'All Good'}
                            </h5>
                            <p style={{ fontSize: '0.85rem', margin: 0 }}>
                              {triggerCheckData.rebaseline_warranted ? `Reason: ${triggerCheckData.rebaseline_reason}` : 'Forecasts stay honest. No anomalies detected.'}
                            </p>
                            {!triggerCheckData.rebaseline_warranted && (
                              <p style={{ fontSize: '0.85rem', margin: '0.5rem 0 0 0', color: 'var(--text-secondary)' }}>
                                Reason: {triggerCheckData.rebaseline_reason || 'Resource pool is healthy'}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="submit-row">
                          {triggerCheckData ? (
                            triggerCheckData.rebaseline_warranted ? (
                              <>
                                <button type="button" className="btn-primary" onClick={() => handleApproveRebaseline(activeEst.estimate_id, triggerCheckData.rebaseline_reason)}>
                                  Approve Re-baseline
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    setSelectedEstId(null);
                                    setSuggestedEstimate(null);
                                    setTriggerCheckData(null);
                                    setSelectedDemandId(activeEst.demand_id);
                                    // Trigger generator auto-fill
                                    setTimeout(() => handleGenerateEstimate(), 100);
                                  }}
                                  style={{ marginLeft: '0.5rem', borderColor: 'var(--color-status-amber-text)', color: 'var(--color-status-amber-text)' }}
                                >
                                  Revise Estimate
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn-primary" onClick={() => handleFinalApprove(activeEst.estimate_id, triggerCheckData.rebaseline_reason)}>
                                  Final Approve
                                </button>
                                <button type="button" className="btn-secondary" onClick={() => handleCheckTriggers(activeEst.estimate_id)} style={{ marginLeft: '0.5rem' }}>
                                  Check Again
                                </button>
                              </>
                            )
                          ) : (
                            <button type="button" className="btn-primary" onClick={() => handleCheckTriggers(activeEst.estimate_id)} disabled={!isApproved}>
                              Check Triggers
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Redo + Next Stage actions */}
              {(isApproved || isRebaselined) && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEstId(null);
                      setSuggestedEstimate(null);
                      setTriggerCheckData(null);
                      setSelectedDemandId(activeEst.demand_id);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    ↺ Re-estimate
                  </button>
                  <div style={{ flex: 1 }}></div>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('pendingPlanEstimateId', activeEst.estimate_id);
                      navigate('/plan-schedule');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'var(--text-primary)', boxShadow: '0 2px 8px rgba(99,102,241,0.35)' }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                    Next: Create Plan &nbsp;→
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
