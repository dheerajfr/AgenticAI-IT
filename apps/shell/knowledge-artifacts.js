<<<<<<< HEAD
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
=======
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

        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <!-- Global Search -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; flex: 1;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Artefact Index & Search</span>
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
              <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Try searching: "How does the cache layer work?"</div>
            </div>
            
            <h4 style="margin: 2rem 0 0.5rem 0; font-size: 0.9rem;">Indexed Artefacts for ${demandId}</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${artefacts.map(a => `
                <span style="font-size: 0.75rem; padding: 0.25rem 0.6rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; color: var(--text-secondary);">
                  📄 ${a.name}
                </span>
              `).join('')}
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
  
  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '<div class="loader"><span class="spinner"></span> Searching vector space...</div>';
  
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/search`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ query: query })
    });
    const data = await res.json();
    
    resultsDiv.innerHTML = `
      <div style="padding: 1rem; background: rgba(99,102,241,0.05); border: 1px solid var(--color-brand); border-radius: var(--radius-sm);">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-brand); margin-bottom: 0.5rem;">AI Synthesis</div>
        <div style="font-size: 0.85rem; color: var(--text-primary);">${data.ai_summary}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.5rem;">Sources</div>
        ${data.results.map(r => `
          <div style="margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
            <a href="#" style="color: var(--color-brand); font-weight: 600;">${r.doc}</a> - "${r.snippet}"
          </div>
        `).join('')}
      </div>
    `;
  } catch(e) { 
    console.error(e); 
    resultsDiv.innerHTML = '<div style="color: red;">Search failed.</div>';
  }
>>>>>>> Nagaraju
};
