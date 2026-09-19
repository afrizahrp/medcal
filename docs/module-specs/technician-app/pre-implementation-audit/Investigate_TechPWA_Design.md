# INVESTIGATE — Technician PWA: Current State, Backend Capabilities, Mobile-First Design Plan

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any file — with ONE exception:
you may write a single new report file at the path specified in "Output" below. Do NOT
implement anything. This task is diagnostic/design-proposal only. A separate staged
implementation task will follow.

## Background — why this task exists

`apps/tech-pwa` was confirmed by the original full audit to be a shell: sign-in + FCM push
notification toggle only, zero job/execution surface, zero references to `calibrationJob`,
`measurement`, `akdAkl`, or `observ*` anywhere in its source. Since that audit, the backend has
grown a complete API surface a technician needs:

- `CalibrationJob` fan-out (jobs exist once a WorkOrder starts).
- AKD/AKL escalation (`POST .../escalate-identity`) — technician-initiated.
- Identity Correction — submit (`POST .../identity-corrections`, with reason + optional
  device/serial/AKD-AKL changes + two signatures), signature image upload (`POST /files`),
  list/detail. This is now the sole path for establishing/correcting device identity
  (supersedes the old `assignDevice`).
- Decision endpoints exist too (TECHNICIAN_MANAGER approve/reject) — relevant if a manager
  ever uses the PWA in the field, not just the technician.
- `GET /calibration-jobs/:id/device-candidates` for device search.

None of this is wired into `apps/tech-pwa` yet. This task inventories what exists, confirms
what's usable as-is from mobile, and produces a concrete design plan — with **mobile-first
layout treated as a hard constraint, not a nice-to-have**.

## Step 1 — Inventory `apps/tech-pwa` current state

1. Read the full current source tree (`apps/tech-pwa/src`): routing setup (App Router?
   layout.tsx structure), the sign-in flow, the FCM push setup, any shared UI primitives already
   present, and confirm the styling system in use (Tailwind config — is it shared/duplicated
   from `apps/portal`, or independent? check for a `tailwind.config` and any design-token setup).
2. Confirm the PWA manifest/service-worker setup (installability, offline behavior if any —
   report what exists, don't assume a service worker means offline data caching is implemented;
   verify).
3. Confirm how auth/session works here vs. `apps/portal` — same `AuthProvider`/session cookie
   mechanism, or a separate flow? Confirm whether `useAuthz()`/capabilities are already
   available in this app or need to be wired.
4. Confirm the viewport/meta setup currently in `layout.tsx` (viewport meta tag, any existing
   responsive constraints) as the starting point for the mobile-first requirement below.

## Step 2 — Inventory what a technician actually needs, mapped to existing backend endpoints

