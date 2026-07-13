const test = require('node:test');
const assert = require('node:assert/strict');
const { installDomGlobals } = require('./helpers/dom_stub');

installDomGlobals();

const {
  normalizeAuthorityTitle,
  normalizeAuthorityLimitRow,
  resolveAuthorityLimit,
  getAuthorityLimit,
} = require('../app.js');

test('authority title normalization supports canonical and legacy field names', () => {
  assert.deepEqual(normalizeAuthorityTitle({
    id: '5',
    title_th: 'ผู้อำนวยการโครงการ',
    title_en: 'Project Director',
    sort_order: '40',
    is_active: true,
  }), {
    id: 5,
    titleTh: 'ผู้อำนวยการโครงการ',
    titleEn: 'Project Director',
    sortOrder: 40,
    isActive: true,
  });

  assert.equal(normalizeAuthorityTitle({ title_name: 'Team Leader', active: false }).isActive, false);
});

test('authority limit normalization preserves ID-first and unlimited metadata', () => {
  const row = normalizeAuthorityLimitRow({
    authority_title_id: '9',
    title: 'Team Leader',
    memo_type: 'HW',
    limit_thb: '30000',
    is_unlimited: true,
  });

  assert.equal(row.authority_title_id, 9);
  assert.equal(row.memo_type, 'hw');
  assert.equal(row.limit_thb, 30000);
  assert.equal(row.is_unlimited, true);
});

test('legacy title-text fallback still resolves existing approval limits', () => {
  const resolved = resolveAuthorityLimit('ผู้อำนวยการโครงการ', 'hw');

  assert.equal(resolved.configured, true);
  assert.equal(resolved.titleTh, 'ผู้อำนวยการโครงการ');
  assert.equal(resolved.limitThb, 500000);
  assert.equal(resolved.isUnlimited, false);
  assert.equal(getAuthorityLimit('ผู้อำนวยการโครงการ', 'hw'), 500000);
});

test('unknown authority title remains distinguishable from intentional zero limit', () => {
  const unknown = resolveAuthorityLimit('Unconfigured Title', 'hw');
  const intentionalZero = resolveAuthorityLimit('ผู้อำนวยการโครงการ', 'int');

  assert.equal(unknown.configured, false);
  assert.equal(unknown.limitThb, 0);
  assert.equal(intentionalZero.configured, true);
  assert.equal(intentionalZero.limitThb, 0);
});
