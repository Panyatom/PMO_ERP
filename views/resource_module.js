// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// views/resource.js â€” Resource Management (v0.2 â€” slimmed)
// Orbit Digital PMO Super App
//
// Single table, 3 lenses (tabs) + status-based sub-views (chips).
//   â€¢ Request       â€” hiring pipeline (User â†’ PMO/Dir approve â†’ BBIK recruit)
//   â€¢ Transfer      â€” à¸¢à¹‰à¸²à¸¢à¹‚à¸„à¸£à¸‡à¸à¸²à¸£à¸ à¸²à¸¢à¹ƒà¸™ Orbit (à¸”à¸¹à¹€à¸‰à¸žà¸²à¸°à¸£à¸²à¸¢à¸à¸²à¸£ transfer)
//   â€¢ Project Code  â€” à¸„à¸™à¸—à¸µà¹ˆà¸–à¸·à¸­à¸«à¸¥à¸²à¸¢ project code (multi-allocation)
//
// Roles (3):
//   user  â€” à¸œà¸¹à¹‰à¸‚à¸­: à¸ªà¸£à¹‰à¸²à¸‡ Request, à¹€à¸«à¹‡à¸™à¹€à¸‰à¸žà¸²à¸° "à¹‚à¸„à¸£à¸‡à¸à¸²à¸£à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸" (dropdown)
//   pmo   â€” PMO/Dir: à¹€à¸«à¹‡à¸™à¸—à¸¸à¸à¹‚à¸„à¸£à¸‡à¸à¸²à¸£, à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´ Request, à¸›à¸´à¸”à¸‡à¸²à¸™, à¸¥à¸š
//   bbik  â€” à¸šà¸£à¸´à¸©à¸±à¸—à¹à¸¡à¹ˆ: à¹€à¸«à¹‡à¸™à¹€à¸‰à¸žà¸²à¸°à¸£à¸²à¸¢à¸à¸²à¸£à¸—à¸µà¹ˆ "Approved à¸‚à¸¶à¹‰à¸™à¹„à¸›" à¹à¸¥à¹‰à¸§à¸ªà¸£à¸£à¸«à¸²
//
// Flow:  pending â†’ (PMO approve) â†’ approved â†’ (BBIK à¸£à¸±à¸šà¸‡à¸²à¸™) â†’ sourcing â†’
//        interviewing â†’ offer â†’ document â†’ (PMO onboard) â†’ filled â†’ resolved
//
// Self-contained: chrome (role/tab/chips) à¸–à¸¹à¸ inject à¸”à¹‰à¸§à¸¢ JS â€” à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹à¸à¹‰ index.html
// Depends on globals from app.js: esc, shortDate, todayISO, checkSupa, supaFetch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


const RES_KEY = 'orbit-pmo-resources-v1';
const RES_TIMELINE_MODE_KEY = 'orbit-pmo-resource-timeline-mode-v1';
const PROJECT_CODE_KEY = 'orbit-pmo-project-codes-v1';
let _resCache = null;
let _projectCodeCache = null;

