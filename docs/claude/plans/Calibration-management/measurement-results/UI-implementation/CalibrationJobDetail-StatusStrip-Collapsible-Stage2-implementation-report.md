# STAGE 2 — CalibrationJob Detail Page: Status Strip + Collapsible Sections — Implementation Report

**Date:** 2026-09-10
**Scope:** Portal UI only — `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` and its
`useCalibrationJob` hook. No API/schema changes.
**Predecessor:** [stage-1-audit-idempotent-whale.md](./stage-1-audit-idempotent-whale.md) (read-only audit —
corrected the "already-reusable collapsible" and "page already polls" premises before this stage was scoped).

**HARD STOP after this report — awaiting review before deploy.**

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Reuse primitive | `apps/portal/src/components/ui/accordion.tsx` (Radix), the same primitive already proven in `leads-ui.tsx`'s `NeedsReviewAccordion`. `device-calibration-parameters`' table-row expand pattern was **not** used (confirmed unsuitable in Stage 1). |
| 2 | Polling | `refetchInterval: 6000` + `refetchOnWindowFocus: true` added to `useCalibrationJob` only. `useReferenceEquipmentUsed` untouched — its deliberate no-interval design (protects in-progress override-reason edits) is unaffected. |
| 3 | Live-edit sections | Reference Equipment and Measurement Results use `<AccordionContent forceMount>` — content stays mounted on collapse, so in-progress edits (override reason, quality-review notes) survive. Identity, Identity Corrections, and AKD/AKL use default (unmount-on-collapse) behavior — no live state to protect. |
| 4 | AKD/AKL buttons | Escalate / Approve / Reject stayed in the page-level footer, untouched. Only the AKD/AKL `<dl>` was wrapped. |
| 5 | Status strip | 4 chips: Identitas (neutral, navigation-only), Alat Referensi, Koreksi Identitas (BA), AKD/AKL. No "measurement complete" chip — deferred per instruction (no real expected-replicate-count basis yet). |
| 6 | Signal sourcing | Alat Referensi / Koreksi Identitas chips read `job.actionSignals.{referenceEquipmentNeedsApproval, identityCorrectionPending}` directly — already fetched by this page's query, previously unused. AKD/AKL chip reads `job.akdAklApprovalStatus` (already used elsewhere on the page, unchanged). |
| 7 | Auto-expand | Sections whose signal is "needs attention" expand once on first load (`referenceEquipmentNeedsApproval`, `identityCorrectionPending`, `akdAklApprovalStatus === "PENDING_REVIEW"`); the rest start collapsed. A `didInitExpand` ref guard makes this run exactly once, so the 6s poll cannot reopen/close sections a user has toggled. |
| 8 | Typecheck | `apps/portal` `tsc --noEmit` → exit 0. |
| 9 | Tests | `apps/portal` `vitest run` → **146/146 passed**, 15 files (calibration-jobs suite: 18/18, unaffected). |
| 10 | Manual browser testing | **Not run** — no browser automation tool available in this session. Verified by code inspection instead (see §5). Recommend the 3 manual scenarios from the task before deploy. |

---

## 1. Files changed

- [`apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts`](../../../../../apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts)
  — `useCalibrationJob` gained `refetchInterval: 6000` / `refetchOnWindowFocus: true`.
- [`apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`](../../../../../apps/portal/src/app/management/calibration-jobs/%5Bid%5D/page.tsx)
  — added `StatusStrip` + `StatusChip` components, wrapped the 5 sections in `Accordion`/`AccordionItem`,
  added section refs + `focusSection` (expand + scroll), added the one-time auto-expand effect.

```
git diff --stat apps/portal/src/app/management/calibration-jobs
 .../app/management/calibration-jobs/[id]/page.tsx  | 475 ++++++++++++++-------
 .../calibration-jobs/use-calibration-jobs-query.ts |   4 +
 2 files changed, 317 insertions(+), 162 deletions(-)
```

---

## 2. Status strip

Four `StatusChip` buttons above the accordion, each clickable to expand + scroll its section:

- **Identitas** — always neutral. No existing "needs attention" signal for the identity block was found
  in Stage 1 or during implementation, so per instruction it stays a navigation shortcut, not a verdict.
- **Alat Referensi** — amber when `job.actionSignals.referenceEquipmentNeedsApproval` is true, else neutral.
- **Koreksi Identitas** — amber when `job.actionSignals.identityCorrectionPending` is true, else neutral.
- **AKD/AKL** — label uses `AKD_AKL_APPROVAL_STATUS_LABELS[job.akdAklApprovalStatus]`; amber tone when
  `PENDING_REVIEW`, emerald when `APPROVED`, neutral otherwise.

## 3. Accordion wrapping

| Section | Accordion value | Content mount |
|---|---|---|
| Identity fields `<dl>` + Assigned Device | `identity` | default (unmount on collapse) |
| Alat Referensi yang Digunakan (`ReferenceEquipmentSection`) | `ref-equipment` | `forceMount` |
| Hasil Pengukuran (`QualityReviewPanel`) | `measurement` | `forceMount` |
| Identity Corrections (Berita Acara) | `corrections` | default |
| AKD/AKL/NIE Approval `<dl>` | `akd-akl` | default |

