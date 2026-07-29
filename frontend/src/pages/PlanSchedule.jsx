import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { planningService } from '../services/planningService';
import { estimateService } from '../services/estimateService';
import { demandService } from '../services/demandService';
import StatusPill from '../components/common/StatusPill';

export default function PlanSchedule() {
  const { selectedDemand } = useProject();
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Component data states
  const [plans, setPlans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [demands, setDemands] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Replan history log
  const [replanHistory, setReplanHistory] = useState([]);

  // Draft/Generate suggestions
  const [suggestedPlan, setSuggestedPlan] = useState(null);

  // Replanning form fields
  const [showReplanForm, setShowReplanForm] = useState(false);
  const [replanEffort, setReplanEffort] = useState(10);
  const [replanStartDate, setReplanStartDate] = useState('');
  const [replanWorkDays, setReplanWorkDays] = useState(5);
  const [replanUtil, setReplanUtil] = useState(85);
  const [replanReason, setReplanReason] = useState('');
  const [replanError, setReplanError] = useState('');

  // Load plans, employees, sizing estimates, and demands
  const loadData = async () => {
    try {
      const planList = await planningService.getPlans();
      setPlans(planList || []);

      const empList = await planningService.getEmployees();
      setEmployees(empList || []);

      const estList = await estimateService.getEstimates();
      setEstimates(estList || []);

      const demandList = await demandService.getDemands();
      setDemands(demandList || []);

      // Check if there is a pending estimate handoff from Stage 2
      const pendingEstId = sessionStorage.getItem('pendingPlanEstimateId');
      if (pendingEstId) {
        setSelectedEstimateId(pendingEstId);
        sessionStorage.removeItem('pendingPlanEstimateId');
      }
    } catch (e) {
      console.error('Failed to load planning data', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Whenever selectedPlanId changes, fetch replan history
  useEffect(() => {
    if (selectedPlanId) {
      const loadHistory = async () => {
        try {
          const list = await planningService.getPlanHistory(selectedPlanId);
          setReplanHistory(list || []);
        } catch (e) {
          console.error('Failed to load history', e);
        }
      };
      loadHistory();
    } else {
      setReplanHistory([]);
    }
  }, [selectedPlanId]);

  // Sidebar selection
  const handleSelectPlan = (id) => {
    setSelectedPlanId(id);
    setSuggestedPlan(null);
    setShowReplanForm(false);
  };

  // Approved estimates selector list
  const approvedEstimates = estimates.filter(
    (e) => e.status === 'approved' || e.status === 're-baselined'
  );

  // Helper: map emails or raw names to full names
  const getEmployeeDisplayName = (owner) => {
    if (!owner) return 'unassigned';
    if (owner.includes(',')) {
      return owner
        .split(',')
        .map((o) => getEmployeeDisplayName(o.trim()))
        .join(', ');
    }
    const emp = employees.find(
      (e) =>
        (e.email || '').toLowerCase() === owner.toLowerCase() ||
        (e.name || '').toLowerCase() === owner.toLowerCase()
    );
    if (emp && emp.name) return emp.name;
    if (owner.includes('@')) {
      const part = owner.split('@')[0];
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    return owner;
  };

  // Helper: check availability conflicts
  const getAvailabilityStatusForTask = (emp, task) => {
    const taskEnd = new Date(task.end_date);
    taskEnd.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let availDate = new Date(today);

    if (emp.leave_start_date && emp.leave_end_date) {
      const leaveStart = new Date(emp.leave_start_date);
      const leaveEnd = new Date(emp.leave_end_date);
      const taskStart = new Date(task.start_date);
      taskStart.setHours(0, 0, 0, 0);
      leaveStart.setHours(0, 0, 0, 0);
      leaveEnd.setHours(0, 0, 0, 0);

      // Overlap
      if (Math.max(taskStart, leaveStart) <= Math.min(taskEnd, leaveEnd)) {
        const nextDay = new Date(leaveEnd);
        nextDay.setDate(nextDay.getDate() + 1);
        if (nextDay > availDate) {
          availDate = nextDay;
        }
      }
    }

    if (emp.days_until_free != null && emp.days_until_free > 0) {
      const busyEnd = new Date(today);
      busyEnd.setDate(busyEnd.getDate() + emp.days_until_free);
      if (busyEnd > availDate) {
        availDate = busyEnd;
      }
    }

    const tooLong = availDate > taskEnd;

    return {
      availDate,
      tooLong,
      availDateStr: availDate.toISOString().split('T')[0]
    };
  };

  const checkConflict = (owner, task) => {
    if (!owner || owner === 'unassigned' || owner.includes('default') || owner.includes('unassigned')) {
      return { isOwnerNotAvailable: true, hasConflict: false };
    }
    const ownersList = owner.split(',').map((o) => o.trim());
    for (const oName of ownersList) {
      const emp = employees.find(
        (e) =>
          (e.email || '').toLowerCase() === oName.toLowerCase() ||
          (e.name || '').toLowerCase() === oName.toLowerCase()
      );
      if (emp) {
        const check = getAvailabilityStatusForTask(emp, task);
        if (check.tooLong) {
          return { isOwnerNotAvailable: false, hasConflict: true, conflictingOwner: emp.name || oName };
        }
      }
    }
    return { isOwnerNotAvailable: false, hasConflict: false };
  };

  // Generate Plan AI click
  const handleGeneratePlan = async () => {
    if (!selectedEstimateId) {
      setErrorMsg('Please select an estimate first.');
      return;
    }
    setErrorMsg('');
    const targetEst = estimates.find((e) => e.estimate_id === selectedEstimateId);
    if (!targetEst) return;

    showLoader('Generating project schedule...');
    try {
      const payload = { estimate: targetEst };
      const planRes = await planningService.generatePlan(payload);
      setSuggestedPlan(planRes);
      showToast('AI schedule plan generated');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate plan.');
    } finally {
      hideLoader();
    }
  };

  // Save generated plan
  const handleSaveSuggestedPlan = async () => {
    if (!suggestedPlan || !selectedEstimateId) return;
    showLoader('Saving project plan...');
    try {
      const res = await planningService.savePlan(suggestedPlan);
      // Pre-set selectedPlanId to view detail page
      setSelectedPlanId(res.plan_id);
      setSuggestedPlan(null);
      await loadData();
      showToast('Project plan saved successfully');
    } catch (err) {
      setErrorMsg(err.message || 'Saving failed.');
    } finally {
      hideLoader();
    }
  };

  // Accept plan status
  const handleAcceptPlan = async (planId) => {
    showLoader('Committing plan status...');
    try {
      await planningService.updateStatus(planId, { status: 'accepted' });
      await loadData();
      showToast('Project plan accepted');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Request replan trigger
  const handleRequestReplan = async (planId) => {
    showLoader('Marking replanning status...');
    try {
      await planningService.updateStatus(planId, { status: 'replan' });
      await loadData();
      showToast('Plan marked for replanning');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Submit replan form
  const handleSubmitReplan = async (plan) => {
    setReplanError('');
    if (!replanReason.trim()) {
      setReplanError('Validation Error: Reason for replanning is required.');
      return;
    }
    if (isNaN(replanEffort) || replanEffort <= 0) {
      setReplanError('Validation Error: Please enter a valid effort count.');
      return;
    }

    showLoader('Regenerating project schedules...');
    try {
      const payload = {
        effort_days: replanEffort,
        start_date: replanStartDate || plan.tasks[0]?.start_date || new Date().toISOString().split('T')[0],
        work_days_per_week: replanWorkDays,
        max_utilization: replanUtil,
        reason: replanReason.trim()
      };

      await planningService.replan(plan.plan_id, payload);
      setShowReplanForm(false);
      setReplanReason('');
      await loadData();
      showToast('Project replan completed');
    } catch (err) {
      setReplanError(err.message);
    } finally {
      hideLoader();
    }
  };

  // Delete plan
  const handleDeletePlan = async (id) => {
    if (window.confirm('Are you sure you want to delete this plan? This cannot be undone.')) {
      showLoader('Deleting plan...');
      try {
        await planningService.deletePlan(id);
        if (selectedPlanId === id) {
          setSelectedPlanId(null);
        }
        await loadData();
        showToast('Plan deleted successfully');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  const activePlan = plans.find((p) => p.plan_id === selectedPlanId);
  const activeDemand = activePlan ? demands.find((d) => d.demand_id === activePlan.demand_id) : null;
  const displayTitle = activeDemand ? activeDemand.title : (activePlan ? activePlan.demand_id : '');

  // Setup initial dates for replan form
  useEffect(() => {
    if (activePlan && activePlan.tasks && activePlan.tasks.length > 0) {
      setReplanStartDate(activePlan.tasks[0].start_date);
      setReplanEffort(activePlan._reasoning?.raw_effort_days || 10);
    }
  }, [activePlan]);

  // Gantt relative bars calculation
  const renderTimelineBars = (plan) => {
    if (!plan.tasks || plan.tasks.length === 0) return null;
    const dates = plan.tasks.flatMap((t) => [new Date(t.start_date), new Date(t.end_date)]);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const totalMs = maxDate - minDate || 1;

    const phaseColors = {
      'Design & Setup': '#818cf8',
      'Build': '#6366f1',
      'Test & QA': '#fbbf24',
      'Deploy & Release': '#34d399'
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        {plan.tasks.map((t) => {
          const start = new Date(t.start_date);
          const end = new Date(t.end_date);
          const leftPct = ((start - minDate) / totalMs * 100).toFixed(1);
          const widthPct = Math.max(1, ((end - start) / totalMs * 100)).toFixed(1);
          const color = phaseColors[t.name] || 'var(--color-brand)';
          const isCritical = plan.critical_path_task_ids.includes(t.task_id);
          const displayName = getEmployeeDisplayName(t.owner);

          return (
            <div key={t.task_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '130px', flexShrink: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.name}
              </div>
              <div style={{ flex: 1, position: 'relative', height: '22px', background: 'rgba(30,41,59,0.5)', borderRadius: '4px' }}>
                <div style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: '100%',
                  background: color,
                  opacity: isCritical ? 1 : 0.8,
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '6px',
                  fontSize: '0.68rem',
                  color: 'var(--text-primary)',
                  textShadow: '0px 1px 3px rgba(0,0,0,0.9)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}>
                  {displayName}
                </div>
              </div>
              <div style={{ width: '80px', flexShrink: 0, fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t.end_date}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="intake-screen">
      {/* Sidebar listing */}
      <aside className="sidebar">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
          Schedules Queue
        </div>
        <ul className="demand-list">
          {plans.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No plans yet. Create one below.
            </li>
          ) : (
            plans.map((p) => {
              const d = demands.find((dm) => dm.demand_id === p.demand_id);
              const title = d ? d.title : p.demand_id;
              const isActive = p.plan_id === selectedPlanId;

              return (
                <li
                  key={p.plan_id}
                  className={`demand-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectPlan(p.plan_id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{p.plan_id}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <h4 className="demand-item-title">{title}</h4>
                  <div className="demand-item-meta">
                    <span>Sprints: {p.sprints ? p.sprints.length : 0}</span>
                    <span>End Date: {p.end_date}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main panel */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Sprint Schedule Workspace</h2>
          <div>
            <select
              value={selectedPlanId || 'new'}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setSelectedPlanId(null);
                  setSuggestedPlan(null);
                  setShowReplanForm(false);
                } else {
                  handleSelectPlan(e.target.value);
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
              <option value="new">+ Create New Plan</option>
              {plans.map((p) => {
                const dm = demands.find((d) => d.demand_id === p.demand_id);
                return (
                  <option key={p.plan_id} value={p.plan_id}>
                    {p.plan_id} - {dm ? dm.title : p.demand_id}
                  </option>
                );
              })}
            </select>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!activePlan ? (
            /* NEW PLAN GENERATION VIEW */
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                Generate Sprint Plan & Schedule
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Select an approved sizing estimate to schedule Sprints, map predecessors, and allocate team tasks.
              </p>

              {errorMsg && <div className="error-message" style={{ display: 'block' }}>{errorMsg}</div>}

              <div className="form-group">
                <label htmlFor="select-estimate">Select Approved Estimate</label>
                <select
                  id="select-estimate"
                  value={selectedEstimateId}
                  onChange={(e) => setSelectedEstimateId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Select an Estimate --</option>
                  {approvedEstimates.map((est) => {
                    const dm = demands.find((d) => d.demand_id === est.demand_id);
                    return (
                      <option key={est.estimate_id} value={est.estimate_id}>
                        {est.estimate_id} - {dm ? dm.title : est.demand_id} (Effort: {est.effort_days} days)
                      </option>
                    );
                  })}
                </select>
              </div>

              {suggestedPlan && (
                <div className="suggestion-box" style={{ marginTop: '1.5rem' }}>
                  <h5 className="suggestion-title">Generated Project Plan Draft</h5>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div>
                      <div className="data-label">Sprint Count</div>
                      <div className="data-value"><strong>{suggestedPlan.sprints ? suggestedPlan.sprints.length : 0} Sprints</strong></div>
                    </div>
                    <div>
                      <div className="data-label">Target Completion Date</div>
                      <div className="data-value" style={{ color: 'var(--color-brand)', fontWeight: 700 }}>{suggestedPlan.end_date}</div>
                    </div>
                  </div>

                  {/* Gantt preview */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div className="data-label">Timeline Preview</div>
                    {renderTimelineBars(suggestedPlan)}
                  </div>

                  {/* Task list preview */}
                  <div className="data-label">Task Resource Allocation Checks</div>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', background: 'var(--bg-secondary)', marginTop: '0.5rem' }}>
                    {suggestedPlan.tasks.map((t) => {
                      const check = checkConflict(t.owner, t);
                      return (
                        <div key={t.task_id} style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.task_id} - {t.name}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{t.start_date} to {t.end_date}</span>
                          </div>
                          {(check.isOwnerNotAvailable || check.hasConflict) && (
                            <div style={{ marginTop: '0.4rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-status-red-text)', padding: '6px', borderRadius: '4px', fontSize: '0.78rem' }}>
                              <span style={{ color: 'var(--color-status-red-text)', fontWeight: 600 }}>
                                ⚠ {check.isOwnerNotAvailable ? 'Employee for this task is currently not available' : `${check.conflictingOwner} is currently not available`}
                              </span>
                              <span style={{ display: 'block', color: 'var(--color-status-red-text)', fontWeight: 700 }}>
                                Hire a new employee with the skills for this task
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="submit-row" style={{ marginTop: '2rem' }}>
                {suggestedPlan ? (
                  <button type="button" className="btn-primary" onClick={handleSaveSuggestedPlan}>
                    Accept & Save Plan
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={handleGeneratePlan}>
                    Generate Plan (AI)
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* DETAILED PLAN SCHEDULE WIZARD */
            <div>
              {/* Header Title block */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activePlan.demand_id}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    Plan
                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', fontWeight: 600, textTransform: 'uppercase', color: activePlan.status === 'accepted' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)', background: activePlan.status === 'accepted' ? 'var(--color-status-green-bg)' : 'var(--color-status-amber-bg)', border: `1px solid ${activePlan.status === 'accepted' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)'}` }}>
                      {activePlan.status || 'Draft'}
                    </span>
                  </h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Plan End Date</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand)', marginBottom: '0.25rem' }}>
                    {activePlan.end_date}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleDeletePlan(activePlan.plan_id)}
                    style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Delete Plan
                  </button>
                </div>
              </div>

              {/* Replan Section Form (visible on click) */}
              {showReplanForm && (
                <div style={{ marginBottom: '1.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', background: 'var(--bg-secondary)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-status-amber-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: 'currentColor' }}><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.77-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.78.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>
                    Replan Project: {activePlan.demand_id}
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Scope Effort (Person-Days)</label>
                      <input
                        type="number"
                        value={replanEffort}
                        onChange={(e) => setReplanEffort(parseFloat(e.target.value) || 0)}
                        min="1"
                        step="0.5"
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', width: '100%' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Planning Start Date</label>
                      <input
                        type="date"
                        value={replanStartDate}
                        onChange={(e) => setReplanStartDate(e.target.value)}
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', width: '100%' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Working Days/Week</label>
                      <input
                        type="number"
                        value={replanWorkDays}
                        onChange={(e) => setReplanWorkDays(parseInt(e.target.value) || 5)}
                        min="1"
                        max="7"
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', width: '100%' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Max Utilization %</label>
                      <input
                        type="number"
                        value={replanUtil}
                        onChange={(e) => setReplanUtil(parseInt(e.target.value) || 85)}
                        min="1"
                        max="100"
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', width: '100%' }}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-status-amber-text)' }}>
                      Reason for Replanning * (Mandatory)
                    </label>
                    <textarea
                      placeholder="e.g. Employee Gabriel Morris is on leave for two weeks..."
                      value={replanReason}
                      onChange={(e) => setReplanReason(e.target.value)}
                      style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', width: '100%', minHeight: '80px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button type="button" className="btn-primary" onClick={() => handleSubmitReplan(activePlan)} style={{ backgroundColor: 'var(--color-status-amber-border)', border: '1px solid var(--color-status-amber-text)', color: 'var(--color-status-amber-text)', padding: '0.4rem 1rem' }}>
                      Submit Replan
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setShowReplanForm(false)} style={{ padding: '0.4rem 1rem' }}>
                      Cancel
                    </button>
                  </div>
                  {replanError && <div style={{ color: 'var(--color-status-red-text)', fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 600 }}>{replanError}</div>}
                </div>
              )}

              {/* Critical Path Banner */}
              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: 'var(--color-brand)', flexShrink: 0, marginTop: '2px' }}>
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z" />
                </svg>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Critical Path</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {activePlan.critical_path_task_ids.join(' → ')}
                  </div>
                </div>
              </div>

              {/* Gantt-style Task Table */}
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Task Breakdown
              </div>
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>Task ID</th>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>Phase</th>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>Start</th>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>End</th>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>Owner</th>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>Predecessors</th>
                      <th style={{ textAlign: 'center', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePlan.tasks.map((t, idx) => {
                      const isCritical = activePlan.critical_path_task_ids.includes(t.task_id);
                      const isCompleted = t.status === 'completed';
                      const check = checkConflict(t.owner, t);

                      return (
                        <tr key={t.task_id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, color: isCritical ? 'var(--color-brand)' : 'var(--text-primary)' }}>
                            {t.task_id}
                            {isCritical && <span style={{ fontSize: '0.6rem', marginLeft: '4px', color: 'var(--color-brand)' }}>★ CRIT</span>}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{t.name}</td>
                          <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 500 }}>{t.start_date}</td>
                          <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 500 }}>{t.end_date}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            {check.isOwnerNotAvailable || check.hasConflict ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', background: 'rgba(239, 68, 68, 0.08)', padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-status-red-text)', lineHeight: 1.25 }}>
                                <span style={{ color: 'var(--color-status-red-text)', fontWeight: 600, fontSize: '0.78rem' }}>
                                  ⚠ {check.isOwnerNotAvailable ? 'Employee for this task is currently not available' : `${check.conflictingOwner} is currently not available`}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-status-red-text)', fontWeight: 700, display: 'block' }}>
                                  Hire a new employee with the skills for this task
                                </span>
                              </div>
                            ) : (
                              t.owner.split(',').map((o) => {
                                const name = getEmployeeDisplayName(o.trim());
                                return (
                                  <span key={o} className="employee-chip" style={{ display: 'inline-block', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-brand)', padding: '0.15rem 0.45rem', borderRadius: '12px', fontSize: '0.75rem', marginRight: '0.25rem', fontWeight: 600, border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                    {name}
                                  </span>
                                );
                              })
                            )}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {t.predecessor_task_ids && t.predecessor_task_ids.length ? t.predecessor_task_ids.join(', ') : '—'}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            {isCompleted ? (
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-status-green-text)' }}>Done</span>
                            ) : activePlan.status === 'accepted' ? (
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-brand)' }}>Active</span>
                            ) : (
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Relative Gantt timeline */}
              <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  Timeline (relative)
                </div>
                {renderTimelineBars(activePlan)}
              </div>

              {/* Human sign-off actions */}
              {activePlan.status === 'accepted' ? (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <button type="button" onClick={() => setShowReplanForm(true)} className="btn-primary" style={{ backgroundColor: 'var(--color-status-amber-border)', border: '1px solid var(--color-status-amber-text)', color: 'var(--color-status-amber-text)', cursor: 'pointer', padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.82rem', borderRadius: 'var(--radius-sm)' }}>
                    <svg viewBox="0 0 24 24" style={{ width: '15px', height: '15px', fill: 'currentColor' }}><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.77-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.78.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>
                    Replan Project
                  </button>
                  <div style={{ flex: 1 }}></div>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('pendingDepsAutoSense', '1');
                      sessionStorage.setItem('dependencies_selected_plan_id', activePlan.plan_id);
                      navigate('/dependencies');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', color: 'var(--text-primary)', boxShadow: '0 2px 8px rgba(139,92,246,0.35)' }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                    Next: Sense Dependencies &nbsp;&rarr;
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <button type="button" className="btn-primary" onClick={() => handleAcceptPlan(activePlan.plan_id)} style={{ backgroundColor: 'var(--color-status-green-border)', border: '1px solid var(--color-status-green-text)', color: 'var(--color-status-green-text)', cursor: 'pointer', fontWeight: 700, padding: '0.4rem 1.2rem', borderRadius: 'var(--radius-sm)' }}>
                    ✓ Accept & Save
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => handleRequestReplan(activePlan.plan_id)} style={{ color: 'var(--color-status-amber-text)', borderColor: 'var(--color-status-amber-text)', cursor: 'pointer', fontWeight: 700, padding: '0.4rem 1.2rem', borderRadius: 'var(--radius-sm)' }}>
                    ⚠ Request Replan (Edit Scope)
                  </button>
                </div>
              )}

              {/* Replan History Logs */}
              <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Replan History & Audit Log
                </div>
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {replanHistory.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.5rem' }}>
                      No replan history recorded.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: 600 }}>Ver</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: 600 }}>Reason for Replanning</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: 600 }}>Timestamp</th>
                          <th style={{ textAlign: 'left', padding: '6px', fontWeight: 600 }}>New Dates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replanHistory.map((h) => {
                          const tasks = h.data.tasks || [];
                          const start = tasks[0]?.start_date || 'N/A';
                          const end = h.data.end_date || 'N/A';
                          return (
                            <tr key={h.version} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '6px', fontWeight: 700, color: 'var(--color-brand)' }}>v{h.version}</td>
                              <td style={{ padding: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}>{h.reason}</td>
                              <td style={{ padding: '6px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(h.timestamp).toLocaleString()}</td>
                              <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--color-status-amber-text)' }}>{start} to {end}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
