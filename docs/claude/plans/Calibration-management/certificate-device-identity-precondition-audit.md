# AUDIT — Certificate Upload Precondition on Device Identity Resolution

**Status:** AUDIT ONLY. No source code, schema, or migration was modified. No file was written
by the "test with a real PDF" activity — this document is the entire output of that
investigation.

---

## Summary verdict (read this first)

The `CERTIFICATE_DEVICE_NOT_RESOLVED` guard is an **implementation artifact of
`Certificate.deviceId` being a required (`NOT NULL`) column**, not a genuine business rule.
Stronger: the codebase already contains an explicit, cited business decision
(**"MoM #6"**, referenced twice, verbatim, in unrelated code — see §3) stating that
`CalibrationJob.deviceId` is *"a locked/legacy FK that no active workflow sets."* The real,
current identity-resolution mechanism for a physical unit is the Identity Correction BA, which
writes `technicianObservedBrand/Model/Serial` directly onto `CalibrationJob` — **never**
`CalibrationJob.deviceId`. Blocking Certificate upload on `deviceId` therefore blocks it on a
field that, per the business's own already-documented decision, routinely never gets set at all
during the normal lifecycle of a job.

Certificate upload should be independent of Device Identity resolution, for the same reason it
is independent of QA: the physical certificate exists as a fact in the world regardless of
whether MedCal's `Device` master-record linkage has caught up yet.

---

## 1. Root cause of the current blocking behavior

`CertificateService.ensureCertificate()` refuses to create a `Certificate` row — and therefore
refuses the very first upload for a job — unless `CalibrationJob.deviceId` is non-null:

```ts
// apps/api/src/modules/calibration-jobs/certificate.service.ts:152-164
private async ensureCertificate(companyId: string, calibrationJobId: string, userId: string) {
  const job = await this.requireJob(companyId, calibrationJobId);
  const existing = await prisma.certificate.findUnique({ where: { calibrationJobId } });
  if (existing) return existing;

  if (!job.deviceId) {
    throw new ConflictException({
      code: "CERTIFICATE_DEVICE_NOT_RESOLVED",
      message:
        "Cannot attach a certificate before this job's device identity is resolved (deviceId is not set)",
    });
  }
  const deviceId = job.deviceId;
  const customerId = job.workOrder.customerId;
  ...
}
```

This is called from `uploadVersion()` on every upload (`ensureCertificate` is "create-if-absent",
so it runs even on the very first attempt) — there is no separate "create certificate" step a
user can skip; upload IS certificate creation the first time.

## 2. Exact code path causing the block

```
CertificatePanel (portal UI)
  → useUploadCertificate() → POST /calibration-jobs/:id/certificate/versions
  → calibration-jobs.controller.ts: uploadCertificateVersion()
  → CertificateService.uploadVersion()
  → CertificateService.ensureCertificate()   ← throws CERTIFICATE_DEVICE_NOT_RESOLVED here
```

The UI message you saw — *"Identitas device pada job ini belum ditentukan — sertifikat belum
dapat dilampirkan."* — is `certificate-panel.tsx`'s mapping of exactly this code:

```ts
// apps/portal/src/app/management/calibration-jobs/certificate-panel.tsx:20-22
if (code === "CERTIFICATE_DEVICE_NOT_RESOLVED")
  return "Identitas device pada job ini belum ditentukan — sertifikat belum dapat dilampirkan.";
```

## 3. Why the current implementation requires `deviceId`

Purely a schema constraint, stated as such in the code's own comment:

```ts
// certificate.service.ts:144-151
/**
 * Create-if-absent. Certificate.customerId/deviceId are NOT NULL in the
 * existing schema, so a certificate cannot be created before the job's
 * device identity is resolved (deviceId is not set) — a purely technical
 * precondition, unrelated to QA. ...
 */
```

The Prisma model backs this up exactly:

```prisma
// packages/db/prisma/schema.prisma:2969-2993
model Certificate {
  ...
  customerId  String
  deviceId    String
  ...
  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  device   Device   @relation(fields: [deviceId], references: [id])
  ...
}
```

