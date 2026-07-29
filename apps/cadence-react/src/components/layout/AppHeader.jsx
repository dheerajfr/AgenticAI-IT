import { useAppContext } from '../../context/AppContext';

export default function AppHeader() {
  const { setNavMenuOpen } = useAppContext();

  return (
    <header>
      <div className="logo-container">
        <button
          id="btn-menu-toggle"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            marginRight: '0.5rem',
          }}
          onClick={() => setNavMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        </button>
        <span className="logo-text">CADENCE</span>
      </div>
      <div className="user-profile" style={{ display: 'none' }} />
    </header>
  );
}
