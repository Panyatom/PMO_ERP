const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, history, budget } = loadViews();
const license = require('../views/license.js');

function resetStores() {
  app.storeMemos([]);
  app.storeHistoricalMemos([]);
  app.storeActualSpendRecords([]);
  app.storeBudgetPoolRecords([]);
  license.storeManualLicenses([]);
}

function historicalSoftware(overrides = {}) {
  return app.normalizeHistoricalMemo({
    id: 'hist-sw-1',
    memoNo: 'OLD-SW-001',
    type: 'sl',
    project: 'AOA',
    subject: 'Old software purchase',
    date: '2025-01-15',
    total: 24000,
    slItems: [
      { name: 'Figma', plan: 'Pro', price: 1000, qty: 2, months: 12, startMonth: '2025-01', endMonth: '2025-12' },
    ],
    ...overrides,
  });
}

function budgetPool(overrides = {}) {
  return {
    id: 'pool-aoa-sw',
    project: 'AOA',
    name: 'AOA Software 2025',
    budget: 100000,
    year: '2568',
    startMonth: '2025-01',
    endMonth: '2025-12',
    memoTypes: ['sl'],
    spendTypes: [app.SPEND_TYPES.SOFTWARE],
    ...overrides,
  };
}

test('Historical memo normalization preserves memo shape and empty arrays', () => {
  const memo = app.normalizeHistoricalMemo({ memoNo: 'OLD-HW-001', type: 'hw', project: 'AOA', subject: 'Laptop', total: 100 });
  assert.equal(memo.status, 'completed');
  assert.equal(memo.sourceKind, 'historical');
  assert.deepEqual(memo.slItems, []);
  assert.deepEqual(memo.hwItems, []);
  assert.deepEqual(memo.sections, []);
  assert.equal(memo.currency, 'THB');
});

test('Historical memo mapper round-trips structured fields', () => {
  const memo = historicalSoftware();
  const roundTrip = app.dbToHistoricalMemo(app.historicalMemoToDb(memo));
  assert.equal(roundTrip.memoNo, memo.memoNo);
  assert.equal(roundTrip.type, 'sl');
  assert.equal(roundTrip.slItems[0].name, 'Figma');
  assert.equal(roundTrip.status, 'completed');
});

test('Cross-table duplicate Reference No is rejected locally', () => {
  resetStores();
  app.storeMemos([{ id: 'memo-1', memoNo: 'DUP-001', status: 'completed' }]);
  assert.equal(app.historicalMemoNoConflict('DUP-001')?.source, 'memos');
});

test('Historical memo reconciles to exactly one canonical Actual Spend record and edit does not duplicate', () => {
  resetStores();
  const memo = historicalSoftware();
  app.storeHistoricalMemos([memo]);
  let records = budget.reconcileActualSpendSources();
  assert.equal(records.filter(record => record.source === app.ACTUAL_SPEND_SOURCES.HISTORICAL_MEMO).length, 1);
  assert.equal(records[0].id, 'actual-spend-historical-hist-sw-1');
  assert.equal(records[0].source, 'manual_spending');
  assert.equal(records[0].storageKind, 'historical_memos');
  app.storeHistoricalMemos([historicalSoftware({ total: 36000 })]);
  records = budget.reconcileActualSpendSources();
  assert.equal(records.filter(record => record.id === 'actual-spend-historical-hist-sw-1').length, 1);
  assert.equal(records.find(record => record.id === 'actual-spend-historical-hist-sw-1').amount, 36000);
});

test('Historical soft delete removes canonical contribution on reconciliation', () => {
  resetStores();
  app.storeHistoricalMemos([historicalSoftware()]);
  budget.reconcileActualSpendSources();
  assert.equal(app.loadActualSpendRecords().length, 1);
  app.storeHistoricalMemos([{ ...historicalSoftware(), deleted: true, deletedAt: '2026-01-01T00:00:00Z' }]);
  budget.reconcileActualSpendSources();
  assert.equal(app.loadActualSpendRecords().filter(record => record.source === app.ACTUAL_SPEND_SOURCES.HISTORICAL_MEMO).length, 0);
});

