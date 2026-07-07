// views/settings.js - local application settings, access, and resource permissions

const SETTINGS_KEY = 'orbit-pmo-settings-v1';
let SETTINGS_ACTIVE_TAB = 'general';
let SETTINGS_DIRTY_BASELINE = '';

const DEFAULT_PROJECTS = ['AOA-MP', 'TTB', 'Geo9', 'Release 2.1', 'Release 3'];
const DEFAULT_PROJECT_MASTER = DEFAULT_PROJECTS.map((name, index) => ({
  id: `project-${index + 1}`,
  code: name,
  name,
  status: 'active',
  owner: '',
  color: ['#8dd7cf', '#f7c6d9', '#ffd166', '#a7c7e7', '#cdb4db'][index % 5],
  note: '',
}));
const DEFAULT_RESOURCE_LEVELS = ['Junior','Mid','Senior','Lead','Manager'];
const DEFAULT_PEOPLE = [
  'Chuen K.',
  'K.Pirunrung',
  'K.Navapon',
  'K.Pojjanat',
  'K.Sathita',
  'K.Phoorichet',
  'K.Akkares',
  'K.Chotima',
  'K.Kor',
];
const DEFAULT_TITLES = [
  'PMO',
  'Project Manager',
  'Project Director',
  'Department Head',
  'Managing Director',
];

const SETTINGS_PERMISSIONS = [
  ['createRequest', 'Create request', 'Open new Resource requests.'],
  ['editPending', 'Edit pending', 'Edit requests before approval.'],
  ['cancelPending', 'Cancel pending', 'Cancel requests that are still open.'],
  ['resolveFilled', 'Resolve filled', 'Close filled or resolved requests.'],
  ['approve', 'Approve', 'Approve demand and route to BBIK.'],
  ['recruit', 'Recruit pipeline', 'Advance BBIK recruiting stages.'],
  ['transfer', 'Transfer', 'Create internal assignment transfers.'],
  ['projectCode', 'Project code', 'Manage project code allocation.'],
  ['offboard', 'Offboard', 'Close onboarded employees.'],
  ['deleteRequest', 'Delete', 'Delete Resource records.'],
  ['importEmployees', 'Import employees', 'Bulk import employee directory.'],
  ['importProjectCodes', 'Import project codes', 'Bulk import project code master.'],
];

const SETTINGS_RESOURCE_TABS = [
  ['request', 'Request'],
  ['people', 'Employee Directory'],
  ['timeline', 'Timeline'],
  ['transfer', 'Employee Assignment'],
  ['code', 'Project Code'],
];

const SETTINGS_STATUS_OPTIONS = [
  ['pending', 'Pending'],
  ['pendingDocs', 'Pending Docs'],
  ['approved', 'Approved'],
  ['sourcing', 'Sourcing'],
  ['interviewing', 'Interviewing'],
  ['offer', 'Offer'],
  ['filled', 'Filled'],
  ['resolved', 'Resolved'],
  ['cancelled', 'Cancelled'],
];

const DEFAULT_RESOURCE_ROLE_CONFIG = {
  user: {
    label: 'Requester',
    note: 'Selected project only',
    scope: 'selected-project',
    tabs: ['request'],
    permissions: {
      createRequest: true,
      editPending: true,
      cancelPending: true,
      resolveFilled: true,
      approve: false,
      recruit: false,
      transfer: false,
      projectCode: false,
      offboard: false,
      deleteRequest: false,
      importEmployees: false,
      importProjectCodes: false,
    },
    transitions: {
      pending: ['cancelled'],
      filled: ['resolved'],
    },
  },
  pmo: {
    label: 'PMO / Dir',
    note: 'All projects and internal operations',
    scope: 'all',
    tabs: ['request', 'people', 'timeline', 'transfer', 'code'],
    permissions: {
      createRequest: true,
      editPending: true,
      cancelPending: true,
      resolveFilled: true,
      approve: true,
      recruit: false,
      transfer: true,
      projectCode: true,
      offboard: true,
      deleteRequest: true,
      importEmployees: true,
      importProjectCodes: true,
    },
    transitions: {
      pending: ['pendingDocs', 'approved', 'cancelled'],
      pendingDocs: ['approved', 'cancelled'],
      approved: ['cancelled'],
      sourcing: ['cancelled'],
      interviewing: ['cancelled'],
      offer: ['cancelled'],
      filled: ['resolved', 'cancelled'],
      mitigated: [],
      resolved: [],
      cancelled: [],
    },
  },
  bbik: {
    label: 'BBIK',
    note: 'Approved recruiting pipeline only',
    scope: 'bbik-pipeline',
    tabs: ['request'],
    permissions: {
      createRequest: false,
      editPending: false,
      cancelPending: false,
      resolveFilled: false,
      approve: false,
      recruit: true,
      transfer: false,
      projectCode: false,
      offboard: false,
      deleteRequest: false,
      importEmployees: false,
      importProjectCodes: false,
    },
    transitions: {
      approved: ['sourcing'],
      sourcing: ['interviewing'],
      interviewing: ['offer'],
      offer: ['filled'],
    },
  },
};

const DEFAULT_MEMBERS = [
  {
    id: 'm-pmo-chuen',
    name: 'Chuen K.',
    email: 'chuen.k@orbitdigital.co.th',
    role: 'pmo',
    projectScope: ['all'],
    active: true,
  },
  {
    id: 'm-requester-aoa',
    name: 'AOA Requester',
    email: 'requester.aoa@orbitdigital.co.th',
    role: 'user',
    projectScope: ['AOA-MP'],
    active: true,
  },
  {
    id: 'm-bbik',
    name: 'BBIK Recruiter',
    email: 'bbik.recruiter@bbik.com',
    role: 'bbik',
    projectScope: ['all'],
    active: true,
  },
];

const DEFAULT_SETTINGS = {
  projects: DEFAULT_PROJECTS,
  projectMaster: DEFAULT_PROJECT_MASTER,
  people: DEFAULT_PEOPLE,
  titles: DEFAULT_TITLES,
  members: DEFAULT_MEMBERS,
  defaultReviewer: { name: 'Chuen K.', title: 'PMO' },
  defaultApprover: { name: '', title: '' },
  resource: {
    showRequestId: false,
    rowNoFormat: '{00}',
    rowNoStart: 1,
    levels: DEFAULT_RESOURCE_LEVELS,
    employeeCodeFormats: {
      direct: { format: 'DHC-{000}', start: 1 },
      secondment: { format: 'SEC-{000}', start: 1 },
    },
    roles: DEFAULT_RESOURCE_ROLE_CONFIG,
  },
  notifications: {
    memoPending: true,
    resourceApproval: true,
    recruiting: true,
    onboarding: true,
  },
  typeCfg: {},
};

function cloneSettingsValue(v) {
  return JSON.parse(JSON.stringify(v));
}

function uniqueCleanLines(value, fallback) {
  const rows = String(value || '')
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
  return rows.length ? [...new Set(rows)] : [...fallback];
}

function cleanProjectId(value, fallback='') {
  const raw = String(value || fallback || '').trim();
  return raw.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `project-${Date.now().toString(36)}`;
}

function normalizeProjectMasterItem(project, index=0) {
  if(typeof project === 'string') {
    const name = project.trim();
    return {
      id: cleanProjectId('', name || `project-${index + 1}`),
      code: name,
      name,
      status: 'active',
      owner: '',
      color: ['#8dd7cf', '#f7c6d9', '#ffd166', '#a7c7e7', '#cdb4db'][index % 5],
      note: '',
    };
  }
  const name = String(project?.name || project?.project || project?.code || project?.projectCode || '').trim();
  return {
    id: cleanProjectId(project?.id, name || `project-${index + 1}`),
    code: name,
    name,
    status: ['active','inactive','archived'].includes(String(project?.status || '').toLowerCase()) ? String(project.status).toLowerCase() : 'active',
    owner: String(project?.owner || project?.pmOwner || '').trim(),
    color: normalizeProjectColor(project?.color, ['#8dd7cf', '#f7c6d9', '#ffd166', '#a7c7e7', '#cdb4db'][index % 5]),
    note: String(project?.note || '').trim(),
  };
}