`Accordion` is controlled (`type="multiple"`, `value={openSections}`, `onValueChange={setOpenSections}`),
so both the status-strip clicks and the accordion's own triggers drive the same state.

**Scope note:** the "Ajukan Koreksi Identitas" button previously sat beside the Identity Corrections
`<h3>`, visible even when the section was collapsed. `AccordionTrigger` renders a single `<button>`, so a
second nested button there is invalid HTML. The button now sits at the top of that section's
`AccordionContent` instead — only visible when the section is expanded. No other section's internal
content or logic changed.

## 4. Polling

Only `useCalibrationJob` gained polling — it backs `job.actionSignals`, `job.akdAklApprovalStatus`, and 3
of the 5 sections. `useReferenceEquipmentUsed` was left exactly as-is; its code comment (`// no interval
poll — it would clobber an in-progress override-reason edit`) still applies and was not touched.

## 5. Live-edit-state protection (forceMount)

Radix's `AccordionContent` unmounts its children by default when collapsed. Two sections hold real,
uncommitted local state:

- `ReferenceEquipmentEditor`'s `selection` (per-candidate checkbox + override-reason text).
- `QualityReviewPanel`'s `notes` textarea.

Both are wrapped in `<AccordionContent forceMount>` so the DOM (and its React state) stays mounted while
collapsed; the shared `accordion.tsx` primitive already carries a `data-[state=closed]:animate-accordion-up`
/ `overflow-hidden` class pair that visually collapses forceMounted content to zero height without
unmounting it. `accordion.tsx` itself was **not** modified (out of scope per the task).

The other three sections (`identity`, `corrections`, `akd-akl`) have no risky local state — `CorrectionCard`'s
own `open`/`rejectOpen` state lives inside each card, one level below the accordion, and isn't affected by
the parent section's mount/unmount.

## 6. `job.actionSignals` vs. prior local recomputation

Per the task's instruction to confirm before switching sourcing (not silently trust the server field):

- **`identityCorrectionPending`**: the server computes this from the single most-recent correction only
  (`calibration-jobs.service.ts` include: `identityCorrections: { orderBy: { createdAt: "desc" }, take: 1 }`,
  then `status === "PENDING_REVIEW"`). Combined with the server-enforced single-pending invariant
  (`IDENTITY_CORRECTION_ALREADY_PENDING` — at most one `PENDING_REVIEW` correction can exist on a job at a
  time), this is equivalent to the page's existing `hasPendingCorrection = correctionRows.some(c => c.status
  === "PENDING_REVIEW")`. **No divergence.** `hasPendingCorrection` was left in place for the submit-button
  disable logic (lower risk, unchanged); only the status-strip chip and auto-expand read `job.actionSignals`.
- **`referenceEquipmentNeedsApproval`**: no prior local equivalent existed on this page. The closest local
  value, `hasRecordedOverride` (inside `ReferenceEquipmentSection`), means something different — "an
  override has already been recorded" (used for a permission-gating check), not "needs approval." This is a
  new signal being surfaced for the first time, not a value being switched over — nothing to diverge from.
- **AKD/AKL** — `job.akdAklApprovalStatus` was already read directly by the page (`AkdAklStatusBadge`);
  unchanged.

## 7. Auto-expand / polling-stability design

```ts
const [openSections, setOpenSections] = useState<string[]>([]);
const didInitExpand = useRef(false);

useEffect(() => {
  if (didInitExpand.current || !query.data) return;
  didInitExpand.current = true;
  const initial: string[] = [];
  if (query.data.actionSignals.referenceEquipmentNeedsApproval) initial.push("ref-equipment");
  if (query.data.actionSignals.identityCorrectionPending) initial.push("corrections");
  if (query.data.akdAklApprovalStatus === "PENDING_REVIEW") initial.push("akd-akl");
  setOpenSections(initial);
}, [query.data]);
```

The effect depends on `query.data` (so it can wait for the first successful load) but the `didInitExpand`
ref guard makes the body run exactly once per page visit. Every subsequent 6s poll re-renders the component
with new `query.data` but the effect returns immediately — `openSections` is never touched again by a poll,
so a user's manual expand/collapse choices survive polling cycles by construction.

## 8. Verification run

```
cd apps/portal && npx tsc --noEmit
→ exit 0

cd apps/portal && npx vitest run
→ Test Files 15 passed (15)
→ Tests 146 passed (146)
```

## 9. Not verified in this pass

No browser automation tool was available in this session, so the 3 manual scenarios from the task were
**not executed**:

1. Mixed-status job (pending override + approved BA) — confirm correct sections auto-expand, chip
   accuracy, click-to-expand-and-scroll.
2. Start editing a reference-equipment override reason or quality-review note, collapse that section,
   re-expand — confirm the in-progress text is still there.
3. Leave the page open through 2–3 polling cycles — confirm no flicker/reset of accordion open/closed state.

Items 2 and 3 are addressed structurally in §5 and §7 respectively (code-level guarantees: `forceMount`
keeps the DOM/state mounted; the `didInitExpand` guard makes the auto-expand effect run once). Item 1
depends on live data and a real click-through and could not be substituted with a unit test in this pass.
Recommend running all three by hand before deploy.
