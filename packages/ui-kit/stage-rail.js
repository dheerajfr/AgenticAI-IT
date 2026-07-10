class StageRail extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.activeStage = 'demand-intake';
    this.stages = [
      { id: 'demand-intake', label: 'Demand & intake', status: 'live' },
      { id: 'estimate-shape', label: 'Estimate & shape', status: 'live' },
      { id: 'plan-schedule', label: 'Plan & schedule', status: 'live' },
      { id: 'dependencies', label: 'Dependencies', status: 'live' },
      { id: 'config-environments', label: 'Config & environments', status: 'live' }
    ];
  }

  static get observedAttributes() {
    return ['active-stage'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'active-stage' && oldValue !== newValue) {
      this.activeStage = newValue;
      this.render();
    }
  }

  connectedCallback() {
    this.render();
  }

  selectStage(id) {
    if (this.activeStage === id) return;
    this.activeStage = id;
    this.setAttribute('active-stage', id);
    this.dispatchEvent(new CustomEvent('stage-change', {
      detail: { stageId: id },
      bubbles: true,
      composed: true
    }));
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          background-color: var(--bg-secondary, #161f30);
          border-bottom: 1px solid var(--border-color, #2e3c54);
          padding: 0;
          box-shadow: var(--shadow-sm);
        }
        .rail-container {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          overflow-x: auto;
        }
        .stage-node {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.25rem 1rem;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          transition: all var(--transition-normal, 0.25s) ease;
          user-select: none;
          text-align: center;
          position: relative;
          min-width: 160px;
        }
        .stage-node::after {
          content: '';
          position: absolute;
          right: 0;
          top: 30%;
          bottom: 30%;
          width: 1px;
          background-color: var(--border-color, #2e3c54);
        }
        .stage-node:last-child::after {
          display: none;
        }
        .stage-node:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }
        .stage-node.active {
          border-bottom-color: var(--color-brand, #6366f1);
          background-color: rgba(99, 102, 241, 0.04);
        }
        .stage-title {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--text-secondary, #94a3b8);
          transition: color var(--transition-fast, 0.15s) ease;
        }
        .stage-node.active .stage-title {
          color: var(--text-primary, #f8fafc);
        }
        .stage-node:hover .stage-title {
          color: var(--text-primary, #f8fafc);
        }
        status-pill {
          margin-top: 0.15rem;
        }
      </style>
      <div class="rail-container">
        ${this.stages.map(stage => {
      const isActive = stage.id === this.activeStage;
      return `
            <div class="stage-node ${isActive ? 'active' : ''}" data-id="${stage.id}">
              <div class="stage-title">${stage.label}</div>
              <status-pill status="${stage.status}"></status-pill>
            </div>
          `;
    }).join('')}
      </div>
    `;

    this.shadowRoot.querySelectorAll('.stage-node').forEach(node => {
      node.addEventListener('click', () => {
        const id = node.getAttribute('data-id');
        this.selectStage(id);
      });
    });
  }
}

customElements.define('stage-rail', StageRail);
