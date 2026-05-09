function extractQuoteFacts(file) {
  const trail = Array.isArray(file.sourceTrail) && file.sourceTrail.length > 0
    ? file.sourceTrail[0]
    : null
  const quoteNumber = trail && Array.isArray(trail.quoteNumbers) && trail.quoteNumbers[0]
    ? String(trail.quoteNumbers[0])
    : ''
  let quoteDate = ''
  const notes = String(file.existingNotes || '')
  const dateMatch = notes.match(/Date:\s*([^\n]+)/i)
  if (dateMatch) quoteDate = dateMatch[1].trim()
  return { quoteNumber, quoteDate }
}

export default function CustomerFileHeader({ file, status }) {
  const name = file.customerName || 'Unnamed customer'
  const contact = [file.customerPhone, file.customerEmail].filter(Boolean).join(' · ')
  const opened = file.createdAt ? new Date(file.createdAt) : null
  const openedLabel = opened ? `OPENED ${opened.toISOString().slice(0, 10).toUpperCase()}` : ''
  const { quoteNumber, quoteDate } = extractQuoteFacts(file)
  const sourceLabel = file.sourceLabel || ''

  const factBits = []
  if (file.projectAddress) factBits.push(file.projectAddress)
  if (quoteNumber) factBits.push(`Quote #${quoteNumber}`)
  if (quoteDate) factBits.push(`Date: ${quoteDate}`)
  if (file.customerGoal) factBits.push(`goal: ${file.customerGoal}`)

  return (
    <header>
      <div className="hstack" style={{ alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        {file.id && <span className="mono">FILE {file.id.replace(/^cf-/, '').toUpperCase()}</span>}
        {openedLabel && <span className="mono">{openedLabel}</span>}
        {sourceLabel && <span className="source source-manual">{sourceLabel.toUpperCase()}</span>}
        {status && <span className={`badge badge-${status.kind || 'review'}`}>{status.label}</span>}
      </div>
      <h1 className="serif-h h1" style={{ marginTop: 8 }}>{name}.</h1>
      {contact && (
        <p className="body-lg" style={{ marginTop: 4, color: 'var(--ink)' }}>{contact}</p>
      )}
      {factBits.length > 0 && (
        <p className="body" style={{ marginTop: 4, color: 'var(--slate)' }}>
          {factBits.join(' · ')}
        </p>
      )}
      <hr className="rule-brass" style={{ margin: '20px 0' }} />
    </header>
  )
}