const DEFAULT_PROJECT_CODES = [
  { no:'1', project:'AOA', type:'', code:'AOA-Intern', startDate:'', endDate:'', status:'Active', pmOwner:'K.Pirunrung' },
  { no:'2', project:'EV', type:'', code:'EV-Intern', startDate:'', endDate:'', status:'Active', pmOwner:'K.Navapon' },
  { no:'3', project:'NLMS', type:'', code:'LMS-Intern', startDate:'', endDate:'', status:'Active', pmOwner:'K.Pojjanat' },
  { no:'4', project:'Merchant', type:'', code:'Merchant-Intern', startDate:'', endDate:'', status:'Active', pmOwner:'K.Pirunrung' },
  { no:'5', project:'SS', type:'', code:'Self-Serve Intern', startDate:'', endDate:'', status:'Active', pmOwner:'K.Pirunrung' },
  { no:'6', project:'ACC', type:'', code:'ACC-Intern(18 May - 15 Aug 2026)', startDate:'2026-05-18', endDate:'2026-08-15', status:'Active', pmOwner:'K.Chotima' },
  { no:'7', project:'Estimation Committee', type:'INTNC', code:'ESTCOM (3 Mar - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Sathita' },
  { no:'8', project:'PMO Office', type:'INTNC', code:'PMO Office (1 Apr - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Sathita' },
  { no:'9', project:'Solution Committee', type:'INTNC', code:'SOLCOM (3 Mar - 31 Dec 2026)', startDate:'2025-03-03', endDate:'2026-12-31', status:'Active', pmOwner:'K.Phoorichet' },
  { no:'10', project:'Internal Project', type:'INTNC', code:'e2e and Automate Testing Tools (2 Jun -31 Dec 2026)', startDate:'2025-06-02', endDate:'2026-12-31', status:'Active', pmOwner:'K.Phoorichet' },
  { no:'11', project:'Internal Project', type:'INTNC', code:'Common service blueprints(2 Jun -31 Dec 2026)', startDate:'2025-06-02', endDate:'2026-12-31', status:'Active', pmOwner:'K.Phoorichet' },
  { no:'12', project:'Internal Project', type:'INTNC', code:'AI for software development(2 Jun -31 Dec 2026)', startDate:'2025-06-02', endDate:'2026-12-31', status:'Active', pmOwner:'K.Phoorichet' },
  { no:'16', project:'App Support-AOA', type:'', code:'AOA - AppSupport (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'14', project:'App Support-EV', type:'', code:'EV - AppSupport (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'15', project:'App Support-MP', type:'', code:'MP - AppSupport (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'16', project:'App Support-SS', type:'', code:'SS - AppSupport (1 Mar - 31 Dec 2026)', startDate:'2026-03-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'17', project:'MA-NLMS&Blueplus', type:'', code:'NLMS&Blueplus+ - AppSupport (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'18', project:'App Support-VBI', type:'', code:'VBI - AppSupport (1 May - 31 Dec 2026)', startDate:'2026-05-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'19', project:'LineOA', type:'', code:"LineOA - OR's Line Provider (1 Jan - 31 Dec 2026)", startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'20', project:'MA-AOA', type:'', code:'AOA - MA (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'21', project:'MA-EV', type:'', code:'EV - MA (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'22', project:'MA-MP', type:'', code:'Merchant MA (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'23', project:'MA-SS', type:'', code:'SS - MA (1 Mar - 31 Dec 2026)', startDate:'2026-03-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'24', project:'MA-NLMS', type:'', code:'NLMS&Blueplus+ - MA (1 Jan - 31 Dec 2026)', startDate:'2026-01-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'25', project:'MA-VBI', type:'', code:'VBI - MA (1 May - 31 Dec 2026)', startDate:'2026-05-01', endDate:'2026-12-31', status:'Active', pmOwner:'K.Akkares' },
  { no:'26', project:'BD', type:'', code:'OR BD [Internal] (5 Jan - 31 Dec 2026)', startDate:'2026-01-05', endDate:'2026-12-31', status:'Active', pmOwner:'K.Kor' },
  { no:'27', project:'BD', type:'', code:'PPT BD [Internal] (5 Jan - 31 Dec 2026)', startDate:'2026-01-05', endDate:'2026-12-31', status:'Active', pmOwner:'K.Kor' },
  { no:'28', project:'OR', type:'', code:'ORora Project (Blue+ Agentic AI Chat) (2 Mar-30 Sep 2026)', startDate:'2026-03-02', endDate:'2026-09-30', status:'Active', pmOwner:'K.Kor' },
  { no:'29', project:'OR', type:'', code:'BD-found & found Agentic AI Chat (2 Mar-30 Sep 2026)', startDate:'2026-03-02', endDate:'2026-09-30', status:'Active', pmOwner:'K.Kor' },
  { no:'30', project:'VB', type:'', code:'VB PM/PMO 2026 (5 Jan - 31 Dec 2026)', startDate:'2026-01-05', endDate:'2026-12-31', status:'Active', pmOwner:'K.Pojjanat' },
  { no:'31', project:'BD COE', type:'', code:'BD COE Project (1 Aug 2024 - 30 Jun 2026)', startDate:'2024-08-01', endDate:'2026-06-30', status:'Active', pmOwner:'K.Kor' },
  { no:'32', project:'Data VB', type:'', code:'Data Team for VB (6 Jun 2025 -30 Jun 2026)', startDate:'2025-06-06', endDate:'2026-06-30', status:'Active', pmOwner:'K.Kor' },
  { no:'34', project:'VB', type:'', code:'VB with blueplus+ app security enhan (15 Dec 2025-31 May 2026)', startDate:'2025-12-15', endDate:'2026-05-31', status:'Active', pmOwner:'K.Kor' },
  { no:'36', project:'NLMS', type:'', code:'NLMS 2026 WA ngod 2 (1 May-30 Jun 2026)', startDate:'2026-05-01', endDate:'2026-06-30', status:'Active', pmOwner:'K.Pojjanat' },
  { no:'37', project:'EV', type:'', code:'EV Release 2.1.2 (1 Apr - 12 Jun 2026)', startDate:'2026-04-01', endDate:'2026-06-12', status:'Active', pmOwner:'K.Navapon' },
  { no:'38', project:'AI', type:'', code:'PTT agentic AI implementation (2 Mar-30 Sep 2026)', startDate:'2026-03-02', endDate:'2026-09-30', status:'Active', pmOwner:'K.Kor' },
  { no:'39', project:'AI', type:'', code:'PTT AI - Agentic AI roadmap (13 Nov 2025 - 31 May 2026)', startDate:'2025-11-13', endDate:'2026-05-31', status:'Active', pmOwner:'K.Kor' },
  { no:'40', project:'Data COE', type:'', code:'Data CoE 2026 (1 Apr 2026- 31 Mar 2027)', startDate:'2026-04-01', endDate:'2027-03-31', status:'Active', pmOwner:'K.Kor' },
  { no:'', project:'App Support-DSC', type:'', code:'DSC - AppSupport (13 Mar - 31 Dec 2026)', startDate:'2026-03-13', endDate:'2026-12-31', status:'Pending', pmOwner:'K.Akkares' },
  { no:'', project:'MA-DSC', type:'', code:'DSC - MA (13 Mar - 31 Dec 2026)', startDate:'2026-03-13', endDate:'2026-12-31', status:'Pending', pmOwner:'K.Akkares' },
  { no:'', project:'MA-AOA VB', type:'', code:'VB - MA (XXX - 31 Dec 2026)', startDate:'', endDate:'2026-12-31', status:'Pending', pmOwner:'K.Akkares' },
  { no:'', project:'MA-AOA AMZ', type:'', code:'AMZ - MA (XXX - 31 Dec 2026)', startDate:'', endDate:'2026-12-31', status:'Pending', pmOwner:'K.Akkares' },
];


// â”€â”€ Status config â”€â”€
const RES_STATUS = {
  pending:     { label:'Pending',              cls:'badge-gray',   th:'Waiting for PMO/Dir approval' },
  approved:    { label:'Approved -> BBIK',     cls:'badge-blue',   th:'Approved by PMO/Dir, waiting for BBIK' },
  sourcing:    { label:'Sourcing (BBIK)',      cls:'badge-blue',   th:'BBIK is sourcing' },
  interviewing:{ label:'Interviewing (BBIK)',  cls:'badge-purple', th:'BBIK is interviewing' },
  offer:       { label:'Offer (BBIK)',         cls:'badge-amber',  th:'BBIK is preparing offer' },
  document:    { label:'Document (BBIK)',      cls:'badge-yellow', th:'BBIK is preparing documents' },
  filled:      { label:'Filled / Onboarded',   cls:'badge-green',  th:'Employee onboarded' },
  mitigated:   { label:'Mitigated',            cls:'badge-teal',   th:'Resolved by internal mitigation' },
  resolved:    { label:'Resolved',             cls:'badge-green',  th:'Closed' },
  cancelled:   { label:'Cancelled',            cls:'badge-red',    th:'Cancelled' },
};
const OPEN = ['pending','approved','sourcing','interviewing','offer','document'];
const RECRUITING = ['sourcing','interviewing','offer','document'];


const LEVEL_OPTS = ['Junior','Mid','Senior','Lead','Manager'];
const HIRING_OPTS = ['Direct Head Count (Permanent)','Secondment','Sub-contract'];
const HIRING_TYPE_META = {
  direct: {
    label: 'Direct HC',
    fullLabel: 'Direct Head Count - Permanent',
    cls: 'badge-green',
    bar: '#2f855a',
    fixedTerm: false,
  },
  secondment: {
    label: 'Secondment',
    fullLabel: 'Borrowed from parent company, fixed term / extendable',
    cls: 'badge-blue',
    bar: '#2563eb',
    fixedTerm: true,
  },
  subcon: {
    label: 'Sub Con',
    fullLabel: 'Sub-contract, fixed term / extendable',
    cls: 'badge-amber',
    bar: '#d97706',
    fixedTerm: true,
  },
};


// â”€â”€ Status sub-views (chips, Request tab only) â”€â”€
const RES_VIEWS = [
  { key:'all',        label:'All',          match:()=>true },
  { key:'pending',    label:'Pending',      match:r=>r.status==='pending' },
  { key:'approved',   label:'Approved',     match:r=>r.status==='approved' },
  { key:'recruiting', label:'Recruiting',   match:r=>RECRUITING.includes(r.status) },
  { key:'filled',     label:'Onboarded',    match:r=>r.status==='filled' },
  { key:'closed',     label:'Closed',       match:r=>['resolved','mitigated'].includes(r.status) },
  { key:'cancelled',  label:'Cancelled',    match:r=>r.status==='cancelled' },
];


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Permission layer â€” role + status transition matrix
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const RES_ROLE_KEY    = 'orbit-pmo-resource-role-v1';
const RES_PROJECT_KEY = 'orbit-pmo-user-project-v1';
const RES_ROLES = {
  user: 'Requester',
  pmo:  'PMO / Dir',
  bbik: 'BBIK',
};


// STATUS_FLOW[currentStatus][role] = [allowed next statuses]. PMO can set anything.
const STATUS_FLOW = {
  pending:      { pmo:['approved','cancelled'], user:['cancelled'] },
  approved:     { bbik:['sourcing'], pmo:['cancelled'] },
  sourcing:     { bbik:['interviewing'], pmo:['cancelled'] },
  interviewing: { bbik:['offer'], pmo:['cancelled'] },
  offer:        { bbik:['document'], pmo:['cancelled'] },
  document:     { pmo:['filled'] },           // Orbit à¸¢à¸·à¸™à¸¢à¸±à¸™ onboard
  filled:       { pmo:['resolved'], user:['resolved'] },
  mitigated:    {},
  resolved:     {},
  cancelled:    {},
};


// BBIK à¹€à¸«à¹‡à¸™à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¸£à¸²à¸¢à¸à¸²à¸£à¸—à¸µà¹ˆà¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹à¸¥à¹‰à¸§à¸‚à¸¶à¹‰à¸™à¹„à¸› (cross-company isolation)
const BBIK_VISIBLE = ['approved','sourcing','interviewing','offer','document'];


let _role = null;
let _userProject = null;
function resProjects() {
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const fromCodes = [...new Set(loadProjectCodeMaster().map(c => c.project).filter(Boolean))];
  return fromCodes.length ? fromCodes : (s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3']);
}
function normalizeProjectCode(row, index=0) {
  const code = String(row.code || row.projectCode || row['Project Code'] || '').trim();
  const project = String(row.project || row.Project || '').trim();
  return {
    id: String(row.id || code || `${project}-${index}`).replace(/\s+/g, '-'),
    no: String(row.no || row.No || '').trim(),
    project,
    type: String(row.type || row.Type || '').trim(),
    code,
    startDate: String(row.startDate || row.start || row.Start || '').slice(0, 10),
    endDate: String(row.endDate || row.end || row.End || '').slice(0, 10),
    status: String(row.status || row.Status || 'Active').trim() || 'Active',
    pmOwner: String(row.pmOwner || row.pm || row['PM Owner'] || '').trim(),
    updatedAt: row.updatedAt || new Date().toISOString(),
  };
}
function loadProjectCodeMaster() {
  if(_projectCodeCache) return _projectCodeCache;
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECT_CODE_KEY)||'[]');
    _projectCodeCache = Array.isArray(raw) && raw.length ? raw.map(normalizeProjectCode) : DEFAULT_PROJECT_CODES.map(normalizeProjectCode);
  } catch(e) {
    _projectCodeCache = DEFAULT_PROJECT_CODES.map(normalizeProjectCode);
  }
  storeProjectCodeMaster(_projectCodeCache);
  return _projectCodeCache;
}
function storeProjectCodeMaster(list) {
  _projectCodeCache = (list||[]).map(normalizeProjectCode).filter(c => c.project || c.code);
  try { localStorage.setItem(PROJECT_CODE_KEY, JSON.stringify(_projectCodeCache)); } catch(e) {}
}
function activeProjectCodeMaster() {
  return loadProjectCodeMaster().filter(c => String(c.status||'').toLowerCase() === 'active');
}
function projectCodeByValue(code, project='') {
  const codeLower = String(code||'').trim().toLowerCase();
  const projectLower = String(project||'').trim().toLowerCase();
  return loadProjectCodeMaster().find(c =>
    String(c.code||'').trim().toLowerCase() === codeLower &&
    (!projectLower || String(c.project||'').trim().toLowerCase() === projectLower)
  );
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
function timelineMode() {
  try {
    const mode = localStorage.getItem(RES_TIMELINE_MODE_KEY) || 'project-code';
    return mode === 'all' ? 'all' : 'project-code';
  } catch(e) { return 'project-code'; }
}
function setTimelineMode(mode) {
  try { localStorage.setItem(RES_TIMELINE_MODE_KEY, mode === 'all' ? 'all' : 'project-code'); } catch(e) {}
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
function isRequestRecord(r) {
  return !isTransfer(r) && r.requesterName !== 'Employee Import';
}

function clampAlloc(n) {
  const v = Number(n);
  if(!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}
function resourcePersonName(r) {
  return (r.resourceNameTh || r.resourceNameEn || r.resourceName || r.requesterName || r.position || '').trim();
}
function employeeDirectoryName(r) {
  return (r.resourceNameTh || r.resourceNameEn || r.resourceName || '').trim();
}
function employeeEnglishName(r) {
  return (r.resourceNameEn || '').trim();
}
function employeeThaiName(r) {
  return (r.resourceNameTh || r.resourceName || '').trim();
}
function resourceEmployeeCode(r) {
  return (r.employeeCode || '').trim();
}
function hiringKind(value) {
  const raw = String(value || '').toLowerCase();
  if(raw.includes('secondment')) return 'secondment';
  if(raw.includes('sub-contract') || raw.includes('sub con') || raw.includes('subcon')) return 'subcon';
  return 'direct';
}
function hiringMeta(value) {
  return HIRING_TYPE_META[hiringKind(value)] || HIRING_TYPE_META.direct;
}
function isFixedTermHiring(value) {
  return !!hiringMeta(value).fixedTerm;
}
function primaryAllocation(r) {
  const explicit = clampAlloc(r.allocationPercent);
  if(explicit > 0) return explicit;
  return Math.max(0, 100 - _allocUsed(r));
}
function primaryProjectCode(r) {
  return (r.primaryProjectCode || r.projectCode || '').trim();
}
function isActiveResource(r) {
  return r.status === 'filled';
}
function transferFromProject(r, list) {
  const sourceId = String(r.transferFrom || '');
  const source = (list||[]).find(x => x.id === sourceId);
  return source?.project || r.fromProject || sourceId || '';
}
function transferSupervisor(r) {
  const text = String(r.remark || '');
  const match = text.match(/Supervisor:\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}
function allocationRows(list, opts={}) {
  const includeInactive = !!opts.includeInactive;
  return (list||[]).flatMap(r => {
    if(!includeInactive && !isActiveResource(r)) return [];
    if(includeInactive && !['filled','resolved','mitigated'].includes(r.status)) return [];
    const person = resourcePersonName(r);
    const active = isActiveResource(r);
    const rows = [{
      requestId: r.id,
      person,
      employeeCode: resourceEmployeeCode(r),
      resourceTeam: r.resourceTeam,
      level: r.level,
      project: r.project,
      code: primaryProjectCode(r),
      allocation: primaryAllocation(r),
      startDate: r.onboardDate || r.startDate,
      endDate: active ? (r.endDate || '') : (r.offboardDate || r.resolvedDate || r.endDate || ''),
      status: active ? 'active' : 'closed',
      source: isTransfer(r) ? 'Transfer' : 'Primary',
      note: r.remark || '',
    }];
    (r.projectCodes||[]).forEach(c => rows.push({
      requestId: r.id,
      person,
      employeeCode: resourceEmployeeCode(r),
      resourceTeam: r.resourceTeam,
      level: r.level,
      project: c.project,
      code: c.code,
      allocation: clampAlloc(c.allocation),
      startDate: c.startDate || c.at || r.onboardDate || r.startDate,
      endDate: active ? (c.endDate || r.endDate || '') : (c.endDate || r.offboardDate || r.resolvedDate || ''),
      status: active ? 'active' : 'closed',
      source: 'Project Code',
      note: c.note || '',
    }));
    return rows.filter(x => x.allocation > 0);
  });
}
function movementRows(list) {
  return (list||[]).flatMap(r => {
    const logs = (r.activityLog||[]).map(l => ({
      at: l.at || r.updatedAt || r.createdAt,
      person: resourcePersonName(r),
      project: r.project,
      action: l.action || 'Updated',
      from: l.from || '',
      to: l.to || '',
      by: l.by || 'System',
      remark: l.remark || '',
      requestId: r.id,
    }));
    if(!logs.length) logs.push({
      at: r.createdAt || r.requestDate,
      person: resourcePersonName(r),
      project: r.project,
      action: 'Created',
      from: '',
      to: r.status || '',
      by: r.requesterName || 'System',
      remark: r.remark || '',
      requestId: r.id,
    });
    return logs;
  }).sort((a,b) => String(b.at||'').localeCompare(String(a.at||'')));
}
function isoDay(value) {
  if(!value) return '';
  return String(value).slice(0, 10);
}
function parseDay(value) {
  const iso = isoDay(value);
  if(!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function daysBetween(a, b) {
  return Math.max(0, Math.round((b - a) / 86400000));
}
function timelineWindow(list) {
  const starts = list.map(r => parseDay(r.onboardDate || r.startDate || r.requestDate)).filter(Boolean);
  const ends = list.map(r => parseDay(r.offboardDate || r.resolvedDate || r.endDate)).filter(Boolean);
  const now = new Date();
  const min = starts.length ? new Date(Math.min(...starts.map(d=>d.getTime()))) : now;
  const max = ends.length ? new Date(Math.max(...ends.map(d=>d.getTime()))) : addMonths(now, 6);
  const start = monthStart(addMonths(min, -1));
  const end = monthEnd(addMonths(max > now ? max : now, 6));
  return { start, end };
}
function timelineMonths(start, end) {
  const out = [];
  const d = monthStart(start);
  while(d <= end) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}
function projectPeriod(r, windowEnd) {
  const start = parseDay(r.onboardDate || r.startDate || r.requestDate);
  const rawEnd = parseDay(r.offboardDate || r.resolvedDate || r.endDate);
  return {
    start,
    end: rawEnd || windowEnd,
    hasPlannedEnd: !!rawEnd,
  };
}
function personKey(r) {
  return resourceEmployeeCode(r) || resourcePersonName(r).toLowerCase() || r.id;
}
function timelineGroups(list) {
  const groups = new Map();
  (list||[]).forEach(r => {
    if(!['filled','resolved','mitigated'].includes(r.status)) return;
    const key = personKey(r);
    if(!groups.has(key)) {
      groups.set(key, {
        key,
        person: resourcePersonName(r),
        employeeCode: resourceEmployeeCode(r),
        team: r.resourceTeam,
        level: r.level,
        hiringType: r.hiringType,
        records: [],
      });
    }
    const g = groups.get(key);
    g.person = g.person || resourcePersonName(r);
    g.employeeCode = g.employeeCode || resourceEmployeeCode(r);
    g.team = g.team || r.resourceTeam;
    g.level = g.level || r.level;
    g.records.push(r);
  });
  return [...groups.values()].sort((a,b)=>String(a.person).localeCompare(String(b.person)));
}
function timelineItemGroups(list, mode='project-code') {
  const groups = new Map();
  (list||[]).forEach(r => {
    if(!['filled','resolved','mitigated'].includes(r.status)) return;
    const items = [];
    if(mode === 'all') {
      items.push({
        requestId: r.id,
        project: r.project,
        code: primaryProjectCode(r),
        allocation: primaryAllocation(r),
        startDate: r.onboardDate || r.startDate || r.requestDate,
        endDate: r.offboardDate || r.resolvedDate || r.endDate || '',
        hiringType: r.hiringType,
        source: isTransfer(r) ? 'Transfer' : 'Primary',
      });
    }
    (r.projectCodes||[]).forEach(c => items.push({
      requestId: r.id,
      project: c.project,
      code: c.code,
      allocation: clampAlloc(c.allocation),
      startDate: c.startDate || c.at || r.onboardDate || r.startDate,
      endDate: c.endDate || r.offboardDate || r.resolvedDate || r.endDate || '',
      hiringType: r.hiringType,
      source: 'Project Code',
    }));
    if(!items.length) return;
    const key = personKey(r);
    if(!groups.has(key)) {
      groups.set(key, {
        key,
        person: resourcePersonName(r),
        employeeCode: resourceEmployeeCode(r),
        team: r.resourceTeam,
        level: r.level,
        hiringType: r.hiringType,
        items: [],
      });
    }
    const g = groups.get(key);
    g.person = g.person || resourcePersonName(r);
    g.employeeCode = g.employeeCode || resourceEmployeeCode(r);
    g.items.push(...items);
  });
  return [...groups.values()].sort((a,b)=>String(a.person).localeCompare(String(b.person)));
}
function timelineItemWindow(groups) {
  const starts = groups.flatMap(g => g.items.map(i => parseDay(i.startDate))).filter(Boolean);
  const ends = groups.flatMap(g => g.items.map(i => parseDay(i.endDate))).filter(Boolean);
  const now = new Date();
  const min = starts.length ? new Date(Math.min(...starts.map(d=>d.getTime()))) : now;
  const max = ends.length ? new Date(Math.max(...ends.map(d=>d.getTime()))) : addMonths(now, 6);
  return { start: monthStart(addMonths(min, -1)), end: monthEnd(addMonths(max > now ? max : now, 6)) };
}


function visibleToRole(list, role) {
  if(role === 'bbik') return list.filter(r => BBIK_VISIBLE.includes(r.status));
  if(role === 'user') { const p = currentUserProject(); return p ? list.filter(r => r.project === p) : list; }
  return list; // pmo
}


// â”€â”€ Storage â”€â”€
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
      const localList = loadResources();
      const rows = await supaFetch('resource_requests','GET',null,'?order=created_at.desc&limit=500');
      const remote = (rows||[]).map(r => ({
        id: r.id, resourceTeam: r.resource_team, project: r.project,
        position: r.position, level: r.level, hc: r.hc,
        hiringType: r.hiring_type, startDate: r.start_date, endDate: r.end_date,
        requestDate: r.request_date, resolvedDate: r.resolved_date,
        remark: r.remark, status: r.status, requesterName: r.requester_name,
        transferFrom: r.transfer_from, projectCodes: r.project_codes||[],
        resourceName: r.resource_name, resourceNameTh: r.resource_name_th, resourceNameEn: r.resource_name_en, employeeCode: r.employee_code,
        primaryProjectCode: r.primary_project_code, allocationPercent: r.allocation_percent,
        onboardDate: r.onboard_date, offboardDate: r.offboard_date,
        activityLog: r.activity_log||[],
        createdAt: r.created_at, updatedAt: r.updated_at,
      }));
      const remoteIds = new Set(remote.map(r => r.id));
      const localOnly = localList.filter(r => r.localOnly && !remoteIds.has(r.id));
      _resCache = [...localOnly, ...remote];
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
        resource_name: saved.resourceName||null, resource_name_th: saved.resourceNameTh||null, resource_name_en: saved.resourceNameEn||null, employee_code: saved.employeeCode||null,
        primary_project_code: saved.primaryProjectCode||null,
        allocation_percent: saved.allocationPercent == null ? null : clampAlloc(saved.allocationPercent),
        onboard_date: saved.onboardDate||null, offboard_date: saved.offboardDate||null,
        activity_log: saved.activityLog||[],
        created_at: saved.createdAt, updated_at: saved.updatedAt,
      },'?on_conflict=id');
    } catch(e) {
      console.warn('Resource save failed; keeping local copy', e.message);
      const localSaved = { ...saved, localOnly: true, syncError: e.message };
      _resCache = _resCache.map(r => r.id===saved.id ? localSaved : r);
      storeResources(_resCache);
      return localSaved;
    }
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


// â”€â”€ Display config â€” Request ID column toggle à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸«à¸™à¹‰à¸² Settings â”€â”€
// à¸­à¹ˆà¸²à¸™à¸ˆà¸²à¸ settings (resource.showRequestId); à¸¡à¸µ override à¸Šà¸±à¹ˆà¸§à¸„à¸£à¸²à¸§à¸œà¹ˆà¸²à¸™ setShowRequestId(true/false), null = à¸à¸¥à¸±à¸šà¹„à¸›à¹ƒà¸Šà¹‰ settings
let _showIdOverride = null;
function showRequestId() {
  if(_showIdOverride !== null) return _showIdOverride;
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  return !!(s?.resource?.showRequestId);
}
function setShowRequestId(v) { _showIdOverride = (v===null ? null : !!v); renderResource(); }


// â”€â”€ Main render â”€â”€
let _resPage = 1;
const RES_PER_PAGE = 20;
let _resSortCol = 'requestDate';
let _resSortAsc = false;
let _resTab  = 'request';   // request | people | timeline | allocation | transfer | code | movement
let _resView = 'all';       // chip key (request tab)


// â”€â”€ Table columns (config-driven: à¸«à¸±à¸§à¸•à¸²à¸£à¸²à¸‡ + à¹à¸–à¸§ à¹ƒà¸Šà¹‰à¸•à¸±à¸§à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™) â”€â”€
// à¹€à¸žà¸´à¹ˆà¸¡ / à¸¥à¸š / à¸‹à¹ˆà¸­à¸™ à¸„à¸­à¸¥à¸±à¸¡à¸™à¹Œà¸—à¸µà¹ˆà¸™à¸µà¹ˆà¸—à¸µà¹ˆà¹€à¸”à¸µà¸¢à¸§ â€” à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹à¸à¹‰ <thead> à¹ƒà¸™ index.html
function resColumns() {
  const C = [];
  if(showRequestId()) C.push({ key:'id', label:'ID', th:'padding-left:12px',
    cell:r=>`<span style="font-family:monospace;font-size:11px;color:var(--text-3)">${esc(r.id)}</span>` });
  C.push(
    { key:'team',     label:'Resource Team', cell:r=>esc(r.resourceTeam) },
    { key:'project',  label:'Project', cell:r=>`<span style="font-weight:500">${esc(r.project)}</span>${(r.projectCodes||[]).length?` <span class="badge badge-teal" style="font-size:9px">+${(r.projectCodes||[]).length} code</span>`:''}${isTransfer(r)?` <span class="badge badge-blue" style="font-size:9px">transfer</span>`:''}` },
    { key:'position', label:'Position', cell:r=>esc(r.position) },
    { key:'level',    label:'Level', cell:r=>`<span class="badge badge-gray" style="font-size:10px">${esc(r.level)}</span>` },
    { key:'hiring',   label:'Employment Type', cell:r=>{ const m=hiringMeta(r.hiringType); return `<span class="badge ${m.cls}" style="font-size:9px">${esc(m.label)}</span>`; } },
    { key:'start',    label:'Start', cell:r=>`<span style="font-size:11px">${r.startDate?shortDate(r.startDate):'-'}</span>` },
    { key:'end',      label:'End', cell:r=>`<span style="font-size:11px">${r.endDate?shortDate(r.endDate):'-'}</span>` },
    { key:'reqdate',  label:'Request Date', cell:r=>`<span style="font-size:11px">${r.requestDate?shortDate(r.requestDate):'-'}</span>` },
    { key:'resolved', label:'Resolved', cell:r=>`<span style="font-size:11px">${r.resolvedDate?shortDate(r.resolvedDate):'-'}</span>` },
    { key:'updated',  label:'Updated', cell:r=>`<span style="font-size:11px;color:var(--text-3)">${r.updatedAt?shortDate(String(r.updatedAt).slice(0,10)):'-'}</span>` },
    { key:'status',   label:'Status', cell:r=>{ const s=RES_STATUS[r.status]||{label:r.status,cls:'badge-gray'}; return `<span class="badge ${s.cls}" style="font-size:10px;white-space:nowrap">${esc(s.label)}</span>`; } },
    { key:'action',   label:'', th:'text-align:center', td:'text-align:center', cell:r=>`<button class="btn-sm" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="event.stopPropagation();openResDetail('${r.id}')" title="Manage">Manage</button>` },
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


function ensureResChrome() {
  if(document.getElementById('res-chrome')) return;
  const view = document.getElementById('view-resource');
  if(!view) return;
  if(!document.getElementById('res-timeline-style')) {
    const st = document.createElement('style');
    st.id = 'res-timeline-style';
    st.textContent = `
      .res-timeline-wrap{overflow:auto;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);max-height:calc(100vh - 300px)}
      .res-timeline-head,.res-timeline-row{display:flex;min-width:max-content}
      .res-timeline-head{position:sticky;top:0;z-index:3;background:var(--surface);border-bottom:1px solid var(--border)}
      .res-timeline-person{width:260px;min-width:260px;padding:10px 12px;border-right:1px solid var(--border);background:var(--surface);position:sticky;left:0;z-index:2}
      .res-timeline-head-left{font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;z-index:4}
      .res-timeline-months{display:flex;min-height:32px;background:var(--surface)}
      .res-timeline-track{position:relative;min-height:58px;background-image:linear-gradient(to right,var(--border) 1px,transparent 1px);background-color:var(--surface-2,var(--bg))}
      .res-timeline-row{border-bottom:1px solid var(--border)}
      .res-timeline-row:last-child{border-bottom:none}
      .res-timeline-bar{position:absolute;top:10px;height:28px;border:none;border-radius:6px;color:white;text-align:left;padding:4px 8px;overflow:hidden;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,.12)}
      .res-timeline-bar span{display:block;font-size:11px;font-weight:800;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .res-timeline-bar small{display:block;font-size:9px;line-height:1.2;margin-top:3px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media (max-width:820px){.res-timeline-person{width:210px;min-width:210px}.res-timeline-wrap{max-height:none}}
    `;
    document.head.appendChild(st);
  }
  const wrap = document.createElement('div');
  wrap.id = 'res-chrome';
  wrap.innerHTML = `
    <div id="res-role-bar" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px">Working as</span>
      <select id="res-role-select" onchange="setRole(this.value)" style="font-family:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        ${Object.entries(RES_ROLES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}
      </select>
      <span id="res-proj-wrap" style="display:none;align-items:center;gap:6px;font-size:12px;color:var(--text-2)">
        Project: <select id="res-proj-select" onchange="setUserProject(this.value)" style="font-family:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)"></select>
      </span>
      <span id="res-role-note" style="font-size:11px;color:var(--text-3)"></span>
    </div>
    <div id="res-session-panel" style="margin-bottom:14px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 1px 2px rgba(15,23,42,.04)">
      <div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">View Session</div>
      <div id="res-tab-bar" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-sm res-tab" data-tab="request" onclick="setResTab('request')" style="padding:7px 14px">Request</button>
        <button class="btn-sm res-tab" data-tab="people" onclick="setResTab('people')" style="padding:7px 14px">Employee Directory</button>
        <button class="btn-sm res-tab" data-tab="timeline" onclick="setResTab('timeline')" style="padding:7px 14px">Timeline</button>
        <button class="btn-sm res-tab" data-tab="transfer" onclick="setResTab('transfer')" style="padding:7px 14px">Employee Assignment</button>
        <button class="btn-sm res-tab" data-tab="code" onclick="setResTab('code')" style="padding:7px 14px">Project Code</button>
      </div>
    </div>
    <div id="res-status-panel" style="margin-bottom:16px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px">Request Status</div>
        <div style="font-size:11px;color:var(--text-3)">Request tab only</div>
      </div>
      <div id="res-view-chips" style="display:flex;gap:8px;flex-wrap:wrap"></div>
    </div>`;
  view.insertBefore(wrap, view.firstChild);

  const fStatusSel = document.getElementById('res-f-status');
  if(fStatusSel) fStatusSel.style.display = 'none';
}

function renderResourceTable(cols, rows, emptyMsg) {
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;
  const table = tbody.closest('table');
  if(table) {
    table.style.display = '';
    table.style.width = '100%';
    table.style.minWidth = '';
    let thead = table.querySelector('thead');
    if(!thead) { thead = document.createElement('thead'); table.insertBefore(thead, table.firstChild); }
    thead.innerHTML = `<tr>${cols.map(c=>`<th style="${c.th||''}">${esc(c.label)}</th>`).join('')}</tr>`;
  }
  if(!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:34px;color:var(--text-3)">${emptyMsg}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r =>
      `<tr ${r.requestId?`style="cursor:pointer" onclick="openResDetail('${r.requestId}')"`:''}>${cols.map(c=>`<td style="${c.td||''}">${c.cell(r)}</td>`).join('')}</tr>`
    ).join('');
  }
  const pagEl = document.getElementById('res-pagination');
  if(pagEl) pagEl.innerHTML = `<span style="font-size:12px;color:var(--text-3)">${rows.length} rows</span>`;
}

function renderPeopleView(base) {
  const active = base.filter(r => isActiveResource(r) && (employeeDirectoryName(r) || resourceEmployeeCode(r)));
  const rows = active.map(r => {
    const allocs = allocationRows([r]);
    return {
      requestId: r.id,
      personTh: employeeThaiName(r),
      personEn: employeeEnglishName(r),
      employeeCode: resourceEmployeeCode(r),
      role: [r.position, r.level].filter(Boolean).join(' / '),
      team: r.resourceTeam || '',
      projects: allocs,
      totalAllocation: allocs.reduce((sum,a)=>sum+a.allocation,0),
      startDate: r.onboardDate || r.startDate,
      status: r.status,
    };
  }).sort((a,b)=>String(a.personTh||a.personEn).localeCompare(String(b.personTh||b.personEn)));
  renderResourceTable([
    { label:'ชื่อ-นามสกุล / Name - Surname', th:'width:21%', cell:r=>`<strong>${esc(r.personTh||'(missing Thai name)')}</strong>${r.personEn?`<div style="font-size:11px;color:var(--text-3)">${esc(r.personEn)}</div>`:''}${r.employeeCode?`<div style="font-size:11px;color:var(--text-3)">${esc(r.employeeCode)}</div>`:''}` },
    { label:'Position / Level', th:'width:18%', cell:r=>esc(r.role||'-') },
    { label:'Team', th:'width:18%', cell:r=>esc(r.team||'-') },
    { label:'Current Allocation', th:'width:22%', cell:r=>r.projects.length ? r.projects.map(a=>`<span class="badge ${a.allocation>100?'badge-red':'badge-teal'}" style="margin:2px 4px 2px 0">${esc(a.project)}${a.code?` / ${esc(a.code)}`:''}: ${a.allocation}%</span>`).join('') : '-' },
    { label:'Start', th:'width:110px', cell:r=>`<span style="font-size:11px;white-space:nowrap">${r.startDate?shortDate(String(r.startDate).slice(0,10)):'-'}</span>` },
    { label:'Action', th:'width:150px;text-align:center', td:'text-align:center;white-space:nowrap', cell:r=>`<span style="display:inline-flex;justify-content:center;gap:4px;white-space:nowrap"><button class="btn-sm" onclick="event.stopPropagation();openResDetail('${r.requestId}')">Manage</button><button class="btn-sm" style="color:var(--amber)" onclick="event.stopPropagation();offboardResource('${r.requestId}')">Offboard</button></span>` },
  ], rows, 'No employee records yet. Import employees with Name - Surname / Employee Code first.');
}

function renderTimelineView(base) {
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;
  const table = tbody.closest('table');
  const mode = timelineMode();
  const groups = timelineItemGroups(base, mode);
  const { start, end } = timelineItemWindow(groups);
  const months = timelineMonths(start, end);
  const totalDays = Math.max(1, daysBetween(start, end));
  const monthWidth = 92;

  if(table) {
    table.querySelector('thead')?.remove();
    table.style.display = 'block';
    table.style.width = '100%';
  }

  const monthHead = months.map(m => {
    const label = m.toLocaleDateString('en-US', { month:'short', year:'2-digit' });
    return `<div style="width:${monthWidth}px;border-left:1px solid var(--border);padding:6px 8px;text-align:center;font-size:10px;font-weight:800;color:var(--text-2);text-transform:uppercase">${esc(label)}</div>`;
  }).join('');

  const legend = Object.values(HIRING_TYPE_META).map(m =>
    `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2)">
      <i style="width:16px;height:7px;border-radius:999px;background:${m.bar};display:inline-block"></i>${esc(m.label)}
    </span>`
  ).join('') + `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2)">
      <i style="width:16px;height:7px;border-radius:999px;background:var(--purple);display:inline-block"></i>Project Code
    </span>`;

  const rows = groups.map(g => {
    const primaryType = g.hiringType;
    const meta = hiringMeta(primaryType);
    const segments = g.items.map(item => {
      const period = { start: parseDay(item.startDate), end: parseDay(item.endDate) || end, hasPlannedEnd: !!item.endDate };
      if(!period.start) return '';
      const segStart = period.start < start ? start : period.start;
      const segEnd = period.end > end ? end : period.end;
      const left = daysBetween(start, segStart) / totalDays * 100;
      const width = Math.max(1.2, daysBetween(segStart, segEnd) / totalDays * 100);
      const m = hiringMeta(item.hiringType);
      const color = item.source === 'Project Code' ? 'var(--purple)' : m.bar;
      const title = `${g.person} | ${item.project} | ${isoDay(item.startDate)} - ${item.endDate ? isoDay(item.endDate) : 'ongoing'} | ${item.source}`;
      return `<button class="res-timeline-bar" onclick="event.stopPropagation();openResDetail('${item.requestId}')" title="${esc(title)}" style="left:${left}%;width:${width}%;background:${color}">
        <span>${esc(item.project || '-')}</span>
        <small>${esc([item.code, `${item.allocation}%`, item.source].filter(Boolean).join(' / '))}</small>
      </button>`;
    }).join('');
    return `<div class="res-timeline-row">
      <div class="res-timeline-person">
        <div style="font-weight:800;color:var(--text);line-height:1.25">${esc(g.person || '-')}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc([g.employeeCode, g.team, g.level].filter(Boolean).join(' / ') || '-')}</div>
        <div style="margin-top:6px"><span class="badge ${meta.cls}" style="font-size:9px">${esc(meta.label)}</span></div>
      </div>
      <div class="res-timeline-track" style="width:${months.length * monthWidth}px;background-size:${monthWidth}px 100%">
        ${segments || '<span style="font-size:12px;color:var(--text-3);padding:12px;display:inline-block">No dated assignment</span>'}
      </div>
    </div>`;
  }).join('');

  tbody.innerHTML = `<tr><td style="padding:0;border-bottom:none">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;font-weight:800;color:var(--text)">Resource Assignment Timeline</div>
        <div style="font-size:11px;color:var(--text-3)">${mode==='project-code'?'Shows only people with Project Code, based on Project Code start/end dates.':'Shows Project Code plus primary filled assignment periods.'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <select class="ri" style="width:auto;font-size:11px;padding:5px 8px" onchange="setTimelineMode(this.value)">
          <option value="project-code" ${mode==='project-code'?'selected':''}>Project Code only</option>
          <option value="all" ${mode==='all'?'selected':''}>Include primary assignment</option>
        </select>
        ${legend}
      </div>
    </div>
    <div class="res-timeline-wrap">
      <div class="res-timeline-head">
        <div class="res-timeline-person res-timeline-head-left">Resource</div>
        <div class="res-timeline-months" style="width:${months.length * monthWidth}px">${monthHead}</div>
      </div>
      ${rows || `<div style="padding:34px;text-align:center;color:var(--text-3);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm)">No Project Code timeline yet. Add Project Code to a filled resource first.</div>`}
    </div>
  </td></tr>`;

  const pagEl = document.getElementById('res-pagination');
  if(pagEl) pagEl.innerHTML = `<span style="font-size:12px;color:var(--text-3)">${groups.length} people / ${base.length} records</span>`;
}

function renderTransferView(base) {
  const transferRows = (base||[]).filter(isTransfer).map(r => ({
    kind: 'Transfer',
    requestId: r.id,
    requestDate: r.requestDate,
    requestBy: r.requesterName,
    fromProject: transferFromProject(r, base),
    toProject: r.project,
    person: resourcePersonName(r),
    firstDay: r.onboardDate || r.startDate,
    lastDay: r.offboardDate || r.endDate,
    code: primaryProjectCode(r),
    supervisor: r.supervisor || transferSupervisor(r),
  }));
  const codeRows = [];
  (base||[]).filter(isActiveResource).forEach(r => (r.projectCodes||[]).forEach((c, idx) => codeRows.push({
    kind: 'Project Code',
    requestId: r.id,
    codeIndex: idx,
    requestDate: c.at ? String(c.at).slice(0,10) : r.requestDate,
    requestBy: c.supervisor || r.requesterName,
    fromProject: r.project,
    toProject: c.project,
    person: resourcePersonName(r),
    firstDay: c.startDate || r.onboardDate || r.startDate,
    lastDay: c.endDate || '',
    code: c.code,
    supervisor: c.supervisor || '',
  })));
  const rows = [...transferRows, ...codeRows].sort((a,b)=>String(b.firstDay||'').localeCompare(String(a.firstDay||'')));

  renderResourceTable([
    { label:'Type', cell:r=>`<span class="badge ${r.kind==='Transfer'?'badge-blue':'badge-teal'}">${esc(r.kind)}</span>` },
    { label:'Request Date', cell:r=>`<span style="font-size:11px">${r.requestDate?shortDate(r.requestDate):'-'}</span>` },
    { label:'Request By', cell:r=>esc(r.requestBy||'-') },
    { label:'From Project', cell:r=>esc(r.fromProject||'-') },
    { label:'To Project', cell:r=>`<strong>${esc(r.toProject||'-')}</strong>` },
    { label:'Name - Surname', cell:r=>esc(r.person||'-') },
    { label:'First Day', cell:r=>`<span style="font-size:11px">${r.firstDay?shortDate(r.firstDay):'-'}</span>` },
    { label:'Last Day', cell:r=>`<span style="font-size:11px">${r.lastDay?shortDate(r.lastDay):'-'}</span>` },
    { label:'New Project Code', cell:r=>esc(r.code||'-') },
    { label:'Supervisor', cell:r=>esc(r.supervisor||'-') },
    { label:'Action', td:'text-align:center;white-space:nowrap', cell:r=> r.kind==='Project Code'
      ? `<button class="btn-sm" onclick="event.stopPropagation();openTransferEntry('', '${r.requestId}', 'code', '${r.codeIndex}')">Edit</button> <button class="btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deleteProjectCode('${r.requestId}', ${r.codeIndex})">Delete</button>`
      : `<button class="btn-sm" onclick="event.stopPropagation();openTransferEntry('${r.requestId}', '', 'transfer')">Edit</button> <button class="btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deleteResource('${r.requestId}')">Delete</button>` },
  ], rows, 'No employee assignment records yet. Click + New Assignment to add transfer or project code.');
}

function renderProjectCodeView(base) {
  const assignments = new Map();
  (base||[]).forEach(r => (r.projectCodes||[]).forEach(c => {
    const key = String(c.code||'').trim().toLowerCase();
    if(!key) return;
    assignments.set(key, (assignments.get(key)||0) + 1);
  }));
  const rows = loadProjectCodeMaster().map(c => ({
    ...c,
    assigned: assignments.get(String(c.code||'').trim().toLowerCase()) || 0,
  })).sort((a,b)=>`${a.status} ${a.project} ${a.code}`.localeCompare(`${b.status} ${b.project} ${b.code}`));

  renderResourceTable([
    { label:'No', cell:r=>esc(r.no||'-') },
    { label:'Project', cell:r=>`<strong>${esc(r.project||'-')}</strong>${r.type?`<div style="font-size:11px;color:var(--text-3)">${esc(r.type)}</div>`:''}` },
    { label:'Project Code', cell:r=>esc(r.code||'-') },
    { label:'Start', cell:r=>`<span style="font-size:11px">${r.startDate?shortDate(String(r.startDate).slice(0,10)):'-'}</span>` },
    { label:'End', cell:r=>`<span style="font-size:11px">${r.endDate?shortDate(String(r.endDate).slice(0,10)):'-'}</span>` },
    { label:'Status', cell:r=>`<span class="badge ${String(r.status).toLowerCase()==='active'?'badge-green':'badge-amber'}">${esc(r.status||'-')}</span>` },
    { label:'PM Owner', cell:r=>esc(r.pmOwner||'-') },
    { label:'Action', td:'text-align:center;white-space:nowrap', cell:r=>`<button class="btn-sm" onclick="event.stopPropagation();openProjectCodeMasterEntry('${esc(r.id)}')">Edit</button> <button class="btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deleteProjectCodeMaster('${esc(r.id)}')">Delete</button>` },
  ], rows, 'No Project Code master data yet. Import Project Codes first.');
}

function ensureProjectCodeMasterModal() {
  if(document.getElementById('project-code-master-modal')) return;
  const m = document.createElement('div');
  m.id = 'project-code-master-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center';
  m.innerHTML = `
    <div class="card" style="width:620px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span id="pcm-title" style="font-size:15px;font-weight:700">New Project Code</span>
        <button class="btn-sm" onclick="closeProjectCodeMasterEntry()" style="padding:4px 10px">x</button>
      </div>
      <input type="hidden" id="pcm-id">
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>No</label><input id="pcm-no" class="ri" placeholder="No"></div>
        <div class="fg"><label>Project *</label><input id="pcm-project" class="ri" placeholder="Project"></div>
        <div class="fg"><label>Type</label><input id="pcm-type" class="ri" placeholder="Type"></div>
        <div class="fg"><label>Project Code *</label><input id="pcm-code" class="ri" placeholder="Project Code"></div>
        <div class="fg"><label>Start</label><input id="pcm-start" class="ri" type="date"></div>
        <div class="fg"><label>End</label><input id="pcm-end" class="ri" type="date"></div>
        <div class="fg"><label>Status</label><select id="pcm-status" class="ri"><option>Active</option><option>Pending</option><option>Inactive</option></select></div>
        <div class="fg"><label>PM Owner</label><input id="pcm-owner" class="ri" placeholder="PM Owner"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn-ghost" onclick="closeProjectCodeMasterEntry()">Cancel</button>
        <button class="btn-primary" onclick="saveProjectCodeMasterEntry()">Save Project Code</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) closeProjectCodeMasterEntry(); });
}
function openProjectCodeMasterEntry(id='') {
  if(!canInternalOps(currentRole())) { alert('Only PMO/Dir can manage Project Code master data.'); return; }
  ensureProjectCodeMasterModal();
  const list = loadProjectCodeMaster();
  const existing = id ? list.find(c => c.id === id) : null;
  document.getElementById('pcm-title').textContent = existing ? 'Edit Project Code' : 'New Project Code';
  document.getElementById('pcm-id').value = existing?.id || '';
  document.getElementById('pcm-no').value = existing?.no || '';
  document.getElementById('pcm-project').value = existing?.project || '';
  document.getElementById('pcm-type').value = existing?.type || '';
  document.getElementById('pcm-code').value = existing?.code || '';
  document.getElementById('pcm-start').value = existing?.startDate || '';
  document.getElementById('pcm-end').value = existing?.endDate || '';
  document.getElementById('pcm-status').value = existing?.status || 'Active';
  document.getElementById('pcm-owner').value = existing?.pmOwner || '';
  document.getElementById('project-code-master-modal').style.display = 'flex';
}
function closeProjectCodeMasterEntry() {
  const m = document.getElementById('project-code-master-modal');
  if(m) m.style.display = 'none';
}
function saveProjectCodeMasterEntry() {
  const id = document.getElementById('pcm-id')?.value || '';
  const list = loadProjectCodeMaster();
  const existing = id ? list.find(c => c.id === id) : null;
  const project = document.getElementById('pcm-project')?.value?.trim() || '';
  const code = document.getElementById('pcm-code')?.value?.trim() || '';
  const startDate = document.getElementById('pcm-start')?.value || '';
  const endDate = document.getElementById('pcm-end')?.value || '';
  if(!project || !code) { alert('Project and Project Code are required.'); return; }
  if(endDate && startDate && endDate < startDate) { alert('End Date must be after Start Date.'); return; }
  const saved = normalizeProjectCode({
    ...(existing||{}),
    id: existing?.id || code.replace(/\s+/g, '-'),
    no: document.getElementById('pcm-no')?.value?.trim() || existing?.no || '',
    project,
    type: document.getElementById('pcm-type')?.value?.trim() || '',
    code,
    startDate,
    endDate,
    status: document.getElementById('pcm-status')?.value || 'Active',
    pmOwner: document.getElementById('pcm-owner')?.value?.trim() || '',
    updatedAt: new Date().toISOString(),
  });
  const next = existing ? list.map(c => c.id === existing.id ? saved : c) : [...list, saved];
  storeProjectCodeMaster(next);
  closeProjectCodeMasterEntry();
  renderResource();
}

function deleteProjectCodeMaster(id) {
  if(!canInternalOps(currentRole())) { alert('Only PMO/Dir can manage Project Code master data.'); return; }
  const list = loadProjectCodeMaster();
  const item = list.find(c => c.id === id);
  if(!item) return;
  if(!confirm(`Delete Project Code master ${item.code} (${item.project})?`)) return;
  storeProjectCodeMaster(list.filter(c => c.id !== id));
  renderResource();
}

function renderAllocationView(base) {
  const rows = allocationRows(base).sort((a,b)=>`${a.person} ${a.project}`.localeCompare(`${b.person} ${b.project}`));
  renderResourceTable([
    { label:'Resource', cell:r=>`<strong>${esc(r.person||'-')}</strong>${r.employeeCode?`<div style="font-size:11px;color:var(--text-3)">${esc(r.employeeCode)}</div>`:''}` },
    { label:'Project', cell:r=>esc(r.project||'-') },
    { label:'Project Code', cell:r=>esc(r.code||'-') },
    { label:'Allocation', td:'text-align:right', cell:r=>`<span class="badge badge-teal">${r.allocation}%</span>` },
    { label:'Source', cell:r=>esc(r.source||'-') },
    { label:'Start', cell:r=>`<span style="font-size:11px">${r.startDate?shortDate(String(r.startDate).slice(0,10)):'-'}</span>` },
    { label:'End', cell:r=>`<span style="font-size:11px">${r.endDate?shortDate(String(r.endDate).slice(0,10)):'-'}</span>` },
  ], rows, 'No active allocations yet. Filled / onboarded resources will appear here.');
}

function renderMovementView(base) {
  const rows = movementRows(base);
  renderResourceTable([
    { label:'When', cell:r=>`<span style="font-size:11px">${r.at?new Date(r.at).toLocaleString('th-TH'):'-'}</span>` },
    { label:'Resource', cell:r=>esc(r.person||'-') },
    { label:'Project', cell:r=>esc(r.project||'-') },
    { label:'Action', cell:r=>`<strong>${esc(r.action||'-')}</strong>${r.from||r.to?`<div style="font-size:11px;color:var(--text-3)">${esc([r.from,r.to].filter(Boolean).join(' -> '))}</div>`:''}` },
    { label:'By', cell:r=>esc(r.by||'-') },
    { label:'Remark', cell:r=>esc(r.remark||'-') },
  ], rows, 'No resource movements yet.');
}

function _renderResourceUI(allRaw) {
  const role = currentRole();
  if(_resTab === 'allocation' || _resTab === 'movement') _resTab = 'timeline';


  // â”€â”€ Sync role bar â”€â”€
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
      role === 'user' ? '- selected project only'
    : role === 'bbik' ? '- approved recruiting pipeline only'
    : '- all projects / approve / change status / delete';


  // â”€â”€ Sync tab bar â”€â”€ (BBIK à¹€à¸«à¹‡à¸™à¹€à¸‰à¸žà¸²à¸°à¹à¸—à¹‡à¸š Request)
  if(role === 'bbik' && _resTab !== 'request') _resTab = 'request';
  document.querySelectorAll('#res-tab-bar .res-tab').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    const hideForBbik = role === 'bbik' && tab !== 'request';
    btn.style.display = hideForBbik ? 'none' : '';
    const on = tab === _resTab;
    btn.style.background  = on ? 'var(--blue)' : 'var(--surface)';
    btn.style.color       = on ? '#fff' : 'var(--text)';
    btn.style.fontWeight  = on ? '700' : '';
    btn.style.borderColor = on ? 'var(--blue)' : 'var(--border-md)';
  });


  // â”€â”€ Visibility + tab/chip filter â”€â”€
  let scoped = visibleToRole(allRaw, role);
  const chips = document.getElementById('res-view-chips');
  const statusPanel = document.getElementById('res-status-panel');


  if(_resTab === 'transfer') {
    if(statusPanel) statusPanel.style.display = 'none';
    if(chips) chips.style.display = 'none';
    scoped = scoped.filter(isTransfer);
  } else if(_resTab === 'code') {
    if(statusPanel) statusPanel.style.display = 'none';
    if(chips) chips.style.display = 'none';
    scoped = scoped.filter(r => (r.projectCodes||[]).length > 0);
  } else if(['people','timeline','allocation','movement'].includes(_resTab)) {
    if(statusPanel) statusPanel.style.display = 'none';
    if(chips) chips.style.display = 'none';
  } else { // request tab â†’ status chips
    if(statusPanel) statusPanel.style.display = '';
    scoped = scoped.filter(isRequestRecord);
    if(chips) {
      chips.style.display = 'flex';
      chips.innerHTML = RES_VIEWS.map(v => {
        const n = scoped.filter(v.match).length;
        const on = _resView === v.key;
        return `<button class="btn-sm" onclick="setResView('${v.key}')" style="padding:6px 12px;font-size:11px;background:${on?'var(--blue)':'var(--surface)'};color:${on?'#fff':'var(--text)'};border-color:${on?'var(--blue)':'var(--border-md)'};font-weight:${on?'700':'500'}">${esc(v.label)} <span style="opacity:.72">${n}</span></button>`;
      }).join('');
    }
    const v = RES_VIEWS.find(x=>x.key===_resView) || RES_VIEWS[0];
    scoped = scoped.filter(v.match);
  }


  // â”€â”€ KPI cards (computed over role-scoped data, ignoring tab/chip) â”€â”€
  const base = visibleToRole(allRaw, role);
  const requestBase = base.filter(isRequestRecord);
  const open    = requestBase.filter(r => OPEN.includes(r.status)).length;
  const pending = requestBase.filter(r => r.status === 'pending').length;
  const recr    = requestBase.filter(r => RECRUITING.includes(r.status)).length;
  const thisMonth = (() => { const m=new Date().toISOString().slice(0,7); return requestBase.filter(r=>r.status==='filled'&&r.resolvedDate?.startsWith(m)).length; })();
  const activeBase = base.filter(isActiveResource);
  const direct = activeBase.filter(r => hiringKind(r.hiringType)==='direct').length;
  const secondment = activeBase.filter(r => hiringKind(r.hiringType)==='secondment').length;
  const subcon = activeBase.filter(r => hiringKind(r.hiringType)==='subcon').length;
  const kpiEl = document.getElementById('res-kpi');
  if(kpiEl) kpiEl.style.display = _resTab === 'request' ? 'grid' : 'none';
  if(kpiEl) kpiEl.innerHTML = `
    <div class="metric-card"><div class="metric-label">Total Open</div><div class="metric-val" style="color:var(--blue)">${open}</div></div>
    <div class="metric-card"><div class="metric-label">Pending Approval</div><div class="metric-val" style="color:var(--text-2)">${pending}</div></div>
    <div class="metric-card"><div class="metric-label">Recruiting (BBIK)</div><div class="metric-val" style="color:var(--amber)">${recr}</div></div>
    <div class="metric-card"><div class="metric-label">Onboarded This Month</div><div class="metric-val" style="color:var(--green)">${thisMonth}</div></div>
    <div class="metric-card"><div class="metric-label">Direct HC</div><div class="metric-val" style="color:var(--green)">${direct}</div><div class="metric-sub">Permanent</div></div>
    <div class="metric-card"><div class="metric-label">Secondment</div><div class="metric-val" style="color:var(--blue)">${secondment}</div><div class="metric-sub">Fixed term</div></div>
    <div class="metric-card"><div class="metric-label">Sub Con</div><div class="metric-val" style="color:var(--amber)">${subcon}</div><div class="metric-sub">Fixed term</div></div>`;


  // New Request â€” à¹€à¸‰à¸žà¸²à¸° role à¸—à¸µà¹ˆà¸ªà¸£à¹‰à¸²à¸‡à¹„à¸”à¹‰ à¹à¸¥à¸°à¹€à¸‰à¸žà¸²à¸°à¹à¸—à¹‡à¸š Request
  const newBtn = document.querySelector('#view-resource .filter-row .btn-primary');
  const employeeImportBtns = ['res-employee-template-btn','res-employee-import-btn'].map(id => document.getElementById(id)).filter(Boolean);
  const projectCodeImportBtns = ['res-project-code-template-btn','res-project-code-import-btn'].map(id => document.getElementById(id)).filter(Boolean);
  employeeImportBtns.forEach(btn => { btn.style.display = _resTab === 'people' ? '' : 'none'; });
  projectCodeImportBtns.forEach(btn => { btn.style.display = _resTab === 'code' ? '' : 'none'; });
  if(newBtn) {
    const canCreateOperational = canInternalOps(role) && ['transfer','code'].includes(_resTab);
    newBtn.style.display = (canManageRequest(role) && _resTab==='request') || canCreateOperational ? '' : 'none';
    if(_resTab === 'transfer') {
      newBtn.textContent = '+ New Assignment';
      newBtn.setAttribute('onclick', 'openTransferEntry()');
    } else if(_resTab === 'code') {
      newBtn.textContent = '+ New Project Code';
      newBtn.setAttribute('onclick', 'openProjectCodeMasterEntry()');
    } else {
      newBtn.textContent = '+ New Request';
      newBtn.setAttribute('onclick', 'openResModal()');
    }
  }

  if(_resTab === 'transfer') {
    renderTransferView(base);
    return;
  }
  if(_resTab === 'code') {
    renderProjectCodeView(base);
    return;
  }
  if(_resTab === 'people') {
    renderPeopleView(base);
    return;
  }
  if(_resTab === 'timeline') {
    renderTimelineView(base);
    return;
  }
  if(_resTab === 'allocation') {
    renderAllocationView(base);
    return;
  }
  if(_resTab === 'movement') {
    renderMovementView(base);
    return;
  }


  // â”€â”€ Optional inline filters (if present in index.html) â”€â”€
  const search   = (document.getElementById('res-search')?.value||'').toLowerCase();
  const fHiring  = document.getElementById('res-f-hiring')?.value  || 'all';
  const fProject = document.getElementById('res-f-project')?.value || 'all';
  const fLevel   = document.getElementById('res-f-level')?.value   || 'all';


  let list = scoped;
  if(fHiring  !== 'all') list = list.filter(r => hiringKind(r.hiringType) === fHiring);
  if(fProject !== 'all') list = list.filter(r => r.project === fProject);
  if(fLevel   !== 'all') list = list.filter(r => r.level === fLevel);
  if(search) list = list.filter(r =>
    `${r.project} ${r.position} ${r.resourceTeam} ${r.level} ${resourcePersonName(r)} ${resourceEmployeeCode(r)} ${primaryProjectCode(r)}`.toLowerCase().includes(search));


  // Sort + paginate
  list = [...list].sort((a,b) => {
    let va = a[_resSortCol]||'', vb = b[_resSortCol]||'';
    return _resSortAsc ? (va>vb?1:-1) : (va<vb?1:-1);
  });
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total/RES_PER_PAGE));
  if(_resPage > pages) _resPage = 1;
  const slice = list.slice((_resPage-1)*RES_PER_PAGE, _resPage*RES_PER_PAGE);


  // â”€â”€ Columns + Table (header à¸„à¸¸à¸¡à¸ˆà¸²à¸ JS â€” à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹à¸à¹‰ <thead> à¹ƒà¸™ index.html) â”€â”€
  const cols = resColumns();
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;


  const table = tbody.closest('table');
  if(table) {
    table.style.display = '';
    table.style.width = '100%';
    table.style.minWidth = '';
    let thead = table.querySelector('thead');
    if(!thead) { thead = document.createElement('thead'); table.insertBefore(thead, table.firstChild); }
    thead.innerHTML = `<tr>${cols.map(c=>`<th style="${c.th||''}">${esc(c.label)}</th>`).join('')}</tr>`;
  }


  const emptyMsg =
      _resTab==='transfer' ? 'No employee assignment records yet.'
    : _resTab==='code'     ? 'No Project Code records yet.'
    : role==='bbik'        ? 'No approved requests for BBIK yet.'
    : role==='user'        ? `No request records for ${esc(currentUserProject()||'-')} yet. Click + New Request.`
    : 'No request records yet. Click + New Request to start.';


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
    <span style="font-size:12px;color:var(--text-3)">${total} rows | page ${_resPage}/${pages}</span>
    <div style="display:flex;gap:4px">
      <button class="btn-sm" ${_resPage<=1?'disabled':''} onclick="_resPage=1;_renderResourceUI(loadResources())" style="padding:3px 8px">First</button>
      <button class="btn-sm" ${_resPage<=1?'disabled':''} onclick="_resPage--;_renderResourceUI(loadResources())" style="padding:3px 8px">Prev</button>
      <button class="btn-sm" ${_resPage>=pages?'disabled':''} onclick="_resPage++;_renderResourceUI(loadResources())" style="padding:3px 8px">Next</button>
      <button class="btn-sm" ${_resPage>=pages?'disabled':''} onclick="_resPage=pages;_renderResourceUI(loadResources())" style="padding:3px 8px">Last</button>
    </div>`;
}


// â”€â”€ New/Edit Modal â”€â”€
function openResModal(id) {
  const role = currentRole();
  if(!canManageRequest(role)) { alert(`${RES_ROLES[role]} cannot create or edit requests.`); return; }
  const isEdit = !!id;
  const r = isEdit ? loadResources().find(x => x.id===id) : null;
  // User à¸ªà¸£à¹‰à¸²à¸‡/à¹à¸à¹‰à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¹‚à¸„à¸£à¸‡à¸à¸²à¸£à¸•à¸±à¸§à¹€à¸­à¸‡
  const projects = role==='user' ? [currentUserProject()] : resProjects();
  const defProject = r?.project || (role==='user' ? currentUserProject() : '');
  const projectOpts = projects.map(p=>`<option value="${esc(p)}" ${defProject===p?'selected':''}>${esc(p)}</option>`).join('');


  document.getElementById('res-modal-title').textContent = isEdit ? 'Edit Resource Request' : 'New Resource Request';
  document.getElementById('res-edit-id').value = id||'';
  const g = (fld,def='') => r ? (r[fld]||def) : def;


  document.getElementById('res-form-body').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Resource Team *</label><input id="rf-team" class="ri" placeholder="e.g. Dev, QA, BA" value="${esc(g('resourceTeam'))}"></div>
      <div class="fg"><label>Project (Target) *</label><select id="rf-project" class="ri" ${role==='user'?'disabled title="Requester can create requests only for the selected project"':''}>${role==='user'?'':'<option value="">- Select project -</option>'}${projectOpts}</select></div>
      <div class="fg"><label>Position *</label><input id="rf-position" class="ri" placeholder="e.g. Senior Backend Developer" value="${esc(g('position'))}"></div>
      <div class="fg"><label>Level *</label><select id="rf-level" class="ri">${LEVEL_OPTS.map(l=>`<option ${g('level')===l?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fg"><label>Employment Type *</label><select id="rf-hiring" class="ri" onchange="toggleEndDateRequired()">
        ${HIRING_OPTS.map(h=>`<option ${hiringKind(g('hiringType'))===hiringKind(h)?'selected':''}>${h}</option>`).join('')}
      </select><div id="rf-hiring-help" style="font-size:10px;color:var(--text-3);line-height:1.35"></div></div>
      <div class="fg"><label>Start Date *</label><input id="rf-start" class="ri" type="date" value="${g('startDate')}"></div>
      <div class="fg"><label id="rf-end-label">End Date</label><input id="rf-end" class="ri" type="date" value="${g('endDate')}"></div>
      <div class="fg"><label>Requester Name</label><input id="rf-requester" class="ri" placeholder="Requester name" value="${esc(g('requesterName'))}"></div>
      <div class="fg"><label>Request Date</label><input id="rf-reqdate" class="ri" type="date" value="${g('requestDate', todayISO)}" readonly style="background:var(--bg)"></div>
      <div class="fg"><label>Resource Name</label><input id="rf-resource-name" class="ri" placeholder="Actual person name when known" value="${esc(g('resourceName'))}"></div>
      <div class="fg"><label>Employee Code</label><input id="rf-employee-code" class="ri" placeholder="Optional employee id" value="${esc(g('employeeCode'))}"></div>
      <div class="fg"><label>Primary Project Code</label><input id="rf-primary-code" class="ri" placeholder="Optional project code" value="${esc(g('primaryProjectCode'))}"></div>
      <div class="fg"><label>Primary Allocation %</label><input id="rf-allocation" class="ri" type="number" min="1" max="100" value="${esc(String(g('allocationPercent', 100)))}"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label><textarea id="rf-remark" class="ri" rows="3" placeholder="Remark / reason">${esc(g('remark'))}</textarea></div>`;


  toggleEndDateRequired();
  document.getElementById('resource-modal').style.display = 'flex';
}


function toggleEndDateRequired() {
  const ht = document.getElementById('rf-hiring')?.value||'';
  const lbl = document.getElementById('rf-end-label');
  const inp = document.getElementById('rf-end');
  const req = isFixedTermHiring(ht);
  if(lbl) lbl.textContent = req ? 'End Date *' : 'End Date';
  if(inp) inp.required = req;
  const help = document.getElementById('rf-hiring-help');
  if(help) help.textContent = hiringMeta(ht).fullLabel;
}
function closeResModal() { document.getElementById('resource-modal').style.display='none'; }


async function saveResource() {
  const role = currentRole();
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const team = g('rf-team');
  // à¹‚à¸„à¸£à¸‡à¸à¸²à¸£: User à¸–à¸¹à¸à¸¥à¹‡à¸­à¸à¹€à¸›à¹‡à¸™à¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸­à¸‡ (select disabled â†’ à¸­à¹ˆà¸²à¸™à¸„à¹ˆà¸²à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¹ƒà¸Šà¹‰ currentUserProject)
  const project = role==='user' ? currentUserProject() : g('rf-project');
  const position = g('rf-position');
  const hc = 1; // 1 request = 1 transaction
  const hiring = g('rf-hiring'), startDate = g('rf-start'), endDate = g('rf-end');
  const allocation = clampAlloc(g('rf-allocation') || 100);
  if(allocation < 1 || allocation > 100) { alert('Primary Allocation must be between 1 and 100%'); return; }


  if(!team||!project||!position||!hiring||!startDate) { alert('Please fill all required fields.'); return; }
  if(isFixedTermHiring(hiring) && !endDate) { alert('End Date is required for Secondment / Sub Con'); return; }
  if(endDate && startDate && endDate < startDate) { alert('End Date must be after Start Date.'); return; }


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
    resourceName: g('rf-resource-name') || existing?.resourceName || '',
    employeeCode: g('rf-employee-code') || existing?.employeeCode || '',
    primaryProjectCode: g('rf-primary-code') || existing?.primaryProjectCode || '',
    allocationPercent: allocation,
    onboardDate: existing?.onboardDate||null,
    offboardDate: existing?.offboardDate||null,
    activityLog: existing?.activityLog || [{ action:'Created', status:'pending', by: g('rf-requester')||actor, at: new Date().toISOString() }],
  };


  await saveResourceAsync(data);
  closeResModal();
  renderResource();
}


// â”€â”€ Quick: Approve (PMO/Dir) & Accept (BBIK) â”€â”€
async function approveRequest(id) {
  const role = currentRole();
  if(!canApprove(role)) { alert('Only PMO/Dir can approve requests.'); return; }
  const list = loadResources(); const idx = list.findIndex(r=>r.id===id); if(idx<0) return;
  const r = list[idx];
  if(r.status!=='pending') { alert('Only pending requests can be approved.'); return; }
  if(!confirm(`Approve this request?\n\n${r.position} / ${r.project}\n\nAfter approval it will go to BBIK.`)) return;
  const now = new Date().toISOString();
  const updated = { ...r, status:'approved', updatedAt:now,
    activityLog:[...(r.activityLog||[]), { action:'Approved by PMO/Dir', from:'pending', to:'approved', by:RES_ROLES[role], at:now }] };
  await saveResourceAsync(updated);
  renderResource();
}
async function bbikAccept(id) {
  const role = currentRole();
  if(!canRecruit(role)) { alert('Only BBIK can accept recruiting work.'); return; }
  const list = loadResources(); const idx = list.findIndex(r=>r.id===id); if(idx<0) return;
  const r = list[idx];
  if(r.status!=='approved') { alert('Only approved requests can be accepted by BBIK.'); return; }
  const now = new Date().toISOString();
  const updated = { ...r, status:'sourcing', updatedAt:now,
    activityLog:[...(r.activityLog||[]), { action:'BBIK accepted (start sourcing)', from:'approved', to:'sourcing', by:RES_ROLES[role], at:now }] };
  await saveResourceAsync(updated);
  renderResource();
}


// â”€â”€ Status change modal (permission-gated) â”€â”€
function openResStatus(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const role = currentRole();
  const nexts = allowedNext(r.status, role);
  if(!nexts.length) {
    alert(`${RES_ROLES[role]} cannot change this request status (${RES_STATUS[r.status]?.label||r.status}).`);
    return;
  }
  const s = RES_STATUS[r.status]||{label:r.status};
  const opts = nexts.map(k=>`<option value="${k}">${RES_STATUS[k]?.label||k}</option>`).join('');
  document.getElementById('res-status-id').value = id;
  document.getElementById('res-status-current').innerHTML =
    `<span class="badge ${RES_STATUS[r.status]?.cls||'badge-gray'}">${s.label}</span> - ${esc(r.position)} / ${esc(r.project)}
     <div style="font-size:11px;color:var(--text-3);margin-top:6px">Changing as <strong>${esc(RES_ROLES[role])}</strong></div>`;
  document.getElementById('res-status-select').innerHTML = opts;
  document.getElementById('res-status-select').onchange = toggleStatusOnboardFields;
  ensureStatusOnboardFields(r);
  document.getElementById('res-status-remark').value = '';
  document.getElementById('resource-status-modal').style.display = 'flex';
  toggleStatusOnboardFields();
}
function closeResStatus() { document.getElementById('resource-status-modal').style.display='none'; }

function ensureStatusOnboardFields(r) {
  let box = document.getElementById('res-status-onboard-fields');
  if(!box) {
    box = document.createElement('div');
    box.id = 'res-status-onboard-fields';
    box.style.cssText = 'display:none;margin:10px 0;padding:10px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg)';
    const selectWrap = document.getElementById('res-status-select')?.closest('.fg');
    selectWrap?.insertAdjacentElement('afterend', box);
  }
  box.innerHTML = `
    <div class="fg" style="margin-bottom:8px"><label>Name - Surname *</label><input id="rs-resource-name" class="ri" value="${esc(r.resourceName||'')}" placeholder="Actual onboarded person"></div>
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg"><label>Employee Code</label><input id="rs-employee-code" class="ri" value="${esc(r.employeeCode||'')}" placeholder="Optional"></div>
      <div class="fg"><label>Team *</label><input id="rs-resource-team" class="ri" value="${esc(r.resourceTeam||'')}" placeholder="BA, QA, FE..."></div>
      <div class="fg"><label>Position *</label><input id="rs-position" class="ri" value="${esc(r.position||'')}" placeholder="Business Analyst, QA..."></div>
      <div class="fg"><label>Onboard Date</label><input id="rs-onboard-date" class="ri" type="date" value="${r.onboardDate||todayISO}"></div>
      <div class="fg"><label>Primary Project Code</label><input id="rs-primary-code" class="ri" list="rs-primary-code-list" value="${esc(r.primaryProjectCode||'')}" placeholder="Select or type project code"><datalist id="rs-primary-code-list">${activeProjectCodeMaster().map(c=>`<option value="${esc(c.code)}">${esc(c.project)}${c.pmOwner?` / ${esc(c.pmOwner)}`:''}</option>`).join('')}</datalist></div>
      <div class="fg"><label>Primary Allocation %</label><input id="rs-allocation" class="ri" type="number" min="1" max="100" value="${esc(String(r.allocationPercent||100))}"></div>
    </div>`;
}

function toggleStatusOnboardFields() {
  const box = document.getElementById('res-status-onboard-fields');
  const next = document.getElementById('res-status-select')?.value;
  if(box) box.style.display = next === 'filled' ? 'block' : 'none';
}


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
    alert(`${RES_ROLES[role]} cannot change "${RES_STATUS[prevStatus]?.label||prevStatus}" to "${RES_STATUS[newStatus]?.label||newStatus}".`);
    return;
  }
  if(newStatus==='cancelled' && !remark) { alert('Please enter a remark when cancelling.'); return; }


  const onboardMeta = {};
  if(newStatus === 'filled') {
    const rn = document.getElementById('rs-resource-name')?.value?.trim() || '';
    const team = document.getElementById('rs-resource-team')?.value?.trim() || '';
    const position = document.getElementById('rs-position')?.value?.trim() || '';
    const onboardDate = document.getElementById('rs-onboard-date')?.value || todayISO;
    const alloc = clampAlloc(document.getElementById('rs-allocation')?.value || 100);
    if(!rn || !team || !position || !onboardDate) { alert('Name, Team, Position, and Onboard Date are required when status becomes Filled.'); return; }
    if(alloc < 1 || alloc > 100) { alert('Primary Allocation must be between 1 and 100%'); return; }
    onboardMeta.resourceName = rn;
    onboardMeta.resourceTeam = team;
    onboardMeta.position = position;
    onboardMeta.employeeCode = document.getElementById('rs-employee-code')?.value?.trim() || '';
    onboardMeta.primaryProjectCode = document.getElementById('rs-primary-code')?.value?.trim() || '';
    onboardMeta.allocationPercent = alloc;
    onboardMeta.onboardDate = onboardDate;
    onboardMeta.startDate = onboardDate;
    onboardMeta.offboardDate = null;
  }

  const now = new Date().toISOString();
  const updated = { ...list[idx], ...onboardMeta,
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


// â”€â”€ Transfer modal (within Orbit) â”€â”€
function openResTransfer(id) {
  openTransferEntry('', id);
  return;
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} cannot create transfer records.`); return; }
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const projectOpts = resProjects().filter(p=>p!==r.project).map(p=>`<option>${esc(p)}</option>`).join('');
  document.getElementById('res-transfer-id').value = id;
  document.getElementById('res-transfer-body').innerHTML = `
    <p style="font-size:12px;color:var(--text-2);margin-bottom:12px">
      Transfer <strong>${esc(r.position)}</strong> (${esc(r.resourceTeam)}) from <strong>${esc(r.project)}</strong> to:
    </p>
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Destination Project *</label><select id="rtf-project" class="ri"><option value="">- Select -</option>${projectOpts}</select></div>
      <div class="fg"><label>New Start Date *</label><input id="rtf-start" class="ri" type="date" value="${todayISO}"></div>
      <div class="fg"><label>End Date</label><input id="rtf-end" class="ri" type="date" value="${r.endDate||''}"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Transfer Reason *</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="Enter reason"></textarea></div>`;
  document.getElementById('resource-transfer-modal').style.display = 'flex';
}
function closeResTransfer() { document.getElementById('resource-transfer-modal').style.display='none'; }

function resourceSearchLabel(r) {
  return [resourcePersonName(r)||r.position||r.id, r.project, resourceEmployeeCode(r)].filter(Boolean).join(' - ');
}
function buildResourceSearchMap(list) {
  window._resResourceSearchMap = {};
  return list.filter(isActiveResource).map(r => {
    const label = resourceSearchLabel(r);
    window._resResourceSearchMap[label] = r.id;
    return `<option value="${esc(label)}"></option>`;
  }).join('');
}
function openTransferEntry(editId='', sourceId='', mode='transfer', codeIndex='') {
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} cannot create transfer records`); return; }
  const list = loadResources();
  const editing = editId ? list.find(x => x.id === editId) : null;
  const source = sourceId ? list.find(x => x.id === sourceId) : null;
  const sourceFromTransfer = editing ? list.find(x => x.id === editing.transferFrom) : null;
  const selectedSourceId = source?.id || sourceFromTransfer?.id || '';
  const editingCodeIndex = codeIndex === '' ? -1 : Number(codeIndex);
  const editingCode = source && editingCodeIndex >= 0 ? (source.projectCodes||[])[editingCodeIndex] : null;
  const actionMode = mode === 'code' || editingCode ? 'code' : 'transfer';
  const searchOptions = buildResourceSearchMap(list);
  const selectedResource = source || sourceFromTransfer || null;
  const selectedSearch = selectedResource ? resourceSearchLabel(selectedResource) : '';
  const fromProject = source?.project || sourceFromTransfer?.project || transferFromProject(editing||{}, list);
  const projectOpts = resProjects().map(p => `<option ${((editingCode?.project||editing?.project)===p)?'selected':''}>${esc(p)}</option>`).join('');
  const codeOptions = activeProjectCodeMaster().map(c => `<option value="${esc(c.code)}">${esc(c.project)}${c.pmOwner?` / ${esc(c.pmOwner)}`:''}</option>`).join('');
  document.getElementById('res-transfer-id').value = editId || '';
  document.getElementById('res-transfer-body').innerHTML = `
    <input type="hidden" id="rtf-source-id" value="${esc(selectedSourceId)}">
    <input type="hidden" id="rtf-code-index" value="${esc(codeIndex === '' ? '' : String(codeIndex))}">
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Action Type *</label><select id="rtf-action" class="ri" onchange="toggleAssignmentMode()">
        <option value="transfer" ${actionMode==='transfer'?'selected':''}>Transfer Employee</option>
        <option value="code" ${actionMode==='code'?'selected':''}>Add Project Code to Employee</option>
      </select></div>
      <div class="fg"><label>Search Employee *</label><input id="rtf-source-search" class="ri" list="rtf-source-list" value="${esc(selectedSearch)}" placeholder="Type name, project, or employee code" oninput="setTransferSourceFromSearch(this.value)"><datalist id="rtf-source-list">${searchOptions}</datalist></div>
      <div class="fg"><label>Request Date *</label><input id="rtf-request-date" class="ri" type="date" value="${editing?.requestDate||todayISO}"></div>
      <div class="fg"><label>Request By *</label><input id="rtf-request-by" class="ri" value="${esc(editing?.requesterName||source?.requesterName||'')}" placeholder="Requester / PMO"></div>
      <div class="fg"><label>From Project *</label><input id="rtf-from-project" class="ri" value="${esc(fromProject||'')}" placeholder="Current project"></div>
      <div class="fg"><label>To Project *</label><select id="rtf-project" class="ri"><option value="">Select project</option>${projectOpts}</select></div>
      <div class="fg" style="display:none"><label>Name - Surname *</label><input id="rtf-name" class="ri" value="${esc(resourcePersonName(editing||source||{})||'')}" placeholder="Employee name"></div>
      <div class="fg"><label>First day at new project *</label><input id="rtf-start" class="ri" type="date" value="${editing?.onboardDate||editing?.startDate||todayISO}"></div>
      <div class="fg"><label>Last day at new project *</label><input id="rtf-end" class="ri" type="date" value="${editing?.offboardDate||editing?.endDate||''}"></div>
      <div class="fg"><label>Project Code</label><input id="rtf-code" class="ri" list="rtf-code-list" value="${esc(editingCode?.code||primaryProjectCode(editing||{})||'')}" placeholder="Timesheet / project code" onchange="applyTransferProjectCode()"><datalist id="rtf-code-list">${codeOptions}</datalist></div>
      <div class="fg"><label>Allocation %</label><input id="rtf-allocation" class="ri" type="number" min="1" max="100" value="${esc(String(editingCode?.allocation||100))}"></div>
      <div class="fg"><label>Supervisor</label><input id="rtf-supervisor" class="ri" value="${esc(editingCode?.supervisor||editing?.supervisor||transferSupervisor(editing||{})||'')}" placeholder="Supervisor name"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="Reason / note">${esc(editingCode?.note||(editing?.remark||'').replace(/^Transferred from.*\n?/,'').replace(/Supervisor:[^\n]*\n?/i,''))}</textarea></div>`;
  document.getElementById('resource-transfer-modal').style.display = 'flex';
  document.querySelector('#resource-transfer-modal .btn-primary').textContent = actionMode === 'code' ? 'Save Project Code' : 'Transfer';
  toggleAssignmentMode();
}

function setTransferSourceFromSearch(value) {
  const id = window._resResourceSearchMap?.[value] || '';
  setTransferSource(id);
}
function setTransferSource(id) {
  const hidden = document.getElementById('rtf-source-id');
  if(hidden) hidden.value = id || '';
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  const fill = (id, value) => {
    const el = document.getElementById(id);
    if(el && !el.value) el.value = value || '';
  };
  fill('rtf-request-by', r.requesterName);
  fill('rtf-from-project', r.project);
  fill('rtf-name', resourcePersonName(r));
  if((document.getElementById('rtf-action')?.value || 'transfer') !== 'code') fill('rtf-code', primaryProjectCode(r));
  fill('rtf-supervisor', r.supervisor || '');
}

function toggleAssignmentMode() {
  const mode = document.getElementById('rtf-action')?.value || 'transfer';
  const modal = document.getElementById('resource-transfer-modal');
  const primary = modal?.querySelector('.btn-primary');
  if(primary) primary.textContent = mode === 'code' ? 'Save Project Code' : 'Transfer';
  const from = document.getElementById('rtf-from-project')?.closest('.fg');
  const last = document.getElementById('rtf-end')?.closest('.fg');
  if(from) from.style.display = mode === 'code' ? 'none' : '';
  if(last) last.querySelector('label').textContent = mode === 'code' ? 'End Date *' : 'Last day at new project *';
}

function applyTransferProjectCode() {
  const code = document.getElementById('rtf-code')?.value || '';
  const meta = projectCodeByValue(code);
  if(!meta) return;
  const project = document.getElementById('rtf-project');
  const start = document.getElementById('rtf-start');
  const end = document.getElementById('rtf-end');
  const supervisor = document.getElementById('rtf-supervisor');
  if(project) project.value = meta.project || project.value;
  if(start && meta.startDate) start.value = meta.startDate;
  if(end && meta.endDate) end.value = meta.endDate;
  if(supervisor && meta.pmOwner) supervisor.value = meta.pmOwner;
}


async function saveResTransfer() {
  const sourceId = document.getElementById('res-transfer-id').value;
  const destProject = document.getElementById('rtf-project')?.value||'';
  const startDate = document.getElementById('rtf-start')?.value||'';
  const endDate = document.getElementById('rtf-end')?.value||'';
  const remark = document.getElementById('rtf-remark')?.value?.trim()||'';
  const actor = RES_ROLES[currentRole()];
  if(!destProject||!startDate||!remark) { alert('Please fill all required fields.'); return; }


  const source = loadResources().find(r=>r.id===sourceId);
  if(!source) return;
  const now = new Date().toISOString();


  const updatedSource = { ...source,
    status: 'resolved', resolvedDate: todayISO, updatedAt: now,
    offboardDate: startDate,
    activityLog: [...(source.activityLog||[]), { action:'Transferred', to: destProject, by: actor, remark, at: now }],
    remark: (source.remark ? source.remark+'\n' : '') + `[Transfer] -> ${destProject}: ${remark}`,
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
    resourceName: source.resourceName||'', employeeCode: source.employeeCode||'',
    primaryProjectCode: source.primaryProjectCode||'',
    allocationPercent: source.allocationPercent||primaryAllocation(source),
    onboardDate: startDate, offboardDate: null,
    activityLog: [{ action:'Transfer received', from: source.project, by: actor, remark, at: now }],
    createdAt: now, updatedAt: now,
  };


  await saveResourceAsync(updatedSource);
  await saveResourceAsync(newRecord);
  closeResTransfer();
  renderResource();
  alert(`Transfer completed.\nCreated ${newRecord.id} for ${destProject}.`);
}


// â”€â”€ Add Project Code modal â”€â”€
async function saveResTransfer() {
  const editId = document.getElementById('res-transfer-id').value;
  const sourceId = document.getElementById('rtf-source-id')?.value || '';
  const actionMode = document.getElementById('rtf-action')?.value || 'transfer';
  const codeIndexRaw = document.getElementById('rtf-code-index')?.value || '';
  const requestDate = document.getElementById('rtf-request-date')?.value || todayISO;
  const requestBy = document.getElementById('rtf-request-by')?.value?.trim() || '';
  const fromProject = document.getElementById('rtf-from-project')?.value?.trim() || '';
  const destProject = document.getElementById('rtf-project')?.value || '';
  const personName = document.getElementById('rtf-name')?.value?.trim() || '';
  const startDate = document.getElementById('rtf-start')?.value || '';
  const endDate = document.getElementById('rtf-end')?.value || '';
  const code = document.getElementById('rtf-code')?.value?.trim() || '';
  const allocation = clampAlloc(document.getElementById('rtf-allocation')?.value || 100);
  const supervisor = document.getElementById('rtf-supervisor')?.value?.trim() || '';
  const remark = document.getElementById('rtf-remark')?.value?.trim() || '';
  const actor = RES_ROLES[currentRole()];
  const list = loadResources();
  const source = sourceId ? list.find(r => r.id === sourceId) : null;

  if(actionMode === 'code') {
    if(!sourceId || !destProject || !code || allocation < 1 || !startDate || !endDate) {
      alert('Please select Employee, Project, Project Code, Allocation, Start Date, and End Date.');
      return;
    }
    if(endDate && endDate < startDate) { alert('End Date must be after Start Date.'); return; }
    if(!source) return;
    const codeMeta = projectCodeByValue(code, destProject) || projectCodeByValue(code);
    if(codeMeta && String(codeMeta.status||'').toLowerCase() !== 'active') { alert('Selected Project Code is not Active yet.'); return; }
    const editIdx = codeIndexRaw === '' ? -1 : Number(codeIndexRaw);
    const existingCodes = [...(source.projectCodes||[])];
    const previousAlloc = editIdx >= 0 ? clampAlloc(existingCodes[editIdx]?.allocation) : 0;
    const used = _allocTotalUsed(source) - previousAlloc;
    if(used + allocation > 100) { alert(`Total allocation exceeds 100% (available ${100-used}%).`); return; }
    const now = new Date().toISOString();
    const codeEntry = {
      project: destProject,
      code,
      allocation,
      supervisor: supervisor || codeMeta?.pmOwner || '',
      startDate: startDate || codeMeta?.startDate || '',
      endDate: endDate || codeMeta?.endDate || '',
      note: remark,
      projectCodeType: codeMeta?.type || '',
      at: editIdx >= 0 ? (existingCodes[editIdx]?.at || now) : now
    };
    if(editIdx >= 0) existingCodes[editIdx] = codeEntry;
    else existingCodes.push(codeEntry);
    await saveResourceAsync({ ...source,
      projectCodes: existingCodes,
      updatedAt: now,
      activityLog: [...(source.activityLog||[]), { action: editIdx >= 0 ? 'Project code updated' : 'Project code added', to: destProject, by: actor, remark: `${code} / ${allocation}%${remark?` / ${remark}`:''}`, at: now }],
      remark: (source.remark ? source.remark+'\n' : '') + `[Project Code] ${code} (${destProject}) ${allocation}%`,
    });
    closeResTransfer();
    renderResource();
    alert(`Project Code ${code} saved for ${resourcePersonName(source)||source.position}.`);
    return;
  }

  if(!requestDate || !requestBy || !fromProject || !destProject || !personName || !startDate || !endDate) {
    alert('Please fill Request Date, Request By, From Project, To Project, Employee, First Day, and Last Day.');
    return;
  }
  if(endDate && endDate < startDate) { alert('Last day must be after first day.'); return; }

  const existing = editId ? list.find(r => r.id === editId) : null;
  const now = new Date().toISOString();

  if(source && !existing) {
    await saveResourceAsync({ ...source,
      status: 'resolved',
      resolvedDate: todayISO,
      offboardDate: startDate,
      updatedAt: now,
      activityLog: [...(source.activityLog||[]), { action:'Transferred', to: destProject, by: actor, remark, at: now }],
      remark: (source.remark ? source.remark+'\n' : '') + `[Transfer] -> ${destProject}: ${remark}`,
    });
  }

  const saved = {
    ...(existing||{}),
    id: existing?.id || nextResId(),
    resourceTeam: existing?.resourceTeam || source?.resourceTeam || 'Transfer',
    project: destProject,
    position: existing?.position || source?.position || 'Transferred Resource',
    level: existing?.level || source?.level || '',
    hc: existing?.hc || source?.hc || 1,
    hiringType: existing?.hiringType || source?.hiringType || HIRING_OPTS[0],
    startDate,
    endDate: endDate || null,
    requestDate,
    resolvedDate: null,
    remark: `Transferred from ${fromProject}${sourceId?` (${sourceId})`:''}\n${supervisor?`Supervisor: ${supervisor}\n`:''}${remark}`,
    status: 'filled',
    requesterName: requestBy,
    transferFrom: sourceId || fromProject,
    projectCodes: existing?.projectCodes || [],
    resourceName: personName,
    employeeCode: existing?.employeeCode || source?.employeeCode || '',
    primaryProjectCode: code,
    allocationPercent: existing?.allocationPercent || (source ? primaryAllocation(source) : 100),
    onboardDate: startDate,
    offboardDate: endDate || null,
    supervisor,
    activityLog: [...(existing?.activityLog||[]), { action: existing ? 'Transfer updated' : 'Transfer received', from: fromProject, to: destProject, by: actor, remark, at: now }],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await saveResourceAsync(saved);
  closeResTransfer();
  renderResource();
  alert(`Transfer saved: ${personName} -> ${destProject}`);
}

function ensureAddCodeModal() {
  if(document.getElementById('res-addcode-modal')) return;
  const m = document.createElement('div');
  m.id = 'res-addcode-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center';
  m.innerHTML = `
    <div class="card" style="width:520px;max-width:95vw;max-height:90vh;overflow:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:15px;font-weight:700">Add Project Code</span>
        <button class="btn-sm" onclick="closeAddCode()" style="padding:4px 10px">x</button>
      </div>
      <input type="hidden" id="addcode-id">
      <input type="hidden" id="addcode-index">
      <div id="addcode-target" style="font-size:12px;margin-bottom:12px"></div>
      <div id="addcode-existing" style="margin-bottom:12px"></div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>Project *</label><select id="addcode-project" class="ri" onchange="syncAddCodeChoices()"></select></div>
        <div class="fg"><label>Project Code *</label><input id="addcode-code" class="ri" list="addcode-code-list" placeholder="Select project code" onchange="applySelectedProjectCode()"><datalist id="addcode-code-list"></datalist></div>
        <div class="fg"><label>Allocation % *</label><input id="addcode-alloc" class="ri" type="number" min="1" max="100" value="50"></div>
        <div class="fg"><label>Supervisor</label><input id="addcode-supervisor" class="ri" placeholder="Supervisor name"></div>
        <div class="fg"><label>Start Date</label><input id="addcode-start" class="ri" type="date"></div>
        <div class="fg"><label>End Date</label><input id="addcode-end" class="ri" type="date"></div>
        <div class="fg"><label>Note (cost split)</label><input id="addcode-note" class="ri" placeholder="e.g. cost split 50/50"></div>
      </div>
      <div id="addcode-cap" style="font-size:11px;color:var(--text-3);margin-top:8px"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn-ghost" onclick="closeAddCode()">Cancel</button>
        <button class="btn-primary" onclick="saveAddCode()">Add Code</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) closeAddCode(); });
}
function closeAddCode() { const m=document.getElementById('res-addcode-modal'); if(m) m.style.display='none'; }
function syncAddCodeChoices() {
  const project = document.getElementById('addcode-project')?.value || '';
  const codes = activeProjectCodeMaster().filter(c => !project || c.project === project);
  const list = document.getElementById('addcode-code-list');
  if(list) list.innerHTML = codes.map(c =>
    `<option value="${esc(c.code)}">${esc(c.project)}${c.pmOwner?` / ${esc(c.pmOwner)}`:''}</option>`
  ).join('');
}
function applySelectedProjectCode() {
  const project = document.getElementById('addcode-project')?.value || '';
  const code = document.getElementById('addcode-code')?.value || '';
  const meta = projectCodeByValue(code, project) || projectCodeByValue(code);
  if(!meta) return;
  if(document.getElementById('addcode-project')) document.getElementById('addcode-project').value = meta.project || project;
  if(document.getElementById('addcode-start') && meta.startDate) document.getElementById('addcode-start').value = meta.startDate;
  if(document.getElementById('addcode-end') && meta.endDate) document.getElementById('addcode-end').value = meta.endDate;
  if(document.getElementById('addcode-supervisor') && meta.pmOwner) document.getElementById('addcode-supervisor').value = meta.pmOwner;
  syncAddCodeChoices();
}
function _allocUsed(r) { return (r.projectCodes||[]).reduce((sum,c)=> sum + (Number(c.allocation)||0), 0); }
function _allocTotalUsed(r) { return primaryAllocation(r) + _allocUsed(r); }


function openAddCode(id='', codeIndex='') {
  openTransferEntry('', id, 'code', codeIndex);
  return;
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} cannot add Project Code.`); return; }
  ensureAddCodeModal();
  if(!document.getElementById('addcode-person')) {
    const projectWrap = document.getElementById('addcode-project')?.closest('.fg');
    projectWrap?.insertAdjacentHTML('beforebegin', '<div class="fg"><label>Name - Surname *</label><select id="addcode-person" class="ri" onchange="openAddCode(this.value)"></select></div>');
  }
  const list = loadResources();
  if(!id) id = list.find(isActiveResource)?.id || '';
  const r = list.find(x=>x.id===id);
  if(!r) { alert('No filled resource yet. Please onboard/fill a resource before adding Project Code.'); return; }
  if(r.status!=='filled') { alert('Project Code can be added only to Filled resources.'); return; }


  const existing = r.projectCodes||[];
  const editIdx = codeIndex === '' ? -1 : Number(codeIndex);
  const editingCode = editIdx >= 0 ? existing[editIdx] : null;
  const usedProjects = [r.project, ...existing.map((c,i)=>i===editIdx ? null : c.project).filter(Boolean)];
  const masterProjects = [...new Set(activeProjectCodeMaster().map(c => c.project).filter(Boolean))];
  const projectOpts = masterProjects.filter(p=>!usedProjects.includes(p) || editingCode?.project===p).map(p=>`<option ${editingCode?.project===p?'selected':''}>${esc(p)}</option>`).join('');
  const peopleOptions = list.filter(isActiveResource)
    .map(x=>`<option value="${esc(x.id)}" ${x.id===id?'selected':''}>${esc(resourcePersonName(x)||x.position)} - ${esc(x.project)}</option>`)
    .join('');


  document.getElementById('addcode-id').value = id;
  document.getElementById('addcode-index').value = codeIndex === '' ? '' : String(codeIndex);
  document.getElementById('addcode-person').innerHTML = peopleOptions;
  document.getElementById('addcode-target').innerHTML =
    `<strong>${esc(r.position)}</strong> / ${esc(r.level||'')} <span style="color:var(--text-3)">(${esc(r.resourceTeam||'-')})</span>
     <div style="font-size:11px;color:var(--text-3);margin-top:3px">Primary project: <strong>${esc(r.project)}</strong></div>`;


  const used = _allocTotalUsed(r);
  document.getElementById('addcode-existing').innerHTML = existing.length
    ? `<div style="font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:5px">Existing Project Codes</div>` +
      existing.map(c=>`<div style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;display:flex;justify-content:space-between">
        <span><strong>${esc(c.code||'-')}</strong> / ${esc(c.project)}</span><span class="badge badge-teal" style="font-size:9px">${esc(String(c.allocation||0))}%</span></div>`).join('')
    : `<div style="font-size:11px;color:var(--text-3)">No extra project code yet.</div>`;


  document.getElementById('addcode-project').innerHTML = `<option value="">- Select -</option>${projectOpts}`;
  document.getElementById('addcode-code').value = editingCode?.code || '';
  document.getElementById('addcode-alloc').value = editingCode?.allocation || Math.min(50, Math.max(1, 100-used));
  document.getElementById('addcode-supervisor').value = editingCode?.supervisor || r.supervisor || '';
  document.getElementById('addcode-start').value = editingCode?.startDate || '';
  document.getElementById('addcode-end').value = editingCode?.endDate || '';
  document.getElementById('addcode-note').value = editingCode?.note || '';
  document.getElementById('addcode-cap').textContent = `Allocation available ${Math.max(0, 100-used)}% (primary + extra codes used ${used}%)`;
  syncAddCodeChoices();
  applySelectedProjectCode();
  document.getElementById('res-addcode-modal').style.display = 'flex';
}
function closeAddCode() { const m=document.getElementById('res-addcode-modal'); if(m) m.style.display='none'; }


async function saveAddCode() {
  const id = document.getElementById('addcode-id').value;
  const editIdx = document.getElementById('addcode-index')?.value === '' ? -1 : Number(document.getElementById('addcode-index')?.value);
  const project = document.getElementById('addcode-project').value;
  const code = document.getElementById('addcode-code').value.trim();
  const alloc = parseInt(document.getElementById('addcode-alloc').value)||0;
  const supervisor = document.getElementById('addcode-supervisor')?.value?.trim() || '';
  const startDate = document.getElementById('addcode-start')?.value || '';
  const endDate = document.getElementById('addcode-end')?.value || '';
  const note = document.getElementById('addcode-note').value.trim();
  const actor = RES_ROLES[currentRole()];
  const codeMeta = projectCodeByValue(code, project) || projectCodeByValue(code);
  if(endDate && startDate && endDate < startDate) { alert('End Date must be after Start Date.'); return; }
  if(!project||!code||alloc<1) { alert('Please fill Project, Code, and Allocation.'); return; }
  if(codeMeta && String(codeMeta.status||'').toLowerCase() !== 'active') { alert('Selected Project Code is not Active yet.'); return; }


  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const r = list[idx];
  const existingCodes = [...(r.projectCodes||[])];
  const previousAlloc = editIdx >= 0 ? clampAlloc(existingCodes[editIdx]?.allocation) : 0;
  const used = _allocTotalUsed(r) - previousAlloc;
  if(used + alloc > 100) { alert(`Total allocation exceeds 100% (available ${100-used}%).`); return; }


  const now = new Date().toISOString();
  const codeEntry = {
    project,
    code,
    allocation: alloc,
    supervisor: supervisor || codeMeta?.pmOwner || '',
    startDate: startDate || codeMeta?.startDate || '',
    endDate: endDate || codeMeta?.endDate || '',
    note,
    projectCodeType: codeMeta?.type || '',
    at: editIdx >= 0 ? (existingCodes[editIdx]?.at || now) : now
  };
  if(editIdx >= 0) existingCodes[editIdx] = codeEntry;
  else existingCodes.push(codeEntry);
  const updated = { ...r,
    projectCodes: existingCodes,
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), { action:'Project code added', to: project, by: actor,
      remark: `${code} / ${alloc}%${note?` / ${note}`:''}`, at: now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Add Code] ${code} (${project}) ${alloc}%`,
  };
  await saveResourceAsync(updated);
  closeAddCode();
  renderResource();
  alert(`Project Code ${code} (${project}) ${alloc}% added to ${r.position}.`);
}


// â”€â”€ Delete (hard remove) â€” PMO only â”€â”€
async function deleteProjectCode(id, codeIndex) {
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} cannot delete project codes`); return; }
  const list = loadResources();
  const r = list.find(x => x.id === id);
  if(!r) return;
  const codes = [...(r.projectCodes||[])];
  const c = codes[codeIndex];
  if(!c) return;
  if(!confirm(`Delete project code ${c.code || '-'} (${c.project || '-'}) from ${resourcePersonName(r)||r.position}?`)) return;
  codes.splice(codeIndex, 1);
  const now = new Date().toISOString();
  await saveResourceAsync({ ...r,
    projectCodes: codes,
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), { action:'Project code deleted', from:c.project, by:RES_ROLES[role], remark:c.code||'', at:now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Delete Code] ${c.code||'-'} (${c.project||'-'})`,
  });
  renderResource();
}

function deleteResource(id) {
  const role = currentRole();
  if(!canDelete(role)) { alert(`${RES_ROLES[role]} cannot delete requests. Only PMO/Dir can delete.`); return; }
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  if(!confirm(`Delete this request permanently?\n\n${r.position} / ${r.project}\n${r.id}\n\nThis action cannot be undone.`)) return;
  _doDeleteResource(id);
}
async function _doDeleteResource(id) {
  await deleteResourceAsync(id);
  closeResDetail();
  renderResource();
  alert('Request deleted.');
}


// â”€â”€ Detail drawer â”€â”€
// à¸ªà¸£à¹‰à¸²à¸‡ drawer à¹€à¸­à¸‡à¸–à¹‰à¸² index.html à¹„à¸¡à¹ˆà¸¡à¸µ (à¸à¸±à¸™à¸›à¸¸à¹ˆà¸¡ "à¸ˆà¸±à¸”à¸à¸²à¸£" à¸à¸”à¹à¸¥à¹‰à¸§à¹€à¸‡à¸µà¸¢à¸š)
async function offboardResource(id) {
  const role = currentRole();
  if(!canInternalOps(role)) { alert(`${RES_ROLES[role]} cannot offboard resources`); return; }
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  if(r.status !== 'filled') { alert('Offboard is available only for filled / onboarded resources'); return; }
  const reason = prompt(`Offboard ${resourcePersonName(r)||r.position} from ${r.project}?\n\nReason / note:`, '');
  if(reason === null) return;
  const now = new Date().toISOString();
  const updated = { ...r,
    status: 'resolved',
    resolvedDate: todayISO,
    offboardDate: todayISO,
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), { action:'Offboarded', from:'filled', to:'resolved', by:RES_ROLES[role], remark:reason.trim(), at:now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Offboard] ${reason.trim()}`,
  };
  await saveResourceAsync(updated);
  closeResDetail();
  renderResource();
}

