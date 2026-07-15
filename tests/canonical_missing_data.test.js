// Forecast Drill-down P0 — missing-value display (spec item 9).
//
// The canonical transaction detail must show "-" for relevant missing
// values without hiding the whole section, and must not manufacture
// irrelevant fields just to have something to show "-" for.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, budget } = loadViews();
const { SPEND_TYPES, ACTUAL_SPEND_SOURCES } = app;

test('canonicalDetailValue shows "-" for null, undefined, and empty string', () => {
  assert.equal(budget.canonicalDetailValue(null), '-');
  assert.equal(budget.canonicalDetailValue(undefined), '-');
  assert.equal(budget.canonicalDetailValue(''), '-');
});

test('canonicalDetailValue does not turn a real zero or falsy-but-present value into "-"', () => {
  assert.equal(budget.canonicalDetailValue(0), 0);
  assert.equal(budget.canonicalDetailValue(false), false);
});

test('canonicalCoverage shows "-" only when both start and end are missing, not partially', () => {
  assert.equal(budget.canonicalCoverage(null, null), '-');
  assert.equal(budget.canonicalCoverage('2026-01', null), '2026-01 → -');
  assert.equal(budget.canonicalCoverage(null, '2026-12'), '- → 2026-12');
});

test('Full canonical transaction detail panel shows "-" for missing summary fields without hiding the section', () => {
  const record = {
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    spendType: SPEND_TYPES.CLIENT_EXPENSE,
    amount: 500,
    project: 'AOA',
    // referenceNo, vendorProgram/program, startDate, endDate deliberately omitted.
  };
  budget.showCanonicalTransactionDetail(record, { title: 'Manual Spending Detail' });
  const panel = global.document.body.children[global.document.body.children.length - 1];
  assert.ok(panel.innerHTML.includes('txn-field-grid'), 'summary field grid must still render');
  assert.ok(panel.innerHTML.includes('>-<'), 'missing fields must display as "-"');
});

test('Manual Spending detail does not manufacture Memo-only fields (Program/Plan) just to show "-"', () => {
  const record = { source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE, spendType: SPEND_TYPES.HARDWARE, amount: 100 };
  const html = budget.renderManualEntrySpendTypeDetail(record);
  assert.ok(!html.includes('>Program<'));
  assert.ok(!html.includes('>Plan<'));
});
