# PMO Dashboard Integration Progress

## Current Integration Direction

Repository B is the integration base.

Accepted source of truth:

| Area | Source |
|---|---|
| Resource Management | Repository B |
| Settings | Repository B |
| Memo | Repository A |
| Budget vs Actual | Repository A |
| License Management | Repository A |
| Device Management | Repository A |
| Database | Unified target database after audit |

---

## Progress Tracker

| Phase | Status | Owner | Notes |
|---|---|---|---|
| Phase 1: Repository Audit | Not Started | TBD | Compare Repository B against Repository A for Memo, BvA, License, and Device |
| Phase 2: Database Audit | Not Started | TBD | Compare Database A and Database B |
| Phase 3: Shared Data Contract | Not Started | TBD | Decide final source of truth for shared entities |
| Phase 4: Schema Integration | Not Started | TBD | Prepare migration SQL |
| Phase 5: Code Integration | Not Started | TBD | Patch Repository B with missing Repository A behavior |
| Phase 6: Data Migration | Not Started | TBD | Move required data into unified database |
| Phase 7: System Testing | Not Started | TBD | Test cross-module data flow |
| Phase 8: Production Readiness | Not Started | TBD | Final deploy decision |

---

## Current Assumptions

- Repository B is the base repository.
- Resource Management and Settings from Repository B are accepted.
- Memo, Budget vs Actual, License Management, and Device Management must match Repository A behavior.
- Database migration is the highest-risk area.
- Settings must connect to other modules through shared data.

---

## Current Blockers

- Unified database has not been selected.
- Database A and Database B schema comparison is not complete.
- Final shared data contract is not complete.
- Field mapping between both databases is not complete.

---

## Next Action

Start Phase 1 and Phase 2 as read-only audits.

No code or database changes should be made until both audits are complete.
