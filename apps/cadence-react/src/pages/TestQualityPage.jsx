import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { getDemands } from '../api/demandsApi';
import {
  getConsolidated,
  getQualityGate,
  saveQualityGate,
  saveTestGeneration,
  saveTestData,
  saveTestExecution,
  saveSecurityTesting,
  saveTraceability
} from '../api/testQualityApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';

export default function TestQualityPage() {
  const { selectedDemandId, selectDemand, addToast } = useAppContext();
  const { confirm } = useConfirmDialog();

  const [demands, setDemands] = useState([]);
  const [selectedDemandKey, setSelectedDemandKey] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sub-tabs: 'dashboard' | 'generation' | 'data' | 'execution' | 'triage' | 'security' | 'traceability' | 'gate'
  const [activeSubTab, setActiveSubTab] = useState('dashboard');

  // Relational data states
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [testData, setTestData] = useState(null);
  const [testRun, setTestRun] = useState(null);
  const [defects, setDefects] = useState([]);
  const [securityScan, setSecurityScan] = useState(null);
  const [traceability, setTraceability] = useState(null);
  const [qualityGate, setQualityGate] = useState(null);

  // Form states
  const [storyIdsInput, setStoryIdsInput] = useState('');
  const [syntheticRecordCount, setSyntheticRecordCount] = useState(100);
  const [securityScanType, setSecurityScanType] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dList = await getDemands();
      setDemands(dList || []);

      const activeDemandId = sessionStorage.getItem('selectedDemandId') || (dList && dList[0]?.demand_id);
      if (activeDemandId) {
        setSelectedDemandKey(activeDemandId);
        await loadConsolidatedState(activeDemandId);
      }
    } catch (err) {
      setError(err.message || 'Failed to load test quality data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConsolidatedState = async (demandId) => {
    try {
      const data = await getConsolidated(demandId);
      setConsolidatedData(data);
      setTestCases(data.test_generation?.test_cases || []);
      setTestData(data.test_data);
      setTestRun(data.test_execution);
      setDefects(data.defect_triage?.defects || []);
      setSecurityScan(data.security_testing);
      setTraceability(data.traceability);
      setQualityGate(data.quality_gate);
    } catch (err) {
      console.error('Failed to load consolidated quality data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateTestSuite = async () => {
    setActionLoading(true);
    try {
      const storyIds = storyIdsInput.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch(`/api/test-quality/test-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: selectedDemandKey,
          plan_id: `PLN-${selectedDemandKey.split('-').pop()}-1`,
          story_ids: storyIds
        })
      });
      if (!res.ok) throw new Error('Test generation failed.');
      addToast('AI test suite generated.', 'success');
      await loadConsolidatedState(selectedDemandKey);
      setActiveSubTab('generation');
    } catch (err) {
      addToast(err.message || 'Failed to generate tests.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProvisionData = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/test-quality/test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: selectedDemandKey,
          target_records: syntheticRecordCount,
          fields: ['id', 'name', 'email', 'amount', 'timestamp']
        })
      });
      if (!res.ok) throw new Error('Test data provisioning failed.');
      addToast('Synthetic test data provisioned.', 'success');
      await loadConsolidatedState(selectedDemandKey);
    } catch (err) {
      addToast(err.message || 'Failed to provision data.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteTests = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/test-quality/test-execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: selectedDemandKey,
          environment: 'test'
        })
      });
      if (!res.ok) throw new Error('Test execution failed.');
      addToast('Automated test suite execution completed.', 'success');
      await loadConsolidatedState(selectedDemandKey);
    } catch (err) {
      addToast(err.message || 'Failed to execute tests.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunSecurityScan = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/test-quality/security-testing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_id: selectedDemandKey,
          scan_type: securityScanType
        })
      });
      if (!res.ok) throw new Error('Security testing failed.');
      addToast('OWASP vulnerability security scan completed.', 'success');
      await loadConsolidatedState(selectedDemandKey);
    } catch (err) {
      addToast(err.message || 'Failed to run scan.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvaluateQualityGate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/test-quality/quality-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_id: selectedDemandKey })
      });
      if (!res.ok) throw new Error('Quality gate evaluation failed.');
      addToast('Quality Gate evaluated.', 'success');
      await loadConsolidatedState(selectedDemandKey);
    } catch (err) {
      addToast(err.message || 'Failed to evaluate Quality Gate.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverrideQualityGate = async (verdict) => {
    confirm({
      title: 'Override Quality Gate',
      message: `Are you sure you want to force override the Quality Gate status to ${verdict}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await saveQualityGate(selectedDemandKey, {
            verdict: verdict,
            override_applied: true,
            override_reason: 'Forced manual sign-off by Quality Director override.'
          });
          addToast(`Quality Gate overridden to ${verdict}.`, 'success');
          await loadConsolidatedState(selectedDemandKey);
        } catch (err) {
          addToast(err.message || 'Failed to apply override.', 'error');
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
          loadConsolidatedState(id);
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
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Test &amp; Quality Governance</h2>
          <div>
            <ProjectDropdown
              demands={demands}
              selectedId={selectedDemandKey}
              onChange={(val) => {
                setSelectedDemandKey(val);
                selectDemand(val);
                loadConsolidatedState(val);
              }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div className="tabs-container" style={{ marginBottom: '1.5rem' }}>
            <button className={`tab-btn${activeSubTab === 'dashboard' ? ' active' : ''}`} onClick={() => setActiveSubTab('dashboard')}>Dashboard</button>
            <button className={`tab-btn${activeSubTab === 'generation' ? ' active' : ''}`} onClick={() => setActiveSubTab('generation')}>AI Test Suite</button>
            <button className={`tab-btn${activeSubTab === 'data' ? ' active' : ''}`} onClick={() => setActiveSubTab('data')}>Synthetic Data</button>
            <button className={`tab-btn${activeSubTab === 'execution' ? ' active' : ''}`} onClick={() => setActiveSubTab('execution')}>Test Runs</button>
            <button className={`tab-btn${activeSubTab === 'security' ? ' active' : ''}`} onClick={() => setActiveSubTab('security')}>Security Scan</button>
            <button className={`tab-btn${activeSubTab === 'gate' ? ' active' : ''}`} onClick={() => setActiveSubTab('gate')}>Quality Gate</button>
          </div>

          {activeSubTab === 'dashboard' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Quality Metrics Dashboard</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TEST CASES</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{testCases.length}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PASS RATE</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-status-green-text)' }}>
                    {testRun ? `${testRun.pass_rate}%` : '—'}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OPEN DEFECTS</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: defects.length > 0 ? 'var(--color-status-red-text)' : 'var(--text-muted)' }}>
                    {defects.length}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>QUALITY GATE</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: qualityGate?.verdict === 'PASS' ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)', textTransform: 'uppercase' }}>
                    {qualityGate?.verdict || 'PENDING'}
                  </div>
                </div>
              </div>

              {defects.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Open Triage Defects</h4>
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Title</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Severity</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Triage Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defects.map((def, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{def.defect_id}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>{def.title}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span className={`badge ${def.severity === 'P1' ? 'red' : 'amber'}`}>{def.severity}</span>
                          </td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{def.assigned_to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'generation' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>AI Test Case Generation</h3>
              
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Story User IDs (Comma-separated)</label>
                <input
                  type="text"
                  value={storyIdsInput}
                  onChange={(e) => setStoryIdsInput(e.target.value)}
                  placeholder="e.g. US-101, US-102"
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGenerateTestSuite}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Spinner size="sm" /> : 'Generate Test Suite (AI)'}
                </button>
              </div>

              {testCases.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Generated Test Cases</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {testCases.map((tc, idx) => (
                      <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--color-brand)' }}>{tc.test_id}</span>
                          <span className={`badge ${tc.priority === 'Critical' ? 'red' : 'gray'}`}>{tc.priority}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{tc.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tc.expected}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'data' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Synthetic Test Data Provisioner</h3>
              
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Target Synthetic Records Count</label>
                <input
                  type="number"
                  value={syntheticRecordCount}
                  onChange={(e) => setSyntheticRecordCount(parseInt(e.target.value))}
                />
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleProvisionData}
                disabled={actionLoading}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Provision Test Data'}
              </button>

              {testData && (
                <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--color-brand)', marginBottom: '0.5rem' }}>Provisioned Datasets</div>
                  <div>Records Created: {testData.target_records}</div>
                  <div>Fields: {testData.fields?.join(', ')}</div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'execution' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Automated Test Runs</h3>
              
              <button
                type="button"
                className="btn-primary"
                onClick={handleExecuteTests}
                disabled={actionLoading}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Run Automated Tests'}
              </button>

              {testRun && (
                <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Execution Run Result Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
                    <div><b>Total Runs:</b> {testRun.total_tests_run}</div>
                    <div><b>Passed:</b> {testRun.passed_count}</div>
                    <div><b>Failed:</b> {testRun.failed_count}</div>
                    <div style={{ gridColumn: 'span 3', color: 'var(--color-status-green-text)', fontWeight: 600, fontSize: '1rem', marginTop: '0.5rem' }}>
                      Pass Rate: {testRun.pass_rate}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'security' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>OWASP Security Testing</h3>
              
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Security Vulnerability Scan Type</label>
                <select value={securityScanType} onChange={(e) => setSecurityScanType(e.target.value)}>
                  <option value="all">Full OWASP Top 10 Scan</option>
                  <option value="sqli">SQL Injection Vulnerabilities</option>
                  <option value="xss">Cross-Site Scripting (XSS)</option>
                  <option value="secrets">Exposed Secrets / API Keys</option>
                </select>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleRunSecurityScan}
                disabled={actionLoading}
              >
                {actionLoading ? <Spinner size="sm" /> : 'Run Security Scan'}
              </button>

              {securityScan && (
                <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Security Vulnerabilities Detected</h4>
                  {securityScan.findings?.length === 0 ? (
                    <div style={{ color: 'var(--color-status-green-text)' }}>✓ Clean build. No security vulnerabilities detected.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--color-status-red-text)' }}>
                      {securityScan.findings?.map((f, idx) => (
                        <li key={idx} style={{ marginBottom: '0.25rem' }}><b>[{f.severity}]</b> {f.vulnerability_type}: {f.description}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'gate' && (
            <div className="panel-card">
              <h3 style={{ margin: '0 0 1rem 0' }}>Quality Gate Evaluation</h3>
              
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleEvaluateQualityGate}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Spinner size="sm" /> : 'Evaluate Quality Gate'}
                </button>
              </div>

              {qualityGate && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Quality Gate Audit Report</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                    <div><b>Verdict Status:</b> <span style={{ fontWeight: 'bold', color: qualityGate.verdict === 'PASS' ? 'var(--color-status-green-text)' : 'var(--color-status-red-text)', textTransform: 'uppercase' }}>{qualityGate.verdict}</span></div>
                    <div><b>Override Active:</b> {qualityGate.override_applied ? 'Yes' : 'No'}</div>
                    {qualityGate.override_reason && (
                      <div style={{ gridColumn: 'span 2' }}><b>Override Note:</b> {qualityGate.override_reason}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleOverrideQualityGate('PASS')}
                      style={{ background: 'var(--color-status-green-border)', border: 'none' }}
                    >
                      Override to PASS
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleOverrideQualityGate('FAIL')}
                      style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}
                    >
                      Override to FAIL
                    </button>
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
