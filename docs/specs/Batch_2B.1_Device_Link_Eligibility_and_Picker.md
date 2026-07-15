# Batch 2B.1 — Restrict Device Linking and Simplify Device Picker

## Objective

Fix the remaining Hardware Spending ↔ Device Registry issues before committing Batch 2B.

This task has only two goals:

1. Prevent a Device from being linked to more than one source.
2. Simplify the Link Devices picker so users see only eligible Devices in a compact table.

Do not add unrelated features.

---

## Business Rules

### Eligible Device

A Device can be linked to Manual Spending only when all conditions are true:

- Active / not deleted
- Not linked to an approved Memo / Purchase Order flow
- Not linked to another Manual Spending hardware line
- Not linked beyond the current hardware-line quantity limit

### Ineligible Device

Do not show in the picker:

- Device already linked to a Memo
- Device already linked to another Manual Spending
- Deleted or inactive Device
- Device already linked to the current line

A Device linked to an approved Memo must never be unlinkable from this Manual Spending flow.

### Unlink Rule

- Allow unlink only for links created by Manual Spending.
- Do not show or enable Manual-Spending unlink controls for approved-Memo source relationships.

### Quantity Rule

- Linked Device count cannot exceed hardware-line quantity.
- If linked count is below quantity, allow save.
- Do not auto-create Devices.
- Do not create placeholder Devices.

---

## Device Picker UI

Reuse the existing Link Devices modal.

Do not create a new page.

Show only available Devices in a compact table with these columns:

- Brand / Model
- Asset IT
- Serial Number
- Select

Use `—` when Asset IT or Serial Number is missing.

### Search

Add one simple search input.

Search across:

- Brand / Model
- Asset IT
- Serial Number

No advanced filters, status column, link-status column, or pagination.

### Empty State

When no eligible Device is available, show:

> No available devices found. If the device is linked to another source, unlink it there first before linking it to this spending record.

Do not reveal technical storage details.

---

## Required Validation

UI filtering alone is not sufficient.

Before saving links, validate again that every selected Device:

- has no approved Memo source
- has no other Manual Spending link
- is not deleted/inactive
- does not exceed the hardware-line quantity

If validation fails:

- do not save partial links
- show a clear error
- keep existing links unchanged

---

## Existing Navigation

Preserve the existing bidirectional navigation:

- Hardware Spending Detail → Device Detail
- Device Detail → Source Spending Detail
- Approved Memo Device → View Source Memo

Do not break the existing Memo/PO navigation flow.

---

## Scope Guardrails

Do NOT:

- create or modify Purchase Orders
- auto-create Devices
- create placeholder Devices
- change Forecast
- change Budget Assignment
- change License
- change Memo approval flow
- redesign Device Registry
- add a new tab or page
- add status/link-status columns
- add pagination

Prefer changes only in the existing Device-linking code and related tests.

---

## Regression Checks

Verify:

1. Free Device appears in picker and can be linked.
2. Device with approved Memo source does not appear.
3. Device linked to another Manual Spending does not appear.
4. Device linked to current line is not duplicated in picker.
5. Search finds by Brand/Model.
6. Search finds by Asset IT.
7. Search finds by Serial Number.
8. Empty-state message appears when nothing is available.
9. Manual Spending link can be unlinked.
10. Approved Memo relationship cannot be unlinked from this flow.
11. Quantity cap still blocks over-linking.
12. Existing Device Detail ↔ Source navigation still works.
13. Full test suite passes.
14. No console errors.

---

## Definition of Done

- One Device can belong to only one source relationship.
- Picker shows only eligible Devices.
- Picker uses a compact table with Brand/Model, Asset IT, Serial Number, and Select.
- Simple search works.
- Empty state is clear.
- No approved-Memo relationship can be unlinked from Manual Spending.
- No unrelated module or workflow is changed.
