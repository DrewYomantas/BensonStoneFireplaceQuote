// Manager-review threshold + reason templates.
// Per V1.1 iron rule #4: the threshold lives in config, not hardcoded into UI
// logic. Default is $6,000 but consumers receive both the threshold and the
// reason list as props so they can be swapped per-deployment or in tests.

export const MANAGER_REVIEW_DEFAULTS = Object.freeze({
  thresholdCents: 600000,
  currency: 'USD',
  reasons: Object.freeze([
    Object.freeze({ id: 'high-value', title: 'High-value quote', hint: 'Over the configured threshold.' }),
    Object.freeze({ id: 'first-category', title: 'First-time category', hint: 'Drew has not quoted this category recently.' }),
    Object.freeze({ id: 'heat-uncertainty', title: 'Heat-management uncertainty', hint: 'BTU sizing or heat-load is unclear.' }),
    Object.freeze({ id: 'clearance-concern', title: 'Clearance / mantel concern', hint: 'Mantel or clearance not measured.' }),
    Object.freeze({ id: 'stone-assumption', title: 'Stone or masonry assumption', hint: 'Stone allowance is an estimate.' }),
    Object.freeze({ id: 'unusual-vent', title: 'Unusual venting / install', hint: 'Vent path is non-standard.' }),
    Object.freeze({ id: 'rep-requested', title: 'Rep wants review', hint: 'Toggle to request a second look.' }),
    Object.freeze({ id: 'other', title: 'Other / manual reason', hint: 'Type a reason.' }),
  ]),
})

export function formatThreshold(cents, currency = 'USD') {
  const value = Math.round(Number(cents) || 0) / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `$${value.toFixed(0)}`
  }
}

export function isOverThreshold(amountCents, config = MANAGER_REVIEW_DEFAULTS) {
  if (amountCents == null || Number.isNaN(Number(amountCents))) return false
  return Number(amountCents) >= Number(config.thresholdCents)
}