Both `customerId` and `deviceId` are non-nullable scalar FKs. Prisma cannot `create()` a row
without providing a value for a `NOT NULL` column, so `ensureCertificate` must have *something*
to put there.

**`customerId` is never actually the blocker in practice** — it is resolved from
`job.workOrder.customerId`, which is set at `WorkOrder` creation, long before any device identity
work happens:

```ts
// certificate.service.ts:165-166
const deviceId = job.deviceId;
const customerId = job.workOrder.customerId;
```

Only `deviceId` is ever genuinely absent at the time of upload.

**Why `job.deviceId` is often genuinely absent — this is the real finding.** Grepping this same
module's own domain logic shows `CalibrationJob.deviceId` is explicitly documented as
effectively dead for the current workflow:

```ts
// packages/shared/src/utils/calibration-job-action-signals.ts:54-59
/**
 * Pure factual predicate: observed Serial missing after start. Device ID is
 * intentionally excluded — it is a locked/legacy FK that no active workflow
 * sets (MoM #6); checking it here would make this permanently true. AKD/AKL
 * is also excluded — separate gate. ...
 */
export function isIdentityIncomplete(job: { ... }): boolean { ... }
```

and again, independently, in the Identity Correction approval path itself:

```ts
// calibration-jobs.service.ts:1715-1722 (decideIdentityCorrection, APPROVE branch)
// ... the WO/SPK is locked (MoM #6). A BA only corrects observed identity.
const jobData: Prisma.CalibrationJobUncheckedUpdateInput = {};
if (correction.newBrand !== null) jobData.technicianObservedBrand = correction.newBrand;
if (correction.newModel !== null) jobData.technicianObservedModel = correction.newModel;
if (correction.newSerial !== null) jobData.technicianObservedSerial = correction.newSerial;
if (correction.newAkdAkl !== null) jobData.technicianObservedAkdAkl = correction.newAkdAkl;
```

Approving an Identity Correction — the actual, real mechanism by which a technician confirms a
physical unit's identity — **never touches `CalibrationJob.deviceId`**. The only code path that
sets it at all is the manual `selectDevice()` action:

```ts
// calibration-jobs.service.ts:1357-1372
async selectDevice(companyId: string, jobId: string, deviceId: string): Promise<...> {
  const job = await this.findOne(companyId, jobId);
  this.assertIdentityGateOpen(job.status);
  if (job.deviceId !== null) {
    throw new ConflictException({ ..., code: "CALIBRATION_JOB_DEVICE_ALREADY_SET" });
  }
  const device = await prisma.device.findFirst({ where: { id: deviceId, companyId }, ... });
  ...
}
```

— which requires a pre-existing `Device` master row already linked to the same customer, and is
a distinct, optional staff action, not something the standard technician-observed-identity flow
invokes. A test in the existing suite independently confirms a job can be fully started, in
progress, and flagged for identity attention with `deviceId` still null:

```ts
// calibration-jobs.service.test.ts:2372-2387
it("sets identityIncomplete after start when Serial is missing", async () => {
  ...
  expect(row.deviceId).toBeNull();
  expect(row.technicianObservedSerial).toBeNull();
  expect(row.actionSignals.identityIncomplete).toBe(true);
});
```

**Conclusion for §3:** `deviceId` is required by `Certificate` purely because of a `NOT NULL`
column, and that column is populated, in the real business flow, by a mechanism
(`selectDevice`) that is largely orthogonal to — and, per the codebase's own "MoM #6" comments,
functionally superseded by — the actual identity-confirmation mechanism (Identity Correction BA
+ `technicianObserved*` fields). This is exactly the situation your business context describes:
Device ID may never be resolved, or may be resolved much later, or never at all for a given job.

## 4. Should Certificate Upload be independent of Device Identity resolution?

**Yes**, for reasons directly analogous to why it's already independent of QA:

- The physical certificate is an external fact (already printed, already exists) that does not
  wait for MedCal's internal `Device` master-record linkage.
