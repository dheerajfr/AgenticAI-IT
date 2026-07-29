import { useState } from 'react';

/**
 * ConfirmDialog — Replaces window.confirm() calls with a proper modal.
 */
export default function ConfirmDialog({ isOpen, title = 'Are you sure?', message, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', dangerous = false }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          maxWidth: 420,
          width: '90%',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.75rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {message && (
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn-primary"
            style={dangerous ? { background: 'var(--color-status-red-text)' } : {}}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * useConfirmDialog — Hook for managing confirm dialog state
 */
export function useConfirmDialog() {
  const [dialog, setDialog] = useState({ isOpen: false, resolve: null, title: '', message: '' });

  const confirm = (title, message) => {
    return new Promise((resolve) => {
      setDialog({ isOpen: true, resolve, title, message });
    });
  };

  const handleConfirm = () => {
    dialog.resolve?.(true);
    setDialog((d) => ({ ...d, isOpen: false }));
  };

  const handleCancel = () => {
    dialog.resolve?.(false);
    setDialog((d) => ({ ...d, isOpen: false }));
  };

  const DialogComponent = (
    <ConfirmDialog
      isOpen={dialog.isOpen}
      title={dialog.title}
      message={dialog.message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      dangerous
    />
  );

  return { confirm, DialogComponent };
}
