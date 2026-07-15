# Database Reference

This reference documents tables involved in the handoff scope. Schema source of truth is `supabase/migrations/`. Browser-local canonical Actual Spend storage is documented because it is part of runtime behavior, but it is not a Supabase table.

Related documents: [business logic](./01_BUSINESS_LOGIC_SPEC.md), [architecture decisions](./02_ARCHITECTURE_DECISIONS.md), [module guide](./04_MODULE_HANDOFF_GUIDE.md).

## `memos`

Purpose: Primary memo record for current workflow.

Source migrations:

- `20260621150000_baseline_pmo_schema.sql`
- `20260629123554_phase1_memo_workflow.sql`
- `20260703150000_memo_detail_restore.sql`
- `20260703140000_memo_void_and_soft_delete.sql`
- `20260703160000_milestone2_financial_foundation.sql`
- `20260703155000_unified_license_and_fk_alignment.sql`

Important fields:

- `id`: text primary key.
- `memo_no`: unique memo number.
- `type`: `sl`, `hw`, `int`, `ent`, `dep`.
- `status`: `draft`, `pending`, `pending_a2`, `pending_a3`, `completed`, `rejected`, `cancelled`, `voided`.
- `project`, `subject`, `reason`, `to`, `date`, `total`, `currency`, `amount_words`.
- `requester_name`, `requester_title`, `requester_profile_id`.
- `current_approver_profile_id`.
- `reviewer_name`, `reviewer_title`, `approver_name`, `approver_title`: legacy compatibility fields.
- `approvers`: JSONB current route and stage statuses.
- `sections`: JSONB printable/read-only memo sections.
- `sl_items`, `hw_items`, `acct_cols`, `acct_rows`, `int_names`, `dep_items`: structured detail fields restored from memo forms.
- Type-specific scalar fields: `int_activity`, `int_date`, `int_headcount`, `int_pp`, `ent_client`, `ent_date`, `ent_time`, `ent_place`, `ent_people`, `dep_location`, `dep_start`, `dep_end`, `dep_emp_count`, `hw_owner`.
- Approval metadata: `approved_by`, `rejected_by`, `approval_note`, `rejection_reason`, `approval_evidence_url`.
- Cancellation/override: `cancellation_reason`, `cancelled_at`, `cancelled_by`, `pmo_evidence_url`, `pmo_override_by`, `pmo_override_note`.
- Budget linkage: `budget_pool_id`, `budget_source`.
- Void: `voided_at`, `voided_by`, `void_reason`, `void_evidence_url`.
- Soft delete: `deleted`, `deleted_at`, `deleted_by`, `delete_reason`.
- Audit: `audit_log`.
- Timestamps/user metadata: `created_at`, `updated_at`, `created_by`, `updated_by`.

Relationships:

- `requester_profile_id` and `current_approver_profile_id` reference `user_profiles(id)`.
- `source_memo_no` references `memos(memo_no)`.
- `budget_pool_id` references `budget_pools(id)` where FK migration is applied.
- `purchase_orders.memo_no`, `devices.memo_ref`, and `licenses.memo_no` reference `memos(memo_no)`.

Source of truth:

- Current memo workflow.
- Completed current memos are source records for memo-derived Actual Spend.
- Completed SL memos are source records for memo-derived license inventory.
- Completed HW memos are source records for purchase orders.

Ownership: PMO workflow; Tech Team owns schema/RLS hardening.

Indexes:

- `memos_status_updated_idx`
- `memos_project_idx`
- `memos_budget_pool_idx`
- `memos_memo_no_uidx` / baseline unique `memo_no`
- `memos_requester_profile_id_idx`
- `memos_current_approver_profile_id_idx`

Legacy fields:

- `reviewer_*` and `approver_*` mirror the first two approver rows.
- `sections` carries printable HTML and legacy recoverability.
- `approval_chain` exists but current code uses `approvers`.

Deprecated candidates:

- Legacy reviewer/approver scalar fields after all consumers use `approvers`.
- HTML parsing dependence inside `sections` after all memo detail JSON fields are guaranteed.

