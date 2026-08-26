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
| `DeviceCategory` | 9 | ✅ Seeded (confirmed by project owner) |
| `DeviceType` | 35 | ✅ Seeded (confirmed by project owner) |
| `Uom` | 34 (31 original + `UA` microampere, `M_S` meter/second, `DB` decibel added later) | ✅ Seeded (confirmed by project owner) |
| `DeviceModel` | 0 | ⏸️ Deliberately deferred — no real brand/model inventory data available yet |
| `DeviceCapability` | 21 rows prepared (CSV: `seed_device_capability.csv`) | 🟡 Cursor prompt issued (`Seed_DeviceCapability_and_Item.md`), **execution result still not confirmed back as of this update** — check with project owner whether this ran and passed verification before assuming it's seeded |
| `DeviceCapabilityItem` | 66 rows prepared (CSV: `seed_device_capability_item.csv`) | 🟡 Same prompt as above, same unconfirmed status |
| `DeviceCalibrationParameter` | 242 rows (241 `NUMBER`-type + 1 `RATIO`-type) | ✅ **Confirmed seeded and verified.** Includes a schema refinement completed after initial seeding: added `valueType` enum (`NUMBER`/`RATIO`/`TEXT`/`BOOLEAN`, default `NUMBER`) and made `uomId` nullable, specifically to support `VENT_IE_RATIO` (Ventilator I:E Ratio), which is a ratio (e.g. "1:2") rather than a physical quantity with a unit — seeded with `valueType=RATIO`, `uomId=NULL`. Migration verified idempotent (row count stable across repeated runs), typecheck/build/tests passed (12/12). Portal UI (list/detail) was also touched in this same task to handle nullable `uomId` without crashing and to display `valueType` — not originally in scope but a reasonable/necessary consequence of the schema change; worth a quick manual diff review if not already done. Note: the Calibration Parameter create/edit form still defaults to `valueType=NUMBER` with `uomId` required on create — there is currently no UI path to create a new `RATIO`-type parameter through the form (only via seed/script). Not urgent (only one RATIO parameter exists today) but flagged for whenever a second ratio-type parameter is needed. |
| `Device.deviceTypeId` FK | N/A — schema change | ✅ **Confirmed done and verified.** Required FK to `DeviceType`, added in commit `aed25e4` (2026-08-26 09:32, migration folder `20260826090000_add_device_type_to_device`). Verified via direct DB inspection: table was empty before and after (0 rows, no data risk), FK constraint + NOT NULL + index all confirmed present, insert-without-FK and insert-with-invalid-FK both correctly rejected. `deviceModelId` was deliberately NOT added (per locked decision — `DeviceModel` backfill still deferred); `brand`/`model`/`category` remain free-text `String?` fields on `Device` as a fallback until/unless `DeviceModel` is backfilled later. |
| `Device` CRUD + Portal UI | N/A — application code, not data | ✅ **Confirmed done.** List page (search by brand/model/serial/type/tipe/customer, filters for DeviceType/Customer/Status, supports deep-link via `customerId`/`deviceTypeId` query params), create/edit form (DeviceType required selector reusing the existing DeviceType query hook, Customer selector reusing the existing Customer picker, `deviceModelId` deliberately not implemented), detail page, delete respecting referential integrity (no cascade). One issue found and fixed post-build: the create form initially had hardcoded example-looking placeholder text (`Omron` / `HEM-7120` / `SN-001`) which risked being mistaken for real/seeded data — corrected to plain instructional placeholders (`Masukkan merek alat`, etc.) via a small follow-up fix; verified visually by the project owner. `Device` table itself remains intentionally empty (0 rows) — it is meant to be populated through real usage (staff creating records via this UI) or a future data import from an existing inventory source, never through seeding. |


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

