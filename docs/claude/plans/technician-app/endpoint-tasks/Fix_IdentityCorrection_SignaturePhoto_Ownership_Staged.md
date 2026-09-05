# IMPLEMENT (STAGED) — Fix Identity Correction Signature Photo Ownership (Per-BA, Not Per-Signer)

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task corrects how the signature photo is owned/uploaded for
`IdentityCorrection` — backend (file-owner-policy + decide guard) and Portal UI. Do NOT touch
the tech-pwa job list/detail/escalate work from the prior task. Do NOT build the tech-pwa
Identity Correction wizard in this task (still the next task, now with the corrected model in
hand). Do NOT modify the schema — confirm in Stage 1 that no migration is needed (per the
reasoning below), and if you find otherwise, flag it as its own checkpoint rather than
proceeding.

## Background — the correction (business fact, confirmed by user)

Both signatures (TECHNICIAN and CUSTOMER) are physically on **one sheet of paper** (the BA
document itself). In practice a technician photographs the whole signed sheet **once** — there
is no scenario with two separate photos, one per signer. The system was built on the wrong
assumption: `IdentityCorrectionSignature` was treated as the file owner, implying one photo per
signer (two uploads). This is wrong and must be corrected before the tech-pwa submit wizard is
built on top of it (Portal already has this wrong and needs a fix too — this is a regression
fix, not new scope creep).

**Corrected model:**
- `IdentityCorrection` (the BA record itself) owns the single photo of the signed sheet.
- `IdentityCorrectionSignature` rows remain two per correction (TECHNICIAN, CUSTOMER) — they
  still separately record `status` (SIGNED/UNAVAILABLE/REFUSED), `signerName`,
  `unavailableReason`. What changes is only which record the photo evidence is attached to.
- **No schema migration expected**: `IdentityCorrectionSignature.fileObjectId` was already
  decided to be unused (S0-link Option B from the prior task) — files are resolved via the
  polymorphic `FileObject.ownerType`/`ownerId` lookup, not a stored column. The fix is which
  `ownerId` gets used (`identityCorrection.id` instead of `signature.id`), which is a
  service/policy-layer change, not a schema change. Confirm this in Stage 1 before proceeding
  — if the investigation finds a schema change is actually needed, stop and flag it rather than
  silently expanding scope.

## Stage 1 — Investigate current implementation, propose the fix (no code yet)

1. Re-read `identity-correction-file-owner-policy.ts` live: confirm `resolveOwner` currently
   resolves against a `IdentityCorrectionSignature` id, and exactly what `ownerType` value is
   used. Propose the corrected version: `resolveOwner` should resolve against the parent
   `IdentityCorrection` id (company-scoped), with `locked` still true once the correction is
   `APPROVED`/`REJECTED`. Consider whether `ownerType` itself should change name/meaning or
   just what `ownerId` refers to — propose keeping `IDENTITY_CORRECTION` as the type (it
   already says "identity correction," which is accurate either way) and just changing what the
   id points to; state if you disagree.
2. Re-read the `decideIdentityCorrection` guard (the `IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING`
   check). Propose the corrected guard logic: instead of checking each SIGNED signer
   individually for its own photo, check ONCE whether the correction has at least one SIGNED
   signer (TECHNICIAN or CUSTOMER, i.e. at least one signature was actually captured) AND the
   correction itself has a linked photo. Propose the exact new condition and confirm the error
   code/message still makes sense as-is or needs updating (e.g. "signature photo missing" singular
   rather than plural/per-signer).
3. Re-read the Portal `[id]/page.tsx` correction dialog/detail: the current two separate "Unggah
   gambar tanda tangan" buttons (one per signer block) and the `useUploadIdentityCorrectionSignature`
   hook's `ownerId` parameter. Propose the UI fix: a single "Unggah foto BA" upload action at the
   correction level (not nested inside each signer block), with the resulting image displayed
   once (not duplicated under both signer sections) — propose exactly where in the card layout
   this single upload/preview lives, given both signer sections still need to show their own
   status/name/reason text separately.
4. Propose the corrected submit-flow sequencing: the submit endpoint still creates
   `IdentityCorrection` + 2 signature rows in one request (unchanged); the single photo upload
   now happens as ONE `POST /files` call (not up to two) with `ownerId = correction.id`,
   immediately after submit succeeds. Propose the updated recovery affordance (the "upload
   missing image" button in correction detail becomes singular, not per-signer).
5. Check for any other place in the codebase (tests, types) that assumes per-signer photo
   ownership and needs updating — list them.
6. Present the full proposal (backend policy/guard fix, Portal UI fix, submit-flow sequencing
   update) and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Apply the approved backend fix (file-owner-policy `resolveOwner`, decide guard).
2. Apply the approved Portal UI fix (single upload button/preview, updated hooks/types).
3. Update/replace any existing tests that assumed per-signer photo ownership — don't leave them
   asserting the old (wrong) behavior.
4. Run `apps/api` and `apps/portal` typecheck, and the relevant test suites
   (`TEST_DATABASE_URL` set); report real results.
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the full proposal per points 1–5 above, and explicit confirmation
that no schema migration is required (or a flagged stop if one is). End with an explicit
request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, test
results, and a short note confirming the corrected model (one photo per BA, not per signer) is
now consistent across backend + Portal — ready for the tech-pwa wizard task to build on
correctly.
