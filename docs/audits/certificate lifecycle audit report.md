- issuedAt, validUntil, qualityReviewId, billingStatus = BILLABLE
- AuditLog CERTIFICATE_ISSUED
  |
  v
  PDF generation (pdfkit template; number, dates, QR) -> immutable FileObject
  |
  v
  QR generation (URL carrying verificationToken)
  |
  v
  Verification (token -> Certificate -> current status; minimal DTO;
  valid / expired / revoked / superseded; same response for not-found)
  |
  +-- REVOKE (issued -> revoked, revokeReason required, audited, terminal)
  +-- SUPERSEDE (issued -> superseded; replacement pointer; depends on decision 5)

```

Principles that follow from the evidence:

- Reuse `DocumentNumberService` (already atomic, transactional, used by 8 modules). Do not introduce `MAX + 1`.
- Put the state machine in the service layer, backed by DB CHECK constraints for the status-to-field invariants (cases C, D, F).
- Make the owner policy return `locked` for issued or revoked certificates.
- Keep the token a locator. Authorization stays with the session and `CustomerUserLink`, unless decision 7 says otherwise.

---

## Final Question

> Does the current Certificate architecture have the right foundation to move from "user uploads an external certificate" to "Medcal generates and issues a Certificate with a human-readable number and QR verification", or is there an architectural blocker to fix first?

**Answer: the foundation is partly right, but there are architectural blockers that must be decided or fixed first. None of them requires a rewrite.**

**What is already right (evidence):**

- The numbering is already system-generated, with an atomic, transaction-scoped sequence (`document-number.service.ts`) that is safe under concurrent writers, and `CERTIFICATE` is registered. It is proven by 8 other modules.
- `@@unique([companyId, number])` gives a uniqueness backstop.
- `verificationToken String? @unique` is the right shape for an opaque locator.
- The `CertificateStatus` enum already has the four states needed, with billing and QA linkage fields present.
- File versioning, checksum duplicate detection, RBAC (including `certificate:issue`) and audit logging exist.
- `pdfkit` is installed and used for eight other documents.

**Blockers (evidence):**

1. **No issue transition or state machine.** Nothing sets `ISSUED`, so the Certificate is `DRAFT` forever and no PO can complete.
2. **`calibrationJobId @unique` contradicts revision-as-new-row.** `supersedesCertificateId` cannot be used until either the constraint or the model changes.
3. **Number allocation happens at upload, not at issue.** This is fine for a file-attachment model but wrong for an issued, gap-sensitive certificate number. It needs a business decision.
4. **No token generation, no verification surface, and a docs conflict over public versus authenticated access.**
5. **No certificate template, no QR library, and no immutability** (`locked: false`). The uploaded and generated flows cannot be distinguished.

The first three are architectural decisions that gate the schema and service design. Items 4 and 5 are missing capabilities that build on top of them. Nothing in the existing architecture needs to be replaced, but the issue transition, the cardinality decision and the numbering-timing decision must be settled first.

---

## Out of Scope / Not Implemented

This report makes no code, schema, migration or data changes and proposes no backfill. Everything marked "recommendation" is input for a later scoped task.
```
