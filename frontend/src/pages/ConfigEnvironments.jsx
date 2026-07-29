import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { configService } from '../services/configService';
import { demandService } from '../services/demandService';
import StatusPill from '../components/common/StatusPill';

export default function ConfigEnvironments() {
  const { selectedDemand } = useProject();
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Page data states
  const [environments, setEnvironments] = useState([]);
  const [demands, setDemands] = useState([]);
  const [demandIds, setDemandIds] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Editable fields local state
  const [editingKey, setEditingKey] = useState(null); // 'envName-field'
  const [editValue, setEditValue] = useState('');

  // Simulation console output
  const [actionResult, setActionResult] = useState(null); // { type: 'drift'|'hygiene'|'readiness', text: '', style: {} }

  // Load environments, demands, and demand IDs
  const loadData = async () => {
    try {
      const list = await configService.getEnvironments();
      setEnvironments(list || []);

      const demandList = await demandService.getDemands();
      setDemands(demandList || []);

      const ids = await configService.getDemandIds();
      setDemandIds(ids || []);

      // Auto-select active project if not set
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

  // Demand titles mapping
  const demandTitles = {};
  demands.forEach((d) => {
    demandTitles[d.demand_id] = d.title;
  });

  // Unique list of demand IDs from environments records
  const envDemands = [...new Set(environments.map((e) => e.demand_id))];

  // Filter sidebar list
  const filteredSidebarDemands = envDemands.filter((id) => {
    const q = searchTerm.toLowerCase();
    const title = demandTitles[id] || '';
    return id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
  });

  // Action: Select project
  const handleSelectProject = (id) => {
    if (id === 'new') {
      setSelectedDemandId(null);
      setActionResult(null);
    } else {
      setSelectedDemandId(id);
      setActionResult(null);
      sessionStorage.setItem('selectedDemandId', id);
    }
  };

  // Action: Seed environments with AI
  const handleSeedEnvironments = async (id) => {
    showLoader('⏳ Generating environments with AI…');
    try {
      await configService.seedEnvironments({ demand_id: id });
      await loadData();
      showToast('✓ Environments initialised');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Action: Delete environments records for a demand
  const handleDeleteAllRecords = async (e, id) => {
    e.stopPropagation();
    if (window.confirm(`Delete all environment records for ${id}?`)) {
      showLoader('Deleting records...');
      try {
        await configService.deleteEnvironment(id);
        if (selectedDemandId === id) {
          setSelectedDemandId(null);
        }
        await loadData();
        showToast(`✓ Deleted records for ${id}`);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  // Action: Inline edit expected properties
  const handleStartEdit = (envName, field, currentValue) => {
    setEditingKey(`${envName}-${field}`);
    setEditValue(currentValue);
  };

  const handleSaveField = async (envName, field) => {
    if (!selectedDemandId) return;
    
    let payload = {};
    if (field === 'expected_requirements') {
      payload[field] = editValue ? editValue.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else {
      payload[field] = editValue;
    }

    showLoader('Saving field update...');
    try {
      await configService.saveField(selectedDemandId, envName, payload);
      setEditingKey(null);
      await loadData();
      showToast('✓ Field updated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleBumpVersion = (dir) => {
    const val = editValue.trim() || '1.0.0';
    const match = val.match(/(.*?)(\d+)$/);
    if (match) {
      let newNum = parseInt(match[2], 10) + dir;
      if (newNum < 0) newNum = 0;
      setEditValue(match[1] + newNum);
    } else {
      setEditValue(val + (dir > 0 ? '.1' : '.0'));
    }
  };

  // Simulation: Drift detection check
  const handleSimulateDrift = async (envName, record) => {
    setActionResult({
      type: 'drift',
      text: 'Running drift detection…',
      style: { background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)', color: '#93c5fd' }
    });

    try {
      const res = await configService.reconcileDrift({
        demand_id: record.demand_id,
        environment: record.environment,
        deployed_version: record.deployed_version,
        expected_version: record.expected_version
      });
      
      const isDrifted = res.drift_status === 'drifted';
      setActionResult({
        type: 'drift',
        text: `Drift Detection Complete — ${envName.toUpperCase()}\nStatus: ${res.drift_status.toUpperCase()}\nRefreshing environment data...`,
        style: isDrifted
          ? { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }
          : { background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)', color: '#86efac' }
      });

      setTimeout(() => {
        loadData();
      }, 1500);
    } catch (e) {
      setActionResult({
        type: 'drift',
        text: `Error: ${e.message}`,
        style: { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }
      });
    }
  };

  // Simulation: CMDB Hygiene checks
  const handleSimulateHygiene = async (envName, record) => {
    setActionResult({
      type: 'hygiene',
      text: 'Running records hygiene check…',
      style: { background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)', color: '#fcd34d' }
    });

    try {
      const res = await configService.checkHygiene({
        demand_id: selectedDemandId,
        environment: envName
      });

      let innerText = `Records Hygiene — ${envName.toUpperCase()}\nStatus: ${res.status}\n${res.message}`;
      innerText += `\n\nObserved: ${record.observed_name || '—'}  |  CMDB: ${record.cmdb_name || '—'}`;
      
      setActionResult({
        type: 'hygiene',
        text: innerText,
        proposedAction: res.proposed_action,
        style: { background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)', color: '#fcd34d' }
      });
    } catch (e) {
      setActionResult({
        type: 'hygiene',
        text: `Error: ${e.message}`,
        style: { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }
      });
    }
  };

  const handleApplyHygieneFix = async (envName, newCmdbName) => {
    showLoader('Applying CMDB hygiene fix…');
    try {
      await configService.applyHygieneFix({
        demand_id: selectedDemandId,
        environment: envName,
        new_cmdb_name: newCmdbName
      });
      setActionResult({
        type: 'hygiene',
        text: '✓ Fix applied successfully. Refreshing...',
        style: { background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)', color: '#86efac' }
      });
      setTimeout(() => {
        loadData();
      }, 1000);
    } catch (e) {
      setActionResult({
        type: 'hygiene',
        text: `Error: ${e.message}`,
        style: { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }
      });
    } finally {
      hideLoader();
    }
  };

  // Simulation: Verify Baseline readiness
  const handleVerifyReadiness = async (envName) => {
    setActionResult({
      type: 'readiness',
      text: 'Verifying baseline readiness…',
      style: { background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)', color: '#93c5fd' }
    });

    try {
      const res = await configService.verifyReadiness({
        demand_id: selectedDemandId,
        environment: envName
      });

      if (res.ready) {
        setActionResult({
          type: 'readiness',
          text: `Baseline Reconcile — ${envName.toUpperCase()}\n✓ All requirements satisfied. Ready to proceed.`,
          style: { background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)', color: '#86efac' }
        });
      } else {
        setActionResult({
          type: 'readiness',
          text: `Baseline Reconcile — ${envName.toUpperCase()}\nIssues found:\n\n` + res.issues.join('\n'),
          style: { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }
        });
      }
    } catch (e) {
      setActionResult({
        type: 'readiness',
        text: `Error: ${e.message}`,
        style: { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }
      });
    }
  };

  // Environment columns structure
  const envOrder = ['dev', 'test', 'staging', 'prod'];
  const demandEnvs = environments.filter((e) => e.demand_id === selectedDemandId);
  const hasDrift = demandEnvs.some((e) => e.drift_status !== 'in-sync');

  const badgeColor = hasDrift ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)';
  const badgeBg = hasDrift ? 'var(--color-status-red-bg)' : 'var(--color-status-green-bg)';
  const badgeText = hasDrift ? 'Drifted' : 'In Sync';

  return (
    <div className="intake-screen">
      {/* Sidebar listing */}
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
          {filteredSidebarDemands.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No records found.
            </li>
          ) : (
            filteredSidebarDemands.map((id) => {
              const isActive = id === selectedDemandId;
              const hasProjectDrift = environments.some((e) => e.demand_id === id && e.drift_status !== 'in-sync');
              const envCount = environments.filter((e) => e.demand_id === id).length;
              return (
                <li
                  key={id}
                  className={`demand-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectProject(id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{id}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {hasProjectDrift ? (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-status-red-text)', textTransform: 'uppercase' }}>Drifted</span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-status-green-text)', textTransform: 'uppercase' }}>In Sync</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAllRecords(e, id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-status-red-text)', cursor: 'pointer', padding: '0.15rem', opacity: 0.65, display: 'flex', alignItems: 'center' }}
                        title={`Delete all environment records for ${id}`}
                      >
                        <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', fill: 'currentColor' }}><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="demand-item-meta">
                    {demandTitles[id] && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textString: 'ellipsis' }}>{demandTitles[id]}</span>}
                    <span>{envCount} env{envCount !== 1 ? 's' : ''}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main panel viewport */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Config Environments</h2>
          <div>
            <select
              value={selectedDemandId || 'new'}
              onChange={(e) => handleSelectProject(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.85rem',
                minWidth: '280px',
                maxWidth: '380px',
                cursor: 'pointer'
              }}
            >
              <option value="new">+ Create New Project</option>
              {demands.map((d) => (
                <option key={d.demand_id} value={d.demand_id}>
                  {d.demand_id} - {d.title}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedDemandId ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a project from the dropdown or sidebar.
            </div>
          ) : demandEnvs.length === 0 ? (
            /* NO RECORDS - ONE TIME INITIALIZE CARD */
            <div style={{ textAlign: 'center', maxWidth: '480px', margin: '2rem auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🛠</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Environment Records</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Click below to let the AI analyse this demand's business summary and generate realistic environment configuration data across all four environments.
              </p>
              <button
                onClick={() => handleSeedEnvironments(selectedDemandId)}
                className="btn-primary"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)', border: 'none', padding: '0.6rem 1.5rem' }}
              >
                ✦ Initialise Environments with AI
              </button>
            </div>
          ) : (
            /* PIPELINE ENVIRONMENTS BOARD */
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedDemandId}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    Config &amp; Environments
                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', fontWeight: 600, textTransform: 'uppercase', color: badgeColor, background: badgeBg, border: `1px solid ${badgeColor}` }}>
                      {badgeText}
                    </span>
                  </h2>
                  {demandTitles[selectedDemandId] && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{demandTitles[selectedDemandId]}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Environments tracked</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand)' }}>
                    {demandEnvs.length} / 4
                  </div>
                </div>
              </div>

              {/* Summary Stats Row */}
              <div className="grid-2col" style={{ marginBottom: '1.5rem' }}>
                <div className="data-item">
                  <div className="data-label">In-Sync Environments</div>
                  <div className="data-value" style={{ color: 'var(--color-status-green-text)' }}>
                    {demandEnvs.filter((e) => e.drift_status === 'in-sync').length}
                  </div>
                </div>
                <div className="data-item">
                  <div className="data-label">Drifted Environments</div>
                  <div className="data-value" style={{ color: 'var(--color-status-red-text)' }}>
                    {demandEnvs.filter((e) => e.drift_status !== 'in-sync').length}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Environment Pipeline
              </div>

              {/* Horizontal Scroll Environment Cards */}
              <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', alignItems: 'stretch' }}>
                {envOrder.map((envName) => {
                  const record = demandEnvs.find((e) => e.environment === envName);
                  if (!record) {
                    return (
                      <div key={envName} style={{ flex: 1, minWidth: '240px' }}>
                        <div style={{ marginBottom: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.72rem', letterSpacing: '0.1em' }}>{envName}</div>
                        <div style={{ border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.1)' }}>
                          Not Deployed
                        </div>
                      </div>
                    );
                  }

                  const isDrifted = record.drift_status !== 'in-sync';
                  const isEditingVersion = editingKey === `${envName}-expected_version`;
                  const isEditingCmdb = editingKey === `${envName}-cmdb_name`;
                  const isEditingReqs = editingKey === `${envName}-expected_requirements`;

                  return (
                    <div key={envName} style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ marginBottom: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.72rem', letterSpacing: '0.1em' }}>{envName}</div>
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', borderColor: isDrifted ? 'rgba(239,68,68,0.35)' : 'var(--border-color)', background: isDrifted ? 'rgba(239,68,68,0.04)' : 'var(--bg-tertiary)' }}>
                        
                        {/* Status badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.2rem 0.55rem', borderRadius: '999px', color: isDrifted ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)', background: isDrifted ? 'var(--color-status-red-bg)' : 'var(--color-status-green-bg)', border: `1px solid ${isDrifted ? 'var(--color-status-red-text)' : 'var(--color-status-green-text)'}` }}>
                            {record.drift_status.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {new Date(record.last_checked).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Expected Version */}
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.3rem' }}>Expected Version</div>
                          {isEditingVersion ? (
                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                className="env-field-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                style={{ flex: 1, padding: '0.3rem' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button type="button" onClick={() => handleBumpVersion(1)} style={{ background: 'var(--bg-secondary)', border: '1px solid #6366f1', borderRadius: '3px', color: 'var(--text-primary)', fontSize: '0.6rem', padding: '2px 4px', cursor: 'pointer' }}>▲</button>
                                <button type="button" onClick={() => handleBumpVersion(-1)} style={{ background: 'var(--bg-secondary)', border: '1px solid #6366f1', borderRadius: '3px', color: 'var(--text-primary)', fontSize: '0.6rem', padding: '2px 4px', cursor: 'pointer' }}>▼</button>
                              </div>
                              <button type="button" className="btn-save-inline" onClick={() => handleSaveField(envName, 'expected_version')}>Save</button>
                              <button type="button" className="btn-cancel-inline" onClick={() => setEditingKey(null)}>X</button>
                            </div>
                          ) : (
                            <div className="env-editable-field">
                              <span className="field-display" style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{record.expected_version}</span>
                              <button type="button" className="btn-edit-inline" onClick={() => handleStartEdit(envName, 'expected_version', record.expected_version)}>✎</button>
                            </div>
                          )}
                        </div>

                        {/* CMDB Name */}
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.3rem' }}>CMDB Name</div>
                          {isEditingCmdb ? (
                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                className="env-field-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                style={{ flex: 1, padding: '0.3rem' }}
                              />
                              <button type="button" className="btn-save-inline" onClick={() => handleSaveField(envName, 'cmdb_name')}>Save</button>
                              <button type="button" className="btn-cancel-inline" onClick={() => setEditingKey(null)}>X</button>
                            </div>
                          ) : (
                            <div className="env-editable-field">
                              <span className="field-display" style={{ fontSize: '0.83rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{record.cmdb_name || '—'}</span>
                              <button type="button" className="btn-edit-inline" onClick={() => handleStartEdit(envName, 'cmdb_name', record.cmdb_name || '')}>✎</button>
                            </div>
                          )}
                        </div>

                        {/* Expected Requirements */}
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.3rem' }}>Expected Requirements</div>
                          {isEditingReqs ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                              <textarea
                                className="env-field-textarea"
                                rows="2"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                              />
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button type="button" className="btn-save-inline" onClick={() => handleSaveField(envName, 'expected_requirements')}>Save</button>
                                <button type="button" className="btn-cancel-inline" onClick={() => setEditingKey(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="env-editable-field" style={{ flexWrap: 'wrap' }}>
                              <div className="field-display" style={{ flex: 1, lineHeight: '1.6' }}>
                                {(record.expected_requirements || []).length > 0 ? (
                                  record.expected_requirements.map((req) => (
                                    <span key={req} style={{ display: 'inline-block', background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.7rem', margin: '0.1rem' }}>
                                      {req}
                                    </span>
                                  ))
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                )}
                              </div>
                              <button type="button" className="btn-edit-inline" onClick={() => handleStartEdit(envName, 'expected_requirements', (record.expected_requirements || []).join(', '))}>✎</button>
                            </div>
                          )}
                        </div>

                        {/* Premium Simulation Triggers */}
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="ai-action-btn"
                            onClick={() => handleSimulateDrift(envName, record)}
                            style={{ flex: 1, fontSize: '0.68rem', padding: '0.25rem 0.5rem', justifyContent: 'center' }}
                            title="Run drift detection algorithm"
                          >
                            🔍 Drift
                          </button>
                          <button
                            type="button"
                            className="ai-action-btn"
                            onClick={() => handleSimulateHygiene(envName, record)}
                            style={{ flex: 1, fontSize: '0.68rem', padding: '0.25rem 0.5rem', justifyContent: 'center' }}
                            title="Scan records CMDB consistency hygiene"
                          >
                            🧼 Hygiene
                          </button>
                          <button
                            type="button"
                            className="ai-action-btn"
                            onClick={() => handleVerifyReadiness(envName)}
                            style={{ flex: 1, fontSize: '0.68rem', padding: '0.25rem 0.5rem', justifyContent: 'center' }}
                            title="Check readiness status"
                          >
                            ✓ Ready
                          </button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Simulation Result Console logs */}
              {actionResult && (
                <div style={{ ...actionResult.style, marginTop: '1.25rem', padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--border-color)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {actionResult.text}
                  {actionResult.type === 'hygiene' && actionResult.proposedAction && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <pre style={{ margin: '0.5rem 0 0', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', color: '#ffc010' }}>
                        {JSON.stringify(actionResult.proposedAction, null, 2)}
                      </pre>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleApplyHygieneFix(actionResult.text.split(' ')[3].split('\n')[0].toLowerCase(), actionResult.proposedAction.update_cmdb_name_to)}
                        style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '4px 10px' }}
                      >
                        Apply Fix
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Next navigation Stage CTA */}
              {demandEnvs.length > 0 && (
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => navigate('/build-deploy')} style={{ padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'var(--color-brand)', color: 'var(--text-primary)', boxShadow: '0 2px 4px rgba(99,102,241,0.2)' }}>
                    Next: Build & Deploy &nbsp;&rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
