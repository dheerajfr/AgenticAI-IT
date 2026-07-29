import React from 'react';
import { NavLink } from 'react-router-dom';
import { NavigationConfig } from '../../constants/navigation';

export default function NavigationMenu({ isOpen, onClose }) {
  const visibleConfig = NavigationConfig.filter((item) => !item.hidden);

  return (
    <>
      <style>{`
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1999;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        
        .drawer-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        
        .drawer {
          position: fixed;
          top: 0;
          left: -300px;
          width: 280px;
          height: 100vh;
          background-color: var(--bg-primary, #ffffff);
          border-right: 1px solid var(--border-color, #e2e8f0);
          z-index: 2000;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg);
          transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .drawer.open {
          left: 0;
        }
        
        .drawer-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: var(--bg-secondary, #f8fafc);
        }
        
        .drawer-title {
          font-family: var(--font-display, sans-serif);
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--text-primary, #0f172a);
          margin: 0;
        }
        
        .close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-secondary, #475569);
          padding: 0.25rem;
          border-radius: var(--radius-sm, 4px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .close-btn:hover {
          background-color: rgba(0,0,0,0.05);
          color: var(--text-primary, #0f172a);
        }
        
        .nav-list {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        
        .nav-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1.5rem;
          text-decoration: none;
          color: var(--text-secondary, #475569);
          font-family: var(--font-sans, sans-serif);
          font-size: 0.95rem;
          font-weight: 500;
          border-left: 4px solid transparent;
          transition: all 0.2s ease;
        }
        
        .nav-item:hover {
          background-color: var(--bg-secondary, #f8fafc);
          color: var(--text-primary, #0f172a);
        }
        
        .nav-item.active {
          background-color: rgba(99, 102, 241, 0.08);
          color: var(--color-brand, #6366f1);
          border-left-color: var(--color-brand, #6366f1);
          font-weight: 600;
        }
        
        .nav-icon {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }
      `}</style>
      
      <div 
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h2 className="drawer-title">Menu</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div className="nav-list">
          {visibleConfig.map((item) => (
            <NavLink
              key={item.id}
              to={item.id === 'dashboard' ? '/dashboard' : `/${item.id}`}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <svg className="nav-icon" viewBox="0 0 24 24">
                <path d={item.icon} />
              </svg>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
}
