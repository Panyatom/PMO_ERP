const test = require('node:test');
const assert = require('node:assert/strict');

const access = require('../access_control.js');

test('[PMO-RBAC-001] Legacy roles migrate to canonical functional roles', () => {
  assert.deepEqual(access.normalizeRoleKeys(['user', 'pmo', 'bbik']), ['employee', 'pmo_admin', 'recruiter']);
  assert.equal(access.legacyRoleFor('pmo_admin'), 'pmo');
  assert.equal(access.legacyRoleFor('recruiter'), 'bbik');
});

test('[PMO-RBAC-002] Multiple roles receive the union of visible pages', () => {
  const roles = ['approval_authority', 'finance_budget'];

  assert.equal(access.canViewPage(roles, 'pending'), true);
  assert.equal(access.canViewPage(roles, 'budget'), true);
  assert.equal(access.canViewPage(roles, 'device'), false);
});

test('[PMO-RBAC-003] Device QA can inspect and export but cannot administer device master data', () => {
  assert.equal(access.canViewPage(['device_qa'], 'device'), true);
  assert.equal(access.can(['device_qa'], 'device.inspect'), true);
  assert.equal(access.can(['device_qa'], 'device.export'), true);
  assert.equal(access.can(['device_qa'], 'device.manage'), false);
});

test('[PMO-RBAC-004] IT Asset Admin and PMO Admin can manage devices', () => {
  assert.equal(access.can(['it_asset_admin'], 'device.manage'), true);
  assert.equal(access.can(['pmo_admin'], 'device.manage'), true);
  assert.equal(access.canViewPage(['it_asset_admin'], 'settings'), false);
  assert.equal(access.canViewPage(['pmo_admin'], 'settings'), true);
});

test('[PMO-RBAC-005] Settings page matrix overrides role defaults and still unions multiple roles', () => {
  const settings = {
    access: {
      rolePages: {
        employee: ['history'],
        finance_budget: ['cost'],
      },
    },
  };

  assert.equal(access.canViewPage(['employee'], 'create', settings), false);
  assert.equal(access.canViewPage(['employee', 'finance_budget'], 'history', settings), true);
  assert.equal(access.canViewPage(['employee', 'finance_budget'], 'cost', settings), true);
  assert.equal(access.canViewPage(['employee', 'finance_budget'], 'budget', settings), false);
});

test('[PMO-RBAC-006] Active member roles take precedence over a legacy session role', () => {
  const roles = access.effectiveRoleKeys(
    { role: 'pmo', roles: ['pmo_admin'] },
    { active: true, roles: ['device_qa', 'approval_authority'] },
  );

  assert.deepEqual(roles, ['device_qa', 'approval_authority']);
});

test('[PMO-RBAC-007] Functional roles map to least-privilege Resource profiles', () => {
  assert.equal(access.primaryResourceRole(['employee', 'hr_operations']), 'hr_operations');
  assert.deepEqual(access.resourceProfileForRole('device_qa').tabs, ['request']);
  assert.deepEqual(access.resourceProfileForRole('auditor').permissions, {});
  assert.equal(access.resourceProfileForRole('recruiter').scope, 'bbik-pipeline');
});
