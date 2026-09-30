Follow-up Audit: Certificate Numbering and Legacy / System-Generated Coexistence
Date: 2026-09-30
Scope: read-only audit. No code, schema, migration, UI, QR, PDF or numbering change.
Builds on: docs/audits/certificate-lifecycle-audit.md
Locked business rules taken as input:
1 CalibrationJob = 1 Certificate (calibrationJobId @unique stays).
Mode A: uploaded/external certificates keep their external number.
Mode B: future system-generated certificates use CRT/YYYY/MM/NNNNN.
QR identifies the record through an opaque verificationToken, and verification shows the real Certificate.number.
Labels used: FACT (verified in code), ARCHITECTURAL RECOMMENDATION, OPEN BUSINESS DECISION.
Tests, typecheck and build: not applicable, because no code changed.
Executive Summary
Can the current architecture support coexistence of external uploaded certificates and future system-generated ones?

Not as-is, but the gap is small and well-bounded. The numbering engine and the unique key are reusable. Three things are missing or unsafe:

Mode A does not exist in code. There is no way to store an external number. The upload endpoint takes only the file, and number is always allocated by Medcal as CER/YYYY/MM/NNNNN (certificate.service.ts:168-179). The brief assumes the number currently comes from the filename. There is no filename parser anywhere (FACT). Every existing row therefore carries a Medcal CER/… number, not an external one. The external number survives, if at all, only inside FileObject.originalName.
A namespace collision can break certificate creation for a whole company-year. If an external number equals a number the sequence is about to hand out, the insert violates @@unique([companyId, number]). The transaction rolls back, including the counter increment, so every retry produces the same colliding number. Nothing skips existing numbers (section 4). External numbers that merely start with the prefix can also make the bootstrap query throw.
The prefix is stored in the counter row, so changing CER to CRT in the prefix map does not take effect for existing counters (section 2.3). This is easy to miss and would silently keep issuing CER/….
Nothing else blocks coexistence:

The uniqueness key [companyId, number] is source-agnostic and should be kept.
Downstream code (LK PDF, UI, billing links, PO progress) treats number as an opaque string, so it works for either source.
calibrationJobId @unique is compatible with both modes.
Recommended shape (details in section 12):

Add an explicit source (UPLOADED / GENERATED).
Take the external number from user input at upload, never from the filename.
Reserve the CRT/ namespace for GENERATED, and reject it at upload.
Allocate the generated number at issue, not at draft.
Keep @@unique([companyId, number]).

1. Current State
   FACT: certificate rows today

Aspect Actual Evidence
Number source Always Medcal (DocumentNumberService, type CERTIFICATE, prefix CER) certificate.service.ts:168-179
Number input from user none. No body field, no parser calibration-jobs.controller.ts:923-938 takes only FileInterceptor("file")
Number timing first upload (ensureCertificate), not issue certificate.service.ts:153-186
Status always DRAFT no writer of status after create
Token / QR / issue none earlier audit
Source indicator none Certificate model, schema.prisma:3057-3105
Filename use display and download only FileObject.originalName (files.service.ts:122)
FACT: context that shapes the "legacy" definition

The trial reset script says certificates were created "through real UI usage during the trial" and deletes them (apps/api/scripts/trial-minto-hardjo/reset.ts:29-45).
No seed, import script or bulk-upload path creates certificates.
So the "406 external certificates" of RS Mintohardjo are not in the database yet. Phase 1 of the scenario is a future data-entry event, and the number-capture gap can be fixed before it happens.
OPEN BUSINESS DECISION: does any production database already hold uploaded certificates, and what do their CER/… numbers mean to users? If yes, they are "uploaded certificates carrying a Medcal placeholder number", which is a third class (see section 11).

2. Numbering Architecture
   2.1 Implementation
   FACT: packages/db/src/document-number/document-number.service.ts, DocumentNumberService.allocate({ companyId, documentType, issuedAt, tx }).

