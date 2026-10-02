"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import { customerQueryKey } from "./customer-query";
import { useSessionUserId } from "./session";

export interface CustomerLink {
  customerId: string | null;
}

/**
 * "Which Customer (if any) is the signed-in user authorized to represent" —
 * GET /me/customer-link. Deliberately independent of @medcal/auth's generic
 * useMe()/capabilities (management-portal-shaped, role-only): CustomerUserLink,
 * not the CUSTOMER role alone, is the actual authorization signal here (see
 * Phase 1's staff approval flow). Only meaningful once a session exists —
 * callers gate `enabled` on that. Keyed by user so one account's answer is
 * never reused for another.
 */
export function useCustomerLink(enabled: boolean) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: customerQueryKey(userId, "customer-link"),
    queryFn: () => apiFetch<CustomerLink>("/me/customer-link"),
    enabled: enabled && Boolean(userId),
  });
}
