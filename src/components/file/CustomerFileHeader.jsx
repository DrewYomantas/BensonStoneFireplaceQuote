export default function CustomerFileHeader({ file, status }) {
  const name = file.customerName || 'Unnamed customer'
  const sub = [file.projectAddress, file.customerGoal && `goal: ${file.customerGoal}`]
    .filter(Boolean).join(' · ')
  const opened = file.createdAt ? new Date(file.createdAt) : null
  const openedLabel = opened ? `OPENED ${opened.toISOString().slice(0, 10).toUpperCase()}` : ''

  return (
    <header>
      <div className="hstack" style={{ alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        {file.id && <span className="mono">FILE {file.id.replace(/^cf-/, '').toUpperCase()}</span>}
        {openedLabel && <span className="mono">{openedLabel}</span>}
        {status && <span className={`badge badge-${status.kind || 'review'}`}>{status.label}</span>}
      </div>
      <h1 className="serif-h h1" style={{ marginTop: 8 }}>{name}.</h1>
      {sub && <p className="body-lg" style={{ marginTop: 4, color: 'var(--slate)' }}>{sub}</p>}
      <hr className="rule-brass" style={{ margin: '20px 0' }} />
    </header>
  )
}
