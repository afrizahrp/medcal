# PROJECT HANDOFF — Medcal/Kalibrasi Medika Calibration Management System

This document is written for an AI assistant (ChatGPT) taking over the role of "orchestrator"
for a Cursor-based implementation project — i.e., writing precise implementation prompts for
Cursor, reviewing Cursor's output critically, catching gaps/inconsistencies, and iterating via
small revision passes rather than accepting large deliverables uncritically. Everything below
is factual context established through a completed audit + partial implementation phase with
another AI assistant (Claude). Read this fully before writing any new prompts for Cursor.

---

## 1. What This Project Is

A monorepo system for **Kalibrasi Medika**, a calibration-services company. The business
lifecycle being built: **Calibration Request → Quotation → Purchase Order → Work Order →
Calibration Job (per device) → Certificate → Invoice → Payment** (with Credit Note as a
side-branch off Invoice).

Two applications are being built on a shared backend:
- **Portal Management App** (`apps/portal`) — internal staff/management UI, live at
  `apps.kalibrasimedika.co.id`.
- **Technician App** (`apps/tech-pwa`) — PWA for field technicians, target subdomain
  `technician.kalibrasimedika.co.id` (DNS registered; nginx/TLS deferred to production
  deployment — not a current concern).
- Shared backend: `apps/api` (NestJS).
- Repo root: `D:\medcal`. Prisma schema at `packages/db/prisma/schema.prisma`. Shared
  validation (Zod) at `packages/shared/src/schemas/`. RBAC catalog at
  `packages/auth/src/access-control.ts`. Document numbering service at
  `packages/db/src/document-number/`.

**Explicitly out of scope for now:** a customer-facing self-service portal is deferred to
last and should not be worked on. The operative scenario is: Customer master data already
exists and is stable; the lifecycle starts from Calibration Request against an existing
customer.

## 2. Key Architectural Facts (do not re-litigate these — they are settled)

- **Single-tenant system.** One company (Kalibrasi Medika), not multi-tenant SaaS. `companyId`
  is sourced from `process.env.COMPANY_ID` server-side via `CompanyRoleGuard` — never from
  client input. There is no cross-tenant isolation concern; the only related risk is
  `companyId` being hardcoded or inconsistently sourced somewhere.
- **Single currency (IDR).** Do not raise multi-currency as a gap.
- **Local dev database is NATIVE PostgreSQL, not Docker.** Docker in this repo
  (`apps/api/Dockerfile`) is for production deployment builds only. Never suggest
  `docker-compose up` for local testing — check/start the native Postgres service instead
  (e.g. `pg_isready`, OS service manager).
- **Document numbering architecture** (`DocumentNumberService` +
  `DocumentNumberSequence` Prisma model + `DocumentType` enum + `DOCUMENT_TYPE_PREFIX` /
  `DOCUMENT_TYPE_NUMBER_TABLE` lookup tables) is the established, working pattern for
  generating unique per-company sequential document numbers (format `PREFIX/YYYY/MM/NNNNN`).
  It uses an atomic `INSERT...ON CONFLICT DO UPDATE` SQL pattern for concurrency safety and is
  proven correct (has a full test suite). **Any new document type needing a formal, unique,
  per-company number must be wired through this existing service — do not invent a new
  numbering mechanism.**
- **A critical anti-pattern was found and must be avoided going forward:** lookup tables keyed
  by an enum (like `DOCUMENT_TYPE_NUMBER_TABLE`) must be typed as a full `Record<EnumName,
  ValueType>`, NEVER `Partial<Record<EnumName, ValueType>>`. `Partial` silently allows missing
  enum members with no compiler error — this exact bug caused `PURCHASE_ORDER`/`WORK_ORDER` to
  be missing from the numbering table undetected. When creating any new enum-keyed mapping
  object anywhere in this codebase, always use the non-partial `Record` type (or
  `satisfies Record<...>`).

## 3. Audit Summary (what a full read-only audit already found)

A comprehensive 4-phase audit (Discovery → Domain Deep-Dive → Cross-Cutting → Synthesis) was
completed. Full report:
`D:\medcal\docs\claude\plans\Calibration-management\audit-technician-portal-e2e.md`
(plus phase notes: `audit-phase-A-discovery.md`, `audit-phase-B-domain-deepdive.md`,
`audit-phase-C-crosscutting.md` in the same folder).

**Important framing used throughout:** because almost nothing beyond Customer was built at
audit time, findings were split into:
- `Not Yet Built (expected)` — a module simply doesn't exist yet; not a defect, doesn't affect
  verdict.
- `Foundation Issue` — a defect in something that DOES already exist (schema, enum, numbering
  config, docs) that will cause real problems once new modules are built on top of it. Only
  these count toward risk/verdict.

**Final verdict: RED** (later corrected from an initial mistaken YELLOW — see Section 6 on
process lessons) due to 4 Blocker-for-MVP Foundation Issues (B1-B4, see Section 4). RED here
means "foundation needs specific, well-defined fixes before certain modules can be safely
built" — NOT "the whole plan needs architectural rework." The audit explicitly confirmed no
rework is needed, just targeted fixes.

**One important audit self-correction to be aware of:** the audit's own Section 3 (State
Machine table) initially reported `CalibrationRequestStatus` as having 7 values including
`QUOTED`, `ACCEPTED`, `IN_PROGRESS`. When the CalibrationRequest module was actually
implemented and the schema re-read directly, the ACTUAL enum was confirmed to have only 5
values: `DRAFT, SUBMITTED, IN_QUOTATION, CANCELLED, FULFILLED`. **Lesson: always re-verify
schema/enum details directly from `schema.prisma` before implementing against them — do not
trust prior audit summaries for exact enum contents, they can be stale or inaccurate.**

