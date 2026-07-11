// Batch 2B — Hardware Spending <-> Device Registry linking.
// See docs/specs/Batch_2B_Hardware_Device_Linking.md for the full spec.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadViews } = require('./helpers/load_views');

const { app, budget, device } = loadViews();

function resetStores() {
  app.storeMemos([]);
  app.storeHistoricalMemos([]);
  app.storeActualSpendRecords([]);
  app.storeBudgetPoolRecords([]);
  app.storeSpendingDeviceLinks([]);
  device.storeDevices([]);
}

function hwMemo(overrides = {}) {
  return app.normalizeHistoricalMemo({
    id: 'hist-hw-1',
    memoNo: 'OLD-HW-001',
    type: 'hw',
    project: 'AOA',
    subject: 'Old laptops purchase',
    date: '2025-01-15',
    total: 90000,
    hwItems: [
      { name: 'MacBook Pro 14"', qty: 3, price: 30000 },
    ],
    ...overrides,
  });
}

function rawDevice(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    name: 'MacBook Pro',
    brand: 'Apple',
    platform: 'macos',
    type: 'laptop',
    status: 'available',
    serial: 'SN-0001',
    source: 'manual',
    deleted: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

test('Linking one device persists a stable line id and creates one link row', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 })]);

  const { memo, links } = await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);
  assert.equal(links.length, 1);
  assert.ok(memo.hwItems[0].id, 'line id should be minted and persisted on first link');

  const persisted = app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1');
  assert.equal(persisted.hwItems[0].id, memo.hwItems[0].id);
  assert.equal(app.deviceLinksForLine('hist-hw-1', memo.hwItems[0].id).length, 1);
});

test('Linking multiple devices up to Quantity succeeds', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 }), rawDevice({ id: 2 }), rawDevice({ id: 3 })]);

  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1', '2', '3']);
  const memo = app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1');
  assert.equal(app.deviceLinksForLine('hist-hw-1', memo.hwItems[0].id).length, 3);
});

test('Linking beyond Quantity is blocked (save refused, no partial link)', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo({ hwItems: [{ name: 'MacBook Pro 14"', qty: 2, price: 30000 }] })]);
  device.storeDevices([rawDevice({ id: 1 }), rawDevice({ id: 2 }), rawDevice({ id: 3 })]);

  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1', '2']);
  await assert.rejects(() => app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['3']), /ไม่เกินจำนวน/);
  const memo = app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1');
  assert.equal(app.deviceLinksForLine('hist-hw-1', memo.hwItems[0].id).length, 2, 'rejected link must not partially apply');
});

test('Linking fewer devices than Quantity is allowed', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]); // qty 3
  device.storeDevices([rawDevice({ id: 1 })]);

  const { links } = await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);
  assert.equal(links.length, 1);
});

test('A device already linked to another hardware line cannot be linked again', async () => {
  resetStores();
  app.storeHistoricalMemos([
    hwMemo({ id: 'hist-hw-1', memoNo: 'OLD-HW-001' }),
    hwMemo({ id: 'hist-hw-2', memoNo: 'OLD-HW-002', hwItems: [{ name: 'iPad', qty: 1, price: 20000 }] }),
  ]);
  device.storeDevices([rawDevice({ id: 1 })]);

  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);
  await assert.rejects(() => app.linkDevicesToHardwareLineAsync('hist-hw-2', 0, ['1']), /เชื่อมโยงกับรายการอื่นอยู่แล้ว/);
});

test('Retired devices cannot be linked, deleted devices are unselectable (not found via loadDevices)', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, status: 'retired' }), rawDevice({ id: 2, deleted: true })]);

  await assert.rejects(() => app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']), /Retire/);
  // loadDevices() already excludes soft-deleted rows (existing app convention),
  // so a deleted device simply can't be found/selected — still blocked, just
  // via the same "not found" path as any nonexistent device id.
  await assert.rejects(() => app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['2']), /ไม่พบ/);
});

test('Unlinking frees the device to be linked elsewhere', async () => {
  resetStores();
  app.storeHistoricalMemos([
    hwMemo({ id: 'hist-hw-1', memoNo: 'OLD-HW-001' }),
    hwMemo({ id: 'hist-hw-2', memoNo: 'OLD-HW-002', hwItems: [{ name: 'iPad', qty: 1, price: 20000 }] }),
  ]);
  device.storeDevices([rawDevice({ id: 1 })]);

  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);
  assert.ok(app.deviceLinkForDevice('1'));
  await app.unlinkDeviceFromSpendingAsync('1');
  assert.equal(app.deviceLinkForDevice('1'), null);

  await app.linkDevicesToHardwareLineAsync('hist-hw-2', 0, ['1']);
  assert.equal(app.deviceLinkForDevice('1').historicalMemoId, 'hist-hw-2');
});

