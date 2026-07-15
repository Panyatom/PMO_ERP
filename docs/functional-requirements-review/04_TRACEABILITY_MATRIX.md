# PMO_ERP Functional Requirement Traceability Matrix

Confidence uses the requested classification. Line references identify the active area; function names remain the stable locator.

| Requirement ID | Module | Requirement Summary | UI/File Evidence | Function Evidence | Test Evidence | Data/Table Evidence | Confidence |
|---|---|---|---|---|---|---|---|
| MEM-FR-001 | Memo | Create requires common header, project, reason, subject, signature date, A1/A2. | `index.html:1215-1507`; `views/create.js` | `collectMemoData`, `validateMemo` | UI/date tests | `memos` | Confirmed |
| MEM-FR-002 | Memo | Route has mandatory A1/A2 and optional A3, maximum three. | `views/create.js:1380-1515` | `addApproverFormRow`, `rmApproverFormRow` | authority override tests | `memos.approvers` JSON | Confirmed |
| MEM-FR-003 | Memo | Requester may self-review A1 but may not approve A2/A3. | Create route UI | `validateMemo`, `prepareMemoForSubmission` | create authority tests | requester/current approver IDs | Confirmed |
| MEM-FR-004 | Memo | SL stores line items and total is price×months×qty. | SL form/detail | `collectMemoData`, `calcSL` | forecast/detail tests | `memos.sl_items` | Confirmed |
| MEM-FR-005 | Memo | HW stores line items and total is unit price×qty. | HW form/detail | `collectMemoData`, `calcHW` | hardware tests | `memos.hw_items` | Confirmed |
| MEM-FR-006 | Memo | INT stores activity/participants and enforces participant count. | INT form | `collectMemoData`, `validateMemo`, `calcINT` | spend detail tests | memo JSON fields | Confirmed |
| MEM-FR-007 | Memo | ENT stores one-time event/customer/amount fields. | ENT form | `collectMemoData`, `validateMemo` | spend detail tests | memo JSON fields | Confirmed |
| MEM-FR-008 | Memo | DEP stores scalar dates/location/headcount and expense items. | DEP form | `collectMemoData`, `calcDepGrand` | spend detail tests | memo JSON fields | Confirmed |
| MEM-FR-009 | Memo | Draft saves/restores structured content and edits same draft. | History/Create | `saveDraft`, `applyDraftEdit` | regression tests | `memos.status=draft` | Confirmed |
| MEM-FR-010 | Memo | Memo No. is collision checked locally/remotely. | Create alerts | `checkMemoNoConflict`, `saveMemoAsync` | memo collision tests | unique memo number | Confirmed |
| MEM-FR-011 | Memo | Rejected/Cancelled number reuse policy conflicts with persistence uniqueness. | Create | `MEMO_NO_BLOCKING_STATUSES` | collision tests | unique index | Inconsistent |
| MEM-FR-012 | Memo | History supports search/filter/status/date/amount/pagination and filtered CSV. | History page | `filteredHistoryMemos`, `exportHistoryCsv` | memo history regression | `memos` | Confirmed |
| MEM-FR-013 | Memo | PDF includes approval/signature data and cleans temporary staging. | Memo detail | `renderMemoPdf`, final `downloadMemoPdf` | PDF cleanup/snapshot tests | no PDF business row | Confirmed |
| MEM-FR-014 | Memo | General creation attachment is absent; action evidence is partial support. | Create/Pending modals | evidence handlers | PDF/evidence tests partial | evidence URL memo columns | Not Implemented |
| APR-FR-001 | Approval | Submission snapshots route and selects Pending A1/A2/completed. | Create submit | `prepareMemoForSubmission` | approval tests | `memos.approvers` | Confirmed |
| APR-FR-002 | Approval | Only current stage approves sequentially. | Pending | `canCurrentUserActOnMemo`, `updateMemoStatusAsync` | approval tests | status/current profile ID | Confirmed |
| APR-FR-003 | Approval | Rejection is terminal and marks current route row. | Reject modal | `confirmReject`, `updateMemoStatusAsync` | history regression | rejected fields | Confirmed |
| APR-FR-004 | Approval | Requester/route/PMO visibility is identity-based. | Pending/History | visibility functions | canonical missing-data tests | profile/requester IDs | Confirmed |
| APR-FR-005 | Approval | PMO override requires pending, note, evidence, resolves current step. | PMO override modal | `confirmPmoOverride` | history/authority tests | audit/evidence JSON | Confirmed |
| APR-FR-006 | Approval | Completed memo may be voided with blockers and cascades. | History Void | `voidMemoAsync` | hardware tests | void columns | Confirmed |
| APR-FR-007 | Approval | Authority snapshot is made when approve-stage row becomes approved. | Approval/PDF | `applyAuthoritySnapshotsOnApproval` | authority snapshot tests | route JSON | Confirmed |
| APR-FR-008 | Approval | Authority amount is advisory, not transition enforcement. | Create hint | `_updateApproverAuthorityHint`; transition lacks check | authority tests | `authority_limits` | Inconsistent |
| APR-FR-009 | Approval | Production server authorization is not implemented. | README | UI session facade | none | broad RLS policies | Not Implemented |
| BUD-OV-FR-001 | Budget Overview | KPIs/charts use canonical filtered spend/pools and period filters. | `views/budget.js:930-1451` | `_ovCanonicalDataset`, `_ovUpdateKPIs` | budget tests | canonical local model/pools | Confirmed |
| BUD-OV-FR-002 | Budget Overview | Dedicated Overview export is absent. | Overview UI | no export handler | none | n/a | Not Implemented |
| BUD-ACT-FR-001 | Actual Spend | Completed memo/historical source reconciles to one canonical record. | Actual Spend | `actualSpendFromMemo`, `reconcileActualSpendSources` | actual/historical tests | memo/historical tables | Confirmed |
| BUD-ACT-FR-002 | Actual Spend | Active manual and Infra records contribute; void/deleted do not. | Report/Transactions | source conversion functions | transaction tests | manual expenses/infra | Confirmed |
| BUD-ACT-FR-003 | Actual Spend | Visible source values are Memo and Manual Spending only. | badges/filters | `canonicalActualSpendSourceLabel` | source classification tests | source/storageKind | Confirmed |
| BUD-ACT-FR-004 | Actual Spend | One match maps; multiple needs review; none unbudgeted. | report/BvA | `findMatchingBudgetPools`, `mapBudgetPool` | historical/budget tests | `budget_pools` | Confirmed |
| BUD-ACT-FR-005 | Actual Spend | Valid manual override wins; cross-year/project override is blocked. | assignment workspace | `mapBudgetPool`, assignment handlers | BvA tests | source budget pool IDs | Confirmed |
| BUD-ACT-FR-006 | Actual Spend | Ordinary manual expense does not auto-map. | report | `mapBudgetPool` special case | transaction tests | `budget_manual_expenses` | Confirmed |
| BUD-ACT-FR-007 | Actual Spend | Flat Transactions supports filters, detail, filtered CSV; only ordinary manual is editable. | Transactions | transaction functions | transaction tests | multiple sources | Confirmed |
| BUD-ACT-FR-008 | Actual Spend | Detail is source/spend-type aware and device-linked for historical HW. | detail modal | canonical render functions | spend detail/hardware tests | device link table | Confirmed |
| BUD-ACT-FR-009 | Actual Spend | Imports validate canonical fields and duplicates. | import UI | import parsers/validators | import tests partial | historical/manual tables | Confirmed |
| BUD-FC-FR-001 | Forecast | Only Software and Infra are eligible. | Forecast | `isForecastEligibleSpendType` | spend eligibility tests | canonical spend type | Confirmed |
| BUD-FC-FR-002 | Forecast | Window is six prior actual + current/five future. | month header | `forecastMonths` | budget forecast tests | n/a | Confirmed |
| BUD-FC-FR-003 | Forecast | SL detail lines split into components; legacy/manual/Infra remain record-level. | forecast rows | `forecastComponents` | forecast tests | detailLines | Confirmed |
| BUD-FC-FR-004 | Forecast | Row grain is project/program/plan/type and contributors remain traceable. | table/breakdown | `buildForecastDataset` | breakdown tests | parent IDs/line index | Confirmed |
| BUD-FC-FR-005 | Forecast | Monthly allocation uses total/inclusive coverage with fallbacks. | values | `forecastComponentMonthlyAmount` | forecast tests | coverage fields | Confirmed |
| BUD-FC-FR-006 | Forecast | Unsupported carry-forward may display nonclickable forecast. | styled cell | `forecastCellIsClickable` | click tests | contributor arrays | Confirmed |
| BUD-FC-FR-007 | Forecast | Cancellation/expiry ownership across memo/license is not explicit. | Forecast/License | forecast vs status functions | no cross-status test | separate models | Unclear |
| BUD-FC-FR-008 | Forecast | CSV mirrors visible forecast dataset/month order. | Export button | `forecastExportDataset`, `exportForecastCSV` | export tests | n/a | Confirmed |
| BUD-BVA-FR-001 | Budget vs Actual | Pool rows sum final-mapped records and calculate variance/utilization. | BvA | `_renderBvaWith` | budget tests | pool IDs | Confirmed |
| BUD-BVA-FR-002 | Budget vs Actual | Unbudgeted/review records remain visible and assignable. | assignment workspace | workspace functions | historical tests | canonical status | Confirmed |
| BUD-BVA-FR-003 | Budget vs Actual | Drill-down supports memo and manual subtypes. | detail panels | `showBvaRecordDetail`, canonical routing | routing tests | multiple tables | Confirmed |
| BUD-BVA-FR-004 | Budget vs Actual | Filters and export use visible dataset. | BvA toolbar | `exportBudgetVsActualCSV` | budget tests partial | canonical model | Confirmed |
| BUD-POOL-FR-001 | Budget Pool | Positive THB, project, name, types, valid one-year range required. | pool modal | pool create/validate functions | budget tests | `budget_pools` | Confirmed |
| BUD-POOL-FR-002 | Budget Pool | Duplicate identity rejects; overlaps are permitted and create ambiguity. | warning/modal | `validateBudgetPoolChange` | budget tests | pool rows | Confirmed |
| BUD-POOL-FR-003 | Budget Pool | Delete is soft/guarded and deleted pools are excluded. | delete action | `deletePoolAsync`, blocker functions | budget tests | deleted columns | Confirmed |
| BUD-POOL-FR-004 | Budget Pool | Import create/update is determined only by Pool ID and previewed. | bulk UI | `validateBudgetPoolImportBatch` | budget tests | pool ID | Confirmed |
| BUD-POOL-FR-005 | Budget Pool | UI lacks full active/inactive status lifecycle supported by data compatibility. | settings list | render/edit handlers | none | status/deleted fields | Inconsistent |
| LIC-FR-001 | License | Inventory combines completed SL-derived and nondeleted manual/imported rows. | Inventory | `getAllLicenses`, `parseLicenseFromMemo` | historical tests | `licenses`, memos | Confirmed |
| LIC-FR-002 | License | Status is cancellation override or expiry threshold; missing expiry Active. | status filters | `getLicenseStatus` | summary tests | dates/status override | Confirmed |
| LIC-FR-003 | License | Expiry-before-purchase is blocked; expiry-before-start is not consistently blocked. | manual/import | date validators | import tests partial | license dates | Inconsistent |
| LIC-FR-004 | License | Summary grain is Project+Software+Plan. | Summary | `_licSeatsByProjectSoftwarePlan`, reconciliation | summary tests | inventory/assignments | Confirmed |
| LIC-FR-005 | License | Purchased=sum seats; Assigned=distinct users; Remaining=difference, may be negative. | Summary KPIs | `computeLicReconciliation` | summary tests | overrides/manual mappings | Confirmed |
| LIC-FR-006 | License | Over-assigned and Has Remaining filters and user drill-down are supported. | Summary | filter/detail functions | summary tests | derived | Confirmed |
| LIC-FR-007 | License | New memo account mappings require review; legacy is grandfathered. | User Mapping | review functions | license tests partial | local/review state | Confirmed |
| LIC-FR-008 | License | Assignment import applies only valid unambiguous rows. | import modal | `computeAssignmentImportPreview`, `applyAssignmentImport` | assignment tests partial | overrides/manual rows | Confirmed |
| LIC-FR-009 | License | Soft delete excludes inventory/summary/export. | delete action | `deleteLicenseAsync`, `isDeletedLicense` | summary tests | deleted columns | Confirmed |
| DEV-FR-001 | Device | Completed HW memo creates one idempotent PO per line. | PO tab | `createPurchaseOrdersFromMemo` | hardware tests | `purchase_orders` | Confirmed |
| DEV-FR-002 | Device | Arrival creates devices up to ordered qty and sets partial/fulfilled. | Mark Arrived | `markArrived` | hardware tests | PO/devices | Confirmed |
| DEV-FR-003 | Device | Terminal source blocks outstanding PO while arrived devices remain. | PO status/actions | effective status/cascade functions | hardware tests | PO audit | Confirmed |
| DEV-FR-004 | Device | Manual create/import is supported. | registry modal/import | `saveDevice`, `importDeviceBulk` | hardware tests partial | `devices` | Confirmed |
| DEV-FR-005 | Device | Populated serial/Asset IT identity duplicates are blocked. | validation alert | identity match/validate functions | hardware tests | device identifiers | Confirmed |
| DEV-FR-006 | Device | Project/user assignment is editable; dedicated assignment ledger is absent. | Device modal/detail | `saveDevice` | none | device row/audit only | Unclear |
| DEV-FR-007 | Device | Search includes current and audit/history text; filters/export/pagination exist. | Registry | filter/render/export | hardware tests partial | devices/audit JSON | Confirmed |
| DEV-FR-008 | Device | Historical HW may link only eligible existing devices, one line per device. | Spending detail picker | eligibility/link functions | hardware linking tests | historical link table | Confirmed |
| DEV-FR-009 | Device | Delete is soft and photo types are constrained. | detail actions | delete/photo functions | none | deleted/photo fields/storage | Confirmed |
| SET-REA-FR-001 | Settings Reasons | Reasons are typed, sorted, active/deactivated and feed Create Memo. | Memo Approval settings | reason normalize/render/read functions | settings tests partial | settings JSON | Confirmed |
| SET-REA-FR-002 | Settings Reasons | Empty list versus fallback defaults is ambiguous. | settings/create | normalize/options functions | none | settings JSON | Unclear |
| SET-APR-FR-001 | Settings Profiles | Active `can_review`/`can_approve` profiles feed stage dropdowns. | profiles panel/create | profile load/select functions | settings tests | `user_profiles` | Confirmed |
| SET-APR-FR-002 | Settings Profiles | Default title ID autofills; legacy values remain compatible. | profile/title dropdown | title resolution functions | authority UI tests | default title FK/text | Confirmed |
| SET-TTL-FR-001 | Settings Titles | Titles store TH/EN/sort/active and active values are selectable. | title panel | title normalize/save functions | authority UI tests | `authority_titles` | Confirmed |
| SET-MTX-FR-001 | Settings Matrix | Matrix is title×memo type with unconfigured/zero/numeric/unlimited states. | matrix table | limit read/save/resolve functions | authority tests | `authority_limits` | Confirmed |
| SET-MTX-FR-002 | Settings Matrix | Matrix influences hints/snapshot/PDF, not route enforcement. | Create/PDF | authority functions | snapshot tests | limits/snapshot JSON | Inconsistent |
| SET-SIG-FR-001 | Settings Signatures | Eligible active review/approve profiles appear once and signature saves by profile ID. | signature panel | signature eligibility/save/clear | signature tests | `user_profiles.signature_data_url` | Confirmed |
| SET-SIG-FR-002 | Settings Signatures | Missing signature does not block approval or PDF. | PDF/history | signature lookup/render | signature tests | nullable signature | Confirmed |

