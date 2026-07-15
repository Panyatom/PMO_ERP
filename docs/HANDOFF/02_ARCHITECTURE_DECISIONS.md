# Architecture Decisions

This document records implementation decisions observed in the current repository. It documents the current production-ready behavior only.

Related documents: [business logic](./01_BUSINESS_LOGIC_SPEC.md), [database reference](./03_DATABASE_REFERENCE.md), [module guide](./04_MODULE_HANDOFF_GUIDE.md), [limitations](./05_KNOWN_LIMITATIONS_AND_TECH_DEBT.md).

## Static Browser App With Supabase Fallback

Decision: Keep PMO ERP as static HTML/CSS/JavaScript with Supabase PostgREST and localStorage fallback.

Context: `README.md` and `docs/DEPLOYMENT.md` define the current architecture: GitHub Pages hosts static files, `config.js` injects Supabase URL/anon key, and migrations live in `supabase/migrations/`.

Alternatives considered: server-rendered app, API backend, framework migration.

Why chosen: The repository already uses static modules under `views/`, and the PoC needs simple deployability.

Trade-offs:

- Fast deployment and no server runtime.
- Browser code carries business logic and compatibility work.
- RLS is PoC-compatible and not production-hardened.
- Some canonical stores still use localStorage models.

Future considerations: Add Supabase Auth, role-aware RLS, and server-side enforcement before sensitive production data.

## Memo As Source Of Business Impact

Decision: Memo is the primary business record; downstream modules consume completed memos.

Context: `SYSTEM_OVERVIEW.md` says only approved memos create downstream impact. Runtime code enforces this through `memoStatusKey(memo) === "completed"` in `reconcileActualSpendSources()` and through hardware PO creation only on completed HW memos.

Alternatives considered: create downstream records at submit time or at each approval stage.

Why chosen: It prevents spend, licenses, devices, or purchase records from appearing before approval.

Trade-offs:

- Clear source-of-truth model.
- More work is needed for rollback/void handling after approval.

Future considerations: Add backend triggers or jobs only if they preserve the same lifecycle semantics.

## Approval Chain In `memos.approvers` JSONB

Decision: Store the current approval route and row statuses as JSONB on `memos`.

Context: Existing view modules read and mutate `memo.approvers`; `memoToDb()` persists it to `memos.approvers`.

Alternatives considered: normalized approval-stage table.

Why chosen: It fit the static client model, reduced schema complexity, and preserved legacy memo compatibility.

Trade-offs:

- Easy to render and serialize.
- Harder to query/audit stage-level data at the database level.
- Requires careful full-row patching.

Future considerations: Normalize approval events/stages when moving to server-enforced workflow.

## Authority Snapshot

Decision: Capture authority title/limit/policy snapshot only when an approve-stage row becomes approved.

Context: `applyAuthoritySnapshotsOnApproval()` creates `authoritySnapshot` for approve-stage rows. Tests in `tests/authority_snapshot_pdf.test.js` verify reviewer rows and already-approved rows do not get new snapshots.

Alternatives considered:

- Resolve authority dynamically every time a PDF is generated.
- Snapshot on memo submission.

Why chosen: Approval authority should reflect the matrix at approval time, not future matrix edits, and only the final approve-stage authority is relevant for the closing clause.

Trade-offs:

- Historical PDFs remain stable.
- Legacy memos without snapshots still depend on current configuration.

Future considerations: Backfill snapshots for old completed memos if regulatory-grade immutability is required.

## Authority Titles As Master Data, Legacy Title Text Preserved

Decision: Add `authority_titles` and `authority_limits.authority_title_id`, while keeping legacy `authority_limits.title` and `user_profiles.title`.

Context: Migration `20260713132302_approval_authority_configuration.sql` adds title ids and backfills from legacy title text. `resolveAuthorityLimit()` still searches by title text after id lookup.

Alternatives considered: replace all title text references immediately.

Why chosen: Existing memos and settings data already store text titles.

Trade-offs:

- Smooth compatibility.
- Two matching paths must be maintained.

Future considerations: Once all profiles and limits are id-backed, mark text title fallback as deprecated.

## Profile-Based Signatures

Decision: Store signatures on `user_profiles.signature_data_url`, keyed locally by profile id, with legacy name/alias fallback.

Context: `readSignatureDataUrl()` prefers `sig-profile-{id}` and `user_profiles.signature_data_url`, then falls back to `sig-{name}` and aliases.

Alternatives considered: keep signatures in generic `settings` rows keyed by name only.

Why chosen: Names can change; profile id is stable.

Trade-offs:

- PDF rendering survives profile rename.
- Data URLs in profile rows are simple but may be heavy for large images.

Future considerations: Move signature binaries to Supabase Storage if size, retention, or access-control requirements grow.

## Configurable Closing Paragraph

Decision: Use `memo_closing_templates` for type-specific Thai closing paragraphs with placeholders and hardcoded fallback.

Context: `renderConfiguredClosingParagraph()` renders active templates; `renderMemoPdf()` keeps fallback behavior when no configured template exists.

Alternatives considered: hardcode all closing text or store full final paragraph on each memo.

Why chosen: PMO can update policy wording per memo type without code changes, while fallback protects old deployments/data.

Trade-offs:

- Flexible templates.
- Placeholder validation is client-side in Settings.
- Existing memos do not snapshot the template body itself, only authority data.

Future considerations: Snapshot final rendered closing paragraph on approval if wording immutability becomes mandatory.

