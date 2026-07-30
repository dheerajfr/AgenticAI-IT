/**
 * Determine the current/furthest stage a project has reached.
 * Extracted from dashboard.js: determineCurrentStage()
 */
export function determineCurrentStage(data) {
  if (data.opsReadiness && (data.opsReadiness.monitoring || data.opsReadiness.handover || data.opsReadiness.validation)) return 'ops-readiness';
  if (data.releases && data.releases.length > 0) return 'release-change';
  if (
    data.qualityGate ||
    (data.testQuality &&
      (data.testQuality.test_generation ||
        data.testQuality.test_data ||
        data.testQuality.test_execution ||
        data.testQuality.security_testing ||
        data.testQuality.traceability ||
        data.testQuality.quality_gate))
  ) return 'test-quality';
  if (data.deployments && data.deployments.length > 0) return 'build-deploy';
  if (data.environments && data.environments.length > 0) return 'config-environments';
  if (data.dependencies && data.dependencies.length > 0) return 'dependencies';
  if (data.plan) return 'plan-schedule';
  if (data.estimate) return 'estimate-shape';
  return 'demand-intake';
}

/**
 * Get stage completion percentage (0-100)
 */
export function getStageProgress(currentStage) {
  const stageOrder = [
    'demand-intake',
    'estimate-shape',
    'plan-schedule',
    'dependencies',
    'config-environments',
    'build-deploy',
    'test-quality',
    'release-change',
    'ops-readiness',
  ];
  const idx = stageOrder.indexOf(currentStage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / stageOrder.length) * 100);
}