- The codebase's own domain logic (§3) already treats `deviceId` as not authoritative for
  "is this job's identity resolved" — `isIdentityIncomplete` deliberately excludes it, using
  `technicianObservedSerial` instead. Gating Certificate creation on `deviceId` uses a *weaker,
  less current* identity signal than the one the rest of the domain already prefers.
- There is no code anywhere (checked: zero other consumers of `certificate.deviceId`/
  `certificate.device` in `apps/api` or `apps/portal`) that currently depends on
  `Certificate.deviceId` being populated at upload time. The blast radius of relaxing this is
  effectively zero today.

This does not mean `deviceId` is meaningless — once a `Device` master record *is* linked
(via `selectDevice`), it's presumably useful for later reporting/traceability. It means it should
not be a **precondition for creating the Certificate row / attaching the first file**.

## 5. Is a schema change actually required?

**Yes, if the goal is "Certificate can be created (a real Certificate row, satisfying its own
`NOT NULL` constraint) before `job.deviceId` is set."** Prisma cannot insert a row with `null`
into a non-nullable scalar column — there is no way to defer this within `CertificateService`
without either:
(a) making `Certificate.deviceId` nullable (`String?`, relation becomes `Device?`), or
(b) not creating a real `Certificate` row yet at all (see §6, Option 2).

Given the design principles you set (no second Certificate/File model, no temporary certificate
entity, reuse `Certificate` + `FileObject` + `CalibrationJob`), **Option (a) — a small, additive,
nullable-column migration — is the schema-compatible way to satisfy "Certificate can exist before
device identity is resolved" without inventing anything new.**

## 6. Smallest safe implementation approach (for your decision — not implemented here)

Two candidates were evaluated; only one is genuinely "smallest":

### Option A — make `Certificate.deviceId` nullable (recommended candidate)

```prisma
model Certificate {
  ...
  deviceId String?
  ...
  device Device? @relation(fields: [deviceId], references: [id])
  ...
}
```

- `ensureCertificate()` changes from throwing `CERTIFICATE_DEVICE_NOT_RESOLVED` to simply passing
  `deviceId: job.deviceId` (already `string | null`) straight into `create()`.
