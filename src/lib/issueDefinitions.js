// Catalog of resolvable issues on a customer file.
// Each issue declares HOW to detect resolution from real data — no flag-only resolves.
// `resolution` describes the micro-form an IssueResolutionPanel should render.

const hasText = (v) => Boolean(String(v || '').trim())
const hasAny = (arr) => Array.isArray(arr) && arr.length > 0
const isYes = (v) => String(v || '').toLowerCase() === 'true'

// Resolution kinds map to controls in IssueResolutionPanel.
// kind: 'text' | 'longtext' | 'phone' | 'email' | 'select' | 'append' | 'toggle' | 'datetime'
function field(key, kind, label, opts = {}) {
  return { key, kind, label, ...opts }
}

export const issueDefinitions = [
  // ── Customer contact ─────────────────────────────────────────────
  {
    id: 'missing-customer-name',
    severity: 'block',
    section: 'contact',
    label: 'Customer name not captured',
    detail: 'A customer file cannot move forward without a name on the record.',
    isResolved: (file) => hasText(file.customerName),
    resolution: {
      kind: 'fields',
      fields: [field('customerName', 'text', 'Customer name', { required: true })],
      cta: 'Save name',
    },
  },
  {
    id: 'missing-customer-contact-channel',
    severity: 'block',
    section: 'contact',
    label: 'No phone or email on file',
    detail: 'Need at least one channel before the customer can receive a packet or follow-up.',
    isResolved: (file) => hasText(file.customerPhone) || hasText(file.customerEmail),
    resolution: {
      kind: 'fields',
      fields: [
        field('customerPhone', 'phone', 'Phone'),
        field('customerEmail', 'email', 'Email'),
      ],
      cta: 'Save contact',
      helper: 'One channel is enough — fill whichever the customer prefers.',
    },
  },
  // ── Existing setup ───────────────────────────────────────────────
  {
    id: 'unknown-existing-appliance',
    severity: 'warn',
    section: 'existing-setup',
    label: 'Existing appliance type unknown',
    detail: 'Affects what swap or new-install path applies. Page-3 scope notes need this.',
    isResolved: (file) =>
      hasText(file.existingApplianceType) && file.existingApplianceType !== 'unknown',
    resolution: {
      kind: 'fields',
      fields: [
        field('existingApplianceType', 'select', 'Existing appliance', {
          options: ['unknown', 'fireplace', 'insert', 'stove', 'log-set', 'outdoor', 'none'],
        }),
        field('existingFuelType', 'select', 'Existing fuel', {
          options: ['unknown', 'gas', 'wood', 'pellet', 'electric', 'none'],
        }),
        field('existingVentingNotes', 'longtext', 'Venting / chimney notes'),
      ],
      cta: 'Save existing setup',
    },
  },
  // ── Goal ─────────────────────────────────────────────────────────
  {
    id: 'missing-customer-goal',
    severity: 'warn',
    section: 'goal',
    label: 'Customer goal not recorded',
    detail: 'Why are they here? Drives display selection and packet copy.',
    isResolved: (file) => hasText(file.customerGoal),
    resolution: {
      kind: 'fields',
      fields: [
        field('customerGoal', 'longtext', 'Customer goal (in their words)', { required: true }),
        field('budgetBand', 'select', 'Budget band', {
          options: ['', 'under-3k', '3k-6k', '6k-10k', '10k-plus', 'unknown'],
        }),
      ],
      cta: 'Save goal',
    },
  },
  // ── Site evidence ────────────────────────────────────────────────
  {
    id: 'no-photos-on-file',
    severity: 'warn',
    section: 'site-evidence',
    label: 'No photos on file',
    detail: 'Need at least one site photo before a home-measure handoff or install quote.',
    isResolved: (file) => hasAny(file.photos),
    resolution: {
      kind: 'append',
      target: 'photos',
      fields: [
        field('label', 'text', 'Description (e.g. "current mantel, west wall")', { required: true }),
        field('source', 'select', 'Source', { options: ['customer-text', 'customer-email', 'in-person', 'home-measure'] }),
      ],
      cta: 'Log photo received',
    },
  },
  {
    id: 'no-measurements-on-file',
    severity: 'warn',
    section: 'site-evidence',
    label: 'No measurements captured',
    detail: 'Opening width, height, depth, hearth — at least one rough measurement before quote.',
    isResolved: (file) => hasAny(file.measurements),
    resolution: {
      kind: 'append',
      target: 'measurements',
      fields: [
        field('label', 'select', 'Measurement', {
          options: ['opening-width', 'opening-height', 'opening-depth', 'hearth-depth', 'mantel-height', 'flue-size', 'other'],
          required: true,
        }),
        field('value', 'text', 'Value (e.g. "36 in")', { required: true }),
      ],
      cta: 'Log measurement',
    },
  },
  // ── Showroom interaction ─────────────────────────────────────────
  {
    id: 'no-displays-shown',
    severity: 'info',
    section: 'showroom',
    label: 'No showroom displays logged for this visit',
    detail: 'Tag at least one display the customer saw — drives Take-Home Checklist.',
    isResolved: (file) => hasAny(file.displaysShown),
    resolution: {
      kind: 'append',
      target: 'displaysShown',
      fields: [
        field('label', 'text', 'Display / model name', { required: true }),
        field('displayId', 'text', 'Display register ID (optional)'),
      ],
      cta: 'Log display shown',
    },
  },
  {
    id: 'no-brochures-given',
    severity: 'info',
    section: 'showroom',
    label: 'No brochures or samples handed out',
    detail: 'What did the customer leave with? Drives the Take-Home Checklist.',
    isResolved: (file) => hasAny(file.brochuresGiven) || hasAny(file.samplesGiven),
    resolution: {
      kind: 'append',
      target: 'brochuresGiven',
      fields: [
        field('label', 'text', 'Brochure / sample title', { required: true }),
        field('vendor', 'text', 'Vendor (optional)'),
      ],
      cta: 'Log brochure / sample',
    },
  },
  // ── Quote import ─────────────────────────────────────────────────
  {
    id: 'biztrack-quote-not-imported',
    severity: 'warn',
    section: 'quote',
    label: 'BizTrack quote not yet imported',
    detail: 'BizTrack remains the source of truth — import a quote PDF before generating a packet.',
    isResolved: (file) => hasText(file.opportunityId),
    resolution: {
      kind: 'instruction',
      body: 'Use the header "↑ Drop BizTrack PDF" to import the line-item quote, then it links automatically.',
    },
  },
  {
    id: 'line-item-quote-not-included',
    severity: 'warn',
    section: 'quote',
    label: 'Original line-item quote not in packet',
    detail: 'Investment Breakdown shows totals — line-item quote attaches the BizTrack detail.',
    isResolved: (file) => isYes(file.lineItemQuoteIncluded),
    onlyIf: (file) => hasText(file.opportunityId),
    resolution: {
      kind: 'toggle',
      key: 'lineItemQuoteIncluded',
      onLabel: 'Confirm BizTrack line-item quote is in the packet',
      offLabel: 'Mark as not included',
      truthyValue: 'true',
      cta: 'Confirm included',
    },
  },
  // ── Packet send ──────────────────────────────────────────────────
  {
    id: 'packet-not-generated',
    severity: 'info',
    section: 'packet',
    label: 'Customer packet not generated yet',
    detail: 'Packet timestamp is set when you print or save PDF from the proposal preview.',
    isResolved: (file) => hasText(file.packetGeneratedAt),
    resolution: {
      kind: 'datetime',
      key: 'packetGeneratedAt',
      cta: 'Mark generated now',
    },
  },
  {
    id: 'packet-not-sent',
    severity: 'info',
    section: 'packet',
    label: 'Packet not marked sent',
    detail: 'After printing or emailing, log how it went out so follow-up timing kicks in.',
    onlyIf: (file) => hasText(file.packetGeneratedAt),
    isResolved: (file) => hasText(file.packetSentAt) && file.packetSendChannel && file.packetSendChannel !== 'none',
    resolution: {
      kind: 'fields',
      fields: [
        field('packetSendChannel', 'select', 'How was it sent?', {
          options: ['none', 'email', 'print', 'both'],
          required: true,
        }),
      ],
      stamp: { packetSentAt: 'now' },
      cta: 'Log send',
    },
  },
  // ── Handoff ──────────────────────────────────────────────────────
  {
    id: 'handoff-not-set',
    severity: 'info',
    section: 'handoff',
    label: 'No scheduler / home-measure handoff set',
    detail: 'If the customer is moving forward, queue the next physical step.',
    onlyIf: (file) => hasText(file.packetSentAt),
    isResolved: (file) => file.handoffType && file.handoffType !== 'none',
    resolution: {
      kind: 'fields',
      fields: [
        field('handoffType', 'select', 'Handoff type', {
          options: ['none', 'home-measure', 'install-schedule', 'delivery'],
          required: true,
        }),
        field('handoffScheduledFor', 'text', 'Scheduled for (date or window)'),
        field('handoffNotes', 'longtext', 'Handoff notes'),
      ],
      cta: 'Save handoff',
    },
  },
  // ── Pricing freshness ────────────────────────────────────────────
  {
    id: 'pricing-stale',
    severity: 'warn',
    section: 'pricing',
    label: 'Pricing not confirmed in last 30 days',
    detail: 'Vendor price books move — confirm before re-sending to an old lead.',
    onlyIf: (file) => hasText(file.opportunityId),
    isResolved: (file) => {
      if (!hasText(file.pricingConfirmedAt)) return false
      const t = Date.parse(file.pricingConfirmedAt)
      if (Number.isNaN(t)) return false
      return Date.now() - t < 30 * 86400000
    },
    resolution: {
      kind: 'datetime',
      key: 'pricingConfirmedAt',
      cta: 'Confirm pricing current',
    },
  },
]

