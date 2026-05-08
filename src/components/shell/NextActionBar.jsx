// V1.1 NextBarV2: one primary action per screen, with why/blocking/dontForget.
// Visual chrome only — props are passed in, never derived inside.

export default function NextActionBar({
  action,
  why,
  blocking,
  dontForget,
  primary,
  secondary,
  label = 'Safest next move',
}) {
  return (
    <section className="next-bar" aria-label="Next action">
      <div>
        <div className="eyebrow eyebrow-ember" style={{ fontWeight: 600 }}>
          {label.toUpperCase()}
        </div>
        {action && <div className="next-bar-action">{action}</div>}
        {(why || blocking || dontForget) && (
          <div className="next-bar-meta">
            {why && (
              <span className="why">
                <strong>Why:</strong> {why}
              </span>
            )}
            {blocking && (
              <span className="blocking">
                <strong>Blocking:</strong> {blocking}
              </span>
            )}
            {dontForget && (
              <span className="dontforget">
                <strong>Don&apos;t forget:</strong> {dontForget}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="next-bar-actions">
        {secondary}
        {primary}
      </div>
    </section>
  )
}
