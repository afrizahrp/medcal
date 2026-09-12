# DEVICE IDENTITY VERIFICATION AUDIT

> **Date:** 2026-09-12  
> **Scope:** Verify current Device Identity implementation against locked business rules.  
> **Mode:** Audit / verification only (no redesign of working `IDENTITY_CORRECTION`).  
> **Certificate / Invoice / Payment:** Out of scope for implementation.

---

## Objective

Inspect the existing MedCal Device Identity implementation and answer:

1. Does it already follow the locked business rules?
2. What are the genuine implementation gaps?
3. What must be fixed now vs deferred as future integration?

**Do not** rebuild or replace the existing `IDENTITY_CORRECTION` workflow. It has already been executed manually and confirmed working.

---

## Object mapping (read first)

There is **no** `CustomerDevice` table. Current domain objects:

| Object | Role |
|---|---|
| `DeviceType` / `DeviceModel` | Global catalog (not customer physical identity) |
| `Device` (`customerId` + system `code` DVC-xxxxxx) | **Customer Device** — physical unit owned by a customer |
| `CalibrationRequestItem.deviceId` | Customer-declared Device ID label, free-text, **not** a FK to `Device` |
| `CalibrationJob.deviceId` | FK to `Device`, nullable until technician binds via BA |
| Job snapshot fields | `customerDeclared*`, `technicianObservedSerial`, `technicianObservedAkdAkl` |

Identity correction binds to `Device` (Customer Device), not to the global catalog. That is the correct domain object.

---

## Locked business rules (summary)

1. Device identity is **not** guaranteed at Requisition / WO creation.
2. Device ID and Serial Number are **not** required to differ.
3. Technician confirms identity from the physical device (Device ID, Serial, AKD/AKL).
4. Existing `IDENTITY_CORRECTION` is the controlled path when discovered identity differs — do not redesign it.
5. Missing identity values → warning/flag; do not invent values; do not hard-reject the job; MT remains decision maker.
6. After Certificate issuance, clean-confirmed identity becomes the **current** Customer Device identity.
7. `CalibrationJob` retains a **historical snapshot**; live Customer Device updates must not rewrite history.
8. Do not blindly update global Device Master if Customer Device is the correct target.

---

## Verification report

### 1. CalibrationJob.deviceId

**Status:** A. ALREADY CORRECT

**Evidence:**
- `CalibrationJob.deviceId` is `String?` (nullable). Schema comments state identity is normally unknown until physical verification.
- Work Order fan-out always creates jobs with `deviceId: null`.
- Postgres treats NULLs as distinct, so many unbound jobs can coexist under one Work Order; `@@unique([workOrderId, deviceId])` only binds once `deviceId` is set.
- `CalibrationJobsService.start()` intentionally does **not** require identity: identity / AKD/AKL may still be unresolved.
- Device binding only occurs through an approved Identity Correction BA (`bindDevice`). Former `POST assign-device` returns 410 Gone.

**Required action:** None.

---

### 2. Technician identity confirmation

**Status:** A. ALREADY CORRECT (working path); see section 4 for warning-flag nuance

**Evidence:**
- Sole path to set/change identity: `POST /calibration-jobs/:id/identity-corrections` (first-time resolution **and** later correction).
- Technician selects existing `Device`, optionally corrects Serial / AKD/AKL; technician + customer signatures; BA photo; MT `decideIdentityCorrection`.
- Identity gate locks at job status `SUBMITTED` / `ACCEPTED_BY_QA`.
- Separate AKD escalation path: `escalateIdentity` → MT `decideIdentity`.
- No silent path that overwrites historical identity without BA + approval.

**Required action:** Do not create a parallel confirmation workflow. On-site creation of a brand-new `Device` remains office CRUD (prior domain decision; out of scope here).

---

### 3. Device ID / Serial Number relationship

**Status:** A. ALREADY CORRECT

**Evidence:**
- No validation requiring `Device.code !== serialNumber` or observed serial ≠ Device ID.
- `Device.serialNumber` is nullable and **not** unique.
- `Device.code` is system-issued and immutable (DVC-xxxxxx); serial may equal code.

**Required action:** None. Do not add artificial “must be different” validation.

---

### 4. Missing identity handling

**Status:** C. IMPLEMENTATION GAP (warning / flag only); hard-block absence is already correct

**Evidence — already aligned:**
- Empty values stored as `null`, not placeholders (`"-"`, `"N/A"`, `"000"`).
- Job is **not** auto-rejected when Device ID / serial / AKD are empty.
- `start`, `submitForReview`, measurement, and physical check do **not** force `deviceId` / serial / AKD.
- MT remains decision maker via AKD escalation and BA approval.

