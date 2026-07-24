const BASE_URL = 'http://127.0.0.1:8000/api';

function parseMarkdown(text) {
  if (!text) return '';
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parse Tables line-by-line
  let lines = escaped.split('\n');
  let inTable = false;
  let tableHeader = true;
  let newLines = [];
  let currentTableHtml = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHeader = true;
        currentTableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.8rem; border: 1px solid var(--border-color);">';
      }

      let cols = line.split('|').map(c => c.trim());
      cols.shift();
      cols.pop();

      // Check if separator row (e.g. |---|---|)
      let isSeparator = cols.every(c => /^:-*|-*:$|^-+$/.test(c));
      if (isSeparator) {
        tableHeader = false;
        continue;
      }

      currentTableHtml += '<tr style="border-bottom: 1px solid var(--border-color);">';
      for (let col of cols) {
        let cellContent = col
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/__(.*?)__/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/_(.*?)_/g, '<em>$1</em>');

        if (tableHeader) {
          currentTableHtml += `<th style="padding: 0.5rem; background: rgba(99, 102, 241, 0.08); font-weight: 700; text-align: left; border: 1px solid var(--border-color); color: var(--text-primary);">${cellContent}</th>`;
        } else {
          currentTableHtml += `<td style="padding: 0.5rem; border: 1px solid var(--border-color); color: var(--text-secondary);">${cellContent}</td>`;
        }
      }
      currentTableHtml += '</tr>';
    } else {
      if (inTable) {
        currentTableHtml += '</table>';
        newLines.push(currentTableHtml);
        inTable = false;
      }
      newLines.push(lines[i]);
    }
  }
  if (inTable) {
    currentTableHtml += '</table>';
    newLines.push(currentTableHtml);
  }

  let html = newLines.join('\n');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h5 style="margin: 0.4rem 0; font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">$1</h5>');
  html = html.replace(/^## (.*?)$/gm, '<h4 style="margin: 0.5rem 0; font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">$1</h4>');
  html = html.replace(/^# (.*?)$/gm, '<h3 style="margin: 0.6rem 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">$1</h3>');

  // Lists
  html = html.replace(/^\s*[-*+]\s+(.*?)$/gm, '<li style="margin-left: 1rem; margin-bottom: 0.2rem; font-size: 0.82rem; list-style-type: disc;">$1</li>');
  html = html.replace(/^\s*(\d+)\.\s+(.*?)$/gm, '<li style="margin-left: 1rem; margin-bottom: 0.2rem; font-size: 0.82rem; list-style-type: decimal;">$2</li>');

  // Paragraphs / Newlines
  html = html.split('\n\n').map(p => {
    let t = p.trim();
    if (t.startsWith('<h') || t.startsWith('<li') || t.startsWith('<table') || t.startsWith('<tr') || t.startsWith('</table')) {
      return p;
    }
    return `<p style="margin: 0 0 0.4rem 0; line-height: 1.45; font-size: 0.82rem;">${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

function cleanDocName(name, demandId) {
  if (!name) return '';
  let clean = name;
  if (demandId) {
    const escId = demandId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regexStart = new RegExp('^' + escId + '\\s*(_|—|-|\\s)+\\s*', 'i');
    clean = clean.replace(regexStart, '');
    
    if (clean.startsWith(demandId + '_')) {
      clean = clean.substring(demandId.length + 1);
    } else if (clean.startsWith(demandId + '-')) {
      clean = clean.substring(demandId.length + 1);
    } else if (clean.startsWith(demandId)) {
      clean = clean.substring(demandId.length);
    }
  }
  return clean.replace(/_/g, ' ').trim();
}


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
// Helper: source badge colour + label
// -------------------------------------------------------
function _sourceBadge(source) {
  const map = {
    'auto-harvested': { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: '⚙ Auto-Harvested' },
    'ai-generated':   { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', label: '✦ AI-Generated'   },
    'uploaded':       { bg: 'rgba(16,185,129,0.12)',  color: '#10b981', label: '↑ Uploaded'        },
    'manual':         { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: '✎ Manual'          },
  };
  const s = map[source] || map['manual'];
  return '<span style="font-size:0.62rem;padding:1px 6px;border-radius:6px;background:' + s.bg + ';color:' + s.color + ';font-weight:700;white-space:nowrap;">' + s.label + '</span>';
}

// -------------------------------------------------------
// Helper: builds the artefact list + register form HTML
// -------------------------------------------------------
function _buildArtefactRows(artefacts, demandId) {
  let rows = '';
  if (artefacts.length === 0) {
    rows = '<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;border:1px dashed var(--border-color);border-radius:var(--radius-sm);">No artefacts indexed yet. Use the actions in the right panel to populate the index.</div>';
  } else {
    artefacts.forEach(function(a) {
      const isApproved  = a.status === 'approved';
      const statusColor = isApproved ? '#10b981' : '#f59e0b';
      const statusBg    = isApproved ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)';
      const statusIcon  = isApproved ? '\u2713' : '\u23f3';
      const statusLabel = isApproved ? 'Approved' : 'Pending Review';
      const source      = a.source || 'manual';
      const urlLink     = a.url
        ? '<a href="' + a.url + '" target="_blank" style="color:var(--color-brand);margin-left:4px;text-decoration:none;font-size:0.75rem;">&#8599; Open</a>'
        : '';
      const viewBtn = a.content 
        ? '<button class="ka-view-btn" data-name="' + a.name.replace(/"/g, '&quot;') + '" style="font-size:0.68rem;padding:2px 8px;border-radius:6px;border:1px solid var(--color-brand);background:rgba(99,102,241,0.1);color:var(--color-brand);cursor:pointer;font-family:inherit;">👁 View</button>'
        : '';
      const approveBtn  = !isApproved
        ? '<button class="ka-approve-btn" data-demand="' + demandId + '" data-name="' + a.name.replace(/"/g, '&quot;') + '" style="font-size:0.68rem;padding:2px 8px;border-radius:6px;border:1px solid #10b981;background:rgba(16,185,129,0.1);color:#10b981;cursor:pointer;font-family:inherit;">Approve</button>'
        : '';
      const deleteBtn   = '<button class="ka-delete-btn" data-demand="' + demandId + '" data-name="' + a.name.replace(/"/g, '&quot;') + '" title="Remove artefact" style="font-size:0.68rem;padding:2px 6px;border-radius:6px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-family:inherit;">✕</button>';
      rows += '<div style="display:flex;flex-direction:column;padding:0.55rem 0.75rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);gap:0.3rem;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">'
        + '<div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex-wrap:wrap;">'
        + '<span style="font-size:0.85rem;">&#128196;</span>'
        + '<span style="font-size:0.8rem;font-weight:600;color:var(--text-primary);word-break:break-all;">' + cleanDocName(a.name, demandId) + '</span>'
        + '<span style="font-size:0.7rem;color:var(--text-muted);">' + a.type + (a.version ? ' v' + a.version : '') + '</span>'
        + urlLink
        + _sourceBadge(source)
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0;">'
        + '<span style="font-size:0.66rem;padding:1px 6px;border-radius:8px;background:' + statusBg + ';color:' + statusColor + ';font-weight:700;white-space:nowrap;">' + statusIcon + ' ' + statusLabel + '</span>'
        + viewBtn
        + approveBtn
        + deleteBtn
        + '</div>'
        + '</div>'
        + '</div>';
    });
  }

  return '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem;">' + rows + '</div>';
}

window.setKAIngestTab = function(tabName) {
  sessionStorage.setItem('kaIngestTab', tabName);
  window.renderKnowledgeArtifactsScreen();
};

window.setKALearnTab = function(tabName) {
  sessionStorage.setItem('kaLearnTab', tabName);
  window.renderKnowledgeArtifactsScreen();
};

window.setKATab = function(tabName) {
  sessionStorage.setItem('kaActiveTab', tabName);
  window.renderKnowledgeArtifactsScreen();
};

window.openDocModal = function(title, content) {
  // Remove existing modal if any
  const existing = document.getElementById('ka-doc-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'ka-doc-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0, 0, 0, 0.6)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '999999';
  modal.style.animation = 'fade-in 0.2s ease';

  let bodyHtml = '';
  let isJson = false;
  let parsed = null;
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      parsed = JSON.parse(trimmed);
      isJson = true;
    }
  } catch(e) {}

  if (isJson && parsed) {
    bodyHtml = '<table style="width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; border: 1px solid var(--border-color);">';
    bodyHtml += '<tr style="border-bottom: 1px solid var(--border-color); background: rgba(99, 102, 241, 0.08);"><th style="padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); text-align: left; font-weight: 700; color: var(--text-primary);">Field</th><th style="padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); text-align: left; font-weight: 700; color: var(--text-primary);">Value</th></tr>';
    
    const entries = Array.isArray(parsed) ? parsed.entries() : Object.entries(parsed);
    for (const [key, val] of entries) {
      const valStr = (val && typeof val === 'object') ? JSON.stringify(val, null, 2) : String(val);
      const cleanKey = key.toString().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      bodyHtml += `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); font-weight: 600; color: var(--text-primary);">${cleanKey}</td><td style="padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;">${valStr}</td></tr>`;
    }
    bodyHtml += '</table>';
  } else {
    bodyHtml = parseMarkdown(content);
  }

  modal.innerHTML = `
    <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); width: 85%; max-width: 850px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 12px 30px rgba(0,0,0,0.5); overflow: hidden; animation: slide-up 0.25s ease;">
      <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-primary);">
        <h3 style="margin: 0; font-size: 1.05rem; font-family: var(--font-display); color: var(--color-brand); word-break: break-all; font-weight: 700;">📄 ${title}</h3>
        <button onclick="document.getElementById('ka-doc-modal').remove()" style="background: none; border: none; font-size: 1.3rem; color: var(--text-muted); cursor: pointer; padding: 0.25rem 0.5rem; font-family: inherit;">✕</button>
      </div>
      <div style="padding: 2rem; overflow-y: auto; flex: 1; color: var(--text-primary); line-height: 1.6; font-size: 0.85rem; text-align: left; background: var(--bg-primary); font-family: var(--font-sans);">
        ${bodyHtml}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
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
  const activeTab = sessionStorage.getItem('kaActiveTab') || 'sync';

  let tabContentHtml = '';
  if (activeTab === 'sync') {
    let ingestTab = sessionStorage.getItem('kaIngestTab') || 'harvest';
    if (ingestTab === 'manual') ingestTab = 'harvest';
    let ingestTabContentHtml = '';
    
    if (ingestTab === 'harvest') {
      ingestTabContentHtml = `
        <div style="animation: fade-in 0.2s ease; display: flex; flex-direction: column;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>⚙ Auto-Harvest Project Data</span>
          </h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 1.25rem 0; line-height: 1.45;">Scan all delivery modules (plans, tests, risks, releases…) and auto-register everything produced for this project as artefacts.</p>
          <button id="ka-harvest-btn" data-demand="${demandId}" class="btn-primary" style="padding: 0.6rem 1.5rem; font-size: 0.85rem; width: 100%;">🔍 Harvest from Project Data</button>
          <div id="harvest-feedback" style="font-size:0.78rem;margin-top:0.75rem;color:var(--text-muted);text-align:center;"></div>
        </div>
      `;
    } else if (ingestTab === 'generate') {
      ingestTabContentHtml = `
        <div style="animation: fade-in 0.2s ease; display: flex; flex-direction: column;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>✦ Generate AI Draft Docs</span>
          </h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 1.25rem 0; line-height: 1.45;">AI generates a BRD, Architecture Design Doc, and Runbook from the demand details. Documents are indexed and immediately searchable.</p>
          <button id="ka-stubs-btn" data-demand="${demandId}" class="btn-secondary" style="padding: 0.6rem 1.5rem; font-size: 0.85rem; width: 100%; border: 1px solid rgba(245,158,11,0.4); color: #f59e0b; background: rgba(245,158,11,0.08);">✦ Generate BRD + Architecture + Runbook</button>
          <div id="stubs-feedback" style="font-size:0.78rem;margin-top:0.75rem;color:var(--text-muted);text-align:center;"></div>
        </div>
      `;
    } else {
      ingestTabContentHtml = `
        <div style="animation: fade-in 0.2s ease; display: flex; flex-direction: column;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>↑ Upload Document</span>
          </h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 1rem 0; line-height: 1.45;">Upload any real document (PDF, DOCX, TXT, MD) from your machine. It is stored server-side and registered in the index.</p>
          <div id="ka-drop-zone" style="border: 2px dashed var(--border-color); border-radius: var(--radius-sm); padding: 1.5rem; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; margin-bottom: 1rem;" onclick="document.getElementById('ka-file-input').click()" ondragover="event.preventDefault(); this.style.borderColor='#10b981'; this.style.background='rgba(16,185,129,0.05)';" ondragleave="this.style.borderColor='var(--border-color)'; this.style.background='';" ondrop="kaHandleDrop(event, '${demandId}');">
            <div style="font-size: 1.5rem; margin-bottom: 0.35rem;">📄</div>
            <div style="font-size: 0.82rem; color: var(--text-muted);">Drop a file here or <span style="color: var(--color-brand); text-decoration: underline;">browse</span></div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">PDF, DOCX, TXT, MD, CSV, JSON…</div>
          </div>
          <input type="file" id="ka-file-input" style="display:none;" onchange="kaUploadFile(this, '${demandId}')">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
            <select id="upload-type" style="padding:0.4rem 0.65rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:0.8rem;">
              <option value="Requirements">Requirements</option>
              <option value="Architecture">Architecture</option>
              <option value="Test Evidence">Test Evidence</option>
              <option value="Runbook">Runbook</option>
              <option value="ADR">ADR</option>
              <option value="Post-Mortem">Post-Mortem</option>
              <option value="Onboarding Guide">Onboarding Guide</option>
              <option value="Other">Other</option>
            </select>
            <input type="text" id="upload-version" placeholder="Version (e.g. 1.0)" value="1.0" style="padding:0.4rem 0.65rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:0.8rem;">
          </div>
          <div id="upload-feedback" style="font-size:0.78rem;color:var(--text-muted);text-align:center;"></div>
        </div>
      `;
    }

    tabContentHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; animation: fade-in 0.3s ease;">
        <div style="display: flex; flex-direction: column;">
          <!-- Artefact Index List -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; min-height: 420px; display: flex; flex-direction: column;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Indexed Artefacts for ${demandId}</span>
              <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 2px 6px; border-radius: 4px;">Artefact Sync</span>
            </h3>
            <div style="flex: 1; overflow-y: auto;">
              ${_buildArtefactRows(artefacts, demandId)}
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column;">
          <!-- Single Unified Sync Ingestion Card -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; min-height: 420px; display: flex; flex-direction: column;">
            
            <!-- Ingest Sub-tabs -->
            <div style="display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; gap: 0.25rem;">
              <button onclick="window.setKAIngestTab('harvest')" style="background: ${ingestTab === 'harvest' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: none; border-bottom: 2px solid ${ingestTab === 'harvest' ? 'var(--color-brand)' : 'transparent'}; color: ${ingestTab === 'harvest' ? 'var(--color-brand)' : 'var(--text-secondary)'}; padding: 0.5rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; border-radius: 4px 4px 0 0; flex: 1; transition: all 0.2s;">⚙ Harvest</button>
              <button onclick="window.setKAIngestTab('generate')" style="background: ${ingestTab === 'generate' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: none; border-bottom: 2px solid ${ingestTab === 'generate' ? 'var(--color-brand)' : 'transparent'}; color: ${ingestTab === 'generate' ? 'var(--color-brand)' : 'var(--text-secondary)'}; padding: 0.5rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; border-radius: 4px 4px 0 0; flex: 1; transition: all 0.2s;">✦ AI Generate</button>
              <button onclick="window.setKAIngestTab('upload')" style="background: ${ingestTab === 'upload' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: none; border-bottom: 2px solid ${ingestTab === 'upload' ? 'var(--color-brand)' : 'transparent'}; color: ${ingestTab === 'upload' ? 'var(--color-brand)' : 'var(--text-secondary)'}; padding: 0.5rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; border-radius: 4px 4px 0 0; flex: 1; transition: all 0.2s;">↑ Upload</button>
            </div>

            <!-- Ingest Content -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
              ${ingestTabContentHtml}
            </div>
            
          </div>
        </div>
      </div>
    `;
  } else {
    const learnTab = sessionStorage.getItem('kaLearnTab') || 'lessons';
    let learnTabContentHtml = '';

    if (learnTab === 'lessons') {
      learnTabContentHtml = `
        <div style="animation: fade-in 0.2s ease; display: flex; flex-direction: column;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Cross-Project Learning</span>
            <span style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
          </h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 1rem 0; line-height: 1.45;">AI extracts lessons learned from past incident reports and retrospective boards based on your specified topic.</p>
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <input type="text" id="lesson-topic" placeholder="Topic (e.g. Database Scaling)..." style="flex: 1; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.82rem;">
            <button id="extract-lessons-btn" onclick="extractLessons('${demandId}')" class="btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.82rem;">Extract</button>
          </div>
          <div id="lessons-feedback" style="font-size:0.78rem;margin-bottom:0.75rem;color:var(--text-muted);"></div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; text-align: left;">
            ${[...lessons].reverse().map(l => `
              <div style="padding: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); border-left: 3px solid var(--color-brand); text-align: left;">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem; text-align: left;">Topic: <strong style="color: var(--text-primary); font-weight: 700;">${l.topic}</strong></div>
                <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; text-align: left;">${parseMarkdown(l.content)}</div>
              </div>
            `).join('')}
            ${lessons.length === 0 ? '<div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 0.75rem;">No lessons extracted yet.</div>' : ''}
          </div>
        </div>
      `;
    } else {
      learnTabContentHtml = `
        <div style="animation: fade-in 0.2s ease; display: flex; flex-direction: column;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Onboarding Sync</span>
            <span style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
          </h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 1rem 0; line-height: 1.45;">AI generates a structured onboarding wiki section from the project's demand & architecture.</p>
          <button id="sync-onboarding-btn" onclick="syncOnboarding('${demandId}')" class="btn-secondary" style="padding: 0.5rem 1.25rem; font-size: 0.82rem; margin-bottom: 1rem; width: 100%;">Sync Onboarding Wiki</button>
          <div id="onboarding-feedback" style="font-size:0.78rem;margin-bottom:0.75rem;color:var(--text-muted);text-align:center;"></div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; text-align: left;">
            ${[...updates].reverse().map(u => `
              <div style="padding: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 0.4rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; text-align: left;">
                  <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); text-align: left;">${u.description}</span>
                </div>
                ${u.details ? `<div style="font-size: 0.76rem; color: var(--text-secondary); line-height: 1.5; background: rgba(0,0,0,0.08); padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-family: inherit; text-align: left;">${parseMarkdown(u.details)}</div>` : ''}
              </div>
            `).join('')}
            ${updates.length === 0 ? '<div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 0.5rem;">No onboarding updates generated yet.</div>' : ''}
          </div>
        </div>
      `;
    }

    tabContentHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; animation: fade-in 0.3s ease;">
        <div style="display: flex; flex-direction: column;">
          <!-- Artefact Search / Q&A -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; min-height: 420px; display: flex; flex-direction: column;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
              <span>Knowledge Search &amp; Q&amp;A</span>
              <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 4px;">Human Directs</span>
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
              Unified vector search across all documents, specs, and wikis.
            </p>
            
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
              <input type="text" id="search-query" placeholder="Ask a question..." style="flex: 1; padding: 0.6rem 1rem; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.9rem;">
              <button onclick="searchArtefacts()" class="btn-primary" style="padding: 0.6rem 1.5rem; border-radius: 20px; font-size: 0.9rem;">Search</button>
            </div>
            
            <div id="search-results" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
              <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Try searching: "What architecture documents do we have?"</div>
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column;">
          <!-- Single Unified Learn / Onboarding Ingestion Card -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; min-height: 420px; display: flex; flex-direction: column;">
            
            <!-- Ingest Sub-tabs -->
            <div style="display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; gap: 0.25rem;">
              <button onclick="window.setKALearnTab('lessons')" style="background: ${learnTab === 'lessons' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: none; border-bottom: 2px solid ${learnTab === 'lessons' ? 'var(--color-brand)' : 'transparent'}; color: ${learnTab === 'lessons' ? 'var(--color-brand)' : 'var(--text-secondary)'}; padding: 0.5rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; border-radius: 4px 4px 0 0; flex: 1; transition: all 0.2s;">✦ Lessons Learned</button>
              <button onclick="window.setKALearnTab('onboarding')" style="background: ${learnTab === 'onboarding' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: none; border-bottom: 2px solid ${learnTab === 'onboarding' ? 'var(--color-brand)' : 'transparent'}; color: ${learnTab === 'onboarding' ? 'var(--color-brand)' : 'var(--text-secondary)'}; padding: 0.5rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; border-radius: 4px 4px 0 0; flex: 1; transition: all 0.2s;">🚀 Onboarding Wiki</button>
            </div>

            <!-- Ingest Content -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
              ${learnTabContentHtml}
            </div>
            
          </div>
        </div>
      </div>
    `;
  }

  viewport.innerHTML = layoutPrefix + `
    <div style="padding: 2rem; max-width: 1200px; margin: 0 auto; animation: fade-in 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
        <div>
          <h2 style="margin: 0; font-family: var(--font-display); color: var(--text-primary);">Knowledge &amp; Artefacts</h2>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">Always-on Capability - RAG &amp; Indexing</p>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          ${dropdownHtml}
          <status-pill status="Monitoring"></status-pill>
        </div>
      </div>

      <!-- Segmented Control Tab Buttons -->
      <div class="tabs-container" style="display: flex; gap: 0.5rem; margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
        <button class="tab-btn ${activeTab === 'sync' ? 'active' : ''}" onclick="window.setKATab('sync')" style="background: ${activeTab === 'sync' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: ${activeTab === 'sync' ? '1px solid rgba(99, 102, 241, 0.2)' : 'none'}; border-radius: var(--radius-sm); padding: 0.6rem 1.2rem; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: ${activeTab === 'sync' ? 'var(--color-brand)' : 'var(--text-secondary)'}; transition: all 0.2s;">Artefact Sync</button>
        <button class="tab-btn ${activeTab === 'onboarding' ? 'active' : ''}" onclick="window.setKATab('onboarding')" style="background: ${activeTab === 'onboarding' ? 'rgba(99, 102, 241, 0.1)' : 'none'}; border: ${activeTab === 'onboarding' ? '1px solid rgba(99, 102, 241, 0.2)' : 'none'}; border-radius: var(--radius-sm); padding: 0.6rem 1.2rem; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: ${activeTab === 'onboarding' ? 'var(--color-brand)' : 'var(--text-secondary)'}; transition: all 0.2s;">Knowledge &amp; Onboarding</button>
      </div>

      ${tabContentHtml}
    </div>` + layoutSuffix;
};

// -------------------------------------------------------
// TIER 1 — Auto-Harvest
// -------------------------------------------------------
window.autoHarvestArtefacts = async function(demandId) {
  const fb = document.getElementById('harvest-feedback');
  const btn = document.getElementById('ka-harvest-btn');
  if (fb) fb.style.color = 'var(--text-muted)', fb.textContent = '⏳ Harvesting project data…';
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/auto-harvest/${demandId}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      if (fb) { fb.style.color = '#10b981'; fb.textContent = `✓ Harvested ${data.harvested_count} artefact(s): ${data.harvested.slice(0,3).join(', ')}${data.harvested.length > 3 ? '…' : ''}`; }
    } else {
      if (fb) { fb.style.color = 'red'; fb.textContent = data.detail || 'Harvest failed.'; }
    }
    window.fetchKnowledgeArtifactsData();
  } catch(e) {
    console.error(e);
    if (fb) { fb.style.color = 'red'; fb.textContent = 'Network error.'; }
  } finally {
    if (btn) btn.disabled = false;
  }
};

// -------------------------------------------------------
// TIER 2 — File Upload
// -------------------------------------------------------
window.kaHandleDrop = function(event, demandId) {
  event.preventDefault();
  const dz = document.getElementById('ka-drop-zone');
  if (dz) { dz.style.borderColor = 'var(--border-color)'; dz.style.background = ''; }
  const file = event.dataTransfer?.files?.[0];
  if (file) _kaUploadFileObj(file, demandId);
};

window.kaUploadFile = function(input, demandId) {
  const file = input?.files?.[0];
  if (file) _kaUploadFileObj(file, demandId);
};

async function _kaUploadFileObj(file, demandId) {
  const fb  = document.getElementById('upload-feedback');
  const type = document.getElementById('upload-type')?.value || 'Other';
  const ver  = document.getElementById('upload-version')?.value || '1.0';
  if (fb) { fb.style.color = 'var(--text-muted)'; fb.textContent = `⏳ Uploading ${file.name}…`; }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('art_type', type);
  formData.append('version', ver);
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/upload/${demandId}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      if (fb) { fb.style.color = '#10b981'; fb.textContent = `✓ '${data.artefact.name}' uploaded (${(data.size_bytes/1024).toFixed(1)} KB) — pending approval.`; }
      window.fetchKnowledgeArtifactsData();
    } else {
      if (fb) { fb.style.color = 'red'; fb.textContent = data.detail || 'Upload failed.'; }
    }
  } catch(e) {
    console.error(e);
    if (fb) { fb.style.color = 'red'; fb.textContent = 'Network error during upload.'; }
  }
}

// -------------------------------------------------------
// TIER 3 — Generate AI Stubs
// -------------------------------------------------------
window.generateAIStubs = async function(demandId) {
  const fb  = document.getElementById('stubs-feedback');
  const btn = document.getElementById('ka-stubs-btn');
  if (fb) { fb.style.color = 'var(--text-muted)'; fb.textContent = '⏳ AI is generating BRD, Architecture Doc, and Runbook…'; }
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/generate-stubs/${demandId}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId })
    });
    const data = await res.json();
    if (res.ok) {
      if (fb) { fb.style.color = '#f59e0b'; fb.textContent = `✓ Generated ${data.generated_count} document(s): ${data.generated.map(g => g.type).join(', ')}.`; }
      window.fetchKnowledgeArtifactsData();
    } else {
      if (fb) { fb.style.color = 'red'; fb.textContent = data.detail || 'Generation failed.'; }
    }
  } catch(e) {
    console.error(e);
    if (fb) { fb.style.color = 'red'; fb.textContent = 'Network error.'; }
  } finally {
    if (btn) btn.disabled = false;
  }
};

// -------------------------------------------------------
// Lessons / Onboarding (existing)
// -------------------------------------------------------
window.extractLessons = async function(demandId) {
  const topic = (document.getElementById('lesson-topic')?.value || '').trim();
  if (!topic) return;
  const fb = document.getElementById('lessons-feedback');
  const btn = document.getElementById('extract-lessons-btn');
  if (fb) { fb.style.color = 'var(--text-muted)'; fb.textContent = '⏳ Extracting cross-project lessons learned…'; }
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/extract-lessons`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId, topic: topic })
    });
    if (res.ok) {
      if (fb) { fb.style.color = '#10b981'; fb.textContent = '✓ Lessons extracted successfully!'; }
      const el = document.getElementById('lesson-topic');
      if (el) el.value = '';
      window.fetchKnowledgeArtifactsData();
    } else {
      const data = await res.json();
      if (fb) { fb.style.color = 'red'; fb.textContent = data.detail || 'Extraction failed.'; }
    }
  } catch(e) {
    console.error(e);
    if (fb) { fb.style.color = 'red'; fb.textContent = 'Network error during extraction.'; }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.syncOnboarding = async function(demandId) {
  const fb = document.getElementById('onboarding-feedback');
  const btn = document.getElementById('sync-onboarding-btn');
  if (fb) { fb.style.color = 'var(--text-muted)'; fb.textContent = '⏳ AI is updating onboarding wiki guide (fetching team skills)…'; }
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/sync-onboarding`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ demand_id: demandId })
    });
    if (res.ok) {
      if (fb) { fb.style.color = '#10b981'; fb.textContent = '✓ Onboarding Wiki updated successfully!'; }
      window.fetchKnowledgeArtifactsData();
    } else {
      const data = await res.json();
      if (fb) { fb.style.color = 'red'; fb.textContent = data.detail || 'Wiki update failed.'; }
    }
  } catch(e) {
    console.error(e);
    if (fb) { fb.style.color = 'red'; fb.textContent = 'Network error during wiki sync.'; }
  } finally {
    if (btn) btn.disabled = false;
  }
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <div style="font-size:0.72rem;font-weight:700;color:var(--color-brand);">AI SYNTHESIS</div>
        </div>
        <div id="ka-ai-summary-text" style="font-size:0.85rem;color:var(--text-primary);line-height:1.55;">${parseMarkdown(data.ai_summary)}</div>
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
                    <span style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">📄 ${cleanDocName(r.doc, demandId)}</span>
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

window.validateQAAnswer = async function(demandId) {
  const query = document.getElementById('search-query')?.value?.trim();
  const answer = document.getElementById('ka-ai-summary-text')?.innerText?.trim();
  const fb = document.getElementById('qa-validation-feedback');
  const btn = document.getElementById('ka-validate-qa-btn');
  
  if (!query || !answer) return;
  
  const validatedBy = prompt('Validate and Save this Answer to Wiki:\n\nEnter your name / username:');
  if (!validatedBy || !validatedBy.trim()) return;
  
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/validate-qa`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        demand_id: demandId,
        query: query,
        answer: answer,
        validated_by: validatedBy.trim()
      })
    });
    if (res.ok) {
      if (fb) { fb.style.display = 'block'; fb.textContent = '✓ Sourced answer successfully validated and saved to project Q&A wiki!'; }
      if (btn) btn.style.display = 'none';
      window.fetchKnowledgeArtifactsData();
    } else {
      const err = await res.json();
      alert('Validation failed: ' + (err.detail || 'Unknown error'));
    }
  } catch(e) {
    console.error(e);
    alert('Network error during Q&A validation.');
  }
};

