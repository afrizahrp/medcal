# CONTINUE — Batch A: finish Item 2, template cleanup, then Item 3 + Item 4 (#3)

## Amend Item 2 (MoM #4) — remove the historical-data exception

Portal `[id]/page.tsx` (detail view): the AKD/AKL row currently still renders when the
record is `CUSTOMER_PROVIDED` with a stored number. **Remove that exception — the row
must never render, with no condition, matching the literal MoM instruction ("hide semua
label dan inputan AKD/AKL")**. The underlying data (`akdAkl`, `akdAklDeclaration`) stays
in the database exactly as before — this is display-only, same as the rest of Item 2.

## New follow-up (do before Item 3) — Excel template + tooltip cleanup

Scope: `generate-requisition-template.ts` and the "Format Excel" tooltip on
`calibration-requests-page-client.tsx` (both currently still reference AKD/AKL/NIE — this
was left out of Item 1 because it belonged to Item 2's concern, not Item 1's).

1. Remove the `AKD/AKL/NIE` column from the generated Excel template
   (`generate-requisition-template.ts`) and from the "Petunjuk" sheet text. Regenerate
   `apps/portal/public/medcal-requisition-template.xlsx` the same way Item 1 did.
2. Remove the AKD/AKL/NIE mention from the "Format Excel" tooltip.
3. Importer (`calibration-request-import.service.ts`): follow the same backward-compat
   precedent as Item 1's Device ID/Serial No aliases — keep accepting an `akdAkl` column
   if present in an already-downloaded old template (no error, still stored), just don't
   document or advertise it anymore. Do not add new validation or make it required.
4. Update `calibration-request-import.service.test.ts` only as needed to reflect the
   template/tooltip text change — do not remove the existing "old template still works"
   style coverage.

Report both of the above together as a single checkpoint (call it "Item 2 — final"), then
wait for go-ahead before Item 3.

---

## Item 3 [MoM #2] — unchanged from the original brief

(Hide tax amount line in `QuotationTotals` + `quotation-pdf.ts` when `Tax.isExclude ===
false`, read live via `taxCode`, no snapshot, Quotation only — as already specified.)

---

## Item 4 [MoM #3] — device name display order (alias on top, master below)

**Decision (final):** on every document/view that shows both names, the customer-given
alias (`CalibrationRequestItem.customerDeviceName`) displays ON TOP, and the master name
(`DeviceType.name`) displays BELOW it, smaller/secondary. If alias is null, fall back to
showing master name alone (no empty line, no "null").

**Original audit scope (Quotation/PO/WorkOrder):**
1. Quotation, Purchase Order, and Work Order — item rows in each document's UI, PDF
   (`quotation-pdf.ts`, `purchase-order-pdf.ts`, `work-order-pdf-*`), and whatever
   query/DTO currently feeds each. Today's default description is `deviceType.name`
   (master) and `customerDeviceName` often isn't wired into the query/DTO at all for
   these three — confirm and add it where missing.
2. Avoid duplication: if a document currently shows master name as `description` AND you
   add alias-on-top, don't end up showing master name twice on the same row.

**New — investigate before implementing:** the calibration request (CRQ) detail view
(Portal and/or tech-pwa — see the screenshot pattern: "Blood Pressure Monitor" as the
heading, "Customer name: tensimeter digital" below it, i.e. master-first/alias-second,
same reversed order as the original #3 complaint) was NOT part of the original #3 audit
scope, which only covered Quotation/PO/WorkOrder. Before changing it:
1. Determine whether this CRQ detail view shares the same underlying
   component/query/DTO as the Quotation/PO/WO item rows, or is a separate, unrelated
   piece of UI.
2. If shared: fixing Quotation/PO/WO will very likely also need this component touched —
   include it in the same change, and confirm in your report that you checked for other
   call sites of that shared component so none are missed.
3. If NOT shared (separate component just showing the same underlying fields in its own
   layout): still apply the alias-on-top/master-below order here too for consistency
   (the decision is about the display order rule generally, not just three specific
   documents), but treat it as its own file/change, and say so explicitly in your report
   so it's clear it wasn't part of the original audited scope.
4. Either way, do NOT change anything else on that CRQ detail page (status banner,
   quotation link, cancel button, etc.) — only the device name ordering.

Report Item 4 as its own checkpoint before final wrap-up.

---

Continue the same rule as before: implement one numbered step at a time (Item 2 — final,
then Item 3, then Item 4), STOP and report after each, wait for explicit go-ahead before
the next.
