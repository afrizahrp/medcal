"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@medcal/shared";

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "REJECTED" | "CONVERTED";
type ContactStatus = "PENDING" | "READ" | "REPLIED" | "CLOSED";
type GetMessageFrom = "CONTACTFORM" | "WHATSAPP" | "CHAT_AI" | "CHAT_PERSON" | "EMAIL";

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
  contactMessages: ContactMessage[];
}

const STATUS_OPTIONS: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "REJECTED", "CONVERTED"];

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<LeadDetail>(`/leads/${params.id}`);
      setLead(data);
    } catch {
      setError("Gagal memuat detail lead.");
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(messageId: string) {
    try {
      await apiFetch(`/contact-messages/${messageId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "READ" }),
      });
      load();
    } catch {
      setError("Gagal menandai pesan sebagai terbaca.");
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

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-slate-400">Memuat…</main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">{lead.name}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt className="text-slate-500">Email</dt>
        <dd>{lead.email}</dd>
        <dt className="text-slate-500">Telepon</dt>
        <dd>{lead.phone ?? "—"}</dd>
        <dt className="text-slate-500">Perusahaan</dt>
        <dd>{lead.organizationName ?? "—"}</dd>
        <dt className="text-slate-500">Dibuat</dt>
        <dd>{new Date(lead.createdAt).toLocaleString()}</dd>
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

      <h2 className="mt-8 text-sm font-semibold text-slate-700">
        Riwayat Interaksi ({lead.contactMessages.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {lead.contactMessages.map((message) => (
          <li key={message.id} className="rounded border border-slate-200 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {message.getFrom} · {new Date(message.createdAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-2">
                <span>{message.status}</span>
                {message.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => markRead(message.id)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-slate-600"
                  >
                    Tandai dibaca
                  </button>
                )}
              </span>
            </div>
            {message.subject && <p className="mt-2 font-medium">{message.subject}</p>}
            <p className="mt-1 text-sm text-slate-700">{message.message}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
