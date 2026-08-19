"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isForbidden } from "@medcal/shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { AccessDenied } from "../../../components/access-denied";
import {
  type ContactStatus,
  type GetMessageFrom,
  type SortDir,
  type SortField,
  MessageFilters,
  MessageInboxList,
  MessageInboxTable,
  MessageSummaryCards,
  NeedsReviewAccordion,
  PageHeader,
  PaginationBar,
  Surface,
} from "./leads-ui";
import {
  useContactMessagesQuery,
  useContactStatisticsQuery,
  useContactTopicsQuery,
  useNeedsReviewQuery,
  useResolveLeadMatch,
} from "./use-contact-messages-query";

// The 7 URL-addressable keys that materially define the current list view
// (Management List canonical pattern, 2026-08-18) — refresh, back/forward,
// and copy/paste-the-URL all reproduce the same view. `search` here holds
// the *committed* (debounced) value, never raw keystrokes.
const URL_KEYS = ["search", "status", "source", "topicId", "sortBy", "sortDir", "page", "pageSize"] as const;

export default function LeadsPageClient() {
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const status: ContactStatus | "" = (params.status as ContactStatus | undefined) ?? "";
  const source: GetMessageFrom | "" = (params.source as GetMessageFrom | undefined) ?? "";
  const topicId = params.topicId ?? "";
  const sortBy: SortField = (params.sortBy as SortField | undefined) ?? "createdAt";
  const sortDir: SortDir = (params.sortDir as SortDir | undefined) ?? "desc";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  const committedSearch = params.search ?? "";

  // Raw keystrokes stay local; only the debounced value is written to the
  // URL/query. Initialized from the URL so a search survives a refresh.
  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 500);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const [lastResolved, setLastResolved] = useState<{ name: string; leadId: string } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const messagesQuery = useContactMessagesQuery({
    search: committedSearch,
    status,
    source,
    topicId,
    sortBy,
    sortDir,
    page,
    pageSize,
  });
  const statsQuery = useContactStatisticsQuery();
  const needsReviewQuery = useNeedsReviewQuery();
  const topicsQuery = useContactTopicsQuery();
  const resolveMutation = useResolveLeadMatch();

  const result = messagesQuery.data;
  const loading = messagesQuery.isLoading;
  const fetching = messagesQuery.isFetching && !loading;
  const forbidden = isForbidden(messagesQuery.error);
  const error = messagesQuery.isError && !forbidden ? "Gagal memuat daftar pesan." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  async function resolve(
    messageId: string,
    messageName: string,
    resolution: { action: "ATTACH"; leadId: string } | { action: "CREATE_NEW" },
  ) {
    setResolveError(null);
    setLastResolved(null);
    try {
      const updated = await resolveMutation.mutateAsync({ messageId, resolution });
      if (updated.leadId) {
        setLastResolved({ name: messageName, leadId: updated.leadId });
      }
    } catch {
      setResolveError("Gagal menyelesaikan Needs Review.");
    }
  }

  const resolvingId =
    resolveMutation.isPending && resolveMutation.variables ? resolveMutation.variables.messageId : null;

  const filterProps = {
    search: searchInput,
    status,
    source,
    topicId,
    topics: topicsQuery.data ?? [],
    sortBy,
    sortDir,
    onSearchChange: setSearchInput,
    onStatusChange: (value: ContactStatus | "") => setParams({ status: value || undefined, page: undefined }),
    onSourceChange: (value: GetMessageFrom | "") => setParams({ source: value || undefined, page: undefined }),
    onTopicChange: (value: string) => setParams({ topicId: value || undefined, page: undefined }),
    onSortChange: (field: SortField, dir: SortDir) => setParams({ sortBy: field, sortDir: dir }),
  };

  const listProps = {
    messages: result?.data ?? [],
    loading,
    fetching,
    error,
    showing: result?.data.length ?? 0,
    total: result?.total ?? 0,
  };

  const paginationProps = {
    page: result?.page ?? page,
    totalPages,
    total: result?.total ?? 0,
    pageSize: result?.pageSize ?? pageSize,
    onPageChange: (value: number) => setParams({ page: String(value) }),
    onPageSizeChange: (value: number) => setParams({ pageSize: String(value), page: undefined }),
  };

  if (forbidden) {
    return <AccessDenied />;
  }

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
        <MessageSummaryCards stats={statsQuery.data ?? null} loading={statsQuery.isLoading} />
      </div>

      {needsReviewQuery.data && needsReviewQuery.data.length > 0 ? (
        <NeedsReviewAccordion items={needsReviewQuery.data} resolvingId={resolvingId} onResolve={resolve} />
      ) : null}

      {lastResolved && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {lastResolved.name} berhasil dihubungkan.{" "}
          <Link href={`/leads/${lastResolved.leadId}`} className="font-medium underline">
            Lihat detail →
          </Link>
        </p>
      )}

      {resolveError && <p className="mt-4 text-sm text-red-600">{resolveError}</p>}

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
