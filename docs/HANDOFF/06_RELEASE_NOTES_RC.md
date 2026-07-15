# Release Notes RC

This release-candidate note summarizes the implemented modules covered by the handoff pack.

Related documents: [business logic](./01_BUSINESS_LOGIC_SPEC.md), [architecture decisions](./02_ARCHITECTURE_DECISIONS.md), [database reference](./03_DATABASE_REFERENCE.md), [limitations](./05_KNOWN_LIMITATIONS_AND_TECH_DEBT.md).

## Major Features

## Memo Management

- Memo create, draft save, submit, duplicate, rejected re-edit, draft soft delete, completed memo void.
- Structured memo details for SL, HW, INT, ENT, DEP.
- Memo-number collision checks with soft-deleted draft exception and current status blocking rules.
- PDF/detail rendering with audit timeline and linked downstream actions.

## Approval Workflow

- A1/A2/A3 approval routing with current-approver action enforcement in UI.
- A1 self-review bypass on submission.
- Reject, requester cancel, and PMO override.
- Audit log entries for important transitions.
- Approval evidence support.

## Authority Title & Approval Matrix

- Authority title master table and Settings UI.
- Approval matrix by authority title and memo type.
- Authority snapshots captured on approve-stage approval.
- Legacy title-text compatibility.

## Closing Paragraph

- Configurable Thai closing templates per memo type.
- Placeholder validation in Settings.
- PDF rendering from configured template with hardcoded fallback.

## Signature Management

- Profile-keyed signature upload/replace/clear.
- Signatures persisted to `user_profiles.signature_data_url`.
- Legacy name/alias lookup fallback.

## Budget & Expense / Actual Spend / Transactions

- Budget Pool settings with canonical validation and import support.
- Manual Spending entries with audit and void behavior.
- Historical Add Spending for SL/HW/INT/ENT/DEP.
- Canonical Actual Spend reconciliation from completed memos, historical memos, manual expenses, and infra costs.
- Budget mapping statuses: `Mapped`, `Manual Override`, `Needs PMO Review`, `Unbudgeted`.
- Transactions view and export over canonical Actual Spend.

## Device Registry

- Completed HW memo creates purchase orders.
- PO status progression and arrival handling.
- Device rows created only on arrival.
- Device soft delete and audit log.
- Source memo void/reject/cancel blocks new PO arrivals.
- Historical HW spending can link to eligible existing devices.

## License Management

- Memo-derived license inventory from completed SL line items.
- Manual license rows and soft deletion.
- License status, summary matrix, user assignments, and reconciliation.
- CSV exports for inventory, summary, reconciliation, and user license matrix.

## Migrations

Important schema migrations in scope:

- `20260621150000_baseline_pmo_schema.sql`: baseline `memos`, `settings`, RLS, indexes.
- `20260629120000_unified_shared_master_baseline.sql`: `organization_projects`, `user_profiles`, `authority_limits`.
- `20260629123554_phase1_memo_workflow.sql`: memo profile ids, self-review fields.
- `20260629150000_unified_budget_baseline.sql`: `budget_pools`, `infra_costs`.
- `20260629161656_historical_budget_expenses.sql`: `budget_manual_expenses`.
- `20260630090000_unified_device_purchase_baseline.sql`: `purchase_orders`, `devices`.
- `20260703155000_unified_license_and_fk_alignment.sql`: `licenses` and relationship alignment.
- `20260703160000_milestone2_financial_foundation.sql`: currency and created/updated metadata.
- `20260703170000_manual_expense_audit_log.sql`: manual expense audit log.
- `20260711170000_historical_memos_add_spending.sql`: `historical_memos`.
- `20260711180000_historical_spending_device_links.sql`: HW spending/device link join table.
- `20260713132302_approval_authority_configuration.sql`: `authority_titles`, authority title ids, signature field, closing templates.
- `20260713170000_repair_authority_title_encoding.sql`: authority title encoding repair.

## Improvements

- Canonical financial mapping is centralized in `app.js` and reused by Budget vs Actual, Actual Spend, Forecast, and Transactions.
- Budget Pool import and manual save use the same canonical validation path.
- Device/PO workflows preserve local cache while Supabase writes are in-flight to avoid UI data loss.
- User-facing filters moved toward shared multi-select controls.
- Settings now manages authority titles, matrix, closing templates, people, and signatures from real tables.

## Bug Fixes

- Authority snapshot PDF stability after matrix changes.
- Signature lookup survives profile rename.
- Transactions totals reconcile with Actual Spend report filters.
- Manual Spending edit/delete only appears for editable manual expense rows.
- Historical spending does not duplicate canonical Actual Spend records after edit.
- Budget Pool BE/CE year normalization avoids double-conversion defects.
- Cross-project/year manual budget override is blocked.
- Budget Pool deletion checks canonical records, manual expenses, current memos, and historical memos.
- HW PO creation avoids collisions for duplicate item names.
- Mark-arrived blocks voided/rejected/cancelled source memos.
- Device soft delete unlinks spending/device join rows.

## Test Coverage

Relevant automated tests include:

- `tests/authority_snapshot_pdf.test.js`
- `tests/approval_authority_compatibility.test.js`
- `tests/settings_authority_ui.test.js`
- `tests/settings_closing_templates.test.js`
- `tests/signature_management.test.js`
- `tests/actual_spend_transactions.test.js`
- `tests/source_classification.test.js`
- `tests/spend_type_detail_rendering.test.js`
- `tests/canonical_missing_data.test.js`
- `tests/canonical_transaction_detail_routing.test.js`
- `tests/add_spending_historical.test.js`
- `tests/budget_forecast.test.js`
- `tests/forecast_breakdown.test.js`
- `tests/forecast_export_consistency.test.js`
- `tests/hardware_device_linking.test.js`
- `tests/memo_history_regression.test.js`
- `tests/memo_number_collision.test.js`
- `tests/pdf_storage_cleanup.test.js`

## E2E / Regression Status

The repository has Node-based regression coverage under `tests/`. This documentation task did not change application code, database schema, tests, or configuration. No browser E2E run was required for docs generation.

Recommended handoff validation before deployment:

- Run `npm test`.
- Run any manual UAT scripts currently used by PMO for memo approval, Budget vs Actual, Transactions, PO arrival, Device Registry, and License Management.
- Confirm Supabase migrations are applied in the target environment.

## Deployment Considerations

- Deploy through GitHub Pages workflow as documented in `docs/DEPLOYMENT.md`.
- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository variables are set.
- Do not commit generated `config.js`.
- Apply migrations with Supabase CLI from a trusted workstation or CI.
- Current RLS is PoC-compatible; do not treat it as final production security.
- Browser localStorage fallback may contain stale test data; clear browser storage when validating production-like behavior.

## RC Readiness

Recommendation: Ready for Tech Team handoff as a functional RC, with explicit production-hardening caveats.

Blocking for business handoff: none identified in the documented scope.

Blocking for secure production launch:

- Supabase Auth and role-aware RLS.
- Server-side enforcement for approval/PMO-only actions.
- Database-backed canonical Actual Spend if centralized reporting/audit is required.

Suggested commit message:

```text
Add technical handoff documentation
```