function normalizeProjectColor(value, fallback='#8dd7cf') {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function normalizeProjectMaster(list, fallbackProjects=DEFAULT_PROJECTS) {
  const source = Array.isArray(list) && list.length ? list : fallbackProjects;
  const byKey = new Map();
  source.map(normalizeProjectMasterItem).filter(p => p.name || p.code).forEach(project => {
    const key = (project.code || project.name).toLowerCase();
    byKey.set(key, project);
  });
  return [...byKey.values()];
}

function activeProjectNamesFromMaster(projectMaster) {
  return normalizeProjectMaster(projectMaster)
    .filter(p => p.status === 'active')
    .map(p => p.name || p.code)
    .filter(Boolean);
}

function mergeRoleConfig(rawRoles) {
  const merged = {};
  Object.entries(DEFAULT_RESOURCE_ROLE_CONFIG).forEach(([key, def]) => {
    const raw = rawRoles?.[key] || {};
    const transitions = { ...def.transitions, ...(raw.transitions || {}) };
    if(key === 'pmo') {
      transitions.pending = [...new Set([...(transitions.pending || []), 'pendingDocs', 'approved', 'cancelled'])];
      transitions.pendingDocs = [...new Set([...(transitions.pendingDocs || []), 'approved', 'cancelled'])];
    }
    merged[key] = {
      ...cloneSettingsValue(def),
      ...raw,
      permissions: { ...def.permissions, ...(raw.permissions || {}) },
      transitions,
      tabs: Array.isArray(raw.tabs) && raw.tabs.length ? raw.tabs : [...def.tabs],
    };
  });
  return merged;
}

function normalizeMember(member, index=0) {
  const name = String(member?.name || '').trim();
  const email = String(member?.email || '').trim().toLowerCase();
  const role = DEFAULT_RESOURCE_ROLE_CONFIG[member?.role] ? member.role : 'user';
  const rawScope = Array.isArray(member?.projectScope) ? member.projectScope : String(member?.projectScope || '').split(',');
  const projectScope = rawScope.map(p => String(p).trim()).filter(Boolean);
  return {
    id: String(member?.id || email || `member-${index + 1}`),
    name,
    email,
    role,
    projectScope: projectScope.length ? [...new Set(projectScope)] : ['all'],
    active: member?.active !== false,
  };
}

function normalizeSettings(raw) {
  const base = cloneSettingsValue(DEFAULT_SETTINGS);
  const s = raw && typeof raw === 'object' ? raw : {};
  const members = Array.isArray(s.members) && s.members.length ? s.members : base.members;
  const projectMaster = normalizeProjectMaster(s.projectMaster || s.projects, base.projects);
  const projectNames = activeProjectNamesFromMaster(projectMaster);
  const rawRowNoStart = Number(s.resource?.rowNoStart);
  const rowNoStart = Number.isFinite(rawRowNoStart) && rawRowNoStart > 0 ? Math.floor(rawRowNoStart) : base.resource.rowNoStart;
  const rowNoFormat = String(s.resource?.rowNoFormat || base.resource.rowNoFormat).trim() || base.resource.rowNoFormat;
  const levels = uniqueCleanLines(Array.isArray(s.resource?.levels) ? s.resource.levels.join('\n') : s.resource?.levels, base.resource.levels);
  const employeeCodeFormats = {
    direct: {
      format: String(s.resource?.employeeCodeFormats?.direct?.format || base.resource.employeeCodeFormats.direct.format).trim() || base.resource.employeeCodeFormats.direct.format,
      start: Math.max(1, Math.floor(Number(s.resource?.employeeCodeFormats?.direct?.start || base.resource.employeeCodeFormats.direct.start || 1))),
    },
    secondment: {
      format: String(s.resource?.employeeCodeFormats?.secondment?.format || base.resource.employeeCodeFormats.secondment.format).trim() || base.resource.employeeCodeFormats.secondment.format,
      start: Math.max(1, Math.floor(Number(s.resource?.employeeCodeFormats?.secondment?.start || base.resource.employeeCodeFormats.secondment.start || 1))),
    },
  };
  return {
    ...base,
    ...s,
    projects: projectNames.length ? projectNames : [...base.projects],
    projectMaster,
    people: Array.isArray(s.people) && s.people.length ? s.people.map(String) : [...base.people],
    titles: Array.isArray(s.titles) && s.titles.length ? s.titles.map(String) : [...base.titles],
    members: members.map(normalizeMember).filter(m => m.name || m.email),
    defaultReviewer: { ...base.defaultReviewer, ...(s.defaultReviewer || {}) },
    defaultApprover: { ...base.defaultApprover, ...(s.defaultApprover || {}) },
    resource: {
      ...base.resource,
      ...(s.resource || {}),
      rowNoFormat,
      rowNoStart,
      levels,
      employeeCodeFormats,
      roles: mergeRoleConfig(s.resource?.roles),
    },
    notifications: { ...base.notifications, ...(s.notifications || {}) },
    typeCfg: s.typeCfg || {},
  };
}

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch(e) {
    return normalizeSettings(null);
  }
}

function storeSettings(settings) {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized)); } catch(e) {}
  return normalized;
}

function ensureProjectInSettingsMaster(projectName, patch={}) {
  const name = String(projectName || '').trim();
  if(!name) return null;
  const current = loadSettings();
  const list = normalizeProjectMaster(current.projectMaster, current.projects);
  const existing = list.find(project =>
    String(project.name || '').toLowerCase() === name.toLowerCase() ||
    String(project.code || '').toLowerCase() === name.toLowerCase()
  );
  if(existing) return existing;
  const item = normalizeProjectMasterItem({
    name,
    owner: patch.owner || '',
    note: patch.note || '',
    status: patch.status || 'active',
  }, list.length);
  storeSettings({ ...current, projectMaster: [...list, item] });
  return item;
}

function settingsOptionList(items, selected, includeBlank=true) {
  const opts = includeBlank ? ['<option value="">- Select -</option>'] : [];
  (items || []).forEach(item => {
    opts.push(`<option value="${esc(item)}" ${item === selected ? 'selected' : ''}>${esc(item)}</option>`);
  });
  opts.push(`<option value="other" ${selected && !items.includes(selected) ? 'selected' : ''}>Other</option>`);
  return opts.join('');
}

function setSelectOptions(select, items, selected, includeOther=true) {
  if(!select) return;
  const current = selected ?? select.value;
  const opts = ['<option value="">- Select -</option>'];
  items.forEach(item => opts.push(`<option value="${esc(item)}">${esc(item)}</option>`));
  if(includeOther) opts.push('<option value="other">Other</option>');
  select.innerHTML = opts.join('');
  select.value = items.includes(current) || current === 'other' ? current : '';
}

function initSettings() {
  const s = storeSettings(loadSettings());
  setSelectOptions(document.getElementById('f-project'), s.projects, undefined, true);
  setSelectOptions(document.getElementById('f-reviewer-name'), s.people, undefined, true);
  setSelectOptions(document.getElementById('f-approver-name'), s.people, undefined, true);
  setSelectOptions(document.getElementById('f-reviewer-title'), s.titles, undefined, true);
  setSelectOptions(document.getElementById('f-appr-title'), s.titles, undefined, true);
  refreshResourceProjectFilter(s);
  return s;
}

function refreshResourceProjectFilter(s=loadSettings()) {
  const sel = document.getElementById('res-f-project');
  if(!sel) return;
  const current = sel.value;
  const projects = [...new Set([...(s.projects || []), ...(typeof loadProjectCodeMaster === 'function' ? loadProjectCodeMaster().map(c => c.project).filter(Boolean) : [])])];
  sel.innerHTML = '<option value="all">All projects</option>' + projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if([...sel.options].some(o => o.value === current)) sel.value = current;
}

function refreshSettingsConsumers() {
  initSettings();
  if(typeof renderResource === 'function') renderResource();
  if(typeof renderCost === 'function') renderCost();
  if(typeof renderPendingMemos === 'function') renderPendingMemos();
  if(typeof refreshNotifications === 'function') refreshNotifications();
}

function rolePermissionChecked(roleKey, permission) {
  const s = loadSettings();
  return !!s.resource.roles[roleKey]?.permissions?.[permission];
}

function settingsMemberByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if(!normalizedEmail) return null;
  return loadSettings().members.find(member => member.active && member.email === normalizedEmail) || null;
}

function settingsEffectiveAccess(session) {
  const member = settingsMemberByEmail(session?.user?.email);
  if(!member) return null;
  return {
    role: member.role,
    project: member.projectScope.includes('all') ? '' : member.projectScope[0] || '',
    projectScope: member.projectScope,
    member,
  };
}

function resetSettings() {
  if(!confirm('Reset Settings to default values? This resets members, roles, and local Settings values.')) return;
  storeSettings(DEFAULT_SETTINGS);
  initSettings();
  renderSettings(SETTINGS_ACTIVE_TAB);
  refreshSettingsConsumers();
  showSettingsToast('Settings reset locally.', 'ok');
}

