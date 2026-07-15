const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { __PMO_CONFIG__: {} };

const settings = require('../views/settings.js');
const app = require('../app.js');
const appModulePath = require.resolve('../app.js');

async function withFreshApp(globals, callback) {
  const cachedModule = require.cache[appModulePath];
  const originals = new Map(Object.keys(globals).map(key => [
    key,
    { exists: Object.prototype.hasOwnProperty.call(global, key), value: global[key] },
  ]));
  delete require.cache[appModulePath];
  Object.assign(global, globals);
  try {
    return await callback(require(appModulePath));
  } finally {
    delete require.cache[appModulePath];
    if(cachedModule) require.cache[appModulePath] = cachedModule;
    originals.forEach((original, key) => {
      if(original.exists) global[key] = original.value;
      else delete global[key];
    });
  }
}

test.afterEach(() => {
  delete global.loadResources;
  delete global.loadResourceMaster;
  delete global.loadSettings;
  delete global.resourcePersonName;
});

test('[PMO-MST-001] Project Master normalizes legacy fields and case-insensitive duplicates', () => {
  const projects = settings.normalizeProjectMaster([
    {
      id: ' AOA / Main ',
      code: 'LEGACY-CODE',
      name: ' AOA-MP ',
      status: 'ARCHIVED',
      owner: ' PM Owner ',
      color: '#112233',
    },
    { name: 'aoa-mp', status: 'active', owner: 'Current Owner' },
  ]);

  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, 'aoa-mp');
  assert.equal(projects[0].code, 'aoa-mp');
  assert.equal(projects[0].status, 'active');
  assert.equal(projects[0].owner, 'Current Owner');
  assert.match(projects[0].id, /^aoa-mp$/i);
});

test('[PMO-MST-002] Legacy Settings become a canonical active-project and member contract', () => {
  const normalized = settings.normalizeSettings({
    projects: [' Alpha ', 'alpha', ' Beta '],
    members: [{
      name: ' Test User ',
      email: ' USER@EXAMPLE.COM ',
      role: 'unsupported-role',
      projectScope: ['Alpha', 'Alpha', ' Beta '],
    }],
    resource: {
      rowNoStart: -7,
      levels: [' Junior ', 'Junior', 'Senior'],
      employeeCodeFormats: {
        direct: { format: ' D-{000} ', start: 0 },
      },
    },
  });

  assert.deepEqual(normalized.projects, ['alpha', 'Beta']);
  assert.deepEqual(normalized.resource.levels, ['Junior', 'Senior']);
  assert.equal(normalized.resource.rowNoStart, 1);
  assert.deepEqual(normalized.members, [{
    id: 'user@example.com',
    name: 'Test User',
    email: 'user@example.com',
    role: 'user',
    roles: ['employee'],
    projectScope: ['Alpha', 'Beta'],
    active: true,
  }]);
});

test('[PMO-MST-003] Only active Project Master rows feed shared project consumers', () => {
  const projectNames = settings.activeProjectNamesFromMaster([
    { name: 'Active Project', status: 'active' },
    { name: 'Inactive Project', status: 'inactive' },
    { name: 'Archived Project', status: 'archived' },
  ]);

  assert.deepEqual(projectNames, ['Active Project']);
});

test('[PMO-MST-004] Project colors are stable and invalid colors use the canonical palette', () => {
  const first = settings.settingsProjectFallbackColor('Shared Project');
  const second = settings.settingsProjectFallbackColor('Shared Project');
  const project = settings.normalizeProjectMasterItem({
    name: 'Shared Project',
    color: 'not-a-color',
  });

  assert.equal(first, second);
  assert(settings.SETTINGS_PROJECT_COLORS.includes(first));
  assert.equal(project.color, first);
});

test('[PMO-MST-005] Settings validation rejects duplicate masters and invalid access data', () => {
  const draft = settings.normalizeSettings(null);
  draft.projectMaster = [{ name: 'Alpha' }, { name: 'alpha' }];
  draft.resource.levels = [];
  draft.members = [{
    name: '',
    email: 'invalid-email',
    role: 'missing-role',
    projectScope: [],
    active: true,
  }, {
    name: 'Duplicate One',
    email: 'duplicate@example.com',
    role: 'user',
    projectScope: ['Alpha'],
    active: true,
  }, {
    name: 'Duplicate Two',
    email: 'duplicate@example.com',
    role: 'user',
    projectScope: ['Alpha'],
    active: true,
  }];

  const errors = settings.validateSettingsDraft(draft);

  assert(errors.includes('Duplicate project name: alpha'));
  assert(errors.includes('Resource needs at least one Level option.'));
  assert(errors.includes('Every member needs a name.'));
  assert(errors.includes('Invalid email for member.'));
  assert(errors.includes('Duplicate member email: duplicate@example.com'));
  assert(errors.includes('invalid-email has an unknown role.'));
  assert(errors.includes('invalid-email needs at least one project scope.'));
});

test('[PMO-MST-006] Active employee references prevent Project Master removal', () => {
  global.loadResources = () => [{
    id: 'request-1',
    resourceName: 'Alice',
    status: 'filled',
    project: 'Primary Project',
    projectCodes: [{ project: 'Shared Project' }],
  }, {
    id: 'request-2',
    resourceName: 'Ignored Candidate',
    status: 'sourcing',
    project: 'Candidate Project',
  }];
  global.loadResourceMaster = () => [{
    employeeCode: 'EMP-001',
    resourceName: 'Alice',
    status: 'active',
    currentProject: 'Master Project',
  }, {
    employeeCode: 'EMP-OLD',
    status: 'offboarded',
    currentProject: 'Old Project',
  }];
  global.resourcePersonName = row => row.resourceName || row.employeeCode || row.id;

  const draft = settings.normalizeSettings(null);
  draft.projectMaster = [{ name: 'Unrelated Project' }];
  const errors = settings.validateSettingsDraft(draft);
  const usage = settings.settingsProjectResourceUsage('shared project');

  assert(errors.includes('Cannot remove project with active employees: primary project'));
  assert(errors.includes('Cannot remove project with active employees: shared project'));
  assert(errors.includes('Cannot remove project with active employees: master project'));
  assert(!errors.includes('Cannot remove project with active employees: candidate project'));
  assert(!errors.includes('Cannot remove project with active employees: old project'));
  assert.deepEqual(usage, { count: 1, names: ['Alice'] });
});

