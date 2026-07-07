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

test('[PMO-RES-UAT-007] Timeline excludes sourcing records even when stale onboard date exists', () => {
  const groups = flow.timelineItemGroups([
    {
      id:'stale-sourcing',
      status:'sourcing',
      project:'AOA-MP',
      resourceName:'Wrong Timeline Person',
      employeeCode:'SEC-999',
      onboardDate:'2026-07-15',
      projectCodes:[{ project:'AOA-MP', code:'AOA-001', allocation:50, startDate:'2026-07-15' }],
    },
    {
      id:'filled-person',
      status:'filled',
      project:'TTB',
      resourceName:'Timeline Person',
      employeeCode:'DHC-100',
      onboardDate:'2026-07-01',
      projectCodes:[{ project:'AOA-MP', code:'AOA-050', allocation:50, startDate:'2026-08-01', endDate:'2026-12-31' }],
    },
  ]);

  assert.deepEqual(groups.map(group => group.employeeCode), ['DHC-100']);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].source, 'Project Code');
});

test('[PMO-RES-UAT-008] Timeline project-code mode maps assignment project, code, percent, and dates', () => {
  const groups = flow.timelineItemGroups([
    {
      id:'filled-code',
      status:'filled',
      project:'Primary Project',
      primaryProjectCode:'PRI-001',
      allocationPercent:50,
      resourceName:'Code Timeline Person',
      employeeCode:'DHC-101',
      onboardDate:'2026-07-01',
      projectCodes:[{ project:'Project Code Project', code:'PC-050', allocation:50, startDate:'2026-08-01', endDate:'2026-11-30' }],
    },
  ], 'project-code');

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items, [{
    requestId:'filled-code',
    project:'Project Code Project',
    code:'PC-050',
    allocation:50,
    startDate:'2026-08-01',
    endDate:'2026-11-30',
    hiringType:undefined,
    source:'Project Code',
  }]);
});

test('[PMO-RES-UAT-009] Timeline all mode includes primary assignment plus project codes', () => {
  const groups = flow.timelineItemGroups([
    {
      id:'filled-all',
      status:'filled',
      project:'Primary Project',
      primaryProjectCode:'PRI-001',
      allocationPercent:50,
      resourceName:'All Timeline Person',
      employeeCode:'DHC-102',
      onboardDate:'2026-07-01',
      projectCodes:[{ project:'Extra Project', code:'EX-050', allocation:50, startDate:'2026-08-01' }],
    },
  ], 'all');

  assert.deepEqual(groups[0].items.map(item => `${item.source}:${item.project}:${item.allocation}`), [
    'Primary:Primary Project:50',
    'Project Code:Extra Project:50',
  ]);
});

test('[PMO-RES-UAT-010] Timeline project bars use project master colors with readable text', () => {
  const projectMaster = [
    { name:'AOA-MP', code:'AOA', color:'#0057b8' },
    { name:'NLMS', code:'NLMS', color:'#f7d774' },
  ];

  assert.equal(flow.resolveProjectAccentColor('AOA-MP', projectMaster), '#0057b8');
  assert.equal(flow.projectTextColor('#0057b8'), '#fff');
  assert.equal(flow.resolveProjectAccentColor('NLMS', projectMaster), '#f7d774');
  assert.equal(flow.projectTextColor('#f7d774'), '#0f172a');
  assert.equal(flow.resolveProjectAccentColor('Unknown', projectMaster), '#8dd7cf');
});
