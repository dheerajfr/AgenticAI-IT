import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getReleases, createRelease, deleteRelease } from '../api/releaseChangeApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function ReleaseChangePage() {
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm, DialogComponent } = useConfirmDialog();

  const [releases, setReleases] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState({ demands: [], plans: [], environments: [], teams: [], approvers: [], windows: [] });
  const [selectedReleaseId, setSelectedReleaseId] = useState(null);
  const [activeRelease, setActiveRelease] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal / Creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');
  const [newEnv, setNewEnv] = useState('prod');
  const [newTeam, setNewTeam] = useState('release-ops');
  const [newWindow, setNewWindow] = useState('weekend-night');
  const [newApprover, setNewApprover] = useState('');

  // Active sub-tab in details
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'change-request' | 'cab'

  // Change request draft and assessment states
  const [crTitle, setCrTitle] = useState('');
  const [crDescription, setCrDescription] = useState('');
  const [crRiskRating, setCrRiskRating] = useState('medium');
  const [crBackoutPlan, setCrBackoutPlan] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dropdownRes = await fetch('/api/release-change/dropdowns');
      if (dropdownRes.ok) {
        const opts = await dropdownRes.json();
        setDropdownOptions(opts);
      }

      const list = await getReleases();
      setReleases(list || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId');
      const matchedRelease = activeDemandId ? (list || []).find(r => r.project_id === activeDemandId) : null;
      if (matchedRelease) {
        setSelectedReleaseId(matchedRelease.release_id);
        fetchReleaseDetails(matchedRelease.release_id);
      } else if (list && list.length > 0) {
        setSelectedReleaseId(list[0].release_id);
        fetchReleaseDetails(list[0].release_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load releases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fetchReleaseDetails = async (id) => {
    try {
      const res = await fetch(`/api/release-change/releases/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveRelease(data);
        if (data.change_request) {
          setCrTitle(data.change_request.title || '');
          setCrDescription(data.change_request.description || '');
          setCrRiskRating(data.change_request.risk_rating || 'medium');
          setCrBackoutPlan(data.change_request.backout_plan || '');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateRelease = async () => {
    if (!newProjectId) {
      addToast('Please select a project.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const payload = {
        project_id: newProjectId,
        target_environment: newEnv,
        assigned_team: newTeam,
        release_window: newWindow,
        approver_email: newApprover
      };
      const res = await createRelease(payload);
      addToast('Release governance window registered.', 'success');
      setShowCreateModal(false);
      loadData();
      if (res && res.release_id) {
        setSelectedReleaseId(res.release_id);
        fetchReleaseDetails(res.release_id);
      }
    } catch (err) {
      addToast(err.message || 'Failed to register release.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRelease = async (id) => {
    const ok = await confirm(
      'Delete Release Window',
      'Are you sure you want to cancel and delete this release registry? This cannot be undone.'
    );
    if (!ok) return;
    try {
      await deleteRelease(id);
      addToast('Release canceled.', 'success');
      if (selectedReleaseId === id) {
        setSelectedReleaseId(null);
        setActiveRelease(null);
      }
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to cancel release.', 'error');
    }
  };

  const handleDraftChange = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/release-change/releases/${id}/draft-change`, { method: 'POST' });
      if (!res.ok) throw new Error('AI drafting failed.');
      const data = await res.json();
      addToast('AI drafted Change Request successfully.', 'success');
      fetchReleaseDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to draft CR.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssessRisk = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/release-change/releases/${id}/assess-risk`, { method: 'POST' });
      if (!res.ok) throw new Error('AI risk assessment failed.');
      addToast('Change Advisory Board (CAB) risk scorecard generated.', 'success');
      fetchReleaseDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to assess risk.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCR = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/release-change/releases/${id}/change-request`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: crTitle,
          description: crDescription,
          risk_rating: crRiskRating,
          backout_plan: crBackoutPlan
        })
      });
      if (!res.ok) throw new Error('Failed to save CR.');
      addToast('Change Request successfully updated.', 'success');
      fetchReleaseDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to update CR.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitCR = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/release-change/releases/${id}/submit`, { method: 'POST' });
      if (!res.ok) throw new Error('CR submission failed.');
      addToast('CR successfully submitted for approval.', 'success');
      fetchReleaseDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to submit CR.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCABReview = async (id, decision) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/release-change/releases/${id}/cab-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: `Approved via Director governance review. Decision: ${decision}` })
      });
      if (!res.ok) throw new Error('CAB review submission failed.');
      addToast(`CAB decision successfully recorded: ${decision}.`, 'success');
      fetchReleaseDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to save CAB decision.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCollisionCheck = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/release-change/releases/${id}/collision-check`, { method: 'POST' });
      if (!res.ok) throw new Error('Calendar collision check failed.');
      const data = await res.json();
      if (data.has_collisions) {
        addToast(`⚠ Warnings: Scheduled release collisions found on window ${data.window_date_range}.`, 'warning');
      } else {
        addToast('✓ Release window verified. No calendar collisions found.', 'success');
      }
      fetchReleaseDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to check collisions.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="intake-screen">
      {DialogComponent}
      <ProjectSidebar
        items={releases}
        selectedId={selectedReleaseId}
        onSelect={(id) => {
          setSelectedReleaseId(id);
          fetchReleaseDetails(id);
          const r = releases.find(rel => rel.release_id === id);
          if (r) selectDemand(r.project_id);
        }}
        onDelete={handleDeleteRelease}
        idKey="release_id"
        titleKey="project_id"
        subtitleKey={(item) => `Target: ${item.target_environment.toUpperCase()}`}
        metaLeft={(item) => `Window: ${item.release_window}`}
        metaRight={(item) => `Status: ${item.status}`}
        statusKey="status"
        loading={loading}
        error={error}
        emptyMessage="No release registries recorded. Schedule one."
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Release &amp; Change advisory</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button type="button" className="btn-primary" onClick={() => setShowCreateModal(true)}>+ Schedule Release</button>
            <ProjectDropdown
              demands={releases}
              selectedId={selectedReleaseId}
              onChange={(val) => {
                setSelectedReleaseId(val);
                fetchReleaseDetails(val);
                const r = releases.find(rel => rel.release_id === val);
                if (r) selectDemand(r.project_id);
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {showCreateModal && (
            <div className="panel-card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0' }}>Register Release Window</h3>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Approved Project Demand</label>
                <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
                  <option value="">-- Select Approved Demand --</option>
                  {dropdownOptions.demands?.map(d => <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Target Environment</label>
                  <select value={newEnv} onChange={(e) => setNewEnv(e.target.value)}>
                    <option value="test">Test</option>
                    <option value="staging">Staging</option>
                    <option value="prod">Production</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Assigned Release Team</label>
                  <select value={newTeam} onChange={(e) => setNewTeam(e.target.value)}>
                    {dropdownOptions.teams?.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Release Window Slot</label>
                  <select value={newWindow} onChange={(e) => setNewWindow(e.target.value)}>
                    {dropdownOptions.windows?.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Approver Email Address</label>
                  <select value={newApprover} onChange={(e) => setNewApprover(e.target.value)}>
                    <option value="">-- Choose Approver --</option>
                    {dropdownOptions.approvers?.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn-primary" onClick={handleCreateRelease} disabled={actionLoading}>
                  Confirm Window
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              </div>
            </div>
          )}

          {activeRelease && (
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeRelease.release_id}</span>
                  <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                    Release Governance Window
                  </h3>
                </div>
                <StatusPill status={activeRelease.status === 'approved' ? 'green' : 'amber'} label={activeRelease.status} />
              </div>

              <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
                <button className={`tab-btn${activeSubTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveSubTab('overview')}>Overview</button>
                <button className={`tab-btn${activeSubTab === 'change-request' ? ' active' : ''}`} onClick={() => setActiveSubTab('change-request')}>Change Request (CR)</button>
                <button className={`tab-btn${activeSubTab === 'cab' ? ' active' : ''}`} onClick={() => setActiveSubTab('cab')}>CAB Review</button>
              </div>

              {activeSubTab === 'overview' && (
                <div>
                  <div className="grid-2col" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div><b>Project:</b> {activeRelease.project_id}</div>
                    <div><b>Target Environment:</b> {activeRelease.target_environment}</div>
                    <div><b>Assigned Team:</b> {activeRelease.assigned_team}</div>
                    <div><b>Release Window Slot:</b> {activeRelease.release_window}</div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleCollisionCheck(activeRelease.release_id)}
                    disabled={actionLoading}
                  >
                    Check Calendar Collisions
                  </button>
                </div>
              )}

              {activeSubTab === 'change-request' && (
                <div>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleDraftChange(activeRelease.release_id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Spinner size="sm" /> : '✦ Auto-Draft CR with AI'}
                    </button>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Change Request Title</label>
                    <input type="text" value={crTitle} onChange={(e) => setCrTitle(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Change Description Details</label>
                    <textarea value={crDescription} onChange={(e) => setCrDescription(e.target.value)} style={{ minHeight: 100 }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Risk Rating</label>
                      <select value={crRiskRating} onChange={(e) => setCrRiskRating(e.target.value)}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Backout / Rollback Plan</label>
                      <input type="text" value={crBackoutPlan} onChange={(e) => setCrBackoutPlan(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button type="button" className="btn-primary" onClick={() => handleSaveCR(activeRelease.release_id)} disabled={actionLoading}>
                      Save CR Change
                    </button>
                    {activeRelease.change_request && (
                      <button type="button" className="btn-secondary" onClick={() => handleSubmitCR(activeRelease.release_id)} disabled={actionLoading} style={{ border: '1px solid var(--color-brand)', color: 'var(--color-brand)' }}>
                        Submit CR for Review
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeSubTab === 'cab' && (
                <div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleAssessRisk(activeRelease.release_id)}
                    disabled={actionLoading}
                    style={{ marginBottom: '1.5rem' }}
                  >
                    ✦ Run CAB Risk Assessment (AI)
                  </button>

                  {activeRelease.change_request?.risk_scorecard && (
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--color-brand)', marginBottom: '0.5rem' }}>CAB Risk Scorecard</div>
                      <div><b>Calculated Risk Level:</b> {activeRelease.change_request.risk_scorecard.calculated_risk_level}</div>
                      <div><b>Blast Radius Score:</b> {activeRelease.change_request.risk_scorecard.blast_radius}</div>
                      <div style={{ marginTop: '0.5rem' }}><b>AI Governance Explanation:</b> {activeRelease.change_request.risk_scorecard.justification}</div>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0' }}>Director CAB Voting Action</h4>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleCABReview(activeRelease.release_id, 'approved')}
                        disabled={actionLoading}
                        style={{ background: 'var(--color-status-green-border)', border: 'none' }}
                      >
                        ✓ Vote Approve
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleCABReview(activeRelease.release_id, 'rejected')}
                        disabled={actionLoading}
                        style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}
                      >
                        ✗ Vote Reject
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
