"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";

export interface CustomerLink {
  customerId: string | null;
}

export const CUSTOMER_LINK_QUERY_KEY = ["customer-link"] as const;

/**
 * "Which Customer (if any) is the signed-in user authorized to represent" —
 * GET /me/customer-link. Deliberately independent of @medcal/auth's generic
 * useMe()/capabilities (management-portal-shaped, role-only): CustomerUserLink,
 * not the CUSTOMER role alone, is the actual authorization signal here (see
 * Phase 1's staff approval flow). Only meaningful once a session exists —
 * callers gate `enabled` on that.
 */
export function useCustomerLink(enabled: boolean) {
  return useQuery({
    queryKey: CUSTOMER_LINK_QUERY_KEY,
    queryFn: () => apiFetch<CustomerLink>("/me/customer-link"),
    enabled,
  });
}
