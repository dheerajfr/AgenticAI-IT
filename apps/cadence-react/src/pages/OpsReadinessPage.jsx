import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getDemands } from '../api/demandsApi';
import { getOpsReadiness, saveOpsReadiness, generateOpsReadiness } from '../api/opsReadinessApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function OpsReadinessPage() {
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm } = useConfirmDialog();

  const [demands, setDemands] = useState([]);
  const [selectedDemandKey, setSelectedDemandKey] = useState(null);
  
  const [opsRecord, setOpsRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sub-tabs: 'monitoring' | 'handover' | 'validation'
  const [activeSubTab, setActiveSubTab] = useState('validation');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dList = await getDemands();
      setDemands(dList || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId') || (dList && dList[0]?.demand_id);
      if (activeDemandId) {
        setSelectedDemandKey(activeDemandId);
        await fetchOpsDetails(activeDemandId);
      }
    } catch (err) {
      setError(err.message || 'Failed to load ops readiness data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOpsDetails = async (demandId) => {
    try {
      const data = await getOpsReadiness(demandId);
      setOpsRecord(data);
    } catch (err) {
      console.error('Failed to load ops readiness record:', err);
      setOpsRecord(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateReadiness = async (id) => {
    setActionLoading(true);
    try {
      await generateOpsReadiness(id);
      addToast('AI readiness validation & monitoring checkpoints initialized.', 'success');
      await fetchOpsDetails(id);
    } catch (err) {
      addToast(err.message || 'Failed to generate readiness.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChecklistToggle = async (itemKey, currentValue) => {
    if (!opsRecord) return;
    try {
      const updatedChecklist = {
        ...opsRecord.checklist_status,
        [itemKey]: !currentValue
      };
      
      const payload = {
        ...opsRecord,
        checklist_status: updatedChecklist
      };

      await saveOpsReadiness(selectedDemandKey, payload);
      setOpsRecord(payload);
      addToast('Readiness checklist item updated.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save checklist.', 'error');
    }
  };

  const handleDirectorSignOff = async (signOffStatus) => {
    if (!opsRecord) return;
    confirm({
      title: 'Director Handoff Sign-off',
      message: `Are you sure you want to set the formal director sign-off to ${signOffStatus}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const payload = {
            ...opsRecord,
            validation: {
              ...opsRecord.validation,
              director_sign_off: signOffStatus,
              overall_verdict: signOffStatus ? 'PASS' : 'FAIL',
              audit_notes: `Formal director sign-off decision recorded: ${signOffStatus ? 'Approved' : 'Rejected'}.`
            }
          };

          await saveOpsReadiness(selectedDemandKey, payload);
          setOpsRecord(payload);
          addToast('Formal handoff sign-off registered.', 'success');
        } catch (err) {
          addToast(err.message || 'Failed to save sign-off.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  return (
    <div className="intake-screen">
      <ProjectSidebar
        items={demands}
        selectedId={selectedDemandKey}
        onSelect={(id) => {
          setSelectedDemandKey(id);
          selectDemand(id);
          fetchOpsDetails(id);
        }}
        idKey="demand_id"
        titleKey="title"
        subtitleKey={(item) => `Type: ${item.type}`}
        statusKey="status"
        loading={loading}
        error={error}
      />

      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Operations Readiness Handoff</h2>
          <div>
            <ProjectDropdown
              demands={demands}
              selectedId={selectedDemandKey}
              onChange={(val) => {
                setSelectedDemandKey(val);
                selectDemand(val);
                fetchOpsDetails(val);
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {selectedDemandKey && !opsRecord && (
            <div className="panel-card" style={{ textAlign: 'center', maxWidth: 500, margin: '2rem auto' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>Initialize Ops Readiness Checks</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Initialize operations validation checks, runbook verifications, and monitoring telemetry benchmarks.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleGenerateReadiness(selectedDemandKey)}
                disabled={actionLoading}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Run Readiness Evaluation (AI)'}
              </button>
            </div>
          )}

          {opsRecord && (
            <div className="panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedDemandKey}</span>
                  <h3 style={{ margin: '0.2rem 0 0 0', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                    Production Launch Handoff Check
                  </h3>
                </div>
                <StatusPill status={opsRecord.validation?.overall_verdict === 'PASS' ? 'green' : 'amber'} label={opsRecord.validation?.overall_verdict || 'PENDING'} />
              </div>

              <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
                <button className={`tab-btn${activeSubTab === 'validation' ? ' active' : ''}`} onClick={() => setActiveSubTab('validation')}>Readiness Verdict</button>
                <button className={`tab-btn${activeSubTab === 'monitoring' ? ' active' : ''}`} onClick={() => setActiveSubTab('monitoring')}>Live Telemetry SLIs</button>
                <button className={`tab-btn${activeSubTab === 'handover' ? ' active' : ''}`} onClick={() => setActiveSubTab('handover')}>Runbooks &amp; Assets</button>
              </div>

              {activeSubTab === 'validation' && (
                <div>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Launch Verdict &amp; Handoff Sign-off</h4>
                  
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      <div><b>Director Sign-off Decision:</b> {opsRecord.validation?.director_sign_off ? 'APPROVED' : 'REJECTED / PENDING'}</div>
                      <div><b>Calculated Verdict:</b> {opsRecord.validation?.overall_verdict || 'FAIL'}</div>
                    </div>
                    {opsRecord.validation?.audit_notes && (
                      <div style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                        <b>Audit Notes:</b> "{opsRecord.validation.audit_notes}"
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleDirectorSignOff(true)}
                      disabled={actionLoading}
                      style={{ background: 'var(--color-status-green-border)', border: 'none' }}
                    >
                      ✓ Approve Go-Live
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleDirectorSignOff(false)}
                      disabled={actionLoading}
                      style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}
                    >
                      ✗ Decline Go-Live
                    </button>
                  </div>
                </div>
              )}

              {activeSubTab === 'monitoring' && (
                <div>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Live Telemetry &amp; SLI/SLO Metrics</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', textCenter: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HTTP ERROR RATE</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: opsRecord.monitoring_metrics?.error_rate < 1.0 ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)' }}>
                        {opsRecord.monitoring_metrics?.error_rate}%
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', textCenter: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>P99 LATENCY</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {opsRecord.monitoring_metrics?.latency_ms}ms
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', textCenter: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPU UTILIZATION</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {opsRecord.monitoring_metrics?.cpu_usage}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === 'handover' && (
                <div>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Assets &amp; Checklists Handoff</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {Object.entries(opsRecord.checklist_status || {}).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)' }}>
                        <span style={{ textTransform: 'capitalize', fontSize: '0.85rem', fontWeight: 600 }}>
                          {key.replace(/_/g, ' ')}
                        </span>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: val ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}>
                            {val ? 'Ready' : 'Pending / Action Required'}
                          </span>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleChecklistToggle(key, val)}
                            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                          >
                            Toggle Status
                          </button>
                        </div>
                      </div>
                    ))}
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
