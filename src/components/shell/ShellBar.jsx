import SaveStatus from './SaveStatus.jsx'

export default function ShellBar({ title, crumbs = [], actions }) {
  return (
    <header className="shell-bar">
      <span className="shell-bar-title">{title}</span>
      {crumbs.length > 0 && <span className="shell-bar-sep" aria-hidden="true" />}
      {crumbs.map((c, i) => (
        <span key={`${c}-${i}`} className="shell-bar-crumb">
          {i > 0 && <span style={{ margin: '0 6px', color: 'var(--stone-300)' }}>·</span>}
          {c}
        </span>
      ))}
      <div className="shell-bar-actions">
        {actions}
        <SaveStatus />
      </div>
    </header>
  )
}
