/** Locked-plan email normalization for Lead suggestion (exact match only). */
export function normalizeEmailAddress(email: string): string {
  return email.toLowerCase().trim().replace(/\s+/g, "");
}
