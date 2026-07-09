# PMO Dashboard Integration Audit Report

## 1. Executive Summary

- Overall integration objective: converge the two PMO Dashboard repositories and their Supabase-backed data layers into one unified implementation with one consistent database model.
- Current status: repository and database analysis are complete. The main integration direction is now clear, and the implementation phase can proceed from a documented blueprint rather than a fresh audit.
- Final architecture direction: use Repository B as the implementation base and preserve its resource and settings foundation, while retaining Repository A’s stronger implementation for memo, budget vs actual, license, and device workflows. Shared master data must be reconciled into a single canonical model before transaction data is migrated.

## 2. Repository Overview

### PMO-dashboard-v0.1
- Purpose: reference implementation for the PMO dashboard experience, with stronger coverage for memo, budget vs actual, license, and device workflows.
- Branch used: Claude.ver
- Modules owned: Memo, Budget vs Actual, License Management, Device Management

### PMO_ERP
- Purpose: implementation target repository that already contains the integrated base for resource and settings workflows and is the preferred home for the final merged product.
- Branch used: Memo&Budget
- Modules owned: Resource Management, Settings, and the integrated application shell that will host the other modules

## 3. Module Ownership

| Module | Source of Truth | Reason | Merge Strategy |
|---|---|---|---|
| Memo | Repository A | It contains the stronger memo implementation and workflow evidence. | Preserve the Repository A workflow and align it to the unified schema. |
| Budget vs Actual | Repository A | It contains the stronger budget and actual-spend implementation. | Preserve the Repository A module logic and reconcile it to shared master data. |
| License Management | Repository A | It contains the stronger license workflow implementation. | Preserve the Repository A workflow and align it to shared user/project references. |
| Device Management | Repository A | It contains the stronger device workflow implementation. | Preserve the Repository A workflow and align it to shared user/project references. |
| Resource Management | Repository B | Repository B is the accepted base for resource management. | Preserve Repository B implementation and keep its resource model as the baseline. |
| Settings | Repository B | Repository B is the accepted base for settings. | Preserve Repository B implementation and use it as the shared configuration source. |

## 4. Repository Audit Summary

### Important findings
- Missing features: some Repository A modules appear to be only partially represented or not fully aligned in Repository B.
- Different features: Repository A is stronger for operational modules, while Repository B is stronger for shared master and resource-oriented workflows.
- Shared components: the application shell, navigation, and cross-module configuration points are shared across both repositories and should be reconciled around one implementation target.
- UX/UI differences: the two repositories differ in presentation and interaction patterns for the same business concepts; implementation should preserve accepted behavior rather than redesign for the sake of symmetry.
- Business logic differences: functional behavior differs in module-specific data handling, especially around how master entities are referenced. These differences must be normalized through a shared data contract rather than patched ad hoc.

## 5. Database Audit Summary

### Supabase configuration
- Both repositories are Supabase-based.
- Repository B already uses a migration-based schema structure under its Supabase migration folder and should be treated as the implementation base for the unified database work.
- Environment configuration should remain masked and should be handled through the existing deployment and local configuration patterns.

### Shared tables
- The final architecture should rely on a shared set of master entities rather than module-specific duplicates.
- The strongest candidates are project, user, role, settings, and resource-related masters.

### Missing tables
- Some schema elements required by the integrated workflows are not clearly evidenced as complete in the current repository baseline.
- These should be treated as implementation gaps until confirmed by the unified schema plan.

### Missing migrations
- The current evidence indicates that the schema evolution is not yet fully reconciled across the two repositories.
- Migration work should be deferred until the schema contract is approved.

### Missing columns
- Several fields needed by the integrated workflows are likely to require additions once the table contract is finalized.
- These should be documented and approved before any implementation change.

### Resource schema
- Resource-related data is more clearly anchored in Repository B and should be preserved as the baseline for resource management.

### Shared master candidates
- Projects
- Users / profiles
- Roles / permissions
- Settings
- Budget pools
- Resources

## 6. Final Unified Database Strategy

