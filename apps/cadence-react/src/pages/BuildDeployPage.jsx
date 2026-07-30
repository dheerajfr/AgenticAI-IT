import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getDemands } from '../api/demandsApi';
import { getEnvironments } from '../api/environmentsApi';
import {
  getOrchestrations,
  getCutoverSessions,
  generateRunbook,
  deleteRunbook,
  submitRunbookForReview,
  approveRunbook,
  getDeployments,
  startDeployment,
  checkPreconditions,
  submitGoNoGo,
  completeDeployment,
  startCutover,
  advanceCutoverStep,
  postCutoverUpdate,
  endCutover
} from '../api/deploymentsApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function BuildDeployPage() {
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm, DialogComponent } = useConfirmDialog();

  const [demands, setDemands] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [runbooks, setRunbooks] = useState([]);
  const [cutoverSessions, setCutoverSessions] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [selectedDemandKey, setSelectedDemandKey] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sub-tabs: 'runbooks' | 'orchestration' | 'cutover' | 'preconditions'
  const [activeTab, setActiveTab] = useState('runbooks');

  // Runbook draft states
  const [draftDemandId, setDraftDemandId] = useState('');
  const [draftComponentId, setDraftComponentId] = useState('');
  const [draftChangeSummary, setDraftChangeSummary] = useState('');
  const [draftArchNotes, setDraftArchNotes] = useState('');
  const [draftEnvironment, setDraftEnvironment] = useState('prod');
  const [draftPriorRunbook, setDraftPriorRunbook] = useState('');
  const [draftChangeRef, setDraftChangeRef] = useState('');
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [selectedRunbookId, setSelectedRunbookId] = useState(null);

  // Orchestration form & active states
  const [orchRunbookId, setOrchRunbookId] = useState('');
  const [orchVersion, setOrchVersion] = useState('1.0.0');
  const [orchEnvironment, setOrchEnvironment] = useState('prod');
  const [goNoGoDecision, setGoNoGoDecision] = useState('go');
  const [goNoGoDecidedBy, setGoNoGoDecidedBy] = useState('');
  const [goNoGoStakeholders, setGoNoGoStakeholders] = useState('');

  // Cutover states
  const [selectedCutoverId, setSelectedCutoverId] = useState(null);
  const [cutComponentId, setCutComponentId] = useState('');
  const [cutRunbookId, setCutRunbookId] = useState('');
  const [cutStakeholders, setCutStakeholders] = useState('');
  const [commsAuthor, setCommsAuthor] = useState('');
  const [commsMessage, setCommsMessage] = useState('');

  // Preconditions & promotion check state
  const [preconditions, setPreconditions] = useState(null);
  const [promotionTarget, setPromotionTarget] = useState('staging');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dList, eList, rList, cList, depList] = await Promise.all([
        getDemands(),
        getEnvironments(),
        getOrchestrations(),
        getCutoverSessions(),
        getDeployments()
      ]);
      setDemands(dList || []);
      setEnvironments(eList || []);
      setRunbooks(rList || []);
      setCutoverSessions(cList || []);
      setDeployments(depList || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId');
      if (activeDemandId) {
        setSelectedDemandKey(activeDemandId);
      } else if (dList && dList.length > 0) {
        setSelectedDemandKey(dList[0].demand_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load deployment data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load details from demand for runbook pre-populating
  const handleLoadDemandDetails = async (id) => {
    const demandObj = demands.find(d => d.demand_id === id);
    if (!demandObj) return;

    setDraftDemandId(id);
    let summary = `Demand: ${demandObj.demand_id} — ${demandObj.title}\n`;
    if (demandObj.business_case_summary) summary += `Business case: ${demandObj.business_case_summary}\n`;
    summary += `Risk: ${demandObj.risk_level} | Domain: ${demandObj.domain} | Type: ${demandObj.type}\n`;
    setDraftChangeSummary(summary.trim());

    // Filter environment records for this demand to find CMDB component ID
    const demandEnvs = environments.filter(e => e.demand_id === id);
    const prodEnv = demandEnvs.find(e => e.environment === 'prod');
    if (prodEnv) {
      setDraftComponentId(prodEnv.cmdb_name || prodEnv.observed_name || id);
    } else {
      setDraftComponentId(id);
    }
  };

  const handleGenerateRunbook = async () => {
    setActionLoading(true);
    try {
      const payload = {
        demand_id: draftDemandId,
        component_id: draftComponentId,
        change_summary: draftChangeSummary,
        architecture_notes: draftArchNotes,
        environment: draftEnvironment,
        prior_runbook_id: draftPriorRunbook || null,
        change_record_ref: draftChangeRef || null
      };

      const res = await generateRunbook(payload);
      addToast('AI deployment runbook generated successfully.', 'success');
      setShowDraftForm(false);
      loadData();
      if (res && res.runbook_id) {
        setSelectedRunbookId(res.runbook_id);
      }
    } catch (err) {
      addToast(err.message || 'Failed to generate runbook.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRunbook = async (id) => {
    const ok = await confirm(
      'Delete Runbook',
      'Are you sure you want to delete this deployment runbook? This cannot be undone.'
    );
    if (!ok) return;
    try {
      await deleteRunbook(id);
      addToast('Runbook deleted.', 'success');
      if (selectedRunbookId === id) setSelectedRunbookId(null);
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to delete runbook.', 'error');
    }
  };

  const handleSubmitReview = async (runbookId) => {
    setActionLoading(true);
    try {
      await submitRunbookForReview(runbookId);
      addToast('Runbook submitted for SME review.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to submit review.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveRunbook = async (runbookId) => {
    setActionLoading(true);
    try {
      await approveRunbook(runbookId);
      addToast('Runbook approved successfully.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to approve runbook.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartDeployment = async () => {
    setActionLoading(true);
    try {
      const rb = runbooks.find(r => r.runbook_id === orchRunbookId);
      const payload = {
        demand_id: selectedDemandKey,
        component_id: rb ? rb.component_id : selectedDemandKey,
        runbook_id: orchRunbookId,
        version: orchVersion,
        environment: orchEnvironment
      };
      await startDeployment(payload);
      addToast('Deployment orchestration started.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to start deployment.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckPreconditionsOrch = async (depId) => {
    setActionLoading(true);
    try {
      await checkPreconditions(depId);
      addToast('Preconditions checked.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to check preconditions.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitGoNoGo = async (depId) => {
    setActionLoading(true);
    try {
      const payload = {
        decision: goNoGoDecision,
        decided_by: goNoGoDecidedBy || 'release-manager',
        stakeholders: goNoGoStakeholders.split(',').map(s => s.trim()).filter(Boolean)
      };
      await submitGoNoGo(depId, payload);
      addToast(`Go/No-Go decision submitted: ${goNoGoDecision.toUpperCase()}`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to submit decision.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteDeployment = async (depId) => {
    setActionLoading(true);
    try {
      await completeDeployment(depId);
      addToast('Deployment marked as completed.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to complete deployment.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartCutover = async () => {
    setActionLoading(true);
    try {
      const payload = {
        demand_id: selectedDemandKey,
        component_id: cutComponentId || selectedDemandKey,
        runbook_id: cutRunbookId || null,
        stakeholders: cutStakeholders.split(',').map(s => s.trim()).filter(Boolean)
      };
      await startCutover(payload);
      addToast('Cutover bridge session started.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to start cutover.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdvanceStep = async (cutId, stepId, status) => {
    try {
      await advanceCutoverStep(cutId, stepId, { status });
      addToast(`Step ${stepId} updated to ${status}.`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to advance step.', 'error');
    }
  };

  const handlePostUpdate = async (cutId) => {
    if (!commsMessage) return;
    try {
      await postCutoverUpdate(cutId, { author: commsAuthor || 'release-manager', message: commsMessage });
      setCommsMessage('');
      addToast('Stakeholder update posted.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to post update.', 'error');
    }
  };

  const handleEndCutoverSession = async (cutId, status) => {
    try {
      await endCutover(cutId, { status });
      addToast(`Cutover bridge ${status}.`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to end cutover.', 'error');
    }
  };

  const handleCheckPreconditions = async (demandId) => {
    setActionLoading(true);
    setPreconditions(null);
    try {
      const res = await fetch(`/api/deployments/release-readiness?demand_id=${demandId}&target_env=${promotionTarget}`);
      if (!res.ok) throw new Error('Release readiness check failed.');
      const data = await res.json();
      setPreconditions(data);
      addToast('Release readiness check complete.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to check preconditions.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteEnvironment = async (demandId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/deployments/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_id: demandId, target_env: promotionTarget })
      });
      if (!res.ok) throw new Error('Environment promotion failed.');
      addToast(`Environment successfully promoted to ${promotionTarget}!`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to promote environment.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const activeRunbook = runbooks.find(r => r.runbook_id === selectedRunbookId) || runbooks.find(r => r.demand_id === selectedDemandKey);
  const activeCutover = cutoverSessions.find(c => c.cutover_id === selectedCutoverId) || cutoverSessions.find(c => c.demand_id === selectedDemandKey);
  const activeDeployment = deployments.find(d => d.demand_id === selectedDemandKey);

  // Sidebar mapping: Group by demand_id
  const uniqueDemandBuilds = [...new Set(runbooks.map(r => r.demand_id))].map(id => {
    const dem = demands.find(d => d.demand_id === id);
    const count = runbooks.filter(r => r.demand_id === id).length;
    return {
      demand_id: id,
      title: dem ? dem.title : id,
      count
    };
  });

  return (
    <div className="intake-screen">
      {DialogComponent}
      <ProjectSidebar
        items={uniqueDemandBuilds}
        selectedId={selectedDemandKey}
        onSelect={(id) => {
          setSelectedDemandKey(id);
          selectDemand(id);
          const matched = runbooks.find(r => r.demand_id === id);
          if (matched) setSelectedRunbookId(matched.runbook_id);
        }}
        idKey="demand_id"
        titleKey="title"
        subtitleKey={(item) => `${item.count} runbook(s) drafted`}
        statusKey={null}
        loading={loading}
        error={error}
        emptyMessage="No build or runbooks drafted yet."
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Build &amp; Deploy Pipeline</h2>
          <div>
            <ProjectDropdown
              demands={demands}
              selectedId={selectedDemandKey}
              onChange={(val) => {
                setSelectedDemandKey(val);
                selectDemand(val);
                const matched = runbooks.find(r => r.demand_id === val);
                if (matched) setSelectedRunbookId(matched.runbook_id);
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
            <button className={`tab-btn${activeTab === 'runbooks' ? ' active' : ''}`} onClick={() => setActiveTab('runbooks')}>AI Runbooks</button>
            <button className={`tab-btn${activeTab === 'orchestration' ? ' active' : ''}`} onClick={() => setActiveTab('orchestration')}>Deployment Orchestration</button>
            <button className={`tab-btn${activeTab === 'cutover' ? ' active' : ''}`} onClick={() => setActiveTab('cutover')}>Cutover Bridge</button>
            <button className={`tab-btn${activeTab === 'preconditions' ? ' active' : ''}`} onClick={() => setActiveTab('preconditions')}>Preconditions &amp; Promotion</button>
          </div>

          {activeTab === 'runbooks' && (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn-primary" onClick={() => setShowDraftForm(true)}>+ Draft Runbook</button>
                {runbooks.filter(r => r.demand_id === selectedDemandKey).map(r => (
                  <button
                    key={r.runbook_id}
                    type="button"
                    className={`btn-secondary${(selectedRunbookId === r.runbook_id || (!selectedRunbookId && activeRunbook?.runbook_id === r.runbook_id)) ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedRunbookId(r.runbook_id);
                      setShowDraftForm(false);
                    }}
                    style={{ borderColor: (selectedRunbookId === r.runbook_id || (!selectedRunbookId && activeRunbook?.runbook_id === r.runbook_id)) ? 'var(--color-brand)' : 'var(--border-color)' }}
                  >
                    {(r.environment || '').toUpperCase()} Runbook ({r.runbook_id.substring(0, 6)})
                  </button>
                ))}
              </div>

              {showDraftForm && (
                <div className="panel-card">
                  <h3 style={{ margin: '0 0 1rem 0' }}>Draft a Runbook</h3>
                  
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Load Details from Demand Target</label>
                    <select onChange={(e) => handleLoadDemandDetails(e.target.value)}>
                      <option value="">— select a demand —</option>
                      {demands.map(d => <option key={d.demand_id} value={d.demand_id}>{d.demand_id} — {d.title}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Component ID *</label>
                    <input type="text" value={draftComponentId} onChange={(e) => setDraftComponentId(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Change Summary *</label>
                    <textarea value={draftChangeSummary} onChange={(e) => setDraftChangeSummary(e.target.value)} style={{ minHeight: 100 }} />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Architecture / Deployment Notes</label>
                    <textarea value={draftArchNotes} onChange={(e) => setDraftArchNotes(e.target.value)} style={{ minHeight: 80 }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Target Environment</label>
                      <select value={draftEnvironment} onChange={(e) => setDraftEnvironment(e.target.value)}>
                        <option value="dev">Dev</option>
                        <option value="test">Test</option>
                        <option value="staging">Staging</option>
                        <option value="prod">Production</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Change Reference Ref</label>
                      <input type="text" value={draftChangeRef} onChange={(e) => setDraftChangeRef(e.target.value)} placeholder="e.g. CHG-2026-0091" />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button type="button" className="btn-primary" onClick={handleGenerateRunbook} disabled={actionLoading}>
                      {actionLoading ? <Spinner size="sm" /> : 'Draft Runbook (AI)'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setShowDraftForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {activeRunbook && !showDraftForm && (
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeRunbook.runbook_id}</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                        {(activeRunbook.environment || '').toUpperCase()} Pipeline Runbook
                      </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <StatusPill status={activeRunbook.status === 'approved' ? 'green' : activeRunbook.status === 'sme-review' ? 'amber' : 'gray'} label={activeRunbook.status} />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleDeleteRunbook(activeRunbook.runbook_id)}
                        style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div><b>Component:</b> {activeRunbook.component_id}</div>
                    {activeRunbook.change_record_ref && <div><b>Change Ref:</b> {activeRunbook.change_record_ref}</div>}
                    <div><b>Title:</b> {activeRunbook.title}</div>
                    <div><b>Author:</b> {(activeRunbook.generated_by || '').toUpperCase()} (AI)</div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0' }}>Orchestration Deployment Steps</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {activeRunbook.steps?.map((step, idx) => (
                        <div key={step.step_id || idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)' }}>
                          <span className={`step-dot`} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--text-muted)' }} />
                          <div style={{ flex: 1, fontSize: '0.85rem' }}>
                            <div style={{ fontWeight: 600 }}>{step.description}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Owner: <b>{step.owner}</b> | Env: <span style={{ textTransform: 'uppercase' }}>{step.environment}</span> | Type: <i>{step.step_type}</i> ({step.estimated_minutes} min)
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                    {activeRunbook.status === 'draft' && (
                      <button type="button" className="btn-primary" onClick={() => handleSubmitReview(activeRunbook.runbook_id)} disabled={actionLoading}>
                        Submit for SME Review
                      </button>
                    )}
                    {activeRunbook.status === 'sme-review' && (
                      <button type="button" className="btn-primary" onClick={() => handleApproveRunbook(activeRunbook.runbook_id)} disabled={actionLoading} style={{ background: 'var(--color-status-green-border)' }}>
                        Approve Runbook
                      </button>
                    )}
                    {activeRunbook.status === 'approved' && (
                      <>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => {
                            setOrchRunbookId(activeRunbook.runbook_id);
                            setOrchEnvironment(activeRunbook.environment);
                            // Set version based on environment baseline if possible
                            const matchedEnv = environments.find(e => e.environment === activeRunbook.environment && e.demand_id === selectedDemandKey);
                            if (matchedEnv?.expected_version) {
                              setOrchVersion(matchedEnv.expected_version);
                            }
                            setActiveTab('orchestration');
                          }}
                        >
                          Start Deployment (Orchestration)
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setCutRunbookId(activeRunbook.runbook_id);
                            setCutComponentId(activeRunbook.component_id);
                            setActiveTab('cutover');
                          }}
                        >
                          Start Cutover Bridge
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'orchestration' && (
            <div>
              {activeDeployment ? (
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeDeployment.deployment_id}</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                        Active Deployment: {activeDeployment.component_id}
                      </h3>
                    </div>
                    <StatusPill
                      status={activeDeployment.status === 'completed' ? 'green' : activeDeployment.status === 'in-progress' ? 'blue' : activeDeployment.status === 'no-go' ? 'red' : 'amber'}
                      label={activeDeployment.status}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    <div><b>Target Version:</b> {activeDeployment.version}</div>
                    <div><b>Environment:</b> <span style={{ textTransform: 'uppercase' }}>{activeDeployment.environment || ''}</span></div>
                    <div><b>Linked Runbook:</b> {activeDeployment.runbook_id}</div>
                    {activeDeployment.decided_by && <div><b>Decided By:</b> {activeDeployment.decided_by}</div>}
                  </div>

                  {activeDeployment.preconditions && activeDeployment.preconditions.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Promotion Preconditions Verification</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeDeployment.preconditions.map((check, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '1rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)' }}>
                            <span style={{ fontSize: '1.1rem', color: check.passed ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)' }}>
                              {check.passed ? '✓' : '✗'}
                            </span>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{check.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{check.detail || 'check complete'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeDeployment.status === 'checking' && (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Submit Go/No-Go Decision</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Decision</label>
                          <select value={goNoGoDecision} onChange={(e) => setGoNoGoDecision(e.target.value)}>
                            <option value="go">GO (Proceed to Production Cutover)</option>
                            <option value="no-go">NO-GO (Abort Release)</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Decided By</label>
                          <input type="text" value={goNoGoDecidedBy} onChange={(e) => setGoNoGoDecidedBy(e.target.value)} placeholder="e.g. release-manager" />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Stakeholders (comma separated)</label>
                        <input type="text" value={goNoGoStakeholders} onChange={(e) => setGoNoGoStakeholders(e.target.value)} placeholder="e.g. ops-sme, qa-team" />
                      </div>
                      <button type="button" className="btn-primary" onClick={() => handleSubmitGoNoGo(activeDeployment.deployment_id)} disabled={actionLoading}>
                        Submit Go/No-Go Decision
                      </button>
                    </div>
                  )}

                  {activeDeployment.status === 'planned' && (
                    <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                      <button type="button" className="btn-primary" onClick={() => handleCheckPreconditionsOrch(activeDeployment.deployment_id)} disabled={actionLoading}>
                        {actionLoading ? <Spinner size="sm" /> : 'Run Precondition Checks'}
                      </button>
                    </div>
                  )}

                  {activeDeployment.status === 'in-progress' && (
                    <div style={{ background: 'rgba(99,102,241,0.06)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                      <div>
                        <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.2rem' }}>Deployment Executing in Cutover Bridge</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Live stakeholder feed has been initialized.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="btn-primary" onClick={() => setActiveTab('cutover')}>
                          Open Cutover Bridge
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => handleCompleteDeployment(activeDeployment.deployment_id)} disabled={actionLoading}>
                          Mark Completed
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="panel-card">
                  <h3 style={{ margin: '0 0 1rem 0' }}>Start a Deployment</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    Drives the deployment runbook across environments and teams; checks pre-conditions and holds go/no-go on production steps.
                  </p>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Approved Runbook *</label>
                    <select value={orchRunbookId} onChange={(e) => {
                      setOrchRunbookId(e.target.value);
                      const rb = runbooks.find(r => r.runbook_id === e.target.value);
                      if (rb) {
                        setOrchEnvironment(rb.environment);
                        const matchedEnv = environments.find(env => env.environment === rb.environment && env.demand_id === selectedDemandKey);
                        if (matchedEnv?.expected_version) {
                          setOrchVersion(matchedEnv.expected_version);
                        }
                      }
                    }}>
                      <option value="">— select a runbook —</option>
                      {runbooks.filter(r => r.demand_id === selectedDemandKey && r.status === 'approved').map(r => (
                        <option key={r.runbook_id} value={r.runbook_id}>{r.runbook_id} — {(r.environment || '').toUpperCase()} ({r.component_id})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Target Environment (Auto-filled)</label>
                      <input type="text" value={(orchEnvironment || '').toUpperCase()} readOnly style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Version to Deploy</label>
                      <input type="text" value={orchVersion} onChange={(e) => setOrchVersion(e.target.value)} />
                    </div>
                  </div>

                  <button type="button" className="btn-primary" onClick={handleStartDeployment} disabled={actionLoading || !orchRunbookId}>
                    {actionLoading ? <Spinner size="sm" /> : 'Start Deployment Orchestration'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cutover' && (
            <div>
              {activeCutover ? (
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeCutover.cutover_id}</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                        Live Cutover: {activeCutover.component_id}
                      </h3>
                    </div>
                    <StatusPill
                      status={activeCutover.status === 'completed' ? 'green' : activeCutover.status === 'aborted' ? 'red' : 'blue'}
                      label={activeCutover.status}
                    />
                  </div>

                  {activeCutover.stakeholders && activeCutover.stakeholders.length > 0 && (
                    <div style={{ fontSize: '0.82rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                      <b>Stakeholders:</b> {activeCutover.stakeholders.join(', ')}
                    </div>
                  )}

                  {activeCutover.steps && activeCutover.steps.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Live Step Tracker</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeCutover.steps.map((step) => (
                          <div key={step.step_id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)' }}>
                            <span className={`step-dot ${step.status}`} style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: step.status === 'done' ? 'var(--color-status-green-text)' :
                                          step.status === 'in-progress' ? 'var(--color-status-amber-text)' :
                                          step.status === 'blocked' ? 'var(--color-status-red-text)' : 'var(--text-muted)'
                            }} />
                            <div style={{ flex: 1, fontSize: '0.85rem' }}>
                              <div style={{ fontWeight: 600 }}>{step.description}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status: {step.status}</div>
                            </div>
                            {activeCutover.status === 'in-progress' && (
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button type="button" className="btn-secondary" onClick={() => handleAdvanceStep(activeCutover.cutover_id, step.step_id, 'in-progress')} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}>Start</button>
                                <button type="button" className="btn-secondary" onClick={() => handleAdvanceStep(activeCutover.cutover_id, step.step_id, 'done')} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--color-status-green-text)', borderColor: 'var(--color-status-green-text)' }}>Done</button>
                                <button type="button" className="btn-secondary" onClick={() => handleAdvanceStep(activeCutover.cutover_id, step.step_id, 'blocked')} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}>Block</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0' }}>Stakeholder Comms Feed</h4>
                    <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {activeCutover.updates?.slice().reverse().map((u, i) => (
                        <div key={i} style={{ borderLeft: '2px solid var(--color-brand)', background: 'rgba(99,102,241,0.04)', padding: '0.4rem 0.6rem', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                            <span><b>{u.author}</b></span>
                            <span>{new Date(u.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div>{u.message}</div>
                        </div>
                      ))}
                      {(!activeCutover.updates || activeCutover.updates.length === 0) && (
                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No updates posted yet.</div>
                      )}
                    </div>

                    {activeCutover.status === 'in-progress' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.75rem' }}>
                          <input type="text" value={commsAuthor} onChange={(e) => setCommsAuthor(e.target.value)} placeholder="Author: e.g. manager" style={{ padding: '0.4rem', fontSize: '0.8rem' }} />
                          <input type="text" value={commsMessage} onChange={(e) => setCommsMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handlePostCutoverUpdate(activeCutover.cutover_id); }} placeholder="Post stakeholder status update..." style={{ padding: '0.4rem', fontSize: '0.8rem' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <button type="button" className="btn-primary" onClick={() => handlePostCutoverUpdate(activeCutover.cutover_id)} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                            Send Update
                          </button>
                          <div style={{ flex: 1 }} />
                          <button type="button" className="btn-secondary" onClick={() => handleEndCutoverSession(activeCutover.cutover_id, 'aborted')} style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                            Abort Cutover
                          </button>
                          <button type="button" className="btn-primary" onClick={() => handleEndCutoverSession(activeCutover.cutover_id, 'completed')} style={{ background: 'var(--color-status-green-border)', border: 'none', padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                            Mark Completed
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="panel-card">
                  <h3 style={{ margin: '0 0 1rem 0' }}>Start a Cutover Bridge</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    Runs the cutover bridge: live status, step tracking, and automated stakeholder updates.
                  </p>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Component ID *</label>
                    <input type="text" value={cutComponentId} onChange={(e) => setCutComponentId(e.target.value)} placeholder="e.g. loyalty-api" />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Runbook Reference (approved only)</label>
                    <select value={cutRunbookId} onChange={(e) => {
                      setCutRunbookId(e.target.value);
                      const rb = runbooks.find(r => r.runbook_id === e.target.value);
                      if (rb) {
                        setCutComponentId(rb.component_id);
                      }
                    }}>
                      <option value="">None — track manually</option>
                      {runbooks.filter(r => r.demand_id === selectedDemandKey && r.status === 'approved').map(r => (
                        <option key={r.runbook_id} value={r.runbook_id}>{r.runbook_id} — {(r.environment || '').toUpperCase()} ({r.component_id})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label>Stakeholders (comma separated)</label>
                    <input type="text" value={cutStakeholders} onChange={(e) => setCutStakeholders(e.target.value)} placeholder="e.g. dev-leads, devops-sme" />
                  </div>

                  <button type="button" className="btn-primary" onClick={handleStartCutover} disabled={actionLoading || !cutComponentId}>
                    {actionLoading ? <Spinner size="sm" /> : 'Open Cutover Bridge'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'preconditions' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-display)' }}>Environment Promotion Check</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Promotion Target Environment</label>
                  <select value={promotionTarget} onChange={(e) => setPromotionTarget(e.target.value)}>
                    <option value="test">Test (test)</option>
                    <option value="staging">Staging (staging)</option>
                    <option value="prod">Production (prod)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleCheckPreconditions(selectedDemandKey)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Spinner size="sm" /> : 'Check Promotion Readiness'}
                </button>
              </div>

              {preconditions && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Promotion Preconditions Verification</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                    {preconditions.checks?.map((check, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '1rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)' }}>
                        <span style={{ fontSize: '1.1rem', color: check.status === 'PASS' ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)' }}>
                          {check.status === 'PASS' ? '✓' : '✗'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{check.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{check.message || check.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {preconditions.ready_for_promotion ? (
                    <div style={{ background: 'rgba(52,211,153,0.1)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-status-green-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-status-green-text)', fontWeight: 600 }}>All promotion criteria satisfied! Ready to promote.</span>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handlePromoteEnvironment(selectedDemandKey)}
                        disabled={actionLoading}
                        style={{ background: 'var(--color-status-green-border)', border: 'none' }}
                      >
                        Promote Now
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(239,68,68,0.1)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-status-red-border)', color: 'var(--color-status-red-text)', fontWeight: 600 }}>
                      ✗ Promotion Blocked: Precondition checks failed. Fix missing release-change approvals or failing quality gates.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
