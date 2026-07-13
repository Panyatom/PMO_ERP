# Known Limitations And Tech Debt

This document separates intended behavior, bugs already fixed in the current implementation, future improvements, and gaps that require manual confirmation.

Related documents: [business logic](./01_BUSINESS_LOGIC_SPEC.md), [architecture decisions](./02_ARCHITECTURE_DECISIONS.md), [database reference](./03_DATABASE_REFERENCE.md), [RC notes](./06_RELEASE_NOTES_RC.md).

## Intended Behavior

## Static App / PoC Security

The current app intentionally runs as a static browser application using a public Supabase anon key. Migrations grant broad `select`, `insert`, and `update` to `anon` and `authenticated` for PoC compatibility.

This is intended for the current handoff state, not the final production authorization model.

Required future hardening:

- Supabase Auth.
- Organization/role-aware RLS.
- Server-side enforcement for approval actions and PMO-only operations.
- Separate dev/staging/prod Supabase projects.

## Completed Memo Is The Downstream Trigger

Only `completed` memos create downstream business impact:

- Actual Spend from current memos.
- License inventory from completed SL memos.
- Purchase Orders from completed HW memos.

Rejected, cancelled, draft, pending, soft-deleted, and voided memos are intentionally excluded.

## Hardware Devices Are Created On Arrival

Completed HW memos create POs, not devices. Device Registry rows appear only when PO arrival is marked. This is intended because a purchase approval does not prove physical asset receipt.

## Manual Spending And Historical Memos Are Manual Spending

Current business source values are intentionally only `memo` and `manual_spending`. Historical memos, manual expenses, and infra costs share `manual_spending`; `storageKind` carries implementation detail.

## Multiple Matching Budget Pools Require PMO Review

Overlapping Budget Pools are allowed. If one Actual Spend record matches multiple pools, mapping becomes `Needs PMO Review` instead of selecting one silently.

## Legacy Compatibility

Compatibility paths are intentional:

- Authority title lookup by legacy text.
- Signature lookup by legacy name/alias keys.
- SL/HW memo detail parsing from legacy HTML sections.
- LocalStorage fallback.
- PostgREST schema-cache fallback for newly added columns.

These should not be removed without data audit and migration/backfill.

## Bugs Already Fixed In Current Implementation

These items are documented as fixed behavior observed in code/tests.

## Authority Snapshot Stability

Fixed behavior:

- Approval snapshots are created only for approve-stage rows when they become approved.
- Historical PDF authority limit stays stable even if matrix values later change.
- Legacy memos without snapshots still render with current title lookup.

Coverage:

- `tests/authority_snapshot_pdf.test.js`
- `tests/approval_authority_compatibility.test.js`

## Profile-Keyed Signatures

Fixed behavior:

- Signatures are keyed by `user_profiles.id`.
- Profile rename does not break lookup.
- Legacy name/alias fallback still works.
- Missing signatures do not break PDF rendering.

Coverage:

- `tests/signature_management.test.js`

## Canonical Actual Spend And Transactions

Fixed behavior:

- Transactions include approved memo and active manual records only.
- Pending/rejected memos and voided manual expenses are excluded.
- Transactions export and Actual Spend report totals reconcile under the same filters.
- Manual records expose edit/delete; memo and historical records do not.

Coverage:

- `tests/actual_spend_transactions.test.js`
- `tests/source_classification.test.js`
- `tests/canonical_transaction_detail_routing.test.js`
- `tests/canonical_missing_data.test.js`
- `tests/spend_type_detail_rendering.test.js`

## Budget Pool Mapping Consistency

Fixed behavior:

- Budget Pool canonicalizer derives year from normalized start month.
- Cross-project/year manual overrides are blocked.
- Old parallel pool matching was removed from Budget Settings/Tag Budget paths.
- Pool import validates create/update decisions by Pool ID.

Coverage:

- `tests/budget_forecast.test.js`
- `tests/forecast_breakdown.test.js`
- `tests/forecast_export_consistency.test.js`
- `tests/add_spending_historical.test.js`

## Hardware Device Linking

Fixed behavior:

- Completed HW memo creates POs keyed by memo + line index + item name.
- Devices are created only on arrival.
- Voided/rejected/cancelled source memos block new arrivals.
- Historical HW links are restricted to eligible devices.

Coverage:

- `tests/hardware_device_linking.test.js`

## Future Improvements

## Database-Backed Actual Spend

