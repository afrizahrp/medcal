# IMPLEMENTATION REPORT — Tech-PWA: Identity Correction Submit Wizard

Task spec: [Implement_TechPWA_IdentityCorrection_Wizard_Staged.md](./Implement_TechPWA_IdentityCorrection_Wizard_Staged.md)

## Status: Stage 2 complete

Stage 1 proposal (below) was approved verbatim on all three open questions: photo required only
if a signer is SIGNED, upload capability added to the existing correction-detail view (no
separate retry surface), route-per-screen with wizard state in a layout Context.

## Stage 2 — what was built

New route tree `apps/tech-pwa/src/app/jobs/[id]/identity-correction/`:
- `wizard-state.ts` — `WizardState` shape, `initialWizardState`, validity predicates
  (`step1Valid`, `signatureValid`, `photoRequired`, `photoStepValid`), `toSignatureInput`.
- `layout.tsx` — loads the job, gates on `canSubmitIdentityCorrection`, lazily seeds
  `WizardState` once the job resolves, and exposes `{ job, state, update }` via a `useWizard()`
  context hook consumed by every screen below it.
- `page.tsx` (Screen 1/5) — reason textarea, three attribute toggles; the Device toggle drives a
  fresh `useDeviceCandidates` + `useDebouncedValue` (400ms) search, radio-selects a candidate.
- `signature-step.tsx` — shared form (status radio + conditional signer name / unavailable
  reason) used by both signer screens, since Screens 2 and 3 are identical except role/copy/guard.
