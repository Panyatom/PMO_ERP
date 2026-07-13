const test = require('node:test');
const assert = require('node:assert/strict');
const { installDomGlobals } = require('./helpers/dom_stub');

installDomGlobals();

const app = require('../app.js');
Object.assign(global, app);
global.document.querySelectorAll = global.document.querySelectorAll || (() => []);
global.window.clearTimeout = global.window.clearTimeout || (() => {});
global.window.setTimeout = global.window.setTimeout || (() => 0);
const settings = require('../views/settings.js');

function dataUrl(label) {
  return `data:image/png;base64,${Buffer.from(label).toString('base64')}`;
}

function clearSignatureStorage() {
  ['sig-profile-11','sig-profile-12','sig-profile-22','sig-profile-42','sig-Legacy Name','sig-Alias Name'].forEach(key => {
    global.localStorage.removeItem(key);
  });
}

function signatureRow(profile) {
  const preview = { innerHTML: '', textContent: '' };
  const status = { textContent: '', className: 'settings-signature-status' };
  const file = { value: '', files: [], closest: () => row };
  const row = {
    dataset: {
      signatureRow: String(profile.id),
      signatureName: profile.full_name || '',
      signatureAliases: (profile.name_aliases || []).join('|'),
    },
    querySelector(selector) {
      if (selector === '[data-signature-preview]') return preview;
      if (selector === '.settings-signature-status') return status;
      if (selector === '.settings-signature-file') return file;
      return null;
    },
  };
  return { row, file, preview, status, button: { closest: () => row } };
}

test('signature eligibility includes reviewer-only, approver-only, and dual-role profiles once', () => {
  const rows = settings.signatureEligibleProfiles([
    { id: 1, full_name: 'Reviewer Only', can_review: true, can_approve: false },
    { id: 2, full_name: 'Approver Only', can_review: false, can_approve: true },
    { id: 3, full_name: 'Dual Role', can_review: true, can_approve: true },
    { id: 3, full_name: 'Dual Role Duplicate', can_review: true, can_approve: true },
    { id: 4, full_name: 'Disabled', can_review: false, can_approve: false },
  ]);

  assert.deepEqual(rows.map(row => row.id), [2, 3, 1]);
  assert.equal(rows.some(row => row.full_name === 'Disabled'), false);
});

test('signature panel renders one row per eligible profile with read-only title/status', () => {
  const html = settings.renderSignatureRow({
    id: 11,
    full_name: 'Reviewer Only',
    title: 'Project Director',
    can_review: true,
    signature_data_url: dataUrl('stored'),
  });

  assert.match(html, /Reviewer Only/);
  assert.match(html, /Project Director/);
  assert.match(html, /Stored/);
  assert.match(html, /<img src="data:image\/png;base64/);
  assert.doesNotMatch(html, /Preview available/);
  assert.match(html, /data-signature-row="11"/);
});

test('stored signature renders thumbnail while missing signature keeps placeholder', () => {
  const stored = settings.renderSignatureRow({
    id: 12,
    full_name: 'Stored Signer',
    can_review: true,
    signature_data_url: dataUrl('stored-thumbnail'),
  });
  const missing = settings.renderSignatureRow({
    id: 13,
    full_name: 'Missing Signer',
    can_review: true,
  });

  assert.match(stored, /<img src="data:image\/png;base64/);
  assert.match(stored, /Current signature preview/);
  assert.doesNotMatch(stored, /Preview available/);
  assert.match(missing, /No signature loaded/);
  assert.doesNotMatch(missing, /<img src=/);
});

test('pending image overrides stored preview before save', async () => {
  const originalFileReader = global.FileReader;
  global.FileReader = class {
    readAsDataURL() {
      this.result = dataUrl('pending-thumbnail');
      this.onload();
    }
  };

  const { file, button } = signatureRow({ id: 14, full_name: 'Pending Signer' });
  file.files = [{ type: 'image/png', size: 10 }];
  settings.handleSignatureFileSelect(file);

  const html = settings.renderSignatureRow({
    id: 14,
    full_name: 'Pending Signer',
    can_review: true,
    signature_data_url: dataUrl('stored-thumbnail'),
  });

  assert.match(html, /Ready to save/);
  assert.match(html, new RegExp(dataUrl('pending-thumbnail')));
  assert.doesNotMatch(html, new RegExp(dataUrl('stored-thumbnail')));

  await settings.clearSignatureForOwner(button);
  global.FileReader = originalFileReader;
});

test('signature upload and replace patch user_profiles.signature_data_url by profile id', async () => {
  clearSignatureStorage();
  const calls = [];
  const originalCheckSupa = global.checkSupa;
  const originalSupaFetch = global.supaFetch;
  const originalFileReader = global.FileReader;

  global.checkSupa = async () => true;
  global.supaFetch = async (table, method, body, query) => {
    calls.push({ table, method, body, query });
    return [{ id: 11, ...body }];
  };

  let nextDataUrl = dataUrl('upload-1');
  global.FileReader = class {
    readAsDataURL() {
      this.result = nextDataUrl;
      this.onload();
    }
  };

  const { file } = signatureRow({ id: 11, full_name: 'Reviewer Only' });
  file.files = [{ type: 'image/png', size: 10 }];
  settings.handleSignatureFileSelect(file);
  await settings.saveSignatureFromDom();

  nextDataUrl = dataUrl('upload-2');
  file.files = [{ type: 'image/png', size: 10 }];
  settings.handleSignatureFileSelect(file);
  await settings.saveSignatureFromDom();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'user_profiles');
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].query, '?id=eq.11');
  assert.equal(calls[0].body.signature_data_url, dataUrl('upload-1'));
  assert.equal(calls[1].body.signature_data_url, dataUrl('upload-2'));

  global.checkSupa = originalCheckSupa;
  global.supaFetch = originalSupaFetch;
  global.FileReader = originalFileReader;
});

