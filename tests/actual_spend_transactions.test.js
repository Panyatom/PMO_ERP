const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, budget } = loadViews();

function resetStores() {
  app.storeMemos([]);
  app.storeHistoricalMemos([]);
  app.storeActualSpendRecords([]);
  app.storeBudgetPoolRecords([]);
  budget.storeManualExpenses([]);
}

function registerElement(id, overrides = {}) {
  const el = {
    id,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    innerHTML: '',
    textContent: '',
    value: '',
    options: [],
    selectedOptions: [],
    closest() { return null; },
    addEventListener() {},
    removeAttribute() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    ...overrides,
  };
  global.document._register(id, el);
  return el;
}

function registerTransactionDom(overrides = {}) {
  registerElement('as-manual-content');
  registerElement('as-manual-project', { selectedOptions: (overrides.projects || []).map(value => ({ value })) });
  registerElement('as-manual-type', { selectedOptions: (overrides.types || []).map(value => ({ value })) });
  registerElement('as-manual-budget-status', { selectedOptions: (overrides.statuses || []).map(value => ({ value })) });
  registerElement('as-manual-frequency', { value: overrides.frequency || 'all' });
  registerElement('as-manual-from', { value: overrides.from || '' });
  registerElement('as-manual-to', { value: overrides.to || '' });
  registerElement('as-manual-source', { value: overrides.source || 'all' });
  registerElement('as-manual-search', { value: overrides.search || '' });
}

function approvedMemo(overrides = {}) {
  return {
    id: 'memo-approved-1',
    memoNo: 'MEMO-APP-001',
    type: 'sl',
    status: 'completed',
    project: 'AOA',
    subject: 'Approved Figma renewal',
    total: 12000,
    date: '2026-01-10',
    slItems: [{ name: 'Figma', plan: 'Pro', qty: 1, price: 1000, months: 12, startMonth: '2026-01', endMonth: '2026-12' }],
    ...overrides,
  };
}

function manualExpense(overrides = {}) {
  return {
    id: 'manual-1',
    referenceNo: 'MAN-001',
    project: 'TTB',
    expenseType: 'other',
    description: 'Manual hosting true-up',
    frequency: 'one_time',
    expenseDate: '2026-02-15',
    amount: 3000,
    vendorProgram: 'AWS',
    notes: 'Manual note',
    createdAt: '2026-02-15T00:00:00Z',
    updatedAt: '2026-02-16T00:00:00Z',
    ...overrides,
  };
}

function historicalSoftware(overrides = {}) {
  return app.normalizeHistoricalMemo({
    id: 'hist-sw-1',
    memoNo: 'HIST-SW-001',
    type: 'sl',
    project: 'AOA',
    subject: 'Historical software renewal',
    date: '2025-01-15',
    total: 24000,
    slItems: [{ name: 'Figma', plan: 'Pro', price: 1000, qty: 2, months: 12, startMonth: '2025-01', endMonth: '2025-12' }],
    ...overrides,
  });
}

function seedCanonicalTransactions() {
  resetStores();
  app.storeMemos([
    approvedMemo(),
    approvedMemo({ id: 'memo-pending-1', memoNo: 'MEMO-PEND-001', status: 'pending', total: 999 }),
    approvedMemo({ id: 'memo-rejected-1', memoNo: 'MEMO-REJ-001', status: 'rejected', total: 888 }),
  ]);
  budget.storeManualExpenses([
    manualExpense(),
    manualExpense({ id: 'manual-monthly', referenceNo: 'MAN-MONTH', project: 'AOA', expenseType: 'infra', description: '', frequency: 'monthly', expenseDate: null, startMonth: '2026-03', endMonth: '2026-04', amount: 500, vendorProgram: 'Cloud cover' }),
    manualExpense({ id: 'manual-voided', referenceNo: 'MAN-VOID', voidedAt: '2026-03-01T00:00:00Z' }),
  ]);
  return budget.reconcileActualSpendSources();
}

test('Transactions combined list includes approved memo and active manual records only', () => {
  const records = seedCanonicalTransactions();
  const refs = records.map(record => record.referenceNo).sort();
  assert.deepEqual(refs, ['MAN-001', 'MAN-MONTH', 'MEMO-APP-001']);
  assert.equal(records.filter(record => record.referenceNo === 'MEMO-APP-001').length, 1);
  assert.ok(!refs.includes('MEMO-PEND-001'));
  assert.ok(!refs.includes('MEMO-REJ-001'));
  assert.ok(!refs.includes('MAN-VOID'));
});

test('Transactions normalization preserves memo and manual fields, ranges, source, and missing optional data', () => {
  const records = seedCanonicalTransactions();
  const memoTxn = budget.actualSpendTransactionFromRecord(records.find(record => record.referenceNo === 'MEMO-APP-001'));
  assert.equal(memoTxn.source, 'memo');
  assert.equal(memoTxn.sourceId, 'MEMO-APP-001');
  assert.equal(memoTxn.project, 'AOA');
  assert.equal(memoTxn.spendType, app.SPEND_TYPES.SOFTWARE);
  assert.equal(memoTxn.dateFrom, '2026-01');
  assert.equal(memoTxn.dateTo, '2026-12');

  const manualTxn = budget.actualSpendTransactionFromRecord(records.find(record => record.referenceNo === 'MAN-MONTH'));
  assert.equal(manualTxn.source, 'manual_spending');
  assert.equal(manualTxn.description, 'Manual note');
  assert.equal(manualTxn.dateFrom, '2026-03');
  assert.equal(manualTxn.dateTo, '2026-04');
  assert.equal(budget.actualSpendTransactionDateLabel(manualTxn), '2026-03 → 2026-04');
});