Other confirmed Foundation Issues (non-blocker, for later attention):
- `CalibrationJobStatus` has no `CANCELLED` state (workaround: delete the job row).
- `WorkOrderStatus.TECHNICALLY_DONE` semantics vs `CLOSED` undocumented.
- `PurchaseOrderStatus` lacks `IN_FULFILLMENT`/`PARTIALLY_FULFILLED` — confirmed acceptable
  because partial tracking happens at CalibrationJob/Certificate level instead (planning doc
  line 462), though this also reflects an internal contradiction within that same planning doc
  (another section of it lists those states as required) — noted as a documentation
  inconsistency, not a code defect.
- `PurchaseOrder` uses a `taxCode` + `taxRateSnapshot` (Decimal) snapshot pattern instead of a
  `taxId` FK like Quotation/Invoice — valid design choice (historical tax preservation) but
  inconsistent pattern worth documenting.
- Several `companyId` fields (QuotationItem, InvoiceItem, Payment, WorkOrderAssignment,
  CalibrationRequestItem) lack a FK constraint to Company — acceptable for MVP given
  single-tenant, but relies on application-level correctness rather than DB-enforced integrity.
- No rounding-rule documentation for Decimal financial calculations (HALF_UP assumed but not
  written down anywhere).
- No idempotency-key handling on document-creation endpoints yet (mitigated today by unique
  constraints; acceptable for MVP, worth adding before higher traffic).

## 4. Blocker Status (B1-B4) — CHECK THIS BEFORE ASSUMING WORK IS NEEDED

| ID | Description | Status |
|----|---|---|
| B1 | `DOCUMENT_TYPE_NUMBER_TABLE` missing PURCHASE_ORDER/WORK_ORDER + unsafe `Partial<Record>` type | ✅ **FIXED** — entries added, type changed to non-partial `Record`. Verified via typecheck + existing test suite passing. |
| B2 | `DocumentType` enum missing INVOICE, CERTIFICATE, CREDIT_NOTE | ✅ **FIXED** — enum updated, Prisma migration applied (`20260825153938_add_invoice_certificate_creditnote_to_document_type`, pure `ALTER TYPE ADD VALUE`, no data risk), prefix table and number table updated (prefixes chosen: `INV`, `CER`, `CRN` — flagged for human review, not yet explicitly confirmed by the project owner). |
| B3 | Permission catalog (`packages/auth/src/access-control.ts`) missing resources for calibrationRequest, quotation, purchaseOrder, workOrder, calibrationJob, certificate, invoice, payment | ✅ **FIXED** — all 8 resources added with sensible action sets (read/create/update/cancel plus workflow-specific actions like approve/assign/complete/issue/void/reconcile per resource). Not yet wired into any controller beyond CalibrationRequest (that happens as each module is built). |
| B4 | `WorkOrder` schema needs `purchaseOrderId` (currently only has `quotationId` required) — planning doc recommends deriving quotationId from PO instead | ❌ **NOT DONE** — this is a schema decision, larger than B1-B3, deliberately deferred. **Do not start the WorkOrder module until this is resolved.** |

Also confirmed via direct schema check (not just planning docs):
- `CreditNote` model does have a `number` field with `@@unique([companyId, number])` —
  confirmed it genuinely needs the numbering fix done in B2 (not speculative).
- `CalibrationJob` does NOT need its own numbered DocumentType entry — it has no
  human-readable number field, only internal `id` + composite unique
  `[workOrderId, deviceId]`. Customer-facing traceability is fully covered by combining
  `WorkOrder.number` (during execution) + `Certificate.number` (after completion). No action
  needed here.

## 5. Implementation Status (what's actually built vs not)

| Module | Backend (`apps/api`) | Portal UI (`apps/portal`) | Tech-PWA (`apps/tech-pwa`) |
|---|---|---|---|
| Customer | ✅ Built (pre-existing, working, has DocumentNumberService wired) | ✅ Built (pre-existing) | N/A |
| Lead | ✅ Built (pre-existing) | ✅ Built (pre-existing) | N/A |
| **CalibrationRequest** | ✅ **Built and tested** (create/list/get/update-while-draft/cancel/submit; 16 passing tests; company-scoped; document numbering wired with `CRQ` prefix) | ⏳ **In progress right now** — a Portal UI implementation prompt has just been handed to Cursor (see attached `Implementation_Portal_UI_CalibrationRequest.md`). Check with the project owner whether this has completed and been reviewed before assuming it's done. | Not applicable — technician app doesn't touch CalibrationRequest directly |
| Quotation | ❌ Not built | ❌ Not built | N/A |
| PurchaseOrder | ❌ Not built (blocked on nothing itself, but logically should follow Quotation per planning docs) | ❌ Not built | N/A |
| WorkOrder | ❌ Not built — **blocked on B4** | ❌ Not built | ❌ Not built |
| CalibrationJob | ❌ Not built — depends on WorkOrder | N/A | ❌ Not built (this is the core technician workflow: job execution, measurement recording, evidence upload, signature capture) |
| Certificate | ❌ Not built — depends on CalibrationJob | ❌ Not built | N/A |
| Invoice | ❌ Not built — depends on Certificate.billingStatus | ❌ Not built | N/A |
| Payment | ❌ Not built | ❌ Not built | N/A |
| CreditNote | ❌ Not built | ❌ Not built | N/A |