## Canonical Actual Spend Model In Application Layer

Decision: Build canonical Actual Spend records in JavaScript from completed memos, historical memos, manual expenses, and infra costs.

Context: `createActualSpendRecord()`, `actualSpendFromMemo()`, `manualExpenseToActualSpend()`, `infraCostToActualSpend()`, and `reconcileActualSpendSources()` define the model. There is no Supabase `actual_spend` table in migrations.

Alternatives considered: database table/materialized view for Actual Spend.

Why chosen: It unified current and legacy sources without a major database migration.

Trade-offs:

- One canonical browser model across reports and Transactions.
- Persistence is localStorage for canonical cache; source records are persisted separately.
- Cross-client canonical cache is recalculated rather than server-authored.

Future considerations: Create a database-backed Actual Spend view/table when server-side reporting becomes required.

## Actual Spend Source Classification

Decision: Only expose two business sources: `memo` and `manual_spending`; use `storageKind` to keep the detailed origin.

Context: `ACTUAL_SPEND_SOURCES` maps historical memos, manual expenses, and infra costs to `manual_spending`. Tests in `tests/source_classification.test.js` enforce this.

Alternatives considered: show source values for every storage table.

Why chosen: Users need to distinguish approved-memo spend from manually entered/historical spend, not every implementation table.

Trade-offs:

- Simple user-facing filters.
- Developers must inspect `storageKind` for deeper debugging.

Future considerations: Keep both fields if a backend Actual Spend table is added.

## Transactions View

Decision: Transactions are a normalized detailed view over canonical Actual Spend, not a separate table.

Context: `actualSpendTransactionFromRecord()` and `filteredActualSpendTransactions()` transform canonical records. Tests verify the transaction total reconciles with Actual Spend report filters.

Alternatives considered: build a separate transactions store.

Why chosen: Avoided duplicated financial source of truth.

Trade-offs:

- Reconciliation is straightforward.
- UI-specific fields must be derived on render/export.

Future considerations: If a persistent transaction ledger is required, derive it from the same canonical model, not from UI rows.

## Budget Pool Mapping

Decision: Map Actual Spend to Budget Pools by project, spend type, mapping date, and BE year. Multiple matches become `Needs PMO Review`.

Context: `findMatchingBudgetPools()` and `mapBudgetPool()` are the single mapping engine.

Alternatives considered: narrowest-pool-wins, first match, or silent automatic selection.

Why chosen: Ambiguous overlapping pools are intentional in the current business process and need PMO review rather than silent assignment.

Trade-offs:

- Prevents silent wrong budget usage.
- Requires manual review for ambiguous pools.

Future considerations: Add explicit priority/owner fields only if PMO wants deterministic automatic matching.

## Budget Pool Deletion As Soft Inactivation

Decision: Delete sets pool status inactive and is blocked while references exist.

Context: `deletePoolAsync()` patches `status = "inactive"`. `deleteBudgetPool()` calls `budgetPoolDeletionBlockers()`.

Alternatives considered: hard delete or cascade to unbudgeted.

Why chosen: Budget mappings are audit-sensitive and should not silently disappear.

Trade-offs:

- Preserves historical references.
- Requires PMO cleanup before deactivation.

Future considerations: Add an explicit reassign workflow for referenced pools.

## Hardware Purchase Orders Before Devices

Decision: Completed HW memos create POs; devices are created only when arrivals are marked.

Context: `createPurchaseOrdersFromMemo()` runs after HW completion; `markArrived()` creates device rows.

Alternatives considered: create devices immediately on memo approval.

Why chosen: Approval authorizes purchase; it does not prove physical asset arrival.

Trade-offs:

- Accurate registry.
- Requires users to maintain PO statuses.

Future considerations: Add purchase receiving controls or integration with procurement systems.

## Historical Hardware Device Links

Decision: Historical/manual HW spending can link to existing devices through a join table, without POs or new device creation.

Context: `historical_spending_device_links` and `linkDevicesToHardwareLineAsync()` enforce one device linked to one historical line.

Alternatives considered: add fake POs or mutate device memo fields.

Why chosen: Historical spending is not a live procurement workflow.

Trade-offs:

- Clean separation from approved memo/PO device flow.
- Hardware line ids live inside JSONB `historical_memos.hw_items`.

Future considerations: Normalize historical hardware lines if linking grows in complexity.

## License Inventory From Memo Lines Plus Manual Rows

Decision: Derive memo licenses from completed SL `slItems` and merge manual license rows from `licenses`.

Context: `getAllLicenses()` combines memo-derived and manual records; manual rows can supplement matching memo ids with owner/department/status/note.

Alternatives considered: copy memo license lines into `licenses`.

Why chosen: Prevented duplicate source data and kept memo line items authoritative.

Trade-offs:

- Inventory calculation is dynamic.
- Manual overlay matching depends on stable generated ids.

Future considerations: If license inventory becomes operationally independent, add a server-side derived inventory table with memo line provenance.

## Legacy Compatibility First

Decision: Preserve compatibility paths rather than rewrite data immediately.

Examples:

- HTML parsing fallback for old SL/HW memo sections.
- Legacy authority title text fallback.
- Legacy signature name/alias fallback.
- PostgREST schema-cache fallback on newer columns.
- LocalStorage fallback for Supabase outages.

Trade-offs:

- Safer rollout.
- More duplicate or transitional code paths.

Future considerations: Remove compatibility paths only after a data audit and migration/backfill.
