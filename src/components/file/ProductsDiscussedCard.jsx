import SourceTrustBadge from './SourceTrustBadge.jsx'

export default function ProductsDiscussedCard({ products = [] }) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ember">PRODUCTS DISCUSSED</span>
      {products.length === 0 ? (
        <p className="body-sm" style={{ marginTop: 12 }}>
          Nothing logged yet. Tag products from the showroom or add them after Setup + Goal Lens.
        </p>
      ) : (
        <div className="vstack" style={{ marginTop: 12, gap: 8 }}>
          {products.map((p) => (
            <div key={p.id || p.name} className={`product-row ${p.favorite ? 'is-favorite' : ''}`}>
              <div className="product-meta">
                <div className="product-name">
                  {p.name}
                  {p.favorite && <span className="product-fav">★</span>}
                </div>
                {(p.description || p.display) && (
                  <div className="body-sm">
                    {p.description}
                    {p.description && p.display && ' · '}
                    {p.display && <span className="mono">display {p.display}</span>}
                  </div>
                )}
              </div>
              {p.source && <SourceTrustBadge kind={p.source} label={p.sourceLabel} />}
            </div>
          ))}
        </div>
      )}
      <p className="body-sm" style={{ marginTop: 12, color: 'var(--slate)' }}>
        Price never appears here — that lives on the quote.
      </p>
    </section>
  )
}
