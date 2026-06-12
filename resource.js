// ─────────────────────────────────────────
// views/resource.js — Resource Management (BRD v0.1 implementation)
// Orbit Digital PMO Super App
//
// Implements 3 core operations on a SINGLE record (resource_requests):
//   1) Request Resource (New Join)  — Orbit → BBIK pipeline
//   2) Transfer                     — move project within Orbit
//   3) Add Project Code             — one person on >1 project code
//
// Permission model (team-based status gating + BBIK data isolation):
//   teams: pm · resource_team · orbit_hr · bbik_hr · pmo
//   - middle stages (sourcing→document) belong to BBIK
//   - head/tail (escalate, filled/onboard) belong to Orbit HR
//   - internal exits (mitigated/resolved) belong to Resource Team
//   - PMO can unlock anything
//   - BBIK sees ONLY escalated records (sourcing..document)
//
// Self-contained: no index.html change required. Derives only from
// resource_requests records — fully decoupled from Memo/Budget/License/Device.
// Depends on globals from app.js: esc, shortDate, todayISO, checkSupa, supaFetch
// ─────────────────────────────────────────

const RES_KEY = 'orbit-pmo-resources-v1';
let _resCache = null;

// ── Status config ──
const RES_STATUS = {
  pending:     { label:'Pending',             cls:'badge-gray',   th:'มีการ Request แล้ว รอดำเนินการ' },
  sourcing:    { label:'Sourcing (BBIK)',     cls:'badge-blue',   th:'ส่ง BBIK บริษัทแม่ หาคน' },
  interviewing:{ label:'Interviewing (BBIK)', cls:'badge-purple', th:'BBIK กำลังสัมภาษณ์' },
  offer:       { label:'Offer (BBIK)',        cls:'badge-amber',  th:'BBIK กำลังทำ Offer' },
  document:    { label:'Document (BBIK)',     cls:'badge-yellow', th:'BBIK กำลังจัดทำเอกสาร' },
  filled:      { label:'Filled / Onboarded',  cls:'badge-green',  th:'รับเข้า / onboard แล้ว' },
  mitigated:   { label:'Mitigated (เติมภายใน)',cls:'badge-teal',  th:'แก้ไขโดยเติมคนภายใน' },
  resolved:    { label:'Resolved',            cls:'badge-green',  th:'จัดการเรียบร้อย (เช่น transfer)' },
  cancelled:   { label:'Cancelled',           cls:'badge-red',    th:'ยกเลิก' },
};
const TERMINAL = ['filled','mitigated','resolved','cancelled'];
const OPEN = ['pending','sourcing','interviewing','offer','document'];

const LEVEL_OPTS = ['Junior','Mid','Senior','Lead','Manager'];
const HIRING_OPTS = ['Permanent (Direct)','Secondment','Sub-contract'];

// ═══════════════════════════════════════════
// Permission layer — team + status transition matrix
// ═══════════════════════════════════════════
const RES_TEAM_KEY = 'orbit-pmo-resource-team-v1';
const RES_TEAMS = {
  pm:           'PM',
  resource_team:'Resource Team',
  orbit_hr:     'HR (Orbit)',
  bbik_hr:      'HR BlueBik (แม่)',
  pmo:          'PMO',
};

// STATUS_FLOW[currentStatus][team] = [allowed next statuses]
// PMO is handled separately (can set anything).
const STATUS_FLOW = {
  pending:      { orbit_hr:['sourcing','cancelled'], resource_team:['sourcing','mitigated'], pm:['cancelled'] },
  sourcing:     { bbik_hr:['interviewing'], resource_team:['mitigated'], orbit_hr:['cancelled'] },
  interviewing: { bbik_hr:['offer'], orbit_hr:['cancelled'] },
  offer:        { bbik_hr:['document'], orbit_hr:['cancelled'] },
  document:     { orbit_hr:['filled'] },
  filled:       { resource_team:['resolved'] },
  mitigated:    {},
  resolved:     {},
  cancelled:    {},
};

// BBIK can only see records in these stages (cross-company isolation)
const BBIK_VISIBLE = ['sourcing','interviewing','offer','document'];

