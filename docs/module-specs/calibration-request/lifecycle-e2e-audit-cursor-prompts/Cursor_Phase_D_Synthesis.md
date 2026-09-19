# PHASE D — SYNTHESIS / FINAL REPORT (Audit Task 4 of 4)

## HARD RULE — READ THIS FIRST AND OBEY IT THE ENTIRE SESSION
You are in READ-ONLY AUDIT MODE.
- Do NOT edit, create, delete, rename, move, or refactor ANY file except the ONE output file
  named at the bottom of this prompt.
- Do NOT run any command that writes to disk, installs packages, generates code, runs
  migrations, or modifies git state.
- This is Phase D of 4, the FINAL phase. You are NOT re-inspecting the repo from scratch. You
  ARE synthesizing three existing notes files into one final report. Read all three first:
  - `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-A-discovery.md`
  - `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-B-domain-deepdive.md`
  - `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-C-crosscutting.md`
- You MAY re-check specific evidence in the actual repo files if a citation in the notes is
  unclear, but do NOT redo the full discovery/deep-dive/cross-cutting work. This phase is about
  organizing, deduplicating, and concluding — not new investigation.

## Context (facts — do not re-derive, just use these)
- Single-tenant system (`companyId` from `.env`). Single currency (IDR). Customer-facing
  portal out of scope. Lifecycle: Calibration Request → Quotation → Purchase Order →
  Work Order → Invoice → Payment. Apps: `apps/api` (backend), `apps/portal` (management,
  live), `apps/tech-pwa` (technician PWA).

## Your Task, Step by Step

1. Read all three phase notes files completely.
2. Merge and deduplicate findings — if the same issue appears in both Phase B and Phase C,
   merge into one finding, keep the most complete evidence citation.
3. Sort ALL findings by their MVP Relevance tag into 4 buckets:
   - `Blocker-for-MVP` → goes into report Section 14 (Blockers)
   - `Post-MVP-hardening` with clearly high impact → Section 15 (High-Risk)
   - `Post-MVP-hardening` with moderate impact → Section 16 (Medium-Risk)
   - `Nice-to-have` → Section 17 (Low-Risk)
   (Use your judgment on high vs moderate impact within Post-MVP-hardening, but every item
   must still carry its original MVP Relevance tag visibly in the writeup.)
4. Build Section 18 (Safe to Proceed vs Not Yet Safe): for each of the 6 lifecycle stages,
   state plainly whether implementation work can proceed now, or must wait, and cite which
   Blocker(s) it's waiting on if it must wait.
5. Build Section 13 (Documentation Gaps/Contradictions) from anything noted across all three
   phases as doc-vs-code or doc-vs-doc mismatches.
6. Write ONE overall verdict — GREEN, YELLOW, or RED — based purely on whether any
   Blocker-for-MVP findings exist:
   - RED = 1 or more Blocker-for-MVP findings that affect core lifecycle correctness
     (numbering, relationships, financial totals, core state transitions).
   - YELLOW = no core-correctness blockers, but several unresolved High-Risk items that should
     be fixed before go-live even if technically "post-MVP" in category.
   - GREEN = no Blockers, High-Risk items are genuinely optional/deferrable.
7. Executive summary is OPTIONAL — write it LAST, keep it to 3-5 sentences max, do not spend
   significant effort polishing it.

## Output

Write the final report to exactly this ONE new file (do not touch any other file):

`D:\medcal\docs\claude\plans\Calibration-management\audit-technician-portal-e2e.md`

Use exactly this structure:

```markdown
# Audit Report: Technician App & Portal Management App — E2E Lifecycle

## Verdict: [GREEN / YELLOW / RED]
[brief evidence-based justification, cite specific Blocker findings if RED/YELLOW]

## 1. Numbering Architecture (documentNumberingSequence)
## 2. Document Lifecycle & Relationships
## 3. State Machine Audit
## 4. Technician App (apps/tech-pwa) Audit
## 5. Portal Management App (apps/portal) Audit
## 6. API & Backend Boundary Audit (apps/api)
## 7. Database/Domain Model Audit (Prisma)
## 8. Authorization & Company-Scoping Consistency
## 9. Financial Consistency
## 10. Frontend/Backend Contract Consistency
## 11. Deployment/Routing Boundary Notes
## 12. Implementation Sequence Risk
## 13. Documentation Gaps / Contradictions
## 14. Blockers (must resolve before implementation proceeds)
## 15. High-Risk Issues
## 16. Medium-Risk Issues
## 17. Low-Risk Issues
## 18. Safe to Proceed Now vs. Not Yet Safe (per lifecycle stage)

## Appendix: Evidence Index
[file:line references, deduplicated from all three phase files]

## Executive Summary (optional, write last, max 5 sentences)
```

Every finding carried into this report must retain its evidence citation and its MVP
Relevance tag. Do not drop tags during synthesis.

## FINAL REMINDER
Read-only audit. The repository must be unchanged except for the single new file above. This
is the last phase — after writing this file, stop. Do not propose fixes, do not start
implementing anything, even if asked implicitly by the findings.
