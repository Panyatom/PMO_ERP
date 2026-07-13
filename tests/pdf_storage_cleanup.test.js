const test = require('node:test');
const assert = require('node:assert/strict');

function createElement(tagName = 'div', ownerDocument = null) {
  let idValue = '';
  const el = {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    parentNode: null,
    innerHTML: '',
    textContent: '',
    href: '',
    download: '',
    clicked: false,
    get id() { return idValue; },
    set id(value) {
      idValue = String(value || '');
      if(ownerDocument && idValue) ownerDocument._register(idValue, el);
    },
    get firstElementChild() {
      return this.innerHTML ? { outerHTML: this.innerHTML } : null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if(ownerDocument && child.id) ownerDocument._register(child.id, child);
      return child;
    },
    remove() {
      if(this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      }
      if(ownerDocument && this.id) ownerDocument._unregister(this.id, this);
      this.parentNode = null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) {
      if(name === 'id') this.id = value;
      if(name.startsWith('data-')) this.dataset[name.slice(5)] = value;
    },
    getAttribute(name) {
      if(name === 'id') return this.id;
      return null;
    },
    click() { this.clicked = true; },
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
    },
  };
  return el;
}

function installBrowserStubs({ localStorageSetItem } = {}) {
  const registry = new Map();
  const doc = {
    body: null,
    createElement(tagName) { return createElement(tagName, doc); },
    getElementById(id) { return registry.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if(selector === '[data-pdf-temp], iframe[data-pdf-temp]') {
        return [...registry.values()].filter(el => el.dataset?.pdfTemp !== undefined);
      }
      return [];
    },
    addEventListener() {},
    _register(id, el) { registry.set(id, el); return el; },
    _unregister(id, el) { if(registry.get(id) === el) registry.delete(id); },
  };
  doc.body = createElement('body', doc);
  const stage = createElement('div', doc);
  stage.id = 'pdf-stage';

  const store = new Map();
  global.document = doc;
  global.window = { __PMO_CONFIG__: {}, printCalls: 0 };
  global.window.print = () => { global.window.printCalls += 1; };
  global.pmoCurrentSession = () => ({ user: { name: 'Approver', email: 'approver@example.test' } });
  global.alert = () => {};
  global.navigator = { userAgent: 'node' };
  global.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem: localStorageSetItem || ((key, value) => { store.set(key, String(value)); }),
    removeItem(key) { store.delete(key); },
    _store: store,
  };
  global.URL = {
    createObjectURL() { return 'blob:test'; },
    revokeObjectURL() {},
  };
  global.AbortController = class {
    constructor() { this.signal = {}; }
    abort() { this.signal.aborted = true; }
  };
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };
  global.clearTimeout = () => {};

  return { doc, stage, restoreTimers: () => { global.setTimeout = originalSetTimeout; } };
}

function loadApp(stubs) {
  delete require.cache[require.resolve('../app.js')];
  const installed = installBrowserStubs(stubs);
  return { ...installed, app: require('../app.js') };
}

function sampleMemo() {
  return {
    memoNo: 'PDF-CLEANUP-001',
    date: '2026-07-14',
    type: 'hw',
    subject: 'Cleanup smoke',
    requesterName: 'Approver',
    project: 'AOA-MP',
    reason: 'test cleanup',
    total: 100,
    amountWords: 'หนึ่งร้อยบาทถ้วน',
    sections: [],
    approvers: [{ stage: 'approve', name: 'Approver', title: 'ผู้จัดการโครงการ', status: 'approved' }],
  };
}

test('PDF staging node is removed after successful generation', async () => {
  const { app, doc, stage, restoreTimers } = loadApp();
  global.fetch = async () => ({ ok: true, blob: async () => ({ size: 5 }) });

  try {
    await app.downloadMemoPdf(sampleMemo());
    assert.equal(stage.innerHTML, '');
    assert.equal(doc.getElementById('pdf-loading-overlay'), null);
    assert.equal(doc.querySelectorAll('[data-pdf-temp], iframe[data-pdf-temp]').length, 0);
  } finally {
    restoreTimers();
  }
});

test('PDF staging node is removed after render server failure and print fallback', async () => {
  const { app, doc, stage, restoreTimers } = loadApp();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  global.fetch = async () => ({ ok: false, status: 503, blob: async () => ({ size: 0 }) });

  try {
    await app.downloadMemoPdf(sampleMemo());
    assert.equal(stage.innerHTML, '');
    assert.equal(doc.getElementById('pdf-loading-overlay'), null);
    assert.equal(global.window.printCalls, 1);
    assert.equal(doc.body.classList.contains('printing-pdf'), false);
    assert.equal(warnings.some(args => String(args[0]).includes('[PDF] Server failed')), true);
  } finally {
    console.warn = originalWarn;
    restoreTimers();
  }
});

test('PDF cleanup removes orphan temporary PDF nodes', () => {
  const { app, doc, stage, restoreTimers } = loadApp();
  const temp = doc.createElement('iframe');
  temp.dataset.pdfTemp = '1';
  temp.id = 'temp-pdf-frame';
  doc.body.appendChild(temp);
  stage.innerHTML = '<div class="preview-wrap">orphan</div>';
  doc.body.classList.add('printing-pdf');

  try {
    app.cleanupMemoPdfStaging();
    assert.equal(stage.innerHTML, '');
    assert.equal(doc.getElementById('temp-pdf-frame'), null);
    assert.equal(doc.body.classList.contains('printing-pdf'), false);
  } finally {
    restoreTimers();
  }
});

test('localStorage failed memo cache writes warn once and preserve memory cache fallback', () => {
  const { app, restoreTimers } = loadApp();
  const originalSetItem = global.localStorage.setItem;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  global.localStorage.setItem = () => { throw new Error('quota exceeded'); };

  try {
    app.storeMemos([{ memoNo: 'LS-001' }]);
    app.storeMemos([{ memoNo: 'LS-002' }]);

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], 'localStorage write failed');
    assert.deepEqual(app.loadMemos().map(memo => memo.memoNo), ['LS-002']);
  } finally {
    global.localStorage.setItem = originalSetItem;
    console.warn = originalWarn;
    restoreTimers();
  }
});

test('successful localStorage memo cache writes are unchanged', () => {
  const { app, restoreTimers } = loadApp();

  try {
    app.storeMemos([{ memoNo: 'LS-OK' }]);
    const raw = global.localStorage._store.get('orbit-pmo-memos-v1');
    assert.match(raw, /LS-OK/);
  } finally {
    restoreTimers();
  }
});
