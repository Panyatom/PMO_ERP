# Phase 5 Schema-Only Apply Checklist

## Scope

Apply only `docs/INTEGRATION/phase5_apply/PHASE_5_SCHEMA_ONLY_BUNDLE.sql`.

Do not run the full `supabase/migrations` folder for Phase 5. This curated bundle intentionally excludes older migrations with data backfills and excludes Resource, Settings, and Project Code schema changes.

## Files In This Apply Package

- `docs/INTEGRATION/phase5_apply/PHASE_5_SCHEMA_ONLY_BUNDLE.sql`
- `docs/INTEGRATION/phase5_apply/PHASE_5_APPLY_CHECKLIST.md`

## Included Schema Scope

- Create `user_profiles` if missing.
- Create `authority_limits` if missing.
- Add current app-required Memo fields for workflow, detail restore, void/delete, currency, and audit metadata.
- Create `budget_pools` if missing.
- Create `budget_manual_expenses` if missing.
- Create `infra_costs` if missing.
- Create `licenses` if missing.
- Create `purchase_orders` if missing.
- Create `devices` if missing.
- Add only app-required foreign keys, indexes, RLS policies, grants, and sequence grants for the included tables.

## Explicitly Excluded

- Full migration folder execution.
- Older migrations with data `UPDATE` statements.
- Resource Management schema changes.
- Settings schema changes.
- Project Code Management schema changes.
- `organization_projects`.
- `license_user_assignments`.
- `owner_profile_id`.
- `organization_project_id`.
- Duplicate `memos.memo_no` unique index.
- Future-normalization tables, fields, indexes, or foreign keys.
- Destructive SQL: `DROP`, `TRUNCATE`, data `DELETE`, data `UPDATE`, `RENAME`, `ALTER COLUMN TYPE`.

## Required Backup Before Apply

- Take a full database backup or Supabase point-in-time snapshot.
- Export schema and data for:
  - `memos`
  - `resource_requests`
  - `settings`
  - `project_code_master`
  - `resource_project_codes`
- Export all `settings` rows separately.
- Capture table row counts before apply.
- Preserve a copy of the exact SQL file used for apply.
- Confirm the restore path is known before execution.

## Pre-Apply Validation

- Confirm the live schema still matches `docs/INTEGRATION/schema_reference/PMO_ERP_LIVE_SCHEMA.sql`.
- Confirm these tables are absent or match the bundle definitions before apply:
  - `user_profiles`
  - `authority_limits`
  - `budget_pools`
  - `budget_manual_expenses`
  - `infra_costs`
  - `licenses`
  - `purchase_orders`
  - `devices`
- Confirm no existing `memos.budget_pool_id` values would conflict with `budget_pools.id` before later FK validation.
- Confirm `public.set_updated_at()` exists if updated-at triggers are expected.
- Confirm newly created tables are exposed through the Supabase Data API after apply.
- Confirm RLS policies match the current PMO ERP proof-of-concept access model.

## Post-Apply Validation

- Verify all included tables exist.
- Verify all Memo columns listed in the bundle exist.
- Verify Resource, Settings, and Project Code tables were not changed.
- Verify app read/write flows for:
  - Memo create/edit/approval/history.
  - Budget pools.
  - Manual actual spend.
  - Infra costs.
  - License registry.
  - Purchase orders.
  - Device registry.
- Verify no unexpected objects were created:
  - `organization_projects`
  - `license_user_assignments`
  - any feature-table `organization_project_id`
  - any `owner_profile_id`

## Go / No-Go Gate

Proceed only if:

- Backup is complete.
- The bundle is the only SQL being applied.
- The safety scan passes.
- Pre-apply validation confirms no conflicting partial feature tables.
- Resource, Settings, and Project Code changes are out of scope.
