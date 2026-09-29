# High-Volume Management Portal Trial Preparation Report

## 1. Status

COMPLETE

## 2. Transaction Chain

The full chain was created through real, unmodified application services, in-process, in this
order (no HTTP layer, no raw Prisma writes on any transaction table):

```
Customer ("RS Minto Hardjo (Trial)", reused — see §7)
  → CalibrationRequestsService.create()  (56 items, Σqty = 406, serviceMode = SEND_TO_LAB)
  → CalibrationRequestsService.submit()
  → QuotationsService.create()
  → QuotationsService.send()
  → QuotationsService.approve()
  → PurchaseOrdersService.create()
  → PurchaseOrdersService.approve()   ← STOP HERE
```

No `WorkOrdersService`, `CalibrationJobsService`, or allocation helper was called at any point.

## 3. Dataset

- Request items: 56
- PO items: 56
- Total quantity: 406 (verified at CalibrationRequestItem, QuotationItem, and PurchaseOrderItem
  level — all three sum to 406)
- Distinct device types: 55 (one device type code, `RESUSCITATORS_PULMONARY`, is used by 2 of the
  56 rows — a genuine repeat in the canonical source data, not a mapping artifact)
- Mapping summary (unchanged from the canonical Minto Hardjo fixture, reused verbatim):

  | Tier | Rows | Σqty |
  |---|---:|---:|
  | EXACT (existing DeviceType, exact name match) | 5 | 156 |
  | ALIAS (existing DeviceType, known alias) | 4 | 45 |
  | REPRESENTATIVE (closest existing DeviceType) | 10 | 64 |
  | SYNTHETIC (`TRIAL_MH_*`, created for this trial) | 37 | 141 |
  | **Total** | **56** | **406** |

- Synthetic master count: 37 `TRIAL_MH_*` DeviceType rows (across 4 trial-only DeviceCategories),
  74 DeviceCalibrationParameter rows — all pre-existing on disk from the earlier full trial run and
  reused idempotently (upserted by code, no duplicates created).
- Items requiring fallback mapping: none beyond the pre-existing SYNTHETIC tier — the mapping is
  the same locked, previously-audited table used by the full trial (`device-type-mapping.ts`), not
  re-derived for this task.

## 4. Final Transaction State

Verified by direct Prisma query (not by trusting script stdout):

| Entity | Count |
|---|---:|
| Customer | 1 ("RS Minto Hardjo (Trial)") |
| CalibrationRequest | 1 (56 items, Σqty = 406) |
| Quotation | 1 (status `APPROVED`, 56 items, Σqty = 406) |
| PurchaseOrder | 1 (status `APPROVED`, 56 items, Σqty = 406) |
| WorkOrder | **0** |
| Allocation | **0** (no allocation mechanism was invoked) |
| CalibrationJob | **0** |
| Certificate | **0** |
| MeasurementResult | **0** |
| QA / identity-correction records | **0** (no CalibrationJob exists to attach them to) |

## 5. Manual Boundary

"Allocation → WorkOrder was NOT automated. The dataset is intentionally stopped at a valid
Purchase Order ready for manual user execution."

## 6. Management Portal Verification

Dev servers were started for this check only (`apps/api` on :3001, `apps/portal` on :3003) and
left running; both responded HTTP 200. A read-only code-path check (not a live authenticated
browser walkthrough — no dev-auth bypass/seeded credentials were available in this session) found:

- **PO detail**: `apps/portal/src/app/management/purchase-orders/[id]/page.tsx` renders items via
  `PurchaseOrderSnapshot` (`purchase-orders-ui.tsx`), which maps the full `items` array with no
  client-side pagination, `.slice()`, or hardcoded limit.
- **API detail endpoint**: `PurchaseOrdersService.findOne` includes all `PurchaseOrderItem` rows
  with no `take`/`skip`, so the API returns all 56 items in one response.
- **PO list**: server-side paginated at 10 rows/page (`DEFAULT_PAGE_SIZE = 10`), but that paginates
  *POs*, not a PO's items — this trial PO is exactly 1 row in that list and is fully searchable by
  PO/customer number.
- **Conclusion**: no pagination or hardcoded limit anywhere in the PO detail flow would truncate
  the 56 items or the Σ406 quantity; the list page's page size is unrelated and unaffected.
