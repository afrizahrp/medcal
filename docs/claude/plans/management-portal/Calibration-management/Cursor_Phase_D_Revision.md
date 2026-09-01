# PHASE D — REVISION PASS (fix 4 issues, not a new phase)

## HARD RULE
Still READ-ONLY AUDIT MODE. Do NOT edit/create/delete any file except the ONE file named
below. Do NOT run any write commands.

You already wrote `D:\medcal\docs\claude\plans\Calibration-management\
audit-technician-portal-e2e.md`. Re-open and REVISE that same file (do not create a new one).
Your source-of-truth inputs are still:
- `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-A-discovery.md`
- `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-B-domain-deepdive.md`
- `D:\medcal\docs\claude\plans\Calibration-management\audit-phase-C-crosscutting.md`

Fix these 4 issues. Do not redo work that's already correct elsewhere in the file.

## Issue 1 — Verdict must follow the strict rule, no exceptions

The verdict rule is: **RED = 1 or more findings classified `Foundation Issue` AND tagged
`Blocker-for-MVP` exist, full stop.** There is no allowance for "blockers are easy to fix" or
"no architectural rework needed" softening the verdict to YELLOW. Those are true and useful
observations, but they belong in the verdict's justification text and in Section 18's
"Recommended First Steps" — they do NOT change the verdict color.

Your current draft has 4 Blocker-for-MVP findings (B1-B4) but chose verdict YELLOW. This is
wrong per the rule. Change the verdict to **RED**. Keep your existing justification prose
(the "straightforward to fix" reasoning is still valuable context), but state clearly that
the verdict is RED because Blocker-for-MVP findings exist, and that the practical severity is
tempered by them being well-defined, quick fixes with no architectural rework required —
i.e., explain the nuance in words, not by changing the color.

## Issue 2 — Sections 10, 11, 12 are missing entirely, add them back

The report currently jumps from Section 9 (Financial Consistency) straight to Section 13
(Documentation Gaps). Add the three missing sections in between, using content already
available in Phase C's notes file (`audit-phase-C-crosscutting.md`):

- **Section 10 — Frontend/Backend Contract Consistency**: pull from Phase C's "6. Frontend/
  Backend Contract Consistency" topic (Portal has no lifecycle UI yet, Tech-PWA is a minimal
  shell, `@medcal/shared` Zod schema pattern exists and should be continued).
- **Section 11 — Deployment/Routing Boundary Notes**: summarize what's known about
  `apps/portal` (live at apps.kalibrasimedika.co.id) vs `apps/tech-pwa` (subdomain registered,
  nginx/TLS deferred to production) vs shared `apps/api` backend, and note whether any
  business-logic duplication risk between the two frontends was observed (if Phase C found
  none because neither lifecycle UI is built yet, say that plainly).
- **Section 12 — Implementation Sequence Risk**: pull from Phase C's "7. Implementation
  Sequence Risk" topic — this is where the reasoning behind [B4] (WorkOrder depends on
  PurchaseOrder being stable) and the confirmed-safe sequence (CalibrationRequest can proceed
  independently; Quotation before PurchaseOrder) belongs as narrative, not just as a one-line
  "Fix" in Section 14.

## Issue 3 — Section 17 (Low-Risk) has misclassified items, revert to the original rule

The mapping rule is:
- `Foundation Issue` + `Blocker-for-MVP` → Section 14 (Blockers)
- `Foundation Issue` + `Post-MVP-hardening` (high impact) → Section 15 (High-Risk)
- `Foundation Issue` + `Post-MVP-hardening` (moderate impact) → Section 16 (Medium-Risk)
- `Foundation Issue` + `Nice-to-have` → Section 17 (Low-Risk)
- `Not Yet Built (expected)` items → do NOT go in Sections 14-17 at all. They belong only in
  the "Not Yet Built (Expected — Informational Only)" summary near Section 2.

Fix these specific misclassifications:
- **L2** ("State machine transition validation not built") is classified `Not Yet Built
  (expected)` in Phase C, not `Foundation Issue`. Remove it from Section 17 entirely. If not
  already reflected, make sure the "Not Yet Built" summary near Section 2 mentions that
  transition-validation logic will need to be built alongside each module (this is already
  implied by other entries, just confirm it's covered, don't duplicate a full new row if
  redundant).
- **L1** (PurchaseOrderStatus enum simplified vs planning doc) is tagged `Post-MVP-hardening`
  in Phase B/C, not `Nice-to-have`. Per the rule it belongs in Section 15 or 16, not 17. Move
  it there. Since Phase B/C's own reasoning says this is a minor visibility-only gap (not
  business-logic-blocking), Section 16 (Medium-Risk) is the more defensible bucket — but make
  the judgment explicit in one sentence rather than moving it silently.

After these two moves, re-check every other item currently in Sections 14-17 against its
original Classification + MVP Relevance tag from Phase B/C, and correct any other mismatches
you find using the same rule above.

## Issue 4 — Appendix: Evidence Index is missing, add it

Add an "## Appendix: Evidence Index" section at the end of the report (before or after the
Executive Summary — keep Executive Summary as the very last section). List every unique
file:line citation used anywhere in the report, deduplicated, in this format:

```
- `path/to/file.ts:LINE` — one-phrase reminder of what this evidence supports (e.g.
  "DOCUMENT_TYPE_NUMBER_TABLE missing PURCHASE_ORDER/WORK_ORDER mappings")
```

Group them by file for readability if there are many citations from the same file.

## Output

Save the revised report back to the same file, same path:
`D:\medcal\docs\claude\plans\Calibration-management\audit-technician-portal-e2e.md`

Do not touch any other file. When done, confirm: (a) new verdict color, (b) that Sections
10-12 are now present, (c) how many items were moved out of Section 17 and to where, (d) that
the Evidence Index section now exists.
