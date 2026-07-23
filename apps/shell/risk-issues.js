window.renderRiskIssuesScreen = async function(viewport, currentProject) {
  viewport.innerHTML = `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
            Risk & Issues
          </div>
          <h2 style="margin: 0; font-family: var(--font-display); font-size: 1.75rem; color: var(--text-primary);">
            Risk Management
          </h2>
          <div style="color: var(--text-secondary); margin-top: 0.5rem;">
            ${currentProject?.title || 'Unknown Project'} (${currentProject?.demandId || 'Unknown ID'})
          </div>
        </div>
      </div>

      <!-- Content State -->
      <div style="background: var(--bg-primary); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); padding: 4rem 2rem; text-align: center;">
        <svg style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-display); color: var(--text-primary); font-size: 1.25rem;">
          Data Not Available
        </h3>
        <p style="margin: 0; color: var(--text-secondary); max-width: 400px; margin: 0 auto; line-height: 1.5;">
          The integration for this module is currently under development. Once live, you will see active risk logs, issue tracking, and mitigation plans here.
        </p>
      </div>
    </div>
  `;
};
