import { useMemo, useState } from 'react'
import './App.css'
import annaSampleNotes from './data/anna-orlinska-notes.txt?raw'
import {
  copyGroups,
  createEmptyFieldState,
  getFieldLabel,
  orderedFields,
  sectionDefinitions,
} from './lib/fieldContract.js'
import {
  buildAudit,
  fieldsToExportLines,
  getFieldStatusClass,
  mergeAssignedValue,
  parseNotes,
} from './lib/parser.js'

const workflowSteps = [
  { number: 1, label: 'Paste Notes', anchor: 'step-1' },
  { number: 2, label: 'Review Warnings', anchor: 'step-2' },
  { number: 3, label: 'Edit Proposal Fields', anchor: 'step-3' },
  { number: 4, label: 'Copy / Export', anchor: 'step-4' },
  { number: 5, label: 'Preview', anchor: 'step-5' },
]

function copyText(text) {
  return navigator.clipboard.writeText(text)
}

function downloadJson(fields) {
  const blob = new Blob([JSON.stringify(fields, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'benson-stone-quote-fields.json'
  link.click()
  URL.revokeObjectURL(url)
}

function packageRows(packageNumber) {
  return Array.from({ length: 4 }, (_, index) => index + 1).map((number) => ({
    item: `PACKAGE_${packageNumber}_ITEM_${number}`,
    price: `PACKAGE_${packageNumber}_PRICE_${number}`,
  }))
}

function detailRows(detailNumber) {
  return Array.from({ length: 9 }, (_, index) => index + 1).map((number) => ({
    item: `DETAIL_${detailNumber}_ITEM_${number}`,
    qty: `DETAIL_${detailNumber}_QTY_${number}`,
    unit: `DETAIL_${detailNumber}_UNIT_PRICE_${number}`,
    total: `DETAIL_${detailNumber}_TOTAL_${number}`,
  }))
}

function scrollToStep(anchor, stepNumber, setCurrentStep) {
  document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  setCurrentStep(stepNumber)
}

function renderTextBlock(value, emptyText) {
  if (!value) {
    return <p className="preview-placeholder">{emptyText}</p>
  }

  return value.split('\n').map((line) => (
    <p key={`${emptyText}-${line}`}>{line}</p>
  ))
}

function getSectionFieldLayout(sectionKey) {
  if (sectionKey === 'customer' || sectionKey === 'quote_meta') {
    return 'basic-grid'
  }
  if (sectionKey === 'project_copy' || sectionKey === 'investment_and_acceptance') {
    return 'mixed-grid'
  }
  if (sectionKey === 'package_1' || sectionKey === 'package_2') {
    return 'package'
  }
  return 'detail'
}

function Field({ field, fields, sources, onChange }) {
  return (
    <label className={`field ${getFieldStatusClass(sources[field])}`}>
      <span>{getFieldLabel(field)}</span>
      <input value={fields[field]} onChange={(event) => onChange(field, event.target.value)} />
    </label>
  )
}

function MultiLineField({ field, fields, sources, onChange, rows = 4 }) {
  return (
    <label className={`field field--wide ${getFieldStatusClass(sources[field])}`}>
      <span>{getFieldLabel(field)}</span>
      <textarea
        rows={rows}
        value={fields[field]}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  )
}

function App() {
  const emptyFields = useMemo(() => createEmptyFieldState(), [])
  const emptySources = useMemo(
    () => Object.fromEntries(orderedFields.map((field) => [field, 'blank'])),
    [],
  )

  const [rawNotes, setRawNotes] = useState('')
  const [fields, setFields] = useState(emptyFields)
  const [sources, setSources] = useState(emptySources)
  const [parseContext, setParseContext] = useState({ unmatchedLines: [], deliveryDateMentioned: false })
  const [audit, setAudit] = useState(buildAudit(emptyFields, emptySources, parseContext))
  const [copyState, setCopyState] = useState('')
  const [parsedOnce, setParsedOnce] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [sectionOverrides, setSectionOverrides] = useState({})
  const [assignmentTargets, setAssignmentTargets] = useState({})

  const exportJson = JSON.stringify(fields, null, 2)
  const exportLines = fieldsToExportLines(fields)

  const sectionStatus = useMemo(() => {
    return Object.fromEntries(
      sectionDefinitions.map((section) => {
        const missingCount = section.fields.filter((field) => fields[field] === '').length
        const warningCount = audit.sectionWarnings[section.key]?.length || 0
        return [
          section.key,
          {
            missingCount,
            warningCount,
            complete: missingCount === 0 && warningCount === 0,
          },
        ]
      }),
    )
  }, [audit.sectionWarnings, fields])

  const assignmentOptions = useMemo(() => {
    const blanks = orderedFields.filter((field) => fields[field] === '')
    const filled = orderedFields.filter((field) => fields[field] !== '')
    return [...blanks, ...filled]
  }, [fields])

  function syncState(nextFields, nextSources, nextContext, nextStep = currentStep) {
    const nextAudit = buildAudit(nextFields, nextSources, nextContext)
    setFields(nextFields)
    setSources(nextSources)
    setParseContext(nextContext)
    setAudit(nextAudit)
    setCurrentStep(nextStep)
  }

  function handleParse() {
    const result = parseNotes(rawNotes)
    setParsedOnce(true)
    setSectionOverrides({})
    setAssignmentTargets({})
    syncState(result.fields, result.sources, result.context, 2)
    setCopyState('Notes parsed into review fields')
  }

  function handleFieldChange(field, value) {
    const nextFields = { ...fields, [field]: value }
    const nextSources = {
      ...sources,
      [field]: value ? (sources[field] === 'default' && value === fields[field] ? sources[field] : 'manual') : 'blank',
    }
    syncState(nextFields, nextSources, parseContext, 3)
  }

  function handleClearAll() {
    const nextContext = { unmatchedLines: [], deliveryDateMentioned: false }
    setParsedOnce(false)
    setSectionOverrides({})
    setAssignmentTargets({})
    syncState(emptyFields, emptySources, nextContext, 1)
    setRawNotes('')
    setCopyState('Cleared')
  }

  function handleLoadSample() {
    setRawNotes(annaSampleNotes)
    setCurrentStep(1)
    setCopyState('Anna sample loaded for testing')
  }

  function handleCopyGroup(group) {
    copyText(fieldsToExportLines(fields, group.fields))
    setCopyState(`${group.label.replace('Copy ', '')} copied`)
    setCurrentStep(4)
  }

  function handleClearSection(section) {
    const nextFields = { ...fields }
    const nextSources = { ...sources }

    section.fields.forEach((field) => {
      nextFields[field] = ''
      nextSources[field] = 'blank'
    })

    syncState(nextFields, nextSources, parseContext, 3)
    setCopyState(`${section.label} cleared`)
  }

  function handleAssignLine(line, index) {
    const targetField = assignmentTargets[index]
    if (!targetField) {
      return
    }

    const nextFields = {
      ...fields,
      [targetField]: mergeAssignedValue(fields[targetField], line, targetField),
    }
    const nextSources = { ...sources, [targetField]: 'manual' }
    const nextContext = {
      ...parseContext,
      unmatchedLines: parseContext.unmatchedLines.filter((_, lineIndex) => lineIndex !== index),
    }

    const nextAssignments = { ...assignmentTargets }
    delete nextAssignments[index]

    setAssignmentTargets(nextAssignments)
    syncState(nextFields, nextSources, nextContext, 2)
    setCopyState(`Assigned review line to ${getFieldLabel(targetField)}`)
  }

  function isSectionOpen(sectionKey) {
    const status = sectionStatus[sectionKey]
    if (!parsedOnce) {
      return true
    }
    if (!status.complete) {
      return true
    }
    return sectionOverrides[sectionKey] ?? false
  }

  function toggleSection(sectionKey) {
    const status = sectionStatus[sectionKey]
    if (!status.complete) {
      return
    }
    setSectionOverrides((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? false),
    }))
  }

  const visiblePreviewPackages = [1, 2]
    .map((packageNumber) => ({
      packageNumber,
      title: fields[`PACKAGE_${packageNumber}_TITLE`],
      items: packageRows(packageNumber)
        .map((row) => ({
          item: fields[row.item],
          price: fields[row.price],
        }))
        .filter((row) => row.item || row.price),
      liner: {
        name: fields[`PACKAGE_${packageNumber}_LINER_KIT_NAME`],
        subtotal: fields[`PACKAGE_${packageNumber}_LINER_KIT_SUBTOTAL`],
      },
      install: {
        note: fields[`PACKAGE_${packageNumber}_INSTALL_NOTE`],
        price: fields[`PACKAGE_${packageNumber}_INSTALL_PRICE`],
      },
    }))
    .filter((pkg) => pkg.title || pkg.items.length || pkg.liner.name || pkg.install.note)

  return (
    <div className="app-shell">
      <header className="hero-band">
        <div>
          <p className="eyebrow">Benson Stone internal tool</p>
          <h1>Fireplace quote proposal field organizer</h1>
          <p className="hero-copy">
            Paste quote notes, review warnings, clean up the structured fields, then copy the exact placeholder payload
            into the approved template workflow.
          </p>
        </div>

        <div className="hero-summary">
          <dl className="hero-stats">
            <div>
              <dt>Total Fields</dt>
              <dd>{audit.fieldCount}</dd>
            </div>
            <div>
              <dt>Ready Fields</dt>
              <dd>{audit.readyFieldCount}</dd>
            </div>
            <div>
              <dt>Needs Review</dt>
              <dd>{audit.needsReviewCount}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{audit.warnings.length}</dd>
            </div>
          </dl>

          <div className={`export-status ${audit.exportReady ? 'is-ready' : 'is-blocked'}`}>
            <strong>Ready to export?</strong>
            <span>{audit.exportStatus}</span>
            {audit.blockingFieldLabels.length ? (
              <p>Blocking fields: {audit.blockingFieldLabels.join(', ')}</p>
            ) : (
              <p>No required template fields are blocking export.</p>
            )}
          </div>
        </div>
      </header>

      <nav className="step-progress">
        {workflowSteps.map((step) => (
          <button
            key={step.number}
            type="button"
            className={`step-chip ${currentStep === step.number ? 'is-current' : ''}`}
            onClick={() => scrollToStep(step.anchor, step.number, setCurrentStep)}
          >
            <span>{`Step ${step.number}`}</span>
            <strong>{step.label}</strong>
          </button>
        ))}
      </nav>

      <main className="workspace">
        <section className="panel step-panel" id="step-1">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 1</p>
              <h2>Paste Notes</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-2', 2, setCurrentStep)}>
              Go to review
            </button>
          </div>

          <div className="step-intro">
            <p>Paste the working quote notes exactly as they exist. This tool organizes them, but it does not invent missing data.</p>
            <div className="sample-box">
              <strong>Sample / testing only</strong>
              <span>Use Anna Orlinska to test the parser. This is not part of the normal department workflow.</span>
              <button type="button" className="ghost-button ghost-button--subtle" onClick={handleLoadSample}>
                Load Anna sample
              </button>
            </div>
          </div>

          <textarea
            className="notes-input"
            rows={20}
            placeholder="Paste fireplace quote notes here..."
            value={rawNotes}
            onChange={(event) => setRawNotes(event.target.value)}
          />

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleParse}>
              Parse / organize
            </button>
            <button type="button" className="ghost-button" onClick={handleClearAll}>
              Clear all
            </button>
          </div>

          <ul className="rule-list">
            <li>Quote good for defaults to 30 days.</li>
            <li>Payment terms and deposit terms default to 50% down at time of signing.</li>
            <li>Delivery date stays out of the customer-facing proposal unless explicitly requested.</li>
            <li>Product names, prices, tax, and totals stay exactly as entered in the notes.</li>
          </ul>

          {copyState ? <p className="quiet-status">{copyState}</p> : null}
        </section>

        <section className="panel step-panel" id="step-2">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 2</p>
              <h2>Review Warnings</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-3', 3, setCurrentStep)}>
              Go to fields
            </button>
          </div>

          <div className="review-grid">
            <div className="review-card">
              <h3>Warnings</h3>
              {audit.warnings.length ? (
                <ul className="notice-list notice-list--warning">
                  {audit.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No warnings right now.</p>
              )}
            </div>

            <div className="review-card">
              <h3>Defaults used</h3>
              {audit.infos.length ? (
                <ul className="notice-list">
                  {audit.infos.map((info) => (
                    <li key={info}>{info}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No defaults applied.</p>
              )}
            </div>

            <div className="review-card">
              <h3>Export blockers</h3>
              {audit.blockingFieldLabels.length ? (
                <ul className="notice-list notice-list--warning">
                  {audit.blockingFieldLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No required fields are blocking export.</p>
              )}
            </div>

            <div className="review-card">
              <h3>Section blanks</h3>
              <div className="missing-summary">
                {audit.missingBySection.map((group) => (
                  <div key={group.key}>
                    <strong>{group.label}</strong>
                    <span>{group.fields.length} blank</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="needs-review-box">
            <div className="panel-heading">
              <div>
                <h3>Needs Review</h3>
                <p className="section-caption">Unmatched lines stay here until you assign them or decide they do not belong in the proposal.</p>
              </div>
            </div>

            {parseContext.unmatchedLines.length ? (
              <div className="review-line-list">
                {parseContext.unmatchedLines.map((line, index) => (
                  <div className="review-line" key={`${index}-${line}`}>
                    <p>{line}</p>
                    <div className="review-line__controls">
                      <select
                        value={assignmentTargets[index] || ''}
                        onChange={(event) =>
                          setAssignmentTargets((current) => ({ ...current, [index]: event.target.value }))
                        }
                      >
                        <option value="">Assign to field...</option>
                        {assignmentOptions.map((field) => (
                          <option key={field} value={field}>
                            {getFieldLabel(field)}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="ghost-button" onClick={() => handleAssignLine(line, index)}>
                        Assign line
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No unmatched lines waiting for review.</p>
            )}
          </div>
        </section>

        <section className="panel step-panel" id="step-3">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 3</p>
              <h2>Edit Proposal Fields</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-4', 4, setCurrentStep)}>
              Go to copy/export
            </button>
          </div>

          <div className="section-stack">
            {sectionDefinitions.map((section) => {
              const layout = getSectionFieldLayout(section.key)
              const isOpen = isSectionOpen(section.key)
              const status = sectionStatus[section.key]
              const sectionCopyText = fieldsToExportLines(fields, section.fields)

              return (
                <section className="editor-section" key={section.key}>
                  <div className="editor-section__header">
                    <div>
                      <button
                        type="button"
                        className={`section-toggle ${status.complete ? '' : 'is-locked-open'}`}
                        onClick={() => toggleSection(section.key)}
                      >
                        <strong>{section.label}</strong>
                        <span>
                          {status.complete
                            ? isOpen
                              ? 'Hide section'
                              : 'Show section'
                            : `${status.missingCount} blank${status.warningCount ? ` • ${status.warningCount} warning` : ''}`}
                        </span>
                      </button>
                    </div>
                    <div className="button-stack">
                      <button
                        type="button"
                        className="ghost-button ghost-button--subtle"
                        onClick={() => {
                          copyText(sectionCopyText)
                          setCopyState(`${section.label} fields copied`)
                          setCurrentStep(4)
                        }}
                      >
                        Copy section fields
                      </button>
                      <button
                        type="button"
                        className="ghost-button ghost-button--subtle"
                        onClick={() => handleClearSection(section)}
                      >
                        Clear section
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="editor-section__body">
                      {layout === 'basic-grid' ? (
                        <div className="field-grid field-grid--three">
                          {section.fields.map((field) => (
                            <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                          ))}
                        </div>
                      ) : null}

                      {layout === 'mixed-grid' ? (
                        <div className="field-grid field-grid--three">
                          {section.fields.map((field) =>
                            field === 'PROJECT_OVERVIEW' || field === 'INSTALLATION_SCOPE' || field === 'PROJECT_NOTES' || field === 'LEGAL_TERMS' ? (
                              <MultiLineField
                                key={field}
                                field={field}
                                fields={fields}
                                sources={sources}
                                onChange={handleFieldChange}
                                rows={field === 'LEGAL_TERMS' ? 5 : 4}
                              />
                            ) : (
                              <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                            ),
                          )}
                        </div>
                      ) : null}

                      {layout === 'package' ? (
                        <>
                          <div className="field-grid field-grid--three">
                            {section.fields
                              .filter((field) => !field.includes('_ITEM_') && !field.includes('_PRICE_'))
                              .map((field) => (
                                <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                              ))}
                          </div>
                          <div className="line-item-grid">
                            {packageRows(section.key === 'package_1' ? 1 : 2).map((row) => (
                              <div className="line-item-row" key={row.item}>
                                <Field field={row.item} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.price} fields={fields} sources={sources} onChange={handleFieldChange} />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}

                      {layout === 'detail' ? (
                        <>
                          <div className="field-grid field-grid--two">
                            <Field
                              field={section.key === 'detail_section_1' ? 'DETAIL_SECTION_1_TITLE' : 'DETAIL_SECTION_2_TITLE'}
                              fields={fields}
                              sources={sources}
                              onChange={handleFieldChange}
                            />
                            <Field
                              field={section.key === 'detail_section_1' ? 'DETAIL_SECTION_1_SUBTOTAL' : 'DETAIL_SECTION_2_SUBTOTAL'}
                              fields={fields}
                              sources={sources}
                              onChange={handleFieldChange}
                            />
                          </div>
                          <div className="detail-table">
                            <div className="detail-table__header">
                              <span>Item</span>
                              <span>Qty</span>
                              <span>Unit</span>
                              <span>Total</span>
                            </div>
                            {detailRows(section.key === 'detail_section_1' ? 1 : 2).map((row) => (
                              <div className="detail-table__row" key={row.item}>
                                <Field field={row.item} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.qty} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.unit} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.total} fields={fields} sources={sources} onChange={handleFieldChange} />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </section>

        <section className="panel step-panel" id="step-4">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 4</p>
              <h2>Copy / Export</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-5', 5, setCurrentStep)}>
              Go to preview
            </button>
          </div>

          <div className="copy-groups">
            {copyGroups.map((group) => (
              <button key={group.key} type="button" className="ghost-button" onClick={() => handleCopyGroup(group)}>
                {group.label}
              </button>
            ))}
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                copyText(exportJson)
                setCopyState('JSON copied')
                setCurrentStep(4)
              }}
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                downloadJson(fields)
                setCopyState('JSON exported')
                setCurrentStep(4)
              }}
            >
              Export JSON
            </button>
          </div>

          <div className="output-grid">
            <label className="field field--wide">
              <span>Flat placeholder output</span>
              <textarea rows={16} value={exportLines} readOnly />
            </label>
            <label className="field field--wide">
              <span>JSON output</span>
              <textarea rows={16} value={exportJson} readOnly />
            </label>
          </div>
        </section>

        <section className="panel step-panel" id="step-5">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 5</p>
              <h2>Simple internal preview</h2>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                window.print()
                setCurrentStep(5)
              }}
            >
              Print / PDF
            </button>
          </div>

          <div className="preview-warning">
            This is not the final designed customer proposal. Use the Canva template or future PDF export for the customer-facing version.
          </div>

          <section className="print-preview">
            <div className="print-page">
              <div className="print-header">
                <div>
                  <p>Benson Stone Co.</p>
                  <strong>Fireplace Project Proposal</strong>
                </div>
                <div className="preview-meta">
                  <span>{fields.QUOTE_NO || 'Quote # pending'}</span>
                  <span>{fields.QUOTE_DATE || 'Date pending'}</span>
                </div>
              </div>

              <div className="preview-columns">
                <div>
                  <h3>Customer</h3>
                  {renderTextBlock(fields.CUSTOMER_NAME, 'Customer name pending')}
                  {renderTextBlock(fields.INVOICE_ADDRESS_LINE_1, 'Invoice address pending')}
                  {renderTextBlock(fields.INVOICE_CITY_STATE_ZIP, 'Invoice city/state/zip pending')}
                  {renderTextBlock(fields.CUSTOMER_PHONE, 'Customer phone pending')}
                </div>
                <div>
                  <h3>Project</h3>
                  {renderTextBlock(fields.PROJECT_TITLE, 'Project title pending')}
                  {renderTextBlock(fields.PROJECT_CITY_STATE, 'Project city/state pending')}
                  {renderTextBlock(fields.PROJECT_ADDRESS_LINE_1, 'Project address pending')}
                  {renderTextBlock(fields.PROJECT_CITY_STATE_ZIP, 'Project city/state/zip pending')}
                </div>
              </div>

              <div className="preview-section">
                <h3>Project overview</h3>
                {renderTextBlock(fields.PROJECT_OVERVIEW, 'Project overview pending')}
              </div>

              <div className="preview-package-grid">
                {visiblePreviewPackages.length ? (
                  visiblePreviewPackages.map((pkg) => (
                    <div className="preview-package" key={pkg.packageNumber}>
                      <h3>{pkg.title || `Package ${pkg.packageNumber}`}</h3>
                      {pkg.items.length ? (
                        <ul className="preview-list">
                          {pkg.items.map((item) => (
                            <li key={`${pkg.packageNumber}-${item.item}`}>
                              <span>{item.item}</span>
                              <strong>{item.price}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="preview-placeholder">No package items yet.</p>
                      )}
                      {pkg.liner.name ? (
                        <p className="preview-inline">
                          <span>{pkg.liner.name}</span>
                          <strong>{pkg.liner.subtotal}</strong>
                        </p>
                      ) : null}
                      {pkg.install.note ? (
                        <p className="preview-inline">
                          <span>{pkg.install.note}</span>
                          <strong>{pkg.install.price}</strong>
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="preview-placeholder">No package content ready yet.</p>
                )}
              </div>

              <div className="preview-section">
                <h3>Installation scope</h3>
                {renderTextBlock(fields.INSTALLATION_SCOPE, 'Installation scope pending')}
              </div>
            </div>

            <div className="print-page">
              <div className="print-header">
                <div>
                  <p>Detailed scope and investment</p>
                  <strong>{fields.CUSTOMER_NAME || 'Customer pending'}</strong>
                </div>
                <div className="preview-meta">
                  <span>{fields.QUOTE_GOOD_FOR ? `Good for ${fields.QUOTE_GOOD_FOR}` : 'Good-for window pending'}</span>
                  <span>{fields.PAYMENT_TERMS || 'Payment terms pending'}</span>
                </div>
              </div>

              <div className="preview-columns">
                {[1, 2].map((detailNumber) => (
                  <div key={detailNumber}>
                    <h3>{fields[`DETAIL_SECTION_${detailNumber}_TITLE`] || `Detail Section ${detailNumber}`}</h3>
                    <p className="preview-subtotal">{fields[`DETAIL_SECTION_${detailNumber}_SUBTOTAL`] || 'Subtotal pending'}</p>
                    <ul className="preview-list">
                      {detailRows(detailNumber)
                        .map((row) => ({
                          item: fields[row.item],
                          qty: fields[row.qty],
                          unit: fields[row.unit],
                          total: fields[row.total],
                        }))
                        .filter((row) => row.item || row.total)
                        .map((row, index) => (
                          <li key={`${detailNumber}-${index}`}>
                            <span>{`${row.item}${row.qty ? ` (${row.qty})` : ''}`}</span>
                            <strong>{row.total || row.unit}</strong>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="preview-columns">
                <div>
                  <h3>Project notes</h3>
                  {renderTextBlock(fields.PROJECT_NOTES, 'No project notes added yet.')}
                </div>
                <div>
                  <h3>Investment summary</h3>
                  <ul className="preview-list">
                    <li><span>Total Amount</span><strong>{fields.TOTAL_AMOUNT || 'Pending'}</strong></li>
                    <li><span>IR Tax</span><strong>{fields.IR_TAX || 'Pending'}</strong></li>
                    <li><span>Quotation Total</span><strong>{fields.QUOTATION_TOTAL || 'Pending'}</strong></li>
                    <li><span>Amount Paid</span><strong>{fields.AMOUNT_PAID || 'Pending'}</strong></li>
                    <li><span>Balance Due</span><strong>{fields.BALANCE_DUE || 'Pending'}</strong></li>
                  </ul>
                </div>
              </div>

              <div className="preview-columns">
                <div>
                  <h3>Deposit terms</h3>
                  {renderTextBlock(fields.DEPOSIT_TERMS, 'Deposit terms pending')}
                </div>
                <div>
                  <h3>Legal terms</h3>
                  {renderTextBlock(fields.LEGAL_TERMS, 'Legal terms pending')}
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

export default App
