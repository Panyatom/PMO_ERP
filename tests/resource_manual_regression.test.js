const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../views/resource_flow.js');

const roles = flow.createDefaultResourceRoles();
const statuses = Object.keys(flow.DEFAULT_STATUS_FLOW);

test('[PMO-RES-UAT-001] BBIK can see recruiting work and already filled resources', () => {
  const rows = [
    { id:'pending-1', status:'pending', project:'AOA-MP' },
    { id:'approved-1', status:'approved', project:'AOA-MP' },
    { id:'sourcing-1', status:'sourcing', project:'AOA-MP' },
    { id:'offer-1', status:'offer', project:'AOA-MP' },
    { id:'filled-1', status:'filled', project:'AOA-MP' },
    { id:'cancelled-1', status:'cancelled', project:'AOA-MP' },
  ];

  assert.deepEqual(
    flow.visibleToRole(rows, 'bbik', roles).map(row => row.id),
    ['approved-1', 'sourcing-1', 'offer-1', 'filled-1']
  );
});

test('[PMO-RES-UAT-002] BBIK can jump forward or roll back recruiting status before filled', () => {
  assert.deepEqual(
    flow.allowedStatusChoicesForRecord({ status:'sourcing' }, 'bbik', roles, { allStatuses: statuses }).sort(),
    ['approved', 'filled', 'interviewing', 'offer'].sort()
  );
  assert.deepEqual(
    flow.allowedStatusChoicesForRecord({ status:'offer' }, 'bbik', roles, { allStatuses: statuses }).sort(),
    ['approved', 'filled', 'interviewing', 'sourcing'].sort()
  );
  assert.deepEqual(
    flow.allowedStatusChoicesForRecord({ status:'filled' }, 'bbik', roles, { allStatuses: statuses }).sort(),
    ['interviewing', 'offer', 'sourcing'].sort()
  );
});

test('[PMO-RES-UAT-003] Onboard date is effective only after a resource is filled', () => {
  const date = '2026-07-15';

  assert.equal(flow.effectiveOnboardDate({ status:'sourcing', onboardDate:date }), '');
  assert.equal(flow.effectiveOnboardDate({ status:'offer', onboardDate:date }), '');
  assert.equal(flow.effectiveOnboardDate({ status:'filled', onboardDate:date }), date);
  assert.equal(flow.effectiveOnboardDate({ status:'resolved', onboardDate:date }), date);
});

test('[PMO-RES-UAT-004] PMO can choose multiple non-document statuses from change status', () => {
  const choices = flow.allowedStatusChoicesForRecord(
    { status:'approved', hiringType:'Secondment' },
    'pmo',
    roles,
    { allStatuses: statuses }
  );

  assert(choices.includes('sourcing'));
  assert(choices.includes('filled'));
  assert(choices.includes('cancelled'));
  assert(!choices.includes('document'));
});

test('[PMO-RES-UAT-005] Requester is project-scoped and cannot use PMO or BBIK actions', () => {
  const rows = [
    { id:'aoa-request', status:'pending', project:'AOA-MP' },
    { id:'ttb-request', status:'pending', project:'TTB' },
    { id:'aoa-filled', status:'filled', project:'AOA-MP' },
  ];

  assert.deepEqual(
    flow.visibleToRole(rows, 'user', roles, 'AOA-MP').map(row => row.id),
    ['aoa-request', 'aoa-filled']
  );
  assert(!flow.hasPermission(roles, 'user', 'approve'));
  assert(!flow.hasPermission(roles, 'user', 'recruit'));
});

test('[PMO-RES-UAT-006] Adding project code allocation rebalances the primary assignment', () => {
  assert.deepEqual(
    flow.rebalancePrimaryAllocationForCodes([{ allocation:50 }]),
    { extraAllocation:50, primaryAllocation:50, isValid:true }
  );
  assert.deepEqual(
    flow.rebalancePrimaryAllocationForCodes([{ allocation:30 }, { allocation:20 }]),
    { extraAllocation:50, primaryAllocation:50, isValid:true }
  );
  assert.equal(flow.rebalancePrimaryAllocationForCodes([{ allocation:60 }, { allocation:50 }]).isValid, false);
});