test('Transactions filters and search work across source, project, spend type, budget status, date range, and text', () => {
  const records = seedCanonicalTransactions();
  registerTransactionDom({ source: 'memo', search: 'figma', projects: ['AOA'], types: [app.SPEND_TYPES.SOFTWARE], statuses: [app.BUDGET_STATUSES.UNBUDGETED], from: '2026-01', to: '2026-12' });
  assert.deepEqual(budget.filteredActualSpendTransactions(records).map(row => row.referenceNo), ['MEMO-APP-001']);

  registerTransactionDom({ source: 'manual_spending', search: 'aws', projects: ['TTB'], types: [app.SPEND_TYPES.OTHERS], from: '2026-02', to: '2026-02' });
  assert.deepEqual(budget.filteredActualSpendTransactions(records).map(row => row.referenceNo), ['MAN-001']);

  registerTransactionDom({ source: 'manual_spending', frequency: 'monthly', search: 'cloud cover', from: '2026-04', to: '2026-04' });
  assert.deepEqual(budget.filteredActualSpendTransactions(records).map(row => row.referenceNo), ['MAN-MONTH']);
});

test('Transactions table renders View Detail only for memo, editable manual, and historical/imported rows', () => {
  const records = seedCanonicalTransactions();
  app.storeHistoricalMemos([historicalSoftware()]);
  budget.reconcileActualSpendSources();
  const memoTxn = budget.actualSpendTransactionFromRecord(records.find(record => record.referenceNo === 'MEMO-APP-001'));
  const manualTxn = budget.actualSpendTransactionFromRecord(records.find(record => record.referenceNo === 'MAN-001'));
  assert.equal(budget.canEditActualSpendTransaction(memoTxn), false);
  assert.equal(budget.canEditActualSpendTransaction(manualTxn), true);

  global.isPMO = () => true;
  global.initMultiSelect = () => {};
  global.refreshMultiSelectUI = () => {};
  registerTransactionDom();
  budget.renderManualEntries();
  const html = global.document.getElementById('as-manual-content').innerHTML;
  assert.match(html, /showActualSpendTransactionDetail\('actual-spend-memo-MEMO-APP-001'\)/);
  assert.match(html, /showActualSpendTransactionDetail\('actual-spend-manual-manual-1'\)/);
  assert.match(html, /showActualSpendTransactionDetail\('actual-spend-historical-hist-sw-1'\)/);
  assert.doesNotMatch(html, /openManualExpenseModal\('/);
  assert.doesNotMatch(html, /voidManualExpense\('/);
  const memoRow = html.slice(html.indexOf('MEMO-APP-001'), html.indexOf('</tr>', html.indexOf('MEMO-APP-001')));
  assert.doesNotMatch(memoRow, /openManualExpenseModal|voidManualExpense/);
});

test('Transactions detail exposes edit/delete only for editable manual expense records', () => {
  const records = seedCanonicalTransactions();
  app.storeHistoricalMemos([historicalSoftware()]);
  const allRecords = budget.reconcileActualSpendSources();
  global.isPMO = () => true;

  budget.showCanonicalTransactionDetail(allRecords.find(record => record.referenceNo === 'MAN-001'));
  let panel = global.document.body.children[global.document.body.children.length - 1];
  assert.match(panel.innerHTML, /openManualExpenseModal\('manual-1'\)/);
  assert.match(panel.innerHTML, /voidManualExpense\('manual-1'\)/);

  budget.showCanonicalTransactionDetail(allRecords.find(record => record.referenceNo === 'MEMO-APP-001'));
  panel = global.document.body.children[global.document.body.children.length - 1];
  assert.doesNotMatch(panel.innerHTML, /openManualExpenseModal|voidManualExpense/);

  budget.showCanonicalTransactionDetail(allRecords.find(record => record.referenceNo === 'HIST-SW-001'));
  panel = global.document.body.children[global.document.body.children.length - 1];
  assert.doesNotMatch(panel.innerHTML, /openManualExpenseModal|voidManualExpense/);

  assert.equal(records.some(record => record.referenceNo === 'MAN-001'), true);
});

test('Transactions export includes both sources, source column, and filtered totals reconcile with Report filters', async () => {
  const records = seedCanonicalTransactions();
  registerTransactionDom({ source: 'all' });
  let exported;
  global._downloadCSV = (filename, headers, rows) => { exported = { filename, headers, rows }; };
  global.alert = message => { throw new Error(message); };
  await budget.exportActualSpendTransactionsCSV();
  assert.equal(exported.filename, 'Actual_Spend_Transactions');
  assert.ok(exported.headers.includes('Source'));
  assert.deepEqual(exported.rows.map(row => row[0]).sort(), ['MAN-001', 'MAN-MONTH', 'MEMO-APP-001']);
  assert.deepEqual([...new Set(exported.rows.map(row => row[6]))].sort(), ['Manual Spending', 'Memo']);

  const transactionTotal = budget.filteredActualSpendTransactions(records).reduce((sum, row) => sum + row.amount, 0);
  registerElement('as-from', { value: '' });
  registerElement('as-to', { value: '' });
  registerElement('as-project', { selectedOptions: [] });
  registerElement('as-type', { selectedOptions: [] });
  registerElement('as-source', { value: 'all' });
  registerElement('as-budget-status', { selectedOptions: [] });
  registerElement('as-year', { value: '' });
  const reportTotal = budget.filteredActualSpendRecords(records).reduce((sum, row) => sum + row.amount, 0);
  assert.equal(transactionTotal, reportTotal);
});
