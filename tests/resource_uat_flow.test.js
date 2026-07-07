const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../views/resource_flow.js');

const roles = flow.createDefaultResourceRoles();

test('[PMO-RES-005] PMO routes direct hiring pending request to Pending Docs only', () => {
  const next = flow.allowedNextForRecord(
    { status: 'pending', hiringType: 'Direct Head Count (Permanent)' },
    'pmo',
    roles,
    { allStatuses: Object.keys(flow.DEFAULT_STATUS_FLOW) }
  );
  assert(next.includes('pendingDocs'));
  assert(!next.includes('approved'));
});

test('[PMO-RES-006] PMO routes sub-contract pending request to Approved only', () => {
  const next = flow.allowedNextForRecord(
    { status: 'pending', hiringType: 'Sub-contract' },
    'pmo',
    roles,
    { allStatuses: Object.keys(flow.DEFAULT_STATUS_FLOW) }
  );
  assert(next.includes('approved'));
  assert(!next.includes('pendingDocs'));
});

test('[PMO-RES-007] BBIK can advance approved request to sourcing', () => {
  assert.deepEqual(flow.allowedNext('approved', 'bbik', roles), ['sourcing']);
});

test('[PMO-RES-008] non-PMO roles cannot approve pending request', () => {
  assert(!flow.allowedNextForRecord({ status: 'pending', hiringType: 'Sub-contract' }, 'user', roles).includes('approved'));
  assert(!flow.allowedNextForRecord({ status: 'pending', hiringType: 'Sub-contract' }, 'bbik', roles).includes('approved'));
});

test('[PMO-RES-009] BBIK recruiting transition path fills from offer', () => {
  assert.deepEqual(flow.allowedNext('sourcing', 'bbik', roles), ['interviewing']);
  assert.deepEqual(flow.allowedNext('interviewing', 'bbik', roles), ['offer']);
  assert.deepEqual(flow.allowedNext('offer', 'bbik', roles).sort(), ['filled', 'interviewing', 'sourcing'].sort());
  assert(!flow.allowedNext('document', 'bbik', roles).includes('filled'));
});

test('[PMO-RES-012] PMO can fill document-stage request', () => {
  assert.deepEqual(flow.allowedNext('document', 'pmo', roles), ['filled']);
});

test('[PMO-RES-016] role tab visibility follows role scope', () => {
  assert(!flow.canViewTab(roles, 'pmo', 'dashboard'));
  assert(!flow.canViewTab(roles, 'bbik', 'dashboard'));
  assert(!flow.canViewTab(roles, 'user', 'dashboard'));
  assert(flow.canViewTab(roles, 'pmo', 'people'));
  assert(flow.canViewTab(roles, 'pmo', 'timeline'));
  assert(!flow.canViewTab(roles, 'bbik', 'people'));
  assert(!flow.canViewTab(roles, 'user', 'timeline'));
});

test('[PMO-RES-017] transfer permission is PMO only', () => {
  assert(flow.hasPermission(roles, 'pmo', 'transfer'));
  assert(!flow.hasPermission(roles, 'user', 'transfer'));
  assert(!flow.hasPermission(roles, 'bbik', 'transfer'));
});

test('[PMO-RES-019] project-code permission is PMO only', () => {
  assert(flow.hasPermission(roles, 'pmo', 'projectCode'));
  assert(!flow.hasPermission(roles, 'user', 'projectCode'));
  assert(!flow.hasPermission(roles, 'bbik', 'projectCode'));
});

test('[PMO-RES-022] offboard permission and resolved transition are PMO/user only', () => {
  assert(flow.hasPermission(roles, 'pmo', 'offboard'));
  assert(!flow.hasPermission(roles, 'bbik', 'offboard'));
  assert(flow.allowedNext('filled', 'pmo', roles).includes('resolved'));
  assert(flow.allowedNext('filled', 'user', roles).includes('resolved'));
});

test('[PMO-RES-024] role-scoped visibility filters records correctly', () => {
  const rows = [
    { id:'pending-aoa', status:'pending', project:'AOA-MP' },
    { id:'approved-ttb', status:'approved', project:'TTB' },
    { id:'sourcing-geo', status:'sourcing', project:'Geo9' },
    { id:'filled-aoa', status:'filled', project:'AOA-MP' },
  ];
  assert.deepEqual(flow.visibleToRole(rows, 'bbik', roles).map(r => r.id), ['approved-ttb', 'sourcing-geo', 'filled-aoa']);
  assert.deepEqual(flow.visibleToRole(rows, 'user', roles, 'AOA-MP').map(r => r.id), ['pending-aoa', 'filled-aoa']);
  assert.deepEqual(flow.visibleToRole(rows, 'pmo', roles).map(r => r.id), rows.map(r => r.id));
});
