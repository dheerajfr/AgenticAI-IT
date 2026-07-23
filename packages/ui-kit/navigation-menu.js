const NavigationConfig = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'demand-intake', label: 'Demand & Intake', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
  { id: 'estimate-shape', label: 'Estimate & Shape', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' },
  { id: 'plan-schedule', label: 'Plan & Schedule', icon: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z' },
  { id: 'config-environments', label: 'Config Environments', icon: 'M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z' },
  { id: 'dependencies', label: 'Dependencies', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { id: 'build-deploy', label: 'Build & Deploy', icon: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z' },
  { id: 'test-quality', label: 'Test & Quality', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h2v5zm0 4h-2v-2h2v2z' },
  { id: 'release-change', label: 'Release & Change', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z' },
<<<<<<< HEAD
  { id: 'ops-readiness', label: 'Ops Readiness', icon: 'M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c.13.22.07.49-.12.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z' },
  { id: 'budget-cost', label: 'Budget & Cost', icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { id: 'risk-issues', label: 'Risk & Issues', icon: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z' },
  { id: 'vendor-coordination', label: 'Vendor Coordination', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { id: 'knowledge-artifacts', label: 'Knowledge Artifacts', icon: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z' },
  { id: 'reporting-communication', label: 'Reporting & Comms', icon: 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z' },
  { id: 'environment-state', label: 'Environment State', icon: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z' },
  { id: 'exports', label: 'Data Exports', icon: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z' }
=======

  { id: 'ops-readiness', label: 'Ops Readiness', icon: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z' },
  { id: 'risk-issues', label: 'Risk & Issues', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' },
  { id: 'budget-cost', label: 'Budget & Cost', icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { id: 'vendor-coordination', label: 'Vendor Coordination', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { id: 'reporting-communication', label: 'Reporting & Comms', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
  { id: 'knowledge-artifacts', label: 'Knowledge & Artefacts', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' }
>>>>>>> Nagaraju
];

export const getModuleName = (id) => {
  const mod = NavigationConfig.find(m => m.id === id);
  return mod ? mod.label : 'Unknown Module';
};

class NavigationMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.isOpen = false;
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
    this.updateActiveItem();
  }

  static get observedAttributes() {
    return ['active-stage'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'active-stage') {
      this.updateActiveItem();
    }
  }

  toggleMenu() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.shadowRoot.querySelector('.drawer-overlay').classList.add('open');
      this.shadowRoot.querySelector('.drawer').classList.add('open');
    } else {
      this.shadowRoot.querySelector('.drawer-overlay').classList.remove('open');
      this.shadowRoot.querySelector('.drawer').classList.remove('open');
    }
  }

  setupListeners() {
    this.shadowRoot.querySelector('.drawer-overlay').addEventListener('click', () => {
      this.toggleMenu();
    });
    
    // Listen for custom event from window to toggle menu
    window.addEventListener('toggle-nav-menu', () => {
      this.toggleMenu();
    });
  }

  updateActiveItem() {
    const activeStage = this.getAttribute('active-stage') || 'demand-intake';
    const items = this.shadowRoot.querySelectorAll('.nav-item');
    items.forEach(item => {
      if (item.dataset.id === activeStage) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  render() {
    const navItemsHtml = NavigationConfig.map(item => `
      <a href="#${item.id}" class="nav-item" data-id="${item.id}" onclick="window.dispatchEvent(new CustomEvent('toggle-nav-menu'))">
        <svg class="nav-icon" viewBox="0 0 24 24"><path d="${item.icon}"/></svg>
        <span class="nav-label">${item.label}</span>
      </a>
    `).join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          z-index: 999;
          opacity: 0;
          pointer-events: none;
        }
        
        .drawer-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        
        .drawer {
          position: fixed;
          top: 0;
          left: -300px;
          width: 280px;
          height: 100vh;
          background-color: var(--bg-primary, #ffffff);
          border-right: 1px solid var(--border-color, #e2e8f0);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg);
        }
        
        .drawer.open {
          left: 0;
        }
        
        .drawer-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: var(--bg-secondary, #f8fafc);
        }
        
        .drawer-title {
          font-family: var(--font-display, sans-serif);
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--text-primary, #0f172a);
          margin: 0;
        }
        
        .close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-secondary, #475569);
          padding: 0.25rem;
          border-radius: var(--radius-sm, 4px);
        }
        
        .close-btn:hover {
          background-color: rgba(0,0,0,0.05);
          color: var(--text-primary, #0f172a);
        }
        
        .nav-list {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        
        .nav-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1.5rem;
          text-decoration: none;
          color: var(--text-secondary, #475569);
          font-family: var(--font-sans, sans-serif);
          font-size: 0.95rem;
          font-weight: 500;
          border-left: 4px solid transparent;
        }
        
        .nav-item:hover {
          background-color: var(--bg-secondary, #f8fafc);
          color: var(--text-primary, #0f172a);
        }
        
        .nav-item.active {
          background-color: rgba(99, 102, 241, 0.08);
          color: var(--color-brand, #6366f1);
          border-left-color: var(--color-brand, #6366f1);
          font-weight: 600;
        }
        
        .nav-icon {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }
        
      </style>
      
      <div class="drawer-overlay"></div>
      <div class="drawer">
        <div class="drawer-header">
          <h2 class="drawer-title">Menu</h2>
          <button class="close-btn" onclick="window.dispatchEvent(new CustomEvent('toggle-nav-menu'))">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="nav-list">
          ${navItemsHtml}
        </div>
      </div>
    `;
  }
}

if (!customElements.get('navigation-menu')) {
  customElements.define('navigation-menu', NavigationMenu);
}
