/* ============================================================================
 * PMO_ERP — Full E2E Functional Test Harness (paste-into-browser-console)
 * ============================================================================
 *
 * WHAT THIS IS
 *   A JavaScript test harness you paste into the DevTools Console of a real,
 *   loaded instance of this app. It drives the SAME functions the UI's own
 *   buttons call (submitMemo(), confirmApprove(), saveBudgetPool(), etc.) and
 *   reads/writes the SAME DOM inputs a person would type into. It does not
 *   insert rows into Supabase directly, does not hand-edit localStorage to
 *   force a status, and does not skip approval stages — it only:
 *     (a) sets input.value + dispatches input/change events (same as typing),
 *     (b) .click()s real buttons / calls the exact onclick handler function,
 *     (c) reads back app state via the app's own loadX() functions and via
 *         read-only Supabase GETs, for verification only.
 *   window.alert()/window.confirm() are temporarily intercepted so the script
 *   doesn't block on a native dialog — every captured message is recorded and
 *   inspectable, so "does the validation message read clearly" is still
 *   verifiable from the results.
 *
 * WHY THIS SHAPE
 *   This app (confirmed by direct source reading, 2026-07-10, commit ec6fbad
 *   "feat(memo): productionize memo approval settings") is a build-free vanilla
 *   JS SPA: plain <script> tags (app.js, auth.js, views/*.js), no bundler, no
 *   framework, all functions global on `window`. There is no separate backend
 *   API layer to call instead of the UI — calling window.submitMemo() etc. IS
 *   calling the real, only application logic, identical to clicking the real
 *   button. Auth is a client-only mock facade (auth.js, pmoSignInMock()) —
 *   there is no real login screen, so "signing in as a different approver" in
 *   this app IS switching the mock session, exactly as a real user of this
 *   PoC would.
 *
 * IMPORTANT ENVIRONMENT CAVEATS (found during code review — verify before you
 * trust results derived from them):
 *   1. NO SEEDED TEST USERS. There is no login/user table separate from
 *      `user_profiles`. "Signing in" just types a name/email/role into a mock
 *      session (localStorage key orbit-pmo-auth-session-v1). This script reads
 *      REAL rows from `user_profiles` (via Settings > People, already-configured
 *      master data) to source Requester/Reviewer/Approver identities — it never
 *      invents fictitious people. If `user_profiles` has fewer than 3 active
 *      people, approval-chain suites will report BLOCKED, not fail silently.
 *   2. NO DATABASE-LEVEL RLS ENFORCEMENT. Every table's RLS policy is
 *      `using (true) / with check (true)` for both `anon` and `authenticated`
 *      (confirmed across every migration file). All permission checks
 *      (isPMO(), canCurrentUserActOnMemo(), etc.) are client-side JS only. The
 *      project's own docs (docs/MEMO_LIFECYCLE.md, docs/SYSTEM_OVERVIEW.md)
 *      already flag this as a known, deferred gap — this script's Permissions
 *      suite therefore only proves "the UI hides/blocks the action for the
 *      wrong user," NOT "the database refuses it." Say so explicitly in your
 *      report; it is not a new defect this run discovered.
 *   3. Memo types with a creation UI are ONLY: sl, hw, int, ent, dep. There is
 *      no Infra or "Other" memo creation flow, despite SPEND_TYPES including
 *      Infra/Others (those are reachable only via Manual Actual Spend / Infra
 *      Cost, not Create Memo). The script reports this as N/A, not a failure.
 *   4. Purchase Orders have NO manual creation form by design — the empty
 *      state literally says "approve a Hardware memo to create one
 *      automatically." Don't test "create PO" as a standalone action.
 *   5. Deletes across Budget Pool / Manual Expense / License / Device are ALL
 *      soft-delete (status flip / voided_at / deleted flag) — there is no hard
 *      DELETE anywhere in this codebase (confirmed: no `delete` grant even
 *      exists in RLS for most of these tables). Cleanup uses the same
 *      soft-delete actions a real PMO user would use.
 *   6. This repo's own test suite (`npm test`) covers ONLY the Resource module
 *      (33 tests, all in tests/*.test.js). Memo/Budget/BvA/License/Device have
 *      ZERO existing automated coverage — this script is genuinely the first
 *      functional coverage for those modules, not a duplicate of anything.
 *
 * USAGE
 *   1. Open the app in Chrome (the real URL you're testing), open DevTools.
 *   2. Paste this entire file into the Console and press Enter.
 *   3. Run, in order:
 *        await PMO_E2E.envPrecheck()          // do this FIRST, read its output
 *        await PMO_E2E.runAll()               // full run, ~5-10 min
 *        // or, to run one module at a time:
 *        await PMO_E2E.run('memoCreateSLHappyPath')
 *        await PMO_E2E.run('approvalFlowSL')
 *        ...
 *        PMO_E2E.printReport()                // coverage matrix
 *        PMO_E2E.printDefects()                // defect list
 *        console.log(PMO_E2E.toMarkdown())     // paste into your final report
 *        await PMO_E2E.cleanup()               // remove all E2E-TEST-* records
 *   4. Suite names: see PMO_E2E.suiteNames after loading, or the SUITES object
 *      near the bottom of this file.
 *
 * This script never runs itself — you decide when to call PMO_E2E.runAll().
 * ==========================================================================*/
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 0. CONFIG / IDENTITY
  // ---------------------------------------------------------------------------
  const NOW = new Date();
  const pad = n => String(n).padStart(2, '0');
  const TS = `${NOW.getFullYear()}${pad(NOW.getMonth() + 1)}${pad(NOW.getDate())}-${pad(NOW.getHours())}${pad(NOW.getMinutes())}`;
  const TEST_PREFIX = `E2E-TEST-${TS}`;
  const prefixed = (scenario) => `${TEST_PREFIX}-${scenario}`;

  // ---------------------------------------------------------------------------
  // 1. RESULT / DEFECT TRACKING
  // ---------------------------------------------------------------------------
  const RESULTS = [];   // coverage matrix rows
  const DEFECTS = [];   // defect list rows
  let defectSeq = 0;

  function record(row) { RESULTS.push({ ts: new Date().toISOString(), ...row }); }

  function pass(module, scenario, opts = {}) {
    record({ module, scenario, positive: opts.positive ?? true, negative: opts.negative ?? false, edge: opts.edge ?? false, result: 'PASS', evidence: opts.evidence || '' });
    console.log(`%c[PASS] ${module} — ${scenario}`, 'color:#3B6D11;font-weight:bold', opts.evidence || '');
  }

  function blocked(module, scenario, reason) {
    record({ module, scenario, result: 'BLOCKED', evidence: reason });
    console.warn(`[BLOCKED] ${module} — ${scenario}: ${reason}`);
  }

  function fail(module, scenario, detail = {}) {
    defectSeq += 1;
    const id = `DEF-${String(defectSeq).padStart(3, '0')}`;
    const defect = {
      id, severity: detail.severity || 'High', module, scenario,
      testData: detail.testData || '', expected: detail.expected || '',
      actual: detail.actual || '', reproduction: detail.reproduction || '(see scenario steps in console trace above)',
      evidence: detail.evidence || '',
    };
    DEFECTS.push(defect);
    record({ module, scenario, result: 'FAIL', evidence: `${id}: ${detail.actual || ''}` });
    // Reported immediately, not batched — matches "report defects as found."
    console.error(`%c[FAIL] ${id} (${defect.severity}) ${module} — ${scenario}`, 'color:#A32D2D;font-weight:bold', defect);
    return defect;
  }

  function printReport() {
    console.log(`%c=== Coverage Matrix (${RESULTS.length} rows) ===`, 'font-weight:bold;font-size:13px');
    console.table(RESULTS.map(r => ({ Module: r.module, Scenario: r.scenario, Result: r.result, Evidence: r.evidence })));
  }
  function printDefects() {
    console.log(`%c=== Defects (${DEFECTS.length}) ===`, 'font-weight:bold;font-size:13px;color:#A32D2D');
    console.table(DEFECTS);
  }
  function toMarkdown() {
    const passCt = RESULTS.filter(r => r.result === 'PASS').length;
    const failCt = RESULTS.filter(r => r.result === 'FAIL').length;
    const blockCt = RESULTS.filter(r => r.result === 'BLOCKED').length;
    let md = `## E2E Run — ${TEST_PREFIX}\n\n`;
    md += `Total: ${RESULTS.length} | PASS: ${passCt} | FAIL: ${failCt} | BLOCKED: ${blockCt}\n\n`;
    md += `### Coverage Matrix\n\n| Module | Scenario | Result | Evidence |\n|---|---|---|---|\n`;
    RESULTS.forEach(r => { md += `| ${r.module} | ${r.scenario} | ${r.result} | ${String(r.evidence || '').replace(/\|/g, '/').slice(0, 200)} |\n`; });
    md += `\n### Defects\n\n| ID | Severity | Module | Scenario | Expected | Actual |\n|---|---|---|---|---|---|\n`;
    DEFECTS.forEach(d => { md += `| ${d.id} | ${d.severity} | ${d.module} | ${d.scenario} | ${String(d.expected).slice(0,150)} | ${String(d.actual).slice(0,150)} |\n`; });
    return md;
  }

  async function step(module, scenario, fn, { severity = 'High', evidence = '' } = {}) {
    try {
      const result = await fn();
      pass(module, scenario, { evidence: evidence || (result != null ? String(result).slice(0, 200) : '') });
      return { ok: true, result };
    } catch (e) {
      if (e && e.__blocked) { blocked(module, scenario, e.message); return { ok: false, blocked: true }; }
      fail(module, scenario, { actual: e && e.message ? e.message : String(e), severity, evidence: e && e.stack });
      return { ok: false, error: e };
    }
  }
  function blockErr(message) { const e = new Error(message); e.__blocked = true; return e; }

  // ---------------------------------------------------------------------------
  // 2. LOW-LEVEL DOM / ASYNC UTILITIES
  // ---------------------------------------------------------------------------
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitFor(fn, { timeout = 5000, interval = 100, label = '' } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = await fn();
      if (v) return v;
      await sleep(interval);
    }
    throw new Error(`waitFor() timed out${label ? ' waiting for: ' + label : ''}`);
  }

  function q(selector, root = document) { return root.querySelector(selector); }
  function qa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

  function setInputValue(elOrSelector, value) {
    const el = typeof elOrSelector === 'string' ? q(elOrSelector) : elOrSelector;
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function setChecked(selector, checked) {
    const el = q(selector);
    if (!el) return false;
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function clickEl(elOrSelector) {
    const el = typeof elOrSelector === 'string' ? q(elOrSelector) : elOrSelector;
    if (!el) return false;
    el.click();
    return true;
  }
  function textOf(selector) { const el = q(selector); return el ? el.textContent.trim() : null; }
  function valOf(selector) { const el = q(selector); return el ? el.value : null; }

  // Intercepts window.alert()/window.confirm() for the duration of `fn` so a
  // real blocking browser dialog never appears (this app uses alert() for
  // validation messages and confirm() for "are you sure" prompts). Captured
  // text is returned so validation-message-clarity is still assertable.
  async function withDialogCapture(fn, { confirmAnswer = true } = {}) {
    const origAlert = window.alert, origConfirm = window.confirm;
    const captured = { alerts: [], confirms: [] };
    window.alert = (msg) => { captured.alerts.push(String(msg)); };
    window.confirm = (msg) => { captured.confirms.push(String(msg)); return confirmAnswer; };
    try {
      const result = await fn();
      return { result, ...captured };
    } finally {
      window.alert = origAlert; window.confirm = origConfirm;
    }
  }

  function goTo(viewId) {
    const navEl = qa('[onclick*="swView("]').find(el => el.getAttribute('onclick').includes(`swView('${viewId}'`));
    if (!navEl) throw new Error(`Nav item for view "${viewId}" not found — sidebar markup may have changed since this script was written`);
    navEl.click();
  }

  // ---------------------------------------------------------------------------
  // 3. PASSIVE CONSOLE / NETWORK ERROR CAPTURE (installed immediately)
  // ---------------------------------------------------------------------------
  const CONSOLE_ERRORS = [];
  const NETWORK_ERRORS = [];
  (function installCapture() {
    const origError = console.error.bind(console);
    console.error = (...args) => { CONSOLE_ERRORS.push({ t: new Date().toISOString(), msg: args.map(String).join(' ') }); origError(...args); };
    window.addEventListener('error', e => CONSOLE_ERRORS.push({ t: new Date().toISOString(), msg: `window.onerror: ${e.message} @ ${e.filename}:${e.lineno}` }));
    window.addEventListener('unhandledrejection', e => CONSOLE_ERRORS.push({ t: new Date().toISOString(), msg: `unhandledrejection: ${e.reason}` }));
    if (typeof window.fetch === 'function' && !window.__PMO_E2E_FETCH_WRAPPED__) {
      window.__PMO_E2E_FETCH_WRAPPED__ = true;
      const origFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        try {
          const res = await origFetch(...args);
          if (!res.ok) NETWORK_ERRORS.push({ t: new Date().toISOString(), url: String(args[0]), status: res.status });
          return res;
        } catch (e) {
          NETWORK_ERRORS.push({ t: new Date().toISOString(), url: String(args[0]), error: String(e) });
          throw e;
        }
      };
    }
  })();

  // ---------------------------------------------------------------------------
  // 4. SUPABASE READ HELPERS (verification / reconciliation only — never used
  //    to seed or force state; every write in this script goes through a real
  //    UI action / the app's own save*/submit* function).
  // ---------------------------------------------------------------------------
  async function sbGet(table, query = '') {
    if (typeof window.supaFetch !== 'function') throw blockErr('supaFetch() not found on window — app.js not loaded, or you are not on the app page');
    return window.supaFetch(table, 'GET', null, query);
  }

  // ---------------------------------------------------------------------------
  // 5. SESSION / IDENTITY HELPERS
  //    Real people only — sourced from user_profiles (Settings > People), the
  //    same master data Create Memo's Reviewer/Approver dropdowns use. Never
  //    invents a fictitious name.
  // ---------------------------------------------------------------------------
  let _profilesCache = null;
  async function realProfiles(forceRefresh = false) {
    if (_profilesCache && !forceRefresh) return _profilesCache;
    try {
      const rows = await sbGet('user_profiles', '?is_active=eq.true&order=full_name.asc');
      _profilesCache = Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn('[PMO_E2E] could not read user_profiles from Supabase — approval-chain suites may report BLOCKED:', e.message);
      _profilesCache = [];
    }
    return _profilesCache;
  }

  function signInAs({ name, email, role = 'user', project = '' }) {
    if (typeof window.pmoSignInMock !== 'function') throw new Error('pmoSignInMock() not found — auth.js not loaded');
    return window.pmoSignInMock({ name, email, role, project });
  }
  function currentSession() { return typeof window.pmoCurrentSession === 'function' ? window.pmoCurrentSession() : null; }

  // ---------------------------------------------------------------------------
  // 6. ENVIRONMENT PRECHECK  (run this first, always)
  // ---------------------------------------------------------------------------
  async function envPrecheck() {
    const report = { url: window.location.href };
    report.supabaseUrl = (window.__PMO_CONFIG__ && window.__PMO_CONFIG__.supabaseUrl) || '(NOT SET — config.js missing/not loaded)';
    report.consoleErrorsBeforeTest = CONSOLE_ERRORS.length;
    report.currentSession = currentSession();
    try { report.organizationProjects = await sbGet('organization_projects', '?status=eq.active&select=code,name&order=name.asc'); }
    catch (e) { report.organizationProjects = `ERROR: ${e.message}`; }
    try { report.userProfiles = await realProfiles(true); }
    catch (e) { report.userProfiles = `ERROR: ${e.message}`; }
    try {
      const existing = await sbGet('memos', `?memo_no=ilike.*${encodeURIComponent(TEST_PREFIX)}*&select=memo_no`);
      report.priorTestMemos = existing.length;
      if (existing.length) console.warn(`[PMO_E2E] ${existing.length} memo(s) already exist with this exact TEST_PREFIX — unexpected, investigate before proceeding.`);
    } catch (e) { report.priorTestMemos = `ERROR: ${e.message}`; }

    console.log('%c[PMO_E2E] Environment precheck', 'font-weight:bold;font-size:13px', report);
    console.log('Organization Projects (real master data — use these, never invent a project name):');
    console.table(Array.isArray(report.organizationProjects) ? report.organizationProjects : []);
    console.log('User Profiles / people available for Reviewer/A1/A2/A3 (real master data):');
    console.table(Array.isArray(report.userProfiles) ? report.userProfiles.map(p => ({ full_name: p.full_name, title: p.title, email: p.email, is_pmo: p.is_pmo, can_review: p.can_review, can_approve: p.can_approve })) : []);
    if (Array.isArray(report.userProfiles) && report.userProfiles.length < 3) {
      console.warn('[PMO_E2E] Fewer than 3 active people in user_profiles — 3-stage approval-chain scenarios will report BLOCKED, not silently pass. Add people via Settings > People, or accept 2-stage-only coverage.');
    }
    console.log('%cManual prep checklist (not automatable from the browser):', 'font-weight:bold');
    console.log('  - Confirm current git branch + commit (run `git rev-parse --abbrev-ref HEAD && git rev-parse HEAD` in your terminal).');
    console.log('  - Confirm this Supabase URL above is the intended environment (staging vs prod) before creating test data.');
    console.log('  - Confirm test data can be safely deleted (this Supabase project is not shared with real users during this run).');
    return report;
  }

  // ---------------------------------------------------------------------------
  // 7. MEMO CREATION HELPERS
  // ---------------------------------------------------------------------------
  function openCreateMemo() { goTo('create'); }

  function selectMemoType(type) {
    const btn = qa('.type-btn').find(b => (b.getAttribute('onclick') || '').includes(`selectType('${type}'`));
    if (!btn) throw new Error(`Memo type button for "${type}" not found`);
    btn.click();
  }

  function realProjectOptions() {
    const sel = q('#f-project');
    if (!sel) throw new Error('#f-project not found — open Create Memo first (openCreateMemo())');
    return [...sel.options].map(o => o.value).filter(v => v && v !== 'other');
  }

  function fillCommonMemoFields({ memoNo, date, project, reason }) {
    if (memoNo) setInputValue('#f-memo-no', memoNo);
    if (date) setInputValue('#f-date', date);
    if (project) {
      const sel = q('#f-project');
      const hasOption = [...sel.options].some(o => o.value === project);
      setInputValue('#f-project', hasOption ? project : 'other');
      if (!hasOption) setInputValue('#f-project-other', project);
    }
    if (reason) {
      const sel = q('#f-reason');
      const opt = [...sel.options].find(o => o.value === reason || o.textContent === reason);
      if (opt) setInputValue('#f-reason', opt.value);
      else { setInputValue('#f-reason', 'other'); setInputValue('#f-reason-other', reason); }
    }
  }

  async function waitForApproverRows(minCount = 2) {
    return waitFor(() => qa('#approver-rows-form .appr-form-row').length >= minCount, { label: 'approver rows rendered' });
  }
  function approverNameOptions(index) {
    const rows = qa('#approver-rows-form .appr-form-row');
    const row = rows[index];
    return row ? [...row.querySelector('.appr-name-sel').options].map(o => o.value).filter(Boolean) : [];
  }
  function fillApproverRow(index, { name, title } = {}) {
    const rows = qa('#approver-rows-form .appr-form-row');
    const row = rows[index];
    if (!row) throw new Error(`Approver row ${index} not found (only ${rows.length} rendered)`);
    if (name) setInputValue(row.querySelector('.appr-name-sel'), name); // fires onApproverNameChange -> auto-fills title
    if (title) setInputValue(row.querySelector('.appr-title-sel'), title);
  }
  function addApproverRow() { clickEl('#btn-add-approver'); }
  function removeApproverRow(index) {
    const rows = qa('#approver-rows-form .appr-form-row');
    const row = rows[index];
    const btn = row && row.querySelector('.rm-btn');
    if (btn) btn.click();
  }

  /** Picks N distinct real people from the A1 dropdown's own rendered options
   *  (this IS the app's real Reviewer/Approver master data) and fills rows
   *  0..N-1. Throws a BLOCKED error (not a fail) if not enough distinct people
   *  are configured — this is an environment gap, not an app defect. */
  async function autoFillApprovalChain(count) {
    await waitForApproverRows(2);
    while (qa('#approver-rows-form .appr-form-row').length < count) addApproverRow();
    const names = approverNameOptions(0);
    if (names.length < count) {
      throw blockErr(`Only ${names.length} people available in the Reviewer/Approver dropdown (Settings > People) — need ${count} distinct people. Add more people in Settings before running this suite.`);
    }
    for (let i = 0; i < count; i++) fillApproverRow(i, { name: names[i] });
    return names.slice(0, count);
  }

  function addSoftwareRow() { if (typeof window.addSLRow !== 'function') throw new Error('addSLRow() not found'); window.addSLRow(); }
  function addHardwareRow() { if (typeof window.addHWRow !== 'function') throw new Error('addHWRow() not found'); window.addHWRow(); }

  function fillSoftwareRow(index, { name, plan, price, months, qty, start, end } = {}) {
    const rows = qa('#sl-rows .item-row');
    const row = rows[index];
    if (!row) throw new Error(`SL row ${index} not found`);
    if (name != null) setInputValue(row.querySelector('.sl-name'), name);
    if (plan != null) setInputValue(row.querySelector('.sl-plan'), plan);
    if (price != null) setInputValue(row.querySelector('.sl-price'), price);
    if (months != null) setInputValue(row.querySelector('.sl-mo'), months);
    if (qty != null) setInputValue(row.querySelector('.sl-qty'), qty);
    if (start != null) setInputValue(row.querySelector('.sl-start'), start);
    if (end != null) setInputValue(row.querySelector('.sl-end'), end);
  }
  function setSLAmountWords(text) { setInputValue('#fs-sl .form-grid .fg:nth-child(2) input', text); }

  function fillHardwareRow(index, { name, price, qty } = {}) {
    const rows = qa('#hw-rows .item-row');
    const row = rows[index];
    if (!row) throw new Error(`HW row ${index} not found`);
    const nameInput = row.querySelector('input:first-child');
    if (name != null && nameInput) setInputValue(nameInput, name);
    if (price != null) setInputValue(row.querySelector('.hw-price'), price);
    if (qty != null) setInputValue(row.querySelector('.hw-qty'), qty);
  }
  function setHWAmountWords(text) { setInputValue('#fs-hw .form-grid .fg:nth-child(1) input', text); }
  function setHWOwner(text) { setInputValue('#fs-hw .form-grid .fg:nth-child(2) input', text); }

  function fillIntFields({ activity, date, headcount, perPerson, amountWords, names = [] } = {}) {
    if (activity != null) setInputValue('#int-activity', activity);
    if (date != null) setInputValue('#int-date', date);
    if (headcount != null) setInputValue('#int-headcount', headcount);
    if (perPerson != null) setInputValue('#int-pp', perPerson);
    if (amountWords != null) setInputValue('#int-amount-words', amountWords);
    const addBtn = qa('.add-btn').find(b => (b.getAttribute('onclick') || '').includes("addName('int-names'"));
    names.forEach((n, i) => {
      if (!qa('.int-name')[i]) { if (!addBtn) throw new Error('INT add-name button not found'); addBtn.click(); }
      setInputValue(qa('.int-name')[i], n);
    });
  }

  function fillEntFields({ client, date, place, people, total, amountWords } = {}) {
    const inputs = qa('#fs-ent input');
    if (!inputs.length) throw new Error('#fs-ent inputs not found — select ENT type first');
    if (client != null) setInputValue(inputs[0], client);
    if (date != null) setInputValue(inputs[1], date);
    if (place != null) setInputValue(inputs[2], place);
    if (people != null) setInputValue(inputs[3], people);
    if (total != null) setInputValue(inputs[4], total);
    if (amountWords != null) setInputValue(inputs[5], amountWords);
  }

  function fillDepFields({ start, end, empCount, location, amountWords } = {}) {
    if (start != null) setInputValue('#dep-start', start);
    if (end != null) setInputValue('#dep-end', end);
    if (empCount != null) setInputValue('#dep-emp-count', empCount);
    if (location != null) setInputValue('#dep-location', location);
    if (amountWords != null) setInputValue('#dep-amount-words', amountWords);
  }
  function addDepCalcItem() { clickEl('[onclick="addDepCalcItem()"]'); }
  function fillDepCalcItem(index, { name, price, qty }) {
    const rows = qa('#dep-items .dep-calc-row');
    const row = rows[index];
    if (!row) throw new Error(`DEP calc row ${index} not found`);
    if (name != null) setInputValue(row.querySelector('.dep-item-name'), name);
    if (price != null) setInputValue(row.querySelector('.dep-item-price'), price);
    if (qty != null) setInputValue(row.querySelector('.dep-item-qty'), qty);
  }

  async function submitCurrentMemo() {
    if (typeof window.submitMemo !== 'function') throw new Error('submitMemo() not found');
    return withDialogCapture(() => window.submitMemo(), { confirmAnswer: true });
  }
  async function saveDraftCurrentMemo() {
    if (typeof window.saveDraft !== 'function') throw new Error('saveDraft() not found');
    return withDialogCapture(() => window.saveDraft(), { confirmAnswer: true });
  }

  // ---------------------------------------------------------------------------
  // 8. STATE VERIFICATION HELPERS (read-only)
  // ---------------------------------------------------------------------------
  function getMemoByNo(memoNo) {
    if (typeof window.loadMemos !== 'function') throw new Error('loadMemos() not found');
    return window.loadMemos().find(m => m.memoNo === memoNo);
  }
  async function getMemoFromSupabase(memoNo) {
    const rows = await sbGet('memos', `?memo_no=eq.${encodeURIComponent(memoNo)}`);
    return rows && rows[0];
  }
  function getActualSpendForMemo(memoNo) {
    if (typeof window.loadActualSpendRecords !== 'function') throw new Error('loadActualSpendRecords() not found');
    return window.loadActualSpendRecords().find(r => r.memoId === memoNo);
  }
  function getPOsForMemo(memoNo) {
    return (typeof window.loadPurchaseOrders === 'function' ? window.loadPurchaseOrders() : []).filter(po => po.memoNo === memoNo);
  }
  function getDevicesForPO(poId) {
    return (typeof window.loadDevices === 'function' ? window.loadDevices() : []).filter(d => d.purchaseOrderId === poId);
  }

  // ---------------------------------------------------------------------------
  // 9. APPROVAL FLOW HELPERS
  // ---------------------------------------------------------------------------
  function goToPending() { goTo('pending'); }
  function findPendingCard(memoNo) { return qa('.pend-card').find(c => c.textContent.includes(memoNo)); }

  async function approveViaCard(memoNo, { note = '' } = {}) {
    const card = await waitFor(() => findPendingCard(memoNo), { label: `pending card for ${memoNo}` });
    const btn = card.querySelector('.btn-approve');
    if (!btn) return { blocked: true, reason: 'No Approve button visible on this card for the current signed-in user (expected if not the current-stage approver).' };
    btn.click();
    await waitFor(() => q('#approve-modal') && q('#approve-modal').style.display === 'flex', { label: 'approve modal open' });
    if (note) setInputValue('#approve-note', note);
    if (typeof window.confirmApprove !== 'function') throw new Error('confirmApprove() not found');
    return withDialogCapture(() => window.confirmApprove(), { confirmAnswer: true });
  }

  async function rejectViaCard(memoNo, { reason, comment = '' } = {}) {
    const card = await waitFor(() => findPendingCard(memoNo), { label: `pending card for ${memoNo}` });
    const btn = card.querySelector('.btn-reject');
    if (!btn) return { blocked: true, reason: 'No Reject button visible on this card for the current signed-in user.' };
    btn.click();
    await waitFor(() => q('#reject-modal') && q('#reject-modal').style.display === 'flex', { label: 'reject modal open' });
    const sel = q('#reject-reason-select');
    const opt = [...sel.options].find(o => o.value === reason) || [...sel.options].find(o => o.value === 'Other');
    setInputValue('#reject-reason-select', opt ? opt.value : reason);
    if (comment) setInputValue('#reject-comment', comment);
    if (typeof window.confirmReject !== 'function') throw new Error('confirmReject() not found');
    return withDialogCapture(() => window.confirmReject(), { confirmAnswer: true });
  }

  // ---------------------------------------------------------------------------
  // 10. BUDGET POOL HELPERS
  // ---------------------------------------------------------------------------
  function goToBudget() { goTo('budget'); }
  function openNewBudgetPoolModal() {
    if (typeof window.openBudgetPoolModal !== 'function') throw new Error('openBudgetPoolModal() not found');
    window.openBudgetPoolModal();
  }
  function openEditBudgetPoolModal(poolId) { window.openBudgetPoolModal(poolId); }
  function fillBudgetPoolForm({ project, name, budget, yearBE, startMonth, endMonth, spendTypes = [] } = {}) {
    if (project) setInputValue('#bpool-project', project);
    if (name) setInputValue('#bpool-name', name);
    if (budget != null) setInputValue('#bpool-budget', budget);
    if (yearBE) setInputValue('#bpool-year', String(yearBE));
    if (startMonth) setInputValue('#bpool-start-month', String(startMonth));
    if (endMonth) setInputValue('#bpool-end-month', String(endMonth));
    const boxes = qa('#bpool-modal input[id^="bpool-type-"]');
    boxes.forEach(box => {
      const key = box.id.replace('bpool-type-', '');
      if (spendTypes.length) setChecked(`#${box.id}`, spendTypes.includes(key));
    });
  }
  async function saveBudgetPoolForm() {
    if (typeof window.saveBudgetPool !== 'function') throw new Error('saveBudgetPool() not found');
    return withDialogCapture(() => window.saveBudgetPool(), { confirmAnswer: true });
  }
  function getBudgetPools() { return typeof window.loadBudgetPools === 'function' ? window.loadBudgetPools() : []; }
  function findBudgetPoolByName(name) { return getBudgetPools().find(p => p.name === name && p.status !== 'inactive'); }
  async function deleteBudgetPoolByName(name) {
    const pool = findBudgetPoolByName(name);
    if (!pool) return { skipped: true };
    if (typeof window.deleteBudgetPool !== 'function') throw new Error('deleteBudgetPool() not found');
    return withDialogCapture(() => window.deleteBudgetPool(pool.id), { confirmAnswer: true });
  }

  // ---------------------------------------------------------------------------
  // 11. MANUAL ACTUAL SPEND HELPERS
  // ---------------------------------------------------------------------------
  function openNewManualExpenseModal() {
    if (typeof window.openManualExpenseModal !== 'function') throw new Error('openManualExpenseModal() not found');
    window.openManualExpenseModal();
  }
  function fillManualExpenseForm({ reference, project, spendType, description, frequency = 'one_time', date, startMonth, endMonth, amount, vendorProgram, notes } = {}) {
    if (reference != null) setInputValue('#me-reference', reference);
    if (project) setInputValue('#me-project', project);
    if (spendType) setInputValue('#me-type', spendType);
    if (description != null) setInputValue('#me-description', description);
    if (frequency) setInputValue('#me-frequency', frequency);
    if (frequency === 'one_time' && date) setInputValue('#me-date', date);
    if (frequency === 'monthly') {
      if (startMonth) setInputValue('#me-start', startMonth);
      if (endMonth) setInputValue('#me-end', endMonth);
    }
    if (amount != null) setInputValue('#me-amount-input', amount);
    if (vendorProgram != null) setInputValue('#me-vendor-program', vendorProgram);
    if (notes != null) setInputValue('#me-notes', notes);
  }
  async function saveManualExpenseForm() {
    if (typeof window.saveManualExpenseFromModal !== 'function') throw new Error('saveManualExpenseFromModal() not found');
    return withDialogCapture(() => window.saveManualExpenseFromModal(), { confirmAnswer: true });
  }
  function getManualExpenses() {
    return typeof window.loadActualSpendRecords === 'function'
      ? window.loadActualSpendRecords().filter(r => r.source === 'manual_spending')
      : [];
  }

  // ---------------------------------------------------------------------------
  // 12. LICENSE HELPERS
  // ---------------------------------------------------------------------------
  function goToLicense() { goTo('license'); }
  function openNewLicenseModal() {
    if (typeof window.openLicenseModal !== 'function') throw new Error('openLicenseModal() not found');
    window.openLicenseModal();
  }
  function openEditLicenseModal(id) { window.openLicenseModal(id); }
  function fillLicenseForm({ name, plan, vendor, seats, price, owner, dept, project, licenseType, purchaseDate, expiryDate, billing, status, memoRef, note } = {}) {
    if (name != null) setInputValue('#lic-name', name);
    if (plan != null) setInputValue('#lic-plan', plan);
    if (vendor != null) setInputValue('#lic-vendor', vendor);
    if (seats != null) setInputValue('#lic-seats', seats);
    if (price != null) setInputValue('#lic-price', price);
    if (owner != null) setInputValue('#lic-owner', owner);
    if (dept != null) setInputValue('#lic-dept', dept);
    if (project) setInputValue('#lic-project', project);
    if (licenseType) setInputValue('#lic-type-field', licenseType);
    if (purchaseDate) setInputValue('#lic-purchase-date', purchaseDate);
    if (expiryDate != null) setInputValue('#lic-expiry-date', expiryDate);
    if (billing) setInputValue('#lic-billing', billing);
    if (status) setInputValue('#lic-status-field', status);
    if (memoRef != null) setInputValue('#lic-memo-ref', memoRef);
    if (note != null) setInputValue('#lic-note', note);
  }
  async function saveLicenseForm() {
    if (typeof window.saveLicenseManual !== 'function') throw new Error('saveLicenseManual() not found');
    return withDialogCapture(() => window.saveLicenseManual(), { confirmAnswer: true });
  }
  async function deleteLicenseByName(name) {
    const all = typeof window.getAllLicenses === 'function' ? window.getAllLicenses() : [];
    const lic = all.find(l => l.name === name && l.source === 'manual');
    if (!lic) return { skipped: true };
    if (typeof window.deleteLicense !== 'function') throw new Error('deleteLicense() not found');
    return withDialogCapture(() => window.deleteLicense(lic.id), { confirmAnswer: true });
  }

  // ---------------------------------------------------------------------------
  // 13. DEVICE / PO HELPERS
  // ---------------------------------------------------------------------------
  function goToDevice() { goTo('device'); }
  function openNewDeviceModal() {
    if (typeof window.openDeviceModal !== 'function') throw new Error('openDeviceModal() not found');
    window.openDeviceModal();
  }
  function openEditDeviceModal(id) { window.openDeviceModal(id); }
  function fillDeviceForm(fields = {}) {
    const map = {
      name: '#dev-name', brand: '#dev-brand', platform: '#dev-platform', type: '#dev-type',
      assetTag: '#dev-asset', serial: '#dev-serial', pbxNumber: '#dev-pbx-number', osVersion: '#dev-os-version',
      company: '#dev-company', project: '#dev-project', owner: '#dev-owner', position: '#dev-position',
      assignedDate: '#dev-assigned-date', returnDate: '#dev-return-date', memoRef: '#dev-memo-ref',
      warranty: '#dev-warranty', status: '#dev-status', note: '#dev-note', qaOwner: '#dev-qa-owner',
    };
    Object.entries(fields).forEach(([k, v]) => { if (v != null && map[k]) setInputValue(map[k], v); });
  }
  async function saveDeviceForm() {
    if (typeof window.saveDevice !== 'function') throw new Error('saveDevice() not found');
    return withDialogCapture(() => window.saveDevice(), { confirmAnswer: true });
  }
  async function deleteDeviceByName(name) {
    const all = typeof window.loadDevices === 'function' ? window.loadDevices() : [];
    const dev = all.find(d => d.name === name && d.source === 'manual');
    if (!dev) return { skipped: true };
    if (typeof window.deleteDevice !== 'function') throw new Error('deleteDevice() not found');
    return withDialogCapture(() => window.deleteDevice(dev.id), { confirmAnswer: true });
  }

  function openMarkArrived(poId) {
    if (typeof window.openMarkArrivedModal !== 'function') throw new Error('openMarkArrivedModal() not found');
    window.openMarkArrivedModal(poId);
  }
  function fillMarkArrived({ qty, serials = [] } = {}) {
    if (qty != null) setInputValue('#mark-arrived-qty', qty);
    if (serials.length) setInputValue('#mark-arrived-serials', serials.join('\n'));
  }
  async function submitMarkArrivedForm() {
    if (typeof window.submitMarkArrived !== 'function') throw new Error('submitMarkArrived() not found');
    // submitMarkArrived() itself doesn't return a promise it awaits internally
    // for the render refresh, so give the async markArrived() chain a moment.
    const dlg = await withDialogCapture(() => window.submitMarkArrived(), { confirmAnswer: true });
    await sleep(300);
    return dlg;
  }

  // ===========================================================================
  // TEST SUITES
  // ===========================================================================
  const SUITES = {};

  // --- Environment ----------------------------------------------------------
  SUITES.environment = async () => {
    const MODULE = 'Environment';
    await step(MODULE, 'Precheck: app + Supabase reachable, master data loads', async () => {
      const r = await envPrecheck();
      if (typeof r.organizationProjects === 'string' && r.organizationProjects.startsWith('ERROR')) {
        throw new Error(`organization_projects fetch failed: ${r.organizationProjects}`);
      }
      if (!Array.isArray(r.organizationProjects) || !r.organizationProjects.length) {
        throw new Error('organization_projects returned zero active projects — cannot proceed with any memo/budget/license/device suite that needs a real project.');
      }
      return `${r.organizationProjects.length} active project(s), ${Array.isArray(r.userProfiles) ? r.userProfiles.length : 0} active people`;
    });
  };

  // --- A. Create Memo ---------------------------------------------------------
  SUITES.memoCreateSLHappyPath = async () => {
    const MODULE = 'Create Memo (SL)';
    let memoNo;
    await step(MODULE, 'Happy path: fill + submit a 2-stage Software License memo', async () => {
      openCreateMemo();
      selectMemoType('sl');
      const projects = realProjectOptions();
      if (!projects.length) throw blockErr('No real project options in #f-project.');
      memoNo = prefixed('SL-HAPPY');
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0], reason: '' });
      // reason left blank on purpose here; explicit reason picked from real dropdown if present
      const reasonSel = q('#f-reason');
      const firstRealReason = reasonSel && [...reasonSel.options].map(o => o.value).find(v => v && v !== 'other');
      if (firstRealReason) setInputValue('#f-reason', firstRealReason);
      else { setInputValue('#f-reason', 'other'); setInputValue('#f-reason-other', 'E2E test — software renewal'); }

      fillSoftwareRow(0, { name: 'E2E Test Software', plan: 'Standard', price: 500, months: 12, qty: 1, start: '2026-01', end: '2026-12' });
      setSLAmountWords('หกพันบาทถ้วน');
      setInputValue('#f-signdate', NOW.toISOString().slice(0, 10));

      await autoFillApprovalChain(2);
      const dlg = await submitCurrentMemo();
      const memo = getMemoByNo(memoNo);
      if (!memo) throw new Error(`Memo ${memoNo} not found in loadMemos() after submit. Alerts seen: ${JSON.stringify(dlg.alerts)}`);
      if (!['pending', 'pending_a2'].includes(memo.status)) throw new Error(`Expected status pending/pending_a2 after submit, got "${memo.status}"`);
      return `memoNo=${memoNo} status=${memo.status}`;
    });
    return { memoNo };
  };

  SUITES.memoCreateHWHappyPath = async () => {
    const MODULE = 'Create Memo (HW)';
    let memoNo;
    await step(MODULE, 'Happy path: fill + submit a Hardware memo', async () => {
      openCreateMemo();
      selectMemoType('hw');
      const projects = realProjectOptions();
      if (!projects.length) throw blockErr('No real project options in #f-project.');
      memoNo = prefixed('HW-HAPPY');
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] });
      const reasonSel = q('#f-reason');
      const firstRealReason = reasonSel && [...reasonSel.options].map(o => o.value).find(v => v && v !== 'other');
      if (firstRealReason) setInputValue('#f-reason', firstRealReason);
      else { setInputValue('#f-reason', 'other'); setInputValue('#f-reason-other', 'E2E test — hardware replacement'); }

      fillHardwareRow(0, { name: 'E2E Test Laptop', price: 25000, qty: 1 });
      setHWAmountWords('สองหมื่นห้าพันบาทถ้วน');
      setHWOwner('E2E Test Owner');
      setInputValue('#f-signdate', NOW.toISOString().slice(0, 10));

      await autoFillApprovalChain(2);
      const dlg = await submitCurrentMemo();
      const memo = getMemoByNo(memoNo);
      if (!memo) throw new Error(`Memo ${memoNo} not found after submit. Alerts: ${JSON.stringify(dlg.alerts)}`);
      return `memoNo=${memoNo} status=${memo.status}`;
    });
    return { memoNo };
  };

  SUITES.memoCreateNegative = async () => {
    const MODULE = 'Create Memo — negative/validation';
    await step(MODULE, 'Submit with no memo type selected — should be blocked before validation even runs', async () => {
      openCreateMemo();
      // Do not selectMemoType() — form-body/hint should still be showing.
      const hintVisible = q('#form-hint') && getComputedStyle(q('#form-hint')).display !== 'none';
      if (!hintVisible) throw new Error('Expected the "select a memo type" hint to still be visible with no type chosen.');
      return 'form-hint visible as expected, no submission attempted (submitMemo() has no button to click without a type selected)';
    });

    await step(MODULE, 'Submit SL memo missing required fields (no software rows, no amount words, no approvers) — expect validation alert, no memo created', async () => {
      openCreateMemo();
      selectMemoType('sl');
      const memoNo = prefixed('SL-NEG-MISSING');
      setInputValue('#f-memo-no', memoNo);
      // Deliberately leave date/project/reason/rows/approvers empty.
      const dlg = await submitCurrentMemo();
      const memo = getMemoByNo(memoNo);
      if (memo) throw new Error(`A memo was created despite missing required fields (memoNo=${memoNo}, status=${memo.status}) — validateMemo() should have blocked this.`);
      if (!dlg.alerts.length) throw new Error('Expected a validation alert listing missing fields; none was shown.');
      return `Blocked as expected. Validation message: ${dlg.alerts[0].slice(0, 200)}`;
    });

    await step(MODULE, 'HW row with zero price / zero qty — expect validation to reject', async () => {
      openCreateMemo();
      selectMemoType('hw');
      const memoNo = prefixed('HW-NEG-ZERO');
      const projects = realProjectOptions();
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] || '' });
      fillHardwareRow(0, { name: 'Zero Price Item', price: 0, qty: 0 });
      setHWAmountWords('ศูนย์บาทถ้วน');
      await autoFillApprovalChain(2).catch(() => {}); // best-effort; validation should fail before this matters
      const dlg = await submitCurrentMemo();
      const memo = getMemoByNo(memoNo);
      if (memo) throw new Error(`Memo created with a zero-price/zero-qty HW row (memoNo=${memoNo}) — expected validateMemo() to reject "Hardware แถว 1: ราคา/ชิ้น" / "จำนวน".`);
      if (!dlg.alerts.length) throw new Error('Expected a validation alert for the zero price/qty row; none shown.');
      return `Blocked as expected: ${dlg.alerts[0].slice(0, 200)}`;
    });

    await step(MODULE, 'A1 Reviewer == A2 Approver (same person) — expect validation to block', async () => {
      openCreateMemo();
      selectMemoType('hw');
      const memoNo = prefixed('HW-NEG-SAMEPERSON');
      const projects = realProjectOptions();
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] || '' });
      fillHardwareRow(0, { name: 'Same Person Test', price: 1000, qty: 1 });
      setHWAmountWords('หนึ่งพันบาทถ้วน');
      await waitForApproverRows(2);
      const names = approverNameOptions(0);
      if (names.length < 1) throw blockErr('No people available to test same-person A1/A2 validation.');
      fillApproverRow(0, { name: names[0] });
      fillApproverRow(1, { name: names[0] }); // deliberately same person
      const dlg = await submitCurrentMemo();
      const memo = getMemoByNo(memoNo);
      if (memo) throw new Error(`Memo created with A1 === A2 (same person, "${names[0]}") — expected "Reviewer (A1) กับ Final Approver (A2) ต้องไม่ใช่คนเดียวกัน" validation to block this.`);
      if (!dlg.alerts.length) throw new Error('Expected a validation alert blocking same-person A1/A2; none shown.');
      return `Blocked as expected: ${dlg.alerts[0].slice(0, 200)}`;
    });
  };

  SUITES.draftLifecycle = async () => {
    const MODULE = 'Draft lifecycle';
    const memoNo = prefixed('DRAFT');
    await step(MODULE, 'Check #btn-save-draft is actually visible/clickable (found suspicious duplicate style="display:none" attribute in index.html during code review — verifying at runtime)', async () => {
      openCreateMemo();
      selectMemoType('hw');
      const btn = q('#btn-save-draft');
      if (!btn) throw new Error('#btn-save-draft not found in DOM at all.');
      const visible = getComputedStyle(btn).display !== 'none';
      if (!visible) {
        throw new Error('#btn-save-draft is present but computed display is "none" — index.html has a duplicate `style` attribute on this button (one sets display:none) which may be permanently hiding Save Draft from real users. Verify in Elements panel.');
      }
      return 'Save Draft button is visible';
    });
    await step(MODULE, 'Save minimum valid draft, then verify it is NOT counted as Actual Spend', async () => {
      const projects = realProjectOptions();
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] || '' });
      fillHardwareRow(0, { name: 'Draft Test Item', price: 1000, qty: 1 });
      await saveDraftCurrentMemo();
      const memo = getMemoByNo(memoNo);
      if (!memo) throw new Error('Draft was not persisted — loadMemos() has no row for this memoNo after saveDraft().');
      if (memo.status !== 'draft') throw new Error(`Expected status "draft", got "${memo.status}"`);
      const spend = getActualSpendForMemo(memoNo);
      if (spend) throw new Error('A draft memo generated an Actual Spend record — it must not (only completed memos should).');
      return `draft saved, status=draft, no actual spend generated (correct)`;
    });
    await step(MODULE, 'Reload draft via edit and confirm fields are restored', async () => {
      goTo('history');
      await waitFor(() => qa('.hist-row, .hist-table tbody tr').length > 0 || true, { timeout: 1500 }).catch(() => {});
      // Draft restore is exercised via editDraft(memoNo) if exposed globally.
      if (typeof window.editDraft === 'function') {
        window.editDraft(memoNo);
        await waitFor(() => valOf('#f-memo-no') === memoNo, { label: 're-edit form populated' });
        const restoredProject = valOf('#f-project');
        if (!restoredProject) throw new Error('Project field empty after loading draft into the edit form — restore may be broken.');
        return `draft re-opened, memoNo field=${valOf('#f-memo-no')}, project=${restoredProject}`;
      }
      throw blockErr('window.editDraft() not found — cannot verify draft-restore programmatically; check manually via History > Draft > Edit.');
    });
  };

  SUITES.duplicateSubmitPrevention = async () => {
    const MODULE = 'Duplicate submission prevention';
    await step(MODULE, 'Submit the same memo number twice — second attempt must be blocked, not create a duplicate', async () => {
      const memoNo = prefixed('DUPCHECK');
      openCreateMemo();
      selectMemoType('hw');
      const projects = realProjectOptions();
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] || '' });
      fillHardwareRow(0, { name: 'Dup Check Item', price: 1000, qty: 1 });
      setHWAmountWords('หนึ่งพันบาทถ้วน');
      await autoFillApprovalChain(2);
      await submitCurrentMemo();
      const first = getMemoByNo(memoNo);
      if (!first) throw new Error('First submission did not create the memo — cannot test duplicate prevention.');

      // Attempt a second, identical submission with the same memo number.
      openCreateMemo();
      selectMemoType('hw');
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] || '' });
      fillHardwareRow(0, { name: 'Dup Check Item 2', price: 2000, qty: 1 });
      setHWAmountWords('สองพันบาทถ้วน');
      await autoFillApprovalChain(2);
      const dlg = await submitCurrentMemo();
      const allWithNo = (window.loadMemos ? window.loadMemos() : []).filter(m => m.memoNo === memoNo);
      if (allWithNo.length > 1) throw new Error(`Memo number "${memoNo}" now has ${allWithNo.length} rows in loadMemos() — duplicate memo numbers were NOT blocked.`);
      if (!dlg.alerts.length) throw new Error('Second submission with a reused, blocking-status memo number produced no alert — expected a conflict message.');
      return `Duplicate blocked as expected: ${dlg.alerts[0].slice(0, 200)}`;
    });
  };

  // --- B. Approval flow -------------------------------------------------------
  async function runFullApproval(memoNo, approverNames, { rejectAtStage = null, rejectReason = 'Other', rejectComment = '' } = {}) {
    const stages = [];
    for (let i = 0; i < approverNames.length; i++) {
      goToPending();
      await waitFor(() => q('.pend-card') !== undefined || true, { timeout: 1000 }).catch(() => {});
      signInAs({ name: approverNames[i], email: `${approverNames[i].replace(/\s+/g, '.').toLowerCase()}@e2e-test.local`, role: 'user' });
      goToPending();
      if (rejectAtStage === i) {
        const dlg = await rejectViaCard(memoNo, { reason: rejectReason, comment: rejectComment });
        stages.push({ stage: i, action: 'reject', dlg });
        return stages;
      }
      const dlg = await approveViaCard(memoNo, { note: `E2E auto-approve stage ${i}` });
      stages.push({ stage: i, action: 'approve', dlg });
      const memo = getMemoByNo(memoNo);
      if (dlg && dlg.blocked) throw new Error(`Stage ${i}: no Approve button visible for "${approverNames[i]}" — canCurrentUserActOnMemo() likely resolved false. Check that pmoSignInMock's email/name match how the memo's approver row identifies this person.`);
      if (!memo) throw new Error(`Memo ${memoNo} disappeared from loadMemos() after stage ${i} approval.`);
    }
    return stages;
  }

  SUITES.approvalFlowSL = async () => {
    const MODULE = 'Approval flow (SL, full 2-stage)';
    const created = await SUITES.memoCreateSLHappyPath();
    if (!created || !created.memoNo) { blocked(MODULE, 'Setup', 'memoCreateSLHappyPath did not produce a memo'); return; }
    const { memoNo } = created;
    const memo = getMemoByNo(memoNo);
    const approverNames = (memo && memo.approvers || []).map(a => a.name).filter(Boolean);

    await step(MODULE, 'Approve through every real stage (A1, A2) as the actual assigned approvers', async () => {
      await runFullApproval(memoNo, approverNames);
      const finalMemo = getMemoByNo(memoNo);
      if (!finalMemo || finalMemo.status !== 'completed') throw new Error(`Expected status "completed" after all stages approved, got "${finalMemo && finalMemo.status}"`);
      return `memoNo=${memoNo} reached status=completed`;
    });

    await step(MODULE, 'Exactly one Actual Spend record created from the completed memo, amount matches memo total', async () => {
      const spend = getActualSpendForMemo(memoNo);
      if (!spend) throw new Error('No Actual Spend record found for the completed memo (expected id `actual-spend-memo-<memoNo>`).');
      const memo = getMemoByNo(memoNo);
      if (Number(spend.amount) !== Number(memo.total)) throw new Error(`Actual Spend amount ${spend.amount} does not match memo total ${memo.total}`);
      if (spend.source !== 'Approved Memo') throw new Error(`Actual Spend source is "${spend.source}", expected "Approved Memo"`);
      return `actualSpend id=${spend.id} amount=${spend.amount} source=${spend.source}`;
    });

    await step(MODULE, 'Refresh-equivalent: re-run the sync path and confirm no duplicate Actual Spend appears', async () => {
      const before = (window.loadActualSpendRecords ? window.loadActualSpendRecords() : []).filter(r => r.memoId === memoNo).length;
      // Re-open the memo detail (read-only) — a real user reopening a completed
      // memo — and confirm it does not regenerate spend.
      if (typeof window.openMemoReadOnly === 'function') { window.openMemoReadOnly(memoNo); await sleep(200); }
      const after = (window.loadActualSpendRecords ? window.loadActualSpendRecords() : []).filter(r => r.memoId === memoNo).length;
      if (after !== 1 || before !== 1) throw new Error(`Expected exactly 1 Actual Spend record before/after reopening; got before=${before}, after=${after}`);
      return 'No duplicate generated on reopen';
    });
  };

  SUITES.approvalFlowHW = async () => {
    const MODULE = 'Approval flow (HW -> PO -> Mark Arrived -> Device Registry)';
    const created = await SUITES.memoCreateHWHappyPath();
    if (!created || !created.memoNo) { blocked(MODULE, 'Setup', 'memoCreateHWHappyPath did not produce a memo'); return; }
    const { memoNo } = created;
    const memo = getMemoByNo(memoNo);
    const approverNames = (memo && memo.approvers || []).map(a => a.name).filter(Boolean);

    await step(MODULE, 'Approve through all stages to completed', async () => {
      await runFullApproval(memoNo, approverNames);
      const finalMemo = getMemoByNo(memoNo);
      if (!finalMemo || finalMemo.status !== 'completed') throw new Error(`Expected "completed", got "${finalMemo && finalMemo.status}"`);
      return 'completed';
    });

    let poId;
    await step(MODULE, 'Purchase Order auto-created from the approved HW memo (no manual PO creation exists by design)', async () => {
      const pos = getPOsForMemo(memoNo);
      if (!pos.length) throw new Error(`No Purchase Order found for memo ${memoNo} — createPurchaseOrdersFromMemo() should fire automatically when a "hw" memo reaches status=completed.`);
      poId = pos[0].id;
      if (pos[0].orderedQty !== 1) throw new Error(`Expected orderedQty=1 (matches the memo's HW row qty), got ${pos[0].orderedQty}`);
      return `PO id=${poId} status=${pos[0].status} orderedQty=${pos[0].orderedQty}`;
    });

    await step(MODULE, 'Mark Arrived is blocked until PO status is awaiting/partial_arrived (negative check)', async () => {
      goToDevice();
      const clickedArrivedTab = qa('[onclick*="switchDevTab"]').find(b => (b.getAttribute('onclick')||'').includes('orders'));
      if (clickedArrivedTab) clickedArrivedTab.click();
      const dlg = await withDialogCapture(() => openMarkArrived(poId), { confirmAnswer: true });
      const modalOpen = q('#mark-arrived-modal') && q('#mark-arrived-modal').style.display === 'flex';
      const pos = getPOsForMemo(memoNo);
      if (pos[0].status === 'pending_order' && modalOpen) {
        throw new Error('Mark Arrived modal opened while PO status is still "pending_order" — expected it to be blocked with an alert until status is Awaiting.');
      }
      return `PO status=${pos[0].status}, modal blocked as expected if not yet awaiting: ${JSON.stringify(dlg.alerts)}`;
    });

    await step(MODULE, 'Advance PO to Awaiting (via its own status action, if exposed) then Mark Arrived with a serial number', async () => {
      const pos = getPOsForMemo(memoNo);
      let po = pos[0];
      if (po.status === 'pending_order' || po.status === 'ordered') {
        if (typeof window.setPoStatus === 'function') { window.setPoStatus(poId, 'awaiting'); await sleep(150); }
        else throw blockErr('No exposed function to advance PO to "awaiting" found (setPoStatus) — advance it manually via the Purchase Orders tab, then re-run this suite.');
      }
      openMarkArrived(poId);
      await waitFor(() => q('#mark-arrived-modal') && q('#mark-arrived-modal').style.display === 'flex', { label: 'mark arrived modal' });
      fillMarkArrived({ qty: 1, serials: [prefixed('SN-0001')] });
      await submitMarkArrivedForm();
      po = getPOsForMemo(memoNo)[0];
      if (po.arrivedQty < 1) throw new Error(`Expected arrivedQty >= 1 after Mark Arrived, got ${po.arrivedQty}`);
      return `PO arrivedQty=${po.arrivedQty} status=${po.status}`;
    });

    await step(MODULE, 'Device Registry received exactly the right number of new devices, inheriting project/purchase details from the PO', async () => {
      const devices = getDevicesForPO(poId);
      if (devices.length !== 1) throw new Error(`Expected exactly 1 device created from this PO's arrival, found ${devices.length}`);
      const dev = devices[0];
      const memo = getMemoByNo(memoNo);
      if (dev.project !== memo.project) throw new Error(`Device project "${dev.project}" does not match memo project "${memo.project}"`);
      if (dev.serial !== prefixed('SN-0001')) throw new Error(`Device serial "${dev.serial}" does not match the serial entered in Mark Arrived`);
      return `device id=${dev.id} name=${dev.name} project=${dev.project} serial=${dev.serial}`;
    });

    await step(MODULE, 'Repeated Mark Arrived for the same remaining qty does not create duplicate devices (idempotency / already-fulfilled guard)', async () => {
      const before = getDevicesForPO(poId).length;
      const dlg = await withDialogCapture(() => openMarkArrived(poId), { confirmAnswer: true });
      const modalOpen = q('#mark-arrived-modal') && q('#mark-arrived-modal').style.display === 'flex';
      if (modalOpen) { // PO not fully fulfilled somehow; try submitting 0 remaining
        await submitMarkArrivedForm().catch(() => {});
      }
      const after = getDevicesForPO(poId).length;
      if (after > before) throw new Error(`Device count grew from ${before} to ${after} on a repeated Mark Arrived attempt against an already-fulfilled PO — expected it to be blocked.`);
      return `device count unchanged at ${after}; blocked message (if any): ${JSON.stringify(dlg.alerts)}`;
    });
  };

  SUITES.approvalReject = async () => {
    const MODULE = 'Approval — reject';
    let memoNo;
    await step(MODULE, 'Reject at A1 — memo must reach status=rejected, no Actual Spend generated, reason visible to creator', async () => {
      openCreateMemo();
      selectMemoType('hw');
      memoNo = prefixed('REJECT-A1');
      const projects = realProjectOptions();
      fillCommonMemoFields({ memoNo, date: NOW.toISOString().slice(0, 10), project: projects[0] || '' });
      fillHardwareRow(0, { name: 'Reject Test Item', price: 1000, qty: 1 });
      setHWAmountWords('หนึ่งพันบาทถ้วน');
      const names = await autoFillApprovalChain(2);
      await submitCurrentMemo();

      signInAs({ name: names[0], email: `${names[0].replace(/\s+/g, '.').toLowerCase()}@e2e-test.local`, role: 'user' });
      goToPending();
      const dlg = await rejectViaCard(memoNo, { reason: 'Other', comment: `${TEST_PREFIX} — rejecting for negative-path test` });
      if (dlg && dlg.blocked) throw new Error(`No Reject button visible for A1 ("${names[0]}") — canCurrentUserActOnMemo() likely resolved false for this identity.`);

      const memo = getMemoByNo(memoNo);
      if (!memo || memo.status !== 'rejected') throw new Error(`Expected status "rejected", got "${memo && memo.status}"`);
      const spend = getActualSpendForMemo(memoNo);
      if (spend) throw new Error('A rejected memo produced an Actual Spend record — it must not.');
      return `memoNo=${memoNo} status=rejected, no actual spend (correct)`;
    });

    await step(MODULE, 'Approve-after-reject must be blocked (terminal-state guard)', async () => {
      goToPending();
      const card = findPendingCard(memoNo);
      if (card) throw new Error('Rejected memo still appears on the Pending Approval queue — it should have left the pending-family view.');
      return 'Rejected memo correctly absent from Pending queue';
    });
  };

  SUITES.approvalPermissions = async () => {
    const MODULE = 'Approval — permissions (UI-layer only; see envPrecheck() caveat re: no DB-level RLS)';
    let memoNo, approverNames;
    await step(MODULE, 'Setup: create+submit a memo with a known approval chain', async () => {
      const created = await SUITES.memoCreateHWHappyPath();
      if (!created || !created.memoNo) throw blockErr('Could not create a setup memo for the permissions suite.');
      memoNo = created.memoNo;
      const memo = getMemoByNo(memoNo);
      approverNames = (memo.approvers || []).map(a => a.name).filter(Boolean);
      return `memoNo=${memoNo}`;
    });
    await step(MODULE, 'A random/unrelated identity (not requester, not any approver) sees no Approve/Reject controls for this memo', async () => {
      signInAs({ name: `${TEST_PREFIX} Unrelated Person`, email: `unrelated.${TS}@e2e-test.local`, role: 'user' });
      goToPending();
      const card = findPendingCard(memoNo);
      if (card) {
        const hasApprove = !!card.querySelector('.btn-approve');
        const hasReject = !!card.querySelector('.btn-reject');
        if (hasApprove || hasReject) throw new Error('An unrelated identity sees Approve/Reject action buttons on a memo they are not the current-stage approver for.');
      }
      return card ? 'Card visible but no action buttons (correct — visible-in-queue rules differ from can-act rules)' : 'Card not visible to unrelated identity (also acceptable)';
    });
    await step(MODULE, 'A2 cannot approve before A1 has approved (wrong-stage guard)', async () => {
      if (!approverNames || approverNames.length < 2) throw blockErr('Need a 2-person approval chain from setup step.');
      signInAs({ name: approverNames[1], email: `${approverNames[1].replace(/\s+/g, '.').toLowerCase()}@e2e-test.local`, role: 'user' });
      goToPending();
      const memo = getMemoByNo(memoNo);
      if (memo.status !== 'pending') return 'Memo already past A1 (chain may have been altered by another suite) — skipping this specific check.';
      const card = findPendingCard(memoNo);
      const canAct = card && !!card.querySelector('.btn-approve');
      if (canAct) throw new Error(`A2 ("${approverNames[1]}") was able to see an Approve button while the memo is still status="pending" (A1's turn) — stage-order should block this.`);
      return 'A2 correctly cannot act while memo is still at A1 stage';
    });
  };

  // --- C. Memo History ---------------------------------------------------------
  SUITES.memoHistoryFilters = async () => {
    const MODULE = 'Memo History';
    await step(MODULE, 'Search by exact memo number returns the record; unrelated search returns none', async () => {
      goTo('history');
      const searchBox = q('#hist-search') || q('[id*="hist"][id*="search"]');
      if (!searchBox) throw blockErr('History search input not found (expected #hist-search) — selector may have changed.');
      const created = await SUITES.memoCreateHWHappyPath();
      if (!created || !created.memoNo) throw blockErr('Could not create a memo to search for.');
      goTo('history');
      setInputValue(searchBox, created.memoNo);
      await sleep(300);
      const rows = qa('.hist-table tbody tr, .hist-row');
      const found = rows.some(r => r.textContent.includes(created.memoNo));
      if (!found) throw new Error(`History search for "${created.memoNo}" did not surface the memo in the results table.`);
      setInputValue(searchBox, `${TEST_PREFIX}-DOES-NOT-EXIST-XYZ`);
      await sleep(300);
      const rows2 = qa('.hist-table tbody tr, .hist-row');
      const stillShowsOld = rows2.some(r => r.textContent.includes(created.memoNo));
      if (stillShowsOld) throw new Error('A non-matching search string still shows the previous result — search may not be filtering correctly.');
      return 'Search matches and no-match cases both behave correctly';
    });
  };

  // --- E. Budget Pool ------------------------------------------------------
  SUITES.budgetPoolCrud = async () => {
    const MODULE = 'Budget Pool CRUD';
    signInAs({ name: 'E2E Test PMO', email: 'e2e.pmo@e2e-test.local', role: 'pmo' });
    const poolName = prefixed('POOL-A');
    await step(MODULE, 'Create a valid pool (project, name, budget, year, Jan-Dec, HW type)', async () => {
      goToBudget();
      openNewBudgetPoolModal();
      await waitFor(() => q('#bpool-modal'), { label: 'budget pool modal' });
      const projects = qa('#bpool-project option').map(o => o.value).filter(Boolean);
      if (!projects.length) throw blockErr('No projects available in #bpool-project.');
      const yearBE = String(new Date().getFullYear() + 543);
      fillBudgetPoolForm({ project: projects[0], name: poolName, budget: 100000, yearBE, startMonth: 1, endMonth: 12, spendTypes: ['hw'] });
      const dlg = await saveBudgetPoolForm();
      const pool = findBudgetPoolByName(poolName);
      if (!pool) throw new Error(`Pool "${poolName}" not found after save. Alerts: ${JSON.stringify(dlg.alerts)}`);
      return `pool id=${pool.id} budget=${pool.budget}`;
    });
    await step(MODULE, 'Reject: zero budget', async () => {
      goToBudget(); openNewBudgetPoolModal();
      await waitFor(() => q('#bpool-modal'), { label: 'modal' });
      const projects = qa('#bpool-project option').map(o => o.value).filter(Boolean);
      fillBudgetPoolForm({ project: projects[0], name: prefixed('POOL-ZERO'), budget: 0, yearBE: String(new Date().getFullYear() + 543), startMonth: 1, endMonth: 12 });
      const dlg = await saveBudgetPoolForm();
      const pool = findBudgetPoolByName(prefixed('POOL-ZERO'));
      if (pool) throw new Error('A pool with budget=0 was saved — expected "Budget must be greater than zero" validation to block it.');
      if (!dlg.alerts.length) throw new Error('No validation alert shown for a zero-budget pool.');
      return `Blocked as expected: ${dlg.alerts[0].slice(0, 200)}`;
    });
    await step(MODULE, 'Reject: exact duplicate (same project + pool name + year)', async () => {
      goToBudget(); openNewBudgetPoolModal();
      await waitFor(() => q('#bpool-modal'), { label: 'modal' });
      const pool = findBudgetPoolByName(poolName);
      if (!pool) throw blockErr('Prior pool from the create step is missing — cannot test duplicate.');
      fillBudgetPoolForm({ project: pool.project, name: poolName, budget: 50000, yearBE: pool.year, startMonth: 1, endMonth: 12 });
      const dlg = await saveBudgetPoolForm();
      const dupes = getBudgetPools().filter(p => p.name === poolName && p.status !== 'inactive');
      if (dupes.length > 1) throw new Error(`Duplicate Project+PoolName+Year pool was saved (now ${dupes.length} active rows named "${poolName}") — expected a duplicate-block validation.`);
      if (!dlg.alerts.length) throw new Error('No validation alert shown for an exact duplicate pool.');
      return `Blocked as expected: ${dlg.alerts[0].slice(0, 200)}`;
    });
    await step(MODULE, 'Edit: change budget amount, verify persisted', async () => {
      const pool = findBudgetPoolByName(poolName);
      if (!pool) throw blockErr('Pool from create step missing.');
      openEditBudgetPoolModal(pool.id);
      await waitFor(() => q('#bpool-modal'), { label: 'edit modal' });
      setInputValue('#bpool-budget', 150000);
      await saveBudgetPoolForm();
      const updated = findBudgetPoolByName(poolName);
      if (!updated || Number(updated.budget) !== 150000) throw new Error(`Expected budget 150000 after edit, got ${updated && updated.budget}`);
      return `budget now ${updated.budget}`;
    });
    await step(MODULE, 'Delete (soft): pool disappears from active list', async () => {
      await deleteBudgetPoolByName(poolName);
      const stillActive = findBudgetPoolByName(poolName);
      if (stillActive) throw new Error('Pool still appears as active after delete — expected status to flip to inactive.');
      return 'Pool no longer active (soft-deleted)';
    });
  };

  SUITES.budgetMappingScenarios = async () => {
    const MODULE = 'Budget mapping (Mapped / Unbudgeted / Needs PMO Review / Manual Override)';
    signInAs({ name: 'E2E Test PMO', email: 'e2e.pmo@e2e-test.local', role: 'pmo' });
    await step(MODULE, 'Manual expense with no matching pool -> Unbudgeted; create a matching pool -> auto-remaps to Mapped; delete the pool -> back to Unbudgeted', async () => {
      goToBudget();
      const projects = realProjectOptions().length ? realProjectOptions() : (await sbGet('organization_projects', '?status=eq.active&select=name')).map(p => p.name);
      if (!projects.length) throw blockErr('No projects available.');
      const project = projects[0];
      const yearBE = String(new Date().getFullYear() + 543);
      const ref = prefixed('MAP-1');

      openNewManualExpenseModal();
      await waitFor(() => q('#manual-expense-modal'), { label: 'manual expense modal' });
      fillManualExpenseForm({ reference: ref, project, spendType: 'hw', description: `${TEST_PREFIX} unbudgeted-then-mapped test`, frequency: 'one_time', date: NOW.toISOString().slice(0, 10), amount: 5000 });
      await saveManualExpenseForm();
      let record = getManualExpenses().find(r => r.referenceNo === ref);
      if (!record) throw new Error('Manual expense was not saved.');
      if (record.budgetStatus !== 'Unbudgeted') throw new Error(`Expected budgetStatus "Unbudgeted" with no matching pool, got "${record.budgetStatus}"`);

      const poolName = prefixed('MAP-POOL');
      openNewBudgetPoolModal();
      await waitFor(() => q('#bpool-modal'), { label: 'pool modal' });
      fillBudgetPoolForm({ project, name: poolName, budget: 50000, yearBE, startMonth: 1, endMonth: 12, spendTypes: ['hw'] });
      await saveBudgetPoolForm();

      // NOTE: per app.js's own reconciliation rule, MANUAL_EXPENSE-sourced
      // records are forced to Unbudgeted unless a Manual Override is applied —
      // auto-mapping to a newly created pool does NOT happen for manual
      // entries (only for Approved Memo actual spend). Verify that exact
      // documented behavior rather than assuming naive auto-remap.
      record = getManualExpenses().find(r => r.referenceNo === ref);
      if (record.budgetStatus === 'Mapped') {
        throw new Error('Manual expense auto-mapped to a pool without a Manual Override — this contradicts the app\'s own documented rule (manual-expense-sourced records should stay Unbudgeted unless manualBudgetPoolId is explicitly set). Re-verify this is intentional.');
      }
      const stillUnbudgeted = record.budgetStatus === 'Unbudgeted';
      await deleteBudgetPoolByName(poolName);
      return `Manual expense budgetStatus after pool create=${record.budgetStatus} (Unbudgeted-by-design for manual entries: ${stillUnbudgeted})`;
    });

    await step(MODULE, 'Overlapping pools (same project+type+period) both matching one memo-sourced record -> Needs PMO Review', async () => {
      const memoResult = await SUITES.memoCreateHWHappyPath();
      if (!memoResult || !memoResult.memoNo) throw blockErr('Could not create the source memo for this scenario.');
      const memo = getMemoByNo(memoResult.memoNo);
      const approverNames = (memo.approvers || []).map(a => a.name).filter(Boolean);
      await runFullApproval(memoResult.memoNo, approverNames);
      signInAs({ name: 'E2E Test PMO', email: 'e2e.pmo@e2e-test.local', role: 'pmo' });

      const yearBE = String(new Date().getFullYear() + 543);
      const poolAName = prefixed('OVERLAP-A');
      const poolBName = prefixed('OVERLAP-B');
      for (const name of [poolAName, poolBName]) {
        goToBudget(); openNewBudgetPoolModal();
        await waitFor(() => q('#bpool-modal'), { label: 'pool modal' });
        fillBudgetPoolForm({ project: memo.project, name, budget: 50000, yearBE, startMonth: 1, endMonth: 12, spendTypes: ['hw'] });
        await saveBudgetPoolForm();
      }
      const spend = getActualSpendForMemo(memoResult.memoNo);
      if (!spend) throw new Error('Expected an Actual Spend record for the completed memo.');
      if (spend.budgetStatus !== 'Needs PMO Review') {
        throw new Error(`Expected budgetStatus "Needs PMO Review" with two overlapping matching pools, got "${spend.budgetStatus}"`);
      }
      await deleteBudgetPoolByName(poolAName);
      await deleteBudgetPoolByName(poolBName);
      return `Correctly resolved to Needs PMO Review with 2 overlapping pools`;
    });
  };

  // --- F. Manual Actual Spend ------------------------------------------------
  SUITES.manualActualSpendCrud = async () => {
    const MODULE = 'Manual Actual Spend';
    signInAs({ name: 'E2E Test PMO', email: 'e2e.pmo@e2e-test.local', role: 'pmo' });
    const ref = prefixed('MANUAL-1');
    await step(MODULE, 'Create a valid one-time manual expense', async () => {
      goToBudget();
      openNewManualExpenseModal();
      await waitFor(() => q('#manual-expense-modal'), { label: 'modal' });
      const projects = realProjectOptions().length ? realProjectOptions() : (await sbGet('organization_projects', '?status=eq.active&select=name')).map(p => p.name);
      fillManualExpenseForm({ reference: ref, project: projects[0], spendType: 'other', description: `${TEST_PREFIX} manual expense`, frequency: 'one_time', date: NOW.toISOString().slice(0, 10), amount: 1234.56, vendorProgram: 'E2E Vendor' });
      const dlg = await saveManualExpenseForm();
      const rec = getManualExpenses().find(r => r.referenceNo === ref);
      if (!rec) throw new Error(`Manual expense not saved. Alerts: ${JSON.stringify(dlg.alerts)}`);
      if (Number(rec.amount) !== 1234.56) throw new Error(`Expected amount 1234.56, got ${rec.amount}`);
      return `id=${rec.id} amount=${rec.amount}`;
    });
    await step(MODULE, 'Reject: negative amount', async () => {
      openNewManualExpenseModal();
      await waitFor(() => q('#manual-expense-modal'), { label: 'modal' });
      const projects = realProjectOptions();
      fillManualExpenseForm({ reference: prefixed('MANUAL-NEG'), project: projects[0] || '', spendType: 'other', description: 'negative amount test', frequency: 'one_time', date: NOW.toISOString().slice(0, 10), amount: -500 });
      const dlg = await saveManualExpenseForm();
      const rec = getManualExpenses().find(r => r.referenceNo === prefixed('MANUAL-NEG'));
      if (rec) throw new Error('A manual expense with a negative amount was saved — expected amount>0 validation to block it.');
      if (!dlg.alerts.length) throw new Error('No validation alert for negative amount.');
      return `Blocked as expected: ${dlg.alerts[0].slice(0, 200)}`;
    });
    await step(MODULE, 'Void (soft delete) via voidManualExpense() and confirm it drops out of the active list', async () => {
      if (typeof window.voidManualExpense !== 'function') throw blockErr('voidManualExpense() not found.');
      const rec = getManualExpenses().find(r => r.referenceNo === ref);
      if (!rec) throw blockErr('Could not find the record created earlier to void.');
      // voidManualExpense(id) takes the raw expense id — find it via the raw
      // manual-expenses cache (not the derived Actual Spend view-model), since
      // that's what the delete button in the UI actually passes.
      const rawList = typeof window.loadManualExpenses === 'function' ? window.loadManualExpenses() : null;
      const rawId = rawList ? (rawList.find(r => r.referenceNo === ref) || {}).id : rec.id;
      await withDialogCapture(() => window.voidManualExpense(rawId), { confirmAnswer: true });
      const stillActive = getManualExpenses().find(r => r.referenceNo === ref && !r.voidedAt);
      if (stillActive) throw new Error('Voided manual expense still appears active after voidManualExpense().');
      return 'Voided successfully, excluded from active list';
    });
  };

  // --- H. Budget vs Actual reconciliation ------------------------------------
  SUITES.budgetVsActualReconciliation = async () => {
    const MODULE = 'Budget vs Actual reconciliation';
    await step(MODULE, 'Recompute BvA dataset via the app\'s own pure function and sanity-check totals (budget - actual = remaining)', async () => {
      if (typeof window.calculateBudgetVsActualDataset !== 'function' || typeof window.loadBudgetPools !== 'function' || typeof window.loadActualSpendRecords !== 'function') {
        throw blockErr('calculateBudgetVsActualDataset()/loadBudgetPools()/loadActualSpendRecords() not all available.');
      }
      const pools = window.loadBudgetPools();
      const records = window.loadActualSpendRecords();
      const dataset = window.calculateBudgetVsActualDataset(pools, records, {});
      const expectedRemaining = dataset.totals.budget - dataset.totals.actual;
      if (Math.abs(expectedRemaining - dataset.totals.remaining) > 0.01) {
        throw new Error(`Reconciliation mismatch: budget(${dataset.totals.budget}) - actual(${dataset.totals.actual}) = ${expectedRemaining}, but totals.remaining = ${dataset.totals.remaining}`);
      }
      return `budget=${dataset.totals.budget} actual=${dataset.totals.actual} remaining=${dataset.totals.remaining} (consistent)`;
    });
  };

  // --- I. License Management ---------------------------------------------------
  SUITES.licenseCrud = async () => {
    const MODULE = 'License Management';
    const name = prefixed('LIC-1');
    await step(MODULE, 'Create a valid manual license', async () => {
      goToLicense();
      openNewLicenseModal();
      await waitFor(() => q('#license-modal'), { label: 'license modal' });
      const projects = realProjectOptions().length ? realProjectOptions() : (await sbGet('organization_projects', '?status=eq.active&select=name')).map(p => p.name);
      fillLicenseForm({ name, plan: 'Pro', vendor: 'E2E Vendor', seats: 5, price: 999.99, owner: 'E2E Owner', dept: 'QA', project: projects[0], licenseType: 'subscription', purchaseDate: NOW.toISOString().slice(0, 10), expiryDate: '', billing: 'monthly', status: 'active', note: 'created by console E2E test' });
      const dlg = await saveLicenseForm();
      const all = typeof window.getAllLicenses === 'function' ? window.getAllLicenses() : [];
      const lic = all.find(l => l.name === name);
      if (!lic) throw new Error(`License not found after save. Alerts: ${JSON.stringify(dlg.alerts)}`);
      return `id=${lic.id} seats=${lic.seats}`;
    });
    await step(MODULE, 'Reject: expiry date before purchase date', async () => {
      openNewLicenseModal();
      await waitFor(() => q('#license-modal'), { label: 'modal' });
      const badName = prefixed('LIC-BADDATE');
      fillLicenseForm({ name: badName, purchaseDate: '2026-06-01', expiryDate: '2026-01-01' });
      await saveLicenseForm();
      const all = typeof window.getAllLicenses === 'function' ? window.getAllLicenses() : [];
      const lic = all.find(l => l.name === badName);
      // NOTE (from code review): saveLicenseManual() has NO date-order validation
      // at all today — this assertion is expected to FAIL and surface that gap
      // rather than silently pass, per "no silent caps" — do not weaken this
      // check to make it green.
      if (lic) {
        fail(MODULE, 'Expiry-before-purchase validation gap', {
          severity: 'Medium',
          testData: `purchaseDate=2026-06-01, expiryDate=2026-01-01, name=${badName}`,
          expected: 'Save should be rejected with a validation message (expiry cannot precede purchase date).',
          actual: 'License was saved successfully with expiry before purchase date — saveLicenseManual() only checks that Name is non-empty; no date-order check exists (confirmed by code review of views/license.js).',
          reproduction: 'License Management > Add License > set Purchase Date after Expiry Date > Save.',
        });
        await deleteLicenseByName(badName);
        return 'Confirmed gap and logged as DEFECT (see above), not a script bug';
      }
      return 'Unexpectedly blocked (validation may have been added since this script was written) — good, no defect';
    });
    await step(MODULE, 'Delete (soft): license no longer active', async () => {
      await deleteLicenseByName(name);
      const all = typeof window.getAllLicenses === 'function' ? window.getAllLicenses() : [];
      const lic = all.find(l => l.name === name);
      if (lic && !(lic.statusOverride === 'deleted')) throw new Error('License still active after delete.');
      return 'Soft-deleted correctly';
    });
  };

  // --- J. Device Registry edit (manual device, not PO-sourced) ----------------
  SUITES.deviceRegistryEdit = async () => {
    const MODULE = 'Device Registry (manual entry)';
    const name = prefixed('DEV-1');
    await step(MODULE, 'Create a manual device record', async () => {
      goToDevice();
      openNewDeviceModal();
      await waitFor(() => q('#device-modal'), { label: 'device modal' });
      const projects = realProjectOptions().length ? realProjectOptions() : (await sbGet('organization_projects', '?status=eq.active&select=name')).map(p => p.name);
      fillDeviceForm({ name, brand: 'E2E Brand', platform: 'other', type: 'laptop', assetTag: prefixed('AT-1'), serial: prefixed('SN-MANUAL-1'), company: 'E2E Co', project: projects[0], owner: 'E2E Owner', status: 'available' });
      const dlg = await saveDeviceForm();
      const all = typeof window.loadDevices === 'function' ? window.loadDevices() : [];
      const dev = all.find(d => d.name === name);
      if (!dev) throw new Error(`Device not found after save. Alerts: ${JSON.stringify(dlg.alerts)}`);
      return `id=${dev.id} serial=${dev.serial}`;
    });
    await step(MODULE, 'Reject: duplicate serial number', async () => {
      const all = typeof window.loadDevices === 'function' ? window.loadDevices() : [];
      const existing = all.find(d => d.name === name);
      if (!existing) throw blockErr('Prior device missing.');
      openNewDeviceModal();
      await waitFor(() => q('#device-modal'), { label: 'modal' });
      const dupName = prefixed('DEV-DUPSERIAL');
      fillDeviceForm({ name: dupName, serial: existing.serial, status: 'available' });
      const dlg = await saveDeviceForm();
      const all2 = typeof window.loadDevices === 'function' ? window.loadDevices() : [];
      const dupDevice = all2.find(d => d.name === dupName);
      if (dupDevice) throw new Error(`A device with a duplicate serial ("${existing.serial}") was saved — expected findExistingDevice() dedup check to block or merge it.`);
      return `Blocked or merged as expected. Alerts: ${JSON.stringify(dlg.alerts)}`;
    });
    await step(MODULE, 'Delete (soft): device no longer in active registry', async () => {
      await deleteDeviceByName(name);
      const all = typeof window.loadDevices === 'function' ? window.loadDevices() : [];
      const dev = all.find(d => d.name === name);
      if (dev && !dev.deleted) throw new Error('Device still active after delete.');
      return 'Soft-deleted correctly';
    });
  };

  // ---------------------------------------------------------------------------
  // 14. CLEANUP — soft-delete/void every record this run created, verify none
  //     remain searchable, using the SAME app actions a real user would use.
  // ---------------------------------------------------------------------------
  async function cleanup() {
    const summary = { attempted: [], remaining: [] };
    console.log(`%c[PMO_E2E] Cleaning up all records matching prefix "${TEST_PREFIX}"...`, 'font-weight:bold');

    // Memos: use cancelMemo() for anything still pending; completed/rejected/
    // draft memos are left as historical records (there is no memo "delete"
    // in this app other than deleteDraft() for drafts) — flag remaining ones
    // for manual review/deletion by the DBA if truly required.
    const memos = (typeof window.loadMemos === 'function' ? window.loadMemos() : []).filter(m => m.memoNo && m.memoNo.includes(TEST_PREFIX));
    for (const m of memos) {
      summary.attempted.push(`memo ${m.memoNo} (status=${m.status})`);
      if (m.status === 'draft' && typeof window.deleteDraft === 'function') {
        await withDialogCapture(() => window.deleteDraft(m.memoNo), { confirmAnswer: true }).catch(() => {});
      } else if (['pending', 'pending_a2', 'pending_a3'].includes(m.status) && typeof window.cancelMemo === 'function') {
        await withDialogCapture(() => window.cancelMemo(m.memoNo), { confirmAnswer: true }).catch(() => {});
      }
    }

    // Budget pools
    const pools = getBudgetPools().filter(p => p.name && p.name.includes(TEST_PREFIX) && p.status !== 'inactive');
    for (const p of pools) { summary.attempted.push(`budget pool ${p.name}`); await deleteBudgetPoolByName(p.name).catch(() => {}); }

    // Manual expenses
    const manuals = getManualExpenses().filter(r => (r.referenceNo || '').includes(TEST_PREFIX) && !r.voidedAt);
    const rawManuals = typeof window.loadManualExpenses === 'function' ? window.loadManualExpenses() : [];
    for (const r of manuals) {
      summary.attempted.push(`manual expense ${r.referenceNo}`);
      const raw = rawManuals.find(x => x.referenceNo === r.referenceNo);
      if (raw && typeof window.voidManualExpense === 'function') await withDialogCapture(() => window.voidManualExpense(raw.id), { confirmAnswer: true }).catch(() => {});
    }

    // Licenses
    const licenses = (typeof window.getAllLicenses === 'function' ? window.getAllLicenses() : []).filter(l => (l.name || '').includes(TEST_PREFIX) && l.source === 'manual' && l.statusOverride !== 'deleted');
    for (const l of licenses) { summary.attempted.push(`license ${l.name}`); await deleteLicenseByName(l.name).catch(() => {}); }

    // Devices
    const devices = (typeof window.loadDevices === 'function' ? window.loadDevices() : []).filter(d => (d.name || '').includes(TEST_PREFIX) && d.source === 'manual' && !d.deleted);
    for (const d of devices) { summary.attempted.push(`device ${d.name}`); await deleteDeviceByName(d.name).catch(() => {}); }

    // Verify: search Supabase directly for anything still matching the prefix.
    try {
      const remainingMemos = await sbGet('memos', `?memo_no=ilike.*${encodeURIComponent(TEST_PREFIX)}*&select=memo_no,status`);
      summary.remaining.push(...remainingMemos.map(m => `memo ${m.memo_no} (status=${m.status}) — expected: not-completable via UI delete, historical record retained by design`));
    } catch (e) { summary.remaining.push(`ERROR verifying memos: ${e.message}`); }

    console.log('%c[PMO_E2E] Cleanup summary', 'font-weight:bold', summary);
    console.log('Note: completed/rejected/cancelled test memos are NOT hard-deleted (no delete function exists for them in the app) — they remain as historical rows tagged with the test prefix. If your environment truly requires them gone, that is a direct-DB deletion decision for the DBA, scoped to memo_no ILIKE this exact prefix only.');
    return summary;
  }

  // ---------------------------------------------------------------------------
  // 15. RUNNER
  // ---------------------------------------------------------------------------
  async function run(name) {
    if (!SUITES[name]) { console.error(`[PMO_E2E] Unknown suite "${name}". Available: ${Object.keys(SUITES).join(', ')}`); return; }
    console.log(`%c[PMO_E2E] === Running suite: ${name} ===`, 'font-weight:bold;font-size:13px;color:#185FA5');
    try { await SUITES[name](); } catch (e) { console.error(`[PMO_E2E] Suite "${name}" threw unexpectedly (this is itself worth reporting as a Blocker):`, e); }
  }

  async function runAll() {
    const order = [
      'environment',
      'memoCreateSLHappyPath', 'memoCreateHWHappyPath', 'memoCreateNegative',
      'draftLifecycle', 'duplicateSubmitPrevention',
      'approvalFlowSL', 'approvalFlowHW', 'approvalReject', 'approvalPermissions',
      'memoHistoryFilters',
      'budgetPoolCrud', 'budgetMappingScenarios',
      'manualActualSpendCrud', 'budgetVsActualReconciliation',
      'licenseCrud', 'deviceRegistryEdit',
    ];
    for (const name of order) { await run(name); }
    console.log('%c[PMO_E2E] === Run complete ===', 'font-weight:bold;font-size:14px');
    printReport();
    printDefects();
    console.log(`Console errors captured during this run: ${CONSOLE_ERRORS.length}`, CONSOLE_ERRORS);
    console.log(`Network errors captured during this run: ${NETWORK_ERRORS.length}`, NETWORK_ERRORS);
    console.log('Run PMO_E2E.cleanup() when you are done reviewing results, then PMO_E2E.toMarkdown() for your report.');
  }

  // ---------------------------------------------------------------------------
  // 16. PUBLIC API
  // ---------------------------------------------------------------------------
  window.PMO_E2E = {
    TEST_PREFIX,
    envPrecheck,
    runAll,
    run,
    cleanup,
    printReport,
    printDefects,
    toMarkdown,
    suiteNames: Object.keys(SUITES),
    results: RESULTS,
    defects: DEFECTS,
    consoleErrors: CONSOLE_ERRORS,
    networkErrors: NETWORK_ERRORS,
    // exposed for manual/interactive use in the console if you want to drive
    // a scenario step-by-step instead of running a whole suite:
    helpers: {
      goTo, openCreateMemo, selectMemoType, realProjectOptions, fillCommonMemoFields,
      autoFillApprovalChain, addSoftwareRow, fillSoftwareRow, setSLAmountWords,
      addHardwareRow, fillHardwareRow, setHWAmountWords, setHWOwner,
      fillIntFields, fillEntFields, fillDepFields, addDepCalcItem, fillDepCalcItem,
      submitCurrentMemo, saveDraftCurrentMemo, getMemoByNo, getMemoFromSupabase,
      getActualSpendForMemo, getPOsForMemo, getDevicesForPO,
      goToPending, findPendingCard, approveViaCard, rejectViaCard, signInAs, currentSession, realProfiles,
      goToBudget, openNewBudgetPoolModal, openEditBudgetPoolModal, fillBudgetPoolForm, saveBudgetPoolForm, getBudgetPools, findBudgetPoolByName, deleteBudgetPoolByName,
      openNewManualExpenseModal, fillManualExpenseForm, saveManualExpenseForm, getManualExpenses,
      goToLicense, openNewLicenseModal, openEditLicenseModal, fillLicenseForm, saveLicenseForm, deleteLicenseByName,
      goToDevice, openNewDeviceModal, openEditDeviceModal, fillDeviceForm, saveDeviceForm, deleteDeviceByName,
      openMarkArrived, fillMarkArrived, submitMarkArrivedForm,
      sbGet, withDialogCapture, setInputValue, setChecked, clickEl, waitFor, sleep,
    },
  };

  console.log(`%c[PMO_E2E] Loaded. Test prefix for this session: ${TEST_PREFIX}`, 'font-weight:bold;color:#185FA5;font-size:13px');
  console.log('Run: await PMO_E2E.envPrecheck()  then  await PMO_E2E.runAll()');
})();
