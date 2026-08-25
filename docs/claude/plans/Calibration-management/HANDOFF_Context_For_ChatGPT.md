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
- Original planning docs referenced throughout: `Audit and design Purchase Order.md`,
  `centralized-document-numbering-phase1-2.md`, `audit_before_customer_implementation.md`

## 8. Immediate Next Step at Handoff Time

A Cursor prompt to build the **Portal UI for CalibrationRequest** has just been issued
(`Implementation_Portal_UI_CalibrationRequest.md`, scope: `apps/portal` only, reuses the
`customers` module's UI patterns and the already-built CalibrationRequest backend API). Check
with the project owner whether Cursor has completed this and whether its output has been
reviewed yet before deciding what to do next. Likely next candidates after that: the Quotation
module (backend, following the same pattern as CalibrationRequest), or resolving B4 to unblock
WorkOrder.
