const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app } = loadViews();
const license = require('../views/license.js');

function licenseRow(id, project, name, plan, seats) {
  return {
    id,
    project,
    name,
    plan,
    seats,
    purchaseDate: '2026-01-01',
    expiry: '2027-01-01T00:00:00.000Z',
    source: 'manual',
  };
}

function resetFixture() {
  app.storeMemos([]);
  app.storeHistoricalMemos([]);
  license.storeManualLicenses([
    licenseRow('lic-aoa-figma-pro', 'AOA', 'Figma', 'Pro', 2),
    licenseRow('lic-geo9-figma-pro', 'Geo9', 'Figma', 'Pro', 1),
    licenseRow('lic-aoa-figma-enterprise', 'AOA', 'Figma', 'Enterprise', 1),
    licenseRow('lic-aoa-jira-standard', 'AOA', 'Jira', 'Standard', 2),
  ]);
  license._saveLicUserManualRows([
    { email: 'u1@example.com', project: 'AOA', memoNo: 'Manual Import', licenses: {} },
    { email: 'u2@example.com', project: 'AOA', memoNo: 'Manual Import', licenses: {} },
    { email: 'u3@example.com', project: 'AOA', memoNo: 'Manual Import', licenses: {} },
    { email: 'u4@example.com', project: 'Geo9', memoNo: 'Manual Import', licenses: {} },
    { email: 'u5@example.com', project: 'AOA', memoNo: 'Manual Import', licenses: {} },
  ]);
  license._saveLicUserOverrides({
    'u1@example.com|AOA|Figma — Pro': { active: true, licenseId: 'lic-aoa-figma-pro' },
    'u2@example.com|AOA|Figma — Pro': { active: true, licenseId: 'lic-aoa-figma-pro' },
    'u3@example.com|AOA|Figma — Pro': { active: true, licenseId: 'lic-aoa-figma-pro' },
    'u4@example.com|Geo9|Figma — Pro': { active: true, licenseId: 'lic-geo9-figma-pro' },
    'u5@example.com|AOA|Jira': { active: true, licenseId: 'lic-aoa-jira-standard' },
  });
  license._bpResetSummaryFilters();
  global.window._licReconRows = [];
}

function currentRows() {
  const rows = license.computeLicReconciliation(
    app.loadMemos(),
    {},
    JSON.parse(localStorage.getItem('orbit-lic-user-overrides-v1') || '{}'),
    JSON.parse(localStorage.getItem('orbit-lic-user-manual-rows-v1') || '[]'),
    license._bpGetFiltered(),
  );
  return license._bpReconApplyFilters(rows);
}

function rowKey(row) {
  return `${row.project}|${row.name}|${row.plan}`;
}

function registerSummaryDom() {
  const content = document.createElement('div');
  const wrap = document.createElement('div');
  document._register('lic-content', content);
  document._register('lic-recon-wrap', wrap);
  return { content, wrap };
}

test('License Summary renders one consolidated table for all projects', () => {
  resetFixture();
  const { content, wrap } = registerSummaryDom();

  license._renderLicByProject();

  assert.doesNotMatch(content.innerHTML, /data-subtab="summary"|data-subtab="reconciliation"/);
  assert.doesNotMatch(content.innerHTML, /Export Reconciliation|Export Summary/);
  assert.match(content.innerHTML, /Export License Summary/);
  assert.match(wrap.innerHTML, /<th style="padding-left:14px">Project<\/th>/);
  assert.match(wrap.innerHTML, /Purchased Seats/);
  assert.match(wrap.innerHTML, /Assigned Users/);
  assert.match(wrap.innerHTML, /Remaining Seats/);

  const rows = currentRows();
  assert.deepEqual(rows.map(rowKey), [
    'AOA|Figma|Enterprise',
    'AOA|Figma|Pro',
    'AOA|Jira|Standard',
    'Geo9|Figma|Pro',
  ]);
});

test('License Summary filters by one project', () => {
  resetFixture();
  license._bpSetFilterProjects(['AOA']);

  assert.deepEqual(currentRows().map(rowKey), [
    'AOA|Figma|Enterprise',
    'AOA|Figma|Pro',
    'AOA|Jira|Standard',
  ]);
});

