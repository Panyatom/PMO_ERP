/* Shared workspace UX: role-aware Action Center, consistent page headers,
   named filter views, and a common detail-drawer treatment. */
(function (root) {
  'use strict';

  const SAVED_VIEWS_KEY = 'orbit-pmo-saved-views-v1';
  const LAST_FILTERS_KEY = 'orbit-pmo-last-filters-v1';
  const FILTER_PAGES = new Set(['pending', 'history', 'budget', 'license', 'device', 'resource', 'log']);
  const PAGE_META = {
    home:     ['Action Center', 'Work that needs your attention, based on your assigned roles.'],
    create:   ['Create Memo', 'Prepare and submit a new memo with the required supporting information.'],
    pending:  ['Pending Approval', 'Review memos waiting for an approval decision.'],
    history:  ['Memo History', 'Find submitted memos and follow their latest status.'],
    budget:   ['Budget & Spend', 'Track approved budgets, actual spend, and remaining balance.'],
    license:  ['License Management', 'Manage software ownership, renewal, seats, and cost.'],
    device:   ['Device Management', 'Track assets, assignment, QA readiness, and warranty.'],
    resource: ['Resource Management', 'Manage requests, recruiting, people, and assignments.'],
    log:      ['Transaction Log', 'Review important activity across the workspace.'],
    settings: ['Settings', 'Manage workspace access, behavior, and shared configuration.']
  };

  let activePage = 'home';
  let actionItems = [];
  let applyingFilters = false;
  let filterTimer = 0;
  const restoredPages = new Set();

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[ch]);
  }

  function safeArray(loader) {
    try { return typeof loader === 'function' ? (loader() || []) : []; }
    catch (_) { return []; }
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function summarizeWorkspaceData(data, nowValue) {
    const memos = Array.isArray(data && data.memos) ? data.memos : [];
    const devices = Array.isArray(data && data.devices) ? data.devices : [];
    const resources = Array.isArray(data && data.resources) ? data.resources : [];
    const now = parseDate(nowValue) || new Date();
    const warrantyLimit = new Date(now.getTime() + (30 * 86400000));
    const openStatuses = new Set(['pending', 'approved', 'sourcing', 'interviewing', 'offer', 'document']);
    const recruitingStatuses = new Set(['approved', 'sourcing', 'interviewing', 'offer']);

    return {
      pendingMemos: memos.filter(m => String(m.status || 'pending').toLowerCase().startsWith('pending')).length,
      draftMemos: memos.filter(m => String(m.status || '').toLowerCase() === 'draft').length,
      unbudgetedMemos: memos.filter(m => {
        const status = String(m.status || '').toLowerCase();
        return ['approved', 'completed', 'done'].includes(status) && !m.budgetSource && !m.finalBudgetPoolId;
      }).length,
      deviceInspection: devices.filter(d => !d.qaOwner || !d.photoUrl).length,
      devicePhotosMissing: devices.filter(d => !d.photoUrl).length,
      availableDevices: devices.filter(d => ['available', 'stock', 'ready'].includes(String(d.status || '').toLowerCase())).length,
      assignedDevices: devices.filter(d => ['assigned', 'in-use', 'in_use', 'active'].includes(String(d.status || '').toLowerCase())).length,
      warrantyAttention: devices.filter(d => {
        const warranty = parseDate(d.warranty || d.warrantyEnd || d.warrantyEndDate);
        return warranty && warranty <= warrantyLimit;
      }).length,
      openResources: resources.filter(r => openStatuses.has(String(r.status || '').toLowerCase())).length,
      pendingResources: resources.filter(r => String(r.status || '').toLowerCase() === 'pending').length,
      recruitingResources: resources.filter(r => recruitingStatuses.has(String(r.status || '').toLowerCase())).length,
      onboardingResources: resources.filter(r => String(r.status || '').toLowerCase() === 'document').length,
      activePeople: resources.filter(r => ['filled', 'active', 'onboarded'].includes(String(r.status || '').toLowerCase())).length
    };
  }

  function normalizeWorkspaceFilterState(state) {
    const output = {};
    if (!state || typeof state !== 'object' || Array.isArray(state)) return output;
    Object.keys(state).forEach(id => {
      const item = state[id];
      if (!item || typeof item !== 'object') return;
      const kind = ['multiple', 'checkbox', 'value'].includes(item.kind) ? item.kind : 'value';
      let value = item.value;
      if (kind === 'multiple') value = Array.isArray(value) ? value.map(String).slice(0, 100) : [];
      else if (kind === 'checkbox') value = Boolean(value);
      else value = value == null ? '' : String(value).slice(0, 1000);
      output[String(id).slice(0, 120)] = { kind, value };
    });
    return output;
  }

  function roleKeys() {
    try {
      const roles = typeof root.pmoEffectiveRoles === 'function' ? root.pmoEffectiveRoles() : [];
      return Array.isArray(roles) && roles.length ? roles : ['employee'];
    } catch (_) { return ['employee']; }
  }

  function roleLabel(role) {
    try { return typeof root.pmoRoleLabel === 'function' ? root.pmoRoleLabel(role) : role; }
    catch (_) { return role; }
  }

  function hasRole(roles, values) { return values.some(value => roles.includes(value)); }
  function canPage(page) {
    try { return page === 'home' || typeof root.pmoCanViewPage !== 'function' || root.pmoCanViewPage(page); }
    catch (_) { return true; }
  }
  function can(permission) {
    try { return typeof root.pmoCan !== 'function' || root.pmoCan(permission); }
    catch (_) { return false; }
  }
  function canCreateResource() { return can('resource.create') || can('resource.manage'); }

  function kpisForRoles(summary, roles) {
    if (hasRole(roles, ['device_qa'])) return [
      ['Needs QA check', summary.deviceInspection, 'Devices missing QA owner or photo', 'device'],
      ['Photos missing', summary.devicePhotosMissing, 'Evidence still incomplete', 'device'],
      ['In use', summary.assignedDevices, 'Assigned or active devices', 'device'],
      ['Warranty attention', summary.warrantyAttention, 'Expired or due within 30 days', 'device']
    ];
    if (hasRole(roles, ['it_asset_admin'])) return [
      ['Available devices', summary.availableDevices, 'Ready for assignment', 'device'],
      ['In use', summary.assignedDevices, 'Assigned or active devices', 'device'],
      ['Warranty attention', summary.warrantyAttention, 'Expired or due within 30 days', 'device'],
      ['Needs QA check', summary.deviceInspection, 'Asset records to complete', 'device']
    ];
    if (hasRole(roles, ['hr_operations', 'recruiter'])) return [
      ['Open requests', summary.openResources, 'Across approval and recruiting', 'resource'],
      ['Pending approval', summary.pendingResources, 'Requests awaiting decision', 'resource'],
      ['Recruiting', summary.recruitingResources, 'Sourcing through offer', 'resource'],
      ['Onboarding', summary.onboardingResources, 'Documents ready to confirm', 'resource']
    ];
    if (hasRole(roles, ['finance_budget'])) return [
      ['Unbudgeted memos', summary.unbudgetedMemos, 'Approved work needing a budget source', 'budget'],
      ['Pending memos', summary.pendingMemos, 'Approval work in progress', 'pending'],
      ['Open resources', summary.openResources, 'Potential people cost impact', 'resource'],
      ['Draft memos', summary.draftMemos, 'Not submitted yet', 'history']
    ];
    if (hasRole(roles, ['pmo_admin', 'system_admin', 'project_manager', 'approval_authority'])) return [
      ['Pending memos', summary.pendingMemos, 'Waiting in the approval flow', 'pending'],
      ['Open resources', summary.openResources, 'Requests and recruiting in progress', 'resource'],
      ['Unbudgeted memos', summary.unbudgetedMemos, 'Approved work without budget mapping', 'budget'],
      ['Device follow-up', summary.deviceInspection, 'Asset records needing completion', 'device']
    ];
    return [
      ['Draft memos', summary.draftMemos, 'Continue where you left off', 'history'],
      ['Pending memos', summary.pendingMemos, 'Submitted and in progress', 'history'],
      ['Open requests', summary.openResources, 'Resource work in progress', 'resource'],
      ['Active people', summary.activePeople, 'Filled or onboarded records', 'resource']
    ];
  }

  function navigate(page, title) {
    const el = document.querySelector(`.sb-item[onclick*="'${page}'"], .sb-sub-item[onclick*="'${page}'"]`);
    if (typeof root.swView === 'function') root.swView(page, el, title || (PAGE_META[page] || [page])[0]);
  }

  function buildActionItems(summary) {
    const items = safeArray(root.collectNotifications).slice(0, 20);
    if (canPage('device') && summary.deviceInspection) items.push({
      id: 'workspace:device-qa', kind: 'device', priority: 24,
      title: `${summary.deviceInspection} device records need QA follow-up`,
      note: 'Complete the QA owner and evidence photo before handover.',
      action: () => navigate('device')
    });
    if (canPage('device') && summary.warrantyAttention) items.push({
      id: 'workspace:warranty', kind: 'device', priority: 18,
      title: `${summary.warrantyAttention} warranties need attention`,
      note: 'Expired or ending within the next 30 days.',
      action: () => navigate('device')
    });
    if (canPage('budget') && summary.unbudgetedMemos) items.push({
      id: 'workspace:unbudgeted', kind: 'budget', priority: 20,
      title: `${summary.unbudgetedMemos} approved memos need budget mapping`,
      note: 'Assign a budget source to keep spend reporting complete.',
      action: () => navigate('budget')
    });
    return items.sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 8);
  }

  function renderActionCenter() {
    const host = document.getElementById('action-center-root');
    if (!host) return;
    const roles = roleKeys();
    const data = {
      memos: safeArray(root.loadMemos),
      devices: safeArray(root.loadDevices),
      resources: safeArray(root.loadResources)
    };
    const summary = summarizeWorkspaceData(data, new Date());
    const kpis = kpisForRoles(summary, roles).filter(kpi => canPage(kpi[3]));
    actionItems = buildActionItems(summary);
    const quickActions = [
      canPage('create') ? ['Create memo', 'Start a new request for approval', 'create', 'primary'] : null,
      canPage('pending') ? ['Review approvals', 'See memos waiting for a decision', 'pending', ''] : null,
      canPage('device') && can('device.manage') ? ['Add device', 'Register a new hardware asset', 'device', 'device'] : null,
      canPage('resource') ? (canCreateResource()
        ? ['Resource request', 'Start a new people request', 'resource', 'resource']
        : ['Resource management', 'Open the resource workspace', 'resource', '']) : null,
      canPage('settings') ? ['Workspace settings', 'Roles, access, and preferences', 'settings', ''] : null
    ].filter(Boolean);

    host.innerHTML = `
      <section class="workspace-action-hero">
        <div><span class="workspace-eyebrow">YOUR WORKSPACE</span><h2>Good to see you. Here is what needs attention.</h2>
          <p>The list adapts automatically to the roles currently assigned to you.</p></div>
        <div class="workspace-role-list" aria-label="Assigned roles">${roles.map(role => `<span>${esc(roleLabel(role))}</span>`).join('')}</div>
      </section>
      <section class="workspace-kpi-grid" aria-label="Workspace summary">
        ${kpis.map(([label, value, note, page]) => `<button type="button" class="workspace-kpi-card" onclick="workspaceNavigate('${esc(page)}')">
          <span class="workspace-kpi-label">${esc(label)}</span><strong>${Number(value) || 0}</strong><small>${esc(note)}</small></button>`).join('')}
      </section>
      <div class="workspace-action-grid">
        <section class="workspace-panel"><div class="workspace-panel-head"><div><h3>Needs your attention</h3><p>Highest-priority work across the pages you can access.</p></div><button type="button" class="btn-sm" onclick="renderActionCenter()">Refresh</button></div>
          <div class="workspace-task-list">${actionItems.length ? actionItems.map((item, i) => `<button type="button" class="workspace-task" onclick="openWorkspaceAction(${i})">
            <span class="workspace-task-dot workspace-task-dot--${esc(item.kind || 'general')}"></span><span><strong>${esc(item.title)}</strong><small>${esc(item.note || '')}</small></span><span class="workspace-task-arrow">›</span></button>`).join('') : '<div class="workspace-empty"><strong>You are all caught up.</strong><span>No active tasks are waiting for your roles.</span></div>'}</div>
        </section>
        <section class="workspace-panel"><div class="workspace-panel-head"><div><h3>Quick actions</h3><p>Common shortcuts available to your roles.</p></div></div>
          <div class="workspace-quick-list">${quickActions.map(([label, note, page, action]) => `<button type="button" class="workspace-quick ${action ? `workspace-quick--${action}` : ''}" onclick="workspaceQuickAction('${esc(page)}','${esc(action)}')"><span><strong>${esc(label)}</strong><small>${esc(note)}</small></span><span>›</span></button>`).join('')}</div>
        </section>
      </div>`;
  }

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage is optional */ }
  }

  function filterRoot(page) { return document.getElementById(`view-${page}`); }
  function filterElements(page) {
    const view = filterRoot(page);
    if (!view) return [];
    const selectors = '.filter-toolbar input[id],.filter-toolbar select[id],.actual-spend-toolbar input[id],.actual-spend-toolbar select[id],.filter-row input[id],.filter-row select[id],.log-filter-grid input[id],.log-filter-grid select[id]';
    return Array.from(view.querySelectorAll(selectors)).filter(el => el.type !== 'button' && el.type !== 'submit' && el.type !== 'file');
  }

  function captureWorkspaceFilterState(page) {
    const state = {};
    filterElements(page).forEach(el => {
      if (el.multiple) state[el.id] = { kind: 'multiple', value: Array.from(el.selectedOptions).map(option => option.value) };
      else if (el.type === 'checkbox') state[el.id] = { kind: 'checkbox', value: el.checked };
      else state[el.id] = { kind: 'value', value: el.value };
    });
    return normalizeWorkspaceFilterState(state);
  }

  function applyWorkspaceFilterState(page, rawState) {
    const state = normalizeWorkspaceFilterState(rawState);
    applyingFilters = true;
    Object.keys(state).forEach(id => {
      const el = document.getElementById(id);
      const item = state[id];
      if (!el || !filterRoot(page)?.contains(el)) return;
      if (item.kind === 'multiple' && el.options) {
        Array.from(el.options).forEach(option => { option.selected = item.value.includes(String(option.value)); });
        if (typeof root.refreshMultiSelectUI === 'function') root.refreshMultiSelectUI(id);
      } else if (item.kind === 'checkbox') el.checked = item.value;
      else el.value = item.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    applyingFilters = false;
    persistLastFilters(page);
  }

  function persistLastFilters(page) {
    if (!FILTER_PAGES.has(page) || applyingFilters) return;
    const store = readStore(LAST_FILTERS_KEY);
    store[page] = captureWorkspaceFilterState(page);
    writeStore(LAST_FILTERS_KEY, store);
  }

  function savedViews(page) {
    const store = readStore(SAVED_VIEWS_KEY);
    return Array.isArray(store[page]) ? store[page] : [];
  }

  function renderSavedViewTools(page) {
    const presets = savedViews(page);
    return `<div class="workspace-saved-tools"><label for="workspace-saved-view-${esc(page)}">View</label>
      <select id="workspace-saved-view-${esc(page)}" onchange="workspaceApplySavedView('${esc(page)}',this.value)">
        <option value="last">Last used</option>${presets.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}
      </select><button type="button" class="btn-sm" onclick="workspaceOpenSaveViewModal('${esc(page)}')">Save view</button>
      <button type="button" class="workspace-delete-view" title="Delete selected saved view" aria-label="Delete selected saved view" onclick="workspaceDeleteSelectedView('${esc(page)}')">×</button></div>`;
  }

  function primaryAction(page) {
    if (page === 'home') return '<button type="button" class="btn-primary workspace-page-primary" onclick="renderActionCenter()">Refresh</button>';
    if (page === 'pending') return '<button type="button" class="btn-primary workspace-page-primary" onclick="typeof refreshPendingMemos===\'function\'&&refreshPendingMemos()">Refresh</button>';
    if (page === 'history' && canPage('create')) return '<button type="button" class="btn-primary workspace-page-primary" onclick="workspaceNavigate(\'create\')">+ Create Memo</button>';
    if (page === 'device' && can('device.manage')) return '<button type="button" class="btn-primary workspace-page-primary" onclick="typeof openDeviceModal===\'function\'&&openDeviceModal()">+ Add Device</button>';
    if (page === 'resource' && canCreateResource()) return '<button type="button" class="btn-primary workspace-page-primary" onclick="typeof openResModal===\'function\'&&openResModal()">+ New Request</button>';
    return '';
  }

  function renderPageHeader(page, suppliedTitle) {
    const view = filterRoot(page);
    if (!view || page === 'settings') return;
    let head = view.querySelector(':scope > [data-workspace-head]');
    if (!head) {
      head = document.createElement('section');
      head.dataset.workspaceHead = 'true';
      head.className = 'pmo-workspace-page-head';
      view.insertBefore(head, view.firstChild);
    }
    const meta = PAGE_META[page] || [suppliedTitle || page, ''];
    const title = suppliedTitle || meta[0];
    head.innerHTML = `<div class="workspace-page-copy"><span class="workspace-eyebrow">PMO ERP</span><h1>${esc(title)}</h1><p>${esc(meta[1])}</p></div>
      <div class="workspace-page-tools">${FILTER_PAGES.has(page) ? renderSavedViewTools(page) : ''}${primaryAction(page)}</div>`;
  }

  function workspaceAfterViewChange(page, title) {
    activePage = page;
    renderPageHeader(page, title);
    if (page === 'home') renderActionCenter();
    if (FILTER_PAGES.has(page) && !restoredPages.has(page)) {
      restoredPages.add(page);
      window.setTimeout(() => {
        const state = readStore(LAST_FILTERS_KEY)[page];
        if (state) applyWorkspaceFilterState(page, state);
      }, 60);
    }
  }

  function ensureSaveViewModal() {
    let modal = document.getElementById('workspace-save-view-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'workspace-save-view-modal';
    modal.className = 'pmo-modal-backdrop workspace-save-modal';
    modal.innerHTML = `<form class="pmo-modal-card workspace-save-card" onsubmit="workspaceSaveCurrentView(event)">
      <div class="pmo-modal-header"><div><strong>Save current view</strong><small>Keep these filters as a reusable shortcut.</small></div><button class="pmo-modal-close" type="button" onclick="workspaceCloseSaveViewModal()">×</button></div>
      <label class="workspace-save-label" for="workspace-save-view-name">View name</label><input id="workspace-save-view-name" maxlength="48" autocomplete="off" placeholder="e.g. Renewals this month" required>
      <input id="workspace-save-view-page" type="hidden"><div class="pmo-modal-footer"><button type="button" class="btn-sm" onclick="workspaceCloseSaveViewModal()">Cancel</button><button type="submit" class="btn-primary">Save view</button></div></form>`;
    modal.addEventListener('click', event => { if (event.target === modal) workspaceCloseSaveViewModal(); });
    document.body.appendChild(modal);
    return modal;
  }

  function workspaceOpenSaveViewModal(page) {
    const modal = ensureSaveViewModal();
    modal.classList.add('open');
    document.getElementById('workspace-save-view-page').value = page;
    const input = document.getElementById('workspace-save-view-name');
    input.value = '';
    window.setTimeout(() => input.focus(), 0);
  }
  function workspaceCloseSaveViewModal() { document.getElementById('workspace-save-view-modal')?.classList.remove('open'); }
  function workspaceSaveCurrentView(event) {
    event.preventDefault();
    const page = document.getElementById('workspace-save-view-page').value;
    const input = document.getElementById('workspace-save-view-name');
    const name = input.value.trim();
    if (!name || !FILTER_PAGES.has(page)) return;
    const store = readStore(SAVED_VIEWS_KEY);
    const list = Array.isArray(store[page]) ? store[page] : [];
    const id = `view-${Date.now().toString(36)}`;
    list.push({ id, name: name.slice(0, 48), state: captureWorkspaceFilterState(page), createdAt: new Date().toISOString() });
    store[page] = list.slice(-20);
    writeStore(SAVED_VIEWS_KEY, store);
    workspaceCloseSaveViewModal();
    renderPageHeader(page, PAGE_META[page]?.[0]);
    const select = document.getElementById(`workspace-saved-view-${page}`);
    if (select) select.value = id;
  }
  function workspaceApplySavedView(page, id) {
    const state = id === 'last' ? readStore(LAST_FILTERS_KEY)[page] : savedViews(page).find(item => item.id === id)?.state;
    if (state) applyWorkspaceFilterState(page, state);
  }
  function workspaceDeleteSelectedView(page) {
    const select = document.getElementById(`workspace-saved-view-${page}`);
    const id = select && select.value;
    if (!id || id === 'last') return;
    const store = readStore(SAVED_VIEWS_KEY);
    store[page] = savedViews(page).filter(item => item.id !== id);
    writeStore(SAVED_VIEWS_KEY, store);
    renderPageHeader(page, PAGE_META[page]?.[0]);
  }

  function decorateDetailDrawers() {
    const memo = document.getElementById('detail-modal');
    if (memo) { memo.classList.add('pmo-detail-drawer-backdrop'); memo.setAttribute('role', 'dialog'); memo.setAttribute('aria-modal', 'true'); }
    if (typeof root.openDeviceDetail === 'function' && !root.openDeviceDetail.__workspaceWrapped) {
      const original = root.openDeviceDetail;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        const panel = document.getElementById('dev-detail-modal');
        if (panel) { panel.classList.add('pmo-detail-drawer-backdrop'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); }
        return result;
      };
      wrapped.__workspaceWrapped = true;
      root.openDeviceDetail = wrapped;
    }
  }

  function workspaceQuickAction(page, action) {
    navigate(page);
    if (action === 'device') window.setTimeout(() => { if (typeof root.openDeviceModal === 'function') root.openDeviceModal(); }, 40);
    if (action === 'resource') window.setTimeout(() => { if (typeof root.openResModal === 'function') root.openResModal(); }, 40);
  }

  function openWorkspaceAction(index) {
    const item = actionItems[index];
    if (item && typeof item.action === 'function') item.action();
  }

  function initWorkspaceExperience() {
    decorateDetailDrawers();
    if (!document.documentElement.dataset.workspaceExperience) {
      document.documentElement.dataset.workspaceExperience = 'true';
      window.addEventListener('pmo:session-change', () => {
        window.setTimeout(() => {
          if (activePage === 'home') renderActionCenter();
          else renderPageHeader(activePage, PAGE_META[activePage]?.[0]);
        }, 0);
      });
      document.addEventListener('input', event => {
        if (applyingFilters || !FILTER_PAGES.has(activePage) || !filterElements(activePage).includes(event.target)) return;
        window.clearTimeout(filterTimer);
        filterTimer = window.setTimeout(() => persistLastFilters(activePage), 220);
      });
      document.addEventListener('change', event => {
        if (!applyingFilters && FILTER_PAGES.has(activePage) && filterElements(activePage).includes(event.target)) persistLastFilters(activePage);
      });
    }
    const nav = document.querySelector('.workspace-home-nav');
    if (typeof root.swView === 'function') root.swView('home', nav, 'Action Center');
    // Core stores hydrate from Supabase/local fallback after initApp starts.
    // Refresh the landing metrics once those asynchronous loaders have settled.
    [900, 2400].forEach(delay => window.setTimeout(() => {
      if (activePage === 'home') renderActionCenter();
    }, delay));
  }

  root.renderActionCenter = renderActionCenter;
  root.workspaceAfterViewChange = workspaceAfterViewChange;
  root.workspaceNavigate = navigate;
  root.openWorkspaceAction = openWorkspaceAction;
  root.workspaceQuickAction = workspaceQuickAction;
  root.workspaceOpenSaveViewModal = workspaceOpenSaveViewModal;
  root.workspaceCloseSaveViewModal = workspaceCloseSaveViewModal;
  root.workspaceSaveCurrentView = workspaceSaveCurrentView;
  root.workspaceApplySavedView = workspaceApplySavedView;
  root.workspaceDeleteSelectedView = workspaceDeleteSelectedView;
  root.captureWorkspaceFilterState = captureWorkspaceFilterState;
  root.applyWorkspaceFilterState = applyWorkspaceFilterState;
  root.initWorkspaceExperience = initWorkspaceExperience;

  if (typeof module !== 'undefined' && module.exports) module.exports = {
    summarizeWorkspaceData,
    normalizeWorkspaceFilterState,
    kpisForRoles
  };
})(typeof window !== 'undefined' ? window : globalThis);