function ensureDetailDrawer() {
  if(!document.getElementById('res-drawer-style')) {
    const st = document.createElement('style');
    st.id = 'res-drawer-style';
    st.textContent = `
      #res-drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s;z-index:1099}
      #res-drawer-overlay.open{opacity:1;pointer-events:auto}
      #resource-detail-drawer{position:fixed;top:0;right:0;height:100vh;width:440px;max-width:92vw;background:var(--surface,#fff);border-left:1px solid var(--border,#e5e7eb);box-shadow:-8px 0 24px rgba(0,0,0,.12);transform:translateX(100%);visibility:hidden;transition:transform .22s ease,visibility 0s linear .22s;z-index:1100;overflow:auto}
      #resource-detail-drawer.open{transform:translateX(0);visibility:visible;transition-delay:0s}`;
    document.head.appendChild(st);
  }
  if(!document.getElementById('res-drawer-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'res-drawer-overlay';
    ov.addEventListener('click', closeResDetail);
    document.body.appendChild(ov);
  }
  if(document.getElementById('resource-detail-drawer')) return;
  const dr = document.createElement('div');
  dr.id = 'resource-detail-drawer';
  dr.setAttribute('aria-hidden', 'true');
  dr.innerHTML = `
    <div style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
      <span style="font-size:14px;font-weight:700">Detail</span>
      <button class="btn-sm" onclick="closeResDetail()" style="font-size:16px">x</button>
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
      <div style="font-size:12px;font-weight:600">${esc(l.action)}${l.from?` (${RES_STATUS[l.from]?.label||l.from} -> ${RES_STATUS[l.to]?.label||l.to||''})`:''}${l.to&&!l.from?` -> ${esc(l.to)}`:''}</div>
      ${l.remark?`<div style="font-size:11px;color:var(--text-2);margin-top:2px">${esc(l.remark)}</div>`:''}
      <div style="font-size:10px;color:var(--text-3);margin-top:2px">${esc(l.by||'System')} / ${l.at?new Date(l.at).toLocaleString('th-TH'):''}</div>
    </div>`
  ).join('');


  const codes = (r.projectCodes||[]);
  const codesHtml = codes.length
    ? `<div style="font-size:12px;font-weight:700;margin:14px 0 6px;color:var(--text-2)">Project Codes (Multi-allocation)</div>
       <div style="font-size:12px;margin-bottom:6px;color:var(--text-3)">Primary project: <strong>${esc(r.project)}</strong></div>` +
      codes.map(c=>`<div style="display:flex;justify-content:space-between;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:12px">
        <span><strong>${esc(c.code||'-')}</strong> / ${esc(c.project)}${c.note?` <span style="color:var(--text-3)">/ ${esc(c.note)}</span>`:''}</span>
        <span class="badge badge-teal" style="font-size:9px">${esc(String(c.allocation||0))}%</span></div>`).join('')
    : '';


  document.getElementById('res-detail-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(r.position)}</div>
        <div style="font-size:12px;color:var(--text-2)">${esc(r.resourceTeam)} / ${esc(r.project)}</div>
      </div>
      <span class="badge ${s.cls}">${s.label}</span>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;margin-bottom:14px;font-size:12px">
      <div style="font-weight:700;margin-bottom:6px">Actual Resource</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><span style="color:var(--text-3)">Resource</span><br><strong>${esc(resourcePersonName(r)||'-')}</strong></div>
        <div><span style="color:var(--text-3)">Employee Code</span><br><strong>${esc(resourceEmployeeCode(r)||'-')}</strong></div>
        <div><span style="color:var(--text-3)">Primary Code</span><br><strong>${esc(primaryProjectCode(r)||'-')}</strong></div>
        <div><span style="color:var(--text-3)">Primary Allocation</span><br><strong>${primaryAllocation(r)}%</strong></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px">
      ${[['Level',r.level],['Employment Type',hiringMeta(r.hiringType).fullLabel],
         ['Start Date',r.startDate?shortDate(r.startDate):'-'],['End Date',r.endDate?shortDate(r.endDate):'-'],
         ['Request Date',r.requestDate?shortDate(r.requestDate):'-'],['Resolved Date',r.resolvedDate?shortDate(r.resolvedDate):'-'],
         ['Requester',r.requesterName||'-'],['Transfer From',r.transferFrom||'-']
        ].map(([k,v])=>`<div><span style="color:var(--text-3)">${k}</span><br><strong>${esc(String(v))}</strong></div>`).join('')}
    </div>
    ${codesHtml}
    ${r.remark?`<div style="background:var(--bg);border-radius:var(--r-sm);padding:10px;font-size:12px;margin:16px 0;white-space:pre-wrap">${esc(r.remark)}</div>`:''}
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-2)">Activity Log</div>
    ${log || '<div style="color:var(--text-3);font-size:12px">No activity log</div>'}
    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      ${(canManageRequest(role)&&r.status==='pending')?`<button class="btn-sm" onclick="openResModal('${r.id}');closeResDetail()">Edit</button>`:''}
      ${(canApprove(role)&&r.status==='pending')?`<button class="btn-sm" style="color:var(--green)" onclick="approveRequest('${r.id}');closeResDetail()">Approve</button>`:''}
      ${(canRecruit(role)&&r.status==='approved')?`<button class="btn-sm" style="color:var(--blue)" onclick="bbikAccept('${r.id}');closeResDetail()">Accept</button>`:''}
      ${allowedNext(r.status,role).length?`<button class="btn-sm" onclick="openResStatus('${r.id}');closeResDetail()">Change Status</button>`:''}
      ${(r.status==='filled'&&canInternalOps(role))?`<button class="btn-sm" style="color:var(--blue)" onclick="openResTransfer('${r.id}');closeResDetail()">Transfer</button>`:''}
      ${(r.status==='filled'&&canInternalOps(role))?`<button class="btn-sm" style="color:var(--green)" onclick="openAddCode('${r.id}');closeResDetail()">Add Project Code</button>`:''}
      ${canDelete(role)?`<button class="btn-sm" style="color:var(--red)" onclick="deleteResource('${r.id}')">Delete</button>`:''}
    </div>`;


  const drawer = document.getElementById('resource-detail-drawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.style.transition = 'none';
  drawer.style.transform = 'translateX(0)';
  drawer.style.visibility = 'visible';
  document.getElementById('res-drawer-overlay')?.classList.add('open');
}
function closeResDetail() {
  const drawer = document.getElementById('resource-detail-drawer');
  drawer?.classList.remove('open');
  drawer?.setAttribute('aria-hidden', 'true');
  if(drawer) {
    drawer.style.transition = 'none';
    drawer.style.transform = 'translateX(100%)';
    drawer.style.visibility = 'hidden';
  }
  document.getElementById('res-drawer-overlay')?.classList.remove('open');
}


// â”€â”€ Export (CSV, role-scoped) â”€â”€
function exportResourceCsv() {
  const list = visibleToRole(loadResources(), currentRole());
  if(!list.length) { alert('No data to export.'); return; }
  const headers = ['ID','Resource Name','Employee Code','Resource Team','Project','Primary Project Code','Primary Allocation %','Position','Level','Hiring Type','Start Date','End Date','Onboard Date','Offboard Date','Request Date','Resolved Date','Updated','Status','Requester','Transfer From','Project Codes','Remark'];
  const rows = list.map(r=>[r.id,resourcePersonName(r),resourceEmployeeCode(r),r.resourceTeam,r.project,primaryProjectCode(r),primaryAllocation(r),r.position,r.level,r.hiringType,r.startDate||'',r.endDate||'',r.onboardDate||'',r.offboardDate||'',r.requestDate||'',r.resolvedDate||'',r.updatedAt?String(r.updatedAt).slice(0,10):'',RES_STATUS[r.status]?.label||r.status,r.requesterName||'',r.transferFrom||'',(r.projectCodes||[]).map(c=>`${c.code}(${c.project}:${c.allocation}%)`).join(' | '),r.remark||'']);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
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