**Evidence — gap:**
- No dedicated warning/flag for “identity incomplete”.
  - Portal Identitas chip stays `neutral`.
  - `actionSignals` currently only: `identityCorrectionPending`, `referenceEquipmentNeedsApproval`.
  - UI copy such as “Alat belum diidentifikasi” / `"—"` is informational, not a flag.
- Null is overloaded: “not yet checked” vs “checked but not found”.
- BA UI requires non-empty values when an attribute checkbox is selected; API allows `null`, but approve path ignores `newSerial` / `newAkdAkl` when null (`if (correction.newSerial !== null)`), so a BA cannot currently record “NOT FOUND” as a change.
- Missing AKD defaults to `NOT_REQUIRED`; escalation is optional. Auto-opening the gate when declaration is empty was deferred at fan-out.

**Required action (smallest safe fix, when implementing):**
1. Add a warning signal (e.g. `identityIncomplete`) when `deviceId` / observed serial / observed AKD remain null **after** technician work has started — **without** hard-blocking the job.
2. Do not force MT approval for every empty field unless business rules require it (AKD already has escalation).
3. Do not redesign BA solely for “NOT FOUND”; flag + existing AKD escalation is enough for v1.

---

### 5. IDENTITY_CORRECTION

**Status:** A. ALREADY CORRECT

**Evidence:**
- Data model: `IdentityCorrection` + `IdentityCorrectionSignature`; `prev*` / `new*` for device, serial, AKD; BA number (BAI); status `PENDING_REVIEW` → `APPROVED` / `REJECTED`.
- Submit: at least one attribute must change; at most one pending BA per job; reason required.
- Approve: writes through to **job snapshot** (`deviceId`, `technicianObservedSerial`, `technicianObservedAkdAkl`); AKD mismatch opens gate with `AUTO_MISMATCH`; manual escalation is not auto-closed by text match alone.
- Auth: technician submit; only `TECHNICIAN_MANAGER` decides.
- Evidence: photo via `FileOwnerType.IDENTITY_CORRECTION`; BA PDF; UNAVAILABLE / REFUSED signatures supported.
- History: many BAs per job; `prev*` retained.

**Required action:** None. Do not replace, duplicate, or change working behavior without a concrete business requirement.

---

### 6. Customer Device update

**Status:** D. FUTURE INTEGRATION POINT

**Evidence:**
- Approving a BA does **not** update `Device.serialNumber` (or other `Device` fields).
- `complete()` only moves `SUBMITTED` → `ACCEPTED_BY_QA`. No Device write, no Certificate creation.
- `Certificate` model exists in Prisma; there is **no** Certificate module/service/issue API under `apps/`.
- `Device` has **no** `akdAkl` column. AKD write-back to Customer Device has nowhere to land yet.
- `KontrolAlat.certificateNumber` is a manual In Lab number, not the Certificate module.

This is **not** a BA bug. Locked rule: update Customer Device **after Certificate issuance**.

**Future integration point (do not build now):**

```text
QualityReview APPROVED
  → CalibrationJob.complete() → ACCEPTED_BY_QA
  → [NOT BUILT] Certificate.issue
       → write clean-confirmed identity to Device (Customer Device):
            serialNumber ← technicianObservedSerial (if present)
            (akdAkl ← technicianObservedAkdAkl — requires new Device column later)
            ensure CalibrationJob.deviceId is already bound
       → DO NOT rewrite historical CalibrationJob snapshot fields
```

Correct target object: `Device` (has `customerId`), **not** `DeviceType`.

**Required action now:** None. Do not write Device on BA approve (too early vs “after certificate”).

---

### 7. Historical CalibrationJob snapshot

**Status:** A. ALREADY CORRECT (minor display debt)

**Evidence:**
- Snapshot fields on job: `customerDeclaredDeviceName`, `customerDeclaredAkdAkl`, `technicianObservedSerial`, `technicianObservedAkdAkl`.
- Schema intent: frozen on the job, not read through live `Device`.
- `Device.update()` mutates live master; it does **not** overwrite job snapshot columns.
- After `SUBMITTED` / `ACCEPTED_BY_QA`, identity gate is locked.
- BA stores `prev*` / `new*` as audit trail.

**Accepted display debt (E):**
- Some “Assigned Device” / list UIs fall back to live `job.device.serialNumber`. Historical snapshot columns remain intact.

