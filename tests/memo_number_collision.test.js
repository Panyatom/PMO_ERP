const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app } = loadViews();

function memo(overrides = {}) {
  return {
    id: overrides.id || overrides.memoNo || 'MEMO-ID-1',
    memoNo: overrides.memoNo || 'MEMO-NO-1',
    type: 'sl',
    status: 'draft',
    project: 'AOA',
    subject: 'Collision regression',
    total: 100,
    requesterName: 'Requester',
    ...overrides,
  };
}

test.beforeEach(() => {
  app.storeMemos([]);
});

test('creating a memo with a new memo_no succeeds', async () => {
  const saved = await app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-001' }));

  assert.equal(saved.memoNo, 'ORB-2607-001');
  assert.equal(app.loadMemos().length, 1);
});

test('creating a second memo with the same memo_no is rejected and does not overwrite the original', async () => {
  await app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-001', subject: 'Original' }));

  await assert.rejects(
    () => app.saveMemoAsync(memo({ id: 'memo-b', memoNo: 'ORB-2607-001', subject: 'Overwrite attempt' })),
    { message: app.DUPLICATE_MEMO_NO_MESSAGE },
  );

  const rows = app.loadMemos();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'memo-a');
  assert.equal(rows[0].subject, 'Original');
});

test('updating the same memo with its existing memo_no succeeds', async () => {
  await app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-001', subject: 'Before' }));

  const updated = await app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-001', subject: 'After' }));

  assert.equal(updated.subject, 'After');
  assert.equal(app.loadMemos().length, 1);
  assert.equal(app.loadMemos()[0].subject, 'After');
});

test('editing one memo to another memo_no is rejected', async () => {
  await app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-001', subject: 'A' }));
  await app.saveMemoAsync(memo({ id: 'memo-b', memoNo: 'ORB-2607-002', subject: 'B' }));

  await assert.rejects(
    () => app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-002', subject: 'A changed' })),
    { message: app.DUPLICATE_MEMO_NO_MESSAGE },
  );

  assert.deepEqual(
    app.loadMemos().map(m => [m.id, m.memoNo, m.subject]).sort(),
    [
      ['memo-a', 'ORB-2607-001', 'A'],
      ['memo-b', 'ORB-2607-002', 'B'],
    ],
  );
});

test('draft-save path follows the same duplicate rule', async () => {
  await app.saveMemoAsync(memo({ id: 'draft-a', memoNo: 'DRAFT-001', status: 'draft' }));

  await assert.rejects(
    () => app.saveMemoAsync(memo({ id: 'draft-b', memoNo: 'DRAFT-001', status: 'draft' })),
    { message: app.DUPLICATE_MEMO_NO_MESSAGE },
  );
});

test('submit path follows the same duplicate rule', async () => {
  await app.saveMemoAsync(memo({ id: 'submitted-a', memoNo: 'ORB-2607-010', status: 'pending' }));

  await assert.rejects(
    () => app.saveMemoAsync(memo({ id: 'submitted-b', memoNo: 'ORB-2607-010', status: 'pending' })),
    { message: app.DUPLICATE_MEMO_NO_MESSAGE },
  );
});

test('user-facing duplicate message is the normalized save error', async () => {
  await app.saveMemoAsync(memo({ id: 'memo-a', memoNo: 'ORB-2607-020' }));

  await assert.rejects(
    () => app.saveMemoAsync(memo({ id: 'memo-b', memoNo: 'ORB-2607-020' })),
    error => error.message === 'Memo No. already exists. Please generate or enter a different Memo No.',
  );
});

test('unique-violation errors normalize to the duplicate Memo No. message', () => {
  const normalized = app.normalizeMemoPersistenceError(
    new Error('Supabase POST memos: {"code":"23505","message":"duplicate key value violates unique constraint \\"memos_memo_no_uidx\\""}'),
  );

  assert.equal(normalized.message, app.DUPLICATE_MEMO_NO_MESSAGE);
});

test('non-duplicate database errors still surface unchanged', () => {
  const original = new Error('Supabase POST memos: permission denied');

  assert.equal(app.normalizeMemoPersistenceError(original), original);
});
