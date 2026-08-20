"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@medcal/shared";

export type EmailFolder = "INBOX" | "SENT" | "DRAFTS" | "TRASH";
export type EmailStatus = "UNREAD" | "READ";

export type EmailListRow = {
  id: string;
  folder: EmailFolder;
  status: EmailStatus;
  isStarred: boolean;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  snippet: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  suggestedLead: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
};

export type EmailListResponse = {
  data: EmailListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type EmailStatistics = {
  inbox: number;
  sent: number;
  drafts: number;
  trash: number;
  unread: number;
};

export type EmailDetail = {
  id: string;
  folder: EmailFolder;
  status: EmailStatus;
  isStarred: boolean;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  ccEmail: string | null;
  bccEmail: string | null;
  subject: string;
  body: string;
  textBody: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  messageId: string | null;
  parentEmailId: string | null;
  suggestedLead: { id: string; name: string; email: string } | null;
  lead: { id: string; name: string; email: string } | null;
  leadCandidates: Array<{ id: string; name: string; email: string }>;
  contactMessage: { id: string; subject: string | null } | null;
  sentBy: { id: string; name: string | null } | null;
  parentEmail: { id: string; subject: string } | null;
};

export type EmailsQueryParams = {
  folder: EmailFolder;
  search: string;
  status: EmailStatus | "";
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

const EMAILS_QUERY_KEY = "emails" as const;

function buildEmailsSearchParams(params: EmailsQueryParams): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("folder", params.folder);
  if (params.search.trim()) qs.set("search", params.search.trim());
  if (params.status) qs.set("status", params.status);
  qs.set("sortBy", params.sortBy);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs;
}

export function useEmailsQuery(params: EmailsQueryParams) {
  return useQuery({
    queryKey: [
      EMAILS_QUERY_KEY,
      params.folder,
      params.search,
      params.status,
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: () =>
      apiFetch<EmailListResponse>(`/emails?${buildEmailsSearchParams(params).toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useEmailStatisticsQuery() {
  return useQuery({
    queryKey: ["emails-statistics"],
    queryFn: () => apiFetch<EmailStatistics>("/emails/statistics"),
  });
}

export function useEmailDetailQuery(id: string) {
  return useQuery({
    queryKey: ["email", id],
    queryFn: () => apiFetch<EmailDetail>(`/emails/${id}`),
    enabled: Boolean(id),
  });
}

export function useMarkEmailRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EmailStatus }) =>
      apiFetch<EmailDetail>(`/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["email", variables.id] });
    },
  });
}

export function useMoveEmailToTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/emails/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}

export function useRestoreEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/emails/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}

export function usePermanentDeleteEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/emails/${id}/permanent`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}

type UpdateEmailLeadInput = {
  id: string;
  /**
   * null = remove association
   * string = confirm/change association
   */
  leadId: string | null;
};

export function useUpdateEmailLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, leadId }: UpdateEmailLeadInput) =>
      apiFetch<EmailDetail>(`/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ leadId }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["email", variables.id] });
    },
  });
}

export function useDismissSuggestedLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiFetch<EmailDetail>(`/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ suggestedLeadId: null }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["email", variables.id] });
    },
  });
}

export function useSyncInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{
        success: true;
        fetched: number;
        created: number;
        duplicates: number;
        skippedMalformed: number;
        suggested: number;
      }>("/emails/sync", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}

export type EmailComposePayload = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  parentEmailId?: string;
  contactMessageId?: string;
  leadId?: string;
};

export type EmailDraftPayload = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  parentEmailId?: string;
  contactMessageId?: string;
};

export function useSendEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmailComposePayload) =>
      apiFetch<EmailDetail>("/emails", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}

export function useSaveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmailDraftPayload) =>
      apiFetch<EmailDetail>("/emails/draft", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}

export type EmailDraftUpdatePayload = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
};

export function useUpdateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmailDraftUpdatePayload }) =>
      apiFetch<EmailDetail>(`/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["email", variables.id] });
    },
  });
}

export function useSendDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EmailDetail>(`/emails/${id}/send`, { method: "POST" }),
    onSuccess: (_data, _id) => {
      queryClient.invalidateQueries({ queryKey: [EMAILS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["emails-statistics"] });
    },
  });
}
