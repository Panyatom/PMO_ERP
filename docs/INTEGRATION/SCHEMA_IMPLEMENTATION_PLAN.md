# Schema Implementation Plan

Version: 1.0
Status: Phase 1 schema contract
Date: 2026-07-08

This document is the implementation-ready schema contract for the PMO Dashboard integration. It freezes the unified database shape for Phase 2 migration generation only. It does not implement schema changes.

## 1. Scope And Source Rules

### Repositories reviewed

| Repository | Branch | Role |
|---|---|---|
| PMO-dashboard-v0.1 | Claude.ver | Reference repository for Memo, Budget vs Actual, License Management, Device Management |
| PMO_ERP | Memo&Budget | Implementation repository and canonical base for Resource Management, Settings, shared shell, and migration structure |

### Integration documents reviewed

| Document | Role in this plan |
|---|---|
| docs/INTEGRATION/IMPLEMENTATION_ROADMAP.md | Highest-priority roadmap source reviewed from the PMO_ERP `Memo&Budget` branch. |
| docs/INTEGRATION/INTEGRATION_AUDIT_REPORT.md | Confirms module ownership and final architecture direction. |
| docs/INTEGRATION/DATABASE_MIGRATION_PLAN.md | Defines additive, backup-first migration order and shared-master reconciliation rules. |
| docs/INTEGRATION/DATA_CONTRACT.md | Defines shared data ownership principles and open decisions to close in this contract. |

### Non-negotiable decisions carried forward

- PMO_ERP is the implementation base.
- PMO_ERP Resource Management and Settings are preserved.
- PMO-dashboard-v0.1 is the source of truth for Memo, Budget vs Actual, License Management, and Device Management workflow schema needs.
- Database B / PMO_ERP schema is the base to extend.
- Phase 2 must be additive only: create missing tables, add missing columns, add indexes, add foreign keys where safe, and preserve legacy fields during transition.

## 2. Canonical Naming Convention

| Object | Convention |
|---|---|
| Schema | `public` |
| Table names | Lowercase snake_case plural nouns, except existing accepted names that are already canonical (`settings`, `resource_master`, `project_code_master`) |
| Primary keys | Preserve current table-specific key type; do not mass-convert IDs in Phase 2 |
| Foreign keys | `{referenced_entity_singular}_id`, e.g. `organization_project_id`, `resource_master_id`, `requester_profile_id` |
| Legacy compatibility fields | Keep current text fields such as `project`, `owner`, `requester_name`, `memo_no`, and `memo_ref` until application code is fully migrated |
| Timestamps | `created_at`, `updated_at`, lifecycle-specific timestamps such as `approved_at`, `voided_at`, `deleted_at` |
| Audit fields | `created_by`, `updated_by`, `deleted_by`, `voided_by`, plus `audit_log jsonb` where module behavior already depends on append-only activity |
| JSON detail fields | Use JSONB for structured memo line items and compatibility state already represented as arrays/objects |
| Status values | Lowercase machine values in new fields. Preserve existing mixed-case legacy values where already stored, such as `project_code_master.status = 'Active'`. |

## 3. Final Canonical Tables

### Shared master and configuration tables

| Final table | Source of truth | Primary key | Purpose | Phase 2 action |
|---|---|---|---|---|
| `organization_projects` | PMO_ERP | `id text` | Canonical shared project master used by all modules | Preserve |
| `project_code_master` | PMO_ERP | `id text` | Project code master and project-code metadata | Preserve and use as project-code child of `organization_projects` |
| `user_profiles` | PMO-dashboard-v0.1 workflow evidence, required by both repos | `id bigint` | Canonical user/profile master for approvers, requesters, PMO users, license/device/resource assignment | Create if missing, then preserve |
| `authority_limits` | PMO-dashboard-v0.1 Settings evidence, also called by PMO_ERP app shell | Composite `title, memo_type` | Approval authority by title and memo type | Create if missing |
| `settings` | PMO_ERP | `id text` | Settings/configuration document store and transition compatibility store | Preserve |
| `budget_pools` | PMO-dashboard-v0.1 Budget workflow evidence, PMO_ERP code dependency | `id text` | Canonical Budget Pool master managed from Budget Settings and used by BvA/Actual Spend | Create if missing |
| `resource_master` | PMO_ERP | `id text` | Canonical resource/employee directory | Preserve |

