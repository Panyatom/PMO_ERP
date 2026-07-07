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
    if(toStatus === 'approved') return hasPermission(roles, role, 'approve') || (RECRUITING.includes(fromStatus) && hasPermission(roles, role, 'recruit'));
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

  function allowedStatusChoicesForRecord(record, role, roles, options={}) {
    const current = record?.status || '';
    let choices = allowedNextForRecord(record, role, roles, options);
    if(role === 'pmo' || hasPermission(roles, role, 'approve')) {
      const allStatuses = options.allStatuses?.length ? options.allStatuses : Object.keys(DEFAULT_STATUS_FLOW);
      choices = allStatuses.filter(status => (
        status !== current &&
        status !== 'document' &&
        canUseStatusTransition(roles, role, current, status)
      ));
    } else if(hasPermission(roles, role, 'recruit')) {
      choices = ['approved','sourcing','interviewing','offer','filled']
        .filter(status => status !== current && canUseStatusTransition(roles, role, current, status));
    }
    if(record?.status === 'pending') {
      choices = choices.filter(next => requiresPreApprovalDocs(record.hiringType) ? next !== 'approved' : next !== 'pendingDocs');
    }
    return [...new Set(choices)].filter(Boolean);
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

  function canHaveOnboardDate(status) {
    return ['filled','resolved','mitigated'].includes(String(status || ''));
  }

  function effectiveOnboardDate(record) {
    return canHaveOnboardDate(record?.status) ? (record?.onboardDate || '') : '';
  }

  function rebalancePrimaryAllocationForCodes(codes) {
    const used = (codes || []).reduce((sum, code) => {
      const allocation = Number(code?.allocation || 0);
      return sum + (Number.isFinite(allocation) && allocation > 0 ? allocation : 0);
    }, 0);
    return {
      extraAllocation: Math.min(100, Math.max(0, used)),
      primaryAllocation: Math.max(0, 100 - used),
      isValid: used <= 100,
    };
  }

  function resourcePersonName(record) {
    return String(record?.resourceNameTh || record?.resourceNameEn || record?.resourceName || record?.requesterName || record?.position || '').trim();
  }

  function resourceEmployeeCode(record) {
    return String(record?.employeeCode || record?.employee_code || '').trim();
  }

  function primaryAllocation(record) {
    const explicit = Number(record?.allocationPercent || 0);
    if(Number.isFinite(explicit) && explicit > 0) return Math.min(100, Math.max(0, explicit));
    return rebalancePrimaryAllocationForCodes(record?.projectCodes || []).primaryAllocation;
  }

  function primaryProjectCode(record) {
    return String(record?.primaryProjectCode || record?.projectCode || '').trim();
  }

  function timelineRoleKey(recordOrText) {
    const text = typeof recordOrText === 'string'
      ? recordOrText
      : [recordOrText?.resourceTeam, recordOrText?.position, recordOrText?.level].filter(Boolean).join(' ');
    const raw = String(text || '').toLowerCase();
    if(/\b(sa|system analyst|solution analyst)\b/.test(raw)) return 'sa';
    if(/\b(ba|business analyst)\b/.test(raw)) return 'ba';
    if(/\b(qa|qc|tester|test engineer)\b/.test(raw)) return 'qa';
    if(/\b(pm|pmo|project manager|scrum master)\b/.test(raw)) return 'pm';
    if(/\b(dev|developer|engineer|programmer|frontend|front-end|backend|back-end|fullstack|full stack|fe|be)\b/.test(raw)) return 'dev';
    return 'other';
  }

  function timelineRoleLabel(key) {
    return ({ dev:'Dev', ba:'BA', sa:'SA', qa:'QA', pm:'PM/PMO', other:'Other' })[key] || key || 'Other';
  }

  function employeeTypeKey(hiringType) {
    const kind = hiringKind(hiringType);
    if(kind === 'direct') return 'dhc';
    if(kind === 'secondment') return 'sec';
    if(kind === 'subcon') return 'subcon';
    return 'other';
  }

  function employeeTypeLabel(key) {
    return ({ dhc:'DHC', sec:'SEC', subcon:'Sub Con', other:'Other' })[key] || key || 'Other';
  }

  function personKey(record) {
    return resourceEmployeeCode(record) || resourcePersonName(record).toLowerCase() || record?.id || '';
  }

  function timelineItemGroups(list, mode='all') {
    const groups = new Map();
    (list || []).forEach(record => {
      if(!canHaveOnboardDate(record?.status)) return;
      const items = [];
      if(mode === 'all') {
        items.push({
          requestId: record.id,
          project: record.project,
          code: primaryProjectCode(record),
          allocation: primaryAllocation(record),
          startDate: effectiveOnboardDate(record) || record.startDate || record.requestDate || '',
          endDate: record.offboardDate || record.resolvedDate || record.endDate || '',
          hiringType: record.hiringType,
          source: record.transferFrom ? 'Transfer' : 'Primary',
        });
      }
      (record.projectCodes || []).forEach(code => items.push({
        requestId: record.id,
        project: code.project,
        code: code.code,
        allocation: Number(code.allocation || 0),
        startDate: code.startDate || code.at || effectiveOnboardDate(record) || record.startDate || '',
        endDate: code.endDate || record.offboardDate || record.resolvedDate || record.endDate || '',
        hiringType: record.hiringType,
        source: 'Project Code',
      }));
      if(!items.length) return;
      const key = personKey(record);
      if(!groups.has(key)) {
        groups.set(key, {
          key,
          person: resourcePersonName(record),
        employeeCode: resourceEmployeeCode(record),
        position: record.position,
        team: record.resourceTeam,
        level: record.level,
        hiringType: record.hiringType,
        roleKey: timelineRoleKey(record),
        employeeTypeKey: employeeTypeKey(record.hiringType),
        items: [],
      });
    }
      groups.get(key).items.push(...items);
    });
    return [...groups.values()].sort((a,b)=>String(a.person).localeCompare(String(b.person)));
  }

  function resolveProjectAccentColor(projectName, projectMaster=[]) {
    const name = String(projectName || '').trim().toLowerCase();
    const item = (projectMaster || []).find(project => (
      String(project?.name || '').trim().toLowerCase() === name ||
      String(project?.code || '').trim().toLowerCase() === name
    ));
    const color = String(item?.color || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#8dd7cf';
  }

  function projectTextColor(hex) {
    const raw = String(hex || '').replace('#', '');
    if(!/^[0-9a-f]{6}$/i.test(raw)) return '#0f172a';
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return ((r * 299 + g * 587 + b * 114) / 1000) > 150 ? '#0f172a' : '#fff';
  }

  function applyTimelineFilters(groups, filters={}) {
    const project = String(filters.project || '').trim().toLowerCase();
    const role = String(filters.role || '').trim();
    const type = String(filters.type || '').trim();
    return (groups || []).flatMap(group => {
      if(role && group.roleKey !== role) return [];
      if(type && group.employeeTypeKey !== type) return [];
      const items = project
        ? (group.items || []).filter(item => String(item.project || '').trim().toLowerCase() === project)
        : (group.items || []);
      return items.length ? [{ ...group, items }] : [];
    });
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
    allowedStatusChoicesForRecord,
    visibleToRole,
    canViewTab,
    requiresCancelReason,
    canHaveOnboardDate,
    effectiveOnboardDate,
    rebalancePrimaryAllocationForCodes,
    timelineRoleKey,
    timelineRoleLabel,
    employeeTypeKey,
    employeeTypeLabel,
    timelineItemGroups,
    applyTimelineFilters,
    resolveProjectAccentColor,
    projectTextColor,
  };
});
