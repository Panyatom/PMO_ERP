const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { __PMO_CONFIG__: {} };
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

const {
  SPEND_TYPES,
  ACTUAL_SPEND_SOURCES,
  forecastComponents,
  forecastMonths,
  calculateForecast,
} = require('../app.js');

const anchor = new Date(2026, 5, 15);
const isEligible = (row, monthKey) =>
  (Number(row.values[monthKey]) || 0) > 0 &&
  (row.contributors[monthKey] || []).length > 0 &&
  Math.abs((Number(row.values[monthKey]) || 0) - (Number(row.supportedValues[monthKey]) || 0)) < 0.01;

function completedSoftwareMemo(overrides = {}) {
  return {
    id: 'actual-spend-memo-MEMO-001',
    source: ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    referenceNo: 'MEMO-001',
    memoId: 'MEMO-001',
    project: 'AOA',
    spendType: SPEND_TYPES.SOFTWARE,
    amount: 30000,
    currency: 'THB',
    startDate: '2026-01',
    endDate: '2026-12',
    coverageMonths: 12,
    coverageStatus: 'Complete',
    vendorProgram: 'Program A, Program B',
    description: 'Software memo',
    detailLines: [
      { program: 'Program A', plan: 'Plan A', quantity: 1, unitCost: 1000, monthlyCost: 1000, coverageStart: '2026-01', coverageEnd: '2026-12', coverageMonths: 12, lineAmount: 12000 },
      { program: 'Program B', plan: 'Plan B', quantity: 1, unitCost: 1500, monthlyCost: 1500, coverageStart: '2026-01', coverageEnd: '2026-12', coverageMonths: 12, lineAmount: 18000 },
    ],
    ...overrides,
  };
}

function actualSpendRecord(overrides = {}) {
  return {
    id: 'actual-spend-record',
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    referenceNo: 'AS-1',
    project: 'AOA',
    spendType: SPEND_TYPES.HARDWARE,
    amount: 12000,
    currency: 'THB',
    startDate: '2026-02',
    endDate: '2026-02',
    coverageMonths: 1,
    coverageStatus: 'Complete',
    vendorProgram: 'One-time item',
    detailLines: [],
    ...overrides,
  };
}

test('Forecast period window is exactly 12 months: previous six plus current and next five', () => {
  const months = forecastMonths(anchor);
  assert.equal(months.length, 12);
  assert.deepEqual(months.map(month => month.key), [
    '2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11',
  ]);
  assert.deepEqual(months.slice(0, 6).map(month => month.kind), ['actual','actual','actual','actual','actual','actual']);
  assert.deepEqual(months.slice(6).map(month => month.kind), ['forecast','forecast','forecast','forecast','forecast','forecast']);
});

test('Forecast splits one software memo into one component per detail line', () => {
  const components = forecastComponents([completedSoftwareMemo()]);
  assert.equal(components.length, 2);
  assert.deepEqual(components.map(item => item.program), ['Program A', 'Program B']);
  assert.deepEqual(components.map(item => item.plan), ['Plan A', 'Plan B']);
  assert(components.every(item => item.parentRecordId === 'actual-spend-memo-MEMO-001'));
});

test('Forecast rows preserve separated monthly totals and project subtotal', () => {
  const forecast = calculateForecast([completedSoftwareMemo()], anchor);
  assert.equal(forecast.rows.length, 2);
  const programA = forecast.rows.find(row => row.program === 'Program A');
  const programB = forecast.rows.find(row => row.program === 'Program B');
  assert.equal(programA.values['2026-06'], 1000);
  assert.equal(programB.values['2026-06'], 1500);
  assert.equal(programA.values['2026-07'], 1000);
  assert.equal(programB.values['2026-07'], 1500);
  assert.equal(forecast.rows.reduce((sum, row) => sum + row.values['2026-07'], 0), 2500);
});

test('Covered future Forecast month is fully source-supported', () => {
  const forecast = calculateForecast([completedSoftwareMemo()], anchor);
  const row = forecast.rows.find(item => item.program === 'Program A');
  assert.equal(row.values['2026-07'], 1000);
  assert.equal(row.supportedValues['2026-07'], 1000);
  assert.equal(row.contributors['2026-07'].length, 1);
  assert.equal(row.contributors['2026-07'][0].detailLineIndex, 0);
  assert.equal(row.contributors['2026-07'][0].parentRecordId, 'actual-spend-memo-MEMO-001');
  assert.equal(isEligible(row, '2026-07'), true);
});

