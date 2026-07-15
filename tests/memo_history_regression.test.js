// Forecast Drill-down P0 — Memo History regression (spec item 10).
//
// The canonical transaction-detail routing added for Budget/License/Device
// must not have changed the *workflow* view. Memo History's own entry point
// (_buildMemoDetailContent with mode 'full', used by openHistoryDetail) must
// still retain approval information, timeline, and audit/workflow sections.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { budget, history } = loadViews();

function fullMemo(overrides = {}) {
  return {
    memoNo: 'MEMO-HIST-1',
    type: 'sl',
    status: 'completed',
    project: 'AOA',
    total: 5000,
    subject: 'Software renewal',
    requesterName: 'J. Doe',
    createdAt: '2026-01-01T00:00:00Z',
    approvedAt: '2026-01-05T00:00:00Z',
    approvers: [{ name: 'A. Reviewer', title: 'Manager', status: 'approved' }],
    auditLog: [{ actor: 'A. Reviewer', action: 'Approved', timestamp: '2026-01-05T00:00:00Z' }],
    slItems: [{ name: 'Figma', plan: 'Org', price: 1000, months: 12, qty: 1, startMonth: '2026-01', endMonth: '2026-12' }],
    ...overrides,
  };
}

test('Memo History full detail retains the Approval Timeline section', () => {
  const html = history._buildMemoDetailContent(fullMemo(), 'full');
  assert.ok(html.includes('Approval Timeline'));
});

test('Memo History full detail retains the Audit Log section', () => {
  const html = history._buildMemoDetailContent(fullMemo(), 'full');
  assert.ok(html.includes('Audit Log'));
  assert.ok(html.includes('Approved')); // the seeded audit entry's action text
});

test('Memo History full detail retains the approvers timeline (ผู้อนุมัติ)', () => {
  const html = history._buildMemoDetailContent(fullMemo(), 'full');
  assert.ok(html.includes('ผู้อนุมัติ'));
  assert.ok(html.includes('A. Reviewer'));
});

test('The same memo, viewed through the canonical transaction detail, excludes all of the above', () => {
  const memo = fullMemo();
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.ok(!html.includes('Approval Timeline'));
  assert.ok(!html.includes('Audit Log'));
  assert.ok(!html.includes('ผู้อนุมัติ'));
});
