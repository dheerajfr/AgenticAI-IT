import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { buildDeployService } from '../services/buildDeployService';
import { demandService } from '../services/demandService';
import { configService } from '../services/configService';
import StatusPill from '../components/common/StatusPill';

export default function BuildDeploy() {
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Core data lists
  const [runbooks, setRunbooks] = useState([]);
  const [cutoverSessions, setCutoverSessions] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [demands, setDemands] = useState([]);
  const [envRecords, setEnvRecords] = useState([]);

  // Selections
  const [activeTab, setActiveTab] = useState('runbooks'); // 'runbooks' | 'cutover' | 'orchestration'
  const [selectedDemandId, setSelectedDemandId] = useState(null);
  
  // Specific details selection IDs
  const [selectedRunbookId, setSelectedRunbookId] = useState(null);
  const [selectedCutoverId, setSelectedCutoverId] = useState(null);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Creation forms pre-fill & editable states
  const [isCreationMode, setIsCreationMode] = useState(false);
  const [formError, setFormError] = useState('');

  // Creation: Runbook Form States
  const [rbkDemandId, setRbkDemandId] = useState('');
  const [rbkComponentId, setRbkComponentId] = useState('');
  const [rbkChangeSummary, setRbkChangeSummary] = useState('');
  const [rbkArchNotes, setRbkArchNotes] = useState('');
  const [rbkEnvironment, setRbkEnvironment] = useState('prod');
  const [rbkPriorId, setRbkPriorId] = useState('');
  const [rbkChangeRef, setRbkChangeRef] = useState('');
  const [rbkStep2Visible, setRbkStep2Visible] = useState(false);
  const [relatedComponents, setRelatedComponents] = useState([]);

  // Editing: Runbook SME Review mode
  const [smeEditOpen, setSmeEditOpen] = useState(false);
  const [smeEditTitle, setSmeEditTitle] = useState('');
  const [smeEditSteps, setSmeEditSteps] = useState([]);

  // Creation: Cutover Form States
  const [cutComponentId, setCutComponentId] = useState('');
  const [cutRunbookId, setCutRunbookId] = useState('');

  // Creation: Deployment Form States
  const [depRunbookId, setDepRunbookId] = useState('');
  const [depComponentId, setDepComponentId] = useState('');
  const [depEnvironment, setDepEnvironment] = useState('');
  const [depVersion, setDepVersion] = useState('');
  const [baseExpectedVersion, setBaseExpectedVersion] = useState('1.0.0');
  const [currentRequirements, setCurrentRequirements] = useState([]);
  const [checkedRequirements, setCheckedRequirements] = useState(new Set());

  // Cutover updates form state
  const [cutAuthor, setCutAuthor] = useState('');
  const [cutMessage, setCutMessage] = useState('');

  // Deployment go/no-go details
  const [decidedBy, setDecidedBy] = useState('');
  const [stakeholdersText, setStakeholdersText] = useState('');

  const loadData = async () => {
    try {
      const [rList, cList, dList, demandList, envList] = await Promise.all([
        buildDeployService.getRunbooks().catch(() => []),
        buildDeployService.getCutoverSessions().catch(() => []),
        buildDeployService.getOrchestrations().catch(() => []),
        demandService.getDemands().catch(() => []),
        configService.getEnvironments().catch(() => [])
      ]);

      setRunbooks(rList || []);
      setCutoverSessions(cList || []);
      setDeployments(dList || []);
      setDemands(demandList || []);
      setEnvRecords(envList || []);

      // Grab globally selected demand from sessionStorage
      const currentGlobalDemandId = sessionStorage.getItem('selectedDemandId');
      if (currentGlobalDemandId) {
        setSelectedDemandId(currentGlobalDemandId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Utility to clean component names
  const formatSimpleName = (compId) => {
    if (!compId) return 'Unknown';
    let s = compId.toLowerCase();
    s = s.replace(/^svc-/, '');
    s = s.replace(/-api/, '');
    s = s.replace(/-prod.*/, '');
    s = s.replace(/-staging.*/, '');
    s = s.replace(/-test.*/, '');
    s = s.replace(/-dev.*/, '');
    s = s.replace(/-svr.*/, '');
    return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getEnvironment = (record) => {
    if (record.environment) return record.environment;
    if (record.cutover_id && record.deployment_id) {
      const dep = deployments.find((d) => d.deployment_id === record.deployment_id);
      if (dep && dep.environment) return dep.environment;
    }
    if (record.steps && record.steps.length > 0) {
      const envOrder = ['dev', 'test', 'staging', 'prod'];
      let targetEnv = 'dev';
      for (const step of record.steps) {
        if (step.environment && envOrder.indexOf(step.environment) > envOrder.indexOf(targetEnv)) {
          targetEnv = step.environment;
        }
      }
      return targetEnv;
    }
    return 'N/A';
  };

  // Group items by demand_id for sidebar
  const getItemsForActiveTab = () => {
    if (activeTab === 'runbooks') return runbooks;
    if (activeTab === 'cutover') return cutoverSessions;
    return deployments;
  };

  const items = getItemsForActiveTab();
  const idField = activeTab === 'runbooks' ? 'runbook_id' : activeTab === 'cutover' ? 'cutover_id' : 'deployment_id';

  // Distinct demand IDs in active list
  const uniqueDemandIds = [...new Set(items.map((i) => i.demand_id || 'Unknown Demand'))];

  // Filter sidebar demands
  const filteredSidebarDemands = uniqueDemandIds.filter((dId) => {
    const q = searchTerm.toLowerCase();
    const dm = demands.find((d) => d.demand_id === dId);
    const title = dm ? dm.title : '';
    return dId.toLowerCase().includes(q) || title.toLowerCase().includes(q);
  });

  // Pick active record details
  const demandItems = items.filter((i) => (i.demand_id || 'Unknown') === selectedDemandId);
  const currentSelectedId = activeTab === 'runbooks' ? selectedRunbookId : activeTab === 'cutover' ? selectedCutoverId : selectedDeploymentId;
  let activeItem = demandItems.find((i) => i[idField] === currentSelectedId);
  if (!activeItem && demandItems.length > 0) {
    activeItem = demandItems[0];
  }

  // Pre-load edit states on record selection
  useEffect(() => {
    if (activeItem && activeTab === 'runbooks') {
      setSmeEditTitle(activeItem.title);
      setSmeEditSteps(activeItem.steps || []);
      setSmeEditOpen(false);
    }
  }, [activeItem, activeTab]);

  // Load demand details for runbook builder
  const handleLoadDemandForRunbook = async () => {
    if (!rbkDemandId) return;
    showLoader('Loading demand configurations...');
    try {
      const matchedDemand = demands.find((d) => d.demand_id === rbkDemandId);
      const envs = envRecords.filter((r) => r.demand_id === rbkDemandId);
      
      // Build component ID fallbacks
      const prodEnv = envs.find((r) => r.environment === 'prod');
      const componentId = prodEnv ? (prodEnv.cmdb_name || prodEnv.observed_name || rbkDemandId) : rbkDemandId;
      setRbkComponentId(componentId);

      let related = [];
      envs.forEach((r) => {
        if (r.cmdb_name) related.push(r.cmdb_name);
        if (r.observed_name) related.push(r.observed_name);
      });
      related = [...new Set(related)].filter(Boolean).sort();
      setRelatedComponents(related);

      // Auto-fill target environment
      let target = 'dev';
      const envOrder = ['dev', 'test', 'staging', 'prod'];
      for (const env of envOrder) {
        const rec = envs.find((r) => r.environment === env && (r.cmdb_name === componentId || r.observed_name === componentId));
        if (rec) {
          target = env;
          break;
        }
      }
      setRbkEnvironment(target);

      // Pre-fill textboxes
      if (matchedDemand) {
        setRbkChangeSummary(matchedDemand.change_summary || matchedDemand.description || '');
      }
      setRbkArchNotes('Sizing estimates & sizing profiles compiled.');
      setRbkStep2Visible(true);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Draft runbook with AI
  const handleDraftRunbook = async () => {
    setFormError('');
    if (!rbkComponentId || !rbkChangeSummary) {
      setFormError('Component ID and Change Summary are required.');
      return;
    }
    showLoader('Drafting with AI…');
    try {
      const res = await buildDeployService.createRunbookDraft({
        demand_id: rbkDemandId,
        component_id: rbkComponentId,
        environment: rbkEnvironment,
        change_summary: rbkChangeSummary,
        architecture_notes: rbkArchNotes || null,
        change_record_ref: rbkChangeRef || null,
        prior_runbook_id: rbkPriorId || null
      });
      setSelectedRunbookId(res.runbook_id);
      setSelectedDemandId(res.demand_id);
      sessionStorage.setItem('selectedDemandId', res.demand_id);
      setIsCreationMode(false);
      await loadData();
      showToast('✓ Runbook drafted successfully');
    } catch (err) {
      setFormError(err.message);
    } finally {
      hideLoader();
    }
  };

  // Submit runbook review
  const handleSubmitReview = async () => {
    if (!activeItem) return;
    showLoader('Submitting runbook review...');
    try {
      await buildDeployService.submitRunbookReview(activeItem.runbook_id);
      await loadData();
      showToast('Runbook submitted for SME review');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Approve runbook
  const handleApproveRunbook = async () => {
    if (!activeItem) return;
    showLoader('Approving runbook...');
    try {
      await buildDeployService.approveRunbook(activeItem.runbook_id);
      setActiveTab('orchestration');
      await loadData();
      showToast('Runbook approved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Save SME Review updates
  const handleSaveRunbookEdits = async () => {
    if (!activeItem) return;
    showLoader('Saving changes...');
    try {
      await buildDeployService.updateRunbook(activeItem.runbook_id, {
        title: smeEditTitle,
        steps: smeEditSteps
      });
      setSmeEditOpen(false);
      await loadData();
      showToast('Runbook saved');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Start manual cutover session
  const handleStartCutover = async () => {
    if (!cutComponentId) {
      setFormError('Component ID is required.');
      return;
    }
    showLoader('Opening cutover session...');
    try {
      const rb = runbooks.find((r) => r.runbook_id === cutRunbookId);
      const demand_id = rb ? rb.demand_id : cutComponentId.split('-').slice(0, 2).join('-');
      
      const res = await buildDeployService.startCutover({
        demand_id,
        component_id: cutComponentId,
        runbook_id: cutRunbookId || null,
        stakeholders: []
      });
      setSelectedCutoverId(res.cutover_id);
      setSelectedDemandId(res.demand_id);
      sessionStorage.setItem('selectedDemandId', res.demand_id);
      setIsCreationMode(false);
      await loadData();
      showToast('Cutover session started');
    } catch (e) {
      setFormError(e.message);
    } finally {
      hideLoader();
    }
  };

  // Advance cutover step
  const handleAdvanceStep = async (stepId, status) => {
    if (!activeItem) return;
    showLoader('Advancing step...');
    try {
      await buildDeployService.advanceCutoverStep(activeItem.cutover_id, stepId, { status });
      await loadData();
      showToast('Step updated');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Post cutover updates
  const handlePostCutoverUpdate = async () => {
    if (!activeItem || !cutMessage) return;
    showLoader('Posting update...');
    try {
      await buildDeployService.updateCutover(activeItem.cutover_id, {
        author: cutAuthor || 'unknown',
        message: cutMessage
      });
      setCutMessage('');
      await loadData();
      showToast('Stakeholder update posted');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Complete / Abort cutover
  const handleEndCutoverSession = async (status) => {
    if (!activeItem) return;
    if (status === 'aborted' && !window.confirm('Abort this cutover session?')) return;
    showLoader('Closing session...');
    try {
      await buildDeployService.endCutover(activeItem.cutover_id, { status });
      if (activeItem.deployment_id) {
        setSelectedDeploymentId(activeItem.deployment_id);
        setActiveTab('orchestration');
      }
      await loadData();
      showToast(status === 'completed' ? 'Cutover session completed' : 'Cutover aborted');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Load requirements & versions for deployment orchestrator
  const handleOrchRunbookChange = async (rbId) => {
    setDepRunbookId(rbId);
    const rb = runbooks.find((r) => r.runbook_id === rbId);
    if (!rb) return;

    setDepComponentId(rb.component_id || '');

    // Derive highest environment priority
    const envOrder = ['dev', 'test', 'staging', 'prod'];
    let targetEnv = 'dev';
    (rb.steps || []).forEach((step) => {
      if (envOrder.indexOf(step.environment) > envOrder.indexOf(targetEnv)) {
        targetEnv = step.environment;
      }
    });
    setDepEnvironment(targetEnv);

    // Auto-fill requirements & expected version baseline from config
    try {
      let baseVersion = '1.0.0';
      const matchedRecord = envRecords.find((r) => r.environment === targetEnv && (r.cmdb_name === rb.component_id || r.observed_name === rb.component_id || r.demand_id === rb.demand_id));
      if (matchedRecord) {
        if (matchedRecord.expected_version) {
          baseVersion = matchedRecord.expected_version;
          setBaseExpectedVersion(matchedRecord.expected_version);
        }
        setCurrentRequirements(matchedRecord.expected_requirements || []);
      }
      setCheckedRequirements(new Set());

      // Auto-increment past deploy versions
      const componentDeps = deployments.filter((d) => d.component_id === rb.component_id);
      if (componentDeps.length > 0) {
        let lastVer = componentDeps[componentDeps.length - 1].version || baseVersion;
        const match = lastVer.match(/(.*?)(\d+)$/);
        if (match) {
          baseVersion = match[1] + (parseInt(match[2], 10) + 1);
        } else {
          baseVersion = lastVer + '.1';
        }
      }
      setDepVersion(baseVersion);
    } catch (err) {
      console.warn(err);
      setDepVersion('1.0.0');
    }
  };

  const handleBumpDepVersion = (dir) => {
    const val = depVersion.trim() || '1.0.0';
    const match = val.match(/(.*?)(\d+)$/);
    if (match) {
      let newNum = parseInt(match[2], 10) + dir;
      if (newNum < 0) newNum = 0;
      setDepVersion(match[1] + newNum);
    } else {
      setDepVersion(val + (dir > 0 ? '.1' : '.0'));
    }
  };

  const handleRequirementToggle = (req, isChecked) => {
    const nextSet = new Set(checkedRequirements);
    if (isChecked) {
      nextSet.add(req);
    } else {
      nextSet.delete(req);
    }
    setCheckedRequirements(nextSet);
  };

  // Start Deployment Orchestration
  const handleStartDeployment = async () => {
    if (!depComponentId || !depRunbookId || !depVersion) {
      setFormError('Component, version, and approved runbook are required.');
      return;
    }
    showLoader('Starting orchestration deployment...');
    try {
      const rb = runbooks.find((r) => r.runbook_id === depRunbookId);
      const res = await buildDeployService.startOrchestration({
        demand_id: rb ? rb.demand_id : null,
        component_id: depComponentId,
        version: depVersion,
        runbook_id: depRunbookId,
        environment: depEnvironment
      });
      setSelectedDeploymentId(res.deployment_id);
      setSelectedDemandId(res.demand_id);
      sessionStorage.setItem('selectedDemandId', res.demand_id);
      setIsCreationMode(false);
      await loadData();
      showToast('Deployment started');
    } catch (e) {
      setFormError(e.message);
    } finally {
      hideLoader();
    }
  };

  // Orch Precondition checks
  const handleCheckPreconditions = async () => {
    if (!activeItem) return;
    showLoader('Checking preconditions...');
    try {
      await buildDeployService.checkPreconditions(activeItem.deployment_id);
      await loadData();
      showToast('Precondition checks completed');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Go / No-Go Decision
  const handleOrchDecisionSubmit = async (decision) => {
    if (!activeItem) return;
    showLoader('Submitting decision...');
    try {
      await buildDeployService.submitGoNoGo(activeItem.deployment_id, {
        decision,
        decided_by: decidedBy || 'release-manager',
        stakeholders: stakeholdersText ? stakeholdersText.split(',').map((s) => s.trim()).filter(Boolean) : []
      });
      if (decision === 'go') {
        setActiveTab('cutover');
      }
      await loadData();
      showToast(`Submitted ${decision.toUpperCase()} decision`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Complete Deployment
  const handleCompleteDeployment = async () => {
    if (!activeItem) return;
    showLoader('Marking deployment complete...');
    try {
      await buildDeployService.completeOrchestration(activeItem.deployment_id);
      await loadData();
      showToast('Deployment completed successfully');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Delete active item
  const handleDeleteActiveItem = async () => {
    if (!activeItem) return;
    const typeText = activeTab === 'runbooks' ? 'Runbook' : activeTab === 'cutover' ? 'Cutover' : 'Deployment';
    if (window.confirm(`Delete active ${typeText}?`)) {
      showLoader('Deleting record...');
      try {
        const apiPath = activeTab === 'runbooks' ? 'runbooks' : activeTab === 'cutover' ? 'cutover' : 'orchestration';
        await buildDeployService.deleteRecord(apiPath, activeItem[idField]);
        
        // Reset selections
        if (activeTab === 'runbooks') setSelectedRunbookId(null);
        else if (activeTab === 'cutover') setSelectedCutoverId(null);
        else setSelectedDeploymentId(null);

        await loadData();
        showToast(`${typeText} deleted`);
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  // Group items dropdown
  const handleDropdownSelect = (val) => {
    if (val === 'new') {
      setIsCreationMode(true);
      setSelectedDemandId(null);
    } else {
      setSelectedDemandId(val);
      setIsCreationMode(false);
      sessionStorage.setItem('selectedDemandId', val);

      // Select first matching item if exists
      const match = items.find((i) => i.demand_id === val);
      if (match) {
        if (activeTab === 'runbooks') setSelectedRunbookId(match.runbook_id);
        else if (activeTab === 'cutover') setSelectedCutoverId(match.cutover_id);
        else setSelectedDeploymentId(match.deployment_id);
      }
    }
  };

  const currentTabLabel = activeTab === 'runbooks' ? 'Runbook' : activeTab === 'cutover' ? 'Cutover' : 'Orchestration';

  // Render variables
  const stepTypeColor = { 'pre-check': '#818cf8', 'execute': '#60a5fa', 'verify': '#34d399', 'rollback-trigger': '#f87171' };
  const allPreconditionsPassed = activeItem && activeItem.preconditions && activeItem.preconditions.length > 0 && activeItem.preconditions.every((p) => p.passed);

  return (
    <div className="intake-screen">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="sidebar-search" style={{ padding: '1rem' }}>
          <input
            type="text"
            placeholder="Search demand project..."
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
            filteredSidebarDemands.map((dId) => {
              const active = dId === selectedDemandId;
              const matchingRecords = items.filter((i) => i.demand_id === dId);
              const compTitle = matchingRecords.length > 0 ? formatSimpleName(matchingRecords[0].component_id) : '';
              return (
                <li
                  key={dId}
                  className={`demand-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDemandId(dId);
                    setIsCreationMode(false);
                    sessionStorage.setItem('selectedDemandId', dId);
                    
                    // Automatically pick first version
                    if (matchingRecords.length > 0) {
                      const first = matchingRecords[0];
                      if (activeTab === 'runbooks') setSelectedRunbookId(first.runbook_id);
                      else if (activeTab === 'cutover') setSelectedCutoverId(first.cutover_id);
                      else setSelectedDeploymentId(first.deployment_id);
                    }
                  }}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">Demand: {dId}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500, marginTop: '0.1rem' }}>
                    {compTitle}
                  </div>
                  <h4 className="demand-item-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '0.2rem' }}>
                    {matchingRecords.length} record(s)
                  </h4>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main Workspace details panel */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyValue: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Build &amp; Deploy</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={isCreationMode ? 'new' : selectedDemandId || ''}
              onChange={(e) => handleDropdownSelect(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minWidth: '240px', cursor: 'pointer' }}
            >
              <option value="new">+ Create New {currentTabLabel}</option>
              {demands.map((d) => (
                <option key={d.demand_id} value={d.demand_id}>{d.demand_id} - {d.title}</option>
              ))}
            </select>
            <button className="btn-secondary" onClick={loadData} style={{ padding: '0.45rem' }}>↻</button>
          </div>
        </header>

        {/* Sub-tabs workspace selection */}
        <div className="tabs-container" style={{ padding: '0.5rem 1.5rem', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem' }}>
          <button className={`tab-btn ${activeTab === 'runbooks' ? 'active' : ''}`} onClick={() => { setActiveTab('runbooks'); setIsCreationMode(false); }} style={{ padding: '0.4rem 0.2rem', fontSize: '0.85rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>Runbooks</button>
          <button className={`tab-btn ${activeTab === 'cutover' ? 'active' : ''}`} onClick={() => { setActiveTab('cutover'); setIsCreationMode(false); }} style={{ padding: '0.4rem 0.2rem', fontSize: '0.85rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>Cutover Bridge</button>
          <button className={`tab-btn ${activeTab === 'orchestration' ? 'active' : ''}`} onClick={() => { setActiveTab('orchestration'); setIsCreationMode(false); }} style={{ padding: '0.4rem 0.2rem', fontSize: '0.85rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>Orchestration</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {isCreationMode ? (
            /* DRAFT / CREATION CREATOR FORMS */
            <div>
              {activeTab === 'runbooks' ? (
                /* NEW RUNBOOK BUILDER */
                <div className="panel-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0 }}>Draft a Runbook</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Select a demand to auto-populate fields, then submit to generate AI-powered runbook steps.
                  </p>

                  <div className="form-group" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1.25rem', background: 'var(--bg-secondary)' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'block' }}>① Select Demand</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select value={rbkDemandId} onChange={(e) => setRbkDemandId(e.target.value)} style={{ flex: 1 }}>
                        <option value="">— choose a demand —</option>
                        {demands.map((d) => (
                          <option key={d.demand_id} value={d.demand_id}>{d.demand_id} — {d.title}</option>
                        ))}
                      </select>
                      <button type="button" className="btn-secondary" onClick={handleLoadDemandForRunbook}>Load ↓</button>
                    </div>
                  </div>

                  {rbkStep2Visible && (
                    <div>
                      <div style={{ borderLeft: '3px solid var(--color-brand)', paddingLeft: '0.9rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>② Review &amp; Edit — then Draft</span>
                      </div>

                      <div className="form-group">
                        <label>Component ID *</label>
                        <select value={rbkComponentId} onChange={(e) => setRbkComponentId(e.target.value)}>
                          <option value="">— select component —</option>
                          {relatedComponents.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Change Summary *</label>
                        <textarea value={rbkChangeSummary} onChange={(e) => setRbkChangeSummary(e.target.value)} style={{ minHeight: '110px' }} />
                      </div>

                      <div className="form-group">
                        <label>Architecture Notes</label>
                        <textarea value={rbkArchNotes} onChange={(e) => setRbkArchNotes(e.target.value)} style={{ minHeight: '90px' }} />
                      </div>

                      <div className="grid-2col">
                        <div className="form-group">
                          <label>Target Environment *</label>
                          <select value={rbkEnvironment} onChange={(e) => setRbkEnvironment(e.target.value)}>
                            <option value="dev">Development (dev)</option>
                            <option value="test">Test (test)</option>
                            <option value="staging">Staging (staging)</option>
                            <option value="prod">Production (prod)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Prior Runbook (reuse steps)</label>
                          <select value={rbkPriorId} onChange={(e) => setRbkPriorId(e.target.value)}>
                            <option value="">None</option>
                            {runbooks.map((r) => (
                              <option key={r.runbook_id} value={r.runbook_id}>{r.title}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Change Record Ref</label>
                        <input type="text" value={rbkChangeRef} onChange={(e) => setRbkChangeRef(e.target.value)} placeholder="e.g. CHG-2026-0091" />
                      </div>

                      {formError && <div className="error-message" style={{ display: 'block' }}>{formError}</div>}
                      <div className="submit-row" style={{ marginTop: '1.5rem' }}>
                        <button type="button" className="btn-primary" onClick={handleDraftRunbook}>
                          ✦ Draft Runbook with AI
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : activeTab === 'cutover' ? (
                /* NEW CUTOVER SESSION */
                <div className="panel-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0 }}>Start a Cutover Bridge</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Open a cutover bridge dashboard for manual step tracking and stakeholder broadcast.
                  </p>

                  <div className="form-group">
                    <label>Component ID *</label>
                    <input type="text" value={cutComponentId} onChange={(e) => setCutComponentId(e.target.value)} placeholder="e.g. loyalty-portal-service" />
                  </div>

                  <div className="form-group">
                    <label>Approved Runbook (Optional)</label>
                    <select value={cutRunbookId} onChange={(e) => setCutRunbookId(e.target.value)}>
                      <option value="">None — track manually</option>
                      {runbooks.filter(r => r.status === 'approved').map((r) => (
                        <option key={r.runbook_id} value={r.runbook_id}>{r.title}</option>
                      ))}
                    </select>
                  </div>

                  {formError && <div className="error-message" style={{ display: 'block' }}>{formError}</div>}
                  <div className="submit-row">
                    <button type="button" className="btn-primary" onClick={handleStartCutover}>
                      Open Cutover Bridge
                    </button>
                  </div>
                </div>
              ) : (
                /* NEW ORCHESTRATION DEPLOYMENT */
                <div className="panel-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0 }}>Start a Deployment</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Drives a deployment runbook across environments, checks automated preconditions, and holds gates.
                  </p>

                  <div className="grid-2col">
                    <div className="form-group">
                      <label>Approved Runbook *</label>
                      <select value={depRunbookId} onChange={(e) => handleOrchRunbookChange(e.target.value)}>
                        <option value="">Select a runbook</option>
                        {runbooks.filter((r) => r.status === 'approved').map((r) => (
                          <option key={r.runbook_id} value={r.runbook_id}>
                            {formatSimpleName(r.component_id)} - {getEnvironment(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Environment (auto-filled)</label>
                      <input type="text" value={depEnvironment} readOnly style={{ background: 'var(--bg-tertiary)' }} />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>Version to Deploy</label>
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'stretch' }}>
                      <input type="text" value={depVersion} onChange={(e) => setDepVersion(e.target.value)} style={{ flex: 1 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button type="button" onClick={() => handleBumpDepVersion(1)} style={{ background: 'var(--bg-secondary)', border: '1px solid #6366f1', borderRadius: '3px', color: 'var(--text-primary)', fontSize: '0.6rem', padding: '2px 4px', cursor: 'pointer' }}>▲</button>
                        <button type="button" onClick={() => handleBumpDepVersion(-1)} style={{ background: 'var(--bg-secondary)', border: '1px solid #6366f1', borderRadius: '3px', color: 'var(--text-primary)', fontSize: '0.6rem', padding: '2px 4px', cursor: 'pointer' }}>▼</button>
                      </div>
                    </div>
                  </div>

                  {currentRequirements.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                        Upstream Release Requirements
                      </span>
                      <div style={{ background: 'var(--bg-tertiary)', padding: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                        {currentRequirements.map((req) => (
                          <label key={req} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', marginBottom: '0.4rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={checkedRequirements.has(req)}
                              onChange={(e) => handleRequirementToggle(req, e.target.checked)}
                            />
                            {req}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="preconditions-list" style={{ marginTop: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '1rem', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                      Preconditions Checklist
                    </span>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: 'var(--text-secondary)', listStyleType: 'disc', lineHeight: '1.6' }}>
                      <li style={{ color: depVersion === baseExpectedVersion ? 'var(--color-status-green-text)' : '#ef4444' }}>
                        Version match: {depVersion === baseExpectedVersion ? 'Matches' : `Drift detected (Expected: ${baseExpectedVersion})`}
                      </li>
                      <li style={{ color: checkedRequirements.size === currentRequirements.length ? 'var(--color-status-green-text)' : 'var(--text-secondary)' }}>
                        Upstream requirements: {checkedRequirements.size}/{currentRequirements.length} verified
                      </li>
                      <li>Runbook validation checks</li>
                      <li>Backups and rollbacks verified ready</li>
                    </ul>
                  </div>

                  {formError && <div className="error-message" style={{ display: 'block' }}>{formError}</div>}
                  <div className="submit-row" style={{ marginTop: '1.5rem' }}>
                    <button type="button" className="btn-primary" onClick={handleStartDeployment}>
                      Start Deployment
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : activeItem ? (
            /* DETAILED VIEWS */
            <div>
              {/* Dropdown component select sub-bar */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select version / component:</label>
                <select
                  value={activeItem[idField]}
                  onChange={(e) => {
                    if (activeTab === 'runbooks') setSelectedRunbookId(e.target.value);
                    else if (activeTab === 'cutover') setSelectedCutoverId(e.target.value);
                    else setSelectedDeploymentId(e.target.value);
                  }}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}
                >
                  {demandItems.map((i) => (
                    <option key={i[idField]} value={i[idField]}>
                      {formatSimpleName(i.component_id)} - {getEnvironment(i)} ({i[idField]})
                    </option>
                  ))}
                </select>
                <button onClick={handleDeleteActiveItem} className="btn-secondary" style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}>
                  Delete Active {currentTabLabel}
                </button>
              </div>

              {activeTab === 'runbooks' ? (
                /* RUNBOOK DETAIL PANEL */
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activeItem.runbook_id}</span>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0' }}>{activeItem.title}</h2>
                    </div>
                    <StatusPill status={activeItem.status} />
                  </div>

                  <div className="grid-2col">
                    <div className="data-item"><div className="data-label">Component</div><div className="data-value">{activeItem.component_id}</div></div>
                    <div className="data-item"><div className="data-label">Change Record</div><div className="data-value">{activeItem.change_record_ref || 'N/A'}</div></div>
                  </div>
                  <div className="data-item" style={{ marginBottom: '1.5rem' }}>
                    <div className="data-label">Duration assessment</div>
                    <div className="data-value">
                      {activeItem.steps.reduce((sum, s) => sum + (s.estimated_minutes || 0), 0)} minutes across {activeItem.steps.length} steps
                    </div>
                  </div>

                  <div className="data-label" style={{ marginBottom: '0.6rem' }}>All Steps</div>
                  <ul className="step-track">
                    {activeItem.steps.map((s, idx) => (
                      <li key={idx} className="step-row">
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: `${stepTypeColor[s.step_type] || '#6366f1'}22`, border: `1.5px solid ${stepTypeColor[s.step_type] || '#6366f1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: stepTypeColor[s.step_type] || '#6366f1' }}>{idx + 1}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="step-desc" style={{ fontWeight: 500 }}>{s.description}</div>
                          <div className="step-meta" style={{ marginTop: '0.2rem' }}>
                            <span style={{ background: `${stepTypeColor[s.step_type] || '#6366f1'}22`, color: stepTypeColor[s.step_type] || '#6366f1', padding: '1px 6px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>
                              {s.step_type}
                            </span>
                            &nbsp;{s.environment} &nbsp;·&nbsp; {s.owner} &nbsp;·&nbsp; ~{s.estimated_minutes}min
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="submit-row" style={{ marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    {activeItem.status === 'draft' && <button type="button" className="btn-secondary" onClick={handleSubmitReview}>Submit for SME Review</button>}
                    {activeItem.status === 'sme-review' && <button type="button" className="btn-secondary" onClick={() => setSmeEditOpen(!smeEditOpen)}>✏ Edit Runbook</button>}
                    {activeItem.status !== 'approved' && <button type="button" className="btn-primary" onClick={handleApproveRunbook}>Approve Runbook</button>}
                    {activeItem.status === 'approved' && (
                      <>
                        <button type="button" className="btn-secondary" onClick={() => { setActiveTab('cutover'); setIsCreationMode(true); setCutRunbookId(activeItem.runbook_id); setCutComponentId(activeItem.component_id); }}>Start Cutover Session</button>
                        <button type="button" className="btn-primary" onClick={() => { setActiveTab('orchestration'); setIsCreationMode(true); handleOrchRunbookChange(activeItem.runbook_id); }}>Start Deployment (Orchestration)</button>
                      </>
                    )}
                  </div>

                  {smeEditOpen && (
                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                      <div className="form-group">
                        <label>Runbook Title</label>
                        <input type="text" value={smeEditTitle} onChange={(e) => setSmeEditTitle(e.target.value)} />
                      </div>
                      <div className="data-label" style={{ marginBottom: '0.5rem', marginTop: '0.75rem' }}>Edit Steps</div>
                      {smeEditSteps.map((s, idx) => (
                        <div key={idx} className="panel-card" style={{ padding: '0.75rem', marginBottom: '0.75rem', background: 'var(--bg-secondary)' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Step {idx + 1}</div>
                          <div className="form-group" style={{ marginBottom: '0.4rem' }}>
                            <input
                              type="text"
                              value={s.description}
                              onChange={(e) => {
                                const next = [...smeEditSteps];
                                next[idx].description = e.target.value;
                                setSmeEditSteps(next);
                              }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '0.4rem' }}>
                            <input
                              type="text"
                              value={s.owner}
                              onChange={(e) => {
                                const next = [...smeEditSteps];
                                next[idx].owner = e.target.value;
                                setSmeEditSteps(next);
                              }}
                              placeholder="Owner"
                            />
                            <select
                              value={s.environment}
                              onChange={(e) => {
                                const next = [...smeEditSteps];
                                next[idx].environment = e.target.value;
                                setSmeEditSteps(next);
                              }}
                            >
                              <option value="dev">dev</option>
                              <option value="test">test</option>
                              <option value="staging">staging</option>
                              <option value="prod">prod</option>
                            </select>
                            <input
                              type="number"
                              value={s.estimated_minutes}
                              onChange={(e) => {
                                const next = [...smeEditSteps];
                                next[idx].estimated_minutes = parseInt(e.target.value) || 5;
                                setSmeEditSteps(next);
                              }}
                              min="1"
                            />
                          </div>
                        </div>
                      ))}
                      <div className="submit-row" style={{ marginTop: '1rem' }}>
                        <button type="button" className="btn-secondary" onClick={() => setSmeEditOpen(false)}>Cancel</button>
                        <button type="button" className="btn-primary" onClick={handleSaveRunbookEdits}>Save Changes</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : activeTab === 'cutover' ? (
                /* CUTOVER DETAIL PANEL */
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activeItem.cutover_id}</span>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0' }}>{activeItem.component_id}</h2>
                    </div>
                    <StatusPill status={activeItem.status} />
                  </div>

                  <div className="data-item" style={{ marginBottom: '1rem' }}>
                    <div className="data-label">Stakeholders</div>
                    <div className="data-value">{activeItem.stakeholders.length ? activeItem.stakeholders.join(', ') : 'None listed'}</div>
                  </div>

                  {activeItem.steps.length > 0 ? (
                    <div>
                      <div className="data-label" style={{ marginBottom: '0.5rem' }}>Live Step Tracker</div>
                      <ul className="step-track">
                        {activeItem.steps.map((s) => (
                          <li key={s.step_id} className="step-row">
                            <span className={`step-dot ${s.status}`} />
                            <div style={{ flex: 1 }}>
                              <div className="step-desc">{s.description}</div>
                              <div className="step-meta" style={{ textTransform: 'capitalize' }}>{s.status} {s.notes && `· ${s.notes}`}</div>
                            </div>
                            {(activeItem.status === 'in-progress' || activeItem.status === 'scheduled') && (
                              <div className="step-actions">
                                <button type="button" onClick={() => handleAdvanceStep(s.step_id, 'in-progress')}>Start</button>
                                <button type="button" onClick={() => handleAdvanceStep(s.step_id, 'done')}>Done</button>
                                <button type="button" onClick={() => handleAdvanceStep(s.step_id, 'blocked')}>Block</button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      No runbook steps linked — tracking manually via updates.
                    </div>
                  )}

                  <div className="data-label" style={{ marginTop: '1.25rem', marginBottom: '0.25rem' }}>Stakeholder Comms Feed</div>
                  <div className="comms-feed" style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px' }}>
                    {activeItem.updates.slice().reverse().map((u, idx) => (
                      <div key={idx} className="comms-entry">
                        <div className="comms-meta">{u.author} · {new Date(u.timestamp).toLocaleString()}</div>
                        <div>{u.message}</div>
                      </div>
                    ))}
                  </div>

                  {(activeItem.status === 'in-progress' || activeItem.status === 'scheduled') && (
                    <div style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label>Post Update — Author</label>
                        <input type="text" value={cutAuthor} onChange={(e) => setCutAuthor(e.target.value)} placeholder="e.g. release-manager" />
                      </div>
                      <div className="form-group">
                        <label>Message</label>
                        <textarea value={cutMessage} onChange={(e) => setCutMessage(e.target.value)} placeholder="Status update..." style={{ minHeight: '60px' }} />
                      </div>
                      <div className="submit-row">
                        <button type="button" className="btn-secondary" onClick={handlePostCutoverUpdate}>Post Update</button>
                        <button type="button" className="btn-secondary" onClick={() => handleEndCutoverSession('aborted')} style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)' }}>Abort</button>
                        <button type="button" className="btn-primary" onClick={() => handleEndCutoverSession('completed')}>Mark Completed</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ORCHESTRATION DETAIL PANEL */
                <div className="panel-card">
                  <div style={{ display: 'flex', justifyValue: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activeItem.deployment_id}</span>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0' }}>{activeItem.component_id}</h2>
                    </div>
                    <StatusPill status={activeItem.status} />
                  </div>

                  <div className="grid-2col">
                    <div className="data-item"><div className="data-label">Environment</div><div className="data-value">{activeItem.environment}</div></div>
                    <div className="data-item"><div className="data-label">Runbook</div><div className="data-value">{activeItem.runbook_id || 'N/A'}</div></div>
                  </div>
                  <div className="data-item" style={{ marginBottom: '1rem' }}>
                    <div className="data-label">Version Deployed</div>
                    <div className="data-value" style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{activeItem.version || 'unknown'}</div>
                  </div>
                  {activeItem.decided_by && (
                    <div className="data-item" style={{ marginBottom: '1rem' }}>
                      <div className="data-label">Decided By</div>
                      <div className="data-value">{activeItem.decided_by}</div>
                    </div>
                  )}

                  {activeItem.preconditions && activeItem.preconditions.length > 0 ? (
                    <div>
                      <div className="data-label" style={{ marginBottom: '0.5rem' }}>Preconditions Status</div>
                      {activeItem.preconditions.map((p) => (
                        <div key={p.name} className="precondition-row">
                          <span className={`precondition-icon ${p.passed ? 'pass' : 'fail'}`}>{p.passed ? '✓' : '✗'}</span>
                          <div className="precondition-body">
                            <div className="precondition-name">{p.name.replace(/-/g, ' ')}</div>
                            <div className="precondition-detail">{p.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      Preconditions not checked yet.
                    </div>
                  )}

                  <div className="submit-row" style={{ marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    {(activeItem.status === 'planned' || activeItem.status === 'checking') && (
                      <button type="button" className="btn-secondary" onClick={handleCheckPreconditions}>
                        Check Preconditions
                      </button>
                    )}
                    {activeItem.preconditions && activeItem.preconditions.length > 0 && (activeItem.status === 'checking' || activeItem.status === 'no-go') && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', width: '100%', marginTop: '1rem' }}>
                        <input type="text" value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} placeholder="Decided by (e.g. release-manager)" style={{ maxWidth: '220px' }} />
                        <input type="text" value={stakeholdersText} onChange={(e) => setStakeholdersText(e.target.value)} placeholder="Stakeholders (comma separated)" style={{ maxWidth: '260px' }} />
                        <button type="button" className="btn-secondary" onClick={() => handleOrchDecisionSubmit('no-go')}>No-Go</button>
                        <button type="button" className="btn-primary" onClick={() => handleOrchDecisionSubmit('go')} disabled={!allPreconditionsPassed} title={!allPreconditionsPassed ? 'Resolve failing preconditions first' : ''}>Go</button>
                      </div>
                    )}
                    {activeItem.cutover_id && (
                      <button type="button" className="btn-secondary" onClick={() => { setSelectedCutoverId(activeItem.cutover_id); setActiveTab('cutover'); }}>
                        View Cutover Session
                      </button>
                    )}
                    {activeItem.cutover_id && activeItem.status === 'in-progress' && (
                      <button type="button" className="btn-primary" onClick={handleCompleteDeployment}>
                        Mark Deployment Done
                      </button>
                    )}
                    {activeItem.status === 'done' && (
                      <button type="button" className="btn-primary" onClick={() => navigate('/test-quality')}>
                        Proceed to Test &amp; Quality →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              Select a project from the left sidebar or click the dropdown to create one.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
