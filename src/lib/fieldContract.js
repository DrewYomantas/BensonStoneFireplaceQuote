import rawFieldMap from '../data/fieldMap.json' with { type: 'json' }

const sectionLabels = {
  customer: 'Customer',
  quote_meta: 'Quote Meta',
  page_1_project: 'Page 1 Project',
  page_2_details: 'Page 2 Details',
  investment_and_acceptance: 'Investment and Acceptance',
}

function expandEntry(entry) {
  const rangeMatch = entry.match(/^([A-Z0-9_]+?)(\d+)\s+through\s+([A-Z0-9_]+?)(\d+)$/)

  if (!rangeMatch) {
    return [entry]
  }

  const [, startPrefix, startNumber, endPrefix, endNumber] = rangeMatch

  if (startPrefix !== endPrefix) {
    return [entry]
  }

  const start = Number(startNumber)
  const end = Number(endNumber)
  const expanded = []

  for (let value = start; value <= end; value += 1) {
    expanded.push(`${startPrefix}${value}`)
  }

  return expanded
}

function titleCase(token) {
  if (/^\d+$/.test(token)) {
    return token
  }

  return token.charAt(0) + token.slice(1).toLowerCase()
}

export function getFieldLabel(field) {
  return field
    .replace(/_/g, ' ')
    .split(' ')
    .map(titleCase)
    .join(' ')
}

export const fieldGroups = Object.entries(rawFieldMap).map(([key, entries]) => ({
  key,
  label: sectionLabels[key] || getFieldLabel(key),
  fields: entries.flatMap(expandEntry),
}))

export const orderedFields = fieldGroups.flatMap((group) => group.fields)

export const fieldToSection = Object.fromEntries(
  fieldGroups.flatMap((group) => group.fields.map((field) => [field, group.key])),
)

export const defaultFieldValues = {
  PAYMENT_TERMS: '50% down at time of signing',
  DEPOSIT_TERMS: '50% down at time of signing',
  QUOTE_GOOD_FOR: '30 days',
}

export function createEmptyFieldState() {
  return Object.fromEntries(orderedFields.map((field) => [field, '']))
}
