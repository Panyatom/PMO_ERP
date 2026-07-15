// Forecast Drill-down P0 — export consistency (spec item 7).
//
// forecastExportDataset() is fed the *same* forecast object produced by
// calculateForecast() that the on-screen table renders from — these tests
// pin that the exported headers/rows/totals are byte-for-byte derived from
// that shared dataset, not a separately recomputed value.
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { __PMO_CONFIG__: {} };
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

const { SPEND_TYPES, ACTUAL_SPEND_SOURCES, calculateForecast, forecastExportDataset } = require('../app.js');

const anchor = new Date(2026, 5, 15);

function softwareMemo(overrides = {}) {
  return {
    id: 'actual-spend-memo-EXPORT-1',
    source: ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    referenceNo: 'EXPORT-1',
    memoId: 'EXPORT-1',
    project: 'AOA',
    spendType: SPEND_TYPES.SOFTWARE,
    amount: 1200,
    startDate: '2026-01',
    endDate: '2026-12',
    coverageMonths: 12,
    coverageStatus: 'Complete',
    vendorProgram: 'Export Program',
    detailLines: [],
    ...overrides,
  };
}

test('Export headers list every Forecast month key in the same order as the on-screen dataset', () => {
  const forecast = calculateForecast([softwareMemo()], anchor);
  const dataset = forecastExportDataset(forecast);
  const monthHeaders = dataset.headers.slice(4, -1);
  assert.deepEqual(monthHeaders, forecast.months.map(m => `${m.key} ${m.kind}`));
});

test('Exported month values equal the on-screen Forecast row values for every row and month', () => {
  const forecast = calculateForecast([softwareMemo(), softwareMemo({
    id: 'actual-spend-memo-EXPORT-2', referenceNo: 'EXPORT-2', memoId: 'EXPORT-2', vendorProgram: 'Second Program', amount: 600,
  })], anchor);
  const dataset = forecastExportDataset(forecast);

  forecast.rows.forEach((row, rowIndex) => {
    const exportedRow = dataset.rows[rowIndex];
    assert.equal(exportedRow[0], row.project);
    assert.equal(exportedRow[1], row.program);
    assert.equal(exportedRow[3], row.spendType);
    forecast.months.forEach((month, monthIndex) => {
      assert.equal(exportedRow[4 + monthIndex], row.values[month.key] || 0);
    });
  });
});

test('Exported row total equals the sum of that row\'s own exported month values', () => {
  const forecast = calculateForecast([softwareMemo()], anchor);
  const dataset = forecastExportDataset(forecast);
  dataset.rows.forEach((exportedRow, rowIndex) => {
    const monthValues = exportedRow.slice(4, -1);
    const exportedTotal = exportedRow[exportedRow.length - 1];
    const sumOfMonths = monthValues.reduce((sum, v) => sum + v, 0);
    assert.ok(Math.abs(sumOfMonths - exportedTotal) < 1e-9);
    assert.equal(exportedTotal, forecast.rows[rowIndex].total);
  });
});

test('Export dataset is empty-safe and mirrors an empty Forecast without redesigning the format', () => {
  const dataset = forecastExportDataset({ months: [], rows: [] });
  assert.deepEqual(dataset.headers, ['Project', 'Program', 'Plan', 'Spend Type', 'Total']);
  assert.deepEqual(dataset.rows, []);
});