Resolve prefix from DOCUMENT_TYPE_PREFIX[documentType] (document-type-prefix.ts), a fixed map "not configurable per company". CERTIFICATE maps to CER.
year = issuedAt.getUTCFullYear().
readMaxExistingSequence (raw SQL) reads MAX(CAST(SPLIT_PART("number",'/',4) AS INTEGER)) from the type's table (document-type-table.ts: CERTIFICATE maps to "Certificate"), filtered by companyId and number LIKE '<prefix>/<year>/%'.
One atomic upsert on DocumentNumberSequence: INSERT (…, lastSequence = max+1) ON CONFLICT (companyId, documentType, year) DO UPDATE SET lastSequence = lastSequence + 1 RETURNING lastSequence, prefix.
formatDocumentNumber(prefix, issuedAt, sequence) returns PFX/YYYY/MM/NNNNN. The prefix must match ^[A-Z]{3}$, and the sequence must be 1..99999.
Model: DocumentNumberSequence (schema.prisma:515-529), @@unique([companyId, documentType, year]), with prefix Char(3) and lastSequence Int.

2.2 Transaction, locking, concurrency
FACT: the caller passes its own tx. The counter row is locked by the upsert until the transaction ends, so concurrent allocators for the same company, type and year serialise. Multiple app instances are safe because the lock is in Postgres.
FACT: the MAX scan is only used as the seed value when the counter row does not exist yet. MAX + 1 is not the allocation mechanism.
FACT: a rolled-back transaction rolls back the increment, so failed inserts leave no gap.
FACT: the service does not check whether the produced number already exists in the table. It trusts the counter.
FACT: callers: certificate.service.ts:170, calibration-jobs.service.ts:1807, purchase-orders.service.ts:265, work-orders.service.ts:299,709, delivery-notes.service.ts:97, quotations.service.ts:483, calibration-requests.service.ts:196, customers.service.ts:52. All are internal allocations with no external numbers in the same column, except Certificate under Mode A.
2.3 Can it produce CRT/2026/09/00001?
FACT: the format is already right: CRT matches ^[A-Z]{3}$, and YYYY/MM/NNNNN matches. The format needs no extension.

FACT, and a trap: on conflict the upsert updates only lastSequence and updatedAt, and RETURNING "prefix" returns the stored prefix. If the map is changed from CER to CRT, every existing (company, CERTIFICATE, year) counter row keeps returning CER. The change would take effect only for a year with no counter row yet (typically January).

ARCHITECTURAL RECOMMENDATION: do not reuse the CERTIFICATE document type for generated numbers. Use a separate document type value (for example one that maps to prefix CRT and to the Certificate table). Then:

the generated counter is independent of any legacy CER counter,
readMaxExistingSequence already scopes by prefix, so the two namespaces do not interfere,
there is no dependency on the stored-prefix behaviour.
This needs an enum addition (a future scoped task). The alternative, waiting for a new year and changing the map, is fragile and ties correctness to the calendar.

3. Numbering Scope
   FACT: the counter key is (companyId, documentType, year). The month is not part of the key: it is taken from issuedAt when formatting.

Dimension Actual
global no
per company yes (companyId, Char(3))
per document type yes
per year yes (UTC year)
per month no. MM is cosmetic, and the sequence continues across months (Sep 00001, Oct 00002)
Consequences:

CRT/2026/09/00001 is valid as the first number of the series in September. In October the next number would be CRT/2026/10/00002, not …/10/00001.
FACT: the number is built from the UTC calendar. Around midnight in Asia/Jakarta (UTC+7), the year and month in the string can differ from the local date.
FACT: the uniqueness key @@unique([companyId, number]) is also per company, so the two are consistent.
OPEN BUSINESS DECISION: does the sequence reset yearly (current), monthly (what YYYY/MM/NNNNN may imply to users), or never? Monthly reset requires the counter key to include the month. Timezone of the year/month (UTC vs Jakarta) also needs a rule.