## Approval Snapshot Structure

Location: `memos.approvers[*].authoritySnapshot` JSON inside an approve-stage row.

Created by: `applyAuthoritySnapshotsOnApproval()` in `app.js`.

Structure:

```json
{
  "authorityTitleId": 5,
  "titleTh": "ผู้อำนวยการโครงการ",
  "titleEn": "Project Director",
  "memoType": "hw",
  "limitThb": 500000,
  "isUnlimited": false,
  "configured": true,
  "policyRef": "Policy HW",
  "resolvedAt": "2026-07-13T00:00:00.000Z"
}
```

Rules:

- Only approve-stage rows get snapshots.
- Snapshot is created when row status changes to `approved`.
- Existing snapshots are preferred over current matrix values for PDF rendering.
- Legacy memos without snapshot resolve from current authority configuration.

## `authority_titles`

Purpose: Master list of approval authority titles.

Source migration: `20260713132302_approval_authority_configuration.sql`.

Important fields:

- `id`: bigint identity primary key.
- `title_th`: required Thai title.
- `title_en`: optional English title.
- `sort_order`.
- `is_active`.
- `created_at`, `updated_at`.

Relationships:

- Referenced by `authority_limits.authority_title_id`.
- Referenced by `user_profiles.default_authority_title_id`.

Source of truth: Settings Authority Title Management.

Indexes:

- `authority_titles_title_th_uidx` unique lower-trimmed title.
- `authority_titles_active_sort_idx`.

Legacy fields: none in this table; it was introduced to replace text-only title management while preserving text fallbacks elsewhere.

Deprecated candidates: none.

## `authority_limits`

Purpose: Approval matrix by authority title and memo type.

Source migrations:

- `20260629120000_unified_shared_master_baseline.sql`
- `20260713132302_approval_authority_configuration.sql`

Important fields:

- `title`: legacy title text, part of original primary key.
- `authority_title_id`: preferred link to `authority_titles`.
- `memo_type`: `sl`, `hw`, `int`, `ent`, `dep`.
- `limit_thb`: numeric approval limit.
- `is_unlimited`: distinguishes unlimited from zero.
- `created_at`, `updated_at`.

Relationships:

- `authority_title_id` references `authority_titles(id)` on delete restrict.

Source of truth: Settings Approval Limit Matrix.

Indexes:

- `authority_limits_title_memo_type_uidx`.
- `authority_limits_title_id_memo_type_uidx`.
- `authority_limits_title_id_idx`.

Legacy fields:

- `title` remains supported for existing data and conflict handling.

Deprecated candidates:

- Text-only matching after all rows have `authority_title_id`.

## `memo_closing_templates`

Purpose: Configurable closing paragraph templates by memo type.

Source migration: `20260713132302_approval_authority_configuration.sql`.

Important fields:

- `memo_type`: primary key, one of `sl`, `hw`, `int`, `ent`, `dep`.
- `policy_ref`.
- `has_authority_clause`.
- `template_th`.
- `supported_placeholders`.
- `is_active`.
- `created_at`, `updated_at`.

Relationships: none.

Source of truth: Settings Closing Paragraph Configuration.

Indexes:

- `memo_closing_templates_active_idx`.

Legacy fields: none; hardcoded closing fallback remains in code.

Deprecated candidates: hardcoded fallback after all environments have configured templates and data audit is complete.

## `user_profiles`

Purpose: People/profile master for requesters, reviewers, approvers, PMO role, signatures, and Settings people management.

Source migrations:

- `20260629120000_unified_shared_master_baseline.sql`
- `20260629123554_phase1_memo_workflow.sql`
- `20260713132302_approval_authority_configuration.sql`

Important fields:

- `id`: bigint identity primary key.
- `full_name`.
- `title`: legacy/default title text.
- `default_authority_title_id`: preferred authority title reference.
- `name_aliases`: text array.
- `email`.
- `is_approver`, `can_review`, `can_approve`, `is_pmo`, `is_active`.
- `signature_data_url`.
- `created_at`, `updated_at`.

