"use client";

import { saveStatusPresentation, type SaveStatus } from "../../lib/calibration/save-status";

/**
 * UX-07 — the one shared save-state visual vocabulary reused across Kontrol
 * Alat (per-field autosave), Physical Check, and both measurement-entry
 * variants (explicit "Simpan"). It renders nothing for "idle" — every screen
 * keeps its own existing mechanism/timing; this only standardizes how
 * saving/saved/error are *worded and colored* once there's something to say.
 */
export function SaveStatusIndicator({
  status,
  className,
}: {
  status: SaveStatus;
  className?: string;
}) {
  const presentation = saveStatusPresentation(status);
  if (!presentation) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={["text-xs font-medium", presentation.className, className]
        .filter(Boolean)
        .join(" ")}
    >
      {presentation.label}
    </span>
  );
}
