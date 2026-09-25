# Phase 3A — Certificate Issuance Flow + verificationToken: Audit Report

**Status:** AUDIT ONLY. No source code, schema, migrations, or data were modified. `git status`
confirmed clean of new changes before and after this audit (only pre-existing Phase 1–3
changes from prior sessions present). One read-only `COUNT(*)`-equivalent query was run
against the dev database (see §6) — no writes.

## Headline finding

**There is no certificate issuance flow to trace.** The `Certificate` Prisma model is
completely designed in the schema — every relation, every enum, every lifecycle field — but
**zero application code anywhere creates, updates, or transitions a `Certificate` row**. The
only `prisma.certificate.*` call in the entire repo is a read-only `count()` used as a
delete-guard in `devices.service.ts`. There is no `CertificatesModule`/`Service`/`Controller`.
No PDF generator produces a customer-facing certificate. `verificationToken` has never been
read or written by any code. The dev database has **0 rows** in `Certificate`. This is a
green-field feature at the service-layer, not a partially-built one — Phase 3 is not
"finish wiring an existing flow," it's "build the flow," using an already-complete,
already-reviewed schema as the target shape.

Two same-named-but-unrelated concepts were found and ruled out, since they could easily be
mistaken for the real thing:
- `KontrolAlat.certificateNumber` — a manually-typed string field on the lab intake form,
  gated only by `QualityReview.status === "APPROVED"`, with **no relation whatsoever** to the
  `Certificate` model.
- `EquipmentCalibrationRecord`'s "certificate PDFs" — Medcal's own reference/standard
  equipment's traceability certificates (proof Medcal's calibration tools are themselves
  calibrated), a completely different business domain, manually-uploaded evidence files via
  the generic `FilesModule`, unrelated to customer-facing certificates.

---

## 1. Certificate Lifecycle

The **designed** (schema-only) lifecycle, inferred from field/enum shape — not from any
actual code, because none exists:

```text
CalibrationJob (1:1, calibrationJobId @unique on Certificate)
      │
      ▼
Certificate created — status: DRAFT (schema default), billingStatus: UNBILLED (default)
      │  [no code path does this today]
      ▼
Certificate issued — status: ISSUED, issuedAt set
      │  [no code path does this today]
      ▼
PDF attached — pdfFileObjectId set, FileObject via "CertificatePdf" relation
      │  [no code path does this today — no generator exists]
      ▼
[optional] REVOKED (revokeReason set) or SUPERSEDED (via supersedesCertificateId self-relation)
      │  [no code path does this today]
```

Every arrow above is unimplemented. The only real, executing code adjacent to this lifecycle
is `kontrol-alat.service.ts`'s `assertCertificateNumberAllowed`, which gates a **different**
field (`KontrolAlat.certificateNumber`) on `QualityReview.status === "APPROVED"` — this is
the closest existing precedent for "the business moment a certificate becomes legitimate,"
even though it doesn't touch the `Certificate` model at all today.

## 2. Certificate Creation / Issuance Entry Point

**None exists.** Confirmed by exhaustive grep across `apps/api/src` for `certificate.create`
and `certificate: { create` (case-insensitive on the Prisma accessor): zero matches. The only
Prisma access to `Certificate` anywhere in the repo is:

```ts
// apps/api/src/modules/devices/devices.service.ts — remove(), a delete-guard
const certificates = await prisma.certificate.count({ where: { deviceId: id } });
// ... throws DEVICE_IN_USE if > 0, alongside other reference counts
```

Read-only, and only reachable if a `Certificate` row already exists (which today, none do).

## 3. `verificationToken` Current State

- **Schema:** `verificationToken String? @unique` (`packages/db/prisma/schema.prisma:2977`).
  Migration SQL (`20260813063336_init_better_auth_fcmtoken/migration.sql`): plain nullable
  `TEXT` column, **no default, no NOT NULL** — a separate `CREATE UNIQUE INDEX` enforces
  uniqueness (Postgres permits multiple `NULL`s under a unique index, so this is safe as-is).
