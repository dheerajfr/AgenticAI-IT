import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../context/UIContext';
import { reportingService } from '../services/reportingService';
import { demandService } from '../services/demandService';

export default function ReportingCommunication() {
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Core demands and active selection
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);

  // Active sub tab inside workspace
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'comms' | 'history'

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Loaded Details state
  const [reportingData, setReportingData] = useState(null);
  
  // Form input selectors
  const [reportAudience, setReportAudience] = useState('CIO');
  const [commType, setCommType] = useState('Release_Notes');

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

  const loadReportingDetails = async (id) => {
    if (!id) return;
    showLoader('Assembling report statistics...');
    try {
      const res = await reportingService.getReportingProject(id);
      setReportingData(res);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadReportingDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    setSelectedDemandId(id);
    sessionStorage.setItem('selectedDemandId', id);
  };

  // Generate Executive Summary via AI
  const handleGenerateSummary = async () => {
    if (!selectedDemandId) return;
    showLoader('✦ Running AI executive report writer...');
    try {
      await reportingService.generateSummary({
        demand_id: selectedDemandId,
        audience: reportAudience
      });
      await loadReportingDetails(selectedDemandId);
      showToast(`✓ Executive Summary generated for ${reportAudience}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Draft communications document
  const handleDraftComm = async () => {
    if (!selectedDemandId) return;
    showLoader('✦ AI drafting release log / coms...');
    try {
      await reportingService.draftComm({
        demand_id: selectedDemandId,
        comm_type: commType
      });
      await loadReportingDetails(selectedDemandId);
      showToast(`✓ Communication draft compiled for ${commType}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Document HTML download exporter
  const triggerHtmlDownload = (title, subtitle, content, filename) => {
    const docFilename = filename.replace('.pdf', '.html');
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; line-height: 1.6; background: #fff; }
    .header { border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { margin: 0; font-size: 28px; color: #6366f1; }
    .subtitle { margin: 5px 0 0 0; font-size: 16px; color: #666; font-weight: normal; }
    .meta { text-align: right; color: #999; font-size: 12px; }
    .content { font-size: 14px; white-space: pre-wrap; color: #222; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${title}</h1>
      <h3 class="subtitle">${subtitle}</h3>
    </div>
    <div class="meta">
      Generated: ${new Date().toLocaleDateString()}<br>
      AgenticAI Delivery System
    </div>
  </div>
  <div class="content">${content}</div>
  <div class="footer">CONFIDENTIAL - Internal Use Only</div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = docFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const getCommsArray = () => {
    if (!reportingData) return [];
    let list = reportingData.communications ? [...reportingData.communications] : [];
    const summary = reportingData.exec_summary;
    if (summary && !list.find((c) => c.content === summary.content)) {
      list.unshift({
        type: summary.type || "Exec_Summary_" + summary.audience,
        status: summary.status || "generated",
        content: summary.content,
        audience: summary.audience
      });
    }
    return list;
  };

  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const summary = reportingData?.exec_summary || null;
  const allComms = getCommsArray();

  const commDrafts = allComms.filter((c) => !c.type.startsWith('Exec_Summary'));
  const latestComm = commDrafts.length > 0 ? commDrafts[commDrafts.length - 1] : null;
  const latestCommIdx = latestComm ? allComms.lastIndexOf(latestComm) : -1;

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
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Reporting &amp; Communications</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Always-on Capability - Stakeholder Rollups
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
              Select a project from the left sidebar to activate AI report drafting.
            </div>
          ) : (
            <div>
              {/* Tab Selector */}
              <div className="tq-tab-header" style={{ flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button className={`tq-tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>Exec Summary &amp; Rollup</button>
                <button className={`tq-tab-btn ${activeTab === 'comms' ? 'active' : ''}`} onClick={() => setActiveTab('comms')}>Comm Drafting</button>
                <button className={`tq-tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Past Reports</button>
              </div>

              {/* EXEC SUMMARY TAB */}
              {activeTab === 'summary' && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Executive Summary &amp; Rollup</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>Human Directs</span>
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    AI aggregates information across planning and testing to generate audience-specific rollup documents.
                  </p>

                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <select value={reportAudience} onChange={(e) => setReportAudience(e.target.value)} style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      <option value="CIO">CIO / Executive</option>
                      <option value="Tech_Lead">Technical Lead</option>
                      <option value="Business_Owner">Business Owner</option>
                    </select>
                    <button onClick={handleGenerateSummary} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>Generate Report</button>
                  </div>

                  {summary ? (
                    <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', border: '1px solid var(--color-brand)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--color-brand)' }}></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase' }}>Latest Summary: {summary.audience}</div>
                        <div style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)', fontWeight: 700 }}>Generated</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: '1rem', lineHeight: '1.5' }}>{summary.content}</div>
                      <button onClick={() => triggerHtmlDownload('Executive Summary', `Audience: ${summary.audience}`, summary.content, `Executive_Summary_${selectedDemandId}.pdf`)} className="btn-primary" style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem' }}>
                        Download Document
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', text: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>
                      Select a report type and target audience to generate rollups.
                    </div>
                  )}
                </div>
              )}

              {/* COMM DRAFTING TAB */}
              {activeTab === 'comms' && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Comm Drafting</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px' }}>Human Approves</span>
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    AI drafts release notes,Weekly status reports, and outage notifications automatically.
                  </p>

                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <select value={commType} onChange={(e) => setCommType(e.target.value)} style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      <option value="Release_Notes">Release Notes</option>
                      <option value="Outage_Notification">Outage Notification</option>
                      <option value="Weekly_Status">Weekly Status Update</option>
                    </select>
                    <button onClick={handleDraftComm} className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>Draft Comm</button>
                  </div>

                  {latestComm ? (
                    <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', border: '1px solid var(--color-brand)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--color-brand)' }}></div>
                      <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase' }}>Latest Draft: {latestComm.type.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)', fontWeight: 700 }}>{latestComm.status}</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: '1rem', lineHeight: '1.5' }}>{latestComm.content}</div>
                      <button onClick={() => triggerHtmlDownload(latestComm.type.replace(/_/g, ' '), `Project: ${selectedDemandId}`, latestComm.content, `${latestComm.type}_${selectedDemandId}.pdf`)} className="btn-primary" style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem' }}>
                        Download Document
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', text: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>
                      Select a report template and click Draft Comm to create stakeholder notifications.
                    </div>
                  )}
                </div>
              )}

              {/* PAST REPORTS TAB */}
              {activeTab === 'history' && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Past Reports &amp; Communications</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    Historical archive of rollup briefs and notifications generated for the current track.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {allComms.length === 0 ? (
                      <div style={{ padding: '2rem', text: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>No reports logged in the archive.</div>
                    ) : (
                      [...allComms].reverse().map((c, revIdx) => {
                        const idx = allComms.length - 1 - revIdx;
                        return (
                          <div key={idx} style={{ padding: '1.25rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                              <div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.type.replace(/_/g, ' ')}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                  Audience: <strong>{c.audience || 'Project Stakeholders'}</strong>
                                </div>
                              </div>
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: 'var(--color-brand)', fontWeight: 700 }}>
                                {c.status}
                              </span>
                            </div>
                            <button onClick={() => triggerHtmlDownload(c.type.replace(/_/g, ' '), `Project: ${selectedDemandId}`, c.content, `${c.type}_${selectedDemandId}.pdf`)} className="btn-secondary" style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem' }}>
                              ↓ Download Document
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/always-on/knowledge-artifacts')} className="btn-primary" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 700, padding: '0.75rem 1.5rem' }}>
            Proceed to Knowledge base &rarr;
          </button>
        </div>
      </main>
    </div>
  );
}
