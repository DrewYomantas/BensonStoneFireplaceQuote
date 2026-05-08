import SetupTypeSelector from './SetupTypeSelector.jsx'
import GoalSelector from './GoalSelector.jsx'
import VerificationChecklist from './VerificationChecklist.jsx'

function Section({ num, title, sub, children }) {
  return (
    <section className="card" style={{ padding: 20 }}>
      <div className="hstack" style={{ alignItems: 'baseline' }}>
        <span className="mono">{String(num).padStart(2, '0')}</span>
        <h3 className="sans-h h5">{title}</h3>
      </div>
      {sub && <p className="body-sm" style={{ marginTop: 4 }}>{sub}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  )
}

export default function SetupGoalLensForm({ draft, onChange, onMarkSource, onToggleFlag }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section num={1} title="What does the customer have today?" sub="Pick the closest match. Mark VERIFIED only when you've physically seen it.">
        <SetupTypeSelector
          value={draft.setupType}
          source={draft.setupTypeSource}
          onChange={(v) => onChange('setupType', v)}
          onMarkVerified={(kind) => onMarkSource('setupType', kind)}
        />
      </Section>

      <Section num={2} title="What do they want?" sub="If they said it, mark SAID. If you're inferring, mark ASSUMED.">
        <GoalSelector
          value={draft.desiredOutcome}
          source={draft.desiredOutcomeSource}
          onChange={(v) => onChange('desiredOutcome', v)}
          onMarkSource={(kind) => onMarkSource('desiredOutcome', kind)}
        />
      </Section>

      <Section num={3} title="Fuel, venting, and construction" sub="Each unknown is a question for the next conversation.">
        <VerificationChecklist
          draft={draft}
          onChange={onChange}
          onMarkSource={onMarkSource}
          onToggleFlag={onToggleFlag}
        />
      </Section>

      <Section num={4} title="Salesperson notes" sub="Internal-only. Customer-facing copy is generated separately.">
        <textarea
          className="field field-textarea"
          value={draft.salespersonNotes}
          onChange={(e) => onChange('salespersonNotes', e.target.value)}
          placeholder="Anything you'd like to remember about the conversation."
        />
      </Section>
    </div>
  )
}