`CalibrationRequestItem.deviceId` (customer label) is **not** snapshotted onto the job and is not on the job GET payload. Confirmed identity is FK `Device` + observed serial/AKD. That matches locked BA v1 attributes (deviceId, serial, AKD only). Not a reason to add columns now.

**Required action:** No data-model change. Do not make historical job identity depend on live `Device`.

---

### 8. ON_SITE vs ON_LAB

**Status:** A. ALREADY CORRECT

**Evidence:**
- Fan-out, nullable `deviceId`, snapshots, BA, and AKD gate are the **same** for `ON_SITE` and `SEND_TO_LAB`.
- In Lab difference is Kontrol Alat (F.MU.08 start gate only), not identity semantics.
- Tech-PWA “Ajukan Koreksi Identitas” is not gated by `serviceMode`.

**Required action:** None.

---

## Classification legend used

| Code | Meaning |
|---|---|
| **A** | Already correct — matches locked rule; no change |
| **B** | Business rule gap — implementation conflicts with locked rule |
| **C** | Implementation gap — rule clear, code incomplete/incorrect |
| **D** | Future integration point — dependent module not built; do not implement now |
| **E** | Accepted technical debt — known limitation; not required for this task |

---

## SUMMARY

### Already correct
- Job may exist before physical identity is confirmed (`deviceId` null).
- ON_SITE and ON_LAB share the same identity principle.
- Device ID and Serial **may be equal**; no artificial inequality rule.
- `IDENTITY_CORRECTION` is complete and is the sole bind/change path for job identity.
- No hard-block that rejects a job solely because identity fields are incomplete.
- Job snapshot is separate from editable live `Device`.
- Binding targets Customer Device (`Device` + `customerId`), not catalog `DeviceType`.

### Must fix
Only one genuine gap vs locked rules **without** redesigning BA:

- **Warning / flag for incomplete identity** (unbound device / empty observed serial / empty observed AKD), with MT visibility — **without** rejecting the job, inventing values, or adding a parallel correction flow.

Smallest safe future change: `actionSignals` + Portal / Tech-PWA chip/badge. Do not touch BA submit/approve, BA schema, or Certificate.

### Future integration
- Write clean-confirmed identity back to `Device` at **Certificate issuance** (module not built).
- `Device.akdAkl` (or equivalent) if AKD must become current Customer Device identity.
- Do **not** call that write-back from `decideIdentityCorrection` or `complete()`.

### Accepted debt
- New physical devices must be registered by admin/office first; technician cannot create-on-site.
- Null conflates “not yet filled” and “not found”; BA UI does not submit “NOT FOUND”.
- `CalibrationRequestItem.deviceId` (customer label) is not snapshotted onto the job.
- Some UI surfaces fall back to live `Device.serialNumber`.
- `AkdAklApprovalStatus.REJECTED` does not block `start` / `submit` (enum comment vs `start()` comment); changing this would alter working behavior — leave alone for this task.
- Older gap-register note O-5 (`deviceId` required) is **obsolete**.

---

## Implementation rule (when fixing)

Only after confirming a genuine implementation gap:

1. Make the smallest safe change.
2. Add/update tests.
3. Do not alter unrelated modules.
4. Do not redesign working Identity Correction.

After any implementation, report: files changed, why each changed, tests added/changed, test results, remaining limitations.

---

## FINAL PRINCIPLE

> Do not solve problems that do not exist.  
> Do not redesign what is already working.  
> Verify the implementation against the locked business rules first.

---

## Key code references

| Area | Location |
|---|---|
| Schema — `CalibrationJob` identity | `packages/db/prisma/schema.prisma` (`CalibrationJob`, identity snapshot + `deviceId?`) |
| Schema — Identity Correction | `packages/db/prisma/schema.prisma` (`IdentityCorrection`, `IdentityCorrectionSignature`) |
| Schema — Customer Device | `packages/db/prisma/schema.prisma` (`Device`) |
| Fan-out (`deviceId: null`) | `apps/api/src/modules/work-orders/work-orders.service.ts` |
| Identity / BA service | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` |
| Identity API | `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` |
| Shared contracts | `packages/shared/src/schemas/index.ts` |
| Action signals | `packages/shared/src/utils/calibration-job-action-signals.ts` |
| RBAC | `packages/auth/src/access-control.ts`, `packages/db/prisma/seed-role-permissions.ts` |
| Tech-PWA gate helpers | `apps/tech-pwa/src/lib/calibration/identity-gate.ts` |
| Tech-PWA BA wizard | `apps/tech-pwa/src/app/jobs/[id]/identity-correction/` |
| Portal job identity UI | `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` |
