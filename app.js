// ─────────────────────────────────────────
// Supabase client + storage layer
// Replaces localStorage for memos, licenses, devices
// ─────────────────────────────────────────
const PMO_CONFIG = window.__PMO_CONFIG__ || {};
const SUPA_URL = String(PMO_CONFIG.supabaseUrl || '').replace(/\/$/, '');
const SUPA_KEY = String(PMO_CONFIG.supabaseAnonKey || '');

// ── Supabase REST helper ──
const SUPA_FETCH_TIMEOUT_MS = 6000;

async function supaFetch(table, method='GET', body=null, query='') {
  if(!SUPA_URL || !SUPA_KEY) {
    throw new Error('Supabase is not configured. Generate config.js from config.example.js.');
  }
  const url = SUPA_URL + '/rest/v1/' + table + query;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = ctrl ? setTimeout(() => ctrl.abort(), SUPA_FETCH_TIMEOUT_MS) : null;
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + ((typeof pmoAuthAccessToken === 'function' && pmoAuthAccessToken()) || SUPA_KEY),
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' && query.includes('on_conflict') ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
  };
  if(method === 'GET') headers['Accept'] = 'application/json';
  try {
    const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null, signal: ctrl?.signal });
    if(!resp.ok) {
      const err = await resp.text();
      throw new Error('Supabase ' + method + ' ' + table + ': ' + err);
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  } catch(e) {
    if(e && e.name === 'AbortError') throw new Error('Supabase ' + method + ' ' + table + ' timed out');
    throw e;
  } finally {
    if(timeout) clearTimeout(timeout);
  }
}

// ── Memo field mapping: JS camelCase ↔ DB snake_case ──
// ── Shared financial models (Phase 1A — local storage only) ──
const SPEND_TYPES = Object.freeze({
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  TEAM_ACTIVITY: 'Team Activity',
  CLIENT_EXPENSE: 'Client Expense',
  DEPLOYMENT: 'Deployment',
  INFRA: 'Infra',
  OTHERS: 'Others',
});
const SPEND_TYPE_VALUES = Object.freeze(Object.values(SPEND_TYPES));
const MEMO_TYPE_TO_SPEND_TYPE = Object.freeze({
  sl: SPEND_TYPES.SOFTWARE,
  hw: SPEND_TYPES.HARDWARE,
  int: SPEND_TYPES.TEAM_ACTIVITY,
  ent: SPEND_TYPES.CLIENT_EXPENSE,
  dep: SPEND_TYPES.DEPLOYMENT,
  infra: SPEND_TYPES.INFRA,
  other: SPEND_TYPES.OTHERS,
});
const SPEND_TYPE_TO_MEMO_TYPE = Object.freeze({
  [SPEND_TYPES.SOFTWARE]: 'sl',
  [SPEND_TYPES.HARDWARE]: 'hw',
  [SPEND_TYPES.TEAM_ACTIVITY]: 'int',
  [SPEND_TYPES.CLIENT_EXPENSE]: 'ent',
  [SPEND_TYPES.DEPLOYMENT]: 'dep',
  [SPEND_TYPES.INFRA]: 'infra',
  [SPEND_TYPES.OTHERS]: 'other',
});
const ACTUAL_SPEND_SOURCES = Object.freeze({
  APPROVED_MEMO: 'Approved Memo',
  MANUAL_EXPENSE: 'Manual / Historical Expense',
  INFRA_COST: 'Infra Cost',
});
const ACTUAL_SPEND_SOURCE_VALUES = Object.freeze(Object.values(ACTUAL_SPEND_SOURCES));
const FINANCIAL_STORAGE_KEYS = Object.freeze({
  actualSpend: 'orbit-pmo-actual-spend-v1',
  budgetPools: 'orbit-pmo-budget-pools-v1',
});
const SUPPORTED_CURRENCIES = Object.freeze(['THB']);
const BUDGET_STATUSES = Object.freeze({
  MANUAL_OVERRIDE: 'Manual Override',
  MAPPED: 'Mapped',
  NEEDS_PMO_REVIEW: 'Needs PMO Review',
  UNBUDGETED: 'Unbudgeted',
});

function spendTypeFromMemoType(memoType) {
  return MEMO_TYPE_TO_SPEND_TYPE[String(memoType || '').trim().toLowerCase()] || SPEND_TYPES.OTHERS;
}

function parseStrictCalendarValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] == null ? null : Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day != null) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  }
  return { text, year, month, day, precision: day == null ? 'month' : 'date' };
}

function isValidCalendarRange(startValue, endValue) {
  const start = parseStrictCalendarValue(startValue);
  const end = parseStrictCalendarValue(endValue);
  if (!start || !end || start.precision !== end.precision) return false;
  return start.text <= end.text;
}

function inclusiveCoverageMonths(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = parseStrictCalendarValue(startDate);
  const end = parseStrictCalendarValue(endDate);
  if (!start || !end || !isValidCalendarRange(startDate, endDate)) return null;
  return (end.year - start.year) * 12 + end.month - start.month + 1;
}

function generateFinancialRecordId(prefix = 'record') {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

function normalizeActualSpendDetailLines(detailLines) {
  if (!Array.isArray(detailLines)) return [];
  return detailLines.filter(line => line && typeof line === 'object' && !Array.isArray(line)).map(line => ({
    program: String(line.program || ''),
    plan: String(line.plan || ''),
    description: String(line.description || ''),
    quantity: Number(line.quantity) || 0,
    unitCost: Number(line.unitCost) || 0,
    monthlyCost: Number(line.monthlyCost) || 0,
    coverageStart: line.coverageStart || null,
    coverageEnd: line.coverageEnd || null,
    coverageMonths: Number(line.coverageMonths) > 0 ? Number(line.coverageMonths) : null,
    lineAmount: Number(line.lineAmount) || 0,
  }));
}

function createActualSpendRecord(input = {}) {
  const now = new Date().toISOString();
  const startDate = input.startDate || null;
  const endDate = input.endDate || null;
  const coverageMonths = inclusiveCoverageMonths(startDate, endDate);
  const coverageStatus = !startDate || !endDate ? 'Missing Coverage'
    : coverageMonths ? 'Complete' : 'Invalid Coverage';
  const effectiveDate = startDate || input.date || null;
  return {
    id: input.id || generateFinancialRecordId('actual-spend'),
    source: input.source || '',
    referenceNo: input.referenceNo || '',
    memoId: input.memoId || null,
    project: input.project || '',
    spendType: input.spendType || SPEND_TYPES.OTHERS,
    amount: Number(input.amount) || 0,
    currency: input.currency || 'THB',
    startDate,
    endDate,
    month: input.month || (effectiveDate ? String(effectiveDate).slice(0, 7) : null),
    year: input.year || (effectiveDate ? String(effectiveDate).slice(0, 4) : null),
    coverageMonths,
    coverageStatus,
    vendorProgram: input.vendorProgram || '',
    description: input.description || '',
    notes: input.notes || '',
    detailLines: normalizeActualSpendDetailLines(input.detailLines),
    autoBudgetPoolId: input.autoBudgetPoolId || null,
    manualBudgetPoolId: input.manualBudgetPoolId || null,
    finalBudgetPoolId: input.manualBudgetPoolId || input.finalBudgetPoolId || input.autoBudgetPoolId || null,
    budgetStatus: input.budgetStatus || 'Unbudgeted',
    // Preserved across normalization so a blocked cross-year override (Phase 7A-3) stays
    // detectable after a store/reload cycle, not only in mapBudgetPool()'s immediate return value.
    mappingWarning: input.mappingWarning || null,
    createdBy: input.createdBy || '',
    createdAt: input.createdAt || now,
    updatedBy: input.updatedBy || '',
    updatedAt: input.updatedAt || now,
  };
}

function validateActualSpendRecord(input) {
  const record = createActualSpendRecord(input);
  const errors = [];
  if (!ACTUAL_SPEND_SOURCE_VALUES.includes(record.source)) errors.push('Invalid Source');
  if (!record.project) errors.push('Project is required');
  if (!SPEND_TYPE_VALUES.includes(record.spendType)) errors.push('Invalid Spend Type');
  if (!(record.amount > 0)) errors.push('Amount must be greater than zero');
  if (!SUPPORTED_CURRENCIES.includes(record.currency)) errors.push(`Currency must be ${SUPPORTED_CURRENCIES.join(' or ')}`);
  if (record.startDate && !parseStrictCalendarValue(record.startDate)) errors.push('Invalid Start Date');
  if (record.endDate && !parseStrictCalendarValue(record.endDate)) errors.push('Invalid End Date');
  if (record.coverageStatus === 'Invalid Coverage') errors.push('Invalid coverage period');
  return { valid: errors.length === 0, errors, record };
}

function actualSpendDuplicateKey(input = {}) {
  const record = createActualSpendRecord(input);
  return [
    record.source,
    record.referenceNo,
    record.project,
    record.spendType,
    record.amount,
    record.startDate || '',
    record.endDate || '',
  ].map(v => String(v).trim().toLowerCase()).join('|');
}

function validateActualSpendImport(rows, existingRows = []) {
  const existingKeys = new Set(existingRows.map(actualSpendDuplicateKey));
  const batchKeys = new Set();
  const records = [];
  const duplicates = [];
  const errors = [];
  (rows || []).forEach((row, index) => {
    const result = validateActualSpendRecord(row);
    if (!result.valid) {
      errors.push({ row: index + 1, errors: result.errors });
      return;
    }
    const key = actualSpendDuplicateKey(result.record);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      duplicates.push({ row: index + 1, record: result.record });
      return;
    }
    batchKeys.add(key);
    records.push(result.record);
  });
  return {
    valid: errors.length === 0,
    errors,
    duplicates,
    records: errors.length ? [] : records,
  };
}

function createBudgetPoolRecord(input = {}) {
  const hasCanonicalTypes = Object.prototype.hasOwnProperty.call(input, 'spendTypes');
  const legacyTypes = Array.isArray(input.memoTypes)
    ? (input.memoTypes.length ? input.memoTypes.map(spendTypeFromMemoType) : SPEND_TYPE_VALUES)
    : [];
  const spendTypes = (hasCanonicalTypes && Array.isArray(input.spendTypes) ? input.spendTypes : legacyTypes)
    .filter(t => SPEND_TYPE_VALUES.includes(t));
  const memoTypes = spendTypes.map(t => SPEND_TYPE_TO_MEMO_TYPE[t]).filter(Boolean);
  // Phase 7A-9A: createBudgetPoolRecord() is THE canonicalizer, so it must itself normalize a
  // legacy/typed BE value (e.g. "2569-01") to Gregorian before deriving year — otherwise
  // gregorianYearToBuddhistEra() double-converts into the "3112" bug at the model layer, and only
  // call sites that separately remembered to normalize first (e.g. the Edit modal) were protected.
  // Every canonical read (Budget Settings, BvA, exports, mapping) now inherits this for free.
  const effectiveStartDate = normalizeMonthValueToGregorian(input.startDate || input.startMonth) || null;
  const effectiveEndDate = normalizeMonthValueToGregorian(input.endDate || input.endMonth) || null;
  // Year is derived from the pool's own normalized coverage start whenever date data exists — an
  // independently-supplied input.year is never allowed to disagree with the pool's dates
  // (see docs/BvA_REQUIREMENT.md "Phase 7A-1" §2). Only fall back to input.year when there is
  // no date data to derive from at all.
  const derivedYear = effectiveStartDate ? gregorianYearToBuddhistEra(effectiveStartDate) : '';
  return {
    id: input.id || '',
    project: input.project || '',
    name: input.name || '',
    budget: Number(input.budget) || 0,
    currency: input.currency || 'THB',
    spendTypes,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    year: derivedYear || input.year || null,
    startMonth: effectiveStartDate,
    endMonth: effectiveEndDate,
    memoTypes,
    createdBy: input.createdBy || '',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedBy: input.updatedBy || '',
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function validateBudgetPoolRecord(input) {
  const record = createBudgetPoolRecord(input);
  const errors = [];
  if (!record.id) errors.push('ID is required');
  if (!record.project) errors.push('Project is required');
  if (!(record.budget > 0)) errors.push('Budget must be greater than zero');
  if (!SUPPORTED_CURRENCIES.includes(record.currency)) errors.push(`Currency must be ${SUPPORTED_CURRENCIES.join(' or ')}`);
  if (!record.spendTypes.length) errors.push('At least one Spend Type is required');
  if (!record.startDate || !record.endDate || !isValidCalendarRange(record.startDate, record.endDate)) {
    errors.push('Valid start/end month or date range is required');
  } else {
    const startParts = parseStrictCalendarValue(record.startDate);
    const endParts = parseStrictCalendarValue(record.endDate);
    if (startParts && endParts && startParts.year !== endParts.year) {
      errors.push('Budget Pool must not span multiple years');
    }
  }
  return { valid: errors.length === 0, errors, record };
}

function budgetPoolPeriodsOverlap(first, second) {
  const firstStart = first.startDate || first.startMonth;
  const firstEnd = first.endDate || first.endMonth;
  const secondStart = second.startDate || second.startMonth;
  const secondEnd = second.endDate || second.endMonth;
  return Boolean(firstStart && firstEnd && secondStart && secondEnd && firstStart <= secondEnd && secondStart <= firstEnd);
}

function validateBudgetPoolChange(input, existingPools = [], editId = null) {
  const result = validateBudgetPoolRecord(input);
  const errors = [...result.errors];
  const record = result.record;
  if (!record.name.trim()) errors.push('Pool Name is required');
  if (!String(record.year || '').trim()) errors.push('Year is required');
  const others = existingPools.map(createBudgetPoolRecord).filter(pool => pool.id !== (editId || record.id));
  const duplicate = others.find(pool =>
    pool.project === record.project &&
    pool.name.trim().toLowerCase() === record.name.trim().toLowerCase() &&
    String(pool.year || '') === String(record.year || '')
  );
  if (duplicate) errors.push('Duplicate Budget Pool for Project, Pool Name, and Year');
  const conflicts = others.filter(pool =>
    pool.project === record.project &&
    String(pool.year || '') === String(record.year || '') &&
    budgetPoolPeriodsOverlap(pool, record) &&
    pool.spendTypes.some(type => record.spendTypes.includes(type))
  );
  return { valid: errors.length === 0, errors, conflicts, record };
}

// Phase 7A-9D: Budget Pool bulk import validation — Create + Update in one workbook.
// Reuses validateBudgetPoolChange() row-by-row — no separate validation/duplicate engine — against
// a context that grows with every row already accepted earlier in the SAME batch, so two identical
// rows in one file are caught by the exact same duplicate check that already protects manual
// add/edit, not just rows vs. pre-existing pools.
// Import is strict all-or-nothing (docs/BvA_REQUIREMENT.md "Phase 7A-1" §7/§8, TD-7A-04): a
// row-level overlap conflict — merely a confirmable warning in the manual single-save flow — is
// escalated to a hard failure here, since Budget Pool is master data and there is no per-row
// "confirm through it" UI in a batch import.
//
// Update-decision contract (per the redesigned Bulk Upload workflow): Pool ID (`row.id`) is the
// ONLY thing that decides Create vs. Update. Business identity (project, name, year) remains
// validated for uniqueness via validateBudgetPoolChange() exactly as before, but it is never used
// to infer which pool a row updates — that inference was the pre-7A-9D behavior and could silently
// overwrite the wrong pool. A blank Pool ID always creates; a non-blank Pool ID must match a real
// existing pool.
function validateBudgetPoolImportBatch(rows, existingPools = []) {
  const canonicalExisting = existingPools.map(createBudgetPoolRecord);
  const existingById = new Map(canonicalExisting.map(pool => [pool.id, pool]));
  const accepted = [];
  const rowResults = [];
  let valid = true;

  const idOccurrences = new Map();
  (rows || []).forEach(row => {
    const id = String(row.id || '').trim();
    if (!id) return;
    idOccurrences.set(id, (idOccurrences.get(id) || 0) + 1);
  });

  (rows || []).forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1, matching the template's own row numbering
    const rowId = String(row.id || '').trim();

    if (rowId && idOccurrences.get(rowId) > 1) {
      valid = false;
      rowResults.push({
        row: rowNumber, ok: false,
        errors: ['Duplicate Pool ID — this Pool ID appears more than once in this file. Each Pool ID may be used by only one row.'],
        input: row,
      });
      return;
    }

    const existingMatch = rowId ? (existingById.get(rowId) || null) : null;
    if (rowId && !existingMatch) {
      valid = false;
      rowResults.push({
        row: rowNumber, ok: false,
        errors: ['Unknown Pool ID — no existing Budget Pool has this ID. Leave Pool ID blank to create a new pool instead.'],
        input: row,
      });
      return;
    }

    const candidate = createBudgetPoolRecord({
      project: row.proj,
      name: row.name,
      budget: row.budget,
      year: row.yr,
      startMonth: row.start,
      endMonth: row.end,
      memoTypes: row.memoTypes,
    });
    const id = existingMatch
      ? existingMatch.id
      : `pool-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${index}`;
    const context = canonicalExisting.concat(accepted);
    const result = validateBudgetPoolChange({ ...candidate, id }, context, existingMatch ? existingMatch.id : null);
    const errors = [...result.errors];

    if (row.invalidSpendTypes && row.invalidSpendTypes.length) {
      errors.push('Invalid Spend Type: ' + row.invalidSpendTypes.join(', '));
    }
    // Business rule update: overlapping Project + Spend Type + Period is allowed (PMO may
    // intentionally create multiple buckets for the same project/type/period to separate budget
    // purposes) -- result.conflicts is informational only and must never become an import error.
    // A record that resolves to more than one matching pool still becomes Needs PMO Review at
    // mapping time (mapBudgetPool(), unchanged) -- that is where ambiguity is handled, not here.
    // A blank Pool ID that nonetheless collides with an existing pool's business identity gets its
    // own explicit, actionable message — in addition to (not instead of) the generic duplicate
    // message above — since the fix ("restore the Pool ID, or rename") is different from the
    // fix for a genuine two-new-rows duplicate ("rename one of them").
    if (!rowId && result.errors.some(message => message.includes('Duplicate Budget Pool for Project, Pool Name, and Year'))) {
      errors.push('Existing Budget Pool detected, but Pool ID is blank. Restore Pool ID to update this Pool, or change Project / Pool Name / Budget Year to create a new Pool.');
    }

    if (errors.length) {
      valid = false;
      rowResults.push({ row: rowNumber, ok: false, errors, input: row });
      return;
    }

    let record = result.record;
    let action;
    if (!existingMatch) {
      action = 'create';
      record = { ...record, createdBy: currentUser(), updatedBy: currentUser() };
    } else {
      const sameSpendTypes = JSON.stringify([...existingMatch.spendTypes].sort()) === JSON.stringify([...record.spendTypes].sort());
      const unchanged = existingMatch.project === record.project &&
        existingMatch.name === record.name &&
        Number(existingMatch.budget) === Number(record.budget) &&
        String(existingMatch.year || '') === String(record.year || '') &&
        existingMatch.startMonth === record.startMonth &&
        existingMatch.endMonth === record.endMonth &&
        sameSpendTypes;
      if (unchanged) {
        // True no-op: reuse the existing record as-is so nothing (not even updatedAt/updatedBy)
        // changes if this row is later saved — callers should skip saving 'none' rows entirely.
        action = 'none';
        record = existingMatch;
      } else {
        action = 'update';
        record = { ...record, createdBy: existingMatch.createdBy, createdAt: existingMatch.createdAt, updatedBy: currentUser(), updatedAt: new Date().toISOString() };
      }
    }

    accepted.push(record);
    rowResults.push({ row: rowNumber, ok: true, record, action, previous: existingMatch || null });
  });

  return { valid, rowResults, records: valid ? accepted : [] };
}

