import { fetchSafe } from './apiClient';

/**
 * Load all dashboard data in parallel for a given demandId.
 * Extracted verbatim from dashboard.js: loadProjectData()
 */
export async function loadProjectData(demandId) {
  const data = { demandId };

  const [
    demandData,
    estimates,
    plans,
    environments,
    dependencies,
    deployOrch,
    deployCutover,
    tqConsolidated,
    tqQualityGate,
    releases,
    aoRisk,
    aoBudget,
    aoVendor,
    aoReport,
    aoKnowledge,
    opsReadiness,
  ] = await Promise.all([
    fetchSafe('/api/demands'),
    fetchSafe('/api/estimates'),
    fetchSafe('/api/plans'),
    fetchSafe('/api/environments'),
    fetchSafe('/api/dependencies'),
    fetchSafe('/api/deployments/orchestration'),
    fetchSafe('/api/deployments/cutover'),
    fetchSafe(`/api/test-quality/consolidated/${demandId}`),
    fetchSafe(`/api/test-quality/relational/quality_gate/${demandId}`),
    fetchSafe('/api/release-change/releases'),
    fetchSafe(`/api/risk-issues/project/${demandId}`),
    fetchSafe(`/api/budget-cost/project/${demandId}`),
    fetchSafe(`/api/vendor-coordination/project/${demandId}`),
    fetchSafe(`/api/reporting-communication/project/${demandId}`),
    fetchSafe(`/api/knowledge-artifacts/project/${demandId}`),
    fetchSafe(`/api/ops-readiness/records/${demandId}`),
  ]);

  // Aggregate and Filter — identical logic to dashboard.js
  if (demandData) data.demand = demandData.find((d) => d.demand_id === demandId);
  if (estimates) data.estimate = estimates.find((e) => e.demand_id === demandId);
  if (plans) data.plan = plans.find((p) => p.demand_id === demandId);
  if (environments) data.environments = environments.filter((e) => e.demand_id === demandId);
  if (dependencies) {
    data.dependencies = dependencies.filter(
      (d) =>
        (d.plan_id && data.plan && d.plan_id === data.plan.plan_id) ||
        (data.plan && d.plan_id === data.plan.plan_id) ||
        d.demand_id === demandId
    );
  }
  // Fallback if deps map by plan_id
  if (dependencies && (!data.dependencies || !data.dependencies.length) && data.plan) {
    data.dependencies = dependencies.filter((d) => d.plan_id === data.plan.plan_id);
  }

  if (deployOrch) data.deployments = deployOrch.filter((d) => d.demand_id === demandId || d.project_id === demandId);
  if (deployCutover) data.cutover = deployCutover.filter((c) => c.demand_id === demandId);
  data.testQuality = tqConsolidated || null;
  data.qualityGate = tqQualityGate ? tqQualityGate[0] || null : null;
  if (releases) data.releases = releases.filter((r) => r.demand_id === demandId || r.project_id === demandId);

  data.opsReadiness = opsReadiness || null;
  data.aoRisk = aoRisk || null;
  data.aoBudget = aoBudget || null;
  data.aoVendor = aoVendor || null;
  data.aoReport = aoReport || null;
  data.aoKnowledge = aoKnowledge || null;

  return data;
}
