// Pure resource business-flow helpers shared by the browser UI and Node tests.
(function(root, factory) {
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMO_RESOURCE_FLOW = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BBIK_VISIBLE = ['approved','sourcing','interviewing','offer','filled'];
  const RECRUITING = ['sourcing','interviewing','offer'];
  const DEFAULT_CANCEL_REASONS = [
    'Requirement changed',
    'Duplicate request',
    'Headcount / budget not approved',
    'Position no longer needed',
    'Candidate / resource unavailable',
    'Timeline postponed',
    'Other',
  ];

  const DEFAULT_STATUS_FLOW = {
    pending:      { pmo:['pendingDocs','approved','cancelled'], user:['cancelled'] },
    pendingDocs:  { pmo:['approved','cancelled'] },
    approved:     { bbik:['sourcing'], pmo:['cancelled'] },
    sourcing:     { bbik:['interviewing'], pmo:['cancelled'] },
    interviewing: { bbik:['offer'], pmo:['cancelled'] },
    offer:        { bbik:['filled','interviewing','sourcing'], pmo:['cancelled'] },
    document:     { pmo:['filled'] },
    filled:       { pmo:['resolved'], user:['resolved'] },
    mitigated:    {},
    resolved:     {},
    cancelled:    {},
  };

  function createDefaultResourceRoles(labels={ user:'Requester', pmo:'PMO / Dir', bbik:'BBIK' }) {
    return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, {
      label,
      note: '',
      scope: key === 'user' ? 'selected-project' : key === 'bbik' ? 'bbik-pipeline' : 'all',
      tabs: key === 'bbik' || key === 'user' ? ['request'] : ['request','people','timeline','transfer','code'],
      permissions: {
        createRequest: key === 'user' || key === 'pmo',
        editPending: key === 'user' || key === 'pmo',
        cancelPending: key === 'user' || key === 'pmo',
        resolveFilled: key === 'user' || key === 'pmo',
        approve: key === 'pmo',
        recruit: key === 'bbik',
        transfer: key === 'pmo',
        projectCode: key === 'pmo',
        offboard: key === 'pmo',
        deleteRequest: key === 'pmo',
        importEmployees: key === 'pmo',
        importProjectCodes: key === 'pmo',
      },
      transitions: Object.fromEntries(Object.entries(DEFAULT_STATUS_FLOW)
        .map(([status, byRole]) => [status, byRole[key] || []])),
    }]));
  }

  function roleConfig(roles, role, fallback='pmo') {
    return roles?.[role] || roles?.[fallback] || { label: role || fallback, permissions: {}, transitions: {}, tabs: ['request'], scope: 'all' };
  }

  function hasPermission(roles, role, permission) {
    return !!roleConfig(roles, role).permissions?.[permission];
  }

  function canUseStatusTransition(roles, role, fromStatus, toStatus) {
    if(toStatus === 'approved') return hasPermission(roles, role, 'approve');
    if(RECRUITING.includes(toStatus)) return hasPermission(roles, role, 'recruit') || hasPermission(roles, role, 'approve');
    if(toStatus === 'filled') return hasPermission(roles, role, 'approve') || hasPermission(roles, role, 'resolveFilled') || hasPermission(roles, role, 'recruit');
    if(toStatus === 'resolved') return hasPermission(roles, role, 'resolveFilled');
    if(toStatus === 'cancelled') return hasPermission(roles, role, 'cancelPending') || hasPermission(roles, role, 'approve');
    return true;
  }

  function allowedNext(status, role, roles, statusFlow=DEFAULT_STATUS_FLOW, hasSettings=false, allStatuses=[]) {
    const cfg = roleConfig(roles, role);
    const customMap = cfg.transitions || {};
    let nexts = [];
    if(Array.isArray(customMap[status])) nexts = customMap[status];
    else if(!hasSettings && role === 'pmo' && allStatuses.length) nexts = allStatuses.filter(s => s !== status);
    else if(!hasSettings && statusFlow[status]?.[role]) nexts = statusFlow[status][role];
    return [...nexts].filter(next => canUseStatusTransition(roles, role, status, next));
  }

  function hiringKind(value) {
    const raw = String(value || '').toLowerCase();
    if(raw.includes('secondment')) return 'secondment';
    if(raw.includes('sub-contract') || raw.includes('sub con') || raw.includes('subcon')) return 'subcon';
    return 'direct';
  }

  function requiresPreApprovalDocs(value) {
    return ['direct', 'secondment'].includes(hiringKind(value));
  }

  function allowedNextForRecord(record, role, roles, options={}) {
    const nexts = allowedNext(record?.status, role, roles, options.statusFlow, options.hasSettings, options.allStatuses);
    if(!record || record.status !== 'pending') return nexts;
    return nexts.filter(next => requiresPreApprovalDocs(record.hiringType) ? next !== 'approved' : next !== 'pendingDocs');
  }

  function visibleToRole(list, role, roles, selectedProject='') {
    const scope = roleConfig(roles, role).scope;
    if(scope === 'bbik-pipeline') return list.filter(r => BBIK_VISIBLE.includes(r.status));
    if(scope === 'selected-project') return selectedProject ? list.filter(r => r.project === selectedProject) : list;
    return list;
  }

  function canViewTab(roles, role, tab) {
    return (roleConfig(roles, role).tabs || ['request']).includes(tab);
  }

  function requiresCancelReason(toStatus) {
    return toStatus === 'cancelled';
  }

  return {
    BBIK_VISIBLE,
    DEFAULT_CANCEL_REASONS,
    DEFAULT_STATUS_FLOW,
    createDefaultResourceRoles,
    roleConfig,
    hasPermission,
    canUseStatusTransition,
    allowedNext,
    hiringKind,
    requiresPreApprovalDocs,
    allowedNextForRecord,
    visibleToRole,
    canViewTab,
    requiresCancelReason,
  };
});