function budgetPoolDeletionBlockers(poolId, records = [], manualExpenses = [], memos = []) {
  // A cross-year Manual Override being blocked (Phase 7A-3) clears the CANONICAL Actual Spend
  // record's manualBudgetPoolId/finalBudgetPoolId — but it never touches the underlying manual
  // expense's or memo's own persisted budgetPoolId field. Deletion must still be blocked if any
  // of those raw, persisted sources still reference this pool, even though canonical
  // reconciliation would no longer show an effective mapping to it.
  const canonicalBlockers = records.filter(record => getFinalBudgetPoolId(record) === poolId);
  const manualBlockers = manualExpenses.filter(expense => expense && expense.budgetPoolId === poolId);
  const memoBlockers = memos.filter(memo => memo && memo.budgetPoolId === poolId);
  return [...canonicalBlockers, ...manualBlockers, ...memoBlockers];
}

function loadFinancialRecords(storageKey) {
  try {
    const rows = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch(e) { return []; }
}

function storeFinancialRecords(storageKey, rows) {
  if (!Array.isArray(rows)) throw new Error('Financial storage requires an array');
  let validated;
  if (storageKey === FINANCIAL_STORAGE_KEYS.actualSpend) {
    validated = rows.map(validateActualSpendRecord);
  } else if (storageKey === FINANCIAL_STORAGE_KEYS.budgetPools) {
    validated = rows.map(validateBudgetPoolRecord);
  } else {
    throw new Error('Unsupported financial storage key');
  }
  const invalid = validated.find(result => !result.valid);
  if (invalid) throw new Error(invalid.errors.join('; '));
  const records = validated.map(result => result.record);
  localStorage.setItem(storageKey, JSON.stringify(records));
  return records;
}

function loadActualSpendRecords() {
  return loadFinancialRecords(FINANCIAL_STORAGE_KEYS.actualSpend).map(createActualSpendRecord);
}

function storeActualSpendRecords(rows) {
  return storeFinancialRecords(FINANCIAL_STORAGE_KEYS.actualSpend, rows.map(createActualSpendRecord));
}

function loadBudgetPoolRecords() {
  return loadFinancialRecords(FINANCIAL_STORAGE_KEYS.budgetPools).map(createBudgetPoolRecord);
}

function storeBudgetPoolRecords(rows) {
  return storeFinancialRecords(FINANCIAL_STORAGE_KEYS.budgetPools, rows.map(createBudgetPoolRecord));
}

function queryActualSpend(filters = {}, rows = loadActualSpendRecords()) {
  return rows.filter(record =>
    (!filters.source || record.source === filters.source) &&
    (!filters.project || record.project === filters.project) &&
    (!filters.spendType || record.spendType === filters.spendType) &&
    (!filters.currency || record.currency === filters.currency) &&
    (!filters.budgetStatus || record.budgetStatus === filters.budgetStatus) &&
    (!filters.fromDate || (record.startDate && record.startDate >= filters.fromDate)) &&
    (!filters.toDate || (record.endDate && record.endDate <= filters.toDate))
  );
}

function queryBudgetPools(filters = {}, rows = loadBudgetPoolRecords()) {
  return rows.filter(pool =>
    (!filters.project || pool.project === filters.project) &&
    (!filters.spendType || pool.spendTypes.includes(filters.spendType)) &&
    (!filters.currency || pool.currency === filters.currency) &&
    (!filters.date || ((!pool.startDate || filters.date >= pool.startDate) && (!pool.endDate || filters.date <= pool.endDate)))
  );
}

function getActualSpendByProject(project, rows) {
  return queryActualSpend({ project }, rows || loadActualSpendRecords());
}

function getBudgetPoolsByProject(project, rows) {
  return queryBudgetPools({ project }, rows || loadBudgetPoolRecords());
}

function getFinalBudgetPoolId(actualSpend = {}) {
  return actualSpend.manualBudgetPoolId || actualSpend.finalBudgetPoolId || actualSpend.autoBudgetPoolId || null;
}

function calendarValueInRange(value, startValue, endValue) {
  const date = parseStrictCalendarValue(value);
  const start = parseStrictCalendarValue(startValue);
  const end = parseStrictCalendarValue(endValue);
  if (!date || !start || !end) return false;
  if (date.precision === 'date' && start.precision === 'date' && end.precision === 'date') {
    return date.text >= start.text && date.text <= end.text;
  }
  const monthIndex = part => part.year * 12 + part.month;
  return monthIndex(date) >= monthIndex(start) && monthIndex(date) <= monthIndex(end);
}

function actualSpendMappingDate(actualSpend = {}) {
  return actualSpend.startDate || actualSpend.month || (actualSpend.year ? `${actualSpend.year}-01` : null);
}

function findMatchingBudgetPools(actualSpend, pools = []) {
  const mappingDate = actualSpendMappingDate(actualSpend);
  if (!mappingDate) return [];
  const recordYear = gregorianYearToBuddhistEra(mappingDate);
  return pools.filter(pool =>
    pool.project === actualSpend.project &&
    Array.isArray(pool.spendTypes) && pool.spendTypes.includes(actualSpend.spendType) &&
    calendarValueInRange(mappingDate, pool.startDate || pool.startMonth, pool.endDate || pool.endMonth) &&
    String(pool.year || '') === recordYear
  );
}

function mapBudgetPool(actualSpend, pools = []) {
  if (actualSpend.manualBudgetPoolId) {
    const selectedPool = pools.find(pool => pool.id === actualSpend.manualBudgetPoolId);
    if (selectedPool) {
      // Manual Override must match both project and year (docs/BvA_REQUIREMENT.md
      // "Phase 7A-1" §2/§4). A cross-project override otherwise "succeeds" but never appears in
      // BvA, which groups by project/pool scope — the amount looks silently missing rather than
      // Unbudgeted. Checked before year so the flag reports whichever mismatch is present.
      const sameProject = !actualSpend.project || !selectedPool.project || selectedPool.project === actualSpend.project;
      const mappingDate = actualSpendMappingDate(actualSpend);
      const sameYear = !mappingDate || String(selectedPool.year || '') === gregorianYearToBuddhistEra(mappingDate);
      if (!sameProject || !sameYear) {
        // Cross-project or cross-year Manual Override is blocked: clear every override/mapping
        // field so getFinalBudgetPoolId() cannot resurrect the blocked pool, and flag it so this
        // is detected/warned rather than silently normalized.
        return {
          ...actualSpend,
          manualBudgetPoolId: null,
          autoBudgetPoolId: null,
          finalBudgetPoolId: null,
          budgetStatus: BUDGET_STATUSES.UNBUDGETED,
          mappingWarning: !sameProject ? 'blocked-cross-project-override' : 'blocked-cross-year-override',
        };
      }
    }
    return {
      ...actualSpend,
      finalBudgetPoolId: actualSpend.manualBudgetPoolId,
      budgetStatus: BUDGET_STATUSES.MANUAL_OVERRIDE,
    };
  }
  if (actualSpend.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE) {
    return {
      ...actualSpend,
      autoBudgetPoolId: null,
      finalBudgetPoolId: null,
      budgetStatus: BUDGET_STATUSES.UNBUDGETED,
    };
  }
  const matches = findMatchingBudgetPools(actualSpend, pools);
  if (matches.length === 1) {
    return {
      ...actualSpend,
      autoBudgetPoolId: matches[0].id,
      finalBudgetPoolId: matches[0].id,
      budgetStatus: BUDGET_STATUSES.MAPPED,
    };
  }
  return {
    ...actualSpend,
    autoBudgetPoolId: null,
    finalBudgetPoolId: null,
    budgetStatus: matches.length > 1 ? BUDGET_STATUSES.NEEDS_PMO_REVIEW : BUDGET_STATUSES.UNBUDGETED,
  };
}

function mapActualSpendRecords(records = [], pools = []) {
  return records.map(record => mapBudgetPool(record, pools));
}

function calculateActualSpend(records = [], filters = {}) {
  return queryActualSpend(filters, records).reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

function actualSpendMonthlyAllocations(record = {}) {
  const start = String(record.startDate || record.month || '').slice(0, 7);
  const end = String(record.endDate || record.month || start).slice(0, 7);
  const months = inclusiveCoverageMonths(start, end);
  if (!months) {
    const fallback = String(record.createdAt || record.updatedAt || '').slice(0, 7);
    return fallback ? { [fallback]: Number(record.amount) || 0 } : {};
  }
  const result = {};
  const startParts = start.split('-').map(Number);
  const monthlyAmount = (Number(record.amount) || 0) / months;
  for (let index = 0; index < months; index++) {
    const date = new Date(Date.UTC(startParts[0], startParts[1] - 1 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    result[key] = monthlyAmount;
  }
  return result;
}

function calculateActualSpendInRange(records = [], fromMonth, toMonth, filters = {}) {
  return queryActualSpend(filters, records).reduce((sum, record) => {
    const allocations = actualSpendMonthlyAllocations(record);
    return sum + Object.entries(allocations).reduce((subtotal, [month, amount]) =>
      subtotal + ((!fromMonth || month >= fromMonth) && (!toMonth || month <= toMonth) ? amount : 0), 0);
  }, 0);
}

function calculateForecast(records = [], asOfDate = new Date(), filters = {}) {
  const anchor = new Date(asOfDate);
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();
  const months = [];
  for (let offset = -5; offset <= 6; offset++) {
    const date = new Date(anchorYear, anchorMonth + offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      kind: offset <= 0 ? 'actual' : 'forecast',
    });
  }
  const eligible = queryActualSpend(filters, records).filter(record =>
    (record.spendType === SPEND_TYPES.SOFTWARE || record.spendType === SPEND_TYPES.INFRA) &&
    record.coverageStatus === 'Complete'
  );
  const grouped = new Map();
  eligible.forEach(record => {
    const program = record.vendorProgram || record.description || record.referenceNo || record.spendType;
    const key = [record.project, program, record.spendType].join('\u0000');
    if (!grouped.has(key)) grouped.set(key, {
      project: record.project,
      program,
      spendType: record.spendType,
      values: Object.fromEntries(months.map(month => [month.key, 0])),
    });
    const row = grouped.get(key);
    const allocations = actualSpendMonthlyAllocations(record);
    const coverageEnd = String(record.endDate).slice(0, 7);
    const monthlyCost = (Number(record.amount) || 0) / record.coverageMonths;
    months.forEach(month => {
      const allocated = Number(allocations[month.key]) || 0;
      const carriedForecast = month.kind === 'forecast' && month.key > coverageEnd ? monthlyCost : 0;
      row.values[month.key] += allocated || carriedForecast;
    });
  });
  const rows = [...grouped.values()].sort((a, b) =>
    a.project.localeCompare(b.project) || a.spendType.localeCompare(b.spendType) || a.program.localeCompare(b.program)
  ).map(row => ({
    ...row,
    total: months.reduce((sum, month) => sum + row.values[month.key], 0),
  }));
  return { months, rows };
}

function forecastExportDataset(forecast = { months:[], rows:[] }) {
  const months = forecast.months || [];
  const rows = forecast.rows || [];
  return {
    headers: ['Project','Program','Spend Type', ...months.map(month => `${month.key} ${month.kind}`), 'Total'],
    rows: rows.map(row => [
      row.project, row.program, row.spendType,
      ...months.map(month => row.values[month.key] || 0),
      row.total,
    ]),
  };
}

function calculateBudgetUtilization(pool, records = []) {
  const actual = calculateActualSpend(
    records.filter(record => getFinalBudgetPoolId(record) === pool.id),
    { project: pool.project },
  );
  const budget = Number(pool.budget) || 0;
  return {
    budget,
    actual,
    remaining: budget - actual,
    utilizationPercent: budget > 0 ? actual / budget * 100 : 0,
  };
}

function financialYearToGregorian(year) {
  const numeric = Number(year);
  return numeric > 2400 ? String(numeric - 543) : String(numeric || '');
}

// Normalizes the year of a "YYYY-MM" / "YYYY-MM-DD" value that looks like Buddhist Era (e.g. a
// user typing "2569-01" into a Gregorian month input) down to Gregorian, via the same >2400
// threshold as financialYearToGregorian() above. An already-Gregorian value (or anything that
// isn't a plain "YYYY-..." string) passes through unchanged. Fixes the "3112" bug: deriving BE
// from an un-normalized BE-typed value double-converts (2569 + 543 = 3112) instead of converting
// once (2569 -> 2026 -> 2569).
function normalizeMonthValueToGregorian(value) {
  const str = String(value || '');
  const match = str.match(/^(\d{4})(-.*)?$/);
  if (!match) return str;
  return financialYearToGregorian(match[1]) + (match[2] || '');
}

// Shared Gregorian -> Buddhist Era year helper (the inverse of financialYearToGregorian above).
// Accepts either a full calendar value ("2026-01", "2026-01-15") or a bare year. Used wherever a
// Budget Pool or Actual Spend coverage year needs to be derived and compared consistently, so year
// conversion exists in exactly one place per docs/BvA_REQUIREMENT.md "Phase 7A-1" §2.
function gregorianYearToBuddhistEra(dateOrYear) {
  const parsed = parseStrictCalendarValue(dateOrYear);
  const numeric = parsed ? parsed.year : Number(String(dateOrYear || '').slice(0, 4));
  return numeric ? String(numeric + 543) : '';
}

// Shared "what year is it right now, in Thai Buddhist Era" helper. Every year filter/default that
// needs "today's" BE year (Budget vs Actual, Budget Settings, Overview KPIs) must call this instead
// of re-deriving `new Date().getFullYear() + 543` locally — Phase 7A-9A closes
// docs/BvA_REQUIREMENT.md "Phase 7A-1" §2 Known Issue #2.
function getCurrentBuddhistYear() {
  return gregorianYearToBuddhistEra(new Date().getFullYear());
}

// Phase 7A-9B: shared user-facing display helper for a Gregorian "YYYY-MM" (or full date) Budget
// Pool month value, e.g. "2026-01" -> "01/2569". Mirrors the app's existing dd/mm/yyyy-BE date
// convention (see parseThaiDate()) so month-only values read consistently with full dates
// elsewhere. Display-only: internal storage, comparison, and matching remain Gregorian and must
// keep using the raw "YYYY-MM" value, never this formatted string.
function formatMonthBE(value) {
  const parsed = parseStrictCalendarValue(value);
  if (!parsed) return '';
  return `${String(parsed.month).padStart(2, '0')}/${gregorianYearToBuddhistEra(value)}`;
}

let _organizationProjectsCache = null;
let _organizationProjectsLoaded = false;

function normalizeOrganizationProject(row = {}) {
  const name = String(row.name || row.project || row.code || '').trim();
  const code = String(row.code || name).trim();
  return {
    id: String(row.id || code || name).trim(),
    code,
    name,
    status: String(row.status || 'active').toLowerCase(),
  };
}

function fallbackProjectList() {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  return Array.isArray(s?.projects) ? s.projects : [];
}

async function loadOrganizationProjectsAsync() {
  _organizationProjectsLoaded = true;
  if (typeof checkSupa === 'function' && await checkSupa()) {
    try {
      const rows = await supaFetch('organization_projects', 'GET', null, '?status=eq.active&order=name.asc');
      _organizationProjectsCache = (rows || [])
        .map(normalizeOrganizationProject)
        .filter(project => project.status === 'active' && (project.name || project.code));
    } catch(e) {
      console.warn('organization_projects load failed; using local project fallback', e.message);
    }
  }
  return getCanonicalProjectList();
}

// Canonical Project list for owned project dropdowns. Supabase organization_projects is primary;
// local Settings is only an offline/first-load fallback.
function getCanonicalProjectList() {
  const source = Array.isArray(_organizationProjectsCache) && _organizationProjectsCache.length
    ? _organizationProjectsCache.map(project => project.name || project.code)
    : fallbackProjectList();
  const values = source
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function projectOptionsHtml(projects, selected = '', options = {}) {
  const current = String(selected || '').trim();
  const rows = (projects || []).map(project =>
    `<option value="${esc(project)}" ${project === current ? 'selected' : ''}>${esc(project)}</option>`
  );
  if (current && !rows.length && options.includeCurrentValue !== false) {
    rows.push(`<option value="${esc(current)}" selected>${esc(current)} / Current value</option>`);
  } else if (current && options.includeCurrentValue !== false && !(projects || []).includes(current)) {
    rows.push(`<option value="${esc(current)}" selected>${esc(current)} / Current value</option>`);
  }
  return rows.join('');
}

function setCanonicalProjectSelectOptions(select, options = {}) {
  if (!select) return [];
  const selected = String(options.selected ?? select.value ?? '').trim();
  const includeBlank = options.includeBlank !== false;
  const blankLabel = options.blankLabel || '- Select project -';
  const includeOther = !!options.includeOther;
  const projects = getCanonicalProjectList();
  const rows = [];
  if (includeBlank) rows.push(`<option value="">${esc(blankLabel)}</option>`);
  rows.push(projectOptionsHtml(projects, selected, {
    includeCurrentValue: selected !== 'other',
  }));
  if (includeOther) rows.push(`<option value="other" ${selected === 'other' ? 'selected' : ''}>อื่นๆ (กรอกเอง)</option>`);
  select.innerHTML = rows.join('');
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  else if (includeOther && selected) select.value = 'other';
  else select.value = '';
  return projects;
}

function refreshOwnedProjectControls() {
  if (typeof refreshMemoProjectOptions === 'function') refreshMemoProjectOptions();
  if (typeof refreshLicenseProjectOptions === 'function') refreshLicenseProjectOptions();
  if (typeof refreshDeviceProjectOptions === 'function') refreshDeviceProjectOptions();
}

function actualSpendOverlapsYear(record = {}, year) {
  const target = financialYearToGregorian(year);
  if (!target) return true;
  const start = String(record.startDate || record.month || record.year || record.createdAt || '').slice(0, 4);
  const end = String(record.endDate || record.month || record.year || record.updatedAt || record.createdAt || '').slice(0, 4);
  return (!start || start <= target) && (!end || end >= target);
}

// Free-text search shared by the Budget vs Actual filter bar — same substring-over-lowercased-
// fields convention as Manual Entries' search (renderManualEntries(), views/budget.js), so search
// behavior stays identical across the app instead of a second implementation.
function bvaRecordMatchesSearch(record = {}, search = '') {
  if (!search) return true;
  const haystack = [record.referenceNo, record.description, record.project, record.spendType]
    .filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(search);
}

function calculateBudgetVsActualDataset(pools = [], records = [], filters = {}) {
  const selectedPools = pools.filter(pool =>
    (!filters.year || String(pool.year || '') === String(filters.year)) &&
    (!filters.project || pool.project === filters.project)
  );
  const selectedPoolIds = new Set(selectedPools.map(pool => pool.id));
  const search = String(filters.search || '').trim().toLowerCase();
  // Reuses the shared queryActualSpend() project/spendType predicates instead of re-implementing
  // them here, so a Spend Type filter added to the Budget vs Actual UI cannot silently diverge from
  // the identical filter already used by Actual Spend (filteredActualSpendRecords()). Passing no
  // spendType/search (existing callers) is a no-op, so prior behavior/totals are unchanged.
  const scopedRecords = queryActualSpend({ project: filters.project, spendType: filters.spendType }, records)
    .filter(record => actualSpendOverlapsYear(record, filters.year) && bvaRecordMatchesSearch(record, search));
  const rows = selectedPools.map(pool => ({
    pool,
    records: scopedRecords.filter(record =>
      getFinalBudgetPoolId(record) === pool.id && record.project === pool.project
    ),
    ...calculateBudgetUtilization(pool, scopedRecords),
  }));
  const unbudgetedRecords = scopedRecords.filter(record =>
    !getFinalBudgetPoolId(record) && record.budgetStatus === BUDGET_STATUSES.UNBUDGETED
  );
  // Needs PMO Review records (ambiguous multi-pool matches) never carry a finalBudgetPoolId
  // (see mapBudgetPool()), so without this bucket they fell through every row filter above AND
  // the Unbudgeted filter (status check excludes them), silently vanishing from totals.actual.
  // They must be counted, but kept out of unbudgetedRecords so they are not mislabeled.
  const needsReviewRecords = scopedRecords.filter(record =>
    !getFinalBudgetPoolId(record) && record.budgetStatus === BUDGET_STATUSES.NEEDS_PMO_REVIEW
  );
  const mappedActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const unbudgetedActual = calculateActualSpend(unbudgetedRecords);
  const needsReviewActual = calculateActualSpend(needsReviewRecords);
  const budget = rows.reduce((sum, row) => sum + row.budget, 0);
  const actual = mappedActual + unbudgetedActual + needsReviewActual;
  return {
    filters: { ...filters },
    rows,
    unbudgetedRecords,
    needsReviewRecords,
    totals: {
      budget,
      actual,
      mappedActual,
      unbudgetedActual,
      needsReviewActual,
      remaining: budget - actual,
      utilizationPercent: budget > 0 ? actual / budget * 100 : 0,
    },
  };
}

function budgetVsActualExportDataset(dataset = { rows:[], unbudgetedRecords:[], needsReviewRecords:[], totals:{} }) {
  const rows = dataset.rows || [];
  const unbudgeted = dataset.unbudgetedRecords || [];
  const needsReview = dataset.needsReviewRecords || [];
  const detailRows = rows.map(row => [
    row.pool.id, row.pool.project, row.pool.name, row.pool.year,
    (row.pool.spendTypes || []).join(' + '), row.budget, row.actual, row.remaining,
    row.utilizationPercent, row.records.length, 'Budgeted',
  ]);
  if (unbudgeted.length) {
    detailRows.push([
      '', dataset.filters?.project || 'All Projects', 'Unbudgeted', dataset.filters?.year || '',
      '', 0, dataset.totals.unbudgetedActual, -dataset.totals.unbudgetedActual,
      0, unbudgeted.length, 'Unbudgeted',
    ]);
  }
  if (needsReview.length) {
    detailRows.push([
      '', dataset.filters?.project || 'All Projects', 'Needs PMO Review', dataset.filters?.year || '',
      '', 0, dataset.totals.needsReviewActual, -dataset.totals.needsReviewActual,
      0, needsReview.length, 'Needs PMO Review',
    ]);
  }
  return {
    headers: ['Pool ID','Project','Pool','Year','Spend Types','Budget','Actual Spend','Remaining Budget','Budget Utilization %','Items','Budget Status'],
    rows: detailRows,
    totals: { ...dataset.totals },
  };
}

const FINANCIAL_HELPERS = Object.freeze({
  queryActualSpend,
  queryBudgetPools,
  getActualSpendByProject,
  getBudgetPoolsByProject,
  getFinalBudgetPoolId,
  findMatchingBudgetPools,
  mapBudgetPool,
  mapActualSpendRecords,
  calculateActualSpend,
  actualSpendMonthlyAllocations,
  calculateActualSpendInRange,
  calculateForecast,
  forecastExportDataset,
  calculateBudgetUtilization,
  validateBudgetPoolChange,
  budgetPoolDeletionBlockers,
  calculateBudgetVsActualDataset,
  budgetVsActualExportDataset,
});

function importActualSpendRecords(rows) {
  const existing = loadActualSpendRecords();
  const result = validateActualSpendImport(rows, existing);
  if (!result.valid) return { ...result, saved: 0 };
  storeActualSpendRecords([...existing, ...result.records]);
  return { ...result, saved: result.records.length };
}

function memoCoveragePeriod(memo = {}) {
  const ranges = (memo.slItems || [])
    .filter(item => item.startMonth && item.endMonth && isValidCalendarRange(item.startMonth, item.endMonth));
  if (ranges.length) {
    return {
      startDate: ranges.map(item => item.startMonth).sort()[0],
      endDate: ranges.map(item => item.endMonth).sort().at(-1),
    };
  }
  if (memo.depStart && memo.depEnd && isValidCalendarRange(memo.depStart, memo.depEnd)) {
    return { startDate: memo.depStart, endDate: memo.depEnd };
  }
  return { startDate: null, endDate: null };
}

function softwareMemoDetailLines(slItems) {
  if (!Array.isArray(slItems)) return [];
  return slItems.map(item => {
    const quantity = Number(item.qty) || 0;
    const unitCost = Number(item.price) || 0;
    const enteredMonths = Number(item.months);
    const coverageMonths = enteredMonths > 0
      ? enteredMonths
      : inclusiveCoverageMonths(item.startMonth, item.endMonth);
    return {
      program: String(item.name || ''),
      plan: String(item.plan || ''),
      description: '',
      quantity,
      unitCost,
      monthlyCost: unitCost * quantity,
      coverageStart: item.startMonth || null,
      coverageEnd: item.endMonth || null,
      coverageMonths,
      lineAmount: unitCost * (coverageMonths || 0) * quantity,
    };
  });
}

function actualSpendFromMemo(memo, existing = null) {
  if (!memo || memo.status !== 'completed') return null;
  const coverage = memoCoveragePeriod(memo);
  const effectiveDate = String(memo.approvedAt || memo.updatedAt || memo.createdAt || '').slice(0, 10);
  const hasStructuredSoftwareItems = memo.type === 'sl' && Array.isArray(memo.slItems) && memo.slItems.length > 0;
  return createActualSpendRecord({
    ...existing,
    id: existing?.id || `actual-spend-memo-${memo.memoNo}`,
    source: ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    referenceNo: memo.memoNo,
    memoId: memo.memoNo,
    project: memo.project,
    spendType: spendTypeFromMemoType(memo.type),
    amount: memo.total,
    currency: memo.currency || 'THB',
    startDate: coverage.startDate,
    endDate: coverage.endDate,
    date: parseStrictCalendarValue(effectiveDate) ? effectiveDate : null,
    vendorProgram: (memo.slItems || []).map(item => item.name).filter(Boolean).join(', '),
    description: memo.subject || memo.reason || '',
    detailLines: memo.type === 'sl'
      ? (hasStructuredSoftwareItems ? softwareMemoDetailLines(memo.slItems) : existing?.detailLines)
      : [],
    manualBudgetPoolId: memo.manualBudgetPoolId || memo.budgetPoolId || existing?.manualBudgetPoolId || null,
    createdBy: memo.requesterName || existing?.createdBy || '',
    createdAt: existing?.createdAt || memo.createdAt,
    updatedBy: currentUser(),
  });
}

function syncMemoToActualSpend(memo, pools = loadBudgetPoolRecords()) {
  const records = loadActualSpendRecords();
  const index = records.findIndex(record => record.memoId === memo.memoNo || (
    record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO && record.referenceNo === memo.memoNo
  ));
  if (memo.status !== 'completed') {
    if (index >= 0) storeActualSpendRecords(records.filter((_, i) => i !== index));
    return null;
  }
  const mapped = mapBudgetPool(actualSpendFromMemo(memo, index >= 0 ? records[index] : null), pools);
  if (index >= 0) records[index] = mapped; else records.push(mapped);
  storeActualSpendRecords(records);
  return mapped;
}

function updateActualSpendBudgetOverride(memoNo, manualBudgetPoolId, pools = loadBudgetPoolRecords()) {
  const records = loadActualSpendRecords();
  const index = records.findIndex(record => record.memoId === memoNo);
  if (index < 0) return null;
  const updated = mapBudgetPool({ ...records[index], manualBudgetPoolId: manualBudgetPoolId || null }, pools);
  records[index] = updated;
  storeActualSpendRecords(records);
  return updated;
}

// ══════════════════════════════════════════════════════════════════
// GLOBAL: User profiles & authority limits cache
// ══════════════════════════════════════════════════════════════════
let _userProfilesCache = null;
let _authorityCache    = null;

async function loadUserProfilesAsync() {
  if(_userProfilesCache) return _userProfilesCache;
  try {
    const rows = await supaFetch('user_profiles','GET',null,'?order=full_name.asc');
    if(rows && rows.length){ _userProfilesCache = rows; return rows; }
  } catch(e){ console.warn('user_profiles load failed',e.message); }
  _userProfilesCache = [
    {id:1, full_name:'นาย นวพล งามวรโรจน์สกุล',  title:'ผู้อำนวยการโครงการ',     name_aliases:['นวพล','Nawaphon'],      is_approver:true, can_review:true, can_approve:true, is_active:true, is_pmo:true, email:'nawaphon@orbitdigital.co.th'},
    {id:2, full_name:'นาย ปกรณ์ เจียมสกุลทิพย์', title:'ประธานเจ้าหน้าที่บริหาร', name_aliases:['ปกรณ์','CEO','Pakorn'],  is_approver:true, can_review:true, can_approve:true, is_active:true, is_pmo:true, email:'pakorn@orbitdigital.co.th'},
    {id:3, full_name:'นางสาว ชื่นกมล สารมานิตย์', title:'ผู้จัดการโครงการ',        name_aliases:['ชื่นกมล','Chuenkamon'], is_approver:true, can_review:true, can_approve:true, is_active:true, is_pmo:true, email:'somying@orbitdigital.co.th'},
  ];
  return _userProfilesCache;
}
async function loadAuthorityAsync() {
  if(_authorityCache) return _authorityCache;
  try {
    const rows = await supaFetch('authority_limits','GET',null,'?order=title.asc');
    if(rows && rows.length){ _authorityCache = rows; return rows; }
  } catch(e){ console.warn('authority_limits load failed',e.message); }
  return null;
}
function getApprovers(stage = 'approve') {
  return (_userProfilesCache||[]).filter(u => {
    if (u.is_active === false) return false;
    if (stage === 'review') return u.can_review ?? u.is_approver;
    return u.can_approve ?? u.is_approver;
  });
}
function findUserByName(name) {
  if(!name||!_userProfilesCache) return null;
  const n = name.trim();
  return _userProfilesCache.find(u=>u.full_name===n||(u.name_aliases||[]).some(a=>a.toLowerCase()===n.toLowerCase()))||null;
}
function getAuthorityLimit(title, memoType) {
  if(_authorityCache){
    const r = _authorityCache.find(r=>r.title===title&&r.memo_type===memoType);
    if(r) return Number(r.limit_thb)||0;
  }
  const fb={
    'ประธานเจ้าหน้าที่บริหาร':          {sl:2000000,hw:2000000,int:0,ent:150000,dep:2000000},
    'ประธานเจ้าหน้าที่สายการเงิน (CFO)':{sl:1000000,hw:500000, int:0,ent:50000, dep:500000},
    'ผู้อำนวยการ (Team Director)':       {sl:500000, hw:500000, int:0,ent:50000, dep:500000},
    'ผู้อำนวยการโครงการ':                {sl:500000, hw:500000, int:0,ent:50000, dep:500000},
    'Senior Manager / Manager':          {sl:50000,  hw:50000,  int:0,ent:10000, dep:50000},
    'Team Leader':                       {sl:30000,  hw:30000,  int:0,ent:5000,  dep:30000},
  };
  return fb[title]?.[memoType]??0;
}

// isPMO — single source of truth (moved from budget.js)
function currentUserProfileId() {
  const raw = document.getElementById('sb-user-btn')?.dataset?.profileId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}
function currentUserProfile() {
  const id = currentUserProfileId();
  if (id == null) return null;
  return (_userProfilesCache || []).find(u => Number(u.id) === id) || null;
}
function isPMO() {
  const simulated = document.getElementById('sb-user-btn')?.dataset?.isPmo;
  if (simulated === 'true' || simulated === 'false') return simulated === 'true';
  const profile = currentUserProfile();
  if (profile) return profile.is_pmo === true;
  return (document.getElementById('sb-urole')?.textContent?.trim()||'') === 'PMO';
}
// currentUser — single source of truth (moved from pending.js)
function currentUser() {
  return document.getElementById('sb-uname')?.textContent?.trim()||'';
}

function profileMatches(profileId, name, targetProfileId = currentUserProfileId(), targetName = currentUser()) {
  if (profileId != null && targetProfileId != null) return Number(profileId) === Number(targetProfileId);
  if (!name || !targetName) return false;
  if (String(name).trim() === String(targetName).trim()) return true;
  const profile = (_userProfilesCache || []).find(u => Number(u.id) === Number(targetProfileId));
  return !!profile && (
    profile.full_name === name ||
    (profile.name_aliases || []).some(alias => String(alias).toLowerCase() === String(name).toLowerCase())
  );
}

function memoCurrentStageIndex(memo) {
  return memo?.status === 'pending_a2' ? 1 : memo?.status === 'pending_a3' ? 2 : 0;
}
function memoCurrentApprover(memo) {
  return (memo?.approvers || [])[memoCurrentStageIndex(memo)] || null;
}
function isMemoRequester(memo) {
  return profileMatches(memo?.requesterProfileId, memo?.requesterName);
}
function isMemoCurrentApprover(memo) {
  const approver = memoCurrentApprover(memo);
  if (!approver) return false;
  return profileMatches(approver.profileId, approver.name);
}
function isMemoVisibleInPending(memo) {
  if (!memo || !['pending','pending_a2','pending_a3'].includes(memo.status)) return false;
  return isPMO() || isMemoRequester(memo) || isMemoCurrentApprover(memo);
}
function canCurrentUserActOnMemo(memo) {
  if (!memo || !['pending','pending_a2','pending_a3'].includes(memo.status)) return false;
  if (isMemoRequester(memo)) return false;
  return isMemoCurrentApprover(memo) || isPMO();
}

// Milestone 1A Task 1.3 — an approver step is "resolved" (locked, no longer the
// pending one awaiting action) whether it was approved in-system, bypassed via
// A1 self-review, or overridden by PMO. Views use this instead of checking
// status === 'approved' alone, so bypassed/overridden steps still render as
// locked/checked exactly like an in-system approval did before this change.
function isApproverStepResolved(status) {
  return status === 'approved' || status === 'bypassed' || status === 'overridden';
}

// memoStatusKey / histStatusLabel / histStatusBadgeClass — single source of truth
// (moved from views/history.js, Milestone 1A Task 1.4). Behavior unchanged; this
// only centralizes what was already implicitly global so budget.js and pending.js
// can reuse it without redefining their own copy — see docs/TECHNICAL_DEBT.md
// for the follow-up on pending.js's separately-styled inline status pill.
function memoStatusKey(memo) {
  return memo.status || 'pending';
}
function histStatusLabel(memo) {
  const key = memoStatusKey(memo);
  const map = {
    completed: 'Completed', rejected: 'Rejected', pending: 'Pending A1',
    pending_a2: 'Pending A2', pending_a3: 'Pending A3',
    draft: 'Draft', cancelled: 'Cancelled', expired: 'Expired',
    voided: 'Voided', // Milestone 1B
  };
  return map[key] || key;
}
function histStatusBadgeClass(memo) {
  const key = memoStatusKey(memo);
  const map = {
    completed: 'badge-green', rejected: 'badge-red', pending: 'badge-amber',
    pending_a2: 'badge-amber', pending_a3: 'badge-amber',
    draft: 'badge-gray', cancelled: 'badge-gray', expired: 'badge-red',
    voided: 'badge-gray', // Milestone 1B — distinct from Approved, matches Cancelled/Draft's neutral tone
  };
  return map[key] || 'badge-gray';
}

// appendAuditLog — single source of truth (moved from views/pending.js, Milestone 1A Task 1.2)
function appendAuditLog(memos, memoNo, action, comment, extra = {}) {
  const idx = memos.findIndex(m => m.memoNo === memoNo);
  if(idx<0) return;
  if(!memos[idx].auditLog) memos[idx].auditLog = [];
  memos[idx].auditLog.push({
    actor:        currentUser(),
    actorProfileId: typeof currentUserProfileId === 'function' ? currentUserProfileId() : null,
    action,
    comment:      comment || '',
    timestamp:    new Date().toISOString(),
    statusBefore: extra.statusBefore || null,
    statusAfter:  extra.statusAfter  || null,
    evidenceUrl:  extra.evidenceUrl  || null,
    channel:      extra.channel      || 'in-app',
    // Milestone 2 Task 2.4 — Budget tag audit: previous/new Budget Pool id,
    // generic enough to be reused by any other future "value changed" event.
    previousBudgetPoolId: extra.previousBudgetPoolId ?? null,
    newBudgetPoolId:      extra.newBudgetPoolId      ?? null,
  });
}

function prepareMemoForSubmission(data, now = new Date().toISOString()) {
  const approvers = (data.approvers || []).map(a => ({...a}));
  const requesterProfileId = data.requesterProfileId ?? currentUserProfileId();
  const requesterName = data.requesterName || currentUser();
  const selfA1 = !!approvers[0] && profileMatches(
    approvers[0].profileId,
    approvers[0].name,
    requesterProfileId,
    requesterName
  );
  const next = selfA1 ? approvers[1] : approvers[0];
  if (selfA1) {
    // Milestone 1A Task 1.3: A1 self-review is a Bypassed step, not a genuine
    // in-system Approved one — see MEMO_LIFECYCLE.md §7 / SYSTEM_STATE_MACHINE.md §5.
    approvers[0] = {
      ...approvers[0],
      status: 'bypassed',
      approvedAt: now,
      approvedBy: requesterName,
      approvedByProfileId: requesterProfileId,
      selfReviewed: true,
    };
  }
  const status = next ? (selfA1 ? 'pending_a2' : 'pending') : 'completed';
  const auditLog = [...(data.auditLog || [])];
  if (selfA1) {
    auditLog.push({
      actor: requesterName,
      actorProfileId: requesterProfileId,
      action: 'A1 Self-reviewed on submission',
      comment: 'Requester is also the A1 reviewer; routed directly to A2',
      timestamp: now,
      statusBefore: data.status || 'draft',
      statusAfter: status,
    });
  }
  return {
    ...data,
    requesterProfileId,
    approvers,
    auditLog,
    status,
    submittedAt: data.submittedAt || now,
    selfReviewedAt: selfA1 ? now : null,
    currentApproverProfileId: next?.profileId ?? null,
    approvedAt: status === 'completed' ? now : null,
  };
}

function draftFromMemo(memo, sourceMemoNo = memo?.memoNo) {
  return {
    ...memo,
    id: undefined,
    memoNo: undefined,
    date: undefined,
    status: 'draft',
    sourceMemoNo,
    createdAt: undefined,
    updatedAt: undefined,
    submittedAt: undefined,
    approvedAt: undefined,
    rejectedAt: undefined,
    cancelledAt: undefined,
    selfReviewedAt: undefined,
    approvedBy: undefined,
    rejectedBy: undefined,
    cancelledBy: undefined,
    approvalNote: undefined,
    rejectionReason: undefined,
    cancellationReason: undefined,
    // Milestone 1B — a duplicated memo must not inherit its source's Void or
    // soft-delete metadata.
    voidedAt: undefined, voidedBy: undefined, voidReason: undefined, voidEvidenceUrl: undefined,
    deleted: false, deletedAt: undefined, deletedBy: undefined, deleteReason: undefined,
    currentApproverProfileId: null,
    auditLog: [],
    approvers: (memo?.approvers || []).map(a => ({
      ...a,
      status: 'pending',
      approvedAt: null,
      approvedBy: null,
      approvedByProfileId: null,
      rejectedAt: null,
      rejectedBy: null,
      selfReviewed: false,
    })),
  };
}

// ── Memo field mapping: JS camelCase ↔ DB snake_case ──
function memoToDb(m) {
  return {
    id: m.id || m.memoNo,
    memo_no: m.memoNo,
    type: m.type, type_label: m.typeLabel,
    status: m.status || 'pending',
    project: m.project, subject: m.subject, reason: m.reason,
    to: m.to, date: memoDbDate(m.date), total: Number(m.total)||0,
    amount_words: m.amountWords,
    requester_name: m.requesterName, requester_title: m.requesterTitle,
    reviewer_name: m.reviewerName, reviewer_title: m.reviewerTitle, reviewer_date: memoDbDate(m.reviewerDate),
    approver_name: m.approverName, approver_title: m.approverTitle, approver_date: memoDbDate(m.approverDate),
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
// Milestone 2 Task 2.2 — business-facing dates/times must display in Asia/Bangkok
// regardless of the viewer's own browser/OS timezone (docs/SYSTEM_OVERVIEW.md §7).
// Shared extraction helper: every display helper below reads its date/time parts
// through this single function instead of viewer-local getDate()/getMonth()/etc.
const BANGKOK_TZ = 'Asia/Bangkok';
function bangkokParts(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BANGKOK_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = type => parts.find(p => p.type === type)?.value || '0';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')) % 24, minute: Number(get('minute')),
  };
}
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function thaiDate(d) { const p = bangkokParts(d); return `${p.day} ${MONTHS_TH[p.month-1]} พ.ศ. ${p.year+543}`; }
const TODAY = thaiDate(new Date());
function bangkokTodayISO() {
  const p = bangkokParts(new Date());
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}
const todayISO = bangkokTodayISO();

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
function memoDbDate(v) {
  if(!v || v === '-') return null;
  const text = String(v).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(iso) {
    const year = Number(iso[1]);
    return `${String(year > 2400 ? year - 543 : year).padStart(4,'0')}-${iso[2]}-${iso[3]}`;
  }
  const parts = text.split(/\s+/);
  const yearMatch = text.match(/(\d{4})(?!.*\d{4})/);
  if(parts.length >= 3 && yearMatch) {
    const day = Number(parts[0]);
    const month = MONTHS_TH.indexOf(parts[1]) + 1;
    const year = Number(yearMatch[1]);
    if(day > 0 && month > 0 && Number.isFinite(year)) {
      const gregorianYear = year > 2400 ? year - 543 : year;
      return `${String(gregorianYear).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  }
  const parsed = new Date(text);
  if(!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
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


// ── Memo integration overrides from PMO-dashboard-v0.1 (Batch 1) ──
// ── Memo field mapping: JS camelCase ↔ DB snake_case ──
function memoToDb(m) {
  return {
    id: m.id || m.memoNo,
    memo_no: m.memoNo,
    type: m.type, type_label: m.typeLabel,
    status: m.status || 'pending',
    project: m.project, subject: m.subject, reason: m.reason,
    to: m.to, date: memoDbDate(m.date), total: Number(m.total)||0,
    currency: m.currency || 'THB',
    amount_words: m.amountWords,
    requester_name: m.requesterName, requester_title: m.requesterTitle,
    requester_profile_id: m.requesterProfileId || null,
    current_approver_profile_id: m.currentApproverProfileId || null,
    self_reviewed_at: m.selfReviewedAt || null,
    source_memo_no: m.sourceMemoNo || null,
    reviewer_name: m.reviewerName, reviewer_title: m.reviewerTitle, reviewer_date: memoDbDate(m.reviewerDate),
    approver_name: m.approverName, approver_title: m.approverTitle, approver_date: memoDbDate(m.approverDate),
    approvers: m.approvers || [],
    approved_by: m.approvedBy, rejected_by: m.rejectedBy,
    approval_note: m.approvalNote, rejection_reason: m.rejectionReason,
    cancellation_reason: m.cancellationReason || null,
    cancelled_by: m.cancelledBy || null,
    pmo_override_note: m.pmoOverrideNote || null,
    pmo_override_by: m.pmoOverrideBy || null,
    fx_rate: m.fxRate || null,
    sections: m.sections || [], sl_items: m.slItems || [], audit_log: m.auditLog || [],
    budget_source:  m.budgetSource  || null,
    budget_pool_id: m.budgetPoolId  || null,
    // Hotfix: Memo Detail Restore — structured detail data that has no other
    // home in the schema (previously only rendered as read-only HTML in
    // `sections`, so it could not be restored into the form on re-edit/duplicate).
    hw_items:  m.hwItems  || [], hw_owner:  m.hwOwner  || null,
    acct_cols: m.acctCols || [], acct_rows: m.acctRows || [],
    int_names: m.intNames || [],
    dep_items: m.depItems || [],
    // INT fields
    int_activity:  m.intActivity  || null,
    int_date:      memoDbDate(m.intDate),
    int_headcount: m.intHeadcount || null,
    int_pp:        m.intPP        || null,
    // ENT fields
    ent_client: m.entClient || null,
    ent_date:   memoDbDate(m.entDate),
    ent_time:   m.entTime   || null,
    ent_place:  m.entPlace  || null,
    ent_people: m.entPeople || null,
    // DEP fields
    dep_location:  m.depLocation  || null,
    dep_start:     memoDbDate(m.depStart),
    dep_end:       memoDbDate(m.depEnd),
    dep_emp_count: m.depEmpCount  || null,
    pmo_evidence_url:      m.pmoEvidenceUrl      || null,
    approval_evidence_url: m.approvalEvidenceUrl || null,
    submitted_at: m.submittedAt || null,
    approved_at: m.approvedAt || null, rejected_at: m.rejectedAt || null,
    cancelled_at: m.cancelledAt || null,
    // Milestone 1B — Void (memo-side)
    voided_at: m.voidedAt || null, voided_by: m.voidedBy || null,
    void_reason: m.voidReason || null, void_evidence_url: m.voidEvidenceUrl || null,
    // Milestone 1B — Draft soft delete
    deleted: m.deleted || false, deleted_at: m.deletedAt || null,
    deleted_by: m.deletedBy || null, delete_reason: m.deleteReason || null,
    created_at: m.createdAt || new Date().toISOString(),
    updated_at: m.updatedAt || new Date().toISOString(),
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    created_by: m.createdBy || null, updated_by: m.updatedBy || null,
  };
}
function dbToMemo(r) {
  return {
    id: r.memo_no, memoNo: r.memo_no,
    type: r.type, typeLabel: r.type_label,
    status: r.status, project: r.project, subject: r.subject, reason: r.reason,
    to: r.to, date: r.date, total: Number(r.total)||0, amountWords: r.amount_words,
    currency: r.currency || 'THB',
    requesterName: r.requester_name, requesterTitle: r.requester_title,
    requesterProfileId: r.requester_profile_id || null,
    currentApproverProfileId: r.current_approver_profile_id || null,
    selfReviewedAt: r.self_reviewed_at || null,
    sourceMemoNo: r.source_memo_no || null,
    reviewerName: r.reviewer_name, reviewerTitle: r.reviewer_title, reviewerDate: r.reviewer_date,
    approverName: r.approver_name, approverTitle: r.approver_title, approverDate: r.approver_date,
    approvers: r.approvers || [],
    approvedBy: r.approved_by, rejectedBy: r.rejected_by,
    approvalNote: r.approval_note, rejectionReason: r.rejection_reason,
    cancellationReason: r.cancellation_reason || null,
    cancelledBy: r.cancelled_by || null,
    pmoOverrideNote: r.pmo_override_note || null, pmoOverrideBy: r.pmo_override_by || null,
    entClient: r.ent_client || null, entDate: r.ent_date || null,
    entTime: r.ent_time || null, entPlace: r.ent_place || null, entPeople: r.ent_people || null,
    intActivity:  r.int_activity  || null,
    intDate:      r.int_date      || null,
    intHeadcount: r.int_headcount || null,
    intPP:        r.int_pp        || null,
    depLocation:  r.dep_location  || null,
    depStart:     r.dep_start     || null,
    depEnd:       r.dep_end       || null,
    depEmpCount:  r.dep_emp_count || null,
    fxRate: r.fx_rate, sections: r.sections || [], slItems: r.sl_items || [], auditLog: r.audit_log || [],
    budgetSource:  r.budget_source   || null,
    budgetPoolId:  r.budget_pool_id  || null,
    // Hotfix: Memo Detail Restore — see memoToDb() above.
    hwItems:  r.hw_items  || [], hwOwner:  r.hw_owner  || null,
    acctCols: r.acct_cols || [], acctRows: r.acct_rows || [],
    intNames: r.int_names || [],
    depItems: r.dep_items || [],
    pmoEvidenceUrl:      r.pmo_evidence_url      || null,   // available after ALTER TABLE
    approvalEvidenceUrl: r.approval_evidence_url || null,   // available after ALTER TABLE
    submittedAt: r.submitted_at, approvedAt: r.approved_at, rejectedAt: r.rejected_at,
    cancelledAt: r.cancelled_at || null,
    // Milestone 1B — Void (memo-side), available after ALTER TABLE
    voidedAt: r.voided_at || null, voidedBy: r.voided_by || null,
    voidReason: r.void_reason || null, voidEvidenceUrl: r.void_evidence_url || null,
    // Milestone 1B — Draft soft delete, available after ALTER TABLE
    deleted: r.deleted || false, deletedAt: r.deleted_at || null,
    deletedBy: r.deleted_by || null, deleteReason: r.delete_reason || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    createdBy: r.created_by || null, updatedBy: r.updated_by || null,
  };
}

// ── Memo storage (async, with localStorage fallback) ──

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

// Milestone 1B — a soft-deleted Draft must disappear from every normal view.
// Filtering here (the single shared read path) covers Pending/History/Budget/
// License/Device/Dashboard at once instead of touching each view.
function _excludeDeletedMemos(memos) {
  return (memos || []).filter(m => !m.deleted);
}

async function loadMemosAsync() {
  if(await checkSupa()) {
    try {
      const rows = await supaFetch('memos', 'GET', null, '?order=created_at.desc&limit=500');
      _memCache = (rows||[]).map(dbToMemo);
      return _excludeDeletedMemos(_memCache);
    } catch(e) {
      console.warn('Supabase read failed, using cache');
      if (_memCache) return _excludeDeletedMemos(_memCache);
    }
  }
  // Offline fallback: localStorage
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return _excludeDeletedMemos(Array.isArray(p)?p:[]); }
  catch(e) { return []; }
}

async function saveMemoAsync(data) {
  const now = new Date().toISOString();
  const existing = loadMemos().find(m => m.memoNo === data.memoNo);
  const saved = { ...data, id:data.memoNo, status:data.status||'pending',
    createdAt: existing ? existing.createdAt : now, updatedAt: now,
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    createdBy: existing ? existing.createdBy : (data.createdBy || currentUser()),
    updatedBy: currentUser() };

  if(await checkSupa()) {
    try {
      const db = memoToDb(saved);
      await supaFetch('memos', 'POST', db, '?on_conflict=memo_no');
      // update cache directly — no need to re-fetch
      if (_memCache) {
        const ci = _memCache.findIndex(m => m.memoNo === saved.memoNo);
        if (ci >= 0) _memCache[ci] = saved; else _memCache.unshift(saved);
      } else {
        _memCache = [saved];
      }
      if (saved.status === 'completed') {
        const actualSpend = syncMemoToActualSpend(saved);
        if (actualSpend) Object.assign(saved, {
          autoBudgetPoolId: actualSpend.autoBudgetPoolId,
          manualBudgetPoolId: actualSpend.manualBudgetPoolId,
          finalBudgetPoolId: actualSpend.finalBudgetPoolId,
          budgetStatus: actualSpend.budgetStatus,
        });
      }
      return saved;
    } catch(e) { console.warn('Supabase save failed', e.message); }
  }
  // Offline fallback: localStorage
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  if(idx>=0) memos[idx]=saved; else memos.push(saved);
  storeMemos(memos);
  if (saved.status === 'completed') {
    const actualSpend = syncMemoToActualSpend(saved);
    if (actualSpend) Object.assign(saved, {
      autoBudgetPoolId: actualSpend.autoBudgetPoolId,
      manualBudgetPoolId: actualSpend.manualBudgetPoolId,
      finalBudgetPoolId: actualSpend.finalBudgetPoolId,
      budgetStatus: actualSpend.budgetStatus,
    });
    storeMemos(memos);
  }
  return saved;
}

async function updateMemoStatusAsync(memoNo, status, extra={}) {
  // Read from cache first (fastest), fall back to Supabase if not found
  let memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) {
    const freshMemos = await loadMemosAsync();
    memo = freshMemos.find(m => m.memoNo === memoNo);
  }
  if (!memo) return null;

  // ── Terminal state guard ──
  // completed and rejected memos cannot be changed except by PMO override or Void
  // (Milestone 1B: Void is its own guarded transition, not a PMO Override — it
  // must not trigger the override-specific approver-marking logic below).
  const isPmoOverride = extra.pmoOverrideNote || extra.pmoOverrideBy;
  const isVoiding      = memo.status === 'completed' && status === 'voided';
  const isTerminal    = memo.status === 'completed' || memo.status === 'rejected' || memo.status === 'cancelled';
  if (isTerminal && !isPmoOverride && !isVoiding) return memo;

  // ── Approver order enforcement ──
  // Prevent A2 from approving if A1 hasn't approved yet
  if (status === 'approved_a2' && memo.status !== 'pending_a2') return memo;
  if (status === 'approved_a3' && memo.status !== 'pending_a3') return memo;

  const now     = new Date().toISOString();
  const deferRender = !!extra._deferRender;
  // Milestone 2 Task 2.3 — Created By / Updated By metadata: whoever triggered
  // this transition (approve/reject/cancel/void/PMO override) is the updater.
  const updated = { ...memo, ...extra, status, updatedAt: now, updatedBy: extra.updatedBy || currentUser() };
  delete updated._deferRender;
  delete updated.throwOnSyncError;

  // ── Multi-approver flow logic ──
  const approvers = memo.approvers || [];
  const currentPendingIdx = approvers.findIndex(a => !a.status || a.status === 'pending');

  if (status === 'approved_a1' || status === 'approved_a2' || status === 'approved_a3') {
    // Find which approver is approving
    const approvingIdx = status === 'approved_a1' ? 0 : status === 'approved_a2' ? 1 : 2;
    const nextIdx = approvingIdx + 1;

    updated.approvers = approvers.map((a, i) =>
      i === approvingIdx
        ? {
            ...a,
            status: 'approved',
            approvedAt: now,
            approvedBy: extra.approvedBy || currentUser(),
            approvedByProfileId: currentUserProfileId(),
          }
        : a
    );

    if (nextIdx < approvers.length && approvers[nextIdx]) {
      // Still more approvers
      updated.status = nextIdx === 1 ? 'pending_a2' : 'pending_a3';
      updated.currentApproverProfileId = approvers[nextIdx].profileId || null;
      updated.approvedAt = null;
    } else {
      // All done
      updated.status    = 'completed';
      updated.approvedAt = now;
      updated.currentApproverProfileId = null;
    }
  } else if (status === 'cancelled') {
    updated.cancelledAt = extra.cancelledAt || now;
    updated.currentApproverProfileId = null;
  } else if (status === 'rejected') {
    updated.rejectedAt = now;
    updated.currentApproverProfileId = null;
    const pendingIdx = approvers.findIndex(a => !a.status || a.status === 'pending');
    if (pendingIdx >= 0 && !extra.approvers) {
      // Milestone 1A Task 1.3: a PMO override that results in 'rejected' marks the
      // step PMO acted on as Overridden, not Rejected — the approver themselves
      // didn't reject it, PMO did, with evidence. A genuine in-system reject
      // (isPmoOverride false) keeps the original 'rejected' step status.
      updated.approvers = isPmoOverride
        ? approvers.map((a, i) =>
            i === pendingIdx ? {
              ...a,
              status: 'overridden',
              overriddenAt: now,
              overriddenBy: extra.pmoOverrideBy || currentUser(),
              overrideNote: extra.pmoOverrideNote || null,
            } : a
          )
        : approvers.map((a, i) =>
            i === pendingIdx ? {
              ...a,
              status: 'rejected',
              rejectedAt: now,
              rejectedBy: extra.rejectedBy || currentUser(),
              rejectedByProfileId: currentUserProfileId(),
            } : a
          );
    }
  }

  if (updated.status === 'completed') {
    updated.approvedAt = updated.approvedAt || now;
    updated.currentApproverProfileId = null;
  } else if (['pending','pending_a2','pending_a3'].includes(updated.status)) {
    updated.currentApproverProfileId = memoCurrentApprover(updated)?.profileId || null;
  } else if (['rejected','cancelled'].includes(updated.status)) {
    updated.currentApproverProfileId = null;
  }

  // Sync to Supabase
  const supaReady = await checkSupa();
  if (!supaReady && extra.throwOnSyncError) {
    throw new Error('Supabase is unavailable');
  }
  if (supaReady) {
    try {
      const toSnake = s => s.replace(/([A-Z])/g, '_$1').toLowerCase();
      // Only exclude auditLog (handled separately above) and evidence URLs (now in DB)
      const PENDING_COLUMNS = new Set(['auditLog', 'throwOnSyncError', '_deferRender']);
      const patch = {
        status: updated.status,
        updated_at: now,
        approvers: updated.approvers,
        audit_log: extra.auditLog || updated.auditLog || memo.auditLog || [],
        current_approver_profile_id: updated.currentApproverProfileId || null,
        ...Object.fromEntries(
          Object.entries(extra)
            .filter(([k]) => !PENDING_COLUMNS.has(k))
            .map(([k,v]) => [toSnake(k), v])
        )
      };
      if (updated.approvedAt)  patch.approved_at  = updated.approvedAt;
      if (updated.rejectedAt)  patch.rejected_at  = updated.rejectedAt;
      if (updated.cancelledAt) patch.cancelled_at = updated.cancelledAt;
      if (updated.updatedBy)   patch.updated_by   = updated.updatedBy;
      await supaFetch('memos', 'PATCH', patch, '?memo_no=eq.' + encodeURIComponent(memoNo));
    } catch(e) {
      console.warn('Supabase patch failed', e.message);
      if(extra.throwOnSyncError) throw e;
    }
  }

  // Update in-memory cache (always — whether Supabase succeeded or not)
  if (!_memCache) _memCache = [];
  const cacheIdx = _memCache.findIndex(m => m.memoNo === memoNo);
  if (cacheIdx >= 0) _memCache[cacheIdx] = updated;
  else _memCache.unshift(updated);
  // Keep the offline backup current as well. Without this, status changes made
  // while Supabase is unavailable disappear on the next page load.
  storeMemos(_memCache);
  const actualSpend = syncMemoToActualSpend(updated);
  if (actualSpend) {
    Object.assign(updated, {
      autoBudgetPoolId: actualSpend.autoBudgetPoolId,
      manualBudgetPoolId: actualSpend.manualBudgetPoolId,
      finalBudgetPoolId: actualSpend.finalBudgetPoolId,
      budgetStatus: actualSpend.budgetStatus,
    });
    storeMemos(_memCache);
  }

  // Side effects on completion
  if (updated.status === 'completed') {
    if (typeof createPurchaseOrdersFromMemo === 'function') {
      createPurchaseOrdersFromMemo(updated);
    }
  }

  // Safe render — only if DOM is ready
  if(!deferRender) {
    try { if (typeof renderPendingMemos === 'function') renderPendingMemos(); } catch(e) {}
    try { if (typeof renderHistoryMemos === 'function') renderHistoryMemos(); } catch(e) {}
  }

  return updated;
}

// ══════════════════════════════════════════════════════════════════
// Milestone 1B — Void (memo-side lifecycle only)
// ══════════════════════════════════════════════════════════════════
const VOID_DOWNSTREAM_WARNING = 'This memo has already created downstream records. Please resolve downstream records before voiding.';

// Safest available guard given the current data model: a Device Registry
// record is created once devices have "arrived" for a Hardware memo (see
// views/device.js's markArrived-style flow, which stamps memoNo onto each
// device row). A Purchase Order alone (no arrived devices yet) does not
// block — matching the allowed/not-allowed examples in MEMO_LIFECYCLE.md §12.
// Limitation: this only detects the one downstream record type named in the
// requirement (Device Registry); see docs/TECHNICAL_DEBT.md for scope notes.
function memoHasIrreversibleDownstreamRecords(memo) {
  const devices = typeof loadDevices === 'function' ? loadDevices() : [];
  return devices.some(d => d.memoNo === memo.memoNo);
}

async function voidMemoAsync(memoNo, reason, evidenceUrl = '') {
  let memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) {
    const fresh = await loadMemosAsync();
    memo = fresh.find(m => m.memoNo === memoNo);
  }
  if (!memo) return { ok: false, error: 'not_found' };
  if (typeof isPMO !== 'function' || !isPMO()) return { ok: false, error: 'forbidden' };
  if (memo.status !== 'completed') return { ok: false, error: 'invalid_status' };
  if (!reason || !reason.trim()) return { ok: false, error: 'reason_required' };
  if (memoHasIrreversibleDownstreamRecords(memo)) {
    return { ok: false, error: 'downstream_blocked', message: VOID_DOWNSTREAM_WARNING };
  }

  const now = new Date().toISOString();
  const user = currentUser();
  const trimmedReason = reason.trim();
  const memos = loadMemos();
  appendAuditLog(memos, memoNo, `Voided by ${user}`, trimmedReason, {
    statusBefore: memo.status,
    statusAfter: 'voided',
    evidenceUrl: evidenceUrl || null,
  });
  storeMemos(memos);
  const updatedAuditLog = memos.find(m => m.memoNo === memoNo)?.auditLog || [];

  const updated = await updateMemoStatusAsync(memoNo, 'voided', {
    voidedAt: now,
    voidedBy: user,
    voidReason: trimmedReason,
    voidEvidenceUrl: evidenceUrl || null,
    auditLog: updatedAuditLog,
  });

  // Voided Hardware Memo downstream PO handling: never delete a related
  // Purchase Order — mark it as a terminal 'voided_source' status instead,
  // carrying the memo's void reason onto the PO's own audit trail. Only
  // reachable when no devices have arrived yet (memoHasIrreversibleDownstream
  // Records() above already blocks Void once any have).
  if (typeof cancelPurchaseOrdersForVoidedMemo === 'function') {
    try { cancelPurchaseOrdersForVoidedMemo(memoNo, trimmedReason); }
    catch (e) { console.warn('PO void-cascade failed', e); }
  }

  return { ok: true, memo: updated };
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


function money(n, currency = 'THB') {
  const symbol = currency === 'USD' ? '$' : '฿';
  return symbol + (Number(n)||0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

// ── Multi-select filter widget (UX consistency pass, Part 8) ───────────────
// Progressively enhances a native <select id="..."> into a searchable
// checkbox dropdown (Select all / Clear all, keyboard accessible) while the
// hidden native <select multiple> stays the single source of truth for
// selected values. Toggling a checkbox dispatches a real 'change' event on
// that same <select>, so every existing onchange="render...()" wiring on it
// keeps firing completely unchanged — call sites only need to swap
// val(id)/single-equality filtering for msValues(id)/.includes() filtering.
//
// Selection semantics: an empty selection (nothing checked) means "no
// filter" (show everything) — the same meaning the old single-select "all"
// option had. Selecting every individual option produces the same visible
// result, which matches how most multi-select filter UIs behave (e.g. Jira,
// Linear filter chips).
function msValues(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  // Real <select multiple> in the browser exposes selectedOptions; simplified
  // test-double DOM stubs (see tests/device.test.js) only implement a plain
  // `.value` — fall back to that (single value, same as the old select)
  // rather than silently reporting "no filter" in those environments.
  if (el.selectedOptions) return Array.from(el.selectedOptions).map(o => o.value);
  return el.value ? [el.value] : [];
}

function initMultiSelect(id, placeholder, fieldLabel) {
  const select = document.getElementById(id);
  if (!select) return;
  const alreadyMultiple = select.multiple;
  select.multiple = true;
  select.style.display = 'none';
  // A plain (non-multiple) <select> always has its first <option> selected
  // by default; that stale single-selection must not survive the upgrade to
  // multi-select (it would show as an active filter nobody chose) — but only
  // clear it the first time this select is enhanced, never on a later
  // (idempotent) re-init call, or the user's own selection would be wiped
  // out on every re-render.
  if (!alreadyMultiple) Array.from(select.options).forEach(o => o.selected = false);
  let wrap = document.querySelector(`[data-ms-for="${id}"]`);
  if (!wrap) {
    const existingControl = select.parentElement?.classList.contains('filter-control') ? select.parentElement : null;
    wrap = existingControl || document.createElement('div');
    wrap.classList.add('filter-control', 'ms-wrap');
    wrap.dataset.msFor = id;
    if (!existingControl) select.insertAdjacentElement('afterend', wrap);
    if (fieldLabel && !wrap.querySelector('.filter-label')) {
      wrap.insertAdjacentHTML('afterbegin', `<label class="filter-label" for="${esc(id)}">${esc(fieldLabel)}</label>`);
    }
    wrap.insertAdjacentHTML('beforeend', `
      <button type="button" class="ms-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="ms-panel" role="listbox" aria-multiselectable="true" style="display:none">
        <input type="text" class="ms-search" placeholder="ค้นหา...">
        <div class="ms-actions">
          <button type="button" class="ms-all">Select all</button>
          <button type="button" class="ms-clear">Clear all</button>
        </div>
        <div class="ms-options"></div>
      </div>`);
    const trigger = wrap.querySelector('.ms-trigger');
    const panel   = wrap.querySelector('.ms-panel');
    const search  = wrap.querySelector('.ms-search');
    const closeAllPanels = () => {
      document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.ms-trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
    };
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = panel.style.display !== 'none';
      closeAllPanels();
      panel.style.display = isOpen ? 'none' : 'block';
      trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if (!isOpen) { search.value = ''; _msFilterOptions(id); search.focus(); }
    });
    wrap.querySelector('.ms-all').addEventListener('click', e => {
      e.stopPropagation();
      Array.from(select.options).forEach(o => o.selected = true);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      refreshMultiSelectUI(id);
    });
    wrap.querySelector('.ms-clear').addEventListener('click', e => {
      e.stopPropagation();
      Array.from(select.options).forEach(o => o.selected = false);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      refreshMultiSelectUI(id);
    });
    search.addEventListener('input', () => _msFilterOptions(id));
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { panel.style.display = 'none'; trigger.setAttribute('aria-expanded','false'); trigger.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); wrap.querySelector('.ms-option:not(.ms-hidden) input')?.focus(); }
    });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { panel.style.display = 'none'; trigger.setAttribute('aria-expanded','false'); trigger.focus(); }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) closeAllPanels(); });
  }
  wrap.dataset.msPlaceholder = placeholder || 'ทั้งหมด';
  refreshMultiSelectUI(id);
}

function _msFilterOptions(id) {
  const wrap = document.querySelector(`[data-ms-for="${id}"]`);
  if (!wrap) return;
  const q = (wrap.querySelector('.ms-search')?.value || '').toLowerCase();
  wrap.querySelectorAll('.ms-option').forEach(row => {
    const label = row.dataset.label || '';
    row.classList.toggle('ms-hidden', !!q && !label.includes(q));
  });
}

// Re-renders the checkbox list + trigger label from the hidden select's
// current <option> list and selected state. Call this after any code
// repopulates a multi-select-backed <select>'s options (e.g. a project list
// derived from live data), so the visible widget stays in sync.
function refreshMultiSelectUI(id) {
  const select = document.getElementById(id);
  const wrap = document.querySelector(`[data-ms-for="${id}"]`);
  if (!select || !wrap) return;
  const optionsBox = wrap.querySelector('.ms-options');
  const selected = new Set(msValues(id));
  const opts = Array.from(select.options);
  optionsBox.innerHTML = opts.map((o, i) => `
    <label class="ms-option" data-label="${esc(o.textContent.toLowerCase())}">
      <input type="checkbox" data-idx="${i}"${selected.has(o.value) ? ' checked' : ''}>
      <span>${esc(o.textContent)}</span>
    </label>`).join('');
  optionsBox.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      opts[Number(cb.dataset.idx)].selected = cb.checked;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      _msUpdateTriggerLabel(id);
    });
    cb.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cb.closest('label').nextElementSibling?.querySelector('input')?.focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); cb.closest('label').previousElementSibling?.querySelector('input')?.focus(); }
    });
  });
  _msUpdateTriggerLabel(id);
}

function _msUpdateTriggerLabel(id) {
  const select = document.getElementById(id);
  const wrap = document.querySelector(`[data-ms-for="${id}"]`);
  if (!select || !wrap) return;
  const trigger = wrap.querySelector('.ms-trigger');
  const values = msValues(id);
  const placeholder = wrap.dataset.msPlaceholder || 'ทั้งหมด';
  if (!values.length) { trigger.textContent = placeholder; return; }
  const labels = Array.from(select.selectedOptions).map(o => o.textContent);
  trigger.textContent = labels.length <= 2 ? labels.join(', ') : `${labels.slice(0,2).join(', ')} +${labels.length - 2}`;
}

function loadMemos() {
  // Prefer in-memory cache (populated from Supabase by loadMemosAsync on app init)
  // An empty array is a valid, authoritative result from Supabase.
  if (_memCache !== null) return _excludeDeletedMemos(_memCache);
  // Offline fallback: localStorage
  if (!HAS_LS) return _excludeDeletedMemos(_memMemos);
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return _excludeDeletedMemos(Array.isArray(p)?p:[]); }
  catch(e) { return _excludeDeletedMemos(_memMemos); }
}

function storeMemos(memos) {
  _memMemos = Array.isArray(memos) ? memos : [];
  // Always keep in-memory cache in sync
  _memCache = _memMemos;
  // localStorage as offline backup only
  if (!HAS_LS) return;
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
  // Sync version for backward compat — pushes to Supabase async in background
  const now = new Date().toISOString();
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  const existing = idx >= 0 ? memos[idx] : null;
  const saved = {
    ...data,
    id:          data.memoNo,
    status:      data.status || 'pending',
    createdAt:   existing?.createdAt || data.createdAt || now,
    updatedAt:   now,
  };
  if (!saved.submittedAt && saved.status !== 'draft') {
    saved.submittedAt = existing?.submittedAt || now;
  }
  // Update in-memory cache immediately
  if (!_memCache) _memCache = [];
  const ci = _memCache.findIndex(m => m.memoNo === saved.memoNo);
  if (ci >= 0) _memCache[ci] = saved; else _memCache.unshift(saved);
  storeMemos(_memCache);
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
  const actualSpend = syncMemoToActualSpend(memos[idx]);
  if (actualSpend) Object.assign(memos[idx], {
    autoBudgetPoolId: actualSpend.autoBudgetPoolId,
    manualBudgetPoolId: actualSpend.manualBudgetPoolId,
    finalBudgetPoolId: actualSpend.finalBudgetPoolId,
    budgetStatus: actualSpend.budgetStatus,
  });
  storeMemos(memos);
  // _memCache is already updated by storeMemos — do not null it here
  // Auto-create purchase orders for HW memos (sync only — avoid double-firing)
  if(status === 'completed' && memos[idx].type === 'hw') {
    if(typeof createPurchaseOrdersFromMemo === 'function') {
      createPurchaseOrdersFromMemo(memos[idx]);
    }
  }
  updateMemoStatusAsync(memoNo, status, { ...extra, _deferRender:true })
    .then(() => { renderPendingMemos(); renderHistoryMemos(); })
    .catch(e => console.warn('Supabase status update failed', e));
  return memos[idx];
}

// ── Navigation ──
function swView(id, el, title) {
  if(id === 'cost') {
    swView('budget', document.querySelector('.sb-item[onclick*="budget"]'), 'Budget & Spend');
    return;
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sb-sub-item').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  document.getElementById('page-title').textContent = title;
  if(el) el.classList.add('active');
  if(['create','pending','history'].includes(id)) document.getElementById('nav-memo').classList.add('active');
  if(id === 'budget')  renderBudget();
  if(id === 'license') renderLicense();
  if(id === 'device')  renderDevice();
  if(id === 'history') { renderHistoryMemos(); if(typeof populateHistTabCounts==='function') populateHistTabCounts(); }
  if(id === 'pending') renderPendingMemos();

  if(id === 'resource') { if(typeof renderResource==='function') renderResource(); }
  if(id === 'settings') { if(typeof renderSettings==='function') renderSettings(); }
}
function toggleMemoSub(el) {
  el.classList.add('active');
  swView('create', document.querySelector('#memo-sub .sb-sub-item'), 'Create Memo');
}

// ── PDF ──

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
  if(id === 'cost') {
    swView('budget', document.querySelector('.sb-item[onclick*="budget"]'), 'Budget & Spend');
    return;
  }
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
  if(id === 'history') { renderHistoryMemos(); if(typeof populateHistTabCounts==='function') populateHistTabCounts(); }
  if(id === 'pending') renderPendingMemos();
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
const _sigCache = {};

function _signaturePdfKey(name) {
  return 'sig-' + String(name || (typeof currentUser === 'function' ? currentUser() : '') || '').trim();
}

async function loadUserSignatureForPdfAsync(name) {
  const key = _signaturePdfKey(name);
  if(!key || key === 'sig-') return null;
  try {
    const raw = localStorage.getItem(key);
    if(raw) {
      const parsed = JSON.parse(raw);
      if(parsed?.signatureDataUrl) return parsed.signatureDataUrl;
    }
  } catch(e) {}
  if(typeof checkSupa === 'function' && await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, `?id=eq.${encodeURIComponent(key)}`);
      const dataUrl = rows?.[0]?.data?.signatureDataUrl || null;
      if(dataUrl) {
        try { localStorage.setItem(key, JSON.stringify({ signatureDataUrl: dataUrl })); } catch(e) {}
      }
      return dataUrl;
    } catch(e) {}
  }
  return null;
}

async function _preloadSignatures(approvers) {
  if(typeof loadUserProfilesAsync === 'function') {
    try { await loadUserProfilesAsync(); } catch(e) {}
  }
  const byName = new Map();
  (approvers || []).forEach(a => { if(a?.name && !byName.has(a.name)) byName.set(a.name, a); });

  await Promise.all([...byName.entries()].map(async ([name, approver]) => {
    if(_sigCache[name] !== undefined) return;
    let sig = await loadUserSignatureForPdfAsync(name);
    if(!sig) {
      const profile = approver.profileId != null && typeof _userProfilesCache !== 'undefined' && _userProfilesCache
        ? _userProfilesCache.find(u => Number(u.id) === Number(approver.profileId))
        : (typeof findUserByName === 'function' ? findUserByName(name) : null);
      const candidates = profile ? [profile.full_name, ...(profile.name_aliases || [])].filter(n => n && n !== name) : [];
      for(const candidate of candidates) {
        sig = await loadUserSignatureForPdfAsync(candidate);
        if(sig) break;
      }
    }
    _sigCache[name] = sig || null;
  }));
}

function getSignatureFromCache(name) {
  return _sigCache[name] || null;
}

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


// ── Memo PDF/readback overrides from PMO-dashboard-v0.1 (Batch 1) ──
function renderMemoPdf(data) {
  // Use server CSS classes (.mp-*) — injected by PDF server with THSarabun font
  // Auto-derive data.to from last approver title if not set
  if(!data.to && data.approvers && data.approvers.length > 0) {
    data = Object.assign({}, data, { to: data.approvers[data.approvers.length-1].title || '' });
  }

  function fmtDate(v) {
    if(!v || v === '-') return '';
    // Already a Thai full date string e.g. "17 มิถุนายน 2569" — return as-is
    if(/[ก-๙]/.test(v)) return v;
    // ISO YYYY-MM-DD or any parseable → full Thai date. UTC-anchored for a
    // date-only value, matching dateInput() — see Bangkok timezone helper above.
    const d = new Date(v.length===10 ? v+'T00:00:00Z' : v);
    if(isNaN(d.getTime())) return v;
    return thaiDate(d); // "17 มิถุนายน พ.ศ. 2569"
  }
  // YYYY-MM → "มิถุนายน 2569"
  function fmtMonth(v) {
    if(!v || v==='-') return v;
    const m = v.match(/^(\d{4})-(\d{2})$/);
    if(!m) return v;
    return `${MONTHS_TH[parseInt(m[2],10)-1]} ${parseInt(m[1])+543}`;
  }

  // ── Authority — dynamic from Supabase (_authorityCache) with fallback ──
  function getAuthority(memoType) {
    const approvers = data.approvers || [];
    const finalApprover = approvers.length > 0 ? approvers[approvers.length-1] : null;
    const title = finalApprover?.title || data.approverTitle || 'ประธานเจ้าหน้าที่บริหาร';
    const limit = getAuthorityLimit(title, memoType);
    return { title, limit };
  }
  function fmtLimit(n) { return (Number(n)||0).toLocaleString('th-TH',{maximumFractionDigits:0}); }

  // ── SL: collect software names from slItems ──
  const slProgramNames = (data.slItems||[]).filter(it=>it.name&&it.name!=='-').map(it=>it.name);
  const slProgramStr   = slProgramNames.length ? slProgramNames.join(', ') : 'โปรแกรม';

  const typeBody = {
    sl: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} - บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องใช้งานโปรแกรม ${esc(slProgramStr)} ${esc(data.reason||'')} จึงขออนุมัติงบประมาณเพื่อจัดซื้อโปรแกรมดังกล่าว ตามรายละเอียดดังต่อไปนี้`,
    hw: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องจัดซื้ออุปกรณ์ Hardware ${esc(data.reason||'')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    int: `เนื่องด้วยโครงการ ${esc(data.project||'-')} มีความประสงค์จัดกิจกรรม Team Activity ${esc(data.reason||'')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    ent: `สืบเนื่องจากพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด ได้วางแผนจัดงานบริษัทเลี้ยงรับรองลูกค้าเพื่อขอบคุณ ซึ่งจะจัดวันที่ ${esc(fmtDate(data.entDate)||'-')} สถานที่จัดคือ ${esc(data.entPlace||'-')} จำนวนผู้เข้าร่วมโดยประมาณ ${esc(data.entPeople||'-')} คน โดยกำหนดงบประมาณสำหรับค่าใช้จ่ายงานเลี้ยงรับรองลูกค้าเป็นจำนวนเงินไม่เกิน ${data.total ? (Number(data.total)||0).toLocaleString('th-TH',{maximumFractionDigits:0}) : '-'} บาท`,
    dep: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด วางแผนดำเนินการปฏิบัติงานที่ ${esc(data.depLocation||'-')} ในช่วงวันที่ ${esc(fmtDate(data.depStart)||'-')}${data.depEnd && data.depEnd !== data.depStart ? ` – ${esc(fmtDate(data.depEnd))}` : ''} โดยมีจำนวนทั้งสิ้น ${data.depEmpCount||'-'} คน โดยมีรายละเอียดดังต่อไปนี้`,
  };
  const bodyText = typeBody[data.type] || `ด้วยฝ่าย PMO มีความประสงค์ขออนุมัติรายการตามรายละเอียดด้านล่าง เพื่อสนับสนุนการดำเนินงานของโครงการ ${esc(data.project||'-')} ให้เป็นไปตามแผนงาน`;

  const amtStr = data.total ? `<strong>${(Number(data.total)||0).toLocaleString('th-TH', {maximumFractionDigits:0})} บาท</strong> (${esc(data.amountWords||'-')})` : '';
  const totalNoSign = data.total ? (Number(data.total)||0).toLocaleString('th-TH',{maximumFractionDigits:0}) : '-';

  const closingMap = {
    // SL — ค่าบริการ พ.ศ. 2566
    sl: data.total ? (function(){
      const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
      let totalSeats = 0, months = 12;
      if(slSection && slSection.html) {
        const doc = new DOMParser().parseFromString(slSection.html, 'text/html');
        doc.querySelectorAll('tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if(cells.length >= 5) {
            const mo  = parseInt(cells[4]?.textContent)||0;
            const qty = parseInt(cells[5]?.textContent)||0;
            if(mo)  months = mo;
            totalSeats += qty;
          }
        });
      }
      const auth = getAuthority('sl');
      const seatsStr  = totalSeats ? `จำนวนรวมทั้งหมด ${totalSeats} Seats ` : '';
      const monthsStr = `ระยะเวลา ${months} เดือน `;
      const limitStr  = auth.limit>0 ? `ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่าใช้จ่ายดังกล่าว รวมเป็นจำนวนเงินไม่เกิน ${amtStr} ${seatsStr}${monthsStr}อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระค่าบริการ ${limitStr}`;
    })() : '',
    // HW — ค่าสวัสดิการพนักงาน พ.ศ. 2566
    hw: data.total ? (function(){
      const auth = getAuthority('hw');
      const limitStr = auth.limit>0 ? `ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `จึงขอความกรุณาโปรดพิจารณาอนุมัติค่าใช้จ่ายสำหรับรายการจัดซื้อข้างต้น ในวงเงิน ${amtStr} อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระเงินค่าสวัสดิการพนักงาน ${limitStr}`;
    })() : '',
    // INT — ไม่มี authority reference ตาม policy
    int: data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่ากิจกรรมทีม ${esc(data.project||'-')} เพื่อใช้จัดกิจกรรมดังกล่าว เป็นวงเงินจำนวนไม่เกิน ${totalNoSign} บาท (${esc(data.amountWords||'-')})` : '',
    // ENT — ค่าเลี้ยงรับรอง พ.ศ. 2564
    ent: data.total ? (function(){
      const auth = getAuthority('ent');
      const limitStr = auth.limit>0 ? `วงเงินไม่เกิน ${fmtLimit(auth.limit)} บาท ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณค่ารับรองลูกค้าจาก ${esc(data.entClient||data.project||'-')} ในช่วงเวลาดังกล่าว อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2564 ข้อ 3.2 หมวดค่าเลี้ยงรับรอง ${limitStr}`;
    })() : '',
    // DEP — ค่าสวัสดิการพนักงาน พ.ศ. 2566
    dep: data.total ? (function(){
      const auth = getAuthority('dep');
      const limitStr = auth.limit>0 ? `ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `จึงขอความอนุเคราะห์อนุมัติการจัดซื้อสำหรับรายการจัดซื้อข้างต้น ในวงเงิน ${amtStr} อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระเงินค่าสวัสดิการพนักงาน ${limitStr}`;
    })() : '',
  };
  const closingText = closingMap[data.type] || (data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณรวมเป็นจำนวนเงินไม่เกิน ${amtStr}` : '');

  // sectionsHtml rendered inline below with fxNote injection

  const fxNote = data.type === 'sl'
    ? `<p class="mp-note">* <u>หมายเหตุ</u> : เรทราคาโปรแกรมดังกล่าวแปลงเรทเงินตราจากหน่วย USD เป็น THB ณ วันที่ ${esc(fmtDate(data.date)||TODAY)}${data.fxRate ? ` (1 USD = ฿${data.fxRate})` : ''}</p>`
    : '';

  // Dates stored as Thai strings from dateInput() — display directly
  // fmtDate only as safety net for raw ISO strings
  const reviewerDate = data.reviewerDate && data.reviewerDate !== '-' ? data.reviewerDate : (data.date||'');
  const approverDate = data.approverDate && data.approverDate !== '-' ? data.approverDate : (data.date||'');

  // ── Status Banner — Task 4. Reuses the single status vocabulary
  // (histStatusLabel/histStatusBadgeClass, both above) instead of a second
  // status→label mapping. Colors are presentation-only, keyed off the
  // existing badge class name, not off memo.status directly.
  const _statusBadgeClass = data.status ? histStatusBadgeClass(data) : '';
  const _statusColors = ({
    'badge-green': { bg: '#ECFDF5', fg: '#065F46', border: '#10B981' },
    'badge-red':   { bg: '#FEF2F2', fg: '#991B1B', border: '#EF4444' },
    'badge-amber': { bg: '#FFFBEB', fg: '#92400E', border: '#F59E0B' },
    'badge-gray':  { bg: '#F3F4F6', fg: '#374151', border: '#9CA3AF' },
  })[_statusBadgeClass] || { bg: '#F3F4F6', fg: '#374151', border: '#9CA3AF' };
  const statusBannerHtml = data.status ? `<div style="text-align:center;margin:0 0 10px">
    <span style="display:inline-block;padding:5px 18px;border:1.5px solid ${_statusColors.border};background:${_statusColors.bg};color:${_statusColors.fg};border-radius:6px;font-weight:700;font-size:13pt;letter-spacing:.06em">${esc(String(histStatusLabel(data)).toUpperCase())}</span>
  </div>` : '';

  return `<div class="preview-wrap">
    <!-- Header row: memo no + date (logo injected by server) -->
    <div class="mp-hdr">
      <div class="mp-hdr-right">
        <div><strong>เลขที่</strong>&nbsp;&nbsp;${esc(data.memoNo)}</div>
        <div><strong>ลงวันที่</strong>&nbsp;&nbsp;${esc(fmtDate(data.date)||TODAY)}</div>
      </div>
    </div>

    <!-- Status Banner -->
    ${statusBannerHtml}

    <!-- Title -->
    <div class="mp-title">บันทึกข้อความ</div>

    <!-- เรื่อง / เรียน -->
    <div class="mp-field"><span class="mp-field-label">เรื่อง</span><span class="mp-field-value">${esc(data.subject||'-')}</span></div>
    <div class="mp-field"><span class="mp-field-label">เรียน</span><span class="mp-field-value">${esc(data.to||'-')}</span></div>

    <!-- Body -->
    <div class="mp-body"><p style="font-size:14pt;line-height:1.8;text-indent:2.5em">${bodyText}</p></div>

    <!-- Sections with fxNote after SL table -->
    ${(data.sections||[]).map(function(s){
      let html = s.html;

      if(s.title === 'รายการ Software') {
        const renameHeader = (from, to) => {
          html = html.replace(new RegExp('<th([^>]*)>' + from + '<\/th>', 'g'), '<th$1>' + to + '</th>');
        };
        renameHeader('#', 'No');
        renameHeader('ชื่อ Software', 'Item');
        renameHeader('฿\/เดือน', 'Price/Month (THB)');
        renameHeader('จำนวน', 'QTY (License)');
        renameHeader('รวม', 'Amount (THB)');
        renameHeader('เดือน', 'Month');
        renameHeader('เริ่ม', 'Start');
        renameHeader('สิ้นสุด', 'End');
        html = html.replace(/>([0-9]{4}-[0-9]{2})</g, function(m, v) {
          var parts = v.match(/^([0-9]{4})-([0-9]{2})$/);
          if (!parts) return m;
          return '>' + MONTHS_TH[parseInt(parts[2],10)-1] + ' ' + (parseInt(parts[1])+543) + '<';
        });
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match;
          var tds = [];
          var idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            var isLeft = (idx === 1 || idx === 2);
            var isBold = attrs.includes('font-weight:700');
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+';'+(isBold?'font-weight:700;':'')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length ? '<tr>'+tds.join('')+'</tr>' : match;
        });
        if(!html.includes('Total Amount') && data.total) {
          var totalRow = '<tr><td colspan="8" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }

      if(s.title === 'ตาราง Account') {
        html = html.replace('<thead><tr>', '<thead><tr><th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:40px">No</th>');
        var rowNum = 0;
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match;
          rowNum++;
          var tds = ['<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">'+rowNum+'</td>'];
          var idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            var isLeft = idx === 0;
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length > 1 ? '<tr>'+tds.join('')+'</tr>' : match;
        });
      }

      if(s.title === 'รายการ Hardware') {
        if(!html.includes('Total Amount') && data.total) {
          var thMatch = html.match(/<thead>(.*?)<\/thead>/s);
          var colCount = thMatch ? (thMatch[1].match(/<th/g)||[]).length : 5;
          var totalRow = '<tr><td colspan="'+(colCount-1)+'" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }

      if(s.title === 'รายการค่าใช้จ่าย') {
        // Convert <ol> list to numbered table for DEP
        if(html.includes('<ol')) {
          var depItems = [];
          html.replace(/<li>(.*?)<\/li>/g, function(m, item) { depItems.push(item.trim()); });
          var depRows = depItems.map(function(item, i) {
            return '<tr>'
              + '<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center;width:50px;vertical-align:top">'+(i+1)+'.</td>'
              + '<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:left">'+item+'</td>'
              + '</tr>';
          }).join('');
          html = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:50px">ที่</th>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt">รายการ</th>'
            + '</tr></thead><tbody>'+depRows+'</tbody></table>';
          if(!html.includes('Total Amount') && data.total) {
            var depTotal = '<tr><td style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">รวม</td>'
              + '<td style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
            html = html.replace('</tbody></table>', depTotal+'</tbody></table>');
          }
        }
      }

      if(s.title === 'รายชื่อผู้เข้าร่วม') {
        if(!html.includes('<table') && html.includes('<ol')) {
          var names = [];
          html.replace(/<li>(.*?)<\/li>/g, function(m, name) { names.push(name.trim()); });
          var rows = names.map(function(n,i) {
            return '<tr><td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center;width:50px">'+(i+1)+'</td><td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:left">'+n+'</td></tr>';
          }).join('');
          html = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:50px">No.</th>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt">รายชื่อ</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>';
        }
      }

      return '<div style="margin-top:12px"><p style="font-weight:700;margin-bottom:6px">'+esc(s.title)+'</p>'+html+(s.title==='รายการ Software'?fxNote:'')+'</div>';
    }).join('')}



    <!-- Closing -->
    ${closingText ? `<div class="mp-closing"><p style="font-size:14pt;line-height:1.8;text-indent:2.5em">${closingText}</p></div>` : ''}

    <!-- Signature boxes -->
    ${(function(){
      // Build approver array — always minimum 2 (reviewer + approver)
      let arr = data.approvers && data.approvers.length > 0
        ? [...data.approvers]
        : [];
      // If only 1 approver, prepend a reviewer slot
      if(arr.length < 2) {
        const revName  = data.reviewerName  && data.reviewerName  !== '-' ? data.reviewerName  : '';
        const revTitle = data.reviewerTitle && data.reviewerTitle !== '-' ? data.reviewerTitle : 'ผู้จัดการโครงการ';
        if(revName) {
          // Use the actual status from approvers if the reviewer is already in the list
          const revEntry = (data.approvers||[]).find(a => a.name === revName);
          arr.unshift({ name: revName, title: revTitle,
            status: revEntry?.status || 'pending',
            approvedAt: revEntry?.approvedAt || null });
        } else if(arr.length === 1) {
          // Duplicate as reviewer — copy full entry including status
          arr.unshift({ ...arr[0], title: 'ผู้จัดการโครงการ' });
        } else {
          arr = [
            { name: data.reviewerName||'-', title: data.reviewerTitle||'ผู้จัดการโครงการ', status:'pending' },
            { name: data.approverName||'-', title: data.approverTitle||'ประธานเจ้าหน้าที่บริหาร', status:'pending' },
          ];
        }
      }
      return '<div class="mp-approval" style="display:grid;grid-template-columns:repeat('+arr.length+',1fr);gap:0;width:100%;margin-top:8px">'
        + arr.map(function(a, i) {
          const isFirst = i === 0;
          const isLast  = i === arr.length - 1;
          // A1 always has headText
          const headText = isFirst
            ? 'เรียน ' + esc(data.to || 'ผู้อำนวยการโครงการ') + ' เพื่อโปรดพิจารณาอนุมัติดำเนินการ'
            : '';
          // Options: A1=เห็นชอบ (multi) or อนุมัติ (single), Last=อนุมัติ, Middle=เห็นชอบ
          const optText = isFirst && arr.length === 1
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : isFirst && arr.length > 1
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : isLast
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : '<div class="mp-appr-opt" style="font-size:12pt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>';
          const sigDate = data.date || '';
          // Milestone 1A Task 1.3: a self-bypassed A1 (status 'bypassed') still shows its
          // signature/date exactly as it did when this was recorded as 'approved'. An
          // 'overridden' step never had its own in-system signature captured either
          // before or after this change, so it's intentionally excluded here.
          const isApproved = a.status === 'approved' || a.status === 'bypassed';
          const sigImgUrl  = isApproved ? getSignatureFromCache(a.name) : null;
          const sigHtml    = sigImgUrl
            ? `<div style="text-align:center;height:54px;display:flex;align-items:center;justify-content:center">` +
              `<img src="${sigImgUrl}" style="max-width:170px;max-height:52px;object-fit:contain"></div>`
            : `<div class="mp-sig-space" style="height:54px"></div>`;
          return '<div class="mp-appr-cell" style="font-size:12pt;padding:10px 12px;min-height:160px;display:flex;flex-direction:column;border:1px solid #000;'+(i>0?'margin-left:-1px;':'')+'">'
            + (headText ? '<div class="mp-appr-head" style="font-size:12pt">'+headText+'</div>' : '')
            + optText
            + '<div style="flex:1"></div>'
            + sigHtml
            + '<div class="mp-sig-name" style="font-size:12pt;font-weight:600;text-align:center">( '+esc(a.name||'-')+' )</div>'
            + '<div class="mp-sig-role" style="font-size:12pt;text-align:center">'+esc(a.title||'-')+'</div>'
            + '<div class="mp-sig-date" style="font-size:12pt;text-align:center">'+(isApproved ? sigDate : '')+'</div>'
            + '</div>';
        }).join('')
        + '</div>';
    })()}

    <!-- Approval Record appendix — Tasks 2/3/4. Business/audit data that
         supplements (does not replace) the official memo body above. Reuses
         the exact same data functions the History "View Memo" detail modal
         uses (views/history.js) — no parallel formatting logic. A new page
         so the original signed memo layout above is never disturbed. -->
    ${(function(){
      const infoHtml     = typeof buildApprovalInfoPdfHtml === 'function' ? buildApprovalInfoPdfHtml(data) : '';
      const timelineHtml = typeof buildApprovalTimelinePdfHtml === 'function' ? buildApprovalTimelinePdfHtml(data) : '';
      if (!infoHtml && !timelineHtml) return '';
      return `<div style="page-break-before:always;padding-top:16px;border-top:2px solid #185FA5">
        <div style="font-size:14pt;font-weight:700;color:#185FA5;margin-bottom:4px">เอกสารประกอบการอนุมัติ (Approval Record)</div>
        <div style="font-size:10pt;color:#666;margin-bottom:6px">เลขที่ ${esc(data.memoNo)} — ข้อมูลประกอบสำหรับการตรวจสอบ ไม่ใช่ส่วนหนึ่งของบันทึกข้อความต้นฉบับ</div>
        ${statusBannerHtml}
        ${infoHtml}
        ${timelineHtml}
      </div>`;
    })()}
    </div>
  </div>`;
}

// ── Normalise memo data before PDF render ────────────────────────
// Rebuilds sections[] from raw item fields when sections is empty.
// This ensures PDF output is identical whether generated at create-time
// or downloaded later from History/Pending tab.
function _normalisePdfData(data) {
  const d = Object.assign({}, data, { sections: (data.sections || []).slice() });

  function _tbl(headers, rows, numericIdx) {
    const thStyle = 'background:#e8e8e8;color:#111;font-weight:600;padding:5px 8px;border:1px solid #ccc;font-size:12pt;text-align:center';
    const ths = headers.map(h => `<th style="${thStyle}">${h}</th>`).join('');
    const trs = rows.map(r => `<tr>${r.map((c, i) => {
      const align = numericIdx.includes(i) ? 'right' : i <= 1 ? 'left' : 'center';
      return `<td style="padding:6px 8px;border:1px solid #ccc;font-size:12pt;text-align:${align}">${c ?? ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  // Account PDF: omit unnamed application columns and require a real email row.
  d.sections = d.sections.flatMap(section => {
    if(section.title !== 'ตาราง Account' || !section.html) return [section];
    const doc = new DOMParser().parseFromString(section.html, 'text/html');
    const headers = Array.from(doc.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const keep = headers.map((header, i) => i === 0 || header ? i : -1).filter(i => i >= 0);
    const rows = Array.from(doc.querySelectorAll('tbody tr')).map(row =>
      Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim())
    ).filter(row => row[0] && row[0] !== '-' && row[0] !== '—');
    if(keep.length < 2 || !rows.length) return [];
    return [{ title:section.title, html:_tbl(keep.map(i => headers[i]), rows.map(row => keep.map(i => row[i] || '')), []) }];
  });

  // SL — rebuild from slItems if no software section
  if (d.type === 'sl' && !(d.sections.find(s => s.title === 'รายการ Software')) && (d.slItems||[]).length) {
    const rows = d.slItems.map((it, i) => [
      i+1, it.name||'—', it.plan||'—',
      it.price ? money(it.price) : '—',
      it.months||'—', it.qty||'—',
      it.startMonth||'—', it.endMonth||'—',
      (it.price&&it.months&&it.qty) ? money(it.price*it.months*it.qty) : '—',
    ]);
    d.sections.unshift({ title:'รายการ Software', html: _tbl(
      ['#','ชื่อ Software','Plan','฿/เดือน','เดือน','จำนวน','เริ่ม','สิ้นสุด','รวม'], rows, [3,8]
    )});
  }

  // HW — rebuild from hwItems if no hardware section
  if (d.type === 'hw' && !(d.sections.find(s => s.title === 'รายการ Hardware')) && (d.hwItems||[]).length) {
    const rows = d.hwItems.map((it, i) => [
      i+1, it.name||'—',
      it.price ? money(it.price) : '—',
      it.qty||'—',
      (it.price&&it.qty) ? money(it.price*it.qty) : '—',
    ]);
    d.sections.push({ title:'รายการ Hardware', html: _tbl(
      ['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], rows, [2,4]
    )});
  }

  return d;
}

async function downloadMemoPdf(data) {
  // ── Ensure sections are populated before PDF render ──────────────
  data = _normalisePdfData(data);

  // ── Preload signatures for all approvers ─────────────────────────
  // Also include legacy reviewerName/approverName fields used in PDF arr construction
  if (typeof _preloadSignatures === 'function') {
    const approversList = [...(data.approvers || [])];
    // Add legacy reviewer/approver if they have names not already in list
    if (data.reviewerName && data.reviewerName !== '-') {
      if (!approversList.find(a => a.name === data.reviewerName)) {
        approversList.push({ name: data.reviewerName, status: 'pending' });
      }
    }
    if (data.approverName && data.approverName !== '-') {
      if (!approversList.find(a => a.name === data.approverName)) {
        approversList.push({ name: data.approverName, status: 'pending' });
      }
    }
    await _preloadSignatures(approversList);
  }

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = renderMemoPdf(data);
  // File naming: [TYPE]_[MemoNo]_[Project]_[Extra]_[Date].Ver1.0.0
  const typeTag = ({ sl:'SL', hw:'HW', int:'INT', ent:'EXT', dep:'DEP' }[data.type] || data.type?.toUpperCase() || 'MEMO');
  const proj    = (data.project || '').replace(/\s+/g,'');
  const memoNo  = (data.memoNo  || 'memo').replace(/\s+/g,'');
  const dateStr = (data.date    || new Date().toISOString().slice(0,10)).replace(/\//g,'-').replace(/\s.*/,'');

  let extra = '';
  if(data.type === 'sl') {
    // Read first software name from memo sections data, NOT from live form DOM
    const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
    let firstName = '';
    if (slSection?.html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = slSection.html;
      const firstTd = tmp.querySelector('tbody tr td:nth-child(2)');
      firstName = firstTd?.textContent?.trim() || '';
    }
    // Fallback to slItems array
    if (!firstName) {
      firstName = (data.slItems||[]).find(it => it.name && it.name !== '-')?.name || '';
    }
    extra = firstName ? '_' + firstName.replace(/\s+/g,'') : '';
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
  // ── Show loading indicator ────────────────────────────────────────
  const loadingEl = document.createElement('div');
  loadingEl.id = 'pdf-loading-overlay';
  loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  loadingEl.innerHTML = '<div style="background:#fff;border-radius:12px;padding:28px 36px;text-align:center;font-family:\'IBM Plex Sans Thai\',sans-serif">'
    + '<div style="font-size:15px;font-weight:600;color:#185FA5;margin-bottom:8px">⏳ กำลังสร้าง PDF...</div>'
    + '<div id="pdf-loading-msg" style="font-size:12px;color:#666">กรุณารอสักครู่</div>'
    + '</div>';
  document.body.appendChild(loadingEl);
  const setMsg = msg => { const el = document.getElementById('pdf-loading-msg'); if(el) el.textContent = msg; };

  try {
    setMsg('กำลังติดต่อ PDF server...');
    const html = stage.firstElementChild?.outerHTML || stage.innerHTML;
    console.log('[PDF] Sending to server, html length:', html.length, 'filename:', filename);
    const resp = await fetchWithRetry('https://memo-pdf-server.onrender.com/generate-pdf', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ html, filename, logoBase64: LOGO_B64 })
    });
    if(!resp.ok) throw new Error('Server '+resp.status);
    setMsg('กำลัง download...');
    const blob = await resp.blob();
    console.log('[PDF] Received blob, size:', blob.size, 'bytes');
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
    console.log('[PDF] Download triggered:', filename);
  } catch(err) {
    console.warn('[PDF] Server failed, fallback to print:', err.message);
    setMsg('Server ไม่ตอบสนอง — เปิด Print dialog แทน');
    await new Promise(r => setTimeout(r, 800));
    document.body.classList.add('printing-pdf');
    try { window.print(); } finally { document.body.classList.remove('printing-pdf'); }
  } finally {
    loadingEl.remove();
  }
}
function openMemoPdf(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo) { alert('ไม่พบ Memo'); return; }
  downloadMemoPdf(memo);
}

// ── Init ──
// ── Shared CSV export helper ──────────────────────────────────────
// UTF-8 CSV with BOM so Excel opens Thai text correctly
function _downloadCSV(filename, headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Sidebar collapse ──────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const collapsed = sb.classList.toggle('collapsed');
  try { localStorage.setItem('orbit-sb-collapsed', collapsed ? '1' : '0'); } catch(e) {}
}
function initSidebarState() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  try {
    const savedState = localStorage.getItem('orbit-sb-collapsed');
    const compactScreen = window.matchMedia?.('(max-width: 700px)').matches;
    if (savedState === '1' || (savedState === null && compactScreen)) sb.classList.add('collapsed');
  } catch(e) {}
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
  // Load Supabase-backed Memo dependencies and refresh UI.
  Promise.all([
    loadMemosAsync(),
    typeof loadOrganizationProjectsAsync === 'function' ? loadOrganizationProjectsAsync() : Promise.resolve(),
    loadUserProfilesAsync(),
    loadAuthorityAsync(),
    typeof loadDevicesAsync === 'function' ? loadDevicesAsync() : Promise.resolve(),
    typeof loadPurchaseOrdersAsync === 'function' ? loadPurchaseOrdersAsync() : Promise.resolve(),
    typeof initSettings === 'function' ? initSettings() : Promise.resolve(),
  ]).then(() => {
    renderPendingMemos();
    renderHistoryMemos();
    refreshNotifications();
    if(typeof refreshOwnedProjectControls === 'function') refreshOwnedProjectControls();
    if(typeof refreshApproverDropdowns === 'function') refreshApproverDropdowns();
  }).catch(e => console.warn('Supabase init load failed', e));
  document.addEventListener('click', event => {
    const panel = document.getElementById('notification-panel');
    if(!panel?.classList.contains('is-open')) return;
    if(event.target.closest('#notification-panel, #notification-btn')) return;
    closeNotifications();
  });
}
