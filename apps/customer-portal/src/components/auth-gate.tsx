"use client";

import { useAuth } from "@medcal/auth/client";
import { useCustomerLink } from "../lib/use-customer-link";
import { PendingApproval } from "./pending-approval";
import { AccessDenied } from "./access-denied";
import { ErrorState, LoadingState } from "./status-blocks";

/**
 * The architectural boundary for every customer-specific route in this app.
 * States, checked in order:
 *  1. loading      — session/membership bootstrap in flight.
 *  2. forbidden     — account exists but is disabled (ACCOUNT_DISABLED) or
 *                      another non-pending 403 from GET /me.
 *  3. pending        — no ACTIVE membership yet (fresh self-registration).
 *  4. ready, link lookup failed — a server/network failure is NOT an answer
 *     about this account: show a retryable error, never the pending screen.
 *  5. ready + no CustomerUserLink — has a membership, but the CUSTOMER role
 *     alone is never proof of access to a specific Customer (see
 *     use-customer-link.ts) — shown the pending experience.
 *  6. ready + CustomerUserLink    — the only state that renders children.
 *
 * UX/navigation only, same as @medcal/auth's own AuthProvider — actual
 * customer-data authorization is enforced server-side on every request, never
 * by this client-side gate alone.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { bootstrapStatus } = useAuth();
  const customerLinkQuery = useCustomerLink(bootstrapStatus === "ready");

  if (bootstrapStatus === "loading") {
    return <LoadingState fullPage />;
  }

  if (bootstrapStatus === "forbidden") {
    return <AccessDenied />;
  }

  if (bootstrapStatus === "pending") {
    return <PendingApproval />;
  }

  // bootstrapStatus === "ready" from here on.
  if (customerLinkQuery.isError) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <ErrorState
          title="Data akun belum bisa dimuat"
          message="Terjadi gangguan saat memeriksa akun Anda. Coba lagi dalam beberapa saat."
          onRetry={() => void customerLinkQuery.refetch()}
          retrying={customerLinkQuery.isFetching}
        />
      </main>
    );
  }

  if (customerLinkQuery.isLoading || customerLinkQuery.isPending) {
    return <LoadingState fullPage />;
  }

  if (!customerLinkQuery.data?.customerId) {
    return <PendingApproval />;
  }

  return <>{children}</>;
}
