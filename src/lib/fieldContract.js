import rawFieldMap from '../data/fieldMap.json' with { type: 'json' }

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

export const contractGroups = Object.entries(rawFieldMap).map(([key, entries]) => ({
  key,
  fields: entries.flatMap(expandEntry),
}))

const contractFieldMap = Object.fromEntries(contractGroups.map((group) => [group.key, group.fields]))

export const sectionDefinitions = [
  {
    key: 'customer',
    label: 'Customer',
    fields: contractFieldMap.customer,
  },
  {
    key: 'quote_meta',
    label: 'Quote Meta',
    fields: contractFieldMap.quote_meta,
  },
  {
    key: 'project_copy',
    label: 'Project Copy',
    fields: ['PROJECT_OVERVIEW', 'PROJECT_SCOPE_SUMMARY', 'INSTALLATION_SCOPE', 'INSTALLATION_TOTAL'],
  },
  {
    key: 'package_1',
    label: 'Package 1',
    fields: contractFieldMap.page_1_project.filter((field) => field.startsWith('PACKAGE_1_')),
  },
  {
    key: 'package_2',
    label: 'Package 2',
    fields: contractFieldMap.page_1_project.filter((field) => field.startsWith('PACKAGE_2_')),
  },
  {
    key: 'detail_section_1',
    label: 'Detail Section 1',
    fields: contractFieldMap.page_2_details.filter((field) => field.includes('DETAIL_SECTION_1') || field.startsWith('DETAIL_1_')),
  },
  {
    key: 'detail_section_2',
    label: 'Detail Section 2',
    fields: contractFieldMap.page_2_details.filter((field) => field.includes('DETAIL_SECTION_2') || field.startsWith('DETAIL_2_')),
  },
  {
    key: 'investment_and_acceptance',
    label: 'Investment and Acceptance',
    fields: contractFieldMap.investment_and_acceptance,
  },
]

export const orderedFields = contractGroups.flatMap((group) => group.fields)

export const fieldToSection = Object.fromEntries(
  sectionDefinitions.flatMap((section) => section.fields.map((field) => [field, section.key])),
)

export const sectionMap = Object.fromEntries(sectionDefinitions.map((section) => [section.key, section]))

export const multilineFields = new Set([
  'PROJECT_OVERVIEW',
  'PROJECT_SCOPE_SUMMARY',
  'INSTALLATION_SCOPE',
  'PROJECT_NOTES',
  'LEGAL_TERMS',
])

export const defaultFieldValues = {
  PAYMENT_TERMS: '50% down at time of signing',
  DEPOSIT_TERMS: '50% down at time of signing',
  QUOTE_GOOD_FOR: '30 days',
}

export const requiredFields = [
  'CUSTOMER_NAME',
  'INVOICE_ADDRESS_LINE_1',
  'INVOICE_CITY_STATE_ZIP',
  'PROJECT_ADDRESS_LINE_1',
  'PROJECT_CITY_STATE_ZIP',
  'QUOTE_NO',
  'QUOTE_DATE',
  'PROJECT_TITLE',
  'PROJECT_OVERVIEW',
  'PROJECT_SCOPE_SUMMARY',
  'PAYMENT_TERMS',
  'QUOTE_GOOD_FOR',
  'INSTALLATION_SCOPE',
  'TOTAL_AMOUNT',
  'QUOTATION_TOTAL',
  'DEPOSIT_TERMS',
  'LEGAL_TERMS',
]

export const copyGroups = [
  {
    key: 'customer',
    label: 'Copy Customer Fields',
    fields: contractFieldMap.customer,
  },
  {
    key: 'quote_meta',
    label: 'Copy Quote Meta Fields',
    fields: contractFieldMap.quote_meta,
  },
  {
    key: 'page_1',
    label: 'Copy Page 1 Fields',
    fields: [...contractFieldMap.customer, ...contractFieldMap.quote_meta, ...contractFieldMap.page_1_project],
  },
  {
    key: 'page_2',
    label: 'Copy Page 2 Fields',
    fields: [...contractFieldMap.page_2_details, ...contractFieldMap.investment_and_acceptance],
  },
  {
    key: 'all',
    label: 'Copy All Fields',
    fields: orderedFields,
  },
]

export function createEmptyFieldState() {
  return Object.fromEntries(orderedFields.map((field) => [field, '']))
}
