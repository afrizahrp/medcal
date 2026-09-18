# MoM #6 — Audit Report

> READ-ONLY FORENSIC AUDIT. No code, schema, migration, API, UI, or test was modified.
> Evidence base: `packages/db/prisma/schema.prisma` (2920 lines), 81 migrations,
> `apps/api`, `apps/portal`, `apps/tech-pwa`, `packages/shared`, `packages/auth`.
>
> Date: 2026-09-18. Source brief: `docs/minutes-of-meeting/Audit_MoM_6 — Device Identity Fields.md`.

---

## 0. Numbering note (read this first)

The audit brief states the requirement as "MoM #6". The repo's own handoff
(`docs/minutes-of-meeting/handoff-mom-20260914-implementation-plan.md`) uses the
product owner's final numbering, where:

- **#6** = "Model/brand/serial number input (recorded when a job is ON_SITE or IN_LAB)
  should be editable by both admin and technician roles" — status **Parked / not started**.
- **#8** = the "Device ID" → "Serial No" relabel — status **Done**.

So the "existing terminology decision" quoted in the brief is item #8, already shipped.
An older audit (`audit-tier0-mom-20260914.md`) numbered these #5 and #7. This report
treats the requirement as: *Model / Brand / Serial No / Device ID editable by Admin and
Technician*.

---

## 1. Executive Summary

**Does the current architecture already support the requirement partially?**
Partially — for **Admin only**, and only against the **Device master**. `POST /devices`
and `PATCH /devices/:id` accept and write `brand`, `model`, `serialNumber`, and the
`device:create` / `device:update` grants are seeded to **ADMIN** (plus a hardcoded
SUPERADMIN bypass). Portal has a working create/edit form for all three fields.

**What is missing.**

1. **TECHNICIAN has no `device:*` permission of any kind** — not read, not create, not
   update (`packages/db/prisma/seed-role-permissions.ts`, `device` rows exist only for
   ADMIN at lines 137–140).
2. **tech-pwa has no `/devices` write call at all.** A grep of every mutating endpoint in
   `apps/tech-pwa/src` returns notifications, kontrol-alat, measurement-results,
   physical-check-results, job lifecycle, identity-corrections, reference-equipment, and
   `/files` — nothing touching Device.
3. **Brand and Model are never even displayed to the technician.** tech-pwa shows only
   declared name, observed serial, and the linked device's `code` + `serialNumber`
   (`apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx:110–134`).
4. **There is no "create a Device in the field" flow.** The PWA's Identity Correction
   wizard explicitly tells the technician otherwise: *"Tidak ada alat yang cocok. Alat
   harus didaftarkan lebih dulu oleh admin/kantor."*
   (`apps/tech-pwa/src/app/jobs/[id]/identity-correction/page.tsx:107`).
5. **CalibrationJob has no brand/model columns** to write to, so "technician edits model"
   currently has *no* storage target other than the mutable Device master.

**Most important architectural finding.**
The system already made a deliberate, documented split between *snapshot* and *live*
identity — and it draws the line **in the middle of the four requested fields**:

