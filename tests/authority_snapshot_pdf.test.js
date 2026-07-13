const test = require('node:test');
const assert = require('node:assert/strict');
const { installDomGlobals } = require('./helpers/dom_stub');

installDomGlobals();

const {
  applyAuthoritySnapshotsOnApproval,
  buildAuthoritySnapshot,
  memoFinalApproverRow,
  renderConfiguredClosingParagraph,
  renderMemoPdf,
} = require('../app.js');

const templateRows = [
  {
    memo_type: 'hw',
    policy_ref: 'Policy HW',
    is_active: true,
    template_th: 'อนุมัติ {{amount}} โดย {{authority_title_th}} {{authority_limit}} {{policy_ref}} {{unknown_value}}',
  },
  {
    memo_type: 'sl',
    policy_ref: 'Policy SL',
    is_active: true,
    template_th: 'โปรแกรม {{amount}} {{amount_text}} {{project_name}} {{seat_count}} {{duration_months}} {{authority_title_en}}',
  },
];

test('snapshot is created only when an approver row changes to approved', () => {
  const previous = [
    { stage: 'review', title: 'Reviewer Title', status: 'pending' },
    { stage: 'approve', authorityTitleId: 5, title: 'ผู้อำนวยการโครงการ', status: 'pending' },
  ];
  const next = [
    { ...previous[0], status: 'approved' },
    { ...previous[1], status: 'approved' },
  ];

  const rows = applyAuthoritySnapshotsOnApproval({ type: 'hw' }, previous, next, {
    resolvedAt: '2026-07-13T00:00:00.000Z',
    templateRows,
    authorityResolver: () => ({
      authorityTitleId: 5,
      titleTh: 'ผู้อำนวยการโครงการ',
      titleEn: 'Project Director',
      memoType: 'hw',
      limitThb: 500000,
      isUnlimited: false,
      configured: true,
    }),
  });

  assert.equal(rows[0].authoritySnapshot, undefined);
  assert.equal(rows[1].authoritySnapshot.titleTh, 'ผู้อำนวยการโครงการ');
  assert.equal(rows[1].authoritySnapshot.limitThb, 500000);
  assert.equal(rows[1].authoritySnapshot.policyRef, 'Policy HW');
  assert.equal(rows[1].authoritySnapshot.resolvedAt, '2026-07-13T00:00:00.000Z');
});

test('reviewer approval and already-approved approver rows do not create new snapshots', () => {
  const rows = applyAuthoritySnapshotsOnApproval(
    { type: 'hw' },
    [
      { stage: 'review', status: 'pending', title: 'Reviewer Title' },
      { stage: 'approve', status: 'approved', title: 'Approver Title' },
    ],
    [
      { stage: 'review', status: 'approved', title: 'Reviewer Title' },
      { stage: 'approve', status: 'approved', title: 'Approver Title' },
    ],
    { authorityResolver: () => assert.fail('resolver should not run') }
  );

  assert.equal(rows[0].authoritySnapshot, undefined);
  assert.equal(rows[1].authoritySnapshot, undefined);
});

test('final approver resolution uses the last approve-stage row, not the last row', () => {
  const final = memoFinalApproverRow({
    approvers: [
      { stage: 'review', name: 'Reviewer' },
      { stage: 'approve', name: 'A1' },
      { stage: 'approve', name: 'A2' },
      { stage: 'review', name: 'Trailing Reviewer' },
    ],
  });

  assert.equal(final.name, 'A2');
});

