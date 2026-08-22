"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Search,
  Send,
  User,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";

export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "REJECTED" | "CONVERTED";
export type ContactStatus = "PENDING" | "READ" | "REPLIED" | "CLOSED";
export type GetMessageFrom = "CONTACTFORM" | "WHATSAPP" | "CHAT_AI" | "CHAT_PERSON" | "EMAIL";

export interface ContactTopic {
  id: number;
  name: string;
}

export interface LatestContactMessage {
  id: string;
  getFrom: GetMessageFrom;
  status: ContactStatus;
  createdAt: string;
  subject?: string | null;
  message?: string;
  topic: ContactTopic | null;
}

export interface Lead {
  id: string;
  status: LeadStatus;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  createdAt: string;
  contactMessages: LatestContactMessage[];
}

/**
 * One row per ContactMessage (Contact Messages status/filter/count
 * correction, 2026-08-18) — replaces the old Lead-based row (which deduped
 * to each Lead's latest message and so couldn't reconcile with
 * ContactMessagesService.getStatistics's per-message global counts). `lead`
 * is the joined Lead this message resolved to (nullable — Needs Review
 * messages have leadId=null and are shown separately).
 */
export interface ContactMessageRow {
  id: string;
  status: ContactStatus;
  getFrom: GetMessageFrom;
  createdAt: string;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  message: string;
  topic: ContactTopic | null;
  lead: { id: string; status: LeadStatus } | null;
}

export const LEAD_STATUS_OPTIONS: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "REJECTED", "CONVERTED"];
export const CONTACT_STATUS_OPTIONS: ContactStatus[] = ["PENDING", "READ", "REPLIED", "CLOSED"];

export const SOURCE_OPTIONS: GetMessageFrom[] = ["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"];

export const SOURCE_LABELS: Record<GetMessageFrom, string> = {
  CONTACTFORM: "Contact Form",
  WHATSAPP: "WhatsApp",
  CHAT_AI: "Chat AI",
  CHAT_PERSON: "Web Chat",
  EMAIL: "Email",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  REJECTED: "Rejected",
  CONVERTED: "Converted",
};

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  PENDING: "Menunggu",
  READ: "Dibaca",
  REPLIED: "Dibalas",
  CLOSED: "Ditutup",
};

/** easy-app reference palette — ContactMessage status semantics (authoritative domain). */
const CONTACT_STATUS_BADGE_CLASS: Record<ContactStatus, string> = {
  PENDING: "border-transparent bg-orange-400 text-white hover:bg-orange-400",
  READ: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  REPLIED: "border border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
  CLOSED: "border-transparent bg-slate-600 text-white hover:bg-slate-600",
};

const LEAD_STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  NEW: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  CONTACTED: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  QUALIFIED: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  REJECTED: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
  CONVERTED: "border-transparent bg-brand-700 text-white hover:bg-brand-700",
};

const STAT_COUNT_CLASS: Record<string, string> = {
  total: "text-slate-900",
  pending: "text-orange-400",
  read: "text-blue-600",
  replied: "text-emerald-600",
  closed: "text-slate-600",
  review: "text-amber-600",
};

const SOURCE_ICON_CLASS: Record<GetMessageFrom, string> = {
  CONTACTFORM: "bg-slate-800 text-white",
  WHATSAPP: "bg-emerald-600 text-white",
  CHAT_AI: "bg-violet-600 text-white",
  CHAT_PERSON: "bg-sky-600 text-white",
  EMAIL: "bg-blue-600 text-white",
};

/** Sortable columns for GET /contact-messages — mirrors CONTACT_MESSAGE_SORTABLE_FIELDS in packages/shared. */
export type SortField = "createdAt" | "name" | "status";
export type SortDir = "asc" | "desc";

export const SORT_OPTIONS: { value: `${SortField}-${SortDir}`; label: string }[] = [
  { value: "createdAt-desc", label: "Tanggal (Terbaru)" },
  { value: "createdAt-asc", label: "Tanggal (Terlama)" },
  { value: "name-asc", label: "Nama (A-Z)" },
  { value: "name-desc", label: "Nama (Z-A)" },
];

export const selectClassName =
  "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-none outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring";

export function Surface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200/80 bg-white shadow-sm", className)}>{children}</div>
  );
}

export { PageHeader };

export function formatListDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "baru saja";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit yang lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari yang lalu`;
  return formatListDateTime(iso);
}

export function formatDetailTimestamp(iso: string): string {
  const absolute = new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${absolute} / ${formatRelativeTime(iso)}`;
}

