"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";
import type {
  ContactMessageRow,
  ContactMessageStatistics,
  ContactStatus,
  ContactTopic,
  GetMessageFrom,
  LeadStatus,
  NeedsReviewItem,
} from "./leads-ui";
import { LEAD_DETAIL_QUERY_KEY } from "../customers/use-customers-query";
import { notifyContactMessagesChanged } from "../../../lib/contact-messages-sync";

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
    refetchOnMount: "always",
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
    refetchOnMount: "always",
  });
}

export function useContactTopicsQuery() {
  return useQuery({
    queryKey: ["contact-topics"],
    queryFn: () => apiFetch<ContactTopic[]>("/contact-topics"),
    staleTime: 5 * 60_000,
  });
}

// Leads/[id] detail — same response shape /leads/:id has always returned;
// co-located here (not leads-ui.tsx's `Lead`/`LatestContactMessage`, which
// model the Leads List table's nested preview, a narrower shape) following
// the email module's EmailDetail precedent (use-emails-query.ts).
export interface LeadDetailContactMessage {
  id: string;
  getFrom: GetMessageFrom;
  status: ContactStatus;
  subject: string | null;
  message: string;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  topic: ContactTopic | null;
  createdAt: string;
}

export interface LeadDetail {
  id: string;
  status: LeadStatus;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  customerId: string | null;
  createdAt: string;
  contactMessages: LeadDetailContactMessage[];
}

// Canonical key already reserved for this resource by
// useConvertLeadToCustomer's onSuccess invalidation (use-customers-query.ts)
// — previously invalidated nothing because no useQuery consumed it yet.
export function useLeadDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: [LEAD_DETAIL_QUERY_KEY, id],
    queryFn: () => apiFetch<LeadDetail>(`/leads/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Reuses the same guarded PATCH /contact-messages/:id/status endpoint the
 * Leads/[id] status dropdown already called before this change — for both
 * that manual dropdown and the automatic PENDING->READ mark-as-read on
 * opening Leads/[id] (E2E leads statistics sync audit, 2026-08-25). The
 * backend enforces the READ transition guard (PENDING->READ only,
 * ContactMessagesService.updateStatus); this hook only requests a status
 * change, it never decides one.
 */
export function useUpdateContactMessageStatus() {
  return useMutation({
    mutationFn: ({ messageId, status }: { messageId: string; status: ContactStatus }) =>
      apiFetch<LeadDetailContactMessage>(`/contact-messages/${messageId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      // Same bus Leads List and Chat/[id] already publish to/subscribe via
      // (contact-messages-sync.ts) — management-shell.tsx's existing
      // subscriber invalidates the canonical contact-messages/statistics/
      // lead-detail queries from here, so Leads List, Leads/[id], and Chat
      // all pick up the change without a page reload.
      notifyContactMessagesChanged();
    },
  });
}

/**
 * Lead.status (aggregate lead workflow field) is distinct from
 * ContactMessage.status — this mutation intentionally does NOT publish to
 * notifyContactMessagesChanged(), matching Leads/[id]'s original behavior of
 * never notifying that bus for a Lead-status-only change. Scoped, direct
 * invalidation of just this lead's detail query instead (same pattern
 * useUpdateCustomer/useConvertLeadToCustomer already use for their own
 * single-resource invalidation).
 */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      apiFetch<LeadDetail>(`/leads/${leadId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [LEAD_DETAIL_QUERY_KEY, variables.leadId] });
    },
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
      queryClient.invalidateQueries({ queryKey: [CONTACT_MESSAGES_QUERY_KEY], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["leads-needs-review"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["contact-messages-statistics"], refetchType: "all" });
    },
  });
}
