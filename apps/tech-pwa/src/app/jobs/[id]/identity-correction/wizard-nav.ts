"use client";

/**
 * One-shot signal that the user deliberately opened the Identity Correction
 * wizard by tapping "Ajukan Koreksi Identitas" — as opposed to landing on a
 * wizard URL some other way: a physical Back press into a stale history entry
 * after submitting, or a mid-wizard page refresh. The wizard layout consumes
 * this once on mount; any entry without the intent is bounced to Job Saya so
 * the user never lands in a half-initialised or already-submitted wizard.
 */
let pendingJobId: string | null = null;

export function markWizardEntryIntent(jobId: string): void {
  pendingJobId = jobId;
}

export function consumeWizardEntryIntent(jobId: string): boolean {
  if (pendingJobId === jobId) {
    pendingJobId = null;
    return true;
  }
  return false;
}
