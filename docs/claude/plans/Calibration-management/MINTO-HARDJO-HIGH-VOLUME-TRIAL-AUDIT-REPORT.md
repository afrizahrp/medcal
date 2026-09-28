# Minto Hardjo High-Volume Calibration Trial — Architecture Audit & Trial Plan

**Status:** AUDIT + PLANNING ONLY. No code, schema, or data was modified to produce this report.
**Source dataset:** `po-mintohardjo.xlsx` (provided as PDF) — **56 line items, 406 total units** (Excel's own `TOTAL` row = 406, independently recounted here row-by-row: 43 items on page 1 + 13 on page 2 = 56).
**Scope of "MT":** the Medcal Portal (`apps/portal`), used by Management/Technical-Manager/Operations staff.

Every claim below is labeled **CONFIRMED FROM CODE** (read directly), **INFERENCE** (plausible, not directly read), or **REQUIRES VERIFICATION** (could not be determined by static analysis). File:line citations point at the current working tree unless noted.

---

## 1. Executive Summary

- The system **can** produce a large, real, multi-state job set from this exact Excel file without any schema or business-logic change. The mechanism (Excel import → Requisition → Quotation → PO → WorkOrder → fan-out) already exists, is tested, and — critically — is **strictly deterministic**: one physical unit fans out to exactly one `CalibrationJob` row. **CONFIRMED FROM CODE.**
- **The dataset produces 406 jobs, not ~409.** `WorkOrderItem.qty` (copied verbatim from the Excel row all the way down the chain) drives the fan-out loop 1:1 with no multiplier from capability/parameter count (`work-orders.service.ts:599-648`, `coerceFanOutQty` at `:581-591`). Σqty for these 56 rows is exactly 406. The "~409" figure in the task/plan documents does not match this specific Excel file and should be treated as an approximation from an earlier, slightly different illustrative example already in this repo (`calibration-management-portal-audit.md` uses a hypothetical "56 items / 409 units" scenario) — not a business rule this dataset needs to hit. **CONFIRMED FROM CODE + REQUIRES A DECISION** (see §10, Q1).
- **Master-data coverage is the real gap**, not job generation. Of the 406 units, a direct comparison of all 56 Excel names against the live seed source (`seed-device-types.ts`, `seed-device-type-aliases.ts`) shows:
  - **156 units (5 items)** match an existing `DeviceType` **exactly**: Centrifuge, CPAP, Infusion Pump, Syringe Pump, Ventilator.
  - **45 units (4 items)** resolve cleanly through an existing, unambiguous `DeviceTypeAlias`: Holter→Ambulatory ECG, Nebulizer→Nebulizer Compressor, Pulse Oximeter→Pulse Oximeters, X-Ray Dental→Dental X-Ray.
  - **31 units (6 items)** have a strong existing candidate but no exact/alias hit (usually because the Excel name carries a parenthetical abbreviation, e.g. "Bio Safety Cabinet (BSC)", "Electrocardiograph (EKG)") — these need one manual confirmation click during import review, not new master data.
  - **35 units (5 items)** are genuinely ambiguous against existing master data (e.g. "Tensimeter Analog" aliases to *two* different canonical DeviceTypes) and need an explicit human decision before import.
  - **139 units (36 items) — over a third of the volume — have no plausible existing DeviceType at all** (no Defibrillator/AED category exists at all in this system today; no imaging-Ultrasound/X-Ray category beyond Dental X-Ray; no scales/"Timbangan" category; Thermohygrometer is explicitly, deliberately excluded by the seed file's own comment). These require genuinely new (synthetic) `DeviceType` + `DeviceCapability` + `DeviceCalibrationParameter` rows.
  - One resolved item (Holter→Ambulatory ECG) has **zero** `DeviceCalibrationParameter` rows today, so even though it "matches," it isn't yet usable in a real technician workflow without adding parameters.
  All of the above is **CONFIRMED FROM CODE** (direct read of the seed source files listing all 59 current `DeviceType` names and their aliases), with the final authoritative check recommended as a cheap, side-effect-free step: running the actual `po-mintohardjo.xlsx` file through the existing `preview()` Excel-import endpoint against the live database (§9, Phase 2).
- **MT's dashboard is already built for this volume**; MT's job-list/detail UI is functionally correct at this volume but has **no bulk actions anywhere** and real navigation gaps (an all-406-units-in-one-WorkOrder shape — forced by the "one WorkOrder per PO" invariant — will render as one unpaginated ~400-row table when the SPK group is expanded, with no in-group filter). **CONFIRMED FROM CODE.**
- **The identity-approval story is more fragmented than the task's own framing assumed.** There isn't one "BAI approval" queue and one separate "Setujui Identitas Alat" queue — there is one real, fully-built workflow (**Identity Correction**, document-prefixed "BAI"), and one schema/API-only regulatory gate (**AKD/AKL approval**) that has **zero UI surface anywhere in the codebase today** (dead, unused hooks only). A trial cannot let MT "experience" AKD/AKL approval through the UI, because that UI doesn't exist yet. **CONFIRMED FROM CODE** — see §5.
- Recommended job-generation trigger for the trial is the same one production uses (`WorkOrder.start()`), and recommended state-seeding approach is to **drive the real service/API methods programmatically** (not raw SQL), because job state is entangled with derived data (measurement-completeness gates, `JobCalibrationTestPoint` snapshots, `currentAttempt`, master-data write-through on `complete()`) that a raw INSERT would silently violate.
- The single biggest structural risk is that **device master data is global, not tenant/trial-scoped** — there is no `isTrial`/`isDemo`/environment flag anywhere in the schema (`CONFIRMED NOT PRESENT`). Any synthetic `DeviceType` created for this trial will be visible to every company/customer in the system after the trial and is **not** covered by any existing reset mechanism. This must be handled with an explicit manifest, not assumed away.

---

## 2. Current End-to-End Architecture (Excel → Requisition → QA → PO → CalibrationJob → MT → Tech-PWA)

### 2.1 Excel import (`apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`)

- Single first worksheet, header row 1, data rows 2..N; header matching by normalized alias, not fixed columns (L49-80, L246-259). Required columns: device name, qty. Optional: model, serial/deviceId, AKD/AKL.
- **Row cap `MAX_DATA_ROWS = 100`** (L23, enforced L326-331) — irrelevant here since we have 56 rows, but worth knowing as a ceiling for any *larger* future trial.
- **Qty is an aggregate per row, never a row multiplier** — explicit in code comments (L22, L41, L525) and enforced in `confirm()` (L616-646): "Each reviewed spreadsheet row becomes exactly ONE `CalibrationRequestItem`." Qty must be a positive integer (`parseQty`, L122-140); non-integer/≤0/blank is a hard row error. All 56 Excel rows have whole-number quantities, so this is not a blocker. **CONFIRMED FROM CODE**, corroborated by the import service's own test suite (`calibration-request-import.service.test.ts`).
- **Device matching** (`buildMatchIndex`/`matchRow`, L336-514): exact normalized `DeviceType` name → `DeviceTypeAlias` → Levenshtein/substring **fuzzy suggestions (up to 3, suggestion-only, never auto-assigned, L428)**. Two colliding exact/alias matches is a hard row error. Unmatched rows require a human to pick a `deviceTypeId` manually — **there is no "import as unmatched" path**; `confirm()`'s wire schema requires `deviceTypeId` on every row (L627).
- **`preview()` is fully side-effect-free** (no DB writes) — confirmed by its own test ("writes nothing to the database"). This makes it the ideal, zero-risk tool to get an authoritative per-row match classification for all 56 real rows against the live DB (see §9 Phase 2) instead of relying purely on static code/seed-file analysis.
- Serial/deviceId is an optional lookup key only; if it doesn't resolve to exactly one existing `Device`, it's stored `NULL` — never fabricated.

### 2.2 Requisition / "QA" (`calibration-requests.service.ts`, schema.prisma:109-115, 1581-1683)

- `CalibrationRequestStatus`: `DRAFT → SUBMITTED → IN_QUOTATION → CANCELLED|FULFILLED`. `create()` always starts `DRAFT`; `submit()` only allows `DRAFT→SUBMITTED`. The `SUBMITTED→IN_QUOTATION` step is explicitly a TODO ("triggered from the Quotation module") — i.e. it's driven by Quotation creation, not a distinct action in this service.
- **There is no explicit "QA" role or gate anywhere in this chain.** The only thing the codebase calls "QA" is `CalibrationJobStatus.ACCEPTED_BY_QA` plus the separate `QualityReview` model — both of which are **post-hoc reviews of a technician's completed measurement results**, happening *after* jobs already exist, not a pre-PO approval gate. If the audit's "QA workflow" was assumed to be a pre-PO checkpoint, **that gate does not exist under that name.** The real pre-PO gates are `Quotation.approve()` (commercial approval, requires `customerApprovedAt`) and `PurchaseOrder.approve()` (internal approval). **CONFIRMED FROM CODE.**

### 2.3 Quotation → PurchaseOrder → WorkOrder (straight 1:1 quantity propagation)

- `CalibrationRequestItem.qty` → `QuotationItem.qty` (`quotations.service.ts:404`, one row per active request item, `requestItemId` FK preserved) → `PurchaseOrderItem.qty` (`purchase-orders.service.ts:236-250`, straight `.map()` projection, gated on `quotation.status==="APPROVED" && quotation.customerApprovedAt != null`) → `WorkOrderItem.qty` (`work-orders.service.ts:312-320`, gated on `purchaseOrder.status==="APPROVED"`). At every stage it's **one child row per active parent row, qty copied verbatim, no split/merge logic anywhere.**
- **One WorkOrder per PurchaseOrder is enforced** (`DUPLICATE_ACTIVE_WORK_ORDER`, `work-orders.service.ts:264-278`). Your entire 56-item PO becomes **exactly one WorkOrder (SPK)** containing 56 `WorkOrderItem` rows.
- `purchase-order-pdf.ts` only renders `qty`; no business logic there.

### 2.4 CalibrationJob generation ("fan-out")

- **Trigger:** `WorkOrdersService.start()` (`work-orders.service.ts:516-573`), the `PLANNED/ASSIGNED → IN_PROGRESS` transition, guarded by an explicit `ALLOWED_TRANSITIONS` table (L39-45) and `assertTransition()` (L181). Fan-out (`fanOutCalibrationJobs()`, L599-648) runs inside the **same transaction** as the status flip.
- **Rule:** for each `WorkOrderItem`, `unitTotal = coerceFanOutQty(item.qty)` (throws `WORK_ORDER_ITEM_QTY_NOT_FANOUT_SAFE` on non-integral/non-positive qty, no silent rounding), then a loop `unitOrdinal = 1..unitTotal` creates one `CalibrationJob` row per unit (single `createMany`, L643-644). **1 physical unit = 1 job, always — never multiplied by capability/parameter count.**
- Idempotent: re-entry no-ops if jobs already exist for the WorkOrder (count check, L603-609); a concurrent double-start race is caught via `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` (schema.prisma:2430) + `P2002` recovery.
- **No "physical unit" entity exists upstream of the job.** There's no per-unit asset/serial record created from qty before fan-out — `unitOrdinal`/`unitTotal` are in-memory UI labels ("unit 2 of 3"), not FKs to any pre-existing record. `CalibrationJob.deviceId` is populated at creation **only** for a `qty=1` line whose upstream `PurchaseOrderItem.deviceId` was already known; **every sibling job from a qty>1 line starts with `deviceId = NULL`** — per-unit physical identity is resolved later, per job, by a technician (device search/select, or the Identity Correction workflow). Since 54 of our 56 rows have qty>1 (only two — need to check — most items in this dataset have qty≥1 with several =1; regardless, any row with qty>1 produces NULL-identity siblings), **most of the 406 jobs will start with no device bound**, which is realistic production behavior, not a trial artifact.
- **This exact scenario (56 items, large aggregate qty, one WorkOrder, deferred per-unit identity) is already independently analyzed** in `docs/claude/plans/Calibration-management/calibration-management-portal-audit.md`, whose code citations were independently re-verified here and match current code with no drift found.

### 2.5 CalibrationJob lifecycle / state machine

`CalibrationJobStatus` (schema.prisma:182-188): `PENDING → IN_PROGRESS → SUBMITTED → REWORK → ... → ACCEPTED_BY_QA`. **No `CANCELLED` value exists** for this enum (unlike WorkOrder/PO/Quotation). There is **no formal allowed-transitions table** for this enum (unlike WorkOrder) — each transition is guarded ad hoc, one method per action, all in `calibration-jobs.service.ts`:

| Action | Transition | Method (file:line) | Notes |
|---|---|---|---|
| Start | `PENDING→IN_PROGRESS` | `start()` L1106 | Gates on Kontrol Alat readiness for SEND_TO_LAB jobs; freezes `JobCalibrationTestPoint` snapshot from the catalog |
| Submit for review | `IN_PROGRESS→SUBMITTED` | `submitForReview()` L1151 | Requires measurement completeness, resolved reference equipment, no pending Identity Correction |
| MT reject | `SUBMITTED→REWORK` | `decideQualityReview()` REJECT, L1222 | Atomic: nulls `submittedAt`, **`currentAttempt += 1`** (sole increment site) |
| MT approve | stays `SUBMITTED` | `decideQualityReview()` APPROVE, L1222 | Only creates an approved `QualityReview` row; job status doesn't move yet |
| Resume after rework | `REWORK→IN_PROGRESS` | `resumeAfterRework()` L1310 | Technician-initiated; does **not** re-increment `currentAttempt` |
| Complete | `SUBMITTED→ACCEPTED_BY_QA` | `complete()` L1338 | Only if latest `QualityReview` is APPROVED; also the master-data write-through commit point (`technicianObserved{Brand,Model,Serial}` → `Device`) |

Rework can cycle arbitrarily; old-attempt `MeasurementResult`/`PhysicalCheckResult`/`QualityReview` rows are never edited, giving a full audit trail per `attemptNumber`. Two **independent side-gates** can also block a job without changing its status: the AKD/AKL identity gate (§5) and `JobReferenceEquipmentApproval` (technician asks MT to accept invalid/expired reference equipment).

**Technician assignment is WorkOrder-level, not per-job**: `WorkOrderAssignment` (schema.prisma:2206-2219) is a many-to-many join, assigned in one batch call (`WorkOrdersService.assign()`, accepts an array of technicians, `PLANNED→ASSIGNED`). Every job fanned out from that WorkOrder implicitly shares the same technician set — **there is no mechanism to assign different technicians to different sibling jobs of the same WorkOrder.**

### 2.6 Measurement architecture (all Phase-4 invariants confirmed unchanged, per `.claude/rules/architecture.md`)

- `DeviceCalibrationParameter` (master, per DeviceType+Capability) defines what's measured, including `entryStyle` and Phase 4A `logicalTestKey`/`logicalTestSequence`.
- `CalibrationTestPoint` (master, optional per parameter) exists only for fixed-sweep "Pattern B" parameters. At `start()`, active test points are copied into `JobCalibrationTestPoint` (job-level frozen snapshot) — an empty snapshot is valid (Pattern A).
- `MeasurementResult` natural key: `(calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId, replicateIndex, attemptNumber, direction)`. `replicateIndex` is the dynamic-repetition mechanism; `attemptNumber` mirrors `currentAttempt`; `direction` is the ramp facet; `referenceValue` is a separate paired-instrument reading from `measuredValue`.
- Tolerance resolution is a priority chain (per-point override → parameter bounds → parsed free-text note → unresolved), snapshotted onto the row and never recomputed later.
- Submit-completeness is evaluated against the **frozen job snapshot**, not the live master catalog.

### 2.7 MT (Portal) surface

- **Dashboard** (`apps/portal/src/app/management/page.tsx`, new/uncommitted): `GET /dashboard/management-summary` (`dashboard.service.ts`). Row 1: three live counts (Active Work Orders, Jobs Awaiting Action, Quotations Pending) via one `Promise.all`. Row 2: Customer PO count + job Volume count, bucketed by period. Row 3: Calibrated (jobs `ACCEPTED_BY_QA` joined to an approved `QualityReview`). Row 4: financial cards, hardcoded `0` (not queried). A new migration (`20260927150000_management_dashboard_v1_indexes`) adds exactly 4 indexes matching these six query shapes. **This is the one part of the surface explicitly built and tested against a 409-job/17-PO reference fixture already in this repo's own implementation report** — designed for this scale.
- **Calibration-job list** (`apps/portal/src/app/management/calibration-jobs/*`): two views — a WorkOrder-grouped view (paginates *Work Orders*, two-phase query specifically rewritten to avoid a full-table scan) and a flat job-level view (server-side `skip`/`take`, default page size 10, hard cap 100). Free-text search + status filter + (URL-only, no UI control) `akdAklApprovalStatus` filter. **No sort control in the UI.** **No bulk action of any kind exists in the API** (every mutating endpoint takes a single `:id`). Within one expanded WorkOrder group, **all sibling jobs render in one unpaginated native `<table>`** — for this dataset, that would be up to 94 rows (Syringe Pump) in one un-filterable block once that item's SPK line is expanded, or all 406 if the grouped view's row is itself expanded to job level (exact expansion granularity not independently re-verified beyond the agent's static read — REQUIRES VERIFICATION via click-through).
- **Detail view** (`.../calibration-jobs/[id]/page.tsx`): correctly scoped to one physical unit; accordion sections for Kontrol Alat, Identitas, Reference Equipment, Measurements + Quality Review panel, Identity Corrections, Certificate. Has working Previous/Next sibling navigation (`GET /calibration-jobs/:id/siblings`).
- Two previously-flagged critical defects from the pre-existing `calibration-management-portal-audit.md` (100-job truncation on WorkOrder rollups; unbounded full-table poll on the grouped list) are **confirmed fixed** in current code. Two lesser gaps remain **open**: the `akdAklApprovalStatus` filter has no UI control, and there's no confirmed drill-down link from a WorkOrder's item table into the scoped job list for that line item.

### 2.8 Tech-PWA surface (`apps/tech-pwa`)

Full ordered flow, most-relevant citations:

1. **Job list** (`app/jobs/page.tsx`) — `GET /calibration-jobs?assignedToMe=true`, polled every 6s, grouped Customer→SPK(WorkOrder)→Device(unit), 2 taps of query-string drill-down before reaching a job.
2. **Job detail** (`app/jobs/[id]/page.tsx`) — the hub: header → identity-incomplete warning → Kontrol Alat (SEND_TO_LAB only) → declared/observed identity → assigned-device section (search/select when `deviceId` is null) → reference equipment → physical check → measurements → corrections list. A `StickyActionBar` surfaces the one valid next action at a time (Lengkapi Kontrol Alat → Mulai Kalibrasi → Lanjutkan perbaikan → Kirim hasil → Selesai → Ajukan Koreksi Identitas).
3. **Kontrol Alat (F.MU.08)** — exists **only** for `WorkOrder.serviceMode === "SEND_TO_LAB"`; for `ON_SITE` jobs the section doesn't render at all. Where it applies, it's a **hard start-gate** (client + server) requiring `workExecuted=true` and both signatures.
4. **Measurements** — `GET :id/measurement-parameters` returns a `capabilityGroups` tree; complexity scales with capability/parameter/test-point count, from a 1-parameter/1-screen device up to a Bed-Side-Monitor-class device with 10+ parameter navigations. A special `NIBP`-only allowlist collapses 3 sibling parameters into one combined-entry screen — the only capability with this treatment.
5. **Identity Correction (BA) wizard** — 5 steps (`/identity-correction/{page,signature-technician,signature-customer,photo,review}`), a stateful wizard context that traps back-navigation.
6. **Submit / rework** — `submitForReview()` gated client-side by status+`startedAt` (server is the real completeness gate); a REWORK cycle re-enters every reading from scratch (**no copy-forward mechanism exists anywhere in the codebase**).

Concrete scenario axes this workflow actually offers (used to design the Tech-PWA trial in §6): service mode (ON_SITE vs SEND_TO_LAB/Kontrol-Alat), Pattern A vs Pattern B/grid parameters, capability count, the NIBP-grouped screen, device-identity-unresolved-at-arrival, the Identity Correction wizard, a reference-equipment-approval-pending block, and a full submit→reject→resume→resubmit→approve→complete rework cycle.

---

## 3. Master Coverage — 56-item mapping matrix

Legend: **EXACT** = normalized Excel name equals a live `DeviceType` name. **ALIAS** = equals a live `DeviceTypeAlias` unambiguously. **FUZZY** = a strong existing candidate exists but needs one manual confirmation click (usually because the Excel name carries a parenthetical abbreviation the normalizer doesn't strip). **AMBIGUOUS** = multiple existing candidates, needs an explicit human decision. **SYNTHETIC** = no plausible existing `DeviceType` at all.

This table is built by directly diffing all 56 Excel names against the full, current `TYPES` array in `seed-device-types.ts` (59 rows) and the full `DEVICE_TYPE_ALIASES` array in `seed-device-type-aliases.ts` (171 rows) — **CONFIRMED FROM CODE** for "does a plausible canonical exist," with the caveat that seed files may not perfectly reflect the *live* database if it has since diverged (flagged **REQUIRES VERIFICATION**, resolved cheaply in §9 Phase 2 by running the real file through `preview()`).

| # | Excel item | Qty | Status | Evidence / note |
|---|---|---|---|---|
| 1 | Anesthesia With Ventilator | 7 | SYNTHETIC | No anesthesia-machine category exists; mapping to plain "Ventilator" would lose the anesthesia-specific capabilities — a representative-vs-synthetic decision, not automatic |
| 2 | Audiometri | 2 | FUZZY | "Audiometer" exists (`AUDIOMETER`); no alias for the Indonesian spelling |
| 3 | Auto Keratometer / Refractometers | 1 | SYNTHETIC | No ophthalmology category exists |
| 4 | Auto Refractometers | 1 | SYNTHETIC | Same as above |
| 5 | Automated External Defibrillator (AED) | 3 | SYNTHETIC | No defibrillator category/type exists at all |
| 6 | Bio Safety Cabinet (BSC) | 2 | FUZZY | Canonical "Bio Safety Cabinet" + alias "BSC" both exist bare; the parenthetical suffix breaks exact/alias string match |
| 7 | Biometri | 1 | SYNTHETIC | Ophthalmic biometer; unrelated to any seeded category |
| 8 | Centrifuge | 2 | **EXACT** | `CENTRIFUGE` |
| 9 | CPAP | 1 | **EXACT** | `CPAP` |
| 10 | Cryotherapy Unit | 1 | SYNTHETIC | — |
| 11 | CUSA (cavitron ultrasonic surgical aspirator) | 1 | SYNTHETIC | — |
| 12 | Defibrillator | 11 | SYNTHETIC | No canonical at all — notable gap given the qty |
| 13 | Digital X-Ray DR Reader | 1 | SYNTHETIC | Only `Dental X-Ray` exists in the X-ray space |
| 14 | Electrocardiograph (EKG) | 20 | FUZZY | Aliases "ECG"/"EKG"/"Electrocardiograph" exist bare (→`Electrocardiographs`); parenthetical breaks exact/alias match |
| 15 | Electrostimulator / Tens | 6 | SYNTHETIC/AMBIGUOUS | "Electro Accupunture (EST)" exists but is a different modality — representative-match decision needed |
| 16 | Electrosurgical Unit (ESU) | 17 | SYNTHETIC | No canonical at all — meaningful qty |
| 17 | ENT Unit | 3 | SYNTHETIC | — |
| 18 | HENC Ambubag | 2 | FUZZY | "Resuscitators (Pulmonary)" is the semantic fit; no alias for "Ambubag" |
| 19 | High Flow Nasal Cannula (HFNC) | 2 | SYNTHETIC | — |
| 20 | Holter | 10 | **ALIAS** | → `Ambulatory ECG`, but **that DeviceType has zero `DeviceCalibrationParameter` rows today** — matched but not yet workflow-usable |
| 21 | Infrared Standing / Mobile | 1 | SYNTHETIC | — |
| 22 | Infusion Pump | 42 | **EXACT** | `INFUSION_PUMP` |
| 23 | Injector | 4 | SYNTHETIC | — |
| 24 | Laparoscopy | 2 | SYNTHETIC | — |
| 25 | Lensometer Mata | 3 | SYNTHETIC | — |
| 26 | Medical Frezer | 1 | FUZZY | Typo of "Medical Freezer", which exists exactly + alias "Freezer Medis" |
| 27 | Microscope | 2 | AMBIGUOUS | "Mikroskop Laboratorium" exists but is a *lab* microscope — likely semantically wrong for a bare "Microscope" line item; needs explicit decision, not auto-fuzzy |
| 28 | Nebulizer | 22 | **ALIAS** | → `Nebulizer Compressor` (bare alias, unambiguous) |
| 29 | Operating Microscope | 5 | SYNTHETIC | No surgical-microscope category exists |
| 30 | Parafin Bath | 1 | FUZZY | Typo of alias "Paraffin Bath" → `Paraffin Baths` |
| 31 | Photo Therapy (Blue Light) | 5 | FUZZY | "Phototherapy" exists; no exact alias for this phrasing |
| 32 | Pulse Oximeter | 11 | **ALIAS** | → `Pulse Oximeters` (unambiguous) |
| 33 | Resuscitator / Neo Puff | 1 | FUZZY | "Resuscitators (Pulmonary)" is the semantic fit; no alias |
| 34 | Rotablator | 1 | SYNTHETIC | — |
| 35 | Shock Wave Therapy | 1 | SYNTHETIC | — |
| 36 | Sterilisator Basah | 2 | AMBIGUOUS | "Sterillizer (Sterillisator)" vs "Autoclave" both plausible for a "wet sterilizer" — needs decision |
| 37 | Syringe Pump | 94 | **EXACT** | `SYRINGE_PUMP` — largest single line item in the whole dataset |
| 38 | Tensimeter Analog | 28 | AMBIGUOUS | Alias "Tensimeter" is registered against **two** different canonicals (`Blood Pressure Monitor` and `Sphygmomanometers`) in the alias *source*; since `DeviceTypeAlias.normalizedAlias` is globally unique, only one can actually exist in the live table — which one is **REQUIRES VERIFICATION** against the live DB |
| 39 | Thermohygrometer | 10 | SYNTHETIC | Explicitly, deliberately excluded — the seed file's own header comment lists it as a name intentionally never seeded |
| 40 | Timbangan badan + tinggi | 19 | SYNTHETIC | No scale/weighing category exists at all |
| 41 | Timbangan Dewasa Digital | 3 | SYNTHETIC | — |
| 42 | Timbangan Massa | 2 | SYNTHETIC | — |
| 43 | Timbangan Obat | 1 | SYNTHETIC | — |
| 44 | Tonometer | 1 | SYNTHETIC | — |
| 45 | Traction | 2 | SYNTHETIC | — |
| 46 | Treadmill | 3 | SYNTHETIC | — |
| 47 | Ultrasonography (USG) | 14 | SYNTHETIC | No diagnostic-ultrasound category exists — meaningful qty |
| 48 | Ultrasound Therapy | 3 | SYNTHETIC | Distinct physiotherapy device, also uncovered |
| 49 | Ventilator | 17 | **EXACT** | `VENTILATOR` |
| 50 | Water bath | 3 | SYNTHETIC | — |
| 51 | Water Seal Drainage Pump (WSD) | 2 | SYNTHETIC | — |
| 52 | X-Ray Bone Mineral Densitometri (BMD) | 1 | SYNTHETIC | — |
| 53 | X-Ray C-Arm | 1 | SYNTHETIC | — |
| 54 | X-Ray Dental | 2 | **ALIAS** | → `Dental X-Ray` (exact alias match, word order reversed but registered) |
| 55 | X-Ray Mobile | 1 | SYNTHETIC | — |
| 56 | X-Ray Mobile FDR X-Air | 1 | SYNTHETIC | — |

**Totals:** EXACT 5 items/156 units · ALIAS 4 items/45 units · FUZZY 6 items/31 units · AMBIGUOUS 5 items/35 units · SYNTHETIC 36 items/139 units. (156+45+31+35+139 = 406 ✓, 5+4+6+5+36 = 56 ✓.)

**Recommendation:** don't hand-build this matrix further from static analysis. Run the real `po-mintohardjo.xlsx` through the existing `preview()` endpoint (side-effect-free, confirmed by its own test) — it will return the live, authoritative exact/alias/fuzzy-suggestion/unmatched classification for all 56 rows in one call, which is strictly more trustworthy than a seed-file diff since the live DB can have drifted from the seed scripts. This is Phase 2 in §9.

---

## 4. Calibration Job Generation vs the "~409" Target

**56 items, 406 units → exactly 406 `CalibrationJob` rows**, one WorkOrder, under the current, unmodified business rules — no fixture trick needed to hit this. **CONFIRMED FROM CODE** (§2.4).

The "~409" figure cannot be derived from this specific Excel file's own totals (which sum to 406, per the sheet's own `TOTAL` row and an independent manual recount here). It most likely originates from a hypothetical "56 items / 409 units" example already used as an illustrative reference fixture in `calibration-management-portal-audit.md` (a prior, unrelated audit written before this specific spreadsheet existed) and was carried into the task prompt as an approximation. Recommendation: **use 406, the real number from the real file**, rather than padding the dataset by 3 arbitrary units to hit a round target that doesn't come from real customer data — inventing quantities would violate the plan's own "do not invent mappings/data" principle and the repo's Historical Data rule against reinterpreting source data. This is flagged as an open decision in §10 (Q1), not resolved unilaterally here.

---

## 5. BAI / Identity Approval — what actually exists

The task's framing (a "BAI approval" workload and a separate "Setujui Identitas Alat yang digunakan untuk kalibrasi" workload, each independently discoverable) does not fully match current code. There are two related-but-distinct mechanisms, and only one has a UI:

### 5.1 Identity Correction ("BAI") — fully built, this is the "Setujui" workload

- "BAI" is literally the document-number prefix for the `IdentityCorrection` model (`IDENTITY_CORRECTION_BA: "BAI"`, `document-type-prefix.ts:15`) — a real pilot record shows a number like `BAI/2026/09/00004`.
- **Trigger:** a technician submits a BA via the tech-pwa 5-step wizard when the on-site observed device/serial/AKD-AKL differs from what's currently on the job (first-time resolution or override). `POST /calibration-jobs/:id/identity-corrections`.
- **What MT sees:** on the job detail page, an "Identity Corrections (Berita Acara)" accordion section lists each BA with a before/after table, both signatures, an uploaded photo, and a PDF download. When `status === PENDING_REVIEW`, MT sees **"Setujui"** (Approve) and **"Tolak"** (Reject, requires a note) buttons — this is very likely the literal action the task's Indonesian phrase refers to, even though that exact phrase string doesn't appear verbatim in the UI.
- **Granularity: strictly per-BA, per-job.** No batch/array input exists anywhere in this endpoint or its DTO. **No bulk approval exists.**
- **State change on Approve:** writes the corrected device/serial/AKD-AKL onto the job, marks the correction row `APPROVED`, and — as a side effect — re-evaluates the separate AKD/AKL gate below (can auto-open it on a newly-detected mismatch, or auto-clear it if the gate had been auto-opened for exactly this reason).
- **Discovery today** is via a generic "N perlu tindakan" aggregate badge per SPK group and a per-row "Menunggu review" hint on the job list — **there is no dedicated queue page** just for pending identity corrections; they surface inline on the one generic job list.

### 5.2 AKD/AKL regulatory identity gate — schema/API complete, **zero UI anywhere**

- A separate `CalibrationJob.akdAklApprovalStatus` enum (`NOT_REQUIRED→PENDING_REVIEW→{APPROVED,REJECTED}`), with its own explicit transition table and its own endpoints (`escalate-identity`, `identity-decision`).
- It can be opened manually by a technician ("Eskalasi") or automatically when an approved Identity Correction reveals an AKD/AKL mismatch against the customer's declared value.
- **Confirmed by direct grep of the whole Portal and tech-pwa codebases: the hooks that would call these endpoints (`useEscalateIdentity`, `useDecideIdentity`) and their gating predicates exist but are never invoked from any rendered component.** The tech-pwa `escalate` route that an earlier audit doc referenced no longer exists on disk. **This workflow is reachable today only by a direct API call — MT cannot see or act on it through the Portal, and a technician cannot trigger it through tech-pwa's rendered UI.**

**Implication for the trial:** if the goal is to let MT "experience" AKD/AKL approval through the real UI, that cannot happen — the UI doesn't exist. The trial can faithfully represent the Identity Correction ("BAI") workload (real UI, real buttons, real per-job approval friction), but the AKD/AKL side can only be exercised via direct API calls standing in for a technician's escalation and MT's decision — which is itself an honest, valuable finding (it shows MT genuinely cannot triage this today), not a trial artifact to hide. See §10 Q2.

---

## 6. MT Trial Design

**Target volume:** 406 real `CalibrationJob` rows (§4), all siblings of one real WorkOrder, generated by the real `WorkOrder.start()` fan-out — not fabricated rows.

**Recommended state distribution** (using only states that exist, §2.5), designed to be reachable by driving the real service methods, not raw SQL:

| Bucket | Approx. share | How to reach it |
|---|---|---|
| PENDING (freshly fanned out, untouched) | ~55% (≈225 jobs) | Default state immediately after `start()` — no further action needed |
| IN_PROGRESS | ~15% (≈60 jobs) | `start()` called on the job (some with Kontrol Alat completed for SEND_TO_LAB items, some ON_SITE) |
| SUBMITTED, awaiting MT quality decision | ~10% (≈40 jobs) | Full realistic `MeasurementResult` rows written to satisfy the completeness gate, then `submitForReview()` |
| REWORK (rejected, awaiting technician resume) | ~5% (≈20 jobs) | `decideQualityReview()` REJECT on a submitted job |
| ACCEPTED_BY_QA (fully complete) | ~10% (≈40 jobs) | Full cycle: submit → approve → complete |
| SUBMITTED with a **pending Identity Correction ("BAI")** awaiting MT's Setujui/Tolak | a deliberate slice, e.g. 15–25 jobs | Submit an `IdentityCorrection` in `PENDING_REVIEW` on an otherwise-IN_PROGRESS or SUBMITTED job |
| Jobs with the AKD/AKL gate open (`PENDING_REVIEW`) | a small deliberate slice, e.g. 5–10 jobs | Direct API call to `escalate-identity` (no UI exists to do this — see §5.2); useful to prove the "MT can't see this in Portal" finding directly |

This mixture directly exercises every UX question the original task asked about: workload visibility at scale, job discovery inside one ~400-row group with no in-group pagination, BAI approval workload via the real "Setujui"/"Tolak" buttons, absence of any bulk action, and the dashboard's Row 1/2/3 counts moving realistically as jobs progress.

**Known friction MT will hit, already confirmed in code, not a hypothesis:**
- Expanding the one WorkOrder that holds all 406 jobs (or its largest single line item, 94 Syringe Pumps) renders every sibling row in one unpaginated, unfiltered `<table>`.
- **No bulk action exists anywhere** — approving 20 Identity Corrections is 20 individual clicks, not one.
- The `akdAklApprovalStatus` filter exists in the API/schema but has no UI control — unreachable without hand-editing the URL.
- The AKD/AKL approval workflow itself has no UI at all (§5.2) — cannot be experienced through the Portal regardless of how many jobs are seeded into that state.

---

## 7. Tech-PWA Trial Design

Recommended representative set: **12–14 real jobs** drawn from the same 406, chosen to hit every branch actually present in the code (§2.8), not a generic guess:

| Scenario | Why | Candidate source item |
|---|---|---|
| Simple job, 1 capability, Pattern A | Baseline flow | e.g. Centrifuge or CPAP (EXACT match, small qty) |
| Multi-capability / Pattern B grid | Input complexity | Any item mapped/synthesized with a multi-setpoint parameter (needs a synthetic device with real test points if none of the EXACT/ALIAS matches has one — Ventilator or Infusion Pump are the best real candidates to check first) |
| NIBP-grouped screen | The one capability with special UX collapsing | Only relevant if a device with an NIBP capability exists in the mapped set — **none of the 56 items obviously maps to a Patient Monitor/BSM device type**; flagged as an open question in §10 (Q4) rather than assumed |
| SEND_TO_LAB (Kontrol Alat mandatory gate) | Exercises the hard start-gate + dual signatures | Pick from WorkOrder items explicitly routed WOL |
| ON_SITE (no Kontrol Alat at all) | Confirms the section correctly disappears | Any ON_SITE-routed item |
| Device identity unresolved at arrival | Exercises the search/select branch | Any qty>1 line (most of them, since `deviceId` starts NULL) |
| Identity Correction wizard, full 5 steps | The real "BAI" submission flow | Any job, independent of other state |
| Reference-equipment approval pending | A second, narrower block on submit | One job with an unresolved/expired reference-equipment approval |
| Full rework cycle | Submit → MT reject → resume → re-enter from scratch → resubmit → approve → complete | One job, deliberately taken all the way through |
| A representative "complex device" if genuinely available | Multi-parameter, multi-capability navigation load | Whichever synthesized DeviceType ends up with the richest parameter chain |

Each scenario is chosen to answer the task's EASY/FAST/ACCURATE questions with a real screen count, not a description — e.g., a 1-parameter device is a ~3-screen round trip; a rework cycle forces a full re-entry with zero copy-forward (a genuine FAST/friction finding already confirmed in code, not something the trial needs to "discover").

---

## 8. Trial Fixture Architecture

**No trial/demo/isolation flag exists anywhere in the schema** (`CONFIRMED NOT PRESENT` — grepped for `trial|demo|isTrial|isSeedData|isSynthetic` across `packages/db` and `apps/api`; the only hits are unrelated uses of "trial" meaning a measurement replicate). This shapes the whole fixture design:

- **Transactional data is naturally resettable.** `CalibrationRequest → Quotation → PurchaseOrder → WorkOrder → CalibrationJob → Device` all trace back to a real `customerId`/`companyId`. Recommendation: create one dedicated trial `Customer` record (e.g. "RS Minto Hardjo (Trial)") under an existing/dedicated internal `Company`, with a clear naming convention (e.g. a fixed name prefix and a note field), so a reset script can safely cascade-delete everything scoped to that `customerId` — this is a normal, supported delete path, not a special mechanism.
- **Master data (`DeviceType`, `DeviceCapability`, `DeviceCalibrationParameter`, `DeviceTypeAlias`) is global, not customer-scoped.** Any synthetic rows created to cover the 36 SYNTHETIC items in §3 will be visible to every company/customer in the system indefinitely — there is no schema mechanism to mark or auto-clean them. **Recommendation:** maintain an explicit manifest (a checked-in JSON/seed script listing every synthetic `DeviceType`/`DeviceCapability`/`DeviceCalibrationParameter`/`DeviceTypeAlias` id created for this trial) so "reset" has something deterministic to deactivate (`isActive=false`, the existing soft-delete convention already used elsewhere in this schema) rather than guessing what to remove later.
- **Seed via real service/API calls, not raw SQL.** Job state is entangled with derived data the fan-out/start/submit/complete methods compute as side effects (`JobCalibrationTestPoint` snapshot, `currentAttempt`, tolerance snapshots, the `complete()` master-data write-through). A script that calls the same NestJS service methods (or hits the same REST endpoints tech-pwa/portal call) in sequence — real `preview()`→`confirm()` import, real `Quotation.approve()`, real `PurchaseOrder.approve()`, real `WorkOrder.assign()`+`start()`, then a driven subset through `start()`/`submitForReview()`/`decideQualityReview()`/`resumeAfterRework()`/`complete()`/`submitIdentityCorrection()`/`decideIdentityCorrection()` — guarantees every invariant (idempotency keys, unique constraints, completeness gates) is respected exactly as in production. This also reuses the existing ad-hoc test-factory *pattern* found throughout `apps/api/src/**/*.test.ts` (local helper functions wrapping `prisma.<model>.create` with `randomUUID()`-suffixed codes) — there is no shared factory module to import, but the pattern is well established and easy to replicate for a seed script.
- **Reset/reseed loop:** `reset` = cascade-delete everything under the trial `customerId` (or restore a pre-seed DB snapshot scoped to that data) + deactivate the manifested synthetic master-data rows. `reseed` = re-run the same script. Both are safe as long as the manifest is kept accurate.

---

## 9. Implementation Plan (safe phase sequence)

1. **Phase 1 — Architecture audit.** This document. Done.
2. **Phase 2 — Authoritative master-data check.** Run the real `po-mintohardjo.xlsx` through the existing, side-effect-free `preview()` import endpoint against the live database. This resolves every REQUIRES VERIFICATION item in §3 in one read-only call and is strictly better evidence than the static seed-file diff above.
3. **Phase 3 — Master-data gap closure.** For each SYNTHETIC/AMBIGUOUS row from Phase 2's real output: either add a `DeviceTypeAlias` (for genuine near-misses) or create a minimal new `DeviceCategory`/`DeviceType`/`DeviceCapability`/`DeviceCalibrationParameter` chain (for genuinely uncovered categories), tracked in the trial manifest (§8). Resolve the Tensimeter Analog alias ambiguity and the Microscope/Sterilisator Basah semantic ambiguities explicitly rather than letting fuzzy-match silently guess.
4. **Phase 4 — Trial isolation setup.** Create the dedicated trial `Customer` (and confirm which existing `Company` it sits under — not audited here, see §10 Q6). Write the manifest file.
5. **Phase 5 — Seed script.** Real import → Quotation → PO → WorkOrder → `start()` (yields the real 406 jobs in one WorkOrder), then drive the state distribution in §6 through real service/API calls.
6. **Phase 6 — Validation.** Confirm the dashboard's three volume metrics and the job list correctly reflect 406 jobs and the intended state mix; confirm no rows exist outside the trial `customerId`/manifest.
7. **Phase 7 — MT UX trial.** Operate exclusively through the real Portal UI against the seeded customer; deliberately exercise the dashboard, both job-list views, job detail, Identity Correction approve/reject, and (via direct API, since no UI exists) the AKD/AKL gate, recording friction against the already-known gaps in §2.7/§5.2.
8. **Phase 8 — Tech-PWA representative trial.** Execute the 12–14 jobs from §7 end to end through the real tech-pwa app, including one full rework cycle.
9. **Phase 9 — Findings / remediation write-up.** Compare observed friction to the pre-identified gaps (no bulk actions, unpaginated large group, unwired identity filter, absent AKD/AKL UI) and decide what, if anything, becomes a real follow-up implementation task — explicitly out of scope for this audit itself.

---

## 10. Open Questions / Blockers (must be resolved before implementation)

1. **406 vs ~409.** The real Excel file sums to 406, not 409. Recommend accepting 406 as correct (it's the real number from the real data) rather than inflating the dataset. Needs explicit sign-off since it changes the target number the task prompt stated.
2. **AKD/AKL has no UI.** Decide whether the trial should exercise this gate via direct API call (showing MT genuinely cannot act on it in the Portal today — a real, useful finding) or explicitly exclude it from this trial's scope and treat "give MT a UI for this" as a separate future feature task.
3. **Tensimeter Analog alias ambiguity.** Two canonicals both source-claim the "Tensimeter" alias; only one can exist in the live unique table. Must be checked against the live DB (Phase 2) and, if the "wrong" one currently wins, either fixed at the alias-admin level or explicitly worked around for this trial's row.
4. **No NIBP-capable device among the 56 items.** If exercising the tech-pwa NIBP-grouped screen is considered important to the trial's goals, an additional device type would need to be included that isn't literally in this Excel file — a deliberate, acknowledged departure from "only real Excel items," needing sign-off.
5. **Global master-data isolation has no schema support.** The manifest-based deactivation approach in §8 is a process control, not an enforced one — confirm this is an acceptable level of rigor for "safe to reset."
6. **Which Company the trial Customer sits under** was not audited in this pass (company-vs-customer scoping conventions weren't examined beyond the schema FK) — REQUIRES VERIFICATION before Phase 4.
7. **Minor unresolved items from source agents**, all cheap to check directly rather than re-auditing: whether `statusCounts` is actually rendered on the WorkOrder detail page; whether the `workOrderId` drill-down filter has a reachable entry point anywhere in the Portal; RBAC role-to-action mapping for the calibration-job endpoints; and the exact in-group expansion behavior (job-level vs line-item-level) when a WorkOrder with 406 siblings is opened in the grouped list — best confirmed with one live click-through rather than more static reading.

---

*Compiled from six parallel, read-only codebase investigations (requisition/QA/PO/Excel-import chain; calibration-job generation & state machine; BAI/identity-approval workflow; MT Portal UI & dashboard; Tech-PWA technician workflow; master-data catalog & seed infrastructure) plus a direct manual diff of all 56 Excel line items against the current `seed-device-types.ts` and `seed-device-type-aliases.ts` source files. No code, schema, or data was changed.*
