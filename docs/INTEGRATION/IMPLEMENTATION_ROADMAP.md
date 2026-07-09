PMO Dashboard Integration Implementation Roadmap

Objective

* PMO_ERP เป็น implementation repository
* PMO-dashboard-v0.1 เป็น reference repository
* Resource + Settings ใช้ของ PMO_ERP
* Memo + Budget vs Actual + License + Device ใช้ของ PMO-dashboard-v0.1

⸻

Final Implementation Sequence

Phase 1 — Freeze Schema Contract

Goal

* Confirm final schema contract
* No code changes
* No database changes

Deliverables

* Final schema definition
* Final table ownership
* Final field mapping

Approval required
✅ Yes

⸻

Phase 2 — Prepare Migration SQL

Goal

* Create migration SQL only

Rules

* Additive only
* No DROP
* No DELETE
* No data migration
* No apply to database

Deliverables

* Migration SQL files

Approval required
✅ Yes

⸻

Phase 3 — Module Integration

Goal

Integrate the following modules from PMO-dashboard-v0.1 into PMO_ERP:

* Memo
* Budget vs Actual
* License
* Device

Scope

Must include:

* UI
* Components
* Routing
* Business Logic
* Validation
* Data Access

Resource Management and Settings remain from PMO_ERP.

Deliverables

* Feature parity achieved
* All module components available
* Shared schema used

Approval required
✅ Yes

⸻

Phase 4 — Integration Testing

Goal

Validate:

* Memo
* Budget vs Actual
* License
* Device
* Resource
* Settings

Also verify cross-module integration.

Deliverables

* Regression passed
* Integration checklist passed

Approval required
✅ Yes

⸻

Phase 5 — Database Migration & Cutover

Goal

Execute migration only after:

* Phase 2 complete
* Phase 3 complete
* Phase 4 complete

Process

1. Backup database
2. Apply migration
3. Validate schema
4. Migrate data
5. Validate data
6. Switch application

Approval required
✅ Yes

⸻

Rules

* Never skip phases.
* Never modify production database before approval.
* Never implement outside the approved phase.
* Repository A is reference only.
* Repository B is implementation target.

⸻

Definition of Done

The project is complete when:

* PMO_ERP contains all required modules.
* Resource and Settings remain intact.
* Memo, Budget vs Actual, License, and Device reach feature parity with the reference implementation.
* All modules use one unified schema.
* One production database supports the entire application.
