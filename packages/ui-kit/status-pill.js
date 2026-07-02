class StatusPill extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['status'];
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
    const status = this.getAttribute('status') || 'not started';
    const normalized = status.toLowerCase().trim();
    let className = 'gray';

    if (normalized === 'live' || normalized === 'approved') {
      className = 'green';
    } else if (normalized === 'building' || normalized === 'classified' || normalized === 'capacity-checked') {
      className = 'amber';
    } else if (normalized === 'rejected') {
      className = 'red';
    } else {
      className = 'gray';
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.15rem 0.55rem;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-radius: var(--radius-round, 9999px);
          border: 1px solid transparent;
          font-family: var(--font-sans, system-ui, sans-serif);
          transition: all var(--transition-fast, 0.15s) ease;
        }
        .gray {
          background-color: var(--color-status-gray-bg, #1e293b);
          color: var(--color-status-gray-text, #94a3b8);
          border-color: var(--color-status-gray-border, #334155);
        }
        .amber {
          background-color: var(--color-status-amber-bg, #2d200e);
          color: var(--color-status-amber-text, #fbbf24);
          border-color: var(--color-status-amber-border, #78350f);
        }
        .green {
          background-color: var(--color-status-green-bg, #062f1e);
          color: var(--color-status-green-text, #34d399);
          border-color: var(--color-status-green-border, #064e3b);
        }
        .red {
          background-color: var(--color-status-red-bg, #3f1919);
          color: var(--color-status-red-text, #f87171);
          border-color: var(--color-status-red-border, #7f1d1d);
        }
      </style>
      <span class="pill ${className}">${status}</span>
    `;
  }
}

customElements.define('status-pill', StatusPill);