4. Collision Analysis
   4.1 Uniqueness today
   FACT: @@unique([companyId, number]) (Certificate_companyId_number_key, init migration). It is source-agnostic. There is no source column and no CHECK constraint on the number format.

4.2 Scenario: an external number equals a future generated number
Existing uploaded (Mode A): CRT/2026/09/00001
Future generated (Mode B): allocator returns CRT/2026/09/00001
FACT and impact, in order:

tx.certificate.create fails with a unique-violation (P2002).
Postgres aborts the transaction, so the counter increment rolls back too.
The counter still points at the same value, so the next attempt allocates the same number and fails again. A poison pill for that company and year, until someone changes the data.
In today's ensureCertificate the catch block re-reads by calibrationJobId, finds nothing, and rethrows (certificate.service.ts:180-185), so the user sees a generic failure. (ensureCertificate itself is not the future issue path. The same pattern would apply.)
There is no skip-existing logic in DocumentNumberService, and no caller retries on P2002 for certificates.

4.3 Other ways external numbers can hurt the allocator
These affect only the seed step, which runs when the counter row for a year does not exist. They are still real:

FACT: CAST(SPLIT_PART("number",'/',4) AS INTEGER) throws for any matching row whose fourth segment is not an integer, for example CRT/2026/ABC. The LIKE filter and the cast are in one query, and Postgres does not guarantee the filter is evaluated before the cast.
FACT: a matching external number with more than five digits (CRT/2026/09/123456) seeds the sequence above 99999, and formatDocumentNumber then throws Invalid sequence.
FACT: LIKE '<prefix>/<year>/%' treats _ and % in the prefix as wildcards. The prefix is fixed and letters-only, so this is not exploitable here.
4.4 Options
Option Effect Assessment

1. Reserve the CRT/ namespace: reject at upload any external number that matches the generated pattern Removes the collision by construction, keeps [companyId, number] Simple, testable. Needs the pattern to be centralised (isValidDocumentNumber already exists)
2. Make the allocator skip existing numbers (loop: allocate, check existence, retry within the same transaction) Defends against anything that slipped through, including legacy rows Costs an extra lookup, and creates gaps when it skips. Necessary as a backstop, not as the primary control
3. Change the unique key to [companyId, source, number] Allows equal numbers from the two sources Not recommended: two certificates showing the same number to a customer or on a QR page is a business ambiguity, and downstream code assumes a single number per company
4. Remove the unique constraint rejected by the brief Not considered
   ARCHITECTURAL RECOMMENDATION: Option 1 as the primary control, plus Option 2 as a defensive backstop in the generated-number path. Keep @@unique([companyId, number]) unchanged.

5. Number Namespace Sufficiency
   Answers to the brief's questions, from the code:

Question Answer
Is CRT/YYYY/MM/NNNNN enough as a namespace? For the allocator, yes (fixed prefix, per company/type/year counter). It is not enough to protect it from external input, because nothing stops an uploaded number from matching the pattern
May an uploaded certificate coincidentally use CRT/? Today there is no validation at all, so yes. Recommendation: no, reject the whole generated pattern (and consider the whole CRT/ prefix) on upload
Does the generated number need a reserved namespace? Recommendation: yes. This is the cheapest way to make collisions impossible instead of merely handled
Should uniqueness stay [companyId, number]? Yes. Source-agnostic and matches what users and QR pages see
Can the service skip existing numbers? Not today. Recommendation: add a backstop (section 4.4)
May the sequence start at 00001 if a legacy certificate has that number? Only if the reserved namespace guarantees no legacy CRT/… rows exist. If any exist (uploaded before the rule), the seed reads the max and continues after it. If a legacy row is inserted after the counter exists, the counter will not notice, so the backstop is required
OPEN BUSINESS DECISION: the reserved namespace should be exactly the CRT/YYYY/MM/NNNNN shape, or the whole CRT/ prefix. The whole prefix is safer, but may reject a real external number that happens to start with CRT/.

