/** Thin shared UI — extract shadcn components here only when reused ≥2 apps */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
