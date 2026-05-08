import { CUSTOMER_GOALS, VISIT_TYPES } from '../../lib/startVisitCustomerFile.js'

const VISIT_TYPE_LABELS = {
  'walk-in': 'Walk-in',
  'phone': 'Phone',
  'old-quote': 'Old quote',
  'referral': 'Referral',
  'follow-up': 'Follow-up',
  'unknown': 'Not sure yet',
}

const GOAL_LABELS = {
  'more-heat': 'More heat',
  'less-mess': 'Less mess',
  'update-look': 'Update the look',
  'easier-operation': 'Easier to operate',
  'replace-existing': 'Replace existing unit',
  'explore-options': 'Just exploring',
  'unknown': 'Not sure yet',
}

function Field({ label, name, value, onChange, onBlur, type = 'text', as = 'input' }) {
  const id = `start-visit-${name}`
  const Tag = as
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <Tag
        id={id}
        name={name}
        type={type}
        value={value || ''}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={onBlur}
        className={as === 'textarea' ? 'field field-textarea' : 'field'}
        autoComplete="off"
      />
    </div>
  )
}

function ChipGroup({ name, value, options, labels, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`chip ${value === opt ? 'is-on' : ''}`}
          onClick={() => onChange(name, opt)}
        >
          {labels[opt] || opt}
        </button>
      ))}
    </div>
  )
}

function Section({ num, title, sub, children }) {
  return (
    <section className="card" style={{ padding: 20 }}>
      <div className="hstack" style={{ alignItems: 'baseline' }}>
        <span className="mono">{String(num).padStart(2, '0')}</span>
        <h3 className="sans-h h5">{title}</h3>
      </div>
      {sub && <p className="body-sm" style={{ marginTop: 4 }}>{sub}</p>}
      <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>{children}</div>
    </section>
  )
}

export default function StartVisitSection({ values, onChange, onBlur }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section num={1} title="Who is this customer?" sub="Just enough to follow up. You can come back to this.">
        <Field label="Customer name"   name="customerName"    value={values.customerName}    onChange={onChange} onBlur={onBlur} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Phone"   name="customerPhone" value={values.customerPhone} onChange={onChange} onBlur={onBlur} />
          <Field label="Email"   name="customerEmail" value={values.customerEmail} onChange={onChange} onBlur={onBlur} type="email" />
        </div>
        <Field label="Project address" name="projectAddress" value={values.projectAddress} onChange={onChange} onBlur={onBlur} />
      </Section>

      <Section num={2} title="What brought them in?">
        <ChipGroup
          name="visitType"
          value={values.visitType}
          options={VISIT_TYPES.filter((v) => v !== 'unknown').concat(['unknown'])}
          labels={VISIT_TYPE_LABELS}
          onChange={(n, v) => { onChange(n, v); onBlur && onBlur() }}
        />
      </Section>

      <Section num={3} title="What do they want?" sub="Pick the closest. We refine in the Setup + Goal Lens.">
        <ChipGroup
          name="customerGoal"
          value={values.customerGoal}
          options={CUSTOMER_GOALS.filter((v) => v !== 'unknown').concat(['unknown'])}
          labels={GOAL_LABELS}
          onChange={(n, v) => { onChange(n, v); onBlur && onBlur() }}
        />
      </Section>

      <Section num={4} title="Current setup" sub="One line is enough — not a measurement form yet.">
        <Field
          label="Existing fireplace / setup"
          name="currentSetupNote"
          value={values.currentSetupNote}
          onChange={onChange}
          onBlur={onBlur}
          as="textarea"
        />
      </Section>

      <Section num={5} title="Anything you want to remember?">
        <Field
          label="Salesperson notes"
          name="salespersonNotes"
          value={values.salespersonNotes}
          onChange={onChange}
          onBlur={onBlur}
          as="textarea"
        />
      </Section>
    </div>
  )
}