6. Number Allocation Timing
   FACT (current): the number is allocated on first upload, in the same transaction as the row's creation (certificate.service.ts:168-179), while status is DRAFT.

Target: draft, quality review, issue, allocate the official system number (generated mode only).

Option A: allocate at DRAFT Option B: allocate at ISSUED
Sequence gaps Every abandoned or deleted draft burns a number None from drafts. Gaps only if an issue transaction rolls back after the increment, and a rolled-back transaction also rolls back the counter
Transaction behaviour Number allocation and row creation in one transaction (as today) Allocation, token generation, status change and issuedAt in one issue transaction
Retries A retry after a failed create is safe (rolls back) Same. Safe, provided the whole issue is one transaction
Abandoned drafts Consume official numbers. Explaining missing numbers to an auditor is hard No cost
Concurrent issuance Serialised by the counter lock Serialised by the counter lock. Lock held for the whole issue transaction, so keep it short (PDF generation should not run inside it)
Auditability Number exists before the certificate does, so "number issued" is not "certificate issued" Number means "issued". A clean audit event (CERTIFICATE_ISSUED)
Business semantics A number identifies a draft A number identifies a real certificate. Matches "official human-readable number"
ARCHITECTURAL RECOMMENDATION: Option B for generated certificates. Keep the PDF rendering outside the lock: issue first (number, token, status), then render the PDF from the persisted values.

FACT / gap: Certificate.number is NOT NULL. A draft with no number is impossible in the current schema. Two ways to satisfy Option B without weakening the column:

create the generated Certificate row only at issue (one transaction, number allocated and row inserted together). There is no meaningful "draft" content before issue because nothing is stored on a generated draft. No schema change;
or make number nullable and add a CHECK (status <> 'DRAFT' → number IS NOT NULL). This is a schema change and gives NULL-tolerant uniqueness (Postgres allows several NULLs).
For uploaded certificates the number must be present at creation (it is the external number, captured from the user), which fits the NOT NULL column as-is.

OPEN BUSINESS DECISION: must a generated certificate exist as a DRAFT before issue (for example for QA edits), or can it be created at issue? This decides which of the two shapes above is needed.

7. Legacy Number Semantics (downstream)
   FACT, from code (apps + packages): Certificate.number is read as an opaque string everywhere. Nothing parses its format or assumes it came from DocumentNumberService.

Consumer Location Assumes Medcal format? Impact of an external number
Portal certificate panel certificate-panel.tsx:189 (monospace text) no none
API detail DTO certificate.service.ts:118 no none
LK PDF "No. sertifikat" lk-download.service.ts:264,397-398, bed-side-monitor.ts:313 no. certificate.number ?? kontrolAlat.certificateNumber ?? "" long or unusual strings must fit the PDF layout (no length limit exists on number)
Audit log certificate.service.ts:233-247 metadata has calibrationJobId, fileObjectId, originalName no. number is not logged none, but the audit trail cannot show which number was attached
Invoice / billing InvoiceCertificate and CreditNote link by certificateId no none
PO progress po-progress.ts:305-320 counts by status no none
Search / filter / export / notification no certificate search, export or notification code exists not applicable none
QR / verification not implemented not applicable to be designed (section 9)
FACT: there is no length or character constraint on number (plain String), no normalisation and no format CHECK.

ARCHITECTURAL RECOMMENDATION: when Mode A is implemented, validate external numbers at the service layer: trim, non-empty, a maximum length, a permitted character set, and case-normalisation policy. Decide whether ABC-001 and abc-001 are the same number for uniqueness (the current unique index is case-sensitive).

Different, unrelated fields (FACT): KontrolAlat.certificateNumber (schema.prisma:1264) and EquipmentCalibrationRecord.certificateNumber (:2550) are free-text numbers of reference equipment certificates. They are a separate domain and must not be conflated with Certificate.number. The LK fallback to kontrolAlat.certificateNumber is the only place they meet.

