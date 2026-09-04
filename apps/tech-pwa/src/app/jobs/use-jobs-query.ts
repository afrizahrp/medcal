"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type { TechJobListResponse } from "../../lib/calibration/types";

const PAGE_SIZE = 100;

export function useJobsQuery() {
  return useQuery({
    queryKey: ["jobs", "assigned"],
    queryFn: () =>
      apiFetch<TechJobListResponse>(
        `/calibration-jobs?assignedToMe=true&pageSize=${PAGE_SIZE}&sortBy=createdAt&sortDir=desc`,
      ),
    // Override the app default (refetchOnWindowFocus: false) — refresh when the
    // installed app is brought back to the foreground.
    refetchOnWindowFocus: true,
  });
}
