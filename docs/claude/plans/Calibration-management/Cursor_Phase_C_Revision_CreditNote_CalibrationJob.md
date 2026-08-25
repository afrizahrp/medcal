# PHASE C — REVISION PASS (small follow-up, not a new phase)

## HARD RULE
Still READ-ONLY AUDIT MODE. Do NOT edit/create/delete any file except the ONE file named
below. Do NOT run any write commands.

You already wrote `D:\medcal\docs\claude\plans\Calibration-management\
audit-phase-C-crosscutting.md`. Re-open and ADD to that same file (do not create a new file,
do not remove or rewrite anything already there). Resolve two open ambiguities left from the
current draft.

## What to check and add

**1. CREDIT_NOTE — does it need centralized document numbering?**
The current Section 7 finding says CREDIT_NOTE should be added to `DocumentType` enum
"jika diperlukan" without confirming whether it's actually needed. Check:
- Find the `CreditNote` model in `packages/db/prisma/schema.prisma`. Does it have a `number`
  (or similarly named) field?
- If yes, is there any unique constraint on that field (e.g. `@@unique([companyId, number])`
  or similar)?
- Check the planning docs in `D:\medcal\docs\claude\plans\Calibration-management\` for any
  mention of CreditNote numbering requirements.
Based on what you find, update the existing CREDIT_NOTE mention in Section 7 with a
definitive answer (not "if needed") — either "CREDIT_NOTE requires numbering: schema has a
unique `number` field at line X, must be added to DocumentType enum, tag Blocker-for-MVP for
CreditNote module" OR "CREDIT_NOTE does not require centralized numbering: [reason]".

**2. CALIBRATION_JOB — does it need centralized document numbering for customer-portal
traceability?**
This was NOT previously checked. Determine:
- Does the `CalibrationJob` model in the schema have any `number`, `code`, or similar
  human-readable identifier field (separate from its internal `id`)?
- Does `Certificate` (which is generated from an accepted CalibrationJob) already have its
  own `number` field with a unique constraint? (This was already flagged as needing
  DocumentType enum entry in the existing Section 7 findings — just confirm/cite it here.)
- Check planning docs for any explicit mention of a customer-facing tracking number/code for
  CalibrationJob specifically (separate from Certificate numbering or WorkOrder numbering).
- Based on what you find, add a new finding to Section 7 (or Section 0 if more appropriate)
  stating whether CALIBRATION_JOB needs its own DocumentType/numbering entry, or whether
  customer traceability is already covered by WorkOrder number + Certificate number combined
  (in which case CalibrationJob does NOT need its own numbered document type — state this
  explicitly with reasoning, don't leave it implicit).

Use the same finding format already used elsewhere in the file (Classification / Evidence /
What it means / MVP Relevance).

## Output
Save back to the same file, same path, same filename:
`D:\medcal\docs\claude\plans\Calibration-management\audit-phase-C-crosscutting.md`
Do not touch any other file. Confirm when done which two findings you added/updated.
