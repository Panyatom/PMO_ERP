const test = require('node:test');
const assert = require('node:assert/strict');
const { installDomGlobals } = require('./helpers/dom_stub');

installDomGlobals();
const app = require('../app.js');
Object.assign(global, app);

const settings = require('../views/settings.js');

function closingRowStub(row) {
  const fields = {
    policy_ref: { value: row.policy_ref || '' },
    has_authority_clause: { checked: row.has_authority_clause === true },
    template_th: { value: row.template_th || '' },
    is_active: { checked: row.is_active !== false },
  };
  return {
    dataset: {
      closingId: row.id || '',
      closingTemplate: row.memo_type,
      closingSource: row.source || 'configured',
    },
    querySelector(selector) {
      const match = String(selector).match(/data-closing-field="([^"]+)"/);
      return match ? fields[match[1]] || null : null;
    },
  };
}

function withClosingDom(rows, fn) {
  const originalQuerySelectorAll = global.document.querySelectorAll;
  const originalQuerySelector = global.document.querySelector;
  global.document.querySelectorAll = selector => selector === '[data-closing-template]'
    ? rows.map(closingRowStub)
    : selector === '[data-closing-error]'
      ? []
      : [];
  global.document.querySelector = selector => selector === '[data-closing-template]' && rows.length
    ? closingRowStub(rows[0])
    : null;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.document.querySelectorAll = originalQuerySelectorAll;
      global.document.querySelector = originalQuerySelector;
    });
}

test('closing template rows load all memo types and fall back when one row is missing', () => {
  const rows = settings.memoClosingTemplateRows([
    { id: 1, memo_type: 'sl', policy_ref: 'Policy SL', has_authority_clause: true, template_th: 'SL {{amount}} {{authority_title_th}}', is_active: true },
    { id: 2, memo_type: 'hw', policy_ref: 'Policy HW', has_authority_clause: true, template_th: 'HW {{amount}} {{authority_limit}}', is_active: true },
    { id: 3, memo_type: 'int', policy_ref: '', has_authority_clause: false, template_th: 'INT {{amount}}', is_active: false },
    { id: 4, memo_type: 'ent', policy_ref: 'Policy ENT', has_authority_clause: true, template_th: 'ENT {{project_name}} {{authority_limit}}', is_active: true },
  ]);

  assert.deepEqual(rows.map(row => row.memo_type), ['sl', 'hw', 'int', 'ent', 'dep']);
  assert.equal(rows.find(row => row.memo_type === 'dep').source, 'fallback');
  assert.equal(rows.find(row => row.memo_type === 'int').is_active, false);
  assert.equal(rows.find(row => row.memo_type === 'int').policy_ref, '');
});

test('closing template editor renders all fields and placeholder guidance', () => {
  const html = settings.renderMemoClosingTemplatesPanel();

  assert.match(html, /Closing Paragraph Configuration/);
  assert.match(html, /data-closing-template="sl"/);
  assert.match(html, /data-closing-field="policy_ref"/);
  assert.match(html, /data-closing-field="has_authority_clause"/);
  assert.match(html, /data-closing-field="template_th"/);
  assert.match(html, /data-closing-field="is_active"/);
  assert.match(html, /\{\{authority_title_th\}\}/);
});

test('closing validation rejects unknown and malformed placeholders', () => {
  const unknown = settings.validateMemoClosingTemplate({
    memo_type: 'sl',
    policy_ref: 'Policy',
    has_authority_clause: true,
    template_th: 'Text {{amount}} {{unknown_value}} {{authority_title_th}}',
    is_active: true,
  });
  assert.match(unknown.join('\n'), /unknown placeholder: \{\{unknown_value\}\}/);

  const malformed = settings.validateMemoClosingTemplate({
    memo_type: 'hw',
    policy_ref: 'Policy',
    has_authority_clause: true,
    template_th: 'Text {{amount} {{authority_limit}}',
    is_active: true,
  });
  assert.match(malformed.join('\n'), /malformed placeholder syntax|Unbalanced/);
});

test('closing validation enforces authority placeholders only for authority templates', () => {
  const authorityErrors = settings.validateMemoClosingTemplate({
    memo_type: 'ent',
    policy_ref: 'Policy',
    has_authority_clause: true,
    template_th: 'Text {{amount}}',
    is_active: true,
  });
  assert.match(authorityErrors.join('\n'), /authority clause needs/);

  const nonAuthorityErrors = settings.validateMemoClosingTemplate({
    memo_type: 'int',
    policy_ref: '',
    has_authority_clause: false,
    template_th: 'Text {{amount}} {{project_name}}',
    is_active: true,
  });
  assert.deepEqual(nonAuthorityErrors, []);
});

test('closing save reads edited fields, toggles, and active status without live data', async () => {
  const rows = [
    { id: 10, memo_type: 'sl', policy_ref: 'Edited policy', has_authority_clause: true, template_th: 'Edited {{amount}} {{authority_title_th}}', is_active: false },
  ];
  const calls = [];
  const originalCheckSupa = global.checkSupa;
  const originalSupaFetch = global.supaFetch;
  global.checkSupa = async () => true;
  global.supaFetch = async (table, method, body, query) => {
    calls.push({ table, method, body, query });
    return [{ id: 10, ...body }];
  };

  await withClosingDom(rows, async () => {
    const readRows = settings.readMemoClosingTemplatesFromDom();
    assert.equal(readRows[0].policy_ref, 'Edited policy');
    assert.equal(readRows[0].has_authority_clause, true);
    assert.equal(readRows[0].is_active, false);

    await settings.saveMemoClosingTemplatesFromDom();
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'memo_closing_templates');
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].body.policy_ref, 'Edited policy');
  assert.equal(calls[0].body.is_active, false);

  global.checkSupa = originalCheckSupa;
  global.supaFetch = originalSupaFetch;
});