8. Filename Dependency
   FACT: there is none for the certificate number.

Where What it does Depends on filename for the number?
Upload endpoint (calibration-jobs.controller.ts:923-938) file only no
CertificateService.uploadVersion duplicate detection by sha256 checksum, not by name no
FilesService.upload (files.service.ts:79,122) stores originalName (sliced to 255) no
file-validation.ts:32 MIME, extension, %PDF- sniff no
Storage key (storage-key.ts) {companyId}/{ownerType}/{ownerId}/{fileId}{ext} no
Download (calibration-jobs.controller.ts:958, use-certificate-query.ts:99) Content-Disposition from originalName display only
The brief's premise ("number is currently obtained from the filename") does not hold for the code. If users adopted a practice of naming files after the certificate, that knowledge lives outside the system and is retrievable only from FileObject.originalName.

ARCHITECTURAL RECOMMENDATION:

Uploaded: the external number is an explicit user input on the upload request. The filename may at most pre-fill the field in the UI as a suggestion, and the user confirms. The server never parses it.
Generated: the number always comes from the allocator. The filename is irrelevant and is generated by the system. 9. Certificate Source Modeling
FACT: the model cannot distinguish the two modes explicitly. Candidate signals:

Existing signal Reliability
pdfFileObjectId set poor. A generated certificate also has a PDF
verificationToken null poor. It is null for every row today, and a legacy row may later get a token
status poor. Both modes can be DRAFT or ISSUED
createdByUserId poor. Both are created by a user (or a system actor)
number pattern CER/… or CRT/… poor. External numbers can match it (section 4), and the CER/… rows are not external at all
AuditLog action CERTIFICATE_UPLOADED weak: exists only for uploads, is a separate table, needs a join, and records no number
FileObject ownerType = CERTIFICATE for both. No generated-vs-uploaded marker is used by the certificate code
9.1 Options
Option A: explicit source field Option B: infer from lifecycle and metadata
Reliability High. One authoritative value written at creation Low to medium. Depends on conventions that later features will break
Queryability Direct filter and index (WHERE source = 'GENERATED') Multi-column or join predicates
Auditability The record states its own provenance Provenance has to be reconstructed
Migration impact One new enum column with a default of UPLOADED. Existing rows need no data rewrite (the default is applied by the column definition) None
Future maintainability Enables DB-level invariants, for example source = 'GENERATED' → number matches the generated pattern and source = 'UPLOADED' → number does NOT match it (closes the collision hole at the DB layer) Every new rule has to re-derive the mode. Fragile, and brittle once uploaded certificates gain tokens or QR
ARCHITECTURAL RECOMMENDATION: Option A. The source value is what makes the reserved namespace enforceable, what makes PDF immutability rules mode-specific, and what makes the verification wording and legacy handling unambiguous. It is not "a field that looks nice": without it the CHECK constraints that protect uniqueness across modes cannot be written.

This is the only schema addition the recommended design needs (besides the optional enum value in section 2.3). It must be approved as a scoped task under the project rules. It is not part of this audit.

10. QR / Verification Compatibility
    FACT: no QR, no token generation, no verification endpoint exists (earlier audit, sections 5.1-5.3). verificationToken String? @unique exists and is opaque and mode-agnostic. The customer-portal route apps/customer-portal/src/app/(app)/certificate/[token]/page.tsx is a placeholder.

Principle from the brief, and how the code stands against it:

Principle Status
QR identifies the record through an opaque token column exists; generation and lookup missing
QR does not encode another number consistent with the column design
Verification shows the actual Certificate.number nothing to show yet. number is present on the row for both modes
No hidden "internal generated number" satisfied: there is a single number column, and no second number field exists
FACT: the same lookup works for both modes, token, then Certificate, then status. The mode only changes what the underlying PDF is, and what is displayed next to the number.

