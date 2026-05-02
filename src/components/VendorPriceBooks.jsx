import { useState } from 'react'
import {
  categoryOptions,
  filterVendors,
  getPriceBookPath,
  getVendorCategoryCounts,
  listVendors,
  loadVendorNotes,
  mergeVendorNotes,
  PRICING_HIERARCHY,
  saveVendorNote,
} from '../lib/vendorPriceBooks.js'

const allVendors = listVendors()

function categoryBadgeClass(category) {
  const map = {
    'gas-fireplace': 'bs-vb-badge--gas',
    'gas-log': 'bs-vb-badge--gas-log',
    wood: 'bs-vb-badge--wood',
    electric: 'bs-vb-badge--electric',
    'grill-outdoor': 'bs-vb-badge--grill',
    'doors-glass': 'bs-vb-badge--doors',
    'stone-mantel': 'bs-vb-badge--stone',
    accessories: 'bs-vb-badge--accessories',
  }
  return `bs-vb-badge ${map[category] || ''}`
}

function categoryLabel(category) {
  const found = categoryOptions.find((c) => c.value === category)
  return found ? found.label : category
}

function VendorCard({ vendor, userNote, onSaveNote }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(userNote)
  const [copied, setCopied] = useState(false)

  const fullPath = getPriceBookPath(vendor)
  const isCostFile = vendor.internalNote.toLowerCase().includes('dealer cost') ||
    vendor.internalNote.toLowerCase().includes('internal only')

  function handleCopy() {
    navigator.clipboard.writeText(fullPath).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  function handleSave() {
    onSaveNote(vendor.id, draft)
    setEditing(false)
  }

  return (
    <div className="bs-vb-card">
      <div className="bs-vb-card__head">
        <div>
          <strong>{vendor.name}</strong>
          <span className="bs-vb-card__date">{vendor.priceListDate}</span>
        </div>
        <span className={categoryBadgeClass(vendor.category)}>{categoryLabel(vendor.category)}</span>
      </div>

      {isCostFile ? (
        <p className="bs-vb-card__cost-warning">Internal only — contains dealer cost pricing. Never use for customer output.</p>
      ) : null}

      <div className="bs-vb-card__file">
        <span className="bs-vb-card__filename">{vendor.priceListFile}</span>
        <button type="button" className="bs-lens__copy" onClick={handleCopy} title="Copy file path to open in File Explorer">
          {copied ? '✓ Copied' : 'Copy Path'}
        </button>
      </div>

      <div className="bs-vb-card__path" title="Paste in File Explorer address bar to open">{fullPath}</div>

      {vendor.internalNote && !isCostFile ? (
        <p className="bs-vb-card__note">{vendor.internalNote}</p>
      ) : null}

      <div className="bs-vb-card__user-note">
        {editing ? (
          <>
            <textarea
              className="bs-vb-note-input"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Internal note (visible only to you)"
            />
            <div className="bs-vb-card__note-actions">
              <button type="button" className="bs-lens__copy" onClick={handleSave}>Save</button>
              <button type="button" className="bs-lens__copy bs-lens__copy--ghost" onClick={() => { setDraft(userNote); setEditing(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <button type="button" className="bs-vb-note-toggle" onClick={() => { setDraft(userNote); setEditing(true) }}>
            {userNote ? `Note: ${userNote}` : '+ Add internal note'}
          </button>
        )}
      </div>
    </div>
  )
}

function PricingHierarchy() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bs-vb-hierarchy">
      <button type="button" className="bs-vb-hierarchy__toggle" onClick={() => setOpen((prev) => !prev)}>
        <span>Pricing hierarchy</span>
        <span>{open ? 'hide' : 'show'}</span>
      </button>
      {open ? (
        <ol className="bs-vb-hierarchy__list">
          {PRICING_HIERARCHY.map((line) => <li key={line}>{line}</li>)}
        </ol>
      ) : null}
    </div>
  )
}

export default function VendorPriceBooks() {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState(() => loadVendorNotes())

  const filtered = filterVendors(allVendors, category, search)
  const counts = getVendorCategoryCounts(allVendors, search)
  const merged = mergeVendorNotes(filtered, notes)

  function handleSaveNote(vendorId, note) {
    saveVendorNote(vendorId, note)
    setNotes(loadVendorNotes())
  }

  return (
    <div className="bs-vb">
      <div className="bs-vb__header">
        <div>
          <p className="bs-lens__eyebrow">Internal reference only</p>
          <h2>Vendors &amp; Price Books</h2>
          <p className="bs-vb__subtitle">
            {allVendors.length} price lists from FP Central Price List — internal reference only.
            Pricing never surfaces in customer output. Copy a file path to open locally in File Explorer.
          </p>
        </div>
        <PricingHierarchy />
      </div>

      <div className="bs-vb__controls">
        <div className="bs-vb__filters">
          {categoryOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`bs-section-toggle ${category === value ? 'bs-section-toggle--active' : ''}`}
              onClick={() => setCategory(value)}
            >
              {label}
              <span className="bs-filter-count">{counts[value]}</span>
            </button>
          ))}
        </div>
        <input
          className="bs-vb__search"
          type="search"
          placeholder="Search vendor, filename, date…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {merged.length === 0 ? (
        <div className="bs-queue-empty">
          <p>No vendors match your search.</p>
        </div>
      ) : (
        <div className="bs-vb__grid">
          {merged.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              userNote={vendor.userNote}
              onSaveNote={handleSaveNote}
            />
          ))}
        </div>
      )}
    </div>
  )
}
