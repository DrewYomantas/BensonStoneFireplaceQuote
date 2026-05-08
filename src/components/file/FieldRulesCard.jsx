// Field Rules card — V1.1, Customer-File-anchored.
//
// Pure presentation. The list of findings is computed in
// src/lib/fieldRules.js and passed in as a prop. Acknowledgement clearing
// for Rule 2 (ZC gas-insert) is the only interactive bit; other rules show
// their reason + suggested action without an in-card "clear" button so the
// scope stays small. Customer-safe wording stays internal-only by default
// because the Customer File is rep-only.

const SEVERITY_ORDER = { blocker: 0, warning: 1, checklist: 2 }
const STATUS_ORDER = { triggered: 0, 'soft-warning': 1, cleared: 2, satisfied: 3 }

function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99
    const sb = SEVERITY_ORDER[b.severity] ?? 99
    if (sa !== sb) return sa - sb
    const ta = STATUS_ORDER[a.status] ?? 99
    const tb = STATUS_ORDER[b.status] ?? 99
    return ta - tb
  })
}

function statusBadge(finding) {
  if (finding.status === 'cleared') return { label: 'CLEARED', cls: 'source source-verified' }
  if (finding.status === 'satisfied') return { label: 'SATISFIED', cls: 'source source-verified' }
  if (finding.status === 'soft-warning') return { label: 'WARN', cls: 'source source-said' }
  // triggered
  if (finding.severity === 'blocker') return { label: 'BLOCKER', cls: 'source source-assumed' }
  if (finding.severity === 'warning') return { label: 'WARNING', cls: 'source source-said' }
  return { label: 'CHECKLIST', cls: 'source source-manual' }
}

function FindingRow({ finding, onAcknowledgeZcAck, canAcknowledge }) {
  const badge = statusBadge(finding)
  const showAckButton =
    finding.id === 'zc-gas-insert-ack' &&
    finding.status === 'triggered' &&
    typeof onAcknowledgeZcAck === 'function'
  return (
    <div className="fact-row">
      <div className="fact-row-head">
        <span className="eyebrow eyebrow-ink fact-row-label">{finding.label}</span>
        <span className="fact-row-value">{finding.action || '—'}</span>
        <span
          className={badge.cls}
          aria-label={`Status: ${badge.label}`}
          title={`Status: ${badge.label}`}
        >
          {badge.label}
        </span>
      </div>
      {finding.reason && (
        <p className="fact-row-sub">{finding.reason}</p>
      )}
      {finding.parts && finding.id === 'whisper-flex' && (
        <p className="fact-row-sub">
          Use part <code>{finding.parts.smaller}</code> (smaller) or
          {' '}<code>{finding.parts.larger}</code> (larger).
        </p>
      )}
      {finding.source && (
        <p className="fact-row-sub" style={{ color: 'var(--slate)' }}>
          Source: {finding.source}
        </p>
      )}
      {showAckButton && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={!canAcknowledge}
            aria-label="Acknowledge gas insert into ZC fireplace with customer"
            onClick={() => canAcknowledge && onAcknowledgeZcAck(finding)}
          >
            Acknowledge with customer
          </button>
        </div>
      )}
    </div>
  )
}

export default function FieldRulesCard({
  result,
  onAcknowledgeZcAck,
  canAcknowledge = true,
}) {
  if (!result || !Array.isArray(result.findings) || result.findings.length === 0) {
    return (
      <section className="card-flat" style={{ padding: 18 }}>
        <span className="eyebrow eyebrow-ink">FIELD RULES</span>
        <p className="body-sm" style={{ marginTop: 8 }}>
          No field rules apply to this file yet. Rules will appear here once setup
          + product wording give the safety layer something to check.
        </p>
        {result && result.version && (
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 6 }}>
            Field Rules · {result.version}
          </p>
        )}
      </section>
    )
  }

  const findings = sortFindings(result.findings)
  const triggeredBlockers = findings.filter(
    (f) => f.severity === 'blocker' && f.status === 'triggered'
  ).length

  return (
    <section className="card" style={{ padding: 18, borderLeft: '3px solid var(--ember)' }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">FIELD RULES</span>
        {triggeredBlockers > 0 && (
          <span className="source source-assumed" style={{ marginLeft: 8 }}>
            {triggeredBlockers} BLOCKER{triggeredBlockers === 1 ? '' : 'S'}
          </span>
        )}
      </div>
      <p className="body-sm" style={{ marginTop: 6 }}>
        Deterministic safety layer — applied automatically from the Customer File.
        Every rule traces to its source document.
      </p>
      <div style={{ marginTop: 10 }}>
        {findings.map((f) => (
          <FindingRow
            key={f.id}
            finding={f}
            onAcknowledgeZcAck={onAcknowledgeZcAck}
            canAcknowledge={canAcknowledge}
          />
        ))}
      </div>
      {result.version && (
        <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 10 }}>
          Field Rules · {result.version}
        </p>
      )}
    </section>
  )
}