- **Consumers:** zero. No controller, service, DTO, zod schema, or test reads or writes this
  field anywhere in `apps/api`, `apps/web-api`, `apps/portal`, `apps/tech-pwa`, or
  `packages/*/src`. Every non-schema hit repo-wide is documentation/planning prose (prior
  Customer Portal planning docs, gap registers, ERD notes) already stating this is unused —
  this audit independently confirms that conclusion at the code level, not by trusting the
  docs.
- **API responses / PDFs / QR:** not present anywhere — there's no API response, PDF
  generator, or QR generator that could reference it, since none of those exist for
  certificates yet either.
- **Existing data:** confirmed via a live, read-only query against the dev database
  (see §6) — 0 rows total, so the "is it NULL or populated" question is moot; there is
  nothing to be either.

## 4. Certificate → Customer Relationship

**Direct, not derived.** `Certificate.customerId` is its own field with a direct relation to
`Customer` (`customer Customer @relation(fields: [customerId], references: [id],
onDelete: Cascade)`) — not something that has to be traversed via `CalibrationJob` → `Device`
→ `Customer`. This is good news for the future authorization design: the check "does this
Certificate belong to a Customer this User is linked to" is a single-hop comparison —
`Certificate.customerId` against the caller's `CustomerUserLink.customerId` set (from Phase 1)
— with no join through `CalibrationJob`/`Device` required. `Certificate` also independently
relates to `Device` and `CalibrationJob` (1:1, unique), but `Customer` is its own direct FK,
confirmed authoritative and not something a future implementer needs to invent.

## 5. Token Generation Recommendation

Since no lifecycle code exists, there is no "correct existing point" to identify from real
execution — this is a design decision for whoever implements Phase 3B, informed by the schema
shape and the one adjacent real precedent (`assertCertificateNumberAllowed`'s QA-approval
gate). Recommendation, clearly labeled as a recommendation, not an audit finding:

1. **Lifecycle boundary:** generate `verificationToken` at the **DRAFT → ISSUED** transition,
   not at initial `Certificate` row creation. Rationale: a `DRAFT` certificate is, by the
   schema's own naming, not yet finalized/customer-visible — generating a live, QR-worthy
   locator for a document that might still change or never get issued is wasted and
   potentially confusing. The token's purpose (a stable, physical, printed QR target) only
   makes sense once the document is final.
2. **Transaction boundary:** yes — inside the same transaction as the status write
   (`DRAFT → ISSUED`, `issuedAt` set) and, once a certificate PDF generator exists, ideally
   the same transaction/step that produces the `FileObject`. An `ISSUED` certificate should
   never exist without a token, and vice versa.
3. **Backfill:** not required — the database has 0 `Certificate` rows (§6). There is nothing
   to backfill.
4. **Reissuance/regeneration:** no reissuance code exists to audit. The schema's
   `supersedesCertificateId`/`supersededBy` self-relation implies the intended design is "a
   correction creates a *new* `Certificate` row pointing at the old one," not "mutate the
   existing row's token." **Open tension worth flagging** (§10): `calibrationJobId` is
   `@unique` on `Certificate`, meaning at most one `Certificate` can ever exist per
   `CalibrationJob`. If supersession is meant to happen for the *same* job, this unique
   constraint would block creating the new row. This wasn't previously documented anywhere
   found in this audit and needs a decision before reissuance is implemented — not something
   this audit should resolve unilaterally.
5. **Stability/rotation:** should remain stable for the certificate's lifetime once issued —
   a QR code is physically printed on paper and cannot be changed after printing without
   reprinting. Rotation is not meaningful here.
