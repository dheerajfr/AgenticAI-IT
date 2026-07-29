/**
 * ModulePlaceholder — replaces the <module-placeholder> Web Component.
 * Shown for stages that don't have a full implementation yet.
 */
export default function ModulePlaceholder({ moduleId, moduleTitle }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.5rem',
        color: 'var(--text-muted)',
        padding: '4rem 2rem',
        textAlign: 'center',
      }}
    >
      <svg viewBox="0 0 24 24" style={{ width: 56, height: 56, fill: 'var(--text-muted)', opacity: 0.5 }}>
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
      </svg>
      <div>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            color: 'var(--text-primary)',
            margin: '0 0 0.5rem',
          }}
        >
          {moduleTitle || 'Module'} — Coming Soon
        </h3>
        <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: 360, lineHeight: 1.6 }}>
          This module ({moduleId}) is currently under development. Connect the FastAPI backend to get started.
        </p>
      </div>
    </div>
  );
}
