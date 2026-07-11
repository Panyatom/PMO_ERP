const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const createJs = fs.readFileSync(path.join(ROOT, 'views/create.js'), 'utf8');
const budgetJs = fs.readFileSync(path.join(ROOT, 'views/budget.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function inputById(id, source = indexHtml) {
  const pattern = new RegExp(`<input\\b(?=[^>]*\\bid="${id}"[^>]*)([^>]*)>`, 'i');
  const match = source.match(pattern);
  assert.ok(match, `Expected #${id} input to exist`);
  return match[0];
}

test('[PMO-DATE-001] Batch 1 full-date fields start as date inputs for shared enhancement', () => {
  [
    'f-date',
    'f-signdate',
    'int-date',
    'ent-date',
    'dep-start',
    'dep-end',
    'lic-purchase-date',
    'lic-expiry-date',
    'dev-assigned-date',
    'dev-return-date',
    'dev-warranty',
  ].forEach(id => {
    const input = inputById(id);
    assert.match(input, /\btype="date"/i, `#${id} should be type="date" before enhancement`);
    assert.doesNotMatch(input, /\bdata-native-date="true"/i, `#${id} should use shared date picker`);
  });
});

test('[PMO-DATE-002] Client Expense date has a stable id and save/restore code uses it', () => {
  assert.match(inputById('ent-date'), /\btype="date"/i);
  assert.match(createJs, /getElementById\('ent-date'\)\?\.value/);
  assert.match(createJs, /const entDate = document\.getElementById\('ent-date'\)/);
  assert.doesNotMatch(createJs, /entDate\s*=\s*dateInput\(inp\[1\]\?\.value\)/);
  assert.doesNotMatch(createJs, /if \(entInp\[1\]\) entInp\[1\]\.value = thaiDateToISO\(memo\.entDate\)/);
});

test('[PMO-DATE-003] Month-only fields remain native month inputs before month-year enhancement', () => {
  ['sl-start', 'sl-end'].forEach(className => {
    const pattern = new RegExp(`<input\\b(?=[^>]*\\bclass="[^"]*${className}[^"]*"[^>]*)([^>]*)>`, 'i');
    const match = indexHtml.match(pattern);
    assert.ok(match, `Expected .${className} month input to exist`);
    assert.match(match[0], /\btype="month"/i);
  });
  assert.match(inputById('me-start', budgetJs), /\btype="month"/i);
  assert.match(inputById('me-end', budgetJs), /\btype="month"/i);
});

test('[PMO-DATE-004] Shared date picker still prevents duplicate enhancement and dispatches change on Apply', () => {
  assert.match(appJs, /input\.dataset\.pmoDateEnhanced === 'true'/);
  assert.match(appJs, /input\.dataset\.pmoDateEnhanced = 'true'/);
  assert.match(appJs, /document\.querySelectorAll\('input\[type="date"\]'\)\.forEach\(enhancePmoDateInput\)/);
  assert.match(appJs, /input\.dispatchEvent\(new Event\('change', \{ bubbles:true \}\)\)/);
});
