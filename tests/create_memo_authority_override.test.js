const test = require('node:test');
const assert = require('node:assert/strict');
const { installDomGlobals } = require('./helpers/dom_stub');

installDomGlobals();
Object.assign(global, require('../app.js'));

global.loadSettings = () => ({ authorityTitles: [] });
global._authorityTitleCache = [
  { id: 1, titleTh: 'Reviewer Default', titleEn: 'Reviewer', sortOrder: 10, isActive: true },
  { id: 2, titleTh: 'Approver Default', titleEn: 'Approver', sortOrder: 20, isActive: true },
  { id: 3, titleTh: 'Override Title', titleEn: 'Override', sortOrder: 30, isActive: true },
  { id: 4, titleTh: 'Inactive Historical', titleEn: 'Inactive', sortOrder: 40, isActive: false },
];
global._userProfilesCache = [
  { id: 11, full_name: 'Reviewer Person', title: 'Legacy Reviewer', default_authority_title_id: 1, is_active: true, can_review: true, can_approve: false },
  { id: 22, full_name: 'Approver Person', title: 'Legacy Approver', default_authority_title_id: 2, is_active: true, can_review: false, can_approve: true },
];
global.selectedType = 'sl';

const create = require('../views/create.js');

test('default authority title autofill resolves from profile default title id', () => {
  assert.equal(create.memoProfileDefaultAuthorityTitleId(global._userProfilesCache[0]), 1);
  assert.equal(create.memoProfileDefaultTitle(global._userProfilesCache[0]), 'Reviewer Default');

  const nameOptions = create.approvalNameOptionsHtml('Approver Person', 'approve');
  assert.match(nameOptions, /data-authority-title-id="2"/);
  assert.match(nameOptions, /Approver Person/);
});

test('memo-level override stores authorityTitleId and display title', () => {
  const row = create.normalizeApprovalRow({
    name: 'Approver Person',
    authorityTitleId: 3,
    title: 'Approver Default',
  }, 1);

  assert.equal(row.authorityTitleId, 3);
  assert.equal(row.title, 'Override Title');
  assert.equal(row.stage, 'approve');
});

test('draft save and restore preserves override, with legacy title compatibility', () => {
  const restored = create.normalizeDraftApprovalRows({
    status: 'draft',
    approvers: [
      { name: 'Reviewer Person', title: 'Reviewer Default', authorityTitleId: 1 },
      { name: 'Approver Person', title: 'Override Title', authorityTitleId: 3 },
    ],
  });

  assert.equal(restored[1].authorityTitleId, 3);
  assert.equal(restored[1].title, 'Override Title');

  const legacy = create.normalizeDraftApprovalRows({
    status: 'draft',
    reviewerName: 'Legacy Reviewer',
    reviewerTitle: 'Legacy Text Only',
    approverName: 'Legacy Approver',
    approverTitle: 'Inactive Historical',
  });

  assert.equal(legacy[0].authorityTitleId, null);
  assert.equal(legacy[0].title, 'Legacy Text Only');
  assert.equal(legacy[1].authorityTitleId, 4);
  assert.equal(legacy[1].title, 'Inactive Historical');
});

test('authority title dropdown uses active titles and preserves inactive or legacy current values', () => {
  const activeHtml = create.approvalTitleOptionsHtml('', null);
  assert.match(activeHtml, /Reviewer Default/);
  assert.match(activeHtml, /Approver Default/);
  assert.doesNotMatch(activeHtml, /Inactive Historical/);

  const inactiveHtml = create.approvalTitleOptionsHtml('Inactive Historical', 4);
  assert.match(inactiveHtml, /Inactive Historical \/ Inactive/);

  const legacyHtml = create.approvalTitleOptionsHtml('Legacy Text Only', null);
  assert.match(legacyHtml, /Legacy Text Only \/ Legacy/);
});

test('reviewer rows do not show authority validation while approver rows do', () => {
  const originalQuerySelectorAll = global.document.querySelectorAll;
  const originalGetElementById = global.document.getElementById;
  const originalResolveAuthorityLimit = global.resolveAuthorityLimit;

  const titleSelect = { value: '2', dataset: { autofill: 'Approver Default' } };
  const hint = { className: 'appr-authority-hint', style: {}, textContent: '' };
  const reviewerRow = {
    querySelector(selector) {
      if (selector === '.appr-title-sel') return titleSelect;
      if (selector === '.appr-authority-hint') return hint;
      return null;
    },
  };
  const approverRow = {
    querySelector(selector) {
      if (selector === '.appr-title-sel') return titleSelect;
      if (selector === '.appr-authority-hint') return hint;
      return null;
    },
  };

  global.document.querySelectorAll = selector => selector === '#approver-rows-form .appr-form-row' ? [reviewerRow, approverRow] : [];
  global.document.getElementById = id => id === 'sl-total' ? { textContent: '150,000' } : null;
  global.resolveAuthorityLimit = () => ({ configured: true, limitThb: 100000, isUnlimited: false });

  create._updateApproverAuthorityHint(reviewerRow);
  assert.equal(hint.style.display, 'none');

  create._updateApproverAuthorityHint(approverRow);
  assert.equal(hint.style.display, '');
  assert.match(hint.textContent, /เกิน/);

  global.document.querySelectorAll = originalQuerySelectorAll;
  global.document.getElementById = originalGetElementById;
  global.resolveAuthorityLimit = originalResolveAuthorityLimit;
});

test('authority hint distinguishes unconfigured, configured zero, numeric, and unlimited', () => {
  const originalQuerySelectorAll = global.document.querySelectorAll;
  const originalGetElementById = global.document.getElementById;
  const originalResolveAuthorityLimit = global.resolveAuthorityLimit;

  const titleSelect = { value: '2', dataset: { autofill: 'Approver Default' } };
  const hint = { className: 'appr-authority-hint', style: {}, textContent: '' };
  const reviewerRow = { querySelector: () => null };
  const approverRow = {
    querySelector(selector) {
      if (selector === '.appr-title-sel') return titleSelect;
      if (selector === '.appr-authority-hint') return hint;
      return null;
    },
  };

  global.document.querySelectorAll = selector => selector === '#approver-rows-form .appr-form-row' ? [reviewerRow, approverRow] : [];
  global.document.getElementById = id => id === 'sl-total' ? { textContent: '50,000' } : null;

  global.resolveAuthorityLimit = () => ({ configured: false, limitThb: 0, isUnlimited: false });
  create._updateApproverAuthorityHint(approverRow);
  assert.match(hint.textContent, /ยังไม่ได้กำหนดวงเงิน/);

  global.resolveAuthorityLimit = () => ({ configured: true, limitThb: 0, isUnlimited: false });
  create._updateApproverAuthorityHint(approverRow);
  assert.match(hint.textContent, /0 ฿/);

  global.resolveAuthorityLimit = () => ({ configured: true, limitThb: 100000, isUnlimited: false });
  create._updateApproverAuthorityHint(approverRow);
  assert.match(hint.textContent, /100,000/);

  global.resolveAuthorityLimit = () => ({ configured: true, limitThb: 0, isUnlimited: true });
  create._updateApproverAuthorityHint(approverRow);
  assert.match(hint.textContent, /ไม่จำกัดวงเงิน/);

  global.document.querySelectorAll = originalQuerySelectorAll;
  global.document.getElementById = originalGetElementById;
  global.resolveAuthorityLimit = originalResolveAuthorityLimit;
});