- No genuine UI defect was found. A full logged-in visual pass (opening the PO in the browser,
  exercising search/filter/pagination interactively) was not performed in this non-interactive
  session and is left for the user's manual check, per the task's own next step (manual
  Allocation → WorkOrder).

## 7. Repeatability

This uses a **new** seed/reset pair — `seed:trial-minto-hardjo-po-only` /
`reset:trial-minto-hardjo-po-only` (`apps/api/scripts/trial-minto-hardjo/seed-po-only.ts` /
`reset-po-only.ts`) — rather than the existing full-fanout `seed:trial-minto-hardjo` /
`reset:trial-minto-hardjo`. The existing pair creates a WorkOrder and fans out 406
CalibrationJobs immediately after PO approval, which this task's scope explicitly forbids, so it
could not be reused as-is. The new scripts reuse every shared building block unmodified
(`lib.ts` helpers, `TRIAL_SOURCE_ROWS`, `TRIAL_DEVICE_TYPE_MAPPING`,
`seed-trial-minto-hardjo-device-types.ts`) and only replace the orchestration script itself,
stopping one step earlier. They write to a separate manifest file
(`packages/db/fixtures/trial-minto-hardjo/manifest-po-only.json`) so they never collide with the
full trial's `manifest.json`/`reset.ts`, and `reset:trial-minto-hardjo-po-only` was confirmed
idempotent against the manifest it owns.

**Stale-state finding (resolved without deleting anything):** before seeding,
`packages/db/fixtures/trial-minto-hardjo/manifest.json` was found on disk referencing a full
trial run (Customer, CalibrationRequest, Quotation, PO, WorkOrder, 406 jobs) from
2026-09-27T10:09:29Z. Querying the DB showed the transaction rows it references
(CalibrationRequest/Quotation/PurchaseOrder/WorkOrder/CalibrationJob — all counted 0 in the DB)
had already been wiped, but the trial `Customer` row itself ("RS Minto Hardjo (Trial)",
`cmujnou86002lcz28unonblam`) and its associated synthetic master data/trial users/price list
items were left behind (an incomplete wipe, or the wipe intentionally scoped to
transaction tables only). Per the task's own instruction to "use the existing canonical trial
identity if the project already provides one," and since this Customer had zero live
CalibrationRequest/Quotation/PurchaseOrder children (verified before proceeding), the new
`seed-po-only.ts` was written to detect this exact situation and **reuse** the existing Customer
rather than creating a duplicate or deleting anything. This is recorded in the new manifest as
`customerReused: true`, and `reset-po-only.ts` will leave that Customer in place on teardown
(since this script didn't create it) rather than deleting it out from under the still-present
`manifest.json`. `packages/db/fixtures/trial-minto-hardjo/manifest.json` itself was left
untouched — the user may want to run `reset:trial-minto-hardjo` themselves to clean it up, or
leave it, since it no longer blocks anything now that its own transaction rows are gone.

## 8. Deviations

- The trial `Customer` row was **reused** rather than freshly created (see §7) — a direct
  consequence of the pre-existing partial wipe state found before seeding, not a change to the
  dataset shape itself. The Requisition/Quotation/PO created under it are entirely new.
- No deviation from the canonical 56-item / 406-unit dataset itself: source rows, device-type
  mapping, and tier distribution are byte-for-byte the same fixtures as the full Minto Hardjo
  trial.
- Management Portal verification (§6) was a code-path/static check, not an interactive logged-in
  browser session, due to no available dev-auth bypass in this non-interactive session.

## 9. Scope

Confirmed: no Allocation, WorkOrder, Tech-PWA, Customer Portal, Certificate, QA, measurement,
numbering, RBAC, schema/migration, or other production business-logic code was changed. The only
files added are two new orchestration scripts, one new manifest-I/O helper module, and two new
`package.json` script entries, all additive and scoped to `apps/api/scripts/trial-minto-hardjo/`.
No existing trial script (`seed.ts`, `reset.ts`, `lib.ts`) or fixture data file was modified.

## 10. Final Gate

HIGH-VOLUME TRIAL DATA READY — MANUAL ALLOCATION/WORKORDER NEXT
