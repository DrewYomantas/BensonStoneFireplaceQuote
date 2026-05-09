import FieldRulesAdmin from '../components/backstage/FieldRulesAdmin.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'

export default function BackstageScreen({ onBack, onOpenBatchCleanup }) {
  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px', maxWidth: 1080, margin: '0 auto' }}>
          <h2 className="serif-h h2">Backstage.</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            Reference panels for the rules and config that shape what the rest
            of the Sales OS shows. Read-only in PR 4.
          </p>
          <hr className="rule-brass" style={{ margin: '20px 0' }} />
          <FieldRulesAdmin />

          {onOpenBatchCleanup && (
            <section className="card-flat" style={{ marginTop: 24, padding: 18 }}>
              <span className="eyebrow eyebrow-ink">OLD QUOTE BATCH CLEANUP</span>
              <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
                For older multi-quote packets and contact lists. Not the daily
                path — most days start with <em>Add Quote PDF</em>.
              </p>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={onOpenBatchCleanup}
                >
                  Open Old Quote Batch Cleanup
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
      <NextActionBar
        action="Return to Today when you're done."
        why="Backstage is reference only — daily work happens on Today and inside a Customer File."
        primary={
          <button type="button" className="btn btn-primary" onClick={onBack}>
            Back to Today
          </button>
        }
      />
    </>
  )
}
