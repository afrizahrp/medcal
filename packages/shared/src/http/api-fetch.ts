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
    public readonly data?: { code?: string; message?: string } & Record<string, unknown>,
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
    let data: ({ code?: string; message?: string } & Record<string, unknown>) | undefined;
    try {
      data = (await response.json()) as typeof data;
    } catch {
      data = undefined;
    }
    throw new ApiError(response.status, data?.message ?? response.statusText, data);
  }

  // Nest's ExpressAdapter.reply() special-cases a null/undefined controller
  // return value (isNil) to `response.send()` with no argument — an empty
  // body, not the JSON literal "null" — e.g. GET .../certificate when none
  // exists yet, or any 204 No Content. response.json() throws on an empty
  // body, so read as text first and treat "" as null.
  const text = await response.text();
  return (text === "" ? null : JSON.parse(text)) as T;
}

export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...init.headers },
  });

  if (!response.ok) {
    let data: ({ code?: string; message?: string } & Record<string, unknown>) | undefined;
    try {
      data = (await response.json()) as typeof data;
    } catch {
      data = undefined;
    }
    throw new ApiError(response.status, data?.message ?? response.statusText, data);
  }

  return response.blob();
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
