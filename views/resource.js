// ─────────────────────────────────────────
// views/resource.js — Resource Management (v0.2 — slimmed)
// Orbit Digital PMO Super App
//
// Single table, 3 lenses (tabs) + status-based sub-views (chips).
//   • Request       — hiring pipeline (User → PMO/Dir approve → BBIK recruit)
//   • Transfer      — ย้ายโครงการภายใน Orbit (ดูเฉพาะรายการ transfer)
//   • Project Code  — คนที่ถือหลาย project code (multi-allocation)
//
// Roles (3):
//   user  — ผู้ขอ: สร้าง Request, เห็นเฉพาะ "โครงการที่เลือก" (dropdown)
//   pmo   — PMO/Dir: เห็นทุกโครงการ, อนุมัติ Request, ปิดงาน, ลบ
//   bbik  — บริษัทแม่: เห็นเฉพาะรายการที่ "Approved ขึ้นไป" แล้วสรรหา
//
// Flow:  pending → (PMO approve) → approved → (BBIK รับงาน) → sourcing →
//        interviewing → offer → document → (PMO onboard) → filled → resolved
//
// Self-contained: chrome (role/tab/chips) ถูก inject ด้วย JS — ไม่ต้องแก้ index.html
// Depends on globals from app.js: esc, shortDate, todayISO, checkSupa, supaFetch
// ─────────────────────────────────────────


const RES_KEY = 'orbit-pmo-resources-v1';
let _resCache = null;


// ── Status config ──
const RES_STATUS = {
  pending:     { label:'Pending (รออนุมัติ)',  cls:'badge-gray',   th:'User ขอแล้ว รอ PMO/Dir อนุมัติ' },
  approved:    { label:'Approved → BBIK',       cls:'badge-blue',   th:'PMO/Dir อนุมัติแล้ว รอ BBIK รับไปสรรหา' },
  sourcing:    { label:'Sourcing (BBIK)',       cls:'badge-blue',   th:'BBIK กำลังหาคน' },
  interviewing:{ label:'Interviewing (BBIK)',   cls:'badge-purple', th:'BBIK กำลังสัมภาษณ์' },
  offer:       { label:'Offer (BBIK)',          cls:'badge-amber',  th:'BBIK กำลังทำ Offer' },
  document:    { label:'Document (BBIK)',       cls:'badge-yellow', th:'BBIK กำลังจัดทำเอกสาร' },
  filled:      { label:'Filled / Onboarded',    cls:'badge-green',  th:'รับเข้า / onboard แล้ว' },
  mitigated:   { label:'Mitigated',             cls:'badge-teal',   th:'แก้ไขโดยเติมคนภายใน (legacy)' },
  resolved:    { label:'Resolved',              cls:'badge-green',  th:'ปิดงาน (เช่น transfer / ปิดเคส)' },
  cancelled:   { label:'Cancelled',             cls:'badge-red',    th:'ยกเลิก' },
};
const OPEN = ['pending','approved','sourcing','interviewing','offer','document'];
const RECRUITING = ['sourcing','interviewing','offer','document'];


const LEVEL_OPTS = ['Junior','Mid','Senior','Lead','Manager'];
const HIRING_OPTS = ['Permanent (Direct)','Secondment','Sub-contract'];


// ── Status sub-views (chips, Request tab only) ──
const RES_VIEWS = [
  { key:'all',        label:'ทั้งหมด',      match:()=>true },
  { key:'pending',    label:'รออนุมัติ',     match:r=>r.status==='pending' },
  { key:'approved',   label:'อนุมัติแล้ว',   match:r=>r.status==='approved' },
  { key:'recruiting', label:'กำลังสรรหา',    match:r=>RECRUITING.includes(r.status) },
  { key:'filled',     label:'รับเข้าแล้ว',   match:r=>r.status==='filled' },
  { key:'closed',     label:'ปิดงาน',        match:r=>['resolved','mitigated'].includes(r.status) },
  { key:'cancelled',  label:'ยกเลิก',        match:r=>r.status==='cancelled' },
];


// ═══════════════════════════════════════════
// Permission layer — role + status transition matrix
// ═══════════════════════════════════════════
const RES_ROLE_KEY    = 'orbit-pmo-resource-role-v1';
const RES_PROJECT_KEY = 'orbit-pmo-user-project-v1';
const RES_ROLES = {
  user: 'User (ผู้ขอ)',
  pmo:  'PMO / Dir',
  bbik: 'BBIK (บริษัทแม่)',
};


// STATUS_FLOW[currentStatus][role] = [allowed next statuses]. PMO can set anything.
const STATUS_FLOW = {
  pending:      { pmo:['approved','cancelled'], user:['cancelled'] },
  approved:     { bbik:['sourcing'], pmo:['cancelled'] },
  sourcing:     { bbik:['interviewing'], pmo:['cancelled'] },
  interviewing: { bbik:['offer'], pmo:['cancelled'] },
  offer:        { bbik:['document'], pmo:['cancelled'] },
  document:     { pmo:['filled'] },           // Orbit ยืนยัน onboard
  filled:       { pmo:['resolved'], user:['resolved'] },
  mitigated:    {},
  resolved:     {},
  cancelled:    {},
};


// BBIK เห็นได้เฉพาะรายการที่อนุมัติแล้วขึ้นไป (cross-company isolation)
const BBIK_VISIBLE = ['approved','sourcing','interviewing','offer','document'];


let _role = null;
let _userProject = null;
function resProjects() {
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  return s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
}
function currentRole() {
  if(_role) return _role;
  try { _role = localStorage.getItem(RES_ROLE_KEY) || 'pmo'; } catch(e) { _role = 'pmo'; }
  if(!RES_ROLES[_role]) _role = 'pmo';
  return _role;
}
function setRole(r) {
  if(!RES_ROLES[r]) return;
  _role = r;
  try { localStorage.setItem(RES_ROLE_KEY, r); } catch(e) {}
  _resPage = 1;
  renderResource();
}
function currentUserProject() {
  if(_userProject !== null) return _userProject;
  try { _userProject = localStorage.getItem(RES_PROJECT_KEY) || ''; } catch(e) { _userProject = ''; }
  if(!_userProject) { const p = resProjects(); _userProject = p[0] || ''; }
  return _userProject;
}
function setUserProject(p) {
  _userProject = p;
  try { localStorage.setItem(RES_PROJECT_KEY, p); } catch(e) {}
  _resPage = 1;
  renderResource();
}
// Allowed next statuses for a given (status, role)
function allowedNext(status, role) {
  if(role === 'pmo') return Object.keys(RES_STATUS).filter(s => s !== status); // unlock-all
  const map = STATUS_FLOW[status] || {};
  return map[role] ? [...map[role]] : [];
}
function canManageRequest(role) { return role === 'user' || role === 'pmo'; } // create/edit request
function canApprove(role)       { return role === 'pmo'; }                     // approve pending
function canRecruit(role)       { return role === 'bbik'; }                    // accept + run pipeline
function canInternalOps(role)   { return role === 'user' || role === 'pmo'; }  // transfer / add-code
function canDelete(role)        { return role === 'pmo'; }                     // hard delete
function isTransfer(r)          { return !!r.transferFrom; }


