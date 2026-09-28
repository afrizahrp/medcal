# Minto Hardjo High-Volume Calibration Trial — Implementation Plan (Revised)

**Status: PLANNING ONLY. Nothing has been implemented.** No code, migration, seed script, or data was created or modified while writing this revision. This supersedes the prior version of this document in place (same file).

**Builds on:** `MINTO-HARDJO-HIGH-VOLUME-TRIAL-AUDIT-REPORT.md` (same folder) for all underlying architectural facts.

**Environment:** local development only. Per explicit instruction, **no production-like `DATABASE_URL` safety gate, `--allow-production-trial` flag, or similar operational guard is introduced anywhere in this plan.** The scripts described below run directly against whatever database the local environment's `DATABASE_URL` points to, exactly like every other existing `seed:*` script in this repo — no new safety mechanism is layered on top.

---

## A. LOCKED Decisions

1. **406, not 409.** The real dataset sums to 406 units; the fan-out rule is 1 unit = 1 job. No manufactured jobs.
2. **Real workflow only.** Every job, status, and approval in this trial is produced by calling the actual services/APIs the Portal and Tech-PWA already call — no mock UI, no bypassed business rules.
3. **MT experiences the full 406-job workload** as real transaction records through the real Portal: discovery, browsing, filtering/search, status distribution, QA review, Identity Correction review, sibling navigation, and general operational load at this volume. **No bulk-approval feature is built** for this trial.
4. **Identity Correction *is* the "Setujui Identitas Alat yang digunakan untuk kalibrasi" workflow** — not a second, separate mechanism. Its pending/approved/rejected cases must be **deliberately spread across different device types and unit ordinals**, not merely hit a numeric target, so MT's real discovery/review UX is genuinely exercised (a manager should encounter pending BAs at different points while browsing different WorkOrder-item groups, not all clustered in one place).
5. **AKD/AKL is excluded from the primary trial.** It has no operational UI today; this plan does not build or simulate one. No job in this trial ever has `akdAklApprovalStatus ≠ NOT_REQUIRED`.
6. **Master-data priority:** exact match → existing alias/known mapping → representative existing DeviceType where semantically appropriate → synthetic DeviceType only when necessary. Synthetic data is clearly namespaced, semantically plausible, minimum-viable, never modifies existing records, and **adds no new `DeviceTypeAlias` rows** (not required by the current mapping — see §C.2).
7. **Tech-PWA gets ~10–15 representative jobs**, selected from the *actual* capability/parameter chains this implementation discovers (not hypothetical ones), covering simple/multiple-parameter/more-complex-where-supported/identity-resolution/rework variation. **No NIBP scenario is invented** — nothing in this dataset supports one.
8. **State distribution stays approximately PENDING 60% / IN_PROGRESS 15% / SUBMITTED 10% / REWORK 4% / ACCEPTED_BY_QA 11%**, but only once each state is verified genuinely reachable through the real workflow (§B.5) — no direct status writes, no "database theater."
9. **Deterministic, reproducible, safely repeatable seed/reset** in local development; reset removes the trial transaction chain and deactivates synthetic master data per the project's existing soft-delete convention; the manifest is the sole authority for what belongs to the trial; reseed reproduces the same logical dataset.
10. **`isActive=false` is kept as the only isolation mechanism unless proven insufficient** — no new schema field is introduced speculatively. (Resolved in §B.1 — it is sufficient; no schema change follows.)
11. Only the genuinely necessary open questions get resolved before implementation (company/customer setup, quotation trigger, real parameter richness, isActive leak paths, current dashboard state) — all five are resolved in §B, not deferred.
12. **No production business-logic, RBAC, Portal/Tech-PWA UI, or existing-master-record changes; no schema migration; no bulk approval; no 409.**

---

## B. Pre-Implementation Verifications

All five items below were checked directly against current code as part of preparing this revision (not deferred to a future "Phase A") — each is stated in the requested check/where/proceed-if/change-if form for auditability, with the actual result recorded.

