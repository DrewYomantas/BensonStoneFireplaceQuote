import { useMemo, useState } from 'react'
import './App.css'
import annaSampleNotes from './data/anna-orlinska-notes.txt?raw'
import { createEmptyFieldState, fieldGroups, getFieldLabel, orderedFields } from './lib/fieldContract'
import {
  buildAudit,
  fieldsToExportLines,
  getFieldStatusClass,
  parseNotes,
} from './lib/parser'

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

function groupedRows(prefix) {
  return Array.from({ length: 9 }, (_, index) => index + 1).map((number) => ({
    item: `${prefix}_ITEM_${number}`,
    qty: `${prefix}_QTY_${number}`,
    unit: `${prefix}_UNIT_PRICE_${number}`,
    total: `${prefix}_TOTAL_${number}`,
  }))
}

function packageRows(packageNumber) {
  return Array.from({ length: 4 }, (_, index) => index + 1).map((number) => ({
    item: `PACKAGE_${packageNumber}_ITEM_${number}`,
    price: `PACKAGE_${packageNumber}_PRICE_${number}`,
  }))
}

function Field({ field, fields, sources, onChange }) {
  return (
    <label className={`field ${getFieldStatusClass(sources[field])}`}>
      <span>{getFieldLabel(field)}</span>
      <input value={fields[field]} onChange={(event) => onChange(field, event.target.value)} />
    </label>
  )
}