let _resTeam = null;
function currentResTeam() {
  if(_resTeam) return _resTeam;
  try { _resTeam = localStorage.getItem(RES_TEAM_KEY) || 'pmo'; } catch(e) { _resTeam = 'pmo'; }
  if(!RES_TEAMS[_resTeam]) _resTeam = 'pmo';
  return _resTeam;
}
function setResTeam(t) {
  if(!RES_TEAMS[t]) return;
  _resTeam = t;
  try { localStorage.setItem(RES_TEAM_KEY, t); } catch(e) {}
  renderResource();
}
// Allowed next statuses for a given (status, team)
function allowedNext(status, team) {
  if(team === 'pmo') return Object.keys(RES_STATUS).filter(s => s !== status); // unlock-all
  const map = STATUS_FLOW[status] || {};
  return map[team] ? [...map[team]] : [];
}
function canEditFields(team) { return team !== 'bbik_hr'; }     // BBIK never edits Orbit fields
function canInternalOps(team) { return team === 'resource_team' || team === 'pmo'; } // transfer / add-code / fill
function visibleToTeam(list, team) {
  if(team === 'bbik_hr') return list.filter(r => BBIK_VISIBLE.includes(r.status));
  return list;
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
function nextResId() {
  const d = new Date();
  return `RES-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}-${String(loadResources().length+1).padStart(3,'0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// ── Main render ──
let _resPage = 1;
const RES_PER_PAGE = 20;
let _resSortCol = 'requestDate';
let _resSortAsc = false;

async function renderResource() {
  ensureTeamBar();
  const all = await loadResourcesAsync();
  _renderResourceUI(all);
}

// Inject "acting as" team switcher at top of the resource view (once)
function ensureTeamBar() {
  if(document.getElementById('res-team-bar')) return;
  const view = document.getElementById('view-resource');
  if(!view) return;
  const bar = document.createElement('div');
  bar.id = 'res-team-bar';
  bar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);flex-wrap:wrap';
  bar.innerHTML = `
    <span style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px">กำลังทำงานในนาม</span>
    <select id="res-team-select" onchange="setResTeam(this.value)" style="font-family:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
      ${Object.entries(RES_TEAMS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}
    </select>
    <span id="res-team-note" style="font-size:11px;color:var(--text-3)"></span>`;
  view.insertBefore(bar, view.firstChild);
}

function _renderResourceUI(allRaw) {
  const team = currentResTeam();

  // Sync team bar
  const teamSel = document.getElementById('res-team-select');
  if(teamSel) teamSel.value = team;
  const teamNote = document.getElementById('res-team-note');
  if(teamNote) teamNote.textContent =
      team === 'bbik_hr' ? '— เห็นเฉพาะ request ที่ escalate มาให้ (Sourcing → Document)'
    : team === 'pmo'     ? '— เห็นทุกอย่าง / ปลดล็อกสถานะได้'
    : '';

  // Data isolation (BBIK sees only escalated)
  const all = visibleToTeam(allRaw, team);

  // KPI cards
  const open    = all.filter(r => OPEN.includes(r.status)).length;
  const pending = all.filter(r => r.status === 'pending').length;
  const inProg  = all.filter(r => ['sourcing','interviewing','offer','document'].includes(r.status)).length;
  const thisMonth = (() => { const m=new Date().toISOString().slice(0,7); return all.filter(r=>r.status==='filled'&&r.resolvedDate?.startsWith(m)).length; })();
  const cancelled = all.filter(r => r.status === 'cancelled').length;

  const kpiEl = document.getElementById('res-kpi');
  if(kpiEl) kpiEl.innerHTML = `
    <div class="metric-card"><div class="metric-label">Total Open</div><div class="metric-val" style="color:var(--blue)">${open}</div></div>
    <div class="metric-card"><div class="metric-label">Pending</div><div class="metric-val" style="color:var(--text-2)">${pending}</div></div>
    <div class="metric-card"><div class="metric-label">In Progress (BBIK)</div><div class="metric-val" style="color:var(--amber)">${inProg}</div></div>
    <div class="metric-card"><div class="metric-label">Filled This Month</div><div class="metric-val" style="color:var(--green)">${thisMonth}</div></div>
    <div class="metric-card"><div class="metric-label">Cancelled</div><div class="metric-val" style="color:var(--red)">${cancelled}</div></div>`;

  // Hide "New Request" for BBIK (they don't create Orbit requests)
  const newBtn = document.querySelector('#view-resource .filter-row .btn-primary');
  if(newBtn) newBtn.style.display = (team === 'bbik_hr') ? 'none' : '';

  // Filters
  const search   = (document.getElementById('res-search')?.value||'').toLowerCase();
  const fStatus  = document.getElementById('res-f-status')?.value  || 'all';
  const fHiring  = document.getElementById('res-f-hiring')?.value  || 'all';
  const fProject = document.getElementById('res-f-project')?.value || 'all';
  const fLevel   = document.getElementById('res-f-level')?.value   || 'all';

  let list = all;
  if(fStatus  !== 'all') list = list.filter(r => r.status === fStatus);
  if(fHiring  !== 'all') list = list.filter(r => r.hiringType === fHiring);
  if(fProject !== 'all') list = list.filter(r => r.project === fProject);
  if(fLevel   !== 'all') list = list.filter(r => r.level === fLevel);
  if(search) list = list.filter(r =>
    `${r.project} ${r.position} ${r.resourceTeam} ${r.level}`.toLowerCase().includes(search));

  // Sort
  list = [...list].sort((a,b) => {
    let va = a[_resSortCol]||'', vb = b[_resSortCol]||'';
    return _resSortAsc ? (va>vb?1:-1) : (va<vb?1:-1);
  });

  // Pagination
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total/RES_PER_PAGE));
  if(_resPage > pages) _resPage = 1;
  const slice = list.slice((_resPage-1)*RES_PER_PAGE, _resPage*RES_PER_PAGE);

  // Table
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;

  if(!slice.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:34px;color:var(--text-3)">ไม่มีรายการ${team==='bbik_hr'?' (รอ Orbit escalate มาให้)':' — กด + New Request เพื่อเริ่ม'}</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(r => {
      const s = RES_STATUS[r.status] || { label:r.status, cls:'badge-gray' };
      const canStatus = allowedNext(r.status, team).length > 0;
      const codeCount = (r.projectCodes||[]).length;
      return `<tr style="cursor:pointer" onclick="openResDetail('${r.id}')">
        <td style="padding-left:12px;font-family:monospace;font-size:11px;color:var(--text-3)">${esc(r.id)}</td>
        <td>${esc(r.resourceTeam)}</td>
        <td><span style="font-weight:500">${esc(r.project)}</span>${codeCount?` <span class="badge badge-teal" style="font-size:9px">+${codeCount} code</span>`:''}</td>
        <td>${esc(r.position)}</td>
        <td><span class="badge badge-gray" style="font-size:10px">${esc(r.level)}</span></td>
        <td style="text-align:center;font-weight:600">${r.hc}</td>
        <td style="font-size:11px">${esc(r.hiringType)}</td>
        <td style="font-size:11px">${r.startDate ? shortDate(r.startDate) : '—'}</td>
        <td style="font-size:11px">${r.endDate ? shortDate(r.endDate) : '—'}</td>
        <td style="font-size:11px">${r.requestDate ? shortDate(r.requestDate) : '—'}</td>
        <td style="font-size:11px">${r.resolvedDate ? shortDate(r.resolvedDate) : '—'}</td>
        <td><span class="badge ${s.cls}" style="font-size:10px;white-space:nowrap">${esc(s.label)}</span></td>
        <td style="text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResDetail('${r.id}')" title="ดู">👁</button>
          ${canEditFields(team)?`<button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResModal('${r.id}')" title="แก้ไข">✎</button>`:''}
          ${canStatus?`<button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResStatus('${r.id}')" title="เปลี่ยนสถานะ">⇄</button>`:''}
          ${(r.status==='filled'&&canInternalOps(team))?`<button class="btn-sm" style="font-size:10px;padding:2px 7px;color:var(--blue)" onclick="openResTransfer('${r.id}')" title="ย้ายโครงการ">↗</button>`:''}
          ${(r.status==='filled'&&canInternalOps(team))?`<button class="btn-sm" style="font-size:10px;padding:2px 7px;color:var(--green)" onclick="openAddCode('${r.id}')" title="เพิ่ม Project Code">⊕</button>`:''}
        </td>
      </tr>`;
    }).join('');
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

  // Internal Usage middle view — hidden for BBIK (cross-company isolation)
  const card = document.getElementById('res-internal-card');
  if(team === 'bbik_hr') { if(card) card.style.display = 'none'; }
  else { if(card) card.style.display = ''; renderInternalUsage(all); }
}

// ── New/Edit Modal ──
function openResModal(id) {
  const team = currentResTeam();
  if(!canEditFields(team)) { alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์สร้าง/แก้ไข request`); return; }
  const isEdit = !!id;
  const r = isEdit ? loadResources().find(x => x.id===id) : null;
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const projectOpts = projects.map(p=>`<option value="${esc(p)}" ${r?.project===p?'selected':''}>${esc(p)}</option>`).join('');

  document.getElementById('res-modal-title').textContent = isEdit ? 'Edit Resource Request' : 'New Resource Request';
  document.getElementById('res-edit-id').value = id||'';

  const g = (fld,def='') => r ? (r[fld]||def) : def;

  document.getElementById('res-form-body').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Resource Team *</label><input id="rf-team" class="ri" placeholder="เช่น Dev, QA, BA" value="${esc(g('resourceTeam'))}"></div>
      <div class="fg"><label>โครงการ (Target) *</label><select id="rf-project" class="ri"><option value="">— เลือกโครงการ —</option>${projectOpts}</select></div>
      <div class="fg"><label>Position *</label><input id="rf-position" class="ri" placeholder="เช่น Senior Backend Developer" value="${esc(g('position'))}"></div>
      <div class="fg"><label>Level *</label><select id="rf-level" class="ri">${LEVEL_OPTS.map(l=>`<option ${g('level')===l?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fg"><label>HC (Headcount) *</label><input id="rf-hc" class="ri" type="number" min="1" value="${g('hc',1)}"></div>
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
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const team = g('rf-team'), project = g('rf-project'), position = g('rf-position');
  const hc = parseInt(g('rf-hc'))||0;
  const hiring = g('rf-hiring'), startDate = g('rf-start'), endDate = g('rf-end');

  if(!team||!project||!position||!hiring||!startDate) { alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบ'); return; }
  if(hc < 1) { alert('HC ต้องมีค่าอย่างน้อย 1'); return; }
  if((hiring==='Secondment'||hiring==='Sub-contract') && !endDate) { alert('End Date จำเป็นสำหรับ Secondment / Sub-contract'); return; }
  if(endDate && startDate && endDate < startDate) { alert('End Date ต้องอยู่หลัง Start Date'); return; }

  const editId = g('res-edit-id');
  const existing = editId ? loadResources().find(r=>r.id===editId) : null;
  const actor = RES_TEAMS[currentResTeam()];

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

// ── Status change modal (permission-gated) ──
function openResStatus(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const team = currentResTeam();
  const nexts = allowedNext(r.status, team);
  if(!nexts.length) {
    alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์เปลี่ยนสถานะของรายการนี้ (ขั้น “${RES_STATUS[r.status]?.label||r.status}”)`);
    return;
  }
  const s = RES_STATUS[r.status]||{label:r.status};
  const opts = nexts.map(k=>`<option value="${k}">${RES_STATUS[k]?.label||k}</option>`).join('');

  document.getElementById('res-status-id').value = id;
  document.getElementById('res-status-current').innerHTML =
    `<span class="badge ${RES_STATUS[r.status]?.cls||'badge-gray'}">${s.label}</span> — ${esc(r.position)} / ${esc(r.project)}
     <div style="font-size:11px;color:var(--text-3);margin-top:6px">เปลี่ยนในนาม <strong>${esc(RES_TEAMS[team])}</strong></div>`;
  document.getElementById('res-status-select').innerHTML = opts;
  document.getElementById('res-status-remark').value = '';
  document.getElementById('resource-status-modal').style.display = 'flex';
}
function closeResStatus() { document.getElementById('resource-status-modal').style.display='none'; }

