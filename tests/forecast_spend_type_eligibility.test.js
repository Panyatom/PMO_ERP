const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { __PMO_CONFIG__: {} };
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

const {
  SPEND_TYPES,
  ACTUAL_SPEND_SOURCES,
  calculateForecast,
  forecastCascadingOptions,
  forecastExportDataset,
} = require('../app.js');

const anchor = new Date(2026, 5, 15);

function actualRecord(spendType, overrides = {}) {
  return {
    id: `actual-${spendType}-${overrides.project || 'AOA-MP'}`,
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    referenceNo: `REF-${spendType}`,
    project: 'AOA-MP',
    spendType,
    amount: 600,
    startDate: '2026-01',
    endDate: '2026-06',
    coverageMonths: 6,
    coverageStatus: 'Complete',
    vendorProgram: spendType,
    detailLines: [],
    ...overrides,
  };
}

const mixedRecords = () => [
  actualRecord(SPEND_TYPES.SOFTWARE, { id: 'figma', vendorProgram: 'Figma', amount: 600 }),
  actualRecord(SPEND_TYPES.INFRA, { id: 'aws', vendorProgram: 'AWS', amount: 1200 }),
  actualRecord(SPEND_TYPES.DEPLOYMENT, {
    id: 'site-a', project: 'TTB', vendorProgram: 'Site A', startDate: '2026-07', endDate: '2026-07', coverageMonths: 1, amount: 9000,
  }),
  actualRecord(SPEND_TYPES.OTHERS, {
    id: 'misc', project: 'TTB', vendorProgram: 'Misc expense', startDate: '2026-07', endDate: '2026-07', coverageMonths: 1, amount: 5000,
  }),
];

test('Software is included in Forecast', () => {
  const forecast = calculateForecast(mixedRecords(), anchor);
  assert.ok(forecast.rows.some(row => row.spendType === SPEND_TYPES.SOFTWARE && row.program === 'Figma'));
});

test('Infra is included in Forecast', () => {
  const forecast = calculateForecast(mixedRecords(), anchor);
  assert.ok(forecast.rows.some(row => row.spendType === SPEND_TYPES.INFRA && row.program === 'AWS'));
});

test('Deployment is excluded even when it has Actual in the forecast window', () => {
  const forecast = calculateForecast(mixedRecords(), anchor);
  assert.ok(!forecast.rows.some(row => row.spendType === SPEND_TYPES.DEPLOYMENT || row.program === 'Site A'));
});

test('Others is excluded even when it has Actual in the forecast window', () => {
  const forecast = calculateForecast(mixedRecords(), anchor);
  assert.ok(!forecast.rows.some(row => row.spendType === SPEND_TYPES.OTHERS || row.program === 'Misc expense'));
});

test('Excluded spend types do not affect project subtotals or grand totals', () => {
  const mixed = calculateForecast(mixedRecords(), anchor);
  const eligibleOnly = calculateForecast(mixedRecords().slice(0, 2), anchor);
  const total = forecast => forecast.rows.reduce((sum, row) => sum + row.total, 0);
  assert.equal(total(mixed), total(eligibleOnly));
  assert.deepEqual([...new Set(mixed.rows.map(row => row.project))], ['AOA-MP']);
});

test('Excluded spend types do not appear in cascading filters or CSV export', () => {
  const forecast = calculateForecast(mixedRecords(), anchor);
  const options = forecastCascadingOptions(forecast.rows);
  const csv = forecastExportDataset(forecast);
  const exportedText = csv.rows.flat().join(' ');
  assert.deepEqual(options.projects, ['AOA-MP']);
  assert.deepEqual(options.programs, ['AWS', 'Figma']);
  assert.ok(!options.projects.includes('TTB'));
  assert.ok(!exportedText.includes('Deployment'));
  assert.ok(!exportedText.includes('Others'));
  assert.ok(!exportedText.includes('Site A'));
  assert.ok(!exportedText.includes('Misc expense'));
});