function visibleToRole(list, role) {
  if(role === 'bbik') return list.filter(r => BBIK_VISIBLE.includes(r.status));
  if(role === 'user') { const p = currentUserProject(); return p ? list.filter(r => r.project === p) : list; }
  return list; // pmo
}


// ── Storage ──
function loadResources() {
  if(_resCache) return _resCache;
  try { const d = JSON.parse(localStorage.getItem(RES_KEY)||'[]'); _resCache=Array.isArray(d)?d:[]; }
  catch(e) { _resCache = []; }
  return _resCache;
}
function storeResources(list) {
  _resCache = list;
  try { localStorage.setItem(RES_KEY, JSON.stringify(list)); } catch(e) {}
}
async function loadResourcesAsync() {
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      const rows = await supaFetch('resource_requests','GET',null,'?order=created_at.desc&limit=500');
      _resCache = (rows||[]).map(r => ({
        id: r.id, resourceTeam: r.resource_team, project: r.project,
        position: r.position, level: r.level, hc: r.hc,
        hiringType: r.hiring_type, startDate: r.start_date, endDate: r.end_date,
        requestDate: r.request_date, resolvedDate: r.resolved_date,
        remark: r.remark, status: r.status, requesterName: r.requester_name,
        transferFrom: r.transfer_from, projectCodes: r.project_codes||[],
        activityLog: r.activity_log||[],
        createdAt: r.created_at, updatedAt: r.updated_at,
      }));
      try { localStorage.setItem(RES_KEY, JSON.stringify(_resCache)); } catch(e) {}
      return _resCache;
    } catch(e) { console.warn('Resource load failed', e.message); }
  }
  return loadResources();
}
async function saveResourceAsync(data) {
  const list = await loadResourcesAsync();
  const now = new Date().toISOString();
  const isNew = !list.find(r => r.id === data.id);
  const saved = { ...data, updatedAt: now, createdAt: isNew ? now : (list.find(r=>r.id===data.id)?.createdAt||now) };
  _resCache = isNew ? [...list, saved] : list.map(r => r.id===data.id ? saved : r);
  storeResources(_resCache);
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      await supaFetch('resource_requests','POST',{
        id: saved.id, resource_team: saved.resourceTeam, project: saved.project,
        position: saved.position, level: saved.level, hc: saved.hc,
        hiring_type: saved.hiringType, start_date: saved.startDate, end_date: saved.endDate||null,
        request_date: saved.requestDate, resolved_date: saved.resolvedDate||null,
        remark: saved.remark, status: saved.status, requester_name: saved.requesterName,
        transfer_from: saved.transferFrom||null, project_codes: saved.projectCodes||[],
        activity_log: saved.activityLog||[],
        created_at: saved.createdAt, updated_at: saved.updatedAt,
      },'?on_conflict=id');
    } catch(e) { console.warn('Resource save failed', e.message); }
  }
  return saved;
}
async function deleteResourceAsync(id) {
  const list = await loadResourcesAsync();
  _resCache = list.filter(r => r.id !== id);
  storeResources(_resCache);
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      await supaFetch('resource_requests','DELETE',null,`?id=eq.${encodeURIComponent(id)}`);
    } catch(e) { console.warn('Resource delete failed', e.message); }
  }
}
function nextResId() {
  const d = new Date();
  return `RES-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}-${String(loadResources().length+1).padStart(3,'0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}


// ── Display config — Request ID column toggle อยู่ในหน้า Settings ──
// อ่านจาก settings (resource.showRequestId); มี override ชั่วคราวผ่าน setShowRequestId(true/false), null = กลับไปใช้ settings
let _showIdOverride = null;
function showRequestId() {
  if(_showIdOverride !== null) return _showIdOverride;
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  return !!(s?.resource?.showRequestId);
}
function setShowRequestId(v) { _showIdOverride = (v===null ? null : !!v); renderResource(); }


// ── Main render ──
let _resPage = 1;
const RES_PER_PAGE = 20;
let _resSortCol = 'requestDate';
let _resSortAsc = false;
let _resTab  = 'request';   // 'request' | 'transfer' | 'code'
let _resView = 'all';       // chip key (request tab)


// ── Table columns (config-driven: หัวตาราง + แถว ใช้ตัวเดียวกัน) ──
// เพิ่ม / ลบ / ซ่อน คอลัมน์ที่นี่ที่เดียว — ไม่ต้องแก้ <thead> ใน index.html
function resColumns() {
  const C = [];
  if(showRequestId()) C.push({ key:'id', label:'ID', th:'padding-left:12px',
    cell:r=>`<span style="font-family:monospace;font-size:11px;color:var(--text-3)">${esc(r.id)}</span>` });
  C.push(
    { key:'team',     label:'Resource Team', cell:r=>esc(r.resourceTeam) },
    { key:'project',  label:'Project', cell:r=>`<span style="font-weight:500">${esc(r.project)}</span>${(r.projectCodes||[]).length?` <span class="badge badge-teal" style="font-size:9px">+${(r.projectCodes||[]).length} code</span>`:''}${isTransfer(r)?` <span class="badge badge-blue" style="font-size:9px">↗</span>`:''}` },
    { key:'position', label:'Position', cell:r=>esc(r.position) },
    { key:'level',    label:'Level', cell:r=>`<span class="badge badge-gray" style="font-size:10px">${esc(r.level)}</span>` },
    { key:'hiring',   label:'Hiring Type', cell:r=>`<span style="font-size:11px">${esc(r.hiringType)}</span>` },
    { key:'start',    label:'Start', cell:r=>`<span style="font-size:11px">${r.startDate?shortDate(r.startDate):'—'}</span>` },
    { key:'end',      label:'End', cell:r=>`<span style="font-size:11px">${r.endDate?shortDate(r.endDate):'—'}</span>` },
    { key:'reqdate',  label:'Request Date', cell:r=>`<span style="font-size:11px">${r.requestDate?shortDate(r.requestDate):'—'}</span>` },
    { key:'resolved', label:'Resolved', cell:r=>`<span style="font-size:11px">${r.resolvedDate?shortDate(r.resolvedDate):'—'}</span>` },
    { key:'updated',  label:'Updated', cell:r=>`<span style="font-size:11px;color:var(--text-3)">${r.updatedAt?shortDate(String(r.updatedAt).slice(0,10)):'—'}</span>` },
    { key:'status',   label:'Status', cell:r=>{ const s=RES_STATUS[r.status]||{label:r.status,cls:'badge-gray'}; return `<span class="badge ${s.cls}" style="font-size:10px;white-space:nowrap">${esc(s.label)}</span>`; } },
    { key:'action',   label:'', th:'text-align:center', td:'text-align:center', cell:r=>`<button class="btn-sm" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="event.stopPropagation();openResDetail('${r.id}')" title="จัดการ">⚙ จัดการ</button>` },
  );
  return C;
}


async function renderResource() {
  ensureResChrome();
  const all = await loadResourcesAsync();
  _renderResourceUI(all);
}


function setResTab(t)  { _resTab = t; _resPage = 1; _renderResourceUI(loadResources()); }
function setResView(v) { _resView = v; _resPage = 1; _renderResourceUI(loadResources()); }


// Inject role bar + tab bar + chips at top of view (once)
function ensureResChrome() {
  if(document.getElementById('res-chrome')) return;
  const view = document.getElementById('view-resource');
  if(!view) return;
  const wrap = document.createElement('div');
  wrap.id = 'res-chrome';
  wrap.innerHTML = `
    <div id="res-role-bar" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px">กำลังทำงานในนาม</span>
      <select id="res-role-select" onchange="setRole(this.value)" style="font-family:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        ${Object.entries(RES_ROLES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}
      </select>
      <span id="res-proj-wrap" style="display:none;align-items:center;gap:6px;font-size:12px;color:var(--text-2)">
        โครงการ: <select id="res-proj-select" onchange="setUserProject(this.value)" style="font-family:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)"></select>
      </span>
      <span id="res-role-note" style="font-size:11px;color:var(--text-3)"></span>
    </div>
    <div id="res-tab-bar" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <button class="btn-sm res-tab" data-tab="request"  onclick="setResTab('request')"  style="padding:6px 14px">📋 Request</button>
      <button class="btn-sm res-tab" data-tab="transfer" onclick="setResTab('transfer')" style="padding:6px 14px">↗ Transfer</button>
      <button class="btn-sm res-tab" data-tab="code"     onclick="setResTab('code')"     style="padding:6px 14px">⊕ Project Code</button>
    </div>
    <div id="res-view-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"></div>`;
  view.insertBefore(wrap, view.firstChild);

  // dropdown สถานะเดิมซ้ำกับ chips → ซ่อนทิ้ง (โค้ดใหม่ใช้ chips กรองสถานะแทน)
  const fStatusSel = document.getElementById('res-f-status');
  if(fStatusSel) fStatusSel.style.display = 'none';
}


function _renderResourceUI(allRaw) {
  const role = currentRole();


  // ── Sync role bar ──
  const roleSel = document.getElementById('res-role-select');
  if(roleSel) roleSel.value = role;
  const projWrap = document.getElementById('res-proj-wrap');
  if(projWrap) {
    if(role === 'user') {
      projWrap.style.display = 'inline-flex';
      const ps = document.getElementById('res-proj-select');
      if(ps) ps.innerHTML = resProjects().map(p=>`<option ${currentUserProject()===p?'selected':''}>${esc(p)}</option>`).join('');
    } else projWrap.style.display = 'none';
  }
  const roleNote = document.getElementById('res-role-note');
  if(roleNote) roleNote.textContent =
      role === 'user' ? '— เห็นเฉพาะโครงการที่เลือก'
    : role === 'bbik' ? '— เห็นเฉพาะรายการที่อนุมัติแล้ว (Approved → Document)'
    : '— เห็นทุกโครงการ / อนุมัติ / ปลดล็อกสถานะ / ลบได้';


  // ── Sync tab bar ── (BBIK เห็นเฉพาะแท็บ Request)
  if(role === 'bbik' && _resTab !== 'request') _resTab = 'request';
  document.querySelectorAll('#res-tab-bar .res-tab').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    const hideForBbik = role === 'bbik' && tab !== 'request';
    btn.style.display = hideForBbik ? 'none' : '';
    const on = tab === _resTab;
    btn.style.background  = on ? 'var(--blue)' : '';
    btn.style.color       = on ? '#fff' : '';
    btn.style.fontWeight  = on ? '700' : '';
  });


  // ── Visibility + tab/chip filter ──
  let scoped = visibleToRole(allRaw, role);
  const chips = document.getElementById('res-view-chips');


  if(_resTab === 'transfer') {
    if(chips) chips.style.display = 'none';
    scoped = scoped.filter(isTransfer);
  } else if(_resTab === 'code') {
    if(chips) chips.style.display = 'none';
    scoped = scoped.filter(r => (r.projectCodes||[]).length > 0);
  } else { // request tab → status chips
    if(chips) {
      chips.style.display = 'flex';
      chips.innerHTML = RES_VIEWS.map(v => {
        const n = scoped.filter(v.match).length;
        const on = _resView === v.key;
        return `<button class="btn-sm" onclick="setResView('${v.key}')" style="padding:4px 11px;font-size:11px;${on?'background:var(--blue);color:#fff;font-weight:700':''}">${esc(v.label)} <span style="opacity:.7">${n}</span></button>`;
      }).join('');
    }
    const v = RES_VIEWS.find(x=>x.key===_resView) || RES_VIEWS[0];
    scoped = scoped.filter(v.match);
  }


  // ── KPI cards (computed over role-scoped data, ignoring tab/chip) ──
  const base = visibleToRole(allRaw, role);
  const open    = base.filter(r => OPEN.includes(r.status)).length;
  const pending = base.filter(r => r.status === 'pending').length;
  const recr    = base.filter(r => RECRUITING.includes(r.status)).length;
  const thisMonth = (() => { const m=new Date().toISOString().slice(0,7); return base.filter(r=>r.status==='filled'&&r.resolvedDate?.startsWith(m)).length; })();
  const cancelled = base.filter(r => r.status === 'cancelled').length;
  const kpiEl = document.getElementById('res-kpi');
  if(kpiEl) kpiEl.innerHTML = `
    <div class="metric-card"><div class="metric-label">Total Open</div><div class="metric-val" style="color:var(--blue)">${open}</div></div>
    <div class="metric-card"><div class="metric-label">รออนุมัติ</div><div class="metric-val" style="color:var(--text-2)">${pending}</div></div>
    <div class="metric-card"><div class="metric-label">กำลังสรรหา (BBIK)</div><div class="metric-val" style="color:var(--amber)">${recr}</div></div>
    <div class="metric-card"><div class="metric-label">รับเข้าเดือนนี้</div><div class="metric-val" style="color:var(--green)">${thisMonth}</div></div>
    <div class="metric-card"><div class="metric-label">Cancelled</div><div class="metric-val" style="color:var(--red)">${cancelled}</div></div>`;


  // New Request — เฉพาะ role ที่สร้างได้ และเฉพาะแท็บ Request
  const newBtn = document.querySelector('#view-resource .filter-row .btn-primary');
  if(newBtn) newBtn.style.display = (canManageRequest(role) && _resTab==='request') ? '' : 'none';


  // ── Optional inline filters (if present in index.html) ──
  const search   = (document.getElementById('res-search')?.value||'').toLowerCase();
  const fHiring  = document.getElementById('res-f-hiring')?.value  || 'all';
  const fProject = document.getElementById('res-f-project')?.value || 'all';
  const fLevel   = document.getElementById('res-f-level')?.value   || 'all';


  let list = scoped;
  if(fHiring  !== 'all') list = list.filter(r => r.hiringType === fHiring);
  if(fProject !== 'all') list = list.filter(r => r.project === fProject);
  if(fLevel   !== 'all') list = list.filter(r => r.level === fLevel);
  if(search) list = list.filter(r =>
    `${r.project} ${r.position} ${r.resourceTeam} ${r.level}`.toLowerCase().includes(search));


  // Sort + paginate
  list = [...list].sort((a,b) => {
    let va = a[_resSortCol]||'', vb = b[_resSortCol]||'';
    return _resSortAsc ? (va>vb?1:-1) : (va<vb?1:-1);
  });
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total/RES_PER_PAGE));
  if(_resPage > pages) _resPage = 1;
  const slice = list.slice((_resPage-1)*RES_PER_PAGE, _resPage*RES_PER_PAGE);


  // ── Columns + Table (header คุมจาก JS — ไม่ต้องแก้ <thead> ใน index.html) ──
  const cols = resColumns();
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;


  const table = tbody.closest('table');
  if(table) {
    let thead = table.querySelector('thead');
    if(!thead) { thead = document.createElement('thead'); table.insertBefore(thead, table.firstChild); }
    thead.innerHTML = `<tr>${cols.map(c=>`<th style="${c.th||''}">${esc(c.label)}</th>`).join('')}</tr>`;
  }


  const emptyMsg =
      _resTab==='transfer' ? 'ไม่มีรายการ Transfer (เริ่ม Transfer ได้จากรายการ Filled ในแท็บ Request)'
    : _resTab==='code'     ? 'ไม่มีคนที่ถือ Project Code เพิ่ม (เพิ่มได้จากรายการ Filled ในแท็บ Request)'
    : role==='bbik'        ? 'ยังไม่มีรายการที่อนุมัติมาให้ BBIK'
    : role==='user'        ? `ยังไม่มีรายการของโครงการ ${esc(currentUserProject()||'-')} — กด + New Request`
    : 'ไม่มีรายการ — กด + New Request เพื่อเริ่ม';


  if(!slice.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:34px;color:var(--text-3)">${emptyMsg}</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(r =>
      `<tr style="cursor:pointer" onclick="openResDetail('${r.id}')">${cols.map(c=>`<td style="${c.td||''}">${c.cell(r)}</td>`).join('')}</tr>`
    ).join('');
  }


  // Pagination
  const pagEl = document.getElementById('res-pagination');
  if(pagEl) pagEl.innerHTML = `
    <span style="font-size:12px;color:var(--text-3)">${total} รายการ | หน้า ${_resPage}/${pages}</span>
    <div style="display:flex;gap:4px">
      <button class="btn-sm" ${_resPage<=1?'disabled':''} onclick="_resPage=1;_renderResourceUI(loadResources())" style="padding:3px 8px">«</button>
      <button class="btn-sm" ${_resPage<=1?'disabled':''} onclick="_resPage--;_renderResourceUI(loadResources())" style="padding:3px 8px">‹</button>
      <button class="btn-sm" ${_resPage>=pages?'disabled':''} onclick="_resPage++;_renderResourceUI(loadResources())" style="padding:3px 8px">›</button>
      <button class="btn-sm" ${_resPage>=pages?'disabled':''} onclick="_resPage=pages;_renderResourceUI(loadResources())" style="padding:3px 8px">»</button>
    </div>`;
}


// ── New/Edit Modal ──
function openResModal(id) {
  const role = currentRole();
  if(!canManageRequest(role)) { alert(`${RES_ROLES[role]} ไม่มีสิทธิ์สร้าง/แก้ไข request`); return; }
  const isEdit = !!id;
  const r = isEdit ? loadResources().find(x => x.id===id) : null;
  // User สร้าง/แก้ได้เฉพาะโครงการตัวเอง
  const projects = role==='user' ? [currentUserProject()] : resProjects();
  const defProject = r?.project || (role==='user' ? currentUserProject() : '');
  const projectOpts = projects.map(p=>`<option value="${esc(p)}" ${defProject===p?'selected':''}>${esc(p)}</option>`).join('');


  document.getElementById('res-modal-title').textContent = isEdit ? 'Edit Resource Request' : 'New Resource Request';
  document.getElementById('res-edit-id').value = id||'';
  const g = (fld,def='') => r ? (r[fld]||def) : def;


  document.getElementById('res-form-body').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Resource Team *</label><input id="rf-team" class="ri" placeholder="เช่น Dev, QA, BA" value="${esc(g('resourceTeam'))}"></div>
      <div class="fg"><label>โครงการ (Target) *</label><select id="rf-project" class="ri" ${role==='user'?'disabled title="User สร้างได้เฉพาะโครงการของตัวเอง"':''}>${role==='user'?'':'<option value="">— เลือกโครงการ —</option>'}${projectOpts}</select></div>
      <div class="fg"><label>Position *</label><input id="rf-position" class="ri" placeholder="เช่น Senior Backend Developer" value="${esc(g('position'))}"></div>
      <div class="fg"><label>Level *</label><select id="rf-level" class="ri">${LEVEL_OPTS.map(l=>`<option ${g('level')===l?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fg"><label>Hiring Type *</label><select id="rf-hiring" class="ri" onchange="toggleEndDateRequired()">
        ${HIRING_OPTS.map(h=>`<option ${g('hiringType')===h?'selected':''}>${h}</option>`).join('')}
      </select></div>
      <div class="fg"><label>Start Date *</label><input id="rf-start" class="ri" type="date" value="${g('startDate')}"></div>
      <div class="fg"><label id="rf-end-label">End Date</label><input id="rf-end" class="ri" type="date" value="${g('endDate')}"></div>
      <div class="fg"><label>Requester Name</label><input id="rf-requester" class="ri" placeholder="ชื่อผู้ขอ" value="${esc(g('requesterName'))}"></div>
      <div class="fg"><label>Request Date</label><input id="rf-reqdate" class="ri" type="date" value="${g('requestDate', todayISO)}" readonly style="background:var(--bg)"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label><textarea id="rf-remark" class="ri" rows="3" placeholder="หมายเหตุ / เหตุผล">${esc(g('remark'))}</textarea></div>`;


  toggleEndDateRequired();
  document.getElementById('resource-modal').style.display = 'flex';
}


function toggleEndDateRequired() {
  const ht = document.getElementById('rf-hiring')?.value||'';
  const lbl = document.getElementById('rf-end-label');
  const inp = document.getElementById('rf-end');
  const req = ht === 'Secondment' || ht === 'Sub-contract';
  if(lbl) lbl.textContent = req ? 'End Date *' : 'End Date';
  if(inp) inp.required = req;
}
function closeResModal() { document.getElementById('resource-modal').style.display='none'; }


async function saveResource() {
  const role = currentRole();
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const team = g('rf-team');
  // โครงการ: User ถูกล็อกเป็นของตัวเอง (select disabled → อ่านค่าไม่ได้ ใช้ currentUserProject)
  const project = role==='user' ? currentUserProject() : g('rf-project');
  const position = g('rf-position');
  const hc = 1; // 1 request = 1 transaction
  const hiring = g('rf-hiring'), startDate = g('rf-start'), endDate = g('rf-end');


  if(!team||!project||!position||!hiring||!startDate) { alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบ'); return; }
  if((hiring==='Secondment'||hiring==='Sub-contract') && !endDate) { alert('End Date จำเป็นสำหรับ Secondment / Sub-contract'); return; }
  if(endDate && startDate && endDate < startDate) { alert('End Date ต้องอยู่หลัง Start Date'); return; }


  const editId = g('res-edit-id');
  const existing = editId ? loadResources().find(r=>r.id===editId) : null;
  const actor = RES_ROLES[role];


  const data = {
    id: editId || nextResId(),
    resourceTeam: team, project, position,
    level: g('rf-level'), hc, hiringType: hiring,
    startDate, endDate: endDate||null,
    requestDate: g('rf-reqdate') || todayISO,
    resolvedDate: existing?.resolvedDate||null,
    remark: g('rf-remark'),
    status: existing?.status || 'pending',
    requesterName: g('rf-requester'),
    transferFrom: existing?.transferFrom||null,
    projectCodes: existing?.projectCodes||[],
    activityLog: existing?.activityLog || [{ action:'Created', status:'pending', by: g('rf-requester')||actor, at: new Date().toISOString() }],
  };


  await saveResourceAsync(data);
  closeResModal();
  renderResource();
}


// ── Quick: Approve (PMO/Dir) & Accept (BBIK) ──
async function approveRequest(id) {
  const role = currentRole();
  if(!canApprove(role)) { alert('เฉพาะ PMO/Dir อนุมัติได้'); return; }
  const list = loadResources(); const idx = list.findIndex(r=>r.id===id); if(idx<0) return;
  const r = list[idx];
  if(r.status!=='pending') { alert('อนุมัติได้เฉพาะรายการที่รออนุมัติ'); return; }
  if(!confirm(`อนุมัติ Request นี้?\n\n${r.position} · ${r.project}\n\nหลังอนุมัติจะเข้ากล่องงานของ BBIK`)) return;
  const now = new Date().toISOString();
  const updated = { ...r, status:'approved', updatedAt:now,
    activityLog:[...(r.activityLog||[]), { action:'Approved by PMO/Dir', from:'pending', to:'approved', by:RES_ROLES[role], at:now }] };
  await saveResourceAsync(updated);
  renderResource();
}
async function bbikAccept(id) {
  const role = currentRole();
  if(!canRecruit(role)) { alert('เฉพาะ BBIK รับงานได้'); return; }
  const list = loadResources(); const idx = list.findIndex(r=>r.id===id); if(idx<0) return;
  const r = list[idx];
  if(r.status!=='approved') { alert('รับงานได้เฉพาะรายการที่อนุมัติแล้ว'); return; }
  const now = new Date().toISOString();
  const updated = { ...r, status:'sourcing', updatedAt:now,
    activityLog:[...(r.activityLog||[]), { action:'BBIK accepted (start sourcing)', from:'approved', to:'sourcing', by:RES_ROLES[role], at:now }] };
  await saveResourceAsync(updated);
  renderResource();
}


// ── Status change modal (permission-gated) ──
function openResStatus(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const role = currentRole();
  const nexts = allowedNext(r.status, role);
  if(!nexts.length) {
    alert(`${RES_ROLES[role]} ไม่มีสิทธิ์เปลี่ยนสถานะของรายการนี้ (ขั้น “${RES_STATUS[r.status]?.label||r.status}”)`);
    return;
  }
  const s = RES_STATUS[r.status]||{label:r.status};
  const opts = nexts.map(k=>`<option value="${k}">${RES_STATUS[k]?.label||k}</option>`).join('');
  document.getElementById('res-status-id').value = id;
  document.getElementById('res-status-current').innerHTML =
    `<span class="badge ${RES_STATUS[r.status]?.cls||'badge-gray'}">${s.label}</span> — ${esc(r.position)} / ${esc(r.project)}
     <div style="font-size:11px;color:var(--text-3);margin-top:6px">เปลี่ยนในนาม <strong>${esc(RES_ROLES[role])}</strong></div>`;
  document.getElementById('res-status-select').innerHTML = opts;
  document.getElementById('res-status-remark').value = '';
  document.getElementById('resource-status-modal').style.display = 'flex';
}
function closeResStatus() { document.getElementById('resource-status-modal').style.display='none'; }


function _transitionAction(prev, next) {
  if(prev==='pending'  && next==='approved') return 'Approved by PMO/Dir';
  if(prev==='approved' && next==='sourcing') return 'BBIK accepted (sourcing)';
  if(prev==='document' && next==='filled')   return 'Onboarded (Filled)';
  if(next==='resolved')  return 'Closed';
  if(next==='cancelled') return 'Cancelled';
  return 'Status changed';
}


async function saveResStatus() {
  const id = document.getElementById('res-status-id').value;
  const newStatus = document.getElementById('res-status-select').value;
  const remark = document.getElementById('res-status-remark').value.trim();
  const role = currentRole();


  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const prevStatus = list[idx].status;


  if(!allowedNext(prevStatus, role).includes(newStatus)) {
    alert(`${RES_ROLES[role]} ไม่มีสิทธิ์เปลี่ยน “${RES_STATUS[prevStatus]?.label||prevStatus}” → “${RES_STATUS[newStatus]?.label||newStatus}”`);
    return;
  }
  if(newStatus==='cancelled' && !remark) { alert('กรุณากรอก Remark สำหรับการยกเลิก'); return; }


  const now = new Date().toISOString();
  const updated = { ...list[idx],
    status: newStatus,
    resolvedDate: ['filled','resolved','mitigated'].includes(newStatus) ? todayISO : list[idx].resolvedDate,
    updatedAt: now,
    activityLog: [...(list[idx].activityLog||[]), {
      action: _transitionAction(prevStatus, newStatus), from: prevStatus, to: newStatus,
      by: RES_ROLES[role], remark, at: now
    }],
  };
  if(remark) updated.remark = (updated.remark ? updated.remark+'\n' : '') + `[${new Date().toLocaleDateString('th')}] ${remark}`;


  await saveResourceAsync(updated);
  closeResStatus();
  renderResource();
}


// ── Transfer modal (within Orbit) ──
function openResTransfer(id) {
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} ไม่มีสิทธิ์ทำ Transfer`); return; }
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const projectOpts = resProjects().filter(p=>p!==r.project).map(p=>`<option>${esc(p)}</option>`).join('');
  document.getElementById('res-transfer-id').value = id;
  document.getElementById('res-transfer-body').innerHTML = `
    <p style="font-size:12px;color:var(--text-2);margin-bottom:12px">
      Transfer <strong>${esc(r.position)}</strong> (${esc(r.resourceTeam)}) จาก <strong>${esc(r.project)}</strong> ไปยัง:
    </p>
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>โครงการปลายทาง *</label><select id="rtf-project" class="ri"><option value="">— เลือก —</option>${projectOpts}</select></div>
      <div class="fg"><label>Start Date ใหม่ *</label><input id="rtf-start" class="ri" type="date" value="${todayISO}"></div>
      <div class="fg"><label>End Date</label><input id="rtf-end" class="ri" type="date" value="${r.endDate||''}"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>เหตุผลในการ Transfer *</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="ระบุเหตุผล"></textarea></div>`;
  document.getElementById('resource-transfer-modal').style.display = 'flex';
}
function closeResTransfer() { document.getElementById('resource-transfer-modal').style.display='none'; }