### Final table inventory
The final database should contain:
- Shared master tables for projects, users, roles, settings, budget pools, and resources
- Module-specific tables for memos, actual spend, licenses, devices, and related transaction data

### Table ownership
- Shared masters: reconciled centrally and used by all modules
- Resource and settings: anchored to Repository B as the accepted baseline
- Memo, budget, license, and device transactions: anchored to Repository A’s workflow logic and aligned to the shared model

### Shared masters
The shared masters are the first priority for canonicalization because they form the backbone of cross-module references.

### Module-specific tables
Module-specific tables should remain scoped to their respective business workflow and should depend on the shared master tables rather than maintaining their own duplicate identity systems.

## 7. Schema Convergence Summary

### Required new tables
- The implementation should add only the tables that are necessary for the unified model and are supported by the documented workflow needs.
- Any such table additions must be driven by the final approved contract rather than by repository-specific assumptions.

### Required new columns
- Existing tables may need additional columns for cross-module consistency, especially around shared references and lifecycle fields.
- Field additions must be justified by the shared data contract and by the workflow requirements already identified in analysis.

### Required field mappings
- Project references
- User references
- Role and permission references
- Settings references
- Budget pool references
- Resource references

### Migration principles
- Reconcile shared masters before moving transactions
- Preserve accepted behavior from both repositories where possible
- Avoid destructive changes during transition
- Keep unresolved mappings explicit and documented

## 8. Implementation Strategy

### Phase 1: Schema Integration
- Objective: establish the canonical ownership model and the shared master structure before any implementation work changes behavior.
- Risk: Low
- Definition of Done: shared master inventory, ownership map, and field contract are agreed and documented.

### Phase 2: Code Integration
- Objective: align the application modules so they read and write through the agreed unified model rather than conflicting repository-specific assumptions.
- Risk: Medium
- Definition of Done: each major module has a documented data path and source-of-truth mapping.

### Phase 3: Data Migration
- Objective: move data into the unified model in a controlled order, starting with shared masters and then transaction data.
- Risk: High
- Definition of Done: mapping rules are approved, data is staged or migrated safely, and record integrity is validated.

### Phase 4: Testing
- Objective: verify that the unified implementation works across the shared masters and the key modules.
- Risk: Medium
- Definition of Done: regression checks pass for the core workflows and any unresolved issues are tracked.

## 9. Risks

### High-risk items
- Shared master identity conflicts, especially for users, projects, and roles
- Incomplete or inconsistent schema evidence across the two repositories
- Data mapping ambiguity for transaction records that depend on shared masters

### Known blockers
- Any final schema change before ownership and field contract approval
- Any data migration before shared master reconciliation
- Any decision that depends on evidence marked “Not enough evidence”

### Unknown assumptions
- The exact final table names and column set for some shared entities are not fully confirmed by the available evidence.
- Some cross-module relationships still require explicit confirmation before implementation.

Items explicitly marked “Not enough evidence” should remain blocked until new evidence is provided.

## 10. Decisions Already Made

The following decisions are already agreed and should not be reopened during implementation unless new evidence appears:

- Repository B is the implementation base for resource and settings workflows.
- Repository A remains the primary source for memo, budget vs actual, license, and device workflows.
- Shared master data must be reconciled into a single canonical model.
- The final system must use one unified database model.
- Resource and settings behavior from Repository B should be preserved.
- The implementation phase should follow this document as the source of truth.

## 11. Recommended First Implementation Task

The safest first implementation task is to create and approve the shared master ownership matrix and field contract for projects, users, roles, settings, and resource entities.

Why this should be first:
- It is fully supported by the current evidence.
- It does not require code changes, database changes, or data movement.
- It removes ambiguity before downstream implementation work begins.
- It reduces the chance of rework in later phases.

## 12. Handoff to OpenAI Codex

Repository A is a reference implementation only. Repository B is the implementation target. The analysis phase is complete. Do not repeat the repository audit or the database audit. Follow this document as the implementation blueprint and use it as the authoritative guide for the integration work.
