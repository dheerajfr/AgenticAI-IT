import React, { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { knowledgeService } from '../services/knowledgeService';
import { demandService } from '../services/demandService';

export default function KnowledgeArtifacts() {
  const { showLoader, hideLoader, showToast } = useUI();

  // Core demands and active selection
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);

  // Active sub tab inside workspace
  const [kaActiveTab, setKaActiveTab] = useState('sync'); // 'sync' | 'search' | 'onboarding'
  const [ingestTab, setIngestTab] = useState('harvest'); // 'harvest' | 'generate' | 'upload'

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Loaded Details state
  const [knowledgeData, setKnowledgeData] = useState(null);
  
  // Vector search Q&A states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  // File upload states
  const [uploadType, setUploadType] = useState('Requirements');
  const [uploadVersion, setUploadVersion] = useState('1.0');

  const loadData = async () => {
    try {
      const dList = await demandService.getDemands().catch(() => []);
      setDemands(dList || []);

      const pendingDemandId = sessionStorage.getItem('selectedDemandId');
      if (pendingDemandId) {
        setSelectedDemandId(pendingDemandId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadKnowledgeDetails = async (id) => {
    if (!id) return;
    showLoader('Loading knowledge indexing indices...');
    try {
      const res = await knowledgeService.getKnowledgeProject(id);
      setKnowledgeData(res);
      setSearchResults([]);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadKnowledgeDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    setSelectedDemandId(id);
    sessionStorage.setItem('selectedDemandId', id);
  };

  // Auto-harvest project data
  const handleAutoHarvest = async () => {
    if (!selectedDemandId) return;
    showLoader('Scanning delivery modules and harvesting metadata...');
    try {
      await knowledgeService.autoHarvest(selectedDemandId);
      await loadKnowledgeDetails(selectedDemandId);
      showToast('✓ Project metadata harvested successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Generate AI Draft docs stubs
  const handleGenerateStubs = async () => {
    if (!selectedDemandId) return;
    showLoader('✦ Generative AI creating BRD, Architecture & Runbooks...');
    try {
      await knowledgeService.generateStubs(selectedDemandId, {});
      await loadKnowledgeDetails(selectedDemandId);
      showToast('✓ AI documentation drafts created');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // File upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDemandId) return;

    showLoader('Uploading and indexing document...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', uploadType);
      formData.append('version', uploadVersion);

      await knowledgeService.uploadFile(selectedDemandId, formData);
      await loadKnowledgeDetails(selectedDemandId);
      showToast('✓ File successfully uploaded and indexed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Vector Search Query
  const handleVectorSearch = async () => {
    if (!searchQuery || !selectedDemandId) return;
    showLoader('Querying vector database...');
    try {
      const res = await knowledgeService.searchKnowledge({
        demand_id: selectedDemandId,
        query: searchQuery
      });
      setSearchResults(res.results || []);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Approve vector Q&A results
  const handleApproveQA = async (qText, aText, originalDoc) => {
    showLoader('Saving QA pair...');
    try {
      await knowledgeService.validateQA({
        demand_id: selectedDemandId,
        question: qText,
        answer: aText,
        source_doc: originalDoc
      });
      showToast('✓ QA pair indexed successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Sync Onboarding Wiki guide
  const handleSyncOnboardingWiki = async () => {
    if (!selectedDemandId) return;
    showLoader('Building onboarding wiki guides...');
    try {
      await knowledgeService.syncOnboarding({
        demand_id: selectedDemandId
      });
      await loadKnowledgeDetails(selectedDemandId);
      showToast('✓ Onboarding Wiki generated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Delete Artifact
  const handleDeleteArtifact = async (filename) => {
    if (window.confirm(`Delete artifact ${filename}?`)) {
      showLoader('Removing artifact...');
      try {
        await knowledgeService.deleteArtifact(selectedDemandId, filename);
        await loadKnowledgeDetails(selectedDemandId);
        showToast('✓ Artifact deleted');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const artefacts = knowledgeData?.artefacts || [];
  const updates = knowledgeData?.onboarding_updates || [];

  return (
    <div className="intake-screen">
      {/* Sidebar selection */}
      <aside className="sidebar">
        <div className="sidebar-search" style={{ padding: '1rem' }}>
          <input
            type="text"
            placeholder="Search project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
          />
        </div>
        <ul className="demand-list">
          {filteredDemands.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No projects found.
            </li>
          ) : (
            filteredDemands.map((d) => {
              const active = d.demand_id === selectedDemandId;
              return (
                <li
                  key={d.demand_id}
                  className={`demand-item ${active ? 'active' : ''}`}
                  onClick={() => handleSelectDemand(d.demand_id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{d.demand_id}</span>
                  </div>
                  <h4 className="demand-item-title">{d.title}</h4>
                  <div className="demand-item-meta">
                    <span>Status: {d.status}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main Details Workspace */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Knowledge &amp; Artefacts</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Always-on Capability - RAG &amp; Vector Indexing
            </span>
          </div>
          <div>
            <select
              value={selectedDemandId || ''}
              onChange={(e) => handleSelectDemand(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minWidth: '280px', cursor: 'pointer' }}
            >
              <option value="">Select a Project...</option>
              {demands.map((d) => (
                <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedDemandId ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a project from the left sidebar to activate vector indexing tools.
            </div>
          ) : (
            <div>
              {/* Tab Selector */}
              <div className="tq-tab-header" style={{ flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button className={`tq-tab-btn ${kaActiveTab === 'sync' ? 'active' : ''}`} onClick={() => setKaActiveTab('sync')}>Artefact Sync</button>
                <button className={`tq-tab-btn ${kaActiveTab === 'search' ? 'active' : ''}`} onClick={() => setKaActiveTab('search')}>Knowledge Search</button>
                <button className={`tq-tab-btn ${kaActiveTab === 'onboarding' ? 'active' : ''}`} onClick={() => setKaActiveTab('onboarding')}>Onboarding Wiki</button>
              </div>

              {/* ARTEFACT SYNC TAB */}
              {kaActiveTab === 'sync' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  {/* Left Column: Indexed items */}
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Indexed Artefacts for {selectedDemandId}</span>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '4px' }}>Index Active</span>
                    </h3>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {artefacts.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>No indexed documents found.</div>
                      ) : (
                        artefacts.map((art, idx) => (
                          <div key={idx} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{art.filename}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Type: {art.doc_type} | Version: {art.version || '1.0'}</div>
                            </div>
                            <button onClick={() => handleDeleteArtifact(art.filename)} className="btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#ef4444' }}>
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Unified Ingestion */}
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
                    {/* Ingest sub-tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', gap: '0.25rem' }}>
                      <button className={`tq-tab-btn ${ingestTab === 'harvest' ? 'active' : ''}`} onClick={() => setIngestTab('harvest')} style={{ flex: 1 }}>⚙ Harvest</button>
                      <button className={`tq-tab-btn ${ingestTab === 'generate' ? 'active' : ''}`} onClick={() => setIngestTab('generate')} style={{ flex: 1 }}>✦ AI Generate</button>
                      <button className={`tq-tab-btn ${ingestTab === 'upload' ? 'active' : ''}`} onClick={() => setIngestTab('upload')} style={{ flex: 1 }}>↑ Upload</button>
                    </div>

                    <div style={{ flex: 1 }}>
                      {ingestTab === 'harvest' && (
                        <div>
                          <h4 style={{ margin: '0 0 0.5rem 0' }}>Auto-Harvest Project Data</h4>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                            Scan all delivery modules and auto-register everything produced for this project as searchable files.
                          </p>
                          <button onClick={handleAutoHarvest} className="btn-primary" style={{ width: '100%' }}>🔍 Harvest from Project Data</button>
                        </div>
                      )}

                      {ingestTab === 'generate' && (
                        <div>
                          <h4 style={{ margin: '0 0 0.5rem 0' }}>Generate AI Draft Docs</h4>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                            AI drafts a BRD, Architecture Design Doc, and operational runbook from the intake parameters.
                          </p>
                          <button onClick={handleGenerateStubs} className="btn-primary" style={{ width: '100%' }}>✦ Generate BRD + Architecture + Runbook</button>
                        </div>
                      )}

                      {ingestTab === 'upload' && (
                        <div>
                          <h4 style={{ margin: '0 0 0.5rem 0' }}>Upload Document</h4>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            Upload PDF, DOCX, TXT or MD files to index.
                          </p>
                          
                          <div style={{ border: '2px dashed var(--border-color)', borderRadius: '4px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem' }} onClick={() => document.getElementById('file-upload-input').click()}>
                            <div style={{ fontSize: '1.5rem' }}>📄</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Click to browse document</div>
                          </div>
                          <input type="file" id="file-upload-input" style={{ display: 'none' }} onChange={handleFileUpload} />

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div className="tq-form-group">
                              <label style={{ fontSize: '0.7rem' }}>Document Type</label>
                              <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                                <option value="Requirements">Requirements</option>
                                <option value="Architecture">Architecture</option>
                                <option value="Test Evidence">Test Evidence</option>
                                <option value="Runbook">Runbook</option>
                                <option value="ADR">ADR</option>
                              </select>
                            </div>
                            <div className="tq-form-group">
                              <label style={{ fontSize: '0.7rem' }}>Doc Version</label>
                              <input type="text" value={uploadVersion} onChange={(e) => setUploadVersion(e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* KNOWLEDGE SEARCH TAB */}
              {kaActiveTab === 'search' && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '2rem', minHeight: '420px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>🔍 Knowledge Search &amp; Q&amp;A</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                      Unified vector search across all project specifications, design documents and runbooks.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '650px', margin: '0 auto' }}>
                    <input
                      type="text"
                      placeholder="Ask a question about the project..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ flex: 1, padding: '0.8rem 1.2rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={handleVectorSearch} className="btn-primary" style={{ padding: '0.8rem 2rem' }}>Search</button>
                  </div>

                  <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {searchResults.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>Type a query to search vector records.</div>
                    ) : (
                      searchResults.map((res, idx) => (
                        <div key={idx} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-brand)' }}>{res.title || 'Search Match'}</div>
                          <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', lineHeight: '1.4' }}>{res.answer || res.content}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span>Source Doc: {res.source_doc}</span>
                            <button onClick={() => handleApproveQA(searchQuery, res.answer || res.content, res.source_doc)} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>
                              Approve QA Pair
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ONBOARDING WIKI TAB */}
              {kaActiveTab === 'onboarding' && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '2rem', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <button onClick={handleSyncOnboardingWiki} className="btn-primary" style={{ minWidth: '280px' }}>
                      🚀 Generate Onboarding Wiki
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1 }}>
                    {updates.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', border: '1px dashed var(--border-color)' }}>
                        No onboarding wiki guides compiled. Click the button above to build.
                      </div>
                    ) : (
                      [...updates].reverse().map((u, idx) => (
                        <div key={idx} style={{ padding: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                          <div style={{ display: 'flex', justifyValue: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{u.description}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(u.updated_at).toLocaleString()}</span>
                          </div>
                          {u.details && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.02)', padding: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                              {u.details}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
