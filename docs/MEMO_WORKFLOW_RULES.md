# Memo Workflow Rules

## Workspace

- Create Memo = Create/Edit Draft
- Pending Approval = Work Queue
- History / All Memo = Related Memo Tracker + Audit/View Workspace

History / All Memo may include pending-family memos when the user is related to the memo:

- pending
- pending_a2
- pending_a3

Pending-family memos opened from History / All Memo are view-only for approval actions. Approve, Reject, Cancel, and PMO Override are not shown there.

Pending Approval remains the action workspace for pending-family memos.

## Identity

- Requester: the user who creates and submits the memo.
- Reviewer: A1, the first reviewer in the approval chain.
- Approver: A2/A3, the approval stages after A1.
- PMO: an additional privilege, not an approval stage.

## Normal Approve / Reject

Only the current assigned reviewer or approver may use normal Approve / Reject.

PMO may also use normal Approve / Reject only when PMO is the current assigned reviewer or approver.

## PMO Override

PMO Override is a separate authority.

PMO Override requires:

- Reason
- Evidence

PMO requester self-override is allowed.

PMO Override is stage-based. The positive override outcome resolves the current approval stage only:

- pending advances to pending_a2 when A2 exists
- pending advances to completed when A2 does not exist
- pending_a2 advances to pending_a3 when A3 exists
- pending_a2 advances to completed when A3 does not exist
- final stage advances to completed

Reject or cancel override outcomes remain terminal when supported by the UI.

Override may complete, reject, or cancel the memo internally, but the UI action is called only:

"PMO Override"

## Cancel

Requester may cancel own pending memo.

PMO who is not requester must use PMO Override instead.

PMO requester may cancel as requester.

## Duplicate

Duplicate is allowed only for:

- Requester
- PMO

## Self Review

Requester = Reviewer A1 auto bypass.

Requester must not be selectable as:

- A2
- A3

A2/A3 auto-bypass is not implemented.

## Download

Anyone who can legitimately view the memo may download it.

## Single Action Principle

For each user, each screen exposes only the primary action or actions for that user's authority.

Exception:

PMO who is also the current assigned approver may see both:

- Approve / Reject
- PMO Override

because they represent different authorities.
