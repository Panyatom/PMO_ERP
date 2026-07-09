# PMO Dashboard Shared Data Contract

## 1. Purpose

This document defines the final shared data contract for the integrated PMO Dashboard.

It exists to prevent modules from using duplicated, conflicting, or disconnected data sources.

The final system must ensure that each module knows exactly which table and field to read from or write to.

---

## 2. Data Ownership Principle

- Resource Management data should follow Repository B.
- Settings data should follow Repository B.
- Memo, Budget vs Actual, License, and Device data should follow Repository A.
- Shared master data must be reconciled and used consistently by all modules.

---

## 3. Shared Entity Ownership

| Entity | Final Owner | Final Table | Used By | Status |
|---|---|---|---|---|
| Projects | TBD | TBD | Memo, BvA, License, Device, Resource, Settings | Must reconcile |
| Users / User Profiles | TBD | TBD | All modules | Must reconcile |
| Roles / Permissions | TBD | TBD | Settings, Memo approval, module access | Must reconcile |
| Settings | Repository B | TBD | All modules | Use Repository B as base |
| Budget Pools | TBD | TBD | Settings, Budget vs Actual, Actual Spend mapping | Must reconcile |
| Resources | Repository B | TBD | Resource Management, project staffing | Use Repository B as base |
| Memos | Repository A | TBD | Memo, Actual Spend, Budget vs Actual | Use Repository A as base |
| Actual Spend | Repository A | TBD | Actual Spend, Budget vs Actual, Reports | Use Repository A as base |
| Manual Actual Spend | Repository A | TBD | Actual Spend, Budget vs Actual | Use Repository A as base |
| Licenses | Repository A | TBD | License Management, Memo, Users | Use Repository A as base |
| Devices | Repository A | TBD | Device Management, Purchase Order, Users | Use Repository A as base |
| Purchase Orders | Repository A | TBD | Device Management, Memo | Use Repository A as base |

---

## 4. Required Cross-Module Data Flow

### Settings to Other Modules

Settings must provide shared configuration for:

- Projects
- Users
- Roles
- Budget Pools
- License categories if applicable
- Device categories if applicable
- Resource settings if applicable

### Projects

Project data must be shared by:

- Memo
- Budget vs Actual
- License Management
- Device Management
- Resource Management
- Settings

Rule:

Each project should have one canonical project identifier.

### Users

User data must be shared by:

- Memo requester / approver
- License assignment
- Device assignment
- Resource Management
- Roles and permissions

Rule:

Each user should have one canonical user identifier.

### Budget Pools

Budget Pool data must connect:

- Settings
- Actual Spend
- Budget vs Actual

Rule:

Budget Pool must be managed from Settings but used by Budget vs Actual.

---

## 5. Field Mapping Template

Use this table during database audit.

| Repository A Field | Repository B Field | Final Field | Final Table | Mapping Rule | Risk |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD |

---

## 6. Field Classification Rules

Classify every field into one of these groups:

| Classification | Meaning | Action |
|---|---|---|
| Same name, same meaning | Both repos use the field the same way | Keep |
| Same name, different meaning | Field name overlaps but business meaning differs | Rename or transform |
| Different name, same meaning | Equivalent fields with different names | Map to one final field |
| Exists only in Repository A | Needed by A modules only | Add to unified schema if still required |
| Exists only in Repository B | Needed by B modules only | Keep if still required |
| Deprecated | No longer used by final modules | Keep temporarily, remove only after validation |

---

## 7. Data Contract Rules

1. Do not allow duplicate project masters.
2. Do not allow duplicate user masters.
3. Do not let Settings write to one table while other modules read from another.
4. Budget Pool must have one canonical source.
5. Memo and Actual Spend must use the same project and spend type mapping.
6. License and Device must use the same user/project reference as Resource and Memo.
7. Any field transformation must be documented before data migration.
8. Any uncertain mapping must be treated as a blocker.

---

## 8. Open Decisions

| Decision | Status | Notes |
|---|---|---|
| Final projects table | Open | Must decide after database audit |
| Final users table | Open | Must decide after database audit |
| Final roles table | Open | Must decide after database audit |
| Final settings table | Open | Repository B likely base |
| Final budget_pools table | Open | Must support BvA and Settings |
| Final unified database | Open | Must decide after database audit |
