// Customer Bulk Intake (Milestone 19) — pure logic, no direct storage access.
//
// Parse pasted CSV or TSV text into draft Customer File rows. Normalizes common
// header aliases, detects missing required fields, detects duplicates against
// existing Customer Files, and returns a review model.
//
// commitBulkIntakeDrafts() is the one async function: it takes selected review
// rows and writes them to durable storage, one new Customer File per row.
// The helper never reads files from disk, never stores raw bytes or file paths,
// and never marks anything reviewed, quoted, or sent.

import { saveCustomerFileDurable } from './customerFileDurable.js'
import { appendActivityForFile } from './visitActivity.js'

// ---- Scrub -----------------------------------------------------------------

const BANNED_PHRASES = [
  'ready to send',
  'proposal ready',
  'customer ready',
  'approved',
]

const SENSITIVE_TERMS = [
  'cost', 'buy price', 'average cost', 'margin', 'margin %',
  'supplier total', 'supplier history', 'inventory turn',
  'product rank', 'sales rank', 'raw ocr', 'raw pdf',
  'private catalog', 'private file path', 'ocr confidence',
  'fuzzy confidence', 'bistrack confidence', 'fuzzy match',
  'internal confidence',
]

function safe(value) {
  if (value === undefined || value === null) return ''
  const s = String(value).trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  for (const p of BANNED_PHRASES) {
    if (lower.includes(p)) return ''
  }
  for (const t of SENSITIVE_TERMS) {
    if (lower.includes(t)) return ''
  }
  return s
}

// ---- Header normalization --------------------------------------------------

// Maps normalized header aliases → internal field tokens.
// Leading/trailing whitespace and case normalized before lookup.
const HEADER_ALIASES = {
  'name': 'customerName',
  'customer name': 'customerName',
  'customername': 'customerName',
  'full name': 'customerName',
  'fullname': 'customerName',
  'contact name': 'customerName',
  'first name': '_firstName',
  'firstname': '_firstName',
  'last name': '_lastName',
  'lastname': '_lastName',
  'phone': 'customerPhone',
  'mobile': 'customerPhone',
  'cell': 'customerPhone',
  'telephone': 'customerPhone',
  'mobile phone': 'customerPhone',
  'phone number': 'customerPhone',
  'email': 'customerEmail',
  'email address': 'customerEmail',
  'emailaddress': 'customerEmail',
  'e-mail': 'customerEmail',
  'address': 'projectAddress',
  'street': '_street',
  'street address': '_street',
  'city': '_city',
  'state': '_state',
  'zip': '_zip',
  'zip code': '_zip',
  'zipcode': '_zip',
  'postal': '_zip',
  'postal code': '_zip',
  'notes': 'existingNotes',
  'note': 'existingNotes',
  'project': 'existingNotes',
  'project notes': 'existingNotes',
  'discussion': 'existingNotes',
  'goal': 'customerGoal',
  'customer goal': 'customerGoal',
  'source': '_sourceIgnored',
}

function normalizeHeader(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function resolveHeader(raw) {
  return HEADER_ALIASES[normalizeHeader(raw)] || null
}

// ---- CSV / TSV parser ------------------------------------------------------

function detectDelimiter(firstLine) {
  const tabs = (firstLine.match(/\t/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  return tabs >= commas ? '\t' : ','
}

// Split one line into cells. Enters quote mode only when `"` starts a cell
// (lenient, same as customerPipelineCsv.js).
function splitLine(line, delimiter) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++ }
        else { quoted = false }
      } else {
        current += ch
      }
    } else if (ch === '"' && current === '') {
      quoted = true
    } else if (ch === delimiter) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

// Parse CSV/TSV text → { headers, rows }. rows is an array of objects
// keyed by normalized header strings.
export function parseBulkIntakeText(text) {
  if (!text || typeof text !== 'string') return { headers: [], rows: [] }
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[0])
  const rawHeaders = splitLine(lines[0], delimiter)
  const headers = rawHeaders.map(normalizeHeader)

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter)
    const obj = {}
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cells[j] !== undefined ? cells[j] : ''
    }
    rows.push(obj)
  }
  return { headers, rows }
}

// ---- Draft normalization ---------------------------------------------------

// Normalize a parsed row object into a Customer File draft.
// Does not mutate the input.
export function normalizeBulkIntakeDraft(rawRow) {
  if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) return null

  const mapped = {}
  for (const [rawKey, rawVal] of Object.entries(rawRow)) {
    const field = resolveHeader(rawKey)
    if (!field) continue
    const val = safe(String(rawVal || '').trim())
    if (val) mapped[field] = val
  }

  // Combine first + last name when both are present
  if ((mapped._firstName || mapped._lastName) && !mapped.customerName) {
    const parts = [mapped._firstName, mapped._lastName].filter(Boolean)
    if (parts.length) mapped.customerName = safe(parts.join(' '))
  }

  // Combine address parts
  if (!mapped.projectAddress) {
    const parts = [mapped._street, mapped._city, mapped._state, mapped._zip].filter(Boolean)
    if (parts.length) mapped.projectAddress = parts.join(', ')
  }

  // Drop internal-only tokens
  delete mapped._firstName
  delete mapped._lastName
  delete mapped._street
  delete mapped._city
  delete mapped._state
  delete mapped._zip
  delete mapped._sourceIgnored

  return {
    customerName: mapped.customerName || '',
    customerPhone: mapped.customerPhone || '',
    customerEmail: mapped.customerEmail || '',
    projectAddress: mapped.projectAddress || '',
    existingNotes: mapped.existingNotes || '',
    customerGoal: mapped.customerGoal || '',
  }
}

