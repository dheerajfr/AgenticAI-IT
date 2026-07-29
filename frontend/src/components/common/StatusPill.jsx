import React from 'react';

const styles = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.15rem 0.55rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderRadius: 'var(--radius-round, 9999px)',
    border: '1px solid transparent',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  },
  gray: {
    backgroundColor: 'var(--color-status-gray-bg, #1e293b)',
    color: 'var(--color-status-gray-text, #94a3b8)',
    borderColor: 'var(--color-status-gray-border, #334155)',
  },
  amber: {
    backgroundColor: 'var(--color-status-amber-bg, #2d200e)',
    color: 'var(--color-status-amber-text, #fbbf24)',
    borderColor: 'var(--color-status-amber-border, #78350f)',
  },
  green: {
    backgroundColor: 'var(--color-status-green-bg, #062f1e)',
    color: 'var(--color-status-green-text, #34d399)',
    borderColor: 'var(--color-status-green-border, #064e3b)',
  },
  red: {
    backgroundColor: 'var(--color-status-red-bg, #3f1919)',
    color: 'var(--color-status-red-text, #f87171)',
    borderColor: 'var(--color-status-red-border, #7f1d1d)',
  }
};

export default function StatusPill({ status = 'not started' }) {
  const normalized = status ? status.toLowerCase().trim() : 'not started';
  let colorStyle = styles.gray;

  if (
    normalized === 'live' ||
    normalized === 'approved' ||
    normalized === 'finalized' ||
    normalized === 're-baselined' ||
    normalized === 'pass' ||
    normalized === 'in-sync'
  ) {
    colorStyle = styles.green;
  } else if (
    normalized === 'building' ||
    normalized === 'classified' ||
    normalized === 'capacity-checked' ||
    normalized === 'draft' ||
    normalized === 'drifted'
  ) {
    colorStyle = styles.amber;
  } else if (normalized === 'rejected' || normalized === 'fail' || normalized === 'blocked' || normalized === 'at-risk') {
    colorStyle = styles.red;
  }

  return (
    <span style={{ ...styles.pill, ...colorStyle }}>
      {status}
    </span>
  );
}
