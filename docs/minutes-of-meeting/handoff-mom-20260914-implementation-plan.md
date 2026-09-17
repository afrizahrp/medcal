# Handoff — MoM (Demo) 14/09/2026 Implementation Plan

## Project context

**Medcal / Kalibrasi Medika** — medical equipment calibration management SaaS for PKM
(Presisi Kalibrasi Medika). Monorepo (Turborepo + pnpm), Prisma + PostgreSQL. Apps:
`web` (B2B site), `web-api` (public edge), `api` (Nest business API), `portal`
(customer + admin), `tech-pwa` (technician PWA, field use).

Source document: `docs/minutes-of-meeting/mom-20260914.xlsx`, sheet `Part-1` — notes from
a demo/meeting with the PKM customer on 2026-09-14, containing 9 items (numbering in the
source file is sequential 1–9, already corrected by the product owner from an earlier
duplicate-numbered draft — use these numbers as-is, they are final).

## How this work has been executed (for consistency going forward)

- **Staged task methodology**: each item is given to an AI coding agent (Claude Code,
  sometimes Cursor for audit-only passes) as a written task brief. Stage 1 = read-only
  audit/investigation + proposed options, no code changes, hard stop for human approval.
  Stage 2 = implementation only, following the approved plan, with a mandatory checkpoint
  after each individual change — no big-bang multi-item implementation in one pass.
- A human reviewer (the product owner) reviews every Stage 1 report and every Stage 2
  checkpoint before the agent proceeds to the next step.
- Items assessed as low-risk/independent of any actively-in-progress schema work were
  grouped into one execution batch ("Batch A") and implemented together, item by item,
  with review between each.

## Item-by-item status

| # | Requirement (from MoM) | Design decision | Status |
|---|---|---|---|
| 1 | Customer can still correct/add items to a requisition after it's approved/submitted | Before "Start" is clicked on the WorkOrder/SPK, all transactions remain editable | **Not started** — separate module (WorkOrder/Requisition), independent of everything else here |
| 2 | Quotation totals already include tax; when "Include" mode is selected, the tax amount line itself should not be shown | Hide the tax line only when `Tax.isExclude === false`; total stays as-is; read live via `taxCode`, no snapshot; Quotation only, PO intentionally not touched | **Done** |
| 3 | Device name shown on Quotation/PO/WorkOrder should be the customer-given alias, not just the master name | Alias name displays on top, master/canonical name displays below it (secondary); applied via a shared helper across Quotation, PO, WorkOrder (UI + PDF), plus one additional surface found during implementation (the requisition detail page) that shared the same display problem | **Done** |
| 4 | AKD/AKL should not be a required field — no validation notification, ever | Hide all AKD/AKL labels and inputs everywhere (Portal forms, and the equivalent correction point inside tech-pwa's Identity Correction flow), including historical read-only display — full hide, no exceptions. Underlying schema/data untouched. Escalation/gate workflow logic (separate, functional, not just a declaration field) explicitly untouched | **Done** |
| 5 | Some parameters need a value entered as a **symbol**, not a number — the device being calibrated sometimes shows a non-numeric symbol on its display instead of a reading | `DeviceCalibrationParameter.calibrationValueType` gets a `SYMBOL` option alongside `NUMBER`, selected per-parameter by whoever maintains the master catalog (an admin-set classification, not a per-reading override) | **Investigation prompt prepared, not yet run.** Open question: what changes downstream in `MeasurementResult` (the technician's actual recorded reading) to store a symbol value once a parameter is classified `SYMBOL` — storage type, validation, and how it interacts with the locked rule that pass/fail and tolerance are computed from raw numeric values only. Also needs confirming whether an existing in-app symbol-picker UI component is available in the technician-facing app or only in the admin app today. |
| 6 | Model/brand/serial number input (recorded when a job is ON_SITE or IN_LAB) should be editable by both admin and technician roles | Open access to both roles | **Parked/not started — larger than expected.** A prior audit found this isn't a simple permission toggle: today only ADMIN can create/update `Device` master records; technicians can only link to an *existing* Device via Identity Correction, with no "create new Device in the field" flow at all. Satisfying this requirement needs new RBAC + a new create/update flow for technicians, not just an access grant — recommended as its own design task before implementation. |
| 7 | Whether BAI (a field verification/sign-off step) should be mandatory in the system | Rather than removing all constraints, build a single system-wide strictness setting (e.g. Moderate / Strict) that governs this and similar constraints across every module (quotation → WorkOrder → tech-pwa → portal) | **Deferred — needs its own Stage 1 design task.** This is a cross-cutting configuration mechanism, not a one-field change, and has not been scoped yet. |
| 8 | Only one of "device ID" or "serial number" should be mandatory — technicians only think in terms of serial number | Relabel the "Device ID" UI field to "Serial No" wherever it appears in the requisition flow, while continuing to write to the same underlying `device_id` column (no rename of the actual field/key). A separate, unrelated `CalibrationJob.deviceId` (a foreign key used for job identity matching) keeps its own existing "Device ID" label and was explicitly not touched | **Done** — including the Excel import template and importer, which still accepts the old "Device ID" header for backward compatibility with templates already downloaded by users. |
| 9 | Add fixed document codes to every downloaded PDF: WO = F.MU.07, LK = F.MT.LK.01.44, Kontrol Alat = F.MU.08 | — | **Not started.** Planned to be done together with end-to-end verification of the recently-built LK PDF export feature, since both touch the same PDF-generation code paths. |

## Open items requiring a decision or next task, in one place

- **#5** — task brief is ready (investigation only, no implementation yet); needs to be
  run before the technician-facing measurement-entry UI ("Stage B" of a separate,
  unrelated MeasurementResult schema workstream) is built, since the outcome shapes that
  UI's structure.
- **#6** — needs a dedicated Stage 1 design task (RBAC model + technician-facing
  create/update-Device flow) before any implementation.
- **#7** — needs a dedicated Stage 1 design task (cross-module strictness/configuration
  mechanism) before any implementation.
- **#9** — ready to schedule whenever the LK PDF export feature's end-to-end verification
  happens; no separate design decision needed, just execution.
- **#1** — ready to schedule as its own small task; no dependency on anything else here.
