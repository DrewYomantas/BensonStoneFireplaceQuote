function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function ListBlock({ emptyText, items, title, warning = false }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length ? (
        <ul className={`notice-list ${warning ? 'notice-list--warning' : ''}`}>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : <p className="empty-copy">{emptyText}</p>}
    </div>
  )
}

export default function CurrentSetupPanel({ compact = false, guidance }) {
  if (!guidance) return null

  return (
    <section className={`current-setup-panel ${compact ? 'current-setup-panel--compact' : ''}`}>
      <div className="panel-heading">
        <div>
          <p className="kicker">Current Setup + Goal Lens</p>
          <h3>What they have, what they want, what to clarify.</h3>
          <p className="section-caption">Sales-floor review aid for unclear terms like insert, fireplace, stove, pellet, gas, or electric.</p>
        </div>
        <span className={`batch-status is-${guidance.blockers.length ? 'needs-review' : 'ready'}`}>
          {guidance.blockers.length ? 'Clarify before proposal' : 'Path fit looks clear'}
        </span>
      </div>

      <div className="current-setup-summary">
        <div>
          <span>What they have</span>
          <strong>{titleLabel(guidance.currentSetupType)}</strong>
          <small>Confidence: {guidance.confidence}</small>
        </div>
        <div>
          <span>What they want</span>
          <div className="setup-chip-row">
            {guidance.customerGoalTags.map((tag) => <span key={tag}>{titleLabel(tag)}</span>)}
          </div>
        </div>
        <div>
          <span>Package impact</span>
          <strong>{guidance.proposalPackageImpact.exportSafety === 'blocked' ? 'Missing-info path' : 'No setup blocker'}</strong>
          <small>{guidance.proposalPackageImpact.reason}</small>
        </div>
      </div>

      <div className="current-setup-grid">
        <ListBlock
          emptyText="No setup blocker detected from reviewed fields."
          items={guidance.blockers}
          title="Clarify Before Proposal"
          warning
        />
        <ListBlock
          emptyText="No extra questions needed from this lens."
          items={guidance.clarificationQuestions}
          title="Customer Questions"
        />
        {!compact ? (
          <>
            <ListBlock
              emptyText="No extra path guidance."
              items={guidance.suggestedSolutionPaths}
              title="Path Fit"
            />
            <ListBlock
              emptyText="No extra internal checklist items."
              items={guidance.internalChecklist}
              title="Internal Checklist"
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
