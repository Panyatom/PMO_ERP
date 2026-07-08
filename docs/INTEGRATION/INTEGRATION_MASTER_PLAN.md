# PMO Dashboard Integration Master Plan

## 1. Objective

This document defines the final integration approach for merging two PMO Dashboard repositories and two Supabase databases into one unified system.

The goal is to preserve the best working modules from each repository while ensuring that all modules share one consistent data model and one unified database.

---

## 2. Current Situation

There are currently two repositories and two databases.

### Repository A: User Repository

Repository A contains the latest working implementation for:

- Memo
- Budget vs Actual
- License Management
- Device Management

### Repository B: Teammate Repository

Repository B is the current integrated base repository. It already includes:

- Resource Management
- Settings
- Partial merge of Repository A

Resource Management and Settings in Repository B are accepted as the base implementation.

### Database A

Database A is used by Repository A.

### Database B

Database B is used by Repository B.

The final system must use one unified database.

---

## 3. Final Module Ownership

| Module | Final Source of Truth |
|---|---|
| Resource Management | Repository B |
| Settings | Repository B |
| Memo | Repository A |
| Budget vs Actual | Repository A |
| License Management | Repository A |
| Device Management | Repository A |
| Shared Master Data | To be reconciled |
| Database Schema | Unified final schema |
| Production Database | To be selected after audit |

---

## 4. Integration Strategy

Repository B should be treated as the base repository because Resource Management and Settings are accepted as the latest working version.

The integration work should focus on checking whether the modules from Repository A were fully and correctly merged into Repository B.

The main audit scope is:

- Memo
- Budget vs Actual
- License Management
- Device Management
- Shared UI components used by those modules
- Database usage and data flow across all related modules

Resource Management and Settings do not need a full functional audit, but they must be checked for data dependencies because Settings must feed other modules.

---

## 5. Scope

### In Scope

- Repository integration audit
- Database audit
- Shared data contract
- Schema reconciliation
- Data migration planning
- Code integration for missing Repository A modules
- Cross-module testing
- Environment alignment

### Out of Scope

- Full redesign
- New feature development
- Rebuilding Resource Management
- Rebuilding Settings
- Auditing unrelated tabs
- Changing accepted behavior unless required for integration

---

## 6. Core Integration Rules

1. Do not modify code during audit.
2. Do not migrate data before schema reconciliation.
3. Do not delete or rename database fields until the final mapping is approved.
4. Preserve Resource Management and Settings from Repository B.
5. Preserve Memo, Budget vs Actual, License Management, and Device Management from Repository A.
6. Settings must become the shared configuration source for all related modules.
7. Master data must not be duplicated across modules.
8. All database credentials must remain masked and must never be printed in logs or documentation.
9. The final system must run from one repository and one database.
10. Any uncertain data mapping must be documented before implementation.

---

## 7. Required Integration Phases

### Phase 1: Repository Audit

Goal: Check what is missing or changed in Repository B compared with Repository A.

Focus areas:

- Memo
- Budget vs Actual
- License Management
- Device Management
- Shared components
- Routing
- Modals
- Tables
- Filters
- Detail drill-down
- Export behavior
- Add/Edit/Delete behavior

Output:

- Feature gap list
- Component gap list
- UX/UI mismatch list
- Recommended source of truth by file/module
- Risk level by item

---

### Phase 2: Database Audit

Goal: Understand how both repositories connect to their databases and what schema each module expects.

Check:

- Supabase client config
- Environment variable names
- Table names used in code
- SQL files
- Migration files
- Seed files
- Select/insert/update/delete calls
- Required columns
- Shared master data
- Database-specific assumptions

Output:

- Database A schema summary
- Database B schema summary
- Table/field differences
- Shared master data candidates
- Migration risks
- Recommended unified database base

---

### Phase 3: Shared Data Contract

Goal: Define which table and field each module should use in the final system.

Required shared entities:

- Projects
- Users
- Roles
- Settings
- Budget Pools
- Resources
- Memos
- Actual Spend
- Licenses
- Devices
- Purchase Orders

Output:

- Final table ownership
- Final field mapping
- Relationship mapping
- Data flow mapping

---

### Phase 4: Schema Integration

Goal: Create the unified database schema.

Rules:

- Add missing schema safely.
- Use migration files.
- Avoid destructive changes.
- Use `create table if not exists` where appropriate.
- Use `add column if not exists` where appropriate.
- Keep compatibility fields until migration is verified.

Output:

- Unified migration SQL
- Schema validation checklist
- Rollback notes

---

### Phase 5: Code Integration

Goal: Patch Repository B so the accepted Repository A modules work correctly inside the integrated repository.

Order:

1. Shared components
2. Memo
3. Budget vs Actual
4. License Management
5. Device Management
6. Settings data connection
7. Resource data connection
8. Environment alignment

Output:

- Integrated branch
- Passing build
- No broken routes
- Modules connected to unified schema

---

### Phase 6: Data Migration

Goal: Move required data into the unified database.

Order:

1. Backup both databases.
2. Migrate master data.
3. Migrate transaction data.
4. Validate relationships.
5. De-duplicate records.
6. Verify sample records.

Output:

- Migration result
- Record count comparison
- Relationship validation
- Data issue log

---

### Phase 7: System Testing

Goal: Verify that all scoped modules work together.

Test flows:

- Settings -> Memo
- Settings -> Budget vs Actual
- Settings -> License Management
- Settings -> Device Management
- Resource -> Shared master data
- Memo approval -> Actual Spend / BvA
- Budget Pool -> BvA mapping
- Device -> Purchase Order
- License -> User/project assignment

Output:

- QA checklist
- Test result
- Known issues
- Production readiness decision

---

## 8. Definition of Done

Integration is complete when:

- Repository B contains the accepted final modules.
- Resource and Settings remain from Repository B.
- Memo, Budget vs Actual, License, and Device match Repository A behavior.
- The app uses one unified database.
- Shared master data is not duplicated.
- Settings feed the modules that depend on it.
- All scoped pages can read and write data correctly.
- Key cross-module workflows are tested.
- Build passes.
- No high-risk migration blockers remain.
