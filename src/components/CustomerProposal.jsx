import { buildCustomerView, collectDetailItems, collectPackages } from '../lib/customerView.js'

function Block({ value, fallback = null, multiline = false }) {
  if (!value) return fallback
  if (!multiline) return <p className="cp-line">{value}</p>
  return value.split('\n').filter(Boolean).map((line, idx) => (
    <p key={`${line}-${idx}`} className="cp-line">{line}</p>
  ))
}

function TemplateHead() {
  return (
    <header className="cp-template-head">
      <div className="cp-logo-plaque">
        <p className="cp-brand-mark">Benson Stone Co.</p>
        <p className="cp-brand-tag">Est. 1930</p>
      </div>
      <address className="cp-store-address">
        <span>1100 Eleventh Street</span>
        <span>Rockford, Illinois 61104</span>
        <strong>815-227-2000</strong>
        <span>www.bensonstone.com</span>
      </address>
    </header>
  )
}

function Divider() {
  return <div className="cp-divider" aria-hidden="true"><span /></div>
}

export default function CustomerProposal({ fields, parseContext, includeDeliveryDate = false }) {
  const view = buildCustomerView(fields, parseContext, { includeDeliveryDate })
  const packages = collectPackages(fields)
  const details = collectDetailItems(fields)
  const hasInvestment = fields.TOTAL_AMOUNT || fields.QUOTATION_TOTAL || fields.BALANCE_DUE
  const projectLine = [
    fields.CUSTOMER_NAME,
    fields.PROJECT_TITLE,
    fields.PROJECT_CITY_STATE || fields.PROJECT_CITY_STATE_ZIP,
  ].filter(Boolean).join(' - ')
  const metaItems = [
    ['Quote No', fields.QUOTE_NO],
    ['Quote Date', fields.QUOTE_DATE],
    ['Customer ID', fields.CUSTOMER_ID],
    ['Terms', fields.PAYMENT_TERMS],
    ['PO Number', fields.PO_NUMBER],
    ['Good For', fields.QUOTE_GOOD_FOR],
    ['Taken By', fields.TAKEN_BY],
    ['Sales Rep', fields.SALES_REP],
  ].filter(([, value]) => value)

  return (
    <article className="customer-proposal" aria-label={view.outputLabel}>
      <section className="cp-page cp-page--cover">
        <TemplateHead />

        <div className="cp-title-band">
          <h1 className="cp-title">{view.outputLabel}</h1>
          <p className="cp-subtitle">{projectLine || 'Prepared project proposal'}</p>
          <Divider />
        </div>

        {metaItems.length ? (
          <div className="cp-meta-band">
            {metaItems.map(([label, value]) => (
              <div className="cp-meta-cell" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="cp-page-one-grid">
          <div className="cp-main-column">
            {fields.PROJECT_OVERVIEW ? (
              <section className="cp-section cp-overview">
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
            ) : (
              <section className="cp-empty-panel">
                <h2>Project scope</h2>
                <p>Your fireplace selections, project materials, and investment summary are included in this proposal.</p>
              </section>
            )}

            {fields.INSTALLATION_SCOPE ? (
              <section className="cp-install-band">
                <h2>Installation scope</h2>
                <Block value={fields.INSTALLATION_SCOPE} multiline />
                {fields.INSTALLATION_TOTAL ? <strong>{fields.INSTALLATION_TOTAL}</strong> : null}
              </section>
            ) : null}
          </div>

          <aside className="cp-sidebar">
            <section>
              <h2>Customer</h2>
              <Block value={fields.CUSTOMER_NAME} />
              <Block value={fields.INVOICE_ADDRESS_LINE_1} />
              <Block value={fields.INVOICE_CITY_STATE_ZIP} />
              <Block value={fields.CUSTOMER_PHONE} />
            </section>
            <section>
              <h2>Project location</h2>
              <Block value={fields.PROJECT_ADDRESS_LINE_1 || fields.INVOICE_ADDRESS_LINE_1} />
              <Block value={fields.PROJECT_CITY_STATE_ZIP || fields.INVOICE_CITY_STATE_ZIP} />
              {view.showDeliveryDate ? <p className="cp-line cp-muted">Target delivery: {view.deliveryDate}</p> : null}
            </section>
            {hasInvestment ? (
              <section className="cp-investment">
                <h2>{view.isQuote ? 'Investment summary' : 'Order summary'}</h2>
                <ul className="cp-totals">
                  {fields.TOTAL_AMOUNT ? <li><span>Total Amount</span><strong>{fields.TOTAL_AMOUNT}</strong></li> : null}
                  {fields.IR_TAX ? <li><span>IR Tax</span><strong>{fields.IR_TAX}</strong></li> : null}
                  {fields.QUOTATION_TOTAL ? <li className="cp-totals-major"><span>{view.isQuote ? 'Quotation Total' : 'Total'}</span><strong>{fields.QUOTATION_TOTAL}</strong></li> : null}
                  {fields.AMOUNT_PAID ? <li><span>Amount Paid</span><strong>{fields.AMOUNT_PAID}</strong></li> : null}
                  {fields.BALANCE_DUE ? <li className="cp-totals-major"><span>Balance Due</span><strong>{fields.BALANCE_DUE}</strong></li> : null}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>

        <footer className="cp-footer">
          <span>Benson Stone Co. | Quote #{fields.QUOTE_NO || ''} | {fields.CUSTOMER_NAME || ''}</span>
          <span>Page 1 of 2</span>
        </footer>
      </section>

      <section className="cp-page">
        <TemplateHead />

        <header className="cp-page-header">
          <h2>Detailed Scope, Terms &amp; Investment</h2>
          <p>A complete view of venting components, installation details, and project investment.</p>
          <Divider />
        </header>

        {details.length ? (
          <div className="cp-detail-grid">
            {details.map((section) => (
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
            ))}
          </div>
        ) : (
          <p className="cp-muted">Detailed line items will appear here once reviewed.</p>
        )}

        <div className="cp-bottom-grid">
          <section className="cp-section cp-terms">
            <h3>Terms &amp; Conditions</h3>
            {view.showDepositLanguage ? (
              <p className="cp-line"><strong>Deposit:</strong> {fields.DEPOSIT_TERMS}</p>
            ) : null}
            {fields.PAYMENT_TERMS ? <p className="cp-line"><strong>Payment terms:</strong> {fields.PAYMENT_TERMS}</p> : null}
            {fields.LEGAL_TERMS ? <Block value={fields.LEGAL_TERMS} multiline /> : null}
            {!view.showDepositLanguage && view.fullyPaid ? (
              <p className="cp-line cp-callout-soft">This order is paid in full. We appreciate your business.</p>
            ) : null}
          </section>

          <section className="cp-acceptance">
            <h3>Acceptance</h3>
            <p>I have read and agree to the terms, scope, and investment outlined in this proposal.</p>
            {fields.DEPOSIT_TERMS ? <p>{fields.DEPOSIT_TERMS}</p> : null}
            {view.showSignature ? (
              <div className="cp-signature">
                <div>
                  <span className="cp-sig-rule" />
                  <p className="cp-sig-meta">Authorized Signature</p>
                </div>
                <div>
                  <span className="cp-sig-rule" />
                  <p className="cp-sig-meta">Date</p>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="cp-footer">
          <span>Benson Stone Co. | Quote #{fields.QUOTE_NO || ''} | {fields.CUSTOMER_NAME || ''}</span>
          <span>Page 2 of 2</span>
        </footer>
      </section>
    </article>
  )
}
