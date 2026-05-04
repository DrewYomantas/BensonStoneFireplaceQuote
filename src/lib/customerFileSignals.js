const has = (value) => Boolean(String(value || '').trim())
const hasAny = (value) => Array.isArray(value) && value.length > 0
const isTrue = (value) => String(value || '').toLowerCase() === 'true'

function arrayText(items = []) {
  if (!Array.isArray(items)) return ''
  return items
    .map((item) => Object.values(item || {}).filter((value) => typeof value === 'string' || typeof value === 'number').join(' '))
    .join(' ')
}

function notesText(file = {}) {
  return [
    file.customerGoal,
    file.goalNotes,
    file.customerPainPoints,
    file.existingNotes,
    file.existingVentingNotes,
    file.guidedPathNotes,
    file.handoffNotes,
    file.handoffMissingVerification,
    file.handoffConcerns,
    file.brochuresSamplesSummary,
    arrayText(file.notes),
    arrayText(file.pinnedReferences),
  ].filter(Boolean).join(' ')
}

function cleanSample(value, fallback = '') {
  const text = String(value || fallback || '').replace(/\s+/g, ' ').trim()
  return text.length > 90 ? `${text.slice(0, 87)}…` : text
}

function makeSignal({ id, label, detected = false, source = 'Not detected yet', evidence = '', confidence = 'none', manual = false, action = '' }) {
  return { id, label, detected: Boolean(detected), source, evidence: cleanSample(evidence), confidence, manual: Boolean(manual), action }
}

