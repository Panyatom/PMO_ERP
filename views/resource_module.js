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
//        interviewing -> offer -> (BBIK confirms onboard) -> filled -> resolved
//
// Self-contained: chrome (role/tab/chips) à¸–à¸¹à¸ inject à¸”à¹‰à¸§à¸¢ JS â€” à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹à¸à¹‰ index.html
// Depends on globals from app.js: esc, shortDate, todayISO, checkSupa, supaFetch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


const RES_KEY = 'orbit-pmo-resources-v1';
const RESOURCE_MASTER_KEY = 'orbit-pmo-resource-master-v1';
const RES_TIMELINE_MODE_KEY = 'orbit-pmo-resource-timeline-mode-v1';
const RES_TIMELINE_FILTER_KEY = 'orbit-pmo-resource-timeline-filters-v1';
const PROJECT_CODE_KEY = 'orbit-pmo-project-codes-v1';
let _resCache = null;
let _resourceMasterCache = null;
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
  pendingDocs: { label:'Pending Docs',         cls:'badge-yellow', th:'Pre-approval documents required before BBIK' },
  approved:    { label:'Approved',             cls:'badge-blue',   th:'Approved by PMO/Dir, waiting for BBIK' },
  sourcing:    { label:'Sourcing (BBIK)',      cls:'badge-blue',   th:'BBIK is sourcing' },
  interviewing:{ label:'Interviewing (BBIK)',  cls:'badge-purple', th:'BBIK is interviewing' },
  offer:       { label:'Offer (BBIK)',         cls:'badge-amber',  th:'BBIK is preparing offer' },
  document:    { label:'Docs',                 cls:'badge-yellow', th:'Legacy document stage' },
  filled:      { label:'Filled',               cls:'badge-green',  th:'Employee filled' },
  mitigated:   { label:'Mitigated',            cls:'badge-teal',   th:'Resolved by internal mitigation' },
  resolved:    { label:'Resolved',             cls:'badge-green',  th:'Closed' },
  cancelled:   { label:'Cancelled',            cls:'badge-red',    th:'Cancelled' },
};
const OPEN = ['pending','pendingDocs','approved','sourcing','interviewing','offer'];
const RECRUITING = ['sourcing','interviewing','offer'];


const LEVEL_OPTS = ['Junior','Mid','Senior','Lead','Manager'];
const HIRING_OPTS = ['Direct Head Count (Permanent)','Secondment','Sub-contract'];
const CANCEL_REASON_OPTIONS = (typeof PMO_RESOURCE_FLOW !== 'undefined' && PMO_RESOURCE_FLOW.DEFAULT_CANCEL_REASONS)
  ? PMO_RESOURCE_FLOW.DEFAULT_CANCEL_REASONS
  : [
      'Requirement changed',
      'Duplicate request',
      'Headcount / budget not approved',
      'Position no longer needed',
      'Candidate / resource unavailable',
      'Timeline postponed',
      'Other',
    ];
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
  { key:'pendingDocs',label:'Pending Docs', match:r=>r.status==='pendingDocs' },
  { key:'approved',   label:'Approved',     match:r=>r.status==='approved' },
  { key:'recruiting', label:'Recruiting',   match:r=>RECRUITING.includes(r.status) },
  { key:'filled',     label:'Filled',       match:r=>r.status==='filled' },
  { key:'closed',     label:'Filled',       match:r=>['resolved','mitigated'].includes(r.status) },
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
  pending:      { pmo:['pendingDocs','approved','cancelled'], user:['cancelled'] },
  pendingDocs:  { pmo:['approved','cancelled'] },
  approved:     { bbik:['sourcing'], pmo:['cancelled'] },
  sourcing:     { bbik:['interviewing'], pmo:['cancelled'] },
  interviewing: { bbik:['offer'], pmo:['cancelled'] },
  offer:        { bbik:['filled','interviewing','sourcing'], pmo:['cancelled'] },
  document:     { pmo:['filled'] },           // Orbit à¸¢à¸·à¸™à¸¢à¸±à¸™ onboard
  filled:       { pmo:['resolved'], user:['resolved'] },
  mitigated:    {},
  resolved:     {},
  cancelled:    {},
};


// BBIK à¹€à¸«à¹‡à¸™à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¸£à¸²à¸¢à¸à¸²à¸£à¸—à¸µà¹ˆà¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹à¸¥à¹‰à¸§à¸‚à¸¶à¹‰à¸™à¹„à¸› (cross-company isolation)
const BBIK_VISIBLE = ['approved','sourcing','interviewing','offer','filled'];


