// Forecast Drill-down P0 — spend-type-aware detail rendering.
//
// Covers spec items 5 & 6: Memo transactions must use the real, spend-type
// specific renderer (history.js's _buildMemoTypeSection, via
// renderMemoSpendTypeDetail) rather than one generic table; Manual Spending
// transactions must use spend-type-aware fields/labels (manualEntryDetailFields)
// sourced only from data Manual Spending actually captures, with missing values
// shown as "-" and Source always "Manual Spending".
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, budget } = loadViews();
const { SPEND_TYPES, ACTUAL_SPEND_SOURCES } = app;

// ── Memo spend-type detail rendering (real history.js renderer) ──

test('Memo Software (sl) detail renders the Software line-item table, not the generic fallback', () => {
  const memo = {
    memoNo: 'MEMO-SL', type: 'sl', status: 'completed', project: 'AOA', total: 12000, subject: 'Software',
    slItems: [{ name: 'Figma', plan: 'Org', price: 1000, months: 12, qty: 1, startMonth: '2026-01', endMonth: '2026-12' }],
  };
  app.storeMemos([memo]);
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.ok(html.includes('รายการ Software'));
  assert.ok(html.includes('Figma'));
  assert.ok(!html.includes('Program / Vendor'), 'should not fall back to the generic Memo detail table');
});

test('Memo Hardware (hw) detail renders the Hardware line-item table', () => {
  const memo = {
    memoNo: 'MEMO-HW', type: 'hw', status: 'completed', project: 'AOA', total: 80000, subject: 'Laptops', date: '2026-02-01',
    hwItems: [{ name: 'Dell Laptop', price: 40000, qty: 2 }],
  };
  app.storeMemos([memo]);
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.ok(html.includes('รายการ Hardware'));
  assert.ok(html.includes('Dell Laptop'));
});

test('Memo Team Activity (int) detail renders activity-specific fields', () => {
  const memo = {
    memoNo: 'MEMO-INT', type: 'int', status: 'completed', project: 'AOA', total: 15000, subject: 'Team outing',
    intActivity: 'Year-end party', intDate: '2026-03-01', intHeadcount: 30, intPP: 500,
  };
  app.storeMemos([memo]);
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.ok(html.includes('Team Activity'));
  assert.ok(html.includes('Year-end party'));
});

test('Memo Client Expense (ent) detail renders client-entertainment-specific fields', () => {
  const memo = {
    memoNo: 'MEMO-ENT', type: 'ent', status: 'completed', project: 'AOA', total: 9000, subject: 'Client dinner',
    entClient: 'Acme Corp', entDate: '2026-04-01', entPlace: 'Bangkok', entPeople: 6,
  };
  app.storeMemos([memo]);
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.ok(html.includes('รายละเอียดงานรับรอง'));
  assert.ok(html.includes('Acme Corp'));
});

// ── Manual Spending spend-type detail rendering ──

function manualRecord(spendType, overrides = {}) {
  return {
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    spendType,
    amount: 1000,
    startDate: '2026-01',
    endDate: '2026-01',
    description: 'Manual entry description',
    ...overrides,
  };
}

test('Manual Spending Software fields are spend-type aware and labeled for Software', () => {
  const fields = budget.manualEntryDetailFields(manualRecord(SPEND_TYPES.SOFTWARE, { vendorProgram: 'Adobe' }));
  const labels = fields.map(([label]) => label);
  assert.deepEqual(labels, ['Software / Description', 'Expense Date', 'Amount', 'Vendor / Program', 'Frequency', 'Coverage', 'Notes']);
});

test('Manual Spending Team Activity fields are spend-type aware and labeled for Team Activity', () => {
  const fields = budget.manualEntryDetailFields(manualRecord(SPEND_TYPES.TEAM_ACTIVITY));
  const labels = fields.map(([label]) => label);
  assert.deepEqual(labels, ['Activity / Description', 'Activity Date / Expense Date', 'Amount', 'Vendor / Program', 'Notes']);
});

