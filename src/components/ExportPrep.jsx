import ProposalPackagePanel from './ProposalPackagePanel.jsx'

export default function ExportPrep({
  audit,
  copyGroups,
  copyState,
  currentSourceLabel,
  exportJson,
  exportLines,
  fieldsToExportLines,
  fields,
  onCopyGroup,
  onCopyJson,
  onExportJson,
  onGenerateCustomerPdf,
  onSaveOpportunity,
  parseContext,
  packageRecommendation,
  recommendation,
  selectedPlaybook,
}) {
  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Export / Send Prep</p>
          <h2>Final safety check before anything customer-facing.</h2>
        </div>
        <div className="button-stack">
          <button type="button" className="ghost-button" onClick={onSaveOpportunity}>Save to Opportunity Queue</button>
          <button type="button" className="primary-button" onClick={onGenerateCustomerPdf}>Generate Customer PDF</button>
        </div>
      </div>

      <div className="workbench-two-column">
        <section className="workbench-panel">
          <h3>Safety ledger</h3>
          <dl className="source-ledger">
            <div><dt>Source</dt><dd>{currentSourceLabel}</dd></div>
            <div><dt>Playbook</dt><dd>{selectedPlaybook?.name || 'Not selected'}</dd></div>
            <div><dt>Recommended path</dt><dd>{recommendation?.label || 'Not evaluated'}</dd></div>
            <div><dt>Package</dt><dd>{packageRecommendation?.label || 'Not evaluated'}</dd></div>
            <div><dt>Package status</dt><dd>{packageRecommendation?.exportSafety?.label || 'Not evaluated'}</dd></div>
            <div><dt>Customer-facing label</dt><dd>{parseContext.outputLabel || 'Fireplace Project Proposal'}</dd></div>
            <div><dt>Export status</dt><dd>{audit.exportStatus}</dd></div>
          </dl>
          {audit.blockingFieldLabels.length ? (
            <ul className="notice-list notice-list--warning">{audit.blockingFieldLabels.map((label) => <li key={label}>{label}</li>)}</ul>
          ) : <p className="empty-copy">No required fields are blocking export.</p>}
          {recommendation?.warnings?.length ? (
            <div className="export-warning-block">
              <h4>Internal cautions</h4>
              <ul className="notice-list notice-list--warning">
                {recommendation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
        <section className="workbench-panel">
          <h3>Copy lanes</h3>
          <div className="copy-groups">
            {copyGroups.map((group) => (
              <button key={group.key} type="button" className="ghost-button" onClick={() => onCopyGroup(group)}>
                {group.label}
              </button>
            ))}
            <button type="button" className="ghost-button" onClick={onCopyJson}>Copy JSON</button>
            <button type="button" className="ghost-button" onClick={onExportJson}>Export JSON</button>
          </div>
          {copyState ? <p className="quiet-status">{copyState}</p> : null}
        </section>
      </div>

      <ProposalPackagePanel compact packageRecommendation={packageRecommendation} />

      <div className="output-grid">
        <label className="field field--wide">
          <span>Flat placeholder output</span>
          <textarea rows={14} value={exportLines} readOnly />
        </label>
        <label className="field field--wide">
          <span>JSON output</span>
          <textarea rows={14} value={exportJson} readOnly />
        </label>
      </div>
      <div className="sr-only">{fieldsToExportLines(fields).length}</div>
    </section>
  )
}
