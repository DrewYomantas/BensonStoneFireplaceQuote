// Read-only Backstage panel listing the active Field Rules.
// PR 4 scope: visibility only. No editing. Source paths trace back to the
// Cowork Workflow doc bundled in the Fireplace Department drive (read-only,
// never committed). The rule set itself lives in src/config/fieldRules.js.

import { FIELD_RULES, FIELD_RULES_VERSION } from '../../config/fieldRules.js'

const SEVERITY_BADGE = {
  blocker: { label: 'BLOCKER', cls: 'source source-assumed' },
  warning: { label: 'WARNING', cls: 'source source-said' },
  checklist: { label: 'CHECKLIST', cls: 'source source-manual' },
}

function statusBadge(rule) {
  if (rule.enabled) return { label: 'ACTIVE', cls: 'source source-verified' }
  return { label: 'DISABLED', cls: 'source source-said' }
}

export default function FieldRulesAdmin({ rules = FIELD_RULES, version = FIELD_RULES_VERSION }) {
  return (
    <section
      className="card"
      style={{ padding: 18, borderLeft: '3px solid var(--ember)' }}
      aria-labelledby="field-rules-admin-heading"
    >
      <span className="eyebrow eyebrow-ember">FIELD RULES — BACKSTAGE</span>
      <h3 id="field-rules-admin-heading" className="serif-h h4" style={{ marginTop: 6 }}>
        Active Field Rules
      </h3>
      <p className="body-sm" style={{ marginTop: 6 }}>
        Read-only reference. The rule set is authored by the manager and lives in
        <code> src/config/fieldRules.js</code>. To revise wording or scope, edit
        the config and ship a new pass — no edits available here in PR 4.
      </p>
      <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
        Field Rules · {version} · {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
        {' · '}see <code>docs/app-intelligence-register.md</code>
      </p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
        {rules.map((rule) => {
          const sev = SEVERITY_BADGE[rule.severity] || SEVERITY_BADGE.checklist
          const status = statusBadge(rule)
          return (
            <li key={rule.id} style={{ padding: '12px 0', borderTop: '1px solid var(--rule)' }}>
              <div className="hstack">
                <span className="eyebrow eyebrow-ink">{rule.label}</span>
                <span className="spacer" />
                <span
                  className={sev.cls}
                  aria-label={`Severity: ${sev.label}`}
                  title={`Severity: ${sev.label}`}
                >
                  {sev.label}
                </span>
                <span
                  className={status.cls}
                  aria-label={`Status: ${status.label}`}
                  title={`Status: ${status.label}`}
                  style={{ marginLeft: 8 }}
                >
                  {status.label}
                </span>
              </div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                {rule.internal}
              </p>
              <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
                Source: {rule.source}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
