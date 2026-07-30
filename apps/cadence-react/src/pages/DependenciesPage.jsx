import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getPlans } from '../api/plansApi';
import {
  getDependencies,
  createDependency,
  deleteDependency,
  updateDependency
} from '../api/dependenciesApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function DependenciesPage() {
  const navigate = useNavigate();
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm, DialogComponent } = useConfirmDialog();

  const [dependencies, setDependencies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedDepId, setSelectedDepId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-sense extraction state
  const [selectedPlanForSense, setSelectedPlanForSense] = useState('');
  const [sensedResults, setSensedResults] = useState(null);

  // Tone & Channel selection
  const [tone, setTone] = useState('friendly');
  const [channel, setChannel] = useState('teams');
  const [nudgeLog, setNudgeLog] = useState([]);

  // Downstream delay simulation state
  const [simulateTaskId, setSimulateTaskId] = useState('');
  const [simulateDelayDays, setSimulateDelayDays] = useState(5);
  const [simulationResult, setSimulationResult] = useState(null);

  // Tabs inside details view
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'simulation'

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pList, dList] = await Promise.all([getPlans(), getDependencies()]);
      setPlans(pList || []);
      setDependencies(dList || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId');
      const matchedDep = activeDemandId ? (dList || []).find(d => d.demand_id === activeDemandId) : null;

      if (activeDemandId && !matchedDep) {
        // Find matching plan if any to pre-select for auto-sense
        const plan = (pList || []).find(p => p.demand_id === activeDemandId);
        if (plan) setSelectedPlanForSense(plan.plan_id);
        setSelectedDepId(null);
      } else if (matchedDep) {
        setSelectedDepId(matchedDep.dependency_id);
      } else if (dList && dList.length > 0) {
        setSelectedDepId(dList[0].dependency_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dependencies data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAutoSense = async () => {
    if (!selectedPlanForSense) {
      addToast('Please select a target plan to analyze.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/dependencies/sense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: selectedPlanForSense })
      });
      if (!res.ok) throw new Error('Auto-sensing failed.');
      const data = await res.json();
      setSensedResults(data);
      addToast('Discovered dependency paths extracted.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to auto-sense dependencies.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendNudge = async (depId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/dependencies/chase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependency_id: depId, tone, channel })
      });
      if (!res.ok) throw new Error('Nudge send failed.');
      const data = await res.json();
      setNudgeLog(prev => [data, ...prev]);
      addToast(`Chase alert successfully transmitted via ${channel}.`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to trigger nudge.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveDependency = async (depId) => {
    const ok = await confirm(
      'Resolve Dependency',
      'Are you sure this dependency has been resolved and is no longer blocking?'
    );
    if (!ok) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/dependencies/${depId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' })
      });
      if (!res.ok) throw new Error('Resolve failed.');
      addToast('Dependency status successfully marked as Resolved.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to resolve dependency.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateDelay = async (planId) => {
    if (!simulateTaskId) {
      addToast('Please enter a target Task ID.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/dependencies/impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: simulateTaskId,
          delay_days: simulateDelayDays,
          plan_id: planId
        })
      });
      if (!res.ok) throw new Error('Delay simulation execution failed.');
      const data = await res.json();
      setSimulationResult(data);
      addToast('Timeline ripple impact re-calculated.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to simulate delay.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDependency = async (id) => {
    const ok = await confirm(
      'Delete Dependency Record',
      'Are you sure you want to delete this dependency path? This cannot be undone.'
    );
    if (!ok) return;
    try {
      await deleteDependency(id);
      addToast('Dependency mapping deleted.', 'success');
      if (selectedDepId === id) {
        setSelectedDepId(null);
      }
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to delete.', 'error');
    }
  };

  const activeDep = dependencies.find(d => d.dependency_id === selectedDepId);

  return (
    <div className="intake-screen">
      {DialogComponent}
      <ProjectSidebar
        items={dependencies}
        selectedId={selectedDepId}
        onSelect={(id) => {
          setSelectedDepId(id);
          setSensedResults(null);
          setSimulationResult(null);
          const dep = dependencies.find(d => d.dependency_id === id);
          if (dep) selectDemand(dep.demand_id);
        }}
        onDelete={handleDeleteDependency}
        idKey="dependency_id"
        titleKey="demand_id"
        subtitleKey={(item) => `Blocker: ${item.upstream_task || 'Predecessor Task'}`}
        metaLeft={(item) => `Impact: ${item.threat_level || 'At Risk'}`}
        metaRight={(item) => `Confidence: ${item.confidence || 80}%`}
        statusKey="status"
        loading={loading}
        error={error}
        emptyMessage="No dependencies registered. Auto-sense them."
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Cross-Project Dependencies</h2>
          <div>
            <ProjectDropdown
              demands={plans}
              selectedId={activeDep ? activeDep.plan_id : 'new'}
              includeNew
              newLabel="+ Auto-Sense Discovery"
              onChange={(val) => {
                if (val === 'new') {
                  setSelectedDepId(null);
                  setSensedResults(null);
                  setSimulationResult(null);
                  setSelectedPlanForSense('');
                  selectDemand(null);
                } else {
                  setSelectedPlanForSense(val);
                  const matched = dependencies.find(d => d.plan_id === val);
                  if (matched) {
                    setSelectedDepId(matched.dependency_id);
                    setSensedResults(null);
                    setSimulationResult(null);
                    selectDemand(matched.demand_id);
                  } else {
                    setSelectedDepId(null);
                    setSensedResults(null);
                    setSimulationResult(null);
                    selectDemand(null);
                  }
                }
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {selectedDepId === null && !sensedResults && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                Auto-Sense Dependencies
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Select an active project plan to run the AI dependency extraction graph model.
              </p>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Target Project Plan</label>
                <select
                  value={selectedPlanForSense}
                  onChange={(e) => setSelectedPlanForSense(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="">-- Select Active Plan --</option>
                  {plans.map(p => (
                    <option key={p.plan_id} value={p.plan_id}>{p.demand_id} - {p.project_title || 'Active Schedule'}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleAutoSense}
                disabled={actionLoading || !selectedPlanForSense}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Analyze & Discover (AI)'}
              </button>
            </div>
          )}

          {sensedResults && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-display)' }}>Discovered Dependency Paths</h3>
              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--color-brand)', marginBottom: '0.5rem' }}>AI Extracted Edges</div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                  {sensedResults.detected_dependencies?.map((d, idx) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                      Task <b>{d.downstream_task}</b> depends on upstream predecessor <b>{d.upstream_task}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setSensedResults(null)}>Done</button>
            </div>
          )}

          {activeDep && (
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeDep.dependency_id}</span>
                  <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                    Blocking Task: {activeDep.upstream_task}
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <StatusPill status={activeDep.status === 'resolved' ? 'green' : 'amber'} label={activeDep.status} />
                  {activeDep.status !== 'resolved' && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleResolveDependency(activeDep.dependency_id)}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--color-status-green-border)', border: 'none', color: '#fff' }}
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>

              <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
                <button className={`tab-btn${activeTab === 'summary' ? ' active' : ''}`} onClick={() => setActiveTab('summary')}>Dependency Details</button>
                <button className={`tab-btn${activeTab === 'simulation' ? ' active' : ''}`} onClick={() => setActiveTab('simulation')}>Timeline Delay Simulation</button>
              </div>

              {activeTab === 'summary' && (
                <div>
                  <div className="grid-2col" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div className="data-item"><div className="data-label">Upstream Project</div><div className="data-value">{activeDep.upstream_project_id || 'Cross-project'}</div></div>
                    <div className="data-item"><div className="data-label">Downstream Task</div><div className="data-value">{activeDep.downstream_task}</div></div>
                    <div className="data-item"><div className="data-label">Threat Level</div><div className="data-value" style={{ textTransform: 'capitalize' }}>{activeDep.threat_level}</div></div>
                    <div className="data-item"><div className="data-label">Confidence Level</div><div className="data-value">{activeDep.confidence || 80}%</div></div>
                  </div>

                  {activeDep.status !== 'resolved' && (
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Trigger Follow-Up Nudge Alert</h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Alert Tone Tone</label>
                          <select value={tone} onChange={(e) => setTone(e.target.value)}>
                            <option value="friendly">Friendly Reminder</option>
                            <option value="polite">Professional Polite</option>
                            <option value="urgent">Urgent Escalation</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Notification Channel</label>
                          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                            <option value="teams">Microsoft Teams</option>
                            <option value="slack">Slack Channel</option>
                            <option value="email">SMTP Email Alert</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSendNudge(activeDep.dependency_id)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Spinner size="sm" /> : 'Send Nudge Alert'}
                      </button>
                    </div>
                  )}

                  {nudgeLog.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <div className="data-label">Generated Nudge History Log</div>
                      <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        {nudgeLog.map((log, idx) => (
                          <div key={idx} style={{ borderBottom: idx < nudgeLog.length - 1 ? '1px solid var(--border-color)' : 'none', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                            <div><b>Channel:</b> {log.channel} ({log.tone})</div>
                            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.25rem' }}>"{log.nudge_message}"</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'simulation' && (
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    Simulate schedule slippage to calculate critical path ripples and project target delivery deadline impacts.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Target Task ID</label>
                      <input
                        type="text"
                        value={simulateTaskId}
                        onChange={(e) => setSimulateTaskId(e.target.value)}
                        placeholder="e.g. task-1"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Delay Days count</label>
                      <input
                        type="number"
                        value={simulateDelayDays}
                        onChange={(e) => setSimulateDelayDays(parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleSimulateDelay(activeDep.plan_id)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Spinner size="sm" /> : 'Run Impact Simulation'}
                  </button>

                  {simulationResult && (
                    <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: simulationResult.project_end_date_slipped ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)' }}>
                        {simulationResult.project_end_date_slipped ? '⚠ Project Schedule Slipped!' : '✓ Delay Absorbed in Slack'}
                      </h4>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div>
                          <div className="data-label">Original End Date</div>
                          <div style={{ fontSize: '1.1rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{simulationResult.original_project_end_date}</div>
                        </div>
                        <div>
                          <div className="data-label">New Calculated End Date</div>
                          <div style={{ fontSize: '1.1rem', fontFamily: 'monospace', fontWeight: 'bold', color: simulationResult.project_end_date_slipped ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)' }}>{simulationResult.new_project_end_date}</div>
                        </div>
                      </div>

                      <div style={{ marginBottom: '1.25rem' }}>
                        <b>Affected Tasks:</b>
                        <ul style={{ margin: '0.3rem 0 0 0', paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {simulationResult.affected_tasks?.map((t, idx) => (
                            <li key={idx}>
                              Task <b>{t.task_id}</b> ({t.name}) slippage: {t.original_end_date} → {t.new_end_date}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '0.85rem' }}>
                        <b>AI Explanatory Narrative Summary:</b>
                        <p style={{ margin: '0.25rem 0 0 0', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                          {simulationResult.explanation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    sessionStorage.setItem('pendingEnvironmentsDemandId', activeDep.demand_id);
                    navigate('/config-environments');
                  }}
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 700 }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                  Next: Config Environments &nbsp;→
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
