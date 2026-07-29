import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { releaseService } from '../services/releaseService';
import StatusPill from '../components/common/StatusPill';

export default function ReleaseChange() {
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Core listing lists
  const [releases, setReleases] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState({ demands: [], environments: [] });
  const [selectedReleaseId, setSelectedReleaseId] = useState(null);
  
  // Hydrated detail state for the selected release
  const [releaseDetail, setReleaseDetail] = useState(null);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEnvironment, setFilterEnvironment] = useState('');
  const [filterRisk, setFilterRisk] = useState('');

  // Active sub-tab in details view
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'change' | 'risk' | 'cab' | 'collision' | 'audit'

  // Creation modal form states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [modalProjectId, setModalProjectId] = useState('');
  const [modalPlanId, setModalPlanId] = useState('');
  const [modalEnvironment, setModalEnvironment] = useState('prod');
  const [modalVersion, setModalVersion] = useState('v1.0.0');
  const [modalScheduledDate, setModalScheduledDate] = useState('');
  const [modalReleaseType, setModalReleaseType] = useState('Minor');
  const [availablePlans, setAvailablePlans] = useState([]);

  // Change request tab editor states
  const [changeDescription, setChangeDescription] = useState('');
  const [changeImplementation, setChangeImplementation] = useState('');
  const [changeBackout, setChangeBackout] = useState('');
  const [changeVerification, setChangeVerification] = useState('');

  // CAB sign off form states
  const [cabApprover, setCabApprover] = useState('');
  const [cabComments, setCabComments] = useState('');

  // Fetch dropdown mappings and releases
  const loadData = async () => {
    try {
      const dropdowns = await releaseService.getDropdowns().catch(() => ({ demands: [], environments: [] }));
      setDropdownOptions(dropdowns);

      const list = await releaseService.getReleases().catch(() => []);
      setReleases(list || []);

      // Handoff support
      const pendingDemandId = sessionStorage.getItem('selectedDemandId');
      if (pendingDemandId) {
        setFilterProject(pendingDemandId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch details when selectedReleaseId changes
  const fetchReleaseDetails = async (id) => {
    if (!id) {
      setReleaseDetail(null);
      return;
    }
    showLoader('Loading release record details...');
    try {
      const res = await releaseService.getReleaseDetails(id);
      setReleaseDetail(res);
      
      // Seed Change request text fields
      if (res && res.change_request) {
        setChangeDescription(res.change_request.description || '');
        setChangeImplementation(res.change_request.implementation_steps || '');
        setChangeBackout(res.change_request.backout_plan || '');
        setChangeVerification(res.change_request.verification_plan || '');
      } else {
        setChangeDescription('');
        setChangeImplementation('');
        setChangeBackout('');
        setChangeVerification('');
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    fetchReleaseDetails(selectedReleaseId);
  }, [selectedReleaseId]);

  // Handle Project Change in creation modal to populate plans
  useEffect(() => {
    if (modalProjectId) {
      const match = dropdownOptions.demands.find((d) => d.demand_id === modalProjectId);
      if (match && match.plans) {
        setAvailablePlans(match.plans);
        if (match.plans.length > 0) {
          setModalPlanId(match.plans[0]);
        }
      } else {
        setAvailablePlans([]);
        setModalPlanId('');
      }
    } else {
      setAvailablePlans([]);
      setModalPlanId('');
    }
  }, [modalProjectId, dropdownOptions]);

  // Create Release record
  const handleCreateRelease = async (e) => {
    e.preventDefault();
    if (!modalProjectId || !modalPlanId || !modalScheduledDate) {
      showToast('Project, Plan and Scheduled Date are required.', 'error');
      return;
    }
    showLoader('Registering release track...');
    try {
      const payload = {
        project_id: modalProjectId,
        plan_id: modalPlanId,
        environment: modalEnvironment,
        version: modalVersion,
        scheduled_date: modalScheduledDate,
        release_type: modalReleaseType
      };
      const res = await releaseService.createRelease(payload);
      setCreateModalOpen(false);
      setSelectedReleaseId(res.release_id);
      await loadData();
      showToast('✓ Release registered');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Draft Change Request with AI
  const handleDraftChangeRequest = async () => {
    if (!selectedReleaseId) return;
    showLoader('✦ Drafting Change Request with AI...');
    try {
      await releaseService.draftChangeRequest(selectedReleaseId);
      await fetchReleaseDetails(selectedReleaseId);
      showToast('✓ AI change details drafted');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Save changes to Change Request document
  const handleSaveChangeRequest = async () => {
    if (!selectedReleaseId) return;
    showLoader('Saving change documentation...');
    try {
      await releaseService.submitChangeRequest(selectedReleaseId, {
        description: changeDescription,
        implementation_steps: changeImplementation,
        backout_plan: changeBackout,
        verification_plan: changeVerification
      });
      await fetchReleaseDetails(selectedReleaseId);
      showToast('✓ Change documentation saved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Submit to CAB
  const handleSubmitToCab = async () => {
    if (!selectedReleaseId) return;
    showLoader('Submitting change ticket to CAB...');
    try {
      await releaseService.submitToCab(selectedReleaseId);
      await fetchReleaseDetails(selectedReleaseId);
      showToast('✓ Submitted to CAB for review');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Evaluate risk score
  const handleEvaluateRisk = async () => {
    if (!selectedReleaseId) return;
    showLoader('Evaluating release risk profile...');
    try {
      await releaseService.evaluateRisk(selectedReleaseId);
      await fetchReleaseDetails(selectedReleaseId);
      showToast('✓ Risk assessment compiled');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // CAB Chairman Approve / Reject Signoff
  const handleCabReviewSubmit = async (statusVal) => {
    if (!selectedReleaseId) return;
    showLoader('Submitting CAB review decision...');
    try {
      await releaseService.submitCabReview(selectedReleaseId, {
        approver: cabApprover || 'CAB Committee Chair',
        comments: cabComments || 'Signed off.',
        decision: statusVal
      });
      setCabApprover('');
      setCabComments('');
      await fetchReleaseDetails(selectedReleaseId);
      showToast(`✓ Release signoff submitted: ${statusVal.toUpperCase()}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Run Collision overlap verification scan
  const handleCheckCollisions = async () => {
    if (!selectedReleaseId) return;
    showLoader('Scanning calendars for scheduling conflicts...');
    try {
      await releaseService.checkCollision(selectedReleaseId);
      await fetchReleaseDetails(selectedReleaseId);
      showToast('✓ Overlap checking completed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Run release audit checks
  const handleTriggerAudit = async () => {
    if (!selectedReleaseId) return;
    showLoader('Compiling release compliance audits...');
    try {
      await releaseService.auditRelease(selectedReleaseId);
      await fetchReleaseDetails(selectedReleaseId);
      showToast('✓ Compliance audit completed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Delete release
  const handleDeleteRelease = async (id) => {
    if (window.confirm(`Delete release record ${id}?`)) {
      showLoader('Deleting record...');
      try {
        await releaseService.deleteRelease(id);
        if (selectedReleaseId === id) {
          setSelectedReleaseId(null);
        }
        await loadData();
        showToast('Release record deleted');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  // Filtered release list
  const filteredReleases = releases.filter((r) => {
    const matchProj = !filterProject || r.project_id === filterProject;
    const matchStatus = !filterStatus || r.status === filterStatus;
    const matchEnv = !filterEnvironment || r.environment === filterEnvironment;
    let matchRisk = true;
    if (filterRisk) {
      if (filterRisk === 'high') matchRisk = r.risk_score >= 60;
      else if (filterRisk === 'medium') matchRisk = r.risk_score >= 35 && r.risk_score < 60;
      else if (filterRisk === 'low') matchRisk = r.risk_score < 35 && r.risk_score !== null;
    }
    return matchProj && matchStatus && matchEnv && matchRisk;
  });

  const getInsightCheckSymbol = (status) => {
    if (status === 'passed') return <span style={{ color: '#4ade80', fontWeight: 'bold' }}>✓</span>;
    if (status === 'fail') return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✗</span>;
    return <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>⚠</span>;
  };

  const getNextRecommendedAction = (r) => {
    if (!r) return '';
    if (r.status === 'Draft') {
      return "Complete change documentation and click 'Submit Change' to evaluate risk and start approvals.";
    }
    if (r.status === 'Pending Approval') {
      return "Change request is pending formal CAB review. Chairperson must review notes in the CAB Review Tab and sign off.";
    }
    if (r.status === 'Approved') {
      return (
        <div>
          Release is officially certified. Hand off to Operations module to schedule production deployment.
          <button onClick={() => navigate('/ops-readiness')} className="btn-primary" style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '4px 10px' }}>
            Proceed to Ops Readiness →
          </button>
        </div>
      );
    }
    if (r.status === 'Failed') {
      return "Release was rejected or deployment failed. Re-run tests, adjust plan dates, or request exceptions.";
    }
    return "Draft release documentation to get started.";
  };

  return (
    <div id="release-change-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', fontFamily: 'var(--font-sans)', height: '100%', overflowY: 'auto', paddingBottom: '2rem' }}>
      
      {!selectedReleaseId ? (
        /* MAIN DASHBOARD VIEW */
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>
                Release &amp; Change Governance Pipeline
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Stage 08 Governance Engine: ITSM Change tickets compliance gating &amp; CAB review approvals.
              </p>
            </div>
            <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
              ＋ Register Release Track
            </button>
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
            <div className="tq-card">
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Active Tracks</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>{releases.length}</div>
            </div>
            <div className="tq-card">
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Pending CAB Reviews</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.2rem' }}>{releases.filter((r) => r.status === 'Pending Approval').length}</div>
            </div>
            <div className="tq-card">
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Certified Releases</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4ade80', marginTop: '0.2rem' }}>{releases.filter((r) => r.status === 'Approved').length}</div>
            </div>
            <div className="tq-card">
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>CAB Approvals Success Rate</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-brand)', marginTop: '0.2rem' }}>
                {releases.length > 0 ? Math.round(((releases.length - releases.filter(r => r.status === 'Failed').length) / releases.length) * 100) : 100}%
              </div>
            </div>
          </div>

          {/* Filters Area */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div className="tq-form-group" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Filter Project</label>
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ padding: '0.35rem' }}>
                <option value="">All Projects</option>
                {dropdownOptions.demands.map((d) => (
                  <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
                ))}
              </select>
            </div>
            <div className="tq-form-group" style={{ flex: 1, minWidth: '130px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Filter Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.35rem' }}>
                <option value="">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <div className="tq-form-group" style={{ flex: 1, minWidth: '130px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Environment</label>
              <select value={filterEnvironment} onChange={(e) => setFilterEnvironment(e.target.value)} style={{ padding: '0.35rem' }}>
                <option value="">All Environments</option>
                <option value="dev">dev</option>
                <option value="test">test</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
            </div>
            <div className="tq-form-group" style={{ flex: 1, minWidth: '130px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Risk Level</label>
              <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} style={{ padding: '0.35rem' }}>
                <option value="">All Risks</option>
                <option value="low">Low (&lt;35)</option>
                <option value="medium">Medium (35-59)</option>
                <option value="high">High (&gt;=60)</option>
              </select>
            </div>
          </div>

          {/* Release List Grid */}
          <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>
              Active Release Governance Tracks
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.1)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem' }}>Release ID</th>
                  <th style={{ padding: '0.75rem' }}>Project Ref</th>
                  <th style={{ padding: '0.75rem' }}>Version</th>
                  <th style={{ padding: '0.75rem' }}>Environment</th>
                  <th style={{ padding: '0.75rem' }}>Risk Score</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReleases.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No release tracks match the filter constraints.
                    </td>
                  </tr>
                ) : (
                  filteredReleases.map((r) => (
                    <tr key={r.release_id} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => setSelectedReleaseId(r.release_id)}>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-brand)' }}>{r.release_id}</td>
                      <td style={{ padding: '0.75rem' }}>{r.project_id}</td>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{r.version}</td>
                      <td style={{ padding: '0.75rem', textTransform: 'uppercase' }}>{r.environment}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ color: r.risk_score >= 60 ? '#ef4444' : r.risk_score >= 35 ? '#fbbf24' : '#4ade80', fontWeight: 'bold' }}>
                          {r.risk_score !== null ? `${r.risk_score}/100` : 'Unscored'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }} className={r.status === 'Approved' ? 'green' : r.status === 'Draft' ? 'gray' : r.status === 'Failed' ? 'red' : 'amber'}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleDeleteRelease(r.release_id)} className="btn-secondary" style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* RELEASE DETAIL SPLIT WORKSPACE */
        releaseDetail && (
          <div>
            {/* Detail Header Back Panel */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={() => setSelectedReleaseId(null)} className="btn-secondary">
                  ← Back to Dashboard
                </button>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700 }}>
                    Release: <span style={{ fontFamily: 'monospace', color: 'var(--color-brand)' }}>{releaseDetail.release.release_id}</span> ({releaseDetail.release.version})
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Project Ref: <strong>{releaseDetail.release.project_id}</strong> | Plan ID: <strong>{releaseDetail.release.plan_id}</strong>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span className={`status-pill status-${releaseDetail.release.risk_score >= 60 ? 'red' : releaseDetail.release.risk_score >= 35 ? 'amber' : 'green'}`} style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Risk: {releaseDetail.release.risk_score !== null ? `${releaseDetail.release.risk_score}/100` : 'Unscored'}
                </span>
                <span className={`status-pill status-${releaseDetail.release.status === 'Approved' ? 'green' : releaseDetail.release.status === 'Draft' ? 'gray' : releaseDetail.release.status === 'Failed' ? 'red' : 'amber'}`} style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  {releaseDetail.release.status}
                </span>
              </div>
            </div>

            {/* Split layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', marginTop: '1.5rem' }}>
              {/* Left Column: Tabbed Area */}
              <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
                {/* Tab headers clickers */}
                <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.15)' }}>
                  {['overview', 'change', 'risk', 'cab', 'collision', 'audit'].map((tKey) => {
                    const active = activeSubTab === tKey;
                    return (
                      <button
                        key={tKey}
                        className={`tq-tab-btn ${active ? 'active' : ''}`}
                        onClick={() => setActiveSubTab(tKey)}
                        style={{ padding: '0.85rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: active ? '2px solid var(--color-brand)' : 'none', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                      >
                        {tKey === 'overview' ? 'Overview' : tKey === 'change' ? 'Change Request' : tKey === 'risk' ? 'Risk Assessment' : tKey === 'cab' ? 'CAB Review' : tKey === 'collision' ? 'Collision Detection' : 'Audit Trail'}
                      </button>
                    );
                  })}
                </div>

                {/* Sub Tab bodies */}
                <div style={{ padding: '1.5rem' }}>
                  {activeSubTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="grid-2col">
                        <div className="data-item"><div className="data-label">Release Type</div><div className="data-value">{releaseDetail.release.release_type}</div></div>
                        <div className="data-item"><div className="data-label">Target Environment</div><div className="data-value" style={{ textTransform: 'uppercase' }}>{releaseDetail.release.environment}</div></div>
                        <div className="data-item"><div className="data-label">Scheduled Date</div><div className="data-value">{releaseDetail.release.scheduled_date}</div></div>
                      </div>

                      <div className="tq-card" style={{ marginTop: '1rem' }}>
                        <h5 style={{ margin: '0 0 0.5rem 0', textTransform: 'uppercase', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Upstream Quality Gate Verification</h5>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Quality Gate verdict:</span>
                          <span style={{ fontWeight: 700, color: releaseDetail.upstream.quality.quality_gate === 'Passed' ? '#4ade80' : '#ef4444' }}>
                            {releaseDetail.upstream.quality.quality_gate.toUpperCase()} (Score: {releaseDetail.upstream.quality.quality_score}/100)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSubTab === 'change' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0 }}>ITSM Compliance Documentation</h4>
                        <button onClick={handleDraftChangeRequest} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                          ✦ AI Autocomplete Ticket
                        </button>
                      </div>

                      <div className="tq-form-group">
                        <label>Change Description &amp; Reason</label>
                        <textarea value={changeDescription} onChange={(e) => setChangeDescription(e.target.value)} style={{ minHeight: '80px' }} />
                      </div>
                      <div className="tq-form-group">
                        <label>Implementation Plan</label>
                        <textarea value={changeImplementation} onChange={(e) => setChangeImplementation(e.target.value)} style={{ minHeight: '80px' }} />
                      </div>
                      <div className="tq-form-group">
                        <label>Backout &amp; Rollback Plan</label>
                        <textarea value={changeBackout} onChange={(e) => setChangeBackout(e.target.value)} style={{ minHeight: '80px' }} />
                      </div>
                      <div className="tq-form-group">
                        <label>Post-Deployment Verification Plan</label>
                        <textarea value={changeVerification} onChange={(e) => setChangeVerification(e.target.value)} style={{ minHeight: '80px' }} />
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button onClick={handleSaveChangeRequest} className="btn-secondary">Save Draft</button>
                        <button onClick={handleSubmitToCab} className="btn-primary" disabled={releaseDetail.release.status !== 'Draft'}>Submit to CAB</button>
                      </div>
                    </div>
                  )}

                  {activeSubTab === 'risk' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0 }}>Governance Risk Assessment score</h4>
                        <button onClick={handleEvaluateRisk} className="btn-primary" style={{ fontSize: '0.8rem' }}>
                          Evaluate Risk Score
                        </button>
                      </div>

                      {releaseDetail.risk_assessment ? (
                        <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.9rem', marginBottom: '1rem', fontWeight: 600 }}>Risk Checklist Breakdown:</div>
                          <ul style={{ listStyle: 'disc', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.83rem' }}>
                            <li>Technical Complexity Index: {releaseDetail.risk_assessment.technical_complexity}</li>
                            <li>Critical Path Impact score: {releaseDetail.risk_assessment.dependency_depth}</li>
                            <li>Resource availability constraints: {releaseDetail.risk_assessment.calendar_overlaps} overlap(s)</li>
                            <li style={{ color: '#fbbf24', fontWeight: 600 }}>Calculated Risk Score: {releaseDetail.release.risk_score} / 100</li>
                          </ul>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No risk assessment run yet.</div>
                      )}
                    </div>
                  )}

                  {activeSubTab === 'cab' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <h4 style={{ margin: 0 }}>CAB Approval Portal</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        CAB chairperson sign-off portal. Review the change logs before approving.
                      </p>

                      <div className="tq-form-group">
                        <label>CAB Approver Name</label>
                        <input type="text" value={cabApprover} onChange={(e) => setCabApprover(e.target.value)} placeholder="e.g. CAB chairperson" />
                      </div>
                      <div className="tq-form-group">
                        <label>Approval / Rejection Comments</label>
                        <textarea value={cabComments} onChange={(e) => setCabComments(e.target.value)} placeholder="Add approval remarks..." style={{ minHeight: '60px' }} />
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleCabReviewSubmit('Failed')} className="btn-secondary" style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}>
                          ✗ Reject Release
                        </button>
                        <button onClick={() => handleCabReviewSubmit('Approved')} className="btn-primary">
                          ✓ Approve &amp; Certify
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSubTab === 'collision' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0 }}>Deployment Schedule overlaps</h4>
                        <button onClick={handleCheckCollisions} className="btn-primary" style={{ fontSize: '0.8rem' }}>
                          Check Schedule Collisions
                        </button>
                      </div>

                      {releaseDetail.collisions ? (
                        <div>
                          {releaseDetail.collisions.length === 0 ? (
                            <div style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.85rem', padding: '1rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '4px' }}>
                              ✓ No calendar schedule overlaps detected. Environment freeze rules cleared.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {releaseDetail.collisions.map((c, idx) => (
                                <div key={idx} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', padding: '0.75rem', fontSize: '0.82rem' }}>
                                  ⚠️ Conflict with <strong>{c.conflicting_release_id}</strong> scheduled on {c.date}.
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Collision detection not run yet.</div>
                      )}
                    </div>
                  )}

                  {activeSubTab === 'audit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0 }}>Compliance Governance Trail</h4>
                        <button onClick={handleTriggerAudit} className="btn-primary" style={{ fontSize: '0.8rem' }}>
                          Trigger Audit Scan
                        </button>
                      </div>

                      {releaseDetail.audit_logs && releaseDetail.audit_logs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {releaseDetail.audit_logs.map((log, idx) => (
                            <div key={idx} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.82rem' }}>
                              <div style={{ fontWeight: 600 }}>{log.action}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>By: {log.user} | {new Date(log.timestamp).toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No audit logs found. Run audit scan.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: AI Governance Insights & Checklist */}
              <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>✨</span> AI Insights
                  </h3>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Governance recommendations.</p>
                </div>

                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Release Readiness Score</div>
                  <div style={{ fontSize: '2.25rem', fontWeight: 800, color: releaseDetail.release.risk_score !== null ? (releaseDetail.release.risk_score >= 60 ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)') : 'var(--text-muted)' }}>
                    {releaseDetail.release.risk_score !== null ? (100 - releaseDetail.release.risk_score) : '—'}%
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 700 }}>Next Recommended Action:</div>
                  <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px dashed var(--color-brand)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', lineHeight: '1.4' }}>
                    {getNextRecommendedAction(releaseDetail.release)}
                  </div>

                  <div style={{ fontWeight: 700, marginTop: '0.5rem' }}>Release Checks Checklist:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>ITSM Change Ticket</span>
                      {getInsightCheckSymbol(releaseDetail.change_request ? 'passed' : 'fail')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>AI Risk Profiling</span>
                      {getInsightCheckSymbol(releaseDetail.risk_assessment ? 'passed' : 'fail')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Quality Gate Score</span>
                      {getInsightCheckSymbol(releaseDetail.upstream.quality.quality_gate === 'Passed' ? 'passed' : 'fail')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Freeze overlaps</span>
                      {getInsightCheckSymbol(releaseDetail.collisions && releaseDetail.collisions.length === 0 ? 'passed' : 'warn')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Creation Modal */}
      {createModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '2rem', minWidth: '400px', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Register Release Track</h3>
            <form onSubmit={handleCreateRelease}>
              <div className="tq-form-group">
                <label>Select Project (Demand)</label>
                <select value={modalProjectId} onChange={(e) => setModalProjectId(e.target.value)}>
                  <option value="">-- Choose Approved Demand --</option>
                  {dropdownOptions.demands.map((d) => (
                    <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
                  ))}
                </select>
              </div>
              <div className="tq-form-group">
                <label>Target Delivery Plan</label>
                <select value={modalPlanId} onChange={(e) => setModalPlanId(e.target.value)} disabled={!modalProjectId}>
                  <option value="">-- Choose Plan --</option>
                  {availablePlans.map((pl) => (
                    <option key={pl} value={pl}>{pl}</option>
                  ))}
                </select>
              </div>
              <div className="grid-2col">
                <div className="tq-form-group">
                  <label>Environment</label>
                  <select value={modalEnvironment} onChange={(e) => setModalEnvironment(e.target.value)}>
                    <option value="dev">dev</option>
                    <option value="test">test</option>
                    <option value="staging">staging</option>
                    <option value="prod">prod</option>
                  </select>
                </div>
                <div className="tq-form-group">
                  <label>Scheduled Date</label>
                  <input type="date" value={modalScheduledDate} onChange={(e) => setModalScheduledDate(e.target.value)} />
                </div>
              </div>
              <div className="grid-2col">
                <div className="tq-form-group">
                  <label>Release Version</label>
                  <input type="text" value={modalVersion} onChange={(e) => setModalVersion(e.target.value)} />
                </div>
                <div className="tq-form-group">
                  <label>Release Type</label>
                  <select value={modalReleaseType} onChange={(e) => setModalReleaseType(e.target.value)}>
                    <option value="Major">Major</option>
                    <option value="Minor">Minor</option>
                    <option value="Patch">Patch</option>
                    <option value="Hotfix">Hotfix</option>
                  </select>
                </div>
              </div>
              <div className="submit-row" style={{ marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setCreateModalOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Register</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
