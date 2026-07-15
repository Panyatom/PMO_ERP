const test = require('node:test');
const assert = require('node:assert/strict');
const { installDomGlobals } = require('./helpers/dom_stub');

installDomGlobals();
const app = require('../app.js');
Object.assign(global, app);

const settings = require('../views/settings.js');

function setAuthorityTitleCache(rows) {
  global._authorityTitleCache = rows;
}

function setAuthorityLimitCache(rows) {
  global._authorityCache = rows;
}

test('authority title master rows come only from authority_titles source', () => {
  setAuthorityTitleCache([]);
  const rows = settings.authorityTitleMasterRows({
    titles: ['Generic PMO Title'],
    typeCfg: { hw: { apprTitle: 'Legacy Union Title' } },
    defaultApprover: { title: 'Default Approver Title' },
    authorityTitles: [
      { id: 11, title_th: 'ผู้อำนวยการโครงการ', title_en: 'Project Director', sort_order: 20, is_active: true },
    ],
  });

  assert.deepEqual(rows.map(row => row.title_th), ['ผู้อำนวยการโครงการ']);
});

test('authority title row renders Thai, English, sort, and active fields', () => {
  const html = settings.renderAuthorityTitleRow({
    id: 3,
    title_th: 'Team Leader',
    title_en: 'Team Leader',
    sort_order: 60,
    is_active: false,
  });

  assert.match(html, /data-title-field="title_th"/);
  assert.match(html, /data-title-field="title_en"/);
  assert.match(html, /data-title-field="sort_order"/);
  assert.doesNotMatch(html, /data-title-field="title_name"/);
  assert.doesNotMatch(html, /type="checkbox" checked/);
});

test('profile default title dropdown uses active authority titles and preserves legacy text', () => {
  setAuthorityTitleCache([
    { id: 1, title_th: 'Active Title', title_en: 'Active', sort_order: 1, is_active: true },
    { id: 2, title_th: 'Inactive Title', title_en: 'Inactive', sort_order: 2, is_active: false },
  ]);

  const html = settings.renderMemoProfileRow({
    id: 9,
    full_name: 'Example Person',
    title: 'Legacy Stored Title',
    default_authority_title_id: null,
    is_active: true,
  });

  assert.match(html, /data-profile-field="default_authority_title_id"/);
  assert.match(html, /Active Title \/ Active/);
  assert.doesNotMatch(html, />Inactive Title \/ Inactive</);
  assert.match(html, /Legacy Stored Title \/ Legacy/);
});

test('profile default title dropdown displays an inactive current title without offering all inactive titles', () => {
  setAuthorityTitleCache([
    { id: 1, title_th: 'Active Title', title_en: 'Active', sort_order: 1, is_active: true },
    { id: 2, title_th: 'Inactive Current', title_en: 'Inactive', sort_order: 2, is_active: false },
    { id: 3, title_th: 'Inactive Other', title_en: 'Other', sort_order: 3, is_active: false },
  ]);

  const html = settings.renderMemoProfileRow({
    id: 9,
    full_name: 'Example Person',
    title: 'Inactive Current',
    default_authority_title_id: 2,
    is_active: true,
  });

  assert.match(html, /Inactive Current \/ Inactive \/ Inactive/);
  assert.doesNotMatch(html, /Inactive Other \/ Other/);
});

test('matrix row supports unconfigured, numeric zero, and unlimited states', () => {
  setAuthorityLimitCache([
    { authority_title_id: 7, title: 'Matrix Title', memo_type: 'sl', limit_thb: 0, is_unlimited: false },
    { authority_title_id: 7, title: 'Matrix Title', memo_type: 'hw', limit_thb: 0, is_unlimited: true },
  ]);

  const html = settings.renderAuthorityLimitTableRow({
    id: 7,
    title_th: 'Matrix Title',
    title_en: 'Matrix',
    sort_order: 1,
    is_active: true,
  });

  assert.match(html, /data-authority-title-id="7"/);
  assert.match(html, /data-authority-type="sl"[\s\S]*value="0"/);
  assert.match(html, /data-authority-unlimited="hw" checked/);
  assert.match(html, /data-authority-type="int"[\s\S]*placeholder="Unconfigured"/);
});

test('authority profile title selection resolves ids and legacy values', () => {
  setAuthorityTitleCache([
    { id: 10, title_th: 'ผู้อำนวยการโครงการ', title_en: 'Project Director', sort_order: 1, is_active: true },
  ]);

  assert.deepEqual(settings.resolveAuthorityProfileTitleSelection('10'), {
    id: 10,
    titleTh: 'ผู้อำนวยการโครงการ',
  });
  assert.deepEqual(settings.resolveAuthorityProfileTitleSelection('legacy:Old Title'), {
    id: null,
    titleTh: 'Old Title',
  });
});