async function saveResTransfer() {
  const sourceId = document.getElementById('res-transfer-id').value;
  const destProject = document.getElementById('rtf-project')?.value||'';
  const startDate = document.getElementById('rtf-start')?.value||'';
  const endDate = document.getElementById('rtf-end')?.value||'';
  const remark = document.getElementById('rtf-remark')?.value?.trim()||'';
  const actor = RES_ROLES[currentRole()];
  if(!destProject||!startDate||!remark) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }


  const source = loadResources().find(r=>r.id===sourceId);
  if(!source) return;
  const now = new Date().toISOString();


  const updatedSource = { ...source,
    status: 'resolved', resolvedDate: todayISO, updatedAt: now,
    activityLog: [...(source.activityLog||[]), { action:'Transferred', to: destProject, by: actor, remark, at: now }],
    remark: (source.remark ? source.remark+'\n' : '') + `[Transfer] → ${destProject}: ${remark}`,
  };
  const newRecord = {
    id: nextResId(),
    resourceTeam: source.resourceTeam, project: destProject,
    position: source.position, level: source.level,
    hc: source.hc, hiringType: source.hiringType,
    startDate, endDate: endDate||null,
    requestDate: todayISO, resolvedDate: null,
    remark: `Transferred from ${source.project} (${sourceId})\n${remark}`,
    status: 'filled',
    requesterName: source.requesterName,
    transferFrom: sourceId, projectCodes: source.projectCodes||[],
    activityLog: [{ action:'Transfer received', from: source.project, by: actor, remark, at: now }],
    createdAt: now, updatedAt: now,
  };


  await saveResourceAsync(updatedSource);
  await saveResourceAsync(newRecord);
  closeResTransfer();
  renderResource();
  alert(`✓ Transfer เสร็จสิ้น\nสร้างรายการใหม่ ${newRecord.id} สำหรับ ${destProject}`);
}