Gaps (unchanged from the earlier audit): token generation, status-aware resolution, enumeration resistance, and the public-versus-authenticated decision (docs/claude/plans/customer-portal/Task — Revise Customer Portal MVP Plan.md §6-7 decide authenticated, while docs/cursor/business-domain.md D12 says limited public).

Display expectations:

Uploaded: Certificate Number: CERT-ABC-2026-001 (external number, verbatim).
Generated: Certificate Number: CRT/2026/09/00001.
OPEN BUSINESS DECISION (new): for an uploaded external certificate, what is Medcal vouching for? The external issuer is the authority for the certificate's content. A verification page reading "valid" could be read as Medcal certifying a document it did not produce. Decide the wording (for example "recorded by Medcal, issued by <external issuer>") and whether uploaded certificates get a QR/token at all (the earlier audit's open decision 6).

OPEN BUSINESS DECISION: a QR cannot be printed onto an uploaded external PDF without rewriting it. Options are: no QR for uploaded, a QR on a separate label or portal view, or a Medcal cover sheet. Rewriting the external PDF is undesirable.

11. High-Volume Scenario (RS Mintohardjo, 406 jobs)
    Phase 1: 406 existing jobs, 406 uploaded external certificates
    Today: each upload allocates CER/2026/MM/000xx (406 sequence numbers consumed) and ignores any external number. External identity is lost. Fails the brief.
    After the recommended changes: each upload carries a user-entered external number, validated and unique per company, with source = UPLOADED. The sequence is not touched.
    FACT: there is no bulk path. The endpoint is one file per job (POST /calibration-jobs/:id/certificate/versions). Uploading 406 certificates is 406 requests. OPEN BUSINESS DECISION: whether a bulk/import flow is in scope.
    Duplicates of external numbers: two jobs sharing one external number (for example one multi-device certificate) violate the unique key. This is a business question (section 13, item 6).
    Phase 2: a new job gets a Medcal-generated certificate
    Allocates CRT/2026/09/00001 from the dedicated counter. No effect on the 406 rows, because they never touched the CRT counter. Works, provided the reserved namespace excludes CRT/ from uploads (or the backstop catches it).
    Phase 3: more generated certificates
    CRT/2026/09/00002, …/00003. The counter is atomic and serialised per company and year. Works.
    Constraint check
    Constraint Holds? Why
    No renumbering of existing certificates yes generated numbers use a separate namespace and counter
    No rewriting of existing PDFs yes QR/PDF generation applies only to GENERATED
    Unique constraint intact yes [companyId, number] unchanged; the namespace rule and the backstop prevent collisions
    QR verification intact yes token lookup is source-agnostic
    Billing intact yes InvoiceCertificate and CreditNote reference certificateId
    CalibrationJob relation intact yes 1:1 unchanged
    Caveat: rows created before the change carry CER/… numbers that are Medcal-allocated, not external. The brief's rule "never replace an external number with a Medcal number" is not violated (they were never external), but they also do not hold the external identity. See section 12.

12. Migration / Backward Compatibility
    FACT: existing rows have number = CER/YYYY/MM/NNNNN (Medcal), pdfFileObjectId = uploaded PDF, status = DRAFT, verificationToken, issuedAt, validUntil, qualityReviewId all null.

Field Compatible as-is Needs backfill Needs nullable handling Needs new field Leave alone
number yes for storage. Format-agnostic string yes, conceptually: legacy rows hold a Medcal placeholder, not the external number only if generated DRAFTs must exist without a number (section 6) no never rewrite automatically
source not present existing rows would default to UPLOADED via the column default no yes (recommended) not applicable
pdfFileObjectId yes no already nullable no yes
verificationToken yes (nullable, unique) only if legacy certificates are to get a QR (open decision) already nullable no yes
status yes possible: legacy uploaded rows are DRAFT yet already externally issued (open decision) no no until decided
issuedAt, validUntil yes for legacy rows the true dates are unknown. Do not invent them already nullable no yes
qualityReviewId, billingStatus yes no already nullable no yes
calibrationJobId @unique, @@unique([companyId, number]) yes no no no yes
DocumentNumberSequence rows yes no no no yes. Legacy CER counters simply stop being used
ARCHITECTURAL RECOMMENDATION:

