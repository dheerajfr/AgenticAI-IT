import React, { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [loader, setLoader] = useState({ isOpen: false, message: '' });
  const [toast, setToast] = useState(null);

  const showLoader = useCallback((message = 'Processing...') => {
    setLoader({ isOpen: true, message });
  }, []);

  const hideLoader = useCallback(() => {
    setLoader({ isOpen: false, message: '' });
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  return (
    <UIContext.Provider value={{ showLoader, hideLoader, showToast }}>
      {children}
      
      {/* Global Loader Overlay */}
      {loader.isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%) translateY(0)',
            background: 'var(--bg-tertiary, #1e293b)',
            border: '1px solid var(--border-color, #334155)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            borderRadius: '30px',
            padding: '0.6rem 1.5rem',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animation: 'fade-in 0.3s ease',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--color-brand, #6366f1)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {loader.message}
          </span>
        </div>
      )}

      {/* Global Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            background:
              toast.type === 'error'
                ? 'linear-gradient(135deg, #b91c1c, #ef4444)'
                : toast.type === 'warning'
                ? 'linear-gradient(135deg, #b45309, #f59e0b)'
                : 'linear-gradient(135deg, #059669, #10b981)',
            color: '#ffffff',
            padding: '0.65rem 1.3rem',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            zIndex: 99999,
            animation: 'fade-in 0.2s ease',
          }}
        >
          {toast.message}
        </div>
      )}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