window.validateOnboardingUpdate = async function(demandId, updateId) {
  const validatedBy = prompt('Sign off and Validate this Onboarding update:\n\nEnter your name / username:');
  if (!validatedBy || !validatedBy.trim()) return;
  
  try {
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/validate-update`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        demand_id: demandId,
        update_id: updateId,
        validated_by: validatedBy.trim()
      })
    });
    if (res.ok) {
      window.fetchKnowledgeArtifactsData();
    } else {
      const err = await res.json();
      alert('Onboarding validation failed: ' + (err.detail || 'Unknown error'));
    }
  } catch(e) {
    console.error(e);
    alert('Network error during onboarding validation.');
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

// -------------------------------------------------------
// Delete artefact
// -------------------------------------------------------
window.deleteArtefact = async function(demandId, artefactName) {
  if (!confirm(`Remove '${artefactName}' from the index?`)) return;
  try {
    const encoded = encodeURIComponent(artefactName);
    const res = await fetch(`${BASE_URL}/knowledge-artifacts/artefacts/${demandId}/${encoded}`, { method: 'DELETE' });
    if (res.ok) {
      window.fetchKnowledgeArtifactsData();
    } else {
      const err = await res.json();
      alert('Delete failed: ' + (err.detail || 'Unknown error'));
    }
  } catch(e) {
    console.error(e);
    alert('Network error during delete.');
  }
};

// -------------------------------------------------------
// Event delegation for all dynamically-built buttons
// -------------------------------------------------------
document.addEventListener('click', function(e) {
  // View button
  const viewBtn = e.target.closest('.ka-view-btn');
  if (viewBtn) {
    const name = viewBtn.dataset.name;
    const data = window.currentKnowledgeData || {};
    const list = data.indexed_artefacts || [];
    const doc = list.find(a => a.name === name);
    const demandId = sessionStorage.getItem('selectedDemandId');
    if (doc && doc.content) {
      window.openDocModal(cleanDocName(doc.name, demandId), doc.content);
    } else {
      alert('This document does not contain text content to view.');
    }
    return;
  }
  // Approve button
  const approveBtn = e.target.closest('.ka-approve-btn');
  if (approveBtn) {
    const demand = approveBtn.dataset.demand;
    const name   = approveBtn.dataset.name;
    if (demand && name) window.approveArtefact(demand, name);
    return;
  }
  // Delete button
  const deleteBtn = e.target.closest('.ka-delete-btn');
  if (deleteBtn) {
    const demand = deleteBtn.dataset.demand;
    const name   = deleteBtn.dataset.name;
    if (demand && name) window.deleteArtefact(demand, name);
    return;
  }
  // Register button
  const registerBtn = e.target.closest('#ka-register-btn');
  if (registerBtn) {
    const demand = registerBtn.dataset.demand;
    if (demand) window.registerArtefact(demand);
    return;
  }
  // Harvest button
  const harvestBtn = e.target.closest('#ka-harvest-btn');
  if (harvestBtn) {
    const demand = harvestBtn.dataset.demand;
    if (demand) window.autoHarvestArtefacts(demand);
    return;
  }
  // Stubs button
  const stubsBtn = e.target.closest('#ka-stubs-btn');
  if (stubsBtn) {
    const demand = stubsBtn.dataset.demand;
    if (demand) window.generateAIStubs(demand);
    return;
  }
  // QA Validation button
  const qaValBtn = e.target.closest('#ka-validate-qa-btn');
  if (qaValBtn) {
    const demand = qaValBtn.dataset.demand;
    if (demand) window.validateQAAnswer(demand);
    return;
  }
  // Onboarding Validation button
  const obValBtn = e.target.closest('.ka-validate-update-btn');
  if (obValBtn) {
    const demand = obValBtn.dataset.demand;
    const updateId = obValBtn.dataset.updateId;
    if (demand && updateId) window.validateOnboardingUpdate(demand, updateId);
    return;
  }
});
