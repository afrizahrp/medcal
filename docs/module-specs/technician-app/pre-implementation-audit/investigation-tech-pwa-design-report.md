# Investigation: Technician PWA — Current State, Backend Capabilities, Mobile-First Design Plan

> **Output-path note.** The task spec names `D:\medcal\docs\claude\plans\Calibration-management\investigation-tech-pwa-design.md`. This working copy of the repo is on the `j:` drive, so the report is written to the same relative path under `j:\medcal`. No other file was touched.

## Summary

`apps/tech-pwa` is still the F6 shell the original audit described: Next 16 App Router, three routes (`/`, `/sign-in`, `/firebase-messaging-sw.js`), a sign-in form, an FCM push-notification toggle, and a literal "Skeleton — field checklist and business modules land later" placeholder on the home page ([apps/tech-pwa/src/app/page.tsx:86](../../../../apps/tech-pwa/src/app/page.tsx#L86)). There are zero references to `calibrationJob`, `identityCorrection`, `escalate`, or `measurement` anywhere in its source. Auth is the **same** mechanism as Portal (`@medcal/auth/client` — Better Auth session cookie, `AuthProvider`, `useRequireSession`, `useAuthz`), so capabilities are available to wire with no new plumbing. React Query is already provisioned. Tailwind is **independent and near-empty** (`theme.extend` is `{}`), sharing nothing with Portal's design-token setup — which is actually convenient: the PWA can adopt a mobile-first token set without fighting Portal's sidebar-oriented theme.

The backend is ready for almost everything a technician needs — `GET /calibration-jobs/:id`, `POST /calibration-jobs/:id/escalate-identity`, the full Identity Correction submit/list/detail surface, `POST /files` for signature images, and `GET /calibration-jobs/:id/device-candidates` are all usable as-is from a mobile client, and `TECHNICIAN` already holds the `read` / `escalateIdentity` / `submitIdentityCorrection` grants. **The single biggest gap: there is no "my jobs" query.** `GET /calibration-jobs` filters only by `workOrderId` / `akdAklApprovalStatus` / `status` (+ search), and `GET /work-orders` filters only by `status` / `customerId` / `purchaseOrderId` / `quotationId`. Neither is scoped to the requesting technician, even though `WorkOrderAssignment.technicianUserId` exists. A technician cannot currently retrieve "the jobs I'm assigned to" in one call — this needs a new or extended endpoint before the PWA job list is buildable.

Core mobile-first recommendation: single-stack navigation (list → detail → action), no tab bar for v1 (only one real section), 44px minimum tap targets as a hard rule, and the Identity Correction submit flow rebuilt as a 4-step one-concern-per-screen wizard rather than Portal's single dense dialog. Signature capture should use **`<input type="file" accept="image/*" capture="environment">`** (camera/photo of a paper signature) for v1 — no drawing-canvas library exists in the monorepo and the backend only ever wants an image file. Full offline support should be explicitly deferred; the non-negotiable minimum is no form-data loss on a failed submit.

---

## Step 1 — Current `apps/tech-pwa` State

### Routing & layout

- **Next 16.2.12, App Router**, React 19.2.8 ([apps/tech-pwa/package.json:16-20](../../../../apps/tech-pwa/package.json#L16-L20)). Dev server on port 3004.
- Route tree is tiny:
  - [src/app/layout.tsx](../../../../apps/tech-pwa/src/app/layout.tsx) — root layout, `<html lang="id">`, body `min-h-screen bg-slate-100 text-slate-900 antialiased`, wraps children in `<Providers>`.
  - [src/app/page.tsx](../../../../apps/tech-pwa/src/app/page.tsx) — home. Gated by `useRequireSession()`; renders loading / pending / forbidden states, then a header (email · role, sign-out, push toggle) and a placeholder `<main>`.
  - [src/app/sign-in/page.tsx](../../../../apps/tech-pwa/src/app/sign-in/page.tsx) — email/password form calling `signIn.email(...)`, redirects to `/` on success.
  - [src/app/firebase-messaging-sw.js/route.ts](../../../../apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts) — dynamic route serving the FCM service-worker script with runtime-injected `NEXT_PUBLIC_FIREBASE_*` config.
- [src/app/providers.tsx](../../../../apps/tech-pwa/src/app/providers.tsx) — `QueryClientProvider` (staleTime 15s, `refetchOnWindowFocus: false`) → `TechPwaAuthProvider` (wraps `AuthProvider` from `@medcal/auth/client`, redirects to `/sign-in` on `onNeedsSignIn` unless already on a public auth route) → children + `<TechPwaSymbolPicker />`.
- Shared UI: only `GlobalSymbolPicker` from `@medcal/ui` is mounted ([src/components/global-symbol-picker-host.tsx](../../../../apps/tech-pwa/src/components/global-symbol-picker-host.tsx)). `SignOutButton` is a local component. No shared form primitives, no button component — Portal's `@medcal/ui` Button/Dialog/etc. are available via the workspace dep but currently unused here.

### Styling system

- **Independent Tailwind config**, essentially empty: `content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"]`, `theme: { extend: {} }`, no plugins, no `darkMode` ([apps/tech-pwa/tailwind.config.js](../../../../apps/tech-pwa/tailwind.config.js)).
- Contrast with [apps/portal/tailwind.config.js](../../../../apps/portal/tailwind.config.js): Portal has a full HSL-variable token system (`--border`, `--primary`, …), a `brand` scale, `tailwindcss-animate`, and `sidebar-expanded` / `sidebar-collapsed` spacing tokens. **None of that is shared** — the PWA would need its own token decisions (a plus for mobile-first; Portal's tokens are shell-oriented).
- [src/app/globals.css](../../../../apps/tech-pwa/src/app/globals.css) is just the three `@tailwind` directives. PostCSS = tailwindcss + autoprefixer ([postcss.config.js](../../../../apps/tech-pwa/postcss.config.js)).
- Styling in the existing pages is raw Tailwind utility classes with `slate-*` colors and `teal` (`#0f766e`) as the theme color.

### PWA manifest / service worker — installability & offline

- [public/manifest.webmanifest](../../../../apps/tech-pwa/public/manifest.webmanifest): `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `background_color`, `theme_color` — **but `"icons": []`**. Referenced from `layout.tsx` metadata. layout.tsx has an inline TODO: `apple-touch-icon added once real icon assets exist`.
  - **Installability is degraded**: no icons means browsers will not offer "Add to Home Screen" cleanly (Chrome requires at least a 192px and 512px icon). This must be fixed for a real field install.
- **Service worker**: the only SW is `/firebase-messaging-sw.js`, and it is **registered only when the user enables push notifications** — `navigator.serviceWorker.register(SW_PATH, { scope: "/" })` is called inside the FCM token-obtain path ([src/lib/fcm/messaging.ts:51](../../../../apps/tech-pwa/src/lib/fcm/messaging.ts#L51)), triggered from `usePushNotifications().enable()`.
  - That SW contains **only** `onBackgroundMessage` — no `fetch` handler, no precache, no runtime caching ([firebase-messaging-sw.js/route.ts:20-41](../../../../apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts#L20-L41)).
  - **There is no offline capability of any kind.** No `next-pwa` / Workbox in `next.config.js` ([next.config.js](../../../../apps/tech-pwa/next.config.js) is just `transpilePackages`). No app-shell caching, no offline data store. A "service worker exists" ≠ offline — confirmed it does not.

### Auth / session — same as Portal?

- **Yes, identical mechanism.** `@medcal/auth/client` re-exports `AuthProvider`, `useAuth`, `useAuthz`, `useMe`, `useRequireSession` ([packages/auth/src/client.ts](../../../../packages/auth/src/client.ts)), backed by Better Auth React client pointed at `NEXT_PUBLIC_API_URL` with the session cookie ([packages/auth/src/auth-client.ts](../../../../packages/auth/src/auth-client.ts)).
- `AuthProvider` is already mounted in `providers.tsx`, so **`useAuthz()` / capabilities are available today** — no wiring needed. Portal's job detail reads `capabilities?.calibrationJobSubmitIdentityCorrection` etc. from exactly this source ([apps/portal/.../calibration-jobs/[id]/page.tsx:227-228](../../../../apps/portal/src/app/management/calibration-jobs/%5Bid%5D/page.tsx#L227-L228)); the PWA can do the same.
- The capability flags exist in [packages/auth/src/me-types.ts:84-95](../../../../packages/auth/src/me-types.ts#L84-L95): `calibrationJobRead`, `calibrationJobEscalateIdentity`, `calibrationJobApproveIdentity`, `calibrationJobSubmitIdentityCorrection`, `calibrationJobDecideIdentityCorrection` (`calibrationJobAssignDevice` is deprecated → always `false`).
- `useAuth()` exposes `user.id` (already used for the FCM `userId` in page.tsx) — so the current technician's user id is available client-side for a "my jobs" call.
- API base URL: `process.env.NEXT_PUBLIC_API_URL`, cross-origin `fetch` with `credentials: "include"` (see the signature-upload pattern in Portal's `useUploadIdentityCorrectionSignature`).

### Viewport / meta — starting point for mobile-first

- [layout.tsx:12-16](../../../../apps/tech-pwa/src/app/layout.tsx#L12-L16): `export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" }`.
- This is a fine baseline but incomplete for a field PWA. **No `viewportFit: "cover"`** (needed for iOS safe-area / notch handling under `display: standalone`), no `maximumScale` decision. See Step 3.6 for the exact recommended config.
- Existing pages already use `mx-auto max-w-md` / `max-w-sm` centered columns — accidentally close to mobile-first, but by "constrain on desktop" rather than "designed for 360px".

---

## Step 2 — Backend Capability Mapping

All endpoints are on `CalibrationJobsController`, `@Controller("calibration-jobs")` + `@UseGuards(CompanyRoleGuard)` ([apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts)). Company scoping is automatic from the session (`@CompanyId()`).

### 2.1 "See my assigned jobs" — **REAL GAP**

| Question | Finding |
|---|---|
| Does `GET /calibration-jobs` support "assigned to me"? | **No.** `calibrationJobListQuerySchema` = `baseListQuerySchema` + `workOrderId?`, `akdAklApprovalStatus?`, `status?` ([packages/shared/src/schemas/index.ts:804-808](../../../../packages/shared/src/schemas/index.ts#L804-L808)). `findAll` builds `where` from exactly those + a `search` OR across declared name / observed serial / WO number / device serial ([calibration-jobs.service.ts:156-171](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L156-L171)). No technician/assignment term. |
| Does `GET /work-orders` support it? | **No.** `workOrderListQuerySchema` = `status?`, `customerId?`, `purchaseOrderId?`, `quotationId?` ([schemas/index.ts:581-586](../../../../packages/shared/src/schemas/index.ts#L581-L586)). `WorkOrdersService.findAll` where-clause is company + those filters only ([work-orders.service.ts:323-350](../../../../apps/api/src/modules/work-orders/work-orders.service.ts#L323-L350)). The list *includes* `assignments` in the response payload but never *filters* by them. |
| Is the data model there? | **Yes.** `WorkOrderAssignment { workOrderId, technicianUserId, roleOnJob }`, `@@unique([workOrderId, technicianUserId])`, `@@index([technicianUserId])` ([packages/db/prisma/schema.prisma:1674-1687](../../../../packages/db/prisma/schema.prisma#L1674-L1687)). `CalibrationJob` has `workOrderId` (non-null) so jobs → WO → assignments is a clean join. |
| RBAC | `TECHNICIAN` has `{ resource: "calibrationJob", action: "read" }` ([packages/db/prisma/seed-role-permissions.ts:153](../../../../packages/db/prisma/seed-role-permissions.ts#L153)). |

**What's possible today:** nothing clean. A technician client would have to (a) call `GET /work-orders` unfiltered, (b) client-side filter by `assignments[].technician.id === myUserId`, (c) fan out `GET /calibration-jobs?workOrderId=…` per WO. That's multiple round-trips, leaks every company WO to the device, and paginates wrong.

**Recommendation (flag for implementation task):** add a first-class filter. Cleanest is `GET /calibration-jobs?assignedToMe=true` (or `assignedTechnicianUserId=<id>` for the manager case), implemented as `where.workOrder.assignments = { some: { technicianUserId: <session user> } }`. Alternatively `GET /work-orders?assignedToMe=true`. This is the one backend change the PWA v1 hard-depends on.

### 2.2 View job detail — **USABLE AS-IS**

- `GET /calibration-jobs/:id` → `CalibrationJobDetail` ([controller.ts:57-64](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts#L57-L64)). RBAC `calibrationJob:read` (TECHNICIAN ✅).
- Include shape ([service.ts:21-50](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L21-L50)): `workOrder {id, number, status, customerId}`, `device {id, code, serialNumber, deviceTypeId, customerId}`, `calibrationRequestItem {customerDeviceName, akdAkl, deviceType {code, name}}`, `purchaseOrderItem.quotationItem.requestItem.deviceType`, `akdAklApprovedBy {id, name}`. Plus scalar columns: `status`, `akdAklApprovalStatus`, `akdAklDecisionNote`, `technicianObservedSerial`, `technicianObservedAkdAkl`, `customerDeclaredDeviceName`, `unitOrdinal`.
- No portal-specific assumptions in the response — plain relational JSON, fine for mobile.
- `GET /calibration-jobs/:id/identity-corrections` and `/identity-corrections/:correctionId` → `IdentityCorrectionDetail[]` / one, RBAC `calibrationJob:read` ([controller.ts:125-142](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts#L125-L142)). Includes `submittedBy`, `decidedBy`, `prevDevice`, `newDevice`, `signatures[]` with each signature's resolved image `files[] {id, originalName, mimeType}` (polymorphic FileObject lookup, `ownerType: "IDENTITY_CORRECTION"`, `ownerId: signature.id`) ([service.ts:439-459](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L439-L459)). Usable as-is.

### 2.3 Escalate AKD/AKL — **USABLE AS-IS**

- `POST /calibration-jobs/:id/escalate-identity` → `CalibrationJobDetail` ([controller.ts:66-82](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts#L66-L82)). RBAC `calibrationJob:escalateIdentity` — **TECHNICIAN ✅** ([seed-role-permissions.ts:154](../../../../packages/db/prisma/seed-role-permissions.ts#L154)).
- Body `calibrationJobEscalateIdentitySchema` ([schemas/index.ts:632-641](../../../../packages/shared/src/schemas/index.ts#L632-L641)):
  ```ts
  { technicianObservedAkdAkl?: string(≤120) | null,   // "what I read off the label", may be blank
    reason?: string(≤2000) }
  ```
- Server asserts the job status is not `SUBMITTED`/`ACCEPTED_BY_QA` and the AKD/AKL gate is not already `APPROVED`, then moves `akdAklApprovalStatus` → `PENDING_REVIEW` ([service.ts:209-246](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L209-L246)). Single call, no file upload. Trivial mobile form.

### 2.4 Submit Identity Correction with signatures — **USABLE AS-IS; the key mobile flow**

**Submit:** `POST /calibration-jobs/:id/identity-corrections` → `{ job, correction, deviceTypeValidated }` ([controller.ts:144-161](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts#L144-L161)). RBAC `calibrationJob:submitIdentityCorrection` — **TECHNICIAN ✅** ([seed-role-permissions.ts:155](../../../../packages/db/prisma/seed-role-permissions.ts#L155)).

Body `identityCorrectionSubmitSchema` ([schemas/index.ts:737-760](../../../../packages/shared/src/schemas/index.ts#L737-L760)):
```ts
{
  reason: string (1..2000),                       // required
  newDeviceId?: string | null,                    // optional; at least ONE of these 3 must be present
  newSerial?:   string(≤120) | null,
  newAkdAkl?:   string(≤120) | null,
  signatures: {
    TECHNICIAN: SignatureInput,
    CUSTOMER:   SignatureInput,
  }
}
// SignatureInput (identityCorrectionSignatureInputSchema, schemas/index.ts:712-734):
{ status: "SIGNED" | "UNAVAILABLE" | "REFUSED",
  signerName?:        string(≤120),   // REQUIRED when status === "SIGNED"
  unavailableReason?: string(≤500) }  // REQUIRED when status !== "SIGNED"
```
Server rules ([service.ts:466-569](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L466-L569)):
- Rejects if the job already has a `PENDING_REVIEW` correction (`409 IDENTITY_CORRECTION_ALREADY_PENDING`).
- Rejects if none of `newDeviceId`/`newSerial`/`newAkdAkl` actually differs from the job's current values (`400 IDENTITY_CORRECTION_NO_CHANGE`).
- If `newDeviceId` set: validates device belongs to the WO's customer and matches the resolved DeviceType (`DEVICE_CUSTOMER_MISMATCH` / `DEVICE_TYPE_MISMATCH`).
- Creates the `IdentityCorrection` (BA number allocated, `documentType: "IDENTITY_CORRECTION_BA"`) + exactly one `IdentityCorrectionSignature` per role, atomically, at `PENDING_REVIEW`.

**Signature image upload (separate, after submit):** `POST /files` multipart ([apps/api/src/modules/files/files.controller.ts:42-67](../../../../apps/api/src/modules/files/files.controller.ts#L42-L67)):
```
FormData: ownerType="IDENTITY_CORRECTION", ownerId=<signature row id>, file=<blob>
```
- No `@RequirePermission` on the route — authorization is delegated to the registered `IDENTITY_CORRECTION` FileOwnerPolicy, which per the access-control comment gates on `calibrationJob:submitIdentityCorrection` ([packages/auth/src/access-control.ts:106-110](../../../../packages/auth/src/access-control.ts#L106-L110)). TECHNICIAN ✅.
- Must be raw `fetch` with `credentials: "include"` (not the JSON `apiFetch`) so the browser sets the multipart boundary — exactly the Portal pattern ([apps/portal/.../use-identity-corrections-query.ts:158-192](../../../../apps/portal/src/app/management/calibration-jobs/use-identity-corrections-query.ts#L158-L192)).
- `MAX_UPLOAD_BYTES` limit enforced (`files: 1`).
- The manager's later APPROVE requires every `SIGNED` signature to have an uploaded image first (`400 IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING`) — so the PWA must upload before it can claim the BA is complete.

**Full client sequence:**
1. `POST …/identity-corrections` with reason + changed fields + both signature intents → get back `correction.signatures[]` (each with an `id` and `signerRole`).
2. For each role whose `status === "SIGNED"`: `POST /files` with `ownerId = <that signature's id>` and the captured image.
3. Re-fetch the correction / job to refresh.

**Signature capture feasibility (task asked to check both options):**

| Option | Feasibility in this stack | Trade-offs |
|---|---|---|
| **`<input type="file" accept="image/*" capture="environment">`** — technician photographs the wet-ink signature on the printed BA / notepad, or picks from gallery | **Fully supported.** No dependency. Standard on iOS Safari + Android Chrome (the PWA's only targets). Portal already uses `<input type="file" accept={IMAGE_ACCEPT}>` without `capture` ([apps/portal/.../[id]/page.tsx:1084-1088](../../../../apps/portal/src/app/management/calibration-jobs/%5Bid%5D/page.tsx#L1084-L1088)) — adding `capture="environment"` biases to the camera. | Simplest, zero new deps, matches the KAN-auditor mental model (a photo of a customer-acknowledged paper). Image size needs client-side downscale/compress before upload (a small canvas resize, ~30 lines, no library) to respect `MAX_UPLOAD_BYTES` and poor uplinks. Depends on the technician carrying a printed BA or writing on paper. |
| **Draw-to-sign canvas** (finger/stylus on a `<canvas>`, export `toBlob()`) | **Feasible but needs a new dependency.** Confirmed: **no** `signature_pad` / `react-signature-canvas` / `react-canvas-draw` anywhere in the monorepo (grep across all `package.json` — only match is this task's own spec file). React 19.2.8 — `react-signature-canvas` historically lags React majors; `signature_pad` (framework-agnostic, ~5KB, actively maintained) wrapped by hand is the safer add. | Better UX for an on-glass signature, no paper needed, deterministic image size. But: adds a dep + a hand-rolled React wrapper; touch/pointer-event handling and hi-DPI scaling are fiddly; a finger signature on a phone is legally weaker-looking than a photographed wet-ink one for a regulatory BA. |

**Recommendation:** ship **camera/file capture** for v1 (`accept="image/*" capture="environment"` + client-side compression). Revisit `signature_pad` as a v2 enhancement if technicians report they never have paper. The backend is indifferent — it stores whatever image bytes it's given.

### 2.5 Device search — **USABLE AS-IS**

- `GET /calibration-jobs/:id/device-candidates?search=<q>` → `DeviceWithRelations[]` ([controller.ts:103-112](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts#L103-L112)). RBAC `calibrationJob:submitIdentityCorrection` — TECHNICIAN ✅.
- Server scopes results to the job's customer + (when resolvable) DeviceType + `status: "ACTIVE"`, `pageSize: 20` ([service.ts:377-392](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L377-L392)). Behaves identically for the PWA and Portal — same controller, no client-type branching. `search` is a plain query-string param (trimmed server-side).

### 2.6 Manager decision endpoints (context)

- `POST …/escalate-identity`'s counterpart `POST /calibration-jobs/:id/identity-decision` (RBAC `calibrationJob:approveIdentity`) and `POST …/identity-corrections/:correctionId/decision` (RBAC `calibrationJob:decideIdentityCorrection`) are **TECHNICIAN_MANAGER-only** ([seed-role-permissions.ts:158-160](../../../../packages/db/prisma/seed-role-permissions.ts#L158-L160)); not granted to plain TECHNICIAN, ADMIN, or SUPERVISOR. Decision bodies: `{ decision: "APPROVE" | "REJECT", (akdAkl)decisionNote? }` with the note **required on REJECT** ([schemas/index.ts:650-663](../../../../packages/shared/src/schemas/index.ts#L650-L663), [767-780](../../../../packages/shared/src/schemas/index.ts#L767-L780)).
- Whether these belong in the PWA at all is an open product question (Step 4). If included, they're gated purely by capability flags already on `/me`, so the same screens can conditionally render a decide action.

---

## Step 3 — Mobile-First Design Plan

> **`frontend-design` skill:** not available in this environment. Available skills are `design`, `dataviz`, `artifact-*`, plus workflow skills — none is a mobile-UI design-system guide. The rules below are therefore stated explicitly and self-contained; the implementation task should treat them as binding.

**Mobile-first definition (binding for the implementation task):** design and build for a **360–430px-wide touch viewport first**. Every layout is authored with unprefixed (mobile) Tailwind utilities; `sm:` / `md:` are used **only** to *enhance* on wider screens (e.g. cap column width, add horizontal padding), **never** to fix a layout that was authored desktop-first. A screen that only works ≥768px is a bug, not a smaller-screen "todo".

### 3.1 Navigation pattern

- **Single-stack push navigation**, not a sidebar (sidebar is Portal's pattern and explicitly wrong here), and **not a bottom tab bar for v1** — there is only one real section (My Jobs). A tab bar with one meaningful tab is noise.
- Stack: **Job list → Job detail → Action screen(s)**. "Back" is a top-left chevron in a slim sticky header (≤56px tall). Each action (escalate, identity-correction wizard) is a full pushed route, not a modal/dialog — modals on a 360px screen with a keyboard open are cramped and lose scroll position.
- Header contents: back affordance (except at list root), screen title, and at most one primary action (kebab/overflow only if genuinely needed — see 3.4 for the no-hover constraint on overflow menus).
- Reserve a bottom tab bar for the future when a second section (e.g. measurement execution) actually lands. Design the header/stack so adding one later is non-breaking.
- Route-level auth: reuse `useRequireSession()` (already in `page.tsx`) at a shared layout so every execution route inherits the loading/pending/forbidden gates.

### 3.2 Touch target sizing — **RULE**

- **Minimum 44×44 CSS px** for every interactive element: buttons, list rows (the whole row is the tap target to open a job), form inputs, select triggers, the signature-status segmented control, back chevron, file-capture button.
- Inputs: `min-height: 44px` (Tailwind `min-h-11`), `font-size: 16px` minimum on text inputs (`text-base`) — **iOS Safari zooms the viewport on focus for any input below 16px**, which breaks the layout. This is a hard rule, not a preference.
- Spacing between adjacent tap targets ≥ 8px so fat-finger mis-taps don't fire the wrong control.
- Primary action buttons: full-width (`w-full`), 48px tall, fixed to the bottom of the viewport (sticky footer) on form/wizard screens so the technician never scrolls to find "Continue"/"Submit".

### 3.3 Forms on mobile — the Identity Correction wizard

Portal submits the whole correction from **one dense dialog** — `SubmitCorrectionDialog` ([apps/portal/.../[id]/page.tsx:892+](../../../../apps/portal/src/app/management/calibration-jobs/%5Bid%5D/page.tsx#L892)) toggling device/serial/AKD-AKL sub-sections plus two inline `<input type="file">` signature blocks in a scrollable modal. That does not work one-handed on a phone.

**Rebuild as a linear wizard — one concern per full screen, single column, sticky "Continue" footer, progress indicator (e.g. "Step 2 of 4"):**

| Screen | Contents | Validation before advancing |
|---|---|---|
| **1 — What changed** | `reason` (textarea, required). Then up to three toggleable field groups, each collapsed by default with a 44px toggle row: **Device** (opens a search screen → `GET …/device-candidates`, pick one, shows selected code/serial), **Observed serial** (text), **AKD/AKL** (text). At least one group must be filled. | `reason` non-empty **and** ≥1 field group has a value that differs from the job's current value (mirror the server's `IDENTITY_CORRECTION_NO_CHANGE` rule client-side so the tech isn't surprised at submit). |
| **2 — Technician signature** | Segmented control: `SIGNED` / `UNAVAILABLE` / `REFUSED`. If `SIGNED`: `signerName` (required, pre-fill from `useAuth().user.name`) + capture control (`<input type="file" accept="image/*" capture="environment">`, shows a thumbnail preview, "retake" affordance). If not `SIGNED`: `unavailableReason` (required). | Matches server superRefine: name required when SIGNED, reason required otherwise. Image required-at-capture-time is UX; server enforces it at manager APPROVE, but the wizard should insist on it now. |
| **3 — Customer signature** | Same control as screen 2, `signerRole = CUSTOMER`. `signerName` = the customer rep's name. | Same rule. |
| **4 — Review & submit** | Read-only summary of reason + each changed field (old → new) + both signature statuses/names + signature thumbnails. Single **Submit** button. On tap: `POST …/identity-corrections`, then loop the `SIGNED` signatures uploading each image to `POST /files`, then show a success screen with the BA number. | — |

Wizard state lives in a single React state object (or `useReducer`) held at the wizard route root so back/forward between steps never loses input. See 3.5 for persistence on failure.

The **escalate** flow is *not* a wizard — it's a single short screen: `technicianObservedAkdAkl` (text, optional) + `reason` (textarea) + sticky Submit. One `POST`, done.

### 3.4 No hover-dependent interactions — **CONFIRMED / RULE**

- Touch has no hover; nothing in the design above depends on it. Explicitly banned for the implementation task:
  - Tooltip-on-hover for field help — use an always-visible helper line under the input, or a tap-to-toggle info disclosure.
  - Hover-to-reveal row actions — the job-list row opens detail on tap; any secondary action (rare in v1) is an explicit button *inside* the detail screen, not a hover affordance on the row.
  - Hover-styled buttons — keep `:active` / pressed states (visible tap feedback) and `:focus-visible` for accessibility; `:hover` styles may exist but must never be the *only* way to discover or trigger something.
- If an overflow menu is ever needed, it opens on tap (a real popover/sheet), and closes on outside-tap or a close button — no hover intent.
- Destructive/irreversible actions (none in v1 for the technician — submit creates a `PENDING_REVIEW` BA that a manager can reject) get an explicit confirm step, not a hover-hold.

### 3.5 Offline / connectivity resilience — **RECOMMENDATION (not a unilateral decision)**

Technicians work in hospitals, basements, and rural sites (this project's domain) — connectivity will be intermittent.

**Recommend: defer full offline support (offline data cache, background sync, queued mutations) out of v1.** It's a large amount of correctness-critical work (conflict handling on `PENDING_REVIEW` uniqueness, stale device-candidate lists, replaying multipart uploads) and the backend has no sync/ETag support today.

**Recommend as the v1 non-negotiable minimum:**
1. **No data loss on failed submit.** The wizard must *not* clear its state on a network error. Show the error inline on the Review screen with a **Retry** button that re-POSTs from the retained state. If `POST …/identity-corrections` succeeded but a later `POST /files` failed, keep the returned `correction.id` + signature ids and retry *only* the failed uploads (don't re-submit the BA — that would 409).
2. **Explicit loading / empty / error states** on every screen (job list, detail, each wizard step, device search). No silent spinners-forever; every fetch has a visible error with a Retry affordance. React Query's `isError` / `refetch` covers this cheaply.
3. **Optimistic-free writes.** Don't optimistically show a BA as submitted; wait for the 2xx, because the server has real rejection paths (`NO_CHANGE`, `ALREADY_PENDING`, device mismatches).
4. **Image compression before upload** (client canvas resize to ~1600px long edge, JPEG ~0.7) so a submit over a weak uplink is a ~150KB request, not 4MB.
5. **App-shell caching** via a minimal service worker (or `next-pwa`) so the installed PWA at least *opens* offline and shows "You're offline — reconnect to load your jobs" rather than the browser dinosaur. This is cache-first for static assets only, no data caching — low risk, high perceived reliability.

Confirm with the user whether (5) and any read-only job-list caching are wanted in v1 or also deferred.

### 3.6 Viewport meta + responsive breakpoints — **RULE**

Replace the current `viewport` export ([layout.tsx:12-16](../../../../apps/tech-pwa/src/app/layout.tsx#L12-L16)) with:
```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,          // allow pinch-zoom — accessibility; do NOT set userScalable:false
  viewportFit: "cover",     // iOS standalone safe-area / notch
  themeColor: "#0f766e",
};
```
- Add `env(safe-area-inset-*)` padding on the sticky header and sticky footer (`pt-[env(safe-area-inset-top)]`, `pb-[env(safe-area-inset-bottom)]`) so controls aren't under the notch / home indicator when installed.
- **Breakpoint convention (binding):** author every component with **unprefixed = mobile** utilities. Use `sm:` (≥640px) and `md:` (≥768px) *only* as widening enhancements — e.g. `class="px-4 sm:px-6"`, `class="w-full sm:max-w-md sm:mx-auto"`. **Never** write `md:flex-col` to undo a desktop `flex-row` default. Code review for the implementation task should reject any `sm:`/`md:` utility that is *fixing* rather than *enhancing*.
- Container: content column `w-full` on mobile, `sm:max-w-md sm:mx-auto` (≈448px) on larger screens — the app is a phone app that merely stays centered and readable on a tablet/desktop, never a responsive multi-column layout.
- Fix the manifest: add real 192px + 512px (+ maskable) icons and an `apple-touch-icon`, so the installed experience the whole design assumes actually works.
- Tailwind config: keep it independent from Portal. Add a small token set (one brand color scale around the existing `#0f766e` teal, `min-h-11` usage convention, `text-base` default on inputs). No `tailwindcss-animate` / sidebar tokens needed.

### 3.7 Proposed v1 route list

Kept strictly to the Step 2 flows — **no** measurement / certificate / QA screens (future, unbuilt domain per the original audit).

| Route | Purpose | Primary endpoint(s) |
|---|---|---|
| `/sign-in` | Existing. Email/password. | Better Auth |
| `/` → redirect to `/jobs` | — | — |
| `/jobs` | **My Jobs list.** Cards: unit label ("Unit 2 of 3" from `unitOrdinal`), declared device name, WO number, job `status` badge, `akdAklApprovalStatus` badge. Pull-to-refresh / Retry. | `GET /calibration-jobs?assignedToMe=true` **(NEW — see 2.1)** |
| `/jobs/[id]` | **Job detail.** Identity snapshot (declared name, current bound `device`, observed serial, observed AKD/AKL), AKD/AKL gate status + approver, list of existing identity corrections (number, status, date) each tappable. Action buttons (capability-gated): "Escalate AKD/AKL", "Submit identity correction". | `GET /calibration-jobs/:id`, `GET /calibration-jobs/:id/identity-corrections` |
| `/jobs/[id]/corrections/[correctionId]` | **Correction detail.** Reason, old→new fields, both signatures with image previews (`SignatureImage`-style blob fetch), decision + note if decided. | `GET /calibration-jobs/:id/identity-corrections/:correctionId`, `GET /files/:id` (blob) |
| `/jobs/[id]/escalate` | **Escalate screen** (single form, not a wizard). | `POST /calibration-jobs/:id/escalate-identity` |
| `/jobs/[id]/corrections/new` | **Identity-correction wizard** (4 steps, §3.3). Nested step state; may be step routes (`?step=2`) or internal state. | `POST /calibration-jobs/:id/identity-corrections`, then `POST /files` ×(signed signatures) |
| `/jobs/[id]/corrections/new/device-search` | **Device picker** sub-screen for wizard step 1 (search input + result list, scoped server-side). | `GET /calibration-jobs/:id/device-candidates?search=` |
| `/settings` *(optional)* | Push-notification toggle (move the existing `PushNotificationsControl` here off the home header), sign-out, app version. | existing FCM hooks |

**Manager decision screens** (`identity-decision`, correction `decision`) are **out of v1 scope unless the user confirms** the TECHNICIAN_MANAGER role uses this PWA in the field (Step 4). If confirmed, they're two more single-form screens under `/jobs/[id]/...`, capability-gated on `calibrationJobApproveIdentity` / `calibrationJobDecideIdentityCorrection`.

---

## Open Questions for User Confirmation

1. **"My jobs" endpoint (blocker).** Confirm the implementation task may add `assignedToMe`/`assignedTechnicianUserId` filtering to `GET /calibration-jobs` (or `GET /work-orders`). The PWA job list cannot be built without it. Preferred shape: `GET /calibration-jobs?assignedToMe=true` filtering on `workOrder.assignments.some.technicianUserId = <session user>`.
2. **Does TECHNICIAN_MANAGER use this PWA in the field?** If yes, add the two decision screens (approve/reject AKD/AKL gate, approve/reject Identity Correction BA) to v1, capability-gated. If no, they stay Portal-only and the PWA is technician-only.
3. **Signature capture method.** Confirm the recommendation: v1 = camera/photo capture (`<input type="file" accept="image/*" capture="environment">` + client-side compression), no drawing canvas, no new dependency. Draw-to-sign (`signature_pad`) deferred to v2.
4. **Offline scope for v1.** Confirm: defer full offline (data cache / queued mutations); v1 ships only (a) no form-data loss on failed submit + retry, (b) explicit loading/error/retry states everywhere, (c) image compression, (d) a minimal app-shell service worker so the installed app opens offline with a friendly message. Is (d) + read-only job-list caching in or out?
5. **Manifest icons.** Real 192/512/maskable + apple-touch-icon assets are needed for a proper field install — who provides them, or should the implementation task generate placeholders from `short-logo.png`?
6. **Bottom tab bar vs. pure stack.** Recommendation is pure push-stack for v1 (one section). Confirm no objection to deferring a tab bar until a second section exists.

---

## Confirmation

**No code changes were made.** This was read-only analysis. The only file written is this report (`docs/claude/plans/Calibration-management/investigation-tech-pwa-design.md` on the `j:` drive — the spec named the `D:` drive, which does not exist in this checkout; the relative path is identical). No source, config, schema, or other documentation file was created, edited, or deleted.
