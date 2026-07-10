// Wires app.js + views/*.js together the way the browser does (all sibling
// <script> tags sharing one global scope), so DOM-lite integration tests can
// call the *real* production functions instead of re-implemented look-alikes.
//
// Order matters: app.js's exports must be on `global` before views/budget.js
// is required, because budget.js's functions reference identifiers like
// `esc`, `money`, `loadMemos` as free variables resolved at call time.
const { installDomGlobals } = require('./dom_stub');

function loadViews() {
  installDomGlobals();

  const app = require('../../app.js');
  Object.assign(global, app);

  // views/pending.js owns the real formatDateTime, but it also runs a
  // top-level setInterval() as a page-load side effect (auto-refresh label)
  // that would never let a Node test process exit. Rather than requiring
  // that whole module for one display formatter, stub it — no test in this
  // suite asserts on the exact formatted string, only on section presence.
  global.formatDateTime = iso => (iso ? String(iso) : '-');

  const history = require('../../views/history.js');
  global._buildMemoTypeSection = history._buildMemoTypeSection;
  global.openMemoReadOnly = history.openMemoReadOnly;

  const budget = require('../../views/budget.js');
  const device = require('../../views/device.js');

  return { app, history, budget, device };
}

module.exports = { loadViews };
