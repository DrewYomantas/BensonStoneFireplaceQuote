// Left navigation rail. Stencil-text labels, ember left-border on active item.
// Does not render icons by default per V1.1 spec.

const PRIMARY = [
  { key: 'today',   label: 'Today' },
  { key: 'visit',   label: 'Start Visit' },
  { key: 'files',   label: 'Customer Files' },
]

const SECONDARY = [
  { key: 'lens',      label: 'Setup + Goal Lens',  disabled: true },
  { key: 'prep',      label: 'Quote / Prep',       disabled: true },
  { key: 'followup',  label: 'Follow-up',          disabled: true },
  { key: 'context',   label: 'Smart Context',      disabled: true },
]

const BACKSTAGE = [
  { key: 'backstage', label: 'Backstage', disabled: true },
]

function RailLink({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className={`shell-rail-link ${active ? 'is-active' : ''}`}
      disabled={item.disabled}
      aria-current={active ? 'page' : undefined}
      onClick={() => !item.disabled && onSelect(item.key)}
    >
      {item.label}
      {item.disabled && <span className="mono" style={{ marginLeft: 'auto' }}>soon</span>}
    </button>
  )
}

export default function ShellRail({ active, onSelect }) {
  return (
    <nav className="shell-rail" aria-label="Primary">
      <div className="shell-rail-brand">
        <div className="shell-rail-brand-mark">BENSON STONE</div>
        <div className="shell-rail-brand-product">Fireplace Sales OS</div>
      </div>
      <div className="shell-rail-section">Daily</div>
      {PRIMARY.map((item) => (
        <RailLink key={item.key} item={item} active={active === item.key} onSelect={onSelect} />
      ))}
      <div className="shell-rail-section" style={{ marginTop: 12 }}>Workflow</div>
      {SECONDARY.map((item) => (
        <RailLink key={item.key} item={item} active={active === item.key} onSelect={onSelect} />
      ))}
      <div className="shell-rail-spacer" />
      <div className="shell-rail-section">Backstage</div>
      {BACKSTAGE.map((item) => (
        <RailLink key={item.key} item={item} active={active === item.key} onSelect={onSelect} />
      ))}
      <div className="shell-rail-foot">Local · this tablet</div>
    </nav>
  )
}