Do not auto-derive external numbers from FileObject.originalName for existing rows. It is a heuristic over free text and the project rules forbid backfilling historical data unless a task requires it.
If the business wants the external numbers on existing rows, treat it as a controlled correction: an explicit, audited edit with the number entered by a user, subject to the same validation and the unique key. It should record who changed it and the previous value, since LK PDFs may already have been produced with the old number.
Existing CER/… rows keep their values until such a correction is made.
OPEN BUSINESS DECISION: is there any database with uploaded certificates whose CER/… numbers were communicated to customers or printed on LK PDFs? If so, a correction changes numbers people already saw.

13. Recommended Target Architecture
    Certificate
    |
    +---------------+---------------+
    | |
    source = UPLOADED source = GENERATED
    | |
    external PDF system-generated PDF
    (mutable attachment, (immutable after issue)
    versioned) |
    | number from the dedicated
    external number DocumentNumberService counter
    (user input, validated, CRT/YYYY/MM/NNNNN
    unique per company, allocated AT ISSUE
    outside the CRT/ namespace) |
    | |
    +---------------+---------------+
    |
    one Certificate record
    (1 CalibrationJob = 1 Certificate)
    |
    verificationToken (opaque, set once)
    |
    v
    QR / verification
    (shows the actual Certificate.number)
    What stays the same

One number column, one verificationToken column, one [companyId, number] unique key, one 1:1 job link, one status enum, one billing link.
The allocator's atomic counter mechanism and format.
Downstream consumers (LK PDF, panel, billing, PO progress), which treat number as opaque.
What differs by mode

UPLOADED GENERATED
Number origin user input (external) allocator
Allocation timing at upload (the input is required) at issue
Namespace must not match CRT/ reserved CRT/YYYY/MM/NNNNN
PDF external, replaceable versions system-rendered, immutable
QR open decision embedded in the PDF
Source of truth per field

source: the record itself (set once at creation).
number: user input for UPLOADED, allocator for GENERATED. Never the filename.
verificationToken: generated once at issue (or at upload if legacy QR is decided).
PDF: pdfFileObjectId version for UPLOADED, the rendered file for GENERATED.
How uniqueness is kept

@@unique([companyId, number]) unchanged.
Reserved namespace rejected at upload (primary control).
Skip-existing / retry in the generated path (backstop).
A DB CHECK tying source to the number pattern (needs the source column).
A dedicated document type for the CRT counter, so the stored-prefix behaviour (section 2.3) cannot re-issue CER.
How legacy certificates stay safe

No renumbering, no PDF rewrite, no automatic backfill.
The source default is UPLOADED.
External numbers are corrected only by explicit, audited user edit. 14. Findings Register

# Finding Evidence Impact Recommendation