function _transitionAction(prev, next) {
  if(prev==='pending' && next==='sourcing') return 'Escalated to parent company';
  if(prev==='document' && next==='filled')  return 'Onboarded (Filled)';
  if(next==='mitigated') return 'Filled internally';
  if(next==='cancelled') return 'Cancelled';
  return 'Status changed';
}

async function saveResStatus() {
  const id = document.getElementById('res-status-id').value;
  const newStatus = document.getElementById('res-status-select').value;
  const remark = document.getElementById('res-status-remark').value.trim();
  const team = currentResTeam();

  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const prevStatus = list[idx].status;

  // Defense-in-depth: re-check permission server-side of the UI
  if(!allowedNext(prevStatus, team).includes(newStatus)) {
    alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์เปลี่ยน “${RES_STATUS[prevStatus]?.label||prevStatus}” → “${RES_STATUS[newStatus]?.label||newStatus}”`);
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
      by: RES_TEAMS[team], remark, at: now
    }],
  };
  if(remark) updated.remark = (updated.remark ? updated.remark+'\n' : '') + `[${new Date().toLocaleDateString('th')}] ${remark}`;

  await saveResourceAsync(updated);
  closeResStatus();
  renderResource();
}

// ── Transfer modal (within Orbit) ──
function openResTransfer(id) {
  const team = currentResTeam();
  if(!canInternalOps(team)) { alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์ทำ Transfer`); return; }
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const projectOpts = projects.filter(p=>p!==r.project).map(p=>`<option>${esc(p)}</option>`).join('');

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
  const actor = RES_TEAMS[currentResTeam()];

  if(!destProject||!startDate||!remark) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }

  const source = loadResources().find(r=>r.id===sourceId);
  if(!source) return;
  const now = new Date().toISOString();

  const updatedSource = { ...source,
    status: 'resolved', resolvedDate: todayISO, updatedAt: now,
    activityLog: [...(source.activityLog||[]), {
      action: 'Transferred', to: destProject, by: actor, remark, at: now
    }],
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
  alert(`✓ Transfer เสร็จสิ้น\nสร้าง Request ใหม่ ${newRecord.id} สำหรับ ${destProject}`);
}

