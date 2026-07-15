const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('shared application UI layer is loaded and defines responsive contracts', () => {
  const index = read('index.html');
  const components = read('styles/components.css');

  assert.match(index, /styles\/components\.css\?v=0\.3\.3/);
  assert.match(components, /--ui-control-h:\s*34px/);
  assert.match(components, /\.metric-row\s*\{[\s\S]*auto-fit/);
  assert.match(components, /@media \(max-width:\s*760px\)/);
  assert.match(components, /--sidebar-rail-w:\s*56px/);
  assert.match(components, /\[id\$="-modal"\]/);
  assert.match(components, /#resource-detail-drawer\s*\{[\s\S]*position:\s*fixed/);
  assert.match(index, /class="history-tabs-scroll"/);
  assert.match(components, /#view-device\s*\{[\s\S]*background:\s*transparent/);
  assert.match(components, /#view-budget > \.cost-tab-bar,[\s\S]*#view-license > \.tab-bar,[\s\S]*#view-device > \.tab-bar,[\s\S]*#view-history \.history-tabs-shell/);
  assert.match(components, /#view-history \.history-tabs-scroll\s*\{[\s\S]*background:\s*transparent !important/);
  assert.match(components, /#view-history \.hist-tab-btn\.active::after\s*\{[\s\S]*height:\s*2px/);
  assert.match(components, /#view-device \.filter-toolbar--device[\s\S]*grid-template-columns:\s*repeat\(5/);
  const resource = read('views/resource_module.js');
  assert.match(resource, /#view-resource\{background:transparent;border:0/);
  assert.match(resource, /\.res-tab\.is-active::after[\s\S]*height:2px/);
});

test('application typography uses Anuphan for UI and preserves IBM Plex for data and PDF', () => {
  const index = read('index.html');
  const theme = read('theme.css');
  const components = read('styles/components.css');

  assert.match(index, /family=Anuphan:wght@400;500;600;700/);
  assert.match(index, /--font-ui:\s*'Anuphan'/);
  assert.match(index, /--font-mono:\s*'IBM Plex Mono'/);
  assert.match(index, /body\s*\{[\s\S]*?font-family:\s*var\(--font-ui\)/);
  assert.match(index, /\.pdf-stage\s*\{[\s\S]*?font-family:\s*'IBM Plex Sans Thai'/);
  assert.match(theme, /font:\s*500 11px var\(--font-ui\)/);
  assert.match(components, /button,[\s\S]*?font-family:\s*var\(--font-ui\)/);
});

test('shared PMO modal classes are defined in the app and style reference', () => {
  const index = read('index.html');
  const style = read('style.css');

  for (const css of [index, style]) {
    assert.match(css, /\.pmo-modal-backdrop\s*\{/);
    assert.match(css, /\.pmo-modal-card\s*\{/);
    assert.match(css, /\.pmo-modal-header\s*\{/);
    assert.match(css, /\.pmo-modal-title\s*\{/);
    assert.match(css, /\.pmo-modal-close\s*\{/);
    assert.match(css, /\.pmo-modal-footer\s*\{/);
  }
});

test('owned add/edit modals use the shared modal shell classes', () => {
  const index = read('index.html');
  const budget = read('views/budget.js');

  assert.match(index, /id="license-modal" class="pmo-modal-backdrop"/);
  assert.match(index, /id="lic-modal-title">Add License/);
  assert.match(index, /class="pmo-modal-card"[\s\S]*id="lic-modal-title"/);
  assert.match(index, /class="pmo-modal-close" onclick="closeLicenseModal\(\)"/);

  assert.match(index, /id="device-modal" class="pmo-modal-backdrop"/);
  assert.match(index, /id="dev-modal-title">Add Device/);
  assert.match(index, /class="pmo-modal-card"[\s\S]*id="dev-modal-title"/);
  assert.match(index, /class="pmo-modal-close" onclick="closeDeviceModal\(\)"/);

  assert.match(budget, /modal\.id = 'bpool-modal';[\s\S]*modal\.className = 'pmo-modal-backdrop';/);
  assert.match(budget, /<div class="pmo-modal-card">[\s\S]*New'} Budget Pool/);
  assert.match(budget, /<div class="pmo-modal-footer">[\s\S]*saveBudgetPool\(\)/);
});

test('Infrastructure / Other Add Spending modal keeps transaction shell and shared controls', () => {
  const budget = read('views/budget.js');

  assert.match(budget, /modal\.id = 'manual-expense-modal';[\s\S]*modal\.className = 'txn-modal-backdrop';/);
  assert.match(budget, /<div class="card txn-modal-card txn-modal-card--form">/);
  assert.match(budget, /<div class="pmo-modal-header">[\s\S]*Add'} Spending/);
  assert.match(budget, /<button class="pmo-modal-close" onclick="document\.getElementById\('manual-expense-modal'\)\.remove\(\)">/);
  assert.match(budget, /<div class="pmo-modal-footer">[\s\S]*saveManualExpenseFromModal\(\)/);
});
