import React, { useState } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';

const options = [
  { id: 'risk-issues', label: 'Risk & Issues', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' },
  { id: 'budget-cost', label: 'Budget & Cost', icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { id: 'vendor-coordination', label: 'Vendor Coordination', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { id: 'reporting-communication', label: 'Reporting & Comms', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
  { id: 'knowledge-artifacts', label: 'Knowledge & Artefacts', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' }
];

export default function AlwaysOnLayout() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const currentSubPath = location.pathname.split('/').pop() || 'risk-issues';
  const activeOption = options.find(o => o.id === currentSubPath) || options[0];

  return (
    <>
      <style>{`
        .ao-drawer-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
          z-index: 1000; opacity: 0; pointer-events: none;
          transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ao-drawer-overlay.open { opacity: 1; pointer-events: auto; }
        
        .ao-drawer {
          position: fixed; top: 0; left: -320px; width: 300px; height: 100vh;
          background-color: var(--bg-primary); border-right: 1px solid var(--border-color);
          z-index: 1001; display: flex; flex-direction: column;
          box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ao-drawer.open { left: 0; }
        
        .ao-nav-item {
          display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1.25rem; margin-bottom: 0.5rem; 
          border-radius: var(--radius-sm); cursor: pointer; 
          color: var(--text-secondary); 
          background: transparent; 
          font-weight: 500; font-size: 0.95rem; 
          border-left: 4px solid transparent; 
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
        }
        .ao-nav-item:hover {
          color: var(--text-primary);
          background: var(--bg-secondary);
        }
        .ao-nav-item.active {
          color: var(--color-brand);
          background: rgba(99, 102, 241, 0.1);
          font-weight: 600;
          border-left-color: var(--color-brand);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>
        {/* Top Navigation Bar */}
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', gap: '1.5rem', zIndex: 10 }}>
          <button onClick={() => setIsOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s', display: 'flex', alignItems: 'center' }}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
          </button>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', margin: 0, color: 'var(--text-primary)' }}>Always On Workspace</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Dashboard <span style={{ margin: '0 0.25rem' }}>/</span> Always On <span style={{ margin: '0 0.25rem' }}>/</span> <span style={{ color: 'var(--color-brand)', fontWeight: 600 }}>{activeOption.label}</span>
            </div>
          </div>
        </div>
        
        {/* Content Viewport */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <Outlet />
        </div>
      </div>
      
      {/* Slide-in Drawer */}
      <div className={`ao-drawer-overlay ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(false)}></div>
      <div className={`ao-drawer ${isOpen ? 'open' : ''}`}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', margin: 0, color: 'var(--text-primary)' }}>Modules</h2>
          <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {options.map((item) => (
            <NavLink
              key={item.id}
              to={`/always-on/${item.id}`}
              className={({ isActive }) => `ao-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'currentColor' }}><path d={item.icon}/></svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
}
