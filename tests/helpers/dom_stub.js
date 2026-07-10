// Minimal DOM/browser-global stubs for exercising view-layer render functions
// under `node:test` without a real browser or jsdom. Only supports what the
// canonical transaction detail / device / history render paths actually use:
// element creation, innerHTML capture, and a no-op event/registry surface.

function createElementStub() {
  const el = {
    id: '',
    className: '',
    style: {},
    dataset: {},
    innerHTML: '',
    textContent: '',
    children: [],
    onclick: null,
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute() { return null; },
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  return el;
}

function createDocumentStub() {
  const registry = new Map();
  const doc = {
    body: createElementStub(),
    createElement() { return createElementStub(); },
    getElementById(id) { return registry.has(id) ? registry.get(id) : null; },
    querySelector() { return null; },
    addEventListener() {},
    // Test-only helper: pre-register an element so getElementById(id) resolves it.
    _register(id, el) { registry.set(id, el); return el; },
  };
  return doc;
}

function createLocalStorageStub() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };
}

// Installs document/window/localStorage globals needed for requiring
// views/*.js files in Node. Safe to call once per test file (top-level).
function installDomGlobals() {
  global.document = createDocumentStub();
  global.window = { __PMO_CONFIG__: {} };
  global.localStorage = createLocalStorageStub();
  global.navigator = { userAgent: 'node' };
  return global.document;
}

module.exports = { createElementStub, createDocumentStub, createLocalStorageStub, installDomGlobals };
