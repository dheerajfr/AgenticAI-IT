/**
 * StatusPill — replaces the <status-pill> Web Component.
 * Maps status strings to color-coded pill badges.
 */
const STATUS_STYLES = {
  approved: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)', border: 'var(--color-status-green-border)' },
  green: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)', border: 'var(--color-status-green-border)' },
  rejected: { bg: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)', border: 'var(--color-status-red-border)' },
  red: { bg: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)', border: 'var(--color-status-red-border)' },
  blocked: { bg: 'var(--color-status-red-bg)', color: 'var(--color-status-red-text)', border: 'var(--color-status-red-border)' },
  classified: { bg: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber-text)', border: 'var(--color-status-amber-border)' },
  amber: { bg: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber-text)', border: 'var(--color-status-amber-border)' },
  'in-progress': { bg: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber-text)', border: 'var(--color-status-amber-border)' },
  draft: { bg: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber-text)', border: 'var(--color-status-amber-border)' },
  challenged: { bg: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber-text)', border: 'var(--color-status-amber-border)' },
  blue: { bg: 'var(--color-status-blue-bg)', color: 'var(--color-status-blue-text)', border: 'var(--color-status-blue-border)' },
  're-baselined': { bg: 'var(--color-status-blue-bg)', color: 'var(--color-status-blue-text)', border: 'var(--color-status-blue-border)' },
  done: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)', border: 'var(--color-status-green-border)' },
  pass: { bg: 'var(--color-status-green-bg)', color: 'var(--color-status-green-text)', border: 'var(--color-status-green-border)' },
  pending: { bg: 'var(--color-status-gray-bg)', color: 'var(--color-status-gray-text)', border: 'var(--color-status-gray-border)' },
  gray: { bg: 'var(--color-status-gray-bg)', color: 'var(--color-status-gray-text)', border: 'var(--color-status-gray-border)' },
};

export default function StatusPill({ status, label }) {
  const key = (status || '').toLowerCase();
  const style = STATUS_STYLES[key] || STATUS_STYLES.gray;
  const displayLabel = label || status || 'unknown';

  return (
    <span
      style={{
        fontSize: '0.65rem',
        padding: '0.15rem 0.5rem',
        borderRadius: '4px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {displayLabel}
    </span>
  );
}