1 Mode A is not implemented: the upload API has no number input and always allocates CER/… calibration-jobs.controller.ts:923-938, certificate.service.ts:168-179 External identity cannot be stored. The 406-certificate Phase 1 would consume the sequence and lose external numbers Add an explicit, validated external-number input for UPLOADED. Remove allocator use for UPLOADED
2 No filename parser exists, contrary to the brief grep over apps/ and packages/ (section 8) Nothing to unwind. Design can start clean Keep filename out of the number entirely (UI pre-fill only)
3 A colliding external number makes every later allocation fail (rollback repeats the same value) document-number.service.ts (no existence check), @@unique([companyId, number]) Certificate creation blocked for the company and year Reserved namespace at upload, plus a skip-existing backstop
4 External numbers can break the seed query (CAST error, more than five digits) readMaxExistingSequence, formatDocumentNumber (max 99999) Allocation throws when a year's counter is first created Namespace rule at upload. Make the seed defensive (numeric-only match)
5 The stored prefix wins over the prefix map upsert RETURNING "prefix" with DO UPDATE changing only lastSequence Changing CER to CRT in the map silently keeps issuing CER/… for existing company-year counters Dedicated document type for the generated counter
6 Counter is per company, type and year. The month is cosmetic and uses UTC DocumentNumberSequence, formatDocumentNumber Sequence does not reset monthly. Year and month can be off by one around the Jakarta midnight Business decision on reset and timezone
7 number is NOT NULL, which blocks numberless generated drafts schema.prisma:3057-3105 Option B allocation needs either row-at-issue or a nullable column plus CHECK Create the generated row at issue, or make it nullable with a CHECK. Decide with the DRAFT question
8 No explicit source indicator, and no reliable inferred one section 9 The reserved-namespace rule cannot be enforced at DB level. Behaviour by mode cannot be derived Explicit source enum, default UPLOADED
9 No format, length or case rule on number schema.prisma (plain String) External numbers of any shape or length reach the LK PDF Service-level validation for external numbers
10 Audit log records no number certificate.service.ts:240-244 Cannot reconstruct which number was attached Add the number to the audit metadata when Mode A is built
11 Existing rows carry Medcal CER/… numbers, not external ones ensureCertificate history No external identity to preserve, but numbers may already be visible on LK PDFs Controlled, audited correction only if the business wants it
12 Uploaded certificates still cannot be issued, and no QR or verification exists earlier audit Legacy QR and "what does verification mean for an external PDF" are undecided Decisions in section 15
13 No bulk upload path one file per job endpoint 406 uploads require 406 requests Business decision on a bulk or import flow 15. Open Business Decisions
OPEN BUSINESS DECISION items only:

Reserved namespace scope: reject only the exact CRT/YYYY/MM/NNNNN shape, or the whole CRT/ prefix, in uploaded numbers.
Sequence reset: yearly (current), monthly, or never. And the timezone (UTC or Asia/Jakarta) for the year and month in the number.
Generated DRAFT: must a generated certificate exist as a draft before issue, or is it created at issue? (decides nullable number vs row-at-issue)
Status of uploaded certificates: should an uploaded external certificate be recorded as ISSUED at upload (it is already issued externally), or stay DRAFT until some Medcal step? This directly affects PO completion, which needs ISSUED.
Verification wording and QR for uploaded certificates: what Medcal asserts about an external document, whether a token/QR is created for it, and where a QR would appear given the external PDF must not be rewritten.
Duplicate external numbers: may two jobs in one company share an external number (for example one certificate covering several devices), or is a duplicate always an error? Is the comparison case-sensitive?
Existing CER/… rows: do any production databases hold them, were the numbers shared with customers or printed, and should they be corrected to external numbers?
Bulk import: is a bulk or import flow for the 406 external certificates in scope?
Whole-prefix change: confirm CRT replaces CER as the generated prefix (earlier audit, open decision 1), and confirm CER is retired for the certificate type.
Final answer
Coexistence is achievable without touching calibrationJobId @unique, @@unique([companyId, number]), existing PDFs, billing or the QR column design.

It is not achievable with the code as it stands, because Mode A is missing (the external number is never captured), the numbering engine cannot survive a colliding or malformed external number, and the stored counter prefix means a prefix-map change alone will not produce CRT/….

The minimum design decisions to unblock implementation are: a reserved namespace, an explicit source indicator, allocation at issue for generated certificates, and a dedicated counter for CRT.

Out of Scope / Not Implemented
This report changed no code, schema, migration, service, UI, QR, PDF or numbering behaviour and proposes no automatic backfill. All recommendations are inputs for later, separately scoped tasks.
