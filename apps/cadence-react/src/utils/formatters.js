/**
 * Format a component/service ID into a human-readable name.
 * Extracted from build-deploy.js: formatSimpleName()
 */
export function formatSimpleName(compId) {
  if (!compId) return 'Unknown';
  let s = compId.toLowerCase();
  s = s.replace(/^svc-/, '');
  s = s.replace(/-api/, '');
  s = s.replace(/-prod.*/, '');
  s = s.replace(/-staging.*/, '');
  s = s.replace(/-test.*/, '');
  s = s.replace(/-dev.*/, '');
  s = s.replace(/-svr.*/, '');
  return s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Format a date string to a more readable format
 */
export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Format currency value
 */
export function formatCurrency(val, currency = 'USD') {
  if (val === null || val === undefined || val === '') return 'N/A';
  const num = parseFloat(val);
  if (isNaN(num)) return String(val);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
}

/**
 * Truncate a string to maxLen characters
 */
export function truncate(str, maxLen = 60) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/**
 * Get environment from a deployment record.
 * Extracted from build-deploy.js: getEnvironment()
 */
export function getDeploymentEnvironment(record, allDeployments = []) {
  if (record.environment) return record.environment;
  if (record.cutover_id && record.deployment_id) {
    const dep = allDeployments.find((d) => d.deployment_id === record.deployment_id);
    if (dep && dep.environment) return dep.environment;
  }
  if (record.steps && record.steps.length > 0) {
    const envOrder = ['dev', 'test', 'staging', 'prod'];
    let targetEnv = 'dev';
    for (const step of record.steps) {
      if (step.environment && envOrder.indexOf(step.environment) > envOrder.indexOf(targetEnv)) {
        targetEnv = step.environment;
      }
    }
    return targetEnv;
  }
  return 'N/A';
}

/**
 * Safe number parser — returns 0 if not a valid number
 */
export function safeNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}
