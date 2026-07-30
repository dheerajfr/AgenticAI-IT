import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getEstimates } from '../api/estimatesApi';
import {
  getPlans,
  createPlan,
  deletePlan,
  generatePlan,
  rebaselinePlan,
  approvePlan
} from '../api/plansApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function PlanSchedulePage() {
  const navigate = useNavigate();
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm, DialogComponent } = useConfirmDialog();

  const [plans, setPlans] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form & allocation states
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [planningStartDate, setPlanningStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [workingDays, setWorkingDays] = useState(5);
  const [maxUtilization, setMaxUtilization] = useState(85);
  
  // File upload and team config
  const [uploadedTeamConfig, setUploadedTeamConfig] = useState(null);
  const [uploadSummary, setUploadSummary] = useState('');

  // Generated preview state
  const [pendingPlans, setPendingPlans] = useState(null);
  const [alternateEmployees, setAlternateEmployees] = useState({}); // { [cellId]: employees[] }
  const [replanEffort, setReplanEffort] = useState(12.0);

  // Replan flow states
  const [showReplanForm, setShowReplanForm] = useState(false);
  const [replanReason, setReplanReason] = useState('');
  const [replanStartDate, setReplanStartDate] = useState('');
  const [replanWorkDays, setReplanWorkDays] = useState(5);
  const [replanUtil, setReplanUtil] = useState(85);
  const [planHistory, setPlanHistory] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pList, eList] = await Promise.all([getPlans(), getEstimates()]);
      setPlans(pList || []);
      setEstimates(eList || []);

      // Check if we arrived from Estimate module
      const pendingEstId = sessionStorage.getItem('pendingPlanEstimateId');
      if (pendingEstId) {
        sessionStorage.removeItem('pendingPlanEstimateId');
        setSelectedEstimateId(pendingEstId);
        setSelectedPlanId(null);
        setPendingPlans(null);
      } else {
        const activeDemandId = sessionStorage.getItem('selectedDemandId');
        const matchedPlan = activeDemandId ? (pList || []).find(p => p.demand_id === activeDemandId) : null;
        if (activeDemandId && !matchedPlan) {
          // Check if there is an estimate for this demand
          const est = (eList || []).find(e => e.demand_id === activeDemandId);
          if (est) {
            setSelectedEstimateId(est.estimate_id);
          }
          setSelectedPlanId(null);
        } else if (matchedPlan) {
          setSelectedPlanId(matchedPlan.plan_id);
        } else if (pList && pList.length > 0) {
          setSelectedPlanId(pList[0].plan_id);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load plans data.');
    } finally {
      setLoading(false);
    }
  }, [selectDemand]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = new TextDecoder().decode(evt.target.result);
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) {
          throw new Error('CSV file must contain at least headers and one row.');
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = cols[idx] || '';
          });
          rows.push(row);
        }

        let nameKey = null, skillKey = null, statusKey = null;
        if (rows.length > 0) {
          Object.keys(rows[0]).forEach(k => {
            const kl = k.toLowerCase();
            if (kl.includes('name')) nameKey = k;
            else if (kl.includes('skill') || kl.includes('role')) skillKey = k;
            else if (kl.includes('status') || kl.includes('avail') || kl.includes('project') || kl.includes('free')) statusKey = k;
          });
        }

        if (!nameKey || !skillKey || !statusKey) {
          throw new Error('Required columns (Name, Skill, Status) could not be identified.');
        }

        const roles = ['backend', 'frontend', 'qa', 'devops'];
        const membersByRole = { backend: [], frontend: [], qa: [], devops: [] };

        rows.forEach(r => {
          const name = String(r[nameKey] || '').trim();
          const skill = String(r[skillKey] || '').trim().toLowerCase();
          const status = String(r[statusKey] || '').trim().toLowerCase();

          if (name && status === 'free') {
            roles.forEach(role => {
              if (skill.includes(role)) {
                membersByRole[role].push(name);
              }
            });
          }
        });

        const rolesPayload = [];
        let totalSize = 0;
        roles.forEach(role => {
          const list = membersByRole[role];
          const count = list.length > 0 ? list.length : 1;
          const members = list.length > 0 ? list : [role + '_default_1'];
          totalSize += count;
          rolesPayload.push({
            role: role,
            count: count,
            hours_per_day_per_person: 8.0,
            members: members
          });
        });

        setUploadedTeamConfig({
          team_size: totalSize,
          roles: rolesPayload
        });
        setUploadSummary(`Parsed ${totalSize} available team members from ${file.name}.`);
        addToast('Team allocation config parsed successfully.', 'success');
      } catch (err) {
        addToast(err.message || 'Failed to parse CSV.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRunPlanning = async () => {
    if (!selectedEstimateId) {
      addToast('Please select an estimate first.', 'error');
      return;
    }
    const est = estimates.find(e => e.estimate_id === selectedEstimateId);
    if (!est) return;

    setActionLoading(true);
    try {
      const payload = {
        estimates: [est],
        sprint_constraints: {
          planning_start_date: planningStartDate,
          working_days_per_week: workingDays,
          max_daily_utilization_percentage: maxUtilization
        }
      };
      if (uploadedTeamConfig) {
        payload.team_config = uploadedTeamConfig;
      }
      const data = await generatePlan(payload);
      setPendingPlans(data);
      addToast('AI Plan Preview generated successfully.', 'success');

      // Fetch availability for unassigned/unavailable owners
      const plansArray = Array.isArray(data) ? data : (data.plans || []);
      plansArray.forEach(p => {
        p.tasks.forEach((t, ti) => {
          const cellId = `avail-${p.plan_id}-${ti}`;
          const isNotAvailable = !t.owner || t.owner === 'unassigned' || t.owner.toLowerCase().includes('default') || t.owner.toLowerCase().includes('unassigned');
          if (isNotAvailable) {
            const skill = t.name.toLowerCase().includes('test') || t.name.toLowerCase().includes('qa') ? 'qa' :
                          t.name.toLowerCase().includes('deploy') || t.name.toLowerCase().includes('release') ? 'devops' :
                          t.name.toLowerCase().includes('design') || t.name.toLowerCase().includes('setup') ? 'frontend' : 'backend';
            fetchAlternateEmployees(cellId, skill);
          }
        });
      });
    } catch (err) {
      addToast(err.message || 'Failed to generate plan.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchAlternateEmployees = async (cellId, skill) => {
    try {
      const res = await fetch(`/api/plans/employees/availability?skill=${encodeURIComponent(skill)}`);
      if (res.ok) {
        const emps = await res.json();
        setAlternateEmployees(prev => ({ ...prev, [cellId]: emps }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptPlan = async () => {
    if (!pendingPlans) return;
    setActionLoading(true);
    try {
      const plansArray = Array.isArray(pendingPlans) ? pendingPlans : (pendingPlans.plans || []);
      for (const p of plansArray) {
        p.status = 'accepted';
        p.human_decision = 'approved';
        const res = await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
        if (!res.ok) throw new Error('Failed to save accepted plan.');
      }
      addToast('Plan approved and active.', 'success');
      setPendingPlans(null);
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to approve plan.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchPlanHistory = async (planId) => {
    try {
      const res = await fetch(`/api/plans/${planId}/history`);
      if (res.ok) {
        const data = await res.json();
        setPlanHistory(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedPlanId) {
      fetchPlanHistory(selectedPlanId);
      const active = plans.find(p => p.plan_id === selectedPlanId);
      if (active) {
        setReplanStartDate(active.tasks?.[0]?.start_date || new Date().toISOString().split('T')[0]);
        setReplanEffort(active._reasoning?.raw_effort_days || 10.0);
      }
    }
  }, [selectedPlanId, plans]);

  const handleReplanProject = async () => {
    if (!replanReason.trim()) {
      addToast('Reason for replanning is required.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/plans/${selectedPlanId}/replan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: replanReason,
          effort_days: replanEffort,
          planning_start_date: replanStartDate,
          working_days_per_week: replanWorkDays,
          max_daily_utilization_percentage: replanUtil
        })
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || 'Replan failed.');
      }

      addToast('AI Reallocation and Rescheduling completed.', 'success');
      setShowReplanForm(false);
      setReplanReason('');
      await loadData();
    } catch (err) {
      addToast(err.message || 'Failed to replan project.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePlan = async (id) => {
    const ok = await confirm(
      'Delete Plan',
      'Are you sure you want to delete this project schedule plan? This cannot be undone.'
    );
    if (!ok) return;
    try {
      await deletePlan(id);
      addToast('Project plan deleted.', 'success');
      if (selectedPlanId === id) {
        setSelectedPlanId(null);
      }
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to delete plan.', 'error');
    }
  };

  const activePlan = plans.find(p => p.plan_id === selectedPlanId);
  const activeEst = estimates.find(e => e.estimate_id === selectedEstimateId);

  return (
    <div className="intake-screen">
      {DialogComponent}
      <ProjectSidebar
        items={plans}
        selectedId={selectedPlanId}
        onSelect={(id) => {
          setSelectedPlanId(id);
          setPendingPlans(null);
          const p = plans.find(pl => pl.plan_id === id);
          if (p) selectDemand(p.demand_id);
        }}
        onDelete={handleDeletePlan}
        idKey="plan_id"
        titleKey="demand_id"
        subtitleKey={(item) => `End Date: ${item.end_date}`}
        metaLeft={(item) => `Tasks: ${item.tasks?.length || 0}`}
        metaRight={(item) => `Status: ${item.status}`}
        statusKey="status"
        loading={loading}
        error={error}
        emptyMessage="No plans found. Generate one."
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Project Plan &amp; Schedule</h2>
          <div>
            <ProjectDropdown
              demands={plans}
              selectedId={activePlan ? activePlan.plan_id : 'new'}
              includeNew
              newLabel="+ Create New Plan"
              onChange={(val) => {
                if (val === 'new') {
                  setSelectedPlanId(null);
                  setPendingPlans(null);
                  setSelectedEstimateId('');
                  selectDemand(null);
                } else {
                  const matched = plans.find(p => p.plan_id === val);
                  if (matched) {
                    setSelectedPlanId(matched.plan_id);
                    setPendingPlans(null);
                    selectDemand(matched.demand_id);
                  }
                }
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {selectedPlanId === null && !pendingPlans && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                Run Planning Engine
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Select an approved baseline estimate to build the project calendar schedule and assign tasks.
              </p>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Baseline Estimate</label>
                <select
                  value={selectedEstimateId}
                  onChange={(e) => setSelectedEstimateId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="">-- Select Estimate --</option>
                  {estimates.map(est => (
                    <option key={est.estimate_id} value={est.estimate_id}>{est.demand_id} - Baseline Sizing (${est.cost_estimate?.toLocaleString()})</option>
                  ))}
                </select>
              </div>

              {activeEst && (
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--color-brand)', marginBottom: '0.5rem' }}>Estimate Sizing Reference</div>
                  <div>Effort Days: {activeEst.effort_days}d (Range: {activeEst.effort_range_low}-{activeEst.effort_range_high}d)</div>
                  <div>Cost Estimate: ${activeEst.cost_estimate?.toLocaleString()}</div>
                  <div>Duration: {activeEst.duration_weeks}w</div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Upload Workforce Availability Sheet (Optional CSV)</label>
                <input type="file" accept=".csv" onChange={handleFileUpload} style={{ color: 'var(--text-primary)' }} />
                {uploadSummary && <div style={{ fontSize: '0.8rem', color: 'var(--color-status-green-text)', marginTop: '0.5rem' }}>{uploadSummary}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Start Date</label>
                  <input type="date" value={planningStartDate} onChange={(e) => setPlanningStartDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Working Days/Week</label>
                  <input type="number" value={workingDays} min="1" max="7" onChange={(e) => setWorkingDays(parseInt(e.target.value))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Max Utilization %</label>
                  <input type="number" value={maxUtilization} min="10" max="100" onChange={(e) => setMaxUtilization(parseInt(e.target.value))} />
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleRunPlanning}
                disabled={actionLoading || !selectedEstimateId}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Run Planning Engine'}
              </button>
            </div>
          )}

          {pendingPlans && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-display)' }}>Proposed Plan Schedule Preview</h3>
              
              {((Array.isArray(pendingPlans) ? pendingPlans : pendingPlans.plans) || []).map((plan, pIdx) => (
                <div key={plan.plan_id || pIdx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontWeight: 'bold' }}>{plan.demand_id}</span>
                    <span>Proposed End Date: <b>{plan.end_date}</b></span>
                  </div>

                  <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Task Name</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Start Date</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>End Date</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Assigned Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.tasks?.map((t, ti) => {
                        const cellId = `avail-${plan.plan_id}-${ti}`;
                        const isNotAvailable = !t.owner || t.owner === 'unassigned' || t.owner.toLowerCase().includes('default') || t.owner.toLowerCase().includes('unassigned');
                        const alternatives = alternateEmployees[cellId] || [];

                        return (
                          <tr key={ti} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 600 }}>{t.name}</td>
                            <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{t.start_date}</td>
                            <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{t.end_date}</td>
                            <td style={{ padding: '0.5rem' }}>
                              {isNotAvailable ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  <span style={{ color: 'var(--color-status-red-text)', fontWeight: 600, fontSize: '0.75rem' }}>
                                    ⚠ Shortage / Not Available
                                  </span>
                                  <select
                                    style={{ fontSize: '0.73rem', padding: '0.2rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                                    onChange={(e) => {
                                      const email = e.target.value;
                                      setPendingPlans(prev => {
                                        const clone = { ...prev };
                                        const arr = Array.isArray(clone) ? clone : (clone.plans || []);
                                        arr[pIdx].tasks[ti].owner = email;
                                        return clone;
                                      });
                                    }}
                                  >
                                    <option value="">— Pick alternate employee —</option>
                                    {alternatives.map(emp => (
                                      <option key={emp.email} value={emp.email}>{emp.name} ({emp.status})</option>
                                    ))}
                                  </select>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--color-status-red-text)', fontWeight: 700 }}>
                                    hire a new employee with the skills for this task
                                  </span>
                                </div>
                              ) : (
                                <span style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                  {t.owner}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <b>Critical Path:</b> {plan.critical_path_task_ids?.join(' → ')}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn-primary" onClick={handleAcceptPlan} disabled={actionLoading}>
                  {actionLoading ? <Spinner size="sm" /> : '✓ Accept & Save'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setPendingPlans(null)} disabled={actionLoading}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activePlan && (
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activePlan.plan_id}</span>
                  <h2 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>Project Gantt &amp; Milestones</h2>
                </div>
                <StatusPill status="green" label={activePlan.status} />
              </div>

              <div style={{ marginBottom: '2.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0' }}>Work Breakdown Structure (WBS)</h4>
                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Task</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Start</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>End</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Resource Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePlan.tasks?.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{t.start_date}</td>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{t.end_date}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {t.owner || 'Unassigned'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 style={{ margin: '0 0 1rem 0' }}>Gantt Timeline Visualization</h4>
                <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 600 }}>
                    {activePlan.tasks?.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 150, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                        <div style={{ flex: 1, height: 20, background: 'var(--bg-secondary)', borderRadius: 3, position: 'relative' }}>
                          <div style={{
                            position: 'absolute',
                            left: `${(i * 10) % 60}%`, // Simulated visual offset based on index for clean demo representation
                            width: '35%',
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--color-brand), #818cf8)',
                            borderRadius: 3,
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '0.5rem',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {t.owner || 'Unassigned'}
                          </div>
                        </div>
                        <div style={{ width: 80, fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{t.start_date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {showReplanForm && (
                <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--color-status-amber-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-status-amber-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Replan Project: {activePlan.plan_id}
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Scope Effort (Person-Days)</label>
                      <input type="number" value={replanEffort} onChange={(e) => setReplanEffort(parseFloat(e.target.value) || 0)} min="1" step="0.5" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Planning Start Date</label>
                      <input type="date" value={replanStartDate} onChange={(e) => setReplanStartDate(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Working Days/Week</label>
                      <input type="number" value={replanWorkDays} onChange={(e) => setReplanWorkDays(parseInt(e.target.value) || 5)} min="1" max="7" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Max Utilization %</label>
                      <input type="number" value={replanUtil} onChange={(e) => setReplanUtil(parseFloat(e.target.value) || 85)} min="1" max="100" />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label style={{ color: 'var(--color-status-amber-text)' }}>Reason for Replanning * (Mandatory)</label>
                    <textarea value={replanReason} onChange={(e) => setReplanReason(e.target.value)} placeholder="e.g. Employee Gabriel Morris is on leave for two weeks..." style={{ minHeight: 80 }} />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button type="button" className="btn-primary" onClick={handleReplanProject} disabled={actionLoading} style={{ background: 'var(--color-status-amber-border)', border: 'none' }}>
                      {actionLoading ? <Spinner size="sm" /> : 'Submit Replan'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setShowReplanForm(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {planHistory.length > 0 && (
                <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                    Replan History &amp; Audit Log
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 250, overflowY: 'auto' }}>
                    {planHistory.map((h, idx) => (
                      <div key={idx} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 'bold' }}>Version #{h.version}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{h.timestamp}</span>
                        </div>
                        <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Reason: {h.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowReplanForm(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.77-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.78.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z" /></svg>
                  Re-plan Project
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    sessionStorage.setItem('pendingDepsAutoSense', '1');
                    sessionStorage.setItem('dependencies_selected_plan_id', activePlan.plan_id);
                    navigate('/dependencies');
                  }}
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 700 }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                  Next: Dependencies &nbsp;→
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