function MultiLineField({ field, fields, sources, onChange, rows = 3 }) {
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

  function handleParse() {
    const result = parseNotes(rawNotes)
    setFields(result.fields)
    setSources(result.sources)
    setParseContext(result.context)
    setAudit(result.audit)
    setCopyState('organized')
  }

  function handleFieldChange(field, value) {
    const nextFields = { ...fields, [field]: value }
    const nextSources = { ...sources, [field]: value ? 'manual' : 'blank' }
    setFields(nextFields)
    setSources(nextSources)
    setAudit(buildAudit(nextFields, nextSources, parseContext))
  }

  const exportJson = JSON.stringify(fields, null, 2)
  const exportLines = fieldsToExportLines(fields)

  return (
    <div className="app-shell">
      <header className="hero-band">
        <div>
          <p className="eyebrow">Benson Stone internal tool</p>
          <h1>Fireplace quote notes to template-ready proposal fields</h1>
          <p className="hero-copy">
            Review-first parser for the approved Canva/PPTX placeholder set. It keeps blanks blank, applies only the
            explicit default rules, and surfaces anything that needs a human check.
          </p>
        </div>
        <dl className="hero-stats">
          <div>
            <dt>Template fields</dt>
            <dd>{audit.fieldCount}</dd>
          </div>
          <div>
            <dt>Still blank</dt>
            <dd>{audit.missingFields.length}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{audit.warnings.length}</dd>
          </div>
        </dl>
      </header>

      <main className="workspace">
        <section className="left-rail">
          <div className="panel panel--sticky">
            <div className="panel-heading">
              <div>
                <p className="kicker">Input</p>
                <h2>Messy quote notes</h2>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setRawNotes(annaSampleNotes)
                  setCopyState('sample loaded')
                }}
              >
                Load Anna sample
              </button>
            </div>

            <textarea
              className="notes-input"
              rows={28}
              placeholder="Paste quote notes here..."
              value={rawNotes}
              onChange={(event) => setRawNotes(event.target.value)}
            />

            <div className="action-row">
              <button type="button" className="primary-button" onClick={handleParse}>
                Parse / organize
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setRawNotes('')
                  setFields(emptyFields)
                  setSources(emptySources)
                  setParseContext({ unmatchedLines: [], deliveryDateMentioned: false })
                  setAudit(buildAudit(emptyFields, emptySources, { unmatchedLines: [], deliveryDateMentioned: false }))
                  setCopyState('cleared')
                }}
              >
                Clear
              </button>
            </div>

            <ul className="rule-list">
              <li>Quote good for defaults to 30 days.</li>
              <li>Payment terms default to 50% down at time of signing.</li>
              <li>Delivery dates are omitted unless explicitly needed in the customer proposal.</li>
              <li>Product names, prices, tax, and totals stay exactly as entered.</li>
            </ul>

            {copyState ? <p className="quiet-status">{copyState}</p> : null}
          </div>
        </section>

        <section className="main-rail">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">Review</p>
                <h2>Warnings and completion</h2>
              </div>
            </div>

            <div className="audit-grid">
              <div>
                <h3>Warnings</h3>
                {audit.warnings.length ? (
                  <ul className="notice-list notice-list--warning">
                    {audit.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No structural warnings right now.</p>
                )}
              </div>

              <div>
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
            </div>

            {audit.unmatchedLines.length ? (
              <div className="unmatched-block">
                <h3>Needs review</h3>
                <ul className="notice-list notice-list--warning">
                  {audit.unmatchedLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="missing-summary">
              {audit.missingBySection.map((group) => (
                <div key={group.key}>
                  <strong>{group.label}</strong>
                  <span>{group.fields.length} blank</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">Edit</p>
                <h2>Structured review form</h2>
              </div>
            </div>

            <div className="form-section">
              <h3>Customer</h3>
              <div className="field-grid">
                {fieldGroups
                  .find((group) => group.key === 'customer')
                  .fields.map((field) => (
                    <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                  ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Quote meta</h3>
              <div className="field-grid">
                {fieldGroups
                  .find((group) => group.key === 'quote_meta')
                  .fields.map((field) => (
                    <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                  ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Project copy</h3>
              <div className="field-grid">
                <MultiLineField field="PROJECT_OVERVIEW" fields={fields} sources={sources} onChange={handleFieldChange} rows={4} />
                <MultiLineField field="INSTALLATION_SCOPE" fields={fields} sources={sources} onChange={handleFieldChange} rows={4} />
                <Field field="INSTALLATION_TOTAL" fields={fields} sources={sources} onChange={handleFieldChange} />
              </div>
            </div>

            {[1, 2].map((packageNumber) => (
              <div className="form-section" key={packageNumber}>
                <h3>{`Package ${packageNumber}`}</h3>
                <div className="field-grid">
                  <Field
                    field={`PACKAGE_${packageNumber}_TITLE`}
                    fields={fields}
                    sources={sources}
                    onChange={handleFieldChange}
                  />
                  <Field
                    field={`PACKAGE_${packageNumber}_LINER_KIT_NAME`}
                    fields={fields}
                    sources={sources}
                    onChange={handleFieldChange}
                  />
                  <Field
                    field={`PACKAGE_${packageNumber}_LINER_KIT_SUBTOTAL`}
                    fields={fields}
                    sources={sources}
                    onChange={handleFieldChange}
                  />
                  <Field
                    field={`PACKAGE_${packageNumber}_INSTALL_NOTE`}
                    fields={fields}
                    sources={sources}
                    onChange={handleFieldChange}
                  />
                  <Field
                    field={`PACKAGE_${packageNumber}_INSTALL_PRICE`}
                    fields={fields}
                    sources={sources}
                    onChange={handleFieldChange}
                  />
                </div>
                <div className="line-item-grid">
                  {packageRows(packageNumber).map((row) => (
                    <div className="line-item-row" key={row.item}>
                      <Field field={row.item} fields={fields} sources={sources} onChange={handleFieldChange} />
                      <Field field={row.price} fields={fields} sources={sources} onChange={handleFieldChange} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {[1, 2].map((detailNumber) => (
              <div className="form-section" key={detailNumber}>
                <h3>{`Detail section ${detailNumber}`}</h3>
                <div className="field-grid">
                  <Field
                    field={`DETAIL_SECTION_${detailNumber}_TITLE`}
                    fields={fields}
                    sources={sources}
                    onChange={handleFieldChange}
                  />
                  <Field
                    field={`DETAIL_SECTION_${detailNumber}_SUBTOTAL`}
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
                  {groupedRows(`DETAIL_${detailNumber}`).map((row) => (
                    <div className="detail-table__row" key={row.item}>
                      <Field field={row.item} fields={fields} sources={sources} onChange={handleFieldChange} />
                      <Field field={row.qty} fields={fields} sources={sources} onChange={handleFieldChange} />
                      <Field field={row.unit} fields={fields} sources={sources} onChange={handleFieldChange} />
                      <Field field={row.total} fields={fields} sources={sources} onChange={handleFieldChange} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="form-section">
              <h3>Investment and acceptance</h3>
              <div className="field-grid">
                <MultiLineField field="PROJECT_NOTES" fields={fields} sources={sources} onChange={handleFieldChange} rows={4} />
                <MultiLineField field="LEGAL_TERMS" fields={fields} sources={sources} onChange={handleFieldChange} rows={5} />
                <Field field="TOTAL_AMOUNT" fields={fields} sources={sources} onChange={handleFieldChange} />
                <Field field="IR_TAX" fields={fields} sources={sources} onChange={handleFieldChange} />
                <Field field="QUOTATION_TOTAL" fields={fields} sources={sources} onChange={handleFieldChange} />
                <Field field="AMOUNT_PAID" fields={fields} sources={sources} onChange={handleFieldChange} />
                <Field field="BALANCE_DUE" fields={fields} sources={sources} onChange={handleFieldChange} />
                <Field field="DEPOSIT_TERMS" fields={fields} sources={sources} onChange={handleFieldChange} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">Output</p>
                <h2>Copy-to-Canva field payload</h2>
              </div>
              <div className="button-stack">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    copyText(exportLines)
                    setCopyState('field lines copied')
                  }}
                >
                  Copy fields
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    copyText(exportJson)
                    setCopyState('json copied')
                  }}
                >
                  Copy JSON
                </button>
                <button type="button" className="ghost-button" onClick={() => downloadJson(fields)}>
                  Export JSON
                </button>
                <button type="button" className="ghost-button" onClick={() => window.print()}>
                  Print / PDF
                </button>
              </div>
            </div>

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
          </div>

          <section className="print-preview">
            <div className="print-page">
              <div className="print-header">
                <p>Benson Stone Co.</p>
                <strong>{fields.CUSTOMER_NAME || 'Customer name pending'}</strong>
              </div>
              <div className="preview-grid">
                <div>
                  <h3>Project</h3>
                  <p>{fields.PROJECT_TITLE || 'Project title pending'}</p>
                  <p>{fields.PROJECT_CITY_STATE || 'Project city/state pending'}</p>
                  <p>{fields.PROJECT_OVERVIEW || 'Project overview pending'}</p>
                </div>
                <div>
                  <h3>Quote meta</h3>
                  <p>{`Quote #: ${fields.QUOTE_NO || ''}`}</p>
                  <p>{`Date: ${fields.QUOTE_DATE || ''}`}</p>
                  <p>{`Terms: ${fields.PAYMENT_TERMS || ''}`}</p>
                </div>
              </div>
            </div>

            <div className="print-page">
              <div className="print-header">
                <p>Investment summary</p>
                <strong>{fields.QUOTATION_TOTAL || 'Total pending'}</strong>
              </div>
              <div className="preview-grid">
                <div>
                  <h3>Notes</h3>
                  <p>{fields.PROJECT_NOTES || 'No customer notes added yet.'}</p>
                </div>
                <div>
                  <h3>Acceptance</h3>
                  <p>{fields.DEPOSIT_TERMS || 'Deposit terms pending'}</p>
                  <p>{fields.LEGAL_TERMS || 'Legal terms pending'}</p>
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
