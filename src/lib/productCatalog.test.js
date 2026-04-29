import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProductIntelligence,
  createProductCatalog,
  extractLineItemsFromFields,
  INTERNAL_EXPORT_BLOCKLIST,
} from './productCatalog.js'

const catalogCsv = `product_id,product_code,department,customer_facing_name_seed,bistrack_description,category_guess,on_display,display_department,stock_actual,stock_available,stock_on_order,allocated_stock,standard_sell,standard_buy,average_cost_with_add,estimated_margin_pct_at_standard_sell,sales_ytd,sales_lytd,sales_mtd,margin_pct_ytd,inventory_turns,total_sales_snapshot,total_quantity_snapshot,product_rank_snapshot,source_snapshot
1,FP-100,fireplace,Sample Direct Vent Fireplace,Sample Direct Vent Fireplace,direct_vent_fireplace,true,050-Fireplace,2.0,1.0,3.0,1.0,1000.0,800.0,790.0,0.21,0,0,0,0,1.2,1000,1,4,BisTrack export 2026-04-29
2,SKY-REMOTE,fireplace,Skytech Remote Control,Skytech Remote Control,remote_control,false,,0.0,0.0,0.0,0.0,300.0,100.0,100.0,0.66,0,0,0,0,1.2,900,3,8,BisTrack export 2026-04-29`

const manualCsv = `manual_order_line_type_id,default_code,name,department,dept_code,use_on_sales_order,use_on_purchase_order,source_snapshot
23,AD001.050,Delivery - Fireplace,Fireplace,050,yes,yes,BisTrack export 2026-04-29`

const catalog = createProductCatalog({
  fireplaceCatalogCsv: catalogCsv,
  manualLineTypesCsv: manualCsv,
  manifestJson: '{"snapshot_date":"2026-04-29"}',
})

test('matches exact product code and adds internal badges without changing quote line values', () => {
  const result = buildProductIntelligence([
    { code: 'FP-100', description: 'OCR description stays here', qty: '1', unitPrice: '$1,000.00', total: '$1,000.00' },
  ], catalog)

  assert.equal(result.rows[0].match.matchType, 'exact')
  assert.equal(result.rows[0].description, 'OCR description stays here')
  assert.deepEqual(result.rows[0].badges, ['On Display', 'In Stock', 'Available', 'On Order', 'Margin Sensitive'])
  assert.equal(result.rows[0].group, 'Fireplace Unit')
})

test('fuzzy description match is only a suggestion and requires review', () => {
  const result = buildProductIntelligence([
    { code: 'UNKNOWN', description: 'Skytech remote control handset', qty: '1', unitPrice: '$300.00', total: '$300.00' },
  ], catalog)

  assert.equal(result.rows[0].match.matchType, 'suggestion')
  assert.equal(result.rows[0].match.product.code, 'SKY-REMOTE')
  assert.equal(result.rows[0].needsReview, true)
  assert.deepEqual(result.rows[0].badges, ['Needs Review'])
})

test('manual order line types group with delivery labor service adjustments', () => {
  const result = buildProductIntelligence([
    { code: 'AD001.050', description: 'Delivery - Fireplace', qty: '1', unitPrice: '$100.00', total: '$100.00' },
  ], catalog)

  assert.equal(result.rows[0].match.matchType, 'exact')
  assert.equal(result.rows[0].group, 'Delivery / Labor / Service / Adjustments')
})

test('detail fields can seed matching for pasted notes', () => {
  const fields = {
    DETAIL_1_ITEM_1: 'FP-100 - Sample Direct Vent Fireplace',
    DETAIL_1_QTY_1: '1',
    DETAIL_1_UNIT_PRICE_1: '$1,000.00',
    DETAIL_1_TOTAL_1: '$1,000.00',
  }

  const rows = extractLineItemsFromFields(fields)
  assert.equal(rows[0].code, 'FP-100')
  assert.equal(rows[0].total, '$1,000.00')
})

test('internal export blocklist includes sensitive product metrics', () => {
  assert.ok(INTERNAL_EXPORT_BLOCKLIST.includes('average_cost_with_add'))
  assert.ok(INTERNAL_EXPORT_BLOCKLIST.includes('standard_buy'))
  assert.ok(INTERNAL_EXPORT_BLOCKLIST.includes('estimated_margin_pct_at_standard_sell'))
  assert.ok(INTERNAL_EXPORT_BLOCKLIST.includes('inventory_turns'))
  assert.ok(INTERNAL_EXPORT_BLOCKLIST.includes('total_sales_snapshot'))
  assert.ok(INTERNAL_EXPORT_BLOCKLIST.includes('product_rank_snapshot'))
})
