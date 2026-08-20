"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/management/page-header";
import {
  DraftsFolderIcon,
  EmailIcon,
  InboxFolderIcon,
  RestoreIcon,
  SentFolderIcon,
  TrashFolderIcon,
} from "@/components/management/icons";
import type { EmailFolder, EmailListRow, EmailStatistics, EmailStatus } from "./use-emails-query";

export { PageHeader };

/** Floating Compose control inspired by easy-app ResponsiveFAB — MedCal brand tokens. */
export function EmailComposeFab({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 z-40 sm:bottom-8 sm:right-8">
      <Button
        asChild
        className="h-12 w-12 rounded-full bg-brand-700 text-white shadow-xl hover:bg-brand-800 hover:shadow-2xl sm:h-14 sm:w-14"
        aria-label="Compose email"
        title="Compose"
      >
        <Link href="/email/compose">
          <EmailIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.8} />
        </Link>
      </Button>
    </div>
  );
}

export function Surface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200/80 bg-white shadow-sm", className)}>{children}</div>
  );
}

export function formatListDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FOLDER_TABS: {
  folder: EmailFolder;
  href: string;
  label: string;
  Icon: typeof InboxFolderIcon;
}[] = [
  { folder: "INBOX", href: "/email/inbox", label: "Inbox", Icon: InboxFolderIcon },
  { folder: "SENT", href: "/email/sent", label: "Sent", Icon: SentFolderIcon },
  { folder: "DRAFTS", href: "/email/drafts", label: "Drafts", Icon: DraftsFolderIcon },
  { folder: "TRASH", href: "/email/trash", label: "Trash", Icon: TrashFolderIcon },
];

export function EmailFolderNav({
  active,
  stats,
}: {
  active?: EmailFolder;
  stats?: EmailStatistics | null;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-3" aria-label="Folder email">
      {FOLDER_TABS.map((tab) => {
        const count =
          tab.folder === "INBOX"
            ? stats?.unread
            : tab.folder === "SENT"
              ? stats?.sent
              : tab.folder === "DRAFTS"
                ? stats?.drafts
                : stats?.trash;
        const isActive = tab.folder === active;
        const tooltip =
          typeof count === "number" ? `${tab.label} (${count})` : tab.label;
        const badge =
          typeof count === "number" && count > 0 ? (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none",
                isActive ? "bg-slate-300 text-slate-600" : "bg-slate-200 text-slate-700",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null;

        // Active folder mirrors breadcrumb current crumb: not a link, muted/disabled look.
        if (isActive) {
          return (
            <span
              key={tab.folder}
              title={tooltip}
              aria-label={tooltip}
              aria-current="page"
              aria-disabled="true"
              className="relative inline-flex h-9 w-9 cursor-default items-center justify-center rounded-md text-slate-400 opacity-60"
            >
              <tab.Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {badge}
            </span>
          );
        }

        return (
          <Link
            key={tab.folder}
            href={tab.href}
            title={tooltip}
            aria-label={tooltip}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <tab.Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {badge}
          </Link>
        );
      })}
    </nav>
  );
}

export function EmailFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
  showStatusFilter,
}: {
  search: string;
  status: EmailStatus | "";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: EmailStatus | "") => void;
  showStatusFilter: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Cari pengirim, penerima, atau subjek…"
        className="h-9 max-w-md"
        aria-label="Cari email"
      />
      {showStatusFilter ? (
        <select
          value={status}
          onChange={(e) => onStatusChange((e.target.value as EmailStatus | "") || "")}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          <option value="UNREAD">Belum dibaca</option>
          <option value="READ">Sudah dibaca</option>
        </select>
      ) : null}
    </div>
  );
}

function LeadBadge({ row }: { row: EmailListRow }) {
  if (row.lead) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        Lead: {row.lead.name}
      </span>
    );
  }
  if (row.suggestedLead) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Suggested: {row.suggestedLead.name}
      </span>
    );
  }
  return null;
}

function displayParty(row: EmailListRow, folder: EmailFolder): string {
  if (folder === "SENT" || folder === "DRAFTS") {
    return row.toEmail || "(tanpa penerima)";
  }
  return row.fromName?.trim() || row.fromEmail;
}

