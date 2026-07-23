const BASE_URL = 'http://127.0.0.1:8000/api';

window.fetchKnowledgeArtifactsData = async function() {
  try {
    const demRes = await fetch('http://127.0.0.1:8000/api/demands');
    if (demRes.ok) window.allDemandsList = await demRes.json();
  } catch(e) { console.warn("Could not fetch demands list", e); }

  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchKnowledgeArtifactsData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;
  const viewport = document.getElementById('viewport');
  const _origOverflow = viewport.style.overflow;
  const _origOverflowY = viewport.style.overflowY;
  const _origDisplay = viewport.style.display;
  const _origFlexDir = viewport.style.flexDirection;
  const _origPadding = viewport.style.padding;

  viewport.style.overflow = 'hidden';
  viewport.style.overflowY = 'hidden';
  viewport.style.display = 'flex';
  viewport.style.flexDirection = 'column';
  viewport.style.padding = '0';

  const _observer = new MutationObserver(() => {
    if (!document.getElementById('ka-panel-container')) {
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }
  });
  _observer.observe(viewport, { childList: true, subtree: false });

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchKnowledgeArtifactsData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Knowledge & Artefacts</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="ka-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'dashboard';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Return to Dashboard &rarr;
          </button>
        </div>
      </main>
    </div>
  `;


  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/project/${demandId}`);
    if (res.ok) {
      window.currentKnowledgeData = await res.json();
      window.renderKnowledgeArtifactsScreen();
    }
  } catch (err) {
    console.error("Knowledge fetch error", err);
  }
};

// -------------------------------------------------------
// Helper: builds the artefact list + register form HTML
// Kept separate to avoid deeply-nested template literal issues
// -------------------------------------------------------
function _buildArtefactRows(artefacts, demandId) {
  let rows = '';
  if (artefacts.length === 0) {
    rows = '<span style="font-size:0.82rem;color:var(--text-muted);">No artefacts registered yet. Add one below.</span>';
  } else {
    artefacts.forEach(function(a) {
      const isApproved  = a.status === 'approved';
      const statusColor = isApproved ? '#10b981' : '#f59e0b';
      const statusBg    = isApproved ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)';
      const statusIcon  = isApproved ? '\u2713' : '\u23f3';
      const statusLabel = isApproved ? 'Approved' : 'Pending Review';
      const urlLink     = a.url
        ? '<a href="' + a.url + '" target="_blank" style="color:var(--color-brand);margin-left:4px;text-decoration:none;font-size:0.75rem;">&#8599; Open</a>'
        : '';
      const approveBtn  = !isApproved
        ? '<button class="ka-approve-btn" data-demand="' + demandId + '" data-name="' + a.name.replace(/"/g, '&quot;') + '" style="font-size:0.7rem;padding:2px 8px;border-radius:6px;border:1px solid #10b981;background:rgba(16,185,129,0.1);color:#10b981;cursor:pointer;font-family:inherit;">Approve</button>'
        : '';
      rows += '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);gap:0.75rem;">'
        + '<div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">'
        + '<span style="font-size:0.85rem;">&#128196;</span>'
        + '<span style="font-size:0.82rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + a.name + '</span>'
        + '<span style="font-size:0.72rem;color:var(--text-muted);">' + a.type + (a.version ? ' v' + a.version : '') + '</span>'
        + urlLink
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">'
        + '<span style="font-size:0.68rem;padding:2px 7px;border-radius:8px;background:' + statusBg + ';color:' + statusColor + ';font-weight:700;white-space:nowrap;">' + statusIcon + ' ' + statusLabel + '</span>'
        + approveBtn
        + '</div>'
        + '</div>';
    });
  }

  const registerForm = '<div style="border-top:1px solid var(--border-color);padding-top:1rem;">'
    + '<h4 style="margin:0 0 0.75rem 0;font-size:0.88rem;color:var(--text-secondary);">+ Register Artefact</h4>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">'
    + '<input type="text" id="art-name" placeholder="Document name (e.g. BRD_v2.pdf)" style="padding:0.4rem 0.65rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:0.8rem;">'
    + '<select id="art-type" style="padding:0.4rem 0.65rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:0.8rem;">'
    + '<option value="Requirements">Requirements</option>'
    + '<option value="Architecture">Architecture</option>'
    + '<option value="Test Evidence">Test Evidence</option>'
    + '<option value="Runbook">Runbook</option>'
    + '<option value="ADR">ADR</option>'
    + '<option value="Post-Mortem">Post-Mortem</option>'
    + '<option value="Onboarding Guide">Onboarding Guide</option>'
    + '<option value="Other">Other</option>'
    + '</select></div>'
    + '<div style="display:grid;grid-template-columns:2fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">'
    + '<input type="text" id="art-url" placeholder="URL (optional)" style="padding:0.4rem 0.65rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:0.8rem;">'
    + '<input type="text" id="art-version" placeholder="Version (e.g. 1.0)" style="padding:0.4rem 0.65rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:0.8rem;">'
    + '</div>'
    + '<button id="ka-register-btn" data-demand="' + demandId + '" class="btn-primary" style="padding:0.45rem 1.25rem;font-size:0.82rem;">Register</button>'
    + '<span id="art-feedback" style="font-size:0.78rem;margin-left:0.75rem;color:var(--text-muted);"></span>'
    + '</div>';

  return '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.5rem;">' + rows + '</div>' + registerForm;
}

