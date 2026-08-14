import { AppError } from "../errors";

/**
 * Thin fetch wrapper for authenticated frontend clients calling apps/api
 * directly (never web-api). Browser callers rely on credentials:"include"
 * to send the session cookie; server components have no browser cookie jar
 * and must pass a "cookie" header explicitly via init.headers.
 */
export class ApiError extends AppError {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super("API_ERROR", message, status);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  return (await response.json()) as T;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
