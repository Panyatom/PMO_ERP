# PMO_ERP Logic Validation Checklist

Use this checklist against representative Supabase data and at least one user for each role. Boxes are intentionally unmarked.

## Create Memo and Draft

### Source, create, edit, validation
- [ ] Active projects and type-specific active Memo Reasons appear; an unavailable legacy value is preserved only when editing.
- [ ] New memo requires Memo No., date, project, reason, subject, signature date, A1 and A2.
- [ ] Save Draft creates `draft`; Edit Draft restores every structured type field, route row, title override, and account selection.
- [ ] Duplicate Memo and Re-edit Rejected create a new draft rather than overwrite the source.
- [ ] A duplicate number is blocked for Draft/Pending/Completed/Voided; validate the intended behavior for Rejected/Cancelled.
- [ ] Requester may be A1 and is bypassed on submit; requester cannot be A2/A3.
- [ ] A1 and A2 cannot be the same identity; route length stays between two and three.
- [ ] Missing profile/email/title produces a clear warning and cannot silently route to the wrong person.

### Type-specific calculations and edges
- [ ] SL total equals sum of price × months × quantity for all lines.
- [ ] SL requires plan, positive values, start/end, and amount words; test end before start.
- [ ] HW total equals sum of unit price × quantity and requires amount words.
- [ ] INT total equals per-person amount × participant-row count and count must match headcount.
- [ ] ENT stores one total and requires customer/date/venue/headcount.
- [ ] DEP calculated rows total correctly; test text-only and end-before-start cases.
- [ ] Only SL/HW use commercial line items; validate that DEP’s separate expense items are acceptable.

## Pending Approval and Approval History

### Visibility, transitions, permissions
- [ ] Requester, each route participant, PMO, and unrelated user see exactly the documented records.
- [ ] Only current A1/A2/A3 can act; out-of-order approval is rejected.
- [ ] Approve advances `pending` → `pending_a2` → `pending_a3` → `completed` as configured.
- [ ] Reject sets the current route row and memo to `rejected`; no return status appears.
- [ ] Pending cancellation is limited to requester/PMO and records reason/actor/time.
- [ ] PMO Override works only on pending, requires note/evidence, preserves resolved rows, and resolves only the current stage.
- [ ] Completed void is PMO-only, requires reason, respects irreversible-record blockers, and removes spend contribution.
- [ ] Search, project/type/status/date/amount filters, sorting, pagination, and CSV match visible records.
- [ ] Timeline shows bypass, approval, override, reject, cancel, complete, and void actors/times correctly.

### Authority, signatures, PDF
- [ ] Amount above an authority limit displays a warning; confirm whether approval should still be allowed.
- [ ] Approval snapshot is created only for newly approved approve-stage rows.
- [ ] Later matrix changes do not alter the historical PDF snapshot.
- [ ] Existing/missing signatures render correctly; missing signature does not break PDF.
- [ ] Repeated PDF generation creates no duplicate memo/spend/license/device and leaves no temporary UI.
- [ ] PDF server failure falls back to print and clears the loading overlay.

## Budget & Spend — Overview

- [ ] KPI totals reconcile to the same filtered canonical records used by Actual Spend/BvA.
- [ ] Period presets and custom date range include boundary months correctly.
- [ ] Project and spend-type multi-filters update KPI, chart, donut, and BvA summary together.
- [ ] Drill-down opens the expected underlying page/data.
- [ ] Empty/loading/error states show zero/empty output without stale totals.

## Budget & Spend — Actual Spend

### Inclusion, source, lifecycle
- [ ] Completed live memo creates exactly one canonical Actual Spend record.
- [ ] Pending, rejected, cancelled, voided, and soft-deleted records do not contribute.
- [ ] Historical spending creates exactly one record and edit does not duplicate it.
- [ ] Active manual recurring expenses and Infra Costs contribute with correct occurrence/coverage amounts.
- [ ] Visible sources are only Memo and Manual Spending; Infra is shown as spend type/subtype.
- [ ] Report and Transactions totals reconcile under identical filters.

### Mapping and detail
- [ ] One matching pool → Mapped; none → Unbudgeted; multiple → Needs PMO Review.
- [ ] Valid explicit assignment → Manual Override; cross-project/year override is blocked.
- [ ] Ordinary manual expense remains unbudgeted until assigned; historical spending auto-maps.
- [ ] Memo, historical, manual, and Infra detail views show relevant fields and `-` for missing values.
- [ ] Only ordinary manual-expense transactions show Edit/Void.
- [ ] Soft delete/void immediately removes the record from calculations and exports.
- [ ] Hardware historical detail links only eligible devices and navigates Device Detail/back correctly.

### Import/export and edges
- [ ] Import rejects invalid dates, nonpositive amounts, invalid types/source, duplicates, and bad cross-sheet references.
- [ ] Batch failure behavior is understood (all-or-nothing where implemented).
- [ ] Filtered report/transaction export rows and total match the screen.
- [ ] Empty export remains usable and does not include stale rows.

## Budget & Spend — Forecast

### Data inclusion
- [ ] Only Software and Infra rows are included.
- [ ] Hardware, Team Activity, Client Expense, Deployment, and Others never enter Forecast.
- [ ] Window is previous six Actual months plus current and next five Forecast months.
- [ ] Obsolete recurring records outside lookback/future coverage are excluded.

### Calculation and grain
- [ ] Each SL detail line becomes a component; final grain is Project + Program + Plan + Spend Type.
- [ ] Multiple components merged into a row retain distinct contributor references.
- [ ] Monthly value equals amount divided by inclusive coverage months where applicable.
- [ ] Infra/manual records remain record-level components.
- [ ] Actual month values equal contributor totals.
- [ ] Supported future values and carry-forward-only values follow documented rules.

