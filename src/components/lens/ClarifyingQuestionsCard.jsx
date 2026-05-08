export default function ClarifyingQuestionsCard({ blockers = [], warnings = [], questions = [] }) {
  if (!blockers.length && !warnings.length && !questions.length) {
    return (
      <section className="card-flat" style={{ padding: 18 }}>
        <span className="eyebrow eyebrow-ink">CLEAR PICTURE</span>
        <p className="body-sm" style={{ marginTop: 6 }}>
          No outstanding questions. The lens has enough to begin a real proposal.
        </p>
      </section>
    )
  }
  return (
    <section className="card" style={{ padding: 18, borderLeft: blockers.length ? '3px solid var(--ember)' : '3px solid var(--brass)' }}>
      <span className={`eyebrow ${blockers.length ? 'eyebrow-ember' : 'eyebrow-brass'}`}>
        {blockers.length ? 'STILL NEEDS TO BE VERIFIED' : 'WORTH CLARIFYING'}
      </span>
      {blockers.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {blockers.map((b) => (
              <li key={b.code} className="body-sm">{b.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span className="eyebrow eyebrow-brass">WARNINGS</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w.code} className="body-sm">{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {questions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span className="eyebrow eyebrow-ink">SUGGESTED QUESTIONS</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {questions.map((q, i) => (
              <li key={i} className="body-sm">{q}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