Relationships:

- `default_authority_title_id` references `authority_titles(id)` on delete set null.
- `memos.requester_profile_id` and `memos.current_approver_profile_id` reference this table.

Source of truth: Settings People/Profile panel.

Indexes:

- `user_profiles_full_name_uidx`.
- `user_profiles_email_lower_uidx`.
- `user_profiles_is_active_idx`.
- `user_profiles_can_review_idx`.
- `user_profiles_can_approve_idx`.
- `user_profiles_is_pmo_idx`.
- `user_profiles_default_authority_title_id_idx`.

Legacy fields:

- `title` remains as text fallback for old code/data.

Deprecated candidates:

- `is_approver` after all logic uses `can_review` and `can_approve`.
- Name-keyed signature storage in localStorage/settings.

## `budget_pools`

Purpose: Canonical budget targets used by Budget vs Actual, memo tagging, and Actual Spend mapping.

Source migrations:

- `20260629150000_unified_budget_baseline.sql`
- `20260703160000_milestone2_financial_foundation.sql`
- `20260703155000_unified_license_and_fk_alignment.sql`

Important fields:

- `id`: text primary key.
- `project`.
- `name`.
- `status`: added/used by app as `active`/`inactive`.
- `budget`.
- `year`: BE year in current app model.
- `start_month`, `end_month`: Gregorian `YYYY-MM`.
- `memo_types`: JSONB list of `sl`, `hw`, `int`, `ent`, `dep`, `infra`, `other`.
- `created_at`, `updated_at`, `created_by`, `updated_by`.

Relationships:

- Referenced by `memos.budget_pool_id`.
- Referenced by `budget_manual_expenses.budget_pool_id`.
- Referenced by `historical_memos.budget_pool_id`.

Source of truth: Budget & Spend Settings tab.

Indexes:

- `budget_pools_project_idx`.
- `budget_pools_project_name_idx`.

Legacy fields:

- `memo_types` stores old memo-type tokens; application canonicalizes to Spend Types with `createBudgetPoolRecord()`.

Deprecated candidates:

- Independent `year` entry if database later derives/stores only Gregorian period.

## `budget_manual_expenses`

Purpose: Manual Spending / historical expense rows that are not current memo approvals.

Source migrations:

- `20260629161656_historical_budget_expenses.sql`
- `20260701090000_add_manual_expense_vendor_program.sql`
- `20260703170000_manual_expense_audit_log.sql`
- `20260711141030_add_missing_updated_at_triggers.sql`

Important fields:

- `id`: text primary key.
- `entry_kind`: `historical`, `adjustment`, `other`.
- `reference_no`.
- `project`.
- `budget_pool_id`.
- `expense_type`: `sl`, `hw`, `int`, `ent`, `dep`, `infra`, `other`.
- `description`.
- `frequency`: `one_time` or `monthly`.
- `expense_date` for one-time records.
- `start_month`, `end_month` for monthly records.
- `quantity`, `unit_cost`, `amount`.
- `vendor_program`, `notes`.
- `created_by`, `updated_by`.
- `voided_at`, `voided_by`, `void_reason`.
- `audit_log`.
- `created_at`, `updated_at`.

Relationships:

- `budget_pool_id` references `budget_pools(id)` on delete set null.

Source of truth: Manual Spending entries in Budget & Spend.

Indexes:

- `budget_manual_expenses_project_date_idx` where not voided.
- `budget_manual_expenses_pool_idx` where not voided.
- `budget_manual_expenses_reference_idx`.

Legacy fields:

- LocalStorage fallback key `orbit-pmo-manual-expenses-v1`.

Deprecated candidates: none until Actual Spend is database-backed.

## Browser-Local Canonical Actual Spend

Purpose: Canonical reporting model for Actual Spend, Transactions, BvA, and exports.

Storage: localStorage key `orbit-pmo-actual-spend-v1`.