### Drill-down/filter/export/edges
- [ ] Underlined cells have real contributors and open all correct sources/line indexes.
- [ ] Unsupported expired carry-forward values are not clickable.
- [ ] Project/program/plan/software/infra filters cascade correctly.
- [ ] Export month order, kind, values, and row totals match the filtered screen.
- [ ] Empty, expired, cancelled, overlapping, legacy-no-detail, and partially actualized cases are validated.

## Budget & Spend — Budget vs Actual

- [ ] Each active Budget Pool forms the expected row and receives only records with its final pool ID.
- [ ] Actual, variance (`budget − actual`), and utilization formulas reconcile.
- [ ] Unbudgeted and Needs PMO Review sections include every unmatched record exactly once.
- [ ] Assignment workspace persists/clears overrides for memo, historical, manual, and Infra records.
- [ ] Drill-down opens Memo and every Manual Spending subtype correctly.
- [ ] Year/project/type/status/search filters and CSV match visible rows.
- [ ] Deleted pools and voided spend are excluded without orphaning hidden amounts.

## Budget Pool

- [ ] Create/edit requires project, unique name/year identity, positive THB budget, type(s), and one-year valid period.
- [ ] Buddhist/Gregorian year normalization produces the intended year.
- [ ] Overlap warning permits save and later produces Needs PMO Review where appropriate.
- [ ] Delete/soft-delete respects mapped-record blockers and removes the pool from selectors/calculations.
- [ ] Bulk blank ID creates; known ID updates; unknown/duplicate ID fails; no-op row stays unchanged.
- [ ] Bulk preview/error list and export match current filters.
- [ ] Data-layer status fields and UI status capabilities are aligned or consciously accepted.

## License Inventory and Summary

- [ ] Completed SL memo/historical lines and nondeleted manual/imported licenses appear once.
- [ ] Pending/rejected/voided/cancelled memo sources and soft-deleted licenses are excluded appropriately.
- [ ] Manual create/edit preserves project/software/program/plan, dates, seats, price, and source link.
- [ ] Expiry before purchase is rejected; explicitly test expiry before start.
- [ ] Status thresholds (7/15/30, expired, active, cancelled) match today’s date.
- [ ] Summary grain is exactly Project + Software + Plan.
- [ ] Purchased = noncancelled seat sum; Assigned = distinct active assigned users; Remaining = Purchased − Assigned.
- [ ] Negative Remaining stays visible and Over-assigned/Has Remaining filters behave correctly.
- [ ] Assigned-user drill-down and navigation to Users show the same identities counted in Summary.
- [ ] Account review gate excludes pending/rejected new memo mappings; grandfathered mappings remain.
- [ ] Manual assign/unassign and CSV assignment classify duplicate/ambiguous/rejected correctly and apply only valid rows.
- [ ] Inventory/user/summary exports match current filters; soft delete removes totals.

## Device Registry and Purchase Orders

- [ ] Completed HW memo creates one idempotent PO per line with correct ordered quantity.
- [ ] PO progresses only through allowed statuses; arrival cannot exceed ordered quantity.
- [ ] Partial arrival creates exactly the submitted number of devices; full arrival fulfills PO.
- [ ] Terminal source memo blocks outstanding PO actions; arrived devices remain.
- [ ] Manual device creation/import works and source fields remain distinguishable.
- [ ] Duplicate serial/Asset IT/identity is blocked case-insensitively; missing identity is flagged.
- [ ] Project/user assignment and unassignment update status/audit as documented.
- [ ] Search finds current fields and history/audit text; filters/pagination are stable.
- [ ] Registry/PO export matches filters; device import reports row conflicts.
- [ ] Spending Detail only offers nondeleted, nonretired, unlinked devices without Memo/PO source.
- [ ] Link/unlink refreshes Spending Detail, and Device Detail/back navigation preserves context.
- [ ] Soft-deleted devices are excluded; photo upload type limits and empty state work.

## Settings — Memo & Approval Only

### Memo Reasons
- [ ] Create/edit/deactivate, sort order, type filtering, and persistence work.
- [ ] Create Memo immediately reflects active sorted reasons.
- [ ] Intentionally empty reasons produce the product owner’s chosen empty/fallback behavior.

### Reviewer/Approver and Authority Titles
- [ ] Only active `can_review` profiles appear for A1 and active `can_approve` profiles for A2/A3.
- [ ] Default authority title auto-fills by ID; memo-level override persists in draft/snapshot.
- [ ] Inactive/legacy current values remain readable but are not newly offered.
- [ ] Profile email/name/alias changes do not break historical identity/signature lookup.

### Approval Matrix and Signatures
- [ ] Unconfigured, zero, numeric, and unlimited matrix states save/load distinctly for all memo types.
- [ ] Empty cells delete/clear the intended matrix row and do not become zero accidentally.
- [ ] Matrix affects warnings/snapshot/PDF exactly as documented and does not silently alter routing.
- [ ] Eligible signature list de-duplicates dual-role profiles and excludes inactive profiles.
- [ ] Upload, replace, preview, clear, legacy fallback, renamed profile, and missing signature cases work.

## Cross-module regression

- [ ] Memo completion updates Actual Spend, Budget mapping/BvA, License or PO/Device exactly once.
- [ ] Memo void reverses spend and outstanding PO contribution without deleting irreversible arrived devices.
- [ ] Manual historical SL updates Actual Spend, Forecast, and License once.
- [ ] Manual historical HW device linkage is traceable both directions.
- [ ] Soft-deleted source records disappear from totals, summaries, forecasts, selectors, and exports.