1. **`MeasurementResult` ↔ `DeviceCalibrationParameter` linkage — now investigated in depth
   against 50 real LK worksheets, confirmed broader and more severe than first flagged.**
   Full investigation report:
   `D:\medcal\docs\claude\plans\Calibration-management\investigation-lk-vs-measurement-schema.md`
   (produced by a dedicated Claude Code read-only investigation task against
   `technician-docs.zip`, extracted to `docs/technician-docs/` — 50 `.docx` LK worksheets, one
   per device type, all successfully parsed). Key findings, roughly in priority order:

   - **`DeviceCalibrationParameter` has no tolerance/threshold field at all.** This was a
     deliberate exclusion in its original build (the build task explicitly forbade speculative
     fields like `tolerance`/`minimum`/`maximum` without evidence). The 50-document review now
     provides that evidence: every LK worksheet pairs each measured parameter with a fixed
     tolerance (e.g. Equipment Leakage Current ≤500µA for Class I devices, ≤100µA for Class
     II — not a universal constant, varies by device type/class). Tolerance is a property of
     the device-type+parameter definition, not of an individual measurement instance — so it
     belongs on the MASTER catalog, not deferred to a future instance/result layer. **This
     should now be added to `DeviceCalibrationParameter`** (or a sibling limit model, if a
     parameter can have more than one limit shape) — the original "don't invent" caution no
     longer applies now that real evidence exists.
   - **Performance-measurement data has at least ~10 structurally distinct shapes** across the
     50 documents — far more than a simple "setting × replicate" grid. Includes: multiple
     independent sub-tables per device type; externally-attached data-logger readings not
     entered in the LK at all (cold-storage/chamber devices); free-form, dynamically-named
     parameter lists with per-row custom tolerances (Hematology/Chemistry Analyzers — the
     parameter set isn't fixed, technicians substitute from a reference certificate);
     qualitative pass/fail with no numeric value (Bio Safety Cabinet smoke/HEPA tests);
     derived/calculated values referencing other cells (Mikroskop magnification ratio); paired
     reference-vs-UUT tables (Thermohygrometer); hysteresis/directional sub-readings (Naik/
     Turun); non-monotonic or qualitative setting points (SpO2 out-of-order values; Min/Med/
     Max labels); single-value range/classification checks with no replicate; fixed covariates
     held constant while one parameter sweeps. A structured `MeasurementResult`/
     `MeasurementEntry` design needs to accommodate this diversity, likely via a core
     structured shape (parameter × setting × replicate) plus a `Json` escape hatch for the
     genuinely irregular cases — see Suggested Direction A in the investigation report.
   - **Reference/standard equipment used per job has zero schema representation.** Every
     single one of the 50 worksheets has a "Daftar Alat yang Digunakan" table (which specific
     reference instrument, brand/model/serial, was used for that job) — this is universal, not
     an edge case, and `JobEvidence` (photo/file attachment) cannot represent it. See
     Suggested Direction C (a `JobReferenceEquipmentUsed` model) — flagged as low-ambiguity,
     low-risk to design since the shape doesn't vary much across device types.
   - **`QualityReview`'s scoring structure can't represent the real "Telaah Teknis" scoring.**
     The dominant pattern is a 3-category weighted score (commonly 10/40/50, but varies —
     10/40/60, 20/80, 10/90 depending on whether an electrical-safety line applies), and one
     worksheet variant (`LK Kelistrikan`, a generic electrical-installation-only worksheet, not
     device-specific) replaces the whole scoring mechanism with a 5-tier categorical
     classification instead of points. `QualityReview` currently only has
     `decision`/`status`/free-text `notes` — no structured score breakdown, no variable
     weighting. See Suggested Direction D.
   - **Device-type catalog coverage is 27 of ~49 real device types, not 27 of 35 as
     previously assumed.** `technician-docs.zip` (50 documents) is a materially larger and more
     authoritative source than the earlier `Penilaian_Kemampuan.zip` (30 documents) used to
     build the current 242-row `DeviceCalibrationParameter` seed — it includes ~22 additional
     real device types with no seeded parameters yet (Audiometer, Auto Chemistry Analyzer,
     Autoclave, Bio Safety Cabinet, Centrifuge/Centrifuge Refrigerator, CPAP, Dental Unit,
     Dental X-Ray, Electro Accupunture, Examination Lamp, Fetal Doppler, Head Lamp Medik,
     Hematologi Analyzer, Infusion Pump, Laminar Air Flow, Lampu Operasi, Laryngoskop,
     Mikroskop Laboratorium, pH Meter, Phototherapy, Platelet Agitator Incubator, Rotator,
     Spirometer, Suction Pump, Syringe Pump). Whoever continues the parameter-seeding work
     should treat `technician-docs.zip` as the primary source going forward, not the older zip.
   - **Two likely mislabeled source files** were flagged (not fixed): `LK Otoscope.docx`
     actually contains a light-source test matching the Examination Lamp/Head Lamp/Lampu
     Operasi/Laryngoskop family, not an otoscope-specific test; `LK Phaco Emulsifikasi.docx`
     actually contains a suction/vacuum test identical in structure to `LK Suction Pump.docx`,
     not a phaco-emulsification-specific test. These need confirmation from the calibration
     team (see `Rangkuman_Gap_Konfirmasi_User.md`) before being used as a basis for seeding
     those two device types' parameters.

   **Caution for whoever designs the eventual link** (carried over from before, still
   applies): while resolving item A1 in `Rangkuman_Gap_Konfirmasi_User.md` (how to represent
   `VENT_IE_RATIO`), a proposal surfaced that would have restructured
   `DeviceCalibrationParameter` itself into an instance/value-holding table (adding
   `deviceId`, `valueNumeric`, `ratioNumerator`, etc. directly onto it). That was correctly
   rejected — it would have collapsed the master-definition table into a measurement-result
   table. The `valueType` enum was added to `DeviceCalibrationParameter` instead (a
   master-level concept: "this parameter expects a ratio," not "here is the ratio value").
   **The tolerance field being added now follows the same principle** — it's a master-level
   constant (what the limit IS), not an instance-level value (what was measured). Keep this
   boundary intact: `DeviceCalibrationParameter` describes WHAT to measure, what shape the
   value takes, and what the pass/fail limit is; the eventual `MeasurementResult`/
   `MeasurementEntry` layer is where the ACTUAL measured value from a real job lives, checked
   against that limit. Don't merge these two concerns.

## 10. Immediate Next Steps at Handoff Time (was Section 8; renumbered)

Status of in-flight items as of this update:

1. **Portal UI for CalibrationRequest** — prompt was issued
   (`Implementation_Portal_UI_CalibrationRequest.md`). Completion status still unconfirmed —
   check with the project owner.
2. **DeviceCapability + DeviceCapabilityItem seeding** — prompt issued, execution result
   STILL not reported back as of this update (see Section 5B table). This is the main
   remaining unknown in the Device Management sub-system — check this first before assuming
   the capability catalog is usable.
3. **DeviceCalibrationParameter seeding** — ✅ DONE, confirmed (see Section 5B).
4. **`Device.deviceTypeId` FK migration** — ✅ DONE, confirmed (see Section 5B).
5. **Device CRUD + Portal UI** — ✅ DONE, confirmed (see Section 5B).
6. **`VENT_IE_RATIO` design decision** — ✅ RESOLVED. Added `valueType` enum to
   `DeviceCalibrationParameter` (see Section 5B) rather than forcing a dimensionless Uom.
7. **`MeasurementResult` ↔ `DeviceCalibrationParameter` linkage** — investigated in depth
   (see Section 9), still needs actual design/implementation. Three concrete sub-decisions
   now block this, roughly in priority order:
   a. Add a tolerance/limit field (or sibling model) to `DeviceCalibrationParameter` — the
      investigation confirmed this is a real master-level gap, not a deferred instance-level
      concern.
   b. Decide on the `MeasurementEntry`-style structured model (Suggested Direction A in the
      investigation report) vs. alternatives, accounting for the ~10 distinct data shapes
      found.
   c. Decide on `JobReferenceEquipmentUsed` (Direction C) and the `QualityReview` scoring
      structure (Direction D) — both confirmed as universal/near-universal gaps with no
      schema home today.
8. **Device-type coverage gap** — the real device-type count is ~49 (from `technician-docs.zip`,
   50 documents), not 35. ~22 device types have no `DeviceCalibrationParameter` rows yet.
   Extending the seed to cover them should use `technician-docs.zip` as the primary source
   going forward (more complete and authoritative than the earlier `Penilaian_Kemampuan.zip`).
9. **Two possibly-mislabeled LK source files** (`LK Otoscope.docx`, `LK Phaco Emulsifikasi.docx`)
   need confirmation from the calibration team before being used as a seeding source for those
   two device types — see `Rangkuman_Gap_Konfirmasi_User.md`.

Beyond these in-flight items, the next lifecycle-module candidates remain: the Quotation
module (backend, following the same pattern as CalibrationRequest), or resolving B4 to unblock
WorkOrder. A full list of open business/domain decisions needing the project owner's or a
domain expert's input (not just engineering follow-through) has been separately compiled in
`Rangkuman_Gap_Konfirmasi_User.md` — worth reviewing alongside this handoff document.