// ── Add Project Code modal (NEW) ──
// One filled person can hold >1 project code. No new record — append projectCodes[].
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

function _allocUsed(r) {
  return (r.projectCodes||[]).reduce((sum,c)=> sum + (Number(c.allocation)||0), 0);
}

function openAddCode(id) {
  const team = currentResTeam();
  if(!canInternalOps(team)) { alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์เพิ่ม Project Code`); return; }
  ensureAddCodeModal();
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  if(r.status!=='filled') { alert('เพิ่ม Project Code ได้เฉพาะคนที่ Filled แล้ว'); return; }

  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const existing = r.projectCodes||[];
  const usedProjects = [r.project, ...existing.map(c=>c.project)];
  const projectOpts = projects.filter(p=>!usedProjects.includes(p)).map(p=>`<option>${esc(p)}</option>`).join('');

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
  document.getElementById('addcode-alloc').value = Math.max(0, 100 - used - 100) >= 0 ? Math.min(50, Math.max(1, 100-used)) : 50;
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
  const actor = RES_TEAMS[currentResTeam()];

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
    activityLog: [...(r.activityLog||[]), {
      action: 'Project code added', to: project, by: actor,
      remark: `${code} · ${alloc}%${note?` · ${note}`:''}`, at: now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Add Code] ${code} (${project}) ${alloc}%`,
  };
  await saveResourceAsync(updated);
  closeAddCode();
  renderResource();
  alert(`✓ เพิ่ม Project Code ${code} (${project}) ${alloc}% ให้ ${r.position}`);
}