### Module transaction tables

| Final table | Source of truth | Primary key | Purpose | Phase 2 action |
|---|---|---|---|---|
| `memos` | PMO-dashboard-v0.1 workflow, baseline exists in PMO_ERP | `id text`, with unique `memo_no text` | Memo lifecycle, memo details, approval, void/soft-delete, memo-derived license/device/budget sources | Preserve and add canonical shared-master references |
| `budget_manual_expenses` | Both repos have matching migration | `id text` | Historical/manual actual spend records | Preserve and add canonical project reference |
| `infra_costs` | PMO-dashboard-v0.1/PMO_ERP Budget module code dependency | `id text` | Monthly infrastructure cost lines used by Budget vs Actual | Create if missing |
| `licenses` | PMO-dashboard-v0.1 License module | `id text` | Manual/other license inventory; memo-derived license inventory remains derived from `memos.sl_items` | Create if missing |
| `license_user_assignments` | Derived from PMO-dashboard-v0.1 License user mapping behavior | `id text` | Durable normalized user-license assignment/override records replacing long-term settings blobs | Create if missing |
| `devices` | PMO-dashboard-v0.1 Device module | `id bigint generated identity` | Device registry | Create if missing and add missing PMO-dashboard-v0.1 columns |
| `purchase_orders` | PMO-dashboard-v0.1 Device module | `id text` | Hardware memo purchase order and arrival tracking | Create if missing and add missing PMO-dashboard-v0.1 columns |
| `resource_requests` | PMO_ERP | `id text` | Resource request workflow | Preserve |
| `resource_project_codes` | PMO_ERP | `id uuid` | Resource-to-project-code assignment records | Preserve |

## 4. Tables To Preserve From PMO_ERP

These tables are canonical as-is and must not be replaced by Repository A versions.

| Table | Evidence | Required preservation notes |
|---|---|---|
| `settings` | PMO_ERP baseline migration | Preserve as configuration store. It may temporarily hold `sl-budgets`, license review state, and license override state, but those should not be the long-term canonical transaction model. |
| `resource_requests` | PMO_ERP baseline and resource module migrations | Preserve all existing columns and indexes. Add only shared-master references if needed. |
| `resource_master` | PMO_ERP resource master migration | Preserve as canonical resource directory. |
| `resource_project_codes` | PMO_ERP resource project-code assignment migration | Preserve as canonical resource allocation/project-code bridge. |
| `project_code_master` | PMO_ERP project-code master migration | Preserve as canonical project-code master. |
| `organization_projects` | PMO_ERP organization project migration | Preserve as canonical project master. |

## 5. Tables To Preserve From PMO-dashboard-v0.1

These are module schemas or schema requirements from Repository A and must be carried into PMO_ERP.

| Table | Evidence | Required preservation notes |
|---|---|---|
| `memos` | PMO-dashboard-v0.1 memo lifecycle and app mapping | Preserve stronger memo lifecycle fields: approval, void, soft delete, structured detail restore fields, metadata. PMO_ERP already has most migrations. |
| `budget_manual_expenses` | Matching budget migration in both repos | Preserve manual actual spend table and audit behavior. |
| `budget_pools` | Budget module reads/writes Supabase `budget_pools`; migration patches it but no baseline create exists | Create baseline table in PMO_ERP. |
| `infra_costs` | Budget module reads `infra_costs`; no baseline create exists | Create baseline table in PMO_ERP. |
| `licenses` | Reference license module reads/writes Supabase `licenses` | Create baseline table in PMO_ERP. |
| `devices` | Reference device module reads/writes Supabase `devices` | Create baseline table in PMO_ERP. |
| `purchase_orders` | Reference device module reads/writes Supabase `purchase_orders` | Create baseline table in PMO_ERP. |
| `user_profiles` | Reference Settings and memo approval migrations depend on it | Create baseline table if absent. |
| `authority_limits` | Reference Settings and PMO_ERP app shell read it | Create baseline table if absent. |

## 6. Missing Baseline Tables

The following tables are referenced by migrations or application data paths but do not have a baseline `create table` migration in PMO_ERP.

