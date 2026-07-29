// Demand status values and their display color classes
export const DEMAND_STATUS_COLORS = {
  approved: 'green',
  classified: 'amber',
  'capacity-checked': 'amber',
  rejected: 'red',
  pending: 'gray',
  draft: 'gray',
};

export const getDemandStatusColor = (status) => {
  return DEMAND_STATUS_COLORS[status] || 'gray';
};

// Deploy step statuses
export const DEPLOY_STEP_STATUSES = ['pending', 'in-progress', 'done', 'blocked'];

// Environment types
export const ENVIRONMENT_TYPES = ['dev', 'test', 'staging', 'prod'];

// Risk likelihood/impact levels
export const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];

// Dependency types
export const DEPENDENCY_TYPES = ['blocks', 'blocked-by', 'relates-to', 'depends-on'];

// Test result statuses
export const TEST_STATUSES = ['Pass', 'Fail', 'Pending', 'Skipped', 'Blocked'];
