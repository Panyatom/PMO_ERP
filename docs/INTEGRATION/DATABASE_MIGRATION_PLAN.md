# PMO Dashboard Database Migration Plan

## 1. Purpose

This document defines how to move from two separate Supabase databases into one unified database for the integrated PMO Dashboard.

The migration must be safe, reversible, and based on a confirmed data contract.

---

## 2. Current Database Situation

| Database | Connected Repository | Current Role |
|---|---|---|
| Database A | Repository A | Supports Memo, Budget vs Actual, License, Device |
| Database B | Repository B | Supports Resource, Settings, and partial integrated code |

The final database will be selected after audit.

---

## 3. Recommended Direction

Because Repository B is the integration base and Resource/Settings are accepted from Repository B, Database B is likely the preferred base database.

However, this must be confirmed after comparing:

- Schema completeness
- Current data quality
- Environment usage
- Vercel configuration
- Missing tables
- Missing columns
- Existing production-like data

---

## 4. Migration Principles

1. Backup both databases before any migration.
2. Audit schema before moving data.
3. Reconcile shared master data before migrating transactions.
4. Never migrate directly into production without testing.
5. Use staging tables when mapping is uncertain.
6. Preserve original IDs if possible.
7. Do not delete legacy fields until validation is complete.
8. Validate record counts after migration.
9. Validate relationships after migration.
10. Keep rollback notes for each migration step.

---

## 5. Migration Sequence

### Step 1: Backup

Backup:

- Database A schema
- Database A data
- Database B schema
- Database B data

No migration should start without backups.

---

### Step 2: Schema Audit

Compare both databases:

- Tables
- Columns
- Primary keys
- Foreign keys
- Indexes
- Views
- Functions
- Triggers
- RLS policies
- Storage buckets if any

Output:

- Missing tables
- Missing columns
- Conflicting fields
- Duplicate entities
- Required migration SQL

---

### Step 3: Environment Audit

Check:

- Supabase URL variable names
- Supabase anon key variable names
- Supabase service key usage if any
- Vercel environment variables
- Local `.env.example`
- Supabase client setup

Important:

Do not print real secret keys. Mask credentials.

---

### Step 4: Shared Master Reconciliation

Resolve final source of truth for:

- Projects
- Users
- Roles
- Settings
- Budget Pools

This must be done before migrating transaction data.

---

### Step 5: Schema Integration

Create migration SQL to add missing schema into the chosen unified database.

Rules:

- Prefer non-destructive migration.
- Use `create table if not exists`.
- Use `alter table add column if not exists`.
- Do not drop columns in the first migration.
- Do not rename columns unless mapping is fully confirmed.
- Keep compatibility fields if existing code still depends on them.

---

### Step 6: Data Mapping

Create a mapping table for every shared entity.

Required mapping examples:

| Entity | Source ID | Target ID | Mapping Rule |
|---|---|---|---|
| Project | TBD | TBD | Match by project code/name |
| User | TBD | TBD | Match by email |
| Budget Pool | TBD | TBD | Match by project, spend type, fiscal year/date |
| License | TBD | TBD | Match by license id/name |
| Device | TBD | TBD | Match by asset/device id |
| Memo | TBD | TBD | Preserve memo number if unique |

---

### Step 7: Data Migration Order

Migrate data in this order:

1. Projects
2. Users / User Profiles
3. Roles / Permissions
4. Settings
5. Budget Pools
6. Resources
7. Memos
8. Actual Spend / Manual Actual Spend
9. Licenses
10. Devices
11. Purchase Orders
12. Relationship / assignment tables

---

### Step 8: Validation

Validate:

- Record counts
- Required fields
- Null values
- Duplicate projects
- Duplicate users
- Budget Pool mapping
- Memo to Actual Spend mapping
- License assignment
- Device assignment
- Resource assignment
- Cross-module references

---

### Step 9: Application Connection

After schema and data are validated:

- Point integrated repository to the unified database.
- Update Vercel environment variables.
- Update local environment examples if needed.
- Confirm all scoped modules read/write from the same database.

---

### Step 10: Rollback Plan

Rollback must be possible if:

- Data mapping is incorrect
- Critical workflows fail
- Production build fails
- Migration creates duplicate master data
- Settings no longer feeds dependent modules

Rollback method:

- Restore database backup
- Revert environment variables
- Revert integration branch if needed
- Document failed migration step

---

## 6. Final Migration Definition of Done

Database migration is complete when:

- One database supports all final modules.
- Shared master data is not duplicated.
- Repository B connects successfully to the unified database.
- Settings data feeds dependent modules.
- Memo, BvA, License, Device, Resource, and Settings can read/write correctly.
- Cross-module tests pass.
- No high-risk data mapping blockers remain.