test('Editing: removing a linked hardware line is blocked until unlinked', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 })]);
  const { memo } = await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);

  const message = app.hardwareLineEditBlockMessage(memo, []); // line removed entirely in the edit
  assert.match(message, /ไม่สามารถลบ/);

  await app.unlinkDeviceFromSpendingAsync('1');
  const refreshed = app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1');
  assert.equal(app.hardwareLineEditBlockMessage(refreshed, []), null, 'safe to remove once unlinked');
});

test('Editing: Quantity cannot drop below the linked device count', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]); // qty 3
  device.storeDevices([rawDevice({ id: 1 }), rawDevice({ id: 2 })]);
  const { memo } = await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1', '2']);

  const tooLow = app.hardwareLineEditBlockMessage(memo, [{ id: memo.hwItems[0].id, name: memo.hwItems[0].name, qty: 1, price: 30000 }]);
  assert.match(tooLow, /จำนวนของ/);

  const ok = app.hardwareLineEditBlockMessage(memo, [{ id: memo.hwItems[0].id, name: memo.hwItems[0].name, qty: 2, price: 30000 }]);
  assert.equal(ok, null, 'qty equal to linked count is allowed');
});

test('Editing an unlinked line never blocks (new/never-linked lines have no id)', () => {
  resetStores();
  const memo = hwMemo();
  assert.equal(app.hardwareLineEditBlockMessage(memo, []), null);
  assert.equal(app.hardwareLineEditBlockMessage(memo, [{ name: 'New item', qty: 1, price: 100 }]), null);
});

test('Deleting a device removes its spending link safely', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 })]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);
  assert.ok(app.deviceLinkForDevice('1'));

  await device.deleteDeviceAsync('1');
  assert.equal(app.deviceLinkForDevice('1'), null, 'link must be removed when the device is deleted');
});

test('Hardware Spending Detail renders per-line linked count, device chip, and Link Devices button', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, brand: 'Apple MacBook Pro' })]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);

  const memo = app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1');
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.match(html, /Linked Devices/);
  assert.match(html, /1 \/ 3/);
  assert.match(html, /Apple MacBook Pro/);
  assert.match(html, /Link Devices/);
});

// Batch 2B.2 — regression: clicking a linked-device chip from Spending
// Detail must close the Spending Detail modal (#actual-spend-record-detail)
// before opening Device Detail, instead of stacking both modals.
// See docs/specs/Batch_2B.2_Fix_Device_Detail_Modal_Routing.md
test('Linked-device chip closes Spending Detail before opening Device Detail (no stacked modals)', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, brand: 'Apple MacBook Pro' })]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);

  const memo = app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1');
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  const onclickMatch = html.match(/onclick="([^"]*openDeviceDetail\('1'\))"/);
  assert.ok(onclickMatch, 'device chip must have an onclick handler calling openDeviceDetail');
  assert.match(onclickMatch[1], /getElementById\('actual-spend-record-detail'\)\?\.remove\(\)/, 'must close Spending Detail before opening Device Detail');
  assert.ok(
    onclickMatch[1].indexOf("getElementById('actual-spend-record-detail')") < onclickMatch[1].indexOf('openDeviceDetail'),
    'Spending Detail close must run before Device Detail opens'
  );
});

test('View Source Spending closes Device Detail before opening Spending Detail (reverse direction unaffected)', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 })]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);

  const panel = document._register('dev-detail-modal', document.createElement('div'));
  device.openDeviceDetail('1');
  const onclickMatch = panel.innerHTML.match(/onclick="([^"]*showSpendingDetail\('historical'[^"]*)"/);
  assert.ok(onclickMatch, 'View Source Spending button must have an onclick handler');
  assert.match(onclickMatch[1], /getElementById\('dev-detail-modal'\)\.style\.display\s*=\s*'none'/, 'must hide Device Detail before opening Spending Detail');
  assert.ok(
    onclickMatch[1].indexOf("getElementById('dev-detail-modal')") < onclickMatch[1].indexOf('showSpendingDetail'),
    'Device Detail hide must run before Spending Detail opens'
  );
});

