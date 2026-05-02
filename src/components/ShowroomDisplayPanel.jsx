function badgeClass(tone) {
  if (tone === 'ready') return 'bs-badge bs-badge--status'
  if (tone === 'warning') return 'bs-badge bs-badge--warning'
  return 'bs-badge bs-badge--unknown'
}

export default function ShowroomDisplayPanel({ context, title = 'Showroom Display Context' }) {
  if (!context || context.status === 'none') return null

  return (
    <section className="bs-display-context">
      <div className="bs-display-context__head">
        <div>
          <p className="bs-lens__eyebrow">Internal Display Context</p>
          <h3>{title}</h3>
        </div>
        <span className={badgeClass(context.tone)}>{context.chipLabel}</span>
      </div>

      {context.headline ? <p className="bs-display-context__headline">{context.headline}</p> : null}
      {context.locationLabel ? <p className="bs-display-context__line"><strong>Location:</strong> {context.locationLabel}</p> : null}
      {context.note ? <p className="bs-display-context__note">{context.note}</p> : null}

      {context.talkingPoints?.length ? (
        <div>
          <p className="bs-recovery__section-label">Showroom Talking Point</p>
          <ul className="bs-lens-list">
            {context.talkingPoints.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {context.internalNotes?.length ? (
        <div>
          <p className="bs-recovery__section-label">Internal Display Note</p>
          <ul className="bs-lens-list bs-lens-list--warning">
            {context.internalNotes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {context.suggestedMatches?.length ? (
        <div>
          <p className="bs-recovery__section-label">Possible Matches</p>
          <ul className="bs-lens-list">
            {context.suggestedMatches.map((record) => (
              <li key={record.id}>{record.productCode || record.modelName} - {record.modelName || record.description}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
