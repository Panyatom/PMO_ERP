// ─────────────────────────────────────────
// Supabase client + storage layer
// Replaces localStorage for memos, licenses, devices
// ─────────────────────────────────────────
const PMO_CONFIG = window.__PMO_CONFIG__ || {};
const SUPA_URL = String(PMO_CONFIG.supabaseUrl || '').replace(/\/$/, '');
const SUPA_KEY = String(PMO_CONFIG.supabaseAnonKey || '');

// ── Supabase REST helper ──
async function supaFetch(table, method='GET', body=null, query='') {
  if(!SUPA_URL || !SUPA_KEY) {
    throw new Error('Supabase is not configured. Generate config.js from config.example.js.');
  }
  const url = SUPA_URL + '/rest/v1/' + table + query;
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + ((typeof pmoAuthAccessToken === 'function' && pmoAuthAccessToken()) || SUPA_KEY),
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=representation',
  };
  if(method === 'GET') headers['Accept'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if(!resp.ok) {
    const err = await resp.text();
    throw new Error('Supabase ' + method + ' ' + table + ': ' + err);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// ── Memo field mapping: JS camelCase ↔ DB snake_case ──
function memoToDb(m) {
  return {
    id: m.id || m.memoNo,
    memo_no: m.memoNo,
    type: m.type, type_label: m.typeLabel,
    status: m.status || 'pending',
    project: m.project, subject: m.subject, reason: m.reason,
    to: m.to, date: m.date, total: Number(m.total)||0,
    amount_words: m.amountWords,
    requester_name: m.requesterName, requester_title: m.requesterTitle,
    reviewer_name: m.reviewerName, reviewer_title: m.reviewerTitle, reviewer_date: m.reviewerDate,
    approver_name: m.approverName, approver_title: m.approverTitle, approver_date: m.approverDate,
    approved_by: m.approvedBy, rejected_by: m.rejectedBy,
    approval_note: m.approvalNote, rejection_reason: m.rejectionReason,
    fx_rate: m.fxRate || null,
    sections: m.sections || [], audit_log: m.auditLog || [],
    submitted_at: m.submittedAt || null,
    approved_at: m.approvedAt || null, rejected_at: m.rejectedAt || null,
    created_at: m.createdAt || new Date().toISOString(),
    updated_at: m.updatedAt || new Date().toISOString(),
  };
}
function dbToMemo(r) {
  return {
    id: r.memo_no, memoNo: r.memo_no,
    type: r.type, typeLabel: r.type_label,
    status: r.status, project: r.project, subject: r.subject, reason: r.reason,
    to: r.to, date: r.date, total: Number(r.total)||0, amountWords: r.amount_words,
    requesterName: r.requester_name, requesterTitle: r.requester_title,
    reviewerName: r.reviewer_name, reviewerTitle: r.reviewer_title, reviewerDate: r.reviewer_date,
    approverName: r.approver_name, approverTitle: r.approver_title, approverDate: r.approver_date,
    approvedBy: r.approved_by, rejectedBy: r.rejected_by,
    approvalNote: r.approval_note, rejectionReason: r.rejection_reason,
    fxRate: r.fx_rate, sections: r.sections || [], auditLog: r.audit_log || [],
    submittedAt: r.submitted_at, approvedAt: r.approved_at, rejectedAt: r.rejected_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── Memo storage (async, with localStorage fallback) ──
const MEMO_KEY = 'orbit-pmo-memos-v1';
let _memCache = null;
let _supaAvailable = null;

async function checkSupa() {
  if(_supaAvailable !== null) return _supaAvailable;
  try {
    await supaFetch('memos', 'GET', null, '?limit=1');
    _supaAvailable = true;
  } catch(e) {
    console.warn('Supabase unavailable, using localStorage', e.message);
    _supaAvailable = false;
  }
  return _supaAvailable;
}

async function loadMemosAsync() {
  if(await checkSupa()) {
    try {
      const rows = await supaFetch('memos', 'GET', null, '?order=created_at.desc&limit=500');
      _memCache = (rows||[]).map(dbToMemo);
      // Sync to localStorage as backup
      try { localStorage.setItem(MEMO_KEY, JSON.stringify(_memCache)); } catch(e) {}
      return _memCache;
    } catch(e) {
      console.warn('Supabase read failed, fallback to localStorage');
    }
  }
  // localStorage fallback
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return Array.isArray(p)?p:[]; }
  catch(e) { return []; }
}

async function saveMemoAsync(data) {
  const now = new Date().toISOString();
  const existing = (await loadMemosAsync()).find(m => m.memoNo === data.memoNo);
  const saved = { ...data, id:data.memoNo, status:data.status||'pending',
    createdAt: existing ? existing.createdAt : now, updatedAt: now };

  if(await checkSupa()) {
    try {
      const db = memoToDb(saved);
      await supaFetch('memos', 'POST', db, '?on_conflict=memo_no');
      _memCache = null; // invalidate cache
      return saved;
    } catch(e) { console.warn('Supabase save failed', e.message); }
  }
  // localStorage fallback
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  if(idx>=0) memos[idx]=saved; else memos.push(saved);
  storeMemos(memos);
  return saved;
}

async function updateMemoStatusAsync(memoNo, status, extra={}) {
  const memos = await loadMemosAsync();
  const memo = memos.find(m => m.memoNo === memoNo);
  if(!memo) return null;
  const updated = { ...memo, ...extra, status, updatedAt: new Date().toISOString() };
  if(status==='completed') updated.approvedAt = updated.updatedAt;
  if(status==='rejected')  updated.rejectedAt = updated.updatedAt;

  if(await checkSupa()) {
    try {
      // camelCase → snake_case: approvalNote → approval_note
      const toSnake = s => s.replace(/([A-Z])/g, '_$1').toLowerCase();
      const patch = { status, updated_at: updated.updatedAt, ...Object.fromEntries(
        Object.entries(extra).map(([k,v]) => [toSnake(k), v])
      )};
      if(status==='completed') patch.approved_at = updated.approvedAt;
      if(status==='rejected')  patch.rejected_at = updated.rejectedAt;
      await supaFetch('memos', 'PATCH', patch, '?memo_no=eq.' + encodeURIComponent(memoNo));
      _memCache = null;
    } catch(e) { console.warn('Supabase patch failed', e.message); }
  }
  // also update localStorage
  const lsMemos = loadMemos();
  const idx = lsMemos.findIndex(m => m.memoNo === memoNo);
  if(idx>=0) { lsMemos[idx]=updated; storeMemos(lsMemos); }
  renderPendingMemos();
  renderHistoryMemos();
  return updated;
}

// ── Sync: push all localStorage memos to Supabase ──
async function syncLocalToSupabase() {
  if(!(await checkSupa())) return { ok:false, msg:'Supabase unavailable' };
  const local = loadMemos();
  if(!local.length) return { ok:true, pushed:0 };
  let pushed = 0;
  for(const m of local) {
    try {
      await supaFetch('memos', 'POST', memoToDb(m), '?on_conflict=memo_no');
      pushed++;
    } catch(e) { console.warn('Sync failed for', m.memoNo, e.message); }
  }
  _memCache = null;
  return { ok:true, pushed };
}

// ─────────────────────────────────────────
// app.js — shared utils, storage, nav, PDF
// ─────────────────────────────────────────

// ── Date helpers ──
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function thaiDate(d) { return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()+543}`; }
const TODAY = thaiDate(new Date());
const todayISO = new Date().toISOString().slice(0,10);

const THEME_KEY = 'pmo-color-theme';
function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
function syncThemeControl() {
  const theme = currentTheme();
  const button = document.getElementById('theme-toggle');
  if(!button) return;
  const nextLabel = theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด';
  button.setAttribute('aria-label', nextLabel);
  button.setAttribute('aria-pressed', String(theme === 'dark'));
  button.title = nextLabel;
  if(!button.classList.contains('theme-toggle--clouding')) {
    button.dataset.cover = theme === 'dark' ? 'sun' : 'moon';
  }
  const label = button.querySelector('.theme-toggle-label');
  if(label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
}
function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch(e) {}
  syncThemeControl();
}
function toggleTheme() {
  const theme = currentTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const button = document.getElementById('theme-toggle');
  if(!button) { setTheme(next); return; }
  if(button.classList.contains('theme-toggle--clouding')) return;
  button.dataset.cover = next === 'dark' ? 'sun' : 'moon';
  button.classList.add('theme-toggle--clouding');
  button.disabled = true;
  setTheme(next);
  window.setTimeout(() => {
    button.classList.remove('theme-toggle--clouding');
    button.disabled = false;
  }, 720);
}

// ── Shared utils ──
function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function val(sel, root=document) { return root.querySelector(sel)?.value?.trim() || ''; }
function money(n) { return '฿' + (Number(n)||0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
function shortDate(iso) {
  if(!iso) return '-';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()+543).slice(-2)}`;
}
function dateInput(v) {
  if(!v) return '-';
  const d = new Date(v + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? v : thaiDate(d);
}
function badgeClass(type) {
  return { sl:'badge-blue', hw:'badge-gray', int:'badge-green', ent:'badge-amber', dep:'badge-purple' }[type] || 'badge-gray';
}
function table(headers, rows, numericIndexes=[], centerIndexes=[]) {
  const thStyle = 'background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt';
  const tdBase  = 'padding:7px 10px;border:1px solid #ccc;font-size:13pt';
  // Last row = total row if numericIndexes provided
  const bodyRows = rows.map((row, ri) => {
    const isLast = ri === rows.length - 1 && numericIndexes.length > 0;
    return '<tr>' + row.map((c,i) => {
      const align = numericIndexes.includes(i) ? 'center' : centerIndexes.includes(i) ? 'center' : 'left';
      const weight = numericIndexes.includes(i) ? 'font-weight:700;' : '';
      const bg = isLast ? 'background:#f0f0f0;' : '';
      return '<td style="' + tdBase + ';text-align:' + align + ';' + weight + bg + '">' + esc(c) + '</td>';
    }).join('') + '</tr>';
  });
  return '<table style="width:100%;border-collapse:collapse;margin:6px 0">'
    + '<thead><tr>' + headers.map(h => '<th style="' + thStyle + '">' + esc(h) + '</th>').join('') + '</tr></thead>'
    + '<tbody>' + bodyRows.join('') + '</tbody>'
    + '</table>';
}

// ── Storage ──
// MEMO_KEY defined in Supabase layer above
let _memMemos = [];
function canUseLocalStorage() {
  try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; }
  catch(e) { return false; }
}
const HAS_LS = canUseLocalStorage();
function loadMemos() {
  if(!HAS_LS) return _memMemos;
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return Array.isArray(p)?p:[]; }
  catch(e) { return _memMemos; }
}
function storeMemos(memos) {
  _memMemos = Array.isArray(memos) ? memos : [];
  if(!HAS_LS) return;
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(_memMemos)); }
  catch(e) { console.warn('localStorage write failed'); }
}
function currentMemoPrefix() {
  const d = new Date();
  return `ORB-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMemoNo() {
  const prefix = currentMemoPrefix();
  const max = loadMemos().reduce((m,memo) => {
    const match = String(memo.memoNo||'').match(new RegExp(`^${prefix}-(\\d{3})$`));
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `${prefix}-${String(max+1).padStart(3,'0')}`;
}
function setNextMemoNo() {
  const el = document.getElementById('f-memo-no');
  if(el && !el.value.trim()) el.value = nextMemoNo();
}
function saveMemo(data) {
  // Sync version for backward compat — also triggers async save to Supabase
  const now = new Date().toISOString();
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  const saved = { ...data, id:data.memoNo, status:data.status||'pending',
    createdAt: idx>=0 ? memos[idx].createdAt : now, updatedAt: now };
  if(idx>=0) memos[idx]=saved; else memos.push(saved);
  storeMemos(memos);
  // Async push to Supabase in background
  saveMemoAsync(saved).catch(e => console.warn('Background Supabase save failed', e));
  return saved;
}
function updateMemoStatus(memoNo, status, extra={}) {
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === memoNo);
  if(idx<0) { alert('ไม่พบ Memo ที่เลือก'); return null; }
  memos[idx] = { ...memos[idx], ...extra, status, updatedAt: new Date().toISOString() };
  if(status==='completed') memos[idx].approvedAt = memos[idx].updatedAt;
  if(status==='rejected')  memos[idx].rejectedAt = memos[idx].updatedAt;
  storeMemos(memos);
  refreshNotifications();
  _memCache = null; // force fresh read
  renderPendingMemos();
  renderHistoryMemos();
  // Async update Supabase then re-render with confirmed server data
  updateMemoStatusAsync(memoNo, status, extra)
    .then(() => { renderPendingMemos(); renderHistoryMemos(); })
    .catch(e => console.warn('Supabase status update failed', e));
  return memos[idx];
}

// Notification center
const NOTIFICATION_READ_KEY = 'orbit-pmo-notifications-read-v1';
let _notificationRead = null;

function notificationSettings() {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  return {
    memoPending: s?.notifications?.memoPending !== false,
    resourceApproval: s?.notifications?.resourceApproval !== false,
    recruiting: s?.notifications?.recruiting !== false,
    onboarding: s?.notifications?.onboarding !== false,
  };
}
function notificationReadMap() {
  if(_notificationRead) return _notificationRead;
  try { _notificationRead = JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '{}') || {}; }
  catch(e) { _notificationRead = {}; }
  return _notificationRead;
}
function storeNotificationReadMap(map) {
  _notificationRead = map || {};
  try { localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(_notificationRead)); } catch(e) {}
}
function isNotificationRead(id) {
  return !!notificationReadMap()[id];
}
function markNotificationRead(id) {
  if(!id) return;
  const map = notificationReadMap();
  map[id] = new Date().toISOString();
  storeNotificationReadMap(map);
}
function markAllNotificationsRead() {
  const map = notificationReadMap();
  collectNotifications().forEach(item => { map[item.id] = new Date().toISOString(); });
  storeNotificationReadMap(map);
  refreshNotifications();
}
function clearNotificationReads() {
  storeNotificationReadMap({});
  refreshNotifications();
}
function collectNotifications() {
  const cfg = notificationSettings();
  const items = [];
  const role = typeof currentRole === 'function' ? currentRole() : 'pmo';
  if(cfg.memoPending) {
    loadMemos().filter(m => (m.status || 'pending') === 'pending').forEach(m => {
      items.push({
        id: `memo:${m.memoNo}`,
        kind: 'memo',
        priority: 30,
        title: `Memo waiting approval: ${m.memoNo || '-'}`,
        note: `${m.project || '-'} / ${m.subject || m.typeLabel || '-'}`,
        meta: m.updatedAt || m.createdAt || m.date || '',
        action: () => swView('pending', document.querySelector('#memo-sub .sb-sub-item:nth-child(2)'), 'Pending Approval'),
      });
    });
  }
  if(typeof loadResources === 'function') {
    const resources = typeof visibleToRole === 'function' ? visibleToRole(loadResources(), role) : loadResources();
    resources.forEach(r => {
      if(cfg.resourceApproval && r.status === 'pending' && typeof canApprove === 'function' && canApprove(role)) {
        items.push({
          id: `resource:${r.id}:pending`,
          kind: 'resource',
          priority: 25,
          title: `Resource request needs approval`,
          note: `${r.position || '-'} / ${r.project || '-'} / ${r.requesterName || '-'}`,
          meta: r.updatedAt || r.requestDate || '',
          action: () => openResourceNotification(r.id),
        });
      }
      if(cfg.recruiting && r.status === 'approved' && typeof canRecruit === 'function' && canRecruit(role)) {
        items.push({
          id: `resource:${r.id}:approved`,
          kind: 'resource',
          priority: 20,
          title: `Approved request waiting for BBIK`,
          note: `${r.position || '-'} / ${r.project || '-'}`,
          meta: r.updatedAt || r.requestDate || '',
          action: () => openResourceNotification(r.id),
        });
      }
      if(cfg.recruiting && ['sourcing','interviewing','offer'].includes(r.status) && role !== 'user') {
        items.push({
          id: `resource:${r.id}:${r.status}`,
          kind: 'resource',
          priority: 12,
          title: `Recruiting in progress: ${(typeof RES_STATUS !== 'undefined' && RES_STATUS[r.status]?.label) || r.status}`,
          note: `${r.position || '-'} / ${r.project || '-'}`,
          meta: r.updatedAt || r.requestDate || '',
          action: () => openResourceNotification(r.id),
        });
      }
      if(cfg.onboarding && r.status === 'document' && typeof canApprove === 'function' && canApprove(role)) {
        items.push({
          id: `resource:${r.id}:document`,
          kind: 'resource',
          priority: 22,
          title: `Ready for onboard confirmation`,
          note: `${r.position || '-'} / ${r.project || '-'}`,
          meta: r.updatedAt || r.requestDate || '',
          action: () => openResourceNotification(r.id),
        });
      }
    });
  }
  return items.sort((a,b) => (b.priority - a.priority) || String(b.meta || '').localeCompare(String(a.meta || '')));
}
function openResourceNotification(id) {
  swView('resource', document.querySelector('.sb-item[onclick*="resource"]'), 'Resource Management');
  window.setTimeout(() => { if(typeof openResDetail === 'function') openResDetail(id); }, 80);
}
function renderNotifications() {
  const panel = ensureNotificationPanel();
  if(!panel) return [];
  const items = collectNotifications();
  const unread = items.filter(item => !isNotificationRead(item.id)).length;
  panel.innerHTML = `
    <div class="notification-head">
      <div><strong>Notifications</strong><span>${items.length ? `${unread} unread / ${items.length} active` : 'No active alerts'}</span></div>
      <div class="notification-actions">
        <button class="btn-sm" type="button" onclick="markAllNotificationsRead()">Mark read</button>
        <button class="btn-sm" type="button" onclick="clearNotificationReads()">Reset</button>
      </div>
    </div>
    <div class="notification-list">
      ${items.length ? items.map(item => `
        <button class="notification-item ${isNotificationRead(item.id) ? 'is-read' : ''}" type="button" data-notification-id="${esc(item.id)}">
          <span class="notification-dot" aria-hidden="true"></span>
          <span>
            <span class="notification-title">${esc(item.title)}</span>
            <span class="notification-meta">${item.meta ? esc(shortDate(String(item.meta).slice(0,10))) : esc(item.kind)}</span>
            <span class="notification-note">${esc(item.note)}</span>
          </span>
        </button>`).join('') : '<div class="notification-empty">All clear. No pending memo or resource actions.</div>'}
    </div>
    <div class="notification-foot"><button class="btn-sm" type="button" onclick="swView('settings', document.querySelector('.sb-item[onclick*=settings]'), 'Settings'); switchSettingsTab('later'); closeNotifications()">Settings</button></div>`;
  panel.querySelectorAll('[data-notification-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(x => x.id === btn.dataset.notificationId);
      if(!item) return;
      markNotificationRead(item.id);
      closeNotifications();
      item.action?.();
      refreshNotifications();
    });
  });
  return items;
}
function ensureNotificationPanel() {
  let panel = document.getElementById('notification-panel');
  if(!panel) {
    panel = document.createElement('div');
    panel.id = 'notification-panel';
    panel.className = 'notification-panel';
    panel.setAttribute('aria-hidden', 'true');
  }
  if(panel.parentElement !== document.body) document.body.appendChild(panel);
  return panel;
}
function refreshNotifications() {
  const items = renderNotifications();
  const unread = items.filter(item => !isNotificationRead(item.id)).length;
  const btn = document.getElementById('notification-btn');
  const badge = document.getElementById('notification-badge');
  if(btn) {
    btn.classList.toggle('notification-btn--active', unread > 0);
    btn.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
  }
  if(badge) {
    badge.hidden = unread < 1;
    badge.textContent = unread > 99 ? '99+' : String(unread);
  }
}
function toggleNotifications() {
  const panel = ensureNotificationPanel();
  if(!panel) return;
  refreshNotifications();
  const next = !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', next);
  panel.setAttribute('aria-hidden', String(!next));
}
function closeNotifications() {
  const panel = document.getElementById('notification-panel');
  panel?.classList.remove('is-open');
  panel?.setAttribute('aria-hidden', 'true');
}

// ── Navigation ──
function swView(id, el, title) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sb-sub-item').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  document.getElementById('page-title').textContent = title;
  if(el) el.classList.add('active');
  if(['create','pending','history'].includes(id)) document.getElementById('nav-memo').classList.add('active');
  if(id === 'budget') renderBudget();
  if(id === 'license') renderLicense();
  if(id === 'device') renderDevice();
  if(id === 'history') renderHistoryMemos();
  if(id === 'log') { if(typeof renderTransactionLog==='function') renderTransactionLog(); }
  if(id === 'settings') { if(typeof renderSettings==='function') renderSettings(); }
  if(id === 'resource') { if(typeof renderResource==='function') renderResource(); }
  if(id === 'cost') { if(typeof renderCost==='function') renderCost(); }
}
function toggleMemoSub(el) {
  el.classList.add('active');
  swView('create', document.querySelector('#memo-sub .sb-sub-item'), 'Create Memo');
}

// ── PDF ──
function renderMemoPdf(data) {
  // Use server CSS classes (.mp-*) — injected by PDF server with THSarabun font
  function fmtDate(v) {
    if(!v || v === '-') return '';
    // Already a Thai date string (e.g. "20 พฤษภาคม 2569") — return as-is
    if(/[ก-๙]/.test(v)) return v;
    // ISO date YYYY-MM-DD → convert to Thai Buddhist era DD/MM/YYYY
    const d = new Date(v.length===10 ? v+'T00:00:00' : v);
    if(isNaN(d.getTime())) return v;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
  }

  const typeBody = {
    sl: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} - บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องใช้งานโปรแกรม เพื่อพัฒนาโครงการและช่วยทีมพัฒนาสามารถทำงานได้อย่างมีประสิทธิภาพ จึงขออนุมัติงบประมาณเพื่อต่ออายุการใช้งานโปรแกรม ตามรายละเอียดดังต่อไปนี้`,
    hw: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} - บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องจัดซื้ออุปกรณ์ Hardware เพื่อสนับสนุนการดำเนินงานของโครงการ จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    int: `เนื่องด้วยฝ่าย PMO มีความประสงค์จัดกิจกรรม Team Activity เพื่อเสริมสร้างกำลังใจและส่งเสริมการทำงานเป็นทีมของพนักงานโครงการ ${esc(data.project||'-')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    ent: `เนื่องด้วยฝ่าย PMO มีความประสงค์จัดงานเลี้ยงรับรองลูกค้าโครงการ ${esc(data.project||'-')} เพื่อเสริมสร้างความสัมพันธ์อันดีและรักษาความพึงพอใจของลูกค้า จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    dep: `เนื่องด้วยโครงการ ${esc(data.project||'-')} มีความจำเป็นต้อง Deployment ระบบ จึงขออนุมัติงบประมาณค่าใช้จ่ายในการ Deployment ตามรายละเอียดดังต่อไปนี้`,
  };
  const bodyText = typeBody[data.type] || `ด้วยฝ่าย PMO มีความประสงค์ขออนุมัติรายการตามรายละเอียดด้านล่าง เพื่อสนับสนุนการดำเนินงานของโครงการ ${esc(data.project||'-')} ให้เป็นไปตามแผนงาน`;

  // Per-type closing paragraphs with authority reference
  const authorityRef = 'อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงิน (ที่มีการตั้งงบประมาณไว้) หมวดการชำระค่าบริการ ซึ่งให้อำนาจแก่ประธานเจ้าหน้าที่บริหารในวงเงินไม่เกิน 2,000,000 บาท';
  const authorityRef500k = 'อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงิน (ที่มีการตั้งงบประมาณไว้) หมวดการชำระค่าบริการสำหรับพนักงาน ซึ่งให้อำนาจแก่ผู้บริหารในวงเงินไม่เกิน 500,000 บาท';
  const amtStr = data.total ? `<strong>${esc(money(data.total||0))}</strong> (${esc(data.amountWords||'-')})` : '';

  const closingMap = {
    sl:  data.total ? (function(){
      const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
      let totalSeats = 0, months = 12;
      if(slSection && slSection.html) {
        const doc = new DOMParser().parseFromString(slSection.html, 'text/html');
        doc.querySelectorAll('tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if(cells.length >= 5) {
            const mo = parseInt(cells[3]?.textContent)||0;
            const qty = parseInt(cells[4]?.textContent)||0;
            if(mo) months = mo;
            totalSeats += qty;
          }
        });
      }
      const seatsStr = totalSeats ? `จำนวนรวมทั้งหมด ${totalSeats} Seats ` : '';
      const monthsStr = `ระยะเวลา ${months} เดือน `;
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่าใช้จ่ายดังกล่าว รวมเป็นจำนวนเงินไม่เกิน ${amtStr} ${seatsStr}${monthsStr}${authorityRef}`;
    })() : '',
    hw:  data.total ? `จึงขอความกรุณาโปรดพิจารณาอนุมัติค่าใช้จ่ายสำหรับรายการจัดซื้อจ้างอ้างต้น ในวงเงิน ${amtStr} ถ้าอ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงิน (ที่มีการตั้งงบประมาณไว้) หมวดการชำระค่าบริการ ซึ่งให้อำนาจแก่ประธานเจ้าหน้าที่บริหารในวงเงินไม่เกิน 500,000 บาท` : '',
    int: data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่ากิจกรรม Team Activity ดังกล่าว เป็นวงเงินจำนวนไม่เกิน ${amtStr} (แปดหมื่นสี่พันบาทถ้วน) ${authorityRef500k}` : '',
    ent: data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณค่ารับรองลูกค้าจาก ${esc(data.project||'-')} ในช่วงเวลาดังกล่าว ${authorityRef}` : '',
    dep: data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณค่าใช้จ่าย Deployment รวมเป็นจำนวนเงินไม่เกิน ${amtStr} ${authorityRef}` : '',
  };
  const closingText = closingMap[data.type] || (data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณรวมเป็นจำนวนเงินไม่เกิน ${amtStr}` : '');

  // sectionsHtml rendered inline below with fxNote injection

  const fxNote = data.type === 'sl'
    ? `<p class="mp-note">* <u>หมายเหตุ</u> : เรทราคาโปรแกรมดังกล่าวแปลงเรทเงินตราจากหน่วย USD เป็น THB ณ วันที่ ${esc(data.date||TODAY)}${data.fxRate ? ` (1 USD = ฿${data.fxRate})` : ''}</p>`
    : '';

  // Dates stored as Thai strings from dateInput() — display directly
  // fmtDate only as safety net for raw ISO strings
  const reviewerDate = data.reviewerDate && data.reviewerDate !== '-' ? data.reviewerDate : (data.date||'');
  const approverDate = data.approverDate && data.approverDate !== '-' ? data.approverDate : (data.date||'');

  return `<div class="preview-wrap">
    <!-- Header row: memo no + date (logo injected by server) -->
    <div class="mp-hdr">
      <div class="mp-hdr-right">
        <div><strong>เลขที่</strong>&nbsp;&nbsp;${esc(data.memoNo)}</div>
        <div><strong>ลงวันที่</strong>&nbsp;&nbsp;${esc(data.date||TODAY)}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="mp-title">บันทึกข้อความ</div>

    <!-- เรื่อง / เรียน -->
    <div class="mp-field"><span class="mp-field-label">เรื่อง</span><span class="mp-field-value">${esc(data.subject||'-')}</span></div>
    <div class="mp-field"><span class="mp-field-label">เรียน</span><span class="mp-field-value">${esc(data.to||'-')}</span></div>

    <!-- Body -->
    <div class="mp-body"><p>${bodyText}</p></div>

    <!-- Sections with fxNote after SL table -->
    ${(data.sections||[]).map(function(s){
      let html = s.html;
      if(s.title === 'รายการ Software') {
        const H = (from, to) => { html = html.split(from).join(to); };
        // Rename headers using regex (full inline styles, not just text-align)
        const renameHeader = (from, to) => {
          html = html.replace(new RegExp('<th([^>]*)>' + from + '<\\/th>', 'g'), '<th$1>' + to + '</th>');
        };
        renameHeader('#', 'No');
        renameHeader('ชื่อ Software', 'Item');
        renameHeader('฿\\/เดือน', 'Price/Month (THB)');
        renameHeader('จำนวน', 'QTY (License)');
        renameHeader('รวม', 'Amount (THB)');
        renameHeader('เดือน', 'Month');
        // Center everything, then fix item name column (index 1) back to left
        H('<td class="tdl" style="text-align:left">', '<td style="text-align:left">');
        H('<td class="" style="text-align:left">', '<td style="text-align:center">');
        H('<td class="num" style="text-align:center">', '<td style="text-align:center;font-weight:700">');
        // Fix: first td in each row (#) should be center — it uses tdl class
        // Re-process: make all td center, only keep left for item name cells
        // Split by rows and fix per-column
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          const tds = [];
          let idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            // col 1 (item name) = left, all others = center
            const isLeft = idx === 1;
            const isBold = attrs.includes('font-weight:700');
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+';'+(isBold?'font-weight:700;':'')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length ? '<tr>'+tds.join('')+'</tr>' : match;
        });
        // Add Total Amount row if not present
        if(!html.includes('Total Amount') && data.total) {
          const colspan = 5;
          const totalRow = '<tr><td colspan="'+colspan+'" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }
      if(s.title === 'ตาราง Account') {
        // Add No column header
        html = html.replace('<thead><tr>', '<thead><tr><th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:40px">No</th>');
        // Add row number + center all td except account/email col (index 0 = left)
        let rowNum = 0;
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match; // skip header
          rowNum++;
          const tds = ['<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">'+rowNum+'</td>'];
          let idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            const isLeft = idx === 0;
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length > 1 ? '<tr>'+tds.join('')+'</tr>' : match;
        });
      }
      return '<div style="margin-top:12px"><p style="font-weight:700;margin-bottom:6px">'+esc(s.title)+'</p>'+html+(s.title==='รายการ Software'?fxNote:'')+'</div>';
    }).join('')}



    <!-- Closing -->
    ${closingText ? `<div class="mp-closing"><p>${closingText}</p></div>` : ''}

    <!-- Signature boxes -->
    <div class="mp-approval">
      <div class="mp-appr-cell">
        <div class="mp-appr-head">เรียนประธานเจ้าหน้าที่บริหาร เพื่อโปรดพิจารณาอนุมัติ<br>ดำเนินการ</div>
        <div class="mp-appr-opt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div>
        <div class="mp-appr-opt">&#9675; อื่นๆ ..............................………</div>
        <div style="flex:1"></div>
        <div class="mp-sig-space"></div>
        <div class="mp-sig-name">( ${esc(data.reviewerName||'-')} )</div>
        <div class="mp-sig-role">${esc(data.reviewerTitle||'-')}</div>
        <div class="mp-sig-date">${reviewerDate}</div>
      </div>
      <div class="mp-appr-cell">
        <div class="mp-appr-opt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div>
        <div class="mp-appr-opt">&#9675; อื่นๆ ..............................………</div>
        <div style="flex:1"></div>
        <div class="mp-sig-space"></div>
        <div class="mp-sig-name">( ${esc(data.approverName||'-')} )</div>
        <div class="mp-sig-role">${esc(data.approverTitle||'-')}</div>
        <div class="mp-sig-date">${approverDate}</div>
      </div>
    </div>
  </div>`;
}

const LOGO_B64 = 'data:image/png;base64,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';
async function downloadMemoPdf(data) {
  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = renderMemoPdf(data);
  // File naming: [TYPE]_[MemoNo]_[Project]_[Extra]_[Date].Ver1.0.0
  const typeTag = ({ sl:'SL', hw:'HW', int:'INT', ent:'EXT', dep:'DEP' }[data.type] || data.type?.toUpperCase() || 'MEMO');
  const proj    = (data.project || '').replace(/\s+/g,'');
  const memoNo  = (data.memoNo  || 'memo').replace(/\s+/g,'');
  const dateStr = (data.date    || new Date().toISOString().slice(0,10)).replace(/\//g,'-').replace(/\s.*/,'');

  let extra = '';
  if(data.type === 'sl') {
    // [License] = first software name from SL rows
    const firstSL = document.querySelector('#sl-rows .item-row input[type="text"]')?.value?.trim();
    extra = firstSL ? '_' + firstSL.replace(/\s+/g,'') : '';
  }

  const filename = `[${typeTag}]_${memoNo}_${proj}${extra}_${dateStr}.Ver1.0.0.pdf`;
  async function fetchWithRetry(url, opts, ms=55000, retries=2) {
    for(let i=0; i<=retries; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        const r = await fetch(url, {...opts, signal:ctrl.signal});
        clearTimeout(t); return r;
      } catch(e) { clearTimeout(t); if(i===retries) throw e; await new Promise(r=>setTimeout(r,2000)); }
    }
  }
  try {
    const html = stage.firstElementChild?.outerHTML || stage.innerHTML;
    const resp = await fetchWithRetry('https://memo-pdf-server.onrender.com/generate-pdf', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ html, filename, logoBase64: LOGO_B64 })
    });
    if(!resp.ok) throw new Error('Server '+resp.status);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  } catch(err) {
    console.warn('PDF server failed, fallback to print', err);
    document.body.classList.add('printing-pdf');
    try { window.print(); } finally { document.body.classList.remove('printing-pdf'); }
  }
}
function openMemoPdf(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo) { alert('ไม่พบ Memo'); return; }
  downloadMemoPdf(memo);
}

// ── Micro interactions ──
function pmoMotionHide(el, afterHide) {
  if(!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = (force = false) => {
    if(!force && !el.classList.contains('motion-closing')) return;
    el.classList.remove('motion-closing');
    el.style.display = 'none';
    el.style.pointerEvents = '';
    el._pmoMotionHideTimer = null;
    if(typeof afterHide === 'function') afterHide();
  };
  if(reduce || getComputedStyle(el).display === 'none') {
    finish(true);
    return;
  }
  if(el.classList.contains('motion-closing')) return;
  el.classList.add('motion-closing');
  el.style.pointerEvents = 'none';
  el._pmoMotionHideTimer = window.setTimeout(finish, 170);
}

function pmoMotionShow(el, display = 'flex') {
  if(!el) return;
  if(el._pmoMotionHideTimer) {
    window.clearTimeout(el._pmoMotionHideTimer);
    el._pmoMotionHideTimer = null;
  }
  el.classList.remove('motion-closing');
  el.style.pointerEvents = '';
  el.style.display = display;
}

function initMicroInteractions() {
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rippleSelector = [
    'button', '.btn-primary', '.btn-ghost', '.btn-sm', '.btn-export',
    '.btn-approve', '.btn-reject', '.add-btn', '.rm-btn', '.type-btn',
    '.cost-stab', '.sb-item', '.sb-sub-item', '.pend-tab-btn', '.res-tab',
    '.hist-filter-toggle', '.hist-menu-btn', '.hist-pdf-btn', '[role="button"]'
  ].join(',');
  const changedControlSelector = [
    '.filter-row select', '.filter-row input[type="search"]', '.filter-row input[type="text"]',
    '.filter-row input[type="date"]', '.filter-row input[type="number"]',
    '.hist-toolbar select', '.hist-filters-advanced select',
    '.hist-filters-advanced input[type="date"]', '.hist-amt-input',
    '.fg input', '.fg select', '.fg textarea', '.ri', '.hist-search'
  ].join(',');
  const rowSelector = [
    '.hist-table tbody tr.hist-row',
    '#lic-table-body tr',
    '#dev-table-body tr',
    '#res-table-body tr'
  ].join(',');

  const pulse = (el, cls) => {
    if(!el || !(el instanceof HTMLElement)) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once:true });
  };

  document.addEventListener('click', event => {
    const target = event.target.closest(rippleSelector);
    if(!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    if(target.id === 'notification-btn') return;

    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'motion-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const keyboardClick = event.detail === 0;
    ripple.style.left = `${keyboardClick ? rect.width / 2 : event.clientX - rect.left}px`;
    ripple.style.top = `${keyboardClick ? rect.height / 2 : event.clientY - rect.top}px`;
    target.classList.add('motion-ripple-host');
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once:true });
  });

  document.addEventListener('change', event => {
    const target = event.target.closest(changedControlSelector);
    if(target) pulse(target, 'motion-value-change');
  });

  document.addEventListener('click', event => {
    const row = event.target.closest(rowSelector);
    if(!row || event.target.closest('button,a,input,select,textarea,label')) return;
    pulse(row, 'motion-row-tap');
  });

  const animateAddedNodes = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if(!(node instanceof HTMLElement)) return;
      if(node.closest?.('[data-motion-suppress="true"]')) return;
      const items = node.matches('.item-row, .row-name, .pend-card, .metric-card, #lic-table-body tr, #dev-table-body tr, #res-table-body tr')
        ? [node]
        : [...node.querySelectorAll('.item-row, .row-name, .pend-card, .metric-card, #lic-table-body tr, #dev-table-body tr, #res-table-body tr')];
      items.forEach(item => {
        if(item.closest?.('[data-motion-suppress="true"]')) return;
        item.classList.remove('motion-enter');
        void item.offsetWidth;
        item.classList.add('motion-enter');
        item.addEventListener('animationend', () => item.classList.remove('motion-enter'), { once:true });
      });
    }));
  });
  animateAddedNodes.observe(document.body, { childList:true, subtree:true });
}

const PMO_DATE_PICKER = { input:null, view:null, selected:null, original:'' };
function pmoIsoToDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function pmoDateToIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function pmoSameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function pmoMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month:'long', year:'numeric' });
}
function pmoShortDateLabel(date) {
  return date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function ensurePmoDatePicker() {
  let picker = document.getElementById('pmo-date-picker');
  if(picker) return picker;
  picker = document.createElement('div');
  picker.id = 'pmo-date-picker';
  picker.className = 'pmo-date-picker';
  picker.setAttribute('role', 'dialog');
  picker.innerHTML = `
    <div class="pmo-date-head">
      <button type="button" class="pmo-date-nav" data-date-nav="-1" aria-label="Previous month">‹</button>
      <div class="pmo-date-month"></div>
      <button type="button" class="pmo-date-nav" data-date-nav="1" aria-label="Next month">›</button>
    </div>
    <div class="pmo-date-controls">
      <div class="pmo-date-current"></div>
      <button type="button" class="pmo-date-today">Today</button>
    </div>
    <div class="pmo-date-weekdays">${['Mo','Tu','We','Th','Fr','Sat','Su'].map(d => `<span>${d}</span>`).join('')}</div>
    <div class="pmo-date-days"></div>
    <div class="pmo-date-actions">
      <button type="button" class="pmo-date-cancel">Cancel</button>
      <button type="button" class="pmo-date-apply">Apply</button>
    </div>`;
  document.body.appendChild(picker);
  picker.addEventListener('pointerdown', event => {
    event.stopPropagation();
  });
  picker.addEventListener('click', event => {
    event.stopPropagation();
    const nav = event.target.closest('[data-date-nav]');
    if(nav) {
      PMO_DATE_PICKER.view.setMonth(PMO_DATE_PICKER.view.getMonth() + Number(nav.dataset.dateNav || 0));
      renderPmoDatePicker();
      return;
    }
    if(event.target.closest('.pmo-date-today')) {
      const t = new Date();
      PMO_DATE_PICKER.selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      PMO_DATE_PICKER.view = new Date(PMO_DATE_PICKER.selected.getFullYear(), PMO_DATE_PICKER.selected.getMonth(), 1);
      renderPmoDatePicker();
      return;
    }
    const day = event.target.closest('[data-date-day]');
    if(day) {
      PMO_DATE_PICKER.selected = pmoIsoToDate(day.dataset.dateDay);
      PMO_DATE_PICKER.view = new Date(PMO_DATE_PICKER.selected.getFullYear(), PMO_DATE_PICKER.selected.getMonth(), 1);
      renderPmoDatePicker();
      return;
    }
    if(event.target.closest('.pmo-date-cancel')) closePmoDatePicker(false);
    if(event.target.closest('.pmo-date-apply')) closePmoDatePicker(true);
  });
  return picker;
}
function positionPmoDatePicker(input, picker) {
  const rect = input.getBoundingClientRect();
  const width = 286;
  const height = 344;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  const below = rect.bottom + 8;
  const above = rect.top - height - 8;
  picker.style.left = `${left}px`;
  picker.style.top = `${below + height < window.innerHeight ? below : Math.max(12, above)}px`;
}
function renderPmoDatePicker() {
  const picker = ensurePmoDatePicker();
  const view = PMO_DATE_PICKER.view || new Date();
  const selected = PMO_DATE_PICKER.selected;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  picker.querySelector('.pmo-date-month').textContent = pmoMonthLabel(view);
  picker.querySelector('.pmo-date-current').textContent = selected ? pmoShortDateLabel(selected) : 'Select date';
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = [];
  for(let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(`<button type="button" data-date-day="${pmoDateToIso(d)}" class="pmo-date-day ${d.getMonth() !== view.getMonth() ? 'is-muted' : ''} ${pmoSameDay(d, selected) ? 'is-selected' : ''} ${pmoSameDay(d, today) ? 'is-today' : ''}">${d.getDate()}</button>`);
  }
  picker.querySelector('.pmo-date-days').innerHTML = days.join('');
}
function enhancePmoDateInput(input) {
  if(!input || input.dataset.nativeDate === 'true' || input.dataset.pmoDateEnhanced === 'true') return;
  input.dataset.pmoDateEnhanced = 'true';
  input.dataset.pmoDateType = input.type || 'date';
  input.classList.add('pmo-date-input');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('placeholder', input.getAttribute('placeholder') || 'YYYY-MM-DD');
  if(input.type === 'date') input.type = 'text';
}
function openPmoDatePicker(input) {
  if(!input || input.disabled || input.dataset.nativeDate === 'true') return;
  enhancePmoDateInput(input);
  const picker = ensurePmoDatePicker();
  PMO_DATE_PICKER.input = input;
  PMO_DATE_PICKER.original = input.value || '';
  const current = pmoIsoToDate(input.value) || new Date();
  PMO_DATE_PICKER.selected = pmoIsoToDate(input.value);
  PMO_DATE_PICKER.view = new Date(current.getFullYear(), current.getMonth(), 1);
  renderPmoDatePicker();
  positionPmoDatePicker(input, picker);
  picker.classList.add('is-open');
}
function closePmoDatePicker(apply=false) {
  const input = PMO_DATE_PICKER.input;
  if(apply && input && PMO_DATE_PICKER.selected) {
    input.value = pmoDateToIso(PMO_DATE_PICKER.selected);
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }
  document.getElementById('pmo-date-picker')?.classList.remove('is-open');
  PMO_DATE_PICKER.input = null;
}
function initDatePicker() {
  document.querySelectorAll('input[type="date"]').forEach(enhancePmoDateInput);
  document.addEventListener('pointerdown', event => {
    const input = event.target.closest?.('input[type="date"], .pmo-date-input');
    if(!input || input.disabled || input.dataset.nativeDate === 'true') return;
    event.preventDefault();
    input.focus({ preventScroll:true });
    openPmoDatePicker(input);
  }, true);
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && document.getElementById('pmo-date-picker')?.classList.contains('is-open')) closePmoDatePicker(false);
    if((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('input[type="date"], .pmo-date-input')) {
      event.preventDefault();
      openPmoDatePicker(event.target);
    }
  });
  document.addEventListener('click', event => {
    const picker = document.getElementById('pmo-date-picker');
    if(!picker?.classList.contains('is-open')) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if(path.includes(picker) || event.target.closest('#pmo-date-picker') || event.target.closest('input[type="date"], .pmo-date-input')) return;
    closePmoDatePicker(false);
  });
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if(!(node instanceof Element)) return;
      if(node.matches('input[type="date"]')) enhancePmoDateInput(node);
      node.querySelectorAll?.('input[type="date"]').forEach(enhancePmoDateInput);
    }));
  });
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('resize', () => {
    const picker = document.getElementById('pmo-date-picker');
    if(picker?.classList.contains('is-open') && PMO_DATE_PICKER.input) positionPmoDatePicker(PMO_DATE_PICKER.input, picker);
  });
}

function closePmoSelects(except=null) {
  document.querySelectorAll('.pmo-select.is-open').forEach(el => {
    if(el !== except) el.classList.remove('is-open');
  });
}

function renderPmoSelect(select) {
  const wrap = select?.closest?.('.pmo-select');
  if(!wrap) return;
  const button = wrap.querySelector('.pmo-select-trigger');
  const menu = wrap.querySelector('.pmo-select-menu');
  if(!button || !menu) return;
  const selected = select.options[select.selectedIndex] || select.options[0];
  button.disabled = select.disabled;
  button.querySelector('span').textContent = selected ? selected.textContent.trim() : 'Select';
  menu.innerHTML = Array.from(select.options).map((option, index) => `
    <button type="button"
      class="pmo-select-option ${option.selected ? 'is-selected' : ''}"
      data-pmo-option-index="${index}"
      ${option.disabled ? 'disabled' : ''}>
      <span>${esc(option.textContent.trim())}</span>
      ${option.selected ? '<b aria-hidden="true">✓</b>' : '<b aria-hidden="true"></b>'}
    </button>
  `).join('') || '<div class="pmo-select-empty">No values</div>';
}

function enhancePmoSelect(select) {
  if(!select || select.multiple || select.dataset.nativeSelect === 'true') return;
  if(select.closest('.res-filter-menu')) return;
  if(select.dataset.pmoEnhanced === 'true') {
    renderPmoSelect(select);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'pmo-select';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.dataset.pmoEnhanced = 'true';
  select.classList.add('pmo-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  wrap.insertAdjacentHTML('beforeend', `
    <button type="button" class="pmo-select-trigger">
      <span></span><b aria-hidden="true">▾</b>
    </button>
    <div class="pmo-select-menu"></div>
  `);
  wrap.querySelector('.pmo-select-trigger').addEventListener('click', event => {
    event.stopPropagation();
    if(select.disabled) return;
    const next = !wrap.classList.contains('is-open');
    closePmoSelects(wrap);
    wrap.classList.toggle('is-open', next);
    if(next) renderPmoSelect(select);
  });
  wrap.querySelector('.pmo-select-menu').addEventListener('click', event => {
    event.stopPropagation();
    const optionBtn = event.target.closest('[data-pmo-option-index]');
    if(!optionBtn || optionBtn.disabled) return;
    const nextIndex = Number(optionBtn.dataset.pmoOptionIndex);
    if(Number.isNaN(nextIndex)) return;
    select.selectedIndex = nextIndex;
    select.dispatchEvent(new Event('input', { bubbles:true }));
    select.dispatchEvent(new Event('change', { bubbles:true }));
    wrap.classList.remove('is-open');
    renderPmoSelect(select);
  });
  select.addEventListener('change', () => renderPmoSelect(select));
  renderPmoSelect(select);
}

function enhancePmoSelects(root=document) {
  const scope = root instanceof Element || root instanceof Document ? root : document;
  const selects = scope.matches?.('select.ri, .fg select')
    ? [scope]
    : [...scope.querySelectorAll('select.ri, .fg select')];
  selects.forEach(enhancePmoSelect);
}

function initCustomSelects() {
  enhancePmoSelects(document);
  document.addEventListener('click', event => {
    if(event.target.closest('.pmo-select')) return;
    closePmoSelects();
  });
  const observer = new MutationObserver(records => {
    const touched = new Set();
    records.forEach(record => {
      if(record.target instanceof HTMLSelectElement) touched.add(record.target);
      if(record.target instanceof Element) {
        const select = record.target.closest?.('select');
        if(select) touched.add(select);
      }
      record.addedNodes.forEach(node => {
        if(!(node instanceof Element)) return;
        if(node.matches('select.ri, .fg select')) touched.add(node);
        node.querySelectorAll?.('select.ri, .fg select').forEach(select => touched.add(select));
      });
    });
    touched.forEach(select => {
      enhancePmoSelect(select);
      renderPmoSelect(select);
    });
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

// ── Init ──
function initApp() {
  initMicroInteractions();
  initDatePicker();
  initCustomSelects();
  if(typeof initAuthSession === 'function') initAuthSession();
  syncThemeControl();
  ['f-date','f-signdate','f-apprdate','sl-ratedate'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = todayISO;
  });

  renderPendingMemos();
  renderHistoryMemos();
  refreshNotifications();
  rebuildAcct();
  setInterval(() => fetch('https://memo-pdf-server.onrender.com/ping').catch(()=>{}), 4*60*1000);
  // Load from Supabase on startup and refresh UI
  loadMemosAsync().then(() => {
      renderPendingMemos();
      renderHistoryMemos();
      refreshNotifications();
  
  }).catch(e => console.warn('Supabase init load failed', e));
  // Load settings and refresh all dropdowns
  if(typeof initSettings === 'function') initSettings();
  document.addEventListener('click', event => {
    const panel = document.getElementById('notification-panel');
    if(!panel?.classList.contains('is-open')) return;
    if(event.target.closest('#notification-panel, #notification-btn')) return;
    closeNotifications();
  });
}