// ---- Duplicate detection ---------------------------------------------------

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Check draft against existing Customer Files. Returns:
//   { kind: 'phone' | 'email' | 'name', existingId } or null.
// Phone/email matches are hard duplicates. Name-only is a soft warning.
export function detectDuplicate(draft, existingFiles) {
  if (!draft || !Array.isArray(existingFiles)) return null

  const phone = normalizePhone(draft.customerPhone)
  const email = normalizeEmail(draft.customerEmail)
  const name = normalizeName(draft.customerName)

  for (const file of existingFiles) {
    const fPhone = normalizePhone(file.customerPhone)
    const fEmail = normalizeEmail(file.customerEmail)
    if (phone && fPhone && phone === fPhone) {
      return { kind: 'phone', existingId: file.id || '' }
    }
    if (email && fEmail && email === fEmail) {
      return { kind: 'email', existingId: file.id || '' }
    }
  }

  if (name) {
    for (const file of existingFiles) {
      const fName = normalizeName(file.customerName)
      if (fName && fName === name) {
        return { kind: 'name', existingId: file.id || '' }
      }
    }
  }

  return null
}

// ---- Row status ------------------------------------------------------------

export const STATUS_LABELS = Object.freeze({
  ready: 'Ready to import',
  'missing-name': 'Missing name',
  'missing-contact': 'Missing contact',
  duplicate: 'Possible duplicate',
  'duplicate-soft': 'Possible duplicate',
  'needs-review': 'Needs review',
})

function classifyRow(draft, duplicate) {
  if (!draft.customerName) return 'missing-name'
  if (!draft.customerPhone && !draft.customerEmail) return 'missing-contact'
  if (duplicate) {
    if (duplicate.kind === 'phone' || duplicate.kind === 'email') return 'duplicate'
    if (duplicate.kind === 'name') return 'duplicate-soft'
  }
  return 'ready'
}

// ---- Public API: review model ----------------------------------------------

// Build the review model from raw text + existing files. Pure — no storage.
// Returns an array of frozen review row objects.
export function buildBulkIntakeReview(text, existingFiles = []) {
  const { rows } = parseBulkIntakeText(text)
  const safeExisting = Array.isArray(existingFiles) ? existingFiles : []

  return rows
    .map((rawRow, index) => {
      const draft = normalizeBulkIntakeDraft(rawRow)
      if (!draft) return null
      const duplicate = detectDuplicate(draft, safeExisting)
      const status = classifyRow(draft, duplicate)
      return Object.freeze({
        _id: `bulk-draft-${index + 1}`,
        _row: index + 1,
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        customerEmail: draft.customerEmail,
        projectAddress: draft.projectAddress,
        existingNotes: draft.existingNotes,
        customerGoal: draft.customerGoal,
        status,
        statusLabel: STATUS_LABELS[status] || 'Needs review',
        duplicateInfo: duplicate,
      })
    })
    .filter(Boolean)
}

// ---- Public API: commit selected drafts ------------------------------------

// Import selected review rows as new Customer Files in durable storage.
// Each imported file gets a unique ID to avoid merging with existing records.
// Activity event `bulk_imported` is appended for each created file (best-effort).
// Returns { imported: CustomerFile[], errors: { draft, error }[] }.
export async function commitBulkIntakeDrafts(selectedDrafts, storage, now = new Date()) {
  if (!Array.isArray(selectedDrafts) || !storage) return { imported: [], errors: [] }

  const imported = []
  const errors = []
  const ts = new Date(now)

  for (const draft of selectedDrafts) {
    if (!draft || !draft.customerName) continue
    try {
      const stamp = ts.getTime().toString(36)
      const rand = Math.random().toString(36).slice(2, 5)
      const id = `cf-bi-${stamp}-${rand}`
      const file = await saveCustomerFileDurable(storage, {
        id,
        customerName: draft.customerName,
        customerPhone: draft.customerPhone || '',
        customerEmail: draft.customerEmail || '',
        projectAddress: draft.projectAddress || '',
        existingNotes: draft.existingNotes || '',
        customerGoal: draft.customerGoal || '',
      }, ts)
      try {
        await appendActivityForFile(storage, file.id, {
          kind: 'bulk_imported',
          summary: 'Customer file created from bulk intake.',
        }, ts)
      } catch {
        // Activity is best-effort.
      }
      imported.push(file)
    } catch (err) {
      errors.push({ draft, error: err.message || String(err) })
    }
  }

  return { imported, errors }
}
