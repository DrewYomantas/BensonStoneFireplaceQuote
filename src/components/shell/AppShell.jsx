import ShellRail from './ShellRail.jsx'
import ShellBar from './ShellBar.jsx'

export default function AppShell({
  active,
  onNavigate,
  title,
  crumbs,
  topActions,
  children,
}) {
  return (
    <>
      <div className="too-narrow">
        <h2 className="serif-h h3">Open on the showroom tablet.</h2>
        <p className="body-sm">The Sales OS is built for landscape tablet (≥ 1024 px). Rotate the tablet or open on Drew&apos;s work computer.</p>
      </div>
      <div className="shell">
        <ShellRail active={active} onSelect={onNavigate} />
        <main className="shell-main">
          <ShellBar title={title} crumbs={crumbs} actions={topActions} />
          {children}
        </main>
      </div>
    </>
  )
}
