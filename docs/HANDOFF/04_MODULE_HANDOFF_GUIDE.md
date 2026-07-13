# Module Handoff Guide

This guide maps the handoff modules to entry pages, files, functions, dependencies, extension points, and debugging locations.

Related documents: [business logic](./01_BUSINESS_LOGIC_SPEC.md), [database reference](./03_DATABASE_REFERENCE.md), [limitations](./05_KNOWN_LIMITATIONS_AND_TECH_DEBT.md).

## Repository Map

```text
index.html                         Application shell and view containers
app.js                             Shared storage, Supabase mapping, identity, auth-ready helpers, financial models, PDF helpers
auth.js                            Auth/session facade
style.css, theme.css               Global styling
views/create.js                    Create Memo / Draft / Submit
views/pending.js                   Pending Approval, Approve/Reject/Cancel/PMO Override
views/history.js                   All Memos, detail, duplicate, void, budget tag
views/settings.js                  Master data, authority titles/matrix, closing templates, signatures, people
views/budget.js                    Budget & Spend, Actual Spend, Transactions, BvA, Budget Pools, Add Spending
views/device.js                    Device Registry, Purchase Orders, HW spending device links
views/license.js                   License Inventory, Summary, Users, Reconciliation
supabase/migrations/*.sql          Database source of truth
tests/*.js                         Node test coverage for critical business rules
docs/spec/*.md                     Functional specs by module
docs/HANDOFF/*.md                  This handoff pack
```

## Memo Management

Purpose: Create, edit, submit, view, duplicate, delete draft, re-edit rejected, void completed memo, and render/download memo details/PDF.

Entry pages:

- Create Memo: `view-create`.
- Pending Approval: `view-pending`.
- All Memos: `view-history`.

Main files:

- `views/create.js`
- `views/pending.js`
- `views/history.js`
- `app.js`

Important functions:

- `collectMemoData()`
- `validateMemo()`
- `saveDraft()`
- `submitMemo()`
- `prepareMemoForSubmission()`
- `saveMemoAsync()`
- `loadMemosAsync()`
- `loadMemos()`
- `memoToDb()`
- `dbToMemo()`
- `draftFromMemo()`
- `voidMemoAsync()`
- `_buildMemoDetailContent()`
- `renderMemoPdf()`

Dependencies:

- `user_profiles` for requester/current user/approver identity.
- `authority_titles` and `authority_limits` for approver authority.
- `memo_closing_templates` for PDF closing paragraph.
- `budget_pools` and canonical Actual Spend for budget tag behavior.
- Device module for downstream HW void blocking.

Shared helpers:

- `currentUser()`, `currentUserProfileId()`, `profileMatches()`.
- `memoStatusKey()`, `histStatusLabel()`, `histStatusBadgeClass()`.
- `appendAuditLog()`.
- `money()`, `dateInput()`, `shortDate()`.

Extension points:

- Add memo type: update Create form collection/validation, `MEMO_TYPE_TO_SPEND_TYPE`, PDF rendering, closing templates, Budget Pool type lists, tests.
- Add approval stage: update stage index helpers, Pending labels/actions, PDF timeline, validation.
- Add memo status: update status vocabulary and visibility rules.

Common debugging locations:

- Supabase mapping mismatch: `memoToDb()` / `dbToMemo()` in `app.js`.
- Duplicate memo number: `checkMemoNoConflict()` in `views/create.js`, `findMemoNumberCollision()` in `app.js`.
- Lost draft/detail fields: structured fields in `collectMemoData()` and migrations for `hw_items`, `acct_cols`, etc.
- Pending visibility/action issues: `canCurrentUserViewPendingMemo()` and `canCurrentUserActOnMemo()`.

## Approval Workflow

Purpose: Route submitted memos through A1/A2/A3 approval, rejection, cancellation, and PMO override.

Entry pages:

- Pending Approval.
- Memo Detail modal from Pending and All Memos.

Main files:

- `views/pending.js`
- `app.js`

Important functions:

