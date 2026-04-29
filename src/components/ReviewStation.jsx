import CurrentSetupPanel from './CurrentSetupPanel.jsx'

const defaultProductIntelligence = {
  snapshotDate: '',
  exactMatchCount: 0,
  suggestionCount: 0,
  needsReviewCount: 0,
  rows: [],
}

export default function ReviewStation({
  assignmentOptions,
  assignmentTargets,
  audit,
  children,
  currentSourceLabel,
  currentSetupGuidance,
  handleAssignLine,
  loadedOcrItem,
  ocrReviewConfirmed,
  parseContext,
  productIntelligence = defaultProductIntelligence,
  setAssignmentTargets,
  setOcrReviewConfirmed,
  onMarkLoadedOcrChecked,
}) {
  const productIntel = { ...defaultProductIntelligence, ...productIntelligence }
  const productRows = Array.isArray(productIntel.rows) ? productIntel.rows : []
  const isOcr = parseContext.extractionSource === 'ocr'

  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Review Station</p>
          <h2>Check the source before customer-facing output.</h2>
        </div>
      </div>

      <div className={`document-type-banner is-${parseContext.documentType || 'notes'}`}>
        <div>
          <span className="kicker">Source document</span>
          <strong>{currentSourceLabel}</strong>
          <p>Customer-facing label: {parseContext.outputLabel || 'Fireplace Project Proposal'}</p>
        </div>
        {parseContext.documentType && parseContext.documentType !== 'quote' && parseContext.documentType !== 'notes' ? (
          <p className="document-type-banner__warning">
            This is a {parseContext.documentType} document. Quote-only language is not applied automatically.
          </p>
        ) : null}
      </div>

      {isOcr && !ocrReviewConfirmed ? (
        <div className="ocr-source-callout">
          <strong>OCR scanned source - compare every field against the scan.</strong>
          <p>Customer-facing PDF generation is blocked until this loaded OCR source is marked checked.</p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              if (loadedOcrItem) onMarkLoadedOcrChecked()
              else setOcrReviewConfirmed(true)
            }}
          >
            Mark checked against the scan
          </button>
        </div>
      ) : null}
      {isOcr && ocrReviewConfirmed ? (
        <div className="ocr-source-callout ocr-source-callout--confirmed">
          OCR review confirmed. Customer-facing PDF generation is unlocked if all other blockers are clear.
        </div>
      ) : null}

      <div className="review-grid">
        <div className="review-card">
          <h3>Warnings</h3>
          {audit.warnings.length ? <ul className="notice-list notice-list--warning">{audit.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="empty-copy">No warnings right now.</p>}
        </div>
        <div className="review-card">
          <h3>Export blockers</h3>
          {audit.blockingFieldLabels.length ? <ul className="notice-list notice-list--warning">{audit.blockingFieldLabels.map((label) => <li key={label}>{label}</li>)}</ul> : <p className="empty-copy">No required fields are blocking export.</p>}
        </div>
        <div className="review-card">
          <h3>Defaults used</h3>
          {audit.infos.length ? <ul className="notice-list">{audit.infos.map((info) => <li key={info}>{info}</li>)}</ul> : <p className="empty-copy">No defaults applied.</p>}
        </div>
        <div className="review-card">
          <h3>Section blanks</h3>
          <div className="missing-summary">
            {audit.missingBySection.map((group) => (
              <div key={group.key}><strong>{group.label}</strong><span>{group.fields.length} blank</span></div>
            ))}
          </div>
        </div>
      </div>

      <CurrentSetupPanel guidance={currentSetupGuidance} />

      <div className="product-intel-panel">
        <div className="panel-heading">
          <div>
            <h3>Internal Product Match</h3>
            <p className="section-caption">
              BisTrack catalog snapshot {productIntel.snapshotDate || 'local'} - exact code matches only enrich the line. Suggestions require review.
            </p>
          </div>
          <div className="product-intel-summary">
            <span>{productIntel.exactMatchCount} exact</span>
            <span>{productIntel.suggestionCount} suggested</span>
            <span>{productIntel.needsReviewCount} need review</span>
          </div>
        </div>
        {productRows.length ? (
          <div className="product-intel-table">
            <table>
              <thead>
                <tr>
                  <th>Quote line</th>
                  <th>Catalog match</th>
                  <th>Group</th>
                  <th>Internal badges</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((row) => (
                  <tr key={row.id} className={row.needsReview ? 'needs-review' : ''}>
                    <td>
                      <strong>{row.code || 'No code'}</strong>
                      <span>{row.description || 'No description parsed'}</span>
                    </td>
                    <td>
                      {row.match ? (
                        <>
                          <strong>{row.match.product.code}</strong>
                          <span>
                            {row.match.product.name || row.match.product.description || row.match.product.name}
                            {row.match.matchType === 'suggestion' ? ` - suggested ${(row.match.score * 100).toFixed(0)}%` : ''}
                          </span>
                        </>
                      ) : (
                        <span>No catalog suggestion</span>
                      )}
                    </td>
                    <td>{row.group}</td>
                    <td>
                      <div className="product-badge-row">
                        {(row.badges || ['Needs Review']).map((badge) => <span className="product-badge" key={`${row.id}-${badge}`}>{badge}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-copy">Line items will appear here after a BisTrack PDF or pasted detail rows are parsed.</p>
        )}
      </div>

      <div className="needs-review-box">
        <div className="panel-heading">
          <div>
            <h3>Needs Review</h3>
            <p className="section-caption">Unmatched lines stay here until assigned or intentionally ignored.</p>
          </div>
        </div>
        {parseContext.unmatchedLines.length ? (
          <div className="review-line-list">
            {parseContext.unmatchedLines.map((line, index) => (
              <div className="review-line" key={`${index}-${line}`}>
                <p>{line}</p>
                <div className="review-line__controls">
                  <select value={assignmentTargets[index] || ''} onChange={(event) => setAssignmentTargets((current) => ({ ...current, [index]: event.target.value }))}>
                    <option value="">Assign to field...</option>
                    {assignmentOptions.map((field) => <option key={field} value={field}>{field.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button type="button" className="ghost-button" onClick={() => handleAssignLine(line, index)}>Assign line</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="empty-copy">No unmatched lines waiting for review.</p>}
      </div>

      <details className="progressive-editor">
        <summary>Open full field editor</summary>
        {children}
      </details>
    </section>
  )
}
