# Browser console E2E test harness

`console-e2e-test.js` is a paste-into-DevTools-console test script for a real,
loaded instance of this app. It drives the app's own functions and DOM inputs
(the same code path a real click/type triggers) — it never writes to Supabase
or localStorage directly to fake a state, and it never skips an approval stage.

## How to run

1. Open the app you want to test in Chrome (confirm the URL, branch/commit,
   and Supabase project first — see the checklist `envPrecheck()` prints).
2. Open DevTools > Console.
3. Paste the entire contents of `console-e2e-test.js` and press Enter.
4. Run:
   ```js
   await PMO_E2E.envPrecheck()   // always first — prints master data, prior test-prefix hits, etc.
   await PMO_E2E.runAll()        // full run across every suite
   // or one module at a time:
   await PMO_E2E.run('approvalFlowSL')
   await PMO_E2E.run('budgetMappingScenarios')
   ```
5. Review results:
   ```js
   PMO_E2E.printReport()     // coverage matrix
   PMO_E2E.printDefects()    // defect list (also printed live as each is found)
   console.log(PMO_E2E.toMarkdown())   // paste straight into your test report
   ```
6. Clean up test data when you're done:
   ```js
   await PMO_E2E.cleanup()
   ```

Every record this script creates is tagged with a unique prefix
`E2E-TEST-YYYYMMDD-HHMM-<scenario>` (regenerated each time you reload the
script), so cleanup and searches never touch pre-existing data.

## Suites (`PMO_E2E.suiteNames`)

`environment`, `memoCreateSLHappyPath`, `memoCreateHWHappyPath`,
`memoCreateNegative`, `draftLifecycle`, `duplicateSubmitPrevention`,
`approvalFlowSL`, `approvalFlowHW`, `approvalReject`, `approvalPermissions`,
`memoHistoryFilters`, `budgetPoolCrud`, `budgetMappingScenarios`,
`manualActualSpendCrud`, `budgetVsActualReconciliation`, `licenseCrud`,
`deviceRegistryEdit`.

## What it does NOT cover (be aware, don't assume "PASS" means "fully tested")

Found no automatable/reachable path for, or deliberately out of scope:

- **Excel/CSV bulk import flows** (Budget Pool template, device bulk update,
  license assignment import, INT attendee Excel upload) — needs a real file
  input, not scriptable from console alone.
- **PDF export** (`html2pdf.bundle.min.js`) — visual output, not
  assertable from a script.
- **Thai/Buddhist-Era date typed-input edge cases** — the date fields are
  native `<input type=date|month>`; BE/CE conversion is exercised implicitly
  by `fillBudgetPoolForm`'s year-select flow, but manual free-text BE-string
  edge cases are not separately fuzzed.
- **Multi-tab / stale-tab / concurrent-edit scenarios** — requires two real
  browser tabs; this script runs in one tab's console.
- **Network throttling / slow-response UI states** — DevTools' own network
  throttling is the right tool for this, not this script.
- **INT/ENT/DEP memo types** have helper functions (`fillIntFields`,
  `fillEntFields`, `fillDepFields`) but no dedicated happy-path/negative suite
  was written — wire them into a new `SUITES.xxx` entry following the SL/HW
  pattern if you need that coverage.
- **PMO Override** flow (`confirmPmoOverride`) is not exercised — only normal
  sequential Approve/Reject.

## Important environment facts discovered during code review

(Full detail is in the header comment of `console-e2e-test.js` — summarized
here.)

1. **No seeded test users / no real login.** Auth is a client-only mock
   (`auth.js`, localStorage key `orbit-pmo-auth-session-v1`). "Signing in as
   a reviewer" just means calling `pmoSignInMock({name, email, role})` — this
   *is* the real app's mechanism, not a bypass. The script sources real names
   from `user_profiles` (Settings > People) rather than inventing people.
2. **No database-level RLS enforcement.** Every table's RLS policy is
   `using (true)` for both `anon` and `authenticated` — all permission logic
   (`isPMO()`, `canCurrentUserActOnMemo()`, etc.) is client-side JavaScript
   only. This is a known, already-documented gap in this repo's own docs
   (`docs/MEMO_LIFECYCLE.md`), not something this run newly discovered — the
   Permissions suite here only proves the *UI* blocks the wrong user, not that
   the database does.
3. **Memo creation only supports types `sl`, `hw`, `int`, `ent`, `dep`.**
   There is no Infra or "Other" memo creation flow (those spend types are only
   reachable via Manual Actual Spend).
4. **Purchase Orders have no manual creation form by design** — they are only
   ever auto-created when a Hardware memo reaches `completed`.
5. **All deletes across Budget Pool / Manual Expense / License / Device are
   soft-deletes** (status flip / `voided_at` / `deleted` flag) — there is no
   hard DELETE anywhere in this app's code, and for several tables the
   database doesn't even grant a `DELETE` privilege to `anon`/`authenticated`.
6. **This repo's existing automated test suite (`npm test`) covers only the
   Resource module** (33 tests). Memo / Budget / BvA / License / Device modules
   have zero prior automated coverage — this script is genuinely new ground,
   not a duplicate of anything already tested.