For each capability, confirm the exact endpoint, its request/response shape (re-read live from
the controller, don't rely on memory of prior task summaries), and its RBAC requirement:

1. **See my assigned jobs.** Check: does `GET /calibration-jobs` support filtering by "assigned
   to me" (technician user id), or only by `workOrderId`/`akdAklApprovalStatus`/`status`? If
   there's no "my jobs" filter, this is a real gap — check how `WorkOrderAssignment` /
   technician-to-WorkOrder assignment works (per the original audit,
   `WorkOrderAssignment.technicianUserId` exists at the WO level) and whether a job list can be
   derived by joining through the technician's assigned WorkOrders. Report exactly what's
   possible today vs. what would need a new/extended endpoint (flag as a gap, don't silently
   assume it'll work).
2. **View job detail** (identity snapshot, current device, AKD/AKL status, existing
   corrections) — confirm `GET /calibration-jobs/:id` and the identity-corrections endpoints
   are usable as-is from a mobile client (no portal-specific assumptions baked into the
   response shape).
3. **Escalate AKD/AKL** — confirm the escalate endpoint and its RBAC (`TECHNICIAN` already
   granted, per the earlier task).
4. **Submit Identity Correction with signatures** — this is the most mobile-relevant flow.
   Confirm the exact submit + file-upload sequence (already documented from the backend task).
   Critically: the Portal task deliberately deferred **draw-to-sign / camera capture** to this
   task as the mobile-appropriate approach (vs. Portal's plain file-picker). Investigate what's
   feasible in this app's stack: is there already any canvas/drawing library available
   (`react` version, any signature-pad package already in `package.json` anywhere in the
   monorepo — check before assuming one needs to be added)? Does the current browser
   target/PWA setup support `<input type="file" accept="image/*" capture="environment">` for
   direct camera capture as a simpler alternative to a drawing canvas? Propose both options
   with trade-offs; don't assume one without checking feasibility.
5. **Device search** for the identity-correction device field — confirm
   `GET /calibration-jobs/:id/device-candidates` works the same way it does for Portal.

## Step 3 — Mobile-first design plan (this is the core deliverable — be strict, not aspirational)

Mobile-first here means: **design and build for a ~360-430px wide touch screen first**, then
treat any larger viewport as a bonus, not the other way around. Concretely investigate and
propose:

1. **Navigation pattern.** Propose a bottom tab bar or a single-stack navigation (job list →
   job detail → action) appropriate for one-handed phone use — NOT a sidebar (that's the Portal
   pattern, explicitly wrong for this app). Check `frontend-design` skill guidance if available
   in this environment and apply it.
2. **Touch target sizing.** Propose a minimum tap-target size convention (commonly 44×44px) to
   apply consistently — buttons, list rows, form inputs — and state it as a rule the
   implementation task must follow, not a suggestion.
3. **Forms on mobile.** The identity-correction submit flow has multiple fields + two
   signatures — propose a single-column, step-by-step (wizard-style, one concern per screen)
   layout rather than Portal's dense multi-section dialog, since a wide dialog with several
   toggled sections does not work well on a small screen. Propose the concrete screen breakdown
   (e.g. screen 1: reason + what changed; screen 2: technician signature; screen 3: customer
   signature; screen 4: review + submit).
4. **No hover-dependent interactions** — confirm nothing in the proposed design relies on
   hover states (tooltips-on-hover, hover-to-reveal actions) since touch has no hover.
   Long-press or explicit tap-to-reveal is a real consideration on mobile.
5. **Offline/connectivity resilience** — technicians may be in locations with poor connectivity
   (hospitals, basements, rural areas per this project's domain). Investigate whether this is
   in scope for v1 or should be explicitly deferred (propose deferring full offline support,
   but recommend at minimum: clear loading/error states, retry affordances, and avoiding data
   loss on a failed submit — e.g. don't clear a filled-out form on network error). State this
   as a recommendation, not a decision you're making unilaterally.
6. **Viewport meta + responsive breakpoints** — propose the exact `viewport` meta configuration
   and Tailwind breakpoint usage convention (mobile styles unprefixed/default, larger-screen
   overrides via `sm:`/`md:` as enhancement only, never the reverse) as an explicit rule for the
   implementation task.
7. Propose a rough page/route list for the v1 execution surface: job list, job detail, escalate
   dialog/screen, identity-correction wizard (per point 3), and anything else you judge
   essential — keep this to what's genuinely needed for the flows in Step 2, don't scope-creep
   into measurement/certificate work (that's future, unbuilt domain per the original audit).

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-tech-pwa-design.md`

Structure:

```markdown
# Investigation: Technician PWA — Current State, Backend Capabilities, Mobile-First Design Plan

## Summary
[What exists, what's usable as-is, the single biggest gap, and the core mobile-first
recommendation in one paragraph]

## Step 1 — Current apps/tech-pwa State
[Findings with citations]

## Step 2 — Backend Capability Mapping
[Endpoint-by-endpoint: usable as-is / gap, especially the "my jobs" filter question and the
signature-capture feasibility findings]

## Step 3 — Mobile-First Design Plan
[Navigation, touch targets, form/wizard breakdown, hover-avoidance, offline recommendation,
viewport/breakpoint rule, proposed route list]

## Open Questions for User Confirmation
[Anything genuinely requiring a product/business decision before implementation, e.g. whether
TECHNICIAN_MANAGER decisions also happen via this app, whether offline support is truly out of
scope, the signature-capture method choice]
```

Do not modify any other file. Confirm in your final chat message that no code changes were
made — this was analysis only.
