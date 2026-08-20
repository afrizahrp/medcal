"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { AccessDenied } from "../../../components/access-denied";
import { useRequireSession } from "../../../lib/use-require-session";
import { PaginationBar } from "../leads/leads-ui";
import {
  EmailComposeFab,
  EmailFilters,
  EmailFolderNav,
  EmailInboxTable,
  PageHeader,
  Surface,
} from "./email-ui";
import {
  type EmailFolder,
  type EmailStatus,
  useEmailStatisticsQuery,
  useEmailsQuery,
  useMoveEmailToTrash,
  usePermanentDeleteEmail,
  useRestoreEmail,
  useSyncInbox,
} from "./use-emails-query";

const URL_KEYS = ["search", "status", "sortBy", "sortDir", "page", "pageSize"] as const;

const EMPTY_LABELS: Record<EmailFolder, string> = {
  INBOX: "No emails in your inbox.",
  SENT: "No sent emails.",
  DRAFTS: "No drafts.",
  TRASH: "Trash is empty.",
};

const TITLES: Record<EmailFolder, string> = {
  INBOX: "Inbox",
  SENT: "Sent",
  DRAFTS: "Drafts",
  TRASH: "Trash",
};

export function EmailFolderPageClient({ folder }: { folder: EmailFolder }) {
  const { me, status: sessionStatus } = useRequireSession();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const statusFilter: EmailStatus | "" = (params.status as EmailStatus | undefined) ?? "";
  const sortBy = params.sortBy ?? "createdAt";
  const sortDir = (params.sortDir as "asc" | "desc" | undefined) ?? "desc";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 20;
  const committedSearch = params.search ?? "";

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 500);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const emailsQuery = useEmailsQuery({
    folder,
    search: committedSearch,
    status: folder === "INBOX" ? statusFilter : "",
    sortBy,
    sortDir,
    page,
    pageSize,
  });
  const statsQuery = useEmailStatisticsQuery();
  const syncMutation = useSyncInbox();
  const trashMutation = useMoveEmailToTrash();
  const restoreMutation = useRestoreEmail();
  const permanentDeleteMutation = usePermanentDeleteEmail();

  const result = emailsQuery.data;
  const loading = emailsQuery.isLoading;
  const fetching = emailsQuery.isFetching && !loading;
  const forbidden = isForbidden(emailsQuery.error);
  const error = emailsQuery.isError && !forbidden ? "Gagal memuat daftar email." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);

  const actionBusyId =
    trashMutation.isPending && trashMutation.variables
      ? trashMutation.variables
      : restoreMutation.isPending && restoreMutation.variables
        ? restoreMutation.variables
        : permanentDeleteMutation.isPending && permanentDeleteMutation.variables
          ? permanentDeleteMutation.variables
          : null;

  async function handleSync() {
    setSyncMessage(null);
    setSyncError(null);
    try {
      const outcome = await syncMutation.mutateAsync();
      setSyncMessage(
        `Sinkronisasi selesai: ${outcome.created} baru, ${outcome.duplicates} duplikat, ${outcome.fetched} diambil.`,
      );
    } catch {
      setSyncError("Gagal menyinkronkan inbox.");
    }
  }

  async function handleDelete(id: string) {
    setRowActionError(null);
    try {
      await trashMutation.mutateAsync(id);
    } catch {
      setRowActionError("Gagal memindahkan email ke Trash.");
    }
  }

  async function handleRestore(id: string) {
    setRowActionError(null);
    try {
      await restoreMutation.mutateAsync(id);
    } catch {
      setRowActionError("Gagal memulihkan email.");
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!window.confirm("Hapus email ini secara permanen? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }
    setRowActionError(null);
    try {
      await permanentDeleteMutation.mutateAsync(id);
    } catch {
      setRowActionError("Gagal menghapus email secara permanen.");
    }
  }

  if (sessionStatus === "loading") {
    return <p className="px-4 py-6 text-sm text-slate-400">Memuat…</p>;
  }

  if (sessionStatus === "forbidden" || (me && !me.capabilities.emailRead) || forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title={TITLES[folder]}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/email", label: "Email" },
          { label: TITLES[folder] },
        ]}
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <EmailFolderNav active={folder} stats={statsQuery.data ?? null} />
        <div className="flex flex-wrap items-center gap-2">
          {me?.capabilities.emailSend ? (
            <Button asChild size="sm">
              <Link href="/email/compose">Compose</Link>
            </Button>
          ) : null}
          {folder === "INBOX" && me?.capabilities.emailRead ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncMutation.isPending}
              onClick={handleSync}
            >
              {syncMutation.isPending ? "Menyinkronkan…" : "Sinkronkan Inbox"}
            </Button>
          ) : null}
        </div>
      </div>

      {syncMessage ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {syncMessage}
        </p>
      ) : null}
      {syncError ? <p className="mt-3 text-sm text-red-600">{syncError}</p> : null}
      {rowActionError ? <p className="mt-3 text-sm text-red-600">{rowActionError}</p> : null}

      <Surface className="mt-6 p-4 md:p-6">
        <EmailFilters
          search={searchInput}
          status={statusFilter}
          onSearchChange={setSearchInput}
          onStatusChange={(value) => setParams({ status: value || undefined, page: undefined })}
          showStatusFilter={folder === "INBOX"}
        />
        <div className="mt-4">
          <EmailInboxTable
            rows={result?.data ?? []}
            folder={folder}
            loading={loading}
            fetching={fetching}
            error={error}
            emptyLabel={EMPTY_LABELS[folder]}
            canDelete={Boolean(me?.capabilities.emailDelete)}
            actionBusyId={actionBusyId}
            onDelete={folder === "TRASH" ? undefined : handleDelete}
            onRestore={folder === "TRASH" ? handleRestore : undefined}
            onPermanentDelete={folder === "TRASH" ? handlePermanentDelete : undefined}
          />
        </div>
        <PaginationBar
          page={result?.page ?? page}
          totalPages={totalPages}
          total={result?.total ?? 0}
          pageSize={result?.pageSize ?? pageSize}
          onPageChange={(value) => setParams({ page: String(value) })}
          onPageSizeChange={(value) => setParams({ pageSize: String(value), page: undefined })}
          className="mt-4"
        />
        {error ? (
          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => emailsQuery.refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : null}
      </Surface>

      <EmailComposeFab visible={Boolean(me?.capabilities.emailSend)} />
    </div>
  );
}
