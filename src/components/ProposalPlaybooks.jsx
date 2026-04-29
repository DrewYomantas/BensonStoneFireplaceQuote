export default function ProposalPlaybooks({ onSelectPlaybook, playbooks, selectedPlaybookId }) {
  return (
    <section className="workbench-view">
      <div className="view-heading">
        <div>
          <p className="kicker">Proposal Playbooks</p>
          <h2>Choose the customer-facing lane.</h2>
          <p className="section-caption">Context only in this slice. Export safety still comes from source review and blockers.</p>
        </div>
      </div>
      <div className="playbook-grid">
        {playbooks.map((playbook) => (
          <button
            key={playbook.id}
            type="button"
            className={`playbook-card ${selectedPlaybookId === playbook.id ? 'is-selected' : ''}`}
            onClick={() => onSelectPlaybook(playbook.id)}
          >
            <span>{playbook.leadTemperatureFit}</span>
            <strong>{playbook.name}</strong>
            <p>{playbook.goal}</p>
            <small>{playbook.customerFacingSafe ? 'Customer-facing after review' : 'Internal only'}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
