window.renderKnowledgeArtifactsScreen = async function(viewport, currentProject) {
  viewport.innerHTML = `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
            Knowledge Artifacts
          </div>
          <h2 style="margin: 0; font-family: var(--font-display); font-size: 1.75rem; color: var(--text-primary);">
            Documentation Hub
          </h2>
          <div style="color: var(--text-secondary); margin-top: 0.5rem;">
            ${currentProject?.title || 'Unknown Project'} (${currentProject?.demandId || 'Unknown ID'})
          </div>
        </div>
      </div>

      <!-- Content State -->
      <div style="background: var(--bg-primary); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); padding: 4rem 2rem; text-align: center;">
        <svg style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-display); color: var(--text-primary); font-size: 1.25rem;">
          Data Not Available
        </h3>
        <p style="margin: 0; color: var(--text-secondary); max-width: 400px; margin: 0 auto; line-height: 1.5;">
          The integration for this module is currently under development. Once live, you will see project documentation, decision logs, and architectural artifacts here.
        </p>
      </div>
    </div>
  `;
};
