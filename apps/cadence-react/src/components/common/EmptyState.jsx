export default function EmptyState({ title = 'No Data', message, icon, action }) {
  return (
    <div
      style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-muted)',
      }}
    >
      {icon || (
        <svg
          style={{ width: 48, height: 48, color: 'var(--text-muted)', margin: '0 auto 1rem' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )}
      <h3
        style={{
          margin: '0 0 0.5rem 0',
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
          fontSize: '1.15rem',
        }}
      >
        {title}
      </h3>
      {message && (
        <p style={{ margin: '0 auto', color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.5 }}>
          {message}
        </p>
      )}
      {action && <div style={{ marginTop: '1.5rem' }}>{action}</div>}
    </div>
  );
}
