"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  ContactMessageRow,
  ContactMessageStatistics,
  ContactStatus,
  ContactTopic,
  GetMessageFrom,
  NeedsReviewItem,
} from "./leads-ui";

export interface ContactMessageListResponse {
  data: ContactMessageRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ContactMessagesQueryParams {
  search: string;
  status: ContactStatus | "";
  source: GetMessageFrom | "";
  topicId: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

// This is the canonical query hook for MedCal's Management List pattern
// (2026-08-18) — named for what it actually fetches (`/contact-messages`,
// confirmed to be the resource driving this page's table; `/leads` exists
// but is unused by any frontend page today). A future
// `useCalibrationRequestsQuery` follows the identical shape: params object →
// stable queryKey → apiFetch → placeholderData.
const CONTACT_MESSAGES_QUERY_KEY = "contact-messages" as const;

function buildContactMessagesSearchParams(params: ContactMessagesQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  if (params.source) qs.set("getFrom", params.source);
  if (params.topicId) qs.set("topicId", params.topicId);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useContactMessagesQuery(params: ContactMessagesQueryParams) {
  return useQuery({
    queryKey: [
      CONTACT_MESSAGES_QUERY_KEY,
      params.search,
      params.status,
      params.source,
      params.topicId,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<ContactMessageListResponse>(
        `/contact-messages?${buildContactMessagesSearchParams(params).toString()}`,
      ),
    // keepPreviousData equivalent (TanStack Query v5) — the table keeps
    // rendering the previous page's rows while a new search/filter/sort/page
    // request is in flight, instead of flashing to an empty/loading state.
    placeholderData: (previous) => previous,
  });
}

// Independent, unfiltered/unpaginated supporting queries — same page, but
// not part of the searchable/sortable list contract, so they stay separate
// small useQuerys rather than being folded into the params object above.
export function useNeedsReviewQuery() {
  return useQuery({
    queryKey: ["leads-needs-review"],
    queryFn: () => apiFetch<NeedsReviewItem[]>("/leads/needs-review"),
  });
}

export function useContactStatisticsQuery() {
  return useQuery({
    queryKey: ["contact-messages-statistics"],
    queryFn: () => apiFetch<ContactMessageStatistics>("/contact-messages/statistics"),
  });
}

export function useContactTopicsQuery() {
  return useQuery({
    queryKey: ["contact-topics"],
    queryFn: () => apiFetch<ContactTopic[]>("/contact-topics"),
    staleTime: 5 * 60_000,
  });
}

type LeadResolution = { action: "ATTACH"; leadId: string } | { action: "CREATE_NEW" };

/**
 * Needs Review resolution as a mutation, invalidating every query the
 * resolution affects (the list, the needs-review panel, and the summary
 * cards) instead of the old page.tsx pattern of manually re-calling a single
 * `load()` function after every mutation.
 */
export function useResolveLeadMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, resolution }: { messageId: string; resolution: LeadResolution }) =>
      apiFetch<{ leadId: string | null }>(`/contact-messages/${messageId}/lead`, {
        method: "PATCH",
        body: JSON.stringify(resolution),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CONTACT_MESSAGES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["leads-needs-review"] });
      queryClient.invalidateQueries({ queryKey: ["contact-messages-statistics"] });
    },
  });
}