// ── Detail drawer ──
function openResDetail(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const team = currentResTeam();
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
      ${[['ID',r.id],['Level',r.level],['HC',r.hc],['Hiring Type',r.hiringType],
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
      ${canEditFields(team)?`<button class="btn-sm" onclick="openResModal('${r.id}');closeResDetail()">✎ Edit</button>`:''}
      ${allowedNext(r.status,team).length?`<button class="btn-sm" onclick="openResStatus('${r.id}');closeResDetail()">⇄ Change Status</button>`:''}
      ${(r.status==='filled'&&canInternalOps(team))?`<button class="btn-sm" style="color:var(--blue)" onclick="openResTransfer('${r.id}');closeResDetail()">↗ Transfer</button>`:''}
      ${(r.status==='filled'&&canInternalOps(team))?`<button class="btn-sm" style="color:var(--green)" onclick="openAddCode('${r.id}');closeResDetail()">⊕ Add Project Code</button>`:''}
    </div>`;

  document.getElementById('resource-detail-drawer').classList.add('open');
}
function closeResDetail() { document.getElementById('resource-detail-drawer').classList.remove('open'); }

// ── Export ──
function exportResourceCsv() {
  const list = visibleToTeam(loadResources(), currentResTeam());
  if(!list.length) { alert('ไม่มีข้อมูล'); return; }
  const headers = ['ID','Resource Team','Project','Position','Level','HC','Hiring Type','Start Date','End Date','Request Date','Resolved Date','Status','Requester','Transfer From','Project Codes','Remark'];
  const rows = list.map(r=>[r.id,r.resourceTeam,r.project,r.position,r.level,r.hc,r.hiringType,r.startDate||'',r.endDate||'',r.requestDate||'',r.resolvedDate||'',RES_STATUS[r.status]?.label||r.status,r.requesterName||'',r.transferFrom||'',(r.projectCodes||[]).map(c=>`${c.code}(${c.project}:${c.allocation}%)`).join(' | '),r.remark||'']);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download = `Resource_Requests_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
  a.click();
}

// ═══════════════════════════════════════════
// Internal Usage (middle view) — Allocation + Bench board
// Decoupled: derives ONLY from resource_requests records.
// Flow: request → [ตรวจ internal ก่อน] → Fill internally OR Escalate ขึ้น BBIK → recruit
// ═══════════════════════════════════════════
function _resIsEscalated(r) {
  return (r.activityLog||[]).some(l => l.action === 'Escalated to parent company');
}
function _daysUntil(iso) {
  if(!iso) return null;
  return Math.floor((new Date(iso) - new Date(todayISO)) / 86400000);
}

function ensureResourceExtras() {
  if(document.getElementById('res-internal-card')) return;
  const tableCard = document.getElementById('res-table-body')?.closest('.card');
  if(!tableCard) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'res-internal-card';
  card.style.cssText = 'padding:0;margin-top:14px;overflow:hidden';
  card.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:700;color:var(--blue)">🏢 Internal Usage — การใช้งานภายใน</span>
      <span style="font-size:10px;color:var(--text-3)">ตรวจ resource ในบริษัทก่อน escalate ขึ้น BBIK</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr">
      <div style="border-right:1px solid var(--border)">
        <div style="padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;border-bottom:1px solid var(--border)">การจัดสรรตามโครงการ (Allocation)</div>
        <div id="res-alloc-body" style="max-height:260px;overflow:auto"></div>
      </div>
      <div>
        <div style="padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;border-bottom:1px solid var(--border)">ว่าง / ใกล้ว่าง (Bench)</div>
        <div id="res-bench-body" style="max-height:260px;overflow:auto"></div>
      </div>
    </div>
    <div style="padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      Request รอตรวจภายใน → ตัดสินใจเติมเอง หรือ Escalate
    </div>
    <div id="res-review-body"></div>`;
  tableCard.parentNode.insertBefore(card, tableCard.nextSibling);
}

function renderInternalUsage(all) {
  ensureResourceExtras();
  const allocBody  = document.getElementById('res-alloc-body');
  const benchBody  = document.getElementById('res-bench-body');
  const reviewBody = document.getElementById('res-review-body');
  if(!allocBody || !benchBody || !reviewBody) return;
  const team = currentResTeam();
  const canFill = canInternalOps(team);

  const filled = all.filter(r => r.status === 'filled');

  // Allocation by project
  const byProj = {};
  filled.forEach(r => { (byProj[r.project||'ไม่ระบุ'] = byProj[r.project||'ไม่ระบุ'] || []).push(r); });
  const projRows = Object.entries(byProj).sort((a,b)=>b[1].length-a[1].length);
  allocBody.innerHTML = projRows.length ? projRows.map(([proj,plist]) => `
    <div style="padding:8px 16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:12px">${esc(proj)}</span>
        <span class="badge badge-blue" style="font-size:10px">${plist.length} คน</span>
      </div>
      <div style="font-size:11px;color:var(--text-2);margin-top:3px">${plist.map(r=>`${esc(r.position)} <span style="color:var(--text-3)">(${esc(r.resourceTeam||'-')})</span>`).join(' · ')}</div>
    </div>`).join('') : `<div style="padding:20px 16px;text-align:center;color:var(--text-3);font-size:12px">ยังไม่มี resource ที่ filled</div>`;

  // Bench: contract ended + ending within 30d
  const bench = filled.filter(r => r.endDate && _daysUntil(r.endDate) < 0).sort((a,b)=> (a.endDate>b.endDate?-1:1));
  const soon  = filled.filter(r => r.endDate && _daysUntil(r.endDate) >= 0 && _daysUntil(r.endDate) <= 30).sort((a,b)=> (a.endDate>b.endDate?1:-1));
  const benchRow = (r,freed) => {
    const d = _daysUntil(r.endDate);
    const tag = freed ? `<span class="badge badge-green" style="font-size:9px">ว่างแล้ว</span>`
                      : `<span class="badge badge-amber" style="font-size:9px">อีก ${d}d</span>`;
    return `<div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:500">${esc(r.position)} <span style="color:var(--text-3);font-weight:400">· ${esc(r.level||'')}</span></span>
        ${tag}
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(r.resourceTeam||'-')} · ${esc(r.project||'-')} · จบ ${shortDate(r.endDate)}</div>
    </div>`;
  };
  benchBody.innerHTML = (bench.length||soon.length)
    ? bench.map(r=>benchRow(r,true)).join('') + soon.map(r=>benchRow(r,false)).join('')
    : `<div style="padding:20px 16px;text-align:center;color:var(--text-3);font-size:12px">ไม่มีคนว่าง / ใกล้ว่าง<br><span style="font-size:10px">(Permanent ที่ไม่มี end date จะไม่นับเป็น bench)</span></div>`;

  // Internal review queue
  const openReqs = all.filter(r => OPEN.includes(r.status));
  reviewBody.innerHTML = openReqs.length ? openReqs.map(r => {
    const escd = _resIsEscalated(r);
    return `<div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:600">${esc(r.position)} <span style="color:var(--text-3);font-weight:400">· ${esc(r.project)} · ${esc(r.level||'')} · HC ${r.hc}</span></div>
        <div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(r.resourceTeam||'-')} · ขอเมื่อ ${r.requestDate?shortDate(r.requestDate):'—'}${escd?' · <span style="color:var(--amber);font-weight:600">⇧ Escalated แล้ว</span>':''}</div>
      </div>
      <div style="white-space:nowrap;display:flex;gap:6px">
        ${canFill?`<button class="btn-sm" style="font-size:11px;padding:3px 9px;color:var(--green)" onclick="openInternalFill('${r.id}')">↳ เติมภายใน</button>`:''}
        ${(canFill&&!escd)?`<button class="btn-sm" style="font-size:11px;padding:3px 9px;color:var(--blue)" onclick="escalateRequest('${r.id}')">⇧ Escalate</button>`:''}
      </div>
    </div>`;
  }).join('') : `<div style="padding:20px 16px;text-align:center;color:var(--text-3);font-size:12px">ไม่มี request ค้างให้ตรวจภายใน</div>`;
}

// ── Escalate ขึ้น BBIK (เปิดรับสมัคร) ──
async function escalateRequest(id) {
  const team = currentResTeam();
  if(!canInternalOps(team)) { alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์ Escalate`); return; }
  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const r = list[idx];
  if(!confirm(`Escalate "${r.position}" (${r.project}) ขึ้น BBIK บริษัทแม่ เพื่อเปิดรับสมัคร?`)) return;
  const now = new Date().toISOString();
  const updated = { ...r,
    status: r.status==='pending' ? 'sourcing' : r.status,
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), {
      action:'Escalated to parent company', from: r.status, to: 'sourcing', by: RES_TEAMS[team],
      remark:'เติมภายในไม่ได้ → เปิดรับสมัครที่ BBIK', at: now }],
  };
  await saveResourceAsync(updated);
  renderResource();
}

