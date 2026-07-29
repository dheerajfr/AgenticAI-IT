import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { testQualityService } from '../services/testQualityService';
import { demandService } from '../services/demandService';
import { configService } from '../services/configService';
import StatusPill from '../components/common/StatusPill';

export default function TestQuality() {
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Core Data Lists
  const [demands, setDemands] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);
  const [activeTab, setActiveTab] = useState('generation'); // 'dashboard' | 'generation' | 'execution' | 'triage' | 'security' | 'traceability' | 'quality-gate'

  // Sidebar filter
  const [searchTerm, setSearchTerm] = useState('');

  // Hydrated State objects for selected project/demand
  const [dashboardStats, setDashboardStats] = useState(null);
  const [deliveryContext, setDeliveryContext] = useState(null);
  const [generatedSuite, setGeneratedSuite] = useState(null);
  const [testDataProvision, setTestDataProvision] = useState(null);
  const [testRun, setTestRun] = useState(null);
  const [defectTriageState, setDefectTriageState] = useState(null);
  const [securityScanState, setSecurityScanState] = useState(null);
  const [traceabilityMatrixState, setTraceabilityMatrixState] = useState(null);
  const [qualityGateState, setQualityGateState] = useState(null);

  // Form states: Test Generation
  const [genCoverageDepth, setGenCoverageDepth] = useState('regression');
  const [genOptions, setGenOptions] = useState({
    performance: true,
    boundary: true,
    mockData: true,
    security: false
  });

  // Form states: Test Execution
  const [execEnvironment, setExecEnvironment] = useState('staging');

  // Form states: Mock Defect creation
  const [defectTitle, setDefectTitle] = useState('');
  const [defectSeverity, setDefectSeverity] = useState('medium');

  const loadData = async () => {
    try {
      const [demandList, envList] = await Promise.all([
        demandService.getDemands().catch(() => []),
        configService.getEnvironments().catch(() => [])
      ]);
      setDemands(demandList || []);
      setEnvironments(envList || []);

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

  // Hydrate full state when selectedDemandId changes
  const loadProjectDetails = async (id) => {
    if (!id) return;
    try {
      // Load consolidated state
      const consolidated = await testQualityService.getConsolidated(id).catch(() => null);
      const stats = await testQualityService.getDashboardStats(id).catch(() => null);
      const deliveryCtx = await testQualityService.getDeliveryContext(id).catch(() => null);

      setDashboardStats(stats);
      setDeliveryContext(deliveryCtx);

      if (consolidated) {
        setGeneratedSuite(consolidated.test_generation || null);
        setTestDataProvision(consolidated.test_data || null);
        setTestRun(consolidated.test_execution || null);
        setDefectTriageState(consolidated.defect_triage || null);
        setSecurityScanState(consolidated.security_testing || null);
        setTraceabilityMatrixState(consolidated.traceability || null);
        setQualityGateState(consolidated.quality_gate || null);

        // If a test suite exists, open dashboard by default, else open test generation
        if (consolidated.test_generation) {
          setActiveTab('dashboard');
        } else {
          setActiveTab('generation');
        }
      }
    } catch (e) {
      console.error("Failed to load project details", e);
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadProjectDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    if (id === 'new') {
      setSelectedDemandId(null);
      navigate('/demand-intake');
    } else {
      setSelectedDemandId(id);
      sessionStorage.setItem('selectedDemandId', id);
    }
  };

  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const getTargetComponents = () => {
    const related = environments.filter((e) => e.demand_id === selectedDemandId);
    return [...new Set(related.map((r) => r.cmdb_name || r.observed_name))].filter(Boolean);
  };

  // AI Test Generation
  const handleGenerateTests = async () => {
    if (!selectedDemandId) return;
    const comps = getTargetComponents();
    showLoader('✦ Generative AI creating test suite...');
    try {
      await testQualityService.generateTests({
        demand_id: selectedDemandId,
        component_id: comps[0] || selectedDemandId,
        coverage_depth: genCoverageDepth,
        include_performance: genOptions.performance,
        include_boundary: genOptions.boundary,
        generate_mock_data: genOptions.mockData,
        include_security: genOptions.security
      });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Test cases generated successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Execute Tests Run
  const handleExecuteTestSuite = async () => {
    if (!selectedDemandId) return;
    showLoader('🤖 Running automated test suites...');
    try {
      await testQualityService.executeTests({
        demand_id: selectedDemandId,
        environment: execEnvironment
      });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Automated test run completed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Defect triage trigger
  const handleTriggerDefectTriage = async () => {
    if (!selectedDemandId) return;
    showLoader('🔍 AI scanning duplicate defect tickets...');
    try {
      await testQualityService.defectTriage({ demand_id: selectedDemandId });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Defect de-duplication triage complete');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Create manual mockup defect
  const handleCreateMockDefect = async (e) => {
    e.preventDefault();
    if (!defectTitle) return;
    showLoader('Logging defect...');
    try {
      const mockId = `DEF-${Math.floor(1000 + Math.random() * 9000)}`;
      await testQualityService.createDefect(selectedDemandId, mockId, {
        defect_id: mockId,
        title: defectTitle,
        severity: defectSeverity,
        status: 'open',
        description: 'Mocked defect logged by user'
      });
      setDefectTitle('');
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Mock defect registered');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Close defect
  const handleCloseDefectTicket = async (defectId) => {
    showLoader('Closing defect...');
    try {
      await testQualityService.closeDefect(selectedDemandId, defectId, { status: 'closed' });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Defect closed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Trigger Security Testing Scan
  const handleTriggerSecurityScan = async () => {
    if (!selectedDemandId) return;
    showLoader('⚡ Running SAST & container scans...');
    try {
      await testQualityService.runSecurityTesting({ demand_id: selectedDemandId });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Security scanning completed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Trigger Traceability Matrix Verification
  const handleTriggerTraceabilityScan = async () => {
    if (!selectedDemandId) return;
    showLoader('🔗 Mapping test traceability...');
    try {
      await testQualityService.runTraceability({ demand_id: selectedDemandId });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Traceability matrix mapped');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Evaluate Quality Gate baseline status
  const handleEvaluateQualityGate = async () => {
    if (!selectedDemandId) return;
    showLoader('⚖ Evaluating Quality Gate status...');
    try {
      await testQualityService.runQualityGate({ demand_id: selectedDemandId });
      await loadProjectDetails(selectedDemandId);
      showToast('✓ Quality gate evaluated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const demand = demands.find((d) => d.demand_id === selectedDemandId);

  return (
    <div className="intake-screen">
      {/* Sidebar listings */}
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
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Test &amp; Quality QA</h2>
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

        <div className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          {!selectedDemandId ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a project from the left sidebar or the dropdown list to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Tabs selector */}
              <div className="tq-tab-header" style={{ flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button className={`tq-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
                <button className={`tq-tab-btn ${activeTab === 'generation' ? 'active' : ''}`} onClick={() => setActiveTab('generation')}>Test Generation</button>
                <button className={`tq-tab-btn ${activeTab === 'execution' ? 'active' : ''}`} onClick={() => setActiveTab('execution')}>Test Execution</button>
                <button className={`tq-tab-btn ${activeTab === 'triage' ? 'active' : ''}`} onClick={() => setActiveTab('triage')}>Defect Triage</button>
                <button className={`tq-tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security Testing</button>
                <button className={`tq-tab-btn ${activeTab === 'traceability' ? 'active' : ''}`} onClick={() => setActiveTab('traceability')}>Traceability</button>
                <button className={`tq-tab-btn ${activeTab === 'quality-gate' ? 'active' : ''}`} onClick={() => setActiveTab('quality-gate')}>Quality Gate</button>
              </div>

              <div style={{ flex: 1 }}>
                
                {/* DASHBOARD TAB */}
                {activeTab === 'dashboard' && dashboardStats && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Test Cases</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.5rem 0' }}>{dashboardStats.total_test_cases}</div>
                        <div style={{ fontSize: '0.75rem', color: '#818cf8' }}>✓ All active in suite</div>
                      </div>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Test Pass Rate</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80', margin: '0.5rem 0' }}>{dashboardStats.pass_rate_pct}%</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dashboardStats.passed_tests} / {dashboardStats.executed_tests} passed</div>
                      </div>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Open Defects</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f87171', margin: '0.5rem 0' }}>{dashboardStats.open_defects}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dashboardStats.closed_defects} resolved / closed</div>
                      </div>
                      <div className="tq-card">
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Quality Gate Status</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: dashboardStats.quality_gate_status === 'PASS' ? '#4ade80' : '#ef4444', margin: '0.65rem 0' }}>{dashboardStats.quality_gate_status}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Score: {dashboardStats.quality_score} / 100</div>
                      </div>
                    </div>

                    <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', background: dashboardStats.quality_gate_status === 'PASS' ? 'rgba(74, 222, 128, 0.08)' : 'rgba(239, 68, 68, 0.08)', border: `1px solid ${dashboardStats.quality_gate_status === 'PASS' ? '#4ade80' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>
                          {dashboardStats.quality_gate_status === 'PASS' ? '✓ RELEASE STATUS: APPROVED' : '✗ RELEASE STATUS: BLOCKED'}
                        </h4>
                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {dashboardStats.quality_gate_status === 'PASS' ? 'All gate verification criteria met successfully. Ready for deployment.' : 'Critical defects or security issues are blocking release. Check detailed audit results.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TEST GENERATION TAB */}
                {activeTab === 'generation' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="tq-card">
                      <h4 className="tq-card-title">Configure AI Test Suite Parameters</h4>
                      <div className="grid-2col">
                        <div className="tq-form-group">
                          <label>Coverage Depth</label>
                          <select value={genCoverageDepth} onChange={(e) => setGenCoverageDepth(e.target.value)}>
                            <option value="smoke">Smoke Suite</option>
                            <option value="regression">Full Regression</option>
                            <option value="boundary">Boundary &amp; Edge Cases</option>
                          </select>
                        </div>
                        <div className="tq-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <label style={{ fontSize: '0.75rem' }}>Generation Inclusions</label>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                            <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={genOptions.performance} onChange={(e) => setGenOptions({ ...genOptions, performance: e.target.checked })} /> Performance
                            </label>
                            <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={genOptions.boundary} onChange={(e) => setGenOptions({ ...genOptions, boundary: e.target.checked })} /> Boundary Checks
                            </label>
                            <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={genOptions.mockData} onChange={(e) => setGenOptions({ ...genOptions, mockData: e.target.checked })} /> Provision Mock Data
                            </label>
                          </div>
                        </div>
                      </div>
                      <button onClick={handleGenerateTests} className="btn-primary" style={{ marginTop: '1rem' }}>
                        ✦ Generate Test Cases (AI)
                      </button>
                    </div>

                    {generatedSuite && generatedSuite.test_cases && (
                      <div className="tq-card">
                        <h4 className="tq-card-title">Active Test Suite ({generatedSuite.test_cases.length} cases)</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.5rem' }}>ID</th>
                              <th style={{ padding: '0.5rem' }}>Title</th>
                              <th style={{ padding: '0.5rem' }}>Priority</th>
                              <th style={{ padding: '0.5rem' }}>Type</th>
                              <th style={{ padding: '0.5rem' }}>Expected Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedSuite.test_cases.map((tc) => (
                              <tr key={tc.case_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{tc.case_id}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{tc.title}</td>
                                <td style={{ padding: '0.5rem', textTransform: 'uppercase' }}>{tc.priority}</td>
                                <td style={{ padding: '0.5rem' }}>{tc.type}</td>
                                <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{tc.expected_result}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TEST EXECUTION TAB */}
                {activeTab === 'execution' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="tq-card">
                      <h4 className="tq-card-title">Trigger Automated Test Suite Execution</h4>
                      <div className="tq-form-group">
                        <label>Execution Target Environment</label>
                        <select value={execEnvironment} onChange={(e) => setExecEnvironment(e.target.value)}>
                          <option value="dev">dev</option>
                          <option value="test">test</option>
                          <option value="staging">staging</option>
                          <option value="prod">prod</option>
                        </select>
                      </div>
                      <button onClick={handleExecuteTestSuite} className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={!generatedSuite}>
                        Execute Test Suite
                      </button>
                    </div>

                    {testRun && testRun.executions && (
                      <div className="tq-card">
                        <h4 className="tq-card-title">Test Run Executions</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.5rem' }}>ID</th>
                              <th style={{ padding: '0.5rem' }}>Component</th>
                              <th style={{ padding: '0.5rem' }}>Env</th>
                              <th style={{ padding: '0.5rem' }}>Result</th>
                              <th style={{ padding: '0.5rem' }}>Passed/Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {testRun.executions.map((ex, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{ex.test_run_id}</td>
                                <td style={{ padding: '0.5rem' }}>{ex.component_id}</td>
                                <td style={{ padding: '0.5rem' }}>{ex.environment}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 700, color: ex.status === 'pass' ? '#4ade80' : '#ef4444' }}>{ex.status.toUpperCase()}</td>
                                <td style={{ padding: '0.5rem' }}>{ex.passed_count} / {ex.total_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* DEFECT TRIAGE TAB */}
                {activeTab === 'triage' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={handleTriggerDefectTriage} className="btn-primary">
                        🔍 Scan &amp; De-duplicate Defects (AI)
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      {/* Active defects listing */}
                      <div className="tq-card">
                        <h4 className="tq-card-title">Logged Defects</h4>
                        {defectTriageState && defectTriageState.defects && defectTriageState.defects.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {defectTriageState.defects.map((def) => (
                              <div key={def.defect_id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{def.defect_id}: {def.title}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Severity: {def.severity.toUpperCase()} | Status: {def.status.toUpperCase()}</div>
                                </div>
                                {def.status !== 'closed' && (
                                  <button onClick={() => handleCloseDefectTicket(def.defect_id)} className="btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                                    Close
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No defects logged yet.</div>
                        )}
                      </div>

                      {/* Log custom mock defect */}
                      <div className="tq-card">
                        <h4 className="tq-card-title">Log New Defect Mockup</h4>
                        <form onSubmit={handleCreateMockDefect}>
                          <div className="tq-form-group">
                            <label>Defect Title</label>
                            <input type="text" value={defectTitle} onChange={(e) => setDefectTitle(e.target.value)} placeholder="e.g. Memory leak under high concurrency load" />
                          </div>
                          <div className="tq-form-group">
                            <label>Severity</label>
                            <select value={defectSeverity} onChange={(e) => setDefectSeverity(e.target.value)}>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                          <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                            Log Defect Record
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECURITY SCANNING TAB */}
                {activeTab === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="tq-card">
                      <h4 className="tq-card-title">Automated Application Security Testing (AST)</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Triggers code analysis rules &amp; container registry scanning tools across the baseline configurations.
                      </p>
                      <button onClick={handleTriggerSecurityScan} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                        Trigger AST Security Scan
                      </button>
                    </div>

                    {securityScanState && securityScanState.findings && (
                      <div className="tq-card">
                        <h4 className="tq-card-title">Security Scanning Findings</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.5rem' }}>ID</th>
                              <th style={{ padding: '0.5rem' }}>Vulnerability</th>
                              <th style={{ padding: '0.5rem' }}>Severity</th>
                              <th style={{ padding: '0.5rem' }}>CVE Reference</th>
                              <th style={{ padding: '0.5rem' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {securityScanState.findings.map((f, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{f.finding_id}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{f.title}</td>
                                <td style={{ padding: '0.5rem', textTransform: 'uppercase', color: f.severity === 'high' || f.severity === 'critical' ? '#ef4444' : 'var(--text-primary)' }}>{f.severity}</td>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{f.cve_reference || 'N/A'}</td>
                                <td style={{ padding: '0.5rem' }}>{f.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TRACEABILITY MATRIX TAB */}
                {activeTab === 'traceability' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="tq-card">
                      <h4 className="tq-card-title">AI Traceability Verification</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Verifies complete traceability coverage linking intake requirements to estimating shapes and final test suite cases.
                      </p>
                      <button onClick={handleTriggerTraceabilityScan} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                        Re-scan Traceability Matrix
                      </button>
                    </div>

                    {traceabilityMatrixState && traceabilityMatrixState.requirements_mapped && (
                      <div className="tq-card">
                        <h4 className="tq-card-title">Verification Traceability Matrix</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.5rem' }}>Requirement ID</th>
                              <th style={{ padding: '0.5rem' }}>Description</th>
                              <th style={{ padding: '0.5rem' }}>Mapped Test Cases</th>
                              <th style={{ padding: '0.5rem' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {traceabilityMatrixState.requirements_mapped.map((t, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{t.req_id}</td>
                                <td style={{ padding: '0.5rem' }}>{t.req_description}</td>
                                <td style={{ padding: '0.5rem' }}>{(t.test_case_ids || []).join(', ') || '—'}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 700, color: t.status === 'fully-covered' ? '#4ade80' : '#ef4444' }}>
                                  {t.status === 'fully-covered' ? 'VERIFIED' : 'UNCOVERED'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* QUALITY GATE TAB */}
                {activeTab === 'quality-gate' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="tq-card">
                      <h4 className="tq-card-title">Release Quality Gate Evaluation</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Evaluates security compliance, defect density ratios, and test suite pass levels to approve/block production deployments.
                      </p>
                      <button onClick={handleEvaluateQualityGate} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                        Evaluate Quality Gate
                      </button>
                    </div>

                    {qualityGateState && (
                      <div className="tq-card">
                        <h4 className="tq-card-title">Gate Evaluation Results</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '4px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gate Verdict</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: qualityGateState.status === 'PASS' ? '#4ade80' : '#ef4444', marginTop: '0.25rem' }}>
                              {qualityGateState.status}
                            </div>
                          </div>
                          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '4px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Aggregate Quality Score</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-brand)', marginTop: '0.25rem' }}>
                              {qualityGateState.score} / 100
                            </div>
                          </div>
                        </div>

                        {qualityGateState.checks && (
                          <div style={{ marginTop: '1.5rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Gating Checklist Rules</div>
                            {qualityGateState.checks.map((chk) => (
                              <div key={chk.name} style={{ display: 'flex', alignItems: 'center', justifyValue: 'space-between', padding: '0.5rem 0', borderBottom: '1px dashed var(--border-color)', fontSize: '0.82rem' }}>
                                <span>{chk.name.replace(/_/g, ' ').toUpperCase()}</span>
                                <span style={{ fontWeight: 700, color: chk.passed ? '#4ade80' : '#ef4444' }}>
                                  {chk.passed ? '✓ PASSED' : '✗ FAILED'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