- `openApproveModal()`
- `confirmApprove()`
- `openRejectModal()`
- `confirmReject()`
- `cancelMemo()`
- `openPmoOverrideModal()`
- `pmoOverrideCurrentStageInfo()`
- `confirmPmoOverride()`
- `updateMemoStatusAsync()`
- `applyAuthoritySnapshotsOnApproval()`

Dependencies:

- `memos.approvers` JSONB.
- `user_profiles` for identity and PMO role.
- `authority_limits`/`authority_titles` for approve-stage snapshots.

Shared helpers:

- `memoCurrentStageIndex()`, `memoCurrentApprover()`.
- `isApproverStepResolved()`.
- `appendAuditLog()`.

Extension points:

- Add delegated approval or out-of-office routing by extending approver row shape and `profileMatches()`.
- Add server-side approval enforcement by mirroring `canCurrentUserActOnMemo()` in RLS or RPC.

Common debugging locations:

- Audit status mismatch: `confirmApprove()` realStatusAfter logic.
- PMO override routing: `pmoOverrideCurrentStageInfo()`.
- Hardware PO side effects on completion: `updateMemoStatusAsync()` and `createPurchaseOrdersFromMemo()`.

## Authority Title & Approval Matrix

Purpose: Maintain authority title master data and per-memo-type approval limits; snapshot approval authority at approval time.

Entry page:

- Settings.

Main files:

- `views/settings.js`
- `app.js`
- Migration `20260713132302_approval_authority_configuration.sql`

Important functions:

- `loadAuthorityTitlesAsync()`
- `loadAuthorityAsync()`
- `resolveAuthorityLimit()`
- `buildAuthoritySnapshot()`
- `resolveMemoAuthorityForPdf()`
- `authorityTitleMasterRows()`
- `saveAuthorityTitlesFromDom()`
- `saveAuthorityLimitsFromDom()`

Dependencies:

- `authority_titles`
- `authority_limits`
- `user_profiles.default_authority_title_id`
- `memos.approvers[*].authoritySnapshot`

Shared helpers:

- `normalizeAuthorityTitle()`
- `normalizeAuthorityLimitRow()`
- `authorityLimitText()`

Extension points:

- Add new memo type to matrix: update `MEMO_APPROVAL_TYPES`, DB check constraints, Budget/Spend type mapping, tests.
- Add effective dates to authority limits if policy changes need validity periods.

Common debugging locations:

- Legacy title not resolving: `findAuthorityTitle()` and `resolveAuthorityLimit()`.
- PDF authority wrong after matrix change: check whether `authoritySnapshot` exists on the final approve-stage row.
- Settings save conflicts: `saveAuthorityLimitsFromDom()` and `on_conflict=title,memo_type`.

## Closing Paragraph

Purpose: Render policy/authority-aware closing text in memo PDFs.

Entry page:

- Settings Closing Paragraph Configuration.

Main files:

- `views/settings.js`
- `app.js`

Important functions:

- `memoClosingTemplateRows()`
- `validateMemoClosingTemplate()`
- `saveMemoClosingTemplatesFromDom()`
- `loadMemoClosingTemplatesAsync()`
- `renderConfiguredClosingParagraph()`
- `memoSoftwareMetrics()`

Dependencies:

- `memo_closing_templates`
- `authority_titles` / `authority_limits`
- `memos.approvers[*].authoritySnapshot`

Extension points:

- Add placeholder: update `MEMO_CLOSING_PLACEHOLDERS`, renderer values in `renderConfiguredClosingParagraph()`, Settings validation tests.
- Add language variants: add columns or separate template table keyed by language.

Common debugging locations:

- Placeholder validation: `memoClosingTemplatePlaceholders()` and `validateMemoClosingTemplate()`.
- PDF uses fallback: `memoClosingTemplateForType()` did not find an active template or template cache did not load.

## Signature Management

Purpose: Store and render profile-keyed approval signatures while preserving legacy name/alias lookup.

Entry page:

- Settings Signature Management.

Main file:

