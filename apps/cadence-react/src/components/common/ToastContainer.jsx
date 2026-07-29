import { useAppContext } from '../../context/AppContext';

function Toast({ toast, onRemove }) {
  const colors = {
    success: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)', border: 'var(--color-status-green-border)' },
    error: { bg: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)', border: 'var(--color-status-red-border)' },
    info: { bg: 'var(--color-status-blue-bg)', color: 'var(--color-status-blue-text)', border: 'var(--color-status-blue-border)' },
    warning: { bg: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber-text)', border: 'var(--color-status-amber-border)' },
  };
  const c = colors[toast.type] || colors.info;

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${c.border}`,
        backgroundColor: c.bg,
        color: c.color,
        fontSize: '0.875rem',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-lg)',
        minWidth: 280,
        maxWidth: 400,
        animation: 'fade-in 0.3s ease forwards',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          opacity: 0.7,
          padding: '0.1rem',
          lineHeight: 1,
          fontSize: '1rem',
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
