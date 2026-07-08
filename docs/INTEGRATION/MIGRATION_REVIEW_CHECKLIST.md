# Migration Review Checklist

Date prepared: 2026-07-08

Scope: Phase 2 schema preparation only. Do not execute these migrations until human review, backup confirmation, and later phase approval are complete.

## Files Created

- `supabase/migrations/20260629120000_unified_shared_master_baseline.sql`
- `supabase/migrations/20260629150000_unified_budget_baseline.sql`
- `supabase/migrations/20260630090000_unified_device_purchase_baseline.sql`
- `supabase/migrations/20260703155000_unified_license_and_fk_alignment.sql`

## Tables Affected

- Created or aligned: `organization_projects`, `user_profiles`, `authority_limits`, `budget_pools`, `infra_costs`, `purchase_orders`, `devices`, `licenses`, `license_user_assignments`
- Existing tables aligned with new shared references: `memos`, `budget_manual_expenses`, `resource_requests`
- Preserved without replacement: `settings`, `resource_master`, `project_code_master`, `resource_project_codes`

## Columns Added

- `organization_projects`: `code`, `name`, `status`, `owner`, `note`, `created_at`, `updated_at`
- `user_profiles`: `full_name`, `title`, `name_aliases`, `email`, `is_approver`, `can_review`, `can_approve`, `is_pmo`, `is_active`, `created_at`, `updated_at`
- `authority_limits`: `title`, `memo_type`, `limit_thb`, `created_at`, `updated_at`
- `budget_pools`: `project`, `organization_project_id`, `name`, `budget`, `year`, `start_month`, `end_month`, `memo_types`, `created_at`, `updated_at`, `created_by`, `updated_by`
- `infra_costs`: `project`, `organization_project_id`, `program`, `monthly_cost`, `start_month`, `end_month`, `created_at`, `updated_at`, `created_by`, `updated_by`
- `purchase_orders`: `memo_no`, `project`, `organization_project_id`, `item_name`, `ordered_qty`, `arrived_qty`, `status`, `note`, `audit_log`, `created_at`, `updated_at`, `created_by`, `updated_by`
- `devices`: `name`, `brand`, `platform`, `type`, `serial`, `asset_tag`, `pbx_number`, `owner`, `owner_profile_id`, `position`, `assigned_date`, `project`, `organization_project_id`, `company`, `return_date`, `warranty`, `qa_owner`, `os_version`, `photo_url`, `status`, `memo_ref`, `purchase_order_id`, `note`, `source`, `deleted`, `deleted_at`, `deleted_by`, `audit_log`, `created_at`, `updated_at`, `created_by`, `updated_by`
- `licenses`: `name`, `plan`, `vendor`, `seats`, `price_per_month`, `owner`, `owner_profile_id`, `department`, `project`, `organization_project_id`, `license_type`, `purchase_date`, `expiry`, `billing_freq`, `status_override`, `memo_no`, `note`, `source`, `created_at`, `updated_at`, `created_by`, `updated_by`
- `license_user_assignments`: `license_id`, `license_name`, `license_plan`, `user_profile_id`, `email`, `project`, `organization_project_id`, `source`, `source_memo_no`, `active`, `review_status`, `imported_at`, `created_at`, `updated_at`, `created_by`, `updated_by`, `audit_log`
- Existing tables: `memos.organization_project_id`, `budget_manual_expenses.organization_project_id`, `resource_requests.organization_project_id`

## Indexes Created

- Shared masters: `organization_projects_code_uidx`, `organization_projects_status_idx`, `user_profiles_full_name_uidx`, `user_profiles_email_lower_uidx`, `user_profiles_is_active_idx`, `user_profiles_can_review_idx`, `user_profiles_can_approve_idx`, `user_profiles_is_pmo_idx`, `authority_limits_title_memo_type_uidx`
- Budget: `budget_pools_organization_project_idx`, `budget_pools_project_idx`, `budget_pools_year_idx`, `budget_pools_project_name_idx`, `budget_pools_organization_project_name_year_idx`, `infra_costs_organization_project_idx`, `infra_costs_project_idx`, `infra_costs_program_idx`, `infra_costs_month_range_idx`, `budget_manual_expenses_organization_project_idx`
- Device and PO: `purchase_orders_memo_no_idx`, `purchase_orders_organization_project_idx`, `purchase_orders_status_idx`, `purchase_orders_created_at_idx`, `devices_organization_project_idx`, `devices_owner_profile_idx`, `devices_memo_ref_idx`, `devices_purchase_order_idx`, `devices_status_idx`, `devices_deleted_idx`, `devices_serial_idx`, `devices_asset_tag_idx`
- Memo and resource alignment: `memos_organization_project_idx`, `memos_budget_pool_idx`, `memos_memo_no_uidx`, `resource_requests_organization_project_idx`
- License: `licenses_source_idx`, `licenses_organization_project_idx`, `licenses_owner_profile_idx`, `licenses_memo_no_idx`, `licenses_expiry_idx`, `licenses_status_override_idx`, `licenses_name_lower_idx`, `license_user_assignments_user_profile_idx`, `license_user_assignments_email_lower_idx`, `license_user_assignments_license_idx`, `license_user_assignments_organization_project_idx`, `license_user_assignments_source_memo_no_idx`, `license_user_assignments_active_idx`, `license_user_assignments_review_status_idx`

