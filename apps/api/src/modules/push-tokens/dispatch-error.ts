/**
 * Non-sensitive description of a notification-dispatch failure for logs:
 * error class and Prisma/Firebase code only. Messages are deliberately omitted —
 * Prisma/driver messages can embed query parameters (ids, emails, tokens).
 */
export function describeDispatchError(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name}:${code}` : error.name;
}
