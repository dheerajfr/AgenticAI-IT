import React from 'react';
import StatusPill from './StatusPill';

const moduleInfo = {
  'estimate-shape': {
    title: '02 Estimate & shape',
    owner: 'Person 2',
    status: 'building',
    description: 'Generates cost, effort ranges, duration estimates, and performs confidence assessment based on demand and historical records.',
    contract: {
      produces: 'Estimate Record',
      consumes: 'Demand Record',
      fields: [
        'estimate_id: string',
        'demand_id: string (FK)',
        'effort_days: number',
        'effort_range_low: number',
        'effort_range_high: number',
        'cost_estimate: number',
        'duration_weeks: number',
        'confidence: "low" | "medium" | "high"',
        'methodology: string',
        'status: "draft" | "challenged" | "approved" | "re-baselined"'
      ]
    }
  },
  'plan-schedule': {
    title: '03 Plan & schedule',
    owner: 'Person 3',
    status: 'not started',
    description: 'Creates task breakdown structures, maps predecessors, identifies the critical path, and schedules project timelines.',
    contract: {
      produces: 'Plan Record',
      consumes: 'Estimate Record',
      fields: [
        'plan_id: string',
        'demand_id: string (FK)',
        'end_date: date',
        'critical_path_task_ids: string[]',
        'tasks: Array<{ task_id, name, start_date, end_date, owner, predecessor_task_ids }>'
      ]
    }
  },
  'dependencies': {
    title: '04 Dependencies',
    owner: 'Person 4',
    status: 'not started',
    description: 'Maps cross-project, vendor, data, and resource dependency edges to alert teams about potential critical path blocks.',
    contract: {
      produces: 'Dependency Edge',
      consumes: 'Plan Record',
      fields: [
        'dependency_id: string',
        'source_task_id: string',
        'target_task_id: string',
        'type: "technical" | "resource" | "data" | "external-vendor"',
        'status: "open" | "at-risk" | "resolved"',
        'owner: string'
      ]
    }
  },
  'config-environments': {
    title: '05 Config & environments',
    owner: 'Person 5',
    status: 'not started',
    description: 'Tracks system releases, deployment configurations, and checks active environment drift status (Dev/Staging/Prod).',
    contract: {
      produces: 'Environment State Record',
      consumes: 'Deployment release specifications',
      fields: [
        'component_id: string',
        'environment: "dev" | "test" | "staging" | "prod"',
        'deployed_version: string',
        'expected_version: string',
        'drift_status: "in-sync" | "drifted"',
        'last_checked: datetime'
      ]
    }
  },
  'build-deploy': {
    title: '06 Build & deploy',
    owner: 'Person 6',
    status: 'not started',
    description: 'Orchestrates build triggers, artifact creation, and automated deployment pipelines across Dev, Staging, and Production environments.',
    contract: {
      produces: 'Build Artifact / Release baseline',
      consumes: 'Environment State Record',
      fields: [
        'build_id: string',
        'component_id: string',
        'version: string',
        'commit_sha: string',
        'status: "success" | "failed" | "running"',
        'built_at: datetime'
      ]
    }
  },
  'test-quality': {
    title: '07 Test & quality',
    owner: 'Person 7',
    status: 'not started',
    description: 'Executes continuous test suites, analyzes code coverage, and enforces quality gates before production release.',
    contract: {
      produces: 'Test execution reports / Quality gate status',
      consumes: 'Build Artifact / Release baseline',
      fields: [
        'test_run_id: string',
        'build_id: string',
        'passed_count: number',
        'failed_count: number',
        'coverage_percentage: number',
        'quality_gate_passed: boolean',
        'tested_at: datetime'
      ]
    }
  }
};

