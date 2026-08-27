"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { TaxOption } from "./quotations-ui";

export const TAXES_QUERY_KEY = "taxes" as const;

export function useTaxes(enabled = true) {
  return useQuery({
    queryKey: [TAXES_QUERY_KEY],
    queryFn: () => apiFetch<{ data: TaxOption[] }>("/taxes/options"),
    enabled,
  });
}
