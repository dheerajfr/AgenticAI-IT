import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { dependencyService } from '../services/dependencyService';
import { planningService } from '../services/planningService';
import { demandService } from '../services/demandService';
import StatusPill from '../components/common/StatusPill';

const CHASE_TRACKING_KEY_PREFIX = 'cadence_dep_chase_';

export default function Dependencies() {
  const { selectedDemand } = useProject();
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Sidebar and core page data states
  const [dependencies, setDependencies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [demands, setDemands] = useState([]);
  const [selectedDepId, setSelectedDepId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'ai-insights' | 'activity'
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-sense & manual entry states
  const [isAutoSenseMode, setIsAutoSenseMode] = useState(false);
  const [isManualEntryMode, setIsManualEntryMode] = useState(false);
  const [targetPlanId, setTargetPlanId] = useState('');
  const [manualEdgeId, setManualEdgeId] = useState('');
  const [manualStatus, setManualStatus] = useState('open');
  const [manualRisk, setManualRisk] = useState('medium');
  const [autoSensedEdges, setAutoSensedEdges] = useState([]);
  const [formError, setFormError] = useState('');

  // Task selection details inside Overview
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [taskDetail, setTaskDetail] = useState(null);

  // Graph data state
  const [graphData, setGraphData] = useState(null);

  // Chase workflow options
  const [chaseSetupOpen, setChaseSetupOpen] = useState(false);
  const [chaseTone, setChaseTone] = useState('friendly');
  const [chaseChannel, setChaseChannel] = useState('teams');
  const [chaseSchedule, setChaseSchedule] = useState('now');
  const [chaseRecipients, setChaseRecipients] = useState({
    owner: true,
    pm: false,
    arch: false
  });
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [activeNbas, setActiveNbas] = useState({
    sendReminder: false,
    scheduleSync: false,
    escalateLead: false,
    createRisk: false,
    wait24h: false
  });

  // Dynamic Deadline Tracking localstorage values
  const [deadlineDate, setDeadlineDate] = useState('');
  const [trackingState, setTrackingState] = useState({});

  // Impact analysis
  const [delayDays, setDelayDays] = useState(5);
  const [impactForecastResult, setImpactForecastResult] = useState(null);

  // Load dependency list and plans mapping
  const loadData = async () => {
    try {
      const depList = await dependencyService.getDependencies();
      setDependencies(depList || []);

      const planList = await planningService.getPlans();
      setPlans(planList || []);

      const demandList = await demandService.getDemands();
      setDemands(demandList || []);

      // Check if routed with handoff from Plan page
      const pendingSense = sessionStorage.getItem('pendingDepsAutoSense');
      const pendingPlanId = sessionStorage.getItem('dependencies_selected_plan_id');
      if (pendingSense === '1') {
        sessionStorage.removeItem('pendingDepsAutoSense');
        setIsAutoSenseMode(true);
        if (pendingPlanId) {
          setTargetPlanId(pendingPlanId);
          sessionStorage.removeItem('dependencies_selected_plan_id');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch graph details and first task details on dependency selection
  useEffect(() => {
    if (selectedDepId) {
      const dep = dependencies.find((d) => d.dependency_id === selectedDepId);
      if (dep) {
        // Setup local chase tracking states
        const rawTracking = localStorage.getItem(CHASE_TRACKING_KEY_PREFIX + selectedDepId);
        const parsedTracking = rawTracking ? JSON.parse(rawTracking) : {};
        setTrackingState(parsedTracking);
        setDeadlineDate(parsedTracking.deadline || '');
        setNudgeMessage(dep.draft_message || '');
        setChaseSetupOpen(false);

        // Fetch visual graph data
        const loadGraph = async () => {
          try {
            const res = await dependencyService.getDependencyGraph(selectedDepId, selectedTaskId || null);
            setGraphData(res);
          } catch (e) {
            console.error('Failed to load dependency graph', e);
          }
        };
        loadGraph();

        // Setup tasks detail selection
        if (dep.task_list && dep.task_list.length > 0) {
          const firstTask = dep.task_list[0];
          setSelectedTaskId(firstTask);
          loadTaskDetails(selectedDepId, firstTask);
        } else {
          setTaskDetail(null);
          setSelectedTaskId('');
        }
      }
    } else {
      setGraphData(null);
      setTaskDetail(null);
      setSelectedTaskId('');
    }
  }, [selectedDepId, dependencies]);

  // Load task details when selectedTaskId changes
  const loadTaskDetails = async (depId, taskId) => {
    try {
      const detail = await dependencyService.getTaskDetails(depId, taskId);
      setTaskDetail(detail);
    } catch (e) {
      console.error('Failed to load task details', e);
    }
  };

  const handleTaskChange = (taskId) => {
    setSelectedTaskId(taskId);
    if (selectedDepId) {
      loadTaskDetails(selectedDepId, taskId);
      // Re-fetch graph with selected task
      const reloadGraph = async () => {
        try {
          const res = await dependencyService.getDependencyGraph(selectedDepId, taskId);
          setGraphData(res);
        } catch (e) {
          console.error(e);
        }
      };
      reloadGraph();
    }
  };

  // Helper date logic
  const daysSince = (iso) => {
    if (!iso) return null;
    const from = new Date(iso);
    if (isNaN(from.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const daysUntil = (iso) => {
    if (!iso) return null;
    const to = new Date(iso);
    if (isNaN(to.getTime())) return null;
    return Math.ceil((to.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  // Local storage save helpers
  const saveChaseTrackingLocal = (patch) => {
    if (!selectedDepId) return;
    const updated = { ...trackingState, ...patch };
    setTrackingState(updated);
    localStorage.setItem(CHASE_TRACKING_KEY_PREFIX + selectedDepId, JSON.stringify(updated));
  };

  // Risk logic mapping
  const activeDep = dependencies.find((d) => d.dependency_id === selectedDepId);
  const computeDynamicRisk = (dep) => {
    if (!dep) return { level: 'low', confidence: 60, reasons: [] };
    const respondedAfterLastSend = !!(trackingState.lastSentAt && trackingState.lastResponseAt &&
      new Date(trackingState.lastResponseAt) > new Date(trackingState.lastSentAt));

    const daysSinceContact = daysSince(trackingState.lastSentAt);
    const daysToDeadline = daysUntil(trackingState.deadline);

    let level = dep.status === 'at-risk' ? 'high' : (dep.status === 'open' ? 'medium' : 'low');
    let score = dep.confidence || 60;

    if (daysSinceContact !== null && !respondedAfterLastSend) {
      if (daysSinceContact >= 3) {
        level = 'high';
        score = Math.max(score, 88);
      } else if (daysSinceContact >= 1) {
        if (level !== 'high') level = 'medium';
        score = Math.max(score, 70);
      }
    }

    if (daysToDeadline !== null) {
      if (daysToDeadline <= 2) {
        level = 'high';
        score = Math.max(score, 92);
      } else if (daysToDeadline <= 7 && level === 'low') {
        level = 'medium';
        score = Math.max(score, 65);
      }
    }

    if (dep.status === 'resolved') {
      level = 'low';
      score = Math.max(score, 90);
    }

    score = Math.max(5, Math.min(99, score));

    const reasons = [];
    if (daysSinceContact !== null) {
      reasons.push(respondedAfterLastSend
        ? `Owner replied after the last nudge (sent ${daysSinceContact} day${daysSinceContact === 1 ? '' : 's'} ago)`
        : `No reply ${daysSinceContact} day${daysSinceContact === 1 ? '' : 's'} after the last nudge was sent`);
    }
    if (daysToDeadline !== null) {
      reasons.push(daysToDeadline >= 0
        ? `Deadline in ${daysToDeadline} day${daysToDeadline === 1 ? '' : 's'}`
        : `Deadline passed ${Math.abs(daysToDeadline)} day${Math.abs(daysToDeadline) === 1 ? '' : 's'} ago`);
    }

    const threatColorVar = level === 'high' ? 'red' : level === 'medium' ? 'amber' : 'green';
    const threatEmoji = level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '🟢';

    return { level, confidence: Math.round(score), reasons, daysSinceContact, daysToDeadline, threatColorVar, threatEmoji };
  };

  const dynamicRisk = activeDep ? computeDynamicRisk(activeDep) : null;

  // Plan mapping
  const planToDemandMap = {};
  plans.forEach((p) => {
    planToDemandMap[p.plan_id] = p.demand_id;
  });

  const getPlanTitle = (planId) => {
    const demandId = planToDemandMap[planId];
    if (demandId) {
      const dm = demands.find((d) => d.demand_id === demandId);
      return dm ? dm.title : demandId;
    }
    return planId;
  };

  // Filter dependencies listing
  const filteredDeps = dependencies.filter((d) => {
    const q = searchTerm.toLowerCase();
    const demandId = planToDemandMap[d.plan_id] || d.plan_id;
    const title = getPlanTitle(d.plan_id);
    return (
      d.dependency_id.toLowerCase().includes(q) ||
      demandId.toLowerCase().includes(q) ||
      title.toLowerCase().includes(q)
    );
  });

  // Action: mark resolved / undo resolve
  const handleToggleResolve = async (resolvedState) => {
    if (!selectedDepId) return;
    showLoader('Updating dependency status...');
    try {
      await dependencyService.updateStatus(selectedDepId, {
        status: resolvedState ? 'resolved' : 'open',
        comment: resolvedState ? 'Marked as resolved by user' : 'Reopened by user'
      });
      // Add Activity history log entry
      await dependencyService.addActivity(selectedDepId, {
        activity: resolvedState ? '✓ Dependency marked resolved' : '↩ Dependency reopened'
      });
      await loadData();
      showToast(resolvedState ? 'Dependency resolved' : 'Dependency reopened');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: Escalate
  const handleEscalate = async () => {
    if (!activeDep) return;
    const subject = `Escalation needed: ${activeDep.dependency_id}`;
    const body = `Dependency ${activeDep.dependency_id} (${activeDep.source_task_id || 'Task'} → ${activeDep.target_task_id || 'Task'}) is currently "${activeDep.status}" and needs Team Lead attention.\n\nOwner: ${activeDep.owner}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    await dependencyService.addActivity(activeDep.dependency_id, {
      activity: '⚠️ Escalated to Manager / Release Lead'
    });
    await loadData();
    showToast('Escalation draft created');
  };

  // AI discovery run
  const handleRunSense = async () => {
    if (!targetPlanId) return;
    showLoader('Sifting task titles and owner boundaries...');
    try {
      const res = await dependencyService.senseDependencies({ plan_id: targetPlanId });
      setAutoSensedEdges(res.detected_dependencies || []);
      await loadData();
      showToast('LangGraph dependency discovery completed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Manual entry create
  const handleCreateManualEdge = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!targetPlanId) {
      setFormError('Please select a Target Project Plan');
      return;
    }
    showLoader('Creating dependency record...');
    try {
      const res = await dependencyService.createDependency({
        dependency_id: manualEdgeId.trim() || undefined,
        plan_id: targetPlanId,
        status: manualStatus,
        risk: manualRisk
      });
      setSelectedDepId(res.dependency_id);
      setIsManualEntryMode(false);
      setManualEdgeId('');
      await loadData();
      showToast('Dependency created successfully');
    } catch (err) {
      setFormError(err.message);
    } finally {
      hideLoader();
    }
  };

  // Nudge communication generator
  const handleGenerateNudge = async () => {
    if (!selectedDepId) return;
    showLoader('Generative AI drafting nudge...');
    try {
      const res = await dependencyService.draftCommunication(selectedDepId, {
        tone: chaseTone,
        channel: chaseChannel,
        schedule: chaseSchedule
      });
      setNudgeMessage(res.draft_message || '');
      setChaseSetupOpen(false);
      await loadData();
      showToast('Nudge message drafted');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleSaveDraftMessage = async () => {
    if (!selectedDepId) return;
    showLoader('Saving message draft...');
    try {
      await dependencyService.draftCommunication(selectedDepId, {
        tone: chaseTone,
        channel: chaseChannel,
        schedule: chaseSchedule,
        draft_message: nudgeMessage
      });
      await loadData();
      showToast('Draft message saved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleSendMessage = async () => {
    if (!activeDep) return;
    const bodyText = nudgeMessage || `Following up on ${activeDep.dependency_id} — could you share a status update?`;
    window.location.href = `mailto:${activeDep.owner}?subject=${encodeURIComponent('Reminder: ' + activeDep.dependency_id + ' needs your update')}&body=${encodeURIComponent(bodyText)}`;
    
    saveChaseTrackingLocal({ lastSentAt: new Date().toISOString(), lastResponseAt: null });
    await dependencyService.addActivity(activeDep.dependency_id, {
      activity: `✉ Reminder email drafted and sent to ${activeDep.owner}`
    });
    await loadData();
    showToast('Reminder sent');
  };

  // Next best action mapping triggers
  const handleTriggerNbaAction = async (nbaKey) => {
    if (!activeDep) return;
    setActiveNbas({ ...activeNbas, [nbaKey]: true });

    if (nbaKey === 'sendReminder') {
      handleSendMessage();
    } else if (nbaKey === 'scheduleSync') {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 15 * 60 * 1000);
      const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const title = encodeURIComponent(`15 min sync: ${activeDep.dependency_id}`);
      const details = encodeURIComponent(`Quick sync to unblock dependency ${activeDep.dependency_id}. Owner: ${activeDep.owner}`);
      const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
      window.open(calUrl, '_blank');
      await dependencyService.addActivity(activeDep.dependency_id, {
        activity: `📅 15-min sync calendar invitation generated for ${activeDep.owner}`
      });
      await loadData();
      showToast('Calendar link generated');
    } else if (nbaKey === 'escalateLead') {
      handleEscalate();
    } else if (nbaKey === 'createRisk') {
      const riskText = `Title: Risk — ${activeDep.dependency_id}\nDescription: Dependency ${activeDep.source_task_id || 'Task'} → ${activeDep.target_task_id || 'Task'} is "${activeDep.status}".\nOwner: ${activeDep.owner}`;
      try {
        await navigator.clipboard.writeText(riskText);
        alert('Risk details copied to clipboard. Go to ADO to create Risk.');
      } catch (err) {
        prompt('Copy this risk text:', riskText);
      }
      await dependencyService.addActivity(activeDep.dependency_id, {
        activity: '🚨 Risk details generated for copy-paste'
      });
      await loadData();
      showToast('Risk details copied');
    } else if (nbaKey === 'wait24h') {
      await dependencyService.addActivity(activeDep.dependency_id, {
        activity: '⏳ Follow-up snoozed for 24 hours'
      });
      await loadData();
      showToast('Snoozed follow-up');
    } else if (nbaKey === 'updatePredecessor') {
      const choice = prompt('Update status/ETA for predecessor task:\n1. Open\n2. At Risk\n3. Resolved\nEnter number 1-3:', '3');
      if (choice) {
        const mapped = choice === '1' ? 'open' : choice === '2' ? 'at-risk' : 'resolved';
        showLoader('Updating predecessor status...');
        try {
          await dependencyService.updateStatus(activeDep.dependency_id, { status: mapped });
          await dependencyService.addActivity(activeDep.dependency_id, {
            activity: `✓ Task status changed to ${mapped}`
          });
          await loadData();
          showToast('Predecessor status updated');
        } catch (e) {
          showToast(e.message, 'error');
        } finally {
          hideLoader();
        }
      }
    }
  };

  // Check Impact forecast analysis
  const handleTriggerImpactForecast = async () => {
    if (!activeDep || !selectedTaskId) return;
    showLoader('Forecasting ripple impact...');
    try {
      const res = await dependencyService.checkImpact({
        dependency_id: activeDep.dependency_id,
        task_id: selectedTaskId,
        delay_days: parseInt(delayDays) || 5
      });
      setImpactForecastResult(res);
      showToast('Ripple impact forecast calculated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  return (
    <div className="intake-screen">
      {/* Sidebar dependencies list */}
      <aside className="sidebar">
        <div className="sidebar-search" style={{ padding: '1rem' }}>
          <input
            type="text"
            placeholder="Search dependencies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
          />
        </div>
        <ul className="demand-list">
          {filteredDeps.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No dependencies found.
            </li>
          ) : (
            filteredDeps.map((d) => {
              const active = d.dependency_id === selectedDepId;
              const title = getPlanTitle(d.plan_id);
              return (
                <li
                  key={d.dependency_id}
                  className={`demand-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDepId(d.dependency_id);
                    setIsAutoSenseMode(false);
                    setIsManualEntryMode(false);
                  }}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{d.dependency_id}</span>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }} className={d.status === 'resolved' ? 'green' : d.status === 'at-risk' ? 'red' : 'amber'}>
                      {d.status}
                    </span>
                  </div>
                  <h4 className="demand-item-title">{title}</h4>
                  <div className="demand-item-meta">
                    <span>Owner: {d.owner.split('@')[0]}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main viewport */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Dependency Workspace</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                setIsAutoSenseMode(true);
                setIsManualEntryMode(false);
                setSelectedDepId(null);
                setAutoSensedEdges([]);
              }}
              className="btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              🤖 Auto-Sense
            </button>
            <button
              onClick={() => {
                setIsManualEntryMode(true);
                setIsAutoSenseMode(false);
                setSelectedDepId(null);
              }}
              className="btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              ➕ Manual Edge
            </button>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {isAutoSenseMode ? (
            /* AUTO-SENSE DISCOVERY PANELS */
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem' }}>
                Auto-Sense Plan Dependencies
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Select an active project plan. LangGraph will perform semantic checks and automatically save predecessor risk edges.
              </p>

              <div className="form-group">
                <label htmlFor="select-plan">Target Project Plan</label>
                <select
                  id="select-plan"
                  value={targetPlanId}
                  onChange={(e) => setTargetPlanId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Choose Plan --</option>
                  {plans.map((p) => (
                    <option key={p.plan_id} value={p.plan_id}>
                      {p.plan_id} - {getPlanTitle(p.plan_id)}
                    </option>
                  ))}
                </select>
              </div>

              {autoSensedEdges.length > 0 && (
                <div style={{ background: 'rgba(52, 211, 153, 0.04)', border: '1px solid var(--color-status-green-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginTop: '1.5rem' }}>
                  <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-status-green-text)' }}>
                    Successfully Sensed & Saved {autoSensedEdges.length} Edge(s)
                  </h5>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.5rem' }}>Edge ID</th>
                        <th style={{ padding: '0.5rem' }}>Relationship</th>
                        <th style={{ padding: '0.5rem' }}>Type</th>
                        <th style={{ padding: '0.5rem' }}>Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {autoSensedEdges.map((e) => (
                        <tr key={e.dependency_id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                          <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-brand)' }}>{e.dependency_id}</td>
                          <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace' }}>{e.source_task_id} &rarr; {e.target_task_id}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textTransform: 'capitalize' }}>{e.type.replace('-', ' ')}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{e.owner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="submit-row" style={{ marginTop: '2rem' }}>
                <button type="button" className="btn-primary" onClick={handleRunSense} disabled={!targetPlanId}>
                  Analyze Plan & Extract
                </button>
              </div>
            </div>
          ) : isManualEntryMode ? (
            /* MANUAL ENTRY PLAN LEVEL DEPENDENCY FORM */
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem' }}>
                Manual Dependency Entry
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Manually record and document dependency relationships between delivery plans.
              </p>

              {formError && <div className="error-message" style={{ display: 'block' }}>{formError}</div>}

              <form onSubmit={handleCreateManualEdge}>
                <div className="grid-2col">
                  <div className="form-group">
                    <label>Target Project Plan *</label>
                    <select
                      value={targetPlanId}
                      onChange={(e) => setTargetPlanId(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    >
                      <option value="">-- Select Plan --</option>
                      {plans.map((p) => (
                        <option key={p.plan_id} value={p.plan_id}>
                          {p.plan_id} - {getPlanTitle(p.plan_id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Custom Edge ID (Optional)</label>
                    <input
                      type="text"
                      placeholder="Leave empty to auto-generate (DEP-XXXX)"
                      value={manualEdgeId}
                      onChange={(e) => setManualEdgeId(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={manualStatus} onChange={(e) => setManualStatus(e.target.value)}>
                      <option value="open">Open</option>
                      <option value="at-risk">At Risk</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Risk Level</label>
                    <select value={manualRisk} onChange={(e) => setManualRisk(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="submit-row" style={{ marginTop: '2rem' }}>
                  <button type="submit" className="btn-primary">
                    Create Dependency Record
                  </button>
                </div>
              </form>
            </div>
          ) : activeDep ? (
            /* DETAILED WORKSPACE WIZARD */
            <div>
              {/* Header block */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{planToDemandMap[activeDep.plan_id] || activeDep.dependency_id}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)' }}>
                    Dependency Analysis <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>({activeDep.dependency_id})</span>
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {activeDep.status !== 'resolved' ? (
                    <button type="button" onClick={() => handleToggleResolve(true)} className="btn-primary" style={{ backgroundColor: 'var(--color-status-green-bg)', borderColor: 'var(--color-status-green-border)', color: 'var(--color-status-green-text)', height: '32px', padding: '0 0.75rem' }}>
                      Mark Resolved
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleToggleResolve(false)} className="btn-secondary" style={{ backgroundColor: 'var(--color-status-amber-bg)', borderColor: 'var(--color-status-amber-border)', color: 'var(--color-status-amber-text)', height: '32px', padding: '0 0.75rem' }}>
                      ↩ Undo Resolve
                    </button>
                  )}
                  <span style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }} className={activeDep.status === 'resolved' ? 'green' : activeDep.status === 'at-risk' ? 'red' : 'amber'}>
                    {activeDep.status}
                  </span>
                </div>
              </div>

              {/* Resolved pipeline completion banner */}
              {activeDep.status === 'resolved' && (
                <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', background: 'rgba(16,185,129,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', fill: '#10b981' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>🎉 Pipeline Complete!</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>All dependencies for this demand have been resolved.</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        setIsAutoSenseMode(true);
                        setSelectedDepId(null);
                      }}
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                    >
                      ↺ Re-sense
                    </button>
                    <button
                      onClick={() => navigate('/config-environments')}
                      className="btn-primary"
                      style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                    >
                      Next: Config Environments &nbsp;&rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Tabs selector */}
              <div className="dep-tab-bar">
                <button className={`dep-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>🧩 Overview</button>
                <button className={`dep-tab ${activeTab === 'ai-insights' ? 'active' : ''}`} onClick={() => setActiveTab('ai-insights')}>🤖 AI Insights</button>
                <button className={`dep-tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>📜 Activity</button>
              </div>

              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div>
                  {/* Step 1: Sense Dependencies */}
                  <div className="wizard-step completed">
                    <div className="wizard-step-header">
                      <h4 className="wizard-step-title"><span className="wizard-step-num">1</span> Sense Dependencies</h4>
                      <StatusPill status="Approved" />
                    </div>
                    <div className="wizard-step-body">
                      {activeDep.is_self_dependency && (
                        <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid var(--color-status-amber-border)', borderLeft: '4px solid var(--color-status-amber-text)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                          <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-status-amber-text)' }}>⚠️ Self Dependency</h5>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Both tasks are assigned to <strong>{activeDep.owner}</strong>. Since you own both tasks in this dependency chain, please update your predecessor task status.
                          </p>
                        </div>
                      )}

                      {activeDep.task_list && activeDep.task_list.length > 0 ? (
                        <div>
                          <div style={{ marginBottom: '1.25rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                            <label htmlFor="detail-task-select" style={{ fontWeight: 700, color: 'var(--color-brand)', display: 'block', marginBottom: '0.4rem' }}>Select Task</label>
                            <select
                              id="detail-task-select"
                              value={selectedTaskId}
                              onChange={(e) => handleTaskChange(e.target.value)}
                              style={{ fontSize: '0.9rem', padding: '0.4rem', width: '100%', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                            >
                              {activeDep.task_list.map((tId) => (
                                <option key={tId} value={tId}>
                                  {tId.includes('-') ? tId.split('-').pop() : tId}
                                </option>
                              ))}
                            </select>
                          </div>

                          {taskDetail && (
                            <div className="grid-2col" style={{ marginBottom: '1.25rem' }}>
                              <div className="data-item">
                                <div className="data-label">Current Task</div>
                                <div className="data-value" style={{ fontWeight: 700, color: 'var(--color-brand)' }}>{taskDetail.task_id}: {taskDetail.task_name}</div>
                              </div>
                              <div className="data-item">
                                <div className="data-label">Owner</div>
                                <div className="data-value">{taskDetail.owner}</div>
                              </div>
                              <div className="data-item">
                                <div className="data-label">Depends On</div>
                                <div className="data-value" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{taskDetail.predecessor_id || '—'}</div>
                              </div>
                              <div className="data-item">
                                <div className="data-label">Previous Owner</div>
                                <div className="data-value">{taskDetail.previous_owner || 'N/A'}</div>
                              </div>
                              <div className="data-item">
                                <div className="data-label">Dependency Status</div>
                                <div className="data-value" style={{ textTransform: 'capitalize' }}>{taskDetail.status}</div>
                              </div>
                              <div className="data-item">
                                <div className="data-label">Risk</div>
                                <div className="data-value" style={{ textTransform: 'capitalize' }}>{taskDetail.risk || 'Low'}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid-2col" style={{ marginBottom: '1.25rem' }}>
                          <div className="data-item">
                            <div className="data-label">Source Task ID (Dependent)</div>
                            <div className="data-value" style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-brand)' }}>{activeDep.source_task_id}</div>
                          </div>
                          <div className="data-item">
                            <div className="data-label">Target Task ID (Predecessor)</div>
                            <div className="data-value" style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{activeDep.target_task_id}</div>
                          </div>
                          <div className="data-item">
                            <div className="data-label">Dependency Type</div>
                            <div className="data-value" style={{ textTransform: 'capitalize' }}>{activeDep.type.replace('-', ' ')}</div>
                          </div>
                          <div className="data-item">
                            <div className="data-label">Accountable Owner</div>
                            <div className="data-value">{activeDep.owner}</div>
                          </div>
                        </div>
                      )}

                      {/* Visual Graph panel */}
                      {graphData && (
                        <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '1rem', marginTop: '0.75rem', marginBottom: '1.5rem' }}>
                          <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Dependency Chain Graph</h5>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', overflowX: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                            {graphData.nodes.map((node, index) => {
                              let typeLabel = 'Task';
                              let colorClass = 'gray';
                              if (node.type === 'predecessor') {
                                typeLabel = 'Predecessor Task';
                                colorClass = 'amber';
                              } else if (node.type === 'dependent') {
                                typeLabel = 'Dependent Task';
                                colorClass = 'brand';
                              } else if (node.type === 'release') {
                                typeLabel = 'Milestone Release';
                                colorClass = 'green';
                              }
                              const isLast = index === graphData.nodes.length - 1;
                              const borderStyle = {
                                flex: 1,
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.75rem 1rem',
                                boxShadow: 'var(--shadow-sm)',
                                borderLeft: `4px solid ${colorClass === 'brand' ? 'var(--color-brand)' : 'var(--color-status-' + colorClass + '-text)'}`
                              };

                              return (
                                <div key={node.id} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: '150px' }}>
                                  <div style={borderStyle}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>{typeLabel}</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                                      {node.id === 'RELEASE_NODE' ? node.label : `${node.id}: ${node.label}`}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Owner: {node.owner.split('@')[0]}</div>
                                  </div>
                                  {!isLast && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 0.5rem', color: 'var(--color-brand)', minWidth: '45px' }}>
                                      <svg style={{ width: '20px', height: '20px', fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                                      <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        {graphData.links[index]?.type || ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Chase Commitments (AI) */}
                  <div className={`wizard-step ${activeDep.status === 'resolved' ? 'completed' : 'active'}`}>
                    <div className="wizard-step-header">
                      <h4 className="wizard-step-title"><span className="wizard-step-num">2</span> Chase Commitments (AI)</h4>
                      <span className={`wf-badge ${activeDep.draft_message ? 'low' : 'medium'}`}>{activeDep.draft_message ? 'Approved' : 'Pending Run'}</span>
                    </div>
                    <div className="wizard-step-body">
                      {!chaseSetupOpen && !nudgeMessage && (
                        <div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                            Run the commitment chase agent to analyze delay risks, compile context evidence, and generate personalized nudge communications.
                          </p>
                          <button type="button" className="btn-primary" onClick={() => setChaseSetupOpen(true)} style={{ width: '100%' }}>
                            Trigger Chase Workflow (AI)
                          </button>
                        </div>
                      )}

                      {chaseSetupOpen && (
                        <div style={{ marginTop: '1rem' }}>
                          <p className="description-text" style={{ marginBottom: '1rem' }}>Configure the AI chase reminder options:</p>

                          <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Message Tone</label>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              {['friendly', 'business', 'technical', 'executive', 'escalation', 'urgent', 'short'].map((t) => (
                                <button key={t} type="button" className={`wf-btn-toggle ${chaseTone === t ? 'active' : ''}`} onClick={() => setChaseTone(t)}>
                                  {t === 'friendly' ? '😊 Friendly' : t === 'business' ? '💼 Professional' : t === 'technical' ? '🔧 Technical' : t === 'executive' ? '📊 Executive' : t === 'escalation' ? '⚠️ Escalation' : t === 'urgent' ? '🚨 Urgent' : '🤝 Diplomatic'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Delivery Channel</label>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              {['teams', 'email', 'slack', 'ado'].map((ch) => (
                                <button key={ch} type="button" className={`wf-btn-toggle ${chaseChannel === ch ? 'active' : ''}`} onClick={() => setChaseChannel(ch)}>
                                  {ch === 'teams' ? '💬 Teams' : ch === 'email' ? '📧 Email' : ch === 'slack' ? '⚡ Slack' : '🔷 ADO'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Schedule</label>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              {['now', '1hour', 'tomorrow', 'custom'].map((s) => (
                                <button key={s} type="button" className={`wf-btn-toggle ${chaseSchedule === s ? 'active' : ''}`} onClick={() => setChaseSchedule(s)}>
                                  {s === 'now' ? 'Send Now' : s === '1hour' ? 'In 1 Hour' : s === 'tomorrow' ? 'Tomorrow 9am' : 'Custom'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setChaseSetupOpen(false)} style={{ flex: 1 }}>Cancel</button>
                            <button type="button" className="btn-primary" onClick={handleGenerateNudge} style={{ flex: 2 }}>Generate Nudge Message</button>
                          </div>
                        </div>
                      )}

                      {nudgeMessage && (
                        <div style={{ marginTop: '1.5rem' }}>
                          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem' }}>
                            <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>💡 AI Suggested Next Best Actions</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              {activeDep.is_self_dependency ? (
                                <>
                                  <label className={`ai-pill ${activeNbas.updatePredecessor ? 'active' : ''}`} onClick={() => handleTriggerNbaAction('updatePredecessor')} style={{ cursor: 'pointer' }}>Update predecessor task</label>
                                  <label className="ai-pill" style={{ cursor: 'pointer' }}>Mark task complete</label>
                                  <label className="ai-pill" style={{ cursor: 'pointer' }}>Revise ETA</label>
                                  <label className="ai-pill" style={{ cursor: 'pointer' }}>Notify stakeholders</label>
                                </>
                              ) : (
                                <>
                                  <label className={`ai-pill ${activeNbas.sendReminder ? 'active' : ''}`} onClick={() => handleTriggerNbaAction('sendReminder')} style={{ cursor: 'pointer' }}>✉ Send reminder</label>
                                  <label className={`ai-pill ${activeNbas.scheduleSync ? 'active' : ''}`} onClick={() => handleTriggerNbaAction('scheduleSync')} style={{ cursor: 'pointer' }}>📅 Schedule 15 min sync</label>
                                  <label className={`ai-pill ${activeNbas.escalateLead ? 'active' : ''}`} onClick={() => handleTriggerNbaAction('escalateLead')} style={{ cursor: 'pointer' }}>⚠️ Escalate to Team Lead</label>
                                  <label className={`ai-pill ${activeNbas.createRisk ? 'active' : ''}`} onClick={() => handleTriggerNbaAction('createRisk')} style={{ cursor: 'pointer' }}>🚨 Create Risk Item</label>
                                  <label className={`ai-pill ${activeNbas.wait24h ? 'active' : ''}`} onClick={() => handleTriggerNbaAction('wait24h')} style={{ cursor: 'pointer' }}>⏳ Wait 24 hrs</label>
                                </>
                              )}
                            </div>
                            <div style={{ background: 'rgba(99,102,241,0.03)', border: '1px solid rgba(99,102,241,0.1)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.8rem' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>AI Recommendation</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {activeDep.is_self_dependency ? 'Both tasks are owned by you. Update predecessor task details directly.' : (activeDep.status === 'at-risk' ? 'Schedule Teams meeting before escalation.' : 'Send friendly reminder first, then follow up in 48hrs.')}
                              </div>
                            </div>
                          </div>

                          {!activeDep.is_self_dependency && (
                            <div className="form-group">
                              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Nudge Message</label>
                              <textarea className="wf-textarea" value={nudgeMessage} onChange={(e) => setNudgeMessage(e.target.value)} placeholder="Generated message will appear here..." />
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                            {activeDep.is_self_dependency ? (
                              <button type="button" className="btn-primary" onClick={() => handleTriggerNbaAction('updatePredecessor')} style={{ backgroundValue: 'var(--color-brand)', height: '36px', padding: '0 1rem', fontSize: '0.85rem', flexGrow: 1 }}>
                                Take Action (Update Predecessor Task)
                              </button>
                            ) : (
                              <>
                                <button type="button" className="btn-secondary" onClick={handleSaveDraftMessage} style={{ height: '36px' }}>Save Draft</button>
                                <button type="button" className="btn-primary" onClick={handleSendMessage} style={{ backgroundColor: 'var(--color-brand)', height: '36px', padding: '0 1rem', fontSize: '0.85rem', flexGrow: 1 }}>
                                  Send via {chaseChannel.charAt(0).toUpperCase() + chaseChannel.slice(1)}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Cross-Programme Impact */}
                  <div className={`wizard-step ${activeDep.status === 'resolved' ? 'completed' : 'locked'}`}>
                    <div className="wizard-step-header">
                      <h4 className="wizard-step-title"><span className="wizard-step-num">3</span> Cross-Programme Impact</h4>
                      <span className={`wf-badge ${activeDep.status === 'resolved' ? 'low' : 'medium'}`}>{activeDep.status === 'resolved' ? 'Resolved' : 'Locked'}</span>
                    </div>
                    <div className="wizard-step-body">
                      <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Cross-Programme Ripple Impact Analysis</h5>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Forecast timeline slippages and schedule relaxation ripples across the program when a task is delayed.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Delayed Task ID</label>
                          <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                            {(activeDep.task_list || []).map((tId) => (
                              <option key={tId} value={tId}>{tId}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Delay Days</label>
                          <input type="number" value={delayDays} onChange={(e) => setDelayDays(e.target.value)} min="1" style={{ width: '100%' }} />
                        </div>
                        <div>
                          <button type="button" className="btn-secondary" onClick={handleTriggerImpactForecast} style={{ height: '42px', padding: '0 1rem' }}>
                            Forecast Impact
                          </button>
                        </div>
                      </div>

                      {impactForecastResult && (
                        <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-md)', padding: '1rem', marginTop: '1rem' }}>
                          <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700 }}>Forecast Results</h5>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                            Verdict: <strong style={{ color: 'var(--color-status-amber-text)' }}>{impactForecastResult.verdict || 'Slippage Detected'}</strong>
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                            {impactForecastResult.reason || 'Calculated project timeline shift.'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Critical Path Action */}
                  {(activeDep.status === 'at-risk' || activeDep.status === 'open') && (
                    <div style={{ backgroundColor: 'rgba(248, 113, 113, 0.02)', border: '1px solid var(--color-status-red-border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem' }}>
                      <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-status-red-text)' }}>Critical Path Action: Escalate Risk</h5>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                        This dependency is on the critical path. If task delays threaten project release milestones, immediately escalate to leadership.
                      </p>
                      <button type="button" className="btn-primary" onClick={handleEscalate} style={{ backgroundColor: 'var(--color-status-red-bg)', border: '1px solid var(--color-status-red-border)', color: 'var(--color-status-red-text)', width: '100%' }}>
                        Escalate to Manager / Release Lead
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* AI INSIGHTS TAB */}
              {activeTab === 'ai-insights' && dynamicRisk && (
                <div>
                  <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', borderLeft: `4px solid var(--color-status-${dynamicRisk.threatColorVar}-text)` }}>
                    <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>🧠 AI Risk Assessment</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Threat Level</div>
                        <div style={{ fontSize: '1.4rem' }}>{dynamicRisk.threatEmoji}</div>
                        <div style={{ fontSize: '0.85rem', fontValue: 700, textTransform: 'uppercase', color: `var(--color-status-${dynamicRisk.threatColorVar}-text)`, marginTop: '0.2rem' }}>{dynamicRisk.level}</div>
                      </div>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Sensing Confidence</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-brand)' }}>{dynamicRisk.confidence}%</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <div className="conf-bar"><div className="conf-bar-fill" style={{ width: `${dynamicRisk.confidence}%`, background: dynamicRisk.confidence > 80 ? 'var(--color-status-green-text)' : dynamicRisk.confidence > 60 ? 'var(--color-status-amber-text)' : 'var(--color-status-red-text)' }}></div></div>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Sensing Rationale</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        <li style={{ padding: '0.2rem 0', fontSize: '0.8rem', color: 'var(--text-primary)' }}>✓ Dependency owner has not responded for {dynamicRisk.daysSinceContact ?? 'N/A'} day{(dynamicRisk.daysSinceContact === 1) ? '' : 's'}</li>
                        {(dynamicRisk.reasons || []).map((r, idx) => (
                          <li key={idx} style={{ padding: '0.2rem 0', fontSize: '0.8rem', color: 'var(--text-primary)' }}>✓ {r}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Deadline</label>
                        <input
                          type="date"
                          value={deadlineDate}
                          onChange={(e) => setDeadlineDate(e.target.value)}
                          style={{ height: '34px', padding: '0.4rem', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', borderRadius: '4px' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          saveChaseTrackingLocal({ deadline: deadlineDate });
                          showToast('Deadline updated');
                        }}
                        className="ai-action-btn"
                        style={{ alignSelf: 'flex-end', height: '34px' }}
                      >
                        💾 Save Deadline
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveChaseTrackingLocal({ lastResponseAt: new Date().toISOString() });
                          showToast('Response logged');
                        }}
                        className="ai-action-btn"
                        style={{ alignSelf: 'flex-end', height: '34px' }}
                      >
                        ✓ Owner Responded Today
                      </button>
                    </div>
                  </div>

                  {/* Agent Coordination */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>🕸️ Agent Coordination</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="coord-agent">
                        <span className="agent-dot" style={{ background: 'var(--color-brand)' }}></span>
                        <span className="agent-name" style={{ flex: 1 }}>Cross-Programme Impact</span>
                        <span className="agent-status" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Idle</span>
                      </div>
                      <div className="coord-agent">
                        <span className="agent-dot" style={{ background: 'var(--color-status-green-text)' }}></span>
                        <span className="agent-name" style={{ flex: 1 }}>Dependency Sensing</span>
                        <span className="agent-status" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Complete</span>
                      </div>
                      <div className="coord-agent">
                        <span className="agent-dot" style={{ background: activeDep.draft_message ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}></span>
                        <span className="agent-name" style={{ flex: 1 }}>Commitment Chase</span>
                        <span className="agent-status" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{activeDep.draft_message ? 'Complete' : 'Pending'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ACTIVITY TAB */}
              {activeTab === 'activity' && (
                <div>
                  <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>📜 Activity History</h5>
                  {(!activeDep.activity_history || activeDep.activity_history.length === 0) ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activity recorded yet.</div>
                  ) : (
                    <ul className="hist-timeline" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {activeDep.activity_history.slice().reverse().map((entry, idx) => {
                        const text = typeof entry === 'string' ? entry : (entry.activity || entry.text || JSON.stringify(entry));
                        const ts = typeof entry === 'object' && entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
                        return (
                          <li key={idx} className="hist-entry">
                            <span className="hist-dot info">•</span>
                            <div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{text}</div>
                              {ts && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{ts}</div>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a dependency or click "Auto-Sense" to begin.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
