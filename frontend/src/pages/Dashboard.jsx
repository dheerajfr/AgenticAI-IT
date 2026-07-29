import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { dashboardService } from '../services/dashboardService';

export default function Dashboard() {
  const { selectedDemandId, selectedDemand } = useProject();
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (selectedDemandId) {
      const load = async () => {
        showLoader('Loading dashboard analytics...');
        try {
          const res = await dashboardService.loadProjectData(selectedDemandId);
          setData(res);
        } catch (e) {
          showToast('Failed to load dashboard data', 'error');
        } finally {
          hideLoader();
        }
      };
      load();
    } else {
      setData(null);
    }
  }, [selectedDemandId]);

  if (!selectedDemandId) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)', margin: '2rem' }}>
        <svg style={{ width: '48px', height: '48px', color: 'var(--text-muted)', marginBottom: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.25rem' }}>No Active Project Selected</h3>
        <p style={{ margin: '0 auto 1.5rem auto', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
          To view the end-to-end status of a delivery pipeline, please select or create a project demand in the Intake step.
        </p>
        <button className="btn-primary" onClick={() => navigate('/demand-intake')}>
          Go to Demand Intake &rarr;
        </button>
      </div>
    );
  }

  // Summarize stats
  const activeDefects = data?.testQuality?.defect_triage?.triaged_defects?.filter(d => d.recommended_action !== 'close' && d.recommended_action !== 'resolved').length || 0;
  const envDrifted = data?.environments ? data.environments.filter(e => e.drift_status !== 'in-sync').length : 0;
  
  // Calculate Phase stage progress percentage
  let stagePct = 10;
  if (selectedDemand) {
    if (selectedDemand.status === 'approved') stagePct = 100;
    else if (selectedDemand.status === 'capacity-checked') stagePct = 75;
    else if (selectedDemand.status === 'classified') stagePct = 40;
    else if (selectedDemand.status === 'intake') stagePct = 20;
  }

  const renderStatusBadge = (status) => {
    let style = { padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '12px', fontWeight: 700, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
    if (status === 'Completed' || status === 'Approved') {
      style = { ...style, background: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)' };
    } else if (status === 'In Progress' || status === 'Waiting' || status === 'Pending Approval') {
      style = { ...style, background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)' };
    } else if (status === 'Failed' || status === 'Rejected') {
      style = { ...style, background: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)' };
    }
    return <span style={style}>{status}</span>;
  };

  const renderCard = (title, moduleId, status, outputsHtml, approvalsHtml, errorsHtml = '') => {
    return (
      <details className="dashboard-card" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '1rem' }}>
        <summary style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--bg-secondary)', outline: 'none', listStyle: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.1rem' }}>{title}</h4>
            {renderStatusBadge(status)}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              sessionStorage.setItem('selectedDemandId', selectedDemandId);
              navigate(`/${moduleId}`);
            }}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            View Details &rarr;
          </button>
        </summary>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {errorsHtml && (
            <div style={{ background: 'var(--color-status-red-bg)', border: '1px solid var(--color-status-red-border)', padding: '1rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-status-red-text)', fontSize: '0.85rem' }}>
              {errorsHtml}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Generated Outputs</h5>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: outputsHtml || '<span style="color:var(--text-muted);">No outputs yet.</span>' }} />
            </div>
            <div>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Approval History</h5>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: approvalsHtml || '<span style="color:var(--text-muted);">N/A</span>' }} />
            </div>
          </div>
        </div>
      </details>
    );
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
        
        {/* Progress Card */}
        <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Intake Stage Progress</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.5rem 0' }}>{stagePct}%</div>
          <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${stagePct}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '3px' }} />
          </div>
        </div>

        {/* Defects Card */}
        <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Open Defects</div>
          <div style={{ fontSize: '2.0rem', fontWeight: 800, color: activeDefects > 0 ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)', margin: '0.5rem 0' }}>
            {activeDefects}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pending resolution</div>
        </div>

        {/* Environments Card */}
        <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Drifted Environments</div>
          <div style={{ fontSize: '2.0rem', fontWeight: 800, color: envDrifted > 0 ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)', margin: '0.5rem 0' }}>
            {envDrifted}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Out of {data?.environments?.length || 0} provisioned</div>
        </div>
      </div>

      {/* Accordion List for Stages */}
      <div>
        <h3 style={{ margin: '0 0 1.5rem 0', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.35rem' }}>
          Delivery Pipeline Stages
        </h3>

        {/* 1. Demand & Intake Card */}
        {(() => {
          if (!data?.demand) return renderCard('Demand & Intake', 'demand-intake', 'Pending', '', '');
          const outputs = `
            • Business Requirement Document (Auto-generated)<br>
            • Priority: <strong>${data.demand.priority || 'Medium'}</strong><br>
            • Target Date: ${data.demand.target_date || 'N/A'}
          `;
          const approvals = `
            Status: <strong>${data.demand.status}</strong><br>
            Requested By: ${data.demand.business_owner || data.demand.submitted_by}
          `;
          let status = 'In Progress';
          if (data.demand.status === 'approved') status = 'Approved';
          else if (data.demand.status === 'rejected') status = 'Rejected';
          return renderCard('Demand & Intake', 'demand-intake', status, outputs, approvals);
        })()}

        {/* 2. Estimate & Shape Card */}
        {(() => {
          if (!data?.estimate) return renderCard('Estimate & Shape', 'estimate-shape', 'Pending', '', '');
          const outputs = `
            • Effort Estimate: <strong>${data.estimate.effort_days} days</strong><br>
            • Confidence: ${data.estimate.confidence}<br>
            • Risk Factors: ${data.estimate.risk_factors ? data.estimate.risk_factors.join(', ') : 'None'}
          `;
          return renderCard('Estimate & Shape', 'estimate-shape', 'Completed', outputs, '');
        })()}

        {/* 3. Plan & Schedule Card */}
        {(() => {
          if (!data?.plan) return renderCard('Plan & Schedule', 'plan-schedule', 'Pending', '', '');
          const outputs = `
            • Project Plan ID: ${data.plan.plan_id}<br>
            • Sprints: ${data.plan.sprints ? data.plan.sprints.length : 0}<br>
            • Status: ${data.plan.status}
          `;
          const approvals = `
            Decision: <strong>${data.plan.human_decision || data.plan.status || 'Pending'}</strong>
          `;
          const isApproved = data.plan.status === 'accepted' || data.plan.status === 'approved' || data.plan.human_decision === 'approved';
          return renderCard('Plan & Schedule', 'plan-schedule', isApproved ? 'Approved' : 'In Progress', outputs, approvals);
        })()}

        {/* 4. Dependencies Card */}
        {(() => {
          if (!data?.dependencies || !data.dependencies.length) return renderCard('Dependencies', 'dependencies', 'Pending', '', '');
          const resolvedCount = data.dependencies.filter(d => d.status === 'resolved').length;
          const total = data.dependencies.length;
          const outputs = `
            • Total Dependencies: <strong>${total}</strong><br>
            • Resolved: ${resolvedCount}<br>
            • Blocked: ${data.dependencies.filter(d => d.status === 'blocked').length}
          `;
          return renderCard('Dependencies', 'dependencies', resolvedCount === total ? 'Completed' : 'In Progress', outputs, '');
        })()}

        {/* 5. Config Environments Card */}
        {(() => {
          if (!data?.environments || !data.environments.length) return renderCard('Config Environments', 'config-environments', 'Pending', '', '');
          const syncCount = data.environments.filter(e => e.drift_status === 'in-sync').length;
          const total = data.environments.length;
          const outputs = `
            • Environments Provisioned: <strong>${total}</strong><br>
            • In-Sync: ${syncCount}<br>
            • Drifted: ${total - syncCount}
          `;
          return renderCard('Config Environments', 'config-environments', syncCount === total ? 'Completed' : 'In Progress', outputs, '');
        })()}

        {/* 6. Build & Deploy Card */}
        {(() => {
          if (!data?.deployments || !data.deployments.length) return renderCard('Build & Deploy', 'build-deploy', 'Pending', '', '');
          const dep = data.deployments[0];
          const outputs = `
            • Deployment ID: ${dep.deployment_id}<br>
            • Version: ${dep.version || 'unknown'}<br>
            • Cutover Session: ${dep.cutover_id || 'None'}
          `;
          const approvals = `
            Status: <strong>${dep.status}</strong><br>
            Decided By: ${dep.decided_by || 'Pending'}
          `;
          let errorsHtml = '';
          if (dep.status === 'no-go') errorsHtml = 'Deployment marked as No-Go. Resolve issues before proceeding.';
          const status = (dep.status === 'completed' || dep.status === 'done') ? 'Completed' : ((dep.status === 'no-go' || dep.status === 'rolled-back') ? 'Failed' : 'In Progress');
          return renderCard('Build & Deploy', 'build-deploy', status, outputs, approvals, errorsHtml);
        })()}

        {/* 7. Test & Quality Card */}
        {(() => {
          const tq = data?.testQuality;
          if (!tq || (!tq.test_generation && !tq.test_data && !tq.test_execution && !tq.security_testing && !tq.traceability && !tq.quality_gate)) {
            return renderCard('Test & Quality', 'test-quality', 'Pending', '', '');
          }
          const passed = tq.passed_tests !== undefined ? tq.passed_tests : (tq.test_execution?.summary?.passed || 0);
          const total = tq.total_tests !== undefined ? tq.total_tests : (tq.test_execution?.summary?.total || 0);
          const passRate = tq.pass_rate_pct !== undefined ? tq.pass_rate_pct : (tq.test_execution?.summary?.pass_rate_pct || 0);
          const openDefects = tq.open_defects !== undefined ? tq.open_defects : (tq.defect_triage?.triaged_defects?.filter(d => d.recommended_action !== 'close' && d.recommended_action !== 'resolved').length || 0);
          const criticalDefects = tq.critical_defects !== undefined ? tq.critical_defects : (tq.defect_triage?.triaged_defects?.filter(d => d.severity === 'critical' && d.recommended_action !== 'close').length || 0);
          const appsecFindings = tq.open_appsec_findings !== undefined ? tq.open_appsec_findings : (tq.security_testing?.summary?.total || 0);

          const outputs = `
            • Passed Tests: <strong>${passed} / ${total}</strong><br>
            • Pass Rate: ${passRate}%<br>
            • Open Defects: ${openDefects} (Critical: ${criticalDefects})<br>
            • AppSec Findings: ${appsecFindings}
          `;
          let qgHtml = 'Quality Gate: Not Evaluated';
          let errorsHtml = '';
          let status = 'In Progress';
          if (data.qualityGate || tq.quality_gate) {
            const qg = data.qualityGate || tq.quality_gate;
            qgHtml = `Quality Gate Verdict: <strong>${qg.verdict}</strong> (Score: ${qg.score})`;
            if (qg.verdict === 'PASS') status = 'Completed';
            else if (qg.verdict === 'FAIL') {
              status = 'Failed';
              errorsHtml = 'Quality Gate Failed. Release is blocked until defects/vulnerabilities are resolved.';
            }
          }
          return renderCard('Test & Quality', 'test-quality', status, outputs, qgHtml, errorsHtml);
        })()}

        {/* 8. Release & Change Card */}
        {(() => {
          if (!data?.releases || !data.releases.length) return renderCard('Release & Change', 'release-change', 'Pending', '', '');
          const rel = data.releases[0];
          const summaryText = rel.summary || rel.change_summary || rel.description || 'Automated Release Record';
          const riskClass = rel.risk_assessment ? rel.risk_assessment.risk_class : (rel.risk_score ? (rel.risk_score > 60 ? 'High' : (rel.risk_score > 30 ? 'Medium' : 'Low')) : 'Unknown');
          const outputs = `
            • Release ID: ${rel.release_id}<br>
            • Summary: ${summaryText}<br>
            • Risk Level: ${riskClass}
          `;
          let approvals = 'CAB Decision: Pending';
          let errorsHtml = '';
          const decision = rel.cab_decision || rel.cab_status;
          const comments = rel.cab_comments || 'N/A';
          let status = rel.status || 'Waiting';
          if (decision) {
            approvals = `
              CAB Status: <strong>${String(decision).toUpperCase()}</strong><br>
              Comments: ${comments}
            `;
            if (String(decision).toLowerCase() === 'approve' || String(decision).toLowerCase() === 'approved') status = 'Approved';
            else if (String(decision).toLowerCase() === 'reject' || String(decision).toLowerCase() === 'rejected') {
              status = 'Rejected';
              errorsHtml = 'Release rejected by CAB.';
            } else if (status === 'Waiting') {
              status = 'Pending Approval';
            }
          }
          return renderCard('Release & Change', 'release-change', status, outputs, approvals, errorsHtml);
        })()}

        {/* 9. Ops Readiness Card */}
        {(() => {
          const or = data?.opsReadiness;
          if (!or || (!or.monitoring && !or.handover && !or.validation)) {
            return renderCard('Ops Readiness', 'ops-readiness', 'Pending', '', '');
          }
          let monitoring = or.monitoring && or.monitoring.setup_completed ? 'Completed' : 'Pending';
          let validation = or.validation && or.validation.overall_status ? or.validation.overall_status : 'Pending';
          let directorSignoff = or.validation && or.validation.director_sign_off ? 'Signed Off' : 'Pending';
          const outputs = `
            • Monitoring Setup: <strong>${monitoring}</strong><br>
            • Readiness Validation: <strong>${validation}</strong><br>
          `;
          const approvals = `
            Director Sign-Off: <strong>${directorSignoff}</strong>
          `;
          let status = directorSignoff === 'Signed Off' ? 'Completed' : 'In Progress';
          return renderCard('Ops Readiness', 'ops-readiness', status, outputs, approvals);
        })()}

        {/* 10. Always On Workspace Control Center Card */}
        {(() => {
          let combinedOutputs = '<ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem;">';
          let hasData = false;

          if (data?.aoRisk?.risks && data.aoRisk.risks.length > 0) {
            combinedOutputs += `<li><strong style="color:var(--text-primary);">Risk & Issues:</strong> ${data.aoRisk.risks.length} Active Risks</li>`;
            hasData = true;
          }
          if (data?.aoBudget && data.aoBudget.actual_spend !== undefined) {
            combinedOutputs += `<li><strong style="color:var(--text-primary);">Budget & Cost:</strong> $${data.aoBudget.actual_spend} Consumed</li>`;
            hasData = true;
          }
          if (data?.aoVendor && data.aoVendor.vendors && data.aoVendor.vendors.length > 0) {
            combinedOutputs += `<li><strong style="color:var(--text-primary);">Vendor Coordination:</strong> ${data.aoVendor.vendors.length} Active Vendors</li>`;
            hasData = true;
          }
          if (data?.aoReport?.reports && data.aoReport.reports.length > 0) {
            combinedOutputs += `<li><strong style="color:var(--text-primary);">Reporting & Comms:</strong> ${data.aoReport.reports.length} Generated Reports</li>`;
            hasData = true;
          }
          if (data?.aoKnowledge?.artifacts && data.aoKnowledge.artifacts.length > 0) {
            combinedOutputs += `<li><strong style="color:var(--text-primary);">Knowledge & Artefacts:</strong> ${data.aoKnowledge.artifacts.length} Saved Artefacts</li>`;
            hasData = true;
          }
          
          if (!hasData) {
            combinedOutputs = '<span style="color:var(--text-muted);">No Always-On data available.</span>';
          } else {
            combinedOutputs += '</ul>';
          }

          return (
            <details className="dashboard-card" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <summary style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--bg-secondary)', outline: 'none', listStyle: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Always On Control Center</h4>
                  <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '12px', fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)' }}>Active</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sessionStorage.setItem('selectedDemandId', selectedDemandId);
                    navigate('/always-on');
                  }}
                  style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--color-brand)', color: '#fff' }}
                >
                  View Details &rarr;
                </button>
              </summary>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Aggregated Outputs</h5>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: combinedOutputs }} />
                </div>
              </div>
            </details>
          );
        })()}

      </div>
    </div>
  );
}
