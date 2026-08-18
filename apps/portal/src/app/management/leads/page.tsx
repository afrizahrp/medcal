"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@medcal/shared";
import {
  type ContactMessageRow,
  type ContactTopic,
  type ContactMessageStatistics,
  type ContactStatus,
  type GetMessageFrom,
  type NeedsReviewItem,
  MessageFilters,
  MessageInboxList,
  MessageInboxTable,
  MessageSummaryCards,
  NeedsReviewAccordion,
  PageHeader,
  PaginationBar,
  Surface,
} from "./leads-ui";

interface ContactMessageListResponse {
  data: ContactMessageRow[];
  page: number;
  pageSize: number;
  total: number;
}

export default function LeadsPage() {
  const [result, setResult] = useState<ContactMessageListResponse | null>(null);
  const [stats, setStats] = useState<ContactMessageStatistics | null>(null);
  const [needsReview, setNeedsReview] = useState<NeedsReviewItem[] | null>(null);
  const [topics, setTopics] = useState<ContactTopic[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContactStatus | "">("");
  const [source, setSource] = useState<GetMessageFrom | "">("");
  const [topicId, setTopicId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [lastResolved, setLastResolved] = useState<{ name: string; leadId: string } | null>(null);

  useEffect(() => {
    apiFetch<ContactTopic[]>("/contact-topics")
      .then(setTopics)
      .catch(() => setTopics([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (source) params.set("getFrom", source);
    if (topicId) params.set("topicId", topicId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    try {
      const [messages, review, statistics] = await Promise.all([
        apiFetch<ContactMessageListResponse>(`/contact-messages?${params.toString()}`),
        apiFetch<NeedsReviewItem[]>("/leads/needs-review"),
        apiFetch<ContactMessageStatistics>("/contact-messages/statistics"),
      ]);
      setResult(messages);
      setNeedsReview(review);
      setStats(statistics);
    } catch {
      setError("Gagal memuat daftar pesan.");
    } finally {
      setLoading(false);
    }
  }, [search, status, source, topicId, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(
    messageId: string,
    messageName: string,
    resolution: { action: "ATTACH"; leadId: string } | { action: "CREATE_NEW" },
  ) {
    setResolvingId(messageId);
    setLastResolved(null);
    try {
      const updated = await apiFetch<{ leadId: string | null }>(`/contact-messages/${messageId}/lead`, {
        method: "PATCH",
        body: JSON.stringify(resolution),
      });
      if (updated.leadId) {
        setLastResolved({ name: messageName, leadId: updated.leadId });
      }
      await load();
    } catch {
      setError("Gagal menyelesaikan Needs Review.");
    } finally {
      setResolvingId(null);
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  const filterProps = {
    search,
    status,
    source,
    topicId,
    topics,
    onSearchChange: (value: string) => {
      setPage(1);
      setSearch(value);
    },
    onStatusChange: (value: ContactStatus | "") => {
      setPage(1);
      setStatus(value);
    },
    onSourceChange: (value: GetMessageFrom | "") => {
      setPage(1);
      setSource(value);
    },
    onTopicChange: (value: string) => {
      setPage(1);
      setTopicId(value);
    },
  };

  const listProps = {
    messages: result?.data ?? [],
    loading,
    showing: result?.data.length ?? 0,
    total: result?.total ?? 0,
  };

  const paginationProps = {
    page: result?.page ?? page,
    totalPages,
    total: result?.total ?? 0,
    pageSize: result?.pageSize ?? pageSize,
    onPageChange: setPage,
    onPageSizeChange: (value: number) => {
      setPage(1);
      setPageSize(value);
    },
  };

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title="Contact Messages"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { label: "Contact Messages" },
        ]}
      />

      <div className="mt-6">
        <MessageSummaryCards stats={stats} loading={loading && stats == null} />
      </div>

      {needsReview && needsReview.length > 0 ? (
        <NeedsReviewAccordion items={needsReview} resolvingId={resolvingId} onResolve={resolve} />
      ) : null}

      {lastResolved && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {lastResolved.name} berhasil dihubungkan.{" "}
          <Link href={`/leads/${lastResolved.leadId}`} className="font-medium underline">
            Lihat detail →
          </Link>
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Surface className="mt-6 hidden p-6 md:block">
        <MessageFilters {...filterProps} variant="desktop" />
        <div className="mt-4">
          <MessageInboxTable {...listProps} />
        </div>
        <PaginationBar {...paginationProps} />
      </Surface>

      <div className="mt-5 md:hidden">
        <Surface className="p-4">
          <MessageFilters {...filterProps} variant="mobile" />
        </Surface>
        <div className="mt-4">
          <MessageInboxList {...listProps} variant="mobile" />
        </div>
        <PaginationBar {...paginationProps} className="mt-4" />
      </div>
    </div>
  );
}