// ── Internal fill modal ──
function ensureInternalFillModal() {
  if(document.getElementById('res-internal-modal')) return;
  const m = document.createElement('div');
  m.id = 'res-internal-modal';
  m.className = 'modal-backdrop';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center';
  m.innerHTML = `
    <div class="card" style="width:560px;max-width:92vw;max-height:88vh;overflow:auto;padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:14px;font-weight:700">↳ เติม Request จากภายใน</div>
        <button class="btn-sm" onclick="closeInternalFill()" style="font-size:16px">✕</button>
      </div>
      <div style="padding:20px">
        <input type="hidden" id="res-internal-req-id">
        <div id="res-internal-target" style="font-size:12px;margin-bottom:12px"></div>
        <div style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;margin-bottom:6px">เลือกคนภายใน (ว่าง / ใกล้ว่าง)</div>
        <div id="res-internal-candidates" style="border:1px solid var(--border);border-radius:6px;max-height:240px;overflow:auto"></div>
        <div class="fg" style="margin-top:12px"><label>หมายเหตุ</label>
          <input id="res-internal-note" class="ri" placeholder="เหตุผล / รายละเอียดการเติมภายใน"></div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:18px">
          <button class="btn-ghost" style="color:var(--blue)" onclick="escalateFromFill()">เติมภายในไม่ได้ → Escalate</button>
          <div style="display:flex;gap:10px">
            <button class="btn-ghost" onclick="closeInternalFill()">ยกเลิก</button>
            <button class="btn-primary" onclick="confirmInternalFill()">ยืนยันเติมภายใน</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) closeInternalFill(); });
}

function openInternalFill(id) {
  const team = currentResTeam();
  if(!canInternalOps(team)) { alert(`ทีม ${RES_TEAMS[team]} ไม่มีสิทธิ์เติมภายใน`); return; }
  ensureInternalFillModal();
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  document.getElementById('res-internal-req-id').value = id;
  document.getElementById('res-internal-target').innerHTML =
    `Request: <strong>${esc(r.position)}</strong> · ${esc(r.project)} · ${esc(r.level||'')} · HC ${r.hc} <span style="color:var(--text-3)">(${esc(r.resourceTeam||'-')})</span>`;
  document.getElementById('res-internal-note').value = '';

  const cand = loadResources()
    .filter(x => x.status==='filled' && x.endDate && _daysUntil(x.endDate) <= 30)
    .sort((a,b)=> (a.endDate>b.endDate?1:-1));
  const box = document.getElementById('res-internal-candidates');
  box.innerHTML = cand.length ? cand.map(c => {
    const d = _daysUntil(c.endDate);
    const lbl = d<0 ? 'ว่างแล้ว' : `อีก ${d}d`;
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;font-size:12px">
      <input type="radio" name="res-internal-cand" value="${esc(c.id)}">
      <span style="flex:1"><strong>${esc(c.position)}</strong> · ${esc(c.level||'')} <span style="color:var(--text-3)">· ${esc(c.resourceTeam||'-')} · จาก ${esc(c.project||'-')}</span></span>
      <span class="badge ${d<0?'badge-green':'badge-amber'}" style="font-size:9px">${lbl}</span>
    </label>`;
  }).join('') : `<div style="padding:14px;text-align:center;color:var(--text-3);font-size:12px">ไม่มีคนว่าง — เลือก "Escalate" หรือยืนยันโดยไม่ระบุคน (ทีมจัดสรรเอง)</div>`;
  document.getElementById('res-internal-modal').style.display = 'flex';
}
function closeInternalFill() { const m=document.getElementById('res-internal-modal'); if(m) m.style.display='none'; }

