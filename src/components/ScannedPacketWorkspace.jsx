export default function ScannedPacketWorkspace({
  getPacketOcrStatus,
  getStatusClass,
  onClearPacket,
  onLoadPage,
  onMarkChecked,
  onMarkReference,
  onRemovePage,
  onUndoReference,
  onViewOcr,
  scannedPackets,
  scannedTriageGroups,
  summarizePacketPages,
}) {
  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Packet Triage</p>
          <h2>Sort scanned packets into useful work lanes.</h2>
        </div>
      </div>
      {!scannedPackets.length ? (
        <div className="workbench-panel empty-state">
          <h3>No scanned packets yet.</h3>
          <p>Upload a scanned follow-up packet from Intake, then return here to triage pages.</p>
        </div>
      ) : (
        <div className="scanned-packet-list">
          {scannedPackets.map((packet) => {
            const summary = summarizePacketPages(packet.pages)
            return (
              <section className="scanned-packet-card" key={packet.id}>
                <div className="scanned-packet-card__header">
                  <div>
                    <p className="kicker">Scanned packet</p>
                    <h3>{packet.fileName}</h3>
                    <p>{getPacketOcrStatus(packet)} · {packet.pageCount} page{packet.pageCount === 1 ? '' : 's'}</p>
                  </div>
                  <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onClearPacket(packet.id)}>
                    Clear packet
                  </button>
                </div>
                <div className="scanned-summary-grid">
                  <span><strong>{summary.followUp}</strong> likely follow-up</span>
                  <span><strong>{summary.paidClosed}</strong> paid/closed</span>
                  <span><strong>{summary.needsReview}</strong> need review</span>
                  <span><strong>{summary.support}</strong> support</span>
                  <span><strong>{summary.reference}</strong> reference/photo</span>
                  <span><strong>{summary.unknown}</strong> unknown</span>
                </div>
                <div className="scanned-triage-groups">
                  {scannedTriageGroups.map((group) => {
                    const pages = packet.pages.filter(group.matches)
                    if (!pages.length) return null
                    return (
                      <details className="scanned-triage-group" key={group.key} open={group.open}>
                        <summary>{group.label} <span>{pages.length}</span></summary>
                        <div className="scanned-page-list">
                          {pages.map((page) => (
                            <article className={`scanned-page-row is-${getStatusClass(page.status)}`} key={`${packet.id}-${page.pageNumber}`}>
                              <div>
                                <strong>Page {page.pageNumber}</strong>
                                <span>{page.classification.label} · {page.recommendation}</span>
                              </div>
                              <div>
                                <span>{page.customerName || 'No customer extracted'}</span>
                                <span>{page.documentNumber || 'No doc #'} · {page.total || page.balanceDue || 'No total'}</span>
                              </div>
                              <span className={`confidence-badge is-${page.ocrConfidence >= 60 ? 'ok' : 'low'}`}>
                                {page.ocrConfidence >= 60 ? `${page.ocrConfidence}%` : `low ${page.ocrConfidence}%`}
                              </span>
                              <span className={`batch-status is-${getStatusClass(page.status)}`}>{page.status}</span>
                              <div className="batch-actions">
                                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onViewOcr(page)}>View scan/OCR</button>
                                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onLoadPage(page)}>Send to Review</button>
                                {!page.reviewed ? <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onMarkChecked(packet.id, page.pageNumber)}>Mark checked</button> : null}
                                {page.status === 'Reference' ? (
                                  <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onUndoReference(packet.id, page.pageNumber)}>Undo reference</button>
                                ) : (
                                  <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onMarkReference(packet.id, page.pageNumber)}>Mark as reference</button>
                                )}
                                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onRemovePage(packet.id, page.pageNumber)}>Remove from packet</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </details>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
