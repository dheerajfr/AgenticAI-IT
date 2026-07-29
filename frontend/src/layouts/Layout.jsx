import React, { useState } from 'react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import NavigationMenu from '../components/layout/NavigationMenu';
import { getModuleName } from '../constants/navigation';

export default function Layout() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const location = useLocation();

  // Determine current active stage based on route
  const currentPath = location.pathname.substring(1) || 'dashboard';
  
  // Always-On active sub-module identification
  let activeModuleId = currentPath;
  if (currentPath.startsWith('always-on/')) {
    activeModuleId = currentPath.split('/')[1];
  }

  const showBreadcrumbs = activeModuleId !== 'dashboard';
  const moduleLabel = getModuleName(activeModuleId);

  return (
    <div className="app-container">
      {/* Header */}
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
            onClick={() => setIsNavOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          </button>
          <span className="logo-text">CADENCE</span>
        </div>
        <div className="user-profile" style={{ display: 'none' }}></div>
      </header>

      {/* Navigation Drawer */}
      <NavigationMenu isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} />

      {/* Core Viewport */}
      <div className="main-content">
        {/* Breadcrumbs */}
        {showBreadcrumbs && (
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
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </Link>
            <span style={{ color: 'var(--border-color)', margin: '0 0.2rem' }}>/</span>
            <span id="breadcrumb-current-module" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {moduleLabel}
            </span>
          </div>
        )}

        <div id="viewport" className="screen-viewport">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