test('Manual Spending Client Expense fields are spend-type aware and labeled for Client Expense', () => {
  const fields = budget.manualEntryDetailFields(manualRecord(SPEND_TYPES.CLIENT_EXPENSE));
  const labels = fields.map(([label]) => label);
  assert.deepEqual(labels, ['Expense Description', 'Expense Date', 'Amount', 'Vendor / Program', 'Notes']);
});

test('Manual Spending Hardware fields are spend-type aware and labeled for Hardware', () => {
  const fields = budget.manualEntryDetailFields(manualRecord(SPEND_TYPES.HARDWARE));
  const labels = fields.map(([label]) => label);
  assert.deepEqual(labels, ['Item / Description', 'Purchase Date / Expense Date', 'Amount', 'Vendor', 'Notes']);
});

test('Manual Spending Infra fields use an Infra-specific description label, not a Memo-only field', () => {
  const fields = budget.manualEntryDetailFields(manualRecord(SPEND_TYPES.INFRA));
  const labels = fields.map(([label]) => label);
  assert.deepEqual(labels, ['Infra Description', 'Expense Date', 'Amount', 'Vendor / Program', 'Coverage', 'Notes']);
  // Memo-only concepts (Program/Plan detail lines) must not be manufactured for Manual Spending.
  assert.ok(!labels.some(l => /program|plan/i.test(l) && l !== 'Vendor / Program'));
});

test('Manual Spending detail shows "-" for relevant missing values instead of hiding the field', () => {
  const record = { source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE, spendType: SPEND_TYPES.HARDWARE, amount: 0, startDate: '', endDate: '' };
  const fields = budget.manualEntryDetailFields(record);
  const vendorField = fields.find(([label]) => label === 'Vendor');
  const notesField = fields.find(([label]) => label === 'Notes');
  assert.equal(budget.canonicalDetailValue(vendorField[1]), '-');
  assert.equal(budget.canonicalDetailValue(notesField[1]), '-');
  // The section itself still renders (fields present), it just shows "-" per value.
  const html = budget.renderManualEntrySpendTypeDetail(record);
  assert.ok(html.includes('-'));
  assert.ok(html.includes('Hardware Detail'));
});

test('Manual Spending canonical routing always shows Source as "Manual Spending", never the Memo label', () => {
  for (const spendType of [SPEND_TYPES.SOFTWARE, SPEND_TYPES.TEAM_ACTIVITY, SPEND_TYPES.CLIENT_EXPENSE, SPEND_TYPES.HARDWARE, SPEND_TYPES.INFRA]) {
    const record = manualRecord(spendType);
    assert.equal(budget.canonicalActualSpendSourceLabel(record.source), 'Manual Spending');
  }
});

function renderedCanonicalPanel(record) {
  budget.showCanonicalTransactionDetail(record, { title: 'Transaction Detail' });
  return global.document.body.children[global.document.body.children.length - 1].innerHTML;
}

test('Client Expense memo summary shows Event Date and Memo Request Date, without duplicating Customer/Venue from the detail section', () => {
  const memo = {
    memoNo: 'MEMO-ENT-SUMMARY', type: 'ent', status: 'completed', project: 'AOA', total: 9000, subject: 'Client dinner', date: '2026-03-20',
    entClient: 'Acme Corp', entDate: '2026-04-01', entPlace: 'Bangkok', entPeople: 6,
  };
  app.storeMemos([memo]);
  const html = renderedCanonicalPanel(budget.canonicalTransactionRecordFromMemo(memo));
  assert.ok(html.includes('Event Date'));
  assert.ok(html.includes('2026-04-01'));
  assert.ok(html.includes('Memo Request Date'));
  assert.ok(html.includes('2026-03-20'));
  assert.ok(!html.includes('Customer'), 'Customer is now shown only in the spend-type detail section, not the summary');
  assert.ok(!html.includes('Venue'), 'Venue is now shown only in the spend-type detail section, not the summary');
  assert.ok(html.includes('Acme Corp'), 'Customer value should still appear inside the spend-type detail section');
  assert.ok(html.includes('Bangkok'), 'Venue value should still appear inside the spend-type detail section');
  assert.ok(!html.includes('Coverage Start'));
  assert.ok(!html.includes('Coverage End'));
});