- `signature-technician/page.tsx` (2/5), `signature-customer/page.tsx` (3/5) — thin wrappers
  passing role, next route, and the guard condition (redirect back a step if a prior step's data
  isn't valid yet).
- `photo/page.tsx` (4/5) — `<input type="file" accept="image/*" capture="environment">`, preview
  via `URL.createObjectURL`, "Ambil ulang" to retake; required only when `photoRequired(state)`
  (at least one signer SIGNED), otherwise skippable.
- `review/page.tsx` (5/5) — summarizes reason, before→after attribute rows (from the job data
  already in the wizard context, no extra fetch), both signature blocks, photo thumbnail; "Kirim"
  runs the two-call submit sequence.

Supporting additions:
- `apps/tech-pwa/src/hooks/use-debounced-value.ts` — new, ported from Portal's hook verbatim.
- `apps/tech-pwa/src/lib/calibration/identity-gate.ts` — added `canSubmitIdentityCorrection`
  (`!isIdentityGateLocked(job)`), mirroring Portal's helper.
- `apps/tech-pwa/src/lib/calibration/types.ts` — added `IdentityCorrectionSignatureInput`,
  `IdentityCorrectionSubmitInput`, `IdentityCorrectionSubmitResult`, `CalibrationJobDeviceCandidate`.
- `apps/tech-pwa/src/lib/api-errors.ts` — extended `MESSAGES` with the identity-correction submit
  and file-upload codes (`IDENTITY_CORRECTION_NO_CHANGE`, `IDENTITY_CORRECTION_ALREADY_PENDING`,
  `DEVICE_NOT_FOUND`, `DEVICE_CUSTOMER_MISMATCH`, `DEVICE_TYPE_MISMATCH`,
  `INVALID_IDENTITY_CORRECTION_SUBMIT`, `FILE_MIME_NOT_ALLOWED`, `FILE_EXTENSION_NOT_ALLOWED`,
  `FILE_CONTENT_MISMATCH`, `FILE_TOO_LARGE`, `FILE_OWNER_LOCKED`), all in Bahasa Indonesia
  matching the existing tone.
- `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` — added `useDeviceCandidates`,
  `useSubmitIdentityCorrection`, `useUploadIdentityCorrectionPhoto` (the last a raw-`fetch`
  multipart mutation, not `apiFetch`, since `apiFetch` forces a JSON content-type).
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx` — "Ajukan Koreksi Identitas" is now a `LinkButton` to
  `/jobs/[id]/identity-correction` when `canSubmitIdentityCorrection(job)`, otherwise stays
  disabled with "Job sudah melewati tahap verifikasi identitas." (dropped the old "segera hadir"
  placeholder).
- `apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx` — the "Foto BA" section's
  "Foto BA belum diunggah." message now also renders an upload button when
  `correction.status === "PENDING_REVIEW" && correction.files.length === 0 &&
  canSubmitIdentityCorrection(job)`, reusing `useUploadIdentityCorrectionPhoto`.

### Single-photo-per-BA model — verified end to end

Every path that uploads a photo passes `ownerId = correction.id` (the BA record), never a
signature id:
- `useUploadIdentityCorrectionPhoto` (`use-job-query.ts`) takes `{ correctionId, file }` and posts
  `FormData` with `ownerType: "IDENTITY_CORRECTION"`, `ownerId: correctionId` — there is no
  signature-id parameter anywhere in its signature or body.
- The wizard's `review/page.tsx` calls it with `correctionId: res.correction.id` (the id returned
  by the just-created correction, from the submit response) — not either `TECHNICIAN`/`CUSTOMER`
  signature's id, which never even reach this call site.
- The correction-detail retry path calls it with `correctionId` — the route param identifying the
  BA record itself.
- There is exactly one file input in the wizard (Screen 4) and one in the retry affordance —
  never two, never per-signer.

### Typecheck

`npm run typecheck` (`tsc --noEmit`) in `apps/tech-pwa` — clean, zero errors.

### Manual verification (code-reasoned; no browser-automation tool in this environment)

- **State survives back/forward navigation**: wizard state lives in `identity-correction/layout.tsx`'s
  `useState`, provided via React Context. Next.js App Router keeps a layout mounted across
  navigations between its own child routes, so moving from Screen 1 → 2 → 3 → back → forward
  never remounts the provider or resets `state` — confirmed by inspecting how each screen reads
  `useWizard()` rather than local component state for anything that must survive navigation
  (`reason`, `attrs`, `deviceId`/`deviceLabel`, `serial`, `akdAkl`, both signature blocks, `photo`).
  Only the device-search *query string* (Screen 1) is intentionally local/component-scoped, same
  as Portal's dialog — the selected `deviceId`/`deviceLabel` themselves are in wizard state and
  persist.
- **Guard redirects**: each screen after Screen 1 computes a `guardValid` boolean from the prior
  steps' validity and `router.replace()`s back a step (rendering `null` meanwhile) if invalid —
  covers a technician deep-linking or refreshing into a later step without having completed
  earlier ones.
- **Error retry without data loss**: Review screen's `handleSubmit` catch sets a local `error`
  string and leaves `state` untouched — the "Kirim" button is only disabled while `pending`, so a
  failed submit (e.g. `IDENTITY_CORRECTION_ALREADY_PENDING`) can be retried immediately without
  re-entering reason/attributes/signatures/photo.
- **Non-blocking photo-upload failure**: if the JSON submit succeeds but the photo `POST /files`
  throws, the `catch` block is empty (mirrors Portal) — the BA is still created and the user is
  routed to `/jobs/[id]/corrections/[correctionId]`, where the already-existing "Foto BA belum
  diunggah." message now carries the new retry upload button, satisfying the "clear message +
  retry path" requirement without inventing a toast/banner system that doesn't exist elsewhere in
  this app.
- **Mobile-first rules by construction**: every screen uses the shared `Screen` + `StickyActionBar`
  (safe-area insets already baked into those components), every button is the shared
  `Button`/`LinkButton` (`min-h-11`), every checkbox/radio is wrapped in a `min-h-11` label with an
  `h-5 w-5` control, every text/textarea input uses `text-base` (16px, prevents iOS zoom-on-focus),
  and every screen is single-column `flex flex-col`. No hover-only affordances — all actions are
  driven by `onClick`/`onChange`/`onChange` on native controls.

## Files changed (final `git status`)

```
M apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx
M apps/tech-pwa/src/app/jobs/[id]/page.tsx
M apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts
M apps/tech-pwa/src/lib/api-errors.ts
M apps/tech-pwa/src/lib/calibration/identity-gate.ts
M apps/tech-pwa/src/lib/calibration/types.ts
?? apps/tech-pwa/src/app/jobs/[id]/identity-correction/   (layout.tsx, page.tsx, wizard-state.ts,
   signature-step.tsx, signature-technician/page.tsx, signature-customer/page.tsx,
   photo/page.tsx, review/page.tsx)
?? apps/tech-pwa/src/hooks/use-debounced-value.ts
```

(`tsconfig.tsbuildinfo` also touched — a build artifact, not a source change.)

---

# STAGE 1 PROPOSAL (as approved)

Design proposal for the task in `Implement_TechPWA_IdentityCorrection_Wizard_Staged.md`.

## 0. Grounding (confirmed against current code)

- **Button today**: `apps/tech-pwa/src/app/jobs/[id]/page.tsx:79-88` renders an unconditionally-
  `disabled` "Ajukan Koreksi Identitas" button gated only by
  `capabilities?.calibrationJobSubmitIdentityCorrection`, with placeholder copy "Segera hadir...".
  There is **no** `canSubmitIdentityCorrection` gate helper in tech-pwa yet (Portal has one:
  `!isIdentityGateLocked(job)`, in `calibration-job-utils.ts:72-74`).
- **Photo model confirmed in code, not just docs**: Portal's `CorrectionPhotoBlock` and
  `useUploadIdentityCorrectionSignature` (`apps/portal/.../[id]/page.tsx:681-747`,
  `use-identity-corrections-query.ts:154-195`) both carry explicit comments that this is one photo
  per correction, `ownerId = correction.id`, never a signature id. Tech-pwa's correction-detail
  read view (`jobs/[id]/corrections/[correctionId]/page.tsx`) already matches this model. **The
  wizard must follow the same shape — this is the one thing Stage 1 must get right by
  construction.**
- **Route precedent**: `escalate/page.tsx` is a single-file route (`"use client"`, no split
  `-ui.tsx`/hooks file), reusing hooks centralized in `use-job-query.ts` one level up. This is the
  pattern to follow.
- **Nothing pre-built for**: device-candidates search, debounce hook, file-upload mutation, or the
  missing `formatApiError` codes — all need to be added fresh in tech-pwa (mirroring, not
  importing from, Portal — per the existing "rebuilt here on purpose" convention in
  `apps/tech-pwa/src/lib/calibration/types.ts:1-2`).

## 1. Routes: one route per screen (confirmed choice)

```
apps/tech-pwa/src/app/jobs/[id]/identity-correction/
  layout.tsx                 — holds wizard state (see §3), redirects to step 1 if state missing on steps 2-5
  page.tsx                   — Screen 1: reason + attributes
  signature-technician/page.tsx  — Screen 2
  signature-customer/page.tsx    — Screen 3
  photo/page.tsx              — Screen 4
  review/page.tsx             — Screen 5
```

Matches the escalate precedent (route-per-step, back-button navigable via `Screen showBack`), and
keeps each screen a focused, single-concern file rather than one large stateful component. Hooks
(query for job/device-candidates, mutations for submit + upload) go in the existing
`use-job-query.ts` one level up, consistent with how escalate reused it rather than creating a
per-route hooks file.

## 2. Screen breakdown

**Screen 1 — Reason + attributes** (`identity-correction/page.tsx`)
- `reason` textarea, required, non-empty after trim.
- Three toggles: Device / Serial / AKD-AKL. Each reveals its input when on:
  - Device → search input against a new `useDeviceCandidates` hook (ported from Portal, debounced
    400ms via a new `useDebouncedValue` hook — both need to be built fresh in tech-pwa, no
    existing device-candidates UI exists there), select from results.
  - Serial → plain text input.
  - AKD-AKL → plain text input.
- Validation mirrors Portal exactly: at least one toggle on, and each enabled toggle's input
  non-empty.
- "Lanjut" disabled until valid.

**Screen 2 — Technician signature** (`signature-technician/page.tsx`)
- Status selector: Signed / Unavailable / Refused.
- SIGNED → `signerName` text input, required.
- UNAVAILABLE/REFUSED → `unavailableReason` text input, required.
- Same validation shape as Portal's `signatureBlockValid`.

**Screen 3 — Customer signature** (`signature-customer/page.tsx`)
- Identical shape to Screen 2, for CUSTOMER.

**Screen 4 — Photo capture** (`photo/page.tsx`)
- ONE `<input type="file" accept="image/*" capture="environment">`, preview thumbnail
  (`URL.createObjectURL`) after selection, "Ambil ulang" (retake) button that re-opens the picker
  and replaces the file.
- **Recommendation: require a photo before proceeding only if at least one signer is SIGNED.** If
  both signers are UNAVAILABLE/REFUSED, no photo is meaningful (matches tech-pwa's own
  correction-detail view, which already renders "Tidak ada tanda tangan — foto tidak diperlukan."
  for that case) — so skip the requirement entirely rather than making it optional-but-nagged.
  This mirrors the backend's actual constraint surface (photo only matters where there's
  something to photograph) and avoids technicians being blocked by an artificial requirement in a
  state where it doesn't apply.

**Screen 5 — Review + submit** (`review/page.tsx`)
- Summary: reason, changed attributes as before → after (current job values already available
  from the existing job-detail query, no extra fetch), both signature blocks, photo thumbnail
  (or "tidak ada foto" if skipped).
- "Kirim" triggers the two-call submit sequence (§4). Shows loading/error state on the button
  itself, not a separate overlay, per the app's established pattern (matches escalate's submit
  button).
- Back navigation from here (or any screen) must not lose data — see §3.

## 3. State management: lifted state in a route-group layout

A `layout.tsx` at `identity-correction/` holds a single wizard-state object in `useState`,
provided via a small React Context to its child routes (`page.tsx` + the four subdirectories
share this layout). This is the natural fit given the multi-route decision:

- **Not URL params** — the payload includes free-text (`reason`, `unavailableReason`,
  `signerName`) and a `File` object (photo), neither serializable into a URL cleanly.
- **Not per-screen isolated state** — Review (Screen 5) needs everything, and Back must not lose
  data, ruling out screen-local `useState`.
- **A parent layout + Context is the right level** — it survives client-side navigation between
  the child routes (Next.js App Router keeps a shared layout mounted across sibling route
  transitions), and is scoped to exactly this route subtree so it doesn't leak into job-detail or
  other routes.

Shape:
```ts
type WizardState = {
  reason: string;
  attrs: { device: boolean; serial: boolean; akdAkl: boolean };
  newDeviceId?: string; newSerial?: string; newAkdAkl?: string;
  signatures: { TECHNICIAN?: SignatureInput; CUSTOMER?: SignatureInput };
  photo?: File;
};
```
Each screen reads/writes its slice via a `useWizardState()` hook exposing `state` + `setState`.
Guard: if a later screen is opened directly (e.g. deep link, refresh) without the required prior
state, redirect back to Screen 1 — mirrors how escalate's page redirects when its own
preconditions aren't met.

One caveat to flag: a page refresh (not just back/forward) will lose in-memory Context state,
same as it would for Portal's dialog-based approach (which also loses state on refresh, since
it's just component state). This matches the app's existing tolerance level (decision 3 says no
special offline handling beyond loading/error/retry) — not proposing `sessionStorage`
persistence unless desired; happy to add if wanted, but it's beyond what escalate does today.

## 4. Submit mutation flow

Sequenced exactly like Portal's `handleSubmitCorrection`:
1. `POST /calibration-jobs/:id/identity-corrections` with the JSON payload built from wizard
   state (only toggled attrs included).
2. On success, if `state.photo` exists, immediately `POST /files` with
   `{ ownerType: "IDENTITY_CORRECTION", ownerId: res.correction.id, file: state.photo }` via a
   raw-`fetch` multipart mutation (new `useUploadIdentityCorrectionPhoto` hook in
   `use-job-query.ts`, ported from Portal's `useUploadIdentityCorrectionSignature` — same
   raw-fetch-not-apiFetch reasoning, since `apiFetch` forces JSON).
3. Photo upload failure is **non-blocking**: caught, does not fail the overall operation.
   Navigate to job detail (or the new correction's detail route) with a message that the BA was
   created but the photo needs to be (re)added.

**Photo retry affordance — recommend adding upload capability to the existing correction-detail
view now** (`jobs/[id]/corrections/[correctionId]/page.tsx`), rather than inventing a separate
retry surface:
- That view already has the exact "Foto BA belum diunggah." read-only message today with no
  action attached — the natural, minimal change is to make that message conditionally into a
  file-input trigger when the viewing technician is the job's assignee and the correction is
  still `PENDING_REVIEW`.
- Reuses the same `useUploadIdentityCorrectionPhoto` hook the wizard uses, so no separate
  mutation to design or maintain.
- Avoids a second nav target/route just for retry.

## 5. Error handling — extend `formatApiError`

Add to `apps/tech-pwa/src/lib/api-errors.ts` `MESSAGES` map, porting Bahasa Indonesia strings
from Portal's `formatCalibrationJobApiError` for the codes reachable from this flow:

| Code | Message (Bahasa Indonesia, matching Portal's tone) |
|---|---|
| `IDENTITY_CORRECTION_NO_CHANGE` | "Tidak ada perubahan yang diajukan — pastikan minimal satu atribut berbeda dari data saat ini." |
| `IDENTITY_CORRECTION_ALREADY_PENDING` | "Sudah ada pengajuan koreksi identitas yang masih menunggu keputusan untuk job ini." |
| `DEVICE_NOT_FOUND` | "Alat yang dipilih tidak ditemukan." |
| `DEVICE_CUSTOMER_MISMATCH` | "Alat yang dipilih bukan milik pelanggan pada job ini." |
| `DEVICE_TYPE_MISMATCH` | "Jenis alat yang dipilih tidak sesuai." |
| `INVALID_IDENTITY_CORRECTION_SUBMIT` (name to confirm against API source in Stage 2) | "Data pengajuan koreksi identitas tidak valid." |
| `FILE_MIME_NOT_ALLOWED` | "Format foto tidak didukung — gunakan JPG atau PNG." |
| `FILE_TOO_LARGE` | "Ukuran foto terlalu besar." |
| `FILE_OWNER_LOCKED` | "BA ini sudah tidak dapat menerima foto baru." |

Portal's map uses `INVALID_IDENTITY_CORRECTION_SUBMIT` — will use this unless the API source
says otherwise, confirmed in Stage 2 rather than guessed here.

## 6. New files/hooks needed

```
apps/tech-pwa/src/app/jobs/[id]/identity-correction/
  layout.tsx
  page.tsx
  signature-technician/page.tsx
  signature-customer/page.tsx
  photo/page.tsx
  review/page.tsx
apps/tech-pwa/src/hooks/use-debounced-value.ts     — new, ported from Portal
apps/tech-pwa/src/lib/calibration/identity-gate.ts — add canSubmitIdentityCorrection
```
Additions to existing files:
- `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` — add `useDeviceCandidates`,
  `useSubmitIdentityCorrection`, `useUploadIdentityCorrectionPhoto`.
- `apps/tech-pwa/src/lib/api-errors.ts` — add the codes in §5.
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx` — swap disabled button for `LinkButton` + gate.
- `apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx` — add conditional photo
  upload affordance per §4.

No new top-level types file — wizard payload types can live inline in the layout, matching
escalate's precedent of not over-factoring a single-flow feature.

## Open questions for approval

1. Photo-required-only-if-any-signer-SIGNED rule in Screen 4 — agree, or require photo always?
2. Adding upload capability to the existing correction-detail view now (recommended), rather than
   a separate retry surface — agree?
3. Route-per-screen + layout-Context state approach — agree, or prefer single-route with internal
   step state?

**Awaiting explicit approval before proceeding to Stage 2.**
