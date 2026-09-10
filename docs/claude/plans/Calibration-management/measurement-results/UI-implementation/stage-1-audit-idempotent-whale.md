# Stage 1 Audit — CalibrationJob Detail Page Structure (read-only)

Scope: [apps/portal/src/app/management/calibration-jobs/[id]/page.tsx](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx) and its data hooks / util files. No code changed. This is the audit deliverable for the "status-strip + collapsible" restructuring idea — HARD STOP before Stage 2.

## 1. Current structure of the 5 sections (all facts, from the file)

Everything lives in **one file**, `page.tsx` (1908 lines). There are no separate section components imported from elsewhere — each "section" is either inline JSX inside the default export or a locally-defined function in the same file:

| Section (screenshot) | Where | Shape |
|---|---|---|
| Identity fields (declared device, resolved type, AKD/AKL declared/observed, serial, requisition line, Assigned Device) | Inline JSX in `CalibrationJobDetailPage`, lines ~376–434 | Plain `<dl>`/`<DetailField>` block, reads directly off `job` |
| Alat Referensi (reference equipment) | `<ReferenceEquipmentSection>` (local function, line 643) → `<ReferenceEquipmentEditor>` / `<ReferenceEquipmentCard>` | Owns real local state (`selection` via `useState`, per-candidate toggle/reason) inside `ReferenceEquipmentEditor` |
| Hasil Pengukuran (measurement results) | `<QualityReviewPanel>` (local function, line 1020) | Owns local state (`notes`, `rejectOpen`); reads `parametersQuery`/`resultsQuery` props |
| Identity Corrections (Berita Acara) | Inline list in `CalibrationJobDetailPage` (lines ~463–515) mapping to `<CorrectionCard>` (local function, line 1170) | Each `CorrectionCard` owns its own `open`/`rejectOpen`/pdf state |
| AKD/AKL/NIE Approval | Inline JSX in `CalibrationJobDetailPage`, lines ~517–544 | Plain `<dl>`, reads directly off `job` |

None of these are separate files/components importable elsewhere — "wrapping in a collapsible" means editing this one file's JSX, not swapping a prop into an existing reusable section component.

## 2. Polling — verified per query, not assumed

Backing hooks (`use-calibration-jobs-query.ts`, `use-identity-corrections-query.ts`, `use-reference-equipment-used-query.ts`, `use-measurement-results-query.ts`):

| Hook (drives which section) | `refetchInterval` | `refetchOnWindowFocus` |
|---|---|---|
| `useCalibrationJob` (identity fields, AKD/AKL section, Assigned Device, `job.actionSignals`) | **none** | **none** |
| `useIdentityCorrections` (Identity Corrections list) | **6000ms** | **true** |
| `useReferenceEquipmentUsed` | **none** (comment: deliberately no interval — would clobber an in-progress override-reason edit) | true |
| `useReferenceEquipmentCandidates` | none | none |
| `useMeasurementParameters` / `useMeasurementResults` | none | none |

**The job's own query — which backs 3 of the 5 sections plus the status badges — has zero polling.** Only Identity Corrections auto-refreshes on an interval. A status-strip design that assumes "the page already polls, so badges stay live" is wrong for 4 of 5 sections; it only holds for Identity Corrections. Reference equipment deliberately avoids interval polling to protect in-progress edits — a status strip re-triggering that query on an interval would conflict with that existing design decision.

## 3. Existing per-section "status/needs-attention" signals