window.renderKnowledgeArtifactsScreen = function() {
  const demandId = sessionStorage.getItem('selectedDemandId');
  const demands = window.allDemandsList || [];
  const optionsHtml = demands.map(d => `<option value="${d.demand_id}" ${d.demand_id === demandId ? 'selected' : ''}>${d.demand_id} - ${d.title}</option>`).join('');
  const dropdownHtml = `
    <select onchange="sessionStorage.setItem('selectedDemandId', this.value); window.fetchKnowledgeArtifactsData();" style="padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.85rem; min-width: 280px; max-width: 380px; cursor: pointer;">
      <option value="">Select a Project...</option>
      ${optionsHtml}
    </select>
  `;

  const viewport = document.getElementById('viewport');
  const _origOverflow = viewport.style.overflow;
  const _origOverflowY = viewport.style.overflowY;
  const _origDisplay = viewport.style.display;
  const _origFlexDir = viewport.style.flexDirection;
  const _origPadding = viewport.style.padding;

  viewport.style.overflow = 'hidden';
  viewport.style.overflowY = 'hidden';
  viewport.style.display = 'flex';
  viewport.style.flexDirection = 'column';
  viewport.style.padding = '0';

  const _observer = new MutationObserver(() => {
    if (!document.getElementById('ka-panel-container')) {
      viewport.style.overflow = _origOverflow;
      viewport.style.overflowY = _origOverflowY;
      viewport.style.display = _origDisplay;
      viewport.style.flexDirection = _origFlexDir;
      viewport.style.padding = _origPadding;
      _observer.disconnect();
    }
  });
  _observer.observe(viewport, { childList: true, subtree: false });

  let sidebarItemsHtml = '<li style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No demands found.</li>';
  if (demands && demands.length > 0) {
    sidebarItemsHtml = demands.map(d => {
      const isActive = d.demand_id === demandId;
      return `
        <li class="demand-item ${isActive ? 'active' : ''}" onclick="sessionStorage.setItem('selectedDemandId', '${d.demand_id}'); window.fetchKnowledgeArtifactsData();" style="cursor: pointer; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); border-left: ${isActive ? '3px solid var(--color-brand)' : '3px solid transparent'}; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'transparent'};">
          <div style="font-family: monospace; font-weight: 700; color: var(--color-brand); font-size: 0.78rem;">${d.demand_id}</div>
          <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${d.title || 'Untitled Demand'}</h4>
        </li>
      `;
    }).join('');
  }

  const layoutPrefix = `
    <div class="intake-screen" style="padding: 1rem; height: 100%; box-sizing: border-box;">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">Knowledge & Artefacts</h3>
        </div>
        <ul class="demand-list" style="padding: 0; margin: 0; list-style: none;">
          ${sidebarItemsHtml}
        </ul>
      </aside>
      <main class="details-panel" id="ka-panel-container" style="display: flex; flex-direction: column; overflow-y: auto; height: 100%; align-self: stretch; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
  `;
  
  const layoutSuffix = `
        <div style="margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button onclick="window.location.hash = 'dashboard';" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16,185,129,0.35); font-weight: 700; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); border: none; cursor: pointer; font-family: var(--font-sans); transition: transform 0.2s ease;">
            Return to Dashboard &rarr;
          </button>
        </div>
      </main>
    </div>
  `;

  if (!demandId) {
    viewport.innerHTML = layoutPrefix + `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Module Selector</h2>
          ${dropdownHtml}
        </div>
        <div style="padding: 4rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
          Please select a Demand from the dropdown above to view this capability.
        </div>
      </div>` + layoutSuffix;
    return;
  }
  
  const data = window.currentKnowledgeData || {};
  const lessons = data.lessons_learned || [];
  const artefacts = data.indexed_artefacts || [];
  const updates = data.onboarding_updates || [];
  
  viewport.innerHTML = layoutPrefix + `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; animation: fade-in 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
        <div>
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Knowledge & Artefacts</h2>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">Always-on Capability - RAG & Indexing</p>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Monitoring"></status-pill>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <!-- Artefact Index & Search -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; flex: 1;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Artefact Index &amp; Search</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
              Unified vector search across all documents, specs, and wikis.
            </p>
            
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
              <input type="text" id="search-query" placeholder="Ask a question..." style="flex: 1; padding: 0.6rem 1rem; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.9rem;">
              <button onclick="searchArtefacts()" class="btn-primary" style="padding: 0.6rem 1.5rem; border-radius: 20px; font-size: 0.9rem;">Search</button>
            </div>
            
            <div id="search-results" style="display: flex; flex-direction: column; gap: 1rem;">
              <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Try searching: "What architecture documents do we have?"</div>
            </div>
            <h4 style="margin: 2rem 0 0.5rem 0; font-size: 0.9rem;">Indexed Artefacts for ${demandId}</h4>
            ${_buildArtefactRows(artefacts, demandId)}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <!-- Cross-project Learning -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Cross-Project Learning</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              AI aggregates lessons learned across similar projects (RAG + LLM).
            </p>
            
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
              <input type="text" id="lesson-topic" placeholder="Topic (e.g. Database Scaling)..." style="flex: 1; padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.85rem;">
              <button onclick="extractLessons('${demandId}')" class="btn-primary" style="padding: 0.4rem 1rem; font-size: 0.85rem;">Extract</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 250px; overflow-y: auto;">
              ${lessons.map(l => `
                <div style="padding: 1rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); border-left: 3px solid var(--color-brand);">
                  <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Topic: ${l.topic}</div>
                  <div style="font-size: 0.85rem; color: var(--text-primary);">${l.content}</div>
                </div>
              `).join('')}
              ${lessons.length === 0 ? '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">No lessons extracted yet.</div>' : ''}
            </div>
          </div>

          <!-- Onboarding Sync -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Onboarding Sync</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              AI updates standard onboarding materials with new project architectures.
            </p>
            <button onclick="syncOnboarding('${demandId}')" class="btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem; margin-bottom: 1rem;">Sync Onboarding Wiki</button>
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${updates.map(u => `
                <div style="font-size: 0.85rem; color: var(--text-primary); padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px;">
                  <span style="color: var(--color-status-green-text);">✓</span> ${u.description}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>` + layoutSuffix;
};

window.extractLessons = async function(demandId) {
  const topic = document.getElementById('lesson-topic').value;
  if (!topic) return;
  try {
    await fetch(`${BASE_URL}/knowledge-artifacts/extract-lessons`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId, topic: topic })
    });
    window.fetchKnowledgeArtifactsData();
  } catch(e) { console.error(e); }
};

window.syncOnboarding = async function(demandId) {
  try {
    await fetch(`${BASE_URL}/knowledge-artifacts/sync-onboarding`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId })
    });
    window.fetchKnowledgeArtifactsData();
  } catch(e) { console.error(e); }
};

window.searchArtefacts = async function() {
  const query = document.getElementById('search-query').value;
  if (!query) return;
  const demandId = sessionStorage.getItem('selectedDemandId');

  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '<div class="loader"><span class="spinner"></span> Searching artefacts...</div>';

  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/search`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ query: query, demand_id: demandId })
    });
    const data = await res.json();
    const realResults = data.results || [];

    resultsDiv.innerHTML = `
      <div style="padding:1rem;background:rgba(99,102,241,0.05);border:1px solid var(--color-brand);border-radius:var(--radius-sm);margin-bottom:0.75rem;">
        <div style="font-size:0.72rem;font-weight:700;color:var(--color-brand);margin-bottom:0.4rem;">AI SYNTHESIS</div>
        <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.55;">${data.ai_summary}</div>
      </div>
      <div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.5rem;">SOURCES (${data.total_artefacts_searched || 0} artefact(s) searched)</div>
        ${realResults.length === 0
          ? '<div style="font-size:0.8rem;color:var(--text-muted);">No artefacts indexed for this project yet.</div>'
          : realResults.map(r => {
              const statusColor = r.status === 'approved' ? '#10b981' : '#f59e0b';
              const urlTag = r.url ? `<a href="${r.url}" target="_blank" style="color:var(--color-brand);margin-left:6px;font-size:0.75rem;">↗ Open</a>` : '';
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.6rem;margin-bottom:0.35rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);">
                  <div>
                    <span style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">📄 ${r.doc}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">${r.type}</span>
                    ${urlTag}
                  </div>
                  <span style="font-size:0.68rem;padding:1px 6px;border-radius:6px;background:rgba(0,0,0,0.15);color:${statusColor};font-weight:700;">${r.status}</span>
                </div>`;
            }).join('')
        }
      </div>
    `;
  } catch(e) {
    console.error(e);
    resultsDiv.innerHTML = '<div style="color:red;">Search failed.</div>';
  }
};

window.registerArtefact = async function(demandId) {
  const name    = (document.getElementById('art-name')?.value || '').trim();
  const type    = document.getElementById('art-type')?.value || 'Other';
  const url     = (document.getElementById('art-url')?.value || '').trim() || null;
  const version = (document.getElementById('art-version')?.value || '').trim() || '1.0';
  const fb      = document.getElementById('art-feedback');

  if (!name) { if(fb) fb.textContent = 'Please enter a document name.'; return; }

  if(fb) { fb.style.color = 'var(--text-muted)'; fb.textContent = 'Registering...'; }
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/artefacts/${demandId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, url, version })
    });
    if (res.ok) {
      if(fb) { fb.style.color = '#10b981'; fb.textContent = `'${name}' registered — pending approval.`; }
      // Clear inputs
      ['art-name','art-url','art-version'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      window.fetchKnowledgeArtifactsData();
    } else {
      const err = await res.json();
      if(fb) { fb.style.color = 'red'; fb.textContent = err.detail || 'Registration failed.'; }
    }
  } catch(e) {
    console.error(e);
    if(fb) { fb.style.color = 'red'; fb.textContent = 'Network error.'; }
  }
};

window.approveArtefact = async function(demandId, artefactName) {
  const approvedBy = prompt('Approve "' + artefactName + '"\n\nEnter your name / username:');
  if (!approvedBy || !approvedBy.trim()) return;

  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/artefacts/${demandId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artefact_name: artefactName, approved_by: approvedBy.trim() })
    });
    if (res.ok) {
      window.fetchKnowledgeArtifactsData();
    } else {
      const err = await res.json();
      alert('Approval failed: ' + (err.detail || 'Unknown error'));
    }
  } catch(e) {
    console.error(e);
    alert('Network error during approval.');
  }
};

// Event delegation for buttons built by _buildArtefactRows (data-attribute pattern)
document.addEventListener('click', function(e) {
  // Approve button
  const approveBtn = e.target.closest('.ka-approve-btn');
  if (approveBtn) {
    const demand = approveBtn.dataset.demand;
    const name   = approveBtn.dataset.name;
    if (demand && name) window.approveArtefact(demand, name);
  }
  // Register button
  const registerBtn = e.target.closest('#ka-register-btn');
  if (registerBtn) {
    const demand = registerBtn.dataset.demand;
    if (demand) window.registerArtefact(demand);
  }
});
