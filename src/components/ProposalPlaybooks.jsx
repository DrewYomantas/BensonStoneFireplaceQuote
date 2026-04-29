export default function ProposalPlaybooks({ onSelectPlaybook, playbooks, recommendation, selectedPlaybookId }) {
  const selectedOrRecommended = selectedPlaybookId || recommendation?.id || ''

  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Proposal Playbooks</p>
          <h2>Choose the customer-facing lane.</h2>
          <p className="section-caption">Recommended path plus manual override. Export safety still comes from source review and blockers.</p>
        </div>
      </div>

      {recommendation ? (
        <section className="recommendation-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">Recommended path</p>
              <h3>{recommendation.label}</h3>
              <p className="section-caption">Confidence: {recommendation.confidence} · Customer-facing angle: {recommendation.customerFacingAngle}</p>
            </div>
            <button type="button" className="primary-button" onClick={() => onSelectPlaybook(recommendation.id)}>
              Use recommended path
            </button>
          </div>
          <div className="recommendation-grid">
            <div>
              <h4>Why this fits</h4>
              <ul className="notice-list">
                {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
            <div>
              <h4>Review before sending</h4>
              {recommendation.warnings.length ? (
                <ul className="notice-list notice-list--warning">
                  {recommendation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : <p className="empty-copy">No playbook-specific cautions.</p>}
            </div>
            <div className="recommendation-copy">
              <h4>Copy scaffold</h4>
              {recommendation.copyScaffold.length ? recommendation.copyScaffold.map((line) => <p key={line}>{line}</p>) : <p className="empty-copy">Internal-only playbook.</p>}
            </div>
          </div>
        </section>
      ) : null}

      <div className="playbook-grid">
        {playbooks.map((playbook) => (
          <button
            key={playbook.id}
            type="button"
            className={`playbook-card ${selectedOrRecommended === playbook.id ? 'is-selected' : ''}`}
            onClick={() => onSelectPlaybook(playbook.id)}
          >
            <span>{playbook.leadTemperatureFit}</span>
            <strong>{playbook.name}</strong>
            <p>{playbook.goal}</p>
            <small>{selectedPlaybookId === playbook.id ? 'Manual override selected' : playbook.customerFacingSafe ? 'Customer-facing after review' : 'Internal only'}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
