# PHASE C — CROSS-CUTTING AUDITS (Audit Task 3 of 4)

## HARD RULE — READ THIS FIRST AND OBEY IT THE ENTIRE SESSION
You are in READ-ONLY AUDIT MODE.
- Do NOT edit, create, delete, rename, move, or refactor ANY file except the ONE output file
  named at the bottom of this prompt.
- Do NOT run any command that writes to disk, installs packages, generates code, runs
  migrations, or modifies git state.
- You MAY run strictly read-only commands (`ls`, `find`, `grep`, `cat`, `git log`) to inspect
  the repo. If unsure whether a command writes to disk, DO NOT RUN IT — note the limitation
  instead.
- This is Phase C of 4. Read BOTH of these first, they are your inputs:
  - `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-A-discovery.md`
  - `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-B-domain-deepdive.md`
  Do not redo their work. Build on top of them, especially the "Flag for Phase C" list at the
  end of Phase B.

## Context (facts — do not re-derive, just use these)
- Single-tenant system. `companyId` sourced from `.env` — NOT multi-tenant SaaS. Do not audit
  for cross-company data leaks between different companies; audit instead whether `companyId`
  is consistently read from env config everywhere it's needed, with no hardcoded or missing
  values.
- Single currency (IDR). Do not flag missing multi-currency support. Only flag
  rounding/decimal issues if they cause an ACTUAL visible mismatch in totals today.
- Customer-facing portal is OUT OF SCOPE.

## Your Checklist for This Phase

Go through EACH of these 7 audit topics ONE AT A TIME, in this exact order:

**1. State Machine Consistency**
Using the status/enum fields found in Phase B for all 6 stages, list every valid status per
document type, then check: any impossible transitions, missing transitions, ambiguous or
duplicated status concepts, contradictory status fields, transitions not restricted by role,
transitions that don't propagate to dependent documents. Focus especially on: cancellation,
rejection, revision, reopening, partial completion, partial invoicing, payment allocation.

**2. Authorization & Company-Scoping**
Check: is `companyId` consistently sourced from `.env` everywhere records are created/queried?
Are there hardcoded company values anywhere? Is there object-level access control so one
technician can't access another technician's unrelated Work Orders, or one management user
action isn't improperly exposed? Is enforcement at API/service layer, not just UI?

**3. API Boundary & Backend Responsibility**
For the critical transitions found in Phase B (status changes, document creation, numbering
consumption): are business rules enforced server-side? Are critical transitions wrapped in a
database transaction? Look specifically for: duplicate-creation risk on double-submit/retry,
duplicate-numbering risk, idempotency handling (or lack of it) on repeated API calls.

**4. Partial Processing Correctness**
Can individual calibration items/equipment within one transaction progress independently? Can
completed items be invoiced without waiting for all items in the originating transaction? If
partial invoicing exists, do totals/outstanding amounts/payment allocations stay mathematically
consistent? If it does NOT exist, note that as a finding (not necessarily a blocker — depends
on whether the docs require it).

**5. Financial Consistency (single-currency scope)**
Where do price/qty/tax/discount/total/invoiceable/paid/outstanding amounts get calculated —
frontend, backend, or both? If both, is there duplicated logic that could drift out of sync?
Flag ONLY real mismatches you can point to, not theoretical rounding concerns.

**6. Frontend/Backend Contract Consistency**
For `apps/portal` and `apps/tech-pwa`: do DTOs/API response shapes/enums/status labels used in
frontend code actually match what the backend returns? Look for frontend code assuming a
field, endpoint, or status value that you could not find in the backend.

**7. Implementation Sequence Risk**
Based on everything found in Phase A and B: does the current/planned order of building things
depend on anything not yet stable (e.g. building Work Order UI before Purchase Order status
transitions are finalized)? Any circular dependency or missing prerequisite?

**For each topic, write findings using EXACTLY this format:**

```
### [Topic Name] — [short finding title]
- Evidence: [file:line or file:function]
- What it means: [1-3 sentences, factual, no speculation]
- MVP Relevance: [Blocker-for-MVP / Post-MVP-hardening / Nice-to-have]
```

Do NOT write an overall verdict yet — that is Phase D's job.

## Output

Write your findings to exactly this ONE new file (do not touch any other file):

`D:\medcal\docs\claude\plans\Calibration-management\audit-phase-C-crosscutting.md`

Structure:

```markdown
# Phase C — Cross-Cutting Findings

## 1. State Machine Consistency
## 2. Authorization & Company-Scoping
## 3. API Boundary & Backend Responsibility
## 4. Partial Processing Correctness
## 5. Financial Consistency
## 6. Frontend/Backend Contract Consistency
## 7. Implementation Sequence Risk

## Commands I Could NOT Run (and why)
[list]
```

## FINAL REMINDER
Read-only audit. The repository must be unchanged except for the single new file above. Go
through all 7 topics — do not stop early, do not skip a topic even if Phase B flagged nothing
for it (still check it directly against the repo).
