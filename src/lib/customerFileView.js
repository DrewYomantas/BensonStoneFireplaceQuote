// Read-side projection of a Customer File for display.
// Strips internal/sensitive keys (cost, margin, buy price, supplier, raw OCR,
// BisTrack confidence, fuzzy-match) before returning anything the screen can
// render. Pure logic so it can be unit-tested.

import { isSensitiveKey } from './salesOsStorageSchema.js'
import { sanitizeCustomerFile } from './customerFile.js'

const SAFE_KEYS = new Set([
  'id', 'opportunityId', 'createdAt', 'updatedAt', 'visitedAt',
  'customerName', 'customerEmail', 'customerPhone', 'projectAddress',
  'existingApplianceType', 'existingFuelType', 'existingVentingNotes', 'existingNotes',
  'customerGoal', 'goalNotes', 'budgetBand', 'customerPainPoints',
  'heatExpectation', 'likelyPath',
  'photos', 'measurements', 'displaysShown', 'brochuresGiven', 'samplesGiven',
  'pinnedReferences', 'followUpTasks', 'notes',
])

export function projectCustomerFileForDisplay(file = {}) {
  const sanitized = sanitizeCustomerFile(file)
  const out = {}
  for (const [k, v] of Object.entries(sanitized)) {
    if (isSensitiveKey(k)) continue
    if (!SAFE_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

export function deriveFileWarnings(file = {}) {
  const f = projectCustomerFileForDisplay(file)
  const warnings = []
  if (!f.customerName) warnings.push({ code: 'missing-customer-name', message: 'Customer name not captured.' })
  if (!f.customerPhone && !f.customerEmail) warnings.push({ code: 'missing-contact', message: 'No phone or email — follow-up will not be possible.' })
  if (!f.existingNotes) warnings.push({ code: 'missing-current-setup', message: 'Current setup not captured.' })
  if (!f.customerGoal) warnings.push({ code: 'unclear-goal', message: 'Customer goal not captured.' })
  return warnings
}
