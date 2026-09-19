# PHASE B — DOMAIN DEEP-DIVE (Audit Task 2 of 4)

## HARD RULE — READ THIS FIRST AND OBEY IT THE ENTIRE SESSION
You are in READ-ONLY AUDIT MODE.
- Do NOT edit, create, delete, rename, move, or refactor ANY file except the ONE output file
  named at the bottom of this prompt.
- Do NOT run any command that writes to disk, installs packages, generates code, runs
  migrations, or modifies git state.
- You MAY run strictly read-only commands (`ls`, `find`, `grep`, `cat`, `git log`) to inspect
  the repo. If unsure whether a command writes to disk, DO NOT RUN IT — note the limitation
  instead.
- This is Phase B of 4. Read `D:\medcal\docs\claude\plans\Calibration-management\
  audit-phase-A-discovery.md` FIRST — it is your map from the previous phase. Use it, do not
  redo Phase A's work.

## Context (facts — do not re-derive, just use these)
- Monorepo: `D:\medcal\apps\api` (backend), `D:\medcal\apps\portal` (management, live),
  `D:\medcal\apps\tech-pwa` (technician PWA, subdomain pending prod deploy).
- Single-tenant system. `companyId` sourced from `.env`. Single currency (IDR).
- Customer-facing portal is OUT OF SCOPE. Assume Customer master data + numbering at Customer
  creation already works correctly — do not re-audit that stage, only use it as the anchor
  point for Calibration Request numbering/relationships.
- Docs folder: `D:\medcal\docs\claude\plans\Calibration-management\`

## Your Checklist for This Phase

Go through EACH of these 6 lifecycle stages ONE AT A TIME, in this exact order. Do not skip
ahead. For EACH stage, do all 5 sub-steps before moving to the next stage:

**Stages, in order:** (1) Calibration Request, (2) Quotation, (3) Purchase Order,
(4) Work Order, (5) Invoice, (6) Payment

**For each stage, do these 5 sub-steps:**
1. Find the Prisma model(s) for this stage. Note fields, relations, enums/status field,
   unique constraints, indexes.
2. Find the backend service/use-case/controller/route file(s) that create, update, and
   transition this document's status. Note file path + function names (do not paste large
   code blocks — summarize what each function does in 1-2 lines).
3. Find the relevant frontend page(s)/component(s) in `apps/portal` (management side) and, if
   applicable, `apps/tech-pwa` (technician side) that touch this stage.
4. Cross-check against the matching planning doc(s) in
   `D:\medcal\docs\claude\plans\Calibration-management\`. Note: does the doc match the code?
   Is something in the doc not in the code (planned-only)? Is something in the code not in
   the doc (undocumented)?
5. Write a short finding block using EXACTLY this format for anything notable (do this for
   as many items as you find — do not limit yourself to one):

```
### [Stage Name] — [short finding title]
- Status: [Already Implemented / Partially Implemented / Planned-Only / Referenced-Not-Implemented / Missing]
- Evidence: [file:line or file:function]
- What it means: [1-3 sentences, factual, no speculation]
- MVP Relevance: [Blocker-for-MVP / Post-MVP-hardening / Nice-to-have]
```

Do NOT write a summary, verdict, or recommendations section. Just findings per stage.
This phase does NOT cover cross-cutting concerns (state machine consistency across stages,
authorization, race conditions) — that is Phase C. If you notice something cross-cutting,
write a one-line note under a "Flag for Phase C" list instead of analyzing it here.

## Output

Write your findings to exactly this ONE new file (do not touch any other file):

`D:\medcal\docs\claude\plans\Calibration-management\audit-phase-B-domain-deepdive.md`

Structure:

```markdown
# Phase B — Domain Deep-Dive Findings

## 1. Calibration Request
[findings blocks]

## 2. Quotation
[findings blocks]

## 3. Purchase Order
[findings blocks]

## 4. Work Order
[findings blocks]

## 5. Invoice
[findings blocks]

## 6. Payment
[findings blocks]

## Flag for Phase C (cross-cutting concerns noticed but not analyzed here)
[one-line notes]

## Commands I Could NOT Run (and why)
[list]
```

## FINAL REMINDER
Read-only audit. The repository must be unchanged except for the single new file above. Do
not skip stages. Do not merge stages together. Go one at a time, in order.
