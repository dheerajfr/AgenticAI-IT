import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useUI } from '../context/UIContext';
import { demandService } from '../services/demandService';
import StatusPill from '../components/common/StatusPill';
import { renderMarkdown } from '../utils/markdown';

export default function DemandIntake() {
  const {
    demands,
    selectedDemandId,
    selectedDemand,
    fetchDemands,
    selectDemandId
  } = useProject();
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Sidebar search & creation tab
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFormTab, setActiveFormTab] = useState('text'); // 'text' | 'file'
  const [errorMsg, setErrorMsg] = useState('');

  // Form states for creating new demand
  const [newTitle, setNewTitle] = useState('');
  const [newSubmitter, setNewSubmitter] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);

  // Workforce Pool states
  const [workforceList, setWorkforceList] = useState([]);
  const [workforceCollapsed, setWorkforceCollapsed] = useState(false);
  const [newResName, setNewResName] = useState('');
  const [newResRole, setNewResRole] = useState('Backend Developer');
  const [newResSkills, setNewResSkills] = useState('');
  const [newResTotal, setNewResTotal] = useState('');
  const [newResAlloc, setNewResAlloc] = useState('');
  const [resError, setResError] = useState('');

  // Stage 2: Classify suggestions
  const [classSuggestions, setClassSuggestions] = useState(null);

  // Stage 3: Capacity suggestions & headcount editing
  const [capSuggestions, setCapSuggestions] = useState(null);
  const [isEditingHeadcount, setIsEditingHeadcount] = useState(false);
  const [headcountFields, setHeadcountFields] = useState({});

  // Stage 4: Business case summary draft
  const [businessCaseDraft, setBusinessCaseDraft] = useState('');

  // Scroll ref for details panel
  const panelRef = useRef(null);
  const lastDemandIdRef = useRef(null);

  // Load workforce pool when capacity step is active
  const loadWorkforce = async () => {
    try {
      const data = await demandService.getResources();
      if (data) setWorkforceList(data);
    } catch (e) {
      console.error('Workforce pool load failure', e);
    }
  };

  useEffect(() => {
    if (selectedDemand) {
      if (selectedDemand.demand_id !== lastDemandIdRef.current) {
        setBusinessCaseDraft(selectedDemand.business_case_summary || '');
        lastDemandIdRef.current = selectedDemand.demand_id;
      }
      // Clear temporary suggestions
      setClassSuggestions(null);
      setCapSuggestions(null);
      setIsEditingHeadcount(false);
      
      // Auto-load workforce if Step 3 is active and pending
      const isClassifyApproved = ['classified', 'capacity-checked', 'approved'].includes(selectedDemand.status);
      const isCapacityApproved = ['capacity-checked', 'approved'].includes(selectedDemand.status);
      if (isClassifyApproved && !isCapacityApproved) {
        loadWorkforce();
      }
    }
  }, [selectedDemand]);

  // Sidebar Filtering
  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  // Action: Select project
  const handleSelectProject = (id) => {
    if (id === 'new') {
      selectDemandId(null);
      setErrorMsg('');
      setNewTitle('');
      setNewSubmitter('');
      setNewDesc('');
      setFileToUpload(null);
    } else {
      selectDemandId(id);
    }
  };

  // Action: Delete project
  const handleDeleteProject = async (e, id) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this demand? This cannot be undone.')) {
      showLoader('Deleting demand...');
      try {
        await demandService.deleteDemand(id);
        if (selectedDemandId === id) {
          selectDemandId(null);
        }
        await fetchDemands();
        showToast('Demand deleted successfully');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoader();
      }
    }
  };

  // Form Submission: Create new demand
  const handleCreateDemandSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const formData = new FormData();
    if (newTitle.trim()) formData.append('title', newTitle.trim());
    if (newSubmitter.trim()) formData.append('submitted_by', newSubmitter.trim());

    if (activeFormTab === 'text') {
      if (!newDesc.trim()) {
        setErrorMsg('Validation Error: Please fill in the description field.');
        return;
      }
      formData.append('description', newDesc.trim());
    } else {
      if (!fileToUpload) {
        setErrorMsg('Validation Error: Please choose a file to upload.');
        return;
      }
      const ext = fileToUpload.name.split('.').pop().toLowerCase();
      if (!['txt', 'pdf', 'docx'].includes(ext)) {
        setErrorMsg(`Validation Error: Unsupported file type '.${ext}'. Only .txt, .pdf, and .docx are supported.`);
        return;
      }
      formData.append('file', fileToUpload);
    }

    showLoader('Running Extraction Node...');
    try {
      const res = await demandService.createDemand(formData);
      showToast('Intake successfully captured!');
      setNewTitle('');
      setNewSubmitter('');
      setNewDesc('');
      setFileToUpload(null);
      
      // Auto-select the newly created demand
      if (res && res.demand_id) {
        selectDemandId(res.demand_id);
      }
      await fetchDemands();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit demand.');
    } finally {
      hideLoader();
    }
  };

  // Classify suggestions triggers
  const handleRunClassify = async () => {
    if (!selectedDemand) return;
    showLoader('Running classify -> duplicate-check -> route nodes...');
    try {
      const suggestions = await demandService.classifyRoute(selectedDemand.demand_id);
      setClassSuggestions(suggestions);
      showToast('AI classification complete');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleApproveClassify = async () => {
    if (!selectedDemand || !classSuggestions) return;
    showLoader('Saving classification state...');
    try {
      const suggestType = document.getElementById('suggest-type')?.value || classSuggestions.type;
      const suggestRisk = document.getElementById('suggest-risk')?.value || classSuggestions.risk_level;
      const suggestDomain = document.getElementById('suggest-domain')?.value || classSuggestions.domain;
      const duplicateOf = classSuggestions.duplicate_of;

      await demandService.approveClassify(selectedDemand.demand_id, suggestType, suggestRisk, suggestDomain, duplicateOf);
      setClassSuggestions(null);
      await fetchDemands();
      showToast('Classification saved successfully');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Capacity suggestions triggers
  const handleRunCapacity = async () => {
    if (!selectedDemand) return;
    showLoader('Querying platform capacity logs...');
    try {
      const suggestions = await demandService.capacityCheck(selectedDemand.demand_id);
      setCapSuggestions(suggestions);
      
      // Setup headcount values for the table
      const fields = {};
      (suggestions.resourceConstraints || []).forEach((c) => {
        fields[c.role] = c.requiredCapacity ?? 0;
      });
      setHeadcountFields(fields);
      showToast('Capacity check complete');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleSaveSuggestionHeadcount = async () => {
    if (!selectedDemand || !capSuggestions) return;
    showLoader('Saving suggestion headcount...');
    try {
      const resourceConstraints = Object.keys(headcountFields).map((role) => ({
        role,
        requiredCapacity: parseInt(headcountFields[role]) || 0
      }));

      await demandService.saveCapacity(selectedDemand.demand_id, {
        verdict: capSuggestions.verdict || 'feasible',
        resourceConstraints
      });
      showToast('Headcount changes saved');
      // Refresh checks
      await handleRunCapacity();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleApproveCapacity = async () => {
    if (!selectedDemand || !capSuggestions) return;
    showLoader('Committing capacity sign-off...');
    try {
      const resourceConstraints = Object.keys(headcountFields).map((role) => ({
        role,
        requiredCapacity: parseInt(headcountFields[role]) || 0
      }));

      await demandService.approveCapacity(selectedDemand.demand_id, capSuggestions.verdict || 'feasible', resourceConstraints);
      setCapSuggestions(null);
      await fetchDemands();
      showToast('Capacity verification approved');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Feasibility headcount modifications (when capacity approved)
  const handleToggleEditHeadcount = () => {
    if (isEditingHeadcount) {
      // Revert values
      const fields = {};
      (selectedDemand.resource_constraints || []).forEach((c) => {
        fields[c.role] = c.requiredCapacity ?? 0;
      });
      setHeadcountFields(fields);
      setIsEditingHeadcount(false);
    } else {
      const fields = {};
      (selectedDemand.resource_constraints || []).forEach((c) => {
        fields[c.role] = c.requiredCapacity ?? 0;
      });
      setHeadcountFields(fields);
      setIsEditingHeadcount(true);
    }
  };

  const handleSaveApprovedHeadcount = async () => {
    if (!selectedDemand) return;
    showLoader('Saving approved headcount modifications...');
    try {
      const resourceConstraints = Object.keys(headcountFields).map((role) => ({
        role,
        requiredCapacity: parseInt(headcountFields[role]) || 0
      }));

      await demandService.approveCapacity(selectedDemand.demand_id, selectedDemand.capacity_verdict || 'feasible', resourceConstraints);
      setIsEditingHeadcount(false);
      await fetchDemands();
      showToast('Headcount modified successfully');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Workforce capacity pool methods
  const handleAddResource = async () => {
    setResError('');
    if (!newResName.trim()) {
      setResError('Name is required.');
      return;
    }
    const total = parseInt(newResTotal);
    const alloc = parseInt(newResAlloc);
    if (isNaN(total) || isNaN(alloc)) {
      setResError('Total and Allocated capacities must be valid numbers.');
      return;
    }

    showLoader('Adding resource...');
    try {
      const skills = newResSkills ? newResSkills.split(',').map((s) => s.trim()).filter(Boolean) : [];
      await demandService.saveResources({
        name: newResName.trim(),
        role: newResRole,
        skills,
        total_capacity: total,
        allocated_capacity: alloc
      });
      setNewResName('');
      setNewResSkills('');
      setNewResTotal('');
      setNewResAlloc('');
      await loadWorkforce();
      showToast('Resource added successfully');
    } catch (err) {
      setResError(err.message);
    } finally {
      hideLoader();
    }
  };

  const handleSaveResourceCapacities = async (r, totalVal, allocVal) => {
    const total = parseInt(totalVal);
    const alloc = parseInt(allocVal);
    if (isNaN(total) || isNaN(alloc)) {
      alert('Total and Allocated capacities must be integers.');
      return;
    }

    showLoader('Saving resource capacities...');
    try {
      await demandService.saveResources({
        name: r.name,
        role: r.role,
        skills: r.skills,
        total_capacity: total,
        allocated_capacity: alloc
      });
      await loadWorkforce();
      showToast('Resource capacity updated');
    } catch (err) {
      alert(err.message);
    } finally {
      hideLoader();
    }
  };

  const handleDeleteResource = async (name) => {
    if (window.confirm(`Remove ${name} from available capacity resources?`)) {
      showLoader('Deleting resource...');
      try {
        await demandService.deleteResource(name);
        await loadWorkforce();
        showToast('Resource removed');
      } catch (err) {
        alert(err.message);
      } finally {
        hideLoader();
      }
    }
  };

  // Stage 4: Business Case Draft methods
  const handleGenerateBusinessCase = async () => {
    if (!selectedDemand) return;
    showLoader('Running draft generation node...');
    try {
      const res = await demandService.generateBusinessCase(selectedDemand.demand_id);
      setBusinessCaseDraft(res.business_case_summary || '');
      await fetchDemands();
      showToast('Business case draft generated');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleSaveBusinessCaseDraft = async () => {
    if (!selectedDemand) return;
    showLoader('Saving draft...');
    try {
      await demandService.saveBusinessCaseDraft(selectedDemand.demand_id, businessCaseDraft);
      await fetchDemands();
      showToast('✓ Draft saved successfully');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const handleApproveBusinessCase = async () => {
    if (!selectedDemand) return;
    showLoader('Committing final approval...');
    try {
      await demandService.approveBusinessCase(selectedDemand.demand_id, 'approved', 'Business case signed off by AI workflow.', businessCaseDraft);
      
      // Redirect to Stage 2: Sizing and pass demand_id via sessionStorage
      sessionStorage.setItem('pendingEstimateDemandId', selectedDemand.demand_id);
      await fetchDemands();
      showToast('Demand Intake final sign-off complete!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Determine Stage Wizard level status
  const isIntakeApproved = selectedDemand && ['intake', 'classified', 'capacity-checked', 'approved'].includes(selectedDemand.status);
  const isClassifyApproved = selectedDemand && ['classified', 'capacity-checked', 'approved'].includes(selectedDemand.status);
  const isCapacityApproved = selectedDemand && ['capacity-checked', 'approved'].includes(selectedDemand.status);
  const isAllApproved = selectedDemand && selectedDemand.status === 'approved';

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
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box'
            }}
          />
        </div>
        <ul className="demand-list">
          {filteredDemands.length === 0 ? (
            <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No demands found.
            </li>
          ) : (
            filteredDemands.map((d) => {
              const isActive = d.demand_id === selectedDemandId;
              return (
                <li
                  key={d.demand_id}
                  className={`demand-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectProject(d.demand_id)}
                >
                  <div className="demand-item-header">
                    <span className="demand-item-id">{d.demand_id}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <StatusPill status={d.status} />
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(e, d.demand_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-status-red-text)',
                          cursor: 'pointer',
                          padding: '0.2rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0.7
                        }}
                        title="Delete Demand"
                      >
                        <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}>
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <h4 className="demand-item-title">{d.title}</h4>
                  <div className="demand-item-meta">
                    <span>By: {d.submitted_by ? d.submitted_by.split('@')[0] : 'N/A'}</span>
                    <span>{d.submitted_date}</span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Main workspace panel */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifySpaceBetween: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Demands Queue</h2>
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
              <option value="new">+ Create New Intake</option>
              {demands.map((d) => (
                <option key={d.demand_id} value={d.demand_id}>
                  {d.demand_id} - {d.title}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div ref={panelRef} className="panel-card" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {!selectedDemand ? (
            /* RENDER NEW INTAKE FORM */
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                Capture & Structure Demand
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Submit a new business request description or upload an extraction document to start the delivery lifecycle pipeline.
              </p>

              {/* Input Mode Tabs */}
              <div className="tabs-container">
                <button
                  type="button"
                  className={`tab-btn ${activeFormTab === 'text' ? 'active' : ''}`}
                  onClick={() => setActiveFormTab('text')}
                >
                  Text Entry
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeFormTab === 'file' ? 'active' : ''}`}
                  onClick={() => setActiveFormTab('file')}
                >
                  Document Upload
                </button>
              </div>

              {/* Error Alert */}
              {errorMsg && <div className="error-message" style={{ display: 'block' }}>{errorMsg}</div>}

              <form onSubmit={handleCreateDemandSubmit}>
                <div className="form-group">
                  <label htmlFor="intake-title">Request Title (Optional - AI will generate if blank)</label>
                  <input
                    type="text"
                    id="intake-title"
                    placeholder="e.g. Mobile Checkout Redesign"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="intake-submitter">Submitter Email (Optional)</label>
                  <input
                    type="text"
                    id="intake-submitter"
                    placeholder="e.g. developer.user@company.com"
                    value={newSubmitter}
                    onChange={(e) => setNewSubmitter(e.target.value)}
                  />
                </div>

                {/* Text tab field */}
                {activeFormTab === 'text' && (
                  <div className="form-group">
                    <label htmlFor="intake-desc">Request Description *</label>
                    <textarea
                      id="intake-desc"
                      placeholder="Describe the business requirement, objectives, context, and desired outcomes..."
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                    />
                  </div>
                )}

                {/* File tab field */}
                {activeFormTab === 'file' && (
                  <div className="form-group">
                    <label>Request Document * (.txt, .pdf, .docx only)</label>
                    {!fileToUpload ? (
                      <div className="file-dropzone">
                        <svg style={{ width: '40px', height: '40px', fill: 'var(--text-muted)', marginBottom: '0.5rem' }} viewBox="0 0 24 24">
                          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                        </svg>
                        <div>Drag file here or click to select</div>
                        <input
                          type="file"
                          id="intake-file"
                          accept=".txt,.pdf,.docx"
                          onChange={(e) => {
                            if (e.target.files.length > 0) setFileToUpload(e.target.files[0]);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="file-info" style={{ display: 'flex' }}>
                        <span style={{ fontWeight: 600 }}>{fileToUpload.name}</span>
                        <button type="button" className="btn-remove" onClick={() => setFileToUpload(null)}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="submit-row" style={{ marginTop: '2rem' }}>
                  <button type="submit" className="btn-primary">
                    Submit Intake & Extract
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* RENDER INTERACTIVE PIPELINE WIZARD */
            <div>
              {/* Header Title block */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedDemand.demand_id}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)' }}>{selectedDemand.title}</h2>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Global lifecycle status</div>
                    <StatusPill status={selectedDemand.status} />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => handleDeleteProject(e, selectedDemand.demand_id)}
                    style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Delete Demand
                  </button>
                </div>
              </div>

              {/* Wizard checklist */}
              <div className="pipeline-wizard">
                
                {/* STEP 1: CAPTURE & STRUCTURE */}
                <div className="wizard-step completed">
                  <div className="wizard-step-header">
                    <h4 className="wizard-step-title">
                      <span className="wizard-step-num">1</span>
                      Capture & Structure Demand
                    </h4>
                    <StatusPill status="Approved" />
                  </div>
                  <div className="wizard-step-body">
                    <div className="grid-2col">
                      <div className="data-item">
                        <div className="data-label">Extracted Title</div>
                        <div className="data-value">{selectedDemand.title}</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Submitter</div>
                        <div className="data-value">{selectedDemand.submitted_by}</div>
                      </div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">Structured Description</div>
                      <div className="data-value" style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                        {selectedDemand.description}
                      </div>
                    </div>
                    <div className="grid-2col" style={{ marginTop: '0.75rem' }}>
                      <div className="data-item">
                        <div className="data-label">Intake Source</div>
                        <div className="data-value" style={{ textTransform: 'capitalize' }}>{selectedDemand.source}</div>
                      </div>
                      <div className="data-item">
                        <div className="data-label">Source Filename</div>
                        <div className="data-value">{selectedDemand.source_filename || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* STEP 2: CLASSIFY & ROUTE */}
                <div className={`wizard-step ${isIntakeApproved ? (isClassifyApproved ? 'completed' : 'active') : ''}`}>
                  <div className="wizard-step-header">
                    <h4 className="wizard-step-title">
                      <span className="wizard-step-num">2</span>
                      Classify & Route
                    </h4>
                    <StatusPill status={isClassifyApproved ? 'Approved' : (isIntakeApproved ? 'Pending Run' : 'Locked')} />
                  </div>
                  <div className="wizard-step-body">
                    {isClassifyApproved ? (
                      <div>
                        <div className="grid-2col">
                          <div className="data-item">
                            <div className="data-label">Request Type</div>
                            <div className="data-value" style={{ textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-brand)' }}>{selectedDemand.type}</div>
                          </div>
                          <div className="data-item">
                            <div className="data-label">Delivery Domain</div>
                            <div className="data-value">{selectedDemand.domain}</div>
                          </div>
                        </div>
                        <div className="grid-2col">
                          <div className="data-item">
                            <div className="data-label">Risk Assessment</div>
                            <div className="data-value" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{selectedDemand.risk_level}</div>
                          </div>
                          <div className="data-item">
                            <div className="data-label">Duplicate Status</div>
                            <div className="data-value">{selectedDemand.duplicate_of ? `Flagged as duplicate of ${selectedDemand.duplicate_of}` : 'Clean record (No duplicates found)'}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                          Run the agent classification graph to scan duplicates and suggest type, domain, and risk assessment parameters.
                        </p>
                        
                        {classSuggestions && (
                          <div className="suggestion-box">
                            <h5 className="suggestion-title">LangGraph Suggestions (Verify & Edit)</h5>
                            <div className="grid-2col">
                              <div className="form-group">
                                <label htmlFor="suggest-type">Type</label>
                                <select id="suggest-type" defaultValue={classSuggestions.type}>
                                  <option value="project">Project</option>
                                  <option value="enhancement">Enhancement</option>
                                  <option value="defect-fix">Defect Fix</option>
                                  <option value="compliance">Compliance</option>
                                </select>
                              </div>
                              <div className="form-group">
                                <label htmlFor="suggest-risk">Risk Level</label>
                                <select id="suggest-risk" defaultValue={classSuggestions.risk_level}>
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </div>
                            </div>
                            <div className="form-group">
                              <label htmlFor="suggest-domain">Domain</label>
                              <input type="text" id="suggest-domain" defaultValue={classSuggestions.domain || 'General Platform'} />
                              <details style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.5rem' }}>
                                <summary style={{ fontSize: '0.8rem', color: 'var(--color-brand)', cursor: 'pointer', fontWeight: 600 }}>
                                  Why was this domain suggested?
                                </summary>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', fontStyle: 'italic', lineHeight: 1.4 }}>
                                  {classSuggestions.domain_reason || 'Classification domain suggested by AI analysis.'}
                                </div>
                              </details>
                            </div>
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                              <div className="data-item">
                                <div className="data-label">Duplicate Detection Check</div>
                                <div className="data-value">
                                  {classSuggestions.duplicate_of ? (
                                    <strong style={{ color: 'var(--color-status-amber-text)' }}>DUPLICATE MATCH: {classSuggestions.duplicate_of}</strong>
                                  ) : (
                                    <span style={{ color: 'var(--color-status-green-text)' }}>Clean (No duplicates found)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="submit-row">
                          {classSuggestions ? (
                            <>
                              <button type="button" className="btn-secondary" onClick={handleRunClassify}>Re-run</button>
                              <button type="button" className="btn-primary" onClick={handleApproveClassify} style={{ marginLeft: '0.5rem' }}>Approve Suggestions</button>
                            </>
                          ) : (
                            <button type="button" className="btn-primary" onClick={handleRunClassify}>Run Classify & Route Agent</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 3: CAPACITY CHECK */}
                <div className={`wizard-step ${isClassifyApproved ? (isCapacityApproved ? 'completed' : 'active') : ''}`}>
                  <div className="wizard-step-header">
                    <h4 className="wizard-step-title">
                      <span className="wizard-step-num">3</span>
                      Capacity Check
                    </h4>
                    <StatusPill status={isCapacityApproved ? 'Approved' : (isClassifyApproved ? 'Pending Run' : 'Locked')} />
                  </div>
                  <div className="wizard-step-body">
                    {isCapacityApproved ? (
                      /* APPROVED STATE */
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                          <div className="data-item">
                            <div className="data-label">Capacity Verdict</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', fontWeight: 700, color: selectedDemand.capacity_verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}>
                              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: selectedDemand.capacity_verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}></span>
                              {selectedDemand.capacity_verdict}
                            </div>
                          </div>
                          <div className="data-item">
                            <div className="data-label">Capacity Score</div>
                            <div className="data-value"><strong>{selectedDemand.capacity_score}/100</strong></div>
                          </div>
                        </div>
                        <div className="data-item" style={{ marginBottom: '1rem' }}>
                          <div className="data-label">Risk Level</div>
                          <div className="data-value" style={{ textTransform: 'uppercase' }}>{selectedDemand.risk_level}</div>
                        </div>

                        {/* Approved staffing req table */}
                        {selectedDemand.resource_constraints && selectedDemand.resource_constraints.length > 0 && (
                          <div className="data-item" style={{ marginBottom: '1rem' }}>
                            <div className="data-label">Staffing Overview</div>
                            <div className="data-value">
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: '0.35rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '4px 8px 4px 0', fontWeight: 600, textAlign: 'left' }}>Role</th>
                                    <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>Required</th>
                                    <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>Available</th>
                                    <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedDemand.resource_constraints.map((c) => {
                                    const req = headcountFields[c.role] ?? c.requiredCapacity ?? 0;
                                    const avail = c.availableCapacity ?? 0;
                                    const isConstrained = avail < req;
                                    return (
                                      <tr key={c.role} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{c.role}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                          <input
                                            type="number"
                                            value={req}
                                            onChange={(e) => setHeadcountFields({ ...headcountFields, [c.role]: parseInt(e.target.value) || 0 })}
                                            min="0"
                                            disabled={!isEditingHeadcount}
                                            style={{ width: '55px', textAlign: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '3px', fontSize: '0.8rem', padding: '2px 4px' }}
                                          />
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center', color: isConstrained ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)', fontWeight: 600 }}>{avail}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                          {isConstrained ? (
                                            <span style={{ color: 'var(--color-status-amber-text)', fontSize: '0.75rem', fontWeight: 700 }}>⚠ Constrained</span>
                                          ) : (
                                            <span style={{ color: 'var(--color-status-green-text)', fontSize: '0.75rem', fontWeight: 700 }}>✓ OK</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              {!isAllApproved && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                                  <button type="button" className="btn-secondary" onClick={handleToggleEditHeadcount} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                                    {isEditingHeadcount ? 'Cancel' : 'Edit'}
                                  </button>
                                  <button type="button" className="btn-primary" onClick={handleSaveApprovedHeadcount} disabled={!isEditingHeadcount} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                                    Save Headcount
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {selectedDemand.skill_gaps && selectedDemand.skill_gaps.length > 0 && (
                          <div className="data-item" style={{ marginBottom: '1rem' }}>
                            <div className="data-label" style={{ color: 'var(--color-status-amber-text)' }}>Skill Gaps Detected</div>
                            <div style={{ color: 'var(--color-status-amber-text)', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {selectedDemand.skill_gaps.map((g) => (
                                <span key={g} className="tag" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: '4px' }}>{g}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="data-item">
                          <div className="data-label">AI Feasibility Reasoning</div>
                          <div style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                              {(selectedDemand.capacity_reasoning || []).map((r, index) => (
                                <li key={index}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* VERIFY CAPACITY GRAPH RUN */
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                          Query resource scheduling stubs to evaluate delivery feasibility guidelines.
                        </p>

                        {capSuggestions && (
                          <div className="suggestion-box" style={{ borderValues: capSuggestions.verdict === 'feasible' ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)', marginTop: '1rem' }}>
                            <h5 className="suggestion-title" style={{ color: capSuggestions.verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)', fontSize: '1rem', marginTop: 0, marginBottom: '0.75rem' }}>
                              Resource Verdict: {capSuggestions.verdict.toUpperCase()}
                            </h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                              <div className="data-item">
                                <div className="data-label">Capacity Score</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: capSuggestions.verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}>
                                  {capSuggestions.capacityScore}/100
                                </div>
                              </div>
                            </div>

                            {capSuggestions.resourceConstraints && capSuggestions.resourceConstraints.length > 0 && (
                              <div className="data-item" style={{ marginBottom: '0.75rem' }}>
                                <div className="data-label">Staffing Overview</div>
                                <div className="data-value">
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '4px 8px 4px 0', fontWeight: 600, textAlign: 'left' }}>Role</th>
                                        <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>Required</th>
                                        <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>Available</th>
                                        <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {capSuggestions.resourceConstraints.map((c) => {
                                        const req = headcountFields[c.role] ?? c.requiredCapacity ?? 0;
                                        const avail = c.availableCapacity ?? 0;
                                        const isConstrained = avail < req;
                                        return (
                                          <tr key={c.role} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{c.role}</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                              <input
                                                type="number"
                                                value={req}
                                                onChange={(e) => setHeadcountFields({ ...headcountFields, [c.role]: parseInt(e.target.value) || 0 })}
                                                min="0"
                                                style={{ width: '55px', textAlign: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '3px', fontSize: '0.8rem', padding: '2px 4px' }}
                                              />
                                            </td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center', color: isConstrained ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)', fontWeight: 600 }}>{avail}</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                              {isConstrained ? (
                                                <span style={{ color: 'var(--color-status-amber-text)', fontSize: '0.75rem', fontWeight: 700 }}>⚠ Constrained</span>
                                              ) : (
                                                <span style={{ color: 'var(--color-status-green-text)', fontSize: '0.75rem', fontWeight: 700 }}>✓ OK</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                    <button type="button" className="btn-primary" onClick={handleSaveSuggestionHeadcount} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                                      Save Headcount
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {capSuggestions.skillGaps && capSuggestions.skillGaps.length > 0 && (
                              <div className="data-item" style={{ marginBottom: '0.75rem' }}>
                                <div className="data-label" style={{ color: 'var(--color-status-amber-text)' }}>Skill Gaps Detected</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                                  {capSuggestions.skillGaps.map((g) => (
                                    <span key={g} className="tag" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{g}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="data-item" style={{ marginBottom: 0 }}>
                              <div className="data-label">AI Feasibility Reasoning</div>
                              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                                {(capSuggestions.reasoning || []).map((r, idx) => (
                                  <li key={idx}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {/* Workforce Manager editor */}
                        <div id="workforce-manager-container" style={{ marginBottom: '1.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem', background: 'var(--bg-secondary)', marginTop: '1.5rem' }}>
                          <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Workforce Capacity &amp; Skills Pool</span>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setWorkforceCollapsed(!workforceCollapsed)}
                              style={{ padding: '2px 8px', fontSize: '0.75rem', background: 'transparent' }}
                            >
                              {workforceCollapsed ? 'Show Pool' : 'Hide Pool'}
                            </button>
                          </h5>

                          {!workforceCollapsed && (
                            <div id="workforce-pool-details">
                              {/* Workforce Table */}
                              <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
                                {workforceList.length === 0 ? (
                                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem' }}>
                                    No resources in pool. Add one below.
                                  </div>
                                ) : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '4px 0' }}>Name</th>
                                        <th>Role</th>
                                        <th>Skills</th>
                                        <th>Total</th>
                                        <th>Alloc</th>
                                        <th style={{ textAlign: 'right', paddingRight: '4px' }}>Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {workforceList.map((r) => (
                                        <tr key={r.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                          <td style={{ padding: '6px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                                          <td style={{ color: 'var(--text-secondary)' }}>{r.role}</td>
                                          <td style={{ color: 'var(--text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.skills.join(', ')}>
                                            {r.skills.join(', ')}
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              className="res-edit-total"
                                              defaultValue={r.total_capacity}
                                              onBlur={(e) => r.total_capacity = parseInt(e.target.value) || 0}
                                              style={{ width: '40px', padding: '2px', fontSize: '0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '3px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              className="res-edit-alloc"
                                              defaultValue={r.allocated_capacity}
                                              onBlur={(e) => r.allocated_capacity = parseInt(e.target.value) || 0}
                                              style={{ width: '40px', padding: '2px', fontSize: '0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '3px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '4px' }}>
                                            <button type="button" className="btn-res-save" onClick={() => handleSaveResourceCapacities(r, r.total_capacity, r.allocated_capacity)} style={{ background: 'none', border: 'none', color: 'var(--color-status-green-text)', cursor: 'pointer', padding: '2px 4px', fontWeight: 700, fontSize: '0.7rem' }}>
                                              Save
                                            </button>
                                            <button type="button" className="btn-res-delete" onClick={() => handleDeleteResource(r.name)} style={{ background: 'none', border: 'none', color: 'var(--color-status-red-text)', cursor: 'pointer', padding: '2px 4px', fontWeight: 700, fontSize: '0.7rem' }}>
                                              Del
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              {/* Add Resource Section */}
                              <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                                <h6 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Add Resource</h6>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                  <input
                                    type="text"
                                    placeholder="Name (e.g. Emma)"
                                    value={newResName}
                                    onChange={(e) => setNewResName(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }}
                                  />
                                  <select
                                    value={newResRole}
                                    onChange={(e) => setNewResRole(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }}
                                  >
                                    <option value="Backend Developer">Backend Developer</option>
                                    <option value="Frontend Developer">Frontend Developer</option>
                                    <option value="Senior Architect">Senior Architect</option>
                                    <option value="Security Engineer">Security Engineer</option>
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="Skills (comma separated)"
                                    value={newResSkills}
                                    onChange={(e) => setNewResSkills(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }}
                                  />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                                  <input
                                    type="number"
                                    placeholder="Total Cap (e.g. 40)"
                                    value={newResTotal}
                                    onChange={(e) => setNewResTotal(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }}
                                  />
                                  <input
                                    type="number"
                                    placeholder="Alloc Cap (e.g. 20)"
                                    value={newResAlloc}
                                    onChange={(e) => setNewResAlloc(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }}
                                  />
                                  <button type="button" className="btn-primary" onClick={handleAddResource} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                                    Add
                                  </button>
                                </div>
                                {resError && <div style={{ color: 'var(--color-status-red-text)', fontSize: '0.7rem', marginTop: '0.25rem' }}>{resError}</div>}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="submit-row">
                          {capSuggestions ? (
                            <button type="button" className="btn-primary" onClick={handleApproveCapacity}>Approve Capacity Verdict</button>
                          ) : (
                            <button type="button" className="btn-primary" onClick={handleRunCapacity} disabled={!isClassifyApproved}>
                              Verify Capacity
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 4: BUSINESS CASE DRAFT */}
                <div className={`wizard-step ${isCapacityApproved ? (isAllApproved ? 'completed' : 'active') : ''}`}>
                  <div className="wizard-step-header">
                    <h4 className="wizard-step-title">
                      <span className="wizard-step-num">4</span>
                      Business Case Draft
                    </h4>
                    <StatusPill status={isAllApproved ? 'Approved' : (isCapacityApproved ? 'Pending Run' : 'Locked')} />
                  </div>
                  <div className="wizard-step-body">
                    {isAllApproved ? (
                      /* COMPLETED STATE */
                      <div>
                        <div className="data-item">
                          <div className="data-label">Signed-off Business Case Document</div>
                          <div
                            className="data-value formatted-business-case"
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', lineHeight: '1.6', fontFamily: 'var(--font-sans)' }}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedDemand.business_case_summary) }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={handleGenerateBusinessCase}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                          >
                            ↺ Re-run Business Case
                          </button>
                          <div style={{ flex: 1 }}></div>
                          <button
                            type="button"
                            onClick={() => {
                              sessionStorage.setItem('pendingEstimateDemandId', selectedDemand.demand_id);
                              navigate('/estimate-shape');
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'var(--text-primary)', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }}
                          >
                            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
                            Next: Generate Estimate &nbsp;→
                          </button>
                        </div>
                      </div>
                    ) : (selectedDemand.business_case_summary || businessCaseDraft) ? (
                      /* ACTIVE DRAFT STATE */
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                          Review and refine your business case draft below. You can save updates as draft or submit for final sign-off.
                        </p>
                        <div className="suggestion-box">
                          <h5 className="suggestion-title">Saved Business Case Draft (Edit details below)</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '0.5rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Raw Markdown Editor</label>
                              <textarea
                                value={businessCaseDraft}
                                onChange={(e) => setBusinessCaseDraft(e.target.value)}
                                style={{ minHeight: '280px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Formatted Live Preview</label>
                              <div
                                className="formatted-business-case"
                                style={{ minHeight: '280px', maxHeight: '400px', overflowY: 'auto', background: 'rgba(0,0,0,0.25)', border: '1px dashed var(--border-color)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', lineHeight: '1.6' }}
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(businessCaseDraft) }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="submit-row" style={{ marginTop: '1.5rem' }}>
                          <button type="button" className="btn-secondary" onClick={handleGenerateBusinessCase}>Re-run Draft</button>
                          <button type="button" className="btn-secondary" onClick={handleSaveBusinessCaseDraft} style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', marginLeft: '0.5rem', marginRight: '0.5rem' }}>
                            Save as Draft
                          </button>
                          <button type="button" className="btn-primary" onClick={handleApproveBusinessCase}>Approve & Sign-off Demand</button>
                        </div>
                      </div>
                    ) : (
                      /* NOT YET INITIATED DRAFT STATE */
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                          Orchestrate a draft business case document from the structured details to complete final sign-off.
                        </p>
                        <div className="submit-row">
                          <button type="button" className="btn-primary" onClick={handleGenerateBusinessCase} disabled={!isCapacityApproved}>
                            Generate Business Case Draft
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
