// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// views/bulk_import.js â€” Bulk Excel Import
// Supports: License Monitor, Device Registry, Budget (historical memos)
// Uses SheetJS (xlsx.full.min.js)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _bulkImportTarget = null; // 'license' | 'device' | 'budget' | 'resourcePeople' | 'projectCodes'

// â”€â”€ Trigger file picker â”€â”€
function importBulk(target) {
  _bulkImportTarget = target;
  const input = document.getElementById('bulk-import-input');
  input.value = ''; // reset so same file can be re-selected
  input.click();
}

// â”€â”€ Handle file selected â”€â”€
function handleBulkImport(event) {
  const file = event.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined') { alert('SheetJS is still loading. Please wait a moment and try again.'); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Try reading normally first, fallback without cellDates if encrypted/error
      let wb;
      try {
        wb = XLSX.read(e.target.result, { type:'array', cellDates:true, sheetStubs:true });
      } catch(e1) {
        try {
          wb = XLSX.read(e.target.result, { type:'array', cellDates:false, sheetStubs:true });
        } catch(e2) {
          throw new Error('Unable to read this file. Please use an unencrypted .xlsx file (Save As > Excel Workbook).');
        }
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

      if(!rows.length) { alert('No rows found in the Excel file.'); return; }

      if(_bulkImportTarget === 'license') importLicenses(rows);
      else if(_bulkImportTarget === 'device') importDevices(rows);
      else if(_bulkImportTarget === 'budget') importBudgetMemos(rows);
      else if(_bulkImportTarget === 'resourcePeople') importResourcePeople(rows);
      else if(_bulkImportTarget === 'projectCodes') importProjectCodes(rows);
    } catch(err) {
      console.error(err);
      alert('Error while reading file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// â”€â”€ Helpers â”€â”€
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseExcelDate(val) {
  if(!val) return '';
  if(val instanceof Date) return isNaN(val.getTime()) ? '' : formatLocalDate(val);
  if(typeof val === 'number') {
    // Excel serial date, converted in UTC to avoid local timezone day shifts.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(val) * 86400 * 1000);
    return d.toISOString().slice(0,10);
  }
  const s = String(val).trim();
  if(!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
}
function strVal(v) { return String(v||'').trim(); }
function numVal(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function parseProjectCodeDate(val) {
  if(!val || String(val).trim() === '-') return '';
  if(val instanceof Date || typeof val === 'number') return parseExcelDate(val);
  const s = String(val).trim();
  const thMonths = {
    'ม.ค.':'01','มค':'01','ก.พ.':'02','กพ':'02','มี.ค.':'03','มีค':'03','เม.ย.':'04','เมย':'04',
    'พ.ค.':'05','พค':'05','มิ.ย.':'06','มิย':'06','ก.ค.':'07','กค':'07','ส.ค.':'08','สค':'08',
    'ก.ย.':'09','กย':'09','ต.ค.':'10','ตค':'10','พ.ย.':'11','พย':'11','ธ.ค.':'12','ธค':'12'
  };
  const m = s.match(/^(\d{1,2})-([^-]+)-(\d{2,4})$/);
  if(m) {
    const month = thMonths[m[2].trim()] || thMonths[m[2].trim().replace(/\./g,'')];
    let year = Number(m[3]);
    if(year < 100) year += 2000;
    if(month) return `${year}-${month}-${String(Number(m[1])).padStart(2,'0')}`;
  }
  return parseExcelDate(s);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// LICENSE IMPORT
// Template columns:
// Name | Vendor | Seats | Price/Month | Owner | Department | Project |
// License Type | Purchase Date | Expiry Date | Billing Freq | Status | Memo Ref | Note
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function rowVal(row, keys) {
  for(const key of keys) {
    if(Object.prototype.hasOwnProperty.call(row, key) && strVal(row[key])) return row[key];
  }
  return '';
}
function normalizeImportHiringType(raw) {
  const s = strVal(raw).toLowerCase();
  if(s.includes('second')) return 'Secondment';
  if(s.includes('sub') || s.includes('contract') || s.includes('con')) return 'Sub-contract';
  if(s.includes('direct') || s.includes('permanent') || s.includes('perm')) return 'Direct Head Count (Permanent)';
  return raw ? strVal(raw) : 'Direct Head Count (Permanent)';
}
function resourceImportId(employeeCode, index) {
  const code = strVal(employeeCode).replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return code ? `EMP-${code}` : `EMP-IMPORT-${Date.now()}-${index}`;
}

async function importResourcePeople(rows) {
  if(typeof saveResourceAsync !== 'function' || typeof loadResourcesAsync !== 'function' || typeof saveResourceMasterAsync !== 'function' || typeof loadResourceMasterAsync !== 'function') {
    alert('Resource module is not ready. Please open Resource Management and try again.');
    return;
  }
  const existing = await loadResourcesAsync();
  const existingMaster = await loadResourceMasterAsync();
  const byEmployee = new Map(existingMaster.filter(r => strVal(r.employeeCode)).map(r => [strVal(r.employeeCode).toLowerCase(), r]));
  const byName = new Map(existingMaster.filter(r => strVal(r.resourceName)).map(r => [strVal(r.resourceName).toLowerCase(), r]));
  const byRequestEmployee = new Map(existing.filter(r => strVal(r.employeeCode)).map(r => [strVal(r.employeeCode).toLowerCase(), r]));
  const now = new Date().toISOString();
  let added = 0, updated = 0, skipped = 0, active = 0, offboarded = 0;

  for(let i=0; i<rows.length; i++) {
    const row = rows[i];
    const employeeCode = strVal(rowVal(row, ['\u0e23\u0e2b\u0e31\u0e2a\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19','Employee Code','employee_code','Emp ID','EmployeeID']));
    const thaiName = strVal(rowVal(row, ['\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25','\u0e0a\u0e37\u0e48\u0e2d']));
    const fullName = thaiName || strVal(rowVal(row, ['Full Name','Name - Surname']));
    const first = strVal(rowVal(row, ['Name','First Name','FirstName']));
    const last = strVal(rowVal(row, ['Surname','Last Name','LastName']));
    const englishName = [first, last].filter(Boolean).join(' ');
    const resourceName = fullName || englishName;
    const project = strVal(rowVal(row, ['Project','project','\u0e42\u0e04\u0e23\u0e07\u0e01\u0e32\u0e23']));
    if(!resourceName) { skipped++; continue; }

    const nickname = strVal(rowVal(row, ['Nickname','Nick Name','\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e25\u0e48\u0e19']));
    const hiringType = normalizeImportHiringType(rowVal(row, ['TYPE','Type','Employment Type','\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17']));
    const from = strVal(rowVal(row, ['From','from','\u0e15\u0e49\u0e19\u0e17\u0e32\u0e07']));
    const position = strVal(rowVal(row, ['\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e07\u0e32\u0e19\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19 (Agreement)','Position','\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07']));
    const level = strVal(rowVal(row, ['Level','level'])) || 'Mid';
    const department = strVal(rowVal(row, ['\u0e41\u0e1c\u0e19\u0e01','Department','Dept']));
    const email = strVal(rowVal(row, ['Email','email','E-mail']));
    const onboard = parseExcelDate(rowVal(row, ['Onboard','onboard','Onboard Date']));
    const offboard = parseExcelDate(rowVal(row, ['Offboard','offboard','Offboard Date']));
    const offboardReached = !!(offboard && offboard <= todayISO);
    const startDate = parseExcelDate(rowVal(row, ['\u0e27\u0e31\u0e19\u0e40\u0e23\u0e34\u0e48\u0e21\u0e07\u0e32\u0e19','Start Date','Start','start_date'])) || onboard || todayISO;
    const role = strVal(rowVal(row, ['Role','role']));
    const existingMasterRow = employeeCode ? byEmployee.get(employeeCode.toLowerCase()) : byName.get(resourceName.toLowerCase());
    const existingRow = employeeCode ? byRequestEmployee.get(employeeCode.toLowerCase()) : existing.find(r => strVal(r.resourceName).toLowerCase() === resourceName.toLowerCase());
    const meta = [
      nickname ? `Nickname: ${nickname}` : '',
      email ? `Email: ${email}` : '',
      from ? `From: ${from}` : '',
      role ? `Role: ${role}` : '',
      department ? `Department: ${department}` : '',
    ].filter(Boolean).join('\n');
    const masterPayload = {
      ...(existingMasterRow||{}),
      id: existingMasterRow?.id || resourceImportId(employeeCode || resourceName, i),
      employeeCode,
      resourceName,
      resourceNameTh: thaiName || resourceName,
      resourceNameEn: englishName,
      nickname,
      email,
      resourceTeam: department || role || existingMasterRow?.resourceTeam || 'Resource',
      position: position || role || existingMasterRow?.position || 'Resource',
      level,
      employmentType: hiringType,
      sourceCompany: from,
      currentProject: project || existingMasterRow?.currentProject || '',
      status: offboardReached ? 'offboarded' : 'active',
      onboardDate: onboard || startDate,
      offboardDate: offboard || '',
      note: meta,
      requestId: existingRow?.id || existingMasterRow?.requestId || '',
      createdAt: existingMasterRow?.createdAt || now,
      updatedAt: now,
    };
    const savedMaster = await saveResourceMasterAsync(masterPayload);
    const id = existingRow?.id || savedMaster.requestId || resourceImportId(employeeCode || resourceName, i);
    const payload = {
      ...(existingRow||{}),
      id,
      resourceMasterId: savedMaster.id,
      resourceTeam: savedMaster.resourceTeam || existingRow?.resourceTeam || 'Resource',
      project: savedMaster.currentProject || existingRow?.project || 'Unassigned',
      position: savedMaster.position || existingRow?.position || 'Resource',
      level,
      hc: 1,
      hiringType,
      startDate,
      endDate: offboard || null,
      requestDate: existingRow?.requestDate || onboard || startDate || todayISO,
      resolvedDate: offboardReached ? (existingRow?.resolvedDate || offboard || todayISO) : null,
      remark: meta,
      status: offboardReached ? 'resolved' : 'filled',
      requesterName: existingRow?.requesterName || 'Employee Import',
      transferFrom: existingRow?.transferFrom || null,
      projectCodes: existingRow?.projectCodes || [],
      resourceName: savedMaster.resourceName,
      resourceNameTh: savedMaster.resourceNameTh,
      resourceNameEn: savedMaster.resourceNameEn,
      employeeCode,
      primaryProjectCode: existingRow?.primaryProjectCode || '',
      allocationPercent: existingRow?.allocationPercent || 100,
      onboardDate: savedMaster.onboardDate || startDate,
      offboardDate: offboard || null,
      activityLog: [...(existingRow?.activityLog||[]), { action: existingRow ? 'Employee import updated' : 'Employee imported', to: project, by:'Employee Import', remark:'Imported from employee file', at:now }],
      createdAt: existingRow?.createdAt || now,
      updatedAt: now,
    };
    const saved = await saveResourceAsync(payload);
    const linkedMaster = { ...savedMaster, requestId: saved?.id || payload.id };
    await saveResourceMasterAsync(linkedMaster);
    if(employeeCode) byEmployee.set(employeeCode.toLowerCase(), linkedMaster);
    if(resourceName) byName.set(resourceName.toLowerCase(), linkedMaster);
    if(employeeCode) byRequestEmployee.set(employeeCode.toLowerCase(), saved || payload);
    if(existingMasterRow || existingRow) updated++; else added++;
    if(offboardReached) offboarded++; else active++;
  }

  if(typeof renderResource === 'function') renderResource();
  alert(`Employee import completed\nAdded: ${added}\nUpdated: ${updated}\nActive: ${active}\nOffboarded: ${offboarded}\nSkipped: ${skipped}`);
}

function importProjectCodes(rows) {
  if(typeof loadProjectCodeMaster !== 'function' || typeof storeProjectCodeMaster !== 'function') {
    alert('Resource module is not ready. Please open Resource Management and try again.');
    return;
  }
  const existing = loadProjectCodeMaster();
  const byCode = new Map(existing.filter(c => strVal(c.code)).map(c => [strVal(c.code).toLowerCase(), c]));
  let added = 0, updated = 0, skipped = 0;
  rows.forEach((row, index) => {
    const code = strVal(rowVal(row, ['Project Code','project_code','Code']));
    const project = strVal(rowVal(row, ['Project','project','โครงการ']));
    if(!code || !project) { skipped++; return; }
    const orgProject = typeof ensureProjectInSettingsMaster === 'function'
      ? ensureProjectInSettingsMaster(project, { owner: strVal(rowVal(row, ['PM Owner','PM','Owner','pm_owner'])) })
      : null;
    const current = byCode.get(code.toLowerCase());
    const item = {
      ...(current||{}),
      id: current?.id || code.replace(/\s+/g, '-'),
      organizationProjectId: orgProject?.id || current?.organizationProjectId || '',
      no: strVal(rowVal(row, ['No','NO','#'])) || current?.no || String(index + 1),
      project,
      type: strVal(rowVal(row, ['Type','TYPE','ประเภท'])),
      code,
      startDate: parseProjectCodeDate(rowVal(row, ['Start','start','Start Date'])),
      endDate: parseProjectCodeDate(rowVal(row, ['End','end','End Date'])),
      status: strVal(rowVal(row, ['Status','status'])) || 'Active',
      pmOwner: strVal(rowVal(row, ['PM Owner','PM','Owner','pm_owner'])),
      updatedAt: new Date().toISOString(),
    };
    byCode.set(code.toLowerCase(), item);
    if(current) updated++; else added++;
  });
  storeProjectCodeMaster([...byCode.values()]);
  if(typeof renderResource === 'function') renderResource();
  alert(`Project Code import completed\nAdded: ${added}\nUpdated: ${updated}\nSkipped: ${skipped}`);
}

async function importLicenses(rows) {
  const existing = loadManualLicenses();
  const now = new Date().toISOString();
  let added = 0, skipped = 0, updated = 0;
  const changed = [];

  const licenseDateKey = value => {
    const raw = String(value || '').trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    if(Number.isNaN(date.getTime())) return raw;
    return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  };
  const licenseKey = l => [
    l.memoNo, l.name, l.plan, l.project, licenseDateKey(l.purchaseDate), licenseDateKey(l.expiry),
  ].map(v => String(v || '').trim().toLowerCase()).join('||');

  rows.forEach(row => {
    const name = strVal(row['Name'] || row['name'] || row['Software Name'] || row['software_name'] || row['à¸Šà¸·à¹ˆà¸­ Software']);
    if(!name) { skipped++; return; }

    const license = {
      id: crypto.randomUUID(),
      name,
      plan:          strVal(row['Plan'] || row['plan'] || row['Tier'] || row['tier']),
      vendor:        strVal(row['Vendor'] || row['vendor'] || row['à¸œà¸¹à¹‰à¸‚à¸²à¸¢']),
      seats:         numVal(row['Seats'] || row['seats'] || row['à¸ˆà¸³à¸™à¸§à¸™']) || 1,
      pricePerMonth: numVal(row['Price/Month'] || row['price_per_month'] || row['à¸£à¸²à¸„à¸²/à¹€à¸”à¸·à¸­à¸™']),
      owner:         strVal(row['Owner'] || row['owner'] || row['à¸œà¸¹à¹‰à¸£à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸š']),
      department:    strVal(row['Department'] || row['department'] || row['à¹à¸œà¸™à¸']),
      project:       strVal(row['Project'] || row['project'] || row['à¹‚à¸„à¸£à¸‡à¸à¸²à¸£']),
      licenseType:   strVal(row['License Type'] || row['license_type'] || 'subscription'),
      purchaseDate:  parseExcelDate(row['Purchase Date'] || row['purchase_date'] || row['à¸§à¸±à¸™à¸—à¸µà¹ˆà¸‹à¸·à¹‰à¸­']),
      expiry:        (() => {
        const d = parseExcelDate(row['Expiry Date'] || row['expiry_date'] || row['à¸§à¸±à¸™à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸']);
        return d ? new Date(d+'T00:00:00').toISOString() : null;
      })(),
      billingFreq:   strVal(row['Billing Freq'] || row['billing_freq'] || 'monthly'),
      statusOverride: (() => {
        const s = strVal(row['Status'] || row['status'] || '').toLowerCase();
        return ['cancelled','suspended'].includes(s) ? s : null;
      })(),
      memoNo:        strVal(row['Memo Ref'] || row['memo_ref'] || row['à¹€à¸¥à¸‚ Memo']),
      note:          strVal(row['Note'] || row['note'] || row['à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸']),
      source:        'manual',
      createdAt:     now,
      updatedAt:     now,
    };
    const matchIdx = existing.findIndex(item => licenseKey(item) === licenseKey(license));
    if(matchIdx >= 0) {
      const refreshed = {
        ...existing[matchIdx],
        ...license,
        id: existing[matchIdx].id,
        createdAt: existing[matchIdx].createdAt || now,
      };
      existing[matchIdx] = refreshed;
      changed.push(refreshed);
      updated++;
    } else {
      existing.push(license);
      changed.push(license);
      added++;
    }
  });

  storeManualLicenses(existing);
  await Promise.all(changed.map(license => saveLicenseAsync(license)));
  renderLicense();
  alert(`License import completed\nAdded: ${added}\nUpdated: ${updated}${skipped ? `\nSkipped blank rows: ${skipped}` : ''}`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DEVICE IMPORT
// Template columns:
// Name | Type | Serial No | Asset Tag | Owner | Assigned Date | Project |
// Return Date | Warranty Expiry | Condition | Status | Memo Ref | Note
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function importDevices(rows) {
  const existing = loadDevices();
  const now = new Date().toISOString();
  let added = 0, skipped = 0;

  rows.forEach(row => {
    const name = strVal(row['Name'] || row['name'] || row['Device Name'] || row['à¸Šà¸·à¹ˆà¸­à¸­à¸¸à¸›à¸à¸£à¸“à¹Œ']);
    if(!name) { skipped++; return; }

    const typeRaw = strVal(row['Type'] || row['type'] || row['à¸›à¸£à¸°à¹€à¸ à¸—']).toLowerCase();
    const typeMap = { 'mobile phone':'mobile', 'mobile':'mobile', 'laptop':'laptop', 'tablet':'tablet', 'other':'other' };
    const type = typeMap[typeRaw] || 'other';

    const condRaw = strVal(row['Condition'] || row['condition'] || row['à¸ªà¸ à¸²à¸ž']).toLowerCase();
    const condMap = { 'new':'new', 'good':'good', 'fair':'fair', 'poor':'poor' };
    const condition = condMap[condRaw] || 'good';

    const statusRaw = strVal(row['Status'] || row['status'] || row['à¸ªà¸–à¸²à¸™à¸°']).toLowerCase().replace(' ','-');
    const statusMap = { 'in-use':'in-use', 'in use':'in-use', 'available':'available', 'maintenance':'maintenance', 'retired':'retired' };
    const status = statusMap[statusRaw] || 'in-use';

    const device = {
      id: nextDeviceId() + added,
      name, type, condition, status,
      serial:       strVal(row['Serial No'] || row['serial_no'] || row['Serial Number'] || row['Serial'] || row['à¹€à¸¥à¸‚ Serial']),
      assetTag:     strVal(row['Asset Tag'] || row['asset_tag'] || row['à¸£à¸«à¸±à¸ªà¸—à¸£à¸±à¸žà¸¢à¹Œà¸ªà¸´à¸™']),
      owner:        strVal(row['Owner'] || row['owner'] || row['à¸œà¸¹à¹‰à¸–à¸·à¸­à¸„à¸£à¸­à¸‡']),
      assignedDate: parseExcelDate(row['Assigned Date'] || row['assigned_date'] || row['à¸§à¸±à¸™à¸—à¸µà¹ˆà¸£à¸±à¸š']),
      project:      strVal(row['Project'] || row['project'] || row['à¹‚à¸„à¸£à¸‡à¸à¸²à¸£']),
      returnDate:   parseExcelDate(row['Return Date'] || row['return_date'] || row['à¸§à¸±à¸™à¸„à¸·à¸™']),
      warranty:     parseExcelDate(row['Warranty Expiry'] || row['warranty'] || row['Warranty'] || row['à¸›à¸£à¸°à¸à¸±à¸™']),
      memoRef:      strVal(row['Memo Ref'] || row['memo_ref'] || row['à¹€à¸¥à¸‚ Memo']),
      note:         strVal(row['Note'] || row['note'] || row['à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸']),
      createdAt:    now,
      updatedAt:    now,
    };
    existing.push(device);
    added++;
  });

  storeDevices(existing);
  renderDevice();
  alert(`Device import completed\nAdded: ${added}${skipped ? `\nSkipped blank rows: ${skipped}` : ''}`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BUDGET HISTORICAL MEMO IMPORT
// Template columns:
// Memo No | Type | Project | Requester | Reviewer | Approver | Amount | Status | Date | Subject | Reason
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function importBudgetMemos(rows) {
  const existing = loadMemos();
  const existingNos = new Set(existing.map(m => m.memoNo));
  const now = new Date().toISOString();
  let added = 0, dupes = 0, skipped = 0;

  const typeMap = { 'sl':'sl','hw':'hw','int':'int','ent':'ent','dep':'dep',
    'software license':'sl','hardware':'hw','team activity':'int',
    'client expense':'ent','deployment':'dep' };
  const TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' };

  rows.forEach(row => {
    const memoNo = strVal(row['Memo No'] || row['memo_no'] || row['เลข Memo']);
    if(!memoNo) { skipped++; return; }
    if(existingNos.has(memoNo)) { dupes++; return; }

    const typeRaw = strVal(row['Type'] || row['type'] || row['ประเภท']).toLowerCase();
    const type = typeMap[typeRaw] || 'sl';

    const statusRaw = strVal(row['Status'] || row['status'] || 'completed').toLowerCase();
    const status = ['completed','rejected','pending','cancelled'].includes(statusRaw) ? statusRaw : 'completed';

    const dateStr = parseExcelDate(row['Date'] || row['date'] || row['วันที่']);
    const dateISO = dateStr ? new Date(dateStr+'T00:00:00').toISOString() : now;

    const memo = {
      memoNo,
      type,
      typeLabel: TYPE_LABELS[type] || type.toUpperCase(),
      status,
      project:       strVal(row['Project'] || row['project'] || row['โครงการ']),
      requesterName: strVal(row['Requester'] || row['requester'] || row['ผู้ขอ']),
      reviewerName:  strVal(row['Reviewer'] || row['reviewer'] || '-'),
      approverName:  strVal(row['Approver'] || row['approver'] || row['ผู้อนุมัติ']),
      approvedBy:    strVal(row['Approver'] || row['approver'] || row['ผู้อนุมัติ']),
      total:         numVal(row['Amount'] || row['amount'] || row['วงเงิน']),
      subject:       strVal(row['Subject'] || row['subject'] || row['หัวข้อ']),
      reason:        strVal(row['Reason'] || row['reason'] || row['เหตุผล']),
      date:          dateStr,
      createdAt:     dateISO,
      updatedAt:     dateISO,
      approvedAt:    status === 'completed' ? dateISO : undefined,
      sections:      [],
      auditLog:      [{ actor:'Import', action:'imported from Excel', comment:'Historical data import', timestamp:now }],
      source:        'import',
    };
    existing.push(memo);
    existingNos.add(memoNo);
    added++;
  });

  storeMemos(existing);
  renderBudget();
  let msg = `✓ Import สำเร็จ\nเพิ่ม ${added} memo`;
  if(dupes)   msg += `\nข้าม ${dupes} รายการที่ Memo No ซ้ำ`;
  if(skipped) msg += `\nข้าม ${skipped} แถวว่าง`;
  alert(msg);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DOWNLOAD TEMPLATES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function downloadTemplate(type) {
  if(typeof XLSX === 'undefined') { alert('SheetJS is still loading. Please wait a moment and try again.'); return; }

  const templates = {
    license: {
      filename: 'license_import_template.xlsx',
      headers: ['Name','Plan','Vendor','Seats','Price/Month','Owner','Department','Project','License Type','Purchase Date','Expiry Date','Billing Freq','Status','Memo Ref','Note'],
      sample: [['GitHub Copilot','Business','GitHub',15,600,'Chuen K.','PMO','AOA-MP','subscription','2025-01-01','2026-01-01','annual','','ORB-2501-001',''],
               ['Figma','Professional','Figma Inc',5,900,'Design Lead','Design','Release 3','subscription','2025-03-01','2026-03-01','annual','','','']]
    },
    device: {
      filename: 'device_import_template.xlsx',
      headers: ['Name','Type','Serial No','Asset Tag','Owner','Assigned Date','Project','Return Date','Warranty Expiry','Condition','Status','Memo Ref','Note'],
      sample: [['MacBook Pro 14','laptop','SN12345','OD-001','Chuen K.','2025-01-15','AOA-MP','','2027-01-15','good','in-use','ORB-2501-002',''],
               ['iPhone 15 Pro','mobile','IMEI67890','OD-002','Tom P.','2025-02-01','TTB','','2027-02-01','new','in-use','','']]
    },
    budget: {
      filename: 'budget_import_template.xlsx',
      headers: ['Memo No','Type','Project','Requester','Reviewer','Approver','Amount','Status','Date','Subject','Reason'],
      sample: [['ORB-2401-001','sl','AOA-MP','Chuen K.','Nina Review','Phi Wing',108000,'completed','2024-01-15','ขออนุมัติ Software License','เป็นโปรแกรมที่ใช้งานประจำ'],
               ['ORB-2402-001','hw','TTB','Tom P.','Nina Review','Phi Wing',79000,'completed','2024-02-10','ขออนุมัติซื้อ Laptop','เพื่อรองรับทีมงานใหม่']]
    }
  };

  templates.resourcePeople = {
    filename: 'employee_people_import_template.xlsx',
    headers: ['\u0e23\u0e2b\u0e31\u0e2a\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19','\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25','Name','Surname','Nickname','Project','TYPE','From','\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e07\u0e32\u0e19\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19 (Agreement)','Level','\u0e41\u0e1c\u0e19\u0e01','Email','Onboard','Offboard','\u0e27\u0e31\u0e19\u0e40\u0e23\u0e34\u0e48\u0e21\u0e07\u0e32\u0e19','Role'],
    sample: [['EMP001','Person A Example','Person','Example','A','Project A','Direct Head Count (Permanent)','Orbit','Business Analyst','Senior','BA','person.a@example.com','2026-01-01','','2026-01-01','BA'],
             ['EMP002','Person B Example','Person','Example','B','Project B','Secondment','ParentCo','Developer','Mid','FE','person.b@example.com','2026-02-01','','2026-02-01','Frontend Developer'],
             ['EMP003','Person C Example','Person','Example','C','Project C','Sub-contract','VendorCo','QA Engineer','Junior','QA','person.c@example.com','2026-03-01','','2026-03-01','QA']]
  };
  templates.projectCodes = {
    filename: 'project_code_import_template.xlsx',
    headers: ['No','Project','Type','Project Code','Start','End','Status','PM Owner'],
    sample: [
      ['1','AOA','','AOA-Intern','','','Active','K.Pirunrung'],
      ['6','ACC','','ACC-Intern(18 May - 15 Aug 2026)','2026-05-18','2026-08-15','Active','K.Chotima'],
      ['','MA-DSC','','DSC - MA (13 Mar - 31 Dec 2026)','2026-03-13','2026-12-31','Pending','K.Akkares'],
    ]
  };
  const t = templates[type];
  if(!t) return;

  const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample]);
  // Style header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for(let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({r:0, c});
    if(!ws[addr]) continue;
    ws[addr].s = { font:{bold:true}, fill:{fgColor:{rgb:'E6F1FB'}} };
  }
  // Column widths
  ws['!cols'] = t.headers.map(() => ({wch:18}));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, t.filename);
}