export function ContactStatusBadge({
  status,
  className,
  showIcon = false,
}: {
  status: ContactStatus;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <Badge
      className={cn(
        "inline-flex min-w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold normal-case tracking-normal shadow-none",
        CONTACT_STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {showIcon ? <ContactStatusIcon status={status} /> : null}
      {CONTACT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <Badge
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        LEAD_STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ContactStatusIcon({ status }: { status: ContactStatus }) {
  const className = "h-4 w-4";
  switch (status) {
    case "PENDING":
      return <Clock className={className} />;
    case "READ":
      return <Mail className={className} />;
    case "REPLIED":
      return <Send className={className} />;
    case "CLOSED":
      return <CheckCircle2 className={className} />;
    default:
      return <MessageSquare className={className} />;
  }
}

export function SourceIcon({ source, className }: { source: GetMessageFrom; className?: string }) {
  const iconClass = "h-3.5 w-3.5";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
        SOURCE_ICON_CLASS[source],
        className,
      )}
      title={SOURCE_LABELS[source]}
      aria-label={SOURCE_LABELS[source]}
    >
      {source === "WHATSAPP" ? (
        <MessageCircle className={iconClass} />
      ) : source === "EMAIL" ? (
        <Mail className={iconClass} />
      ) : (
        <MessageSquare className={iconClass} />
      )}
    </span>
  );
}

/** Global tenant-scoped ContactMessage counts from GET /contact-messages/statistics. */
export interface ContactMessageStatistics {
  total: number;
  pending: number;
  read: number;
  replied: number;
  closed: number;
}

export function MessageSummaryCards({
  stats,
  loading,
}: {
  stats: ContactMessageStatistics | null;
  loading: boolean;
}) {
  const cards = [
    { key: "total", label: "Total", value: stats?.total, tone: "total" },
    { key: "pending", label: "Pending", value: stats?.pending, tone: "pending" },
    { key: "read", label: "Read", value: stats?.read, tone: "read" },
    { key: "replied", label: "Replied", value: stats?.replied, tone: "replied" },
    { key: "closed", label: "Closed", value: stats?.closed, tone: "closed" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {cards.map((card) => (
        <Surface key={card.key} className="px-5 py-4">
          <p className="text-xs font-medium text-slate-400">{card.label}</p>
          <p className={cn("mt-2 text-2xl font-semibold tabular-nums", STAT_COUNT_CLASS[card.tone])}>
            {loading && stats == null ? "—" : (card.value ?? 0)}
          </p>
        </Surface>
      ))}
    </div>
  );
}

export interface NeedsReviewMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
}

export interface NeedsReviewItem {
  message: NeedsReviewMessage;
  candidates: Lead[];
}

export function NeedsReviewAccordion({
  items,
  resolvingId,
  onResolve,
}: {
  items: NeedsReviewItem[];
  resolvingId: string | null;
  onResolve: (
    messageId: string,
    messageName: string,
    resolution: { action: "ATTACH"; leadId: string } | { action: "CREATE_NEW" },
  ) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-5">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="needs-review" className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/90">
          <AccordionTrigger className="px-4 hover:no-underline md:px-5">
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Perlu Ditinjau ({items.length})
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t border-amber-200 px-4 md:px-5">
            <ul className="space-y-3 pb-4">
              {items.map(({ message, candidates }) => {
                const isResolving = resolvingId === message.id;
                return (
                  <li key={message.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                    <p className="font-semibold text-slate-900">
                      {message.name} {message.organizationName ? `· ${message.organizationName}` : ""}
                    </p>
                    <p className="text-slate-500">{message.phone ?? message.email}</p>
                    {candidates.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Kemungkinan Lead yang sudah ada
                        </p>
                        {candidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-800">{candidate.name}</p>
                              <p className="truncate text-xs text-slate-500">
                                {candidate.organizationName ?? candidate.email} · #{candidate.id.slice(-6)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isResolving}
                              onClick={() =>
                                onResolve(message.id, message.name, { action: "ATTACH", leadId: candidate.id })
                              }
                            >
                              {isResolving ? "Memproses…" : `Hubungkan ke #${candidate.id.slice(-6)}`}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isResolving}
                        onClick={() => onResolve(message.id, message.name, { action: "CREATE_NEW" })}
                      >
                        {isResolving ? "Memproses…" : "Buat Lead Baru"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

export function MessageFilters({
  search,
  status,
  source,
  topicId,
  topics,
  sortBy,
  sortDir,
  onSearchChange,
  onStatusChange,
  onSourceChange,
  onTopicChange,
  onSortChange,
  variant = "desktop",
}: {
  search: string;
  status: ContactStatus | "";
  source: GetMessageFrom | "";
  topicId: string;
  topics: ContactTopic[];
  sortBy: SortField;
  sortDir: SortDir;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ContactStatus | "") => void;
  onSourceChange: (value: GetMessageFrom | "") => void;
  onTopicChange: (value: string) => void;
  onSortChange: (sortBy: SortField, sortDir: SortDir) => void;
  variant?: "desktop" | "mobile";
}) {
  const sortValue = `${sortBy}-${sortDir}` as (typeof SORT_OPTIONS)[number]["value"];
  function handleSortSelect(value: string) {
    const [field, dir] = value.split("-") as [SortField, SortDir];
    onSortChange(field, dir);
  }
  if (variant === "mobile") {
    return (
      <div className="space-y-3">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nama, email, telepon, perusahaan…"
            className="h-9 w-full bg-white pl-9 shadow-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as ContactStatus | "")}
            className={cn(selectClassName, "w-full")}
            aria-label="Filter status pesan"
          >
            <option value="">Semua status</option>
            {CONTACT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CONTACT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => onSourceChange(e.target.value as GetMessageFrom | "")}
            className={cn(selectClassName, "w-full")}
            aria-label="Filter sumber"
          >
            <option value="">Semua sumber</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <select
          value={topicId}
          onChange={(e) => onTopicChange(e.target.value)}
          className={cn(selectClassName, "w-full")}
          aria-label="Filter topik"
        >
          <option value="">Semua topik</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={sortValue}
          onChange={(e) => handleSortSelect(e.target.value)}
          className={cn(selectClassName, "w-full")}
          aria-label="Urutkan pesan"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nama, email, telepon, perusahaan…"
          className="h-9 bg-white pl-9 shadow-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:shrink-0">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as ContactStatus | "")}
          className={cn(selectClassName, "w-full lg:w-40")}
          aria-label="Filter status pesan"
        >
          <option value="">Semua status</option>
          {CONTACT_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {CONTACT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value as GetMessageFrom | "")}
          className={cn(selectClassName, "w-full lg:w-40")}
          aria-label="Filter sumber"
        >
          <option value="">Semua sumber</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={topicId}
          onChange={(e) => onTopicChange(e.target.value)}
          className={cn(selectClassName, "col-span-2 w-full sm:col-span-1 lg:w-44")}
          aria-label="Filter topik"
        >
          <option value="">Semua topik</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={sortValue}
          onChange={(e) => handleSortSelect(e.target.value)}
          className={cn(selectClassName, "col-span-2 w-full sm:col-span-1 lg:w-44")}
          aria-label="Urutkan pesan"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ClampedText({
  children,
  className,
  title,
  lines = 2,
}: {
  children: string;
  className?: string;
  title?: string;
  lines?: 1 | 2;
}) {
  return (
    <span
      className={cn(
        "block break-words leading-snug",
        lines === 1 ? "line-clamp-1" : "line-clamp-2",
        className,
      )}
      title={title ?? children}
    >
      {children}
    </span>
  );
}

function InboxListHeader({ showing, total }: { showing: number; total: number }) {
  return (
    <p className="mb-3 text-sm text-slate-400">
      Menampilkan {showing} dari {total} pesan
    </p>
  );
}

function MessageInboxSkeleton({ variant = "table" }: { variant?: "table" | "list" }) {
  if (variant === "list") {
    return (
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-4 w-1/3 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            <div className="mt-4 h-3 w-full rounded bg-slate-100" />
            <div className="mt-1 h-3 w-4/5 rounded bg-slate-100" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex animate-pulse gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
          <div className="h-10 w-[180px] shrink-0 rounded bg-slate-100" />
          <div className="h-10 min-w-0 flex-1 rounded bg-slate-100" />
          <div className="hidden h-10 w-[140px] rounded bg-slate-100 sm:block" />
          <div className="hidden h-10 w-[100px] rounded bg-slate-100 md:block" />
          <div className="h-10 w-[80px] shrink-0 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function MessageInboxEmptyState({
  hasActiveFilters,
  onClearFilters,
}: {
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-400">
      <p>{hasActiveFilters ? "Tidak ada pesan yang cocok dengan filter." : "Tidak ada pesan."}</p>
      {hasActiveFilters && onClearFilters ? (
        <Button type="button" variant="link" size="sm" className="mt-2 h-auto p-0" onClick={onClearFilters}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

function MessageInboxTableRow({ message }: { message: ContactMessageRow }) {
  const router = useRouter();
  const isPending = message.status === "PENDING";
  const leadHref = message.lead ? `/leads/${message.lead.id}` : null;

  function handleRowClick() {
    if (leadHref) router.push(leadHref);
  }

  function handleRowKeyDown(e: React.KeyboardEvent) {
    if (leadHref && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      router.push(leadHref);
    }
  }

  return (
    <tr
      className={cn(
        "group border-b border-slate-100 last:border-0 transition-colors",
        leadHref && "cursor-pointer hover:bg-slate-50/80",
        isPending && "bg-orange-50/30",
      )}
      onClick={leadHref ? handleRowClick : undefined}
      onKeyDown={leadHref ? handleRowKeyDown : undefined}
      tabIndex={leadHref ? 0 : undefined}
      aria-label={leadHref ? `Buka detail lead ${message.name}` : undefined}
    >
      <td className="min-w-[180px] align-middle px-4 py-3.5">
        <div className="min-w-0">
          <ClampedText
            className={cn("text-slate-800", isPending ? "font-semibold" : "font-medium")}
            lines={1}
          >
            {message.name}
          </ClampedText>
          <p className="mt-0.5 truncate text-xs text-slate-500">{message.email}</p>
          {message.phone ? <p className="truncate text-xs text-slate-400">{message.phone}</p> : null}
        </div>
      </td>
      <td className="min-w-[200px] max-w-[320px] align-middle px-4 py-3.5">
        <ClampedText className="text-slate-600" lines={2}>
          {message.message.trim() || "—"}
        </ClampedText>
      </td>
      <td className="min-w-[140px] align-middle px-4 py-3.5 text-slate-600">
        <ClampedText lines={1}>{message.topic?.name ?? "—"}</ClampedText>
        {message.organizationName ? (
          <ClampedText className="mt-0.5 text-xs text-slate-400" lines={1}>
            {message.organizationName}
          </ClampedText>
        ) : null}
      </td>
      <td className="align-middle px-4 py-3.5">
        <div className="flex items-center gap-2">
          <SourceIcon source={message.getFrom} />
          <ContactStatusBadge status={message.status} />
        </div>
      </td>
      <td className="whitespace-nowrap align-middle px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500" title={formatListDateTime(message.createdAt)}>
            {formatRelativeTime(message.createdAt)}
          </span>
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <LeadRowMenu leadId={message.lead?.id} />
          </div>
        </div>
      </td>
    </tr>
  );
}

export function MessageInboxTable({
  messages,
  loading,
  fetching = false,
  error,
  showing,
  total,
  hasActiveFilters = false,
  onClearFilters,
}: {
  messages: ContactMessageRow[];
  loading: boolean;
  fetching?: boolean;
  error?: string | null;
  showing: number;
  total: number;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <div>
      {!loading ? <InboxListHeader showing={showing} total={total} /> : null}
      <div
        className={cn(
          "overflow-x-auto rounded-md border border-slate-200 transition-opacity",
          fetching && !loading && "opacity-60",
        )}
      >
        {loading ? (
          <MessageInboxSkeleton variant="table" />
        ) : error ? (
          <p className="px-4 py-8 text-center text-sm text-red-600">{error}</p>
        ) : messages.length > 0 ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="min-w-[180px] px-4 py-3">Kontak</th>
                <th className="min-w-[200px] px-4 py-3">Pesan</th>
                <th className="min-w-[140px] px-4 py-3">Topik / Perusahaan</th>
                <th className="px-4 py-3">Sumber & Status</th>
                <th className="whitespace-nowrap px-4 py-3">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <MessageInboxTableRow key={message.id} message={message} />
              ))}
            </tbody>
          </table>
        ) : (
          <MessageInboxEmptyState hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />
        )}
      </div>
    </div>
  );
}

function MessageCardBody({ message, compact }: { message: ContactMessageRow; compact?: boolean }) {
  const isPending = message.status === "PENDING";
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "line-clamp-2 leading-snug text-slate-900",
              isPending ? "font-semibold" : "font-medium",
            )}
            title={message.name}
          >
            {message.name}
          </p>
          <p className="mt-0.5 truncate text-sm text-slate-400">{message.email}</p>
          {!compact && message.organizationName ? (
            <p className="mt-1 truncate text-xs text-slate-500">{message.organizationName}</p>
          ) : null}
        </div>
        <ContactStatusBadge status={message.status} className="shrink-0" />
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Topik</p>
        <p className="mt-0.5 font-semibold text-slate-900">{message.topic?.name ?? "—"}</p>
        <p className="mt-0.5 text-xs text-slate-400">{formatRelativeTime(message.createdAt)}</p>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pesan</p>
        <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-slate-700">
          {message.message.trim() || "—"}
        </p>
      </div>

      {!compact ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="hidden sm:inline">{formatListDateTime(message.createdAt)}</span>
          <span className="inline-flex items-center gap-1.5">
            <SourceIcon source={message.getFrom} className="h-6 w-6" />
            {SOURCE_LABELS[message.getFrom]}
          </span>
          {message.phone ? <span>{message.phone}</span> : null}
        </div>
      ) : null}
    </>
  );
}

export function MessageInboxList({
  messages,
  loading,
  fetching = false,
  error,
  showing,
  total,
  variant = "desktop",
  hasActiveFilters = false,
  onClearFilters,
}: {
  messages: ContactMessageRow[];
  loading: boolean;
  fetching?: boolean;
  error?: string | null;
  showing: number;
  total: number;
  variant?: "desktop" | "mobile";
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}) {
  if (loading) {
    return <MessageInboxSkeleton variant="list" />;
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-red-600">{error}</p>;
  }

  if (messages.length === 0) {
    return <MessageInboxEmptyState hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />;
  }

  return (
    <div className={cn("transition-opacity", fetching && "opacity-60")}>
      <InboxListHeader showing={showing} total={total} />
      <ul className={cn("space-y-3", variant === "desktop" && "lg:space-y-2")}>
        {messages.map((message) => {
          const body = <MessageCardBody message={message} compact={variant === "mobile"} />;
          const isPending = message.status === "PENDING";
          return (
            <li
              key={message.id}
              className={cn(
                "flex items-stretch overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-colors",
                "hover:border-slate-300",
                isPending && "bg-orange-50/20",
              )}
            >
              {message.lead ? (
                <Link
                  href={`/leads/${message.lead.id}`}
                  aria-label={`Buka detail lead ${message.name}`}
                  className="min-w-0 flex-1 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {body}
                </Link>
              ) : (
                <div className="min-w-0 flex-1 p-4">{body}</div>
              )}
              <div className="flex shrink-0 items-start border-l border-slate-100 p-2 pt-4">
                <LeadRowMenu leadId={message.lead?.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LeadRowMenu({ leadId }: { leadId?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-slate-700"
          aria-label="Aksi pesan"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild disabled={!leadId}>
          {leadId ? <Link href={`/leads/${leadId}`}>Lihat detail</Link> : <span>Lihat detail</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/**
 * Always renders — including the zero-result state (Page 1 of 1, Total: 0
 * pesan, both nav buttons disabled) — instead of the old `total <= 0 ?
 * null` early return, which made the footer vanish rather than communicate
 * "no results" (Contact Messages pagination polish, 2026-08-18). `page`/
 * `totalPages`/`total` are always backend-authoritative (never derived from
 * `data.length`) — callers must pass the server response's own values.
 */
export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="shrink-0 text-slate-400">Baris per halaman</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className={cn(selectClassName, "h-8 w-[76px]")}
          aria-label="Baris per halaman"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-500">
        Halaman {page} dari {totalPages}
        <span className="mx-1.5 text-slate-300">·</span>
        Total: {total} pesan
      </p>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          Sebelumnya
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

export function ContactInfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-start gap-x-2 gap-y-0 text-sm">
      <div className="flex min-w-[88px] items-center gap-1.5 text-slate-400">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-slate-400">:</span>
      {href ? (
        <a href={href} className="break-all font-medium text-brand-700 hover:underline">
          {value}
        </a>
      ) : (
        <span className="break-all font-medium text-slate-800">{value}</span>
      )}
    </div>
  );
}

export const contactInfoIcons = {
  company: <Building2 className="h-3.5 w-3.5 shrink-0" />,
  name: <User className="h-3.5 w-3.5 shrink-0" />,
  email: <Mail className="h-3.5 w-3.5 shrink-0" />,
  phone: <Phone className="h-3.5 w-3.5 shrink-0" />,
  calendar: <Calendar className="h-3.5 w-3.5 shrink-0" />,
};
