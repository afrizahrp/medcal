# EXECUTE — Batch A (Tier 0 MoM 2026-09-14): #7, #4, #2

## Mode

STAGE 2 — IMPLEMENT. This follows an approved Stage 1 audit (Cursor, Ask mode,
2026-09-15) whose findings and decisions are given below as ground truth — do not
re-investigate or re-propose alternatives for anything already decided here.

**Step-by-step with mandatory checkpoint.** Implement the three items below **in order**.
After finishing each item (code changed, self-verified, ready for review), **STOP** and
report what changed (files touched, brief diff summary) — do NOT start the next item
until you get an explicit go-ahead in the next message. This is a hard rule, not a
suggestion: no big-bang implementation across all three items at once.

Order: **#7 → #4 → #2** (simplest/lowest-risk first, matching the approved sequencing).

## Decisions already made (do not re-ask)

- **#3 and #5 are explicitly OUT OF SCOPE for this batch** — do not touch device-name
  display logic (alias/master) or any Device/RBAC/permission code while doing #7, #4, #2.
  (#3 is unblocked for a future batch now that alias-on-top/master-below is decided, but
  it is not part of this run.)
- **Tax #2**: no snapshot field, no schema change. `Tax.isExclude` is read live from its
  own master table via the existing `taxCode` reference, exactly as it works today —
  that is accepted as final, not a decision to revisit or flag as a risk.
- **AKD/AKL #4**: scope is Portal only. Do NOT touch tech-pwa's AKD/AKL display inside
  escalate / gate / Identity Correction — per the audit, that's functional workflow, not
  a redundant declaration field, and stays exactly as-is.
- The WO↔LK (MeasurementResult) task mentioned earlier remains parked — do not reference
  or touch it.

## Item 1 — [MoM #7] Relabel "Device ID" → "Serial No"

**Current state (from audit):** `CalibrationRequestItem.deviceId` is a free-text field
(not an FK). The label "Device ID" appears in: Portal requisition new/edit, import,
Excel template, and the prefix on Quotation/PO PDFs. This is separate from
`CalibrationJob.deviceId` (an FK to `Device`, used in job identity/`identityIncomplete`
messaging) — that FK and its labels/messages must NOT be touched.

**Do:**
1. Find every UI location listed above where the label reads "Device ID" in the
   requisition context (`CalibrationRequestItem.deviceId`) and change the display label
   to "Serial No". Keep writing to the same `deviceId` field — no rename of the
   underlying field/column, no DTO/API change.
2. Update the Excel import template's column header/label to match.
3. Confirm (grep/search) that no requisition-side validation or logic treats this as
   requiring the separate `Device.serialNumber` field — if you find any such coupling,
   STOP and report it instead of changing it (that would be a bigger change than scoped
   here).
4. Explicitly verify you have NOT touched any `CalibrationJob.deviceId` (FK) label or the
   `identityIncomplete` message — these keep saying "Device ID" as before.

**Then STOP and report.**

## Item 2 — [MoM #4] Hide AKD/AKL input in Portal (non-mandatory, no notification)

**Current state (from audit):** `akdAkl` is already nullable (`String?`), with
`akdAklDeclaration` defaulting to `NOT_PROVIDED`. Zod validation is already optional,
only firing if `CUSTOMER_PROVIDED` is selected without a number. Portal still shows the
field in requisition new/edit/detail/import. Tech-pwa shows AKD/AKL inside detail,
escalate, and Identity Correction — not as a mandatory form field.

**Do:**
1. In Portal's calibration-requests `new`, `[id]/edit`, `detail`, and copy-import views:
   remove/hide the AKD/AKL declaration input and any related label, so the field is
   never shown and never blocks submission.
2. Do NOT change the underlying schema (`akdAkl`, `akdAklDeclaration` stay as-is) and do
   NOT change the Zod validation logic itself — just stop rendering the input (removing
   a now-dead validation branch, if any, is fine, but the nullable/default behavior must
   remain identical).
3. Leave tech-pwa completely untouched for this item (see "Decisions already made"
   above) — no changes to escalate, gate, or Identity Correction UI or logic.
4. Confirm existing `CUSTOMER_PROVIDED` records with a stored AKD/AKL number still
   display correctly wherever they're read elsewhere (e.g. detail/read-only views you are
   NOT hiding, if any remain) — don't break rendering of historical data.

**Then STOP and report.**

## Item 3 — [MoM #2] Hide tax amount line when Tax is Include

**Current state (from audit):** `Tax.isExclude` (`false` = Include, `true` = Exclude)
already exists and is used correctly in `computeHeaderTotals` (quotations.service.ts) and
Portal's `previewTotals`. `QuotationTotals` (Portal UI) and the quotation PDF currently
always render the tax line whenever `taxCode`/`taxAmount` are present, regardless of
Include/Exclude.

**Do:**
1. In `QuotationTotals` (quotations-ui.tsx) and in `quotation-pdf.ts`: when the
   quotation's tax is in Include mode (`Tax.isExclude === false`, looked up live via
   `taxCode` exactly as done today — no snapshot), suppress rendering of the separate tax
   amount line. The total shown must stay exactly as-is (already tax-inclusive) — only
   the breakdown line is hidden.
2. When Exclude (`isExclude === true`), behavior is unchanged — tax line still shows.
3. Scope is Quotation only. Do NOT extend this to PO in this batch (if you believe PO
   should be made consistent too, note it in your report as a follow-up suggestion —
   don't implement it here without confirmation).
4. If any DTO/query doesn't currently expose enough of `Tax` (e.g. `isExclude`) to the
   component/PDF doing the rendering, it's fine to extend that query/DTO minimally to
   pass it through — that's still UI+API scope per the approved plan, not a schema
   change.

**Then STOP and report.**

## Final wrap-up (only after all 3 items done and reviewed)

Once all three items have been implemented and reviewed one at a time, provide a short
combined summary: files touched across all three items, and confirm nothing outside the
scoped items (#3, #5, MeasurementResult/CalibrationTestPoint/DeviceCalibrationParameter,
WO↔LK) was modified.
