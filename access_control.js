// access_control.js - shared functional roles, page visibility, and action permissions
(function accessControlFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PMO_ACCESS = api;
    root.pmoEffectiveRoles = function pmoEffectiveRoles(session) {
      const currentSession = session || (typeof root.pmoCurrentSession === 'function' ? root.pmoCurrentSession() : null);
      let member = null;
      if (currentSession?.roleSource !== 'session' && typeof root.settingsMemberByEmail === 'function') {
        member = root.settingsMemberByEmail(currentSession?.user?.email || '');
      }
      return api.effectiveRoleKeys(currentSession, member);
    };
    root.pmoCanViewPage = function pmoCanViewPage(pageId, session) {
      const settings = typeof root.loadSettings === 'function' ? root.loadSettings() : null;
      return api.canViewPage(root.pmoEffectiveRoles(session), pageId, settings);
    };
    root.pmoCan = function pmoCan(permission, session) {
      return api.can(root.pmoEffectiveRoles(session), permission);
    };
    root.pmoRoleLabel = api.roleLabel;
  }
})(typeof window !== 'undefined' ? window : globalThis, function createAccessControl() {
  const PAGE_DEFINITIONS = [
    ['create', 'Create Memo'],
    ['pending', 'Pending Approval'],
    ['history', 'Memo History'],
    ['budget', 'Budget'],
    ['cost', 'Cost'],
    ['license', 'License'],
    ['device', 'Device Management'],
    ['resource', 'Resource'],
    ['log', 'Transaction Log'],
    ['settings', 'Settings'],
  ];

  const ROLE_TEMPLATES = {
    employee: {
      label: 'Employee / Requester',
      shortLabel: 'Employee',
      description: 'Create requests and follow their own work.',
      pages: ['create', 'history', 'resource'],
      actions: ['resource.create', 'resource.edit-own'],
      resourceProfile: 'user',
    },
    project_manager: {
      label: 'Project Manager (PM)',
      shortLabel: 'PM',
      description: 'Manage project requests, budget, cost, and resource visibility.',
      inherits: ['employee'],
      pages: ['pending', 'budget', 'cost'],
      actions: ['memo.review', 'budget.manage', 'budget.export', 'resource.view-project'],
      resourceProfile: 'project_manager',
    },
    approval_authority: {
      label: 'Approval Authority (AA)',
      shortLabel: 'AA',
      description: 'Review and approve assigned memos within authority.',
      inherits: ['employee'],
      pages: ['pending'],
      actions: ['memo.review', 'memo.approve-assigned'],
      resourceProfile: 'user',
    },
    pmo_admin: {
      label: 'PMO Admin',
      shortLabel: 'PMO',
      description: 'Operate all PMO modules and workflow configuration.',
      inherits: ['employee'],
      pages: PAGE_DEFINITIONS.map(([id]) => id),
      actions: ['memo.manage', 'budget.manage', 'budget.export', 'license.manage', 'license.export', 'device.manage', 'device.inspect', 'device.export', 'resource.manage', 'settings.manage-access', 'audit.view'],
      resourceProfile: 'pmo',
    },
    hr_operations: {
      label: 'HR Operations',
      shortLabel: 'HR',
      description: 'Manage employee directory, assignment, and offboarding workflows.',
      inherits: ['employee'],
      pages: ['resource'],
      actions: ['resource.manage-people', 'resource.transfer', 'resource.offboard', 'resource.import-employees'],
      resourceProfile: 'hr_operations',
    },
    it_asset_admin: {
      label: 'IT Asset Admin',
      shortLabel: 'IT',
      description: 'Manage devices, purchase orders, and software licenses.',
      inherits: ['employee'],
      pages: ['device', 'license'],
      actions: ['device.manage', 'device.inspect', 'device.export', 'license.manage', 'license.export'],
      resourceProfile: 'user',
    },
    device_qa: {
      label: 'Device QA / Inspector',
      shortLabel: 'Device QA',
      description: 'Inspect device records and quality status without master-data administration.',
      inherits: ['employee'],
      pages: ['device'],
      actions: ['device.inspect', 'device.export'],
      resourceProfile: 'user',
    },
    finance_budget: {
      label: 'Finance / Budget Controller',
      shortLabel: 'Finance',
      description: 'Maintain budget and cost information and export finance reports.',
      inherits: ['employee'],
      pages: ['budget', 'cost'],
      actions: ['budget.manage', 'budget.export'],
      resourceProfile: 'user',
    },
    recruiter: {
      label: 'Recruiter / BBIK',
      shortLabel: 'Recruiter',
      description: 'Advance approved resource requests through the recruiting pipeline.',
      pages: ['resource'],
      actions: ['resource.recruit'],
      resourceProfile: 'bbik',
    },
    system_admin: {
      label: 'System Admin',
      shortLabel: 'System Admin',
      description: 'Administer members, access, system settings, and audit logs.',
      inherits: ['employee'],
      pages: ['log', 'settings'],
      actions: ['settings.manage-access', 'audit.view'],
      resourceProfile: 'user',
    },
    auditor: {
      label: 'Auditor (Read only)',
      shortLabel: 'Auditor',
      description: 'Read historical, financial, resource, and audit information.',
      pages: ['history', 'budget', 'cost', 'resource', 'log'],
      actions: ['budget.export', 'audit.view', 'resource.audit'],
      resourceProfile: 'auditor',
    },
    executive_viewer: {
      label: 'Executive Viewer',
      shortLabel: 'Executive',
      description: 'Read management summaries without operational actions.',
      pages: ['history', 'budget', 'cost', 'resource'],
      actions: ['budget.export', 'resource.executive-view'],
      resourceProfile: 'executive_viewer',
    },
  };

  const LEGACY_ROLE_ALIASES = {
    user: 'employee',
    pmo: 'pmo_admin',
    bbik: 'recruiter',
    pm: 'project_manager',
    aa: 'approval_authority',
    hr: 'hr_operations',
    it: 'it_asset_admin',
    qa: 'device_qa',
    finance: 'finance_budget',
    admin: 'system_admin',
  };

  const RESOURCE_PROFILES = {
    user: {
      label: 'Requester', note: 'Selected project only', scope: 'selected-project', tabs: ['request'],
      permissions: { createRequest:true, editPending:true, cancelPending:true, resolveFilled:true },
    },
    project_manager: {
      label: 'Project Manager', note: 'Project resource visibility', scope: 'selected-project', tabs: ['request', 'people', 'timeline'],
      permissions: { createRequest:true, editPending:true, cancelPending:true, resolveFilled:true },
    },
    pmo: {
      label: 'PMO Admin', note: 'All projects and internal operations', scope: 'all', tabs: ['request', 'people', 'timeline', 'transfer', 'code'],
      permissions: { createRequest:true, editPending:true, cancelPending:true, resolveFilled:true, approve:true, transfer:true, projectCode:true, offboard:true, deleteRequest:true, importEmployees:true, importProjectCodes:true },
    },
    hr_operations: {
      label: 'HR Operations', note: 'Employee lifecycle operations', scope: 'all', tabs: ['request', 'people', 'timeline', 'transfer'],
      permissions: { transfer:true, offboard:true, importEmployees:true },
    },
    bbik: {
      label: 'Recruiter / BBIK', note: 'Approved recruiting pipeline only', scope: 'bbik-pipeline', tabs: ['request'],
      permissions: { recruit:true },
    },
    auditor: {
      label: 'Auditor', note: 'Read-only resource access', scope: 'all', tabs: ['request', 'people', 'timeline', 'transfer', 'code'], permissions: {},
    },
    executive_viewer: {
      label: 'Executive Viewer', note: 'Management resource summary', scope: 'all', tabs: ['people', 'timeline'], permissions: {},
    },
  };

  function normalizeRoleKey(value) {
    const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const canonical = LEGACY_ROLE_ALIASES[key] || key;
    return ROLE_TEMPLATES[canonical] ? canonical : '';
  }

  function normalizeRoleKeys(value, fallback='employee') {
    const source = Array.isArray(value) ? value : [value];
    const roles = [...new Set(source.map(normalizeRoleKey).filter(Boolean))];
    if (roles.length) return roles;
    const normalizedFallback = normalizeRoleKey(fallback);
    return [normalizedFallback || 'employee'];
  }

  function inheritedValues(roleKey, property, visited=new Set()) {
    const role = normalizeRoleKey(roleKey);
    if (!role || visited.has(role)) return [];
    visited.add(role);
    const template = ROLE_TEMPLATES[role];
    const inherited = (template.inherits || []).flatMap(parent => inheritedValues(parent, property, visited));
    return [...new Set([...inherited, ...(template[property] || [])])];
  }

  function defaultPagesForRole(roleKey) {
    return inheritedValues(roleKey, 'pages');
  }

  function actionsForRole(roleKey) {
    return inheritedValues(roleKey, 'actions');
  }

  function rolePages(roleKey, settings) {
    const role = normalizeRoleKey(roleKey);
    const configured = settings?.access?.rolePages;
    if (role && configured && Object.prototype.hasOwnProperty.call(configured, role)) {
      const knownPages = new Set(PAGE_DEFINITIONS.map(([id]) => id));
      return [...new Set((Array.isArray(configured[role]) ? configured[role] : []).filter(page => knownPages.has(page)))];
    }
    return defaultPagesForRole(role);
  }

  function canViewPage(roleKeys, pageId, settings) {
    const page = String(pageId || '').trim();
    if (!PAGE_DEFINITIONS.some(([id]) => id === page)) return false;
    return normalizeRoleKeys(roleKeys).some(role => rolePages(role, settings).includes(page));
  }

  function can(roleKeys, permission) {
    const target = String(permission || '').trim();
    return normalizeRoleKeys(roleKeys).some(role => actionsForRole(role).includes(target));
  }

  function effectiveRoleKeys(session, member) {
    if (member?.active !== false && Array.isArray(member?.roles) && member.roles.length) return normalizeRoleKeys(member.roles);
    if (Array.isArray(session?.roles) && session.roles.length) return normalizeRoleKeys(session.roles);
    return normalizeRoleKeys(session?.role || 'employee');
  }

  function roleLabel(roleKey, short=false) {
    const role = normalizeRoleKey(roleKey);
    return role ? (short ? ROLE_TEMPLATES[role].shortLabel : ROLE_TEMPLATES[role].label) : String(roleKey || 'Unknown');
  }

  function legacyRoleFor(roleKey) {
    const role = normalizeRoleKey(roleKey);
    if (role === 'pmo_admin') return 'pmo';
    if (role === 'recruiter') return 'bbik';
    return 'user';
  }

  function resourceProfileForRole(roleKey) {
    const role = normalizeRoleKey(roleKey);
    const profileKey = ROLE_TEMPLATES[role]?.resourceProfile || 'user';
    const profile = RESOURCE_PROFILES[profileKey] || RESOURCE_PROFILES.user;
    return JSON.parse(JSON.stringify(profile));
  }

  function primaryResourceRole(roleKeys) {
    const priority = ['pmo_admin', 'hr_operations', 'project_manager', 'recruiter', 'auditor', 'executive_viewer', 'it_asset_admin', 'device_qa', 'finance_budget', 'approval_authority', 'system_admin', 'employee'];
    const roles = normalizeRoleKeys(roleKeys);
    return priority.find(role => roles.includes(role)) || roles[0] || 'employee';
  }

  function defaultRolePages() {
    return Object.fromEntries(Object.keys(ROLE_TEMPLATES).map(role => [role, defaultPagesForRole(role)]));
  }

  return {
    PAGE_DEFINITIONS,
    ROLE_TEMPLATES,
    LEGACY_ROLE_ALIASES,
    RESOURCE_PROFILES,
    normalizeRoleKey,
    normalizeRoleKeys,
    defaultPagesForRole,
    defaultRolePages,
    rolePages,
    canViewPage,
    can,
    effectiveRoleKeys,
    roleLabel,
    legacyRoleFor,
    resourceProfileForRole,
    primaryResourceRole,
  };
});