test('Approved-Memo Hardware detail (non-historical) is unaffected — no device-link section', () => {
  resetStores();
  app.storeMemos([{
    memoNo: 'HW-2026-001',
    type: 'hw',
    status: 'completed',
    project: 'AOA',
    createdAt: '2026-01-01T00:00:00Z',
    hwItems: [{ name: 'Dell Laptop', qty: 2, price: 25000 }],
  }]);
  const memo = app.loadMemos()[0];
  const record = budget.canonicalTransactionRecordFromMemo(memo);
  const html = budget.renderMemoSpendTypeDetail(record);
  assert.doesNotMatch(html, /Linked Devices/);
  assert.doesNotMatch(html, /Link Devices/);
});

test('Device Detail shows Source Spending No. and links back to the historical memo when linked', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 })]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);

  const panel = document._register('dev-detail-modal', document.createElement('div'));
  device.openDeviceDetail('1');
  assert.match(panel.innerHTML, /Source Spending No\./);
  assert.match(panel.innerHTML, /OLD-HW-001/);
  assert.match(panel.innerHTML, /Manual Spending \(Historical\)/);
});

test('Device Detail omits Source Spending block when the device is not linked', () => {
  resetStores();
  device.storeDevices([rawDevice({ id: 1 })]);
  const panel = document._register('dev-detail-modal', document.createElement('div'));
  device.openDeviceDetail('1');
  assert.doesNotMatch(panel.innerHTML, /Source Spending No\./);
});

test('Delete Spending is blocked while any hardware line still has linked devices', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1 })]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']);

  const originalIsPMO = global.isPMO;
  const originalAlert = global.alert;
  const originalConfirm = global.confirm;
  global.isPMO = () => true;
  let lastAlert = '';
  global.alert = msg => { lastAlert = msg; };
  global.confirm = () => true;
  try {
    await budget.deleteSpending('historical', 'hist-hw-1');
    assert.match(lastAlert, /ไม่สามารถลบ/);
    assert.equal(app.loadHistoricalMemos().find(m => m.id === 'hist-hw-1').deleted, false, 'must not be deleted while linked');

    await app.unlinkDeviceFromSpendingAsync('1');
    await budget.deleteSpending('historical', 'hist-hw-1');
    const afterUnlinkDelete = app.loadHistoricalMemos().length === 0
      || (JSON.parse(global.localStorage.getItem('orbit-pmo-historical-memos-v1') || '[]').find(m => m.id === 'hist-hw-1') || {}).deleted;
    assert.ok(afterUnlinkDelete, 'delete should succeed once devices are unlinked');
  } finally {
    global.isPMO = originalIsPMO;
    global.alert = originalAlert;
    global.confirm = originalConfirm;
  }
});

// ── Batch 2B.1 — device-link eligibility + simplified picker ──
// See docs/specs/Batch_2B.1_Device_Link_Eligibility_and_Picker.md
function lastModal(id) {
  return [...document.body.children].reverse().find(c => c.id === id);
}

function withPMO(fn) {
  const original = global.isPMO;
  global.isPMO = () => true;
  return Promise.resolve().then(fn).finally(() => { global.isPMO = original; });
}

test('deviceEligibleForSpendingLink: memo-linked device is ineligible', () => {
  resetStores();
  const memoDevice = rawDevice({ id: 1, memoNo: 'HW-2026-001', source: 'memo' });
  assert.equal(app.deviceEligibleForSpendingLink(memoDevice), false);
});

test('deviceEligibleForSpendingLink: deleted/retired/linked-elsewhere devices are ineligible; a free device is eligible', () => {
  resetStores();
  app.storeSpendingDeviceLinks([{ historicalMemoId: 'other', hardwareLineId: 'x', deviceId: '9', createdAt: 't', createdBy: 'u' }]);
  assert.equal(app.deviceEligibleForSpendingLink(rawDevice({ id: 2, deleted: true })), false);
  assert.equal(app.deviceEligibleForSpendingLink(rawDevice({ id: 3, status: 'retired' })), false);
  assert.equal(app.deviceEligibleForSpendingLink(rawDevice({ id: 9 })), false, 'linked to another line');
  assert.equal(app.deviceEligibleForSpendingLink(rawDevice({ id: 4 })), true);
});

test('Linking a device already linked to an approved Memo is rejected', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, memoNo: 'HW-2026-001', source: 'memo' })]);
  await assert.rejects(() => app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['1']), /Memo\/PO/);
  assert.equal(app.deviceLinkForDevice('1'), null, 'must not create a partial/dangling link');
});

