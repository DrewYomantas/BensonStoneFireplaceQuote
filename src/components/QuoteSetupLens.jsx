import { useState } from 'react'
import { buildCurrentSetupReviewAid } from '../lib/currentSetup.js'

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function ListBlock({ emptyText, items, title, warning = false }) {
  return (
    <div className="bs-lens-block">
      <h4>{title}</h4>
      {items.length ? (
        <ul className={warning ? 'bs-lens-list bs-lens-list--warning' : 'bs-lens-list'}>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
  )
}

export default function QuoteSetupLens({ guidance }) {
  const [copyStatus, setCopyStatus] = useState('')
  if (!guidance) return null

  const aid = buildCurrentSetupReviewAid(guidance)
  const hasQuestions = Boolean(aid.questionCopyText)

  async function copyQuestions() {
    if (!hasQuestions) return
    try {
      await navigator.clipboard.writeText(aid.questionCopyText)
      setCopyStatus('Questions copied.')
    } catch {
      setCopyStatus('Could not copy. Select the questions below instead.')
    }
  }

  return (
    <section className="bs-lens no-print" aria-label="Current setup and goal lens">
      <div className="bs-lens__head">
        <div>
          <p className="bs-lens__eyebrow">Current Setup + Goal Lens</p>
          <h3>Clarify the path before proposal.</h3>
        </div>
        <span className={`bs-lens__status bs-lens__status--${aid.statusTone}`}>{aid.statusLabel}</span>
      </div>

      <div className="bs-lens__summary">
        <div>
          <span>What they have</span>
          <strong>{titleLabel(guidance.currentSetupType)}</strong>
          <small>Confidence: {guidance.confidence}</small>
        </div>
        <div>
          <span>What they want</span>
          <div className="bs-lens__chips">
            {guidance.customerGoalTags.map((tag) => <span key={tag}>{titleLabel(tag)}</span>)}
          </div>
        </div>
      </div>

      <ListBlock
        emptyText="No setup blocker detected from reviewed fields."
        items={guidance.blockers}
        title="Clarify Before Proposal"
        warning
      />

      <div className="bs-lens-block">
        <div className="bs-lens-block__head">
          <h4>Customer Questions</h4>
          <button type="button" className="bs-lens__copy" onClick={copyQuestions} disabled={!hasQuestions}>
            Copy Questions
          </button>
        </div>
        {guidance.clarificationQuestions.length ? (
          <ul className="bs-lens-list">
            {guidance.clarificationQuestions.map((question) => <li key={question}>{question}</li>)}
          </ul>
        ) : (
          <p>No extra questions needed from this lens.</p>
        )}
        {copyStatus ? <p className="bs-lens__copy-status" role="status">{copyStatus}</p> : null}
      </div>

      <div className="bs-lens-block">
        <h4>Fields To Fill Manually</h4>
        <div className="bs-lens__fields">
          {aid.fieldSuggestions.map((field) => (
            <div key={field.id}>
              <strong>{field.label}</strong>
              <span>{field.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
