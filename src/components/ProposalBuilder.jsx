export default function ProposalBuilder({ editor, preview }) {
  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Proposal Builder</p>
          <h2>Shape the reviewed fields into customer-ready structure.</h2>
          <p className="section-caption">This stays human-reviewed. The full field contract is available below.</p>
        </div>
      </div>
      <div className="workbench-two-column proposal-workspace">
        <section className="workbench-panel">
          <h3>Proposal field workspace</h3>
          {editor}
        </section>
        <section className="workbench-panel">
          <h3>Internal preview</h3>
          {preview}
        </section>
      </div>
    </section>
  )
}