Important fields:

- `id`.
- `source`: `memo` or `manual_spending`.
- `storageKind`: `memo`, `historical_memos`, `manual_expense`, `infra_cost`.
- `referenceNo`, `memoId`.
- `project`, `spendType`, `amount`, `currency`.
- `startDate`, `endDate`, `month`, `year`, `coverageMonths`, `coverageStatus`.
- `vendorProgram`, `description`, `notes`.
- `detailLines`.
- `autoBudgetPoolId`, `manualBudgetPoolId`, `finalBudgetPoolId`, `budgetStatus`, `mappingWarning`.
- `createdBy`, `createdAt`, `updatedBy`, `updatedAt`.

Source of truth:

- Derived/reconciled model, not a database source table.
- Source records remain `memos`, `historical_memos`, `budget_manual_expenses`, and `infra_costs`.

Deprecated candidates:

- This local cache should become a database view/table when server-side reporting is required.

## `infra_costs`

Purpose: Monthly infrastructure cost entries converted into Actual Spend.

Source migration: `20260629150000_unified_budget_baseline.sql`.

Important fields:

- `id`: text primary key.
- `project`.
- `program`.
- `monthly_cost`.
- `start_month`, `end_month`.
- `created_at`, `updated_at`.

Relationships: none.

Source of truth: Budget & Spend infra entries.

Indexes:

- `infra_costs_project_idx`.

Legacy fields: localStorage fallback key `orbit-pmo-infra-v1`.

Deprecated candidates: none.

## `historical_memos`

Purpose: Memo-shaped historical spending records added through Add Spending.

Source migration: `20260711170000_historical_memos_add_spending.sql`.

Important fields:

- `id`: text primary key.
- `memo_no`: unique old/reference memo number.
- `type`, `type_label`.
- `project`, `subject`, `reason`, `date`, `total`, `currency`.
- `sections`, `sl_items`, `hw_items`, `hw_owner`, `acct_cols`, `acct_rows`, `int_names`, `dep_items`.
- Type-specific scalar fields matching `memos`.
- `budget_pool_id`, `budget_source`.
- `original_document_ref`.
- `audit_log`.
- `deleted`, `deleted_at`, `deleted_by`.
- `created_at`, `updated_at`, `created_by`, `updated_by`.

Relationships:

- `budget_pool_id` references `budget_pools(id)` on delete set null.
- Referenced by `historical_spending_device_links.historical_memo_id`.

Source of truth: Historical/manual memo-shaped spending.

Indexes:

- `historical_memos_project_date_idx` where not deleted.
- `historical_memos_type_idx` where not deleted.
- `historical_memos_budget_pool_idx` where not deleted.

Legacy fields: none; this table is itself the compatibility path for old spend.

Deprecated candidates: none.

## `historical_spending_device_links`

Purpose: Join table linking existing devices to historical HW spending lines.

Source migration: `20260711180000_historical_spending_device_links.sql`.

Important fields:

- `id`: bigint identity primary key.
- `historical_memo_id`.
- `hardware_line_id`: app-generated id stored inside `historical_memos.hw_items`.
- `device_id`.
- `created_at`, `created_by`.

Relationships:

- `historical_memo_id` references `historical_memos(id)` on delete restrict.
- `device_id` references `devices(id)` on delete restrict.

Source of truth: Historical HW spending device link state.

Indexes:

- `historical_spending_device_links_memo_idx`.
- `historical_spending_device_links_line_idx`.
- Unique constraint `historical_spending_device_links_device_unique`.

Legacy fields: none.

Deprecated candidates: normalize hardware lines if line-level data grows.

## `purchase_orders`

Purpose: Procurement tracking created from completed Hardware memos.

Source migrations:

- `20260630090000_unified_device_purchase_baseline.sql`
- `20260703160000_milestone2_financial_foundation.sql`
- `20260703155000_unified_license_and_fk_alignment.sql`
- `20260711141030_add_missing_updated_at_triggers.sql`

Important fields:

