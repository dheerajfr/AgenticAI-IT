import React from 'react';
import { useProject } from '../context/ProjectContext';

export default function EnvironmentState() {
  const { selectedDemand } = useProject();

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Environment State
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--text-primary)' }}>
            Infrastructure Health
          </h2>
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {selectedDemand ? `${selectedDemand.title} (${selectedDemand.demand_id})` : 'Unknown Project'}
          </div>
        </div>
      </div>

      {/* Content State */}
      <div style={{ background: 'var(--bg-primary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '4rem 2rem', textAlign: 'center' }}>
        <svg style={{ width: '48px', height: '48px', color: 'var(--text-muted)', marginBottom: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: '1.25rem' }}>
          Data Not Available
        </h3>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.5 }}>
          The integration for this module is currently under development. Once live, you will see real-time environment status, configuration drift, and deployment health here.
        </p>
      </div>
    </div>
  );
}
