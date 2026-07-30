import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useConfirmDialog } from '../components/common/ConfirmDialog';
import { apiFetch, fetchSafe } from '../api/apiClient';
import { getDemands, deleteDemand } from '../api/demandsApi';
import ProjectSidebar from '../components/common/ProjectSidebar';
import ProjectDropdown from '../components/common/ProjectDropdown';
import StatusPill from '../components/common/StatusPill';
import Spinner from '../components/common/Spinner';
import { renderMarkdown } from '../utils/markdownRenderer';

// ─── Sub-components ───────────────────────────────────────────────────────────

function NewIntakeForm({ onSuccess }) {
  const [activeTab, setActiveTab] = useState('text');
  const [title, setTitle] = useState('');
  const [submitter, setSubmitter] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const formData = new FormData();
    if (title) formData.append('title', title);
    if (submitter) formData.append('submitted_by', submitter);

    if (activeTab === 'text') {
      if (!desc.trim()) { setError('Validation Error: Please fill in the description field.'); return; }
      formData.append('description', desc);
    } else {
      if (!file) { setError('Validation Error: Please choose a file to upload.'); return; }
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['txt', 'pdf', 'docx'].includes(ext)) { setError(`Validation Error: Unsupported file type '.${ext}'. Only .txt, .pdf, and .docx are supported.`); return; }
      formData.append('file', file);
    }

    setLoading(true);
    try {
      const res = await fetch('/api/demands/intake', { method: 'POST', body: formData });
      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.detail || 'Failed to process intake request.');
      }
      const newRecord = await res.json();
      onSuccess(newRecord.demand_id);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during submission.');
      setLoading(false);
    }
  };

  return (
    <div className="panel-card">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
        Capture &amp; Structure Demand
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Submit a new business request description or upload an extraction document to start the delivery lifecycle pipeline.
      </p>

      <div className="tabs-container">
        <button className={`tab-btn${activeTab === 'text' ? ' active' : ''}`} onClick={() => setActiveTab('text')}>Text Entry</button>
        <button className={`tab-btn${activeTab === 'file' ? ' active' : ''}`} onClick={() => setActiveTab('file')}>Document Upload</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="intake-title">Request Title (Optional - AI will generate if blank)</label>
          <input id="intake-title" type="text" placeholder="e.g. Mobile Checkout Redesign" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="intake-submitter">Submitter Email (Optional)</label>
          <input id="intake-submitter" type="text" placeholder="e.g. developer.user@company.com" value={submitter} onChange={(e) => setSubmitter(e.target.value)} />
        </div>

        {activeTab === 'text' && (
          <div className="form-group">
            <label htmlFor="intake-desc">Request Description *</label>
            <textarea id="intake-desc" placeholder="Describe the business requirement, objectives, context, and desired outcomes..." value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        )}

        {activeTab === 'file' && (
          <div className="form-group">
            <label>Request Document * (.txt, .pdf, .docx only)</label>
            <div className="file-dropzone">
              <svg style={{ width: 40, height: 40, fill: 'var(--text-muted)', marginBottom: '0.5rem' }} viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
              </svg>
              <div>Drag file here or click to select</div>
              <input
                ref={fileInputRef}
                type="file"
                id="intake-file"
                accept=".txt,.pdf,.docx"
                onChange={(e) => { if (e.target.files.length > 0) setFile(e.target.files[0]); }}
              />
            </div>
            {file && (
              <div className="file-info">
                <span style={{ fontWeight: 600 }}>{file.name}</span>
                <button type="button" className="btn-remove" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Remove</button>
              </div>
            )}
          </div>
        )}

        <div className="submit-row" style={{ marginTop: '2rem' }}>
          <button type="submit" className="btn-primary" id="btn-submit-intake" disabled={loading}>
            {loading ? <span className="loader"><Spinner />Running Extraction Node...</span> : 'Submit Intake & Extract'}
          </button>
        </div>
      </form>
    </div>
  );
}

function WizardStepHeader({ num, title, status, isCompleted, isActive }) {
  const stepClass = `wizard-step${isCompleted ? ' completed' : isActive ? ' active' : ''}`;
  return (
    <div className="wizard-step-header">
      <h4 className="wizard-step-title">
        <span className="wizard-step-num">{num}</span>
        {title}
      </h4>
      <StatusPill status={status} label={status} />
    </div>
  );
}