- `id`: text primary key derived by app.
- `memo_no`.
- `project`.
- `item_name`.
- `ordered_qty`, `arrived_qty`.
- `status`: `pending_order`, `ordered`, `awaiting`, `partial_arrived`, `fulfilled`, `voided_source`.
- `note`.
- `audit_log`.
- `created_at`, `updated_at`, `created_by`, `updated_by`.

Relationships:

- `memo_no` references `memos(memo_no)` on delete set null.
- Referenced by `devices.purchase_order_id`.

Source of truth: Hardware purchase order lifecycle.

Indexes:

- `purchase_orders_memo_no_idx`.
- `purchase_orders_created_at_idx`.

Legacy fields: localStorage fallback key `orbit-pmo-po-v1`.

Deprecated candidates: none.

## `devices`

Purpose: Device Registry for manual devices and devices created from PO arrivals.

Source migrations:

- `20260630090000_unified_device_purchase_baseline.sql`
- `20260630095215_device_fields_storage_status.sql`
- `20260630101500_tighten_device_photo_policies.sql`
- `20260710090000_add_device_asset_it.sql`
- `20260703155000_unified_license_and_fk_alignment.sql`
- `20260711141030_add_missing_updated_at_triggers.sql`

Important fields:

- `id`: bigint identity in Supabase; browser local fallback ids are app-generated.
- `name`, `brand`, `platform`, `type`.
- `serial`, `asset_it`, `asset_tag`, `pbx_number`.
- `owner`, `position`, `assigned_date`.
- `project`, `company`.
- `return_date`, `warranty`.
- `qa_owner`, `os_version`, `photo_url`.
- `status`: normalized to `available`, `in-use`, `maintenance`, `retired`.
- `memo_ref`.
- `purchase_order_id`.
- `note`, `source`.
- `deleted`, `deleted_at`, `deleted_by`.
- `audit_log`.
- `created_at`, `updated_at`, `created_by`, `updated_by`.

Relationships:

- `memo_ref` references `memos(memo_no)` on delete set null.
- `purchase_order_id` references `purchase_orders(id)` on delete set null.
- Referenced by `historical_spending_device_links.device_id`.

Source of truth: Device Registry.

Indexes:

- `devices_memo_ref_idx`.
- `devices_purchase_order_idx`.

Legacy fields:

- App maps old `memoRef` to canonical `memoNo`.
- LocalStorage fallback key `orbit-pmo-devices-v1`.

Deprecated candidates:

- `asset_tag` vs `asset_it` duplication should be reviewed after asset naming policy is finalized.

## `licenses`

Purpose: Manual/other license inventory and overlays for memo-derived licenses.

Source migration: `20260703155000_unified_license_and_fk_alignment.sql`.

Important fields:

- `id`: text primary key.
- `name`, `plan`, `vendor`.
- `seats`, `price_per_month`.
- `owner`, `department`, `project`.
- `license_type`.
- `purchase_date`, `expiry`.
- `billing_freq`.
- `status_override`: includes `cancelled` and `deleted`.
- `memo_no`.
- `note`.
- `source`: usually `manual` for persisted rows.
- `created_at`, `updated_at`.

Relationships:

- `memo_no` references `memos(memo_no)` on delete set null.

Source of truth:

- Manual license rows.
- Memo-derived license inventory is derived from completed SL memos, not persisted here unless an overlay/manual row exists.

Indexes:

- `licenses_source_idx`.
- `licenses_memo_no_idx`.

Legacy fields:

- LocalStorage fallback key `orbit-pmo-licenses-v1`.

Deprecated candidates:

- None until a database-backed derived license inventory is introduced.

## RLS And Grants

Current migrations deliberately use PoC-compatible RLS:

- `select`, `insert`, and `update` are granted to `anon` and `authenticated`.
- Delete is generally omitted except for the historical spending/device link join table, which grants delete for unlink behavior.

This is not the final production authorization model. See [limitations](./05_KNOWN_LIMITATIONS_AND_TECH_DEBT.md).
