import React, { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { riskService } from '../services/riskService';
import { demandService } from '../services/demandService';

export default function RiskIssues() {
  const { showLoader, hideLoader, showToast } = useUI();

  // Project lists & active selection
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);
  
  // Active workspace tab
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'risks' | 'issues' | 'timeline'
  
  // Hydrated details
  const [riskData, setRiskData] = useState(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilterTerm, setRiskFilterTerm] = useState('');

  // Side Drawer detail panel state
  const [detailRisk, setDetailRisk] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sorting
  const [sortCol, setSortCol] = useState('severity');
  const [sortAsc, setSortAsc] = useState(false);

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

  const loadRiskDetails = async (id) => {
    if (!id) return;
    showLoader('Analyzing project RAID logs...');
    try {
      // Fetch or aggregate risk
      const res = await riskService.aggregateRisks(id);
      const data = res.record || res;
      setRiskData(data);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadRiskDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    setSelectedDemandId(id);
    sessionStorage.setItem('selectedDemandId', id);
  };

  // Convert risk to issue
  const handleConvertRisk = async (riskId) => {
    showLoader('Converting risk to issue...');
    try {
      await riskService.convertRiskToIssue({
        demand_id: selectedDemandId,
        risk_id: riskId
      });
      await loadRiskDetails(selectedDemandId);
      showToast('✓ Risk successfully converted to active Issue');
      setDrawerOpen(false);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Suggest AI mitigation
  const handleGenerateMitigation = async (riskId) => {
    showLoader('Drafting mitigation recommendations...');
    try {
      await riskService.mitigateRisk({
        demand_id: selectedDemandId,
        risk_id: riskId
      });
      await loadRiskDetails(selectedDemandId);
      showToast('✓ AI mitigation strategy added');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Filter & sort logic
  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const risks = riskData?.risks || [];
  const issues = riskData?.issues || [];
  const mitigations = riskData?.mitigations || [];
  const timeline = riskData?.timeline || [];
  const health = riskData?.health_score || 0;

  const filteredRisks = risks.filter((r) => {
    if (!riskFilterTerm) return true;
    const term = riskFilterTerm.toLowerCase();
    return (
      r.id.toLowerCase().includes(term) ||
      (r.description && r.description.toLowerCase().includes(term)) ||
      (r.category && r.category.toLowerCase().includes(term)) ||
      (r.related_module && r.related_module.toLowerCase().includes(term))
    );
  });

  const severityVal = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const sortedRisks = [...filteredRisks].sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (sortCol === 'severity') {
      valA = severityVal[a.severity] || 0;
      valB = severityVal[b.severity] || 0;
    }
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const risksBySeverity = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  risks.forEach((r) => {
    if (risksBySeverity[r.severity] !== undefined) {
      risksBySeverity[r.severity]++;
    }
  });

  const handleOpenDetails = (r) => {
    setDetailRisk(r);
    setDrawerOpen(true);
  };

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

      {/* Main Details Panel */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Risk &amp; Issues Intelligence</h2>
            {riskData && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Always-On AI Monitoring for Project <strong>{riskData.project_summary?.title || selectedDemandId}</strong>
              </span>
            )}
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
              Select a project from the left sidebar to activate AI RAID logs scans.
            </div>
          ) : (
            <div>
              {/* Tab options selector */}
              <div className="tq-tab-header" style={{ flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button className={`tq-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Dashboard</button>
                <button className={`tq-tab-btn ${activeTab === 'risks' ? 'active' : ''}`} onClick={() => setActiveTab('risks')}>Risks</button>
                <button className={`tq-tab-btn ${activeTab === 'issues' ? 'active' : ''}`} onClick={() => setActiveTab('issues')}>Issues &amp; Mitigations</button>
                <button className={`tq-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Project Timeline</button>
              </div>

              {/* OVERVIEW DASHBOARD */}
              {activeTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Overall Health</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 700, color: health > 80 ? '#4ade80' : health > 50 ? '#fbbf24' : '#ef4444' }}>{health}%</div>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, height: '4px', background: health > 80 ? '#4ade80' : health > 50 ? '#fbbf24' : '#ef4444', width: `${health}%` }}></div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical / High Risks</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#ef4444' }}>{risksBySeverity.Critical + risksBySeverity.High}</div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Issues</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fbbf24' }}>{issues.length}</div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Open Mitigations</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-brand)' }}>{mitigations.length}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)' }}>Risks by Severity Analytics</h3>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '200px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        {['Critical', 'High', 'Medium', 'Low'].map((sev) => {
                          const count = risksBySeverity[sev] || 0;
                          const maxCount = Math.max(...Object.values(risksBySeverity), 1);
                          const heightPct = (count / maxCount) * 100;
                          const color = sev === 'Critical' ? '#ef4444' : sev === 'High' ? '#f97316' : sev === 'Medium' ? '#eab308' : '#3b82f6';
                          return (
                            <div key={sev} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyValue: 'flex-end', height: '100%' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color }}>{count}</span>
                              <div style={{ width: '100%', background: color, height: `${heightPct}%`, borderRadius: '4px 4px 0 0', minHeight: '5px' }}></div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{sev}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', maxHeight: '400px', overflowY: 'auto' }}>
                      <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Recent Events</h3>
                      <ul style={{ listStyle: 'none', padding: 0, position: 'relative' }}>
                        {timeline.slice(-6).reverse().map((t, idx) => (
                          <li key={idx} style={{ paddingLeft: '1.5rem', position: 'relative', marginBottom: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ position: 'absolute', left: '-6px', top: 0, width: '10px', height: '10px', borderRadius: '50%', background: t.event_type.includes('Risk') ? '#ef4444' : t.event_type.includes('Issue') ? '#f97316' : 'var(--color-brand)' }}></div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(t.timestamp).toLocaleString()}</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.event_type}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.description}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* RISKS TAB */}
              {activeTab === 'risks' && (
                <div>
                  <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Smart Search risks..."
                      value={riskFilterTerm}
                      onChange={(e) => setRiskFilterTerm(e.target.value)}
                      style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', width: '300px' }}
                    />
                    <button onClick={() => loadRiskDetails(selectedDemandId)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                      &#8635; Refresh AI Analysis
                    </button>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
                          {['ID', 'Description', 'Category', 'Severity', 'Score', 'Status', 'Actions'].map((col) => {
                            const key = col === 'Score' ? 'risk_score' : col.toLowerCase();
                            return (
                              <th
                                key={col}
                                style={{ padding: '1rem', cursor: 'pointer' }}
                                onClick={() => {
                                  setSortCol(key);
                                  setSortAsc(!sortAsc);
                                }}
                              >
                                {col}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRisks.length === 0 ? (
                          <tr><td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No risks match search criteria.</td></tr>
                        ) : (
                          sortedRisks.map((r) => {
                            const sevColor = r.severity === 'Critical' ? '#ef4444' : r.severity === 'High' ? '#f97316' : r.severity === 'Medium' ? '#eab308' : '#3b82f6';
                            return (
                              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{r.id}</td>
                                <td style={{ padding: '1rem' }}>
                                  <div style={{ fontWeight: 600 }}>{r.description}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Module: {r.related_module} | Owner: {r.owner}</div>
                                </td>
                                <td style={{ padding: '1rem' }}>{r.category}</td>
                                <td style={{ padding: '1rem', fontWeight: 700, color: sevColor }}>{r.severity}</td>
                                <td style={{ padding: '1rem' }}>{r.risk_score}</td>
                                <td style={{ padding: '1rem' }}>{r.status}</td>
                                <td style={{ padding: '1rem', display: 'flex', gap: '0.25rem' }}>
                                  {r.status !== 'Converted' && (
                                    <button onClick={() => handleConvertRisk(r.id)} className="btn-primary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>Convert to Issue</button>
                                  )}
                                  <button onClick={() => handleOpenDetails(r)} className="btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>Details</button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ISSUES & MITIGATIONS TAB */}
              {activeTab === 'issues' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 1rem 0' }}>Active Issues</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {issues.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>No active issues.</div>
                      ) : (
                        issues.map((iss) => (
                          <div key={iss.issue_id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                              <span style={{ fontFamily: 'monospace', color: 'var(--color-brand)' }}>{iss.issue_id}</span>
                              <span style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem' }}>{iss.status}</span>
                            </div>
                            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>{iss.description}</div>
                            {iss.rca_result && (
                              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--color-brand)', marginBottom: '1rem', fontSize: '0.8rem' }}>
                                <strong>AI RCA:</strong> {iss.rca_result}
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                              <button onClick={() => handleGenerateMitigation(iss.risk_id)} className="btn-secondary" style={{ fontSize: '0.75rem' }}>Suggest AI Mitigation</button>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Owner: {iss.owner}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 1rem 0' }}>Open Mitigations</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {mitigations.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>No active mitigations.</div>
                      ) : (
                        mitigations.map((m) => (
                          <div key={m.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                              <span style={{ fontFamily: 'monospace', color: '#10b981' }}>{m.id}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Risk: {m.risk_id}</span>
                            </div>
                            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>{m.description}</div>
                            {m.ai_recommendation && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{m.ai_recommendation}</div>}
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                <span>Progress</span>
                                <span>{m.progress}%</span>
                              </div>
                              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${m.progress}%`, height: '100%', background: '#10b981' }}></div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Owner: {m.owner}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PROJECT TIMELINE */}
              {activeTab === 'timeline' && (
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '2rem', borderRadius: '4px' }}>
                  <h3 style={{ margin: '0 0 2rem 0' }}>Full Project Audit Timeline</h3>
                  <ul style={{ listStyle: 'none', padding: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '6px', top: 0, bottom: 0, width: '2px', background: 'var(--border-color)' }}></div>
                    {timeline.slice().reverse().map((t, idx) => (
                      <li key={idx} style={{ paddingLeft: '3rem', position: 'relative', marginBottom: '2rem' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: '14px', height: '14px', borderRadius: '50%', background: 'var(--bg-primary)', border: `2px solid ${t.event_type.includes('Risk') ? '#ef4444' : t.event_type.includes('Issue') ? '#f97316' : 'var(--color-brand)'}`, zIndex: 1 }}></div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(t.timestamp).toLocaleString()}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 600 }}>{t.event_type}</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', marginTop: '0.25rem' }}>{t.description}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
        </div>
      </main>

      {/* Side Details Drawer */}
      {drawerOpen && detailRisk && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }}></div>
          <div style={{ position: 'fixed', top: 0, right: 0, width: '500px', height: '100vh', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)' }}>
              <h3 style={{ margin: 0 }}>Risk Details</h3>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>ID &amp; Category</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{detailRisk.id}</span>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem' }}>{detailRisk.category}</span>
                </div>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Description</div>
                <div style={{ fontSize: '1rem', lineHeight: 1.5 }}>{detailRisk.description}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Severity</div>
                  <div style={{ fontWeight: 'bold' }}>{detailRisk.severity}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Risk Score</div>
                  <div style={{ fontWeight: 'bold' }}>{detailRisk.risk_score} / 100</div>
                </div>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>AI Root Cause Analysis</div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--color-brand)', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {detailRisk.root_cause_analysis || 'No detailed RCA available yet.'}
                </div>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Suggested Mitigation</div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid #10b981', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {detailRisk.suggested_mitigation || 'No suggested mitigation.'}
                </div>
              </div>
            </div>
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button onClick={() => setDrawerOpen(false)} className="btn-secondary">Close</button>
              {detailRisk.status !== 'Converted' && (
                <button onClick={() => handleConvertRisk(detailRisk.id)} className="btn-primary">Convert to Issue</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
