import { useState } from 'react';
import StatusPill from './StatusPill';
import { getDemandStatusColor } from '../../constants/statuses';

/**
 * ProjectSidebar — The left sidebar with project/demand list and search.
 * Used by 8 modules. Replaces repeated sidebar HTML patterns.
 */
export default function ProjectSidebar({
  items = [],
  selectedId,
  onSelect,
  onDelete,
  idKey = 'demand_id',
  titleKey = 'title',
  subtitleKey = null,
  metaLeft = null,      // function(item) -> string
  metaRight = null,     // function(item) -> string
  statusKey = 'status',
  loading = false,
  error = null,
  emptyMessage = 'No items found.',
}) {
  const [search, setSearch] = useState('');

  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(item[idKey] || '').toLowerCase().includes(q) ||
      String(item[titleKey] || '').toLowerCase().includes(q)
    );
  });

  return (
    <aside className="sidebar">
      {/* Search */}
      <div style={{ padding: '1rem' }}>
        <input
          type="text"
          placeholder="Search project..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <ul className="demand-list">
        {loading && (
          <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading...
          </li>
        )}
        {error && (
          <li style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-status-red-text)' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Backend Offline</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Start FastAPI backend:{' '}
              <code style={{ background: 'rgba(0,0,0,0.08)', padding: '2px 4px', borderRadius: 4 }}>
                uvicorn main:app --reload
              </code>
            </div>
          </li>
        )}
        {!loading && !error && filtered.length === 0 && (
          <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {emptyMessage}
          </li>
        )}
        {!loading && !error && filtered.map((item) => {
          const id = item[idKey];
          const isActive = id === selectedId;
          const statusColor = statusKey ? getDemandStatusColor(item[statusKey]) : 'gray';

          return (
            <li
              key={id}
              className={`demand-item${isActive ? ' active' : ''}`}
              data-id={id}
              onClick={() => onSelect && onSelect(id)}
            >
              <div className="demand-item-header">
                <span className="demand-item-id">{id}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {statusKey && item[statusKey] && (
                    <StatusPill status={statusColor} label={item[statusKey]} />
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-status-red-text)',
                        cursor: 'pointer',
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        opacity: 0.7,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                    >
                      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}>
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <h4 className="demand-item-title">{item[titleKey] || 'Untitled'}</h4>
              {(metaLeft || metaRight) && (
                <div className="demand-item-meta">
                  <span>{metaLeft ? metaLeft(item) : ''}</span>
                  <span>{metaRight ? metaRight(item) : ''}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
