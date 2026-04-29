function StatCard({ label, value, note, tone = '' }) {
  return (
    <div className={`mission-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  )
}

export default function CommandCenter({ currentSourceLabel, onNavigate, selectedPlaybook, stats }) {
  return (
    <section className="workbench-view command-center">
      <div className="view-heading">
        <div>
          <p className="kicker">Command Center</p>
          <h2>Choose the next fireplace desk move.</h2>
        </div>
        <button type="button" className="primary-button" onClick={() => onNavigate('intake')}>
          Start new intake
        </button>
      </div>

      <div className="mission-grid">
        <StatCard label="Active packets" value={stats.activePackets} note="Scanned packets in triage." />
        <StatCard label="Needs review" value={stats.needsReview} note="Pages or fields waiting on a human check." tone="is-warning" />
        <StatCard label="Likely follow-up" value={stats.followUp} note="Quote candidates, excluding paid/closed orders." />
        <StatCard label="Paid / closed" value={stats.paidClosed} note="Route toward paid order summary or archive." />
        <StatCard label="Ready fields" value={stats.readyFields} note="Proposal fields currently populated." />
        <StatCard label="Safety blockers" value={stats.safetyBlockers} note="Export must stay blocked until resolved." tone="is-alert" />
      </div>

      <div className="workbench-two-column">
        <section className="workbench-panel">
          <h3>Current mission</h3>
          <dl className="source-ledger">
            <div>
              <dt>Source</dt>
              <dd>{currentSourceLabel}</dd>
            </div>
            <div>
              <dt>Playbook</dt>
              <dd>{selectedPlaybook?.name || 'Choose in Playbooks when ready'}</dd>
            </div>
          </dl>
        </section>
        <section className="workbench-panel">
          <h3>Next best lanes</h3>
          <div className="lane-actions">
            <button type="button" className="ghost-button" onClick={() => onNavigate('intake')}>Intake documents</button>
            <button type="button" className="ghost-button" onClick={() => onNavigate('triage')}>Triage packets</button>
            <button type="button" className="ghost-button" onClick={() => onNavigate('review')}>Review current source</button>
            <button type="button" className="ghost-button" onClick={() => onNavigate('playbooks')}>Pick playbook</button>
          </div>
        </section>
      </div>
    </section>
  )
}
