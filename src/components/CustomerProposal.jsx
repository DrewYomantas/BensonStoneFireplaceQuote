import { buildCustomerView, collectDetailItems, collectPackages } from '../lib/customerView.js'

function Block({ value, fallback = null, multiline = false }) {
  if (!value) return fallback
  if (!multiline) return <p className="cp-line">{value}</p>
  return value.split('\n').filter(Boolean).map((line, idx) => (
    <p key={`${line}-${idx}`} className="cp-line">{line}</p>
  ))
}

export default function CustomerProposal({ fields, parseContext, includeDeliveryDate = false }) {
  const view = buildCustomerView(fields, parseContext, { includeDeliveryDate })
  const packages = collectPackages(fields)
  const details = collectDetailItems(fields)
  const hasInvestment = fields.TOTAL_AMOUNT || fields.QUOTATION_TOTAL || fields.BALANCE_DUE

  return (
    <article className="customer-proposal" aria-label={view.outputLabel}>
      <section className="cp-page">
        <header className="cp-brand-band">
          <div>
            <p className="cp-brand-mark">Benson Stone Co.</p>
            <p className="cp-brand-tag">Est. 1930 · Rockford, Illinois</p>
          </div>
          <div className="cp-brand-meta">
            <span>{fields.QUOTE_NO ? `${view.isQuote ? 'Quote' : 'Document'} #${fields.QUOTE_NO}` : 'Document #'}</span>
            <span>{fields.QUOTE_DATE || ''}</span>
          </div>
        </header>

        <div className="cp-title-band">
          <p className="cp-eyebrow">Prepared for {fields.CUSTOMER_NAME || 'our valued customer'}</p>
          <h1 className="cp-title">{view.outputLabel}</h1>
          {fields.PROJECT_TITLE ? <p className="cp-subtitle">{fields.PROJECT_TITLE}</p> : null}
        </div>

        <div className="cp-meta-band">
          {[
            ['Quote No', fields.QUOTE_NO],
            ['Quote Date', fields.QUOTE_DATE],
            ['Customer ID', fields.CUSTOMER_ID],
            ['Terms', fields.PAYMENT_TERMS],
            ['PO Number', fields.PO_NUMBER],
            ['Good For', fields.QUOTE_GOOD_FOR],
            ['Taken By', fields.TAKEN_BY],
            ['Sales Rep', fields.SALES_REP],
          ].filter(([, value]) => value).map(([label, value]) => (
            <div className="cp-meta-cell" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="cp-summary-grid">
          <div className="cp-card">
            <h2>Customer</h2>
            <Block value={fields.CUSTOMER_NAME} />
            <Block value={fields.INVOICE_ADDRESS_LINE_1} />
            <Block value={fields.INVOICE_CITY_STATE_ZIP} />
            <Block value={fields.CUSTOMER_PHONE} />
          </div>
          <div className="cp-card">
            <h2>Project location</h2>
            <Block value={fields.PROJECT_ADDRESS_LINE_1 || fields.INVOICE_ADDRESS_LINE_1} />
            <Block value={fields.PROJECT_CITY_STATE_ZIP || fields.INVOICE_CITY_STATE_ZIP} />
            {view.showDeliveryDate ? <p className="cp-line cp-muted">Target delivery: {view.deliveryDate}</p> : null}
          </div>
          <div className="cp-card cp-card--accent">
            <h2>{view.isQuote ? 'Your proposal' : 'Order details'}</h2>
            {view.showQuoteGoodFor ? <p className="cp-line"><strong>Good for:</strong> {fields.QUOTE_GOOD_FOR}</p> : null}
            {fields.SALES_REP ? <p className="cp-line"><strong>Sales rep:</strong> {fields.SALES_REP}</p> : null}
            {fields.PAYMENT_TERMS ? <p className="cp-line"><strong>Terms:</strong> {fields.PAYMENT_TERMS}</p> : null}
            {view.balanceCallout ? <p className="cp-callout">{view.balanceCallout}</p> : null}
          </div>
        </div>

        {fields.PROJECT_OVERVIEW ? (
          <section className="cp-section">
            <h2>Project overview</h2>
            <Block value={fields.PROJECT_OVERVIEW} multiline />
          </section>
        ) : null}

        {packages.length ? (
          <section className="cp-section">
            <h2>Project packages</h2>
            <div className="cp-package-grid">
              {packages.map((pkg) => (
                <div className="cp-package" key={pkg.n}>
                  <h3>{pkg.title || `Package ${pkg.n}`}</h3>
                  {pkg.items.length ? (
                    <ul className="cp-list">
                      {pkg.items.map((row, idx) => (
                        <li key={`${pkg.n}-${idx}`}>
                          <span>{row.name}</span>
                          <strong>{row.price}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pkg.liner.name ? (
                    <p className="cp-inline-row"><span>{pkg.liner.name}</span><strong>{pkg.liner.subtotal}</strong></p>
                  ) : null}
                  {pkg.install.note ? (
                    <p className="cp-inline-row"><span>{pkg.install.note}</span><strong>{pkg.install.price}</strong></p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {hasInvestment ? (
          <section className="cp-section cp-investment">
            <h2>{view.isQuote ? 'Investment summary' : 'Order summary'}</h2>
            <ul className="cp-totals">
              {fields.TOTAL_AMOUNT ? <li><span>Subtotal</span><strong>{fields.TOTAL_AMOUNT}</strong></li> : null}
              {fields.IR_TAX ? <li><span>Tax</span><strong>{fields.IR_TAX}</strong></li> : null}
              {fields.QUOTATION_TOTAL ? <li className="cp-totals-major"><span>{view.isQuote ? 'Quotation total' : 'Total'}</span><strong>{fields.QUOTATION_TOTAL}</strong></li> : null}
              {fields.AMOUNT_PAID ? <li><span>Amount paid</span><strong>{fields.AMOUNT_PAID}</strong></li> : null}
              {fields.BALANCE_DUE ? <li className="cp-totals-major"><span>Balance due</span><strong>{fields.BALANCE_DUE}</strong></li> : null}
            </ul>
          </section>
        ) : null}
      </section>

      <section className="cp-page">
        <header className="cp-page-header">
          <p className="cp-eyebrow">Detailed scope</p>
          <h2>{fields.CUSTOMER_NAME || 'Project'} — line items</h2>
        </header>

        {details.length ? (
          details.map((section) => (
            <section className="cp-detail-section" key={section.n}>
              <div className="cp-detail-head">
                <h3>{section.title}</h3>
                {section.subtotal ? <span className="cp-detail-subtotal">{section.subtotal}</span> : null}
              </div>
              <table className="cp-detail-table">
                <thead>
                  <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {section.rows.map((row, idx) => (
                    <tr key={`${section.n}-${idx}`}>
                      <td>{row.item}</td>
                      <td>{row.qty}</td>
                      <td>{row.unitPrice}</td>
                      <td>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        ) : (
          <p className="cp-muted">Detailed line items will appear here once entered.</p>
        )}

        {fields.INSTALLATION_SCOPE ? (
          <section className="cp-section">
            <h3>Installation scope</h3>
            <Block value={fields.INSTALLATION_SCOPE} multiline />
            {fields.INSTALLATION_TOTAL ? <p className="cp-line cp-muted">Installation total: <strong>{fields.INSTALLATION_TOTAL}</strong></p> : null}
          </section>
        ) : null}

        {fields.PROJECT_NOTES ? (
          <section className="cp-section">
            <h3>Project notes</h3>
            <Block value={fields.PROJECT_NOTES} multiline />
          </section>
        ) : null}

        <section className="cp-section cp-terms">
          <h3>Terms &amp; acceptance</h3>
          {view.showDepositLanguage ? (
            <p className="cp-line"><strong>Deposit:</strong> {fields.DEPOSIT_TERMS}</p>
          ) : null}
          {fields.PAYMENT_TERMS ? <p className="cp-line"><strong>Payment terms:</strong> {fields.PAYMENT_TERMS}</p> : null}
          {fields.LEGAL_TERMS ? <Block value={fields.LEGAL_TERMS} multiline /> : null}
          {!view.showDepositLanguage && view.fullyPaid ? (
            <p className="cp-line cp-callout-soft">This order is paid in full. We appreciate your business.</p>
          ) : null}
        </section>

        {view.showSignature ? (
          <section className="cp-signature">
            <div>
              <p className="cp-sig-line">Customer acceptance</p>
              <span className="cp-sig-rule" />
              <p className="cp-sig-meta">Signature &amp; date</p>
            </div>
            <div>
              <p className="cp-sig-line">Benson Stone representative</p>
              <span className="cp-sig-rule" />
              <p className="cp-sig-meta">{fields.SALES_REP || 'Sales rep'}</p>
            </div>
          </section>
        ) : null}

        <footer className="cp-footer">
          <span>Benson Stone Co. · 1100 Eleventh Street, Rockford, IL 61104</span>
          <span>815-227-2000 · bensonstone.com</span>
        </footer>
      </section>
    </article>
  )
}