async function confirmInternalFill() {
  const reqId = document.getElementById('res-internal-req-id').value;
  const note  = document.getElementById('res-internal-note').value.trim();
  const picked = document.querySelector('input[name="res-internal-cand"]:checked')?.value || '';
  const actor = RES_TEAMS[currentResTeam()];
  const list = loadResources();
  const idx = list.findIndex(r=>r.id===reqId);
  if(idx<0) return;
  const r = list[idx];
  const now = new Date().toISOString();
  const src = picked ? list.find(x=>x.id===picked) : null;
  const srcLabel = src ? `${src.position} (${src.id})` : 'ไม่ระบุคน (ทีมจัดสรรเอง)';

  const updated = { ...r,
    status: 'mitigated',
    resolvedDate: todayISO,
    updatedAt: now,
    transferFrom: picked || r.transferFrom || null,
    activityLog: [...(r.activityLog||[]), {
      action:'Filled internally', from: r.status, to:'mitigated', by: actor,
      remark: `เติมจากภายใน: ${srcLabel}${note?` — ${note}`:''}`, at: now }],
    remark: (r.remark?r.remark+'\n':'') + `[Internal] เติมจาก ${srcLabel}${note?`: ${note}`:''}`,
  };
  await saveResourceAsync(updated);

  if(src) {
    const updatedSrc = { ...src,
      status:'resolved', resolvedDate: todayISO, updatedAt: now,
      activityLog: [...(src.activityLog||[]), {
        action:'Reallocated internally', to: r.project, by: actor,
        remark:`ย้ายไปเติม ${r.position} (${r.id})${note?` — ${note}`:''}`, at: now }],
      remark: (src.remark?src.remark+'\n':'') + `[Reallocated] → ${r.project} (${r.id})`,
    };
    await saveResourceAsync(updatedSrc);
  }
  closeInternalFill();
  renderResource();
  alert(`✓ เติม "${r.position}" จากภายในเรียบร้อย${src?`\nย้าย ${src.position} จาก ${src.project}`:''}`);
}

function escalateFromFill() {
  const reqId = document.getElementById('res-internal-req-id').value;
  closeInternalFill();
  escalateRequest(reqId);
}

// Close modals on backdrop
document.addEventListener('click', e => {
  if(e.target===document.getElementById('resource-modal')) closeResModal();
  if(e.target===document.getElementById('resource-status-modal')) closeResStatus();
  if(e.target===document.getElementById('resource-transfer-modal')) closeResTransfer();
});
