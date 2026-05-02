import { useMemo, useRef, useState } from 'react'
import {
  createDisplayRecord,
  displayFilterDefinitions,
  displayStatusOptions,
  filterDisplayRecords,
  getDisplayFilterCounts,
  getDisplayRegisterEmptyState,
  listDisplayRecords,
  locationZoneOptions,
  removeDisplayRecord,
  saveDisplayRecord,
  updateDisplayRecord,
  workingStatusOptions,
} from '../lib/showroomDisplayRegister.js'

const emptyForm = {
  id: '',
  productCode: '',
  modelName: '',
  description: '',
  brand: '',
  applianceType: '',
  locationZone: 'unknown',
  locationDetail: '',
  displayStatus: 'unknown',
  workingStatus: 'unknown',
  lastVerifiedAt: '',
  internalNotes: '',
  talkingPoints: '',
}

function titleCase(value) {
  return String(value || '').replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value) {
  if (!value) return 'Not confirmed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadgeClass(status) {
  if (status === 'on-display') return 'bs-badge bs-badge--status'
  if (status === 'needs-verification') return 'bs-badge bs-badge--warning'
  if (status === 'not-on-display') return 'bs-badge bs-badge--blocked'
  return 'bs-badge bs-badge--unknown'
}

function workingBadgeClass(status) {
  if (status === 'burning') return 'bs-badge bs-badge--status'
  if (status === 'display-only') return 'bs-badge bs-badge--warm'
  if (status === 'disconnected') return 'bs-badge bs-badge--blocked'
  return 'bs-badge bs-badge--unknown'
}

