// Forecast Drill-down P0 — click eligibility (spec item 8).
//
// Uses the *real* forecastCellIsClickable from views/budget.js (not a
// re-implementation) against real calculateForecast() output, so a change to
// either side of the contract fails this test. Test names pin the current
// intended behavior for carry-forward-only and zero/empty cells.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, budget } = loadViews();
const { SPEND_TYPES, ACTUAL_SPEND_SOURCES, calculateForecast } = app;

const anchor = new Date(2026, 5, 15); // 2026-06-15

function softwareMemo(overrides = {}) {
  return {
    id: 'actual-spend-memo-CLICK-1',
    source: ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    referenceNo: 'CLICK-1',
    memoId: 'CLICK-1',
    project: 'AOA',
    spendType: SPEND_TYPES.SOFTWARE,
    amount: 1200,
    startDate: '2026-01',
    endDate: '2026-12',
    coverageMonths: 12,
    coverageStatus: 'Complete',
    vendorProgram: 'Click Program',
    detailLines: [],
    ...overrides,
  };
}

test('A cell with real, fully-supported contributors is clickable', () => {
  const forecast = calculateForecast([softwareMemo()], anchor);
  const row = forecast.rows[0];
  assert.equal(budget.forecastCellIsClickable(row, '2026-07'), true);
});

test('Carry-forward-only cell (coverage ended, forecast still projects it) remains non-clickable — pinned current behavior', () => {
  const forecast = calculateForecast([softwareMemo({ endDate: '2026-06', coverageMonths: 6, amount: 600 })], anchor);
  const row = forecast.rows[0];
  // 2026-07 is after coverage ends (2026-06), so it's carry-forward, not source-supported.
  assert.ok(row.values['2026-07'] > 0, 'sanity: carry-forward month still shows a projected amount');
  assert.equal(row.supportedValues['2026-07'], 0, 'sanity: carry-forward month has no supporting contributor');
  assert.equal(budget.forecastCellIsClickable(row, '2026-07'), false);
});

test('Zero/empty cell (no amount at all) is non-clickable', () => {
  const forecast = calculateForecast([softwareMemo()], anchor);
  const row = forecast.rows[0];
  // A month key entirely outside the Forecast window has no value and no contributors.
  assert.equal(row.values['2099-01'], undefined);
  assert.equal(budget.forecastCellIsClickable(row, '2099-01'), false);
});

test('A cell mixing a supported contributor with carry-forward is non-clickable (amount does not match supported total)', () => {
  const supported = softwareMemo({
    id: 'actual-spend-memo-CLICK-SUP', referenceNo: 'CLICK-SUP', memoId: 'CLICK-SUP', amount: 1200,
  });
  const projected = softwareMemo({
    id: 'actual-spend-memo-CLICK-PROJ', referenceNo: 'CLICK-PROJ', memoId: 'CLICK-PROJ',
    vendorProgram: 'Click Program', amount: 600, endDate: '2026-06', coverageMonths: 6,
  });
  const row = calculateForecast([supported, projected], anchor).rows[0];
  assert.notEqual(row.values['2026-07'], row.supportedValues['2026-07']);
  assert.equal(budget.forecastCellIsClickable(row, '2026-07'), false);
});

test('A historical (already-actual) month with a real contributor is clickable', () => {
  const forecast = calculateForecast([softwareMemo()], anchor);
  const row = forecast.rows[0];
  assert.equal(budget.forecastCellIsClickable(row, '2026-06'), true);
});