### B.1 — Is `isActive=false` sufficient to keep synthetic master data out of pickers, import matching, fuzzy matching, and alias/device lookup?

- **What to check:** every code path that resolves a `DeviceType`/`DeviceTypeAlias` for (a) Excel-import matching, (b) the manual device-type picker used during import review, and (c) the general admin list/picker endpoints.
- **Where:** `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts:352-407` (`buildMatchIndex`); `apps/api/src/modules/device-types/device-types.service.ts:58-73` (`findAll`); `apps/api/src/modules/device-type-aliases/device-type-aliases.service.ts:109-124` (`findAll`); the Portal's actual picker call sites under `apps/portal/src/app/management/calibration-requests/**`.
- **Result — CONFIRMED FROM CODE:**
  - `buildMatchIndex` queries both `DeviceType` and `DeviceTypeAlias` with `where: { isActive: true }` (lines 355, 359) — exact/alias/fuzzy-suggestion matching during Excel import is fully isolated from inactive rows, since fuzzy suggestions are generated from this same active-only index.
  - The raw `findAll()` service methods on `device-types.service.ts` and `device-type-aliases.service.ts` only filter on `isActive` **if the caller passes it** — no filter by default. This *could* be a leak if some UI called them with no filter.
  - Checked the actual Portal call sites that matter (the real "picker" the task cares about): `calibration-requests/import/import-page-client.tsx:74`, and the requisition `new`/`edit`/`[id]` detail pages, **all explicitly pass `isActive: true`**. The one remaining unfiltered caller is the generic Device Types *admin management list* itself, which is expected to show inactive rows to an admin browsing the master catalog (the same soft-delete convention already used for any other deactivated DeviceType in this system today, not something this trial introduces).
- **Proceeds as:** Option A (deactivate + manifest, §C.6) is confirmed sufficient. **No `isTrialFixture` schema field, no migration.**
- **Would have required changing the plan if:** the import-matching path itself ignored `isActive` — it doesn't.

### B.2 — Trial Company/Customer setup

- **What to check:** how a `Customer` is created in this codebase, and what it requires.
- **Where:** `packages/db/prisma/schema.prisma:1045-1065` (`Customer` model — requires `companyId`, `number`, `name`; everything else optional); an established test pattern at `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts:119` (`prisma.customer.create` under an existing `companyId`).
- **Result — CONFIRMED FROM CODE:** this is a standard, mandatory-field-only creation. The trial reuses whatever single operating `Company` row already exists in the local dev database and creates one new `Customer` row under it (clearly named, e.g. `"RS Minto Hardjo (Trial)"`).
- **Proceeds as:** no new Company is created; one new Customer row, following the existing test-factory pattern.
- **Would have required changing the plan if:** `Customer` had mandatory fields that only make sense for a real hospital onboarding (e.g. a required tax/legal linkage) — it doesn't; only `number`/`name` are mandatory beyond the FK.

### B.3 — Exact Quotation-generation trigger

- **What to check:** whether a `Quotation` is created automatically when a `CalibrationRequest` is submitted, or via a separate explicit call.
- **Where:** `apps/api/src/modules/quotations/quotations.service.ts:434-464` (`QuotationsService.create(companyId, input)`).
- **Result — CONFIRMED FROM CODE:** it is an **explicit, separate action** — `create()` takes `input.requestId`, loads the `CalibrationRequest`, requires its status to be in `QUOTABLE_REQUEST_STATUSES`, and refuses if a `Quotation` already exists for that request. Not automatic.
- **Proceeds as:** the seed script calls `POST /quotations` (or the equivalent service method) with the trial `CalibrationRequest`'s id as an explicit step, after `submit()`.
- **Would have required changing the plan if:** quotation creation happened as a side effect inside `CalibrationRequestsService.submit()` — it doesn't; these are cleanly separable steps.
- **One trivial, non-blocking item to confirm literally at the moment this step is written:** that `SUBMITTED` is included in `QUOTABLE_REQUEST_STATUSES` (near-certain given the enum flow, one line to check, not treated as an open question).

