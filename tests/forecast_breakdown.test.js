// Forecast Drill-down P0 — contributor aggregation regression tests.
//
// Covers spec items:
//   1. Forecast cell total = breakdown (contributor) total, for Memo,
//      Manual Spending, and Infra-as-Manual-Spending sources.
//   2. Multiple source records landing in the same forecast month are all
//      preserved as distinct contributors (no overwrite/merge), and a
//      multi-detail-line Memo keeps each line's contributor identity.
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { __PMO_CONFIG__: {} };
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

const {
  SPEND_TYPES,
  ACTUAL_SPEND_SOURCES,
  forecastComponents,
  calculateForecast,
} = require('../app.js');

const anchor = new Date(2026, 5, 15); // 2026-06-15

function softwareMemo(overrides = {}) {
  return {
    id: 'actual-spend-memo-MEMO-A',
    source: ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    referenceNo: 'MEMO-A',
    memoId: 'MEMO-A',
    project: 'AOA',
    spendType: SPEND_TYPES.SOFTWARE,
    amount: 1000,
    currency: 'THB',
    startDate: '2026-01',
    endDate: '2026-12',
    coverageMonths: 12,
    coverageStatus: 'Complete',
    vendorProgram: 'Shared Program',
    description: 'Software memo',
    detailLines: [],
    ...overrides,
  };
}

function manualEntryRecord(overrides = {}) {
  return {
    id: 'actual-spend-manual-1',
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    referenceNo: 'MAN-1',
    project: 'AOA',
    spendType: SPEND_TYPES.SOFTWARE,
    amount: 300,
    startDate: '2026-01',
    endDate: '2026-12',
    coverageMonths: 12,
    coverageStatus: 'Complete',
    vendorProgram: 'Shared Program',
    detailLines: [],
    ...overrides,
  };
}

function infraManualEntryRecord(overrides = {}) {
  return {
    id: 'actual-spend-infra-1',
    source: ACTUAL_SPEND_SOURCES.INFRA_COST,
    referenceNo: 'INF-1',
    project: 'AOA',
    spendType: SPEND_TYPES.INFRA,
    amount: 1200,
    startDate: '2026-01',
    endDate: '2026-12',
    coverageMonths: 12,
    coverageStatus: 'Complete',
    vendorProgram: 'Cloud Hosting',
    detailLines: [],
    ...overrides,
  };
}

function contributorSum(row, monthKey) {
  return (row.contributors[monthKey] || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

test('Forecast cell total equals breakdown contributor total for a Memo-only row', () => {
  const forecast = calculateForecast([softwareMemo()], anchor);
  const row = forecast.rows.find(r => r.program === 'Shared Program');
  assert.equal(contributorSum(row, '2026-06'), row.values['2026-06']);
  assert.equal(row.values['2026-06'], 1000 / 12);
});

test('Forecast cell total equals breakdown contributor total for a Manual Spending-only row', () => {
  const forecast = calculateForecast([manualEntryRecord({ vendorProgram: 'Manual Only Program' })], anchor);
  const row = forecast.rows.find(r => r.program === 'Manual Only Program');
  assert.equal(contributorSum(row, '2026-06'), row.values['2026-06']);
  assert.equal(row.values['2026-06'], 300 / 12);
  assert.equal(row.contributors['2026-06'][0].source, ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE);
});

test('Forecast cell total equals breakdown contributor total for an Infra Manual Spending row', () => {
  const forecast = calculateForecast([infraManualEntryRecord()], anchor);
  const row = forecast.rows.find(r => r.spendType === SPEND_TYPES.INFRA);
  assert.equal(contributorSum(row, '2026-06'), row.values['2026-06']);
  assert.equal(row.values['2026-06'], 100); // 1200 / 12 months
  assert.equal(row.contributors['2026-06'][0].source, ACTUAL_SPEND_SOURCES.INFRA_COST);
});

test('Multiple records in the same month all remain present as distinct contributors', () => {
  const memoA = softwareMemo({
    id: 'actual-spend-memo-A',
    referenceNo: 'MEMO-A',
    memoId: 'MEMO-A',
    amount: 2400,
    detailLines: [
      { program: 'Shared Program', plan: '', quantity: 1, unitCost: 100, monthlyCost: 100, coverageStart: '2026-01', coverageEnd: '2026-12', coverageMonths: 12, lineAmount: 1200 },
      { program: 'Shared Program', plan: '', quantity: 1, unitCost: 100, monthlyCost: 100, coverageStart: '2026-01', coverageEnd: '2026-12', coverageMonths: 12, lineAmount: 1200 },
    ],
  });
  const memoB = softwareMemo({ id: 'actual-spend-memo-B', referenceNo: 'MEMO-B', memoId: 'MEMO-B', amount: 500, detailLines: [] });
  const manual = manualEntryRecord({ id: 'actual-spend-manual-shared', referenceNo: 'MAN-SHARED', amount: 300 });
  const infra = infraManualEntryRecord();

  const forecast = calculateForecast([memoA, memoB, manual, infra], anchor);

  const softwareRow = forecast.rows.find(r => r.program === 'Shared Program' && r.spendType === SPEND_TYPES.SOFTWARE);
  const infraRow = forecast.rows.find(r => r.spendType === SPEND_TYPES.INFRA);

  // No record was overwritten or incorrectly merged: 2 memo-A lines + memo-B + manual = 4 contributors.
  assert.equal(softwareRow.contributors['2026-06'].length, 4);
  const parentIds = softwareRow.contributors['2026-06'].map(c => c.parentRecordId);
  assert.deepEqual(new Set(parentIds), new Set(['actual-spend-memo-A', 'actual-spend-memo-B', 'actual-spend-manual-shared']));

  // Memo A's two detail lines keep distinct contributor identity (not collapsed into one).
  const memoALines = softwareRow.contributors['2026-06'].filter(c => c.parentRecordId === 'actual-spend-memo-A');
  assert.equal(memoALines.length, 2);
  assert.deepEqual(memoALines.map(c => c.detailLineIndex).sort(), [0, 1]);

  // Software row total = sum of all software-row contributors.
  assert.equal(softwareRow.values['2026-06'], contributorSum(softwareRow, '2026-06'));
  assert.equal(softwareRow.values['2026-06'], 100 + 100 + 500 / 12 + 300 / 12);

  // Infra lands in its own row (different spendType), not merged into the software row.
  assert.equal(infraRow.contributors['2026-06'].length, 1);
  assert.equal(infraRow.values['2026-06'], contributorSum(infraRow, '2026-06'));

  // Total across both rows for the month equals the sum of all four records' monthly share.
  const monthTotalAcrossRows = softwareRow.values['2026-06'] + infraRow.values['2026-06'];
  const expectedMonthTotal = (100 + 100) + (500 / 12) + (300 / 12) + (1200 / 12);
  assert.ok(Math.abs(monthTotalAcrossRows - expectedMonthTotal) < 1e-9);
});
