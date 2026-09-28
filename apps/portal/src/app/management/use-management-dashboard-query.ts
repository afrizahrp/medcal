"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, type DashboardPeriodPreset, type DashboardSummaryResponse } from "@medcal/shared";

export interface ManagementDashboardQuery {
  period: DashboardPeriodPreset;
  from?: string;
  to?: string;
}

export function useManagementDashboardQuery(query: ManagementDashboardQuery, enabled: boolean) {
  const params = new URLSearchParams({ period: query.period });
  if (query.period === "custom" && query.from && query.to) {
    params.set("from", query.from);
    params.set("to", query.to);
  }

  return useQuery({
    queryKey: ["management-dashboard", query.period, query.from ?? "", query.to ?? ""],
    queryFn: () => apiFetch<DashboardSummaryResponse>(`/dashboard/management-summary?${params.toString()}`),
    enabled: enabled && (query.period !== "custom" || Boolean(query.from && query.to)),
  });
}