test('Historical software carries its latest Actual beyond the recorded end date', () => {
  const forecast = calculateForecast([completedSoftwareMemo({
    id: 'actual-spend-historical-HIST-SW',
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    storageKind: 'historical_memos',
    referenceNo: 'HIST-SW',
    memoId: 'historical:HIST-SW',
    amount: 6000,
    endDate: '2026-06',
    coverageMonths: 6,
    detailLines: [
      { program: 'Historical Program', plan: 'Legacy', quantity: 1, unitCost: 1000, monthlyCost: 1000, coverageStart: '2026-01', coverageEnd: '2026-06', coverageMonths: 6, lineAmount: 6000 },
    ],
  })], anchor);
  const row = forecast.rows.find(item => item.program === 'Historical Program');
  assert.equal(row.values['2026-06'], 1000);
  assert.equal(row.values['2026-07'], 1000);
  assert.equal(row.contributors['2026-07'].length, 0);
  assert.equal(row.cellKinds['2026-07'], 'forecast');
});

test('Future month carries forward after detail-line coverage expires', () => {
  const memo = completedSoftwareMemo({
    amount: 15000,
    endDate: '2026-06',
    coverageMonths: 6,
    detailLines: [
      { program: 'Program A', plan: 'Plan A', quantity: 1, unitCost: 1000, monthlyCost: 1000, coverageStart: '2026-01', coverageEnd: '2026-06', coverageMonths: 6, lineAmount: 6000 },
    ],
  });
  const forecast = calculateForecast([memo], anchor);
  const row = forecast.rows[0];
  assert.equal(row.values['2026-07'], 1000);
  assert.equal(row.supportedValues['2026-07'], 0);
  assert.equal(row.contributors['2026-07'].length, 0);
  assert.equal(isEligible(row, '2026-07'), false);
});

test('Expired detail-line coverage does not carry into supported forecast aggregate', () => {
  const supported = completedSoftwareMemo({
    id: 'actual-spend-memo-SUP',
    referenceNo: 'SUP',
    memoId: 'SUP',
    amount: 1200,
    detailLines: [
      { program: 'Program A', plan: 'Plan A', quantity: 1, unitCost: 100, monthlyCost: 100, coverageStart: '2026-01', coverageEnd: '2026-12', coverageMonths: 12, lineAmount: 1200 },
    ],
  });
  const projected = completedSoftwareMemo({
    id: 'actual-spend-memo-PROJ',
    referenceNo: 'PROJ',
    memoId: 'PROJ',
    amount: 600,
    endDate: '2026-06',
    coverageMonths: 6,
    detailLines: [
      { program: 'Program A', plan: 'Plan A', quantity: 1, unitCost: 50, monthlyCost: 50, coverageStart: '2026-01', coverageEnd: '2026-06', coverageMonths: 6, lineAmount: 300 },
    ],
  });
  const row = calculateForecast([supported, projected], anchor).rows[0];
  assert.equal(row.values['2026-07'], 100);
  assert.equal(row.supportedValues['2026-07'], 100);
  assert.equal(row.values['2026-07'], row.supportedValues['2026-07']);
  assert.equal(isEligible(row, '2026-07'), true);
});

test('Historical actual month with source contribution is eligible for drill-down', () => {
  const forecast = calculateForecast([completedSoftwareMemo()], anchor);
  const row = forecast.rows.find(item => item.program === 'Program A');
  assert.equal(row.values['2026-05'], 1000);
  assert.equal(row.supportedValues['2026-05'], 1000);
  assert.equal(row.contributors['2026-05'].length, 1);
  assert.equal(isEligible(row, '2026-05'), true);
});

test('Manual and Infra records remain record-level components', () => {
  const records = [
    {
      id: 'actual-spend-manual-1',
      source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
      referenceNo: 'MAN-1',
      project: 'AOA',
      spendType: SPEND_TYPES.SOFTWARE,
      amount: 600,
      startDate: '2026-01',
      endDate: '2026-06',
      coverageMonths: 6,
      coverageStatus: 'Complete',
      vendorProgram: 'Manual Program',
      detailLines: [],
    },
    {
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
      vendorProgram: 'Cloud',
      detailLines: [],
    },
  ];
  const components = forecastComponents(records);
  assert.deepEqual(components.map(item => item.componentType), ['record', 'record']);
  assert.deepEqual(components.map(item => item.parentRecordId), ['actual-spend-manual-1', 'actual-spend-infra-1']);
});

