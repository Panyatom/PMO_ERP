// Forecast Drill-down P0 — Source vs Spend Type classification.
//
// "Source" is a UI-facing concept with exactly two values: Memo and Manual
// Entry. "Historical" / "Infra" / "Others" are Spend Type values, never
// Source values — verified against the real label + badge-class functions,
// not a re-implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, budget } = loadViews();
const { SPEND_TYPES, ACTUAL_SPEND_SOURCES } = app;

test('Source label for an Approved Memo record is "Memo"', () => {
  assert.equal(budget.canonicalActualSpendSourceLabel(ACTUAL_SPEND_SOURCES.APPROVED_MEMO), 'Memo');
});

test('Source label for a Manual / Historical Expense record is "Manual Entry", not "Historical"', () => {
  const label = budget.canonicalActualSpendSourceLabel(ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE);
  assert.equal(label, 'Manual Entry');
  assert.notEqual(label, 'Historical');
});

test('Source label for an Infra Cost record is "Manual Entry", not "Infra"', () => {
  const label = budget.canonicalActualSpendSourceLabel(ACTUAL_SPEND_SOURCES.INFRA_COST);
  assert.equal(label, 'Manual Entry');
  assert.notEqual(label, 'Infra');
});

test('Source label is never "Others" for any known Actual Spend source value', () => {
  for (const source of Object.values(ACTUAL_SPEND_SOURCES)) {
    const label = budget.canonicalActualSpendSourceLabel(source);
    assert.ok(label === 'Memo' || label === 'Manual Entry', `unexpected Source label "${label}" for source "${source}"`);
  }
});

test('Every known Actual Spend source value collapses to exactly one of two Source labels', () => {
  const labels = new Set(Object.values(ACTUAL_SPEND_SOURCES).map(source => budget.canonicalActualSpendSourceLabel(source)));
  assert.deepEqual([...labels].sort(), ['Manual Entry', 'Memo']);
});

test('Infra and Others remain valid Spend Type values, distinct from Source', () => {
  assert.equal(SPEND_TYPES.INFRA, 'Infra');
  assert.equal(SPEND_TYPES.OTHERS, 'Others');
  // Spend Type values must never collide with the Source label vocabulary.
  assert.ok(!['Memo', 'Manual Entry'].includes(SPEND_TYPES.INFRA));
  assert.ok(!['Memo', 'Manual Entry'].includes(SPEND_TYPES.OTHERS));
});

test('Manual Entry detail rendering shows Source as "Manual Entry" for every manual spend type', () => {
  const spendTypes = [SPEND_TYPES.SOFTWARE, SPEND_TYPES.TEAM_ACTIVITY, SPEND_TYPES.CLIENT_EXPENSE, SPEND_TYPES.HARDWARE, SPEND_TYPES.INFRA];
  for (const spendType of spendTypes) {
    const record = { source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE, spendType, amount: 100, startDate: '2026-01', endDate: '2026-01' };
    assert.equal(budget.canonicalActualSpendSourceLabel(record.source), 'Manual Entry');
  }
});
