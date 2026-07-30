import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getDemands } from '../api/demandsApi';
import {
  getEstimates,
  generateEstimate,
  deleteEstimate,
  rebaselineEstimate,
  challengeEstimate,
  approveEstimate
} from '../api/estimatesApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function EstimateShapePage() {
  const navigate = useNavigate();
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm, DialogComponent } = useConfirmDialog();

  const [estimates, setEstimates] = useState([]);
  const [demands, setDemands] = useState([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form & action states
  const [selectedDemandForGen, setSelectedDemandForGen] = useState('');
  const [pendingEstimateData, setPendingEstimateData] = useState(null);
  const [rebaselineReason, setRebaselineReason] = useState('');
  
  // Tab states inside the details view (e.g. baseline, triggers, capacity)
  const [activeStepTab, setActiveStepTab] = useState('baseline');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dList, eList] = await Promise.all([getDemands(), getEstimates()]);
      setDemands(dList || []);
      setEstimates(eList || []);

      // Check if we arrived from Demand module
      const pendingDemandId = sessionStorage.getItem('pendingEstimateDemandId');
      if (pendingDemandId) {
        sessionStorage.removeItem('pendingEstimateDemandId');
        setSelectedDemandForGen(pendingDemandId);
        setSelectedEstimateId(null);
        selectDemand(null);
      } else {
        const activeDemandId = sessionStorage.getItem('selectedDemandId');
        const matchedEst = activeDemandId ? (eList || []).find(e => e.demand_id === activeDemandId) : null;

        if (activeDemandId && !matchedEst) {
          setSelectedDemandForGen(activeDemandId);
          setSelectedEstimateId(null);
        } else if (matchedEst) {
          setSelectedEstimateId(matchedEst.estimate_id);
        } else if (eList && eList.length > 0) {
          setSelectedEstimateId(eList[0].estimate_id);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load estimates data.');
    } finally {
      setLoading(false);
    }
  }, [selectDemand]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteEstimate = async (id) => {
    const ok = await confirm(
      'Delete Estimate',
      'Are you sure you want to delete this estimate? This cannot be undone.'
    );
    if (!ok) return;
    try {
      await deleteEstimate(id);
      addToast('Estimate deleted successfully.', 'success');
      if (selectedEstimateId === id) {
        setSelectedEstimateId(null);
      }
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to delete estimate.', 'error');
    }
  };

  const handleGenerate = async () => {
    if (!selectedDemandForGen) {
      addToast('Please select a demand first.', 'error');
      return;
    }
    const demandObj = demands.find(d => d.demand_id === selectedDemandForGen);
    if (!demandObj) return;

    setActionLoading(true);
    try {
      const payload = { demand: demandObj };
      if (rebaselineReason) {
        payload.rebaseline_reason = rebaselineReason;
      }
      const data = await generateEstimate(selectedDemandForGen, payload);
      setPendingEstimateData(data);
      addToast('AI estimate sizing draft generated.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to generate estimate.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveGenerated = async () => {
    if (!pendingEstimateData) return;
    setActionLoading(true);
    try {
      const payload = {
        effort_days: pendingEstimateData.effort_days,
        effort_range_low: pendingEstimateData.effort_range_low,
        effort_range_high: pendingEstimateData.effort_range_high,
        cost_estimate: pendingEstimateData.cost_estimate,
        duration_weeks: pendingEstimateData.duration_weeks,
        confidence: pendingEstimateData.confidence,
        methodology: pendingEstimateData.methodology,
        risk_factors: pendingEstimateData.risk_factors || [],
        requires_arb: pendingEstimateData.requires_arb || false,
        status: pendingEstimateData.suggested_status || 'draft'
      };

      // Call approve API endpoint
      const response = await fetch(`/api/estimates/approve?demand_id=${selectedDemandForGen}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to approve/save estimate.');
      
      const newEst = await response.json();
      addToast('Estimate baseline successfully saved.', 'success');
      setPendingEstimateData(null);
      setRebaselineReason('');
      setSelectedEstimateId(newEst.estimate_id);
      selectDemand(newEst.demand_id);
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to save estimate.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunTrigger = async (est) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/estimates/${est.estimate_id}/trigger-check`, { method: 'POST' });
      if (!res.ok) throw new Error('Trigger check request failed.');
      const data = await res.json();
      
      // Update local copy of estimate with suggestion results
      setEstimates(prev => prev.map(e => e.estimate_id === est.estimate_id ? { ...e, triggerCheck: data } : e));
      addToast('Drift & Re-baseline trigger check completed.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to check triggers.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveRebaseline = async (est, reason) => {
    setActionLoading(true);
    try {
      const res = await rebaselineEstimate(est.estimate_id, { reason });
      addToast('Project baseline marked as Re-baselined.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to rebaseline.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async (est, reason) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/estimates/${est.estimate_id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'No anomalies detected' })
      });
      if (!res.ok) throw new Error('Failed to finalize estimate.');
      addToast('Estimate baseline successfully finalized.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to finalize.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const activeEst = estimates.find(e => e.estimate_id === selectedEstimateId);
  const approvedDemands = demands.filter(d => d.status === 'approved');

  // Sidebar mapping helpers
  const getSidebarSubtitle = (item) => {
    if (!item || !item.demand_id) return '';
    const d = demands.find(dem => dem.demand_id === item.demand_id);
    return d ? `Demand: ${d.title}` : `Demand: ${item.demand_id}`;
  };

  return (
    <div className="intake-screen">
      {DialogComponent}
      <ProjectSidebar
        items={estimates}
        selectedId={selectedEstimateId}
        onSelect={(id) => {
          setSelectedEstimateId(id);
          setPendingEstimateData(null);
          const est = estimates.find(e => e.estimate_id === id);
          if (est) selectDemand(est.demand_id);
        }}
        onDelete={handleDeleteEstimate}
        idKey="estimate_id"
        titleKey="demand_id"
        subtitleKey={getSidebarSubtitle}
        metaLeft={(item) => item?.cost_estimate != null ? `Cost: $${item.cost_estimate.toLocaleString()}` : ''}
        metaRight={(item) => item?.effort_days != null ? `Effort: ${item.effort_days}d` : ''}
        statusKey="status"
        loading={loading}
        error={error}
        emptyMessage="No estimates found. Generate one."
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Estimates Sizing Queue</h2>
          <div>
            <ProjectDropdown
              demands={demands}
              selectedId={activeEst ? activeEst.demand_id : 'new'}
              includeNew
              newLabel="+ Create New Estimate"
              onChange={(val) => {
                if (val === 'new') {
                  setSelectedEstimateId(null);
                  setPendingEstimateData(null);
                  setSelectedDemandForGen('');
                  selectDemand(null);
                } else {
                  setSelectedDemandForGen(val);
                  const matched = estimates.find(e => e.demand_id === val);
                  if (matched) {
                    setSelectedEstimateId(matched.estimate_id);
                    setPendingEstimateData(null);
                    selectDemand(val);
                  } else {
                    setSelectedEstimateId(null);
                    setPendingEstimateData(null);
                    selectDemand(null);
                  }
                }
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {selectedEstimateId === null && !pendingEstimateData && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                Generate Baseline Estimate
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Select an approved project intake case to generate baseline cost, WBS tasks, and duration.
              </p>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Approved Demand Target</label>
                <select
                  value={selectedDemandForGen}
                  onChange={(e) => setSelectedDemandForGen(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="">-- Select Approved Demand --</option>
                  {approvedDemands.map(d => (
                    <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGenerate}
                  disabled={actionLoading || !selectedDemandForGen}
                >
                  {actionLoading ? <Spinner size="sm" /> : 'Generate Estimate (AI)'}
                </button>
              </div>
            </div>
          )}

          {pendingEstimateData && (
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Suggested Estimate Preview</h3>
                <span className="badge amber">Draft Sizing</span>
              </div>

              <div className="grid-2col" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="data-item"><div className="data-label">Effort Days</div><div className="data-value">{pendingEstimateData.effort_days}d (Range: {pendingEstimateData.effort_range_low}-{pendingEstimateData.effort_range_high}d)</div></div>
                <div className="data-item"><div className="data-label">Cost Estimate</div><div className="data-value">${pendingEstimateData.cost_estimate?.toLocaleString()}</div></div>
                <div className="data-item"><div className="data-label">Duration Weeks</div><div className="data-value">{pendingEstimateData.duration_weeks}w</div></div>
                <div className="data-item"><div className="data-label">Confidence Profile</div><div className="data-value" style={{ textTransform: 'capitalize' }}>{pendingEstimateData.confidence}</div></div>
                <div className="data-item"><div className="data-label">Requires ARB</div><div className="data-value">{pendingEstimateData.requires_arb ? 'Yes' : 'No'}</div></div>
                <div className="data-item"><div className="data-label">Suggested Status</div><div className="data-value" style={{ textTransform: 'capitalize', fontWeight: 'bold' }}>{pendingEstimateData.suggested_status}</div></div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div className="data-label">AI Risk Assessment Factors</div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {pendingEstimateData.risk_factors?.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApproveGenerated}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Spinner size="sm" /> : 'Approve Baseline'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPendingEstimateData(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeEst && (
            <div className="panel-card" style={{ paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeEst.demand_id}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)' }}>
                    Estimate Baseline
                  </h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <StatusPill status={activeEst.status === 'approved' || activeEst.status === 're-baselined' ? 'green' : 'amber'} label={activeEst.status} />
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

              <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
                <button className={`tab-btn${activeStepTab === 'baseline' ? ' active' : ''}`} onClick={() => setActiveStepTab('baseline')}>1. Sizing Baseline</button>
                <button className={`tab-btn${activeStepTab === 'triggers' ? ' active' : ''}`} onClick={() => setActiveStepTab('triggers')}>2. Re-baseline Check</button>
              </div>

              {activeStepTab === 'baseline' && (
                <div className="wizard-step-body" style={{ display: 'block' }}>
                  <div className="grid-2col" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div className="data-item"><div className="data-label">Effort Days</div><div className="data-value">{activeEst.effort_days}d (Range: {activeEst.effort_range_low}-{activeEst.effort_range_high}d)</div></div>
                    <div className="data-item"><div className="data-label">Cost</div><div className="data-value">${activeEst.cost_estimate?.toLocaleString()}</div></div>
                    <div className="data-item"><div className="data-label">Duration Weeks</div><div className="data-value">{activeEst.duration_weeks}w</div></div>
                    <div className="data-item"><div className="data-label">Confidence</div><div className="data-value" style={{ textTransform: 'capitalize' }}>{activeEst.confidence}</div></div>
                    <div className="data-item"><div className="data-label">Methodology</div><div className="data-value">{activeEst.methodology === 'comparable-history' ? 'LLM prediction model' : activeEst.methodology}</div></div>
                    <div className="data-item"><div className="data-label">ARB Required</div><div className="data-value">{activeEst.requires_arb ? 'Yes' : 'No'}</div></div>
                  </div>
                  <div>
                    <div className="data-label">Risk Factors Identified</div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {activeEst.risk_factors && activeEst.risk_factors.length > 0 ? (
                        activeEst.risk_factors.map((r, i) => <li key={i}>{r}</li>)
                      ) : (
                        <li>No significant risks identified.</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {activeStepTab === 'triggers' && (
                <div className="wizard-step-body" style={{ display: 'block' }}>
                  {(activeEst.status === 're-baselined' || activeEst.rebaseline_reason) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="data-item">
                        <div className="data-label">Re-baseline Status</div>
                        <div className="data-value" style={{ color: activeEst.status === 're-baselined' ? 'var(--color-brand)' : 'var(--color-status-green-text)', fontWeight: 600 }}>
                          {activeEst.status === 're-baselined' ? 'Re-baselined' : 'Approved (No Anomalies)'}
                        </div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Justification Note</div>
                        <div className="data-value" style={{ fontStyle: 'italic', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                          {activeEst.rebaseline_reason || 'No justification reason recorded.'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Scan simulated live scope changes, task slippages, and external dependencies to check if a re-baseline is recommended.
                      </p>

                      {activeEst.triggerCheck && (
                        <div className="suggestion-box" style={{ borderColor: activeEst.triggerCheck.rebaseline_warranted ? 'rgba(239,68,68,0.3)' : 'rgba(52,211,153,0.3)', marginBottom: '1.5rem' }}>
                          <h5 className="suggestion-title" style={{ color: activeEst.triggerCheck.rebaseline_warranted ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)', marginTop: 0 }}>
                            {activeEst.triggerCheck.rebaseline_warranted ? 'Re-baseline Warranted!' : 'Scope & Budget Verified'}
                          </h5>
                          <p style={{ fontSize: '0.85rem', margin: 0 }}>{activeEst.triggerCheck.rebaseline_reason}</p>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        {!activeEst.triggerCheck ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleRunTrigger(activeEst)}
                            disabled={actionLoading}
                          >
                            {actionLoading ? <Spinner size="sm" /> : 'Check Triggers'}
                          </button>
                        ) : activeEst.triggerCheck.rebaseline_warranted ? (
                          <>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleApproveRebaseline(activeEst, activeEst.triggerCheck.rebaseline_reason)}
                              disabled={actionLoading}
                            >
                              {actionLoading ? <Spinner size="sm" /> : 'Approve Re-baseline'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => {
                                setRebaselineReason(activeEst.triggerCheck.rebaseline_reason);
                                setSelectedDemandForGen(activeEst.demand_id);
                                setSelectedEstimateId(null);
                                setPendingEstimateData(null);
                              }}
                              disabled={actionLoading}
                            >
                              Revise Sizing
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleFinalize(activeEst, activeEst.triggerCheck.rebaseline_reason)}
                              disabled={actionLoading}
                            >
                              {actionLoading ? <Spinner size="sm" /> : 'Final Approve'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleRunTrigger(activeEst)}
                              disabled={actionLoading}
                            >
                              Check Again
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeEst && (activeEst.status === 'approved' || activeEst.status === 're-baselined') && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setRebaselineReason('Re-estimate requested.');
                      setSelectedDemandForGen(activeEst.demand_id);
                      setSelectedEstimateId(null);
                      setPendingEstimateData(null);
                    }}
                    style={{ fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    ↺ Re-estimate
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      sessionStorage.setItem('pendingPlanEstimateId', activeEst.estimate_id);
                      navigate('/plan-schedule');
                    }}
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 700 }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
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