// ── Add Project Code modal ──
function ensureAddCodeModal() {
  if(document.getElementById('res-addcode-modal')) return;
  const m = document.createElement('div');
  m.id = 'res-addcode-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center';
  m.innerHTML = `
    <div class="card" style="width:520px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:15px;font-weight:700">⊕ เพิ่ม Project Code</span>
        <button class="btn-sm" onclick="closeAddCode()" style="padding:4px 10px">✕</button>
      </div>
      <input type="hidden" id="addcode-id">
      <div id="addcode-target" style="font-size:12px;margin-bottom:12px"></div>
      <div id="addcode-existing" style="margin-bottom:12px"></div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>โครงการ *</label><select id="addcode-project" class="ri"></select></div>
        <div class="fg"><label>Project Code *</label><input id="addcode-code" class="ri" placeholder="เช่น TTB-2026-DEV"></div>
        <div class="fg"><label>Allocation % *</label><input id="addcode-alloc" class="ri" type="number" min="1" max="100" value="50"></div>
        <div class="fg"><label>หมายเหตุ (cost split)</label><input id="addcode-note" class="ri" placeholder="เช่น แบ่งต้นทุน 50/50"></div>
      </div>
      <div id="addcode-cap" style="font-size:11px;color:var(--text-3);margin-top:8px"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn-ghost" onclick="closeAddCode()">ยกเลิก</button>
        <button class="btn-primary" onclick="saveAddCode()">⊕ เพิ่ม Code</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) closeAddCode(); });
}
function _allocUsed(r) { return (r.projectCodes||[]).reduce((sum,c)=> sum + (Number(c.allocation)||0), 0); }


function openAddCode(id) {
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} ไม่มีสิทธิ์เพิ่ม Project Code`); return; }
  ensureAddCodeModal();
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  if(r.status!=='filled') { alert('เพิ่ม Project Code ได้เฉพาะคนที่ Filled แล้ว'); return; }


  const existing = r.projectCodes||[];
  const usedProjects = [r.project, ...existing.map(c=>c.project)];
  const projectOpts = resProjects().filter(p=>!usedProjects.includes(p)).map(p=>`<option>${esc(p)}</option>`).join('');


  document.getElementById('addcode-id').value = id;
  document.getElementById('addcode-target').innerHTML =
    `<strong>${esc(r.position)}</strong> · ${esc(r.level||'')} <span style="color:var(--text-3)">(${esc(r.resourceTeam||'-')})</span>
     <div style="font-size:11px;color:var(--text-3);margin-top:3px">โครงการหลัก: <strong>${esc(r.project)}</strong></div>`;


  const used = _allocUsed(r);
  document.getElementById('addcode-existing').innerHTML = existing.length
    ? `<div style="font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:5px">Project Code ที่ถืออยู่</div>` +
      existing.map(c=>`<div style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;display:flex;justify-content:space-between">
        <span><strong>${esc(c.code||'-')}</strong> · ${esc(c.project)}</span><span class="badge badge-teal" style="font-size:9px">${esc(String(c.allocation||0))}%</span></div>`).join('')
    : `<div style="font-size:11px;color:var(--text-3)">ยังไม่มี project code เพิ่มเติม</div>`;


  document.getElementById('addcode-project').innerHTML = `<option value="">— เลือก —</option>${projectOpts}`;
  document.getElementById('addcode-code').value = '';
  document.getElementById('addcode-alloc').value = Math.min(50, Math.max(1, 100-used));
  document.getElementById('addcode-note').value = '';
  document.getElementById('addcode-cap').textContent = `Allocation เพิ่มได้อีกสูงสุด ${Math.max(0, 100-used)}% (ใช้ไปแล้วในโค้ดเสริม ${used}%)`;
  document.getElementById('res-addcode-modal').style.display = 'flex';
}
function closeAddCode() { const m=document.getElementById('res-addcode-modal'); if(m) m.style.display='none'; }