| Missing table | Required baseline columns | Primary key and constraints |
|---|---|---|
| `user_profiles` | `id`, `full_name`, `title`, `name_aliases`, `email`, `is_approver`, `can_review`, `can_approve`, `is_pmo`, `is_active`, `created_at`, `updated_at` | `id bigint generated identity primary key`; unique `full_name`; optional unique lower email where email is not blank |
| `authority_limits` | `title`, `memo_type`, `limit_thb`, `created_at`, `updated_at` | Composite primary key or unique key on `(title, memo_type)` because code upserts with `on_conflict=title,memo_type`; `memo_type` in `sl, hw, int, ent, dep` |
| `budget_pools` | `id`, `project`, `organization_project_id`, `name`, `budget`, `year`, `start_month`, `end_month`, `memo_types`, `created_at`, `updated_at`, `created_by`, `updated_by` | `id text primary key`; FK `organization_project_id` to `organization_projects(id)`; `budget >= 0`; `memo_types jsonb default []` |
| `infra_costs` | `id`, `project`, `organization_project_id`, `program`, `monthly_cost`, `start_month`, `end_month`, `created_at`, `updated_at`, `created_by`, `updated_by` | `id text primary key`; FK `organization_project_id` to `organization_projects(id)`; `monthly_cost >= 0`; month values use `YYYY-MM` text |
| `licenses` | `id`, `name`, `plan`, `vendor`, `seats`, `price_per_month`, `owner`, `owner_profile_id`, `department`, `project`, `organization_project_id`, `license_type`, `purchase_date`, `expiry`, `billing_freq`, `status_override`, `memo_no`, `note`, `source`, `created_at`, `updated_at`, `created_by`, `updated_by` | `id text primary key`; FK `organization_project_id`; FK `owner_profile_id`; FK `memo_no` to `memos(memo_no)` set null; `source` default `manual`; `seats > 0`; `price_per_month >= 0` |
| `license_user_assignments` | `id`, `license_id`, `license_name`, `license_plan`, `user_profile_id`, `email`, `project`, `organization_project_id`, `source`, `source_memo_no`, `active`, `review_status`, `imported_at`, `created_at`, `updated_at`, `created_by`, `updated_by`, `audit_log` | `id text primary key`; nullable FK `license_id`; nullable FK `user_profile_id`; FK `organization_project_id`; FK `source_memo_no` to `memos(memo_no)` set null; unique active assignment should be enforced on normalized identity after data review |
| `devices` | `id`, `name`, `brand`, `platform`, `type`, `serial`, `asset_tag`, `pbx_number`, `owner`, `owner_profile_id`, `position`, `assigned_date`, `project`, `organization_project_id`, `company`, `return_date`, `warranty`, `qa_owner`, `os_version`, `photo_url`, `status`, `memo_ref`, `purchase_order_id`, `note`, `source`, `deleted`, `deleted_at`, `deleted_by`, `audit_log`, `created_at`, `updated_at`, `created_by`, `updated_by` | `id bigint generated identity primary key`; FK `owner_profile_id`; FK `organization_project_id`; FK `memo_ref` to `memos(memo_no)` set null; FK `purchase_order_id` to `purchase_orders(id)` set null; default `status = 'not_identified'` |
| `purchase_orders` | `id`, `memo_no`, `project`, `organization_project_id`, `item_name`, `ordered_qty`, `arrived_qty`, `status`, `note`, `audit_log`, `created_at`, `updated_at`, `created_by`, `updated_by` | `id text primary key`; FK `memo_no` to `memos(memo_no)` set null; FK `organization_project_id`; `ordered_qty > 0`; `arrived_qty >= 0`; `arrived_qty <= ordered_qty` |

## 7. Missing Columns In Existing PMO_ERP Tables

### Columns missing from PMO_ERP compared with Repository A

| Table | Missing columns | Source |
|---|---|---|
| `devices` | `deleted`, `deleted_at`, `deleted_by`, `audit_log` | PMO-dashboard-v0.1 migration `20260703180000_device_registry_m3b.sql` |
| `purchase_orders` | `audit_log` | PMO-dashboard-v0.1 migration `20260703180000_device_registry_m3b.sql` |

### Canonical shared-master reference columns to add additively

These are required to complete the unified contract while preserving legacy text columns.