test('Infrastructure carries its latest Actual beyond its Start-End range', () => {
  const forecast = calculateForecast([actualSpendRecord({
    id: 'actual-spend-infra-range',
    source: ACTUAL_SPEND_SOURCES.INFRA_COST,
    storageKind: 'infra_cost',
    spendType: SPEND_TYPES.INFRA,
    amount: 3000,
    startDate: '2026-01',
    endDate: '2026-03',
    coverageMonths: 3,
    vendorProgram: 'Cloud Range',
  })], anchor);
  const row = forecast.rows[0];
  assert.equal(row.values['2026-01'], 1000);
  assert.equal(row.values['2026-03'], 1000);
  assert.equal(row.values['2026-04'], 0);
  assert.equal(row.values['2026-07'], 1000);
  assert.equal(row.cellKinds['2026-07'], 'forecast');
});

test('One-time spending is excluded from Forecast entirely', () => {
  const forecast = calculateForecast([actualSpendRecord({
    id: 'actual-spend-hardware-once',
    spendType: SPEND_TYPES.HARDWARE,
    amount: 12000,
    startDate: '2026-02',
    endDate: '2026-02',
    coverageMonths: 1,
    vendorProgram: 'Laptop',
  })], anchor);
  assert.equal(forecast.rows.length, 0);
});

test('One-time Actual inside the forecast section is still excluded', () => {
  const forecast = calculateForecast([actualSpendRecord({
    id: 'actual-spend-future-hardware',
    spendType: SPEND_TYPES.HARDWARE,
    startDate: '2026-07',
    endDate: '2026-07',
  })], anchor);
  assert.equal(forecast.rows.length, 0);
});

test('12-month lookback excludes obsolete recurring records without active future coverage', () => {
  const forecast = calculateForecast([completedSoftwareMemo({
    id: 'actual-spend-old-software',
    referenceNo: 'OLD-SW',
    memoId: 'OLD-SW',
    startDate: '2024-01',
    endDate: '2025-05',
    coverageMonths: 17,
    amount: 17000,
    detailLines: [
      { program: 'Old Program', plan: '', quantity: 1, unitCost: 1000, monthlyCost: 1000, coverageStart: '2024-01', coverageEnd: '2025-05', coverageMonths: 17, lineAmount: 17000 },
    ],
  })], anchor);
  assert.equal(forecast.rows.length, 0);
});

test('12-month lookback keeps recurring records with active future coverage', () => {
  const forecast = calculateForecast([completedSoftwareMemo({
    id: 'actual-spend-active-old-software',
    referenceNo: 'ACTIVE-OLD-SW',
    memoId: 'ACTIVE-OLD-SW',
    startDate: '2024-01',
    endDate: '2026-08',
    coverageMonths: 32,
    amount: 32000,
    detailLines: [
      { program: 'Active Old Program', plan: '', quantity: 1, unitCost: 1000, monthlyCost: 1000, coverageStart: '2024-01', coverageEnd: '2026-08', coverageMonths: 32, lineAmount: 32000 },
    ],
  })], anchor);
  const row = forecast.rows.find(item => item.program === 'Active Old Program');
  assert.equal(row.values['2026-07'], 1000);
});

test('Legacy software memo without detail lines falls back to record-level behavior', () => {
  const legacy = completedSoftwareMemo({ detailLines: [], vendorProgram: 'Legacy Program', amount: 1200 });
  const components = forecastComponents([legacy]);
  const forecast = calculateForecast([legacy], anchor);
  assert.equal(components.length, 1);
  assert.equal(components[0].componentType, 'record');
  assert.equal(forecast.rows[0].program, 'Legacy Program');
  assert.equal(forecast.rows[0].values['2026-07'], 100);
});

test('Single-line memo remains stable as one Forecast row', () => {
  const memo = completedSoftwareMemo({
    amount: 1200,
    vendorProgram: 'Only Program',
    detailLines: [
      { program: 'Only Program', plan: 'Only Plan', quantity: 1, unitCost: 100, monthlyCost: 100, coverageStart: '2026-01', coverageEnd: '2026-12', coverageMonths: 12, lineAmount: 1200 },
    ],
  });
  const forecast = calculateForecast([memo], anchor);
  assert.equal(forecast.rows.length, 1);
  assert.equal(forecast.rows[0].program, 'Only Program');
  assert.equal(forecast.rows[0].plan, 'Only Plan');
  assert.equal(forecast.rows[0].values['2026-07'], 100);
});
