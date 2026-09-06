"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { TechCalibrationJob, TechJobListResponse } from "../../lib/calibration/types";

/** API list max is 100 — fetch every page so customer/SPK counts are never undercounted. */
const PAGE_SIZE = 100;

async function fetchAllAssignedJobs(): Promise<TechJobListResponse> {
  const first = await apiFetch<TechJobListResponse>(
    `/calibration-jobs?assignedToMe=true&page=1&pageSize=${PAGE_SIZE}&sortBy=createdAt&sortDir=desc`,
  );

  if (first.totalPages <= 1) {
    return first;
  }

  const pages = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      apiFetch<TechJobListResponse>(
        `/calibration-jobs?assignedToMe=true&page=${i + 2}&pageSize=${PAGE_SIZE}&sortBy=createdAt&sortDir=desc`,
      ),
    ),
  );

  const data: TechCalibrationJob[] = [...first.data];
  for (const page of pages) {
    data.push(...page.data);
  }

  return {
    data,
    page: 1,
    pageSize: data.length,
    total: first.total,
    totalPages: first.totalPages,
  };
}

export function useJobsQuery() {
  return useQuery({
    queryKey: ["jobs", "assigned"],
    queryFn: fetchAllAssignedJobs,
    // Live-refresh — mirrors apps/portal's list hooks (use-calibration-jobs-query.ts):
    // poll every 6s and refetch on focus so status changes made in Portal
    // (e.g. an Identity Correction decision) surface without a manual reload.
    // refetchIntervalInBackground is left at its default (false), so polling
    // pauses while the PWA is backgrounded.
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}