6. **Revoked/superseded behavior:** not implemented anywhere to observe. Recommendation only:
   the token should keep resolving (the physical QR still exists and gets scanned), but the
   `status` field (already modeled: `REVOKED`/`SUPERSEDED`) should be what the future
   Customer Portal API surfaces to the caller — not a 404. This is consistent with the
   security posture already established in the Phase 2 planning docs (generic "not
   accessible" only for genuinely unauthorized/nonexistent tokens, not for a real,
   authorized-but-revoked certificate).

## 6. Existing Certificate Backfill

**Not required.** A live, read-only query against the dev database
(`prisma.certificate.count()`, run via `tsx` with the same `DATABASE_URL` the test suite
uses) returned:

```text
Total Certificate rows: 0
Rows with non-null verificationToken: 0
By status: []
```

There are zero `Certificate` records in the database today — fully consistent with "no code
creates them." No backfill mechanism exists, and none is needed until rows exist.

## 7. PDF / QR Integration Point

No customer-facing certificate PDF generator exists. The four PDF generators that do exist
(`kontrol-alat-pdf.ts`, `identity-correction-pdf.ts`, `lk-result-pdf.ts`, `work-order-pdf-wol.ts`)
all produce **internal** working documents (lab intake form, identity-correction record, LK
result report, work order form) via `pdfkit`, none reference `Certificate` or
`verificationToken`, and none persist a `FileObject` themselves (they return buffers to their
callers). `EquipmentCalibrationRecord`'s "certificate PDFs" are manually uploaded evidence
files (unrelated domain, see headline finding).

**Future integration point, once a certificate PDF generator is built:** the correct place to
embed a QR (once one is generated) is inside that new generator, immediately before/after
whatever logo/header `doc.image()` calls it uses — already proven safe in this codebase with a
raw `Buffer` argument (`identity-correction-pdf.ts`'s `photo.buffer` usage; see Phase 2 audit
for prior confirmation of this pdfkit capability). No QR library (`qrcode` or similar) is
installed anywhere in the repo — one will need to be added when this is implemented, not
before.

## 8. Future Certificate API

Not implemented, and correctly out of scope here. Minimum shape for a future Phase 3B,
informed by this audit and the already-built Customer Portal foundation (Phases 1–2):

- **Lookup key:** `verificationToken` (once generated), via a new, dedicated
  `CertificatesModule`/`Service`/`Controller` in `apps/api` — none exists to extend, so this
  is new, not a reuse.
- **Authorization check:** authenticated session → `CustomerUserLink` (Phase 1) → set of
  authorized `customerId`s → compare against `Certificate.customerId` (direct field, §4) — no
  join through `CalibrationJob`/`Device` needed.
- **Minimum fields for Customer Portal:** certificate `number`, `status`, `issuedAt`,
  `validUntil`, device name/model, customer/company name — no internal IDs
  (`companyId`, `customerId`, `deviceId`, `calibrationJobId`, `pdfFileObjectId`), consistent
  with the data-minimization design already specified in the Phase 2 planning docs.
- **PDF retrieval:** the generic `FilesModule`/`FileObject` mechanism already exists and is
  proven (used by `EquipmentCalibrationRecord`'s manually-uploaded evidence files) — a future
  certificate PDF would attach via the existing `pdfFile`/`"CertificatePdf"` relation. It can
  be streamed server-side by resolving `pdfFileObjectId` internally without ever exposing that
  ID to the client, following the same design already specified for the Customer Portal.
- **Reusable authorization guards:** `CompanyRoleGuard`'s *shape* (session → join-table lookup
  → inject onto request) is the right pattern to mirror for a new customer-authorization
  resolver, same as already noted in the Phase 2 planning doc — but no certificate-specific
  guard exists yet to reuse directly.
- **New module required:** yes — confirmed, not assumed. There is nothing to extend.

## 9. Tests / Existing Coverage

