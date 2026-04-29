const navItems = [
  { id: 'command', label: 'Command Center' },
  { id: 'intake', label: 'Intake' },
  { id: 'triage', label: 'Triage' },
  { id: 'review', label: 'Review' },
  { id: 'playbooks', label: 'Playbooks' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'export', label: 'Export' },
]

export default function AppShell({
  activeView,
  audit,
  children,
  currentSourceLabel,
  onNavigate,
  selectedPlaybook,
  stats,
}) {
  return (
    <div className="workbench-shell">
      <aside className="workbench-sidebar">
        <div className="workbench-brand">
          <span>Benson Stone</span>
          <strong>Fireplace Sales Workbench</strong>
        </div>
        <nav className="workbench-nav" aria-label="Workbench navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`workbench-nav__item ${activeView === item.id ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="workbench-sidebar__footer">
          <span>Source</span>
          <strong>{currentSourceLabel}</strong>
          <span>Playbook</span>
          <strong>{selectedPlaybook?.name || 'Not selected'}</strong>
        </div>
      </aside>

      <div className="workbench-main">
        <header className="workbench-topbar">
          <div>
            <p className="eyebrow">Today&apos;s Fireplace Desk</p>
            <h1>Review, triage, and prepare fireplace sales work.</h1>
          </div>
          <div className={`export-status ${audit.exportReady ? 'is-ready' : 'is-blocked'}`}>
            <strong>{audit.exportReady ? 'Ready candidate' : 'Review required'}</strong>
            <span>{audit.exportStatus}</span>
            <p>{stats.safetyBlockers} safety blocker{stats.safetyBlockers === 1 ? '' : 's'} active</p>
          </div>
        </header>
        <main className="workbench-content">{children}</main>
      </div>
    </div>
  )
}
