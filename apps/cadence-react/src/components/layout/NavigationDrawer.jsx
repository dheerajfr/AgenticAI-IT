import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavigationConfig } from '../../constants/navigation';
import { useAppContext } from '../../context/AppContext';

export default function NavigationDrawer() {
  const { navMenuOpen, setNavMenuOpen } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const drawerRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && navMenuOpen) {
        setNavMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navMenuOpen, setNavMenuOpen]);

  const handleNavClick = (stageId) => {
    setNavMenuOpen(false);
    navigate(`/${stageId}`);
  };

  // Current active stage from URL
  const activeStage = location.pathname.replace('/', '') || 'demand-intake';

  const visibleNav = NavigationConfig.filter((item) => !item.hidden);

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
          opacity: navMenuOpen ? 1 : 0,
          pointerEvents: navMenuOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
        onClick={() => setNavMenuOpen(false)}
      />

      {/* Drawer */}
      <nav
        ref={drawerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: navMenuOpen ? 0 : '-300px',
          width: '280px',
          height: '100vh',
          backgroundColor: 'var(--bg-primary)',
          borderRight: '1px solid var(--border-color)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        aria-label="Navigation drawer"
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.1rem',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Menu
          </h2>
          <button
            onClick={() => setNavMenuOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.25rem',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Nav List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {visibleNav.map((item) => {
            const isActive = activeStage === item.id || (item.id === 'always-on' && ['risk-issues', 'budget-cost', 'vendor-coordination', 'reporting-communication', 'knowledge-artifacts'].includes(activeStage));
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem 1.5rem',
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-brand)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.95rem',
                  fontWeight: isActive ? 600 : 500,
                  borderLeft: isActive ? '4px solid var(--color-brand)' : '4px solid transparent',
                  backgroundColor: isActive ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '4px solid var(--color-brand)' : '4px solid transparent',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'currentColor', flexShrink: 0 }}>
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