test('signature clear removes profile cache and clears user_profiles.signature_data_url', async () => {
  clearSignatureStorage();
  const calls = [];
  const originalCheckSupa = global.checkSupa;
  const originalSupaFetch = global.supaFetch;
  global.localStorage.setItem('sig-profile-11', JSON.stringify({ signatureDataUrl: dataUrl('stored') }));
  global.checkSupa = async () => true;
  global.supaFetch = async (table, method, body, query) => {
    calls.push({ table, method, body, query });
    return [{ id: 11, ...body }];
  };

  const { button } = signatureRow({ id: 11, full_name: 'Reviewer Only' });
  const afterClearHtml = settings.renderSignatureRow({ id: 11, full_name: 'Reviewer Only', can_review: true });
  await settings.clearSignatureForOwner(button);

  assert.equal(global.localStorage.getItem('sig-profile-11'), null);
  const patch = calls.find(call => call.table === 'user_profiles' && call.method === 'PATCH');
  assert.ok(patch);
  assert.deepEqual(patch.body, { signature_data_url: null });
  assert.match(afterClearHtml, /No signature loaded/);
  assert.doesNotMatch(afterClearHtml, /<img src=/);

  global.checkSupa = originalCheckSupa;
  global.supaFetch = originalSupaFetch;
});

test('signature lookup prefers profile id and survives profile rename', async () => {
  clearSignatureStorage();
  global.localStorage.setItem('sig-profile-42', JSON.stringify({ signatureDataUrl: dataUrl('stable-profile') }));

  assert.equal(
    await app.loadUserSignatureForPdfAsync({ profileId: 42, name: 'Old Name' }),
    dataUrl('stable-profile')
  );
  assert.equal(
    await app.loadUserSignatureForPdfAsync({ profileId: 42, name: 'Renamed Person' }),
    dataUrl('stable-profile')
  );
});

test('signature lookup falls back to legacy name and alias keys', async () => {
  clearSignatureStorage();
  global.localStorage.setItem('sig-Legacy Name', JSON.stringify({ signatureDataUrl: dataUrl('legacy-name') }));
  global.localStorage.setItem('sig-Alias Name', JSON.stringify({ signatureDataUrl: dataUrl('legacy-alias') }));

  assert.equal(await app.loadUserSignatureForPdfAsync('Legacy Name'), dataUrl('legacy-name'));
  assert.equal(
    await settings.readSignatureDataUrl({ profileId: 12, name: 'Unknown', aliases: ['Alias Name'] }),
    dataUrl('legacy-alias')
  );
});

test('legacy signature fallback renders into preview when no stored signature exists', async () => {
  clearSignatureStorage();
  global.localStorage.setItem('sig-Alias Name', JSON.stringify({ signatureDataUrl: dataUrl('legacy-preview') }));
  const { button, preview } = signatureRow({ id: 12, full_name: 'Unknown', name_aliases: ['Alias Name'] });

  await settings.refreshSignaturePreview(button);

  assert.match(preview.innerHTML, /<img src="data:image\/png;base64/);
  assert.match(preview.innerHTML, /Current signature preview/);
});

test('missing signatures do not break PDF rendering', async () => {
  clearSignatureStorage();
  await app._preloadSignatures([{ profileId: 22, name: 'Missing Signer', status: 'approved' }]);
  const html = app.renderMemoPdf({
    memoNo: 'SIG-001',
    date: '2026-07-13',
    type: 'hw',
    subject: 'Signature check',
    project: 'Apollo',
    total: 1000,
    amountWords: 'หนึ่งพันบาทถ้วน',
    sections: [],
    approvers: [{ profileId: 22, stage: 'approve', name: 'Missing Signer', title: 'Approver', status: 'approved' }],
  });

  assert.match(html, /Missing Signer/);
  assert.match(html, /mp-sig-space/);
});

test('PDF signature rendering uses profile-id cache when available', async () => {
  clearSignatureStorage();
  global.localStorage.setItem('sig-profile-42', JSON.stringify({ signatureDataUrl: dataUrl('pdf-profile') }));
  await app._preloadSignatures([{ profileId: 42, name: 'Renamed Signer', status: 'approved' }]);
  const html = app.renderMemoPdf({
    memoNo: 'SIG-002',
    date: '2026-07-13',
    type: 'hw',
    subject: 'Signature check',
    project: 'Apollo',
    total: 1000,
    amountWords: 'หนึ่งพันบาทถ้วน',
    sections: [],
    approvers: [{ profileId: 42, stage: 'approve', name: 'Renamed Signer', title: 'Approver', status: 'approved' }],
  });

  assert.match(html, /data:image\/png;base64/);
  assert.match(html, /Renamed Signer/);
});
