export default function ProposalPackagePanel({ compact = false, packageRecommendation }) {
  if (!packageRecommendation) return null

  return (
    <section className={`proposal-package-panel ${compact ? 'proposal-package-panel--compact' : ''}`}>
      <div className="panel-heading">
        <div>
          <p className="kicker">Proposal package</p>
          <h3>{packageRecommendation.label}</h3>
          <p className="section-caption">{packageRecommendation.purpose}</p>
        </div>
        <span className={`batch-status is-${packageRecommendation.exportSafety.status === 'ready' ? 'ready' : packageRecommendation.exportSafety.status === 'blocked' ? 'failed' : 'needs-review'}`}>
          {packageRecommendation.exportSafety.label}
        </span>
      </div>

      <div className="package-recommendation-grid">
        <div>
          <h4>Why this fits</h4>
          <ul className="notice-list">
            {packageRecommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
        <div>
          <h4>Recommended sections</h4>
          <ul className="notice-list">
            {packageRecommendation.recommendedSections.map((section) => <li key={section}>{section}</li>)}
          </ul>
        </div>
        {!compact ? (
          <div>
            <h4>Internal checklist</h4>
            <ul className="notice-list">
              {packageRecommendation.internalChecklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        <div>
          <h4>{packageRecommendation.warnings.length ? 'Review before export' : 'Export readiness'}</h4>
          {packageRecommendation.warnings.length ? (
            <ul className="notice-list notice-list--warning">
              {packageRecommendation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : <p className="empty-copy">Package looks ready after normal field review.</p>}
        </div>
      </div>

      {packageRecommendation.copyScaffold.length ? (
        <div className="recommendation-copy package-copy-preview">
          <h4>Customer-facing scaffold</h4>
          {packageRecommendation.copyScaffold.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : (
        <p className="empty-copy">No customer-facing scaffold for this package.</p>
      )}
    </section>
  )
}