| Table | Add column | References | Keep compatibility field |
|---|---|---|---|
| `memos` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `budget_pools` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `budget_manual_expenses` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `infra_costs` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `licenses` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `licenses` | `owner_profile_id bigint` | `user_profiles(id)` | Keep `owner` |
| `license_user_assignments` | `user_profile_id bigint` | `user_profiles(id)` | Keep `email` |
| `license_user_assignments` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `devices` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `devices` | `owner_profile_id bigint` | `user_profiles(id)` | Keep `owner` |
| `devices` | `purchase_order_id text` | `purchase_orders(id)` | Keep local/cache `purchaseOrderId` mapping |
| `purchase_orders` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |
| `resource_requests` | `organization_project_id text` | `organization_projects(id)` | Keep `project` |

## 8. Foreign Key Relationships

| From table.column | To table.column | Delete behavior | Notes |
|---|---|---|---|
| `project_code_master.organization_project_id` | `organization_projects.id` | Set null | Already present in PMO_ERP migration. |
| `resource_master.organization_project_id` | `organization_projects.id` | Set null | Already present in PMO_ERP migration. |
| `resource_requests.organization_project_id` | `organization_projects.id` | Set null | Add to complete Resource-to-project master alignment. |
| `resource_requests.resource_master_id` | `resource_master.id` | Set null | Already present in PMO_ERP migration. |
| `resource_project_codes.resource_request_id` | `resource_requests.id` | Cascade | Already present in PMO_ERP migration. |
| `resource_project_codes.project_code_id` | `project_code_master.id` | Set null | Already present in PMO_ERP migration. |
| `resource_project_codes.resource_master_id` | `resource_master.id` | Set null | Already present in PMO_ERP migration. |
| `memos.requester_profile_id` | `user_profiles.id` | Set null | Already required by memo workflow migration. |
| `memos.current_approver_profile_id` | `user_profiles.id` | Set null | Already required by memo workflow migration. |
| `memos.source_memo_no` | `memos.memo_no` | Set null | Already required by memo workflow migration. |
| `memos.organization_project_id` | `organization_projects.id` | Set null | Add in Phase 2. |
| `memos.budget_pool_id` | `budget_pools.id` | Set null | Add FK after `budget_pools` exists; column already exists. |
| `budget_pools.organization_project_id` | `organization_projects.id` | Set null | Add in baseline table. |
| `budget_manual_expenses.budget_pool_id` | `budget_pools.id` | Set null | Already in manual expense migration but blocked until `budget_pools` exists. |
| `budget_manual_expenses.organization_project_id` | `organization_projects.id` | Set null | Add in Phase 2. |
| `infra_costs.organization_project_id` | `organization_projects.id` | Set null | Add in baseline table. |
| `licenses.organization_project_id` | `organization_projects.id` | Set null | Add in baseline table. |
| `licenses.owner_profile_id` | `user_profiles.id` | Set null | Add in baseline table. |
| `licenses.memo_no` | `memos.memo_no` | Set null | Add in baseline table for manual rows linked to a memo. |
| `license_user_assignments.license_id` | `licenses.id` | Set null | Nullable because memo-derived licenses may not be stored as rows. |
| `license_user_assignments.user_profile_id` | `user_profiles.id` | Set null | Keep email for unmatched imports. |
| `license_user_assignments.organization_project_id` | `organization_projects.id` | Set null | Add in baseline table. |
| `license_user_assignments.source_memo_no` | `memos.memo_no` | Set null | Required for memo-derived assignment traceability. |
| `devices.owner_profile_id` | `user_profiles.id` | Set null | Add in baseline table. |
| `devices.organization_project_id` | `organization_projects.id` | Set null | Add in baseline table. |
| `devices.memo_ref` | `memos.memo_no` | Set null | Add in baseline table. |
| `devices.purchase_order_id` | `purchase_orders.id` | Set null | Required to preserve the PO-arrival-to-device relationship currently held in app cache as `purchaseOrderId`. |
| `purchase_orders.memo_no` | `memos.memo_no` | Set null | Add in baseline table. |
| `purchase_orders.organization_project_id` | `organization_projects.id` | Set null | Add in baseline table. |

## 9. Shared Master Tables