## FKs Created

- `budget_pools.organization_project_id` -> `organization_projects.id`
- `infra_costs.organization_project_id` -> `organization_projects.id`
- `purchase_orders.memo_no` -> `memos.memo_no`
- `purchase_orders.organization_project_id` -> `organization_projects.id`
- `devices.owner_profile_id` -> `user_profiles.id`
- `devices.organization_project_id` -> `organization_projects.id`
- `devices.memo_ref` -> `memos.memo_no`
- `devices.purchase_order_id` -> `purchase_orders.id`
- `memos.organization_project_id` -> `organization_projects.id`
- `memos.budget_pool_id` -> `budget_pools.id`
- `budget_manual_expenses.organization_project_id` -> `organization_projects.id`
- `resource_requests.organization_project_id` -> `organization_projects.id`
- `licenses.owner_profile_id` -> `user_profiles.id`
- `licenses.organization_project_id` -> `organization_projects.id`
- `licenses.memo_no` -> `memos.memo_no`
- `license_user_assignments.license_id` -> `licenses.id`
- `license_user_assignments.user_profile_id` -> `user_profiles.id`
- `license_user_assignments.organization_project_id` -> `organization_projects.id`
- `license_user_assignments.source_memo_no` -> `memos.memo_no`

## Potential Risks

- Unique indexes on `organization_projects.code`, `user_profiles.full_name`, `user_profiles.email`, and `memos.memo_no` may fail if existing data contains duplicates.
- Existing data may not satisfy new check constraints or FK relationships. New constraints that may touch existing data are added as `NOT VALID` for human review before validation.
- Existing migration files include historical backfills and storage policy work. This Phase 2 set does not add new data backfills, but reviewers should consider full migration-chain behavior before execution.
- `devices.id` is bigint identity for Supabase rows; local fallback device IDs must be reconciled outside this schema-only phase.
- RLS policies remain PoC-compatible and permissive. Production auth hardening is still required before storing sensitive real data.
- `license_user_assignments` is intentionally empty after schema preparation. Settings JSON transformation requires a later approved data migration.

## Rollback Strategy

- Do not run these migrations until backups of all relevant Supabase databases are confirmed.
- Preferred rollback before execution: remove or revise the pending migration files before review approval.
- If applied in a non-production review environment and rollback is needed, restore the environment from the pre-migration backup.
- If applied to a shared environment, do not use destructive rollback SQL. Create a forward-only corrective migration after impact review.
- Revert application branch changes only after confirming whether any migration has already been applied elsewhere.

## Manual Validation Checklist

- Confirm migrations are ordered before existing files that reference `user_profiles`, `budget_pools`, `devices`, and `purchase_orders`.
- Review every `CREATE TABLE IF NOT EXISTS` contract against the approved schema implementation plan.
- Confirm no new SQL file contains `DROP TABLE`, `DROP COLUMN`, `DELETE`, `UPDATE`, `ALTER COLUMN TYPE`, `RENAME TABLE`, or `RENAME COLUMN`.
- Confirm no Phase 2 migration connects to Supabase or applies schema changes.
- Dry-run in an isolated local/staging database only after approval.
- Validate table existence for all required modules: Memo, Budget vs Actual, License Management, Device Management, Resource Management, and Settings.
- Validate FK columns and indexes exist with expected names.
- Check duplicate risk before validating unique indexes or constraints in any database with existing data.
- Confirm `settings`, `resource_master`, `project_code_master`, and `resource_project_codes` remain preserved.
- Confirm no application code, views, `app.js`, or existing integration documents were modified.