### B.4 — Real parameter richness for the Tech-PWA "more complex" scenario

- **What to check:** among the EXACT/ALIAS-tier real DeviceTypes this trial will actually use (Ventilator, Infusion Pump, Syringe Pump, Centrifuge, CPAP, Nebulizer Compressor, Pulse Oximeters, Dental X-Ray, Ambulatory ECG), which already has the richest calibration-parameter catalog.
- **Where:** `packages/db/prisma/seed-device-calibration-parameters.ts` and `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`, grepped per device-type code.
- **Result — CONFIRMED FROM CODE (approximate richness by source-line count, sufficient for a selection decision, not exhaustive parameter auditing):** `VENTILATOR` (16) is markedly richer than `CPAP` (11), `DENTAL_XRAY` (10), `PULSE_OXIMETERS` (9), `NEBULIZER_COMPRESSOR` (8), and `INFUSION_PUMP`/`SYRINGE_PUMP`/`CENTRIFUGE` (4 each). `AMBULATORY_ECG` (Holter's mapping) has **zero**, confirming the audit's finding.
- **Proceeds as:** **Ventilator is the real device used for the "multiple parameters / more complex calibration flow" Tech-PWA scenario** (§C.7) — no synthetic Pattern-B parameter chain needs to be invented for this purpose, since a real, already-production DeviceType already supports it.
- **Would have required changing the plan if:** none of the real matches had meaningfully more parameters than a trivial single-value one — then one synthetic DeviceType would have needed a deliberately richer chain. Not needed.

### B.5 — Is every proposed CalibrationJob state genuinely reachable through the real workflow?

- **What to check:** that `start()`, `submitForReview()`, `decideQualityReview()`, `resumeAfterRework()`, and `complete()` are callable in sequence with data this seed script can construct, with no undocumented invariant blocking any of them.
- **Where:** `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — `start()` L1106, `submitForReview()` L1151, `decideQualityReview()` L1222, `resumeAfterRework()` L1310, `complete()` L1338 (all already read and cited in the audit report).
- **Result — CONFIRMED FROM CODE (carried from the audit, re-confirmed as still current since no relevant file changed — §0):** each transition's precondition is a concrete, satisfiable data condition (job status + `startedAt`; measurement completeness against the frozen `JobCalibrationTestPoint` snapshot; a `QualityReview` row of the right status) — none require anything this seed script cannot itself produce by calling the same, earlier real methods in order.
- **Proceeds as:** §C.5's state-distribution mechanism (real method calls only, plausible `MeasurementResult` values, never a raw status write) stands as designed.
- **Would have required changing the plan if:** any transition depended on something outside the seed script's control (e.g., a wall-clock delay, an external system callback) — none do.

### B.6 — Current dashboard route/state (concurrent-edit check)

- **What to check:** whether the calibration-management dashboard route cited in the audit is still current, given the shared working directory showed concurrent edits at the time the audit was written.
- **Where:** `apps/portal/src/app/management/page.tsx` and `apps/portal/src/app/management/calibration-dashboard/page.tsx`, both read directly just now.
- **Result — CONFIRMED FROM CODE, and different from the audit's snapshot:** `management/page.tsx` is now a role-based landing/redirect page (routes `SUPERVISOR`/`GENERAL_MANAGER`/`SUPERADMIN` elsewhere on sign-in); the actual dashboard content (`useManagementDashboardQuery`, the metrics grid) has moved to **`apps/portal/src/app/management/calibration-dashboard/page.tsx`**.
- **Proceeds as:** §D's validation step uses `/management/calibration-dashboard` as the live dashboard route, not `/management`.
- **Would have required changing the plan if:** the dashboard's underlying API (`GET /dashboard/management-summary`) had also changed shape — it was not touched, only the frontend route moved; no further action needed.

**Summary: all five verifications resolved in favor of proceeding exactly as designed. No verification produced a result requiring a plan change beyond noting the moved dashboard route.**

---

## C. Implementation Steps

### C.1 Fixture source of truth

The real `.xlsx` is not in this repository (confirmed absent by filename search). The 56-row/406-unit table already verified in the audit (§3 of the audit report) is the checked-in source of truth:

```
packages/db/fixtures/trial-minto-hardjo/source-rows.ts        # 56 rows, verbatim names + qty
packages/db/fixtures/trial-minto-hardjo/po-mintohardjo.xlsx   # generated once from source-rows.ts, same shape a real upload would have
packages/db/fixtures/trial-minto-hardjo/device-type-mapping.ts # every row's resolved deviceTypeId (see C.2)
packages/db/fixtures/trial-minto-hardjo/manifest.json          # generated by the seed script; sole reset authority
```

### C.2 Mapping strategy (per the locked priority order)

- **Exact (5 items / 156 units):** Centrifuge, CPAP, Infusion Pump, Syringe Pump, Ventilator.
- **Existing alias/known mapping (4 items / 45 units):** Holter→Ambulatory ECG, Nebulizer→Nebulizer Compressor, Pulse Oximeter→Pulse Oximeters, X-Ray Dental→Dental X-Ray. **Caveat carried forward:** Ambulatory ECG has zero calibration parameters — the 10 Holter jobs stay at `PENDING` only (never selected for a later state or as a Tech-PWA job).
- **Representative existing DeviceType (10 items / 66 units, pinned directly in `device-type-mapping.ts`, no alias rows added):** Bio Safety Cabinet (BSC)→Bio Safety Cabinet, Electrocardiograph (EKG)→Electrocardiographs, Medical Frezer→Medical Freezer, Parafin Bath→Paraffin Baths, Photo Therapy (Blue Light)→Phototherapy, Audiometri→Audiometer, HENC Ambubag→Resuscitators (Pulmonary), Resuscitator/Neo Puff→Resuscitators (Pulmonary), Sterilisator Basah→Sterillizer (Sterillisator), Tensimeter Analog→Sphygmomanometers (the classical analog term, chosen over the digital-implying "Blood Pressure Monitor").
- **Synthetic (37 items / 139 units, including Microscope — see rationale below):** every item with no plausible existing canonical, per the audit's SYNTHETIC list, plus **Microscope**, which is deliberately *not* mapped to the existing `Mikroskop Laboratorium` (a lab microscope — a materially different real device from a generic hospital "Microscope" line item; mapping it there would be semantically implausible, violating the "semantically plausible" requirement in decision 6).

**Why no new `DeviceTypeAlias` rows:** the "representative existing DeviceType" tier is resolved by pinning `deviceTypeId` directly in the trial-local mapping file — `import/confirm`'s wire format already requires an explicit `deviceTypeId` per row regardless, so this is exactly how a human reviewer would resolve these rows through the real UI, with zero footprint on shared alias master data. This satisfies decision 6's explicit instruction not to add aliases unless required — it is not required.

### C.3 Synthetic master data (37 DeviceTypes)

One new seed script, `packages/db/prisma/seed-trial-minto-hardjo-device-types.ts`, following the existing `seed-device-types.ts`/`seed-device-calibration-parameters.ts` conventions:

- Each new `DeviceType` is coded `TRIAL_MH_*` (e.g. `TRIAL_MH_DEFIBRILLATOR`, `TRIAL_MH_AED`, `TRIAL_MH_ESU`, `TRIAL_MH_USG`, `TRIAL_MH_TIMBANGAN_BADAN_TINGGI`, `TRIAL_MH_MICROSCOPE`, …), assigned to the closest fitting existing `DeviceCategory`, with one new category only if genuinely nothing fits.
- Each gets exactly one `DeviceCapability`/`DeviceCapabilityItem` pairing appropriate to what that device is actually calibrated for, and **1–3 `DeviceCalibrationParameter` rows**, `entryStyle: DIRECT_REPLICATES` (Pattern A) for nearly all of them — minimum-viable structure only, per decision 6/7. (No synthetic Pattern-B chain is needed — B.4 resolved that need onto the real Ventilator DeviceType instead.)
- No existing `DeviceCategory`/`DeviceType`/`DeviceCapability`/`DeviceCalibrationParameter`/`DeviceTypeAlias` row is edited. Every created id is written to the manifest as it's created.

### C.4 Exact 406-job generation

All steps call real, unmodified service/API methods, in order:

1. Create the trial `Customer` under the existing Company (§B.2).
2. `POST import/preview` with the fixture `.xlsx` (read-only cross-check against the live mapping file).
3. `POST import/confirm` with the 56 rows + the pinned `deviceTypeId`s from `device-type-mapping.ts` → 1 `CalibrationRequest`, 56 `CalibrationRequestItem` rows, Σqty = 406.
4. `POST :id/submit` on the request → `DRAFT→SUBMITTED`.
5. `QuotationsService.create(companyId, { requestId })` (§B.3) → then commercially approve it (`customerApprovedAt` set).
6. Create + approve the `PurchaseOrder` from the approved Quotation (1:1 item copy, qty preserved).
7. Create the `WorkOrder` from the approved PO (1:1 item copy; the "one active WorkOrder per PO" constraint means this is the trial's only WorkOrder).
8. `WorkOrdersService.assign()` a small technician pool → `PLANNED→ASSIGNED`.
9. `WorkOrdersService.start()` → `ASSIGNED→IN_PROGRESS`, runs `fanOutCalibrationJobs()` → **exactly 406 `CalibrationJob` rows**, all `PENDING`, all `deviceId = NULL`.
10. Record every id (request/quotation/PO/WorkOrder/all 406 job ids/customer/every synthetic master-data id) in the manifest.

### C.5 State distribution (per decision 8 — real methods only)

| Bucket | Target | Mechanism |
|---|---:|---|
| `PENDING` | ~244 (60%) | default, no action |
| `IN_PROGRESS` | ~61 (15%) | `start()` + a deliberately incomplete set of realistic `MeasurementResult` rows |
| `SUBMITTED` | ~41 (10%) | `start()` + a complete, plausible measurement set satisfying the frozen test-point snapshot → `submitForReview()` |
| `REWORK` | ~16 (4%) | as above → `decideQualityReview()` REJECT with a realistic note |
| `ACCEPTED_BY_QA` | ~44 (11%) | as above → `decideQualityReview()` APPROVE → `complete()` |

Excludes: any job mapped to Ambulatory ECG (stays `PENDING` only, §C.2), and every job's `akdAklApprovalStatus` stays `NOT_REQUIRED` throughout (decision 5).

### C.6 Identity Correction distribution (per decision 4 — spread, not just a count)

~28 jobs total get an `IdentityCorrection` row, **deliberately spread**:
- Across **at least 5–6 different device types** (a mix of exact-match, representative-mapped, and synthetic devices) rather than concentrated in one WorkOrder-item group.
- Across **different `unitOrdinal` positions** within multi-unit lines (e.g. not always unit #1 of a 94-unit Syringe Pump line — pick scattered ordinals like #3, #40, #77) so MT genuinely has to discover them while browsing, not find them all in the first row.
- ~22 left `PENDING_REVIEW` (the real "Setujui/Tolak" workload), overlaid on a mix of jobs already at `IN_PROGRESS` or `SUBMITTED` (a pending BA doesn't block bench work, only submission-to-review completion, per the audit).
- ~4 already `APPROVED`, ~2 already `REJECTED`, so MT's history view isn't empty.

### C.7 Tech-PWA representative jobs (~12–14, from the real 406)

Selected using the actual parameter chains confirmed in §B.4, not hypothetical ones:

| Scenario | Device (real, from this trial's own dataset) |
|---|---|
| Simple, single/few-parameter Pattern A | Centrifuge or CPAP (exact match) |
| Multiple parameters / more complex flow | **Ventilator** (exact match, confirmed richest real parameter set) |
| Device identity unresolved at arrival (search/select) | Any qty>1 line (nearly all of them start `deviceId = NULL`) |
| Identity Correction wizard, full submission | Any job, independent of other state |
| SEND_TO_LAB (Kontrol Alat gate) vs ON_SITE | One of each service mode, any device |
| Reference-equipment approval pending | One job with an unresolved reference-equipment approval |
| Full rework cycle | One job: submit → MT reject → resume → re-enter from scratch → resubmit → approve → complete |
| Representative synthetic device | One `TRIAL_MH_*` device, to confirm the minimum-viable synthetic parameter chain is actually usable end-to-end in the real Tech-PWA UI |

**No NIBP scenario** — nothing in this dataset maps to an NIBP-capable device type; not invented (decision 7).

### C.8 Scripts, seed/reset mechanism

```
packages/db/scripts/seed-trial-minto-hardjo.ts     # orchestrates C.3–C.7, idempotency-guarded
packages/db/scripts/reset-trial-minto-hardjo.ts    # tears down from the manifest
```
- **Seed** refuses to double-seed if the manifest/trial Customer already exists.
- **Reset** deletes the trial transaction chain (406 CalibrationJobs → WorkOrder → PO → Quotation → CalibrationRequest → Customer) and **deactivates** (`isActive=false`, never hard-deletes) every manifested synthetic master-data row — matching the existing soft-delete convention (§B.1), no schema change.
- **Reseed** = reset, then seed again; reproduces the same logical dataset and state distribution (percentages, not necessarily identical ids).
- No environment/safety gate is added to either script (see header note).
- `packages/db/package.json` gets two new script entries (`seed:trial-minto-hardjo`, `reset:trial-minto-hardjo`) — the only edit to an existing file this plan requires.

---

## D. Validation / Acceptance Criteria

1. `GET /dashboard/management-summary`, viewed at the **current** route `/management/calibration-dashboard` (§B.6), shows Volume/status figures consistent with 406 total jobs.
2. The calibration-jobs list, scoped to the trial WorkOrder, totals exactly 406.
3. `GET /calibration-jobs/work-order-summary?workOrderId=<trial WO id>` `statusCounts` matches the §C.5 targets.
4. Identity Correction counts (pending/approved/rejected) match §C.6 targets, and a manual browse confirms they appear spread across multiple device types/ordinals, not clustered.
5. Zero rows outside the trial `customerId` are touched anywhere in the CalibrationRequest→Quotation→PO→WorkOrder→CalibrationJob→Device chain.
6. The manifest matches the actual DB rows 1:1 (every manifested id resolves; no extra synthetic rows exist outside it).
7. `reset` → `seed` once more reproduces the same counts/distribution (reproducibility check, decision 9).
8. All 12–14 Tech-PWA jobs are completable end-to-end through the real Tech-PWA app without any workaround.

---

## E. Remaining Risks or Blockers

**No genuine blocker remains.** Everything that was an open question in the prior plan revision has been resolved directly against current code (§B). What's left are small, non-blocking execution-time confirmations, explicitly not treated as blockers:

- Confirm `SUBMITTED` is literally in `QUOTABLE_REQUEST_STATUSES` before calling `QuotationsService.create()` (one-line check, §B.3).
- Finalize the exact 37 `TRIAL_MH_*` codes and their category assignments when writing `seed-trial-minto-hardjo-device-types.ts` (a direct, mechanical continuation of §C.2/§C.3's mapping, not a new decision).
- The dashboard route moved once already during this session (§B.6); re-glance at it immediately before running the validation step in case the shared working directory has moved it again.
- The exact realistic `MeasurementResult` values (in-tolerance vs. a deliberate few out-of-tolerance) are an implementation-time detail, not specified further here, and can be finalized once each parameter's tolerance bounds are read directly while writing the seed script.

---

## READY FOR IMPLEMENTATION

**READY.** All locked decisions are reflected, all five pre-implementation verifications resolved in favor of proceeding with no schema change, no genuine blocker remains, and the plan stays within the explicit scope boundaries (no production logic/RBAC/UI changes, no migration, no bulk approval, no 409, no AKD/AKL UI, no environment safety gate).