- `views/settings.js`

Important functions:

- `signatureEligibleProfiles()`
- `signatureProfileStorageKey()`
- `signatureStorageKey()`
- `readSignatureDataUrl()`
- `handleSignatureFileSelect()`
- `saveSignatureFromDom()`
- `clearSignatureForOwner()`

Dependencies:

- `user_profiles.signature_data_url`
- localStorage profile and legacy signature keys.
- legacy `settings` rows for old signature data.

Extension points:

- Move binary assets to Supabase Storage; preserve `readSignatureDataUrl()` facade.
- Add image optimization before saving.

Common debugging locations:

- Signature missing after rename: ensure profile id is present in approver rows and `user_profiles.signature_data_url`.
- Legacy signature not found: check `name_aliases` and `sig-{name}` localStorage/settings key.

## Budget & Expense

Purpose: Manage Budget Pools, infrastructure costs, manual expenses, historical spending, Budget vs Actual, and canonical mapping.

Entry page:

- Budget & Spend.

Main files:

- `views/budget.js`
- `app.js`

Important functions:

- `createBudgetPoolRecord()`
- `validateBudgetPoolChange()`
- `loadBudgetPoolsAsync()`
- `savePoolAsync()`
- `deleteBudgetPool()`
- `budgetPoolDeletionBlockers()`
- `openBudgetPoolModal()`
- `saveBudgetPool()`
- `loadManualExpensesAsync()`
- `saveManualExpenseAsync()`
- `voidManualExpenseAsync()`
- `parseAddSpendingWorkbook()`
- `saveHistoricalSpendingFromModal()`
- `calculateBudgetVsActualDataset()`
- `_renderBvaWith()`

Dependencies:

- `budget_pools`
- `budget_manual_expenses`
- `infra_costs`
- `historical_memos`
- browser-local canonical Actual Spend.

Shared helpers:

- `spendTypeFromMemoType()`, `SPEND_TYPES`, `BUDGET_STATUSES`.
- `mapBudgetPool()`, `findMatchingBudgetPools()`.
- month/year helpers in `app.js` and `views/month_year_controls.js`.

Extension points:

- Add new spend type by updating type maps, import templates, BvA filters, manual expense type lists, tests.
- Add budget approval workflow by expanding `budget_pools.status`.

Common debugging locations:

- BvA mismatch: `reconcileActualSpendSources()` and `calculateBudgetVsActualDataset()`.
- Pool not matching: `findMatchingBudgetPools()` and BE/CE year conversion.
- Delete blocked: `budgetPoolDeletionBlockers()`.
- Import issues: `validateBudgetPoolImportBatch()` and `parseAddSpendingWorkbook()`.

## Actual Spend

Purpose: Produce a canonical financial dataset for completed memos and manual/historical/infra spend.

Entry pages:

- Budget & Spend > Actual Spend.
- Budget & Spend > Budget vs Actual.
- Budget & Spend > Transactions.

Main files:

- `app.js`
- `views/budget.js`

Important functions:

- `createActualSpendRecord()`
- `validateActualSpendRecord()`
- `actualSpendFromMemo()`
- `syncMemoToActualSpend()`
- `manualExpenseToActualSpend()`
- `infraCostToActualSpend()`
- `reconcileActualSpendSources()`
- `mapBudgetPool()`
- `calculateActualSpend()`
- `calculateActualSpendInRange()`

Dependencies:

- `memos`
- `historical_memos`
- `budget_manual_expenses`
- `infra_costs`
- `budget_pools`
- localStorage key `orbit-pmo-actual-spend-v1`

Extension points:

- Database-backed Actual Spend table/view.
- Server-side export/reporting.

Common debugging locations:

- Missing memo spend: check memo status and `actualSpendFromMemo()` validation.
- Wrong coverage: `memoCoveragePeriod()` and SL/DEP date fields.
- Manual expense missing: `activeManualExpenses()` and `voidedAt`.

## Transactions

Purpose: Show canonical Actual Spend at record/detail level with unified filters and CSV export.

