window.renderEnvironmentStateScreen = async function(viewport, currentProject) {
  viewport.innerHTML = `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
            Environment State
          </div>
          <h2 style="margin: 0; font-family: var(--font-display); font-size: 1.75rem; color: var(--text-primary);">
            Infrastructure Health
          </h2>
          <div style="color: var(--text-secondary); margin-top: 0.5rem;">
            ${currentProject?.title || 'Unknown Project'} (${currentProject?.demandId || 'Unknown ID'})
          </div>
        </div>
      </div>

      <!-- Content State -->
      <div style="background: var(--bg-primary); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); padding: 4rem 2rem; text-align: center;">
        <svg style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-display); color: var(--text-primary); font-size: 1.25rem;">
          Data Not Available
        </h3>
        <p style="margin: 0; color: var(--text-secondary); max-width: 400px; margin: 0 auto; line-height: 1.5;">
          The integration for this module is currently under development. Once live, you will see real-time environment status, configuration drift, and deployment health here.
        </p>
      </div>
    </div>
  `;
};
