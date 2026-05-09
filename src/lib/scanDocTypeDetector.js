// Deterministic doc type detection from OCR text (Milestone 19.6).
// No inference, no AI. Keyword matching only.

export const DOC_TYPES = Object.freeze({
  benson_quote: 'benson_quote',
  service_order: 'service_order',
  firebuilder_quote: 'firebuilder_quote',
  install_job_sheet: 'install_job_sheet',
  field_measure_checklist: 'field_measure_checklist',
  photo_or_sketch: 'photo_or_sketch',
  unknown: 'unknown',
})

export const DOC_TYPE_LABELS = Object.freeze({
  benson_quote: 'Benson Quote',
  service_order: 'Service Order',
  firebuilder_quote: 'Firebuilder Quote',
  install_job_sheet: 'Install / Job Sheet',
  field_measure_checklist: 'Field Measure',
  photo_or_sketch: 'Photo / Sketch',
  unknown: 'Unknown',
})

// Non-whitespace chars below this count → treat as photo or sketch.
const PHOTO_THRESHOLD = 25

// Rules evaluated in order; first match wins.
const DETECTION_RULES = [
  {
    type: DOC_TYPES.field_measure_checklist,
    patterns: [
      /\bfield\s*measure\b/i,
      /\bfield\s*measurement\b/i,
      /\bmeasure\s*checklist\b/i,
      /\bsite\s*measurement\b/i,
      /\bmeasurement\s*sheet\b/i,
    ],
  },
  {
    type: DOC_TYPES.install_job_sheet,
    patterns: [
      /\binstallation\s*job\s*sheet\b/i,
      /\binstall(?:ation)?\s*sheet\b/i,
      /\bjob\s*sheet\b/i,
      /\binstallation\s*checklist\b/i,
      /\binstaller\s*notes?\b/i,
    ],
  },
  {
    type: DOC_TYPES.service_order,
    patterns: [
      /\bservice\s*order\b/i,
      /\bservice\s*ticket\b/i,
      /\bservice\s*call\b/i,
      /\bwork\s*order\b/i,
      /\bS\.?O\.?\s*#/i,
    ],
  },
  {
    type: DOC_TYPES.firebuilder_quote,
    patterns: [
      /\bfirebuilder\b/i,
      /\bfire\s*builder\b/i,
    ],
  },
  {
    type: DOC_TYPES.benson_quote,
    patterns: [
      /\bquotation\b/i,
      /\bquote\s*no\.?\b/i,
      /\bquote\s*date\b/i,
      /\bbenson\s*stone\b/i,
      /\bbenson\s*fireplace\b/i,
    ],
  },
]

// Returns one of the DOC_TYPES values.
export function detectDocType(text) {
  if (!text || typeof text !== 'string') return DOC_TYPES.unknown
  const stripped = text.replace(/\s+/g, '')
  if (stripped.length < PHOTO_THRESHOLD) return DOC_TYPES.photo_or_sketch

  for (const rule of DETECTION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return rule.type
    }
  }

  return DOC_TYPES.unknown
}