const styles = {
  container: {
    display: 'block',
    maxWidth: '800px',
    margin: '2rem auto',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  },
  card: {
    backgroundColor: 'var(--bg-secondary, #161f30)',
    border: '1px dashed var(--border-color, #2e3c54)',
    borderRadius: 'var(--radius-lg, 12px)',
    padding: '2.5rem',
    textAlign: 'center',
    boxShadow: 'var(--shadow-lg)',
    backdropFilter: 'blur(10px)',
  },
  iconContainer: {
    width: '60px',
    height: '60px',
    borderRadius: 'var(--radius-md, 8px)',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    color: 'var(--color-brand, #6366f1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1.5rem auto',
    border: '1px solid rgba(99, 102, 241, 0.2)',
  },
  icon: {
    width: '30px',
    height: '30px',
    fill: 'currentColor',
  },
  h2: {
    fontFamily: 'var(--font-display, "Outfit", sans-serif)',
    fontSize: '1.75rem',
    margin: '0 0 0.5rem 0',
    color: 'var(--text-primary, #f8fafc)',
  },
  subtitle: {
    color: 'var(--text-secondary, #94a3b8)',
    fontSize: '1rem',
    marginBottom: '1.5rem',
  },
  badgeRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.75rem',
    marginBottom: '2rem',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: 'var(--bg-primary, #0b0f19)',
    border: '1px solid var(--border-color, #2e3c54)',
    padding: '0.25rem 0.75rem',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: '0.8rem',
    color: 'var(--text-secondary, #94a3b8)',
  },
  description: {
    color: 'var(--text-secondary, #94a3b8)',
    fontSize: '1rem',
    lineHeight: 1.6,
    marginBottom: '2.5rem',
    maxWidth: '600px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  contractSection: {
    backgroundColor: 'var(--bg-primary, #0b0f19)',
    border: '1px solid var(--border-color, #2e3c54)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '1.5rem',
    textAlign: 'left',
  },
  contractTitle: {
    fontFamily: 'var(--font-display, "Outfit", sans-serif)',
    fontSize: '1.1rem',
    fontWeight: 600,
    marginTop: 0,
    marginBottom: '1rem',
    color: 'var(--color-brand, #6366f1)',
    borderBottom: '1px solid var(--border-color, #2e3c54)',
    paddingBottom: '0.5rem',
  },
  flowIndicators: {
    display: 'flex',
    gap: '1.5rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },
  indicatorLabel: {
    color: 'var(--text-muted, #64748b)',
    fontWeight: 500,
  },
  indicatorValue: {
    color: 'var(--text-primary, #f8fafc)',
  },
  fieldsList: {
    fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
    fontSize: '0.8rem',
    color: 'var(--text-secondary, #94a3b8)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '0.75rem 1rem',
    borderRadius: 'var(--radius-sm, 4px)',
    margin: 0,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  }
};

export default function ModulePlaceholder({ moduleId }) {
  const info = moduleInfo[moduleId] || {
    title: 'Module Not Found',
    owner: 'Unknown',
    status: 'not started',
    description: 'The selected module is not defined in this scaffold.',
    contract: { produces: 'N/A', consumes: 'N/A', fields: [] }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <svg style={styles.icon} viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
        </div>
        <h2 style={styles.h2}>Module Not Yet Connected</h2>
        <div style={styles.subtitle}>Slot reserved for {info.title}</div>
        
        <div style={styles.badgeRow}>
          <div style={styles.badge}>Owner: {info.owner}</div>
          <StatusPill status={info.status} />
        </div>
        
        <p style={styles.description}>{info.description}</p>
        
        <div style={styles.contractSection}>
          <h3 style={styles.contractTitle}>Shared Data Contract Interface</h3>
          <div style={styles.flowIndicators}>
            <div style={styles.flowIndicators}>
              <span style={styles.indicatorLabel}>Consumes: </span>
              <strong style={styles.indicatorValue}>{info.contract.consumes}</strong>
            </div>
            <div style={styles.flowIndicators}>
              <span style={styles.indicatorLabel}>Produces: </span>
              <strong style={styles.indicatorValue}>{info.contract.produces}</strong>
            </div>
          </div>
          <pre style={styles.fieldsList}>
            {info.contract.fields.map(f => `+ ${f}`).join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
}