test('[PMO-MST-007] Canonical project list trims, removes blanks, and de-duplicates Settings fallback', () => {
  global.loadSettings = () => ({ projects: [' Alpha ', '', 'Alpha', 'Beta'] });

  assert.deepEqual(app.getCanonicalProjectList(), ['Alpha', 'Beta']);
  assert.deepEqual(app.normalizeOrganizationProject({
    id: 42,
    code: 'ALPHA',
    name: ' Alpha Project ',
    status: 'INACTIVE',
  }), {
    id: '42',
    code: 'ALPHA',
    name: 'Alpha Project',
    status: 'inactive',
  });
});

test('[PMO-MST-008] Shared project dropdown preserves a legacy value without duplicating it', () => {
  const legacy = app.projectOptionsHtml(['Alpha', 'Beta'], 'Legacy');
  const selected = app.projectOptionsHtml(['Alpha', 'Beta'], 'Alpha');

  assert.match(legacy, /value="Legacy" selected>Legacy \/ Current value<\/option>/);
  assert.equal((legacy.match(/value="Legacy"/g) || []).length, 1);
  assert.equal((selected.match(/value="Alpha"/g) || []).length, 1);
  assert.match(selected, /value="Alpha" selected>Alpha<\/option>/);
});

test('[PMO-MST-009] User Profile fallback supports active review/approve and alias lookup', async () => {
  const originalWarn = console.warn;
  let profiles;
  try {
    console.warn = () => {};
    profiles = await app.loadUserProfilesAsync();
  } finally {
    console.warn = originalWarn;
  }
  const reviewApprovers = app.getApprovers('review');
  const finalApprovers = app.getApprovers('approve');

  assert(profiles.length > 0);
  assert(reviewApprovers.length > 0);
  assert(finalApprovers.length > 0);
  assert(reviewApprovers.every(profile => profile.is_active !== false && (profile.can_review ?? profile.is_approver)));
  assert(finalApprovers.every(profile => profile.is_active !== false && (profile.can_approve ?? profile.is_approver)));
  assert.equal(app.findUserByName('CEO')?.id, 2);
});

test('[PMO-MST-010] Unknown authority combinations fail closed at a zero approval limit', () => {
  assert.equal(app.getAuthorityLimit('Unknown Title', 'sl'), 0);
  assert.equal(app.getAuthorityLimit('Unknown Title', 'unknown-type'), 0);
});

test('[PMO-MST-011] Partial role settings retain default permissions and required PMO routes', () => {
  const roles = settings.mergeRoleConfig({
    pmo: {
      permissions: { importEmployees: false },
      transitions: { pending: [] },
    },
    user: {
      permissions: { createRequest: false },
    },
  });

  assert.equal(roles.pmo.permissions.importEmployees, false);
  assert.equal(roles.pmo.permissions.approve, true);
  assert(roles.pmo.transitions.pending.includes('pendingDocs'));
  assert(roles.pmo.transitions.pending.includes('approved'));
  assert(roles.pmo.transitions.pending.includes('cancelled'));
  assert.equal(roles.user.permissions.createRequest, false);
  assert.equal(roles.user.permissions.editPending, true);
});

test('[PMO-MST-012] Supabase Organization Project master overrides local Settings and filters inactive rows', async () => {
  let requestedUrl = '';
  const fetchStub = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      text: async () => JSON.stringify([
        { id: 'alpha', code: 'ALPHA', name: 'Alpha', status: 'ACTIVE' },
        { id: 'alpha-duplicate', code: 'ALPHA-2', name: 'Alpha', status: 'active' },
        { id: 'inactive', code: 'INACTIVE', name: 'Inactive', status: 'inactive' },
        { id: 'blank', code: '', name: '', status: 'active' },
        { id: 'beta', code: 'BETA', name: 'Beta', status: 'active' },
      ]),
    };
  };

  await withFreshApp({
    window: { __PMO_CONFIG__: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-test-key' } },
    checkSupa: async () => true,
    fetch: fetchStub,
    loadSettings: () => ({ projects: ['Offline Project'] }),
  }, async remoteApp => {
    assert.deepEqual(await remoteApp.loadOrganizationProjectsAsync(), ['Alpha', 'Beta']);
  });

  assert.match(requestedUrl, /\/rest\/v1\/organization_projects\?status=eq\.active&order=name\.asc$/);
});

test('[PMO-MST-013] Organization Project API failure falls back to canonical local Settings', async () => {
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    await withFreshApp({
      window: { __PMO_CONFIG__: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-test-key' } },
      checkSupa: async () => true,
      fetch: async () => ({ ok: false, text: async () => 'temporary failure' }),
      loadSettings: () => ({ projects: [' Offline ', 'Offline', 'Backup'] }),
    }, async remoteApp => {
      assert.deepEqual(await remoteApp.loadOrganizationProjectsAsync(), ['Offline', 'Backup']);
    });
  } finally {
    console.warn = originalWarn;
  }
});
