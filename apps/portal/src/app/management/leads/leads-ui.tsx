"use client";

import Link from "next/link";
import {
  ArrowUpDown,
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
  PENDING: "Pending",
  READ: "Read",
  REPLIED: "Replied",
  CLOSED: "Closed",
};

/** easy-app reference palette — ContactMessage status semantics (authoritative domain). */
const CONTACT_STATUS_BADGE_CLASS: Record<ContactStatus, string> = {
  PENDING: "border-transparent bg-orange-400 text-white hover:bg-orange-400",
  READ: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
  REPLIED: "border-transparent bg-blue-600 text-white hover:bg-blue-600",
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

export function ContactStatusBadge({ status, className }: { status: ContactStatus; className?: string }) {
  return (
    <Badge
      className={cn(
        "inline-flex min-w-fit shrink-0 whitespace-nowrap rounded-md border-0 px-3 py-1 text-xs font-semibold normal-case tracking-normal shadow-none",
        CONTACT_STATUS_BADGE_CLASS[status],
        className,
      )}
    >
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
              Needs Review ({items.length})
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t border-amber-200 px-4 md:px-5">
            <ul className="space-y-3">
              {items.map(({ message, candidates }) => (
                <li key={message.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    {message.name} {message.organizationName ? `· ${message.organizationName}` : ""}
                  </p>
                  <p className="text-slate-500">{message.phone ?? message.email}</p>
                  <div className="mt-2 space-y-1">
                    {candidates.map((candidate) => (
                      <p key={candidate.id} className="text-xs text-slate-500">
                        Possible existing Lead: {candidate.name}
                        {candidate.organizationName ? ` · ${candidate.organizationName}` : ""} · #
                        {candidate.id.slice(-6)}
                      </p>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidates.map((candidate) => (
                      <Button
                        key={candidate.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resolvingId === message.id}
                        onClick={() => onResolve(message.id, message.name, { action: "ATTACH", leadId: candidate.id })}
                      >
                        Attach to #{candidate.id.slice(-6)}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resolvingId === message.id}
                      onClick={() => onResolve(message.id, message.name, { action: "CREATE_NEW" })}
                    >
                      Create New Lead
                    </Button>
                  </div>
                </li>
              ))}
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
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ArrowUpDown className="h-4 w-4 shrink-0" />
          <span className="shrink-0">Urutkan:</span>
          <select
            value={sortValue}
            onChange={(e) => handleSortSelect(e.target.value)}
            className={cn(selectClassName, "flex-1")}
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

export function MessageInboxTable({
  messages,
  loading,
  fetching = false,
  error,
  showing,
  total,
}: {
  messages: ContactMessageRow[];
  loading: boolean;
  /** Background refetch while previous rows are still shown (placeholderData) — lighter indicator than `loading`. */
  fetching?: boolean;
  /** Distinct from an empty result — a fetch failure, rendered as its own row. */
  error?: string | null;
  showing: number;
  total: number;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">
        Menampilkan {showing} dari {total} pesan
      </p>
      <div
        className={cn(
          "overflow-x-auto rounded-md border border-slate-200 transition-opacity",
          fetching && !loading && "opacity-60",
        )}
      >
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="whitespace-nowrap px-4 py-3">Tanggal</th>
              <th className="min-w-[150px] px-4 py-3">Nama</th>
              <th className="min-w-[220px] px-4 py-3">Email</th>
              <th className="min-w-[130px] whitespace-nowrap px-4 py-3">Telepon</th>
              <th className="min-w-[160px] px-4 py-3">Perusahaan</th>
              <th className="min-w-[140px] px-4 py-3">Topik</th>
              <th className="w-[88px] px-4 py-3">Sumber</th>
              <th className="w-[120px] px-4 py-3">Status</th>
              <th className="w-[56px] px-4 py-3">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-slate-400" colSpan={9}>
                  Memuat…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="px-4 py-8 text-red-600" colSpan={9}>
                  {error}
                </td>
              </tr>
            ) : messages.length > 0 ? (
              messages.map((message) => (
                <tr
                  key={message.id}
                  className={cn(
                    "border-b border-slate-100 last:border-0 hover:bg-slate-50/70",
                    message.status === "PENDING" && "bg-orange-50/30",
                  )}
                >
                  <td className="whitespace-nowrap align-middle px-4 py-3.5 text-slate-500">
                    {message.lead ? (
                      <Link href={`/leads/${message.lead.id}`} className="hover:text-brand-700 hover:underline">
                        {formatListDateTime(message.createdAt)}
                      </Link>
                    ) : (
                      formatListDateTime(message.createdAt)
                    )}
                  </td>
                  <td className="min-w-[150px] align-middle px-4 py-3.5">
                    <ClampedText className="font-medium text-slate-800" lines={2}>
                      {message.name}
                    </ClampedText>
                  </td>
                  <td className="min-w-[220px] align-middle px-4 py-3.5">
                    <span className="inline-flex max-w-full items-start gap-1.5 text-slate-600">
                      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <ClampedText lines={1}>{message.email}</ClampedText>
                    </span>
                  </td>
                  <td className="whitespace-nowrap align-middle px-4 py-3.5 text-slate-600">{message.phone ?? "—"}</td>
                  <td className="min-w-[160px] align-middle px-4 py-3.5 text-slate-600">
                    {message.organizationName ? (
                      <ClampedText lines={2}>{message.organizationName}</ClampedText>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="min-w-[140px] align-middle px-4 py-3.5 text-slate-600">
                    {message.topic?.name ? <ClampedText lines={2}>{message.topic.name}</ClampedText> : "—"}
                  </td>
                  <td className="w-[88px] align-middle px-4 py-3.5">
                    <SourceIcon source={message.getFrom} />
                  </td>
                  <td className="w-[120px] overflow-visible align-middle px-4 py-3.5">
                    <ContactStatusBadge status={message.status} />
                  </td>
                  <td className="w-[56px] align-middle px-4 py-3.5 text-right">
                    <LeadRowMenu leadId={message.lead?.id} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-slate-400" colSpan={9}>
                  Tidak ada pesan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MessageCardBody({ message, compact }: { message: ContactMessageRow; compact?: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug text-slate-900" title={message.name}>
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
}: {
  messages: ContactMessageRow[];
  loading: boolean;
  fetching?: boolean;
  error?: string | null;
  showing: number;
  total: number;
  variant?: "desktop" | "mobile";
}) {
  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-400">Memuat…</p>;
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-red-600">{error}</p>;
  }

  if (messages.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Tidak ada pesan.</p>;
  }

  return (
    <div className={cn("transition-opacity", fetching && "opacity-60")}>
      <p className="mb-3 text-sm text-slate-400">
        Menampilkan {showing} dari {total} pesan
      </p>
      <ul className={cn("space-y-3", variant === "desktop" && "lg:space-y-2")}>
        {messages.map((message) => {
          const body = <MessageCardBody message={message} compact={variant === "mobile"} />;
          return (
            <li
              key={message.id}
              className={cn(
                "flex items-stretch overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-colors",
                "hover:border-slate-300",
                message.status === "PENDING" && "border-l-4 border-l-orange-400",
              )}
            >
              {message.lead ? (
                <Link
                  href={`/leads/${message.lead.id}`}
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
