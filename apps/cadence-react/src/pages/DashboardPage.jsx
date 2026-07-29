import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadProjectData } from '../api/dashboardApi';
import { getDemands } from '../api/demandsApi';
import { determineCurrentStage, getStageProgress } from '../utils/stageHelpers';
import { useAppContext } from '../context/AppContext';
import Spinner from '../components/common/Spinner';
import StatusPill from '../components/common/StatusPill';

// ─── Business Logic Helpers ───────────────────────────────────────────────────

function calculateHealth(data) {
  if (data.qualityGate && data.qualityGate.verdict === 'FAIL') return 'Blocked';
  if (data.dependencies && data.dependencies.some((d) => d.status === 'blocked')) return 'Blocked';
  if (data.deployments && data.deployments.some((d) => d.status === 'no-go' || d.status === 'rolled-back')) return 'Delayed';
  if (data.releases && data.releases.some((r) => {
    const dec = r.cab_decision || r.cab_status;
    return dec && (String(dec).toLowerCase() === 'reject' || String(dec).toLowerCase() === 'rejected');
  })) return 'At Risk';
  return 'Healthy';
}

const stageOrder = [
  'demand-intake', 'estimate-shape', 'config-environments',
  'plan-schedule', 'dependencies', 'build-deploy',
  'test-quality', 'release-change', 'ops-readiness',
];