| Master | Canonical table | Used by | Mapping rule |
|---|---|---|---|
| Projects | `organization_projects` | Memo, BvA, License, Device, Resource, Settings | Match by normalized `name`, `code`, or legacy `project` text. Store FK while retaining legacy text. |
| Project codes | `project_code_master` | Resource Management and project-code assignment | Child of `organization_projects`; `project_code` remains unique. |
| Users / profiles | `user_profiles` | Memo approval, License assignment, Device ownership, Resource assignment, Settings | Match by email first, then normalized full name/name aliases. |
| Roles / permissions | `user_profiles` flags plus `authority_limits` | Settings, Memo approval, PMO access | Keep `is_pmo`, `can_review`, `can_approve`, `is_active`; authority by title and memo type in `authority_limits`. |
| Budget pools | `budget_pools` | Settings/Budget Settings, Budget vs Actual, Actual Spend, Memo tagging | Match by `id`; fallback by project, name, year, start/end month, memo types. |
| Resources | `resource_master` | Resource Management and project staffing | Match by employee code first, then resource name. |

## 10. Module Transaction Contracts

### Memo

Canonical table: `memos`

Source of truth: PMO-dashboard-v0.1 workflow with PMO_ERP baseline table and migrations.

Required contract:

- Preserve `memo_no` as the business unique key.
- Preserve `id text` for compatibility, normally mirroring `memo_no`.
- Preserve lifecycle fields: `status`, `submitted_at`, `approved_at`, `rejected_at`, `cancelled_at`, `voided_at`, `deleted`, `deleted_at`.
- Preserve approval fields: requester/reviewer/approver names, titles, dates, `requester_profile_id`, `current_approver_profile_id`, `self_reviewed_at`, `source_memo_no`, `approval_chain`, `approvers`, `approval_note`, `rejection_reason`.
- Preserve structured details: `sections`, `sl_items`, `hw_items`, `acct_cols`, `acct_rows`, `int_names`, `dep_items`.
- Add `organization_project_id` and preserve `project`.
- Add FK on `budget_pool_id` to `budget_pools(id)` after `budget_pools` exists.

### Budget vs Actual

Canonical tables: `budget_pools`, `budget_manual_expenses`, `infra_costs`, `memos`

Source of truth: PMO-dashboard-v0.1 Budget module behavior plus matching PMO_ERP budget migrations.

Required contract:

- `budget_pools` is the canonical budget target table, not `settings.sl-budgets`.
- `budget_manual_expenses` is the canonical manual/historical actual spend table.
- Approved memos remain an actual-spend source; no separate persisted actual-spend table is evidenced as necessary in Phase 1.
- `infra_costs` stores monthly infrastructure spend lines used in BvA.
- Add `organization_project_id` to all budget transaction/master tables but retain legacy `project`.

### License Management

Canonical tables: `licenses`, `license_user_assignments`, `memos`, `settings` during transition only.

Source of truth: PMO-dashboard-v0.1 License module.

Required contract:

- `licenses` stores manual/other license inventory. The current reference module reads `source=manual` from Supabase.
- Memo-derived license inventory is derived from completed SL memos and `memos.sl_items`; do not duplicate all memo-derived licenses into `licenses` during Phase 2 unless a later migration explicitly needs materialization.
- `license_user_assignments` normalizes user-license assignment, import, review, and override state currently represented by settings rows such as `lic-user-overrides`, `lic-user-manual-rows`, and `lic-user-review-status`.
- Keep `settings` rows for compatibility until application code is migrated to normalized assignment reads/writes.

### Device Management

Canonical tables: `purchase_orders`, `devices`, `memos`

Source of truth: PMO-dashboard-v0.1 Device module and missing M3B migration.

Required contract:

- Hardware memo approval creates `purchase_orders`.
- Purchase order arrival creates `devices`.
- `purchase_orders.memo_no` and `devices.memo_ref` reference `memos.memo_no`.
- `devices.purchase_order_id` must reference the purchase order row that created the device when the device came from PO arrival.
- Device registry uses soft delete: `deleted`, `deleted_at`, `deleted_by`.
- Device and PO audit trails use `audit_log jsonb`.
- Device photo storage bucket `device-photos` and object policies are part of deployment/migration support, but this document freezes table schema only.

### Resource Management

Canonical tables: `resource_master`, `resource_requests`, `resource_project_codes`, `project_code_master`, `organization_projects`

Source of truth: PMO_ERP.

Required contract:

- Preserve all existing PMO_ERP resource tables.
- Add `resource_requests.organization_project_id` to complete shared project linkage.
- Preserve existing resource text fields and JSON fields during compatibility period.

### Settings

Canonical table: `settings`

Source of truth: PMO_ERP.

Required contract:

