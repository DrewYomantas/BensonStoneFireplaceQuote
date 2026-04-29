export default function IntakePanel({
  batchFiles,
  bulkStatus,
  getStatusClass,
  handleBulkUpload,
  handleCancelOcr,
  handleClearAll,
  handleLoadSample,
  handleParse,
  handlePdfUpload,
  handleRemoveBatchItem,
  handleReviewBatchItem,
  handleGenerateBatchItem,
  handleRunOcr,
  handleScannedPacketUpload,
  inputMode,
  ocrIsRunning,
  ocrProgress,
  pdfExtractionConfidence,
  pdfFileName,
  pdfLineItems,
  pdfRawText,
  pdfStatus,
  rawNotes,
  scannedFileMeta,
  scannedInputRef,
  scannedReady,
  scannedStatus,
  setInputMode,
  setRawNotes,
}) {
  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Intake</p>
          <h2>Bring in the source document.</h2>
          <p className="section-caption">BisTrack stays official. This workbench helps review, triage, and present after import.</p>
        </div>
        <button type="button" className="ghost-button" onClick={handleClearAll}>Clear all</button>
      </div>

      <div className="intake-card-grid">
        {[
          ['pdf', 'BisTrack PDF', 'Upload one embedded-text quote, order, bill, invoice, or receipt.'],
          ['scanned', 'Scanned packet', 'Run OCR on a follow-up packet and triage pages.'],
          ['bulk', 'Bulk BisTrack import', 'Queue several official PDFs for review.'],
          ['notes', 'Pasted notes', 'Use messy notes only as a fallback.'],
        ].map(([mode, label, description]) => (
          <button
            key={mode}
            type="button"
            className={`intake-source-card ${inputMode === mode ? 'is-active' : ''}`}
            onClick={() => setInputMode(mode)}
          >
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>

      {inputMode === 'notes' ? (
        <div className="workbench-panel">
          <div className="panel-heading">
            <div>
              <h3>Pasted notes</h3>
              <p className="section-caption">Fallback lane for messy working notes.</p>
            </div>
            <button type="button" className="ghost-button ghost-button--subtle" onClick={handleLoadSample}>Load sample/testing</button>
          </div>
          <textarea
            className="notes-input"
            rows={14}
            placeholder="Paste fireplace quote notes here..."
            value={rawNotes}
            onChange={(event) => setRawNotes(event.target.value)}
          />
          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleParse}>Parse notes</button>
          </div>
        </div>
      ) : null}

      {inputMode === 'pdf' ? (
        <div className="workbench-panel pdf-upload">
          <h3>BisTrack PDF</h3>
          <p className="pdf-upload__intro">Upload one official BisTrack PDF. Values are extracted as-is and stay review-gated.</p>
          <label className="pdf-upload__input">
            <span>Choose BisTrack PDF</span>
            <input type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} />
          </label>
          {pdfFileName ? <p className="pdf-upload__file">{pdfFileName}</p> : null}
          {pdfStatus ? <p className="pdf-upload__status">{pdfStatus}</p> : null}
          {pdfExtractionConfidence ? <p className={`pdf-upload__confidence is-${pdfExtractionConfidence}`}>Extraction confidence: {pdfExtractionConfidence}</p> : null}
          {pdfLineItems.length ? (
            <div className="pdf-line-items">
              <h4>Parsed line items</h4>
              <table>
                <thead>
                  <tr><th>#</th><th>Code</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {pdfLineItems.map((item) => (
                    <tr key={`${item.lineNumber}-${item.code}`}>
                      <td>{item.lineNumber}</td><td>{item.code}</td><td>{item.description}</td><td>{item.qty}</td><td>{item.unitPrice}</td><td>{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {pdfRawText ? (
            <details className="pdf-raw-text">
              <summary>Advanced / raw extracted text</summary>
              <pre>{pdfRawText}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {inputMode === 'bulk' ? (
        <div className="workbench-panel pdf-upload bulk-upload">
          <h3>Bulk BisTrack import</h3>
          <p className="pdf-upload__intro">Queue several official BisTrack PDFs, then review or generate one at a time.</p>
          <label className="pdf-upload__input">
            <span>Choose multiple BisTrack PDFs</span>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={handleBulkUpload} />
          </label>
          {bulkStatus ? <p className="pdf-upload__status">{bulkStatus}</p> : null}
          {batchFiles.length ? (
            <div className="batch-table">
              <table>
                <thead>
                  <tr><th>Status</th><th>File</th><th>Type</th><th>Customer</th><th>#</th><th>Date</th><th>Total</th><th>Balance</th><th>Confidence</th><th>Warnings</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {batchFiles.map((item) => (
                    <tr key={item.id} className={`batch-row is-${getStatusClass(item.status)}`}>
                      <td><span className={`batch-status is-${getStatusClass(item.status)}`}>{item.status}</span></td>
                      <td>{item.fileName}</td><td>{item.documentType}</td><td>{item.customerName || '-'}</td><td>{item.documentNumber || '-'}</td><td>{item.documentDate || '-'}</td><td>{item.total || '-'}</td><td>{item.balanceDue || '-'}</td><td>{item.confidence || '-'}</td><td>{item.warningCount || 0}</td>
                      <td>
                        <div className="batch-actions">
                          <button type="button" className="ghost-button ghost-button--subtle" disabled={!item.parsed} onClick={() => handleReviewBatchItem(item)}>Review</button>
                          <button type="button" className="ghost-button ghost-button--subtle" disabled={!item.parsed || item.status === 'Failed'} onClick={() => handleGenerateBatchItem(item)}>Generate</button>
                          <button type="button" className="ghost-button ghost-button--subtle" onClick={() => handleRemoveBatchItem(item.id)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-copy">No batch files uploaded yet.</p>}
        </div>
      ) : null}

      {inputMode === 'scanned' ? (
        <div className="workbench-panel pdf-upload scanned-upload">
          <h3>Scanned packet</h3>
          <p className="pdf-upload__intro">Upload one scanned packet at a time. OCR results land in Triage.</p>
          <label className={`pdf-upload__input ${ocrIsRunning ? 'is-disabled' : ''}`}>
            <span>{ocrIsRunning ? 'OCR running - cancel before uploading' : 'Choose scanned packet PDF'}</span>
            <input ref={scannedInputRef} type="file" accept="application/pdf,.pdf" disabled={ocrIsRunning} onChange={handleScannedPacketUpload} />
          </label>
          {scannedFileMeta?.fileName ? <p className="pdf-upload__file">Ready: {scannedFileMeta.fileName}</p> : null}
          {scannedStatus ? <p className="pdf-upload__status">{scannedStatus}</p> : null}
          <div className="action-row">
            {scannedReady && !ocrProgress ? <button type="button" className="primary-button" onClick={handleRunOcr}>Run OCR</button> : null}
            {ocrProgress ? <button type="button" className="ghost-button" onClick={handleCancelOcr}>Cancel OCR</button> : null}
          </div>
          {ocrProgress ? (
            <div className="ocr-progress">
              <div className="ocr-progress__bar">
                <div className="ocr-progress__fill" style={{ width: ocrProgress.pageCount > 0 ? `${Math.round((ocrProgress.pageNumber / ocrProgress.pageCount) * 100)}%` : '5%' }} />
              </div>
              <span>{ocrProgress.stage === 'rendering' ? 'Rendering' : 'OCR'} page {ocrProgress.pageNumber} of {ocrProgress.pageCount}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
