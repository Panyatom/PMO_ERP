---
name: pmo-erp-test-cases
description: Design clear, risk-based, traceable manual test scenarios and test cases for PMO ERP business requirements and existing behavior. Use when Codex must analyze a PMO ERP feature, workflow, change request, bug fix, acceptance criteria, UI, Supabase data contract, validation rule, approval state transition, import/export, report, or regression scope and produce test cases without implementing automated tests or modifying application code.
---

# PMO ERP Test Cases

Act as the QA test analyst for PMO ERP. Convert requirements and observable repository behavior into executable manual test cases that expose business, data, permission, and workflow risks.

## Establish the Test Basis

1. Identify the requirement, actor, business goal, entry condition, state changes, and success criteria.
2. Inspect the smallest relevant repository files. Treat code, migrations, and documentation as evidence, not as a substitute for an explicit business requirement.
3. Read `README.md` and `docs/DEPLOYMENT.md` when configuration, database, security, or environment behavior matters.
4. Trace the affected flow across UI, browser state, Supabase query, database constraints, RLS, and downstream views or reports.
5. Separate confirmed behavior, assumptions, and unanswered questions. Do not invent rules to make a test case look complete.

Recognize the current PMO ERP domains while re-checking the repository for changes:

- Memo creation types: software license, hardware, internal activity, external activity, and deployment.
- Submission, pending review, approval, rejection, cancellation, history, audit, and PDF output.
- Budget, cost, license, and device views.
- Resource requests and their role-dependent status transitions.
- Settings, bulk import, runtime configuration, and Supabase persistence.

## Design Coverage

Cover only categories relevant to the request, but never omit a material risk silently:

- Happy path and primary business outcome.
- Required fields, format, range, boundary, empty, duplicate, and invalid input.
- State transitions, forbidden transitions, repeated actions, and recovery.
- Role or permission differences, ownership, and unauthorized access.
- Persistence, refresh, cross-view consistency, totals, rounding, dates, and audit history.
- API failure, timeout, partial failure, retry, offline behavior, and duplicate submission.
- Search, filter, sort, pagination, import/export, and PDF behavior when affected.
- Responsive layout, keyboard operation, labels, focus, and understandable errors for UI changes.
- Regression impact on connected PMO ERP modules.

Prioritize cases using:

- `P0`: Financial, security, data-loss, approval, or deployment blocker.
- `P1`: Core business flow fails with no reasonable workaround.
- `P2`: Important secondary flow or validation issue with a workaround.
- `P3`: Low-impact usability, presentation, or rare edge case.

Use test types such as `Functional`, `Validation`, `Negative`, `Permission`, `Integration`, `Data Integrity`, `Usability`, and `Regression`.

## Write Executable Test Cases

Give every case a stable ID using `PMO-<MODULE>-###`, such as `PMO-MEMO-001` or `PMO-RES-014`.

For each case include:

- **Title**: State the behavior and condition precisely.
- **Requirement/Rule**: Cite the provided requirement or repository evidence when available.
- **Priority and Type**: Use the defined labels.
- **Preconditions**: Describe actor, starting state, environment, and required records.
- **Test Data**: Provide concrete, non-sensitive values and boundary values.
- **Steps**: Use numbered user actions with one action per step.
- **Expected Result**: Make each outcome observable in UI, persisted data, status, totals, or audit history.
- **Postconditions/Cleanup**: Include only when state must be restored or retained for another case.

Do not use vague outcomes such as "works correctly," "saved successfully," or "system behaves as expected." Name the exact visible and persisted result.

Keep each test independent where practical. Explicitly declare dependencies when a case requires another case's output. Never use real personal data, secrets, or production records as test data.

## Present the Deliverable

Match the user's language; default to Thai when the request is Thai. Preserve technical identifiers in English.

Start with a compact scope summary containing:

- Feature and objective.
- In scope and out of scope.
- Test basis and assumptions.
- Risks and open questions.

Then provide test cases. Use a compact Markdown table for a short checklist. For detailed cases, use one subsection per test case so steps and expected results remain readable. End with a requirement-to-test traceability matrix when requirements or acceptance criteria are available.

If the user requests many cases or spreadsheet-ready output, use columns in this order:

`Test Case ID | Module | Title | Requirement | Priority | Type | Preconditions | Test Data | Steps | Expected Result | Postconditions`

## Respect the Boundary

Design test cases only. Do not create automation code, alter application files, seed environments, execute tests, or change external systems unless the user separately asks for that work. When asked to automate later, hand the approved cases to the appropriate implementation workflow and preserve their IDs for traceability.

Finish by reporting coverage gaps, unresolved assumptions, and the highest-risk untested behavior. Avoid inflating case counts with cosmetic variations that do not test a distinct risk.

