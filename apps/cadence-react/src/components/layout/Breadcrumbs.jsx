import { useLocation, Link } from 'react-router-dom';
import { getModuleName } from '../../constants/navigation';

export default function Breadcrumbs() {
  const location = useLocation();
  const stage = location.pathname.replace('/', '') || 'demand-intake';

  // Hide breadcrumbs on dashboard
  if (stage === 'dashboard') return null;

  const moduleName = getModuleName(stage);

  return (
    <div
      className="breadcrumbs-bar"
      id="global-breadcrumbs"
      style={{
        padding: '1rem 1.5rem 0 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      <Link
        to="/dashboard"
        style={{
          color: 'var(--color-brand)',
          textDecoration: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          fontWeight: 500,
          transition: 'color 0.2s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-brand-dark)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-brand)')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>
      <span style={{ color: 'var(--border-color)', margin: '0 0.2rem' }}>/</span>
      <span id="breadcrumb-current-module" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
        {moduleName}
      </span>
    </div>
  );
}