async function saveAddCode() {
  const id = document.getElementById('addcode-id').value;
  const project = document.getElementById('addcode-project').value;
  const code = document.getElementById('addcode-code').value.trim();
  const alloc = parseInt(document.getElementById('addcode-alloc').value)||0;
  const note = document.getElementById('addcode-note').value.trim();
  const actor = RES_ROLES[currentRole()];
  if(!project||!code||alloc<1) { alert('กรุณากรอก โครงการ / Code / Allocation ให้ครบ'); return; }


  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const r = list[idx];
  const used = _allocUsed(r);
  if(used + alloc > 100) { alert(`Allocation รวมเกิน 100% (เหลือเพิ่มได้ ${100-used}%)`); return; }


  const now = new Date().toISOString();
  const updated = { ...r,
    projectCodes: [...(r.projectCodes||[]), { project, code, allocation: alloc, note, at: now }],
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), { action:'Project code added', to: project, by: actor,
      remark: `${code} · ${alloc}%${note?` · ${note}`:''}`, at: now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Add Code] ${code} (${project}) ${alloc}%`,
  };
  await saveResourceAsync(updated);
  closeAddCode();
  renderResource();
  alert(`✓ เพิ่ม Project Code ${code} (${project}) ${alloc}% ให้ ${r.position}`);
}


// ── Delete (hard remove) — PMO only ──
function deleteResource(id) {
  const role = currentRole();
  if(!canDelete(role)) { alert(`${RES_ROLES[role]} ไม่มีสิทธิ์ลบรายการ (เฉพาะ PMO/Dir)`); return; }
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  if(!confirm(`ลบรายการนี้ถาวร?\n\n${r.position} · ${r.project}\n${r.id}\n\n⚠️ การลบไม่สามารถย้อนกลับได้`)) return;
  _doDeleteResource(id);
}
async function _doDeleteResource(id) {
  await deleteResourceAsync(id);
  closeResDetail();
  renderResource();
  alert('✓ ลบรายการเรียบร้อย');
}


// ── Detail drawer ──
// สร้าง drawer เองถ้า index.html ไม่มี (กันปุ่ม "จัดการ" กดแล้วเงียบ)
function ensureDetailDrawer() {
  if(document.getElementById('resource-detail-drawer')) return;
  if(!document.getElementById('res-drawer-style')) {
    const st = document.createElement('style');
    st.id = 'res-drawer-style';
    st.textContent = `
      #res-drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s;z-index:1099}
      #res-drawer-overlay.open{opacity:1;pointer-events:auto}
      #resource-detail-drawer{position:fixed;top:0;right:0;height:100vh;width:440px;max-width:92vw;background:var(--surface,#fff);border-left:1px solid var(--border,#e5e7eb);box-shadow:-8px 0 24px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .22s ease;z-index:1100;overflow:auto}
      #resource-detail-drawer.open{transform:translateX(0)}`;
    document.head.appendChild(st);
  }
  const ov = document.createElement('div');
  ov.id = 'res-drawer-overlay';
  ov.addEventListener('click', closeResDetail);
  document.body.appendChild(ov);
  const dr = document.createElement('div');
  dr.id = 'resource-detail-drawer';
  dr.innerHTML = `
    <div style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
      <span style="font-size:14px;font-weight:700">รายละเอียด</span>
      <button class="btn-sm" onclick="closeResDetail()" style="font-size:16px">✕</button>
    </div>
    <div id="res-detail-body" style="padding:20px"></div>`;
  document.body.appendChild(dr);
}