let _role = null;
let _userProject = null;
function organizationProjects() {
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const fromSettings = s?.projectMaster?.length
    ? s.projectMaster.filter(p => p.status === 'active').map(p => p.name || p.code).filter(Boolean)
    : (s?.projects || []);
  return [...new Set(fromSettings)].filter(Boolean);
}
function resourceLevels() {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const levels = Array.isArray(s?.resource?.levels) && s.resource.levels.length ? s.resource.levels : LEVEL_OPTS;
  return [...new Set(levels.map(l => String(l).trim()).filter(Boolean))];
}
function projectMasterItem(projectName) {
  const name = String(projectName || '').trim().toLowerCase();
  if(!name || typeof loadSettings !== 'function') return null;
  return (loadSettings().projectMaster || []).find(p =>
    String(p.name || '').trim().toLowerCase() === name ||
    String(p.code || '').trim().toLowerCase() === name
  ) || null;
}
function projectAccentColor(projectName) {
  if(window.PMO_RESOURCE_FLOW?.resolveProjectAccentColor) {
    return window.PMO_RESOURCE_FLOW.resolveProjectAccentColor(projectName, loadSettings().projectMaster || []);
  }
  const color = String(projectMasterItem(projectName)?.color || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#8dd7cf';
}
function projectTextColor(hex) {
  if(window.PMO_RESOURCE_FLOW?.projectTextColor) return window.PMO_RESOURCE_FLOW.projectTextColor(hex);
  const raw = String(hex || '').replace('#', '');
  if(!/^[0-9a-f]{6}$/i.test(raw)) return '#0f172a';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return ((r * 299 + g * 587 + b * 114) / 1000) > 150 ? '#0f172a' : '#fff';
}
function projectPill(projectName, label=projectName) {
  const color = projectAccentColor(projectName);
  return `<span class="badge" style="font-size:10px;background:${color};color:${projectTextColor(color)};border-color:${color};white-space:nowrap">${esc(label || '-')}</span>`;
}
function currentRequesterName() {
  const session = typeof pmoCurrentSession === 'function' ? pmoCurrentSession() : null;
  return String(session?.user?.name || '').trim();
}
function resProjects() {
  const fromMaster = organizationProjects();
  if(fromMaster.length) return fromMaster;
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  return [...new Set(s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'])];
}
function knownResourceProjects(records=[]) {
  return [...new Set([...resProjects(), ...(records||[]).map(r => r.project).filter(Boolean)])];
}
function normalizeProjectCode(row, index=0) {
  const code = String(row.code || row.projectCode || row['Project Code'] || '').trim();
  const project = String(row.project || row.Project || '').trim();
  const orgProject = typeof loadSettings === 'function'
    ? (loadSettings().projectMaster || []).find(p => String(p.name || '').toLowerCase() === project.toLowerCase() || String(p.code || '').toLowerCase() === project.toLowerCase())
    : null;
  return {
    id: String(row.id || code || `${project}-${index}`).replace(/\s+/g, '-'),
    organizationProjectId: String(row.organizationProjectId || row.organization_project_id || orgProject?.id || '').trim(),
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
function cleanResourceMasterId(value, fallback='') {
  const raw = String(value || '').trim();
  const source = raw || String(fallback || '').trim() || `RESOURCE-${Date.now().toString(36)}`;
  return source.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `RESOURCE-${Date.now().toString(36)}`;
}
function normalizeResourceMaster(row={}, index=0) {
  const employeeCode = String(row.employeeCode || row.employee_code || '').trim();
  const nameTh = String(row.resourceNameTh || row.resource_name_th || '').trim();
  const nameEn = String(row.resourceNameEn || row.resource_name_en || '').trim();
  const name = String(row.resourceName || row.resource_name || nameTh || nameEn || '').trim();
  return {
    id: cleanResourceMasterId(row.id || row.resourceMasterId || row.resource_master_id, employeeCode || name || index),
    employeeCode,
    resourceName: name,
    resourceNameTh: nameTh || name,
    resourceNameEn: nameEn,
    nickname: String(row.nickname || '').trim(),
    email: String(row.email || '').trim(),
    resourceTeam: String(row.resourceTeam || row.resource_team || '').trim(),
    position: String(row.position || '').trim(),
    level: String(row.level || '').trim(),
    employmentType: String(row.employmentType || row.employment_type || row.hiringType || row.hiring_type || '').trim(),
    sourceCompany: String(row.sourceCompany || row.source_company || row.transferFrom || row.transfer_from || '').trim(),
    currentProject: String(row.currentProject || row.current_project || row.project || '').trim(),
    status: String(row.status || row.resourceStatus || row.resource_status || 'active').trim().toLowerCase() || 'active',
    onboardDate: String(row.onboardDate || row.onboard_date || '').slice(0, 10),
    offboardDate: String(row.offboardDate || row.offboard_date || row.endDate || row.end_date || '').slice(0, 10),
    note: String(row.note || row.remark || '').trim(),
    requestId: String(row.requestId || row.request_id || '').trim(),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || new Date().toISOString(),
  };
}
function resourceMasterFromRequest(r) {
  const status = ['filled','mitigated'].includes(r.status) ? 'active' : ['resolved','cancelled'].includes(r.status) ? 'offboarded' : 'inactive';
  return normalizeResourceMaster({
    id: r.resourceMasterId || r.employeeCode || r.id,
    employeeCode: r.employeeCode,
    resourceName: r.resourceName,
    resourceNameTh: r.resourceNameTh,
    resourceNameEn: r.resourceNameEn,
    resourceTeam: r.resourceTeam,
    position: r.position,
    level: r.level,
    employmentType: r.hiringType,
    currentProject: r.project,
    status,
    onboardDate: canHaveOnboardDate(r.status) ? r.onboardDate : '',
    offboardDate: r.offboardDate || r.endDate,
    note: r.remark,
    requestId: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}
function resourceLikeFromMaster(m) {
  return {
    id: m.requestId || m.id,
    resourceMasterId: m.id,
    resourceTeam: m.resourceTeam,
    project: m.currentProject,
    position: m.position,
    level: m.level,
    hiringType: m.employmentType,
    status: m.status === 'active' ? 'filled' : m.status === 'offboarded' ? 'resolved' : 'pending',
    resourceName: m.resourceName,
    resourceNameTh: m.resourceNameTh,
    resourceNameEn: m.resourceNameEn,
    employeeCode: m.employeeCode,
    onboardDate: m.onboardDate,
    offboardDate: m.offboardDate,
    startDate: m.onboardDate,
    endDate: m.offboardDate,
    requestDate: m.onboardDate,
    resolvedDate: m.offboardDate,
    remark: m.note,
    projectCodes: [],
    allocationPercent: 100,
    requesterName: 'Employee Master',
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}
function loadResourceMaster() {
  if(_resourceMasterCache) return _resourceMasterCache;
  try {
    const raw = JSON.parse(localStorage.getItem(RESOURCE_MASTER_KEY)||'[]');
    _resourceMasterCache = Array.isArray(raw) ? raw.map(normalizeResourceMaster).filter(m => m.resourceName || m.employeeCode) : [];
  } catch(e) {
    _resourceMasterCache = [];
  }
  if(!_resourceMasterCache.length) {
    _resourceMasterCache = loadResources()
      .filter(r => employeeDirectoryName(r) || resourceEmployeeCode(r))
      .map(resourceMasterFromRequest);
    storeResourceMaster(_resourceMasterCache);
  }
  return _resourceMasterCache;
}
function storeResourceMaster(list) {
  const byKey = new Map();
  (list||[]).map(normalizeResourceMaster).filter(m => m.resourceName || m.employeeCode).forEach(m => {
    const key = m.employeeCode ? `emp:${m.employeeCode.toLowerCase()}` : `id:${m.id}`;
    const current = byKey.get(key);
    if(!current || String(m.updatedAt||'') >= String(current.updatedAt||'')) byKey.set(key, m);
  });
  _resourceMasterCache = [...byKey.values()];
  try { localStorage.setItem(RESOURCE_MASTER_KEY, JSON.stringify(_resourceMasterCache)); } catch(e) {}
}
async function loadResourceMasterAsync() {
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      const rows = await supaFetch('resource_master','GET',null,'?order=updated_at.desc&limit=1000');
      const remote = (rows||[]).map(normalizeResourceMaster);
      if(remote.length) {
        storeResourceMaster(remote);
        return _resourceMasterCache;
      }
    } catch(e) { console.warn('Resource master load failed; using local copy', e.message); }
  }
  return loadResourceMaster();
}
async function saveResourceMasterAsync(data) {
  const list = await loadResourceMasterAsync();
  const now = new Date().toISOString();
  const normalized = normalizeResourceMaster({ ...data, updatedAt: now });
  const exists = list.find(m => m.id === normalized.id || (normalized.employeeCode && m.employeeCode.toLowerCase() === normalized.employeeCode.toLowerCase()));
  const saved = { ...(exists||{}), ...normalized, createdAt: exists?.createdAt || normalized.createdAt || now, updatedAt: now };
  storeResourceMaster(exists ? list.map(m => (m.id === exists.id ? saved : m)) : [...list, saved]);
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      await supaFetch('resource_master','POST',{
        id: saved.id,
        employee_code: saved.employeeCode || null,
        resource_name: saved.resourceName || null,
        resource_name_th: saved.resourceNameTh || null,
        resource_name_en: saved.resourceNameEn || null,
        nickname: saved.nickname || null,
        email: saved.email || null,
        resource_team: saved.resourceTeam || null,
        position: saved.position || null,
        level: saved.level || null,
        employment_type: saved.employmentType || null,
        source_company: saved.sourceCompany || null,
        current_project: saved.currentProject || null,
        resource_status: ['active','inactive','offboarded'].includes(saved.status) ? saved.status : 'active',
        onboard_date: saved.onboardDate || null,
        offboard_date: saved.offboardDate || null,
        note: saved.note || null,
        created_at: saved.createdAt,
        updated_at: saved.updatedAt,
      },'?on_conflict=id');
    } catch(e) { console.warn('Resource master save failed; keeping local copy', e.message); }
  }
  return saved;
}
function activeProjectCodeMaster() {
  return loadProjectCodeMaster().filter(c => String(c.status||'').toLowerCase() === 'active');
}
function projectCodesForProject(project) {
  const selected = String(project || '').trim().toLowerCase();
  return activeProjectCodeMaster().filter(c => !selected || String(c.project || '').trim().toLowerCase() === selected);
}
function projectCodeOptionsForProject(project, selectedCode='') {
  const codes = projectCodesForProject(project);
  const selected = String(selectedCode || '').trim();
  const fallback = selected && !codes.some(c => c.code === selected)
    ? `<option value="${esc(selected)}" selected>${esc(selected)} / Current value</option>`
    : '';
  return fallback + codes.map(c => `<option value="${esc(c.code)}" ${selected===c.code?'selected':''}>${esc(c.code)}</option>`).join('');
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
  const session = typeof pmoCurrentSession === 'function' ? pmoCurrentSession() : null;
  const sessionRole = session?.role || '';
  if(sessionRole && resourceRoles()[sessionRole]) {
    _role = sessionRole;
    return _role;
  }
  if(_role) return _role;
  try { _role = localStorage.getItem(RES_ROLE_KEY) || 'pmo'; } catch(e) { _role = 'pmo'; }
  if(!resourceRoles()[_role]) _role = 'pmo';
  return _role;
}
function setRole(r) {
  if(!resourceRoles()[r]) return;
  _role = r;
  try { localStorage.setItem(RES_ROLE_KEY, r); } catch(e) {}
  if(typeof pmoSetSessionRole === 'function') pmoSetSessionRole(r);
  _resPage = 1;
  renderResource();
}
function currentUserProject() {
  const session = typeof pmoCurrentSession === 'function' ? pmoCurrentSession() : null;
  if(session?.project) {
    _userProject = session.project;
    return _userProject;
  }
  if(_userProject !== null) return _userProject;
  if(!_userProject) { const p = resProjects(); _userProject = p[0] || ''; }
  return _userProject;
}
function setUserProject(p) {
  _userProject = p;
  try { localStorage.setItem(RES_PROJECT_KEY, p); } catch(e) {}
  if(typeof pmoSetSessionProject === 'function') pmoSetSessionProject(p);
  _resPage = 1;
  renderResource();
}
function timelineMode() {
  try {
    const mode = localStorage.getItem(RES_TIMELINE_MODE_KEY) || 'all';
    return mode === 'project-code' ? 'project-code' : 'all';
  } catch(e) { return 'all'; }
}
function setTimelineMode(mode) {
  try { localStorage.setItem(RES_TIMELINE_MODE_KEY, mode === 'all' ? 'all' : 'project-code'); } catch(e) {}
  renderResource();
}
function timelineFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(RES_TIMELINE_FILTER_KEY) || '{}');
    return {
      project: String(raw.project || ''),
      role: String(raw.role || ''),
      type: String(raw.type || ''),
    };
  } catch(e) {
    return { project:'', role:'', type:'' };
  }
}
function setTimelineFilter(kind, value) {
  const filters = timelineFilters();
  filters[kind] = String(value || '');
  try { localStorage.setItem(RES_TIMELINE_FILTER_KEY, JSON.stringify(filters)); } catch(e) {}
  renderTimelineView(visibleToRole(loadResources(), currentRole()));
}
function clearTimelineFilters() {
  try { localStorage.removeItem(RES_TIMELINE_FILTER_KEY); } catch(e) {}
  renderTimelineView(visibleToRole(loadResources(), currentRole()));
}

function resourceSettings() {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  return s?.resource || null;
}
function resourceRoles() {
  const configured = resourceSettings()?.roles;
  if(configured) {
    const next = typeof structuredClone === 'function' ? structuredClone(configured) : JSON.parse(JSON.stringify(configured));
    if(next.bbik) {
      next.bbik.transitions = {
        ...(next.bbik.transitions || {}),
        approved:['sourcing','filled'],
        sourcing:['interviewing','offer','filled','approved'],
        interviewing:['offer','sourcing','filled'],
        offer:['filled','interviewing','sourcing'],
        filled:['offer','sourcing'],
        document:[],
      };
      next.bbik.tabs = (next.bbik.tabs || ['request']).filter(tab => tab !== 'dashboard');
    }
    if(next.user) next.user.tabs = (next.user.tabs || ['request']).filter(tab => tab !== 'dashboard');
    if(next.pmo) next.pmo.tabs = (next.pmo.tabs || ['request','people','timeline','transfer','code']).filter(tab => tab !== 'dashboard');
    return next;
  }
  if(window.PMO_RESOURCE_FLOW?.createDefaultResourceRoles) {
    return window.PMO_RESOURCE_FLOW.createDefaultResourceRoles(RES_ROLES);
  }
  return Object.fromEntries(Object.entries(RES_ROLES).map(([key, label]) => [key, {
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
    transitions: Object.fromEntries(Object.entries(STATUS_FLOW).map(([status, byRole]) => [status, byRole[key] || []])),
  }]));
}
function roleConfig(role=currentRole()) {
  return resourceRoles()[role] || resourceRoles().pmo || { label: RES_ROLES[role] || role, permissions: {}, transitions: {}, tabs: ['request'], scope: 'all' };
}
function roleLabel(role=currentRole()) {
  return roleConfig(role).label || RES_ROLES[role] || role;
}
function hasRolePermission(role, permission) {
  return !!roleConfig(role).permissions?.[permission];
}
function canViewResourceTab(role, tab) {
  const tabs = roleConfig(role).tabs || ['request'];
  return tabs.includes(tab);
}
// Allowed next statuses for a given (status, role)
function allowedNext(status, role) {
  if(window.PMO_RESOURCE_FLOW?.allowedNext) {
    return window.PMO_RESOURCE_FLOW.allowedNext(status, role, resourceRoles(), STATUS_FLOW, !!resourceSettings(), Object.keys(RES_STATUS));
  }
  const map = roleConfig(role).transitions || STATUS_FLOW[status] || {};
  if(Array.isArray(map[status])) return [...map[status]].filter(next => canUseStatusTransition(role, status, next));
  if(role === 'pmo' && !resourceSettings()) return Object.keys(RES_STATUS).filter(s => s !== status);
  const legacyMap = STATUS_FLOW[status] || {};
  if(!resourceSettings()) return legacyMap[role] ? [...legacyMap[role]].filter(next => canUseStatusTransition(role, status, next)) : [];
  return [];
}
function allowedStatusChoicesForRecord(record, role) {
  if(window.PMO_RESOURCE_FLOW?.allowedStatusChoicesForRecord) {
    return window.PMO_RESOURCE_FLOW.allowedStatusChoicesForRecord(record, role, resourceRoles(), {
      statusFlow: STATUS_FLOW,
      hasSettings: !!resourceSettings(),
      allStatuses: Object.keys(RES_STATUS),
    }).filter(s => RES_STATUS[s]);
  }
  const current = record?.status || '';
  let choices = allowedNextForRecord(record, role);
  if(role === 'pmo' || canApprove(role)) {
    choices = Object.keys(RES_STATUS).filter(s => s !== current && s !== 'document' && canUseStatusTransition(role, current, s));
  } else if(canRecruit(role)) {
    choices = ['approved','sourcing','interviewing','offer','filled']
      .filter(s => s !== current && canUseStatusTransition(role, current, s));
  }
  if(record?.status === 'pending') {
    choices = choices.filter(next => requiresPreApprovalDocs(record.hiringType) ? next !== 'approved' : next !== 'pendingDocs');
  }
  return [...new Set(choices)].filter(s => RES_STATUS[s]);
}
function canManageRequest(role) { return hasRolePermission(role, 'createRequest') || hasRolePermission(role, 'editPending'); }
function canEditPending(role)    { return hasRolePermission(role, 'editPending'); }
function canApprove(role)        { return hasRolePermission(role, 'approve'); }
function canRecruit(role)        { return hasRolePermission(role, 'recruit'); }
function canInternalOps(role)    { return hasRolePermission(role, 'transfer') || hasRolePermission(role, 'projectCode'); }
function canTransfer(role)       { return hasRolePermission(role, 'transfer'); }
function canProjectCode(role)    { return hasRolePermission(role, 'projectCode'); }
function canOffboard(role)       { return hasRolePermission(role, 'offboard'); }
function canDelete(role)         { return hasRolePermission(role, 'deleteRequest'); }
function canImportEmployees(role){ return hasRolePermission(role, 'importEmployees'); }
function canImportProjectCodes(role){ return hasRolePermission(role, 'importProjectCodes'); }
function canUseStatusTransition(role, fromStatus, toStatus) {
  if(window.PMO_RESOURCE_FLOW?.canUseStatusTransition) {
    return window.PMO_RESOURCE_FLOW.canUseStatusTransition(resourceRoles(), role, fromStatus, toStatus);
  }
  if(toStatus === 'approved') return canApprove(role) || (['sourcing','interviewing','offer'].includes(fromStatus) && canRecruit(role));
  if(['sourcing','interviewing','offer'].includes(toStatus)) return canRecruit(role) || canApprove(role);
  if(toStatus === 'filled') return canApprove(role) || hasRolePermission(role, 'resolveFilled') || canRecruit(role);
  if(toStatus === 'resolved') return hasRolePermission(role, 'resolveFilled');
  if(toStatus === 'cancelled') return hasRolePermission(role, 'cancelPending') || canApprove(role);
  return true;
}
function isTransfer(r)          { return !!r.transferFrom; }
function isRequestRecord(r) {
  return !isTransfer(r) && r.requesterName !== 'Employee Import';
}
function _legacyAllowedNext(status, role) {
  const map = STATUS_FLOW[status] || {};
  return map[role] ? [...map[role]] : [];
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
  if(window.PMO_RESOURCE_FLOW?.hiringKind) return window.PMO_RESOURCE_FLOW.hiringKind(value);
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
function resourceEndDate(r) {
  return isFixedTermHiring(r?.hiringType) ? (r?.endDate || '') : '';
}
function requiresPreApprovalDocs(value) {
  if(window.PMO_RESOURCE_FLOW?.requiresPreApprovalDocs) return window.PMO_RESOURCE_FLOW.requiresPreApprovalDocs(value);
  return ['direct', 'secondment'].includes(hiringKind(value));
}
function allowedNextForRecord(record, role) {
  if(window.PMO_RESOURCE_FLOW?.allowedNextForRecord) {
    return window.PMO_RESOURCE_FLOW.allowedNextForRecord(record, role, resourceRoles(), {
      statusFlow: STATUS_FLOW,
      hasSettings: !!resourceSettings(),
      allStatuses: Object.keys(RES_STATUS),
    });
  }
  const nexts = allowedNext(record?.status, role);
  if(!record || record.status !== 'pending') return nexts;
  const needsDocs = requiresPreApprovalDocs(record.hiringType);
  return nexts.filter(next => needsDocs ? next !== 'approved' : next !== 'pendingDocs');
}
function primaryAllocation(r) {
  const explicit = clampAlloc(r.allocationPercent);
  if(explicit > 0) return explicit;
  return Math.max(0, 100 - _allocUsed(r));
}
function primaryProjectCode(r) {
  return (r.primaryProjectCode || r.projectCode || '').trim();
}
function canHaveOnboardDate(status) {
  return ['filled','resolved','mitigated'].includes(String(status || ''));
}
function effectiveOnboardDate(r) {
  return canHaveOnboardDate(r?.status) ? (r?.onboardDate || '') : '';
}
function isPeriodActiveOn(startDate, endDate, asOf=todayISO) {
  if(window.PMO_RESOURCE_FLOW?.isPeriodActiveOn) return window.PMO_RESOURCE_FLOW.isPeriodActiveOn(startDate, endDate, asOf);
  const day = isoDay(asOf || todayISO);
  const start = isoDay(startDate);
  const end = isoDay(endDate);
  if(!day || !start) return false;
  return start <= day && (!end || end >= day);
}
function periodsOverlap(startA, endA, startB, endB) {
  const aStart = isoDay(startA);
  const bStart = isoDay(startB);
  if(!aStart || !bStart) return false;
  const aEnd = isoDay(endA) || '9999-12-31';
  const bEnd = isoDay(endB) || '9999-12-31';
  return aStart <= bEnd && bStart <= aEnd;
}
function isActiveResource(r) {
  return r.status === 'filled';
}
function isVisibleEmployeeMaster(master, related=[]) {
  const status = String(master?.status || 'active').toLowerCase();
  if(status === 'inactive') return false;
  return true;
}
function isOffboardedEmployeeMaster(master) {
  const status = String(master?.status || '').toLowerCase();
  const offboardDate = isoDay(master?.offboardDate);
  return status === 'offboarded' || (offboardDate && offboardDate <= isoDay(todayISO));
}
function employeeDirectoryStatusBadge(row) {
  const offboardDate = isoDay(row?.offboardDate);
  const isOffboarded = String(row?.status || '').toLowerCase() === 'offboarded' || (offboardDate && offboardDate <= isoDay(todayISO));
  if(isOffboarded) {
    const label = offboardDate ? `Offboard ${shortDate(offboardDate)}` : 'Offboarded';
    return `<span class="badge badge-gray" style="font-size:10px;white-space:nowrap">${esc(label)}</span>`;
  }
  return '<span class="badge badge-green" style="font-size:10px;white-space:nowrap">Active</span>';
}
function requiresCancelReason(toStatus) {
  return typeof PMO_RESOURCE_FLOW !== 'undefined' && PMO_RESOURCE_FLOW.requiresCancelReason
    ? PMO_RESOURCE_FLOW.requiresCancelReason(toStatus)
    : toStatus === 'cancelled';
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
  const activeOnly = !!opts.activeOnly;
  const asOf = opts.asOf || todayISO;
  return (list||[]).flatMap(r => {
    if(!includeInactive && !isActiveResource(r)) return [];
    if(includeInactive && !['filled','resolved','mitigated'].includes(r.status)) return [];
    const person = resourcePersonName(r);
    const active = isActiveResource(r);
    const baseEndDate = active ? (r.endDate || '') : (r.offboardDate || r.resolvedDate || r.endDate || '');
    const codeRows = (r.projectCodes||[]).map(c => ({
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
    })).filter(x => x.allocation > 0 && (!activeOnly || isPeriodActiveOn(x.startDate, x.endDate, asOf)));
    const primaryAlloc = activeOnly ? Math.max(0, 100 - codeRows.reduce((sum, c) => sum + clampAlloc(c.allocation), 0)) : primaryAllocation(r);
    const primaryRow = {
      requestId: r.id,
      person,
      employeeCode: resourceEmployeeCode(r),
      resourceTeam: r.resourceTeam,
      level: r.level,
      project: r.project,
      code: primaryProjectCode(r),
      allocation: primaryAlloc,
      startDate: r.onboardDate || r.startDate,
      endDate: baseEndDate,
      status: active ? 'active' : 'closed',
      source: isTransfer(r) ? 'Transfer' : 'Primary',
      note: r.remark || '',
    };
    const rows = (!activeOnly || isPeriodActiveOn(primaryRow.startDate, primaryRow.endDate, asOf)) ? [primaryRow, ...codeRows] : codeRows;
    return rows.filter(x => x.allocation > 0);
  });
}
function duplicateProjectCodeAssignment(resource, candidate, editIdx=-1) {
  const project = String(candidate.project || '').trim().toLowerCase();
  const code = String(candidate.code || '').trim().toLowerCase();
  return (resource.projectCodes || []).find((entry, idx) => {
    if(idx === editIdx) return false;
    return String(entry.project || '').trim().toLowerCase() === project
      && String(entry.code || '').trim().toLowerCase() === code
      && periodsOverlap(entry.startDate || entry.at, entry.endDate, candidate.startDate, candidate.endDate);
  });
}
function duplicateTransferAssignment(list, sourceId, destProject, startDate, endDate, editId='') {
  const source = (list||[]).find(r => r.id === sourceId);
  const emp = resourceEmployeeCode(source || {});
  const person = employeeDirectoryName(source || {}) || resourcePersonName(source || {});
  const dest = String(destProject || '').trim().toLowerCase();
  return (list||[]).find(r => {
    if(editId && r.id === editId) return false;
    if(r.status !== 'filled') return false;
    if(String(r.project || '').trim().toLowerCase() !== dest) return false;
    const samePerson = emp
      ? resourceEmployeeCode(r).toLowerCase() === emp.toLowerCase()
      : (employeeDirectoryName(r) || resourcePersonName(r)).toLowerCase() === String(person || '').toLowerCase();
    return samePerson && periodsOverlap(r.onboardDate || r.startDate, r.offboardDate || r.endDate, startDate, endDate);
  });
}
function activeProjectCodeAllocationTotal(codes, asOf=todayISO) {
  return (codes||[]).reduce((sum, code) => (
    isPeriodActiveOn(code.startDate || code.at, code.endDate, asOf)
      ? sum + clampAlloc(code.allocation)
      : sum
  ), 0);
}
function maxProjectCodeAllocationTotal(codes) {
  const days = [...new Set((codes||[]).flatMap(code => [isoDay(code.startDate || code.at), isoDay(code.endDate)].filter(Boolean)))];
  if(!days.length) return activeProjectCodeAllocationTotal(codes, todayISO);
  return Math.max(...days.map(day => activeProjectCodeAllocationTotal(codes, day)));
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
      remark: [l.cancelReason ? `Cancel: ${l.cancelReason}` : '', l.remark || ''].filter(Boolean).join(' / '),
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
function offboardedTimelinePersonKeys() {
  return new Set(loadResourceMaster()
    .filter(isOffboardedEmployeeMaster)
    .map(m => m.employeeCode || (m.resourceNameTh || m.resourceNameEn || m.resourceName || '').toLowerCase())
    .filter(Boolean));
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
function timelineItemGroups(list, mode='all') {
  const groups = new Map();
  const offboardedKeys = offboardedTimelinePersonKeys();
  (list||[]).forEach(r => {
    if(!['filled','resolved','mitigated'].includes(r.status)) return;
    const key = personKey(r);
    const forceClosed = offboardedKeys.has(key);
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
        status: !forceClosed && r.status === 'filled' ? 'active' : 'closed',
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
      status: !forceClosed && r.status === 'filled' ? 'active' : 'closed',
    }));
    if(!items.length) return;
    if(!groups.has(key)) {
      groups.set(key, {
        key,
        person: resourcePersonName(r),
        employeeCode: resourceEmployeeCode(r),
        position: r.position,
        team: r.resourceTeam,
        level: r.level,
        hiringType: r.hiringType,
        roleKey: window.PMO_RESOURCE_FLOW?.timelineRoleKey ? window.PMO_RESOURCE_FLOW.timelineRoleKey(r) : timelineRoleKey(r),
        employeeTypeKey: window.PMO_RESOURCE_FLOW?.employeeTypeKey ? window.PMO_RESOURCE_FLOW.employeeTypeKey(r.hiringType) : hiringKind(r.hiringType),
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
function timelineRoleKey(record) {
  const raw = [record?.resourceTeam, record?.position, record?.level].filter(Boolean).join(' ').toLowerCase();
  if(/\b(sa|system analyst|solution analyst)\b/.test(raw)) return 'sa';
  if(/\b(ba|business analyst)\b/.test(raw)) return 'ba';
  if(/\b(qa|qc|tester|test engineer)\b/.test(raw)) return 'qa';
  if(/\b(pm|pmo|project manager|scrum master)\b/.test(raw)) return 'pm';
  if(/\b(dev|developer|engineer|programmer|frontend|front-end|backend|back-end|fullstack|full stack|fe|be)\b/.test(raw)) return 'dev';
  return 'other';
}
function timelineRoleLabel(key) {
  return window.PMO_RESOURCE_FLOW?.timelineRoleLabel ? window.PMO_RESOURCE_FLOW.timelineRoleLabel(key) : ({ dev:'Dev', ba:'BA', sa:'SA', qa:'QA', pm:'PM/PMO', other:'Other' })[key] || key || 'Other';
}
function timelineTypeLabel(key) {
  return window.PMO_RESOURCE_FLOW?.employeeTypeLabel ? window.PMO_RESOURCE_FLOW.employeeTypeLabel(key) : ({ direct:'DHC', secondment:'SEC', subcon:'Sub Con', dhc:'DHC', sec:'SEC', other:'Other' })[key] || key || 'Other';
}
function timelineItemWindow(groups) {
  const starts = groups.flatMap(g => g.items.map(i => parseDay(i.startDate))).filter(Boolean);
  const ends = groups.flatMap(g => g.items.map(i => parseDay(i.endDate))).filter(Boolean);
  const now = new Date();
  const min = starts.length ? new Date(Math.min(...starts.map(d=>d.getTime()))) : now;
  const max = ends.length ? new Date(Math.max(...ends.map(d=>d.getTime()))) : addMonths(now, 6);
  return { start: monthStart(addMonths(min, -1)), end: monthEnd(addMonths(max > now ? max : now, 6)) };
}


function timelineYearWindow(year = _resTimelineYear) {
  const y = Number(year) || new Date().getFullYear();
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
}

function timelineItemOverlapsWindow(item, start, end) {
  const itemStart = parseDay(item.startDate);
  const itemEnd = parseDay(item.endDate) || end;
  if(!itemStart) return false;
  return itemStart <= end && itemEnd >= start;
}
function assignTimelineLanes(items) {
  if(window.PMO_RESOURCE_FLOW?.assignTimelineLanes) return window.PMO_RESOURCE_FLOW.assignTimelineLanes(items);
  const lanes = [];
  return (items||[]).map((item, index) => ({ ...item, _index:index }))
    .sort((a,b) => String(a.startDate||'').localeCompare(String(b.startDate||'')) || String(a.endDate||'').localeCompare(String(b.endDate||'')))
    .map(item => {
      const start = isoDay(item.startDate);
      const end = isoDay(item.endDate) || '9999-12-31';
      let lane = lanes.findIndex(laneEnd => laneEnd < start);
      if(lane < 0) { lane = lanes.length; lanes.push(end); }
      else lanes[lane] = end;
      return { ...item, lane, laneCount: lanes.length };
    })
    .sort((a,b) => a._index - b._index)
    .map(({ _index, ...item }) => ({ ...item, laneCount: lanes.length }));
}

function shiftResourceTimelineYear(delta) {
  _resTimelineYear += Number(delta) || 0;
  renderTimelineView(visibleToRole(loadResources(), currentRole()));
}

function resetResourceTimelineYear() {
  _resTimelineYear = new Date().getFullYear();
  renderTimelineView(visibleToRole(loadResources(), currentRole()));
}

function visibleToRole(list, role) {
  if(window.PMO_RESOURCE_FLOW?.visibleToRole) {
    return window.PMO_RESOURCE_FLOW.visibleToRole(list, role, resourceRoles(), currentUserProject());
  }
  const scope = roleConfig(role).scope;
  if(scope === 'bbik-pipeline') return list.filter(r => BBIK_VISIBLE.includes(r.status));
  if(scope === 'selected-project') { const p = currentUserProject(); return p ? list.filter(r => r.project === p) : list; }
  return list;
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
        cancelReason: r.cancel_reason,
        transferFrom: r.transfer_from, projectCodes: r.project_codes||[],
        resourceMasterId: r.resource_master_id,
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
  const existing = list.find(r => r.id === data.id);
  const isNew = !existing;
  const cleanData = canHaveOnboardDate(data.status) ? data : { ...data, onboardDate: null };
  const saved = { ...cleanData, updatedAt: now, createdAt: isNew ? now : (existing?.createdAt||now) };
  if((employeeDirectoryName(saved) || resourceEmployeeCode(saved)) && ['filled','resolved','mitigated'].includes(saved.status)) {
    const master = await saveResourceMasterAsync(resourceMasterFromRequest(saved));
    saved.resourceMasterId = master.id;
  }
  _resCache = isNew ? [...list, saved] : list.map(r => r.id===data.id ? saved : r);
  storeResources(_resCache);
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      const payload = {
        id: saved.id, resource_team: saved.resourceTeam, project: saved.project,
        position: saved.position, level: saved.level, hc: saved.hc,
        hiring_type: saved.hiringType, start_date: saved.startDate, end_date: saved.endDate||null,
        request_date: saved.requestDate, resolved_date: saved.resolvedDate||null,
        remark: saved.remark, status: saved.status, requester_name: saved.requesterName,
        cancel_reason: saved.cancelReason||null,
        transfer_from: saved.transferFrom||null, project_codes: saved.projectCodes||[],
        resource_master_id: saved.resourceMasterId||null,
        resource_name: saved.resourceName||null, resource_name_th: saved.resourceNameTh||null, resource_name_en: saved.resourceNameEn||null, employee_code: saved.employeeCode||null,
        primary_project_code: saved.primaryProjectCode||null,
        allocation_percent: saved.allocationPercent == null ? null : clampAlloc(saved.allocationPercent),
        onboard_date: saved.onboardDate||null, offboard_date: saved.offboardDate||null,
        activity_log: saved.activityLog||[],
        created_at: saved.createdAt, updated_at: saved.updatedAt,
      };
      for(;;) {
        try {
          await supaFetch('resource_requests','POST', payload, '?on_conflict=id');
          break;
        } catch(e) {
          const msg = String(e.message || '');
          if(msg.includes('resource_master_id') && Object.prototype.hasOwnProperty.call(payload, 'resource_master_id')) {
            delete payload.resource_master_id;
            continue;
          }
          if(msg.includes('cancel_reason') && Object.prototype.hasOwnProperty.call(payload, 'cancel_reason')) {
            delete payload.cancel_reason;
            continue;
          }
          throw e;
        }
      }
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

function resourceRowNoConfig() {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const pattern = String(s?.resource?.rowNoFormat || '{00}').trim() || '{00}';
  const rawStart = Number(s?.resource?.rowNoStart);
  const start = Number.isFinite(rawStart) && rawStart > 0 ? Math.floor(rawStart) : 1;
  return { pattern, start };
}

function formatResourceRowNo(index) {
  const { pattern, start } = resourceRowNoConfig();
  const n = start + Math.max(0, Number(index) || 0);
  let usedToken = false;
  const formatted = pattern.replace(/\{(0+|n)\}/i, (_, token) => {
    usedToken = true;
    return token.toLowerCase() === 'n' ? String(n) : String(n).padStart(token.length, '0');
  });
  return usedToken ? formatted : `${pattern}${n}`;
}

function employeeCodeFormatConfig(hiringType) {
  const kind = hiringKind(hiringType);
  if(kind === 'subcon') return null;
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const cfg = s?.resource?.employeeCodeFormats?.[kind];
  if(!cfg) return null;
  return {
    kind,
    format: String(cfg.format || (kind === 'secondment' ? 'SEC-{000}' : 'DHC-{000}')).trim(),
    start: Math.max(1, Math.floor(Number(cfg.start || 1))),
  };
}

function formatEmployeeCode(format, n) {
  const now = new Date();
  return String(format || '{000}')
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{(0+|n)\}/i, (_, token) => token.toLowerCase() === 'n' ? String(n) : String(n).padStart(token.length, '0'));
}

function nextEmployeeCode(hiringType) {
  const cfg = employeeCodeFormatConfig(hiringType);
  if(!cfg) return '';
  const existing = [...loadResources(), ...loadResourceMaster()]
    .map(r => resourceEmployeeCode(r) || r.employeeCode || '')
    .filter(Boolean);
  let n = cfg.start;
  let code = formatEmployeeCode(cfg.format, n);
  const seen = new Set(existing.map(x => x.toLowerCase()));
  while(seen.has(code.toLowerCase())) {
    n += 1;
    code = formatEmployeeCode(cfg.format, n);
  }
  return code;
}

function generateEmployeeCode(targetId='rf-employee-code', hiringId='rf-hiring') {
  const input = document.getElementById(targetId);
  const hiring = document.getElementById(hiringId)?.value || '';
  const code = nextEmployeeCode(hiring);
  if(!input || !code) return;
  input.value = code;
}

function resourceToast(message, type='info') {
  let toast = document.getElementById('resource-toast');
  if(!toast) {
    toast = document.createElement('div');
    toast.id = 'resource-toast';
    toast.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2400;max-width:min(420px,calc(100vw - 36px));padding:12px 14px;border-radius:10px;border:1px solid var(--border-md);background:var(--surface);color:var(--text);box-shadow:0 18px 48px rgba(15,23,42,.22);font-size:13px;font-weight:700;opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease';
    document.body.appendChild(toast);
  }
  const colors = { error:'var(--red)', ok:'var(--green)', info:'var(--blue)', warn:'var(--amber)' };
  toast.style.borderColor = `color-mix(in srgb,${colors[type] || colors.info} 38%,var(--border-md))`;
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  window.clearTimeout(window.__resourceToastTimer);
  window.__resourceToastTimer = window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, 3200);
}

function ensureResourceConfirmModal() {
  if(document.getElementById('resource-confirm-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'resource-confirm-modal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.42);z-index:2300;align-items:center;justify-content:center;padding:18px';
  modal.innerHTML = `
    <div class="card" style="width:420px;max-width:100%;padding:20px;border-radius:10px">
      <div id="resource-confirm-title" style="font-size:16px;font-weight:800;margin-bottom:8px">Confirm</div>
      <div id="resource-confirm-body" style="font-size:13px;color:var(--text-2);line-height:1.5;white-space:pre-wrap"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
        <button class="btn-ghost" id="resource-confirm-cancel" type="button">Cancel</button>
        <button class="btn-primary" id="resource-confirm-ok" type="button">OK</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function resourceConfirm(title, message, okText='OK', danger=false) {
  ensureResourceConfirmModal();
  const modal = document.getElementById('resource-confirm-modal');
  document.getElementById('resource-confirm-title').textContent = title;
  document.getElementById('resource-confirm-body').textContent = message;
  const ok = document.getElementById('resource-confirm-ok');
  const cancel = document.getElementById('resource-confirm-cancel');
  ok.textContent = okText;
  ok.style.background = danger ? 'var(--red)' : '';
  ok.style.borderColor = danger ? 'var(--red)' : '';
  modal.style.display = 'flex';
  return new Promise(resolve => {
    const done = value => {
      modal.style.display = 'none';
      ok.onclick = null;
      cancel.onclick = null;
      modal.onclick = null;
      resolve(value);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    modal.onclick = event => { if(event.target === modal) done(false); };
  });
}

function resourceError(message) { resourceToast(message, 'error'); }


// â”€â”€ Main render â”€â”€
let _resPage = 1;
const RES_PER_PAGE = 20;
let _resSortCol = 'requestDate';
let _resSortAsc = false;
let _resTab  = 'request';   // request | people | timeline | allocation | transfer | code | movement
let _resView = 'all';       // chip key (request tab)
let _resTimelineYear = new Date().getFullYear();


// â”€â”€ Table columns (config-driven: à¸«à¸±à¸§à¸•à¸²à¸£à¸²à¸‡ + à¹à¸–à¸§ à¹ƒà¸Šà¹‰à¸•à¸±à¸§à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™) â”€â”€
// à¹€à¸žà¸´à¹ˆà¸¡ / à¸¥à¸š / à¸‹à¹ˆà¸­à¸™ à¸„à¸­à¸¥à¸±à¸¡à¸™à¹Œà¸—à¸µà¹ˆà¸™à¸µà¹ˆà¸—à¸µà¹ˆà¹€à¸”à¸µà¸¢à¸§ â€” à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹à¸à¹‰ <thead> à¹ƒà¸™ index.html
function resColumns() {
  const C = [];
  if(showRequestId()) C.push({ key:'id', label:'ID', th:'padding-left:12px',
    cell:r=>`<span style="font-family:monospace;font-size:11px;color:var(--text-3)">${esc(r.id)}</span>` });
  C.push(
    { key:'no',       label:'No.', th:'padding-left:12px;width:86px', td:'padding-left:12px', cell:(r, ctx)=>`<span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text-2);font-weight:700">${esc(formatResourceRowNo(ctx?.index || 0))}</span>` },
    { key:'project',  label:'Project', cell:r=>`${projectPill(r.project)}${(r.projectCodes||[]).length?` <span class="badge badge-teal" style="font-size:9px">+${(r.projectCodes||[]).length} code</span>`:''}${isTransfer(r)?` <span class="badge badge-blue" style="font-size:9px">transfer</span>`:''}` },
    { key:'position', label:'Position', cell:r=>esc(r.position) },
    { key:'level',    label:'Level', cell:r=>`<span class="badge badge-gray" style="font-size:10px">${esc(r.level)}</span>` },
    { key:'hiring',   label:'Employment Type', cell:r=>{ const m=hiringMeta(r.hiringType); return `<span class="badge ${m.cls}" style="font-size:9px">${esc(m.label)}</span>`; } },
    { key:'start',    label:'Start', cell:r=>`<span style="font-size:11px">${r.startDate?shortDate(r.startDate):'-'}</span>` },
    { key:'end',      label:'End', cell:r=>`<span style="font-size:11px">${resourceEndDate(r)?shortDate(resourceEndDate(r)):'-'}</span>` },
    { key:'reqdate',  label:'Request Date', cell:r=>`<span style="font-size:11px">${r.requestDate?shortDate(r.requestDate):'-'}</span>` },
    { key:'requester', label:'Requester', cell:r=>`<span style="font-size:11px">${esc(r.requesterName||'-')}</span>` },
    { key:'onboard', label:'Onboard Date', cell:r=>`<span style="font-size:11px">${effectiveOnboardDate(r)?shortDate(effectiveOnboardDate(r)):'-'}</span>` },
    { key:'updated',  label:'Updated', cell:r=>`<span style="font-size:11px;color:var(--text-3)">${r.updatedAt?shortDate(String(r.updatedAt).slice(0,10)):'-'}</span>` },
    { key:'status',   label:'Status', cell:r=>{ const s=RES_STATUS[r.status]||{label:r.status,cls:'badge-gray'}; return `<span class="badge ${s.cls}" style="font-size:10px;white-space:nowrap">${esc(s.label)}</span>`; } },
    { key:'action',   label:'', th:'text-align:center', td:'text-align:center', cell:r=>`<button class="btn-sm" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="event.stopPropagation();openResDetail('${r.id}')" title="Manage">Manage</button>` },
  );
  return C;
}


async function renderResource() {
  ensureResChrome();
  const [all] = await Promise.all([loadResourcesAsync(), loadResourceMasterAsync()]);
  _renderResourceUI(all);
}

function renderResourceSearch() {
  window.clearTimeout(window.__resourceSearchTimer);
  window.__resourceSearchTimer = window.setTimeout(renderResourceSearchNow, 140);
}

function renderResourceSearchNow() {
  _resPage = 1;
  _renderResourceUI(loadResources(), { preserveResourceFilters: true, suppressRowEnter: true });
}


function setResTab(t)  { _resTab = t; _resPage = 1; _renderResourceUI(loadResources()); }
function setResView(v) { _resView = v; _resPage = 1; _renderResourceUI(loadResources()); }


const RES_FILTER_STATE = {
  request: { status:[], hiring:[], project:[], level:[] },
  people: { project:[], position:[], level:[], type:[] },
};

function resourceFilterDefinitions(scoped) {
  if(_resTab === 'people') {
    const projects = [...new Set((scoped||[]).flatMap(r => (r.projects||[]).map(p => p.project)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const positions = [...new Set((scoped||[]).map(r => r.position).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const levels = [...new Set((scoped||[]).map(r => r.level).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    return {
      project: {
        label: 'Project',
        options: projects.map(value => ({ value, label:value, match:r=>(r.projects||[]).some(p => p.project === value) })),
      },
      position: {
        label: 'Position',
        options: positions.map(value => ({ value, label:value, match:r=>r.position === value })),
      },
      level: {
        label: 'Level',
        options: levels.map(value => ({ value, label:value, match:r=>r.level === value })),
      },
      type: {
        label: 'Type',
        options: [
          { value:'dhc', label:'DHC', match:r=>r.employeeType === 'dhc' },
          { value:'sec', label:'SEC', match:r=>r.employeeType === 'sec' },
          { value:'subcon', label:'Sub Con', match:r=>r.employeeType === 'subcon' },
        ],
      },
    };
  }
  const projects = knownResourceProjects(scoped).sort((a,b)=>a.localeCompare(b));
  const levels = [...new Set([...resourceLevels(), ...scoped.map(r => r.level)].filter(Boolean))];
  return {
    status: {
      label: 'Status',
      options: RES_VIEWS.filter(v => v.key !== 'all').map(v => ({ value:v.key, label:v.label, match:v.match })),
    },
    hiring: {
      label: 'Hiring Type',
      options: Object.entries(HIRING_TYPE_META).map(([value, meta]) => ({ value, label:meta.label, match:r=>hiringKind(r.hiringType) === value })),
    },
    project: {
      label: 'Project',
      options: projects.map(value => ({ value, label:value, match:r=>r.project === value })),
    },
    level: {
      label: 'Level',
      options: levels.map(value => ({ value, label:value, match:r=>r.level === value })),
    },
  };
}

function resourceFilterSelected(kind) {
  const stateKey = _resTab === 'people' ? 'people' : 'request';
  return RES_FILTER_STATE[stateKey]?.[kind] || [];
}

function resourceFilterSummary(kind, def) {
  const selected = resourceFilterSelected(kind);
  return selected.length ? `${def.label} ${selected.length} selected` : `${def.label} All`;
}

function closeResourceFilterMenus() {
  document.querySelectorAll('.res-filter-menu.open').forEach(el => el.classList.remove('open'));
}

function keepResourceFilterMenuOpen(kind) {
  const menu = document.querySelector(`.res-filter-menu[data-kind="${kind}"]`);
  if(menu) menu.classList.add('open');
}

function refreshResourceDropdownFilters(scoped) {
  const el = document.getElementById('res-filter-dropdowns');
  if(!el || !el.children.length) return renderResourceDropdownFilters(scoped);
  const defs = resourceFilterDefinitions(scoped);
  Object.entries(defs).forEach(([kind, def]) => {
    const menu = el.querySelector(`.res-filter-menu[data-kind="${kind}"]`);
    if(!menu) return;
    const selected = new Set(resourceFilterSelected(kind).map(String));
    const summary = menu.querySelector('.res-filter-trigger span');
    const clearIcon = menu.querySelector('.res-filter-trigger b');
    if(summary) summary.textContent = resourceFilterSummary(kind, def);
    if(clearIcon) {
      clearIcon.innerHTML = selected.size ? '&times;' : '&#9662;';
      clearIcon.setAttribute('onclick', selected.size ? `event.stopPropagation();clearResourceFilter('${kind}')` : '');
    }
    const counts = new Map(def.options.map(opt => [String(opt.value), scoped.filter(opt.match).length]));
    menu.querySelectorAll('input[type="checkbox"][data-value]').forEach(input => {
      input.checked = selected.has(input.dataset.value);
      const countEl = input.closest('.res-filter-option')?.querySelector('em');
      if(countEl && counts.has(input.dataset.value)) countEl.textContent = counts.get(input.dataset.value);
    });
  });
  return defs;
}

function animateResourceFilterOption(input) {
  const option = input?.closest?.('.res-filter-option');
  if(!option) return;
  option.classList.remove('is-toggled');
  void option.offsetWidth;
  option.classList.add('is-toggled');
  window.setTimeout(() => option.classList.remove('is-toggled'), 320);
}

function toggleResourceFilterMenu(kind, ev) {
  ev?.stopPropagation();
  const menu = document.querySelector(`.res-filter-menu[data-kind="${kind}"]`);
  const open = menu?.classList.contains('open');
  closeResourceFilterMenus();
  if(menu && !open) menu.classList.add('open');
}

function setResourceFilter(kind, value, checked, input) {
  const stateKey = _resTab === 'people' ? 'people' : 'request';
  const set = new Set(resourceFilterSelected(kind));
  checked ? set.add(value) : set.delete(value);
  RES_FILTER_STATE[stateKey][kind] = [...set];
  _resPage = 1;
  _renderResourceUI(loadResources(), { preserveResourceFilters: true });
  keepResourceFilterMenuOpen(kind);
  animateResourceFilterOption(input);
}

function clearResourceFilter(kind) {
  const stateKey = _resTab === 'people' ? 'people' : 'request';
  RES_FILTER_STATE[stateKey][kind] = [];
  _resPage = 1;
  _renderResourceUI(loadResources(), { preserveResourceFilters: true });
  keepResourceFilterMenuOpen(kind);
}

function selectAllResourceFilter(kind, values) {
  const stateKey = _resTab === 'people' ? 'people' : 'request';
  RES_FILTER_STATE[stateKey][kind] = [...values];
  _resPage = 1;
  _renderResourceUI(loadResources(), { preserveResourceFilters: true });
  keepResourceFilterMenuOpen(kind);
}

function applyResourceDropdownFilters(list, defs) {
  return Object.entries(defs).reduce((rows, [kind, def]) => {
    const selected = new Set(resourceFilterSelected(kind));
    if(!selected.size) return rows;
    return rows.filter(r => def.options.some(opt => selected.has(opt.value) && opt.match(r)));
  }, list);
}

function renderResourceDropdownFilters(scoped) {
  const el = document.getElementById('res-filter-dropdowns');
  if(!el) return {};
  const defs = resourceFilterDefinitions(scoped);
  el.innerHTML = Object.entries(defs).map(([kind, def]) => {
    const selected = new Set(resourceFilterSelected(kind));
    const values = def.options.map(o => o.value);
    const rows = def.options.map(opt => {
      const count = scoped.filter(opt.match).length;
      const on = selected.has(opt.value);
      const safeValue = esc(JSON.stringify(String(opt.value)));
      return `
        <label class="res-filter-option">
          <input type="checkbox" data-value="${esc(String(opt.value))}" ${on?'checked':''} onchange="setResourceFilter('${kind}', ${safeValue}, this.checked, this)">
          <span>${esc(opt.label)}</span>
          <em>${count}</em>
        </label>`;
    }).join('');
    const safeValues = esc(JSON.stringify(values));
    return `
      <div class="res-filter-menu" data-kind="${kind}" onclick="event.stopPropagation()">
        <button class="res-filter-trigger" onclick="toggleResourceFilterMenu('${kind}', event)" type="button">
          <span>${esc(resourceFilterSummary(kind, def))}</span>
          <b onclick="${selected.size ? `event.stopPropagation();clearResourceFilter('${kind}')` : ''}">${selected.size ? '&times;' : '&#9662;'}</b>
        </button>
        <div class="res-filter-popover">
          <div class="res-filter-actions">
            <button type="button" onclick="selectAllResourceFilter('${kind}', ${safeValues})">Select all</button>
            <button type="button" onclick="clearResourceFilter('${kind}')">Clear</button>
          </div>
          <div class="res-filter-options">${rows || '<div class="res-filter-empty">No values</div>'}</div>
        </div>
      </div>`;
  }).join('');
  return defs;
}


function ensureResChrome() {
  if(document.getElementById('res-chrome')) return;
  const view = document.getElementById('view-resource');
  if(!view) return;
  if(!window.__resourceTimelineShiftWheelBound) {
    window.__resourceTimelineShiftWheelBound = true;
    document.addEventListener('wheel', event => {
      const wrap = event.target?.closest?.('.res-timeline-wrap');
      if(!wrap || !event.shiftKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault();
      wrap.scrollLeft += delta;
    }, { passive:false });
  }
  if(!document.getElementById('res-timeline-style')) {
    const st = document.createElement('style');
    st.id = 'res-timeline-style';
    st.textContent = `
      .res-timeline-cell{display:block;width:100%;max-width:100%;padding:0!important;border-bottom:none!important;overflow:hidden;--timeline-person-width:190px;--timeline-grid-min-width:864px}
      .res-timeline-toolbar{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-bottom:10px}
      .res-timeline-toolbar-controls{display:grid;grid-template-columns:minmax(190px,1fr) minmax(118px,.65fr) minmax(118px,.65fr) auto;gap:8px;align-items:center;justify-self:end;width:min(820px,100%)}
      .res-timeline-toolbar-select{width:100%;min-width:0;font-size:11px;padding:5px 8px}
      .res-timeline-table,.res-timeline-table tbody,.res-timeline-table tbody>tr{display:block!important;width:100%!important;max-width:100%!important}
      .res-timeline-wrap{width:100%;max-width:100%;overflow:auto;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);max-height:calc(100vh - 300px);overscroll-behavior-x:contain;touch-action:pan-x pan-y}
      .res-timeline-head,.res-timeline-row{display:flex;width:100%;min-width:calc(var(--timeline-person-width) + var(--timeline-grid-min-width))}
      .res-timeline-head{position:sticky;top:0;z-index:3;background:var(--surface);border-bottom:1px solid var(--border)}
      .res-timeline-person{width:var(--timeline-person-width);min-width:var(--timeline-person-width);padding:6px 9px;border-right:1px solid var(--border);background:var(--surface);position:sticky;left:0;z-index:2}
      .res-timeline-head-left{font-size:9px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;z-index:4}
      .res-timeline-months{display:grid;grid-template-columns:repeat(var(--timeline-month-count),minmax(0,1fr));min-height:24px;background:var(--surface);min-width:var(--timeline-grid-min-width);flex:1 0 var(--timeline-grid-min-width)}
      .res-timeline-month{border-left:1px solid var(--border);padding:4px 3px;text-align:center;font-size:9px;font-weight:800;color:var(--text-2);text-transform:uppercase;line-height:1.1}
      .res-timeline-track{position:relative;min-height:38px;background-image:linear-gradient(to right,var(--border) 1px,transparent 1px);background-color:var(--surface-2,var(--bg));min-width:var(--timeline-grid-min-width);flex:1 0 var(--timeline-grid-min-width)}
      .res-timeline-row{border-bottom:1px solid var(--border)}
      .res-timeline-row.is-offboarded .res-timeline-person{background:color-mix(in srgb,var(--surface) 72%,#94a3b8)}
      .res-timeline-row.is-offboarded .res-timeline-track{background-color:color-mix(in srgb,var(--surface-2,var(--bg)) 76%,#94a3b8)}
      .res-timeline-row:last-child{border-bottom:none}
      .res-timeline-bar{position:absolute;top:7px;height:22px;border:none;border-radius:5px;color:white;text-align:left;padding:3px 5px;overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.12)}
      .res-timeline-bar.is-offboarded{background:#94a3b8!important;color:#fff!important;box-shadow:none}
      .res-timeline-bar span{display:block;font-size:9px;font-weight:800;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .res-timeline-bar small{display:block;font-size:8px;line-height:1.1;margin-top:2px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .res-timeline-person-name{font-size:11px;font-weight:800;color:var(--text);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .res-timeline-person-meta{font-size:9px;color:var(--text-3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .res-timeline-person-badge{margin-top:3px}.res-timeline-person-badge .badge{font-size:8px;padding:2px 6px}
      .res-timeline-tools{display:flex;align-items:center;gap:6px}.res-timeline-scroll-btn{height:28px;min-width:30px;padding:0 9px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;font-weight:800;cursor:pointer}.res-timeline-scroll-btn:hover{border-color:var(--blue);color:var(--blue);background:var(--blue-50)}
      .res-request-filters{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-2px 0 10px;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm)}
      .res-request-filters-title{font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap}
      #res-filter-dropdowns{display:flex;gap:6px;flex-wrap:wrap}
      .res-filter-menu{position:relative}
      .res-filter-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;min-width:126px;height:34px;padding:0 9px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}
      .res-filter-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .res-filter-trigger b{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--text-3);font-size:13px;line-height:1}
      .res-filter-menu.open .res-filter-trigger{border-color:var(--blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}
      .res-filter-popover{display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:45;width:232px;max-width:78vw;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);box-shadow:0 14px 34px rgba(15,23,42,.18);overflow:hidden}
      .res-filter-menu.open .res-filter-popover{display:block}
      .res-filter-actions{display:flex;align-items:center;justify-content:space-between;padding:8px 9px;border-bottom:1px solid var(--border);background:var(--bg)}
      .res-filter-actions button{border:0;background:transparent;color:var(--blue);font-family:inherit;font-size:11px;font-weight:800;cursor:pointer}
      .res-filter-options{max-height:246px;overflow:auto;padding:5px}
      .res-filter-option{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:7px;padding:7px;border-radius:6px;font-size:12px;cursor:pointer;transition:background .16s ease,transform .16s ease,color .16s ease}
      .res-filter-option:hover{background:var(--bg);transform:translateY(-1px)}
      .res-filter-option.is-toggled{animation:res-filter-tick .3s cubic-bezier(.2,.8,.2,1)}
      .res-filter-option input{width:14px;height:14px;accent-color:var(--blue);transition:transform .16s ease,box-shadow .18s ease}
      .res-filter-option input:checked{transform:scale(1.08);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 16%,transparent)}
      .res-filter-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .res-filter-option em{font-style:normal;color:var(--text-3);font-size:11px}
      .res-filter-empty{padding:12px;color:var(--text-3);font-size:12px;text-align:center}
      .res-cell-clip{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @keyframes res-filter-tick{0%{transform:scale(.985);background:color-mix(in srgb,var(--blue) 10%,transparent)}55%{transform:scale(1.018);background:color-mix(in srgb,var(--blue) 14%,transparent)}100%{transform:scale(1);background:transparent}}
      #view-resource{background:color-mix(in srgb,var(--surface) 96%,transparent);border:1px solid var(--border-md);border-radius:8px;padding:0 12px 12px;box-shadow:0 14px 42px rgba(0,0,0,.12);overflow:visible}
      #res-chrome{margin:0 -12px 12px;padding:0;background:color-mix(in srgb,var(--surface-2) 84%,var(--surface));border-bottom:1px solid var(--border-md);border-radius:8px 8px 0 0}
      #res-session-panel{position:relative;margin:0;padding:0;background:transparent;border:0;box-shadow:none;overflow-x:auto}
      .res-basebar{display:flex;align-items:flex-end;gap:2px;min-height:40px;padding:0;white-space:nowrap}
      #res-tab-bar{display:flex;align-items:flex-end;gap:0;min-width:0}
      .res-tab{height:40px;padding:0 15px!important;border:1px solid transparent!important;border-bottom:0!important;border-radius:7px 7px 0 0!important;background:rgba(148,163,184,.10)!important;color:color-mix(in srgb,var(--text-2) 66%,transparent)!important;font-size:12px;font-weight:800!important;box-shadow:none!important;position:relative;opacity:.68}
      .res-tab:first-child{border-top-left-radius:8px!important}
      .res-tab:hover{background:rgba(148,163,184,.18)!important;color:var(--text)!important;opacity:1}
      .res-tab.is-active{background:#fff!important;color:#0f172a!important;border-color:rgba(255,255,255,.92)!important;box-shadow:0 -1px 0 #fff inset,0 -2px 0 var(--blue),0 8px 20px rgba(0,0,0,.18)!important;opacity:1}
      .res-tab.is-active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:#fff}
      :root:not([data-theme="dark"]) .res-tab.is-active{background:#fff!important;color:#111827!important}
      :root[data-theme="dark"] #res-chrome{background:#151515;border-bottom-color:rgba(255,255,255,.16)}
      :root[data-theme="dark"] .res-tab{background:rgba(255,255,255,.055)!important;color:rgba(244,244,245,.58)!important}
      :root[data-theme="dark"] .res-tab:hover{background:rgba(255,255,255,.11)!important;color:#fff!important}
      :root[data-theme="dark"] .res-tab.is-active{background:#e5e7eb!important;color:#0b0f16!important;border-color:#e5e7eb!important;box-shadow:0 -1px 0 #e5e7eb inset,0 -2px 0 var(--blue),0 8px 20px rgba(0,0,0,.38)!important}
      :root[data-theme="dark"] .res-tab.is-active::after{background:#e5e7eb}
      #res-kpi{padding-top:0;margin-bottom:12px!important}
      #res-kpi .res-kpi-card{min-height:86px;border-radius:7px;box-shadow:none;border-color:var(--border);background:var(--surface)}
      #res-status-panel{margin:0 -12px 0;padding:8px 12px;background:color-mix(in srgb,var(--surface) 96%,transparent);border:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);border-radius:0}
      #view-resource>.filter-row{margin:0 -12px 10px!important;padding:9px 12px;background:color-mix(in srgb,var(--surface) 96%,transparent);border-bottom:1px solid var(--border);display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:nowrap!important}
      #view-resource>.filter-row #res-search{flex:1 1 360px;min-width:220px!important;height:34px}
      #view-resource>.filter-row .btn-export,#view-resource>.filter-row .btn-primary{flex:0 0 auto}
      #view-resource>.filter-row .btn-primary{margin-left:0!important}
      #view-resource>.filter-row #res-f-status,#view-resource>.filter-row #res-f-hiring,#view-resource>.filter-row #res-f-project,#view-resource>.filter-row #res-f-level{display:none!important}
      #view-resource>.card{border-radius:7px;margin:0}
      #res-pagination{padding:10px 0 0!important}
      .res-form-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .res-form-grid-3 .ri{width:100%}
      @media (max-width:980px){.res-form-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media (max-width:640px){.res-form-grid-3{grid-template-columns:1fr!important}}
      @media (max-width:1100px){.res-timeline-toolbar{justify-content:stretch}.res-timeline-toolbar-controls{width:100%}}
      @media (max-width:820px){.res-timeline-cell{--timeline-person-width:150px;--timeline-grid-min-width:864px}.res-timeline-toolbar{align-items:start}.res-timeline-toolbar-controls{grid-template-columns:1fr 1fr}.res-timeline-tools{grid-column:1/-1;justify-content:flex-start}.res-timeline-wrap{max-height:none}.res-request-filters{align-items:flex-start}#res-filter-dropdowns{width:100%}.res-filter-menu{flex:1 1 180px}.res-filter-trigger{width:100%}#view-resource>.filter-row{flex-wrap:wrap!important}#view-resource>.filter-row #res-search{flex-basis:100%}}
    `;
    document.head.appendChild(st);
  }
  const wrap = document.createElement('div');
  wrap.id = 'res-chrome';
  wrap.innerHTML = `
    <div id="res-session-panel">
      <div class="res-basebar">
        <div id="res-tab-bar">
          <button class="btn-sm res-tab" data-tab="request" onclick="setResTab('request')">Request</button>
          <button class="btn-sm res-tab" data-tab="people" onclick="setResTab('people')">Employee Directory</button>
          <button class="btn-sm res-tab" data-tab="timeline" onclick="setResTab('timeline')">Timeline</button>
          <button class="btn-sm res-tab" data-tab="transfer" onclick="setResTab('transfer')">Employee Assignment</button>
          <button class="btn-sm res-tab" data-tab="code" onclick="setResTab('code')">Project Code</button>
        </div>
      </div>
    </div>`;
  view.insertBefore(wrap, view.firstChild);

  const kpiEl = document.getElementById('res-kpi');
  if(kpiEl && !document.getElementById('res-status-panel')) {
    const statusPanel = document.createElement('div');
    statusPanel.id = 'res-status-panel';
    statusPanel.className = 'res-request-filters';
    statusPanel.innerHTML = `
      <div id="res-filter-dropdowns"></div>`;
    kpiEl.insertAdjacentElement('afterend', statusPanel);
  }

  ['res-f-status','res-f-hiring','res-f-project','res-f-level'].forEach(id => {
    const sel = document.getElementById(id);
    if(sel) {
      sel.dataset.nativeSelect = 'true';
      sel.style.display = 'none';
      const enhanced = sel.closest('.pmo-select');
      if(enhanced) enhanced.style.display = 'none';
    }
  });
}

function renderResourceTable(cols, rows, emptyMsg) {
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;
  const table = tbody.closest('table');
  if(table) {
    table.classList.remove('res-timeline-table');
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

function resourceSearchTextForRecord(r) {
  const projectCodes = (r.projectCodes||[]).map(c => `${c.project || ''} ${c.code || ''} ${c.allocation || ''}`).join(' ');
  return `${r.project || ''} ${r.position || ''} ${r.level || ''} ${r.hiringType || ''} ${resourcePersonName(r)} ${resourceEmployeeCode(r)} ${primaryProjectCode(r)} ${projectCodes}`.toLowerCase();
}

function applyResourceSearch(list) {
  const search = (document.getElementById('res-search')?.value || '').trim().toLowerCase();
  if(!search) return list || [];
  return (list || []).filter(r => resourceSearchTextForRecord(r).includes(search));
}

function resourceWorkflowOwner(status) {
  if(status === 'pending') return 'PMO';
  if(status === 'pendingDocs') return 'PMO / HR docs';
  if(status === 'approved') return 'BBIK';
  if(RECRUITING.includes(status)) return 'BBIK';
  if(status === 'document') return 'PMO / HR';
  if(status === 'offer') return 'BBIK';
  if(status === 'filled') return 'PMO monitor';
  if(['resolved','mitigated','cancelled'].includes(status)) return 'Closed';
  return 'PMO';
}

function resourceDashboardAgeDays(r) {
  const d = parseDay(r.updatedAt || r.requestDate || r.createdAt);
  if(!d) return 0;
  return daysBetween(d, new Date());
}

function renderResourceDashboard(base) {
  const requestRows = (base || []).filter(isRequestRecord);
  const queueStatuses = ['pending','pendingDocs','approved','sourcing','interviewing','offer','document'];
  const queue = requestRows
    .filter(r => queueStatuses.includes(r.status))
    .sort((a,b) => resourceDashboardAgeDays(b) - resourceDashboardAgeDays(a));
  const filledMonth = new Date().toISOString().slice(0, 7);
  const metrics = [
    { label:'Pending PMO', value:requestRows.filter(r => r.status === 'pending').length, color:'var(--text-2)', note:'New requests' },
    { label:'Pending Docs', value:requestRows.filter(r => r.status === 'pendingDocs').length, color:'var(--amber)', note:'External HR docs' },
    { label:'BBIK Queue', value:requestRows.filter(r => ['approved','sourcing','interviewing','offer'].includes(r.status)).length, color:'var(--blue)', note:'Recruiting' },
    { label:'Ready to Fill', value:requestRows.filter(r => ['offer','document'].includes(r.status)).length, color:'var(--green)', note:'Confirm onboard' },
    { label:'Onboarded This Month', value:requestRows.filter(r => r.status === 'filled' && String(r.resolvedDate || r.onboardDate || '').startsWith(filledMonth)).length, color:'var(--green)', note:'Filled' },
    { label:'Closed / Cancelled', value:requestRows.filter(r => ['resolved','mitigated','cancelled'].includes(r.status)).length, color:'var(--text-3)', note:'Archive' },
  ];
  const byStatus = RES_VIEWS.filter(v => v.key !== 'all').map(v => ({
    label: v.label,
    count: requestRows.filter(v.match).length,
  }));
  const rowsHtml = queue.slice(0, 12).map(r => {
    const s = RES_STATUS[r.status] || { label:r.status, cls:'badge-gray' };
    const age = resourceDashboardAgeDays(r);
    return `
      <tr style="cursor:pointer" onclick="openResDetail('${esc(r.id)}')">
        <td style="padding-left:14px;font-family:'IBM Plex Mono',monospace;font-size:11px">${esc(r.id)}</td>
        <td><strong>${esc(r.position || '-')}</strong><div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(r.project || '-')}</div></td>
        <td><span class="badge ${s.cls}" style="font-size:9px">${esc(s.label)}</span></td>
        <td>${esc(resourceWorkflowOwner(r.status))}</td>
        <td>${esc(hiringMeta(r.hiringType).label)}</td>
        <td>${age ? `${age}d` : '-'}</td>
        <td>${esc(r.requestDate ? shortDate(r.requestDate) : '-')}</td>
      </tr>`;
  }).join('');
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;
  const table = tbody.closest('table');
  if(table) {
    table.classList.remove('res-timeline-table');
    table.style.display = '';
    table.style.width = '100%';
    table.style.minWidth = '';
    let thead = table.querySelector('thead');
    if(!thead) { thead = document.createElement('thead'); table.insertBefore(thead, table.firstChild); }
    thead.innerHTML = '';
  }
  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="padding:0;border-bottom:0">
        <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:12px">
          ${metrics.map(m => `
            <div class="metric-card" style="margin:0">
              <div class="metric-label">${esc(m.label)}</div>
              <div class="metric-val" style="color:${m.color}">${m.value}</div>
              <div class="metric-sub">${esc(m.note)}</div>
            </div>`).join('')}
        </div>
        <div class="card" style="padding:12px;margin:0 0 12px">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px">Status Mix</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${byStatus.map(x => `<span class="badge badge-gray" style="font-size:10px">${esc(x.label)}: ${x.count}</span>`).join('')}
          </div>
        </div>
        <div class="card" style="padding:0;margin:0;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border)">
            <div style="font-size:13px;font-weight:800">Action Queue</div>
            <div style="font-size:11px;color:var(--text-3)">Older updates first</div>
          </div>
          <table class="hist-table" style="width:100%">
            <thead><tr>
              <th style="padding-left:14px;width:12%">Request ID</th>
              <th>Role / Project</th>
              <th style="width:12%">Status</th>
              <th style="width:13%">Owner</th>
              <th style="width:11%">Type</th>
              <th style="width:8%">Age</th>
              <th style="width:11%">Request Date</th>
            </tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-3)">No open resource actions.</td></tr>`}</tbody>
          </table>
        </div>
      </td>
    </tr>`;
  const pagEl = document.getElementById('res-pagination');
  if(pagEl) pagEl.innerHTML = `<span style="font-size:12px;color:var(--text-3)">${queue.length} open action items</span>`;
}

function renderPeopleView(base) {
  const masters = loadResourceMaster();
  const masterRows = masters.length
    ? masters.map(m => {
      const matches = (base||[]).filter(r =>
        (r.resourceMasterId && r.resourceMasterId === m.id) ||
        (m.employeeCode && resourceEmployeeCode(r).toLowerCase() === m.employeeCode.toLowerCase()) ||
        (!m.employeeCode && employeeDirectoryName(r) && employeeDirectoryName(r).toLowerCase() === (m.resourceName || m.resourceNameTh || m.resourceNameEn || '').toLowerCase())
      );
      const related = matches.length ? matches : [resourceLikeFromMaster(m)];
      return { master:m, related, requestId: matches[0]?.id || '' };
    }).filter(row => isVisibleEmployeeMaster(row.master, row.related))
    : base.filter(r => isActiveResource(r) && (employeeDirectoryName(r) || resourceEmployeeCode(r))).map(r => ({ master:resourceMasterFromRequest(r), related:[r], requestId:r.id }));

  const rows = masterRows.map(({ master, related, requestId }) => {
    const allocs = allocationRows(related, { includeInactive:true, activeOnly:true, asOf:todayISO });
    const allocationByProject = [...allocs.reduce((map, a) => {
      const key = a.project || '-';
      map.set(key, (map.get(key) || 0) + clampAlloc(a.allocation));
      return map;
    }, new Map()).entries()].map(([project, allocation]) => ({ project, allocation: Math.min(100, allocation) }));
    return {
      requestId,
      personTh: master.resourceNameTh || master.resourceName,
      personEn: master.resourceNameEn,
      employeeCode: master.employeeCode,
      position: master.position || '',
      level: master.level || '',
      team: master.resourceTeam || '',
      employeeType: window.PMO_RESOURCE_FLOW?.employeeTypeKey ? window.PMO_RESOURCE_FLOW.employeeTypeKey(master.employmentType) : hiringKind(master.employmentType),
      projects: allocationByProject,
      totalAllocation: allocationByProject.reduce((sum,a)=>sum+a.allocation,0),
      startDate: master.onboardDate,
      offboardDate: master.offboardDate,
      status: master.status,
    };
  }).sort((a,b)=>String(a.personTh||a.personEn).localeCompare(String(b.personTh||b.personEn)));
  const filterDefs = renderResourceDropdownFilters(rows);
  const filteredRows = applyResourceDropdownFilters(rows, filterDefs);
  renderResourceTable([
    { label:'Employee Code', th:'width:118px', cell:r=>`<span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text-2);font-weight:700">${esc(r.employeeCode||'-')}</span>` },
    { label:'ชื่อ-นามสกุล', th:'width:17%', cell:r=>`<strong class="res-cell-clip" title="${esc(r.personTh||'-')}">${esc(r.personTh||'-')}</strong>` },
    { label:'Name - Surname', th:'width:17%', cell:r=>r.personEn ? `<span class="res-cell-clip" title="${esc(r.personEn)}">${esc(r.personEn)}</span>` : '<span style="color:var(--text-3)">-</span>' },
    { label:'Position', th:'width:15%', cell:r=>`<span class="res-cell-clip" title="${esc(r.position||'-')}">${esc(r.position||'-')}</span>` },
    { label:'Level', th:'width:72px', cell:r=>r.level ? `<span class="badge badge-gray" style="font-size:10px">${esc(r.level)}</span>` : '-' },
    { label:'Current Allocation', th:'width:25%', cell:r=>r.projects.length ? `<span class="res-cell-clip">${r.projects.map(a=>projectPill(a.project, `${a.project}: ${a.allocation}%`)).join(' ')}</span>` : '-' },
    { label:'Status', th:'width:128px', cell:r=>employeeDirectoryStatusBadge(r) },
  ], filteredRows, 'No employee records match the selected filters.');
}

function renderTimelineView(base) {
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;
  const table = tbody.closest('table');
  const mode = 'all';
  const filters = timelineFilters();
  const allGroups = timelineItemGroups(base, mode);
  const projectOptions = [...new Set(allGroups.flatMap(g => g.items.map(item => item.project)).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
  const roleOptions = [...new Set(allGroups.map(g => g.roleKey).filter(Boolean))].sort();
  const typeOptions = [...new Set(allGroups.map(g => g.employeeTypeKey).filter(Boolean))].sort();
  const filteredAllGroups = window.PMO_RESOURCE_FLOW?.applyTimelineFilters
    ? window.PMO_RESOURCE_FLOW.applyTimelineFilters(allGroups, filters)
    : allGroups.flatMap(g => {
      if(filters.role && g.roleKey !== filters.role) return [];
      if(filters.type && g.employeeTypeKey !== filters.type) return [];
      const items = filters.project ? g.items.filter(item => item.project === filters.project) : g.items;
      return items.length ? [{ ...g, items }] : [];
    });
  const { start, end } = timelineYearWindow(_resTimelineYear);
  const groups = filteredAllGroups
    .map(g => ({ ...g, items: assignTimelineLanes(g.items.filter(item => timelineItemOverlapsWindow(item, start, end))) }))
    .filter(g => g.items.length);
  const months = timelineMonths(start, end);
  const totalDays = Math.max(1, daysBetween(start, end));

  if(table) {
    table.classList.add('res-timeline-table');
    table.querySelector('thead')?.remove();
    table.style.display = 'block';
    table.style.width = '100%';
  }

  const monthHead = months.map(m => {
    const label = m.toLocaleDateString('en-US', { month:'short', year:'2-digit' });
    return `<div class="res-timeline-month">${esc(label)}</div>`;
  }).join('');

  const optionHtml = (items, selected, labelFn=x=>x) => items.map(value =>
    `<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(labelFn(value))}</option>`
  ).join('');
  const hasTimelineFilters = !!(filters.project || filters.role || filters.type);

  const rows = groups.map(g => {
    const primaryType = g.hiringType;
    const meta = hiringMeta(primaryType);
    const laneCount = Math.max(1, ...g.items.map(item => Number(item.lane || 0) + 1));
    const isOffboardedRow = g.items.length > 0 && g.items.every(item => item.status === 'closed');
    const segments = g.items.map(item => {
      const period = { start: parseDay(item.startDate), end: parseDay(item.endDate) || end, hasPlannedEnd: !!item.endDate };
      if(!period.start) return '';
      const segStart = period.start < start ? start : period.start;
      const segEnd = period.end > end ? end : period.end;
      const left = daysBetween(start, segStart) / totalDays * 100;
      const width = Math.max(1.2, daysBetween(segStart, segEnd) / totalDays * 100);
      const isClosed = item.status === 'closed';
      const color = isClosed ? '#94a3b8' : projectAccentColor(item.project);
      const textColor = isClosed ? '#fff' : projectTextColor(color);
      const top = 7 + (Number(item.lane || 0) * 26);
      const state = isClosed ? 'Offboarded/Closed' : 'Active';
      const title = `${g.person} | ${item.project} | ${isoDay(item.startDate)} - ${item.endDate ? isoDay(item.endDate) : 'ongoing'} | ${item.source} | ${state}`;
      return `<button class="res-timeline-bar ${isClosed?'is-offboarded':''}" onclick="event.stopPropagation();openResDetail('${item.requestId}')" title="${esc(title)}" style="left:${left}%;width:${width}%;top:${top}px;background:${color};color:${textColor}">
        <span>${esc(item.project || '-')}</span>
        <small>${esc([item.code, `${item.allocation}%`, item.source, isClosed ? 'Closed' : ''].filter(Boolean).join(' / '))}</small>
      </button>`;
    }).join('');
    return `<div class="res-timeline-row ${isOffboardedRow?'is-offboarded':''}">
      <div class="res-timeline-person">
        <div class="res-timeline-person-name">${esc(g.person || '-')}</div>
        <div class="res-timeline-person-meta">${esc([g.employeeCode, g.level].filter(Boolean).join(' / ') || '-')}</div>
        <div class="res-timeline-person-badge"><span class="badge ${meta.cls}">${esc(meta.label)}</span></div>
      </div>
      <div class="res-timeline-track" style="min-height:${Math.max(38, laneCount * 28 + 8)}px;background-size:calc(100% / ${months.length}) 100%">
        ${segments || '<span style="font-size:12px;color:var(--text-3);padding:12px;display:inline-block">No dated assignment</span>'}
      </div>
    </div>`;
  }).join('');

  tbody.innerHTML = `<tr><td class="res-timeline-cell" style="--timeline-month-count:${months.length}">
    <div class="res-timeline-toolbar">
      <div class="res-timeline-toolbar-controls">
        <select class="ri res-timeline-toolbar-select" onchange="setTimelineFilter('project', this.value)" title="Filter by project">
          <option value="">Project All</option>
          ${optionHtml(projectOptions, filters.project)}
        </select>
        <select class="ri res-timeline-toolbar-select" onchange="setTimelineFilter('role', this.value)" title="Filter by role">
          <option value="">Role All</option>
          ${optionHtml(roleOptions, filters.role, timelineRoleLabel)}
        </select>
        <select class="ri res-timeline-toolbar-select" onchange="setTimelineFilter('type', this.value)" title="Filter by employee type">
          <option value="">Type All</option>
          ${optionHtml(typeOptions, filters.type, timelineTypeLabel)}
        </select>
        <div class="res-timeline-tools" aria-label="Timeline horizontal scroll controls">
          <button type="button" class="res-timeline-scroll-btn" onclick="shiftResourceTimelineYear(-1)" title="Previous year">&larr;</button>
          <span style="font-size:12px;font-weight:800;color:var(--text);min-width:42px;text-align:center">${_resTimelineYear}</span>
          <button type="button" class="res-timeline-scroll-btn" onclick="shiftResourceTimelineYear(1)" title="Next year">&rarr;</button>
          <button type="button" class="res-timeline-scroll-btn" onclick="resetResourceTimelineYear()" title="Current year">Today</button>
          ${hasTimelineFilters?`<button type="button" class="res-timeline-scroll-btn" onclick="clearTimelineFilters()" title="Clear filters">Clear</button>`:''}
        </div>
      </div>
    </div>
    <div class="res-timeline-wrap">
      <div class="res-timeline-head">
        <div class="res-timeline-person res-timeline-head-left">Resource</div>
        <div class="res-timeline-months">${monthHead}</div>
      </div>
      ${rows || `<div style="padding:34px;text-align:center;color:var(--text-3);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm)">No assignments match the selected timeline filters in ${_resTimelineYear}.</div>`}
    </div>
  </td></tr>`;

  const pagEl = document.getElementById('res-pagination');
  if(pagEl) pagEl.innerHTML = `<span style="font-size:12px;color:var(--text-3)">${groups.length} people in ${_resTimelineYear} / ${allGroups.length} timeline people</span>`;
}

function scrollResourceTimeline(direction) {
  const wrap = document.querySelector('.res-timeline-wrap');
  if(!wrap) return;
  const step = Math.max(220, Math.floor(wrap.clientWidth * 0.72));
  wrap.scrollBy({ left: direction * step, behavior: 'smooth' });
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
    { label:'Action', td:'text-align:center;white-space:nowrap', cell:r=> {
      const role = currentRole();
      if(r.kind === 'Project Code') return canProjectCode(role)
        ? `<button class="btn-sm" onclick="event.stopPropagation();openTransferEntry('', '${r.requestId}', 'code', '${r.codeIndex}')">Edit</button> <button class="btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deleteProjectCode('${r.requestId}', ${r.codeIndex})">Delete</button>`
        : '<span style="font-size:11px;color:var(--text-3)">View only</span>';
      return canTransfer(role)
        ? `<button class="btn-sm" onclick="event.stopPropagation();openTransferEntry('${r.requestId}', '', 'transfer')">Edit</button> ${canDelete(role)?`<button class="btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deleteResource('${r.requestId}')">Delete</button>`:''}`
        : '<span style="font-size:11px;color:var(--text-3)">View only</span>';
    } },
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
    { label:'Project', cell:r=>`<strong>${esc(r.project||'-')}</strong>${r.type?`<div style="font-size:11px;color:var(--text-3)">${esc(r.type)}</div>`:''}` },
    { label:'Project Code', cell:r=>esc(r.code||'-') },
    { label:'Start', cell:r=>`<span style="font-size:11px">${r.startDate?shortDate(String(r.startDate).slice(0,10)):'-'}</span>` },
    { label:'End', cell:r=>`<span style="font-size:11px">${r.endDate?shortDate(String(r.endDate).slice(0,10)):'-'}</span>` },
    { label:'Status', cell:r=>`<span class="badge ${String(r.status).toLowerCase()==='active'?'badge-green':'badge-amber'}">${esc(r.status||'-')}</span>` },
    { label:'PM Owner', cell:r=>esc(r.pmOwner||'-') },
    { label:'Action', td:'text-align:center;white-space:nowrap', cell:r=> canProjectCode(currentRole()) ? `<button class="btn-sm" onclick="event.stopPropagation();openProjectCodeMasterEntry('${esc(r.id)}')">Edit</button> <button class="btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deleteProjectCodeMaster('${esc(r.id)}')">Delete</button>` : '<span style="font-size:11px;color:var(--text-3)">View only</span>' },
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
        <div class="fg"><label>Project *</label><select id="pcm-project" class="ri"></select></div>
        <div class="fg"><label>Type</label><input id="pcm-type" class="ri" autocomplete="off" placeholder="Type"></div>
        <div class="fg"><label>Project Code *</label><input id="pcm-code" class="ri" autocomplete="off" placeholder="Project Code"></div>
        <div class="fg"><label>Start</label><input id="pcm-start" class="ri" type="date"></div>
        <div class="fg"><label>End</label><input id="pcm-end" class="ri" type="date"></div>
        <div class="fg"><label>Status</label><select id="pcm-status" class="ri"><option>Active</option><option>Pending</option><option>Inactive</option></select></div>
        <div class="fg"><label>PM Owner</label><input id="pcm-owner" class="ri" autocomplete="off" placeholder="PM Owner"></div>
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
  if(!canProjectCode(currentRole())) { resourceError(`${roleLabel(currentRole())} cannot manage Project Code master data.`); return; }
  ensureProjectCodeMasterModal();
  const list = loadProjectCodeMaster();
  const existing = id ? list.find(c => c.id === id) : null;
  document.getElementById('pcm-title').textContent = existing ? 'Edit Project Code' : 'New Project Code';
  document.getElementById('pcm-id').value = existing?.id || '';
  const projectSelect = document.getElementById('pcm-project');
  const projectOptions = knownResourceProjects(existing?.project ? [{ project: existing.project }] : []).map(p => `<option value="${esc(p)}" ${existing?.project===p?'selected':''}>${esc(p)}</option>`).join('');
  projectSelect.innerHTML = `<option value="">- Select project -</option>${projectOptions}`;
  projectSelect.value = existing?.project || '';
  document.getElementById('pcm-type').value = existing?.type || '';
  document.getElementById('pcm-code').value = existing?.code || '';
  document.getElementById('pcm-start').value = existing?.startDate || '';
  document.getElementById('pcm-end').value = existing?.endDate || '';
  document.getElementById('pcm-status').value = existing?.status || 'Active';
  document.getElementById('pcm-owner').value = existing?.pmOwner || '';
  pmoMotionShow(document.getElementById('project-code-master-modal'));
}
function closeProjectCodeMasterEntry() {
  const m = document.getElementById('project-code-master-modal');
  pmoMotionHide(m);
}
function saveProjectCodeMasterEntry() {
  const id = document.getElementById('pcm-id')?.value || '';
  const list = loadProjectCodeMaster();
  const existing = id ? list.find(c => c.id === id) : null;
  const project = document.getElementById('pcm-project')?.value?.trim() || '';
  const code = document.getElementById('pcm-code')?.value?.trim() || '';
  const startDate = document.getElementById('pcm-start')?.value || '';
  const endDate = document.getElementById('pcm-end')?.value || '';
  if(!project || !code) { resourceError('Project and Project Code are required.'); return; }
  if(endDate && startDate && endDate < startDate) { resourceError('End Date must be after Start Date.'); return; }
  const saved = normalizeProjectCode({
    ...(existing||{}),
    id: existing?.id || code.replace(/\s+/g, '-'),
    no: existing?.no || String((list.length || 0) + 1).padStart(2, '0'),
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

async function deleteProjectCodeMaster(id) {
  if(!canProjectCode(currentRole())) { resourceError(`${roleLabel(currentRole())} cannot manage Project Code master data.`); return; }
  const list = loadProjectCodeMaster();
  const item = list.find(c => c.id === id);
  if(!item) return;
  const ok = await resourceConfirm('Delete project code?', `${item.code} (${item.project})`, 'Delete', true);
  if(!ok) return;
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

function _renderResourceUI(allRaw, options = {}) {
  const role = currentRole();
  if(_resTab === 'allocation' || _resTab === 'movement') _resTab = 'timeline';


  // â”€â”€ Sync tab bar â”€â”€
  if(!canViewResourceTab(role, _resTab)) _resTab = (roleConfig(role).tabs || ['request'])[0] || 'request';
  document.querySelectorAll('#res-tab-bar .res-tab').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    btn.style.display = canViewResourceTab(role, tab) ? '' : 'none';
    const on = tab === _resTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', String(on));
  });


  // â”€â”€ Visibility + tab/request filters â”€â”€
  let scoped = visibleToRole(allRaw, role);
  const statusPanel = document.getElementById('res-status-panel');


  if(_resTab === 'transfer') {
    if(statusPanel) statusPanel.style.display = 'none';
    scoped = scoped.filter(isTransfer);
  } else if(_resTab === 'code') {
    if(statusPanel) statusPanel.style.display = 'none';
    scoped = scoped.filter(r => (r.projectCodes||[]).length > 0);
  } else if(_resTab === 'people') {
    if(statusPanel) {
      statusPanel.style.display = '';
      const title = statusPanel.querySelector('.res-request-filters-title');
      if(title) title.textContent = 'Employee Filters';
    }
  } else if(['dashboard','timeline','allocation','movement'].includes(_resTab)) {
    if(statusPanel) statusPanel.style.display = 'none';
  } else {
    if(statusPanel) statusPanel.style.display = '';
    const title = statusPanel.querySelector('.res-request-filters-title');
    if(title) title.textContent = 'Filters';
    scoped = scoped.filter(isRequestRecord);
    const filterDefs = options.preserveResourceFilters
      ? refreshResourceDropdownFilters(scoped)
      : renderResourceDropdownFilters(scoped);
    scoped = applyResourceDropdownFilters(scoped, filterDefs);
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
  if(kpiEl) {
    const cards = role === 'bbik'
      ? [
          ['BBIK Queue', requestBase.filter(r => r.status === 'approved').length, 'var(--blue)', 'Approved'],
          ['Recruiting', recr, 'var(--amber)', 'Active pipeline'],
          ['Filled', requestBase.filter(r => r.status === 'filled').length, 'var(--green)', 'Completed by BBIK'],
        ]
      : [
          ['Total Open', open, 'var(--blue)', ''],
          ['Pending Approval', pending, 'var(--text-2)', ''],
          ['Recruiting (BBIK)', recr, 'var(--amber)', ''],
          ['Filled This Month', thisMonth, 'var(--green)', ''],
          ['Direct HC', direct, 'var(--green)', 'Permanent'],
          ['Secondment', secondment, 'var(--blue)', 'Fixed term'],
          ['Sub Con', subcon, 'var(--amber)', 'Fixed term'],
        ];
    kpiEl.innerHTML = cards.map(([label,value,color,note]) => `
      <div class="metric-card res-kpi-card"><div class="metric-label">${esc(label)}</div><div class="metric-val" style="color:${color}">${value}</div>${note?`<div class="metric-sub">${esc(note)}</div>`:''}</div>
    `).join('');
  }


  // New Request â€” à¹€à¸‰à¸žà¸²à¸° role à¸—à¸µà¹ˆà¸ªà¸£à¹‰à¸²à¸‡à¹„à¸”à¹‰ à¹à¸¥à¸°à¹€à¸‰à¸žà¸²à¸°à¹à¸—à¹‡à¸š Request
  const newBtn = document.querySelector('#view-resource .filter-row .btn-primary');
  const employeeImportBtns = ['res-employee-template-btn','res-employee-import-btn'].map(id => document.getElementById(id)).filter(Boolean);
  const projectCodeImportBtns = ['res-project-code-template-btn','res-project-code-import-btn'].map(id => document.getElementById(id)).filter(Boolean);
  employeeImportBtns.forEach(btn => { btn.style.display = (_resTab === 'people' && canImportEmployees(role)) ? '' : 'none'; });
  projectCodeImportBtns.forEach(btn => { btn.style.display = (_resTab === 'code' && canImportProjectCodes(role)) ? '' : 'none'; });
  if(newBtn) {
    const canCreateOperational = (_resTab === 'transfer' && canTransfer(role)) || (_resTab === 'code' && canProjectCode(role));
    newBtn.style.display = (hasRolePermission(role, 'createRequest') && _resTab==='request') || canCreateOperational ? '' : 'none';
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

  if(_resTab === 'dashboard') {
    renderResourceDashboard(base);
    return;
  }
  const searchedBase = applyResourceSearch(base);
  if(_resTab === 'transfer') {
    renderTransferView(searchedBase);
    return;
  }
  if(_resTab === 'code') {
    renderProjectCodeView(searchedBase);
    return;
  }
  if(_resTab === 'people') {
    renderPeopleView(searchedBase);
    return;
  }
  if(_resTab === 'timeline') {
    renderTimelineView(searchedBase);
    return;
  }
  if(_resTab === 'allocation') {
    renderAllocationView(searchedBase);
    return;
  }
  if(_resTab === 'movement') {
    renderMovementView(searchedBase);
    return;
  }


  // â”€â”€ Search (facet dropdowns are rendered above the table) â”€â”€
  let list = applyResourceSearch(scoped);


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
  if(options.suppressRowEnter) tbody.dataset.motionSuppress = 'true';


  const table = tbody.closest('table');
  if(table) {
    table.classList.remove('res-timeline-table');
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
    tbody.innerHTML = slice.map((r, rowIndex) => {
      const absoluteIndex = ((_resPage - 1) * RES_PER_PAGE) + rowIndex;
      return `<tr style="cursor:pointer" onclick="openResDetail('${r.id}')">${cols.map(c=>`<td style="${c.td||''}">${c.cell(r, { index:absoluteIndex, rowIndex })}</td>`).join('')}</tr>`;
    }
    ).join('');
  }
  if(options.suppressRowEnter) requestAnimationFrame(() => { delete tbody.dataset.motionSuppress; });


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
  const isEdit = !!id;
  const r = isEdit ? loadResources().find(x => x.id===id) : null;
  if(isEdit && !canEditPending(role)) { resourceError(`${roleLabel(role)} cannot edit pending requests.`); return; }
  if(!isEdit && !hasRolePermission(role, 'createRequest')) { resourceError(`${roleLabel(role)} cannot create requests.`); return; }
  // User à¸ªà¸£à¹‰à¸²à¸‡/à¹à¸à¹‰à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¹‚à¸„à¸£à¸‡à¸à¸²à¸£à¸•à¸±à¸§à¹€à¸­à¸‡
  const projects = role==='user' ? [currentUserProject()] : resProjects();
  const defProject = r?.project || (role==='user' ? currentUserProject() : '');
  const projectOpts = projects.map(p=>`<option value="${esc(p)}" ${defProject===p?'selected':''}>${esc(p)}</option>`).join('');
  const primaryCodeOptions = projectCodeOptionsForProject(defProject, r?.primaryProjectCode || '');


  document.getElementById('res-modal-title').textContent = isEdit ? 'Edit Resource Request' : 'New Resource Request';
  document.getElementById('res-edit-id').value = id||'';
  const g = (fld,def='') => r ? (r[fld]||def) : def;
  const requesterDefault = g('requesterName', currentRequesterName());
  const levelOptions = resourceLevels();
  const codeDefault = g('employeeCode', nextEmployeeCode(g('hiringType', HIRING_OPTS[0])));


  document.getElementById('res-form-body').innerHTML = `
    <div class="form-grid res-form-grid-3" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
      <div class="fg"><label>Project *</label><select id="rf-project" class="ri" onchange="syncRequestProjectCodeChoices()" ${role==='user'?'disabled title="Requester can create requests only for the selected project"':''}>${role==='user'?'':'<option value="">- Select project -</option>'}${projectOpts}</select></div>
      <div class="fg"><label>Project Code</label><select id="rf-primary-code" class="ri" onchange="applyRequestProjectCode()"><option value="">${defProject ? '- Select project code -' : 'Select Project first'}</option>${primaryCodeOptions}</select></div>
      <div class="fg"><label>Position *</label><input id="rf-position" class="ri" autocomplete="off" placeholder="e.g. Senior Backend Developer" value="${esc(g('position'))}"></div>
      <div class="fg"><label>Level *</label><select id="rf-level" class="ri">${levelOptions.map(l=>`<option ${g('level')===l?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="fg"><label>Employment Type *</label><select id="rf-hiring" class="ri" onchange="toggleEndDateRequired()">
        ${HIRING_OPTS.map(h=>`<option ${hiringKind(g('hiringType'))===hiringKind(h)?'selected':''}>${h}</option>`).join('')}
      </select><div id="rf-hiring-help" style="font-size:10px;color:var(--text-3);line-height:1.35"></div></div>
      <div class="fg"><label>Start Date *</label><input id="rf-start" class="ri" type="date" value="${g('startDate')}"></div>
      <div class="fg" id="rf-end-wrap"><label id="rf-end-label">End Date</label><input id="rf-end" class="ri" type="date" value="${g('endDate')}"></div>
      <div class="fg"><label>Requester Name *</label><input id="rf-requester" class="ri" required autocomplete="off" placeholder="Requester name" value="${esc(requesterDefault)}"></div>
      <div class="fg"><label>Request Date</label><input id="rf-reqdate" class="ri" type="date" value="${g('requestDate', todayISO)}" readonly title="Locked to the date this request was created" style="background:var(--bg);cursor:default"></div>
      <div class="fg"><label>Primary Allocation %</label><input id="rf-allocation" class="ri" type="number" min="1" max="100" value="${esc(String(g('allocationPercent', 100)))}"></div>
      <div class="fg" id="rf-employee-code-wrap"><label>Reserved Employee Code</label><input id="rf-employee-code" class="ri" value="${esc(codeDefault)}" readonly style="background:var(--bg);cursor:default" placeholder="Auto for DHC / SEC"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label><textarea id="rf-remark" class="ri" rows="3" placeholder="Remark / reason">${esc(g('remark'))}</textarea></div>`;


  toggleEndDateRequired();
  syncRequestProjectCodeChoices(false);
  pmoMotionShow(document.getElementById('resource-modal'));
}

function syncRequestProjectCodeChoices(clearInvalid=true) {
  const project = document.getElementById('rf-project')?.value || currentUserProject();
  const select = document.getElementById('rf-primary-code');
  if(!select) return;
  const value = select.value.trim();
  select.innerHTML = `<option value="">${project ? '- Select project code -' : 'Select Project first'}</option>${projectCodeOptionsForProject(project, value)}`;
  select.disabled = !project;
  if(clearInvalid && value && !projectCodeByValue(value, project)) select.value = '';
  else select.value = value;
}

function applyRequestProjectCode() {
  const project = document.getElementById('rf-project')?.value || currentUserProject();
  const code = document.getElementById('rf-primary-code')?.value || '';
  const meta = projectCodeByValue(code, project);
  if(!code || meta) return;
  resourceError('Project Code นี้ไม่ได้อยู่ใต้ Project ที่เลือกไว้');
  const input = document.getElementById('rf-primary-code');
  if(input) input.value = '';
}


function toggleEndDateRequired() {
  const ht = document.getElementById('rf-hiring')?.value||'';
  const lbl = document.getElementById('rf-end-label');
  const inp = document.getElementById('rf-end');
  const wrap = document.getElementById('rf-end-wrap');
  const req = isFixedTermHiring(ht);
  if(lbl) lbl.textContent = req ? 'End Date *' : 'End Date';
  if(wrap) wrap.style.display = req ? '' : 'none';
  if(inp) {
    inp.required = req;
    if(!req) inp.value = '';
  }
  const help = document.getElementById('rf-hiring-help');
  if(help) help.textContent = hiringMeta(ht).fullLabel;
  const codeWrap = document.getElementById('rf-employee-code-wrap');
  const codeInput = document.getElementById('rf-employee-code');
  const autoCode = nextEmployeeCode(ht);
  if(codeWrap) codeWrap.style.display = autoCode ? '' : 'none';
  if(codeInput && autoCode && !document.getElementById('res-edit-id')?.value) codeInput.value = autoCode;
}
function closeResModal() { pmoMotionHide(document.getElementById('resource-modal')); }


async function saveResource() {
  const role = currentRole();
  const g = id => document.getElementById(id)?.value?.trim()||'';
  // à¹‚à¸„à¸£à¸‡à¸à¸²à¸£: User à¸–à¸¹à¸à¸¥à¹‡à¸­à¸à¹€à¸›à¹‡à¸™à¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸­à¸‡ (select disabled â†’ à¸­à¹ˆà¸²à¸™à¸„à¹ˆà¸²à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¹ƒà¸Šà¹‰ currentUserProject)
  const project = role==='user' ? currentUserProject() : g('rf-project');
  const position = g('rf-position');
  const hc = 1; // 1 request = 1 transaction
  const hiring = g('rf-hiring'), startDate = g('rf-start'), endDate = g('rf-end');
  const requesterName = g('rf-requester');
  const allocation = clampAlloc(g('rf-allocation') || 100);
  if(allocation < 1 || allocation > 100) { resourceError('Primary Allocation must be between 1 and 100%'); return; }


  if(!project||!position||!hiring||!startDate||!requesterName) { resourceError('Please fill all required fields, including Requester Name.'); return; }
  if(isFixedTermHiring(hiring) && !endDate) { resourceError('End Date is required for Secondment / Sub Con'); return; }
  if(endDate && startDate && endDate < startDate) { resourceError('End Date must be after Start Date.'); return; }
  const primaryCode = g('rf-primary-code');
  if(primaryCode && !projectCodeByValue(primaryCode, project)) {
    resourceError('Project Code must belong to the selected Project.');
    return;
  }


  const editId = g('res-edit-id');
  const existing = editId ? loadResources().find(r=>r.id===editId) : null;
  const actor = roleLabel(role);
  const employeeCode = existing?.employeeCode || g('rf-employee-code') || nextEmployeeCode(hiring) || '';


  const data = {
    id: editId || nextResId(),
    resourceTeam: existing?.resourceTeam || '', project, position,
    level: g('rf-level'), hc, hiringType: hiring,
    startDate, endDate: isFixedTermHiring(hiring) ? (endDate || null) : null,
    requestDate: existing?.requestDate || g('rf-reqdate') || todayISO,
    resolvedDate: existing?.resolvedDate||null,
    remark: g('rf-remark'),
    status: existing?.status || 'pending',
    requesterName,
    transferFrom: existing?.transferFrom||null,
    projectCodes: existing?.projectCodes||[],
    resourceName: existing?.resourceName || '',
    employeeCode,
    primaryProjectCode: primaryCode || existing?.primaryProjectCode || '',
    allocationPercent: allocation,
    onboardDate: existing?.onboardDate||null,
    offboardDate: existing?.offboardDate||null,
    activityLog: existing?.activityLog || [{ action:'Created', status:'pending', by: requesterName||actor, at: new Date().toISOString() }],
  };


  await saveResourceAsync(data);
  closeResModal();
  renderResource();
  if(typeof refreshNotifications === 'function') refreshNotifications();
}


// â”€â”€ Quick: Approve (PMO/Dir) & Accept (BBIK) â”€â”€
async function approveRequest(id) {
  const role = currentRole();
  if(!canApprove(role)) { resourceError('Only PMO/Dir can approve requests.'); return; }
  const list = loadResources(); const idx = list.findIndex(r=>r.id===id); if(idx<0) return;
  const r = list[idx];
  if(r.status!=='pending') { resourceError('Only pending requests can be approved.'); return; }
  const nextStatus = requiresPreApprovalDocs(r.hiringType) ? 'pendingDocs' : 'approved';
  const confirmMsg = nextStatus === 'pendingDocs'
    ? `Move this request to Pending Docs?\n\n${r.position} / ${r.project}\n\nDirect HC / Secondment must complete pre-approval documents before BBIK.`
    : `Approve this request?\n\n${r.position} / ${r.project}\n\nAfter approval it will go to BBIK.`;
  const ok = await resourceConfirm(nextStatus === 'pendingDocs' ? 'Move to Pending Docs?' : 'Approve request?', confirmMsg, nextStatus === 'pendingDocs' ? 'Move' : 'Approve');
  if(!ok) return;
  const now = new Date().toISOString();
  const action = nextStatus === 'pendingDocs' ? 'Sent to Pending Docs' : 'Approved by PMO/Dir';
  const updated = { ...r, status:nextStatus, updatedAt:now,
    activityLog:[...(r.activityLog||[]), { action, from:'pending', to:nextStatus, by:roleLabel(role), at:now }] };
  await saveResourceAsync(updated);
  renderResource();
  if(typeof refreshNotifications === 'function') refreshNotifications();
}
async function bbikAccept(id) {
  const role = currentRole();
  if(!canRecruit(role)) { resourceError('Only BBIK can accept recruiting work.'); return; }
  const list = loadResources(); const idx = list.findIndex(r=>r.id===id); if(idx<0) return;
  const r = list[idx];
  if(r.status!=='approved') { resourceError('Only approved requests can be accepted by BBIK.'); return; }
  const now = new Date().toISOString();
  const updated = { ...r, status:'sourcing', updatedAt:now,
    activityLog:[...(r.activityLog||[]), { action:'BBIK accepted (start sourcing)', from:'approved', to:'sourcing', by:roleLabel(role), at:now }] };
  await saveResourceAsync(updated);
  renderResource();
  if(typeof refreshNotifications === 'function') refreshNotifications();
}


// â”€â”€ Status change modal (permission-gated) â”€â”€
function openResStatus(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const role = currentRole();
  const nexts = allowedStatusChoicesForRecord(r, role);
  if(!nexts.length) {
    resourceError(`${roleLabel(role)} cannot change this request status (${RES_STATUS[r.status]?.label||r.status}).`);
    return;
  }
  const s = RES_STATUS[r.status]||{label:r.status};
  const opts = nexts.map(k=>`<option value="${k}">${RES_STATUS[k]?.label||k}</option>`).join('');
  document.getElementById('res-status-id').value = id;
  document.getElementById('res-status-current').innerHTML =
    `<span class="badge ${RES_STATUS[r.status]?.cls||'badge-gray'}">${s.label}</span> - ${esc(r.position)} / ${esc(r.project)}
     <div style="font-size:11px;color:var(--text-3);margin-top:6px">Changing as <strong>${esc(roleLabel(role))}</strong></div>`;
  document.getElementById('res-status-select').innerHTML = opts;
  document.getElementById('res-status-select').onchange = toggleStatusOnboardFields;
  ensureStatusOnboardFields(r);
  ensureStatusCancelFields(r);
  document.getElementById('res-status-remark').value = '';
  pmoMotionShow(document.getElementById('resource-status-modal'));
  toggleStatusOnboardFields();
}
function closeResStatus() { pmoMotionHide(document.getElementById('resource-status-modal')); }

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
      <div class="fg"><label>Employee Code</label><input id="rs-employee-code" class="ri" value="${esc(r.employeeCode||nextEmployeeCode(r.hiringType)||'')}" readonly style="background:var(--bg);cursor:default" placeholder="Reserved by request"><input id="rs-hiring-kind" type="hidden" value="${esc(r.hiringType||'')}"></div>
      <div class="fg"><label>Position *</label><input id="rs-position" class="ri" value="${esc(r.position||'')}" placeholder="Business Analyst, QA..."></div>
        <div class="fg"><label>Onboard Date</label><input id="rs-onboard-date" class="ri" type="date" value="${effectiveOnboardDate(r)||todayISO}"></div>
      <div class="fg"><label>Project Code</label><select id="rs-primary-code" class="ri"><option value="">- Select project code -</option>${projectCodeOptionsForProject(r.project, r.primaryProjectCode||'')}</select></div>
      <div class="fg"><label>Primary Allocation %</label><input id="rs-allocation" class="ri" type="number" min="1" max="100" value="${esc(String(r.allocationPercent||100))}"></div>
    </div>`;
}

function ensureStatusCancelFields(r) {
  let box = document.getElementById('res-status-cancel-fields');
  if(!box) {
    box = document.createElement('div');
    box.id = 'res-status-cancel-fields';
    box.style.cssText = 'display:none;margin:10px 0;padding:10px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg)';
    const onboard = document.getElementById('res-status-onboard-fields');
    const selectWrap = document.getElementById('res-status-select')?.closest('.fg');
    (onboard || selectWrap)?.insertAdjacentElement('afterend', box);
  }
  const selected = r.cancelReason || '';
  const known = CANCEL_REASON_OPTIONS.includes(selected);
  const options = CANCEL_REASON_OPTIONS.map(reason =>
    `<option value="${esc(reason)}" ${selected === reason ? 'selected' : ''}>${esc(reason)}</option>`
  ).join('');
  box.innerHTML = `
    <div class="fg" style="margin-bottom:8px">
      <label>Cancel Reason *</label>
      <select id="rs-cancel-reason" class="ri" onchange="toggleStatusCancelFields()">
        <option value="">- Select cancel reason -</option>
        ${options}
      </select>
    </div>
    <div class="fg" id="rs-cancel-other-wrap" style="display:none;margin-bottom:8px">
      <label>Other Reason *</label>
      <input id="rs-cancel-other" class="ri" value="${!known ? esc(selected) : ''}" placeholder="Enter cancel reason">
    </div>
    <div style="font-size:11px;color:var(--text-3)">This reason will be saved on the request, detail drawer, export, and transaction log.</div>`;
}

function toggleStatusOnboardFields() {
  const box = document.getElementById('res-status-onboard-fields');
  const next = document.getElementById('res-status-select')?.value;
  if(box) box.style.display = next === 'filled' ? 'block' : 'none';
  toggleStatusCancelFields();
}

function toggleStatusCancelFields() {
  const box = document.getElementById('res-status-cancel-fields');
  const next = document.getElementById('res-status-select')?.value;
  if(box) box.style.display = requiresCancelReason(next) ? 'block' : 'none';
  const reason = document.getElementById('rs-cancel-reason')?.value;
  const otherWrap = document.getElementById('rs-cancel-other-wrap');
  if(otherWrap) otherWrap.style.display = reason === 'Other' ? 'block' : 'none';
}

function selectedCancelReason() {
  const selected = document.getElementById('rs-cancel-reason')?.value?.trim() || '';
  if(selected === 'Other') return document.getElementById('rs-cancel-other')?.value?.trim() || '';
  return selected;
}


function _transitionAction(prev, next) {
  if(prev==='pending'  && next==='pendingDocs') return 'Sent to Pending Docs';
  if(prev==='pendingDocs' && next==='approved') return 'Approved after docs';
  if(prev==='pending'  && next==='approved') return 'Approved by PMO/Dir';
  if(prev==='approved' && next==='sourcing') return 'BBIK accepted (sourcing)';
  if(prev==='offer'    && next==='filled')   return 'Onboarded by BBIK';
  if(prev==='document' && next==='filled')   return 'Onboarded (Filled)';
  if(next==='resolved')  return 'Closed';
  if(next==='cancelled') return 'Cancelled';
  return 'Status changed';
}


async function saveResStatus() {
  const id = document.getElementById('res-status-id').value;
  const newStatus = document.getElementById('res-status-select').value;
  const remark = document.getElementById('res-status-remark').value.trim();
  const cancelReason = selectedCancelReason();
  const role = currentRole();


  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const prevStatus = list[idx].status;


  if(!allowedStatusChoicesForRecord(list[idx], role).includes(newStatus)) {
    resourceError(`${roleLabel(role)} cannot change "${RES_STATUS[prevStatus]?.label||prevStatus}" to "${RES_STATUS[newStatus]?.label||newStatus}".`);
    return;
  }
  if(requiresCancelReason(newStatus) && !cancelReason) { resourceError('Please select or enter a cancel reason.'); return; }


  const onboardMeta = {};
  if(newStatus === 'filled') {
    const rn = document.getElementById('rs-resource-name')?.value?.trim() || '';
    const position = document.getElementById('rs-position')?.value?.trim() || '';
    const onboardDate = document.getElementById('rs-onboard-date')?.value || todayISO;
    const alloc = clampAlloc(document.getElementById('rs-allocation')?.value || 100);
    if(!rn || !position || !onboardDate) { resourceError('Name, Position, and Onboard Date are required when status becomes Filled.'); return; }
    if(alloc < 1 || alloc > 100) { resourceError('Primary Allocation must be between 1 and 100%'); return; }
    onboardMeta.resourceName = rn;
    onboardMeta.position = position;
    onboardMeta.employeeCode = document.getElementById('rs-employee-code')?.value?.trim() || '';
    onboardMeta.primaryProjectCode = document.getElementById('rs-primary-code')?.value?.trim() || '';
    if(onboardMeta.primaryProjectCode && !projectCodeByValue(onboardMeta.primaryProjectCode, list[idx].project)) {
      resourceError('Project Code must belong to the request Project.');
      return;
    }
    onboardMeta.allocationPercent = alloc;
    onboardMeta.onboardDate = onboardDate;
    onboardMeta.startDate = onboardDate;
    onboardMeta.offboardDate = null;
  }

  const now = new Date().toISOString();
  const keepsOnboardDate = canHaveOnboardDate(newStatus);
  const transitionRemark = newStatus === 'cancelled'
    ? [cancelReason, remark].filter(Boolean).join(' / ')
    : remark;
  const updated = { ...list[idx], ...onboardMeta,
    status: newStatus,
    cancelReason: newStatus === 'cancelled' ? cancelReason : list[idx].cancelReason,
    onboardDate: keepsOnboardDate ? (onboardMeta.onboardDate || list[idx].onboardDate || null) : null,
    resolvedDate: keepsOnboardDate ? todayISO : null,
    updatedAt: now,
    activityLog: [...(list[idx].activityLog||[]), {
      action: _transitionAction(prevStatus, newStatus), from: prevStatus, to: newStatus,
      by: roleLabel(role), remark, cancelReason: newStatus === 'cancelled' ? cancelReason : '', at: now
    }],
  };
  if(transitionRemark) {
    const prefix = newStatus === 'cancelled' ? 'Cancelled' : new Date().toLocaleDateString('th');
    updated.remark = (updated.remark ? updated.remark+'\n' : '') + `[${prefix}] ${transitionRemark}`;
  }


  await saveResourceAsync(updated);
  closeResStatus();
  renderResource();
  if(typeof refreshNotifications === 'function') refreshNotifications();
}


// â”€â”€ Transfer modal (within Orbit) â”€â”€
function openResTransfer(id) {
  const role = currentRole();
  if(!canTransfer(role)) { resourceError(`${roleLabel(role)} cannot create transfer records.`); return; }
  openTransferEntry('', id);
  return;
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const projectOpts = resProjects().filter(p=>p!==r.project).map(p=>`<option>${esc(p)}</option>`).join('');
  document.getElementById('res-transfer-id').value = id;
  document.getElementById('res-transfer-body').innerHTML = `
    <p style="font-size:12px;color:var(--text-2);margin-bottom:12px">
      Transfer <strong>${esc(r.position)}</strong> from <strong>${esc(r.project)}</strong> to:
    </p>
    <div class="form-grid res-form-grid-3" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
      <div class="fg"><label>Destination Project *</label><select id="rtf-project" class="ri"><option value="">- Select -</option>${projectOpts}</select></div>
      <div class="fg"><label>New Start Date *</label><input id="rtf-start" class="ri" type="date" value=""></div>
      <div class="fg"><label>End Date</label><input id="rtf-end" class="ri" type="date" value="${r.endDate||''}"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Transfer Reason *</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="Enter reason"></textarea></div>`;
  pmoMotionShow(document.getElementById('resource-transfer-modal'));
}
function closeResTransfer() { pmoMotionHide(document.getElementById('resource-transfer-modal')); }

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
  const list = loadResources();
  const editing = editId ? list.find(x => x.id === editId) : null;
  const source = sourceId ? list.find(x => x.id === sourceId) : null;
  const sourceFromTransfer = editing ? list.find(x => x.id === editing.transferFrom) : null;
  const selectedSourceId = source?.id || sourceFromTransfer?.id || '';
  const editingCodeIndex = codeIndex === '' ? -1 : Number(codeIndex);
  const editingCode = source && editingCodeIndex >= 0 ? (source.projectCodes||[])[editingCodeIndex] : null;
  const actionMode = mode === 'code' || editingCode ? 'code' : 'transfer';
  if(actionMode === 'transfer' && !canTransfer(role)) { resourceError(`${roleLabel(role)} cannot create transfer records`); return; }
  if(actionMode === 'code' && !canProjectCode(role)) { resourceError(`${roleLabel(role)} cannot add Project Code.`); return; }
  const searchOptions = buildResourceSearchMap(list);
  const selectedResource = source || sourceFromTransfer || null;
  const selectedSearch = selectedResource ? resourceSearchLabel(selectedResource) : '';
  const fromProject = source?.project || sourceFromTransfer?.project || transferFromProject(editing||{}, list);
  const selectedProject = editingCode?.project || editing?.project || '';
  const selectedCode = editingCode?.code || primaryProjectCode(editing||{}) || '';
  const projectOpts = resProjects().map(p => `<option ${selectedProject===p?'selected':''}>${esc(p)}</option>`).join('');
  const codeOptions = projectCodeOptionsForProject(selectedProject, selectedCode);
  document.getElementById('res-transfer-id').value = editId || '';
  document.getElementById('res-transfer-body').innerHTML = `
    <input type="hidden" id="rtf-source-id" value="${esc(selectedSourceId)}">
    <input type="hidden" id="rtf-code-index" value="${esc(codeIndex === '' ? '' : String(codeIndex))}">
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Action Type *</label><select id="rtf-action" class="ri" onchange="toggleAssignmentMode()">
        ${canTransfer(role)?`<option value="transfer" ${actionMode==='transfer'?'selected':''}>Transfer Employee</option>`:''}
        ${canProjectCode(role)?`<option value="code" ${actionMode==='code'?'selected':''}>Add Project Code to Employee</option>`:''}
      </select></div>
      <div class="fg"><label>Search Employee *</label><input id="rtf-source-search" class="ri" list="rtf-source-list" value="${esc(selectedSearch)}" placeholder="Type name, project, or employee code" oninput="setTransferSourceFromSearch(this.value)"><datalist id="rtf-source-list">${searchOptions}</datalist></div>
      <div class="fg"><label>Request Date *</label><input id="rtf-request-date" class="ri" type="date" value="${editing?.requestDate||todayISO}"></div>
      <div class="fg"><label>Request By *</label><input id="rtf-request-by" class="ri" value="${esc(editing?.requesterName||source?.requesterName||'')}" placeholder="Requester / PMO"></div>
      <div class="fg"><label>From Project *</label><input id="rtf-from-project" class="ri" value="${esc(fromProject||'')}" placeholder="Current project"></div>
      <div class="fg"><label>To Project *</label><select id="rtf-project" class="ri" onchange="syncTransferProjectCodeChoices()"><option value="">Select project</option>${projectOpts}</select></div>
      <div class="fg" style="display:none"><label>Name - Surname *</label><input id="rtf-name" class="ri" value="${esc(resourcePersonName(editing||source||{})||'')}" placeholder="Employee name"></div>
      <div class="fg"><label>First day at new project *</label><input id="rtf-start" class="ri" type="date" value="${editing?.onboardDate||editing?.startDate||editingCode?.startDate||''}"></div>
      <div class="fg"><label>Last day at new project *</label><input id="rtf-end" class="ri" type="date" value="${editing?.offboardDate||editing?.endDate||''}"></div>
      <div class="fg"><label>Project Code</label><select id="rtf-code" class="ri" onchange="applyTransferProjectCode()"><option value="">${selectedProject ? '- Select project code -' : 'Select Project first'}</option>${codeOptions}</select></div>
      <div class="fg"><label>Allocation %</label><input id="rtf-allocation" class="ri" type="number" min="1" max="100" value="${esc(String(editingCode?.allocation||100))}"></div>
      <div class="fg"><label>Supervisor</label><input id="rtf-supervisor" class="ri" value="${esc(editingCode?.supervisor||editing?.supervisor||transferSupervisor(editing||{})||'')}" placeholder="Supervisor name"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="Reason / note">${esc(editingCode?.note||(editing?.remark||'').replace(/^Transferred from.*\n?/,'').replace(/Supervisor:[^\n]*\n?/i,''))}</textarea></div>`;
  pmoMotionShow(document.getElementById('resource-transfer-modal'));
  document.querySelector('#resource-transfer-modal .btn-primary').textContent = actionMode === 'code' ? 'Save Project Code' : 'Transfer';
  toggleAssignmentMode();
  syncTransferProjectCodeChoices(false);
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

function syncTransferProjectCodeChoices(clearInvalid=true) {
  const project = document.getElementById('rtf-project')?.value || '';
  const select = document.getElementById('rtf-code');
  if(!select) return;
  const value = select.value.trim();
  select.innerHTML = `<option value="">${project ? '- Select project code -' : 'Select Project first'}</option>${projectCodeOptionsForProject(project, value)}`;
  select.disabled = !project;
  if(clearInvalid && value && !projectCodeByValue(value, project)) select.value = '';
  else select.value = value;
}

function applyTransferProjectCode() {
  const code = document.getElementById('rtf-code')?.value || '';
  const project = document.getElementById('rtf-project');
  const selectedProject = project?.value || '';
  const meta = projectCodeByValue(code, selectedProject);
  if(!code || meta) {
    if(meta) {
      const start = document.getElementById('rtf-start');
      const end = document.getElementById('rtf-end');
      const supervisor = document.getElementById('rtf-supervisor');
      if(start && meta.startDate) start.value = meta.startDate;
      if(end && meta.endDate) end.value = meta.endDate;
      if(supervisor && meta.pmOwner) supervisor.value = meta.pmOwner;
    }
    return;
  }
  resourceError('Project Code นี้ไม่ได้อยู่ใต้ Project ที่เลือกไว้');
  const input = document.getElementById('rtf-code');
  if(input) input.value = '';
}

function applyTransferProjectCodeLegacy() {
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
  const actor = roleLabel(currentRole());
  if(!destProject||!startDate||!remark) { resourceError('Please fill all required fields.'); return; }


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
  resourceToast(`Transfer completed. Created ${newRecord.id} for ${destProject}.`, 'ok');
}


// â”€â”€ Add Project Code modal â”€â”€
async function saveResTransfer() {
  const role = currentRole();
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
  const actor = roleLabel(currentRole());
  const list = loadResources();
  const source = sourceId ? list.find(r => r.id === sourceId) : null;

  if(actionMode === 'code') {
    if(!canProjectCode(role)) { resourceError(`${roleLabel(role)} cannot add Project Code.`); return; }
    if(!sourceId || !destProject || !code || allocation < 1 || !startDate || !endDate) {
      resourceError('Please select Employee, Project, Project Code, Allocation, Start Date, and End Date.');
      return;
    }
    if(endDate && endDate < startDate) { resourceError('End Date must be after Start Date.'); return; }
    if(!source) return;
    const codeMeta = projectCodeByValue(code, destProject);
    if(!codeMeta) { resourceError('Project Code must belong to the selected Project.'); return; }
    if(codeMeta && String(codeMeta.status||'').toLowerCase() !== 'active') { resourceError('Selected Project Code is not Active yet.'); return; }
    const editIdx = codeIndexRaw === '' ? -1 : Number(codeIndexRaw);
    const existingCodes = [...(source.projectCodes||[])];
    const previousAlloc = editIdx >= 0 ? clampAlloc(existingCodes[editIdx]?.allocation) : 0;
    const used = _allocUsed(source) - previousAlloc;
    if(used + allocation > 100) { resourceError(`Extra Project Code allocation exceeds 100% (available ${100-used}%).`); return; }
    const candidate = { project: destProject, code, allocation, startDate, endDate };
    if(duplicateProjectCodeAssignment(source, candidate, editIdx)) {
      resourceError('Project Code นี้ถูก assign ให้ employee คนนี้ในช่วงวันที่ซ้ำกันแล้ว');
      return;
    }
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
    const activeExtra = maxProjectCodeAllocationTotal(existingCodes);
    if(activeExtra > 100) {
      resourceError(`Allocation รวมของ Project Code ที่ active ต้องไม่เกิน 100% (ตอนนี้ ${activeExtra}%). กรุณาแบ่ง allocation เช่น 50/50`);
      return;
    }
    const nextPrimaryAllocation = rebalancePrimaryAllocationForCodes(source, existingCodes);
    await saveResourceAsync({ ...source,
      projectCodes: existingCodes,
      allocationPercent: nextPrimaryAllocation,
      updatedAt: now,
      activityLog: [...(source.activityLog||[]), { action: editIdx >= 0 ? 'Project code updated' : 'Project code added', to: destProject, by: actor, remark: `${code} / ${allocation}%${remark?` / ${remark}`:''}`, at: now }],
      remark: (source.remark ? source.remark+'\n' : '') + `[Project Code] ${code} (${destProject}) ${allocation}%`,
    });
    closeResTransfer();
    renderResource();
    resourceToast(`Project Code ${code} saved. Primary allocation is now ${nextPrimaryAllocation}%.`, 'ok');
    return;
  }

  if(!canTransfer(role)) { resourceError(`${roleLabel(role)} cannot create transfer records.`); return; }
  if(!requestDate || !requestBy || !fromProject || !destProject || !personName || !startDate || !endDate) {
    resourceError('Please fill Request Date, Request By, From Project, To Project, Employee, First Day, and Last Day.');
    return;
  }
  if(endDate && endDate < startDate) { resourceError('Last day must be after first day.'); return; }
  if(code && !projectCodeByValue(code, destProject)) {
    resourceError('Project Code must belong to the selected To Project.');
    return;
  }
  const duplicatedTransfer = sourceId ? duplicateTransferAssignment(list, sourceId, destProject, startDate, endDate, editId) : null;
  if(duplicatedTransfer) {
    resourceError('Transfer ซ้ำไม่ได้: employee คนนี้มี assignment ไป project นี้ในช่วงวันที่ซ้ำกันแล้ว');
    return;
  }

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
  resourceToast(`Transfer saved: ${personName} -> ${destProject}`, 'ok');
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
function closeAddCode() { pmoMotionHide(document.getElementById('res-addcode-modal')); }
function syncAddCodeChoices() {
  const project = document.getElementById('addcode-project')?.value || '';
  const codes = activeProjectCodeMaster().filter(c => !project || c.project === project);
  const list = document.getElementById('addcode-code-list');
  if(list) list.innerHTML = codes.map(c =>
    `<option value="${esc(c.code)}">${esc(c.project)}</option>`
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
function rebalancePrimaryAllocationForCodes(resource, codes) {
  const extraUsed = (codes || []).reduce((sum,c)=>sum + clampAlloc(c.allocation), 0);
  return Math.max(0, 100 - extraUsed);
}


function openAddCode(id='', codeIndex='') {
  openTransferEntry('', id, 'code', codeIndex);
  return;
  const role = currentRole();
  if(!canProjectCode(role)) { resourceError(`${roleLabel(role)} cannot add Project Code.`); return; }
  ensureAddCodeModal();
  if(!document.getElementById('addcode-person')) {
    const projectWrap = document.getElementById('addcode-project')?.closest('.fg');
    projectWrap?.insertAdjacentHTML('beforebegin', '<div class="fg"><label>Name - Surname *</label><select id="addcode-person" class="ri" onchange="openAddCode(this.value)"></select></div>');
  }
  const list = loadResources();
  if(!id) id = list.find(isActiveResource)?.id || '';
  const r = list.find(x=>x.id===id);
  if(!r) { resourceError('No filled resource yet. Please fill a resource before adding Project Code.'); return; }
  if(r.status!=='filled') { resourceError('Project Code can be added only to Filled resources.'); return; }


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
    `<strong>${esc(r.position)}</strong> / ${esc(r.level||'')}
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
  pmoMotionShow(document.getElementById('res-addcode-modal'));
}
function closeAddCode() { pmoMotionHide(document.getElementById('res-addcode-modal')); }

function ensureEmployeeEditModal() {
  if(document.getElementById('resource-employee-edit-modal')) return;
  const m = document.createElement('div');
  m.id = 'resource-employee-edit-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.42);z-index:1000;align-items:center;justify-content:center;padding:18px';
  m.innerHTML = `
    <div class="card" style="width:520px;max-width:95vw;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:15px;font-weight:800">Edit Employee</span>
        <button class="btn-sm" onclick="closeEmployeeEdit()" style="padding:4px 10px">x</button>
      </div>
      <input type="hidden" id="emp-edit-id">
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>Name - Surname *</label><input id="emp-edit-name" class="ri" autocomplete="off"></div>
        <div class="fg"><label>Nickname</label><input id="emp-edit-nickname" class="ri" autocomplete="off" placeholder="Optional"></div>
        <div class="fg"><label>Employee Code</label><input id="emp-edit-code" class="ri" readonly style="background:var(--bg);cursor:default"></div>
        <div class="fg"><label>Position</label><input id="emp-edit-position" class="ri" autocomplete="off"></div>
        <div class="fg"><label>Level</label><select id="emp-edit-level" class="ri"></select></div>
        <div class="fg"><label>Photo URL</label><input id="emp-edit-photo" class="ri" autocomplete="off" placeholder="Optional"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
        <button class="btn-ghost" onclick="closeEmployeeEdit()">Cancel</button>
        <button class="btn-primary" onclick="saveEmployeeEdit()">Save Employee</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target === m) closeEmployeeEdit(); });
}

function openEmployeeEdit(id) {
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  ensureEmployeeEditModal();
  document.getElementById('emp-edit-id').value = id;
  document.getElementById('emp-edit-name').value = resourcePersonName(r) || '';
  document.getElementById('emp-edit-nickname').value = r.nickname || '';
  document.getElementById('emp-edit-code').value = resourceEmployeeCode(r) || '';
  document.getElementById('emp-edit-position').value = r.position || '';
  document.getElementById('emp-edit-level').innerHTML = resourceLevels().map(l=>`<option ${r.level===l?'selected':''}>${esc(l)}</option>`).join('');
  document.getElementById('emp-edit-photo').value = r.photoUrl || '';
  pmoMotionShow(document.getElementById('resource-employee-edit-modal'));
}
function closeEmployeeEdit() { pmoMotionHide(document.getElementById('resource-employee-edit-modal')); }
async function saveEmployeeEdit() {
  const id = document.getElementById('emp-edit-id')?.value || '';
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  const name = document.getElementById('emp-edit-name')?.value?.trim() || '';
  if(!name) { resourceError('Name - Surname is required.'); return; }
  await saveResourceAsync({
    ...r,
    resourceName: name,
    resourceNameTh: name,
    nickname: document.getElementById('emp-edit-nickname')?.value?.trim() || '',
    position: document.getElementById('emp-edit-position')?.value?.trim() || r.position,
    level: document.getElementById('emp-edit-level')?.value || r.level,
    photoUrl: document.getElementById('emp-edit-photo')?.value?.trim() || '',
  });
  closeEmployeeEdit();
  renderResource();
  resourceToast('Employee updated.', 'ok');
}

function ensureOffboardModal() {
  if(document.getElementById('resource-offboard-modal')) return;
  const m = document.createElement('div');
  m.id = 'resource-offboard-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.42);z-index:1300;align-items:center;justify-content:center;padding:18px';
  m.innerHTML = `
    <div class="card" style="width:460px;max-width:95vw;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:15px;font-weight:800">Offboard Employee</span>
        <button class="btn-sm" onclick="closeOffboardModal()" style="padding:4px 10px">x</button>
      </div>
      <input type="hidden" id="offboard-id">
      <div id="offboard-summary" style="font-size:12px;color:var(--text-2);line-height:1.45;margin-bottom:12px"></div>
      <div class="form-grid" style="grid-template-columns:1fr;gap:10px">
        <div class="fg"><label>Offboard Date *</label><input id="offboard-date" class="ri" type="date" max="${todayISO}" value="${todayISO}"></div>
        <div class="fg"><label>Reason *</label><textarea id="offboard-reason" class="ri" rows="3" placeholder="Reason / note for offboarding"></textarea></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
        <button class="btn-ghost" onclick="closeOffboardModal()">Cancel</button>
        <button class="btn-primary" onclick="saveOffboardResource()">Offboard</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target === m) closeOffboardModal(); });
}
function closeOffboardModal() { pmoMotionHide(document.getElementById('resource-offboard-modal')); }

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
  const actor = roleLabel(currentRole());
  const codeMeta = projectCodeByValue(code, project) || projectCodeByValue(code);
  if(endDate && startDate && endDate < startDate) { resourceError('End Date must be after Start Date.'); return; }
  if(!project||!code||alloc<1) { resourceError('Please fill Project, Code, and Allocation.'); return; }
  if(codeMeta && String(codeMeta.status||'').toLowerCase() !== 'active') { resourceError('Selected Project Code is not Active yet.'); return; }


  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;
  const r = list[idx];
  const existingCodes = [...(r.projectCodes||[])];
  const previousAlloc = editIdx >= 0 ? clampAlloc(existingCodes[editIdx]?.allocation) : 0;
  const used = _allocUsed(r) - previousAlloc;
  if(used + alloc > 100) { resourceError(`Extra Project Code allocation exceeds 100% (available ${100-used}%).`); return; }
  const candidate = { project, code, allocation:alloc, startDate, endDate };
  if(duplicateProjectCodeAssignment(r, candidate, editIdx)) {
    resourceError('Project Code นี้ถูก assign ให้ employee คนนี้ในช่วงวันที่ซ้ำกันแล้ว');
    return;
  }


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
  const activeExtra = maxProjectCodeAllocationTotal(existingCodes);
  if(activeExtra > 100) {
    resourceError(`Allocation รวมของ Project Code ที่ active ต้องไม่เกิน 100% (ตอนนี้ ${activeExtra}%). กรุณาแบ่ง allocation เช่น 50/50`);
    return;
  }
  const updated = { ...r,
    projectCodes: existingCodes,
    allocationPercent: rebalancePrimaryAllocationForCodes(r, existingCodes),
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), { action:'Project code added', to: project, by: actor,
      remark: `${code} / ${alloc}%${note?` / ${note}`:''}`, at: now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Add Code] ${code} (${project}) ${alloc}%`,
  };
  await saveResourceAsync(updated);
  closeAddCode();
  renderResource();
  resourceToast(`Project Code ${code} (${project}) ${alloc}% saved. Primary allocation is now ${updated.allocationPercent}%.`, 'ok');
}


// â”€â”€ Delete (hard remove) â€” PMO only â”€â”€
async function deleteProjectCode(id, codeIndex) {
  const role = currentRole();
  if(!canProjectCode(role)) { resourceError(`${roleLabel(role)} cannot delete project codes`); return; }
  const list = loadResources();
  const r = list.find(x => x.id === id);
  if(!r) return;
  const codes = [...(r.projectCodes||[])];
  const c = codes[codeIndex];
  if(!c) return;
  const ok = await resourceConfirm('Delete project code?', `${c.code || '-'} (${c.project || '-'})\n${resourcePersonName(r)||r.position}`, 'Delete', true);
  if(!ok) return;
  codes.splice(codeIndex, 1);
  const now = new Date().toISOString();
  await saveResourceAsync({ ...r,
    projectCodes: codes,
    updatedAt: now,
    activityLog: [...(r.activityLog||[]), { action:'Project code deleted', from:c.project, by:roleLabel(role), remark:c.code||'', at:now }],
    remark: (r.remark ? r.remark+'\n' : '') + `[Delete Code] ${c.code||'-'} (${c.project||'-'})`,
  });
  renderResource();
}

async function deleteResource(id) {
  const role = currentRole();
  if(!canDelete(role)) { resourceError(`${roleLabel(role)} cannot delete requests.`); return; }
  const r = loadResources().find(x => x.id === id);
  if(!r) return;
  const ok = await resourceConfirm('Delete request?', `${r.position} / ${r.project}\n${r.id}\n\nThis action cannot be undone.`, 'Delete', true);
  if(!ok) return;
  _doDeleteResource(id);
}
async function _doDeleteResource(id) {
  await deleteResourceAsync(id);
  closeResDetail();
  renderResource();
  resourceToast('Request deleted.', 'ok');
}


// â”€â”€ Detail drawer â”€â”€
// à¸ªà¸£à¹‰à¸²à¸‡ drawer à¹€à¸­à¸‡à¸–à¹‰à¸² index.html à¹„à¸¡à¹ˆà¸¡à¸µ (à¸à¸±à¸™à¸›à¸¸à¹ˆà¸¡ "à¸ˆà¸±à¸”à¸à¸²à¸£" à¸à¸”à¹à¸¥à¹‰à¸§à¹€à¸‡à¸µà¸¢à¸š)
function offboardResource(id) {
  const role = currentRole();
  if(!canOffboard(role)) { resourceError(`${roleLabel(role)} cannot offboard resources`); return; }
  const list = loadResources();
  const r = list.find(x => x.id === id);
  if(!r) return;
  if(r.status !== 'filled') { resourceError('Offboard is available only for filled resources'); return; }
  const targetKey = personKey(r);
  const targets = list.filter(x => personKey(x) === targetKey && x.status === 'filled');
  ensureOffboardModal();
  document.getElementById('offboard-id').value = id;
  document.getElementById('offboard-date').value = todayISO;
  document.getElementById('offboard-date').max = todayISO;
  document.getElementById('offboard-reason').value = '';
  document.getElementById('offboard-summary').textContent = `${resourcePersonName(r)||r.position} - this will close ${targets.length} active assignment${targets.length === 1 ? '' : 's'} for this employee.`;
  pmoMotionShow(document.getElementById('resource-offboard-modal'));
}
async function saveOffboardResource() {
  const role = currentRole();
  if(!canOffboard(role)) { resourceError(`${roleLabel(role)} cannot offboard resources`); return; }
  const id = document.getElementById('offboard-id')?.value || '';
  const offboardDate = document.getElementById('offboard-date')?.value || '';
  const inputReason = document.getElementById('offboard-reason')?.value?.trim() || '';
  if(!offboardDate) { resourceError('Offboard Date is required.'); return; }
  if(offboardDate > todayISO) { resourceError('Offboard Date cannot be in the future.'); return; }
  if(!inputReason) { resourceError('Reason is required.'); return; }
  const list = loadResources();
  const r = list.find(x => x.id === id);
  if(!r) return;
  const targetKey = personKey(r);
  const targets = list.filter(x => personKey(x) === targetKey && x.status === 'filled');
  const reason = `Offboarded from Employee Directory: ${inputReason}`;
  const now = new Date().toISOString();
  let lastUpdated = null;
  for(const target of targets) {
    const updated = { ...target,
      status: 'resolved',
      resolvedDate: offboardDate,
      offboardDate,
      updatedAt: now,
      activityLog: [...(target.activityLog||[]), { action:'Offboarded', from:'filled', to:'resolved', by:roleLabel(role), remark:reason, at:now }],
      remark: (target.remark ? target.remark+'\n' : '') + `[Offboard] ${reason}`,
    };
    lastUpdated = updated;
    await saveResourceAsync(updated);
  }
  if(lastUpdated && (employeeDirectoryName(lastUpdated) || resourceEmployeeCode(lastUpdated))) {
    await saveResourceMasterAsync(resourceMasterFromRequest(lastUpdated));
  }
  closeOffboardModal();
  closeResDetail();
  renderResource();
  resourceToast(`Employee offboarded. Closed ${targets.length} active assignment${targets.length === 1 ? '' : 's'}.`, 'ok');
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
  const showWorkflowActions = _resTab !== 'people';


  const log = (r.activityLog||[]).slice().reverse().map(l=>
    `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600">${esc(l.action)}${l.from?` (${RES_STATUS[l.from]?.label||l.from} -> ${RES_STATUS[l.to]?.label||l.to||''})`:''}${l.to&&!l.from?` -> ${esc(l.to)}`:''}</div>
      ${l.cancelReason?`<div style="font-size:11px;color:var(--red);margin-top:2px">Cancel: ${esc(l.cancelReason)}</div>`:''}
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
        <div style="font-size:12px;color:var(--text-2)">${esc(r.project)}</div>
      </div>
      <span class="badge ${s.cls}">${s.label}</span>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;margin-bottom:14px;font-size:12px">
      <div style="font-weight:700;margin-bottom:6px">Actual Resource</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><span style="color:var(--text-3)">Resource</span><br><strong>${esc(resourcePersonName(r)||'-')}</strong></div>
        <div><span style="color:var(--text-3)">Employee Code</span><br><strong>${esc(resourceEmployeeCode(r)||'-')}</strong></div>
        <div><span style="color:var(--text-3)">Project Code</span><br><strong>${esc(primaryProjectCode(r)||'-')}</strong></div>
        <div><span style="color:var(--text-3)">Primary Allocation</span><br><strong>${primaryAllocation(r)}%</strong></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px">
      ${[['Level',r.level],['Employment Type',hiringMeta(r.hiringType).fullLabel],
         ['Start Date',r.startDate?shortDate(r.startDate):'-'],['End Date',resourceEndDate(r)?shortDate(resourceEndDate(r)):'-'],
         ['Request Date',r.requestDate?shortDate(r.requestDate):'-'],['Onboard Date',effectiveOnboardDate(r)?shortDate(effectiveOnboardDate(r)):'-'],
         ['Requester',r.requesterName||'-'],['Transfer From',r.transferFrom||'-']
        ].map(([k,v])=>`<div><span style="color:var(--text-3)">${k}</span><br><strong>${esc(String(v))}</strong></div>`).join('')}
    </div>
    ${codesHtml}
    ${r.cancelReason?`<div style="background:color-mix(in srgb,var(--red) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--red) 24%,var(--border));border-radius:var(--r-sm);padding:10px;font-size:12px;margin:16px 0"><strong>Cancel Reason:</strong> ${esc(r.cancelReason)}</div>`:''}
    ${r.remark?`<div style="background:var(--bg);border-radius:var(--r-sm);padding:10px;font-size:12px;margin:16px 0;white-space:pre-wrap">${esc(r.remark)}</div>`:''}
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-2)">Activity Log</div>
    ${log || '<div style="color:var(--text-3);font-size:12px">No activity log</div>'}
    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      ${(canEditPending(role)&&r.status==='pending')?`<button class="btn-sm" onclick="openResModal('${r.id}');closeResDetail()">Edit</button>`:''}
      ${(canRecruit(role)&&r.status==='approved')?`<button class="btn-sm" style="color:var(--blue)" onclick="bbikAccept('${r.id}');closeResDetail()">Accept</button>`:''}
      ${(showWorkflowActions && allowedStatusChoicesForRecord(r,role).length)?`<button class="btn-sm" onclick="openResStatus('${r.id}');closeResDetail()">Change Status</button>`:''}
      ${(r.status==='filled'&&canTransfer(role))?`<button class="btn-sm" style="color:var(--blue)" onclick="openResTransfer('${r.id}');closeResDetail()">Transfer</button>`:''}
      ${(r.status==='filled'&&canProjectCode(role))?`<button class="btn-sm" style="color:var(--green)" onclick="openAddCode('${r.id}');closeResDetail()">Add Project Code</button>`:''}
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
  if(!list.length) { resourceError('No data to export.'); return; }
  const headers = ['ID','Resource Name','Employee Code','Project','Project Code','Primary Allocation %','Position','Level','Hiring Type','Start Date','End Date','Onboard Date','Offboard Date','Request Date','Resolved Date','Updated','Status','Requester','Cancel Reason','Transfer From','Project Codes','Remark'];
  const rows = list.map(r=>[r.id,resourcePersonName(r),resourceEmployeeCode(r),r.project,primaryProjectCode(r),primaryAllocation(r),r.position,r.level,r.hiringType,r.startDate||'',resourceEndDate(r)||'',effectiveOnboardDate(r)||'',r.offboardDate||'',r.requestDate||'',r.resolvedDate||'',r.updatedAt?String(r.updatedAt).slice(0,10):'',RES_STATUS[r.status]?.label||r.status,r.requesterName||'',r.cancelReason||'',r.transferFrom||'',(r.projectCodes||[]).map(c=>`${c.code}(${c.project}:${c.allocation}%)`).join(' | '),r.remark||'']);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download = `Resource_Requests_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
  a.click();
}


// Close modals on backdrop
document.addEventListener('click', e => {
  if(!e.target.closest('.res-filter-menu')) closeResourceFilterMenus();
  if(e.target===document.getElementById('resource-modal')) closeResModal();
  if(e.target===document.getElementById('resource-status-modal')) closeResStatus();
  if(e.target===document.getElementById('resource-transfer-modal')) closeResTransfer();
});

window.addEventListener('pmo:session-change', () => {
  _role = null;
  _userProject = null;
  _resPage = 1;
  if(document.getElementById('view-resource')?.classList.contains('active')) renderResource();
  if(typeof refreshNotifications === 'function') refreshNotifications();
});
