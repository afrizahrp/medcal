/**
 * UX-07 — shared save-state vocabulary.
 *
 * Every data-entry screen in tech-pwa keeps its own save *mechanism*
 * (autosave-on-change for Kontrol Alat; explicit "Simpan" for Physical Check
 * and the three measurement-entry variants; step-gated final submit for
 * Identity Correction). This module does not touch any of that — it only
 * gives every mechanism the same small vocabulary for answering "is my
 * input safe right now?": saving / saved / error / idle (nothing to report).
 *
 * `computeSaveStatus` is a pure function so the precedence rules (a save in
 * flight always wins over a stale "saved" flag; an error only shows once the
 * request has actually settled) can be unit tested without any DOM/React
 * test infrastructure, per this repo's Vitest convention.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveStatusInput {
  /** The mutation for this field/section is currently in flight. */
  isPending: boolean;
  /** The mutation's most recent attempt failed and has not been retried since. */
  isError: boolean;
  /**
   * A transient flag the caller sets to true right after a successful save,
   * and clears back to false as soon as the user makes a new edit (so
   * "saved" can never be shown while the field is actually dirty again).
   */
  justSaved: boolean;
}

/**
 * Precedence: in-flight always wins (it is the most current truth) — then a
 * settled error — then a transient "saved" acknowledgement — otherwise
 * nothing to report (idle: no attempt has happened yet, or the caller has
 * already cleared its own transient flags).
 */
export function computeSaveStatus(input: SaveStatusInput): SaveStatus {
  if (input.isPending) return "saving";
  if (input.isError) return "error";
  if (input.justSaved) return "saved";
  return "idle";
}

export interface SaveStatusPresentation {
  label: string;
  className: string;
}

const PRESENTATION: Record<Exclude<SaveStatus, "idle">, SaveStatusPresentation> = {
  saving: { label: "Menyimpan…", className: "text-slate-500" },
  saved: { label: "Tersimpan", className: "text-emerald-600" },
  error: { label: "Gagal disimpan", className: "text-red-600" },
};

/** Returns null for "idle" — the shared indicator renders nothing then. */
export function saveStatusPresentation(status: SaveStatus): SaveStatusPresentation | null {
  if (status === "idle") return null;
  return PRESENTATION[status];
}