**Recommended safe build order** (per the audit's Section 18 "Safe to Proceed" analysis):
CalibrationRequest and Quotation can proceed independently/in parallel (Quotation now that B3
is done). Payment can also proceed independently. PurchaseOrder should follow Quotation.
WorkOrder must wait for B4. Certificate/Invoice/CreditNote can proceed once B2 (done) and their
own upstream dependencies are ready.

## 5B. Device Management Sub-System — Detailed Status

This is a separate but related sub-system, discovered and built AFTER the initial audit above
(it wasn't in the original lifecycle audit's scope — it underpins the `deviceId` field
referenced by `CalibrationRequestItem`, `QuotationItem`, `PurchaseOrderItem`, `CalibrationJob`,
and `Certificate`). Its purpose: a structured catalog of device types, models, and calibration
parameters, sourced from the company's own real accreditation/capability documentation
(35 device types officially recognized by Kemenkes per PT Presisi Kalibrasi Medika's
Sertifikat Standar, cross-referenced against ~30 unique real calibration worksheets — "LK",
Lembar Kerja — the company already uses operationally).

**Schema (all in `packages/db/prisma/schema.prisma`):**
- `DeviceCategory` — top-level grouping (9 rows: Patient Monitoring, Respiratory & Oxygen,
  Neonatal & Infant Care, Resuscitation, Suction & Fluid Management, Sterilization,
  Temperature Therapy, Cold Chain & Storage, Patient Care).
- `DeviceType` — the 35 officially-recognized device types, each FK'd to a `DeviceCategory`.
- `DeviceModel` — brand/model catalog, FK'd to `DeviceType`. Schema exists; **NOT backfilled**
  (deliberately deferred — inventorying real brand/model data was judged too time-consuming
  for now; see "Known gaps" below).
- `Uom` — centralized unit-of-measure master, global (not FK'd to anything else), same
  convention intentionally shared by `DeviceCapability`.
- `DeviceCapability` / `DeviceCapabilityItem` — a GLOBAL, REUSABLE catalog of measurement
  categories and specific measurable items (e.g. capability `NIBP` → items `Systolic Pressure`,
  `Diastolic Pressure`, `Mean Arterial Pressure`). Deliberately NOT tied to any DeviceType —
  the same item (e.g. `Electrical Safety` items) is reused across dozens of device types.
- `DeviceCalibrationParameter` — the actual per-DeviceType master definition of what gets
  measured during calibration. Links `DeviceType` + `DeviceCapabilityItem` + `Uom` +
  code/name/description. THIS is scoped per-DeviceType (confirmed business rule: calibration
  procedures/parameters are standardized per device TYPE, not per brand/model — e.g. all
  Blood Pressure Monitors share the same parameter set regardless of manufacturer). Unique
  constraint: `[deviceTypeId, capabilityItemId, code]`.
- `Device` — the actual physical unit owned by a customer (`companyId`, `customerId`, `brand`,
  `model`, `serialNumber`, `category` — all free-text strings today, `status` enum). **Known
  gap**: `Device` has NO foreign key to `DeviceType`/`DeviceModel`/`DeviceCategory` — it cannot
  currently be validated against or linked to the catalog above. A schema decision was made
  (add `deviceTypeId` as a required FK on `Device`, keep `brand`/`model` as free-text fallback
  fields rather than also requiring `deviceModelId`, given `DeviceModel` backfill is deferred)
  but **this migration has NOT yet been implemented** — no Cursor prompt has been written or
  run for it yet. This is a real pending task, not just a "nice to have."

**IMPORTANT lesson learned mid-implementation**: a lookup table keyed by an enum/code
(`DOCUMENT_TYPE_NUMBER_TABLE` earlier, but the same class of bug) must use a full/non-partial
type. This was reinforced here too — always verify actual field types/constraints in the live
schema rather than trusting an earlier description of it, since schemas evolve.

**Data status (as of this handoff):**

| Table | Rows Ready | Seeding Status |
|---|---|---|
| `DeviceCategory` | 13 (9 original + 4 new: Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting, Audiology & Physiological Testing) | ✅ Fully seeded and verified |
| `DeviceType` | 59 (35 original + 24 new device types from the taxonomy extension) | ✅ Fully seeded and verified. Excluded (intentionally, pending decisions — see Section 9/Rangkuman items H4/H5): Auto Chemistry Analyzer, Hematologi Analyzer, pH Meter (free-form parameter lists, need a design decision first), Thermohygrometer (category placement undecided). Also excluded (not real device types, confirmed mislabeled source files): "Otoscope", "Phaco Emulsifikasi". |
| `Uom` | 46 (34 previous + 12 new: `DBA`, `LUX`, `BAR`, `REV_MIN`, `UW_CM2`, `UW_CM2_NM`, `KV`, `MGY`, `UM`, `MMAL`, `RA`, `PARTICLE`) | ✅ Seeded. **Important correction found during this work**: the pre-existing `RPM` code actually means "Respirations per Minute" (used for Ventilator/Bed Side Monitor breathing rate), NOT "Revolutions per Minute" — using it for rotational-speed devices (Centrifuge, Rotator, etc.) would have been a silent unit-meaning bug. A new `REV_MIN` code was added specifically for mechanical rotation speed instead. |
| `DeviceModel` | 0 | ⏸️ Still deliberately deferred — no real brand/model inventory data available yet |
| `DeviceCapability` | 30 (21 original + 9 new: `AUDIOMETRIC_PERFORMANCE`, `CLEAN_AIR_CONTAINMENT`, `DENTAL_UNIT_PERFORMANCE`, `XRAY_PERFORMANCE`, `ELECTROTHERAPY_STIMULATION`, `LIGHT_SOURCE_PERFORMANCE`, `FETAL_HEART_RATE`, `SPECTRAL_IRRADIANCE`, `SPIROMETRY_VOLUME_ACCURACY`) | ✅ Fully seeded and verified |
| `DeviceCapabilityItem` | 98 (66 original + 32 new, including one new item `HIGH_TEMP_PROTECTION` added to the existing `WARMER_SURFACE_TEMPERATURE` capability for Blanket Warmer) | ✅ Fully seeded and verified |
| `DeviceCalibrationParameter` | **489** (242 original + 239 taxonomy-extension + 8 net from a Pattern-C data-correctness fix — see Section 5C) — `toleranceMin`/`toleranceMax`/`toleranceNote` backfilled from real `docs/technician-docs/` source, spot-checked against literal source text | ✅ Fully seeded and verified. Idempotency confirmed. **One flagged-not-corrected anomaly**: Laryngoskop's light-intensity tolerance (40,000–160,000 lux) is identical to Lampu Operasi's — seeded as-is from the source, flagged as a likely copy-paste artifact in the source LK itself, needing calibration-team confirmation (Rangkuman item H6, still open). |
| `DeviceCategory`/`DeviceCapability`/`DeviceCapabilityItem`/`DeviceCalibrationParameter` `name` field | 13/30/98/489 | ✅ **Aligned to real LK terminology** (was English/mixed, now matches what's literally printed on the technician's paper worksheet) — see Section 5C for the full effort and its one remaining gap (7 orphan items). |
| `Device.deviceTypeId` FK | N/A — schema change | ✅ Confirmed done and verified (see below, unchanged from before) |
| `Device` CRUD + Portal UI | N/A — application code, not data | ✅ Confirmed done (see below, unchanged from before) |
| `JobReferenceEquipmentUsed` | N/A — schema only, no data (transactional table, intentionally empty) | ✅ Schema + migration done and verified. CRUD/API/UI intentionally NOT built yet — deferred until the `CalibrationJob` module itself exists (building a reference-equipment UI before the job module it belongs to would be premature). |

## 5C. Data-Correctness Fix (Pattern C) + Full Name-Alignment Effort (post-taxonomy-extension)

Two follow-on efforts happened after the initial 481-row taxonomy extension seed, both worth
understanding before touching `DeviceCalibrationParameter`/`DeviceCapabilityItem` again.

**1. Pattern-C data-correctness fix (481 → 489 rows).** A dedicated investigation
(`investigation-measurement-pattern-classification.md`) classified every performance-
measurement item across all 50 LK documents into shape patterns (A: single target + replicates
only; B: multiple setting points sharing ONE tolerance — this is what the still-open G2
`MeasurementEntry`/test-point design needs to handle; C: multiple named variants each with
their OWN distinct tolerance, e.g. Dental Handpiece "Low Speed" vs "High Speed"; D+: other
shapes, deferred). That investigation found **7 rows had been incorrectly collapsed** — a
Pattern C case squeezed into one row with `toleranceMin`/`toleranceMax = NULL` and both
variants' limits concatenated into `toleranceNote`, meaning neither variant's limit could
actually be validated against. These 7 were split into 15 correctly-toleranced rows (Autoclave
chamber-temp/sterilization-temp/time, Bio Safety Cabinet light/sound, Laminar Air Flow sound,
Dental X-Ray HVL). One borderline case (`SUCT_MAX_VACUUM`, Suction Pump) was investigated and
deliberately LEFT AS ONE ROW — its three vacuum-class bands are a per-physical-unit
classification (a pump belongs to exactly one class), not three tests performed on every unit,
so splitting would misrepresent it. **Established precedent for future Pattern-C decisions**:
same conceptual measurement at different modes/settings → same `capabilityItemId`, different
`code` suffix per variant, own `toleranceMin`/`toleranceMax`/`toleranceNote` each.

**2. Full name-alignment effort (43 + 587 rows).** Separately, it was noticed that the `name`
field across all four catalog tables was inconsistently English/mixed, while every real LK
worksheet staff actually work from is written in Indonesian (with certain medical terms kept
in English/mixed form as a matter of course, e.g. "Heart Rate," "NIBP," "SPO2," "Color
Temperature"). **The goal was never "translate everything to Indonesian"** — it was "make the
system say exactly what the paper worksheet says," so there's zero gap between what a
technician reads on the LK and what they see on screen. This was done in 5 passes, each
verified against the live DB and the actual LK documents (not assumption/memory), each
re-syncing the seed script source files so a full reseed reproduces the same result:
- **Phase 1**: `DeviceCategory` (13) + `DeviceCapability` (30) — these are the project's own
  organizational groupings (no single LK document defines them), so a drafted Indonesian list
  was applied directly rather than hunting for a literal source.
- **Batch 1** (+ a Ventilator follow-up, since `technician-docs/` has no Ventilator LK — the
  same G1-era fallback source `docs/legal_n_competency/Penilaian Kemampuan.zip` was used
  again): Patient Monitoring, Respiratory & Oxygen, Resuscitation categories.
- **Batch 2**: Neonatal & Infant Care, Temperature Therapy, Sterilization, Patient Care.
- **Batch 3**: Suction & Fluid Management, Cold Chain & Storage.
- **Batch 4 (final)**: Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting,
  Audiology & Physiological Testing — plus a whole-catalogue final sweep.

**Result: 13/13 categories, 30/30 capabilities, 85/98 items, 473/489 parameters aligned.**
The 13 items + 16 parameters NOT changed are almost all intentional (the LK itself writes them
in English — `HEART_RATE`, `MAXIMUM_VACUUM`, `PULSE_DURATION`, `COLOR_TEMPERATURE`,
`COLOR_RENDERING_INDEX`, an `OVERSHOOT_TEMPERATURE` typo-correction case, etc.) — confirmed
correct, not oversights. A retroactive check across the entire codebase confirmed **no
application code branches on any `name` string value** (all logic keys off `code`/`id`; the
only string-literal hits were in the seed files themselves, which are the source of the names,
and in tests that create their own fixtures rather than read seeded data) — safe to keep
relying on `name` for iteration without fear of hidden breakage.

**Open follow-up from the final sweep — 7 orphan `DeviceCapabilityItem` rows, NOT part of any
batch's scope, still English:**
`ULTRASOUND_IMAGING` → `AXIAL_LATERAL_RESOLUTION`, `DEAD_ZONE_TEST`,
`HORIZONTAL_DISTANCE_CALIBRATION`, `PENETRATION_DEPTH`, `VERTICAL_DISTANCE_CALIBRATION`;
`MASS_WEIGHING` → `DEVIATION_FROM_NOMINAL`, `REPEATABILITY`. These items exist (created
earlier, presumably in anticipation of USG/Ultrasonograph and Timbangan Bayi/Dewasa device
types) but **no `DeviceType` row or `DeviceCalibrationParameter` row uses them** — USG and
Timbangan were never actually seeded as device types, so these items fell outside every
batch's category-based scope (a batch only touches items reachable from a `DeviceType` in its
target categories). **Needs a decision**: either (a) finish the job — add `DeviceType` rows
for Ultrasonograph/USG and Timbangan Bayi/Dewasa (real LK documents exist:
`LK Ultrasonograph (USG).pdf`, `LK Timbangan Bayi.pdf`, `LK Timbangan Dewasa.pdf`, per the
original 30-document investigation) and seed their `DeviceCalibrationParameter` rows, aligning
these 7 items' names in the same pass — or (b) delete the 7 orphan items if there's no near-
term plan to add those device types. Logged as item A10 in
`Rangkuman_Gap_Konfirmasi_User.md`.

**Small unresolved naming-quality items from the batches** (cosmetic, not blocking, logged in
`Rangkuman_Gap_Konfirmasi_User.md`):
- `EST_TIMER` (Electro Accupunture) named "Waktu" verbatim from the LK section header — thin
  as a standalone display label, candidate for "Waktu Terapi" instead.
- Several device types (`OVEN`, `STERILLIZER`, all 5 cold-chain-storage types, Centrifuge
  Refrigerator, Platelet Agitator Incubator) have their storage/chamber-temperature parameter
  named with an invented-but-consistent label ("Suhu ... (multi-titik T1–T9)") because the
  source LK tables have no titled parameter row at all — just a bare grid. Not a guess (follows
  established LK-style phrasing), but worth a calibration-team sanity check.
- `CENTRIFUGE_REFRIGERATOR`'s rotation-speed/time parameter names were applied by analogy to
  plain Centrifuge's LK (no dedicated LK document exists for the refrigerated variant).




**Coverage note**: of the 35 official DeviceTypes, 27 have real LK-worksheet evidence backing
their `DeviceCalibrationParameter` rows. The remaining 8 (Ambulatory ECG, Aspirators/Suction,
Cardiac Output Units, Oxygen-Air Proportioners, Radiant Warmers (Adult), Regulators (Air/O2/
Suction), Regulators (Low-Volume Suction), Paraffin Baths) have NO calibration-parameter data
yet — deliberately not fabricated, per the "no invented seed data" policy that governed this
entire sub-system's build. Separately, 8 MORE device types exist in the company's real LK
documentation but are NOT among the official 35 (Autoclave, Centrifuge, Infuse Pump,
Mikroskop, Syringe Pump, Timbangan Bayi, Timbangan Dewasa, USG) — these have real evidence but
no `DeviceType` row exists for them yet; a deliberate decision was made to defer adding them
(Option 1 of 3 offered: "tunda dulu, fokus 27 yang sudah match") rather than expand the
DeviceType taxonomy in the same pass.

**Source material**: all `DeviceCalibrationParameter` evidence was extracted directly from
`Penilaian_Kemampuan.zip` (real company calibration worksheets), which was uploaded to a chat
session, not necessarily saved anywhere in the repo/docs folder. **If further verification or
extension of this data is needed later, that zip (or the 30 extracted LK PDFs within it) should
be placed somewhere accessible in the repo** (e.g. alongside the CSVs — see Section 7) so future
work doesn't require re-uploading it to a new chat session.


## 6. Process / Methodology Established (please continue this discipline)

This is the most important section for how to actually work with Cursor effectively on this
project. The following pattern was used throughout and caught real bugs — don't skip it for
speed:

1. **Every Cursor prompt has an explicit mode**: either strict READ-ONLY AUDIT MODE (no file
   edits, no writes, only the one designated output file may be created) or explicit
   IMPLEMENTATION MODE with a tightly bounded scope (exact files/directories it may touch,
   explicit list of things NOT to touch). Never leave this ambiguous.
2. **Every prompt requires Cursor to re-verify facts from the actual codebase before acting**,
   rather than trusting a prior summary (including this document, and including prior audit
   phases). This caught the CalibrationRequestStatus enum discrepancy in Section 3 above.
3. **Every implementation prompt requires real verification** (typecheck + running the actual
   relevant test suite, not just "structurally complete" claims) before being accepted as
   done. When Cursor reported tests as "skipped," that was correctly pushed back on and Cursor
   was told to actually get the test database running and report real pass/fail — this
   surfaced a real (small) bug in a test assertion.
4. **Business rules not evidenced in schema or planning docs are never invented.** When a
   business rule is ambiguous (e.g. "can a CalibrationRequest be edited after DRAFT?"), Cursor
   is instructed to implement the minimal, obviously-safe interpretation and leave an explicit
   `// TODO:` comment plus a flagged item in its summary for a human decision — never to guess
   an elaborate rule and present it as settled.
5. **Small, scoped revision passes are used liberally** rather than accepting a large
   deliverable with issues. When gaps were found (missing MVP-relevance tags, misclassified
   risk items, wrong verdict logic, a doc-internal contradiction not flagged, an enum
   discrepancy, skipped tests), a short, surgical follow-up prompt was sent — re-opening and
   patching the SAME existing file/module rather than starting over or creating parallel
   near-duplicate files. File-naming consistency between what a prompt references and what
   Cursor actually writes has been a recurring small friction point — worth double-checking
   file paths/names match exactly what later prompts expect to read.
6. **Verdicts/severity ratings follow a strict, previously-agreed rule with no
   softening allowed in the moment** — e.g. "RED if any Blocker-for-MVP Foundation Issue
   exists, full stop," even if the fix is easy. Nuance about ease-of-fix goes in the
   justification text, not into silently picking a friendlier color/label. When Cursor
   deviated from an agreed rule (as it did once, softening RED to YELLOW with its own
   unstated reasoning), it was corrected back to the rule rather than accepting the judgment
   call.
7. **Migrations and any destructive/write operations require an explicit stop-and-ask
   condition** if Cursor is unsure of the target (e.g. confirm it's hitting the local native
   dev database, not something shared), and a requirement to review generated migration SQL
   for anything beyond the expected minimal change before applying it.

## 7. File Locations Reference

All audit and report docs live in:
`D:\medcal\docs\claude\plans\Calibration-management\`

Key files there:
- `audit-technician-portal-e2e.md` — final synthesized audit report (verdict RED, full
  findings, blockers, risk sections, evidence index)
- `audit-phase-A-discovery.md`, `audit-phase-B-domain-deepdive.md`,
  `audit-phase-C-crosscutting.md` — supporting phase notes (already merged into the final
  report, but useful for deeper evidence trails)
- `Reports_Implementation_CalibrationRequest_Module.md` — implementation report for the
  CalibrationRequest backend module (schema fields verified, test results, TODO gaps)
- `investigation-lk-vs-measurement-schema.md` — **read this before designing anything related
  to `MeasurementResult`.** A read-only Claude Code investigation against all 50 real LK
  worksheets in `technician-docs.zip`, cross-referenced against the live schema. Confirms and
  substantially deepens the open question in Section 9 above (no tolerance field on
  `DeviceCalibrationParameter`, ~10 distinct measurement-data shapes, no schema home for
  reference equipment used per job or for structured Telaah Teknis scoring, real device-type
  coverage is ~49 not 35). Contains 4 grounded (not-yet-implemented) design directions.
- Original planning docs referenced throughout: `Audit and design Purchase Order.md`,
  `centralized-document-numbering-phase1-2.md`, `audit_before_customer_implementation.md`

**Device Management deliverables — IMPORTANT: these currently only exist as chat outputs and
have NOT been confirmed saved into the repo/docs folder yet. Verify with the project owner
where these actually live before assuming they're accessible, and if not yet saved, save them
into the docs folder above (or wherever the project owner prefers) before Cursor needs them:**
- `seed_device_capability.csv` (21 rows) and `seed_device_capability_item.csv` (66 rows) —
  source data for the Device Capability catalog seed.
- `seed_device_calibration_parameter.csv` (241 confirmed + 1 intentionally-excluded row) —
  source data for the per-DeviceType calibration parameter seed.
- `Seed_DeviceCapability_and_Item.md` and `Seed_DeviceCalibrationParameter.md` — the Cursor
  prompts written to consume the above CSVs.
- `Refine_DeviceCalibrationParameter_AddDeviceTypeId.md` — the revision prompt that added
  `deviceTypeId` to `DeviceCalibrationParameter` after it was initially built without it
  (already executed and confirmed done).
- The original `Penilaian_Kemampuan.zip` (real company LK/IK calibration worksheets) and/or
  its extracted contents — this was the evidentiary source for the two CSVs above. Not
  confirmed to be saved anywhere in the repo; see the note at the end of Section 5B.
- No Cursor prompt exists yet for the `Device.deviceTypeId` FK migration (see Section 5B,
  "Known gap") — this still needs to be written.

## 9. Open Architecture Questions (unresolved, needs a decision before relevant modules are built)

1. **`MeasurementResult` ↔ `DeviceCalibrationParameter` linkage — investigated in depth
   against 50 real LK worksheets.** Full investigation report:
   `D:\medcal\docs\claude\plans\Calibration-management\investigation-lk-vs-measurement-schema.md`.
   Four sub-gaps were identified (G1-G4 in `Rangkuman_Gap_Konfirmasi_User.md`). Status:

   - **G1 (tolerance field on `DeviceCalibrationParameter`) — ✅ RESOLVED.** Added
     `toleranceMin`/`toleranceMax` (`Decimal?`) + `toleranceNote` (`String?`, verbatim source
     text) to `DeviceCalibrationParameter`. All 242 existing rows backfilled from real source
     documents (migration `20260826190000_replace_limit_fields_with_tolerance_fields_on_device_calibration_parameter`
     — note: an earlier, structurally-flawed attempt using `limitKind`(enum)+`limitValue`
     (single number) was found and correctly replaced, since it couldn't hold a
     nominal+delta pair like "25±6°C" simultaneously). Coverage: 88 rows got both min+max, 26
     min-only, 83 max-only, 45 got neither (see finding below — not a failure), 241/242 have
     `toleranceNote` populated. Only 1 row genuinely unresolvable (`INCU_RECOVERY_TIME` — LK
     table header exists but no tolerance value is actually written in the source).
     **Important source-data note**: `docs/technician-docs/` (the 50-document primary source)
     does NOT contain a Ventilator LK document. All `VENTILATOR` rows (including
     `VENT_IE_RATIO`) were backfilled from a fallback secondary source —
     `docs/legal_n_competency/Penilaian Kemampuan.zip` → `Penilaian Kemampuan/Ventilator/LK
     Ventilator Transport.pdf` (the older 30-document set referenced earlier in this project)
     — clearly flagged as such in the implementation report for traceability. If a
     `technician-docs`-native Ventilator LK ever surfaces, Ventilator's tolerance data should
     be re-verified against it.
     **Critical finding for G2 (read before designing `MeasurementEntry`)**: the 45 rows with
     no `toleranceMin`/`toleranceMax` are NOT a data gap — they're parameters whose tolerance
     is expressed as "±delta from whatever setting point is being tested" (e.g. NIBP Systolic
     tested at 7 different pressure points from 60-250 mmHg, each with a ±5mmHg tolerance
     band — there is no single absolute min/max at the master-catalog level, because the
     nominal isn't fixed, it's whatever setting point a given measurement instance targets).
     This confirms `toleranceMin`/`toleranceMax` correctly handles the "fixed nominal" case
     (room temperature, electrical safety) but roughly 19% of parameters (45/242) need
     "relative-to-instance-setting-point" tolerance logic instead, which can only be computed
     at measurement time, not stored as a static master value. `toleranceNote` (which stores
     the verbatim "± 5 mmHg" style text) is the raw material for that future computation —
     whoever designs `MeasurementEntry` needs to parse/use `toleranceNote` for these 45 rows'
     logic, not just `toleranceMin`/`toleranceMax`.
     **Also confirmed**: class-dependent cases (e.g. Equipment Leakage Current: Class I
     ≤500µA vs Class II ≤100µA) were handled by storing the general/Class-I case numerically
     and the full detail in `toleranceNote` — an acknowledged simplification, not a full
     structural fix (would need a device-class dimension that doesn't exist in the schema).
     Affected rows: `BSM_EQUIP_LEAKAGE`, `PM_EQUIP_LEAKAGE`, `ECG_EQUIP_LEAKAGE`,
     `BREASTP_EQUIP_LEAKAGE`, plus a few others with genuinely multi-band criteria
     (`INCU_AIR_TEMP` — two different tolerances for different sensor positions;
     `BREASTP_MAX_VACUUM` — three mutually-exclusive Low/Medium/High bands, non-numeric).

   - **G2 (structured `MeasurementEntry` model for the ~10 distinct data shapes) — still
     open.** Now has stronger grounding after G1's backfill (see the "critical finding"
     above — the tolerance-computation logic itself needs to branch on whether a parameter
     has a fixed master-level tolerance vs. a setting-point-relative one). Reminder of the
     underlying complexity from the original investigation: performance-measurement data has
     at least ~10 structurally distinct shapes across the 50 documents — far more than a
     simple "setting × replicate" grid. Includes: multiple independent sub-tables per device
     type; externally-attached data-logger readings not entered in the LK at all (cold-
     storage/chamber devices); free-form, dynamically-named parameter lists with per-row
     custom tolerances (Hematology/Chemistry Analyzers — the parameter set isn't fixed,
     technicians substitute from a reference certificate); qualitative pass/fail with no
     numeric value (Bio Safety Cabinet smoke/HEPA tests); derived/calculated values
     referencing other cells (Mikroskop magnification ratio); paired reference-vs-UUT tables
     (Thermohygrometer); hysteresis/directional sub-readings (Naik/Turun); non-monotonic or
     qualitative setting points (SpO2 out-of-order values; Min/Med/Max labels); single-value
     range/classification checks with no replicate; fixed covariates held constant while one
     parameter sweeps. Likely needs a core structured shape (parameter × setting × replicate)
     plus a `Json` escape hatch for the genuinely irregular cases — see Suggested Direction A
     in the investigation report for the original proposal shape.
   - **G3 (`JobReferenceEquipmentUsed` — reference/standard equipment used per job) — next
     priority, not yet started.** Confirmed universal across all 50 worksheets (every single
     one has a "Daftar Alat yang Digunakan" table — which specific reference instrument,
     brand/model/serial, was used for that job), low-risk/low-ambiguity to design since the
     shape doesn't vary much across device types, and `JobEvidence` (photo/file attachment)
     cannot represent it today. See Suggested Direction C in the investigation report.
   - **G4 (`QualityReview` structured scoring) — still open, not yet started.** The real
     "Telaah Teknis" scoring is a 3-category weighted score (commonly 10/40/50, but varies —
     10/40/60, 20/80, 10/90 depending on whether an electrical-safety line applies), and one
     worksheet variant (`LK Kelistrikan`, a generic electrical-installation-only worksheet,
     not device-specific) replaces the whole scoring mechanism with a 5-tier categorical
     classification instead of points. `QualityReview` currently only has
     `decision`/`status`/free-text `notes` — no structured score breakdown, no variable
     weighting, no support for the categorical variant. See Suggested Direction D.

   **Also still relevant, not part of G1-G4 but from the same investigation:**
   - **Device-type catalog coverage is 27 of ~49 real device types, not 27 of 35 as
     previously assumed** (see `Rangkuman_Gap_Konfirmasi_User.md` item A9 for the full list of
     ~22 uncovered device types). `technician-docs.zip` should be treated as the primary
     source for extending this coverage going forward.
   - **Two likely mislabeled source files** (`LK Otoscope.docx`, `LK Phaco Emulsifikasi.docx`
     — see `Rangkuman_Gap_Konfirmasi_User.md` item A8) still need confirmation from the
     calibration team before being used as a seeding source for those two device types.

   **Design boundary to keep intact** (carried over, still applies): `DeviceCalibrationParameter`
   (including its `valueType` and now `toleranceMin`/`toleranceMax`/`toleranceNote`) describes
   WHAT to measure, what shape the value takes, and what the pass/fail limit is at the master
   level. The eventual `MeasurementResult`/`MeasurementEntry` layer is where the ACTUAL
   measured value from a real job lives, checked against that limit (statically for
   fixed-nominal parameters, or computed against the instance's setting point for the 45
   relative-tolerance parameters). Don't merge these two concerns — a prior proposal that
   would have collapsed them was correctly rejected earlier in this project.

## 10. Immediate Next Steps at Handoff Time (was Section 8; renumbered)

Status of in-flight items as of this update:

1. **Portal UI for CalibrationRequest** — prompt was issued
   (`Implementation_Portal_UI_CalibrationRequest.md`). Completion status still unconfirmed —
   check with the project owner.
2. **DeviceCapability + DeviceCapabilityItem seeding** — ✅ DONE, confirmed (see Section 5B).
3. **DeviceCalibrationParameter seeding** — ✅ DONE, confirmed (see Section 5B).
4. **`Device.deviceTypeId` FK migration** — ✅ DONE, confirmed (see Section 5B).
5. **Device CRUD + Portal UI** — ✅ DONE, confirmed (see Section 5B).
6. **`VENT_IE_RATIO` design decision** — ✅ RESOLVED. Added `valueType` enum to
   `DeviceCalibrationParameter` (see Section 5B) rather than forcing a dimensionless Uom.
7. **`MeasurementResult` ↔ `DeviceCalibrationParameter` linkage** — investigated in depth,
   broken into G1-G4 (see Section 9 for full detail):
   - G1 (tolerance fields on `DeviceCalibrationParameter`) — ✅ **RESOLVED**.
   - G2 (`MeasurementEntry` structured model) — still open, no active work yet.
   - G3 (`JobReferenceEquipmentUsed`) — ✅ **RESOLVED** (schema only; CRUD/UI deferred to
     when the `CalibrationJob` module itself is built).
   - G4 (`QualityReview` structured scoring) — still open, no active work yet.
8. **Device-type taxonomy extension** — ✅ **RESOLVED**. 24 new device types (not the
   originally-estimated ~22/21/17 — see Section 5B for why the count changed), 4 new
   categories, 9 new capabilities, 12 new UOMs seeded. 4 device types intentionally still
   excluded pending decisions (Rangkuman items H4, H5) — see Section 5B.
9. **Two possibly-mislabeled LK source files** — ✅ **RESOLVED**. Both confirmed mismatched
   (`LK Otoscope.docx` and `LK Phaco Emulsifikasi.docx` contain duplicate content belonging to
   other already-covered device types, not genuine distinct device types). No `DeviceType`
   rows created for either — correctly excluded from the taxonomy extension.
10. **Two urgent data-accuracy questions raised, still awaiting an answer from the project
    owner/calibration team** (see `Rangkuman_Gap_Konfirmasi_User.md` items H1/H2 — these do
    NOT block other engineering work, but do affect data already live in the system):
    - H1: Blood Pressure Monitor's NIBP tolerance is currently seeded as ±5mmHg, but an older
      source document says ±8mmHg — needs confirmation which is correct.
    - H2: Baby Incubator's `INCU_RECOVERY_TIME` parameter has no tolerance value in the
      current source (the row is present in the table header but the data row was dropped
      between document revisions); an older source has "≤15 menit" as a candidate value,
      pending confirmation before use.
11. **Laryngoskop's light-intensity tolerance** (Rangkuman item H6) — seeded as-is from the
    source document but flagged as a likely copy-paste artifact (identical to Lampu Operasi's
    40,000–160,000 lux, unusually high for a handheld device) — needs calibration-team
    confirmation, not blocking.
12. **Pattern-C data-correctness fix** — ✅ **RESOLVED**. 7 incorrectly-collapsed
    `DeviceCalibrationParameter` rows split into 15 correctly-toleranced rows (481 → 489
    total). See Section 5C for detail and the established precedent for future similar cases.
13. **Full name-alignment effort (Category/Capability/Item/Parameter `name` fields)** — ✅
    **RESOLVED** (13/13, 30/30, 85/98, 473/489 — see Section 5C). One follow-up open: **7
    orphan `DeviceCapabilityItem` rows** (Ultrasound Imaging + Mass Weighing items) still
    English, unreachable from any current `DeviceType`, needing a decision (finish seeding
    USG/Timbangan device types, or delete the orphans) — Rangkuman item A10.

Given items 2-3 and 7-13 above are now resolved or explicitly non-blocking, active engineering
work can proceed on lifecycle modules without waiting on the remaining open items — the next
candidate is the **Quotation module** (backend, following the same pattern as
CalibrationRequest), or resolving B4 to unblock WorkOrder. A full list of open business/domain
decisions needing the project owner's or a domain expert's input has been separately compiled
in `Rangkuman_Gap_Konfirmasi_User.md` — worth reviewing alongside this handoff document, but
none of its remaining open items currently block starting the Quotation module.