function showSettingsToast(message, tone='ok') {
  let toast = document.getElementById('settings-toast');
  if(!toast) {
    toast = document.createElement('div');
    toast.id = 'settings-toast';
    toast.className = 'settings-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `settings-toast settings-toast-${tone} is-open`;
  window.clearTimeout(showSettingsToast._timer);
  showSettingsToast._timer = window.setTimeout(() => toast.classList.remove('is-open'), 2600);
}

function toggleSettingsCheckbox(event, host) {
  const input = host?.querySelector?.('input[type="checkbox"]');
  if(!input && !host?.classList?.contains('settings-matrix-toggle')) return;
  if(input?.disabled) return;
  event.preventDefault();
  if(input) {
    input.focus({ preventScroll: true });
    input.checked = !input.checked;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const next = host.getAttribute('aria-pressed') !== 'true';
  host.setAttribute('aria-pressed', String(next));
  const label = host.querySelector('[data-settings-toggle-label]');
  if(label) label.textContent = next ? 'On' : 'Off';
  host.focus({ preventScroll: true });
  host.dispatchEvent(new Event('input', { bubbles: true }));
  host.dispatchEvent(new Event('change', { bubbles: true }));
}

function animateSettingsControl(event) {
  const target = event.target;
  if(!(target instanceof HTMLElement)) return;
  const host = target.closest('.settings-check, .settings-switch, .settings-matrix td, .settings-nav-item, .settings-member-row');
  if(!host) return;
  host.classList.remove('settings-pop');
  void host.offsetWidth;
  host.classList.add('settings-pop');
  host.addEventListener('animationend', () => host.classList.remove('settings-pop'), { once:true });
  const memberRow = target.closest('[data-member-row]');
  if(memberRow && target.matches('[data-member-field="active"]')) {
    const badge = memberRow.querySelector('.settings-member-status');
    if(badge) {
      badge.textContent = target.checked ? 'Active' : 'Inactive';
      badge.classList.toggle('is-active', target.checked);
    }
  }
  const matrixToggle = target.closest('.settings-matrix-toggle');
  if(matrixToggle && target.matches('input[type="checkbox"]')) {
    const text = matrixToggle.querySelector('span');
    if(text) text.textContent = target.checked ? 'On' : 'Off';
  }
}

function settingsRoleOptions(selected) {
  const roles = loadSettings().resource.roles;
  return Object.entries(roles).map(([key, role]) =>
    `<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(role.label || key)}</option>`
  ).join('');
}

function settingsProjectScopeOptions(projects, selected=[]) {
  const values = Array.isArray(selected) && selected.length ? selected : ['all'];
  const options = [`<option value="all" ${values.includes('all') ? 'selected' : ''}>All projects</option>`];
  projects.forEach(project => {
    options.push(`<option value="${esc(project)}" ${values.includes(project) ? 'selected' : ''}>${esc(project)}</option>`);
  });
  return options.join('');
}

function renderSettingsIcon(name) {
  const icons = {
    general: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/>',
    members: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    roles: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12l2 2 4-5"/>',
    resource: '<path d="M4 5h16v14H4z"/><path d="M8 9h8"/><path d="M8 13h5"/>',
    later: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="10"/>',
  };
  return `<span class="settings-nav-icon"><svg viewBox="0 0 24 24">${icons[name] || icons.general}</svg></span>`;
}

function switchSettingsTab(tab) {
  SETTINGS_ACTIVE_TAB = tab || 'general';
  renderSettings(SETTINGS_ACTIVE_TAB);
}

function addSettingsMember() {
  const list = document.getElementById('settings-members-list');
  if(!list) return;
  const id = `new-${Date.now()}`;
  list.insertAdjacentHTML('beforeend', renderMemberRow({
    id,
    name: '',
    email: '',
    role: 'user',
    projectScope: [loadSettings().projects[0] || 'all'],
    active: true,
  }, loadSettings().projects, list.children.length));
  markSettingsDirty();
}

function removeSettingsMember(id) {
  const row = document.querySelector(`[data-member-row="${CSS.escape(id)}"]`);
  if(row) row.remove();
  markSettingsDirty();
}

function addSettingsProjectRow(project={}) {
  const list = document.getElementById('settings-project-list');
  if(!list) return;
  const item = normalizeProjectMasterItem(project, list.children.length);
  list.insertAdjacentHTML('beforeend', `
    <div class="settings-project-row settings-pop" data-project-row="${esc(item.id)}">
      <input class="ri" data-project-field="name" value="${esc(item.name)}" placeholder="EV PluZ">
      <select class="ri" data-project-field="status">
        ${['active','inactive','archived'].map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select>
      <input class="ri" data-project-field="owner" value="${esc(item.owner)}" placeholder="PM owner">
      <input class="settings-color-input" type="color" data-project-field="color" value="${esc(item.color)}" title="Project color">
      <input class="ri" data-project-field="note" value="${esc(item.note)}" placeholder="Release / maintain note">
      <button class="btn-sm settings-icon-btn" type="button" title="Remove project" onclick="removeSettingsProjectRow(this)">x</button>
    </div>`);
  markSettingsDirty();
}

function removeSettingsProjectRow(button) {
  const row = button?.closest?.('[data-project-row]');
  if(row) row.remove();
  markSettingsDirty();
}

function renderMemberRow(member, projects, index) {
  const activeLabel = member.active ? 'Active' : 'Inactive';
  return `
    <div class="settings-member-row" data-member-row="${esc(member.id)}">
      <div class="settings-member-status ${member.active ? 'is-active' : ''}">${esc(activeLabel)}</div>
      <input class="ri" data-member-field="name" value="${esc(member.name)}" placeholder="Name">
      <input class="ri" data-member-field="email" value="${esc(member.email)}" placeholder="email@company.com">
      <select class="ri" data-member-field="role">${settingsRoleOptions(member.role)}</select>
      <select class="ri" data-member-field="projectScope" multiple size="2">${settingsProjectScopeOptions(projects, member.projectScope)}</select>
      <label class="settings-switch" title="Active member" data-settings-toggle>
        <input data-member-field="active" type="checkbox" ${member.active ? 'checked' : ''}>
        <span aria-hidden="true"></span>
      </label>
      <button class="btn-sm settings-icon-btn" type="button" onclick="removeSettingsMember('${esc(member.id)}')" title="Remove member" aria-label="Remove member">x</button>
    </div>`;
}

function renderMembersPanel(s) {
  const active = s.members.filter(m => m.active).length;
  const scoped = s.members.filter(m => !m.projectScope.includes('all')).length;
  return `
    <div class="settings-summary-row settings-summary-row-3">
      <div class="settings-summary"><div class="settings-summary-mark">${active}</div><div><strong>${active}</strong><span>Active members</span></div></div>
      <div class="settings-summary"><div class="settings-summary-mark">${s.members.length}</div><div><strong>${s.members.length}</strong><span>Total members</span></div></div>
      <div class="settings-summary"><div class="settings-summary-mark">${scoped}</div><div><strong>${scoped}</strong><span>Project-scoped</span></div></div>
    </div>
    <section class="settings-card">
      <div class="settings-panel-head">
        <div><h3>Members & Access</h3><p>Members define the effective role and project scope for local Resource access.</p></div>
        <button class="btn-sm" type="button" onclick="addSettingsMember()">Add member</button>
      </div>
      <div class="settings-member-head">
        <span>Status</span><span>Name</span><span>Email</span><span>Role</span><span>Project scope</span><span>Active</span><span></span>
      </div>
      <div id="settings-members-list" class="settings-members-list">
        ${s.members.map((member, index) => renderMemberRow(member, s.projects, index)).join('')}
      </div>
    </section>`;
}

function readRolePermissions(roleKey) {
  const existing = loadSettings().resource.roles[roleKey]?.permissions || {};
  if(!document.querySelector(`[data-role-perm="${roleKey}"]`)) return { ...existing };
  const permissions = {};
  SETTINGS_PERMISSIONS.forEach(([permission]) => {
    const toggle = document.querySelector(`.settings-matrix-toggle[data-role-perm="${roleKey}"][data-permission="${permission}"]`);
    if(toggle) {
      permissions[permission] = toggle.getAttribute('aria-pressed') === 'true';
      return;
    }
    permissions[permission] = !!document.querySelector(`input[data-role-perm="${roleKey}"][data-permission="${permission}"]`)?.checked;
  });
  return permissions;
}

function renderPermissionMatrix(s) {
  const roles = s.resource.roles;
  return `
    <section class="settings-card settings-matrix-card">
      <div class="settings-panel-head">
        <div><h3>Roles & Permissions</h3><p>Edit role scope, feature permissions, visible tabs, and status transitions from one matrix.</p></div>
      </div>
      <div class="settings-matrix-wrap">
        <table class="settings-matrix">
          <colgroup>
            <col class="settings-matrix-feature-col">
            ${Object.keys(roles).map(() => '<col class="settings-matrix-role-col">').join('')}
          </colgroup>
          <thead>
            <tr>
              <th>Permission</th>
              ${Object.entries(roles).map(([key, role]) => `<th>${esc(role.label || key)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${SETTINGS_PERMISSIONS.map(([permission, label, note]) => `
              <tr>
                <td><strong>${esc(label)}</strong><span>${esc(note)}</span></td>
                ${Object.entries(roles).map(([key, role]) => `
                  <td>
                    <button class="settings-matrix-toggle" type="button" title="${esc((role.label || key) + ' - ' + label)}" data-settings-toggle data-role-perm="${esc(key)}" data-permission="${esc(permission)}" aria-pressed="${role.permissions?.[permission] ? 'true' : 'false'}" aria-label="${esc((role.label || key) + ' ' + label)}">
                      <span class="settings-check-input" aria-hidden="true"></span>
                      <span data-settings-toggle-label>${role.permissions?.[permission] ? 'On' : 'Off'}</span>
                    </button>
                  </td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
    <div class="settings-role-grid">
      ${Object.entries(roles).map(([key, role]) => renderRoleDetail(key, role)).join('')}
    </div>
    <section class="settings-card">
      <div class="settings-panel-head">
        <div><h3>Permission Preview</h3><p>Preview what each role can see and do before saving.</p></div>
      </div>
      <div class="settings-preview-grid">
        ${Object.entries(roles).map(([key, role]) => renderRolePreview(key, role)).join('')}
      </div>
    </section>`;
}

function renderRoleDetail(key, role) {
  return `
    <section class="settings-role-card">
      <div class="settings-panel-head">
        <div>
          <h3>${esc(role.label)}</h3>
          <p>${esc(role.note || '')}</p>
        </div>
        <select class="ri settings-scope" data-role-scope="${esc(key)}">
          <option value="all" ${role.scope==='all'?'selected':''}>All projects</option>
          <option value="selected-project" ${role.scope==='selected-project'?'selected':''}>Selected project only</option>
          <option value="bbik-pipeline" ${role.scope==='bbik-pipeline'?'selected':''}>Approved recruiting pipeline</option>
        </select>
      </div>
      <div class="settings-grid settings-grid-tight">
        <div class="fg"><label>Role Label</label><input class="ri" data-role-label="${esc(key)}" value="${esc(role.label)}"></div>
        <div class="fg"><label>Role Note</label><input class="ri" data-role-note="${esc(key)}" value="${esc(role.note || '')}"></div>
      </div>
      <div class="settings-mini-label">Visible Resource Tabs</div>
      <div class="settings-tabs-row">
        ${SETTINGS_RESOURCE_TABS.map(([tab, label]) => `
          <label class="settings-check" data-settings-toggle>
            <input class="settings-check-input" type="checkbox" data-role-tab="${esc(key)}" data-tab="${esc(tab)}" ${role.tabs?.includes(tab) ? 'checked' : ''}>
            <span>${esc(label)}</span>
          </label>`).join('')}
      </div>
      <div class="settings-mini-label">Allowed Status Transitions</div>
      <div class="settings-transition-grid">
        ${SETTINGS_STATUS_OPTIONS.map(([status, label]) => `
          <label>${esc(label)}</label>
          <select class="ri" data-role-transition="${esc(key)}" data-status="${esc(status)}" multiple size="2">
            ${SETTINGS_STATUS_OPTIONS.filter(([next]) => next !== status).map(([next, nextLabel]) => `<option value="${esc(next)}" ${(role.transitions?.[status] || []).includes(next) ? 'selected' : ''}>${esc(nextLabel)}</option>`).join('')}
          </select>
        `).join('')}
      </div>
    </section>`;
}

function renderRolePreview(key, role) {
  const enabledPerms = SETTINGS_PERMISSIONS.filter(([perm]) => role.permissions?.[perm]).map(([, label]) => label);
  const tabLabels = SETTINGS_RESOURCE_TABS.filter(([tab]) => role.tabs?.includes(tab)).map(([, label]) => label);
  const pipeline = Object.entries(role.transitions || {})
    .filter(([, next]) => Array.isArray(next) && next.length)
    .map(([from, next]) => `${from} -> ${next.join(', ')}`);
  return `
    <div class="settings-preview">
      <div class="settings-preview-title">${esc(role.label || key)}</div>
      <div class="settings-preview-line"><strong>Scope</strong><span>${esc(role.scope || 'all')}</span></div>
      <div class="settings-preview-line"><strong>Tabs</strong><span>${esc(tabLabels.join(', ') || 'None')}</span></div>
      <div class="settings-preview-line"><strong>Can do</strong><span>${esc(enabledPerms.join(', ') || 'No permissions')}</span></div>
      <div class="settings-preview-line"><strong>Flow</strong><span>${esc(pipeline.slice(0, 4).join(' | ') || 'No status changes')}</span></div>
    </div>`;
}

function renderGeneralPanel(s) {
  const projectRows = normalizeProjectMaster(s.projectMaster, s.projects).map((project, index) => `
    <div class="settings-project-row" data-project-row="${esc(project.id)}">
      <input class="ri" data-project-field="name" value="${esc(project.name)}" placeholder="EV PluZ">
      <select class="ri" data-project-field="status">
        ${['active','inactive','archived'].map(status => `<option value="${status}" ${project.status === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select>
      <input class="ri" data-project-field="owner" value="${esc(project.owner)}" placeholder="PM owner">
      <input class="settings-color-input" type="color" data-project-field="color" value="${esc(project.color)}" title="Project color">
      <input class="ri" data-project-field="note" value="${esc(project.note)}" placeholder="Release / maintain note">
      <button class="btn-sm settings-icon-btn" type="button" title="Remove project" onclick="removeSettingsProjectRow(this)">×</button>
    </div>`).join('');
  return `
    <div class="settings-summary-row">
      <div class="settings-summary"><div class="settings-summary-mark">${s.projectMaster.length}</div><div><strong>${s.projectMaster.length}</strong><span>Project master</span></div></div>
      <div class="settings-summary"><div class="settings-summary-mark">${s.people.length}</div><div><strong>${s.people.length}</strong><span>People</span></div></div>
      <div class="settings-summary"><div class="settings-summary-mark">${s.titles.length}</div><div><strong>${s.titles.length}</strong><span>Titles</span></div></div>
      <div class="settings-summary"><div class="settings-summary-mark">${Object.keys(s.resource.roles).length}</div><div><strong>${Object.keys(s.resource.roles).length}</strong><span>Resource roles</span></div></div>
    </div>
    <section class="settings-card">
      <div class="settings-panel-head">
        <div><h3>Project Master</h3><p>Organization-level projects used for employee mapping. One project can own many Project Codes.</p></div>
        <button class="btn-sm" type="button" onclick="addSettingsProjectRow()">+ Add Project</button>
      </div>
      <div class="settings-project-head">
        <span>Project name</span><span>Status</span><span>Owner</span><span>Color</span><span>Note</span><span></span>
      </div>
      <div id="settings-project-list" class="settings-project-list">
        ${projectRows}
      </div>
    </section>
    <section class="settings-card">
      <div class="settings-panel-head">
        <div><h3>Workspace Lists</h3><p>These lists feed Create Memo, Cost, routing, and reviewer dropdowns.</p></div>
      </div>
      <div class="settings-grid">
        <div class="fg"><label>People</label><textarea id="set-people" class="ri settings-list">${esc(s.people.join('\n'))}</textarea></div>
        <div class="fg"><label>Titles</label><textarea id="set-titles" class="ri settings-list">${esc(s.titles.join('\n'))}</textarea></div>
        <div class="fg">
          <label>Default Memo Route</label>
          <div class="settings-route-grid">
            <select id="set-reviewer-name" class="ri">${settingsOptionList(s.people, s.defaultReviewer.name)}</select>
            <select id="set-reviewer-title" class="ri">${settingsOptionList(s.titles, s.defaultReviewer.title)}</select>
            <select id="set-approver-name" class="ri">${settingsOptionList(s.people, s.defaultApprover.name)}</select>
            <select id="set-approver-title" class="ri">${settingsOptionList(s.titles, s.defaultApprover.title)}</select>
          </div>
        </div>
      </div>
    </section>`;
}

function renderResourcePanel(s) {
  const preview = formatSettingsRowNoPreview(s.resource.rowNoFormat, s.resource.rowNoStart);
  const directCodePreview = formatSettingsEmployeeCodePreview(s.resource.employeeCodeFormats?.direct?.format, s.resource.employeeCodeFormats?.direct?.start);
  const secondmentCodePreview = formatSettingsEmployeeCodePreview(s.resource.employeeCodeFormats?.secondment?.format, s.resource.employeeCodeFormats?.secondment?.start);
  return `
    <section class="settings-card">
      <div class="settings-panel-head">
        <div><h3>Resource Display</h3><p>Controls shared Resource view behavior.</p></div>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-title">Show Request ID column</div>
          <div class="settings-row-note">Adds the Request ID column to the Resource request table for easier auditing.</div>
        </div>
        <label class="settings-switch" title="Show Request ID column" data-settings-toggle>
          <input id="set-resource-show-id" type="checkbox" ${s.resource.showRequestId ? 'checked' : ''}>
          <span aria-hidden="true"></span>
        </label>
      </div>
      <div class="settings-row settings-row-stack">
        <div>
          <div class="settings-row-title">Request table No. format</div>
          <div class="settings-row-note">Controls the first Resource request table column. Use {n}, {00}, {000}, or add a prefix like REQ-{000}.</div>
        </div>
        <div class="settings-inline-fields">
          <div class="fg"><label>No. format</label><input id="set-resource-row-no-format" class="ri" value="${esc(s.resource.rowNoFormat || '{00}')}" placeholder="{00}"></div>
          <div class="fg"><label>Start number</label><input id="set-resource-row-no-start" class="ri" type="number" min="1" step="1" value="${esc(s.resource.rowNoStart || 1)}"></div>
          <div class="settings-format-preview"><span>Preview</span><strong id="set-resource-row-no-preview">${esc(preview)}</strong></div>
        </div>
      </div>
      <div class="settings-row settings-row-stack">
        <div>
          <div class="settings-row-title">Level master data</div>
          <div class="settings-row-note">One level per line. This feeds the Resource request Level dropdown and filter.</div>
        </div>
        <div class="fg"><label>Levels</label><textarea id="set-resource-levels" class="ri settings-list" style="min-height:104px">${esc((s.resource.levels || DEFAULT_RESOURCE_LEVELS).join('\n'))}</textarea></div>
      </div>
      <div class="settings-row settings-row-stack">
        <div>
          <div class="settings-row-title">Employee Code format</div>
          <div class="settings-row-note">Controls generated employee code for Direct Headcount and Secondment. Sub Con stays manual.</div>
        </div>
        <div class="settings-code-format-grid">
          <div class="settings-code-format-card">
            <div class="settings-mini-label">Direct Headcount</div>
            <div class="settings-inline-fields">
              <div class="fg"><label>Format</label><input id="set-resource-emp-direct-format" class="ri" value="${esc(s.resource.employeeCodeFormats?.direct?.format || 'DHC-{000}')}" placeholder="DHC-{000}"></div>
              <div class="fg"><label>Start</label><input id="set-resource-emp-direct-start" class="ri" type="number" min="1" step="1" value="${esc(s.resource.employeeCodeFormats?.direct?.start || 1)}"></div>
              <div class="settings-format-preview"><span>Preview</span><strong id="set-resource-emp-direct-preview">${esc(directCodePreview)}</strong></div>
            </div>
          </div>
          <div class="settings-code-format-card">
            <div class="settings-mini-label">Secondment</div>
            <div class="settings-inline-fields">
              <div class="fg"><label>Format</label><input id="set-resource-emp-secondment-format" class="ri" value="${esc(s.resource.employeeCodeFormats?.secondment?.format || 'SEC-{000}')}" placeholder="SEC-{000}"></div>
              <div class="fg"><label>Start</label><input id="set-resource-emp-secondment-start" class="ri" type="number" min="1" step="1" value="${esc(s.resource.employeeCodeFormats?.secondment?.start || 1)}"></div>
              <div class="settings-format-preview"><span>Preview</span><strong id="set-resource-emp-secondment-preview">${esc(secondmentCodePreview)}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function formatSettingsRowNoPreview(format, start) {
  const n = Number(start) || 1;
  const pattern = String(format || '{00}').trim() || '{00}';
  const formatted = pattern.replace(/\{(0+|n)\}/i, (_, token) => token.toLowerCase() === 'n' ? String(n) : String(n).padStart(token.length, '0'));
  return formatted === pattern && !/\{(0+|n)\}/i.test(pattern) ? `${pattern}${n}` : formatted;
}

function formatSettingsEmployeeCodePreview(format, start) {
  const n = Number(start) || 1;
  const pattern = String(format || '{000}').trim() || '{000}';
  const now = new Date();
  return pattern
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{(0+|n)\}/i, (_, token) => token.toLowerCase() === 'n' ? String(n) : String(n).padStart(token.length, '0'));
}

function updateResourceNoPreview() {
  const preview = document.getElementById('set-resource-row-no-preview');
  if(!preview) return;
  preview.textContent = formatSettingsRowNoPreview(
    document.getElementById('set-resource-row-no-format')?.value || '{00}',
    document.getElementById('set-resource-row-no-start')?.value || 1
  );
}

function updateEmployeeCodePreviews() {
  const direct = document.getElementById('set-resource-emp-direct-preview');
  const secondment = document.getElementById('set-resource-emp-secondment-preview');
  if(direct) direct.textContent = formatSettingsEmployeeCodePreview(
    document.getElementById('set-resource-emp-direct-format')?.value || 'DHC-{000}',
    document.getElementById('set-resource-emp-direct-start')?.value || 1
  );
  if(secondment) secondment.textContent = formatSettingsEmployeeCodePreview(
    document.getElementById('set-resource-emp-secondment-format')?.value || 'SEC-{000}',
    document.getElementById('set-resource-emp-secondment-start')?.value || 1
  );
}

function renderLaterPanel(s) {
  const n = s.notifications || DEFAULT_SETTINGS.notifications;
  return `
    <section class="settings-card">
      <div class="settings-panel-head">
        <div><h3>Notifications</h3><p>Choose which in-app alerts appear in the top bar notification center.</p></div>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-title">Pending memo approval</div><div class="settings-row-note">Show memos still waiting in Pending Approval.</div></div>
        <label class="settings-switch" data-settings-toggle><input id="set-noti-memo" type="checkbox" ${n.memoPending ? 'checked' : ''}><span aria-hidden="true"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-title">Resource approval</div><div class="settings-row-note">Alert PMO / Dir when Resource requests are pending approval.</div></div>
        <label class="settings-switch" data-settings-toggle><input id="set-noti-resource" type="checkbox" ${n.resourceApproval ? 'checked' : ''}><span aria-hidden="true"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-title">Recruiting pipeline</div><div class="settings-row-note">Show approved requests and active BBIK recruiting stages.</div></div>
        <label class="settings-switch" data-settings-toggle><input id="set-noti-recruiting" type="checkbox" ${n.recruiting ? 'checked' : ''}><span aria-hidden="true"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-title">Onboard confirmation</div><div class="settings-row-note">Alert PMO / Dir when document-stage resources are ready to fill/onboard.</div></div>
        <label class="settings-switch" data-settings-toggle><input id="set-noti-onboarding" type="checkbox" ${n.onboarding ? 'checked' : ''}><span aria-hidden="true"></span></label>
      </div>
    </section>`;
}

function activeTabTitle(tab) {
  return ({
    general: 'General',
    members: 'Members & Access',
    roles: 'Roles & Permissions',
    resource: 'Resource',
    later: 'Later',
  })[tab] || 'General';
}

function renderSettingsPanel(tab, s) {
  if(tab === 'members') return renderMembersPanel(s);
  if(tab === 'roles') return renderPermissionMatrix(s);
  if(tab === 'resource') return renderResourcePanel(s);
  if(tab === 'later') return renderLaterPanel(s);
  return renderGeneralPanel(s);
}

function renderSettings(tab=SETTINGS_ACTIVE_TAB) {
  const root = document.getElementById('view-settings');
  if(!root) return;
  SETTINGS_ACTIVE_TAB = tab || 'general';
  const s = loadSettings();
  root.innerHTML = `
    <style>
      .settings-shell{max-width:1220px;margin:0 auto;display:grid;grid-template-columns:220px minmax(0,1fr);gap:0;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);overflow:hidden;min-height:calc(100vh - 106px)}
      .settings-rail{border-right:1px solid var(--border);background:color-mix(in srgb,var(--surface) 96%,var(--blue-50));padding:18px 10px;display:flex;flex-direction:column;gap:18px}
      .settings-profile{display:flex;align-items:center;gap:10px;padding:4px 8px 14px;border-bottom:1px solid var(--border)}
      .settings-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--blue-50),var(--green-50));color:var(--blue-800);font-weight:800;font-size:12px;border:1px solid var(--blue-100)}
      .settings-profile strong{display:block;font-size:12px;color:var(--text);line-height:1.2}.settings-profile span{display:block;font-size:10px;color:var(--text-3);line-height:1.3;margin-top:2px}
      .settings-nav-group{display:grid;gap:4px}.settings-nav-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.11em;color:var(--text-3);padding:0 10px;margin-bottom:3px}
      .settings-nav-item{display:flex;align-items:center;gap:8px;min-height:34px;border-radius:8px;padding:7px 9px;color:var(--text-2);text-decoration:none;font-size:12px;font-weight:600;border:1px solid transparent;background:transparent;text-align:left;font-family:inherit;cursor:pointer;width:100%;transition:background-color .16s ease,border-color .16s ease,color .16s ease,transform .16s cubic-bezier(.22,1,.36,1),box-shadow .16s ease}
      .settings-nav-item:hover{background:var(--surface-2);color:var(--text);transform:translateX(2px)}.settings-nav-item:active{transform:translateX(2px) scale(.985)}.settings-nav-item.active{background:var(--blue-50);color:var(--blue-800);border-color:var(--blue-100);box-shadow:0 8px 20px color-mix(in srgb,var(--blue) 10%,transparent)}
      .settings-nav-icon{width:16px;height:16px;display:inline-grid;place-items:center;color:currentColor;flex:0 0 auto}.settings-nav-icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .settings-main{min-width:0;padding:22px 22px 78px;background:color-mix(in srgb,var(--surface) 88%,var(--bg))}
      .settings-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:18px}
      .settings-crumb{font-size:12px;font-weight:700;color:var(--text)}.settings-crumb span{color:var(--text-3);font-weight:500;margin-left:5px}.settings-top-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
      .settings-dirty{font-size:11px;color:var(--amber);font-weight:700;display:none}.settings-dirty.is-visible{display:inline;animation:settings-dirty-in .2s cubic-bezier(.22,1,.36,1) both}
      .settings-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;box-shadow:0 1px 0 rgba(255,255,255,.02) inset;margin-bottom:14px;animation:settings-card-in .22s cubic-bezier(.22,1,.36,1) both;transition:border-color .16s ease,box-shadow .18s ease,transform .18s cubic-bezier(.22,1,.36,1)}
      .settings-card:hover{border-color:var(--border-md);box-shadow:0 1px 0 rgba(255,255,255,.025) inset,0 10px 28px color-mix(in srgb,var(--text) 5%,transparent)}
      .settings-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:12px}.settings-panel h3,.settings-card h3{font-size:15px;font-weight:700;margin:0;color:var(--text);letter-spacing:0}.settings-panel p,.settings-card p{font-size:11px;margin:3px 0 0;color:var(--text-3);line-height:1.45}
      .settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.settings-grid-tight{grid-template-columns:1fr 1.45fr}.settings-list{min-height:132px;resize:vertical;line-height:1.45}.settings-route-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .settings-summary-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.settings-summary-row-3{grid-template-columns:repeat(3,minmax(0,1fr))}.settings-summary{min-height:74px;border:1px solid var(--border);background:var(--surface);border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px;animation:settings-card-in .22s cubic-bezier(.22,1,.36,1) both}.settings-summary-mark{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--blue-100);background:var(--blue-50);color:var(--blue-800);font-weight:800}.settings-summary strong{display:block;font-size:18px;line-height:1;color:var(--text)}.settings-summary span{display:block;font-size:10px;color:var(--text-3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .settings-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid var(--border)}.settings-row:last-child{border-bottom:0;padding-bottom:0}.settings-row-title{font-size:13px;font-weight:700;color:var(--text)}.settings-row-note{font-size:11px;color:var(--text-3);line-height:1.45;margin-top:2px}
      .settings-row-stack{grid-template-columns:1fr;align-items:start}.settings-inline-fields{display:grid;grid-template-columns:minmax(180px,1fr) 136px auto;gap:10px;align-items:end}.settings-format-preview{min-height:38px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);padding:7px 10px;display:flex;align-items:center;gap:8px}.settings-format-preview span{font-size:10px;color:var(--text-3);text-transform:uppercase;font-weight:800}.settings-format-preview strong{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--text)}
      .settings-code-format-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.settings-code-format-card{border:1px solid var(--border);border-radius:8px;background:var(--surface-2);padding:12px}
      .settings-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border-radius:999px;transition:transform .16s cubic-bezier(.22,1,.36,1)}.settings-switch:active{transform:scale(.96)}.settings-switch input{position:absolute;opacity:0;pointer-events:none}.settings-switch span{position:relative;width:38px;height:22px;border-radius:999px;background:var(--gray-50);border:1px solid var(--border-md);transition:background .18s ease,border-color .18s ease,box-shadow .18s ease}.settings-switch span::after{content:"";position:absolute;width:16px;height:16px;left:2px;top:2px;border-radius:50%;background:var(--surface);box-shadow:0 1px 4px rgba(0,0,0,.22);transition:transform .2s cubic-bezier(.22,1,.36,1),background-color .18s ease}.settings-switch:hover span{box-shadow:0 0 0 4px var(--focus-ring)}.settings-switch input:checked + span{background:var(--blue);border-color:var(--blue)}.settings-switch input:checked + span::after{transform:translateX(16px)}
      .settings-member-head,.settings-member-row{display:grid;grid-template-columns:74px minmax(120px,1fr) minmax(170px,1.2fr) 130px minmax(160px,1.2fr) 58px 34px;gap:8px;align-items:center}.settings-member-head{font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}.settings-members-list{display:grid;gap:8px}.settings-member-row{padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);transition:border-color .16s ease,background-color .16s ease,transform .16s cubic-bezier(.22,1,.36,1)}.settings-member-row:hover{border-color:var(--blue-100);background:color-mix(in srgb,var(--surface-2) 78%,var(--blue-50))}.settings-member-status{font-size:10px;font-weight:800;color:var(--text-3);transition:color .16s ease}.settings-member-status.is-active{color:var(--green)}
      .settings-project-head,.settings-project-row{display:grid;grid-template-columns:minmax(170px,1.35fr) 104px minmax(116px,1fr) 58px minmax(150px,1.2fr) 34px;gap:8px;align-items:center}.settings-project-head{font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}.settings-project-list{display:grid;gap:8px}.settings-project-row{padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);transition:border-color .16s ease,background-color .16s ease,transform .16s cubic-bezier(.22,1,.36,1)}.settings-project-row:hover{border-color:var(--blue-100);background:color-mix(in srgb,var(--surface-2) 78%,var(--blue-50))}.settings-color-input{width:46px;height:34px;padding:3px;border:1px solid var(--border-md);border-radius:8px;background:var(--surface);cursor:pointer}
      .settings-matrix-wrap{overflow:auto;border:1px solid var(--border);border-radius:8px}.settings-matrix{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;min-width:760px;table-layout:fixed}.settings-matrix-feature-col{width:220px}.settings-matrix-role-col{width:160px}.settings-matrix th,.settings-matrix td{border-bottom:1px solid var(--border);padding:10px;text-align:center;transition:background-color .16s ease}.settings-matrix th:first-child,.settings-matrix td:first-child{text-align:left;background:var(--surface)}.settings-matrix td span{display:block;font-size:10px;color:var(--text-3);font-weight:400;margin-top:2px}.settings-matrix tbody tr:hover td{background:color-mix(in srgb,var(--surface-2) 78%,transparent)}.settings-matrix tbody tr:hover td:first-child{background:var(--surface)}
      .settings-matrix-toggle{min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid transparent;border-radius:8px;padding:5px 8px;cursor:pointer;background:transparent;transition:background-color .16s ease,border-color .16s ease,transform .16s cubic-bezier(.22,1,.36,1),box-shadow .16s ease}.settings-matrix-toggle:hover{background:var(--surface);border-color:var(--blue-100);box-shadow:0 8px 18px color-mix(in srgb,var(--blue) 6%,transparent)}.settings-matrix-toggle:active{transform:scale(.965)}.settings-matrix-toggle span{min-width:20px;font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em}.settings-matrix-toggle[aria-pressed="true"]{background:color-mix(in srgb,var(--blue-50) 70%,transparent);border-color:var(--blue-100)}.settings-matrix-toggle[aria-pressed="true"] span{color:var(--blue-800)}
      .settings-check-input{appearance:none;-webkit-appearance:none;width:18px;height:18px;border:1.5px solid var(--border-md);border-radius:5px;background:var(--surface);display:inline-grid;place-items:center;cursor:pointer;vertical-align:middle;transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s cubic-bezier(.22,1,.36,1);position:relative;flex:0 0 auto}.settings-check-input::after{content:"";width:8px;height:8px;border-radius:3px;background:var(--blue);transform:scale(.35);opacity:0;transition:opacity .14s ease,transform .18s cubic-bezier(.22,1,.36,1)}.settings-check-input:hover{border-color:var(--blue);box-shadow:0 0 0 4px var(--focus-ring)}.settings-check-input:active{transform:scale(.88)}.settings-check-input:checked,.settings-matrix-toggle[aria-pressed="true"] .settings-check-input{background:color-mix(in srgb,var(--blue) 12%,var(--surface));border-color:var(--blue);animation:settings-check-pop .22s cubic-bezier(.22,1,.36,1)}.settings-check-input:checked::after,.settings-matrix-toggle[aria-pressed="true"] .settings-check-input::after{opacity:1;transform:scale(1)}
      .settings-matrix-toggle .settings-check-input::after{content:"";width:8px;height:8px;border:0;border-radius:3px;background:var(--blue);transform:scale(.35);opacity:0}.settings-matrix-toggle[aria-pressed="true"] .settings-check-input::after{opacity:1;transform:scale(1)}
      .settings-role-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.settings-role-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;animation:settings-card-in .22s cubic-bezier(.22,1,.36,1) both}.settings-tabs-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.settings-check{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2);min-height:34px;border:1px solid var(--border);background:var(--surface-2);border-radius:8px;padding:7px 10px;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease,transform .16s cubic-bezier(.22,1,.36,1),box-shadow .16s ease}.settings-check:hover{border-color:var(--blue-100);color:var(--text);background:color-mix(in srgb,var(--surface-2) 76%,var(--blue-50));box-shadow:0 8px 18px color-mix(in srgb,var(--blue) 6%,transparent)}.settings-check:active{transform:scale(.975)}.settings-check:has(.settings-check-input:checked){border-color:var(--blue-100);background:var(--blue-50);color:var(--blue-800)}.settings-mini-label{font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 0}.settings-scope{width:200px;min-width:200px}
      .settings-transition-grid{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;align-items:center;margin-top:8px}.settings-transition-grid label{font-size:11px;font-weight:700;color:var(--text-2)}
      .settings-preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.settings-preview{border:1px solid var(--border);border-radius:8px;background:var(--surface-2);padding:12px}.settings-preview-title{font-size:13px;font-weight:800;color:var(--text);margin-bottom:8px}.settings-preview-line{display:grid;grid-template-columns:58px 1fr;gap:8px;font-size:11px;padding:5px 0;border-top:1px solid var(--border)}.settings-preview-line strong{color:var(--text-3)}.settings-preview-line span{color:var(--text-2);line-height:1.4}
      .settings-placeholder-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.settings-placeholder-grid div{border:1px solid var(--border);border-radius:8px;background:var(--surface-2);padding:14px}.settings-placeholder-grid strong{display:block;color:var(--text);font-size:13px}.settings-placeholder-grid span{display:block;color:var(--text-3);font-size:11px;margin-top:4px;line-height:1.45}
      .settings-actions{display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:0;margin:18px -22px -78px;padding:12px 22px;background:color-mix(in srgb,var(--surface) 92%,transparent);border-top:1px solid var(--border);backdrop-filter:blur(18px)}.settings-icon-btn{width:30px;height:30px;justify-content:center;padding:0}.settings-toast{position:fixed;right:22px;bottom:22px;z-index:1500;background:var(--surface);color:var(--text);border:1px solid var(--border-md);box-shadow:var(--shadow);border-radius:8px;padding:10px 12px;font-size:12px;font-weight:700;opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:opacity .18s,transform .18s cubic-bezier(.22,1,.36,1)}.settings-toast.is-open{opacity:1;transform:translateY(0) scale(1)}.settings-toast-error{border-color:var(--red-200);color:var(--red)}.settings-toast-ok{border-color:var(--green-200);color:var(--green)}
      .settings-pop{animation:settings-control-pop .2s cubic-bezier(.22,1,.36,1)}@keyframes settings-card-in{from{opacity:0;transform:translateY(7px) scale(.995)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes settings-check-pop{0%{transform:scale(.82)}62%{transform:scale(1.13)}100%{transform:scale(1)}}@keyframes settings-control-pop{0%{transform:scale(.985)}65%{transform:scale(1.018)}100%{transform:scale(1)}}@keyframes settings-dirty-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.settings-card,.settings-summary,.settings-role-card,.settings-check-input:checked,.settings-pop,.settings-dirty.is-visible{animation:none!important}.settings-nav-item,.settings-check,.settings-member-row,.settings-card{transition-duration:.01ms!important}}
      @media(max-width:1080px){.settings-shell{grid-template-columns:188px minmax(0,1fr)}.settings-summary-row,.settings-summary-row-3{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-grid{grid-template-columns:1fr}.settings-grid-tight{grid-template-columns:1fr}.settings-member-head,.settings-project-head{display:none}.settings-member-row,.settings-project-row{grid-template-columns:1fr 1fr}.settings-member-status{grid-column:1/-1}}
      @media(max-width:760px){.settings-shell{display:block;min-height:0}.settings-rail{border-right:0;border-bottom:1px solid var(--border)}.settings-main{padding:16px 14px 76px}.settings-top,.settings-panel-head{display:block}.settings-top-actions{justify-content:flex-start;margin-top:12px}.settings-summary-row,.settings-summary-row-3{grid-template-columns:1fr}.settings-route-grid,.settings-placeholder-grid,.settings-inline-fields,.settings-code-format-grid{grid-template-columns:1fr}.settings-member-row,.settings-project-row{grid-template-columns:1fr}.settings-scope{width:100%;min-width:0;margin-top:10px}.settings-actions{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}}
    </style>
    <div class="settings-shell">
      <aside class="settings-rail" aria-label="Settings navigation">
        <div class="settings-profile">
          <div class="settings-avatar">PMO</div>
          <div>
            <strong>PMO ERP</strong>
            <span>Local workspace settings</span>
          </div>
        </div>
        <nav class="settings-nav-group">
          <div class="settings-nav-label">Workspace</div>
          ${[
            ['general', 'General', 'general'],
            ['members', 'Members & Access', 'members'],
            ['roles', 'Roles & Permissions', 'roles'],
            ['resource', 'Resource', 'resource'],
          ].map(([key, label, icon]) => `<button type="button" class="settings-nav-item ${SETTINGS_ACTIVE_TAB === key ? 'active' : ''}" onclick="switchSettingsTab('${key}')">${renderSettingsIcon(icon)} ${label}</button>`).join('')}
        </nav>
        <nav class="settings-nav-group">
          <div class="settings-nav-label">Next</div>
          <button type="button" class="settings-nav-item ${SETTINGS_ACTIVE_TAB === 'later' ? 'active' : ''}" onclick="switchSettingsTab('later')">${renderSettingsIcon('later')} Notifications / UI</button>
        </nav>
      </aside>

      <main class="settings-main">
        <div class="settings-top">
          <div class="settings-crumb">Settings <span>/ ${esc(activeTabTitle(SETTINGS_ACTIVE_TAB))}</span></div>
          <div class="settings-top-actions">
            <span id="settings-dirty" class="settings-dirty">Unsaved changes</span>
            <button class="btn-sm" type="button" onclick="resetSettings()">Reset</button>
            <button class="btn-primary" data-settings-save type="button" onclick="saveSettings()">Save Settings</button>
          </div>
        </div>
        ${renderSettingsPanel(SETTINGS_ACTIVE_TAB, s)}
        <div class="settings-actions">
          <button class="btn-ghost" type="button" onclick="initSettings();renderSettings(SETTINGS_ACTIVE_TAB)">Discard</button>
          <button class="btn-primary" data-settings-save type="button" onclick="saveSettings()">Save Settings</button>
        </div>
      </main>
    </div>`;

  SETTINGS_DIRTY_BASELINE = settingsSnapshot();
  root.oninput = event => {
    markSettingsDirty();
    if(event.target?.id === 'set-resource-row-no-format' || event.target?.id === 'set-resource-row-no-start') updateResourceNoPreview();
    if(event.target?.id?.startsWith('set-resource-emp-')) updateEmployeeCodePreviews();
  };
  root.onchange = event => {
    markSettingsDirty();
    animateSettingsControl(event);
  };
  root.onclick = event => {
    const toggleHost = event.target.closest?.('[data-settings-toggle]');
    if(toggleHost && root.contains(toggleHost)) toggleSettingsCheckbox(event, toggleHost);
    animateSettingsControl(event);
  };
  markSettingsDirty();
}

function readMembersFromDom() {
  return [...document.querySelectorAll('[data-member-row]')].map((row, index) => {
    const get = field => row.querySelector(`[data-member-field="${field}"]`);
    const scopeEl = get('projectScope');
    const projectScope = scopeEl ? [...scopeEl.selectedOptions].map(o => o.value).filter(Boolean) : ['all'];
    return normalizeMember({
      id: row.dataset.memberRow || `member-${index + 1}`,
      name: get('name')?.value || '',
      email: get('email')?.value || '',
      role: get('role')?.value || 'user',
      projectScope: projectScope.includes('all') ? ['all'] : projectScope,
      active: !!get('active')?.checked,
    }, index);
  }).filter(m => m.name || m.email);
}

function readProjectMasterFromDom() {
  return [...document.querySelectorAll('[data-project-row]')].map((row, index) => {
    const get = field => row.querySelector(`[data-project-field="${field}"]`)?.value || '';
    return normalizeProjectMasterItem({
      id: row.dataset.projectRow || '',
      name: get('name'),
      status: get('status'),
      owner: get('owner'),
      color: get('color'),
      note: get('note'),
    }, index);
  }).filter(project => project.name || project.code);
}

function readTransitions(roleKey) {
  const transitions = {};
  SETTINGS_STATUS_OPTIONS.forEach(([status]) => {
    const select = document.querySelector(`[data-role-transition="${roleKey}"][data-status="${status}"]`);
    transitions[status] = select ? [...select.selectedOptions].map(o => o.value) : [];
  });
  return transitions;
}

function collectSettingsFromDom() {
  const current = loadSettings();
  const projectMaster = document.getElementById('settings-project-list') ? normalizeProjectMaster(readProjectMasterFromDom(), current.projects) : current.projectMaster;
  const projectNames = activeProjectNamesFromMaster(projectMaster);
  const roles = {};
  Object.keys(DEFAULT_RESOURCE_ROLE_CONFIG).forEach(key => {
    const prev = current.resource.roles[key];
    const tabInputs = [...document.querySelectorAll(`[data-role-tab="${key}"]`)];
    roles[key] = {
      ...prev,
      label: document.querySelector(`[data-role-label="${key}"]`)?.value?.trim() || prev.label,
      note: document.querySelector(`[data-role-note="${key}"]`)?.value?.trim() || '',
      scope: document.querySelector(`[data-role-scope="${key}"]`)?.value || prev.scope,
      permissions: readRolePermissions(key),
      transitions: document.querySelector(`[data-role-transition="${key}"]`) ? readTransitions(key) : prev.transitions,
      tabs: tabInputs.length ? tabInputs.filter(cb => cb.checked).map(cb => cb.dataset.tab) : prev.tabs,
    };
  });
  return {
    ...current,
    projects: projectNames.length ? projectNames : current.projects,
    projectMaster,
    people: document.getElementById('set-people') ? uniqueCleanLines(document.getElementById('set-people').value, DEFAULT_PEOPLE) : current.people,
    titles: document.getElementById('set-titles') ? uniqueCleanLines(document.getElementById('set-titles').value, DEFAULT_TITLES) : current.titles,
    members: document.getElementById('settings-members-list') ? readMembersFromDom() : current.members,
    defaultReviewer: {
      name: document.getElementById('set-reviewer-name')?.value || current.defaultReviewer.name || '',
      title: document.getElementById('set-reviewer-title')?.value || current.defaultReviewer.title || '',
    },
    defaultApprover: {
      name: document.getElementById('set-approver-name')?.value || current.defaultApprover.name || '',
      title: document.getElementById('set-approver-title')?.value || current.defaultApprover.title || '',
    },
    resource: {
      ...current.resource,
      showRequestId: document.getElementById('set-resource-show-id') ? !!document.getElementById('set-resource-show-id').checked : current.resource.showRequestId,
      rowNoFormat: document.getElementById('set-resource-row-no-format')?.value?.trim() || current.resource.rowNoFormat || '{00}',
      rowNoStart: Math.max(1, Math.floor(Number(document.getElementById('set-resource-row-no-start')?.value || current.resource.rowNoStart || 1))),
      levels: document.getElementById('set-resource-levels') ? uniqueCleanLines(document.getElementById('set-resource-levels').value, DEFAULT_RESOURCE_LEVELS) : current.resource.levels,
      employeeCodeFormats: {
        direct: {
          format: document.getElementById('set-resource-emp-direct-format')?.value?.trim() || current.resource.employeeCodeFormats?.direct?.format || 'DHC-{000}',
          start: Math.max(1, Math.floor(Number(document.getElementById('set-resource-emp-direct-start')?.value || current.resource.employeeCodeFormats?.direct?.start || 1))),
        },
        secondment: {
          format: document.getElementById('set-resource-emp-secondment-format')?.value?.trim() || current.resource.employeeCodeFormats?.secondment?.format || 'SEC-{000}',
          start: Math.max(1, Math.floor(Number(document.getElementById('set-resource-emp-secondment-start')?.value || current.resource.employeeCodeFormats?.secondment?.start || 1))),
        },
      },
      roles,
    },
    notifications: {
      ...current.notifications,
      memoPending: document.getElementById('set-noti-memo') ? !!document.getElementById('set-noti-memo').checked : current.notifications.memoPending,
      resourceApproval: document.getElementById('set-noti-resource') ? !!document.getElementById('set-noti-resource').checked : current.notifications.resourceApproval,
      recruiting: document.getElementById('set-noti-recruiting') ? !!document.getElementById('set-noti-recruiting').checked : current.notifications.recruiting,
      onboarding: document.getElementById('set-noti-onboarding') ? !!document.getElementById('set-noti-onboarding').checked : current.notifications.onboarding,
    },
  };
}

function settingsSnapshot() {
  return JSON.stringify(normalizeSettings(collectSettingsFromDom()));
}

function markSettingsDirty() {
  const dirty = SETTINGS_DIRTY_BASELINE && settingsSnapshot() !== SETTINGS_DIRTY_BASELINE;
  document.getElementById('settings-dirty')?.classList.toggle('is-visible', !!dirty);
  document.querySelectorAll('[data-settings-save]').forEach(btn => { btn.disabled = false; });
}

function validateSettingsDraft(draft) {
  const errors = [];
  const emailSet = new Set();
  const projectNameSet = new Set();
  draft.projectMaster.forEach(project => {
    if(!project.name) errors.push('Every project needs a project name.');
    const name = String(project.name || '').toLowerCase();
    if(name && projectNameSet.has(name)) errors.push(`Duplicate project name: ${project.name}`);
    if(name) projectNameSet.add(name);
  });
  if(!Array.isArray(draft.resource?.levels) || !draft.resource.levels.length) errors.push('Resource needs at least one Level option.');
  draft.members.forEach(member => {
    if(!member.name) errors.push('Every member needs a name.');
    if(!member.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) errors.push(`Invalid email for ${member.name || 'member'}.`);
    if(emailSet.has(member.email)) errors.push(`Duplicate member email: ${member.email}`);
    emailSet.add(member.email);
    if(!draft.resource.roles[member.role]) errors.push(`${member.name || member.email} has an unknown role.`);
    if(!member.projectScope.length) errors.push(`${member.name || member.email} needs at least one project scope.`);
  });
  Object.entries(draft.resource.roles).forEach(([key, role]) => {
    if(!role.label?.trim()) errors.push(`${key} role needs a label.`);
    if(!role.tabs?.length) errors.push(`${role.label || key} needs at least one visible Resource tab.`);
    if(role.scope === 'selected-project' && !draft.members.some(m => m.active && m.role === key && !m.projectScope.includes('all'))) {
      errors.push(`${role.label || key} is project-scoped but has no active project-scoped member.`);
    }
  });
  return [...new Set(errors)];
}

function saveSettings() {
  const draft = normalizeSettings(collectSettingsFromDom());
  const errors = validateSettingsDraft(draft);
  if(errors.length) {
    showSettingsToast(errors[0], 'error');
    return null;
  }
  const next = storeSettings(draft);
  refreshSettingsConsumers();
  renderSettings(SETTINGS_ACTIVE_TAB);
  showSettingsToast('Settings saved locally.', 'ok');
  return next;
}
