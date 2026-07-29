import { requestSafe, API_BASE } from './api';

export const dashboardService = {
  loadProjectData: async (demandId) => {
    const data = { demandId };
    
    // Fetch parallel, swallowing errors on optional sub-modules
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
      opsReadiness
    ] = await Promise.all([
      requestSafe(`${API_BASE}/demands`),
      requestSafe(`${API_BASE}/estimates`),
      requestSafe(`${API_BASE}/plans`),
      requestSafe(`${API_BASE}/environments`),
      requestSafe(`${API_BASE}/dependencies`),
      requestSafe(`${API_BASE}/deployments/orchestration`),
      requestSafe(`${API_BASE}/deployments/cutover`),
      requestSafe(`${API_BASE}/test-quality/consolidated/${demandId}`),
      requestSafe(`${API_BASE}/test-quality/relational/quality_gate/${demandId}`),
      requestSafe(`${API_BASE}/release-change/releases`),
      requestSafe(`${API_BASE}/risk-issues/project/${demandId}`),
      requestSafe(`${API_BASE}/budget-cost/project/${demandId}`),
      requestSafe(`${API_BASE}/vendor-coordination/project/${demandId}`),
      requestSafe(`${API_BASE}/reporting-communication/project/${demandId}`),
      requestSafe(`${API_BASE}/knowledge-artifacts/project/${demandId}`),
      requestSafe(`${API_BASE}/ops-readiness/records/${demandId}`)
    ]);

    // Aggregate and Filter
    if (demandData) data.demand = demandData.find(d => d.demand_id === demandId);
    if (estimates) data.estimate = estimates.find(e => e.demand_id === demandId);
    if (plans) data.plan = plans.find(p => p.demand_id === demandId);
    if (environments) data.environments = environments.filter(e => e.demand_id === demandId);
    
    if (dependencies) {
      data.dependencies = dependencies.filter(d => 
        (d.plan_id && data.plan && d.plan_id === data.plan.plan_id) || 
        (data.plan && d.plan_id === data.plan.plan_id) || 
        d.demand_id === demandId
      ); 
      // Fallback
      if (!data.dependencies.length && data.plan) {
        data.dependencies = dependencies.filter(d => d.plan_id === data.plan.plan_id);
      }
    }
    
    if (deployOrch) data.deployments = deployOrch.filter(d => d.demand_id === demandId || d.project_id === demandId);
    if (deployCutover) data.cutover = deployCutover.filter(c => c.demand_id === demandId);
    data.testQuality = tqConsolidated || null;
    data.qualityGate = tqQualityGate ? tqQualityGate[0] || null : null;
    if (releases) data.releases = releases.filter(r => r.demand_id === demandId || r.project_id === demandId);

    data.opsReadiness = opsReadiness || null;

    // Always On data
    data.aoRisk = aoRisk || null;
    data.aoBudget = aoBudget || null;
    data.aoVendor = aoVendor || null;
    data.aoReport = aoReport || null;
    data.aoKnowledge = aoKnowledge || null;

    return data;
  }
};