test('License Summary filters one software product across projects', () => {
  resetFixture();
  license._bpSetFilterSoftware(['Figma']);

  assert.deepEqual(currentRows().map(rowKey), [
    'AOA|Figma|Enterprise',
    'AOA|Figma|Pro',
    'Geo9|Figma|Pro',
  ]);
});

test('License Summary combines project, software, and plan filters', () => {
  resetFixture();
  license._bpSetFilterProjects(['AOA']);
  license._bpSetFilterSoftware(['Figma']);
  license._bpSetFilterPlan('Pro');

  assert.deepEqual(currentRows().map(rowKey), ['AOA|Figma|Pro']);
});

test('License Summary uses purchased, assigned, and remaining reconciliation math', () => {
  resetFixture();
  const rows = currentRows();
  const aoaFigma = rows.find(row => rowKey(row) === 'AOA|Figma|Pro');
  const aoaJira = rows.find(row => rowKey(row) === 'AOA|Jira|Standard');

  assert.deepEqual(
    { purchased: aoaFigma.purchased, assigned: aoaFigma.assignedCount, remaining: aoaFigma.remaining },
    { purchased: 2, assigned: 3, remaining: -1 },
  );
  assert.deepEqual(
    { purchased: aoaJira.purchased, assigned: aoaJira.assignedCount, remaining: aoaJira.remaining },
    { purchased: 2, assigned: 1, remaining: 1 },
  );
});

test('License Summary keeps negative remaining seats visible for over-assigned rows', () => {
  resetFixture();
  license._bpSetReconOverOnly(true);

  assert.deepEqual(currentRows().map(rowKey), ['AOA|Figma|Pro']);
  assert.equal(currentRows()[0].remaining, -1);
});

test('License Summary Has Remaining only filter keeps positive remaining rows', () => {
  resetFixture();
  license._bpSetReconRemainingOnly(true);

  assert.deepEqual(currentRows().map(rowKey), [
    'AOA|Figma|Enterprise',
    'AOA|Jira|Standard',
  ]);
});

test('License Summary assigned-user drill-down opens from consolidated table rows', () => {
  resetFixture();
  registerSummaryDom();
  license._renderLicReconciliation();
  const idx = window._licReconRows.findIndex(row => rowKey(row) === 'AOA|Figma|Pro');

  const modal = document.createElement('div');
  const name = document.createElement('div');
  const purchased = document.createElement('div');
  const assigned = document.createElement('div');
  const remaining = document.createElement('div');
  const body = document.createElement('div');
  const viewUsers = document.createElement('button');
  document._register('lic-recon-detail', modal);
  document._register('lic-recon-detail-name', name);
  document._register('lic-recon-detail-purchased', purchased);
  document._register('lic-recon-detail-assigned', assigned);
  document._register('lic-recon-detail-remaining', remaining);
  document._register('lic-recon-detail-body', body);
  document._register('lic-recon-view-in-users', viewUsers);

  license._openLicReconDetail(idx);

  assert.equal(modal.style.display, 'flex');
  assert.equal(name.textContent, 'Figma — Pro · AOA');
  assert.equal(purchased.textContent, 2);
  assert.equal(assigned.textContent, 3);
  assert.equal(remaining.textContent, -1);
  assert.match(body.innerHTML, /u1@example\.com/);
  assert.equal(viewUsers.style.display, '');
});

test('License Summary export uses filtered six-column consolidated rows', () => {
  resetFixture();
  let captured;
  global._downloadCSV = (filename, headers, rows) => { captured = { filename, headers, rows }; };
  license._bpSetFilterProjects(['AOA']);
  license._bpSetFilterSoftware(['Figma']);
  license._bpSetFilterPlan('Pro');

  license.exportLicSummaryCSV();

  assert.equal(captured.filename, 'License_Summary');
  assert.deepEqual(captured.headers, ['Project', 'Software', 'Plan', 'Purchased Seats', 'Assigned Users', 'Remaining Seats']);
  assert.deepEqual(captured.rows, [['AOA', 'Figma', 'Pro', 2, 3, -1]]);
});

test('License Summary no longer renders Summary/Reconciliation subview controls', () => {
  resetFixture();
  const { content } = registerSummaryDom();

  license._renderLicByProject();

  assert.doesNotMatch(content.innerHTML, /_switchLicSummarySubTab|data-subtab/);
  assert.doesNotMatch(content.innerHTML, />Summary<\/button>|>Reconciliation<\/button>/);
});
