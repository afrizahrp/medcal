"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@medcal/shared";

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "REJECTED" | "CONVERTED";
type GetMessageFrom = "CONTACTFORM" | "WHATSAPP" | "CHAT_AI" | "CHAT_PERSON" | "EMAIL";

interface ContactTopic {
  id: number;
  name: string;
}

// A Lead can have MANY ContactMessages — Topic/Source/interaction-date are
// not permanent Lead attributes, so the API returns each Lead's single
// latest ContactMessage (see apps/api LeadsService.findAll) for display,
// not an assumption baked into the Lead row itself.
interface LatestContactMessage {
  id: string;
  getFrom: GetMessageFrom;
  createdAt: string;
  topic: ContactTopic | null;
}

interface Lead {
  id: string;
  status: LeadStatus;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  createdAt: string;
  contactMessages: LatestContactMessage[];
}

interface LeadListResponse {
  data: Lead[];
  page: number;
  pageSize: number;
  total: number;
}

interface NeedsReviewMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
}

interface NeedsReviewItem {
  message: NeedsReviewMessage;
  candidates: Lead[];
}

const STATUS_OPTIONS: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "REJECTED", "CONVERTED"];

const SOURCE_OPTIONS: GetMessageFrom[] = ["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"];

const SOURCE_LABELS: Record<GetMessageFrom, string> = {
  CONTACTFORM: "Contact Form",
  WHATSAPP: "WhatsApp",
  CHAT_AI: "Chat AI",
  CHAT_PERSON: "Web Chat",
  EMAIL: "Email",
};

export default function LeadsPage() {
  const [result, setResult] = useState<LeadListResponse | null>(null);
  const [needsReview, setNeedsReview] = useState<NeedsReviewItem[] | null>(null);
  const [topics, setTopics] = useState<ContactTopic[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [source, setSource] = useState<GetMessageFrom | "">("");
  const [topicId, setTopicId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

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
    try {
      const [leads, review] = await Promise.all([
        apiFetch<LeadListResponse>(`/leads?${params.toString()}`),
        apiFetch<NeedsReviewItem[]>("/leads/needs-review"),
      ]);
      setResult(leads);
      setNeedsReview(review);
    } catch {
      setError("Gagal memuat daftar lead.");
    } finally {
      setLoading(false);
    }
  }, [search, status, source, topicId, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(
    messageId: string,
    resolution: { action: "ATTACH"; leadId: string } | { action: "CREATE_NEW" },
  ) {
    setResolvingId(messageId);
    try {
      await apiFetch(`/contact-messages/${messageId}/lead`, {
        method: "PATCH",
        body: JSON.stringify(resolution),
      });
      await load();
    } catch {
      setError("Gagal menyelesaikan Needs Review.");
    } finally {
      setResolvingId(null);
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-xl font-semibold">Lead Inbox</h1>

      <section className="mt-6 rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          Needs Review{needsReview && needsReview.length > 0 ? ` (${needsReview.length})` : ""}
        </h2>
        {!needsReview ? (
          <p className="mt-2 text-sm text-amber-800">Memuat…</p>
        ) : needsReview.length === 0 ? (
          <p className="mt-2 text-sm text-amber-800">No messages require review.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {needsReview.map(({ message, candidates }) => (
              <li key={message.id} className="rounded border border-amber-200 bg-white p-3 text-sm">
                <p className="font-medium">
                  {message.name} {message.organizationName ? `· ${message.organizationName}` : ""}
                </p>
                <p className="text-slate-500">{message.phone ?? message.email}</p>
                <div className="mt-2 space-y-1">
                  {candidates.map((candidate) => (
                    <p key={candidate.id} className="text-xs text-slate-500">
                      Possible existing Lead: {candidate.name}
                      {candidate.organizationName ? ` · ${candidate.organizationName}` : ""} · #{candidate.id.slice(-6)}
                    </p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      disabled={resolvingId === message.id}
                      onClick={() => resolve(message.id, { action: "ATTACH", leadId: candidate.id })}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                    >
                      Attach to #{candidate.id.slice(-6)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={resolvingId === message.id}
                    onClick={() => resolve(message.id, { action: "CREATE_NEW" })}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Create New Lead
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Cari nama, email, telepon, perusahaan…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="min-w-64 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as LeadStatus | "");
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => {
            setPage(1);
            setSource(e.target.value as GetMessageFrom | "");
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
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
          onChange={(e) => {
            setPage(1);
            setTopicId(e.target.value);
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua topik</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded border border-slate-200">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Telepon</th>
              <th className="px-3 py-2">Perusahaan</th>
              <th className="px-3 py-2">Topik</th>
              <th className="px-3 py-2">Sumber</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={8}>
                  Memuat…
                </td>
              </tr>
            ) : result && result.data.length > 0 ? (
              result.data.map((lead) => {
                const latest = lead.contactMessages[0];
                return (
                  <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/management/leads/${lead.id}`} className="block text-brand-700 underline">
                        {new Date(latest?.createdAt ?? lead.createdAt).toLocaleDateString()}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{lead.name}</td>
                    <td className="px-3 py-2">{lead.email}</td>
                    <td className="px-3 py-2">{lead.phone ?? "—"}</td>
                    <td className="px-3 py-2">{lead.organizationName ?? "—"}</td>
                    <td className="px-3 py-2">{latest?.topic?.name ?? "—"}</td>
                    <td className="px-3 py-2">{latest ? SOURCE_LABELS[latest.getFrom] : "—"}</td>
                    <td className="px-3 py-2">{lead.status}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={8}>
                  Tidak ada lead.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Halaman {result.page} dari {totalPages} · {result.total} lead
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
