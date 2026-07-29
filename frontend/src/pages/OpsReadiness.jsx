import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { opsReadinessService } from '../services/opsReadinessService';
import { demandService } from '../services/demandService';
import { buildDeployService } from '../services/buildDeployService';
import { testQualityService } from '../services/testQualityService';
import { releaseService } from '../services/releaseService';
import StatusPill from '../components/common/StatusPill';

export default function OpsReadiness() {
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Core listings data
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);
  const [opsActiveTab, setOpsActiveTab] = useState('validation'); // 'validation' | 'handover' | 'monitoring'

  // Search sidebar
  const [searchTerm, setSearchTerm] = useState('');

  // Loaded Details state
  const [opsRecord, setOpsRecord] = useState(null);
  const [opsEnvironments, setOpsEnvironments] = useState([]);
  const [opsPlan, setOpsPlan] = useState(null);
  const [opsReleaseLogs, setOpsReleaseLogs] = useState([]);
  const [opsAllRunbooks, setOpsAllRunbooks] = useState([]);
  const [opsAllDefects, setOpsAllDefects] = useState([]);

  // Form states: Monitoring
  const [monComponents, setMonComponents] = useState('');
  const [monEnv, setMonEnv] = useState('prod');
  const [monAvailability, setMonAvailability] = useState('');
  const [monLatency, setMonLatency] = useState('');

  // Form states: Handover KT
  const [hoRunbookId, setHoRunbookId] = useState('');
  const [hoDeliveryTeam, setHoDeliveryTeam] = useState('');
  const [hoSupportGroup, setHoSupportGroup] = useState('ops-support@company.com');
  const [monSreReviewer, setMonSreReviewer] = useState('sre-oncall@company.com');
  const [hoOpsReviewer, setHoOpsReviewer] = useState('ops-manager@company.com');

  // Form states: Validation Signoff
  const [valReadinessId, setValReadinessId] = useState('');
  const [valCutoverId, setValCutoverId] = useState('');
  const [valMonRef, setValMonRef] = useState('');
  const [valDirectorEmail, setValDirectorEmail] = useState('director.delivery@company.com');

  const loadData = async () => {
    try {
      const dList = await demandService.getDemands().catch(() => []);
      setDemands(dList || []);

      const [runbooks, defects] = await Promise.all([
        buildDeployService.getRunbooks().catch(() => []),
        testQualityService.getDefects('dummy').catch(() => []) // we will load specifically per demand inside loadDemandDetails
      ]);
      setOpsAllRunbooks(runbooks || []);

      const pendingDemandId = sessionStorage.getItem('selectedDemandId');
      if (pendingDemandId) {
        setSelectedDemandId(pendingDemandId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadDemandDetails = async (id) => {
    if (!id) return;
    showLoader('Loading operations readiness pack...');
    try {
      // 1. Fetch ops record
      const record = await opsReadinessService.getRecord(id).catch(() => null);
      setOpsRecord(record);

      // 2. Fetch environments details
      const envs = await fetch(`/api/environments/${id}`).then(res => res.json()).catch(() => []);
      setOpsEnvironments(envs);

      // 3. Fetch plan details
      const plan = await fetch(`/api/plans`).then(res => res.json()).then(list => list.find(p => p.demand_id === id)).catch(() => null);
      setOpsPlan(plan);

      // 4. Fetch defects list
      const dfList = await testQualityService.getDefects(id).catch(() => []);
      setOpsAllDefects(dfList);

      // 5. Fetch release audit logs
      const suffix = id.split('-').pop();
      const releaseDetails = await releaseService.getReleaseDetails(`REL-${suffix}-1`).catch(() => null);
      if (releaseDetails) {
        setOpsReleaseLogs(releaseDetails.audit_logs || []);
      } else {
        setOpsReleaseLogs([]);
      }

      // Pre-fill parameters
      const suffixCode = id.split('-').pop();
      setValReadinessId(`RDY-${suffixCode}-1`);
      setValCutoverId(`CUT-${suffixCode}-1`);
      setValMonRef(`observability://dashboards/ops-readiness-${suffixCode}`);

      // Derive component scope
      let derivedComps = [];
      let derivedEnv = 'prod';
      const prodEnv = envs.find((e) => e.environment === 'prod') || envs[0];
      if (prodEnv) {
        derivedEnv = prodEnv.environment;
        let svcName = prodEnv.cmdb_name || '';
        svcName = svcName.replace(/-prod-svr-\d+/, '')
                         .replace(/-staging-svr-\d+/, '')
                         .replace(/-test-svr-\d+/, '')
                         .replace(/-dev-svr-\d+/, '')
                         .replace(/-prod/, '')
                         .replace(/-staging/, '')
                         .replace(/-test/, '')
                         .replace(/-dev/, '');
        if (svcName) derivedComps.push(svcName);
        if (prodEnv.expected_requirements && Array.isArray(prodEnv.expected_requirements)) {
          prodEnv.expected_requirements.forEach((req) => {
            let clean = req.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
            if (clean && !derivedComps.includes(clean)) {
              derivedComps.push(clean);
            }
          });
        }
      }
      setMonComponents(derivedComps.join(', ') || 'svc-payments-api, svc-auth');
      setMonEnv(derivedEnv);

      // Derive delivery contacts
      let derivedContacts = [];
      if (plan && plan.tasks) {
        const set = new Set();
        plan.tasks.forEach((t) => {
          if (t.owner) {
            t.owner.split(',').forEach((o) => {
              let em = o.trim();
              if (em) {
                if (!em.includes('@')) em = em.toLowerCase().replace(/\s+/g, '.') + '@company.com';
                set.add(em);
              }
            });
          }
        });
        derivedContacts = Array.from(set);
      }
      setHoDeliveryTeam(derivedContacts.join(', ') || 'd.chen@company.com, clara.davis@company.com');

    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadDemandDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    setSelectedDemandId(id);
    sessionStorage.setItem('selectedDemandId', id);
  };

  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  // Action: SRE Monitoring Draft Submit
  const handleGenerateMonitoringPlan = async () => {
    if (!selectedDemandId) return;
    showLoader('Generating Monitoring Plan via SRE agent...');
    try {
      const planId = opsPlan ? opsPlan.plan_id : `PLN-${selectedDemandId.split('-').pop()}-1`;
      await opsReadinessService.submitMonitoring({
        demand_id: selectedDemandId,
        plan_id: planId,
        component_ids: monComponents.split(',').map((c) => c.trim()).filter(Boolean),
        environment: monEnv || 'prod',
        target_availability_slo: monAvailability ? parseFloat(monAvailability) : null,
        target_latency_p99_ms: monLatency ? parseInt(monLatency) : null
      });
      await loadDemandDetails(selectedDemandId);
      showToast('✓ Monitoring plan generated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: SRE Sign-off approval
  const handleApproveSreMonitoring = async () => {
    if (!selectedDemandId) return;
    showLoader('Submitting SRE approval...');
    try {
      await opsReadinessService.submitSreReview(selectedDemandId, {
        reviewed_by: monSreReviewer
      });
      await loadDemandDetails(selectedDemandId);
      showToast('✓ SRE monitoring plan approved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: Ops Handover Draft Submit
  const handleGenerateHandoverPack = async () => {
    if (!selectedDemandId) return;
    showLoader('Drafting Handover manual pack...');
    try {
      const suffix = selectedDemandId.split('-').pop();
      await opsReadinessService.submitHandover({
        demand_id: selectedDemandId,
        runbook_id: hoRunbookId || `RBK-${suffix}-1`,
        delivery_team_contacts: hoDeliveryTeam.split(',').map((c) => c.trim()).filter(Boolean),
        ops_support_email: hoSupportGroup
      });
      await loadDemandDetails(selectedDemandId);
      showToast('✓ Handover documentation generated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: Ops Handover Approval sign-off
  const handleApproveOpsHandover = async () => {
    if (!selectedDemandId) return;
    showLoader('Submitting Operations approval...');
    try {
      await opsReadinessService.submitOpsReview(selectedDemandId, {
        reviewed_by: hoOpsReviewer
      });
      await loadDemandDetails(selectedDemandId);
      showToast('✓ Operations handover approved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: Validate Readiness Checks
  const handleEvaluateReadiness = async () => {
    if (!selectedDemandId) return;
    showLoader('Evaluating readiness preconditions...');
    try {
      await opsReadinessService.submitValidation({
        demand_id: selectedDemandId,
        readiness_id: valReadinessId,
        cutover_session_id: valCutoverId,
        monitoring_dashboard_ref: valMonRef
      });
      await loadDemandDetails(selectedDemandId);
      showToast('✓ Readiness checklist evaluated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: Director Sign-off Approve Release
  const handleDirectorSignoff = async () => {
    if (!selectedDemandId) return;
    showLoader('Signing-off readiness track...');
    try {
      await opsReadinessService.submitDirectorSignoff(selectedDemandId, {
        sign_off_by: valDirectorEmail
      });
      await loadDemandDetails(selectedDemandId);
      showToast('✓ Release officially certified for deployment');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const demand = demands.find((d) => d.demand_id === selectedDemandId);
  const suffix = selectedDemandId ? selectedDemandId.split('-').pop() : '';

  const isMonApproved = opsRecord && opsRecord.monitoring && opsRecord.monitoring.sre_reviewed;
  const isHoApproved = opsRecord && opsRecord.handover && opsRecord.handover.status === 'reviewed';

  return (
    <div className="intake-screen">
      {/* Sidebar listing */}
      <aside className="sidebar">
        <div className="sidebar-search" style={{ padding: '1rem' }}>
          <input
            type="text"
            placeholder="Search project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
          />
        </div>
        <ul className="demand-list">
          {filteredDemands.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No projects found.
            </li>
          ) : (
            filteredDemands.map((d) => {
              const active = d.demand_id === selectedDemandId;
              return (
                <li
                  key={d.demand_id}
                  className={`demand-item ${active ? 'active' : ''}`}
                  onClick={() => handleSelectDemand(d.demand_id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{d.demand_id}</span>
                  </div>
                  <h4 className="demand-item-title">{d.title}</h4>
                  <div className="demand-item-meta">
                    <span>Status: {d.status}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main details Workspace */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Operations Readiness</h2>
          <div>
            <select
              value={selectedDemandId || ''}
              onChange={(e) => handleSelectDemand(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minWidth: '280px', cursor: 'pointer' }}
            >
              <option value="">Select a Project...</option>
              {demands.map((d) => (
                <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedDemandId ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a project from the left sidebar or the dropdown list to load ops packages.
            </div>
          ) : (
            <div>
              {/* Tabs list */}
              <div className="tq-tab-header" style={{ flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button className={`tq-tab-btn ${opsActiveTab === 'validation' ? 'active' : ''}`} onClick={() => setOpsActiveTab('validation')}>09-A: Readiness Validation</button>
                <button className={`tq-tab-btn ${opsActiveTab === 'handover' ? 'active' : ''}`} onClick={() => setOpsActiveTab('handover')}>09-B: Handover &amp; KT</button>
                <button className={`tq-tab-btn ${opsActiveTab === 'monitoring' ? 'active' : ''}`} onClick={() => setOpsActiveTab('monitoring')}>09-C: Monitoring Setup</button>
              </div>

              {/* READINESS VALIDATION TAB */}
              {opsActiveTab === 'validation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>09-A: Go-Live Readiness Validation</h3>
                    {opsRecord && opsRecord.validation ? (
                      <span className={`ops-pill ${opsRecord.validation.status === 'approved' ? 'pass' : 'warn'}`}>
                        {opsRecord.validation.status === 'approved' ? 'Signed-Off' : 'Pending Sign-Off'}
                      </span>
                    ) : (
                      <span className="ops-pill fail">Not Evaluated</span>
                    )}
                  </div>

                  <div className="ops-card">
                    <div className="ops-card-title">Go-Live Readiness Checklist</div>
                    <div className="grid-2col">
                      <div className="tq-form-group">
                        <label>Release Readiness ID (Stage 6-A)</label>
                        <input type="text" value={valReadinessId} onChange={(e) => setValReadinessId(e.target.value)} />
                      </div>
                      <div className="tq-form-group">
                        <label>Cutover Bridge Session ID (Stage 6-C)</label>
                        <input type="text" value={valCutoverId} onChange={(e) => setValCutoverId(e.target.value)} />
                      </div>
                    </div>
                    <div className="tq-form-group">
                      <label>Monitoring Config Dashboard Ref</label>
                      <input type="text" value={valMonRef} onChange={(e) => setValMonRef(e.target.value)} />
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <div className="ops-check-item">
                        <input type="checkbox" checked={!!isMonApproved} disabled />
                        <div>
                          <strong style={{ fontSize: '0.85rem' }}>Monitoring Configured &amp; Approved</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {isMonApproved ? '✓ SRE sign-off verified.' : '✗ SRE monitoring review pending.'}
                          </div>
                        </div>
                      </div>
                      <div className="ops-check-item">
                        <input type="checkbox" checked={!!isHoApproved} disabled />
                        <div>
                          <strong style={{ fontSize: '0.85rem' }}>Support Team Briefed (KT Complete)</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {isHoApproved ? '✓ Support manual and KB articles completed.' : '✗ KT package review pending.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button onClick={handleEvaluateReadiness} className="ops-btn" style={{ marginTop: '1rem' }}>
                      Evaluate Readiness Checklist
                    </button>
                  </div>

                  {opsRecord && opsRecord.validation && (
                    <div className="ops-card">
                      <div className="ops-card-title">Readiness Validation Results</div>
                      <div className="ops-grid">
                        <div>
                          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Checklist outcomes</h4>
                          {(opsRecord.validation.criteria_results || []).map((cr) => (
                            <div key={cr.criterion} className="ops-check-item" style={{ justifyValue: 'space-between', padding: '0.6rem 0.75rem' }}>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'capitalize' }}>{cr.criterion.replace(/_/g, ' ')}</span>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{cr.evidence}</div>
                              </div>
                              <span className={`ops-pill ${cr.status === 'pass' ? 'pass' : cr.status === 'warn' ? 'warn' : 'fail'}`}>{cr.status}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyValue: 'center', alignItems: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Overall Verdict</span>
                          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.35rem', color: opsRecord.validation.overall_status === 'pass' ? '#10b981' : '#f59e0b' }}>
                            {opsRecord.validation.overall_status.toUpperCase()}
                          </div>
                          {(opsRecord.validation.gaps || []).length > 0 ? (
                            <div style={{ marginTop: '1rem', textAlign: 'left', width: '100%' }}>
                              <strong style={{ fontSize: '0.78rem', color: '#ef4444' }}>Detected gaps:</strong>
                              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {opsRecord.validation.gaps.map((g, idx) => <li key={idx}>{g}</li>)}
                              </ul>
                            </div>
                          ) : (
                            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#10b981' }}>No gaps detected. Ready for signoff.</div>
                          )}
                        </div>
                      </div>

                      {opsRecord.validation.status !== 'approved' ? (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyValue: 'flex-end', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.8rem' }}>Approving Director: </label>
                          <input type="text" value={valDirectorEmail} onChange={(e) => setValDirectorEmail(e.target.value)} style={{ width: '220px' }} />
                          <button onClick={handleDirectorSignoff} className="ops-btn">Sign-off &amp; Approve Release</button>
                        </div>
                      ) : (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-status-green-text)', fontWeight: 'bold' }}>
                            ✓ Ops Readiness fully signed off by {opsRecord.validation.sign_off_by}. Certified ready.
                          </span>
                          <button onClick={() => navigate('/always-on/risk-issues')} className="ops-btn" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 700 }}>
                            Proceed to Always On 🚀
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Audit Logs Trail */}
                  {opsReleaseLogs.length > 0 && (
                    <div className="ops-card" style={{ marginTop: '1.25rem' }}>
                      <div className="ops-card-title">Release Compliance Audit Trail</div>
                      <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                        {opsReleaseLogs.map((log, idx) => (
                          <div key={idx} className="ops-check-item" style={{ justifyValue: 'space-between', padding: '0.5rem 0.75rem' }}>
                            <div>
                              <strong style={{ fontSize: '0.82rem' }}>{log.event}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                By: {log.performed_by || 'system'} | Module: {log.module_name || 'Release'}
                              </div>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{log.timestamp ? log.timestamp.split('T')[1].substring(0, 8) : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* HANDOVER KT TAB */}
              {opsActiveTab === 'handover' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>09-B: Operations Handover &amp; KT</h3>
                    {opsRecord && opsRecord.handover ? (
                      <span className={`ops-pill ${opsRecord.handover.status === 'reviewed' ? 'pass' : 'warn'}`}>
                        {opsRecord.handover.status === 'reviewed' ? 'Ops Approved' : 'Draft'}
                      </span>
                    ) : (
                      <span className="ops-pill fail">Not Drafted</span>
                    )}
                  </div>

                  <div className="ops-card">
                    <div className="ops-card-title">Assemble Handover Information</div>
                    <div className="tq-form-group">
                      <label>Approved Deployment Runbook *</label>
                      <select value={hoRunbookId} onChange={(e) => setHoRunbookId(e.target.value)}>
                        <option value="">-- select runbook --</option>
                        {opsAllRunbooks.map((r) => (
                          <option key={r.runbook_id} value={r.runbook_id}>{r.runbook_id} — {r.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid-2col">
                      <div className="tq-form-group">
                        <label>Delivery Team Contacts</label>
                        <input type="text" value={hoDeliveryTeam} onChange={(e) => setHoDeliveryTeam(e.target.value)} />
                      </div>
                      <div className="tq-form-group">
                        <label>Support Group Email</label>
                        <input type="text" value={hoSupportGroup} onChange={(e) => setHoSupportGroup(e.target.value)} />
                      </div>
                    </div>
                    <button onClick={handleGenerateHandoverPack} className="ops-btn">
                      Draft Operations Handover Pack via AI
                    </button>
                  </div>

                  {opsRecord && opsRecord.handover && (
                    <div className="ops-card">
                      <div className="ops-card-title">AI Generated Support Runbook &amp; KT Pack</div>
                      <div className="tq-form-group">
                        <label>KT SharePoint Package URL</label>
                        <a href="#" style={{ color: 'var(--color-brand)', fontWeight: 600 }}>
                          {opsRecord.handover.kt_pack_url} &nbsp;🔗 (Click to View Complete SharePoint Package)
                        </a>
                      </div>

                      <div className="ops-grid" style={{ marginTop: '1rem' }}>
                        <div>
                          <h4 style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.35rem' }}>Operations Support Manual</h4>
                          {(opsRecord.handover.support_runbook.sections || []).map((s) => (
                            <div key={s.section} style={{ marginBottom: '0.75rem' }}>
                              <strong style={{ fontSize: '0.8rem', display: 'block' }}>{s.section}</strong>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.1)', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)' }}>{s.content}</div>
                            </div>
                          ))}
                        </div>

                        <div>
                          <h4 style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.35rem' }}>Known Errors Database (KB)</h4>
                          {(opsRecord.handover.known_errors || []).length === 0 ? (
                            <div style={{ padding: '1rem', color: '#10b981', textAlign: 'center' }}>✓ No unresolved defects from Stage 07.</div>
                          ) : (
                            opsRecord.handover.known_errors.filter(ke => ke.ke_id !== 'KE-000').map((ke) => (
                              <div key={ke.ke_id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                <div style={{ fontWeight: 'bold' }}>{ke.ke_id}: {ke.title}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Impact: {ke.operational_impact}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Workaround: {ke.workaround}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {opsRecord.handover.status !== 'reviewed' ? (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyValue: 'flex-end', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.8rem' }}>Operations Manager Email: </label>
                          <input type="email" value={hoOpsReviewer} onChange={(e) => setHoOpsReviewer(e.target.value)} style={{ width: '200px' }} />
                          <button onClick={handleApproveOpsHandover} className="ops-btn">Approve Operations Handover</button>
                        </div>
                      ) : (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--color-status-green-text)', fontWeight: 'bold', textValue: 'right' }}>
                          ✓ Handover signed off by Operations Group. Briefing checklist updated.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MONITORING SETUP TAB */}
              {opsActiveTab === 'monitoring' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>09-C: Production Monitoring Setup</h3>
                    {opsRecord && opsRecord.monitoring ? (
                      <span className={`ops-pill ${opsRecord.monitoring.sre_reviewed ? 'pass' : 'warn'}`}>
                        {opsRecord.monitoring.sre_reviewed ? 'SRE Approved' : 'Pending SRE Approval'}
                      </span>
                    ) : (
                      <span className="ops-pill fail">Not Configured</span>
                    )}
                  </div>

                  <div className="ops-card">
                    <div className="ops-card-title">Configure Dynamic AI Monitoring Policy &amp; Scope</div>
                    <div className="grid-2col">
                      <div className="tq-form-group">
                        <label>Components to Monitor (comma-separated)</label>
                        <input type="text" value={monComponents} onChange={(e) => setMonComponents(e.target.value)} />
                      </div>
                      <div className="tq-form-group">
                        <label>Target Environment</label>
                        <input type="text" value={monEnv} onChange={(e) => setMonEnv(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid-2col">
                      <div className="tq-form-group">
                        <label>Target Availability SLO (%) [Optional Override]</label>
                        <input type="number" value={monAvailability} onChange={(e) => setMonAvailability(e.target.value)} placeholder="e.g. 99.99" />
                      </div>
                      <div className="tq-form-group">
                        <label>Target Latency SLO (ms) [Optional Override]</label>
                        <input type="number" value={monLatency} onChange={(e) => setMonLatency(e.target.value)} placeholder="e.g. 250" />
                      </div>
                    </div>
                    <button onClick={handleGenerateMonitoringPlan} className="ops-btn">
                      Generate Monitoring Plan via AI Agent
                    </button>
                  </div>

                  {opsRecord && opsRecord.monitoring && (
                    <div className="ops-card">
                      <div className="ops-card-title">AI Generated Support Monitoring Plan</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Active SLO Targets:</div>
                          {(opsRecord.monitoring.slo_targets || []).map((slo) => (
                            <div key={slo.component_id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.6rem', marginBottom: '0.4rem', fontSize: '0.78rem' }}>
                              <div style={{ fontWeight: 'bold' }}>{slo.component_id}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.3rem', marginTop: '0.25rem', textAlign: 'center' }}>
                                <div>Avail SLO: <strong>{slo.availability_slo_pct}%</strong></div>
                                <div>Latency SLO: <strong>{slo.latency_p99_ms}ms</strong></div>
                                <div>Error SLO: <strong>{slo.error_rate_threshold_pct}%</strong></div>
                                <div>CPU Max: <strong>{slo.cpu_threshold_pct}%</strong></div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Proposed Alerts policies:</div>
                          {(opsRecord.monitoring.proposed_alerts || []).map((a) => (
                            <div key={a.alert_id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                              <strong>{a.name} ({a.alert_id})</strong> - Severity: {a.severity}
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Condition: {a.condition}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {!opsRecord.monitoring.sre_reviewed ? (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', justifyValue: 'flex-end', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.8rem' }}>SRE Reviewer Email: </label>
                          <input type="email" value={monSreReviewer} onChange={(e) => setMonSreReviewer(e.target.value)} style={{ width: '200px' }} />
                          <button onClick={handleApproveSreMonitoring} className="ops-btn">Approve Monitoring Plan</button>
                        </div>
                      ) : (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--color-status-green-text)', fontWeight: 'bold', textValue: 'right' }}>
                          ✓ Monitoring Plan signed off by {opsRecord.monitoring.sre_reviewed_by || 'SRE Lead'}. Ready.
                        </div>
                      )}
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
