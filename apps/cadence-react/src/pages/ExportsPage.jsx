import { useAppContext } from '../context/AppContext';

export default function ExportsPage() {
  const { selectedDemandId, demands } = useAppContext();
  const demand = demands.find((d) => d.demand_id === selectedDemandId);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Data Exports
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--text-primary)' }}>
            System Extracts
          </h2>
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {demand?.title || 'Unknown Project'} ({selectedDemandId || 'Unknown ID'})
          </div>
        </div>
      </div>

      {/* Placeholder Content */}
      <div style={{ background: 'var(--bg-primary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '4rem 2rem', textAlign: 'center' }}>
        <svg style={{ width: 48, height: 48, color: 'var(--text-muted)', margin: '0 auto 1rem', display: 'block' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.25rem' }}>
          Data Not Available
        </h3>
        <p style={{ margin: '0 auto', color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.5 }}>
          The integration for this module is currently under development. Once live, you will see downloadable reports, audit trails, and raw data extracts here.
        </p>
      </div>
    </div>
  );
}