function DisplayField({ label, value, onChange, multiline = false }) {
  return (
    <label className={`bs-field ${multiline ? 'bs-field--wide' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

function DisplaySelect({ label, value, options, onChange }) {
  return (
    <label className="bs-field">
      <span>{label}</span>
      <select className="bs-display-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{titleCase(option)}</option>
        ))}
      </select>
    </label>
  )
}

export default function ShowroomDisplayRegister() {
  const [records, setRecords] = useState(() => listDisplayRecords())
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [status, setStatus] = useState('Track what is physically on the First Floor or in the Cellar. This register is local and internal only.')
  const formRef = useRef(null)

  const filteredRecords = useMemo(() => filterDisplayRecords(records, filter, search), [records, filter, search])
  const counts = useMemo(() => getDisplayFilterCounts(records, search), [records, search])
  const emptyState = useMemo(() => getDisplayRegisterEmptyState(filter, search), [filter, search])
  const editing = Boolean(form.id)

  function patchForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setForm(emptyForm)
    setStatus('Track what is physically on the First Floor or in the Cellar. This register is local and internal only.')
  }

  function refreshRecords() {
    setRecords(listDisplayRecords())
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!form.productCode.trim() && !form.modelName.trim()) {
      setStatus('Enter a Product Code or Model / Description before saving the display record.')
      return
    }
    if (editing) {
      updateDisplayRecord(form.id, form)
      setStatus('Display record updated.')
    } else {
      saveDisplayRecord(createDisplayRecord(form))
      setStatus('Display record saved.')
    }
    refreshRecords()
    resetForm()
  }

  function handleEdit(record) {
    setForm(record)
    setStatus(`Editing — ${record.productCode || record.modelName || 'display record'}. Update fields and click Save.`)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleDelete(id) {
    removeDisplayRecord(id)
    refreshRecords()
    if (form.id === id) resetForm()
    setStatus('Display record deleted.')
  }

  function markVerifiedToday() {
    patchForm('lastVerifiedAt', new Date().toISOString().slice(0, 10))
  }

  return (
    <div className="bs-display-register">
      <section className="bs-display-register__sidebar">
        <div className="bs-display-register__intro">
          <p className="bs-lens__eyebrow">Internal Only — Not Customer-Facing</p>
          <h2>Showroom Display Register</h2>
          <p>
            Track what is physically on display in the First Floor showroom or The Cellar. Records here let the workbench show internal display context when reviewing quotes. Add records manually when you verify a product is on display.
          </p>
        </div>

        <form className="bs-display-form" onSubmit={handleSubmit} ref={formRef}>
          <div className="bs-display-form__head">
            <div>
              <p className="bs-recovery__section-label">{editing ? 'Edit Record' : 'Add Record'}</p>
              <strong>{editing ? 'Update Fireplace Display' : 'Add Fireplace Display'}</strong>
            </div>
            {editing ? (
              <button type="button" className="bs-lens__copy bs-lens__copy--ghost" onClick={resetForm}>New Record</button>
            ) : null}
          </div>

          <div className="bs-grid">
            <DisplayField label="Product Code" value={form.productCode} onChange={(value) => patchForm('productCode', value)} />
            <DisplayField label="Model / Description" value={form.modelName} onChange={(value) => patchForm('modelName', value)} />
            <DisplayField label="Brand / Manufacturer" value={form.brand} onChange={(value) => patchForm('brand', value)} />
            <DisplayField label="Appliance Type" value={form.applianceType} onChange={(value) => patchForm('applianceType', value)} />
            <DisplayField label="Description" value={form.description} onChange={(value) => patchForm('description', value)} multiline />
            <DisplaySelect label="Display Status" value={form.displayStatus} options={displayStatusOptions} onChange={(value) => patchForm('displayStatus', value)} />
            <DisplaySelect label="Location" value={form.locationZone} options={locationZoneOptions} onChange={(value) => patchForm('locationZone', value)} />
            <DisplaySelect label="Working Status" value={form.workingStatus} options={workingStatusOptions} onChange={(value) => patchForm('workingStatus', value)} />
            <DisplayField label="Location Detail" value={form.locationDetail} onChange={(value) => patchForm('locationDetail', value)} />
            <DisplayField label="Last Verified" value={form.lastVerifiedAt} onChange={(value) => patchForm('lastVerifiedAt', value)} />
            <DisplayField label="Showroom Talking Point" value={form.talkingPoints} onChange={(value) => patchForm('talkingPoints', value)} multiline />
            <DisplayField label="Internal Display Note" value={form.internalNotes} onChange={(value) => patchForm('internalNotes', value)} multiline />
          </div>

          <div className="bs-display-form__actions">
            <button type="button" className="bs-lens__copy" onClick={markVerifiedToday}>Mark Verified Today</button>
            <button type="submit" className="bs-button bs-button--primary bs-display-form__save">
              {editing ? 'Update Display Record' : 'Save Display Record'}
            </button>
          </div>
        </form>
      </section>

      <section className="bs-display-register__main">
        <div className="bs-display-toolbar">
          <div className="bs-display-toolbar__search">
            <label className="bs-field bs-field--wide">
              <span>Search Display Register</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Product code, model, description, or location"
              />
            </label>
          </div>

          <div className="bs-display-toolbar__filters">
            {displayFilterDefinitions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`bs-section-toggle ${filter === item.value ? 'bs-section-toggle--active' : ''}`}
                onClick={() => setFilter(item.value)}
              >
                <span>{item.label}</span>
                <span className="bs-filter-count">{counts[item.value] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="bs-status" role="status">{status}</p>

        {filteredRecords.length === 0 ? (
          <div className="bs-queue-empty">
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#173321', fontSize: 16 }}>{emptyState.title}</p>
            <p style={{ margin: 0, fontSize: 13, color: '#6b5a47' }}>{emptyState.body}</p>
          </div>
        ) : (
          <div className="bs-display-list">
            {filteredRecords.map((record) => (
              <article key={record.id} className="bs-display-card">
                <div className="bs-display-card__head">
                  <div>
                    <strong>{record.productCode || record.modelName || 'Unnamed display'}</strong>
                    <span>{record.modelName || record.description || 'Manual fireplace display record'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="bs-lens__copy" onClick={() => handleEdit(record)}>Edit</button>
                    <button type="button" className="bs-lens__copy bs-lens__copy--danger" onClick={() => handleDelete(record.id)}>Delete</button>
                  </div>
                </div>

                <div className="bs-queue-card__badges">
                  <span className={statusBadgeClass(record.displayStatus)}>{titleCase(record.displayStatus)}</span>
                  <span className={workingBadgeClass(record.workingStatus)}>{titleCase(record.workingStatus)}</span>
                  <span className="bs-badge bs-badge--unknown">{titleCase(record.locationZone)}</span>
                </div>

                <div className="bs-display-card__meta">
                  <div>
                    <span>Location</span>
                    <strong>{titleCase(record.locationZone)}{record.locationDetail ? ` - ${record.locationDetail}` : ''}</strong>
                  </div>
                  <div>
                    <span>Last Verified</span>
                    <strong>{formatDate(record.lastVerifiedAt)}</strong>
                  </div>
                </div>

                {record.talkingPoints ? (
                  <div className="bs-display-card__section">
                    <p className="bs-recovery__section-label">Showroom Talking Point</p>
                    <p>{record.talkingPoints}</p>
                  </div>
                ) : null}

                {record.internalNotes ? (
                  <div className="bs-display-card__section">
                    <p className="bs-recovery__section-label">Internal Display Note</p>
                    <p>{record.internalNotes}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

