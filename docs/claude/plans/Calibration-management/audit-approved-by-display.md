# Audit: "Approved By" Raw User ID Display Bug

> Stage 1 — diagnosis and proposal only. Nothing was implemented; no code, schema, query,
> or UI file was modified while producing this report.

## Summary

This is a display bug, and the stored data is correct — but the root cause is one level
deeper than "the UI forgot to use a resolved name". `PurchaseOrder.confirmedByUserId` is
one of only **two** actor columns in the entire schema that has **no Prisma relation to
`User`** (the other is `Quotation.approvedByUserId`). Every other `*ByUserId` column in
the codebase — 27 of 29 — declares a `User` relation, is pulled into its service's
`include`/`select` as `{ id, name }`, and is rendered in the UI as `…By?.name ?? "—"`.
Because the PO has no relation, the API physically cannot return a name today, the PO
DTO carries only the raw id, and [`purchase-orders/[id]/page.tsx:234`](../../../../apps/portal/src/app/management/purchase-orders/%5Bid%5D/page.tsx#L234)
prints that id verbatim. The value written by
[`purchase-orders.service.ts:324`](../../../../apps/api/src/modules/purchase-orders/purchase-orders.service.ts#L324)
is the authenticated actor's `User.id`, so the 32-character string in the screenshot is a
valid id (Better Auth-issued, not a Prisma `cuid()`), not corrupt data. Nothing needs
backfilling; the fix is about exposing the name, and the main decision is *how* to expose
it given the missing relation.

## PO Case (Step 0)

**Render site** — confirmed path:

| Layer | File | Detail |
|---|---|---|
| UI | `apps/portal/src/app/management/purchase-orders/[id]/page.tsx:233-235` | `<DetailField label="Approved By">{purchaseOrder.confirmedByUserId ?? "—"}</DetailField>` — the raw id is the value being rendered. Only shown when `status === "APPROVED"`. |
| Portal DTO | `apps/portal/src/app/management/purchase-orders/purchase-orders-ui.tsx:90-91` | `PurchaseOrderRow` declares `confirmedAt: string \| null; confirmedByUserId: string \| null;` — there is **no** `confirmedBy` object to ignore. The UI is not overlooking a resolved name; none is sent. |
| API query | `apps/api/src/modules/purchase-orders/purchase-orders.service.ts:25-48` (`purchaseOrderInclude`) | Includes `items`, `customer`, `quotation` — **no user relation of any kind**. `PurchaseOrderWithItems` is `Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>`, so the response carries the scalar column only. |
| Write path | `apps/api/src/modules/purchase-orders/purchase-orders.service.ts:319-327` (`approve`) | `confirmedAt: new Date(), confirmedByUserId: userId` — `userId` comes from the authenticated request in `purchase-orders.controller.ts:111-118` (`@RequirePermission("purchaseOrder", "approve")`). The id is genuine. |
| Schema | `packages/db/prisma/schema.prisma:1716-1717` (model `PurchaseOrder`) | `confirmedAt DateTime?` / `confirmedByUserId String?` — declared as a bare `String?`. The model's relation block lists `company`, `customer`, `quotation`, `items`, `workOrders` and **no `confirmedBy User?` relation**. `User` likewise has no back-relation for it. |

**Answer to the Step 0 questions:** the value is `confirmedByUserId` read straight off the
PO record; there is no join or lookup anywhere in the chain; and the API is *not* already
returning an unused user object — the relation does not exist server-side, so `include`
cannot currently fetch it without a schema change or a separate query.

## Blast Radius Check (Step 1)

I enumerated every `*ByUserId` column in `schema.prisma` and matched each against its
`User` relation, then checked each render site in Portal and tech-pwa.

### Schema-level: which actor columns lack a `User` relation

| Column | Relation | Note |
|---|---|---|
| `PurchaseOrder.confirmedByUserId` | **NONE** | The reported bug |
| `Quotation.approvedByUserId` | **NONE** | Latent — see below |
| `Menu.createdByUserId` / `.updatedByUserId` | `createdBy` / `updatedBy` | OK |
| `RolePermission.createdByUserId` / `.updatedByUserId` | `createdBy` / `updatedBy` | OK |
| `ContactMessage.confirmedByUserId` | `confirmedBy` | OK |
| `Email.sentByUserId` | `sentBy` | OK |
| `EquipmentCalibrationRecord.acceptedByUserId` / `.createdByUserId` | `acceptedBy` / `createdBy` | OK |
| `CalibrationRequest.createdByUserId` / `.updatedByUserId` | `createdBy` / `updatedBy` | OK |
| `WorkOrder.requestReviewCompletedByUserId` | `requestReviewCompletedBy` | OK |
| `CalibrationJob.akdAklApprovedByUserId` | `akdAklApprovedBy` | OK |
| `KontrolAlat.createdByUserId` | `createdBy` | OK |
| `MeasurementResult.recordedByUserId` | `recordedBy` | OK |
| `PhysicalCheckResult.recordedByUserId` | `recordedBy` | OK |
| `JobReferenceEquipmentUsed.overriddenByUserId` | `overriddenBy` | OK |
| `JobReferenceEquipmentApproval.submittedByUserId` / `.decidedByUserId` | `submittedBy` / `decidedBy` | OK |
| `IdentityCorrection.submittedByUserId` / `.decidedByUserId` | `submittedBy` / `decidedBy` | OK |
| `Certificate.createdByUserId` / `.updatedByUserId` | `createdBy` / `updatedBy` | OK |
| `Invoice.createdByUserId` / `.updatedByUserId` | `createdBy` / `updatedBy` | OK |
| `Payment.createdByUserId` / `.updatedByUserId` | `createdBy` / `updatedBy` | OK |
| `FileObject.uploadedByUserId` | `uploadedByUser` | OK |

### UI-level: what each actor field actually renders

| Field / location | Renders |
|---|---|
| **PO detail → `Approved By`** (`purchase-orders/[id]/page.tsx:234`) | **RAW ID — the bug.** This is the *only* place in Portal or tech-pwa where a `*ByUserId` value is rendered directly. |
| Quotation detail → approval block (`quotations/[id]/page.tsx:254-257`) | **Not applicable / latent.** `approvedByUserId` exists on the `QuotationRow` type (`quotations-ui.tsx:115`) but is never rendered — the page shows `Approved At` and `Customer Approved At` only. No visible bug today, but the same missing-relation gap means an "Approved By" row cannot be added here either without the same fix. |
| CalibrationJob → AKD/AKL `Decided By` (`calibration-jobs/[id]/page.tsx:691`) | Name — `job.akdAklApprovedBy?.name ?? "—"` |
| Identity Correction → submitter (`calibration-jobs/[id]/page.tsx:1395`) | Name — `pending.submittedBy.name ?? "teknisi"` |
| Identity Correction → `Diputuskan oleh` (`calibration-jobs/[id]/page.tsx:2092`) | Name — `correction.decidedBy?.name ?? "—"` |
| Identity Correction → tech-pwa (`jobs/[id]/corrections/[correctionId]/page.tsx:197`) | Name — `correction.decidedBy?.name ?? "—"` |
| Quality review → `Diputuskan oleh` (Portal `:1887`, `:1897`; tech-pwa `job-detail-ui.tsx:89`) | Name — `review.reviewer?.name ?? "—"` |
| Reference equipment override → `Oleh:` (`calibration-jobs/[id]/page.tsx:1725`) | Name — `unit.overriddenBy?.name ?? "—"` |
| WorkOrder request review → `oleh …` (`work-order-request-review-section.tsx:139`) | Name — `workOrder.requestReviewCompletedBy.name` |
| Equipment calibration record → `Diterima oleh` (`equipment-calibration-records-panel.tsx:408`) | Name — `record.acceptedBy.name ?? record.acceptedBy.email` (note the nicer email fallback) |
| Certificate / Invoice / Payment / Menu / RolePermission `createdBy` etc. | Not rendered in any UI reviewed — relations exist, so no latent gap. |

**Conclusion on blast radius:** the *visible* bug is PO-only — a single line of JSX. The
*structural* gap is two models (PurchaseOrder, Quotation). The rest of the app already
follows a consistent, working house pattern: relation → `select: { id: true, name: true }`
in the service include → `?.name ?? "—"` in the UI (precedents:
`work-orders.service.ts:87`, `calibration-jobs.service.ts:146-147`). This is therefore
**not** a systemic display-layer problem calling for a new shared abstraction; it is two
models that were never brought onto the existing pattern.

## Proposed Fix Options (Step 2)

### Option A — Add the missing Prisma relation, matching the house pattern

Bring `PurchaseOrder` (and, if approved, `Quotation`) onto the same pattern as the other
27 actor columns.

- **Files:** `packages/db/prisma/schema.prisma` (add `confirmedBy User? @relation("PurchaseOrderConfirmedBy", fields: [confirmedByUserId], references: [id])` + back-relation on `User`; new migration), `purchase-orders.service.ts` (add `confirmedBy: { select: { id: true, name: true, email: true } }` to `purchaseOrderInclude`), `purchase-orders-ui.tsx` (`confirmedBy` on `PurchaseOrderRow`), `purchase-orders/[id]/page.tsx` (render `?.name`).
- **Scope:** schema + API + UI.
- **Risk:** the migration adds a **real FK constraint** on an existing column. If any row holds a `confirmedByUserId` that no longer exists in `User`, the migration fails. Users are deactivated (`UserStatus.DISABLED`), not deleted — there is no user-delete endpoint (`users.controller.ts` exposes only `@Delete(":id/memberships")`) — so orphans are unlikely, but this must be verified with a pre-migration count before deploying. `onDelete` behaviour should be chosen explicitly (`SetNull` is what `IdentityCorrection.decidedBy` uses).
- **Upside:** zero extra permission surface (the name rides along inside the PO response the viewer is already authorised to read), one query, no N+1, and it makes an "Approved By" row possible on Quotation later for free.

### Option B — Resolve the name server-side without a schema change

Keep the column relation-less; in `PurchaseOrdersService.findOne` (and `approve`), do a
second `prisma.user.findFirst({ where: { id: confirmedByUserId }, select: { id, name, email } })`
and attach it to the response as `confirmedBy`.

- **Files:** `purchase-orders.service.ts`, `purchase-orders-ui.tsx`, `purchase-orders/[id]/page.tsx`.
- **Scope:** API + UI, **no schema, no migration**.
- **Risk:** diverges from the house pattern (a hand-rolled lookup where 27 other fields use a relation), needs care not to become an N+1 on the PO *list* endpoint (recommend detail-only, or a single `findMany` over collected ids for lists). A missing/deleted user degrades gracefully to `null` rather than blocking anything — arguably safer than Option A on that specific point.
- **Upside:** lowest deployment risk; fully reversible; no FK constraint added to legacy data.

### Option C — Resolve the name in the browser from the users list

Reuse a users query in Portal and map the id to a name client-side.

- **Files:** `purchase-orders/[id]/page.tsx` plus a users hook (one already exists: `useAssignableUsers` in `use-work-orders-query.ts:290-296`).
- **Scope:** UI-only.
- **Risk:** the highest of the three, for three reasons. (1) **Permission** — `GET /users` requires `users:read` (`users.controller.ts:76-77`). Today only ADMIN and SUPERVISOR are seeded with `users:read`, and only ADMIN is seeded with any `purchaseOrder` permission, so the overlap happens to hold — but permissions are editable at runtime via the permission-management module, so a PO-reader role without `users:read` would see the field silently fall back to a dash (or trigger a 403 on the page). (2) The existing hook fetches `?status=ACTIVE&pageSize=100` — it would **miss a disabled approver and anyone past the first 100 users**, which is exactly the historical-record case this field exists for. (3) It ships a full user list to the client to render one name.

## Recommended Option

**Option A**, with Option B as the fallback if the pre-migration orphan check comes back
dirty. The whole codebase already speaks one dialect for "who did this" — relation,
`select: { id, name }`, `?.name ?? "—"` — and PO is an outlier rather than the start of a
new pattern, so the cheapest long-term fix is to stop it being an outlier; it also removes
the same blocker on `Quotation.approvedByUserId` (worth folding into the same change since
it is literally the only other instance, though it fixes a latent gap rather than a visible
one — confirm whether you want the Quotation UI to gain an "Approved By" row at the same
time, or just the plumbing). Before implementing, Stage 2 should run a read-only check for
`PurchaseOrder`/`Quotation` rows whose actor id has no matching `User` row; if any exist,
either clean them or switch to Option B, whose nullable lookup tolerates them. Whichever
option is chosen, I recommend the `name ?? email ?? "—"` fallback already used by
`equipment-calibration-records-panel.tsx:408`, since `User.name` is nullable and an
invited-but-unnamed approver would otherwise render as a bare dash.