Entry page:

- Budget & Spend > Transactions.

Main file:

- `views/budget.js`

Important functions:

- `actualSpendTransactionFromRecord()`
- `filteredActualSpendTransactions()`
- `renderManualEntries()`
- `showActualSpendTransactionDetail()`
- `showCanonicalTransactionDetail()`
- `canonicalTransactionRecordFromMemo()`
- `renderMemoSpendTypeDetail()`
- `manualEntryDetailFields()`
- `exportActualSpendTransactionsCSV()`

Dependencies:

- Canonical Actual Spend.
- `memos` for memo-backed detail.
- `budget_manual_expenses` for editable manual detail.
- `historical_memos` for historical detail.

Extension points:

- Add new detail renderer per spend type.
- Add ledger export fields by extending `actualSpendTransactionFromRecord()`.

Common debugging locations:

- Transaction total mismatch: compare `filteredActualSpendTransactions()` and `filteredActualSpendRecords()`.
- Edit/Delete showing incorrectly: `canEditActualSpendTransaction()` and `storageKind`.
- Missing detail fields: `renderCanonicalDetailSection()`.

## Device Registry

Purpose: Track purchase orders from HW memos and physical devices when they arrive; allow manual devices and historical HW links.

Entry page:

- Device Management.

Main file:

- `views/device.js`
- Supporting link helpers in `app.js`

Important functions:

- `createPurchaseOrdersFromMemo()`
- `_hwLineItemsFromMemo()`
- `loadPurchaseOrdersAsync()`
- `savePurchaseOrderAsync()`
- `advancePOStatus()`
- `markArrived()`
- `loadDevicesAsync()`
- `saveDeviceAsync()`
- `deleteDeviceAsync()`
- `cancelPurchaseOrdersForVoidedMemo()`
- `renderHardwareDeviceLinkSection()`
- `openDeviceLinkPicker()`
- `linkDevicesToHardwareLineAsync()`
- `unlinkDeviceFromSpendingAsync()`

Dependencies:

- `memos`
- `purchase_orders`
- `devices`
- `historical_memos`
- `historical_spending_device_links`

Extension points:

- Add repair/transfer/disposal workflows by extending device statuses and audit log.
- Add PO vendor/order metadata.

Common debugging locations:

- PO not created: memo must be `completed`, type `hw`, and have structured/legacy hardware lines.
- Device not created: PO must be awaiting/partial arrived, source memo must not be voided/rejected/cancelled.
- Deleted devices still appearing: `_excludeDeletedDevices()` and raw read/write paths.
- Historical device linking blocked: `deviceEligibleForSpendingLink()`.

## License Management

Purpose: Track software license inventory, summaries, user assignments, and reconciliation.

Entry page:

- License Management.

Main file:

- `views/license.js`

Important functions:

- `parseLicenseFromMemo()`
- `_parseSlItemsFromHtml()`
- `parseAccountTableFromMemo()`
- `getAllLicenses()`
- `getLicenseStatus()`
- `loadManualLicensesAsync()`
- `saveLicenseAsync()`
- `deleteLicenseAsync()`
- `_licSeatsByProjectSoftwarePlan()`
- `computeLicReconciliation()`
- `computeLicUserMappingData()`
- `exportLicenseCSV()`
- `exportUserLicensesCSV()`

Dependencies:

- `memos.sl_items`
- `memos.sections` account table fallback.
- `historical_memos.sl_items`
- `licenses`
- user license review/override stores in the module.

Extension points:

- Add renewal workflow and renewal audit trail.
- Persist memo-derived license inventory if operational independence is required.
- Replace account-table HTML parsing with structured `acct_cols` / `acct_rows` everywhere.

Common debugging locations:

- License missing from memo: `parseLicenseFromMemo()` and memo status/type.
- Duplicate/colliding license id: generated identity in `parseLicenseFromMemo()`.
- Seat reconciliation mismatch: `_licSeatsByProjectSoftwarePlan()` and `computeLicReconciliation()`.