export function deriveCustomerFileSignals(file = {}) {
  const noteHay = notesText(file)
  const lower = noteHay.toLowerCase()

  const photoSignal = hasAny(file.photos)
    ? makeSignal({
        id: 'photos',
        label: 'Photos',
        detected: true,
        source: 'Customer file photos',
        evidence: `${file.photos.length} photo ${file.photos.length === 1 ? 'entry' : 'entries'} logged`,
        confidence: 'high',
      })
    : /\b(photo|photos|picture|pictures|image|images)\b/.test(lower)
      ? makeSignal({ id: 'photos', label: 'Photos', detected: true, source: 'Detected from notes', evidence: noteHay.match(/.{0,20}\b(photo|photos|picture|pictures|image|images)\b.{0,45}/i)?.[0] || 'Photo reference found', confidence: 'medium' })
      : makeSignal({ id: 'photos', label: 'Photos', action: 'Ask for site/firebox photos.' })

  const measurementRegex = /\b(measurement|measurements|dimension|dimensions|opening|width|height|depth|rough opening|firebox)\b|\b\d{1,3}\s?(?:x|×|by)\s?\d{1,3}\b|\b\d{1,3}\s?(?:in|inch|inches|")\b/i
  const measurementSignal = hasAny(file.measurements)
    ? makeSignal({
        id: 'measurements',
        label: 'Measurements',
        detected: true,
        source: 'Customer file measurements',
        evidence: `${file.measurements.length} measurement ${file.measurements.length === 1 ? 'entry' : 'entries'} logged`,
        confidence: 'high',
      })
    : measurementRegex.test(noteHay)
      ? makeSignal({ id: 'measurements', label: 'Measurements', detected: true, source: 'Detected from notes', evidence: noteHay.match(/.{0,20}(measurement|measurements|dimension|dimensions|opening|width|height|depth|rough opening|firebox|\d{1,3}\s?(?:x|×|by)\s?\d{1,3}).{0,45}/i)?.[0] || 'Measurement language found', confidence: 'medium' })
      : makeSignal({ id: 'measurements', label: 'Measurements', action: 'Collect rough opening/dimensions or schedule measure.' })

  const modelTagSignal = isTrue(file.modelTagReceived) || has(file.taggedModel)
    ? makeSignal({
        id: 'modelTag',
        label: 'Model tag',
        detected: true,
        source: has(file.taggedModel) ? 'Tagged model field' : 'Model tag confirmed',
        evidence: file.taggedModel || 'Model tag/photo marked received',
        confidence: 'high',
        manual: isTrue(file.modelTagReceived),
      })
    : /\b(model tag|rating plate|serial|data plate|manufacturer tag|tag photo|model number)\b/i.test(noteHay)
      ? makeSignal({ id: 'modelTag', label: 'Model tag', detected: true, source: 'Detected from notes', evidence: noteHay.match(/.{0,20}(model tag|rating plate|serial|data plate|manufacturer tag|tag photo|model number).{0,45}/i)?.[0] || 'Model tag language found', confidence: 'medium' })
      : makeSignal({ id: 'modelTag', label: 'Model tag', action: 'Needed for prefab/ZC compatibility conversations.' })

  const showroomSignal = hasAny(file.displaysShown) || hasAny(file.brochuresGiven) || hasAny(file.samplesGiven)
    ? makeSignal({
        id: 'showroom',
        label: 'Showroom activity',
        detected: true,
        source: 'Displays / brochures / samples log',
        evidence: [
          hasAny(file.displaysShown) ? `${file.displaysShown.length} display${file.displaysShown.length === 1 ? '' : 's'}` : '',
          hasAny(file.brochuresGiven) ? `${file.brochuresGiven.length} brochure${file.brochuresGiven.length === 1 ? '' : 's'}` : '',
          hasAny(file.samplesGiven) ? `${file.samplesGiven.length} sample${file.samplesGiven.length === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(', '),
        confidence: 'high',
      })
    : /\b(display|showroom|brochure|sample|cellar|walked|shown|showed)\b/i.test(noteHay)
      ? makeSignal({ id: 'showroom', label: 'Showroom activity', detected: true, source: 'Detected from notes', evidence: noteHay.match(/.{0,20}(display|showroom|brochure|sample|cellar|walked|shown|showed).{0,45}/i)?.[0] || 'Showroom/display language found', confidence: 'medium' })
      : makeSignal({ id: 'showroom', label: 'Showroom activity', action: 'Show relevant displays or log what was discussed.' })

  const quoteSignal = has(file.opportunityId)
    ? makeSignal({ id: 'quote', label: 'BizTrack quote', detected: true, source: 'Linked opportunity', evidence: file.opportunityId, confidence: 'high' })
    : makeSignal({ id: 'quote', label: 'BizTrack quote', action: 'Import when the quote exists.' })

  const packetSignal = has(file.packetSentAt)
    ? makeSignal({ id: 'packet', label: 'Customer packet', detected: true, source: 'Packet sent log', evidence: file.packetSendChannel ? `Sent by ${file.packetSendChannel}` : 'Packet sent', confidence: 'high' })
    : has(file.packetGeneratedAt)
      ? makeSignal({ id: 'packet', label: 'Customer packet', detected: true, source: 'Packet generated log', evidence: 'Generated, not sent yet', confidence: 'medium' })
      : makeSignal({ id: 'packet', label: 'Customer packet', action: 'Generate after quote is ready.' })

  const handoffSignal = ['created', 'sent_to_scheduler', 'waiting_for_measure', 'measure_completed'].includes(file.handoffState)
    ? makeSignal({ id: 'handoff', label: 'Measure handoff', detected: true, source: 'Scheduler handoff state', evidence: file.handoffState, confidence: 'high' })
    : makeSignal({ id: 'handoff', label: 'Measure handoff', action: 'Create when the quote path needs field verification.' })

  const goalSignal = has(file.customerGoal)
    ? makeSignal({ id: 'goal', label: 'Customer goal', detected: true, source: 'Visit intake', evidence: file.customerGoal, confidence: 'high' })
    : makeSignal({ id: 'goal', label: 'Customer goal', action: 'Capture the customer goal in their words.' })

  const pathSignal = has(file.likelyPath)
    ? makeSignal({ id: 'path', label: 'Likely path', detected: true, source: 'Guided Path Finder', evidence: file.likelyPath, confidence: 'high' })
    : makeSignal({ id: 'path', label: 'Likely path', action: 'Use Guided Path Finder only when the path is unclear.' })

  const pricingSignal = has(file.pricingConfirmedAt)
    ? makeSignal({ id: 'pricing', label: 'Pricing check', detected: true, source: 'Pricing confirmation log', evidence: 'Pricing confirmed current', confidence: 'high' })
    : has(file.opportunityId)
      ? makeSignal({ id: 'pricing', label: 'Pricing check', detected: false, source: 'Linked quote exists', evidence: 'Confirm pricing only before sending or old-quote recovery.', confidence: 'none', action: 'Confirm current pricing before customer packet.' })
      : makeSignal({ id: 'pricing', label: 'Pricing check', action: 'Wait until a BizTrack quote exists.' })

  const signals = {
    goal: goalSignal,
    path: pathSignal,
    photos: photoSignal,
    measurements: measurementSignal,
    modelTag: modelTagSignal,
    showroom: showroomSignal,
    quote: quoteSignal,
    packet: packetSignal,
    handoff: handoffSignal,
    pricing: pricingSignal,
  }

  const detected = Object.values(signals).filter((signal) => signal.detected)
  const systemDetected = detected.filter((signal) => signal.confidence !== 'none')
  const missing = Object.values(signals).filter((signal) => !signal.detected && signal.action)

  return {
    signals,
    detected: systemDetected,
    missing,
    summary: `${systemDetected.length} signals detected, ${missing.length} still open`,
  }
}

export function isSignalDetected(file = {}, key) {
  return Boolean(deriveCustomerFileSignals(file).signals[key]?.detected)
}