function getStageStatus(stage, currentStage, data) {
  if (stage === 'test-quality' && data.qualityGate && data.qualityGate.verdict === 'FAIL') return 'failed';
  if (stage === 'release-change' && data.releases && data.releases.some((r) => {
    const dec = r.cab_decision || r.cab_status;
    return dec && (dec.toLowerCase() === 'reject' || dec.toLowerCase() === 'rejected');
  })) return 'failed';
  if (stage === 'build-deploy' && data.deployments && data.deployments.some((d) => d.status === 'no-go')) return 'failed';

  let isCompleted = false;
  if (stage === 'demand-intake') isCompleted = !!(data.demand && data.demand.status === 'approved');
  else if (stage === 'estimate-shape') isCompleted = !!data.estimate;
  else if (stage === 'config-environments') isCompleted = !!(data.environments && data.environments.length > 0 && data.environments.every((e) => e.drift_status === 'in-sync'));
  else if (stage === 'plan-schedule') isCompleted = !!(data.plan && data.plan.human_decision === 'approved');
  else if (stage === 'dependencies') isCompleted = !!(data.dependencies && data.dependencies.length > 0 && data.dependencies.every((d) => d.status === 'resolved'));
  else if (stage === 'build-deploy') isCompleted = !!(data.deployments && data.deployments.length > 0 && data.deployments.some((d) => d.status === 'completed' || d.status === 'done'));
  else if (stage === 'test-quality') isCompleted = !!(data.qualityGate && data.qualityGate.verdict === 'PASS');
  else if (stage === 'release-change') isCompleted = !!(data.releases && data.releases.length > 0 && data.releases.some((r) => {
    const dec = r.cab_decision || r.cab_status;
    return dec && (dec.toLowerCase() === 'approve' || dec.toLowerCase() === 'approved');
  }));
  else if (stage === 'ops-readiness') isCompleted = !!(data.opsReadiness && data.opsReadiness.validation && data.opsReadiness.validation.director_sign_off);

  if (isCompleted) return 'completed';
  if (stage === currentStage) return 'current';
  const currentIdx = stageOrder.indexOf(currentStage);
  const thisIdx = stageOrder.indexOf(stage);
  if (thisIdx < currentIdx) return 'current';
  return 'pending';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineNode({ label, stageId, currentStage, data }) {
  const status = getStageStatus(stageId, currentStage, data);
  const styles = {
    completed: { dot: { bg: 'var(--color-status-green-bg)', border: 'var(--color-status-green-border)' }, label: 'var(--color-status-green-text)' },
    current: { dot: { bg: 'rgba(99,102,241,0.1)', border: 'var(--color-brand)' }, label: 'var(--color-brand)' },
    failed: { dot: { bg: 'var(--color-status-red-bg)', border: 'var(--color-status-red-border)' }, label: 'var(--color-status-red-text)' },
    pending: { dot: { bg: 'var(--bg-secondary)', border: 'var(--border-color)' }, label: 'var(--text-muted)' },
  };
  const s = styles[status] || styles.pending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: 80 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: s.dot.bg, border: `2px solid ${s.dot.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {status === 'completed' && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-status-green-text)' }}>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
          </svg>
        )}
      </div>
      <div style={{ fontSize: '0.7rem', textAlign: 'center', color: s.label, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function TimelineLine({ fromStage, currentStage, data }) {
  const status = getStageStatus(fromStage, currentStage, data);
  return (
    <div style={{ flex: 1, height: 2, background: status === 'completed' ? 'var(--color-status-green-border)' : 'var(--border-color)' }} />
  );
}

function DashboardCard({ title, moduleId, status, outputs, approvals, errors, onNavigate }) {
  const [open, setOpen] = useState(false);

  const badgeStyle = {
    Completed: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)' },
    Approved: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)' },
    'In Progress': { bg: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)' },
    Waiting: { bg: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)' },
    'Pending Approval': { bg: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)' },
    Failed: { bg: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)' },
    Rejected: { bg: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)' },
    Pending: { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' },
  };
  const badge = badgeStyle[status] || badgeStyle.Pending;

  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div
        style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--bg-secondary)' }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.1rem' }}>{title}</h4>
          <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: 12, fontWeight: 700, background: badge.bg, color: badge.color }}>{status}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate(moduleId); }}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          >
            View Details →
          </button>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </div>
      </div>
      {open && (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {errors && (
            <div style={{ background: 'var(--color-status-red-bg)', border: '1px solid var(--color-status-red-border)', padding: '1rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-status-red-text)', fontSize: '0.85rem' }}>
              {errors}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Generated Outputs</h5>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: outputs || '<span style="color:var(--text-muted)">No outputs yet.</span>' }}
              />
            </div>
            <div>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Approval History</h5>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: approvals || '<span style="color:var(--text-muted)">N/A</span>' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card Data Builders ───────────────────────────────────────────────────────

function buildDemandCard(data) {
  if (!data.demand) return { title: 'Demand & Intake', moduleId: 'demand-intake', status: 'Pending', outputs: '', approvals: '' };
  let status = 'In Progress';
  if (data.demand.status === 'approved') status = 'Approved';
  else if (data.demand.status === 'rejected') status = 'Rejected';
  return {
    title: 'Demand & Intake', moduleId: 'demand-intake', status,
    outputs: `• Business Requirement Document (Auto-generated)<br/>• Priority: <strong>${data.demand.priority}</strong><br/>• Target Date: ${data.demand.target_date}`,
    approvals: `Status: <strong>${data.demand.status}</strong><br/>Requested By: ${data.demand.business_owner}`,
  };
}

function buildEstimateCard(data) {
  if (!data.estimate) return { title: 'Estimate & Shape', moduleId: 'estimate-shape', status: 'Pending', outputs: '', approvals: '' };
  return {
    title: 'Estimate & Shape', moduleId: 'estimate-shape', status: 'Completed',
    outputs: `• Effort Estimate: <strong>${data.estimate.effort_days} days</strong><br/>• Confidence: ${data.estimate.confidence}<br/>• Risk Factors: ${data.estimate.risk_factors ? data.estimate.risk_factors.join(', ') : 'None'}`,
    approvals: '',
  };
}

function buildConfigCard(data) {
  if (!data.environments || !data.environments.length) return { title: 'Config Environments', moduleId: 'config-environments', status: 'Pending', outputs: '', approvals: '' };
  const syncCount = data.environments.filter((e) => e.drift_status === 'in-sync').length;
  const total = data.environments.length;
  return {
    title: 'Config Environments', moduleId: 'config-environments',
    status: syncCount === total ? 'Completed' : 'In Progress',
    outputs: `• Environments Provisioned: <strong>${total}</strong><br/>• In-Sync: ${syncCount}<br/>• Drifted: ${total - syncCount}`,
    approvals: '',
  };
}

function buildPlanCard(data) {
  if (!data.plan) return { title: 'Plan & Schedule', moduleId: 'plan-schedule', status: 'Pending', outputs: '', approvals: '' };
  return {
    title: 'Plan & Schedule', moduleId: 'plan-schedule',
    status: data.plan.human_decision === 'approved' ? 'Approved' : 'In Progress',
    outputs: `• Project Plan ID: ${data.plan.plan_id}<br/>• Sprints: ${data.plan.sprints ? data.plan.sprints.length : 0}<br/>• Status: ${data.plan.status}`,
    approvals: `Decision: <strong>${data.plan.human_decision || 'Pending'}</strong>`,
  };
}

function buildDepsCard(data) {
  if (!data.dependencies || !data.dependencies.length) return { title: 'Dependencies', moduleId: 'dependencies', status: 'Pending', outputs: '', approvals: '' };
  const resolvedCount = data.dependencies.filter((d) => d.status === 'resolved').length;
  const total = data.dependencies.length;
  return {
    title: 'Dependencies', moduleId: 'dependencies',
    status: resolvedCount === total ? 'Completed' : 'In Progress',
    outputs: `• Total Dependencies: <strong>${total}</strong><br/>• Resolved: ${resolvedCount}<br/>• Blocked: ${data.dependencies.filter((d) => d.status === 'blocked').length}`,
    approvals: '',
  };
}

function buildDeployCard(data) {
  if (!data.deployments || !data.deployments.length) return { title: 'Build & Deploy', moduleId: 'build-deploy', status: 'Pending', outputs: '', approvals: '' };
  const dep = data.deployments[0];
  const status = (dep.status === 'completed' || dep.status === 'done') ? 'Completed' : ((dep.status === 'no-go' || dep.status === 'rolled-back') ? 'Failed' : 'In Progress');
  return {
    title: 'Build & Deploy', moduleId: 'build-deploy', status,
    outputs: `• Deployment ID: ${dep.deployment_id}<br/>• Version: ${dep.version || 'unknown'}`,
    approvals: `Status: <strong>${dep.status}</strong><br/>Decided By: ${dep.decided_by || 'Pending'}`,
    errors: dep.status === 'no-go' ? 'Deployment marked as No-Go. Resolve issues before proceeding.' : null,
  };
}

function buildTestCard(data) {
  const tq = data.testQuality;
  if (!tq || (!tq.test_generation && !tq.test_data && !tq.test_execution && !tq.security_testing && !tq.traceability && !tq.quality_gate)) {
    return { title: 'Test & Quality', moduleId: 'test-quality', status: 'Pending', outputs: '', approvals: '' };
  }
  const passed = tq.passed_tests !== undefined ? tq.passed_tests : (tq.test_execution?.summary?.passed || 0);
  const total = tq.total_tests !== undefined ? tq.total_tests : (tq.test_execution?.summary?.total || 0);
  const passRate = tq.pass_rate_pct !== undefined ? tq.pass_rate_pct : (tq.test_execution?.summary?.pass_rate_pct || 0);
  const openDefects = tq.open_defects !== undefined ? tq.open_defects : (tq.defect_triage?.triaged_defects?.filter((d) => d.recommended_action !== 'close' && d.recommended_action !== 'resolved').length || 0);
  const criticalDefects = tq.critical_defects !== undefined ? tq.critical_defects : 0;
  const appsecFindings = tq.open_appsec_findings !== undefined ? tq.open_appsec_findings : (tq.security_testing?.summary?.total || 0);

  let qgHtml = 'Quality Gate: Not Evaluated';
  let errors = null;
  let status = 'In Progress';
  const qg = data.qualityGate || tq.quality_gate;
  if (qg) {
    qgHtml = `Quality Gate Verdict: <strong>${qg.verdict}</strong> (Score: ${qg.score})`;
    if (qg.verdict === 'PASS') status = 'Completed';
    else if (qg.verdict === 'FAIL') { status = 'Failed'; errors = 'Quality Gate Failed. Release is blocked until defects/vulnerabilities are resolved.'; }
  }

  return {
    title: 'Test & Quality', moduleId: 'test-quality', status,
    outputs: `• Passed Tests: <strong>${passed} / ${total}</strong><br/>• Pass Rate: ${passRate}%<br/>• Open Defects: ${openDefects} (Critical: ${criticalDefects})<br/>• AppSec Findings: ${appsecFindings}`,
    approvals: qgHtml,
    errors,
  };
}

function buildReleaseCard(data) {
  if (!data.releases || !data.releases.length) return { title: 'Release & Change', moduleId: 'release-change', status: 'Pending', outputs: '', approvals: '' };
  const rel = data.releases[0];
  const summaryText = rel.summary || rel.change_summary || rel.description || 'Automated Release Record';
  const riskClass = rel.risk_assessment ? rel.risk_assessment.risk_class : (rel.risk_score ? (rel.risk_score > 60 ? 'High' : (rel.risk_score > 30 ? 'Medium' : 'Low')) : 'Unknown');
  const decision = rel.cab_decision || rel.cab_status;
  const comments = rel.cab_comments || 'N/A';
  let status = rel.status || 'Waiting';
  let approvals = 'CAB Decision: Pending';
  let errors = null;
  if (decision) {
    approvals = `CAB Status: <strong>${String(decision).toUpperCase()}</strong><br/>Comments: ${comments}`;
    if (String(decision).toLowerCase() === 'approve' || String(decision).toLowerCase() === 'approved') status = 'Approved';
    else if (String(decision).toLowerCase() === 'reject' || String(decision).toLowerCase() === 'rejected') { status = 'Rejected'; errors = 'Release rejected by CAB.'; }
    else if (status === 'Waiting') status = 'Pending Approval';
  }
  return {
    title: 'Release & Change', moduleId: 'release-change', status,
    outputs: `• Release ID: ${rel.release_id}<br/>• Summary: ${summaryText}<br/>• Risk Level: ${riskClass}`,
    approvals,
    errors,
  };
}

function buildOpsCard(data) {
  const or = data.opsReadiness;
  if (!or || (!or.monitoring && !or.handover && !or.validation)) return { title: 'Ops Readiness', moduleId: 'ops-readiness', status: 'Pending', outputs: '', approvals: '' };
  const monitoring = or.monitoring && or.monitoring.setup_completed ? 'Completed' : 'Pending';
  const validation = or.validation && or.validation.overall_status ? or.validation.overall_status : 'Pending';
  const directorSignoff = or.validation && or.validation.director_sign_off ? 'Signed Off' : 'Pending';
  return {
    title: 'Ops Readiness', moduleId: 'ops-readiness',
    status: directorSignoff === 'Signed Off' ? 'Completed' : 'In Progress',
    outputs: `• Monitoring Setup: <strong>${monitoring}</strong><br/>• Readiness Validation: <strong>${validation}</strong>`,
    approvals: `Director Sign-Off: <strong>${directorSignoff}</strong>`,
  };
}

function buildAlwaysOnCard(data) {
  let combinedOutputs = '';
  let hasData = false;
  if (data.aoRisk && data.aoRisk.risks && data.aoRisk.risks.length > 0) { combinedOutputs += `• <strong>Risk & Issues:</strong> ${data.aoRisk.risks.length} Active Risks<br/>`; hasData = true; }
  if (data.aoBudget && data.aoBudget.actual_spend !== undefined) { combinedOutputs += `• <strong>Budget & Cost:</strong> $${data.aoBudget.actual_spend} Consumed<br/>`; hasData = true; }
  if (data.aoVendor && data.aoVendor.vendors && data.aoVendor.vendors.length > 0) { combinedOutputs += `• <strong>Vendor Coordination:</strong> ${data.aoVendor.vendors.length} Active Vendors<br/>`; hasData = true; }
  if (data.aoReport && data.aoReport.reports && data.aoReport.reports.length > 0) { combinedOutputs += `• <strong>Reporting & Comms:</strong> ${data.aoReport.reports.length} Generated Reports<br/>`; hasData = true; }
  if (data.aoKnowledge && data.aoKnowledge.artifacts && data.aoKnowledge.artifacts.length > 0) { combinedOutputs += `• <strong>Knowledge & Artefacts:</strong> ${data.aoKnowledge.artifacts.length} Saved Artefacts<br/>`; hasData = true; }
  if (!hasData) combinedOutputs = '<span style="color:var(--text-muted)">No Always-On data available.</span>';
  return { outputs: combinedOutputs, hasData };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const { selectedDemandId, selectDemand } = useAppContext();
  const [allDemands, setAllDemands] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectData, setProjectData] = useState(null);
  const [error, setError] = useState(null);
  const [localDemandId, setLocalDemandId] = useState(selectedDemandId || '');

  useEffect(() => {
    getDemands().then((d) => { if (d) setAllDemands(d); });
  }, []);

  const loadProject = useCallback(async (demandId) => {
    if (!demandId) return;
    setLoading(true);
    setError(null);
    setProjectData(null);
    const data = await loadProjectData(demandId);
    setLoading(false);
    if (!data.demand) { setError(`Project ${demandId} not found.`); return; }
    setProjectData(data);
  }, []);

  useEffect(() => {
    if (localDemandId) loadProject(localDemandId);
  }, [localDemandId, loadProject]);

  const handleSearch = (val) => {
    setSearch(val);
    const match = allDemands.find((d) => d.demand_id.toLowerCase().includes(val.toLowerCase()) || d.title.toLowerCase().includes(val.toLowerCase()));
    if (match) { setLocalDemandId(match.demand_id); selectDemand(match.demand_id); }
  };

  const handleDropdown = (val) => {
    setLocalDemandId(val);
    selectDemand(val);
  };

  const handleNavigate = (moduleId) => {
    selectDemand(localDemandId);
    navigate(`/${moduleId}`);
  };

  const currentStage = projectData ? determineCurrentStage(projectData) : '';
  const health = projectData ? calculateHealth(projectData) : '';
  const progressPct = projectData ? getStageProgress(currentStage) : 0;
  const healthColor = { Healthy: 'var(--color-status-green-text)', Delayed: 'var(--color-status-amber-text)', Blocked: 'var(--color-status-red-text)', 'At Risk': 'var(--color-status-amber-text)' };

  const cards = projectData ? [
    buildDemandCard(projectData),
    buildEstimateCard(projectData),
    buildConfigCard(projectData),
    buildPlanCard(projectData),
    buildDepsCard(projectData),
    buildDeployCard(projectData),
    buildTestCard(projectData),
    buildReleaseCard(projectData),
    buildOpsCard(projectData),
  ] : [];

  const alwaysOnCard = projectData ? buildAlwaysOnCard(projectData) : null;

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', overflowY: 'auto', animation: 'fade-in 0.3s ease' }}>
      {/* Header */}
      <style>{`details.dashboard-card > summary::-webkit-details-marker { display: none; } details.dashboard-card > summary:hover { background: rgba(0,0,0,0.02) !important; }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Project Dashboard</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>End-to-End Delivery Lifecycle Tracking</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="text"
            id="dash-search"
            placeholder="Search by Demand ID or Title..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', width: 300, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
          />
          <select
            id="dash-dropdown"
            value={localDemandId}
            onChange={(e) => handleDropdown(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            <option value="">Select a Project...</option>
            {allDemands.map((d) => (
              <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div id="dash-content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {!localDemandId && !loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            Select a project to view its lifecycle tracking.
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="loader"><Spinner /> Fetching real-time data across all modules...</span>
          </div>
        )}
        {error && <div style={{ color: 'var(--color-status-red-text)' }}>{error}</div>}

        {projectData && !loading && (
          <>
            {/* Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Project</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{projectData.demand.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{projectData.demand.demand_id}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Current Stage</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-brand)', marginTop: '0.25rem', textTransform: 'capitalize' }}>{currentStage.replace(/-/g, ' ')}</div>
                <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 3, marginTop: '0.75rem' }}>
                  <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--color-brand)', borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Overall Health</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: healthColor[health] || 'var(--text-primary)', marginTop: '0.25rem' }}>{health}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Progress: {progressPct}%</div>
              </div>
            </div>

            {/* Timeline */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Delivery Pipeline</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <TimelineNode label="Demand" stageId="demand-intake" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="demand-intake" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Estimate" stageId="estimate-shape" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="estimate-shape" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Config" stageId="config-environments" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="config-environments" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Plan" stageId="plan-schedule" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="plan-schedule" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Dependencies" stageId="dependencies" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="dependencies" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Deploy" stageId="build-deploy" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="build-deploy" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Test Quality" stageId="test-quality" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="test-quality" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Release" stageId="release-change" currentStage={currentStage} data={projectData} />
                <TimelineLine fromStage="release-change" currentStage={currentStage} data={projectData} />
                <TimelineNode label="Ops Readiness" stageId="ops-readiness" currentStage={currentStage} data={projectData} />
              </div>
            </div>

            {/* Stage Detail Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {cards.map((card, i) => (
                <DashboardCard key={i} {...card} onNavigate={handleNavigate} />
              ))}

              {/* Always On Section */}
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                Always On Modules
              </h3>
              {alwaysOnCard && (
                <DashboardCard
                  title="Always On Control Center"
                  moduleId="risk-issues"
                  status="Active"
                  outputs={alwaysOnCard.outputs}
                  approvals=""
                  onNavigate={handleNavigate}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
