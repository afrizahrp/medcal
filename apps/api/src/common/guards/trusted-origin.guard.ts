import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Origin check for cookie-authenticated browser mutations on custom routes.
 *
 * Better Auth's own `trustedOrigins` check only runs inside its router
 * (`/api/auth/*`); it never sees `/customer/*`. This guard applies the same
 * allow-list (`TRUSTED_ORIGINS`, exact match, the list CORS already uses) to the
 * routes it is attached to: the `Origin` header, else the `Referer`'s origin,
 * must match. With neither header, or an unlisted/opaque ("null") origin, the
 * request is refused with 403 before the handler runs.
 *
 * Attach it with `@UseGuards(TrustedOriginGuard)` on mutating routes only.
 */
export const ORIGIN_NOT_ALLOWED_CODE = "ORIGIN_NOT_ALLOWED";

function trustedOrigins(): string[] {
  return (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function headerValue(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : null;
}

function requestOrigin(headers: Record<string, string | string[] | undefined>): string | null {
  const origin = headerValue(headers.origin);
  if (origin) return origin === "null" ? null : origin.replace(/\/+$/, "");
  const referer = headerValue(headers.referer);
  if (!referer) return null;
  try {
    const parsed = new URL(referer);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const origin = requestOrigin(request.headers);
    if (!origin || !trustedOrigins().includes(origin)) {
      throw new ForbiddenException({ code: ORIGIN_NOT_ALLOWED_CODE, message: "Origin not allowed" });
    }
    return true;
  }
}
