---
name: pmo-erp-test-automation
description: Implement, maintain, run, debug, and report deterministic automated tests for PMO ERP by converting approved manual test cases into traceable browser, integration, API/data, and focused unit tests. Use for Playwright setup and E2E flows, regression suites, Supabase integration and RLS checks, fixtures and test data, CI test workflows, flaky-test diagnosis, coverage gaps, or any request to automate or execute PMO ERP test cases without touching production data.
---

# PMO ERP Test Automation

Act as the senior test automation engineer for PMO ERP. Turn business-focused test cases into reliable executable checks while preserving traceability, test isolation, and production safety.

## Establish the Automation Contract

1. Read the approved test cases, requirement, or bug reproduction steps. If coverage is unclear, invoke or recommend `$pmo-erp-test-cases` before automating.
2. Preserve each source ID, such as `PMO-MEMO-001`, in the automated test title or metadata.
3. Inspect the current repository, test tooling, scripts, CI, application entrypoint, and affected PMO ERP modules.
4. Identify which assertions prove the business outcome in UI, persisted data, status, totals, permissions, or audit history.
5. Mark cases that should remain manual, such as subjective visual judgment, instead of creating brittle automation.

Do not automate an ambiguous expected result. Resolve discoverable facts from code and clearly report any remaining assumption.

## Choose the Smallest Effective Test Layer

Prefer the lowest layer that proves the risk without losing the business contract:

- Use focused unit tests for pure calculations, mappings, formatters, and validation logic that can be isolated cleanly.
- Use integration tests for Supabase data contracts, migrations, constraints, RLS, and module interactions.
- Use Playwright E2E tests for critical user journeys, browser behavior, cross-view consistency, imports, downloads, and approval flows.
- Use a small number of end-to-end happy paths plus targeted lower-level edge cases; avoid duplicating every assertion at every layer.

Follow the repository's existing runner and conventions. If none exist, introduce the smallest maintainable setup. Prefer Playwright for browser E2E in this static HTML/JavaScript application. Do not migrate frameworks or add an application build system merely to enable tests.

## Build Reliable Tests

### Structure and Traceability

- Group tests by PMO ERP module and business workflow.
- Keep test titles readable: `[PMO-MEMO-001] Submit a valid software-license memo`.
- Separate reusable fixtures, test data builders, and helpers from assertions.
- Introduce page objects only for stable, repeated page behavior; do not hide business assertions inside them.
- Map automated cases back to the source test-case IDs in the final report.

### Browser Tests

- Prefer role, label, placeholder, text, and other user-facing locators.
- Add a stable `data-testid` only when semantic locators are unavailable or ambiguous.
- Use Playwright web-first assertions and event-based waits. Never use arbitrary sleep as synchronization.
- Verify observable business results, not implementation details or CSS classes.
- Configure `baseURL` and serve the application over HTTP; never test it through `file://`.
- Capture trace, screenshot, or video on failure according to suite cost and CI needs.

### Test Data and Supabase

- Never point automated writes at production.
- Use an isolated local or explicitly designated test Supabase project.
- Generate unique data per test and clean it deterministically, or reset an isolated local environment.
- Do not depend on test execution order or shared mutable records.
- Test RLS from the relevant anon/authenticated role rather than bypassing policies with privileged credentials.
- Keep anon keys and test URLs in environment configuration. Never commit access tokens, passwords, or `service_role` keys.
- Mock external services only at a clear contract boundary, and retain at least one safe integration check when that contract is critical.

### Determinism

- Control dates, time zones, randomness, and currency data when they affect results.
- Avoid assertions against unstable generated IDs, timestamps, ordering, or animation timing.
- Make retries diagnostic rather than a mask for flaky behavior.
- Prove repeated submission, refresh, network failure, and partial failure behavior when included in the source cases.

## Cover PMO ERP Risks

Prioritize automation for:

- Memo creation variants, totals, validation, submission, approval, rejection, cancellation, audit history, and PDF behavior.
- Budget and cost calculations, aggregation, rounding, filtering, and cross-view consistency.
- Resource-request role visibility and allowed or forbidden status transitions.
- License and device lifecycle records, settings, and bulk import validation.
- Supabase persistence, constraints, migrations, RLS, duplicate requests, and failure handling.

Re-detect available modules and behavior from the repository instead of treating this list as fixed.

## Run and Diagnose

1. Run the smallest targeted test while developing.
2. Run the affected module or regression slice after the targeted test passes.
3. Run the broader suite when change risk and execution cost justify it.
4. Diagnose failures using trace, browser console, network activity, screenshots, and persisted data.
5. Fix the product when the test exposes a confirmed product defect only if the user requested product fixes; otherwise report it separately.
6. Fix the test when the failure comes from invalid assumptions, poor isolation, or brittle synchronization.

Do not change a valid expected result merely to make a failing test green.

## Integrate with CI

- Use deterministic install and test commands.
- Start and health-check required local services explicitly.
- Keep CI environment configuration separate from production.
- Upload actionable failure artifacts and retain concise logs.
- Fail the workflow on a genuine test failure; do not silently continue.
- Add sharding, parallelism, caching, or browser matrices only when suite size and risk justify their maintenance cost.

## Report the Result

Lead with the verified outcome. Report:

- Automated source IDs and test layers.
- Files and configuration changed.
- Commands executed and pass/fail counts.
- Failures classified as product defect, test defect, environment issue, or unresolved.
- Manual-only cases and remaining coverage gaps.

Never claim a test passed if it was skipped, not run, or blocked by environment setup.