- Preserve `settings(id text primary key, data jsonb, updated_at timestamptz)`.
- Keep settings as configuration and transition compatibility storage.
- Do not use settings blobs as the final canonical home for budget pools, users, resource master, device registry, purchase orders, or durable license assignment records.

## 11. Tables That Should Not Be Migrated As Canonical Tables

| Data/table-like source | Reason |
|---|---|
| Browser localStorage keys such as `orbit-pmo-memos-v1`, `orbit-pmo-licenses-v1`, `orbit-pmo-devices-v1`, `orbit-pmo-po-v1`, `orbit-pmo-budget-pools-v1`, `orbit-pmo-settings-v1` | Offline/cache compatibility only; not canonical database schema. |
| `settings` row `sl-budgets` | Superseded by canonical `budget_pools`. Keep temporarily only if existing code still reads it. |
| `settings` row `budgets` | Legacy pending/budget compatibility data; not the final BvA source. |
| `settings` row `lic-user-overrides` | Normalize into `license_user_assignments`; keep temporarily for compatibility. |
| `settings` row `lic-user-manual-rows` | Normalize into `license_user_assignments`; keep temporarily for compatibility. |
| `settings` row `lic-user-review-status` | Normalize review state into `license_user_assignments.review_status`; keep temporarily for compatibility. |
| `settings` row `lic-settings` | Module preference/config row; keep in `settings`, but do not treat as transaction data. |
| Memo-derived license rows materialized into `licenses` | Current reference behavior derives these from completed SL memos. Duplicating them would create reconciliation risk. |
| Derived Actual Spend records stored only in memory/localStorage | Current canonical actual spend is calculated from memos, manual expenses, infra costs, and budget pools. Do not create an `actual_spend` table without a later explicit requirement. |

## 12. Tables Requiring Manual Review

| Table | Review needed before migration SQL is generated? | Reason |
|---|---|---|
| `license_user_assignments` | Yes | Existing behavior stores assignment/override/review state in settings JSON. The normalized table contract above is final, but transformation rules must be reviewed carefully before data migration. |
| `user_profiles` | Yes | Existing fallback users are embedded in app code; any real database rows must be reconciled by email/name. |
| `authority_limits` | Yes | Authority is keyed by title and memo type. Confirm whether title text is stable enough as a long-term key before adding stricter constraints beyond `(title, memo_type)`. |
| `devices` | Yes | The reference code assumes `id bigint generated identity`, while local fallback IDs use `dev_...` strings. Migration must distinguish Supabase IDs from local fallback IDs and preserve the local `purchaseOrderId` relationship as `purchase_order_id` where available. |
| `purchase_orders` | Yes | IDs are generated from memo number, line index, and item name. Existing local IDs should be checked for length and special characters before migration. |
| `budget_pools` | Yes | Existing pool identity may come from import/localStorage. Reconcile by `id` first, then project/name/year/start/end/memo_types. |
| `infra_costs` | Yes | No migration baseline exists; local data may exist in old object format and must be normalized into rows. |

## 13. Additive-Only Migration Strategy

Phase 2 must generate SQL in this order:

1. Confirm backups exist for both source databases before applying generated SQL anywhere.
2. Create missing shared baseline tables: `user_profiles`, `authority_limits`.
3. Create missing budget baseline tables: `budget_pools`, `infra_costs`.
4. Create missing license baseline tables: `licenses`, `license_user_assignments`.
5. Create missing device baseline tables: `devices`, `purchase_orders`.
6. Add missing Repository A columns to PMO_ERP tables, especially `devices` and `purchase_orders` audit/soft-delete columns.
7. Add canonical shared-master FK columns while preserving legacy text columns.
8. Add foreign keys only after required tables and columns exist.
9. Add indexes for FK columns, status filters, project filters, and current module query paths.
10. Enable RLS and grants following PMO_ERP's current PoC policy pattern unless auth policy work is explicitly included in a later phase.
11. Backfill `organization_project_id` from legacy `project` text using normalized match against `organization_projects.name` and `organization_projects.code`.
12. Backfill user/profile references from email first, then full name/name aliases.
13. Do not drop, rename, or tighten nullability in Phase 2.
14. Do not move data from settings JSON into normalized license assignment tables until the normalized schema is created and mapping rules are approved.

## 14. Required Indexes