| | Storage today |
|---|---|
| Serial (technician's observation) | **Snapshotted on the job** — `CalibrationJob.technicianObservedSerial`, with the comment *"Frozen ON the job, not read through Device, so later edits to the mutable Device master never rewrite what this calibration actually saw"* (`schema.prisma:2015–2017`) |
| Device link | **Snapshotted/controlled** — `CalibrationJob.deviceId`, writable only through an approved `IdentityCorrection` BA |
| **Brand** | **Live read-through** to `Device.brand` at render time. No snapshot anywhere. |
| **Model** | **Live read-through** to `Device.model` at render time. No snapshot anywhere. |

Consequence: today an ADMIN editing `Device.brand`/`Device.model` **retroactively rewrites
what every already-issued LK, Kontrol Alat and WO PDF displays**, for every historical job
on that device. Granting that same power to technicians widens an existing, unmitigated
traceability hole rather than creating a new one. This is the single fact that should
drive the implementation design.

A second finding worth flagging: **the field the brief calls `device_id` does not exist**,
and the name `deviceId` carries two mutually incompatible meanings (see §2 note).

---

## 2. Data Model

**Naming correction.** There is **no `serial_no` column and no `device_id` column** in the
schema or in any of the 81 migrations. The codebase is uniformly camelCase. The real
columns are `serialNumber`, `technicianObservedSerial`, `prevSerial`/`newSerial`, and
`deviceId`. The snake_case spellings appear only in English prose comments
(`schema.prisma:326`, `:2501`) and in the MoM documents.

**The `deviceId` collision.** `CalibrationRequestItem.deviceId` is a **plain free-text
string holding the customer's own asset label** — explicitly *not* an FK and *not* the
future `Device.id` (`schema.prisma:1552–1556`). Every other `deviceId` in the schema **is**
an FK to `Device.id`. Same column name, two incompatible meanings. This is exactly what
the earlier review warned about, and it is the reason the #8 relabel ("Serial No") applied
only to the requisition side.

| Entity | Field | Type | Nullable | Source/Relation | Role |
|---|---|---|---|---|---|
| `Device` (:1466) | `code` | String | no | `@@unique([companyId, code])`, issued by MasterCodeService, never user-supplied (:1469) | Master — immutable business key |
| `Device` | `brand` | String | **yes** | plain scalar, **no FK** to any brand master | Master data |
| `Device` | `model` | String | **yes** | plain scalar, **no FK** to `DeviceModel` | Master data |
| `Device` | `serialNumber` | String | **yes** | **not unique**; `@@index([companyId, serialNumber])` (:1496) only | Master data |
| `Device` | `deviceTypeId` | String | no | FK → DeviceType | Master relation |
| `Device` | createdBy/updatedBy | — | — | **absent** — only `createdAt`/`updatedAt` | — |
| `DeviceModel` (:1307) | `manufacturer`, `model` | String | no | `@@unique([deviceTypeId, manufacturer, model])` | Catalog — **nothing FKs to it** (:1328–1329: *"Do not FK DeviceModel or Device to these models this phase"*) |
| `DeviceTypeAlias` (:1142) | `alias`, `normalizedAlias` | String | no | `@@unique([normalizedAlias])` — global, not per-customer | Master — the "customer alias" mechanism |
| `CalibrationRequestItem` (:1540) | `customerDeviceName` | String | yes | verbatim customer wording | Transaction (customer declaration) |
| `CalibrationRequestItem` | `model` | String | yes | free text, not a relation (:1549–1550) | Transaction (customer declaration) |
| `CalibrationRequestItem` | `deviceId` | String | yes | **free text, NOT an FK** (:1552–1556). UI label: "Serial No" | Transaction (customer declaration) |
| `CalibrationRequestItem` | brand / serialNumber | — | — | **do not exist** | — |
| `QuotationItem` (:1676) | `deviceId` | String | yes | FK → Device (:1695) | Live relation |
| `PurchaseOrderItem` (:1740) | `deviceId` | String | yes | FK → Device, `SetNull` (:1758) | Live relation |
| `WorkOrderItem` (:1832) | — | — | — | `description`, `qty` only — **no device columns at all** | — |
| `CalibrationJob` (:1980) | `deviceId` | String | **yes** | FK → Device, `onDelete: Restrict` (:2063); `@@unique([workOrderId, deviceId])` (:2083), NULL-permissive by design (:1988–1990) | Live relation, controlled write |
| `CalibrationJob` | `calibrationRequestItemId` | String | yes | FK, `SetNull` — the only path back to the customer declaration, which is **not** copied through the commercial chain (:1992–1996) | Live relation |
| `CalibrationJob` | `customerDeclaredDeviceName` | String | yes | snapshot of `CalibrationRequestItem.customerDeviceName` at fan-out | **Transaction snapshot** |
| `CalibrationJob` | `customerDeclaredAkdAkl` | String | yes | snapshot of `CalibrationRequestItem.akdAkl` at fan-out | **Transaction snapshot** |
| `CalibrationJob` | `technicianObservedSerial` | String | yes | serial physically read on site (:2028) | **Transaction snapshot** |
| `CalibrationJob` | `technicianObservedAkdAkl` | String | yes | AKD/AKL observed on site | **Transaction snapshot** |
| `CalibrationJob` | brand / model / deviceType / customer alias | — | — | **do not exist** — reachable only via `device` → `deviceType`, or `calibrationRequestItem` | Derived/display-only |
| `IdentityCorrection` (:2506) | `prevDeviceId`, `newDeviceId` | String | yes | FK → Device, `Restrict` | Audit record |
| `IdentityCorrection` | `prevSerial`, `newSerial`, `prevAkdAkl`, `newAkdAkl` | String | yes | plain snapshot strings | Audit record |
| `IdentityCorrection` | brand / model prev-new pair | — | — | **do not exist** | — |
| `Certificate` (:2615) | `deviceId` | String | **no (required)** | FK → Device (:2638) | Live relation |
| `Equipment` (:1193) | `brand`, `model`, `serialNumber` | String | yes | PKM **reference** gear — a separate identity space, not the DUT | Master data |
| `EquipmentDeliveryNoteItem` (:1960) | `brand`, `model`, `serialNumber` | String | yes | frozen at issuance, immutable | **True snapshot** (reference equipment only) |

Note the asymmetry: PKM's **own reference equipment** gets a full brand/model/serial
document snapshot; the **device under test** does not.

---

## 3. Current Data Flow

```text
Customer's own words                    Device master (Admin-owned)
CalibrationRequestItem                  Device
  .customerDeviceName                     .brand      ┐
  .model            (free text)           .model      ├─ nullable, no FK, no uniqueness
  .deviceId         (free text,           .serialNumber ┘
                     UI = "Serial No")    .code       (immutable, DVC-000001)
  .akdAkl                                       │
        │                                       │
        │  (declaration only — NOT copied       │ (Device is created ONLY by Admin
        │   forward through the chain)          │  in Portal; no field-create flow)
        ▼                                       │
  QuotationItem.deviceId? ──FK──────────────────┤   quotation CREATE hardcodes null
        │                                       │   (quotations.service.ts:362);
        ▼                                       │   only PATCH accepts a deviceId
  PurchaseOrderItem.deviceId? ──FK──────────────┤   (inherited from QuotationItem)
        │                                       │
        ▼                                       │
  WorkOrder / WorkOrderItem                     │   carries NO device columns
        │                                       │
        │  POST /work-orders/:id/start → fanOutCalibrationJobs
        ▼                                       │
  CalibrationJob                                │
     deviceId: null            ←── always null at creation (work-orders.service.ts:598)
     calibrationRequestItemId  ←── trace-back pointer
     customerDeclaredDeviceName ←─ copied from CalibrationRequestItem  (SNAPSHOT)
     customerDeclaredAkdAkl     ←─ copied from CalibrationRequestItem  (SNAPSHOT)
     technicianObservedSerial   ←─ null until Identity Correction      (SNAPSHOT)
        │                                       │
        ▼                                       │
  Technician (tech-pwa)                         │
     sees: declared name, observed serial,      │
           device.code, device.serialNumber     │
     CANNOT see: brand, model                   │
     CANNOT edit: anything on Device            │
     CAN: submit IdentityCorrection BA          │
          (pick an EXISTING Device + type a     │
           free-text observed serial + AKD/AKL) │
        │                                       │
        │  TECHNICIAN_MANAGER approves          │
        ▼                                       │
  IdentityCorrection APPROVED                   │
     → bindDevice: CalibrationJob.deviceId = newDeviceId
     → CalibrationJob.technicianObservedSerial = newSerial
     → CalibrationJob.technicianObservedAkdAkl = newAkdAkl
        │                                       │
        ▼                                       ▼
  PDF generation ──── brand/model ALWAYS read LIVE from Device master ───┘
     LK, Kontrol Alat, WO-WOL: Merk = device.brand, Tipe = device.model
     serial: inconsistent (see §9)
```

`POST /calibration-jobs/:id/assign-device` still exists as a route but is a permanent
**410 Gone** (`calibration-jobs.service.ts:1155–1162`) — Identity Correction is the sole
path for setting or changing `CalibrationJob.deviceId` (`schema.prisma:2500–2503`).

---

## 4. Field-by-Field Matrix

| Field | Current Source | Current Editable By | Current Storage | Technician Edit Target | Notes |
|---|---|---|---|---|---|
| **Model** | `Device.model` (live read-through) for all documents; `CalibrationRequestItem.model` separately for the customer's declaration | `Device.model`: **ADMIN + SUPERADMIN only** (`device:update`). `CalibrationRequestItem.model`: ADMIN, CUSTOMER_SERVICE, SUPERADMIN (`calibrationRequest:create/update`, DRAFT only) | Master data, `String?`, no FK to `DeviceModel` | **NONE EXISTS.** No job column, no PWA field, not even displayed | Two unrelated "model" fields. Only the Device one reaches any PDF |
| **Brand** | `Device.brand` (live read-through) | **ADMIN + SUPERADMIN only** | Master data, `String?`, no brand master table at all | **NONE EXISTS.** No job column, no PWA field, not displayed | `DeviceModel.manufacturer` is the closest catalog, but nothing FKs to it |
| **Serial No** | Three distinct fields — see Notes | `Device.serialNumber`: **ADMIN + SUPERADMIN**. `CalibrationJob.technicianObservedSerial`: **proposed by TECHNICIAN / TECHNICIAN_MANAGER, committed by TECHNICIAN_MANAGER only** (not Admin). `CalibrationRequestItem.deviceId`: ADMIN, CUSTOMER_SERVICE | Mixed: master (`Device.serialNumber`) + job snapshot (`technicianObservedSerial`) + requisition free text (`CalibrationRequestItem.deviceId`) | `CalibrationJob.technicianObservedSerial`, via an **approved** IdentityCorrection | **The only one of the four with an existing technician write path.** The pattern to follow |
| **Device ID** | **AMBIGUOUS — two fields.** (a) `CalibrationJob.deviceId` = FK to Device, UI label still "Device ID". (b) `CalibrationRequestItem.deviceId` = free-text customer label, UI relabeled to "Serial No" per MoM #8 | (a) TECHNICIAN proposes via BA, **TECHNICIAN_MANAGER commits** (`bindDevice`). Direct assign = 410. (b) ADMIN, CUSTOMER_SERVICE | (a) live FK with `@@unique([workOrderId, deviceId])`. (b) transaction free text | (a) `newDeviceId` on the BA — **select from existing Devices only**, no create | Resolving which "Device ID" MoM #6 means is a prerequisite for implementation |

**UNKNOWN:** whether MoM #6's "Device ID" means the job's `Device` FK or the requisition's
free-text customer label. The two have opposite architectural implications (one is a
relation with a uniqueness constraint; the other is an inert string). The MoM text does not
disambiguate, and per #8 the customer-facing one has already been renamed to "Serial No",
which makes a *separate* "Device ID" in the same list read as the FK — but this is an
inference, not evidence.

---

## 5. Backend API

Backend is **`apps/api`** (NestJS) with a single `CompanyRoleGuard`. `apps/web-api` is a
small public marketing/chat surface with **zero** device/job/requisition routes.

| Operation | Method | Route | DTO | Current Authorization | Writable Fields |
|---|---|---|---|---|---|
| Create Device | POST | `/devices` (`devices.controller.ts:32`) | `deviceCreateSchema` (`packages/shared/src/schemas/index.ts:2009–2019`) | `device:create` → **ADMIN**, SUPERADMIN | customerId, deviceTypeId, **brand, model, serialNumber**, category, locationText, status. `code` server-issued |
| Update Device | PATCH | `/devices/:id` (`:75`) | `deviceUpdateSchema` (`:2041–2051`) | `device:update` → **ADMIN**, SUPERADMIN | same set, all optional/nullable (`devices.service.ts:180–191`). `code` never written (`:175–176`) |
| Delete Device | DELETE | `/devices/:id` (`:93`) | — | `device:delete` → ADMIN, SUPERADMIN | — |
| Create/Update DeviceModel catalog | POST/PATCH | `/device-models`, `/device-models/:id` | `deviceModelCreate/UpdateSchema` (`:1423`, `:1447`) | `deviceModel:*` → ADMIN, SUPERADMIN | deviceTypeId, manufacturer, model, description |
| Create Requisition | POST | `/calibration-requests` (`:83`) | `calibrationRequestCreateSchema` (`:361`), item schema (`:304–357`) | `calibrationRequest:create` → ADMIN, CUSTOMER_SERVICE, SUPERADMIN | per item: deviceTypeId, customerDeviceName, **model**, **deviceId** (free text), qty, akdAkl, akdAklDeclaration |
| Update Requisition (DRAFT only) | PATCH | `/calibration-requests/:id` (`:127`) | `calibrationRequestUpdateSchema` (`:388`) | `calibrationRequest:update` | same — items are delete+recreate (`calibration-requests.service.ts:249–261`) |
| Import Requisition | POST | `/calibration-requests/import/{preview,confirm}` | `calibrationRequestImportConfirmSchema` (`:2194`) | `calibrationRequest:create` | Excel-derived customerDeviceName, model, deviceId |
| Create Quotation | POST | `/quotations` (`:39`) | `quotationCreateSchema` (`:449`) | `quotation:create` | **no device identity** — `deviceId` hardcoded `null` (`quotations.service.ts:362`) |
| Update Quotation (DRAFT) | PATCH | `/quotations/:id` (`:112`) | `quotationItemInputSchema` (`:418–426`) | `quotation:update` → ADMIN, CUSTOMER_SERVICE | **`deviceId` FK only** — validated by `assertDevicesBelongToCustomer` (`:624–629`). No brand/model/serial |
| Create PO | POST | `/purchase-orders` (`:37`) | `purchaseOrderCreateSchema` (`:508`) | `purchaseOrder:create` | **no item payload** — items snapshotted from Quotation; `deviceId` inherited (`purchase-orders.service.ts:170`) |
| Create WorkOrder | POST | `/work-orders` (`:44`) | `workOrderCreateSchema` (`:595`) | `workOrder:create` | **none** |
| Start WorkOrder → fan out jobs | POST | `/work-orders/:id/start` (`:245`) | — | `workOrder:update` | `deviceId: null`, `calibrationRequestItemId`, `customerDeclaredDeviceName`, `customerDeclaredAkdAkl`, `unitOrdinal`, `unitTotal` (`work-orders.service.ts:594–608`) |
| **Create CalibrationJob** | — | **does not exist** | — | — | Jobs are created exclusively by WorkOrder fan-out |
| **Update CalibrationJob** | — | **does not exist** | — | `calibrationJob:update` is in the catalog (`access-control.ts:134`) but seeded to **nobody** and referenced by **no** `@RequirePermission` | Job mutation is fully decomposed into verb-scoped routes |
| Start job | POST | `/calibration-jobs/:id/start` (`:144`) | none | `calibrationJob:start` → TECHNICIAN, TECHNICIAN_MANAGER | status, startedAt, `measurementTestPointsSnapshottedAt` + test-point snapshot. **No device identity frozen here** |
| Escalate identity | POST | `/calibration-jobs/:id/escalate-identity` (`:199`) | `calibrationJobEscalateIdentitySchema` (`:671`) | `calibrationJob:escalateIdentity` → TECHNICIAN, TECHNICIAN_MANAGER | `technicianObservedAkdAkl`, AKD gate fields |
| **Submit Identity Correction** | POST | `/calibration-jobs/:id/identity-corrections` (`:292`) | `identityCorrectionSubmitSchema` (`:787`) | `calibrationJob:submitIdentityCorrection` → **TECHNICIAN**, TECHNICIAN_MANAGER | IdentityCorrection row: prev/new DeviceId, prev/new Serial, prev/new AkdAkl, reason, 2 signatures. **Nothing on the job yet** |
| **Decide Identity Correction** | POST | `/calibration-jobs/:id/identity-corrections/:cid/decision` (`:311`) | `identityCorrectionDecisionSchema` (`:869`) | `calibrationJob:decideIdentityCorrection` → **TECHNICIAN_MANAGER only** (not ADMIN) | On APPROVE: `job.deviceId = newDeviceId` (`bindDevice:1132–1135`), `technicianObservedSerial` (`:1495`), `technicianObservedAkdAkl` (`:1496`) |
| Assign device (legacy) | POST | `/calibration-jobs/:id/assign-device` (`:252`) | orphaned schema (`:732`) | — | **410 Gone — permanently inert** |
| Device candidates | GET | `/calibration-jobs/:id/device-candidates` (`:236`) | — | `calibrationJob:submitIdentityCorrection` | read-only; reuses `DevicesService.findAll` |
| Kontrol Alat | PATCH | `/calibration-jobs/:id/kontrol-alat` (`:625`) | kontrol-alat schemas | `calibrationJob:recordKontrolAlat` → TECHNICIAN, TECHNICIAN_MANAGER, **ADMIN** | `KontrolAlat` has **no brand/model/serial columns** — only capacity, visual/function booleans, certificateNumber |

**Answer to "are these writable anywhere today?"** — `grep` for
`device.create|device.update|device.upsert` across the whole backend returns exactly two
hits: `devices.service.ts:82` and `:177`. `Device.brand` / `Device.model` /
`Device.serialNumber` are writable **only** through `POST /devices` and
`PATCH /devices/:id`, **only by ADMIN and SUPERADMIN**.

---

## 6. Portal

| Area | Fields | Editability |
|---|---|---|
| **Device master** `management/devices/` — `devices-ui.tsx:240–242` (list), `device-form-fields.tsx:209/222/238` (form), `new/page.tsx`, `[id]/page.tsx:235–262` | Labels **"Brand" / "Model" / "Serial Number"** | **The only truly editable surface.** Inputs in the form; detail page is read-only until Edit is pressed, gated on `capabilities.deviceUpdate` (`[id]/page.tsx:261`, save at `:148`). Calls `POST /devices` / `PATCH /devices/{id}` (`use-devices-query.ts:65`, `:80`). `code` explicitly non-editable (`:190–194`) |
| **Requisition** `calibration-requests/new`, `[id]/edit` | **"Model"** → `CalibrationRequestItem.model`; **"Serial No (opsional)"** → `CalibrationRequestItem.deviceId` (`new/page.tsx:303`, `:314`; `edit/page.tsx:447`, `:458`) | **Editable inputs**, gated on `calibrationRequestCreate` / `calibrationRequestUpdate`. No Brand field exists at requisition level |
| Requisition detail / import | "Model:", "Serial No:" (else "Not provided") (`[id]/page.tsx:269–277`); import preview column "Serial No" (`import-page-client.tsx:250`, `:311`) | Read-only |
| **Quotation** `quotation-form-fields.tsx:140`, `[id]/page.tsx:291–295` | **No label at all** — bare mono text of `requestItem.deviceId` | Read-only; the quotation save does not send it |
| **Purchase Order** `purchase-orders-ui.tsx:414–416` | No label — mono text, resolved `quotationItem.requestItem.deviceId ?? item.deviceId` | Read-only |
| **Work Order** `work-orders-ui.tsx:463`, `:488` | Column header "Device", value from `deviceIdentifierFromItem` precedence `requestItem.deviceId → purchaseOrderItem.device.serialNumber → purchaseOrderItem.deviceId` (`work-order-form-utils.ts:196–200`) | Read-only |
| **Calibration Job** `calibration-jobs-ui.tsx:417`, `[id]/page.tsx:533–577` | "Serial (observed)", "Technician Observed Serial", "Assigned Device", "Serial: {device.serialNumber}" | Read-only |
| Calibration Job — Submit Correction dialog `[id]/page.tsx:2473–2543` | Device **picker** (radio list of existing Devices, rendered as `serialNumber ?? code ?? id` + `brand model`); free-text "Serial (observed)" → `newSerial`; "AKD/AKL/NIE" → `newAkdAkl` | Picker + two text inputs. **Cannot type a brand/model/serial onto a Device.** Gated on `capabilities.calibrationJobSubmitIdentityCorrection`; POSTs to `/calibration-jobs/{jobId}/identity-corrections` |
| **Equipment Units** (PKM reference gear — separate entity) `equipment-units-ui.tsx:104–106`, `equipment-unit-form-fields.tsx` | Labels **"Merek" / "Model" / "No. Seri"** | Editable, gated on `capabilities.equipmentUpdate`. Not the DUT |

**Terminology verification.** The "Device ID → Serial No" relabel is **partial**:

- **Done** — requisition new/edit/detail/import, the Excel template, and the Quotation/PO
  PDF prefixes all read **"Serial No"** (bound to `CalibrationRequestItem.deviceId`).
- **Not done** — two user-visible **"Device ID"** strings remain in the calibration-job
  surface: `calibration-jobs/[id]/page.tsx:555` (*"Identity perangkat belum lengkap.
  Device ID dan/atau serial observasi belum terisi."*) and
  `calibration-job-utils.ts:89` (`missing.push("Device ID")`). Both refer to the
  **`Device` FK**, not to a serial — per the #8 brief these were deliberately left alone.
- **Different term** — Device master still says **"Serial Number"** (English); Equipment
  master and every PDF say **"No. Seri" / "Merek"**.
- **No label at all** — Quotation and PO portal UI render the value as bare mono text.
- **"Nomor Seri"** — zero occurrences in either app.

---

## 7. Tech-PWA

**What the technician sees** (`apps/tech-pwa/src/app/jobs/`):

| Screen | Label | Field | Rendering |
|---|---|---|---|
| `jobs-ui.tsx:147` | (none) | `declaredDeviceName(job)` | read-only `<p>` |
| `jobs-ui.tsx:163–165` | "Belum diidentifikasi" when `job.deviceId == null` | FK | read-only |
| `[id]/job-detail-ui.tsx:110` | "Nama alat" | `declaredDeviceName(job)` | `SectionRow`, read-only |
| `job-detail-ui.tsx:119` | "Serial" (section *Observasi Teknisi*) | `job.technicianObservedSerial` | read-only |
| `job-detail-ui.tsx:130–131` | "Kode" / "Serial" (section *Alat Terpasang Saat Ini*) | `job.device.code`, `job.device.serialNumber` | read-only |
| `job-detail-ui.tsx:134` | "Alat belum diidentifikasi." | — | read-only |
| `job-detail-ui.tsx:148` | "Identity perangkat belum lengkap…" | `actionSignals.identityIncomplete` | non-blocking banner |

**Model and Brand of the device under test are never displayed.** A grep of
`apps/tech-pwa/src` for `brand|model` returns only Tailwind `brand-700` classes,
reference-equipment types (`lib/calibration/reference-equipment.ts:49–50`), and the
device-candidate picker's secondary line.

**Editability — the answer for each field:**

| Field | Editable in tech-pwa? |
|---|---|
| Model | **No.** Not editable, not even visible |
| Brand | **No.** Not editable, not even visible |
| Serial No | **Yes, indirectly** — free-text input in the Identity Correction wizard (`identity-correction/page.tsx:144–154` → `state.serial`), which becomes `newSerial` on the BA and lands on `CalibrationJob.technicianObservedSerial` **only after TECHNICIAN_MANAGER approval** |
| Device ID | **Select-only** — step 1 (`:84`) offers a radio list of **pre-existing** Devices, setting `state.deviceId` → `newDeviceId`. No create |

**Existing edit action:** the 5-step Identity Correction wizard. Submit
(`review/page.tsx:70–79`) builds `{ reason, newDeviceId?, newSerial?, signatures }` and
POSTs to `/calibration-jobs/{id}/identity-corrections` (`use-job-query.ts:153`).

**What the edits affect:**

- (a) master `Device` — **no.** The complete list of mutating endpoints in tech-pwa
  contains **no `/devices` write call** of any kind.
- (b) `CalibrationJob` — **yes**, `deviceId` (FK) and `technicianObservedSerial`, after
  approval.
- (c) another record — **yes**, the `IdentityCorrection` row itself is the durable
  transaction/audit record, with its own BA number and two signatures.

**Architectural implication.** The PWA already encodes the answer to MoM #6's hardest
question, and it is *not* "let the technician edit the master": the wizard's own copy says
*"Alat harus didaftarkan lebih dulu oleh admin/kantor"* (`:107`). The technician's
authority is modelled as **observation on the job, requiring manager approval**, never as
mutation of master data. Any implementation of MoM #6 either follows that boundary or
deliberately breaks it.

---

## 8. CalibrationJob Snapshot

**Mixed — and the split runs straight through the four requested fields.**

| Attribute | Live / Copied / Snapshotted | When |
|---|---|---|
| `customerDeclaredDeviceName` | **Snapshotted** | At **fan-out** (`POST /work-orders/:id/start` → `work-orders.service.ts:600`), copied from `CalibrationRequestItem.customerDeviceName` |
| `customerDeclaredAkdAkl` | **Snapshotted** | At fan-out (`:601`) |
| `deviceId` (FK) | **Live relation, controlled write** | `null` at creation (`:598`); set **only** by `bindDevice` (`calibration-jobs.service.ts:1132–1135`) from an APPROVED IdentityCorrection (`:1491`) |
| `technicianObservedSerial` | **Snapshotted** | At IdentityCorrection **approval** (`:1495`) |
| `technicianObservedAkdAkl` | **Snapshotted** | At IdentityCorrection approval (`:1496`), and at escalate (`:1010`) |
| **brand** | **Live read-through**, never stored | Read at query/render time via `device: { select: { brand, model, serialNumber } }` |
| **model** | **Live read-through**, never stored | same |
| device type | Live via `device.deviceType` or `resolveJobDeviceTypeId` | — |
| customer alias | Not on the job; `DeviceTypeAlias` is a global master | — |
| `Device.code` | Live via relation | — |

**When copying occurs — the definitive answer to the brief's list:**

- At requisition? **No** — the requisition *is* the source, not a copy.
- At quotation? **No** — `deviceId` is hardcoded `null` on create (`quotations.service.ts:362`); only PATCH can link one.
- At PO? **No** — `deviceId` inherited from the QuotationItem, nothing else.
- At WO? **No** — `WorkOrderItem` has no device columns at all.
- **At calibration job creation (fan-out)? YES** — but only `customerDeclaredDeviceName` and `customerDeclaredAkdAkl`.
- At job start? **No device identity is frozen.** `start()` (`calibration-jobs.service.ts:745–783`) stamps `measurementTestPointsSnapshottedAt` and calls `copyActiveTestPointsIntoJobSnapshot` — measurement test points only.
- Dynamically from Device master? **YES, for brand and model** — and for `serialNumber` in most PDF paths.

**Phase 1.5 / `JobCalibrationTestPoint`** (`schema.prisma:2241–2265`, migration
`20260918120000`): a frozen copy of the catalog's `CalibrationTestPoint` rows per job —
`sequence`, `settingLabel`, `settingValue`, `toleranceMin/Max`, `toleranceNote`, plus FKs
back to the source test point and parameter. It **contains no device identity whatsoever**
and is orthogonal to this requirement. As instructed, it is not analysed further and no
change to it is proposed.

---

## 9. PDF/LK Impact

| Document | Model Source | Brand Source | Serial Source | Device ID Source |
|---|---|---|---|---|
| **WO PDF (WOL)** `work-order-pdf-wol.ts:235–237` | `device.model` — **live Device master** | `device.brand` — **live** | `device.serialNumber ?? requestItem.deviceId` — live master, falling back to requisition free text | — (no separate field) |
| **WO PDF (SPK)** `work-order-pdf-spk.ts` | — | — | — | No Merk/Tipe/Seri columns exist |
| **LK header block** `lk-result-pdf.ts:187–189` ← `lk-download.service.ts:408–410` | `linkedDevice.model` — **live** | `linkedDevice.brand` — **live** | `linkedDevice.serialNumber` — **live master; ignores `technicianObservedSerial`** | — |
| **LK template body (Bed Side Monitor)** `lk-download.service.ts:355–371` | `linkedDevice.model` — live (`:364`) | `linkedDevice.brand` — live (`:362`) | `technicianObservedSerial ?? linkedDevice.serialNumber` (`:366`) — **job snapshot preferred** | — |
| **Kontrol Alat (F.MU.08)** `kontrol-alat-pdf.ts:181–183` ← `kontrol-alat.service.ts:187–189` | `linkedDevice.model` — **live** | `linkedDevice.brand` — **live** | `linkedDevice.serialNumber` — **live; observed serial never used** | — |
| **Quotation PDF** `quotation-pdf.ts:264–270` | — | — | `requestItem.deviceId` — requisition free text, labelled "Serial No" | — |
| **Purchase Order PDF** `purchase-order-pdf.ts:214–220` | — | — | `quotationItem.requestItem.deviceId` — requisition free text | — |
| **Surat Jalan Alat** `equipment-delivery-note-pdf.ts:207–209` | `EquipmentDeliveryNoteItem.model` — **true snapshot** | snapshot | snapshot | — (PKM reference equipment, not the DUT) |
| **BA Koreksi Identitas** `identity-correction-pdf.ts:214–222` | — | — | `prevSerial` / `newSerial` — snapshot on the correction | `prevDevice.code` / `newDevice.code` |
| **Calibration certificate** | — | — | — | No certificate PDF generator exists; certificates are uploaded files |

In all three device selectors above, `linkedDevice = job.device ?? job.purchaseOrderItem.device ?? null`
(`lk-download.service.ts:298`, `kontrol-alat.service.ts:174`).

**Would changing a CalibrationJob-level value automatically affect the documents?**

- `technicianObservedSerial` — **only the LK template body** picks it up (`:366`). The LK
  *header block* and Kontrol Alat both ignore it and print `Device.serialNumber`. So the
  same LK PDF can today print two different serials for the same job.
- `deviceId` (FK) — **yes, sweepingly.** It re-points `linkedDevice`, changing Merk, Tipe
  and No. Seri on LK, Kontrol Alat and WO simultaneously.
- **Brand and Model have no job-level value to change.** The only way to change what a
  document prints is to edit the Device master — which retroactively rewrites every
  historical document for that device.

---

## 10. Authorization

**Model.** One enum `MembershipRole` with 8 concrete values — `SUPERADMIN, ADMIN,
SUPERVISOR, TECHNICIAN, TECHNICIAN_MANAGER, FINANCE, CUSTOMER, CUSTOMER_SERVICE`
(`schema.prisma:34–43`). A user has **at most one role per company**: `UserMembership`
with `@@unique([userId, companyId])` (`:639–656`).

**"Admin" is one concrete role, not a composition.** There is no role hierarchy, no
inheritance, no multi-role union. Permissions are flat `RolePermission { role, resource,
action }` rows (`:708–723`). **"Technician" is likewise a single concrete enum value
`TECHNICIAN`** — and `TECHNICIAN_MANAGER` is a *separate, non-superset* role with its own
distinct grant list.

**Enforcement chain:**

| Piece | Location |
|---|---|
| The only RBAC gate | `apps/api/src/common/guards/company-role.guard.ts:23–68` — resolves session, loads `UserMembership` for `process.env.COMPANY_ID` (never client-supplied, `:11–14`), requires `user.status === "ACTIVE"` (`:53`), calls `hasPermission(role, resource, action)` (`:57`) |
| Permission decorator | `apps/api/src/common/decorators/require-permission.decorator.ts` |
| Permission **catalog** (resource → actions) | `packages/auth/src/access-control.ts:54–178` |
| Role→permission **grants** (data, not code) | `RolePermission` table, seeded by `packages/db/prisma/seed-role-permissions.ts` |
| Evaluator | `access-control.ts:217–230` — **unconditional SUPERADMIN bypass at `:225`**; in-memory cache primed at boot; **fails closed** if cache is null (`:228`) |
| Runtime grant editing | `PUT /permissions/roles/:role` (`permissions.controller.ts:42–70`), `permission:manage` — seeded to nobody, so SUPERADMIN-only in practice |
| UI capability echo (not a gate) | `apps/api/src/modules/me/me.controller.ts:165` (`deviceUpdate: hasPermission(...)`) — what Portal's `capabilities.*` flags read |

**Who can update Device (`device:update`):** **ADMIN** (`seed-role-permissions.ts:139`) and
SUPERADMIN (bypass). SUPERVISOR, TECHNICIAN, TECHNICIAN_MANAGER, FINANCE, CUSTOMER,
CUSTOMER_SERVICE: **no**. `device:create` (`:138`), `device:read` (`:137`) and
`device:delete` (`:140`) are identical — **TECHNICIAN holds no `device` permission at all**.

**Who can update CalibrationJob:** there is **no `calibrationJob:update` route**. The
`"update"` action exists in the catalog (`access-control.ts:134`) but is seeded to nobody
and referenced by no `@RequirePermission`. Job mutation is decomposed into verb-scoped
grants; the ones relevant here:

| Verb | Roles seeded | seed line |
|---|---|---|
| `escalateIdentity` | TECHNICIAN, TECHNICIAN_MANAGER | `:163`, `:167` |
| `approveIdentity` | **TECHNICIAN_MANAGER only** — explicitly not ADMIN (`:150–151`) | `:168` |
| `submitIdentityCorrection` | **TECHNICIAN**, TECHNICIAN_MANAGER | `:164`, `:169` |
| `decideIdentityCorrection` | **TECHNICIAN_MANAGER only** | `:170` |
| `recordKontrolAlat` | TECHNICIAN, TECHNICIAN_MANAGER, **ADMIN** | `:206–208` |
| `start` | TECHNICIAN, TECHNICIAN_MANAGER | `:162`, `:166` |
| `recordMeasurement`, `recordPhysicalCheck`, `submitForReview`, `resumeAfterRework`, `complete` | **TECHNICIAN only** | `:198`, `:202`, `:209–211` |

**Relevant to MoM #6:** ADMIN and TECHNICIAN today have **disjoint, non-overlapping**
authority over device identity. ADMIN owns the master row and touches no job identity
field; TECHNICIAN owns the on-site observation and touches no master field. There is
currently **no permission either of them shares** on this data. Note also that grants are
DB rows — a SUPERADMIN can re-point any of them at runtime with no deploy, so the seed
file is the documented baseline, not a hard constraint.

---

## 11. Side Effects / Constraints

Concrete technical constraints discovered (not solved here):

1. **Brand and Model have no snapshot anywhere.** Every document reads them live from
   `Device`. Any edit — by Admin today, by Technician tomorrow — silently rewrites what
   every previously-issued LK, Kontrol Alat and WO PDF displays for that device. There is
   no mechanism that preserves what a past calibration actually saw.
2. **`Device` has no `createdBy` / `updatedBy` and no dedicated audit table.** Edits leave
   only a bumped `updatedAt`. The generic polymorphic `AuditLog` (`schema.prisma:2865–2891`,
   `targetType`/`targetId`, indexed at `:2889`) exists and its comment names `"CalibrationJob"`
   as an example target — but nothing writes Device changes to it.
3. **`IdentityCorrection` records prev/new for device-FK, serial and AKD/AKL — but not for
   brand or model.** Extending technician authority to brand/model without extending the
   BA record would create a write path with no audit trail, breaking the pattern the
   feature was built on.
4. **`serialNumber` is nullable and NOT unique** — only `@@index([companyId, serialNumber])`
   (`:1496`). The same is true for `Equipment.serialNumber` (`:1216`). Editing it breaks no
   constraint and silently changes nothing structural.
5. **`CalibrationJob.deviceId` carries `@@unique([workOrderId, deviceId])`** (`:2083`).
   Re-pointing a job at a device already bound to a sibling job under the same WorkOrder
   raises P2002 — already handled at `calibration-jobs.service.ts:1139–1144`. This is the
   one identity field with a real uniqueness constraint.
6. **`CalibrationJob.deviceId` FK is `onDelete: Restrict`** (`:2063`) and
   `Certificate.deviceId` is **required** (`:2619`) — a Device with history cannot be
   deleted. `IdentityCorrection.prev/newDeviceId` are also `Restrict` (`:2552–2553`).
7. **`Device.code` is the real immutable business key** (`DVC-000001`, auto-issued,
   `@@unique([companyId, code])`, explicitly never user-supplied, `:1469–1470`). None of
   the four MoM fields is a lookup key, an FK, or a matching key anywhere: quotation, PO
   and WO matching all run on `deviceId`-as-FK or on `requestItemId`, never on brand,
   model or serial text.
8. **`CalibrationRequestItem.deviceId` is an inert free-text string** — its FK was dropped
   in migration `20260826120000` and it was made nullable in `20260829102845`. Nothing
   joins on it.
9. **Latent bug already present:** `devices.service.ts:202` guards deletion with
   `calibrationRequestItem.count({ where: { deviceId: id } })` — comparing a cuid against
   the customer's free-text label. It can never match, so that in-use check is dead.
10. **Serial is rendered inconsistently across documents** (§9): LK's body prefers
    `technicianObservedSerial` while LK's own header and Kontrol Alat print
    `Device.serialNumber`. Any change to either value will produce visibly divergent output
    within a single PDF.
11. **`tech-pwa` has no `/devices` client, no device mutation hook, and no Device form
    component.** This is a new surface to build, not a permission to flip — consistent with
    the earlier assessment that recorded #6 as "larger than expected".
12. **The requirement's own wording ("recorded when a job is ON_SITE or IN_LAB") implies
    job scope, not master scope.** `ServiceMode` lives on `WorkOrder`/`CalibrationRequest`;
    `Device` has no service-mode concept at all. A master-data edit cannot be conditioned on
    it without inventing new coupling.
13. **"Device ID" is unresolved** (§4). Two different columns share the name with opposite
    semantics. Implementation cannot start until the product owner says which one MoM #6
    means.

---

## 12. Recommended Implementation Boundary

**Recommendation: edit the CalibrationJob transaction snapshot, not the Device master —
and extend the existing Identity Correction record rather than inventing a new write path.
Admin's existing master-edit capability stays exactly as it is, under its own separate
permission.**

Strictly from the existing code and data flow:

1. **The codebase has already chosen this boundary and documented why.**
   `schema.prisma:2015–2017` states the rule in the schema itself: *"Frozen ON the job, not
   read through Device, so later edits to the mutable Device master never rewrite what this
   calibration actually saw."* Serial and AKD/AKL already obey it. Brand and model are the
   outliers, not the precedent.
2. **The technician's authority is already modelled as observation-plus-approval.** Every
   technician identity write goes through an `IdentityCorrection` BA with a reason, two
   signatures, a document number, and a TECHNICIAN_MANAGER decision. Granting
   `device:update` to TECHNICIAN would bypass all of that and let a field edit silently
   rewrite historical documents — a strictly weaker control than what already exists.
3. **The PWA already tells the technician this is the rule** — *"Alat harus didaftarkan
   lebih dulu oleh admin/kantor"* (`identity-correction/page.tsx:107`) — and
   `assign-device` was deliberately retired to **410** to force everything through the BA
   (`calibration-jobs.service.ts:1155–1162`). Reversing that is a reversal of a decision
   this codebase made on purpose, not a gap to be filled.
4. **The master row is shared across jobs; the job row is not.** One `Device` is referenced
   by many `CalibrationJob`s, `QuotationItem`s, `PurchaseOrderItem`s and `Certificate`s. A
   technician correcting the model they physically read on *this* unit has no basis to
   restate it for every other transaction that device appears in.
5. **Admin's need is genuinely different and already satisfied.** Admin maintains the
   customer's asset register going forward (`POST`/`PATCH /devices`). That is a master-data
   job, correctly scoped to a master-data role. MoM #6's phrasing groups Admin and
   Technician together, but their existing code paths show two different operations that
   happen to touch similarly-named fields.

**Therefore the architectural boundary is: both, with separate permissions** — Admin keeps
`device:create` / `device:update` on the master (unchanged); Technician gets brand/model
added to the *job-scoped, manager-approved* Identity Correction path they already have.

**What that implies must be decided before implementation** (not solved here):

- Whether `CalibrationJob` gains `technicianObservedBrand` / `technicianObservedModel`
  columns mirroring `technicianObservedSerial`, and whether `IdentityCorrection` gains the
  matching `prev*`/`new*` pairs.
- Whether the PDF generators switch to a `job.observed* ?? device.*` precedence — which
  would also resolve the existing LK header-vs-body serial divergence (§9).
- Whether a technician-initiated **"register a new Device"** request flow is needed at all,
  or whether "device not in the register" stays an admin escalation.
- Which of the two `deviceId` columns MoM #6 refers to.

**Explicitly NOT recommended:** granting `device:update` to `TECHNICIAN` in
`seed-role-permissions.ts`. It is the smallest diff and the largest architectural
regression available here.

---

## 13. Files Inspected

**Schema & migrations**

- `packages/db/prisma/schema.prisma` (Device :1466, CalibrationRequestItem :1540, QuotationItem :1676, PurchaseOrderItem :1740, WorkOrder :1769, CalibrationJob :1980, KontrolAlat :2102, JobCalibrationTestPoint :2241, IdentityCorrection :2506, Certificate :2615, AuditLog :2865, MembershipRole :34, UserMembership :639, RolePermission :708)
- `packages/db/prisma/migrations/` — 81 dirs; key: `20260813063336_init…`, `20260826120000_add_devicetype_to_calibration_request_item`, `20260829102845_…nullable_device_id…`, `20260902050955_add_calibrationjob_identity_fields`, `20260902060000_…unit_ordinal_and_akdakl_snapshot`, `20260904071251_add_identity_correction`, `20260918120000_add_job_calibration_test_point`
- `packages/db/prisma/seed-role-permissions.ts`

**Auth / RBAC**

- `packages/auth/src/access-control.ts`
- `apps/api/src/common/guards/company-role.guard.ts`, `internal-service.guard.ts`
- `apps/api/src/common/decorators/require-permission.decorator.ts`
- `apps/api/src/modules/permissions/permissions.controller.ts`, `me/me.controller.ts`

**Backend**

- `apps/api/src/modules/devices/{devices.controller.ts,devices.service.ts}`
- `apps/api/src/modules/device-models/`, `device-types/`, `device-categories/`
- `apps/api/src/modules/calibration-requests/{calibration-requests.controller.ts,.service.ts,calibration-request-import.service.ts}`
- `apps/api/src/modules/quotations/{quotations.controller.ts,.service.ts,quotation-pdf.ts}`
- `apps/api/src/modules/purchase-orders/{purchase-orders.controller.ts,.service.ts,purchase-order-pdf.ts}`
- `apps/api/src/modules/work-orders/{work-orders.controller.ts,.service.ts,work-order-pdf-wol.ts,work-order-pdf-spk.ts,work-order-pdf-shared.ts,equipment-delivery-note-pdf.ts,delivery-notes.service.ts}`
- `apps/api/src/modules/calibration-jobs/{calibration-jobs.controller.ts,.service.ts,measurement-results.service.ts,physical-check-results.service.ts,kontrol-alat.service.ts,kontrol-alat-pdf.ts,lk-download.service.ts,lk-result-pdf.ts,identity-correction-pdf.ts,job-calibration-test-point-snapshot.ts}`
- `packages/shared/src/schemas/index.ts`
- `apps/web-api/src/index.ts` (confirmed out of scope)

**Portal**

- `apps/portal/src/app/management/devices/{devices-ui.tsx,devices-page-client.tsx,device-form-fields.tsx,new/page.tsx,[id]/page.tsx}`
- `apps/portal/src/app/.../calibration-requests/{new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,import/import-page-client.tsx,calibration-requests-page-client.tsx}`
- `apps/portal/src/app/.../quotations/{quotations-ui.tsx,quotation-form-fields.tsx,[id]/page.tsx}`
- `apps/portal/src/app/.../purchase-orders/purchase-orders-ui.tsx`
- `apps/portal/src/app/.../work-orders/{work-orders-ui.tsx,work-order-form-utils.ts,work-order-equipment-section.tsx}`
- `apps/portal/src/app/.../calibration-jobs/{calibration-jobs-ui.tsx,calibration-job-utils.ts,[id]/page.tsx}`
- `apps/portal/src/app/.../equipment-units/{equipment-units-ui.tsx,equipment-unit-form-fields.tsx,[id]/page.tsx}`
- hooks: `use-devices-query.ts`, `use-calibration-requests-query.ts`, `use-identity-corrections-query.ts`, `use-equipment-units-query.ts`

**Tech-PWA**

- `apps/tech-pwa/src/app/jobs/jobs-ui.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/identity-correction/{page.tsx,review/page.tsx}`
- `apps/tech-pwa/src/lib/calibration/reference-equipment.ts`, `use-job-query.ts`

**Documents (context, not code)**

- `docs/minutes-of-meeting/handoff-mom-20260914-implementation-plan.md`
- `docs/minutes-of-meeting/audit-tier0-mom-20260914.md`
- `docs/minutes-of-meeting/cursor-review-tieor0.md`
- `docs/minutes-of-meeting/execute-batch-a-mom-20260914.md`
- `docs/claude/plans/Calibration-management/investigation-identity-correction-design.md`

---

## 14. Explicit Non-Changes

Confirmed for this audit:

- **No code modified** — every tool call was a read, search, or listing.
- **No Prisma schema modified.**
- **No migration created.**
- **No API changed.**
- **No UI changed.**
- **No tests changed.**
- **No formatter run.**
- `JobCalibrationTestPoint` and the Phase 1 / 1.5 / 2 / 3 work were inspected for context
  only; no change to them is proposed.
- `git status` was clean at session start. The **only** file this session adds to the
  repository is this report itself, at
  `docs/minutes-of-meeting/audit-mom-6-device-identity-fields-20260918.md`.