export function getIssueById(id) {
  return issueDefinitions.find((d) => d.id === id) || null
}

export function evaluateIssues(file = {}) {
  const applicable = issueDefinitions.filter((d) => !d.onlyIf || d.onlyIf(file))
  return applicable.map((d) => ({
    id: d.id,
    severity: d.severity,
    section: d.section,
    label: d.label,
    detail: d.detail,
    resolved: Boolean(d.isResolved(file)),
    resolution: d.resolution,
  }))
}

export function unresolvedIssues(file = {}) {
  return evaluateIssues(file).filter((i) => !i.resolved)
}

export function blockingIssues(file = {}) {
  return unresolvedIssues(file).filter((i) => i.severity === 'block')
}

// Apply a resolution payload to a file patch object.
// Returns the patch to merge into the customer file (no storage side-effects).
export function buildResolutionPatch(issue, payload = {}, now = new Date()) {
  const def = getIssueById(issue.id)
  if (!def) return {}
  const r = def.resolution
  const stampNow = new Date(now).toISOString()
  if (!r) return {}
  if (r.kind === 'fields') {
    const patch = {}
    for (const f of r.fields) {
      if (payload[f.key] !== undefined) patch[f.key] = String(payload[f.key] ?? '')
    }
    if (r.stamp) {
      for (const [k, v] of Object.entries(r.stamp)) {
        patch[k] = v === 'now' ? stampNow : v
      }
    }
    return patch
  }
  if (r.kind === 'toggle') {
    return { [r.key]: payload.value ? r.truthyValue : '' }
  }
  if (r.kind === 'datetime') {
    return { [r.key]: payload.value || stampNow }
  }
  return {}
}

// For 'append' resolutions — caller appends via appendCustomerFileItem.
export function isAppendResolution(issue) {
  const def = getIssueById(issue.id)
  return def?.resolution?.kind === 'append'
}