function displayDate(row: EmailListRow, folder: EmailFolder): string {
  if (folder === "SENT") return formatListDateTime(row.sentAt ?? row.createdAt);
  if (folder === "INBOX") return formatListDateTime(row.receivedAt ?? row.createdAt);
  return formatListDateTime(row.createdAt);
}

export function EmailInboxTable({
  rows,
  folder,
  loading,
  fetching,
  error,
  emptyLabel,
  canDelete = false,
  actionBusyId = null,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  rows: EmailListRow[];
  folder: EmailFolder;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  emptyLabel: string;
  canDelete?: boolean;
  actionBusyId?: string | null;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
}) {
  const showActions = canDelete && (folder === "TRASH" ? Boolean(onRestore || onPermanentDelete) : Boolean(onDelete));
  const colSpan = showActions ? 5 : 4;

  function RowActions({ row }: { row: EmailListRow }) {
    if (!showActions) return null;
    const busy = actionBusyId === row.id;

    if (folder === "TRASH") {
      return (
        <div className="flex items-center justify-end gap-0.5">
          {onRestore ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-emerald-700"
              title="Pulihkan"
              aria-label="Pulihkan"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRestore(row.id);
              }}
            >
              <RestoreIcon className="h-4 w-4" />
            </Button>
          ) : null}
          {onPermanentDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-red-600"
              title="Hapus permanen"
              aria-label="Hapus permanen"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPermanentDelete(row.id);
              }}
            >
              <TrashFolderIcon className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-red-600"
          title="Pindahkan ke Trash"
          aria-label="Pindahkan ke Trash"
          disabled={busy || !onDelete}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete?.(row.id);
          }}
        >
          <TrashFolderIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", fetching ? "opacity-60" : undefined)}>
      <table className="hidden w-full min-w-[640px] text-left text-sm md:table">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">
              {folder === "SENT" || folder === "DRAFTS" ? "Kepada" : "Dari"}
            </th>
            <th className="px-4 py-3 font-medium">Subjek</th>
            <th className="px-4 py-3 font-medium">Lead</th>
            <th className="px-4 py-3 font-medium">Waktu</th>
            {showActions ? <th className="w-20 px-3 py-3 font-medium"><span className="sr-only">Aksi</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
                Memuat…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-red-600">
                {error}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const unread = row.status === "UNREAD" && folder === "INBOX";
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group border-b border-slate-50 transition-colors hover:bg-slate-50/80",
                    unread ? "bg-brand-50/40" : undefined,
                  )}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/email/${row.id}`}
                      className={cn(
                        "block max-w-[220px] truncate text-slate-800 hover:text-brand-800",
                        unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {displayParty(row, folder)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/email/${row.id}`} className="block max-w-[360px]">
                      <span className={cn("block truncate text-slate-800", unread ? "font-semibold" : undefined)}>
                        {row.subject || "(tanpa subjek)"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-400">{row.snippet}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <LeadBadge row={row} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{displayDate(row, folder)}</td>
                  {showActions ? (
                    <td className="px-2 py-3">
                      <RowActions row={row} />
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 md:hidden">
        {loading ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">Memuat…</li>
        ) : error ? (
          <li className="px-4 py-8 text-center text-sm text-red-600">{error}</li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">{emptyLabel}</li>
        ) : (
          rows.map((row) => {
            const unread = row.status === "UNREAD" && folder === "INBOX";
            return (
              <li
                key={row.id}
                className={cn("relative", unread ? "bg-brand-50/40" : undefined)}
              >
                <Link href={`/email/${row.id}`} className="block px-4 py-3 pr-14">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("truncate text-sm text-slate-900", unread ? "font-semibold" : "font-medium")}>
                      {displayParty(row, folder)}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{displayDate(row, folder)}</span>
                  </div>
                  <p className={cn("mt-0.5 truncate text-sm text-slate-700", unread ? "font-semibold" : undefined)}>
                    {row.subject || "(tanpa subjek)"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{row.snippet}</p>
                  <div className="mt-1.5">
                    <LeadBadge row={row} />
                  </div>
                </Link>
                {showActions ? (
                  <div className="absolute right-2 top-2">
                    <RowActions row={row} />
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