function Step1Body({ demand }) {
  return (
    <div className="wizard-step-body">
      <div className="grid-2col">
        <div className="data-item"><div className="data-label">Extracted Title</div><div className="data-value">{demand.title}</div></div>
        <div className="data-item"><div className="data-label">Submitter</div><div className="data-value">{demand.submitted_by}</div></div>
      </div>
      <div className="data-item">
        <div className="data-label">Structured Description</div>
        <div className="data-value" style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {demand.description}
        </div>
      </div>
      <div className="grid-2col" style={{ marginTop: '0.75rem' }}>
        <div className="data-item"><div className="data-label">Intake Source</div><div className="data-value" style={{ textTransform: 'capitalize' }}>{demand.source}</div></div>
        <div className="data-item"><div className="data-label">Source Filename</div><div className="data-value">{demand.source_filename || 'N/A'}</div></div>
      </div>
    </div>
  );
}

function Step2Body({ demand, isClassifyApproved, onRunClassify, onApproveClassify }) {
  const [classifySuggestions, setClassifySuggestions] = useState(null);
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyError, setClassifyError] = useState(null);
  const [editType, setEditType] = useState('');
  const [editRisk, setEditRisk] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);

  const handleRun = async () => {
    setClassifyLoading(true);
    setClassifyError(null);
    setClassifySuggestions(null);
    try {
      const res = await fetch(`/api/demands/${demand.demand_id}/classify-route`, { method: 'POST' });
      if (!res.ok) throw new Error('Classification call failed');
      const data = await res.json();
      setClassifySuggestions(data);
      setEditType(data.type || '');
      setEditRisk(data.risk_level || '');
      setEditDomain(data.domain || '');
    } catch (err) {
      setClassifyError(err.message);
    } finally {
      setClassifyLoading(false);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    try {
      const res = await fetch(`/api/demands/${demand.demand_id}/approve-classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: editType, risk_level: editRisk, domain: editDomain, duplicate_of: classifySuggestions?.duplicate_of }),
      });
      if (!res.ok) throw new Error('Approval submission failed');
      onApproveClassify();
    } catch (err) {
      setClassifyError(err.message);
      setApproveLoading(false);
    }
  };

  if (isClassifyApproved) {
    return (
      <div className="wizard-step-body">
        <div className="grid-2col">
          <div className="data-item"><div className="data-label">Request Type</div><div className="data-value" style={{ textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-brand)' }}>{demand.type}</div></div>
          <div className="data-item"><div className="data-label">Delivery Domain</div><div className="data-value">{demand.domain}</div></div>
        </div>
        <div className="grid-2col">
          <div className="data-item"><div className="data-label">Risk Assessment</div><div className="data-value" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{demand.risk_level}</div></div>
          <div className="data-item"><div className="data-label">Duplicate Status</div><div className="data-value">{demand.duplicate_of ? <span>Flagged as duplicate of <strong style={{ color: 'var(--color-status-amber-text)' }}>{demand.duplicate_of}</strong></span> : 'Clean record (No duplicates found)'}</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-step-body">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
        Run the agent classification graph to scan duplicates and suggest type, domain, and risk assessment parameters.
      </p>
      {classifyError && <div className="error-message">{classifyError}</div>}
      {classifySuggestions && (
        <div className="suggestion-box">
          <h5 className="suggestion-title">LangGraph Suggestions (Verify &amp; Edit)</h5>
          <div className="grid-2col">
            <div className="form-group">
              <label htmlFor="suggest-type">Type</label>
              <select id="suggest-type" value={editType} onChange={(e) => setEditType(e.target.value)}>
                <option value="project">Project</option>
                <option value="enhancement">Enhancement</option>
                <option value="defect-fix">Defect Fix</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="suggest-risk">Risk Level</label>
              <select id="suggest-risk" value={editRisk} onChange={(e) => setEditRisk(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="suggest-domain">Domain</label>
            <input id="suggest-domain" type="text" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
            <details style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.5rem' }}>
              <summary style={{ fontSize: '0.8rem', color: 'var(--color-brand)', cursor: 'pointer', fontWeight: 600 }}>Why was this domain suggested?</summary>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', fontStyle: 'italic', lineHeight: 1.4 }}>
                {classifySuggestions.domain_reason || 'Classification domain suggested by AI analysis.'}
              </div>
            </details>
          </div>
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <div className="data-item">
              <div className="data-label">Duplicate Detection Check</div>
              <div className="data-value">
                {classifySuggestions.duplicate_of ? <strong style={{ color: 'var(--color-status-amber-text)' }}>DUPLICATE MATCH: {classifySuggestions.duplicate_of}</strong> : <span style={{ color: 'var(--color-status-green-text)' }}>Clean (No duplicates found)</span>}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="submit-row" id="classify-actions-row">
        {classifySuggestions ? (
          <>
            <button type="button" className="btn-secondary" onClick={handleRun} disabled={classifyLoading}>Re-run</button>
            <button type="button" className="btn-primary" onClick={handleApprove} disabled={approveLoading}>
              {approveLoading ? <span className="loader"><Spinner />Saving...</span> : 'Approve Suggestions'}
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary" id="btn-run-classify" onClick={handleRun} disabled={classifyLoading}>
            {classifyLoading ? <span className="loader"><Spinner />Running classify → duplicate-check → route nodes...</span> : 'Run Classify & Route Agent'}
          </button>
        )}
      </div>
    </div>
  );
}

function Step3Body({ demand, isCapacityApproved, isAllApproved, onApproveCapacity }) {
  const [capacitySuggestion, setCapacitySuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [staffingOverrides, setStaffingOverrides] = useState({});
  const [editingHeadcount, setEditingHeadcount] = useState(false);
  const [headcountValues, setHeadcountValues] = useState({});
  const [workforce, setWorkforce] = useState([]);
  const [workforceLoading, setWorkforceLoading] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const [newRes, setNewRes] = useState({ name: '', role: 'Backend Developer', skills: '', total: '', alloc: '' });
  const [addResError, setAddResError] = useState('');

  const loadWorkforce = async () => {
    setWorkforceLoading(true);
    const data = await fetchSafe('/api/demands/resources');
    setWorkforce(data || []);
    setWorkforceLoading(false);
  };

  useEffect(() => {
    if (!isCapacityApproved) loadWorkforce();
    if (isCapacityApproved && demand.resource_constraints) {
      const vals = {};
      demand.resource_constraints.forEach((c) => { vals[c.role] = c.requiredCapacity ?? 0; });
      setHeadcountValues(vals);
    }
  }, [isCapacityApproved, demand]);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setCapacitySuggestion(null);
    try {
      const res = await fetch(`/api/demands/${demand.demand_id}/capacity-check`, { method: 'POST' });
      if (!res.ok) throw new Error('Capacity stub failed');
      const data = await res.json();
      setCapacitySuggestion(data);
      const overrides = {};
      if (data.resourceConstraints) {
        data.resourceConstraints.forEach((c) => { overrides[c.role] = c.requiredCapacity ?? 0; });
      }
      setStaffingOverrides(overrides);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    const resourceConstraints = Object.entries(staffingOverrides).map(([role, val]) => ({ role, requiredCapacity: val }));
    try {
      const res = await fetch(`/api/demands/${demand.demand_id}/approve-capacity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: capacitySuggestion?.verdict || 'feasible', resourceConstraints }),
      });
      if (!res.ok) throw new Error('Failed to save capacity validation.');
      onApproveCapacity();
    } catch (err) {
      setError(err.message);
      setApproveLoading(false);
    }
  };

  const handleSaveApprovedHeadcount = async () => {
    const resourceConstraints = demand.resource_constraints.map((c) => ({
      role: c.role,
      requiredCapacity: headcountValues[c.role] ?? c.requiredCapacity ?? 0,
    }));
    try {
      await apiFetch(`/api/demands/${demand.demand_id}/approve-capacity`, {
        method: 'POST',
        body: JSON.stringify({ verdict: demand.capacity_verdict || 'feasible', resourceConstraints }),
      });
      setEditingHeadcount(false);
      onApproveCapacity();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddResource = async () => {
    setAddResError('');
    if (!newRes.name || !newRes.skills) { setAddResError('Name and skills are required.'); return; }
    try {
      await apiFetch('/api/demands/resources', {
        method: 'POST',
        body: JSON.stringify({
          name: newRes.name, role: newRes.role,
          skills: newRes.skills.split(',').map((s) => s.trim()),
          total_capacity: parseInt(newRes.total) || 40,
          allocated_capacity: parseInt(newRes.alloc) || 0,
        }),
      });
      setNewRes({ name: '', role: 'Backend Developer', skills: '', total: '', alloc: '' });
      loadWorkforce();
    } catch (err) {
      setAddResError(err.message);
    }
  };

  if (isCapacityApproved) {
    return (
      <div className="wizard-step-body">
        {demand.capacity_score !== undefined && demand.capacity_score !== null ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="data-item">
                <div className="data-label">Capacity Verdict</div>
                <div className="data-value" style={{ textTransform: 'uppercase', fontWeight: 700, color: demand.capacity_verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}>
                  {demand.capacity_verdict}
                </div>
              </div>
              <div className="data-item">
                <div className="data-label">Capacity Score</div>
                <div className="data-value"><strong>{demand.capacity_score}/100</strong></div>
              </div>
            </div>
            {demand.resource_constraints && demand.resource_constraints.length > 0 && (
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
                      {demand.resource_constraints.map((c) => {
                        const req = c.requiredCapacity ?? 0;
                        const avail = c.availableCapacity ?? 0;
                        const constrained = avail < req;
                        return (
                          <tr key={c.role} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <td style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>{c.role}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                value={headcountValues[c.role] ?? req}
                                disabled={!editingHeadcount}
                                onChange={(e) => setHeadcountValues((v) => ({ ...v, [c.role]: parseInt(e.target.value) || 0 }))}
                                style={{ width: 55, textAlign: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 3, fontSize: '0.8rem', padding: '2px 4px' }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', color: constrained ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)', fontWeight: 600 }}>{avail}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>{constrained ? <span style={{ color: 'var(--color-status-amber-text)', fontSize: '0.75rem', fontWeight: 700 }}>⚠ Constrained</span> : <span style={{ color: 'var(--color-status-green-text)', fontSize: '0.75rem', fontWeight: 700 }}>✓ OK</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!isAllApproved && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setEditingHeadcount((v) => !v)}>
                        {editingHeadcount ? 'Cancel' : 'Edit'}
                      </button>
                      {editingHeadcount && (
                        <button type="button" className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={handleSaveApprovedHeadcount}>
                          Save Headcount
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {demand.skill_gaps && demand.skill_gaps.length > 0 && (
              <div className="data-item" style={{ marginBottom: '1rem' }}>
                <div className="data-label" style={{ color: 'var(--color-status-amber-text)' }}>Skill Gaps Detected</div>
                <div className="data-value" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {demand.skill_gaps.map((g, i) => <span key={i} style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{g}</span>)}
                </div>
              </div>
            )}
            <div className="data-item">
              <div className="data-label">AI Feasibility Reasoning</div>
              <div className="data-value" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                  {(demand.capacity_reasoning || []).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="data-item"><div className="data-label">Capacity Status</div><div className="data-value"><strong>Feasible</strong></div></div>
            <div className="data-item"><div className="data-label">Analysis Summary</div><div className="data-value" style={{ fontSize: '0.85rem' }}>Automated delivery queue verified. Staging environments and core developer logs confirm bandwidth.</div></div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="wizard-step-body">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
        Query resource scheduling stubs to evaluate delivery feasibility guidelines.
      </p>
      {error && <div className="error-message">{error}</div>}
      {capacitySuggestion && (
        <div className="suggestion-box" style={{ borderColor: capacitySuggestion.verdict === 'feasible' ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)', marginTop: '1rem' }}>
          <h5 className="suggestion-title" style={{ color: capacitySuggestion.verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)', fontSize: '1rem', marginTop: 0, marginBottom: '0.75rem' }}>
            Resource Verdict: {capacitySuggestion.verdict.toUpperCase()}
          </h5>
          <div className="data-item" style={{ marginBottom: '0.75rem' }}>
            <div className="data-label">Capacity Score</div>
            <div className="data-value" style={{ fontSize: '1.1rem', fontWeight: 700, color: capacitySuggestion.verdict === 'feasible' ? 'var(--color-status-green-text)' : 'var(--color-status-amber-text)' }}>
              {capacitySuggestion.capacityScore}/100
            </div>
          </div>
          {capacitySuggestion.resourceConstraints && capacitySuggestion.resourceConstraints.length > 0 && (
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
                    {capacitySuggestion.resourceConstraints.map((c) => {
                      const req = staffingOverrides[c.role] ?? c.requiredCapacity ?? 0;
                      const avail = c.availableCapacity ?? 0;
                      const constrained = avail < req;
                      return (
                        <tr key={c.role} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <td style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>{c.role}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <input
                              type="number"
                              value={req}
                              onChange={(e) => setStaffingOverrides((o) => ({ ...o, [c.role]: parseInt(e.target.value) || 0 }))}
                              style={{ width: 55, textAlign: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 3, fontSize: '0.8rem', padding: '2px 4px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: constrained ? 'var(--color-status-amber-text)' : 'var(--color-status-green-text)', fontWeight: 600 }}>{avail}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{constrained ? <span style={{ color: 'var(--color-status-amber-text)', fontSize: '0.75rem', fontWeight: 700 }}>⚠ Constrained</span> : <span style={{ color: 'var(--color-status-green-text)', fontSize: '0.75rem', fontWeight: 700 }}>✓ OK</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {capacitySuggestion.skillGaps && capacitySuggestion.skillGaps.length > 0 && (
            <div className="data-item" style={{ marginBottom: '0.75rem' }}>
              <div className="data-label" style={{ color: 'var(--color-status-amber-text)' }}>Skill Gaps Detected</div>
              <div className="data-value" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                {capacitySuggestion.skillGaps.map((g, i) => <span key={i} style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{g}</span>)}
              </div>
            </div>
          )}
          <div className="data-item">
            <div className="data-label">AI Feasibility Reasoning</div>
            <div className="data-value">
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                {(capacitySuggestion.reasoning || []).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Workforce Pool */}
      <div style={{ marginBottom: '1.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem', background: 'var(--bg-secondary)', marginTop: '1rem' }}>
        <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Workforce Capacity &amp; Skills Pool</span>
          <button type="button" className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem', background: 'transparent' }} onClick={() => setShowPool((v) => !v)}>
            {showPool ? 'Hide Pool' : 'Show Pool'}
          </button>
        </h5>
        {showPool && (
          <>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: '1rem' }}>
              {workforceLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem' }}>Loading workforce pool...</div>
              ) : workforce.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem' }}>No resources in pool. Add one below.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '4px 0' }}>Name</th>
                      <th>Role</th>
                      <th>Skills</th>
                      <th>Total</th>
                      <th>Alloc</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workforce.map((r) => (
                      <tr key={r.name} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        <td style={{ padding: '6px 0', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{r.role}</td>
                        <td style={{ color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.skills.join(', ')}>{r.skills.join(', ')}</td>
                        <td>{r.total_capacity}</td>
                        <td>{r.allocated_capacity}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--color-status-red-text)', cursor: 'pointer', padding: '2px 4px', fontWeight: 700, fontSize: '0.7rem' }}
                            onClick={async () => {
                              await apiFetch(`/api/demands/resources/${encodeURIComponent(r.name)}`, { method: 'DELETE' });
                              loadWorkforce();
                            }}>
                            Del
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.75rem' }}>
              <h6 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Add Resource</h6>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input type="text" placeholder="Name (e.g. Emma)" value={newRes.name} onChange={(e) => setNewRes((r) => ({ ...r, name: e.target.value }))} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }} />
                <select value={newRes.role} onChange={(e) => setNewRes((r) => ({ ...r, role: e.target.value }))} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }}>
                  <option>Backend Developer</option>
                  <option>Frontend Developer</option>
                  <option>Senior Architect</option>
                  <option>Security Engineer</option>
                </select>
                <input type="text" placeholder="Skills (comma separated)" value={newRes.skills} onChange={(e) => setNewRes((r) => ({ ...r, skills: e.target.value }))} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                <input type="number" placeholder="Total Cap (e.g. 40)" value={newRes.total} onChange={(e) => setNewRes((r) => ({ ...r, total: e.target.value }))} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }} />
                <input type="number" placeholder="Alloc Cap (e.g. 20)" value={newRes.alloc} onChange={(e) => setNewRes((r) => ({ ...r, alloc: e.target.value }))} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)' }} />
                <button type="button" className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.75rem' }} onClick={handleAddResource}>Add</button>
              </div>
              {addResError && <div style={{ color: 'var(--color-status-red-text)', fontSize: '0.7rem', marginTop: '0.25rem' }}>{addResError}</div>}
            </div>
          </>
        )}
      </div>

      <div className="submit-row" id="capacity-actions-row">
        {capacitySuggestion ? (
          <button type="button" className="btn-primary" onClick={handleApprove} disabled={approveLoading}>
            {approveLoading ? <span className="loader"><Spinner />Committing capacity sign-off...</span> : 'Approve Capacity Verdict'}
          </button>
        ) : (
          <button type="button" className="btn-primary" id="btn-run-capacity" onClick={handleRun} disabled={loading}>
            {loading ? <span className="loader"><Spinner />Querying platform capacity logs...</span> : 'Verify Capacity'}
          </button>
        )}
      </div>
    </div>
  );
}

function Step4Body({ demand, isAllApproved, isCapacityApproved, onApprove, onRerun, onProceedToEstimate }) {
  const [bcLoading, setBcLoading] = useState(false);
  const [bcError, setBcError] = useState(null);
  const [bcText, setBcText] = useState(demand.business_case_summary || '');
  const [saveLoading, setSaveLoading] = useState(false);

  const handleRunBc = async () => {
    setBcLoading(true);
    setBcError(null);
    try {
      const res = await fetch(`/api/demands/${demand.demand_id}/business-case`, { method: 'POST' });
      if (!res.ok) { const b = await res.json(); throw new Error(b.detail || 'Failed to generate business case.'); }
      const data = await res.json();
      setBcText(data.business_case_summary || '');
      onRerun();
    } catch (err) {
      setBcError(err.message);
    } finally {
      setBcLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaveLoading(true);
    try {
      await apiFetch(`/api/demands/${demand.demand_id}`, {
        method: 'PUT',
        body: JSON.stringify({ business_case_summary: bcText }),
      });
    } catch (err) {
      setBcError(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      await apiFetch(`/api/demands/${demand.demand_id}/approve-business-case`, {
        method: 'POST',
        body: JSON.stringify({ business_case_summary: bcText }),
      });
      onApprove();
    } catch (err) {
      setBcError(err.message);
    }
  };

  if (isAllApproved) {
    return (
      <div className="wizard-step-body">
        <div className="data-item">
          <div className="data-label">Signed-off Business Case Document</div>
          <div
            className="data-value formatted-business-case"
            style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', lineHeight: 1.6, fontFamily: 'var(--font-sans)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(demand.business_case_summary) }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <button type="button" id="btn-redo-business-case"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            onClick={handleRunBc} disabled={bcLoading}
          >
            {bcLoading ? <Spinner size={14} /> : '↺'} Re-run Business Case
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" id="btn-proceed-to-estimate"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }}
            onClick={onProceedToEstimate}
          >
            <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
            Next: Generate Estimate &nbsp;→
          </button>
        </div>
      </div>
    );
  }

  if (demand.business_case_summary || bcText) {
    const textToShow = bcText || demand.business_case_summary;
    return (
      <div className="wizard-step-body">
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
          Review and refine your business case draft below. You can save updates as draft or submit for final sign-off.
        </p>
        {bcError && <div className="error-message">{bcError}</div>}
        <div id="business-case-suggestion-container">
          <div className="suggestion-box">
            <h5 className="suggestion-title">Saved Business Case Draft (Edit details below)</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '0.5rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Raw Markdown Editor</label>
                <textarea id="edit-business-case" style={{ minHeight: 280, fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.5, padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  value={textToShow} onChange={(e) => setBcText(e.target.value)} />
              </div>
              <div>
                <label style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Formatted Live Preview</label>
                <div id="business-case-preview" className="formatted-business-case" style={{ minHeight: 280, maxHeight: 400, overflowY: 'auto', background: 'rgba(0,0,0,0.04)', border: '1px dashed var(--border-color)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(textToShow) }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="submit-row" id="business-case-actions-row">
          <button type="button" className="btn-secondary" id="btn-re-run-business-case" onClick={handleRunBc} disabled={bcLoading}>{bcLoading ? 'Running...' : 'Re-run Draft'}</button>
          <button type="button" className="btn-secondary" id="btn-save-business-case-draft" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', marginLeft: '0.5rem', marginRight: '0.5rem' }} onClick={handleSaveDraft} disabled={saveLoading}>{saveLoading ? 'Saving...' : 'Save as Draft'}</button>
          <button type="button" className="btn-primary" id="btn-approve-business-case" onClick={handleApprove}>Approve &amp; Sign-off Demand</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-step-body">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
        Orchestrate a draft business case document from the structured details to complete final sign-off.
      </p>
      {bcError && <div className="error-message">{bcError}</div>}
      <div className="submit-row" id="business-case-actions-row">
        <button type="button" className="btn-primary" id="btn-run-business-case" onClick={handleRunBc} disabled={bcLoading || !isCapacityApproved}>
          {bcLoading ? <span className="loader"><Spinner />Generating...</span> : 'Generate Business Case Draft'}
        </button>
      </div>
    </div>
  );
}

function DemandWizard({ demand, onRefresh, onDelete }) {
  const navigate = useNavigate();
  const { confirm, DialogComponent } = useConfirmDialog();
  const { selectDemand } = useAppContext();

  const isIntakeApproved = ['intake', 'classified', 'capacity-checked', 'approved'].includes(demand.status);
  const isClassifyApproved = ['classified', 'capacity-checked', 'approved'].includes(demand.status);
  const isCapacityApproved = ['capacity-checked', 'approved'].includes(demand.status);
  const isAllApproved = demand.status === 'approved';

  const handleDelete = async () => {
    const ok = await confirm('Delete Demand', 'Are you sure you want to delete this demand? This cannot be undone.');
    if (!ok) return;
    await onDelete(demand.demand_id);
  };

  const handleProceedToEstimate = () => {
    selectDemand(demand.demand_id);
    navigate('/estimate-shape');
  };

  return (
    <div className="panel-card" style={{ paddingTop: '1rem' }}>
      {DialogComponent}
      {/* Title block */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{demand.demand_id}</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: '0.2rem 0 0 0', color: 'var(--text-primary)' }}>{demand.title}</h2>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Global lifecycle status</div>
            <StatusPill status={demand.status} label={demand.status} />
          </div>
          <button type="button" className="btn-secondary" id="btn-delete-demand" style={{ color: 'var(--color-status-red-text)', borderColor: 'var(--color-status-red-text)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={handleDelete}>
            Delete Demand
          </button>
        </div>
      </div>

      {/* Pipeline Wizard */}
      <div className="pipeline-wizard">
        {/* Step 1 */}
        <div className={`wizard-step completed`}>
          <WizardStepHeader num={1} title="Capture & Structure Demand" status="Approved" isCompleted isActive={false} />
          <Step1Body demand={demand} />
        </div>

        {/* Step 2 */}
        <div className={`wizard-step${isIntakeApproved ? (isClassifyApproved ? ' completed' : ' active') : ''}`}>
          <WizardStepHeader num={2} title="Classify & Route" status={isClassifyApproved ? 'Approved' : (isIntakeApproved ? 'Pending Run' : 'Locked')} isCompleted={isClassifyApproved} isActive={isIntakeApproved && !isClassifyApproved} />
          <Step2Body demand={demand} isClassifyApproved={isClassifyApproved} onApproveClassify={onRefresh} />
        </div>

        {/* Step 3 */}
        <div className={`wizard-step${isClassifyApproved ? (isCapacityApproved ? ' completed' : ' active') : ''}`}>
          <WizardStepHeader num={3} title="Capacity Check" status={isCapacityApproved ? 'Approved' : (isClassifyApproved ? 'Pending Run' : 'Locked')} isCompleted={isCapacityApproved} isActive={isClassifyApproved && !isCapacityApproved} />
          {isClassifyApproved && (
            <Step3Body demand={demand} isCapacityApproved={isCapacityApproved} isAllApproved={isAllApproved} onApproveCapacity={onRefresh} />
          )}
        </div>

        {/* Step 4 */}
        <div className={`wizard-step${isCapacityApproved ? (isAllApproved ? ' completed' : ' active') : ''}`}>
          <WizardStepHeader num={4} title="Business Case Draft" status={isAllApproved ? 'Approved' : (isCapacityApproved ? 'Pending Run' : 'Locked')} isCompleted={isAllApproved} isActive={isCapacityApproved && !isAllApproved} />
          {isCapacityApproved && (
            <Step4Body
              demand={demand}
              isAllApproved={isAllApproved}
              isCapacityApproved={isCapacityApproved}
              onApprove={onRefresh}
              onRerun={onRefresh}
              onProceedToEstimate={handleProceedToEstimate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DemandIntakePage() {
  const { selectedDemandId, selectDemand, setDemands } = useAppContext();
  const [demands, setLocalDemands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(selectedDemandId || null);
  const [showNewForm, setShowNewForm] = useState(!selectedDemandId);
  const { confirm, DialogComponent } = useConfirmDialog();

  const fetchDemands = useCallback(async (overrideId) => {
    setLoading(true);
    setError(null);
    const data = await getDemands();
    setLoading(false);
    if (data) {
      setLocalDemands(data);
      setDemands(data);
      const activeId = overrideId !== undefined ? overrideId : selectedId;
      const exists = data.some((d) => d.demand_id === activeId);
      if (activeId && exists) setShowNewForm(false);
      else if (!data.length || !activeId) setShowNewForm(true);
    } else {
      setError(true);
      setShowNewForm(true);
    }
  }, [selectedId, setDemands]);

  useEffect(() => { fetchDemands(); }, []);

  const handleSelect = (id) => {
    setSelectedId(id);
    selectDemand(id);
    setShowNewForm(false);
  };

  const handleDropdownChange = (val) => {
    if (val === 'new') {
      setSelectedId(null);
      selectDemand(null);
      setShowNewForm(true);
    } else {
      handleSelect(val);
    }
  };

  const handleDelete = async (id) => {
    await deleteDemand(id);
    setSelectedId(null);
    selectDemand(null);
    await fetchDemands();
    setShowNewForm(true);
  };

  const handleNewSuccess = async (demandId) => {
    setSelectedId(demandId);
    selectDemand(demandId);
    setShowNewForm(false);
    await fetchDemands(demandId);
  };

  const selectedDemand = demands.find((d) => d.demand_id === selectedId);

  return (
    <div className="intake-screen">
      {DialogComponent}
      {/* Left Sidebar */}
      <ProjectSidebar
        items={demands}
        selectedId={selectedId}
        onSelect={handleSelect}
        onDelete={handleDelete}
        idKey="demand_id"
        titleKey="title"
        statusKey="status"
        loading={loading && !demands.length}
        error={error}
        metaLeft={(item) => `By: ${item.submitted_by?.split('@')[0] || 'Unknown'}`}
        metaRight={(item) => item.submitted_date || ''}
        emptyMessage="No demands found. Submit one below."
      />

      {/* Right Panel */}
      <main className="details-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="main-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Demands Queue</h2>
          <div id="demand-intake-dropdown-container">
            <ProjectDropdown
              demands={demands}
              selectedId={selectedId || ''}
              onChange={handleDropdownChange}
              includeNew
              newLabel="+ Create New Intake"
            />
          </div>
        </header>
        <div id="details-panel-container" style={{ flex: 1, overflowY: 'auto' }}>
          {showNewForm || !selectedDemand ? (
            <NewIntakeForm onSuccess={handleNewSuccess} />
          ) : (
            <DemandWizard
              demand={selectedDemand}
              onRefresh={fetchDemands}
              onDelete={handleDelete}
            />
          )}
        </div>
      </main>
    </div>
  );
}
