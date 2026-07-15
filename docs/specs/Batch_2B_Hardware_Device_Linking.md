# Batch 2B — Hardware Spending ↔ Device Registry Linking

## Objective

Implement **optional linking** between **Hardware Manual Spending** (historical hardware spending) and **Device Registry**.

This feature must **NOT** introduce Purchase Orders, arrival workflow, placeholder devices, or automatic device creation.

The goal is only to create a relationship between existing Device records and Hardware Spending.

---

# Scope

## In Scope

- Hardware Spending Detail
- Device Detail
- Link / Unlink devices
- Navigation between Spending and Device
- Tests

## Out of Scope

- Purchase Orders
- Mark Arrived
- Auto-create Device
- Placeholder/Missing-ID device
- Memo approval workflow
- Forecast
- Budget Assignment
- License
- Add Spending CRUD (except link UI)

---

# Business Rules

## Relationship

Link at **Hardware Line** level.

One Hardware Spending may contain multiple hardware lines.

Each hardware line has:

- Item
- Quantity

Each hardware line may link to multiple Device records.

Each Device may belong to only ONE hardware line.

---

## Quantity Rule

If

Quantity = 3

then

Linked Devices

may be

0
1
2
3

More than Quantity:

BLOCK save.

Less than Quantity:

Allowed.

Show warning only.

Never auto-create devices.

---

# Device Registry

Reuse existing Device Registry.

Do NOT create new pages.

Do NOT change layout.

Device Detail must display:

- Source Type
- Source Spending No
- View Source Spending

Reuse existing "View Memo" behavior where possible.

Routing:

memo
→ existing memo flow

manual_spending + historical storage
→ Hardware Spending Detail

---

# Hardware Spending Detail

Reuse existing Spending Detail.

For each hardware line show

- Quantity
- Linked Devices count

Add

Link Devices

button.

Clicking opens existing Device selector dialog (or reuse closest existing selector).

Do not build a brand-new picker if reusable components exist.

---

# Device Selection Rules

Only selectable devices:

- Active
- Not deleted
- Not already linked elsewhere

Already-linked devices:

Show as unavailable.

---

# Data Model

Prefer a separate link table.

Suggested:

historical_spending_device_links

Fields:

- id
- historical_memo_id
- hardware_line_id
- device_id
- created_at
- created_by

Do NOT duplicate device data.

---

# Editing

Editing Hardware Spending:

Existing links remain.

If Quantity becomes smaller than linked count:

Show validation.

Require unlink first.

Deleting Spending:

Block delete while linked devices exist.

Ask user to unlink first.

Deleting Device:

Reuse existing behavior.

Link records should be removed safely.

---

# Navigation

Hardware Spending Detail

→ View Device

→ Device Detail

Device Detail

→ View Source Spending

Both directions must work.

No dead links.

---

# Guardrails

Do NOT

- generate Purchase Orders
- modify Device arrival flow
- modify Memo workflow
- create devices automatically
- create placeholder devices
- modify Forecast
- modify Budget Assignment
- modify License
- redesign Device Registry

Reuse existing detail pages and routing whenever possible.

---

# Testing

Verify

- Link one device
- Link multiple devices
- Quantity validation
- Unlink
- Edit after linking
- Delete blocked while linked
- Device opens Spending
- Spending opens Device
- Existing Memo → Device navigation still works
- Existing Device Registry behavior unchanged

---

# Definition of Done

- Optional Hardware Spending ↔ Device linking implemented.
- Bidirectional navigation works.
- No PO integration.
- No automatic device creation.
- Existing Device workflow unchanged.
- Existing tests pass.
