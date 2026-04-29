const defaultProductIntelligence = {
  groupedRows: [],
}

export default function ProposalBuilder({ editor, onSaveOpportunity, preview, productIntelligence = defaultProductIntelligence, recommendation }) {
  const productIntel = { ...defaultProductIntelligence, ...productIntelligence }
  const groupedRows = Array.isArray(productIntel.groupedRows) ? productIntel.groupedRows : []

  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Proposal Builder</p>
          <h2>Shape the reviewed fields into customer-ready structure.</h2>
          <p className="section-caption">This stays human-reviewed. The full field contract is available below.</p>
        </div>
        <button type="button" className="primary-button" onClick={onSaveOpportunity}>Save to Opportunity Queue</button>
      </div>
      {recommendation ? (
        <section className="recommendation-panel recommendation-panel--compact">
          <div className="panel-heading">
            <div>
              <p className="kicker">Recommended path</p>
              <h3>{recommendation.label}</h3>
              <p className="section-caption">Customer-facing angle: {recommendation.customerFacingAngle}</p>
            </div>
          </div>
          {recommendation.warnings.length ? (
            <ul className="notice-list notice-list--warning">
              {recommendation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : <p className="empty-copy">No playbook-specific cautions.</p>}
        </section>
      ) : null}
      <section className="product-group-panel">
        <div className="panel-heading">
          <div>
            <h3>Internal product grouping</h3>
            <p className="section-caption">Use this to shape the proposal. Cost, margin, turns, supplier totals, and rank stay internal-only.</p>
          </div>
        </div>
        {groupedRows.length ? (
          <div className="product-group-list">
            {groupedRows.map((section) => (
              <div className="product-group" key={section.group}>
                <h4>{section.group}</h4>
                <div className="product-group__rows">
                  {(section.rows || []).map((row) => (
                    <div className="product-group__row" key={row.id}>
                      <div>
                        <strong>{row.match?.product.name || row.description || row.code}</strong>
                        <span>{row.code || row.match?.product.code || 'No parsed code'}</span>
                      </div>
                      <div className="product-badge-row">
                        {(row.badges || ['Needs Review']).map((badge) => <span className="product-badge" key={`${row.id}-${badge}`}>{badge}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">No product lines are ready to group yet.</p>
        )}
      </section>
      <div className="workbench-two-column proposal-workspace">
        <section className="workbench-panel">
          <h3>Proposal field workspace</h3>
          {editor}
        </section>
        <section className="workbench-panel">
          <h3>Internal preview</h3>
          {preview}
        </section>
      </div>
    </section>
  )
}