test('configured template replaces supported placeholders and removes unknown placeholders', () => {
  const text = renderConfiguredClosingParagraph({
    type: 'hw',
    total: 120000,
    amountWords: 'หนึ่งแสนสองหมื่นบาทถ้วน',
    project: 'Apollo',
    approvers: [
      { stage: 'review', title: 'Reviewer Title' },
      {
        stage: 'approve',
        authoritySnapshot: {
          authorityTitleId: 5,
          titleTh: 'ผู้อำนวยการโครงการ',
          titleEn: 'Project Director',
          memoType: 'hw',
          limitThb: 500000,
          isUnlimited: false,
          configured: true,
          policyRef: 'Snapshot Policy',
          resolvedAt: '2026-07-13T00:00:00.000Z',
        },
      },
    ],
  }, { templateRows });

  assert.match(text, /120,000 บาท/);
  assert.match(text, /ผู้อำนวยการโครงการ/);
  assert.match(text, /ไม่เกิน 500,000 บาท/);
  assert.match(text, /Snapshot Policy/);
  assert.doesNotMatch(text, /\{\{unknown_value\}\}/);
});

test('legacy memo without snapshot renders from current title lookup compatibility', () => {
  const text = renderConfiguredClosingParagraph({
    type: 'hw',
    total: 90000,
    amountWords: 'เก้าหมื่นบาทถ้วน',
    approvers: [
      { name: 'Reviewer', title: 'Reviewer Title' },
      { name: 'Approver', title: 'ผู้อำนวยการโครงการ' },
    ],
  }, { templateRows });

  assert.match(text, /ผู้อำนวยการโครงการ/);
  assert.match(text, /ไม่เกิน 500,000 บาท/);
});

test('historical PDF text keeps approved snapshot after matrix values change', () => {
  const text = renderConfiguredClosingParagraph({
    type: 'hw',
    total: 100000,
    amountWords: 'หนึ่งแสนบาทถ้วน',
    approvers: [
      {
        stage: 'approve',
        authoritySnapshot: {
          authorityTitleId: 5,
          titleTh: 'ผู้อำนวยการโครงการ',
          titleEn: 'Project Director',
          memoType: 'hw',
          limitThb: 500000,
          isUnlimited: false,
          configured: true,
          policyRef: 'Snapshot Policy',
          resolvedAt: '2026-07-13T00:00:00.000Z',
        },
      },
    ],
  }, {
    templateRows,
    authorityResolver: () => ({
      authorityTitleId: 5,
      titleTh: 'ผู้อำนวยการโครงการ',
      titleEn: 'Project Director',
      memoType: 'hw',
      limitThb: 9999999,
      isUnlimited: false,
      configured: true,
    }),
  });

  assert.match(text, /ไม่เกิน 500,000 บาท/);
  assert.doesNotMatch(text, /9,999,999/);
});

test('hardcoded closing fallback still renders when no configured template exists', () => {
  const html = renderMemoPdf({
    memoNo: 'M-001',
    date: '2026-07-13',
    type: 'hw',
    subject: 'Test memo',
    project: 'Apollo',
    reason: 'ทดสอบ',
    total: 50000,
    amountWords: 'ห้าหมื่นบาทถ้วน',
    sections: [],
    approvers: [
      { stage: 'review', title: 'Reviewer Title' },
      { stage: 'approve', title: 'ผู้อำนวยการโครงการ' },
    ],
  });

  assert.match(html, /คู่มืออำนาจอนุมัติ/);
  assert.match(html, /ผู้อำนวยการโครงการ/);
});

test('buildAuthoritySnapshot supports configured zero and unlimited states', () => {
  const zero = buildAuthoritySnapshot({ type: 'int' }, { stage: 'approve', title: 'Zero Title' }, {
    authorityResolver: () => ({
      titleTh: 'Zero Title',
      memoType: 'int',
      limitThb: 0,
      isUnlimited: false,
      configured: true,
    }),
  });
  const unlimited = buildAuthoritySnapshot({ type: 'ent' }, { stage: 'approve', title: 'Unlimited Title' }, {
    authorityResolver: () => ({
      titleTh: 'Unlimited Title',
      memoType: 'ent',
      limitThb: 0,
      isUnlimited: true,
      configured: true,
    }),
  });

  assert.equal(zero.limitThb, 0);
  assert.equal(zero.configured, true);
  assert.equal(unlimited.isUnlimited, true);
});