- **Reference equipment override**: no boolean helper exists in [calibration-job-utils.ts](apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts), but the data needed is already on the page: `refEquipment.data?.some(u => u.validityOverridden)` (used inline already, line 690, as `hasRecordedOverride`) and, more directly, **`job.actionSignals.referenceEquipmentNeedsApproval`** (see below) is already fetched and unused.
- **Identity corrections `MENUNGGU_REVIEW`**: not an enum value — it's the Indonesian label for status `PENDING_REVIEW`, defined in `calibration-jobs-ui.tsx` line 239 (`IDENTITY_CORRECTION_STATUS_LABELS.PENDING_REVIEW = "Menunggu Review"`). Page already computes `hasPendingCorrection = correctionRows.some(c => c.status === "PENDING_REVIEW")` (line 326) from `corrections.data`. Equivalent signal `job.actionSignals.identityCorrectionPending` is also already on `job` but currently unused by the page.
- **AKD/AKL status**: `job.akdAklApprovalStatus` is already read directly (`AkdAklStatusBadge`, line 521). `akdAklGateOpenedBy`/reopen note: the page does NOT read a field named `akdAklGateOpenedBy` — it derives `gateReopenedBy` locally (line 327) by scanning `correctionRows` for `status === "APPROVED" && akdAklGateReopened`. Confirm the exact field/naming from "today's earlier work" before assuming it surfaces as a named job field — as of this file it does not; it's still derived client-side from corrections.
- **Measurement complete/incomplete**: **no such signal exists anywhere** — confirmed by search across `apps/api/src/modules/calibration-jobs` (no `measurementComplete`, `allParametersRecorded`, etc.) and `CalibrationJobActionSignals` (only `identityCorrectionPending` and `referenceEquipmentNeedsApproval` today; comment at [calibration-job-action-signals.ts:14](packages/shared/src/utils/calibration-job-action-signals.ts#L14) explicitly says future signals like this slot in later). This would need new logic — likely comparing `resultsQuery.data.length` against expected parameter/replicate count — and there is no server-computed field to compare against; a naive client count needs to know how many rows *should* exist, which the page does not currently derive.

**Important correction to the task's framing**: `job.actionSignals` (both `identityCorrectionPending` and `referenceEquipmentNeedsApproval`) is **already present in the data this page fetches** (GET `/calibration-jobs/:id` calls `service.findOneRow`, which returns `CalibrationJobListRow` — `CalibrationJobDetail & { actionSignals, needsReferenceEquipmentReview }`, confirmed in [calibration-jobs.controller.ts:106-113](apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts#L106-L113) and [calibration-jobs.service.ts:526-533](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L526-L533)). The page simply never reads `job.actionSignals` today — it recomputes an equivalent locally for corrections and doesn't use it for reference equipment at all. A status strip could read `job.actionSignals` directly for 2 of the 4 needed signals, with no new API field. Only "measurement complete" needs new logic/decision; AKD/AKL gate-reopened note needs the field name double-checked, not assumed.

## 4. "Calibration Parameter collapsible component" — does not exist as described

There is no `apps/portal/src/app/management/calibration-parameters/` directory. The closest thing is `apps/portal/src/app/management/device-calibration-parameters/device-calibration-parameters-ui.tsx`, which has an expand/collapse UI (`DeviceTypeParameterTable` → `ChildRows`, lines 466-532) — but it is:
- A **`<table>`/`<tbody>` row-expansion pattern** (click a `<tr>` to reveal child `<tr>`s via `colSpan`), not a generic wrapper component with children.
- Tightly coupled to `DeviceCalibrationParameterGroupRow` (device type + capabilities + parameters) and to `@dnd-kit` sortable reordering (`canReorder`, `reorder` handlers, `SortableContext`).
- Not exported/shaped for arbitrary section content (identity `<dl>`, a form-editor, a data table, a card list, another `<dl>`) — reusing it "as-is" for these 5 sections is not straightforward and would require a rewrite, not a wrap.

**A genuinely reusable primitive already exists instead**: `apps/portal/src/components/ui/accordion.tsx` (Radix `@radix-ui/react-accordion` wrapper: `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionContent`), already used for arbitrary content elsewhere in Portal — see `NeedsReviewAccordion` in [leads-ui.tsx:348-373](apps/portal/src/app/management/leads/leads-ui.tsx#L348-L373), which wraps a heterogeneous list inside `AccordionContent` with a badge/count in the trigger. This is the pattern that actually fits a "status-strip + collapsible" plan, not the device-calibration-parameters table.

## 5. Structural obstacles to a straightforward status-strip + collapsible wrap

- **Reference equipment section owns real local state** (`ReferenceEquipmentEditor`'s `selection` state — per-candidate checkbox + override-reason text). Collapsing this section by default (as an accordion typically does) risks losing in-progress edits if the accordion unmounts `AccordionContent` on collapse (Radix accordion does unmount content by default), or needs `forceMount`/CSS-hide instead of unmount to be safe. Same risk applies to `QualityReviewPanel` (`notes` textarea state) and each `CorrectionCard` (`open`, `rejectOpen`, pdf state) — though those are less likely to be mid-edit when collapsed.
- **`dialog` state is centralized** in `CalibrationJobDetailPage` (`useState<"escalate"|"approve"|"reject"|"submit-correction"|null>`) and the AKD/AKL action buttons (Escalate/Approve/Reject) live in a page-level footer (lines 546-565), separate from the AKD/AKL section's `<dl>` (lines 517-544). Wrapping "AKD/AKL section" in its own collapsible would either need to also move those action buttons inside it (behavior change) or leave them stranded outside the collapsible they logically belong to.
- **No job-level "measurement complete" signal** (section 3) — the status strip's badge for that section cannot be "confirmed working," only newly invented, and needs a product decision on what "complete" means (all parameters have ≥1 result row? matches expected replicate count? something else) before it can be computed at all.
- **Reference equipment has no interval polling by design** (section 2) — a status-strip badge for that section either reads stale data between window-focus refetches, or Stage 2 needs to decide whether to add polling there and risk the clobbering the existing code was written to avoid.

## Net assessment

The "status strip + collapsible sections" plan is workable, but two premises in the original task need correcting before Stage 2 is scoped:
1. Polling already exists for Identity Corrections only, not page-wide — a status strip cannot assume live data for the other 4 sections without either accepting staleness or adding polling (with the reference-equipment caveat above).
2. There is no existing "Calibration Parameter collapsible" to reuse; the existing generic `Accordion` primitive (already proven on `leads-page-client.tsx`) is the correct reuse target instead, but content unmount-on-collapse needs to be handled carefully for the two sections with live local edit state (reference equipment editor, quality review notes).
