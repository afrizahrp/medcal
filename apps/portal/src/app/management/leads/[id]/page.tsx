"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiFetch } from "@medcal/shared";
import { notifyUnreadCountChanged } from "../../../../lib/use-unread-count";

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "REJECTED" | "CONVERTED";
type ContactStatus = "PENDING" | "READ" | "REPLIED" | "CLOSED";
type GetMessageFrom = "CONTACTFORM" | "WHATSAPP" | "CHAT_AI" | "CHAT_PERSON" | "EMAIL";

const SOURCE_LABELS: Record<GetMessageFrom, string> = {
  CONTACTFORM: "Contact Form",
  WHATSAPP: "WhatsApp",
  CHAT_AI: "Chat AI",
  CHAT_PERSON: "Web Chat",
  EMAIL: "Email",
};

interface ContactTopic {
  id: number;
  name: string;
}

interface ContactMessage {
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

interface LeadDetail {
  id: string;
  status: LeadStatus;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  createdAt: string;
  // Reverse-chronological — the API already orders these newest-first
  // (Lead Inbox design review §5); this UI relies on that order rather than
  // re-sorting client-side.
  contactMessages: ContactMessage[];
}

const STATUS_OPTIONS: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "REJECTED", "CONVERTED"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      const data = await apiFetch<LeadDetail>(`/leads/${params.id}`);
      setLead(data);
    } catch (err) {
      // Lead not found (wrong id, or belongs to another company — the API's
      // own CompanyRoleGuard/tenant scoping already prevents cross-company
      // access, this UI just renders the resulting 404 clearly) vs. a real
      // network/server error are shown differently.
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError("Gagal memuat detail lead.");
      }
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(messageId: string) {
    setMarkingReadId(messageId);
    try {
      await apiFetch(`/contact-messages/${messageId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "READ" }),
      });
      await load();
      // Header badge uses the canonical unread-count hook (mount-only fetch).
      // Signal a revalidation only after the server confirmed PENDING → READ.
      notifyUnreadCountChanged("contact");
    } catch {
      setError("Gagal menandai pesan sebagai terbaca.");
    } finally {
      setMarkingReadId(null);
    }
  }

  async function changeStatus(nextStatus: LeadStatus) {
    if (!lead) return;
    setUpdating(true);
    try {
      await apiFetch<LeadDetail>(`/leads/${lead.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch {
      setError("Gagal mengubah status lead.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/leads" className="text-sm text-brand-700 underline">
        ← Kembali ke Lead Inbox
      </Link>

      {notFound ? (
        <p className="mt-6 text-sm text-slate-600">Lead tidak ditemukan.</p>
      ) : error ? (
        <p className="mt-6 text-sm text-red-600">{error}</p>
      ) : !lead ? (
        <p className="mt-6 text-sm text-slate-400">Memuat…</p>
      ) : (
        <>
          <div className="mt-4">
            <h1 className="text-xl font-semibold">{lead.name}</h1>
            {lead.organizationName && <p className="text-slate-600">{lead.organizationName}</p>}
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="break-all">{lead.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Telepon</dt>
              <dd>{lead.phone ?? "—"}</dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-slate-500">Status:</span>
            <select
              value={lead.status}
              disabled={updating}
              onChange={(e) => changeStatus(e.target.value as LeadStatus)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Interaksi ({lead.contactMessages.length})
          </h2>

          {lead.contactMessages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Belum ada interaksi.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {lead.contactMessages.map((message) => (
                <li key={message.id} className="rounded border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      {formatDateTime(message.createdAt)} · {SOURCE_LABELS[message.getFrom]}
                      {message.topic ? ` · ${message.topic.name}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <span>{message.status}</span>
                      {message.status === "PENDING" && (
                        <button
                          type="button"
                          disabled={markingReadId === message.id}
                          onClick={() => markRead(message.id)}
                          className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 disabled:opacity-50"
                        >
                          Tandai dibaca
                        </button>
                      )}
                    </span>
                  </div>
                  {message.subject && <p className="mt-2 font-medium">{message.subject}</p>}
                  {/* Plain text only — never dangerouslySetInnerHTML. Line
                      breaks preserved via whitespace-pre-wrap, no HTML parsing. */}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{message.message}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
