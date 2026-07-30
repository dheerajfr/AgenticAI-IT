import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getDemands } from '../api/demandsApi';
import { getEnvironments } from '../api/environmentsApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function ConfigEnvironmentsPage() {
  const navigate = useNavigate();
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm, DialogComponent } = useConfirmDialog();

  const [environments, setEnvironments] = useState([]);
  const [demands, setDemands] = useState([]);
  const [selectedDemandEnvId, setSelectedDemandEnvId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Edit states for environment fields
  const [editingEnvKey, setEditingEnvKey] = useState(null); // 'dev' | 'test' | 'staging' | 'prod'
  const [editExpectedVersion, setEditExpectedVersion] = useState('');
  const [editDeployedVersion, setEditDeployedVersion] = useState('');
  const [editCmdbName, setEditCmdbName] = useState('');
  const [editRequirementsText, setEditRequirementsText] = useState('');



  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dList, eList] = await Promise.all([getDemands(), getEnvironments()]);
      setDemands(dList || []);
      setEnvironments(eList || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId');
      if (activeDemandId) {
        setSelectedDemandEnvId(activeDemandId);
      } else if (eList && eList.length > 0) {
        setSelectedDemandEnvId(eList[0].demand_id);
      } else if (dList && dList.length > 0) {
        setSelectedDemandEnvId(dList[0].demand_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load environments data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSeed = async (demandId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/environments/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_id: demandId })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Seed failed.' }));
        throw new Error(err.detail || 'Seeding failed.');
      }
      addToast('AI configuration baseline seeded successfully.', 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to seed environments.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReconcileDrift = async (envRecord) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/environments/reconcile-drift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: envRecord.demand_id,
          environment: envRecord.environment,
          deployed_version: envRecord.expected_version, // Set to expected to fix drift
          expected_version: envRecord.expected_version
        })
      });
      if (!res.ok) throw new Error('Reconciliation failed.');
      addToast(`Configuration for ${envRecord.environment} reconciled successfully.`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to reconcile drift.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const startEdit = (env) => {
    setEditingEnvKey(env.environment);
    setEditExpectedVersion(env.expected_version || '');
    setEditDeployedVersion(env.deployed_version || '');
    setEditCmdbName(env.cmdb_name || '');
    setEditRequirementsText(env.expected_requirements?.join('\n') || '');
  };

  const handleSaveEdit = async (envName) => {
    setActionLoading(true);
    try {
      const payload = {
        expected_version: editExpectedVersion,
        deployed_version: editDeployedVersion,
        cmdb_name: editCmdbName,
        expected_requirements: editRequirementsText.split('\n').map(r => r.trim()).filter(Boolean)
      };
      const res = await fetch(`/api/environments/${encodeURIComponent(selectedDemandEnvId)}/${encodeURIComponent(envName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save changes.');
      addToast(`${envName.toUpperCase()} environment updated.`, 'success');
      setEditingEnvKey(null);
      await loadData();
    } catch (err) {
      addToast(err.message || 'Failed to update environment.', 'error');
    } finally {
      setActionLoading(false);
    }
  };



  const handleDeleteAllRecords = async (demandId) => {
    const ok = await confirm(
      'Delete Environment Records',
      `Are you sure you want to delete all configuration records for ${demandId}? This cannot be undone.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/environments/${encodeURIComponent(demandId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed.');
      addToast(`Configuration records deleted for ${demandId}.`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to delete records.', 'error');
    }
  };

  const activeDemandEnvs = environments.filter(e => e.demand_id === selectedDemandEnvId);
  const activeDemandObj = demands.find(d => d.demand_id === selectedDemandEnvId);

  // Group environments by demand_id for sidebar
  const uniqueDemandEnvs = [...new Set(environments.map(e => e.demand_id))].map(id => {
    const dem = demands.find(d => d.demand_id === id);
    const hasDrift = environments.some(e => e.demand_id === id && e.drift_status !== 'in-sync');
    const count = environments.filter(e => e.demand_id === id).length;
    return {
      demand_id: id,
      title: dem ? dem.title : id,
      status: hasDrift ? 'drifted' : 'in-sync',
      envCount: count
    };
  });

  return (
    <div className="intake-screen">
      {DialogComponent}
      <ProjectSidebar
        items={uniqueDemandEnvs}
        selectedId={selectedDemandEnvId}
        onSelect={(id) => {
          setSelectedDemandEnvId(id);
          selectDemand(id);
        }}
        onDelete={handleDeleteAllRecords}
        idKey="demand_id"
        titleKey="title"
        subtitleKey={(item) => `${item.envCount} environments`}
        statusKey="status"
        loading={loading}
        error={error}
        emptyMessage="No environment records yet. Generate sample data."
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Config &amp; Environments</h2>
          <div>
            <ProjectDropdown
              demands={demands}
              selectedId={selectedDemandEnvId}
              onChange={(val) => {
                setSelectedDemandEnvId(val);
                selectDemand(val);
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {selectedDemandEnvId && activeDemandEnvs.length === 0 && (
            <div className="panel-card" style={{ textAlign: 'center', maxWidth: 500, margin: '2rem auto' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🛠</div>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>No Environment Records</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Click below to let the AI analyze this project demand and automatically generate the 4 standard deployment environments (Dev, Test, Staging, Prod).
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleSeed(selectedDemandEnvId)}
                disabled={actionLoading}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Generate Environments Baseline (AI)'}
              </button>
            </div>
          )}

          {activeDemandEnvs.length > 0 && (
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedDemandEnvId}</span>
                  <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                    {activeDemandObj ? activeDemandObj.title : 'Project Environments'}
                  </h3>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {activeDemandEnvs.map((env) => {
                  const isDrifted = env.drift_status !== 'in-sync';
                  const isEditing = editingEnvKey === env.environment;
                  return (
                    <div key={env.environment} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.9rem' }}>{env.environment} Environment</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {!isEditing && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => startEdit(env)}
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, height: 'auto', minHeight: 'unset' }}
                            >
                              ✎ Edit
                            </button>
                          )}
                          <StatusPill status={isDrifted ? 'red' : 'green'} label={env.drift_status} />
                        </div>
                      </div>

                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Expected Version</label>
                            <input type="text" value={editExpectedVersion} onChange={(e) => setEditExpectedVersion(e.target.value)} style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>CMDB Name</label>
                            <input type="text" value={editCmdbName} onChange={(e) => setEditCmdbName(e.target.value)} style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Baseline Requirements (one per line)</label>
                            <textarea value={editRequirementsText} onChange={(e) => setEditRequirementsText(e.target.value)} style={{ minHeight: 60, padding: '0.3rem', fontSize: '0.8rem' }} />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleSaveEdit(env.environment)}
                              disabled={actionLoading}
                              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                            >
                              {actionLoading ? <Spinner size="sm" /> : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setEditingEnvKey(null)}
                              disabled={actionLoading}
                              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            <div style={{ gridColumn: 'span 2' }}><b>Expected Version:</b> {env.expected_version}</div>
                            <div style={{ gridColumn: 'span 2' }}><b>CMDB Name:</b> {env.cmdb_name || '—'}</div>
                          </div>

                          <div style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                            <b>Baseline Requirements:</b>
                            <ul style={{ margin: '0.2rem 0 0 0', paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                              {env.expected_requirements?.map((r, idx) => <li key={idx}>{r}</li>)}
                            </ul>
                          </div>

                          {isDrifted && (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleReconcileDrift(env)}
                              disabled={actionLoading}
                              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                            >
                              {actionLoading ? <Spinner size="sm" /> : 'Reconcile Drift'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    sessionStorage.setItem('pendingDeployDemandId', selectedDemandEnvId);
                    navigate('/build-deploy');
                  }}
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 700 }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                  Next: Build &amp; Deploy &nbsp;→
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