test('Historical Software contributes to forecast components through canonical Actual Spend', () => {
  resetStores();
  app.storeHistoricalMemos([historicalSoftware()]);
  const records = budget.reconcileActualSpendSources();
  const components = app.forecastComponents(records, { spendType: app.SPEND_TYPES.SOFTWARE });
  assert.ok(components.length >= 1);
  assert.equal(components[0].source, app.ACTUAL_SPEND_SOURCES.HISTORICAL_MEMO);
  assert.equal(components[0].componentType, 'detailLine');
});

test('Historical Software derives licenses with non-colliding IDs', () => {
  resetStores();
  app.storeMemos([{
    memoNo: 'OLD-SW-001',
    type: 'sl',
    status: 'completed',
    project: 'AOA',
    createdAt: '2025-01-01T00:00:00Z',
    slItems: [{ name: 'Figma', plan: 'Pro', price: 1000, qty: 1, months: 12, startMonth: '2025-01', endMonth: '2025-12' }],
  }]);
  app.storeHistoricalMemos([historicalSoftware()]);
  const licenses = license.getAllLicenses().filter(item => item.name === 'Figma');
  assert.equal(licenses.length, 2);
  assert.equal(new Set(licenses.map(item => item.id)).size, 2);
  assert.ok(licenses.some(item => item.id.includes('historical-hist-sw-1')));
});

test('Historical spending auto maps through the existing Budget Pool rules', () => {
  resetStores();
  app.storeBudgetPoolRecords([budgetPool()]);
  app.storeHistoricalMemos([historicalSoftware()]);
  const [record] = budget.reconcileActualSpendSources();
  assert.equal(record.source, app.ACTUAL_SPEND_SOURCES.HISTORICAL_MEMO);
  assert.equal(record.storageKind, 'historical_memos');
  assert.equal(record.budgetStatus, app.BUDGET_STATUSES.MAPPED);
  assert.equal(record.autoBudgetPoolId, 'pool-aoa-sw');
  assert.equal(record.finalBudgetPoolId, 'pool-aoa-sw');
});

test('Historical spending with multiple matching pools needs PMO review and remains assignable', () => {
  resetStores();
  app.storeBudgetPoolRecords([
    budgetPool({ id: 'pool-aoa-sw-a', name: 'AOA Software A' }),
    budgetPool({ id: 'pool-aoa-sw-b', name: 'AOA Software B' }),
  ]);
  app.storeHistoricalMemos([historicalSoftware()]);
  const [record] = budget.reconcileActualSpendSources();
  assert.equal(record.budgetStatus, app.BUDGET_STATUSES.NEEDS_PMO_REVIEW);
  assert.match(budget.budgetAssignmentRowsTable([record]), /Assign/);
  assert.doesNotMatch(budget.budgetAssignmentRowsTable([record]), /View only/);
});

test('Historical spending Budget Tag save persists Manual Override and Clear Override', () => {
  resetStores();
  app.storeBudgetPoolRecords([
    budgetPool({ id: 'pool-aoa-sw-a', name: 'AOA Software A' }),
    budgetPool({ id: 'pool-aoa-sw-b', name: 'AOA Software B' }),
  ]);
  app.storeHistoricalMemos([historicalSoftware()]);
  budget.reconcileActualSpendSources();

  const originalQuerySelector = document.querySelector;
  document.querySelector = () => ({ value: 'pool-aoa-sw-b' });
  history.saveBudgetTag('historical:hist-sw-1');

  let memo = app.loadHistoricalMemos()[0];
  let record = app.loadActualSpendRecords().find(item => item.memoId === 'historical:hist-sw-1');
  assert.equal(memo.budgetPoolId, 'pool-aoa-sw-b');
  assert.equal(record.manualBudgetPoolId, 'pool-aoa-sw-b');
  assert.equal(record.budgetStatus, app.BUDGET_STATUSES.MANUAL_OVERRIDE);

  document.querySelector = () => ({ value: '__auto__' });
  history.saveBudgetTag('historical:hist-sw-1');

  memo = app.loadHistoricalMemos()[0];
  record = app.loadActualSpendRecords().find(item => item.memoId === 'historical:hist-sw-1');
  assert.equal(memo.budgetPoolId, null);
  assert.equal(record.manualBudgetPoolId, null);
  assert.equal(record.budgetStatus, app.BUDGET_STATUSES.NEEDS_PMO_REVIEW);
  document.querySelector = originalQuerySelector;
});
