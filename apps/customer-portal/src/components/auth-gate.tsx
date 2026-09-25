"use client";

import { useAuth } from "@medcal/auth/client";
import { useCustomerLink } from "../lib/use-customer-link";
import { PendingApproval } from "./pending-approval";
import { AccessDenied } from "./access-denied";

/**
 * The architectural boundary for every customer-specific route in this app.
 * Four states, checked in order:
 *  1. loading      — session/membership bootstrap in flight.
 *  2. forbidden     — account exists but is disabled (ACCOUNT_DISABLED) or
 *                      another non-pending 403 from GET /me.
 *  3. pending        — no ACTIVE membership yet (fresh self-registration).
 *  4. ready + no CustomerUserLink — has a membership, but the CUSTOMER role
 *     alone is never proof of access to a specific Customer (see
 *     use-customer-link.ts) — still shown the pending experience.
 *  5. ready + CustomerUserLink    — the only state that renders children.
 *
 * UX/navigation only, same as @medcal/auth's own AuthProvider — actual
 * certificate-data authorization is enforced server-side (a future phase),
 * never by this client-side gate alone.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { bootstrapStatus } = useAuth();
  const customerLinkQuery = useCustomerLink(bootstrapStatus === "ready");

  if (bootstrapStatus === "loading") {
    return <main className="p-8 text-center text-slate-500">Loading…</main>;
  }

  if (bootstrapStatus === "forbidden") {
    return <AccessDenied />;
  }

  if (bootstrapStatus === "pending") {
    return <PendingApproval />;
  }

  // bootstrapStatus === "ready" from here on.
  if (customerLinkQuery.isLoading) {
    return <main className="p-8 text-center text-slate-500">Loading…</main>;
  }

  if (!customerLinkQuery.data?.customerId) {
    return <PendingApproval />;
  }

  return <>{children}</>;
}
