/**
 * SkeletonLoader — Pulsing placeholder blocks used as loading states
 * across all modules. Replaces the inline skeleton HTML patterns.
 */
export function SkeletonBlock({ height = 20, width = '100%', borderRadius = 4, style = {} }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius,
        background: 'rgba(0, 0, 0, 0.06)',
        animation: 'pulse 1.5s infinite',
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ height = 120 }) {
  return (
    <div
      style={{
        height,
        background: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 'var(--radius-md)',
        animation: 'pulse 1.5s infinite',
      }}
    />
  );
}

export function SkeletonGrid({ cols = 4, rows = 1, cardHeight = 120 }) {
  const items = Array.from({ length: cols * rows });
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '1rem',
      }}
    >
      {items.map((_, i) => (
        <SkeletonCard key={i} height={cardHeight} />
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonBlock height={30} width={250} />
        <SkeletonBlock height={36} width={200} />
      </div>
      <SkeletonGrid cols={4} cardHeight={120} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', flex: 1 }}>
        <SkeletonCard height={300} />
        <SkeletonCard height={300} />
      </div>
    </div>
  );
}
