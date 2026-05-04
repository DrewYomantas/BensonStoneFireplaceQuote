import { deriveQuoteStatus } from './quoteStatusEngine.js'

const has = (v) => Boolean(String(v || '').trim())
const isTrue = (v) => String(v || '').toLowerCase() === 'true'
const nowIso = (now = new Date()) => new Date(now).toISOString()

const forbiddenCustomerPatterns = [
  /[a-z]:\\/i,
  /\\users\\/i,
  /\/mnt\//i,
  /dealer\s*cost/i,
  /internal\s*warning/i,
  /backend\s*source/i,
  /source\s*metadata/i,
  /internal-only/i,
  /internal only/i,
  /price\s*book\s*path/i,
]

export function sanitizeCustomerFacingText(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !forbiddenCustomerPatterns.some((pattern) => pattern.test(line)))
    .join('\n')
}

export function getCustomerPacketState(file = {}) {
  const quoteStatus = deriveQuoteStatus(file)
  const originalIncluded = isTrue(file.lineItemQuoteIncluded)
  const originalExcluded = !originalIncluded && has(file.lineItemQuoteExcludedReason)
  const packetGenerated = has(file.packetGeneratedAt)
  const printed = has(file.packetPrintedAt)
  const sent = has(file.packetSentAt) && file.packetSendChannel && file.packetSendChannel !== 'none'
  const detailedIncluded = file.detailedInvestmentBreakdownIncluded === '' ? true : isTrue(file.detailedInvestmentBreakdownIncluded)
  const scopeIncluded = file.scopeResponsibilityNotesIncluded === '' ? true : isTrue(file.scopeResponsibilityNotesIncluded)
  const brochuresSummaryIncluded = isTrue(file.brochuresSamplesSummaryIncluded)

  const blockers = [...quoteStatus.packetReadiness.reasons]
  if (!detailedIncluded) blockers.push('Detailed Investment Breakdown must stay included')
  if (!scopeIncluded) blockers.push('Scope / responsibility notes should stay included as page 3 support')
  if (has(file.opportunityId) && !originalIncluded && !originalExcluded) {
    blockers.push('Decide whether the original BizTrack line-item quote is included or intentionally excluded')
  }

  return {
    readyToGenerate: blockers.length === 0,
    blockers,
    decisions: {
      originalBizTrackLineItemQuote: originalIncluded ? 'included' : originalExcluded ? 'excluded-with-reason' : 'undecided',
      originalQuoteExcludedReason: file.lineItemQuoteExcludedReason || '',
      detailedInvestmentBreakdownIncluded: detailedIncluded,
      scopeResponsibilityNotesIncluded: scopeIncluded,
      brochuresSamplesSummaryIncluded: brochuresSummaryIncluded,
      brochuresSamplesSummary: sanitizeCustomerFacingText(file.brochuresSamplesSummary || ''),
    },
    timestamps: {
      generatedAt: file.packetGeneratedAt || '',
      printedAt: file.packetPrintedAt || '',
      sentAt: file.packetSentAt || '',
    },
    email: {
      draftStatus: file.packetEmailDraftStatus || 'not_started',
      sent: sent && ['email', 'both'].includes(file.packetSendChannel),
      sendChannel: file.packetSendChannel || 'none',
    },
    packetGenerated,
    printed,
    sent,
    nextAction: blockers.length > 0
      ? blockers[0]
      : !packetGenerated
        ? 'Generate customer packet'
        : !sent
          ? 'Print or email packet, then log the send channel'
          : 'Packet is sent. Move to handoff or follow-up.',
  }
}

export function buildPacketPatch(action, value, now = new Date()) {
  const ts = nowIso(now)
  switch (action) {
    case 'include-original-quote':
      return { lineItemQuoteIncluded: 'true', lineItemQuoteExcludedReason: '' }
    case 'exclude-original-quote':
      return { lineItemQuoteIncluded: 'false', lineItemQuoteExcludedReason: String(value || '').trim() }
    case 'include-breakdown':
      return { detailedInvestmentBreakdownIncluded: value ? 'true' : 'false' }
    case 'include-scope-notes':
      return { scopeResponsibilityNotesIncluded: value ? 'true' : 'false' }
    case 'include-brochures-summary':
      return { brochuresSamplesSummaryIncluded: value ? 'true' : 'false' }
    case 'set-brochures-summary':
      return { brochuresSamplesSummary: sanitizeCustomerFacingText(value) }
    case 'mark-generated':
      return { packetGeneratedAt: ts, detailedInvestmentBreakdownIncluded: 'true', scopeResponsibilityNotesIncluded: 'true' }
    case 'mark-printed':
      return { packetPrintedAt: ts, packetGeneratedAt: ts }
    case 'mark-email-draft':
      return { packetEmailDraftStatus: value || 'drafted' }
    case 'mark-sent-email':
      return { packetSentAt: ts, packetGeneratedAt: ts, packetSendChannel: 'email', packetEmailDraftStatus: 'sent' }
    case 'mark-sent-print':
      return { packetSentAt: ts, packetGeneratedAt: ts, packetSendChannel: 'print' }
    case 'mark-sent-both':
      return { packetSentAt: ts, packetGeneratedAt: ts, packetSendChannel: 'both', packetEmailDraftStatus: 'sent' }
    default:
      return {}
  }
}

export function buildCustomerSafePacketSummary(file = {}) {
  const packet = getCustomerPacketState(file)
  const lines = [
    'Detailed Investment Breakdown included.',
    packet.decisions.scopeResponsibilityNotesIncluded ? 'Scope and responsibility notes included as supporting notes.' : '',
    packet.decisions.originalBizTrackLineItemQuote === 'included' ? 'Original BizTrack line-item quote included for line-item detail.' : '',
    packet.decisions.brochuresSamplesSummaryIncluded ? packet.decisions.brochuresSamplesSummary : '',
  ]
  return sanitizeCustomerFacingText(lines.filter(Boolean).join('\n'))
}