- The `Certificate` row is created on first upload regardless of device resolution; `deviceId`
  starts `null` and can be filled in later **if and only if** some future code actually sets
  `CalibrationJob.deviceId` (today, per §3, nothing reliably does — so in practice this may often
  stay `null` for the certificate's lifetime, which is fine: nothing reads it today).
- One additive migration (`ALTER COLUMN "deviceId" DROP NOT NULL`, drop-and-recreate the FK as
  optional). Not a destructive change; existing rows (today: zero `Certificate` rows with a
  non-null `deviceId` that would need backfill — confirmed no data migration required).
- Preserves the existing 1:1 `Certificate ↔ CalibrationJob` relationship exactly as-is. No new
  owner type, no re-parenting, no second file/certificate concept. This is the interpretation of
  your design principle "reuse the existing Certificate + FileObject + CalibrationJob
  architecture" that requires the fewest moving parts.

### Option B — defer Certificate row creation, anchor the file to CalibrationJob first (rejected)

This is what your question G invites exploring ("Can the existing CalibrationJob relation be
used as the primary ownership anchor until Device Identity is resolved?"). Evaluated and
**rejected as not actually smaller**:

- Would require registering a *new* `FileOwnerPolicy` for `ownerType: "CALIBRATION_JOB"` (or
  reusing an unrelated existing one, e.g. `JOB_EVIDENCE`, which has different semantics), so the
  first upload's `FileObject.ownerId` is the job, not a certificate.
- Later, once `deviceId` resolves, the file would need to be **re-parented**
  (`FileObject.ownerType`/`ownerId` rewritten from `CALIBRATION_JOB`/jobId to
  `CERTIFICATE`/certificateId) at the moment `ensureCertificate` finally succeeds — an extra,
  bespoke migration-like step with its own failure modes (what if the rewrite fails after the
  Certificate row is created? now you have an orphaned FileObject under the old owner type).
  This is effectively a second, temporary "file ownership regime" for the same conceptual
  document, and I read your explicit "do not introduce a second Certificate/File model" principle
  as ruling this out in spirit even though it's not, literally, a second Prisma model.
- Given §3's finding that `deviceId` may functionally *never* resolve for many jobs under the
  current workflow, "defer until resolved" could mean "defer forever" for a large fraction of
  certificates — i.e., in practice this option doesn't actually unblock the reported real-world
  case (uploading `S.638.pdf` against a job whose identity was confirmed via BA, not
  `selectDevice`) any better than Option A, while adding materially more code and more failure
  modes.

**Recommendation: Option A.** It is strictly smaller, requires no new concepts, and directly
matches the "reuse existing architecture" instruction.

## 7. Impact on existing Certificate versioning / FileObject architecture

**None.** Versioning is keyed entirely off `Certificate.id` as `FileObject.ownerId`
(`ownerType: "CERTIFICATE"`); nothing in `uploadVersion`, `downloadVersion`, `deleteVersion`, or
the version-history query (`toDetail`) reads or depends on `deviceId`. Making the column nullable
only changes what `ensureCertificate` is allowed to write on `create()`; every downstream method
is unaffected.

## 8. Impact on RBAC

**None.** The `deviceId` guard sits entirely *before* any permission check —
`ensureCertificate()` runs first, then `FilesService.upload()` performs the
`hasPermission(role, "certificate", "update")` check via the registered `FileOwnerPolicy`. RBAC
grants (`TECHNICIAN_MANAGER`/`SUPERVISOR`/`ADMIN`/`SUPERADMIN`/`GENERAL_MANAGER` for
upload/replace, `SUPERADMIN`-only for delete) are untouched by this change either way.

## 9. Impact on audit logging

**None structurally.** `recordAuditLog` is called after a successful upload with
`metadata: { calibrationJobId, fileObjectId, originalName }`. If desired, `deviceId` (or its
absence) could be added to that metadata for traceability, but this is optional polish, not a
requirement of the fix, and not decided here.

## 10. Tests that would need to change / be added

**The exact test asserting the current guard:**

```ts
// certificate.service.test.ts:217-224
it("refuses to create a certificate before the job's device identity is resolved", async () => {
  const { jobId } = await makeJob({ withDevice: false });
  const mt = await makeMember("TECHNICIAN_MANAGER");
  await expect(
    service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("cert.pdf"), ctx),
  ).rejects.toMatchObject({ response: { code: "CERTIFICATE_DEVICE_NOT_RESOLVED" } });
  expect(await service.getForJob(companyId, jobId)).toBeNull();
});
```

**Is this test a still-valid business rule, or an outdated implementation assumption?**
**Outdated implementation assumption.** It asserts the *symptom* of the `NOT NULL` schema
constraint, not a deliberate business rule — nothing in any audit or planning document (including
the ones supplied for this feature) states "device identity must be resolved before certificate
upload"; it emerged only because `ensureCertificate` needed a non-null `deviceId` to satisfy
Prisma. §3 additionally shows the business has already, elsewhere, explicitly rejected `deviceId`
as an identity-completeness signal (MoM #6). This test encodes an accidental constraint, not an
intentional one.

**If Option A is implemented, this test would need to become the opposite assertion** — e.g.
"uploads a certificate successfully while the job's device identity is unresolved (deviceId
null), and the created Certificate has `deviceId: null`" — plus a new/adjusted assertion that
`makeJob({ withDevice: false })` no longer needs `withDevice: true` as a precondition for any
certificate test that isn't specifically testing device-linkage behavior. Every other existing
certificate test already uses `withDevice: true` and would keep passing unchanged (they're
testing unrelated behavior — replace, delete, RBAC, isolation — not device resolution), so this
is a small, localized test change, not a suite-wide rewrite.

No new test framework, RBAC test, or audit-log test would be needed — the change is confined to
one precondition inside `ensureCertificate` and its one covering test.

---

## Answers to the lettered audit questions

**A. Is Device Identity genuinely required by the Certificate business process, or is this only
an implementation artifact caused by `Certificate.deviceId` being required?**
Implementation artifact. See §3 — confirmed by the schema comment itself and by the "MoM #6"
business decision already recorded elsewhere in this codebase.

**B. Can Certificate be safely created before Device Identity is resolved?**
Yes, once `Certificate.deviceId` is nullable (Option A). Nothing else in the current
architecture depends on it being set at creation time (§7, §8, §9).

**C. If yes, what is the smallest architecture-compatible solution?**
Option A (§6): make `Certificate.deviceId` optional; `ensureCertificate` passes `job.deviceId`
(possibly `null`) straight through.

**D. Would making `Certificate.deviceId` nullable be required?**
Yes — this is the schema change identified in §5/§6 Option A.

**E. If `Certificate.deviceId` remains required, is there an existing safe way to defer
Certificate creation while still storing the uploaded FileObject against the Calibration Job?**
Technically possible (Option B, §6) but rejected as materially more complex than Option A, with
extra failure modes (file re-parenting) and no guarantee `deviceId` ever resolves under the
current workflow (§3) — so it doesn't actually avoid facing the same question later.

**F. Would introducing a temporary/orphan certificate record be architecturally wrong?**
Yes, agreed with your framing — not evaluated further as a candidate; excluded by your stated
design principle and not needed given Option A exists.

**G. Can the existing CalibrationJob relation be used as the primary ownership anchor until
Device Identity is resolved?**
Evaluated as Option B; technically feasible but rejected — see §6 for the specific reasons
(re-parenting complexity, and `deviceId` may never resolve under the current workflow, making
"anchor until resolved" often equivalent to "anchor forever," which just relocates the same
problem rather than solving it more simply than Option A).

**H. What happens to the certificate after Identity Correction later resolves the device?**
Under Option A: nothing automatic, because Identity Correction approval does not write
`CalibrationJob.deviceId` (§3) — it writes `technicianObserved*` fields. `Certificate.deviceId`
would only ever be populated if `selectDevice()` is separately called for that job. This is
consistent with current behavior everywhere else in the domain (device identity display already
relies on `technicianObserved*`, not `deviceId`, per `isIdentityIncomplete`) — not a gap
introduced by this fix.

**I. Does the current Certificate model already have enough information to support this without
schema change?**
No — `deviceId String` is a Prisma-enforced `NOT NULL` scalar; there is no way to `create()` a
`Certificate` row while leaving it unset without either changing the schema (Option A) or not
creating a real `Certificate` row yet (Option B, rejected). Nothing in the current model
structure allows a "device identity pending" state to be represented on `Certificate` itself.

---

## Final output checklist (as requested)

1. **Root cause:** `Certificate.deviceId` is a `NOT NULL` Prisma column; `ensureCertificate()`
   refuses to create the row (blocking the first upload) when `CalibrationJob.deviceId` is null.
2. **Exact code path:** `certificate-panel.tsx` → `POST :id/certificate/versions` →
   `calibration-jobs.controller.ts:uploadCertificateVersion` →
   `CertificateService.uploadVersion` → `CertificateService.ensureCertificate` (throws here).
3. **Why `deviceId` is required today:** purely the schema's `NOT NULL` constraint — not a
   deliberate business rule; the actual identity-resolution mechanism
   (Identity Correction / `technicianObserved*`) never touches this field (§3, "MoM #6").
4. **Should Certificate Upload be independent of Device Identity?** Yes (§4).
5. **Is schema change required?** Yes, to make `Certificate.deviceId` nullable (§5/§6 Option A);
   this is the smallest, architecture-preserving path.
6. **Smallest safe implementation approach:** Option A — nullable `Certificate.deviceId`,
   `ensureCertificate` passes `job.deviceId` through as-is (§6).
7. **Impact on versioning/FileObject architecture:** none (§7).
8. **Impact on RBAC:** none (§8).
9. **Impact on audit logging:** none required; optional metadata enrichment only (§9).
10. **Tests to change/add:** flip the one existing "refuses before device resolved" test into a
    "succeeds with `deviceId: null`" test (§10); no other test changes needed.

**No file was modified, no schema was changed, no migration was created to produce this
report.** Implementation, if you choose Option A, is a separate task.