Current limitation: Canonical Actual Spend is stored in browser localStorage and recalculated from source records. There is no Supabase `actual_spend` table.

Impact:

- Cross-client reporting depends on recalculation in each browser.
- Server-side reporting and audits cannot query a single canonical Actual Spend table.

Recommended future work:

- Create database view/table or materialized view for canonical Actual Spend.
- Preserve `source` and `storageKind`.
- Backfill from `memos`, `historical_memos`, `budget_manual_expenses`, and `infra_costs`.
- Add tests comparing browser model to database output.

## Normalize Approval Events

Current limitation: Approval route/status lives in `memos.approvers` JSONB and audit events live in `memos.audit_log`.

Impact:

- Stage-level querying and policy enforcement are hard in SQL.

Recommended future work:

- Add `memo_approval_steps` and `memo_audit_events` tables or server RPC.
- Keep JSONB compatibility during transition.

## Production Authorization

Current limitation: PoC-compatible RLS allows broad anon/authenticated read/write.

Impact:

- Business permissions are enforced in browser only.

Recommended future work:

- Add Auth.
- Replace `poc_*` policies.
- Enforce PMO-only operations and current-approver actions in backend.

## Signature Storage

Current limitation: `signature_data_url` stores image data URL directly in `user_profiles`.

Impact:

- Profile rows can become large.
- Storage lifecycle and permissions are coarse.

Recommended future work:

- Move signatures to Supabase Storage.
- Store path/url + metadata in `user_profiles`.
- Preserve `readSignatureDataUrl()` API.

## Closing Paragraph Snapshot

Current limitation: Authority snapshot is persisted, but final rendered closing paragraph/template text is not stored on the memo.

Impact:

- Historical PDFs can still change if a legacy memo has no snapshot or if fallback/template rendering changes.

Recommended future work:

- Store rendered closing paragraph or template version at approval time.

## Remove Legacy HTML Parsing

Current limitation: License and Device modules still parse old memo section HTML when structured data is absent.

Impact:

- Cosmetic HTML changes can affect legacy fallback if not tested.

Recommended future work:

- Backfill structured `sl_items`, `hw_items`, `acct_cols`, and `acct_rows`.
- Remove HTML parsing after confirming no live rows depend on it.

## Normalize Historical Hardware Lines

Current limitation: `historical_spending_device_links.hardware_line_id` references app-generated ids stored inside `historical_memos.hw_items` JSONB.

Impact:

- SQL cannot fully enforce hardware line existence.

Recommended future work:

- Add `historical_memo_lines` if linking/reporting expands.

## Budget Pool Year Representation

Current limitation: Budget Pools store BE `year` while `start_month` / `end_month` are Gregorian `YYYY-MM`.

Impact:

- Boundary conversions must remain consistent.

Recommended future work:

- Store canonical Gregorian year/period only, then display BE where needed, or document BE year as contract at database level.

## Manual Confirmation Gaps

These require PMO/Tech Team confirmation before final production hardening.

- Whether memo number reuse for `rejected` and `cancelled` is intentional long-term.
- Whether closing paragraph text must be immutable after approval.
- Whether Actual Spend must become a database table before go-live.
- Whether manual/historical spending should continue to be grouped as `manual_spending` for all reports.
- Whether Budget Pool overlap should remain allowed in production.
- Whether signatures may legally be stored as profile data URLs or must move to managed object storage.
- Whether historical HW line/device links need formal line-item tables.

## Non-Blocking Issues / Cleanup Candidates

- Duplicate legacy function blocks exist in `app.js` for some storage/status helpers due to progressive migrations. Current later definitions are effective in browser load order; cleanup should be done carefully with tests.
- `settings` table remains a generic compatibility store for some legacy preferences/signature paths.
- LocalStorage fallback means stale local data can confuse debugging if Supabase is available but cached data differs.
- `authority_limits` still has both `title` primary-key behavior and `authority_title_id` unique behavior.
- `memos.sections` stores rendered HTML, while structured fields store editable data.
- Some exports and filters rely on browser DOM state; keep shared pure calculation functions when adding exports.

## Recommended Cleanup Order

1. Add backend auth/RLS and server-side permission checks.
2. Add database-backed Actual Spend model.
3. Normalize approval events/audit if needed.
4. Backfill structured memo details and remove HTML parsing fallbacks.
5. Move signatures to object storage.
6. Simplify authority title legacy matching.
7. Normalize historical hardware lines if device linking grows.

