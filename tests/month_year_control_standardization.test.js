const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const indexHtml = read('index.html');
const budgetJs = read('views/budget.js');
const monthYearJs = read('views/month_year_controls.js');
const appJs = read('app.js');

function inputById(id, source = indexHtml) {
  const pattern = new RegExp(`<input\\b(?=[^>]*\\bid="${id}"[^>]*)([^>]*)>`, 'i');
  const match = source.match(pattern);
  assert.ok(match, `Expected #${id} input to exist`);
  return match[0];
}

function selectById(id, source = indexHtml) {
  const pattern = new RegExp(`<select\\b(?=[^>]*\\bid="${id}"[^>]*)([^>]*)>`, 'i');
  const match = source.match(pattern);
  assert.ok(match, `Expected #${id} select to exist`);
  return match[0];
}

test('shared month-year helper is loaded separately from the full-date picker', () => {
  assert.match(indexHtml, /<script src="views\/month_year_controls\.js"><\/script>/);
  assert.match(monthYearJs, /window\.PMO_MONTH_YEAR = \{/);
  assert.match(monthYearJs, /const MONTHS_EN = \[/);
  assert.match(monthYearJs, /raw:|pmoMonthRaw|data-month-value/);
  assert.doesNotMatch(monthYearJs, /input\[type="date"\]/);
  assert.match(appJs, /function initDatePicker\(\)/);
  assert.match(appJs, /document\.querySelectorAll\('input\[type="date"\]'\)\.forEach\(enhancePmoDateInput\)/);
});

test('standardized month controls retain YYYY-MM raw inputs', () => {
  ['ov-from-sel', 'ov-to-sel', 'as-from', 'as-to', 'as-manual-from', 'as-manual-to'].forEach(id => {
    assert.match(inputById(id), /\btype="month"/i, `#${id} should remain a raw month input`);
  });
  ['sl-start', 'sl-end'].forEach(className => {
    const pattern = new RegExp(`<input\\b(?=[^>]*\\bclass="[^"]*${className}[^"]*"[^>]*)([^>]*)>`, 'i');
    const match = indexHtml.match(pattern);
    assert.ok(match, `Expected .${className} input`);
    assert.match(match[0], /\btype="month"/i);
  });
  assert.match(inputById('me-start', budgetJs), /\btype="month"/i);
  assert.match(inputById('me-end', budgetJs), /\btype="month"/i);
});

test('month-year helper separates raw YYYY-MM value from English CE display label', () => {
  assert.match(monthYearJs, /function normalizeMonthValue\(value\)/);
  assert.match(monthYearJs, /numeric > 2400 \? numeric - 543 : numeric/);
  assert.match(monthYearJs, /return `\$\{year\}-\$\{String\(month\)\.padStart\(2, '0'\)\}`/);
  assert.match(monthYearJs, /return `\$\{MONTHS_EN\[month - 1\]\} \$\{year\}`/);
  assert.match(monthYearJs, /descriptor\.set\.call\(input, normalizeMonthValue\(next\)\)/);
});

test('Overview custom range uses raw month keys but preserves index-based period application', () => {
  assert.match(budgetJs, /const key = `\$\{d\.getFullYear\(\)\}-\$\{String\(d\.getMonth\(\)\+1\)\.padStart\(2,'0'\)\}`/);
  assert.match(budgetJs, /PMO_MONTH_YEAR\.label\(key\)/);
  assert.match(budgetJs, /fromSel\.value = _ov\.allMonths\[_ov\.fromIdx\]\?\.key/);
  assert.match(budgetJs, /const rawF = _ov\.allMonths\.findIndex\(month => month\.key === fromValue\)/);
  assert.match(budgetJs, /_ov\.fromIdx = f;/);
  assert.match(budgetJs, /_ov\.toIdx\s+= t;/);
  assert.match(budgetJs, /if \(span > 12\)/);
});

test('year-only controls expose CE values and adapt Budget internals at the boundary', () => {
  assert.match(indexHtml, /<select id="as-year"[\s\S]*<option value="2026">2026<\/option>/);
  assert.match(selectById('bva-year'), /class="filter-select"/);
  assert.match(selectById('bset-year'), /class="filter-input"/);
  assert.match(budgetJs, /const current = new Date\(\)\.getFullYear\(\);/);
  assert.match(budgetJs, /for \(let year = current - 5; year <= current \+ 10; year\+\+\) years\.add\(year\)/);
  assert.match(budgetJs, /financialYearToGregorian\(extraYear\)/);
  assert.match(budgetJs, /yearSel\.innerHTML = years\.map\(year => `<option value="\$\{year\}">\$\{year\}<\/option>`\)\.join\(''\)/);
  assert.match(budgetJs, /const yearValCE = document\.getElementById\('bva-year'\)\?\.value/);
  assert.match(budgetJs, /const yearVal\s+= gregorianYearToBuddhistEra\(yearValCE\)/);
  assert.match(budgetJs, /const yearCE\s+= financialYearToGregorian\(g\('bpool-year'\)\)/);
  assert.match(budgetJs, /const yearBE\s+= gregorianYearToBuddhistEra\(yearCE\)/);
  assert.match(budgetJs, /year: yearBE, startMonth: start, endMonth: end/);
  assert.match(budgetJs, /<label>Budget Year \(CE\) \*<\/label>/);
  assert.doesNotMatch(budgetJs, /Budget Year \(พ\.ศ\.\)/);
});

test('Budget Pool defaults and validation remain tied to January through December and start <= end', () => {
  assert.match(budgetJs, /populateMonthSelect\('bpool-start-month', 1\)/);
  assert.match(budgetJs, /populateMonthSelect\('bpool-end-month', 12\)/);
  assert.match(budgetJs, /if \(Number\(endSel\.value\) < Number\(startSel\.value\)\)/);
  assert.match(budgetJs, /populateMonthSelect\('bpool-end-month', Number\(startSel\.value\)\)/);
  assert.match(budgetJs, /const start\s+= \(yearCE && startMonthNum\) \? `\$\{yearCE\}-\$\{String\(startMonthNum\)\.padStart\(2, '0'\)\}` : null/);
  assert.match(budgetJs, /const end\s+= \(yearCE && endMonthNum\)\s+\? `\$\{yearCE\}-\$\{String\(endMonthNum\)\.padStart\(2, '0'\)\}`\s+: null/);
});

test('exports and full-date picker paths are not redirected through display labels', () => {
  assert.match(budgetJs, /exportBudgetVsActualCSV/);
  assert.match(budgetJs, /exportActualSpendCSV/);
  assert.doesNotMatch(budgetJs, /PMO_MONTH_YEAR\.label[\s\S]{0,120}export/i);
  assert.doesNotMatch(appJs, /PMO_MONTH_YEAR/);
});
