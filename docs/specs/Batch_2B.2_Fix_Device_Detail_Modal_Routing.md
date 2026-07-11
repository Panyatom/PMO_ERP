# Batch 2B.2 — Fix Spending Detail → Device Detail Modal Routing

## Objective

Fix the modal/navigation defect when opening a linked Device from Hardware Spending Detail.

Current defect:

- User opens **Spending Detail**
- User clicks a linked Device chip/name
- **Device Detail opens behind the existing Spending Detail modal**
- The screen shows stacked/overlapping modals and the wrong content appears to render

Expected behavior:

- Clicking a linked Device from Spending Detail must open the existing **Device Detail** cleanly
- The Spending Detail modal must not remain layered above it
- Navigation must feel like replacing the current detail view, not stacking two modals

---

## Required Behavior

### Spending Detail → Device Detail

When the user clicks a linked Device:

1. Close or hide the current Spending Detail modal first
2. Open the existing Device Detail modal for the selected Device
3. Do not duplicate Device Detail markup
4. Do not create a new modal
5. Do not leave both modals open at the same time

### Device Detail → Source Spending

Keep the existing reverse navigation:

- Device Detail → View Source Spending
- Close/hide Device Detail first
- Open the correct Spending Detail
- Do not stack both modals

### Back-and-Forth Navigation

The following flow must work repeatedly without stale content:

```
Spending Detail
→ Device Detail
→ Source Spending Detail
→ Device Detail
```

At every step, only one primary detail modal should be visible.

---

## Scope

Prefer changes only in:

- `views/device.js`
- `views/budget.js`
- related tests

Do not modify unrelated modules.

---

## Guardrails

Do NOT:

- redesign either modal
- change Device data
- change Spending data
- change link persistence
- change unlink logic
- change Purchase Order flow
- change Memo approval flow
- change Forecast
- change Budget Assignment
- add a new modal
- create duplicate renderers

Reuse existing modal IDs, renderers, and routing functions.

---

## Regression Checks

Verify:

1. Open Hardware Spending Detail
2. Click linked Device
3. Spending Detail closes
4. Correct Device Detail opens
5. Only one detail modal is visible
6. Click View Source Spending
7. Device Detail closes
8. Correct Spending Detail opens
9. Repeat the flow twice
10. No stale data from the previous Device/Spending
11. Existing Memo → Device navigation still works
12. Existing Device → Source Memo navigation still works
13. Unlink still works
14. Full test suite passes
15. No console errors

---

## Definition of Done

- Spending Detail and Device Detail never overlap
- Navigation replaces the current modal instead of stacking
- Reverse navigation works correctly
- Existing Memo/Device navigation is unchanged
- No unrelated logic is modified