**Zero.** Grepped `apps/api/src/**/*.test.ts` for Certificate/verificationToken/issuance/
reissuance/revoke/revocation/supersede — every match is either incidental (an unrelated string
like a test's override-reason text) or belongs to the unrelated `KontrolAlat.certificateNumber`
gate (`kontrol-alat.service.test.ts`, which tests QA-approval gating, not the `Certificate`
model). No test constructs, queries, or asserts on `Certificate`, `verificationToken`,
`supersedesCertificateId`, `revokeReason`, or `CertificateStatus` anywhere.

**Tests Phase 3 implementation will need** (none exist today): `Certificate` row creation
(DRAFT), status transition to `ISSUED` with token generation, uniqueness/no-collision
behavior, revoke/supersede transitions once designed, the future certificate-lookup
authorization resolver (authorized vs. cross-customer denial vs. not-found — mirroring the
pattern already established for `CustomerUserLink` in Phase 1's test suite), and — once a PDF
generator exists — a QR-embedding smoke test.

## 10. Risks / Open Questions

Only real, codebase-derived questions — nothing hypothetical:

1. **`calibrationJobId @unique` vs. supersession.** If at most one `Certificate` can exist per
   `CalibrationJob` (enforced by the schema's own unique constraint), it's unclear how a
   superseding `Certificate` (via `supersedesCertificateId`) would ever be created for the
   *same* job — creating a second row with the same `calibrationJobId` would violate the
   constraint. Not resolved anywhere in the schema, docs, or code found by this audit. Needs
   an explicit decision before reissuance is implemented (e.g.: does a correction require a
   new `CalibrationJob`, or does the unique constraint need to change, or does supersession
   only ever apply across different jobs?).
2. **Where does `Certificate.qualityReviewId` get set, and by what event?** The field and
   relation exist (`QualityReview?`), matching the pattern seen in `kontrol-alat.service.ts`'s
   `QualityReview.status === "APPROVED"` gate for the unrelated `certificateNumber` field —
   but since no code creates `Certificate` rows at all, it's unconfirmed whether the intended
   trigger for `Certificate` creation is the same `QualityReview` approval event, a separate
   staff action, or something else. This audit did not find code that answers it either way.
3. **`Certificate.number` allocation.** `DocumentNumberService` (confirmed sequential,
   predictable, used for other document types) is the established pattern for human-readable
   document numbers in this codebase, but no code currently calls it for `Certificate.number`.
   Whether `Certificate.number` should reuse `DocumentNumberService` (matching how `Customer`
   and other documents get their `number`) is an open implementation decision, not something
   this audit can confirm from existing code.

## 11. Implementation Readiness

**READY WITH PREREQUISITES.**

The schema is complete, reviewed, and requires no changes to support Phase 3B. The Customer
→ Certificate relationship is direct and unambiguous (§4). A strong, reusable token-generation
precedent exists (`packages/shared/src/chat-session-token.ts`'s HMAC/`timingSafeEqual`
approach, or a simpler `crypto.randomBytes(32).toString("base64url")` for a pure opaque
lookup key — either fits this codebase's existing preference for `node:crypto` over any
external library). No database backfill is needed (0 existing rows).

**Prerequisites before implementation, concretely:**
1. Resolve the `calibrationJobId @unique` vs. supersession tension (§10.1) — this affects
   whether the Certificate creation/reissuance design needs a schema change (which would be
   a Phase 3B decision, not something to make now).
2. Decide the actual `Certificate`-creation trigger (§10.2) — likely `QualityReview` approval,
   by analogy with `kontrol-alat.service.ts`'s existing gate, but not confirmed by any real
   code today.
3. Decide `Certificate.number` allocation (§10.3) — reuse `DocumentNumberService` or not.

None of these are blockers to *starting* Phase 3B design work — they're decisions the Phase
3B task should make explicitly (or explicitly defer with a stated default), not gaps that
prevent understanding the codebase. This audit found no genuine blocker, only the expected
absence of an implementation to inspect.