test('Team Activity memo summary shows Activity Date and Memo Request Date, without duplicating Activity Name/Headcount from the detail section', () => {
  const memo = {
    memoNo: 'MEMO-INT-SUMMARY', type: 'int', status: 'completed', project: 'AOA', total: 15000, subject: 'Team outing', date: '2026-02-15',
    intActivity: 'Year-end party', intDate: '2026-03-01', intHeadcount: 30, intPP: 500,
  };
  app.storeMemos([memo]);
  const html = renderedCanonicalPanel(budget.canonicalTransactionRecordFromMemo(memo));
  assert.ok(html.includes('Activity Date'));
  assert.ok(html.includes('2026-03-01'));
  assert.ok(html.includes('Memo Request Date'));
  assert.ok(html.includes('2026-02-15'));
  assert.ok(!html.includes('Activity Name'), 'Activity Name is now shown only in the spend-type detail section, not the summary');
  assert.ok(!html.includes('Headcount'), 'Headcount is now shown only in the spend-type detail section, not the summary');
  assert.ok(html.includes('Year-end party'), 'Activity name value should still appear inside the spend-type detail section');
  assert.ok(!html.includes('Coverage Start'));
  assert.ok(!html.includes('Coverage End'));
});

test('Hardware memo summary shows Purchase Date and Memo Request Date, and does not display meaningless empty Coverage fields', () => {
  const memo = {
    memoNo: 'MEMO-HW-SUMMARY', type: 'hw', status: 'completed', project: 'AOA', total: 80000, subject: 'Laptops', date: '2026-01-10',
    hwItems: [{ name: 'Dell Laptop', price: 40000, qty: 2 }],
  };
  app.storeMemos([memo]);
  const html = renderedCanonicalPanel(budget.canonicalTransactionRecordFromMemo(memo));
  assert.ok(html.includes('รายการ Hardware'));
  assert.ok(html.includes('Dell Laptop'));
  assert.ok(html.includes('Purchase Date'));
  assert.ok(html.includes('Memo Request Date'));
  assert.ok(html.includes('2026-01-10'));
  assert.ok(!html.includes('Coverage Start'));
  assert.ok(!html.includes('Coverage End'));
});

test('Deployment memo summary shows Deployment Start/End and Memo Request Date, without duplicating Deployment Location/Headcount from the detail section', () => {
  const memo = {
    memoNo: 'MEMO-DEP-SUMMARY', type: 'dep', status: 'completed', project: 'AOA', total: 12000, subject: 'Deployment', date: '2026-04-20',
    depStart: '2026-05-01', depEnd: '2026-05-03', depLocation: 'Bangkok HQ', depEmpCount: 4,
  };
  app.storeMemos([memo]);
  const html = renderedCanonicalPanel(budget.canonicalTransactionRecordFromMemo(memo));
  assert.ok(html.includes('Deployment Start'));
  assert.ok(html.includes('2026-05-01'));
  assert.ok(html.includes('Deployment End'));
  assert.ok(html.includes('2026-05-03'));
  assert.ok(html.includes('Memo Request Date'));
  assert.ok(html.includes('2026-04-20'));
  assert.ok(!html.includes('Deployment Location'), 'Deployment Location is now shown only in the spend-type detail section, not the summary');
  assert.ok(!html.includes('Headcount'), 'Headcount is now shown only in the spend-type detail section, not the summary');
  assert.ok(html.includes('Bangkok HQ'), 'Deployment location value should still appear inside the spend-type detail section');
  assert.ok(!html.includes('Coverage Start'));
  assert.ok(!html.includes('Coverage End'));
});

test('Manual Spending / Infra Cost records never show a Memo Request Date (no memo backs them)', () => {
  for (const spendType of [SPEND_TYPES.SOFTWARE, SPEND_TYPES.TEAM_ACTIVITY, SPEND_TYPES.CLIENT_EXPENSE, SPEND_TYPES.HARDWARE, SPEND_TYPES.INFRA]) {
    const html = renderedCanonicalPanel(manualRecord(spendType));
    assert.ok(!html.includes('Memo Request Date'));
  }
});