| Table | Index |
|---|---|
| `organization_projects` | Unique lower `code`; status index already exists |
| `project_code_master` | Existing `project`, `status`, `organization_project_id` indexes |
| `user_profiles` | Unique `full_name`; lower email index where email is not null; `is_active`; `can_review`; `can_approve`; `is_pmo` |
| `authority_limits` | Unique `(title, memo_type)` |
| `memos` | Existing status/updated and project indexes; add `organization_project_id`, `budget_pool_id`, `requester_profile_id`, `current_approver_profile_id`, `memo_no` unique |
| `budget_pools` | `organization_project_id`, `project`, `year`, `(project, name)`, and optionally `(organization_project_id, name, year)` |
| `budget_manual_expenses` | Existing project/date, pool, reference indexes; add `organization_project_id` |
| `infra_costs` | `organization_project_id`, `project`, `program`, month range helper index on `start_month, end_month` |
| `licenses` | `source`, `organization_project_id`, `owner_profile_id`, `memo_no`, `expiry`, `status_override`, lower `name` |
| `license_user_assignments` | `user_profile_id`, lower `email`, `license_id`, `organization_project_id`, `source_memo_no`, `active`, `review_status` |
| `devices` | `organization_project_id`, `owner_profile_id`, `memo_ref`, `status`, `deleted`, `serial`, `asset_tag` |
| `devices` | `purchase_order_id` |
| `purchase_orders` | `memo_no`, `organization_project_id`, `status`, `created_at` |
| `resource_master` | Existing employee code, status, team, name, organization project indexes |
| `resource_requests` | Existing status/updated, project, resource master indexes; add `organization_project_id` |
| `resource_project_codes` | Existing resource, project code, project, date, resource master indexes |

## 15. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Missing baseline tables are only implied by code/migrations | Phase 2 could create incompatible columns if mappings are ignored | Use the column contracts in this document as the baseline. |
| Project identity conflicts across legacy `project` text | Cross-module reports may split the same project | Backfill via `organization_projects` and retain legacy text for validation. |
| User identity conflicts across name/email/alias | Approvals, license assignments, and device ownership may map to wrong users | Match email first; only use names/aliases with manual review. |
| License assignment state is currently JSON/settings-backed | Data loss or duplicate assignments during normalization | Create `license_user_assignments` first, then migrate settings rows in a later controlled data phase. |
| Device IDs differ between Supabase identity and local fallback IDs | Existing imported/local device records may not map cleanly | Preserve `_supaId` mapping during data migration; do not force text fallback IDs into bigint identity. |
| Budget pools are used by memos and manual expenses | Deleting or remapping pools could orphan budget history | Add FK set null, validate blockers before delete behavior changes. |
| Current RLS is PoC permissive | Security is not production-ready | Keep current behavior for schema convergence; schedule auth/RLS hardening separately. |
| Settings remains both config and transition store | Temporary duplication may persist | Mark non-canonical settings rows and plan app migration to normalized tables. |

## 16. Blockers

| Blocker | Blocks |
|---|---|
| Approval of this schema contract | Any SQL migration generation |
| No baseline `create table` contract for missing tables outside this document | Phase 2 migration generation |
| Unreconciled project master mapping | Transaction data migration and reliable cross-module reports |
| Unreconciled user/profile mapping | Memo approval integrity, license assignment, device ownership |
| Unreviewed license settings JSON transformation | Migration from settings-backed license assignment state to normalized rows |
| Lack of database backups | Any migration execution |

## 17. Open Questions

The evidence is sufficient to freeze the schema contract for Phase 2. The following are not blockers to migration generation, but must be answered before data migration or stricter constraints:

| Question | Required before |
|---|---|
| Should `authority_limits.title` remain the long-term identity, or should it later reference a role/title master? | Auth/role hardening phase |
| Should memo-derived licenses ever be materialized into `licenses` for reporting performance, or remain derived from `memos.sl_items`? | Reporting optimization only |
| What final RLS model will replace the current PoC permissive policies? | Production auth phase |

## 18. Phase 2 Definition Of Ready

Phase 2 can generate SQL migrations from this document when:

- This document is approved.
- Phase 2 remains additive only.
- No existing application code, existing migration, Supabase project, or data is modified during approval.
- Missing baseline tables are generated exactly from the contracts above unless an approver explicitly changes this document first.
- Data migration remains separate from schema creation except safe FK backfill columns that can be populated later.