test('Picker excludes Memo-sourced devices, devices linked elsewhere, and the current line\'s own linked devices; free devices remain selectable', async () => {
  resetStores();
  app.storeHistoricalMemos([
    hwMemo({ id: 'hist-hw-1', memoNo: 'OLD-HW-001' }),
    hwMemo({ id: 'hist-hw-2', memoNo: 'OLD-HW-002', hwItems: [{ name: 'iPad', qty: 2, price: 20000 }] }),
  ]);
  device.storeDevices([
    rawDevice({ id: 1, brand: 'Free Device' }),
    rawDevice({ id: 2, brand: 'Memo Device', memoNo: 'HW-2026-001', source: 'memo' }),
    rawDevice({ id: 3, brand: 'Elsewhere Device' }),
    rawDevice({ id: 4, brand: 'Current Line Device' }),
  ]);
  await app.linkDevicesToHardwareLineAsync('hist-hw-2', 0, ['3']); // linked to a DIFFERENT line
  await app.linkDevicesToHardwareLineAsync('hist-hw-1', 0, ['4']); // linked to THIS line already

  await withPMO(() => device.openDeviceLinkPicker('hist-hw-1', 0));
  const modal = lastModal('device-link-picker-modal');
  assert.match(modal.innerHTML, /Free Device/);
  assert.doesNotMatch(modal.innerHTML, /Memo Device/);
  assert.doesNotMatch(modal.innerHTML, /Elsewhere Device/);
  assert.doesNotMatch(modal.innerHTML, /Current Line Device/, 'already-linked-to-this-line device must not be duplicated in the picker');
});

test('Picker shows a compact table with Brand/Model, Asset IT, Serial Number, Select, and a search input; missing fields render as em dash', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, brand: 'Lenovo ThinkPad', assetIt: 'IT-100', serial: 'SN-100' }),
    rawDevice({ id: 2, brand: 'No Asset Info', assetIt: '', serial: '' })]);

  await withPMO(() => device.openDeviceLinkPicker('hist-hw-1', 0));
  const modal = lastModal('device-link-picker-modal');
  assert.match(modal.innerHTML, /Brand \/ Model/);
  assert.match(modal.innerHTML, /Asset IT/);
  assert.match(modal.innerHTML, /Serial Number/);
  assert.match(modal.innerHTML, /device-link-search/);
  assert.match(modal.innerHTML, /IT-100/);
  assert.match(modal.innerHTML, /SN-100/);
  assert.match(modal.innerHTML, />—</, 'missing Asset IT/Serial must render as em dash, not blank');
  assert.doesNotMatch(modal.innerHTML, /Status|Retired|Available|Linked elsewhere/, 'no status/link-status column per spec');
});

test('Picker rows carry a search key covering Brand/Model, Asset IT, and Serial Number', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, brand: 'Lenovo ThinkPad', assetIt: 'IT-777', serial: 'SN-777' })]);

  await withPMO(() => device.openDeviceLinkPicker('hist-hw-1', 0));
  const modal = lastModal('device-link-picker-modal');
  assert.match(modal.innerHTML, /data-search="lenovo thinkpad it-777 sn-777"/);
});

test('Picker shows the required empty-state message when no device is eligible', async () => {
  resetStores();
  app.storeHistoricalMemos([hwMemo()]);
  device.storeDevices([rawDevice({ id: 1, memoNo: 'HW-2026-001', source: 'memo' }), rawDevice({ id: 2, deleted: true }), rawDevice({ id: 3, status: 'retired' })]);

  await withPMO(() => device.openDeviceLinkPicker('hist-hw-1', 0));
  const modal = lastModal('device-link-picker-modal');
  assert.match(modal.innerHTML, /No available devices found\. If the device is linked to another source, unlink it there first before linking it to this spending record\./);
  assert.doesNotMatch(modal.innerHTML, /historical_memos|historical_spending_device_links|supabase/i, 'must not leak technical storage details');
});

test('Approved-Memo device relationship cannot be unlinked from the Manual Spending flow', () => {
  resetStores();
  device.storeDevices([rawDevice({ id: 1, memoNo: 'HW-2026-001', source: 'memo' })]);
  const panel = document._register('dev-detail-modal', document.createElement('div'));
  device.openDeviceDetail('1');
  assert.match(panel.innerHTML, /View Source Memo/);
  assert.doesNotMatch(panel.innerHTML, /Source Spending No\./, 'no Manual Spending link exists for a Memo-sourced device');
  assert.doesNotMatch(panel.innerHTML, /unlinkDeviceFromLine/, 'no Manual-Spending unlink control must be wired for this device');
});
