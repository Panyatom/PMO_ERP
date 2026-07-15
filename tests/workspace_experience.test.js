const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  summarizeWorkspaceData,
  normalizeWorkspaceFilterState,
  kpisForRoles,
} = require('../views/workspace_experience.js');

test('workspace summary derives role action counts without mutating business data', () => {
  const data = {
    memos: [
      { status: 'pending-pmo' },
      { status: 'draft' },
      { status: 'approved', budgetSource: '' },
      { status: 'completed', finalBudgetPoolId: 'POOL-1' },
    ],
    devices: [
      { status: 'available', qaOwner: '', photoUrl: '', warranty: '2026-08-01' },
      { status: 'assigned', qaOwner: 'QA A', photoUrl: 'photo.jpg', warranty: '2027-01-01' },
    ],
    resources: [
      { status: 'pending' },
      { status: 'sourcing' },
      { status: 'document' },
      { status: 'filled' },
    ],
  };

  const summary = summarizeWorkspaceData(data, '2026-07-15T00:00:00Z');
  assert.equal(summary.pendingMemos, 1);
  assert.equal(summary.draftMemos, 1);
  assert.equal(summary.unbudgetedMemos, 1);
  assert.equal(summary.deviceInspection, 1);
  assert.equal(summary.availableDevices, 1);
  assert.equal(summary.assignedDevices, 1);
  assert.equal(summary.warrantyAttention, 1);
  assert.equal(summary.openResources, 3);
  assert.equal(summary.recruitingResources, 1);
  assert.equal(summary.onboardingResources, 1);
  assert.equal(summary.activePeople, 1);
});

test('saved filter state is normalized to safe serializable values', () => {
  assert.deepEqual(normalizeWorkspaceFilterState({
    q: { kind: 'value', value: 42 },
    status: { kind: 'multiple', value: ['open', 7] },
    mine: { kind: 'checkbox', value: 1 },
    invalid: null,
  }), {
    q: { kind: 'value', value: '42' },
    status: { kind: 'multiple', value: ['open', '7'] },
    mine: { kind: 'checkbox', value: true },
  });
});

test('QA and IT roles receive device-focused KPI sets', () => {
  const summary = summarizeWorkspaceData({ memos: [], devices: [], resources: [] }, '2026-07-15');
  assert.deepEqual(kpisForRoles(summary, ['device_qa']).map(item => item[3]), ['device', 'device', 'device', 'device']);
  assert.equal(kpisForRoles(summary, ['it_asset_admin'])[0][0], 'Available devices');
});

test('Action Center, saved views, and shared detail drawer contracts are wired', () => {
  const index = read('index.html');
  const app = read('app.js');
  const css = read('styles/components.css');

  assert.match(index, /id="view-home"/);
  assert.match(index, /workspace-home-nav/);
  assert.match(index, /views\/workspace_experience\.js\?v=0\.1\.0/);
  assert.match(app, /renderActionCenter\(\)/);
  assert.match(css, /\.pmo-workspace-page-head/);
  assert.match(css, /\.workspace-saved-tools/);
  assert.match(css, /\.pmo-detail-drawer-backdrop\s*>\s*div/);
});