function openResDetail(id) {
  ensureDetailDrawer();
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const role = currentRole();
  const s = RES_STATUS[r.status]||{label:r.status,cls:'badge-gray'};


  const log = (r.activityLog||[]).slice().reverse().map(l=>
    `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600">${esc(l.action)}${l.from?` (${RES_STATUS[l.from]?.label||l.from} → ${RES_STATUS[l.to]?.label||l.to||''})`:''}${l.to&&!l.from?` → ${esc(l.to)}`:''}</div>
      ${l.remark?`<div style="font-size:11px;color:var(--text-2);margin-top:2px">${esc(l.remark)}</div>`:''}
      <div style="font-size:10px;color:var(--text-3);margin-top:2px">${esc(l.by||'System')} · ${l.at?new Date(l.at).toLocaleString('th-TH'):''}</div>
    </div>`
  ).join('');


  const codes = (r.projectCodes||[]);
  const codesHtml = codes.length
    ? `<div style="font-size:12px;font-weight:700;margin:14px 0 6px;color:var(--text-2)">Project Codes (Multi-allocation)</div>
       <div style="font-size:12px;margin-bottom:6px;color:var(--text-3)">โครงการหลัก: <strong>${esc(r.project)}</strong></div>` +
      codes.map(c=>`<div style="display:flex;justify-content:space-between;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:12px">
        <span><strong>${esc(c.code||'-')}</strong> · ${esc(c.project)}${c.note?` <span style="color:var(--text-3)">· ${esc(c.note)}</span>`:''}</span>
        <span class="badge badge-teal" style="font-size:9px">${esc(String(c.allocation||0))}%</span></div>`).join('')
    : '';


  document.getElementById('res-detail-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(r.position)}</div>
        <div style="font-size:12px;color:var(--text-2)">${esc(r.resourceTeam)} · ${esc(r.project)}</div>
      </div>
      <span class="badge ${s.cls}">${s.label}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px">
      ${[['Level',r.level],['Hiring Type',r.hiringType],
         ['Start Date',r.startDate?shortDate(r.startDate):'—'],['End Date',r.endDate?shortDate(r.endDate):'—'],
         ['Request Date',r.requestDate?shortDate(r.requestDate):'—'],['Resolved Date',r.resolvedDate?shortDate(r.resolvedDate):'—'],
         ['Requester',r.requesterName||'—'],['Transfer From',r.transferFrom||'—']
        ].map(([k,v])=>`<div><span style="color:var(--text-3)">${k}</span><br><strong>${esc(String(v))}</strong></div>`).join('')}
    </div>
    ${codesHtml}
    ${r.remark?`<div style="background:var(--bg);border-radius:var(--r-sm);padding:10px;font-size:12px;margin:16px 0;white-space:pre-wrap">${esc(r.remark)}</div>`:''}
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-2)">Activity Log</div>
    ${log || '<div style="color:var(--text-3);font-size:12px">ไม่มีประวัติ</div>'}
    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      ${(canManageRequest(role)&&r.status==='pending')?`<button class="btn-sm" onclick="openResModal('${r.id}');closeResDetail()">✎ Edit</button>`:''}
      ${(canApprove(role)&&r.status==='pending')?`<button class="btn-sm" style="color:var(--green)" onclick="approveRequest('${r.id}');closeResDetail()">✓ Approve</button>`:''}
      ${(canRecruit(role)&&r.status==='approved')?`<button class="btn-sm" style="color:var(--blue)" onclick="bbikAccept('${r.id}');closeResDetail()">▶ รับงาน</button>`:''}
      ${allowedNext(r.status,role).length?`<button class="btn-sm" onclick="openResStatus('${r.id}');closeResDetail()">⇄ Change Status</button>`:''}
      ${(r.status==='filled'&&canInternalOps(role))?`<button class="btn-sm" style="color:var(--blue)" onclick="openResTransfer('${r.id}');closeResDetail()">↗ Transfer</button>`:''}
      ${(r.status==='filled'&&canInternalOps(role))?`<button class="btn-sm" style="color:var(--green)" onclick="openAddCode('${r.id}');closeResDetail()">⊕ Add Project Code</button>`:''}
      ${canDelete(role)?`<button class="btn-sm" style="color:var(--red)" onclick="deleteResource('${r.id}')">🗑 Delete</button>`:''}
    </div>`;


  document.getElementById('resource-detail-drawer').classList.add('open');
  document.getElementById('res-drawer-overlay')?.classList.add('open');
}
function closeResDetail() {
  document.getElementById('resource-detail-drawer')?.classList.remove('open');
  document.getElementById('res-drawer-overlay')?.classList.remove('open');
}


// ── Export (CSV, role-scoped) ──
function exportResourceCsv() {
  const list = visibleToRole(loadResources(), currentRole());
  if(!list.length) { alert('ไม่มีข้อมูล'); return; }
  const headers = ['ID','Resource Team','Project','Position','Level','Hiring Type','Start Date','End Date','Request Date','Resolved Date','Updated','Status','Requester','Transfer From','Project Codes','Remark'];
  const rows = list.map(r=>[r.id,r.resourceTeam,r.project,r.position,r.level,r.hiringType,r.startDate||'',r.endDate||'',r.requestDate||'',r.resolvedDate||'',r.updatedAt?String(r.updatedAt).slice(0,10):'',RES_STATUS[r.status]?.label||r.status,r.requesterName||'',r.transferFrom||'',(r.projectCodes||[]).map(c=>`${c.code}(${c.project}:${c.allocation}%)`).join(' | '),r.remark||'']);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download = `Resource_Requests_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
  a.click();
}


// Close modals on backdrop
document.addEventListener('click', e => {
  if(e.target===document.getElementById('resource-modal')) closeResModal();
  if(e.target===document.getElementById('resource-status-modal')) closeResStatus();
  if(e.target===document.getElementById('resource-transfer-modal')) closeResTransfer();
});
