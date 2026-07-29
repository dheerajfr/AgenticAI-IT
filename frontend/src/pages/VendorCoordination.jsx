import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../context/UIContext';
import { vendorService } from '../services/vendorService';
import { demandService } from '../services/demandService';
import { budgetService } from '../services/budgetService';

export default function VendorCoordination() {
  const { showLoader, hideLoader, showToast } = useUI();
  const navigate = useNavigate();

  // Core demands listing
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandId] = useState(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Hydrated details state
  const [vendorData, setVendorData] = useState(null);
  const [invoiceCount, setInvoiceCount] = useState(0);

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

  const loadVendorDetails = async (id) => {
    if (!id) return;
    showLoader('Auditing vendor outputs...');
    try {
      const res = await vendorService.getVendorProject(id);
      setVendorData(res);

      const invs = await budgetService.getInvoices(id).catch(() => []);
      setInvoiceCount(invs.length);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    if (selectedDemandId) {
      loadVendorDetails(selectedDemandId);
    }
  }, [selectedDemandId]);

  const handleSelectDemand = (id) => {
    setSelectedDemandId(id);
    sessionStorage.setItem('selectedDemandId', id);
  };

  // Check SOW deliverables consistency
  const handleCheckSow = async () => {
    if (!selectedDemandId) return;
    showLoader('Cross-referencing SOW deliverables vs tickets...');
    try {
      await vendorService.checkSow({ demand_id: selectedDemandId });
      await loadVendorDetails(selectedDemandId);
      showToast('✓ SOW deliverables scan complete');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  // Revoke inactive developer account access
  const handleRevokeAccess = async (user) => {
    showLoader(`Revoking access for user ${user}...`);
    try {
      await vendorService.revokeAccess(selectedDemandId, user);
      await loadVendorDetails(selectedDemandId);
      showToast(`✓ Stale credentials revoked for ${user}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      hideLoader();
    }
  };

  const filteredDemands = demands.filter((d) => {
    const q = searchTerm.toLowerCase();
    return d.demand_id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const sla = vendorData?.sla_tracking || {};
  const discrepancies = vendorData?.sow_discrepancies || [];
  const alerts = vendorData?.access_alerts || [];

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
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Vendor Coordination</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Always-on Capability - SOW &amp; Access Tracking
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
              Select a project from the left sidebar or dropdown list to load vendor sheets.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              
              {/* Left Column: Milestones & SOW Discrepancies */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SLA &amp; Milestone Tracking</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '4px' }}>Human Monitors</span>
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    AI reconciles vendor claims vs. actual code/ticket output.
                  </p>
                  <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vendor Claims</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{sla.vendor_claims || 0} items</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Actual Outputs</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (sla.vendor_claims > sla.actual_outputs) ? '#fbbf24' : '#10b981' }}>{sla.actual_outputs || 0} items</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Generated Invoices</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-brand)' }}>{invoiceCount} invoices</div>
                    </div>
                  </div>
                  {sla.vendor_claims > sla.actual_outputs && (
                    <div style={{ fontSize: '0.85rem', color: '#fbbf24' }}>Discrepancy detected between claims and outputs.</div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SOW Discrepancy Check</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>Human Directs</span>
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    AI flags missing deliverables between SOW and PM tool.
                  </p>
                  <button onClick={handleCheckSow} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginBottom: '1rem' }}>Check SOW vs Tools</button>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {discrepancies.map((d, idx) => (
                      <div key={idx} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '3px solid #fbbf24', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{d.description}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.ai_analysis}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Inactive Access Offboarding */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Access &amp; Offboarding</span>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>Human Approves</span>
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  AI recommends disabling stale vendor access keys.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {alerts.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', text: 'center' }}>No stale developer access keys found.</div>
                  ) : (
                    alerts.map((a) => (
                      <div key={a.user} style={{ padding: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{a.user}</div>
                          <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>Inactive: {a.last_active}</div>
                        </div>
                        <button onClick={() => handleRevokeAccess(a.user)} className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#ef4444' }}>Revoke</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/always-on/reporting-communication')} className="btn-primary" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 700, padding: '0.75rem 1.5rem' }}>
            Proceed to Reporting &amp; Comms &rarr;
          </button>
        </div>
      </main>
    </div>
  );
}
