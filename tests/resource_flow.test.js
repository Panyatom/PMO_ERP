const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../views/resource_flow.js');

const roles = flow.createDefaultResourceRoles();

test('PMO can route direct hiring to docs before approval', () => {
  const next = flow.allowedNextForRecord(
    { status: 'pending', hiringType: 'Direct Head Count (Permanent)' },
    'pmo',
    roles,
    { allStatuses: Object.keys(flow.DEFAULT_STATUS_FLOW) }
  );
  assert.deepEqual(next.sort(), ['cancelled', 'pendingDocs'].sort());
});

test('PMO can approve subcontract without pre-approval docs', () => {
  const next = flow.allowedNextForRecord(
    { status: 'pending', hiringType: 'Sub-contract' },
    'pmo',
    roles,
    { allStatuses: Object.keys(flow.DEFAULT_STATUS_FLOW) }
  );
  assert(next.includes('approved'));
  assert(!next.includes('pendingDocs'));
});

test('BBIK only sees approved and recruiting pipeline records', () => {
  const rows = [
    { id: '1', status: 'pending', project: 'AOA' },
    { id: '2', status: 'approved', project: 'AOA' },
    { id: '3', status: 'sourcing', project: 'TTB' },
    { id: '4', status: 'filled', project: 'TTB' },
  ];
  assert.deepEqual(flow.visibleToRole(rows, 'bbik', roles).map(r => r.id), ['2', '3']);
});

test('Requester is scoped to selected project and cannot approve', () => {
  const rows = [
    { id: '1', status: 'pending', project: 'AOA' },
    { id: '2', status: 'pending', project: 'TTB' },
  ];
  assert.deepEqual(flow.visibleToRole(rows, 'user', roles, 'TTB').map(r => r.id), ['2']);
  assert(!flow.allowedNext('pending', 'user', roles).includes('approved'));
});

test('Resource dashboard tab is disabled by default', () => {
  assert(!flow.canViewTab(roles, 'pmo', 'dashboard'));
  assert(!flow.canViewTab(roles, 'bbik', 'dashboard'));
  assert(!flow.canViewTab(roles, 'user', 'dashboard'));
});

test('BBIK advances recruiting steps and fills from offer', () => {
  assert.deepEqual(flow.allowedNext('approved', 'bbik', roles), ['sourcing']);
  assert.deepEqual(flow.allowedNext('sourcing', 'bbik', roles), ['interviewing']);
  assert.deepEqual(flow.allowedNext('interviewing', 'bbik', roles), ['offer']);
  assert.deepEqual(flow.allowedNext('offer', 'bbik', roles), ['filled']);
  assert(!flow.allowedNext('document', 'bbik', roles).includes('filled'));
});

test('cancelled status requires a cancel reason', () => {
  assert.equal(flow.requiresCancelReason('cancelled'), true);
  assert.equal(flow.requiresCancelReason('filled'), false);
  assert(flow.DEFAULT_CANCEL_REASONS.includes('Other'));
});
