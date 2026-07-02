class ModulePlaceholder extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.moduleInfo = {
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
      }
    };
  }

  static get observedAttributes() {
    return ['module-id'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const moduleId = this.getAttribute('module-id') || '';
    const info = this.moduleInfo[moduleId] || {
      title: 'Module Not Found',
      owner: 'Unknown',
      status: 'not started',
      description: 'The selected module is not defined in this scaffold.',
      contract: { produces: 'N/A', consumes: 'N/A', fields: [] }
    };

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          max-width: 800px;
          margin: 2rem auto;
          font-family: var(--font-sans, system-ui, sans-serif);
        }
        .placeholder-card {
          background-color: var(--bg-secondary, #161f30);
          border: 1px dashed var(--border-color, #2e3c54);
          border-radius: var(--radius-lg, 12px);
          padding: 2.5rem;
          text-align: center;
          box-shadow: var(--shadow-lg);
          backdrop-filter: blur(10px);
          transition: border-color var(--transition-normal, 0.25s) ease;
        }
        .placeholder-card:hover {
          border-color: var(--color-brand, #6366f1);
        }
        .icon-container {
          width: 60px;
          height: 60px;
          border-radius: var(--radius-md, 8px);
          background-color: rgba(99, 102, 241, 0.1);
          color: var(--color-brand, #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem auto;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }
        .icon {
          width: 30px;
          height: 30px;
          fill: currentColor;
        }
        h2 {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 1.75rem;
          margin: 0 0 0.5rem 0;
          color: var(--text-primary, #f8fafc);
        }
        .subtitle {
          color: var(--text-secondary, #94a3b8);
          font-size: 1rem;
          margin-bottom: 1.5rem;
        }
        .badge-row {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 2rem;
          align-items: center;
        }
        .badge {
          background-color: var(--bg-primary, #0b0f19);
          border: 1px solid var(--border-color, #2e3c54);
          padding: 0.25rem 0.75rem;
          border-radius: var(--radius-sm, 4px);
          font-size: 0.8rem;
          color: var(--text-secondary, #94a3b8);
        }
        .description {
          color: var(--text-secondary, #94a3b8);
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 2.5rem;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }
        .contract-section {
          background-color: var(--bg-primary, #0b0f19);
          border: 1px solid var(--border-color, #2e3c54);
          border-radius: var(--radius-md, 8px);
          padding: 1.5rem;
          text-align: left;
        }
        .contract-title {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 0;
          margin-bottom: 1rem;
          color: var(--color-brand, #6366f1);
          border-bottom: 1px solid var(--border-color, #2e3c54);
          padding-bottom: 0.5rem;
        }
        .flow-indicators {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1rem;
          font-size: 0.85rem;
        }
        .indicator span {
          color: var(--text-muted, #64748b);
          font-weight: 500;
        }
        .indicator strong {
          color: var(--text-primary, #f8fafc);
        }
        .fields-list {
          font-family: Consolas, Monaco, 'Andale Mono', monospace;
          font-size: 0.8rem;
          color: var(--text-secondary, #94a3b8);
          background-color: rgba(0, 0, 0, 0.2);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm, 4px);
          margin: 0;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
      </style>
      <div class="placeholder-card">
        <div class="icon-container">
          <svg class="icon" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
        </div>
        <h2>Module Not Yet Connected</h2>
        <div class="subtitle">Slot reserved for ${info.title}</div>
        
        <div class="badge-row">
          <div class="badge">Owner: ${info.owner}</div>
          <status-pill status="${info.status}"></status-pill>
        </div>
        
        <p class="description">${info.description}</p>
        
        <div class="contract-section">
          <h3 class="contract-title">Shared Data Contract Interface</h3>
          <div class="flow-indicators">
            <div class="indicator"><span>Consumes:</span> <strong>${info.contract.consumes}</strong></div>
            <div class="indicator"><span>Produces:</span> <strong>${info.contract.produces}</strong></div>
          </div>
          <pre class="fields-list">${info.contract.fields.map(f => `+ ${f}`).join('\n')}</pre>
        </div>
      </div>
    `;
  }
}

customElements.define('module-placeholder', ModulePlaceholder);
