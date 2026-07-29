/**
 * ProjectDropdown — The header-area project selector used across modules.
 */
export default function ProjectDropdown({ demands = [], selectedId, onChange, includeNew = false, newLabel = '+ Create New' }) {
  return (
    <select
      value={selectedId || ''}
      onChange={(e) => onChange && onChange(e.target.value)}
      style={{
        padding: '0.45rem 0.75rem',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.85rem',
        minWidth: 280,
        maxWidth: 380,
        cursor: 'pointer',
      }}
    >
      {includeNew && <option value="new">{newLabel}</option>}
      {!includeNew && <option value="">Select a Project...</option>}
      {demands.map((d) => (
        <option key={d.demand_id} value={d.demand_id}>
          {d.demand_id} - {d.title}
        </option>
      ))}
    </select>
  );
}
