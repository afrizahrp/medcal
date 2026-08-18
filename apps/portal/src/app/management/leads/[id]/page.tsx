"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MessageCircle, Save, Send } from "lucide-react";
import { ApiError, apiFetch, normalizePhone } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notifyUnreadCountChanged } from "../../../../lib/use-unread-count";
import {
  type ContactStatus,
  type GetMessageFrom,
  type LeadStatus,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_OPTIONS,
  ContactInfoRow,
  ContactStatusBadge,
  ContactStatusIcon,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_OPTIONS,
  LeadStatusBadge,
  PageHeader,
  SOURCE_LABELS,
  Surface,
  contactInfoIcons,
  formatDetailTimestamp,
  selectClassName,
} from "../leads-ui";

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
  contactMessages: ContactMessage[];
}

function whatsappHref(phone: string): string {
  return `https://wa.me/${normalizePhone(phone)}`;
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [updatingMessageStatusId, setUpdatingMessageStatusId] = useState<string | null>(null);
  const [draftLeadStatus, setDraftLeadStatus] = useState<LeadStatus>("NEW");
  const [draftMessageStatuses, setDraftMessageStatuses] = useState<Record<string, ContactStatus>>({});

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      const data = await apiFetch<LeadDetail>(`/leads/${params.id}`);
      setLead(data);
      setDraftLeadStatus(data.status);
      setDraftMessageStatuses(
        Object.fromEntries(data.contactMessages.map((message) => [message.id, message.status])),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError("Gagal memuat detail pesan.");
      }
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateMessageStatus(messageId: string) {
    const nextStatus = draftMessageStatuses[messageId];
    const current = lead?.contactMessages.find((m) => m.id === messageId);
    if (!nextStatus || !current || nextStatus === current.status) return;

    setUpdatingMessageStatusId(messageId);
    try {
      await apiFetch(`/contact-messages/${messageId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
      if (current.status === "PENDING" && nextStatus !== "PENDING") {
        notifyUnreadCountChanged("contact");
      }
    } catch {
      setError("Gagal mengubah status pesan.");
    } finally {
      setUpdatingMessageStatusId(null);
    }
  }

  async function updateLeadStatus() {
    if (!lead || draftLeadStatus === lead.status) return;
    setUpdatingLeadStatus(true);
    try {
      await apiFetch<LeadDetail>(`/leads/${lead.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: draftLeadStatus }),
      });
      await load();
    } catch {
      setError("Gagal mengubah status lead.");
    } finally {
      setUpdatingLeadStatus(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
      {notFound ? (
        <>
          <PageHeader
            title="Pesan tidak ditemukan"
            crumbs={[
              { href: "/", label: "Dashboard" },
              { href: "/leads", label: "Contact Messages" },
            ]}
          />
          <p className="mt-6 text-sm text-slate-600">Pesan tidak ditemukan.</p>
        </>
      ) : error && !lead ? (
        <>
          <PageHeader
            title="Contact Messages"
            crumbs={[
              { href: "/", label: "Dashboard" },
              { href: "/leads", label: "Contact Messages" },
            ]}
          />
          <p className="mt-6 text-sm text-red-600">{error}</p>
        </>
      ) : !lead ? (
        <p className="text-sm text-slate-400">Memuat…</p>
      ) : (
        <>
          <PageHeader
            title={`Message from ${lead.name}`}
            crumbs={[
              { href: "/", label: "Dashboard" },
              { href: "/leads", label: "Contact Messages" },
              { label: lead.name },
            ]}
          />

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <Surface className="mt-6 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">Contact Information</h2>
              {lead.phone && (
                <a
                  href={whatsappHref(lead.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
            </div>
            <div className="mt-4 space-y-2.5">
              {lead.organizationName ? (
                <ContactInfoRow icon={contactInfoIcons.company} label="Company" value={lead.organizationName} />
              ) : null}
              <ContactInfoRow icon={contactInfoIcons.name} label="Name" value={lead.name} />
              <ContactInfoRow
                icon={contactInfoIcons.email}
                label="Email"
                value={lead.email}
                href={`mailto:${lead.email}`}
              />
              {lead.phone ? (
                <ContactInfoRow
                  icon={contactInfoIcons.phone}
                  label="Phone"
                  value={lead.phone}
                  href={`tel:${lead.phone}`}
                />
              ) : null}
            </div>
          </Surface>

          {lead.contactMessages.length === 0 ? (
            <Surface className="mt-4 p-4 md:p-5">
              <h2 className="text-base font-semibold text-slate-900">Message Details</h2>
              <p className="mt-3 text-sm text-slate-400">Belum ada interaksi.</p>
            </Surface>
          ) : (
            lead.contactMessages.map((message) => {
              const draftStatus = draftMessageStatuses[message.id] ?? message.status;
              return (
                <Surface key={message.id} className="mt-4 p-4 md:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">Message Details</h2>
                      {message.topic ? (
                        <Badge variant="secondary" className="font-medium text-slate-600">
                          {message.topic.name}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="font-medium text-slate-500">
                        {SOURCE_LABELS[message.getFrom]}
                      </Badge>
                      <ContactStatusBadge status={message.status} />
                    </div>
                    <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      {contactInfoIcons.calendar}
                      <span className="hidden sm:inline">{formatDetailTimestamp(message.createdAt)}</span>
                      <span className="sm:hidden">{new Date(message.createdAt).toLocaleDateString("id-ID")}</span>
                    </p>
                  </div>

                  {message.subject ? <p className="mt-3 text-sm font-medium text-slate-800">{message.subject}</p> : null}

                  <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    <p className="whitespace-pre-wrap">{message.message}</p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button asChild className="w-full sm:w-auto">
                      <a href={`mailto:${lead.email}`}>
                        <Send className="h-4 w-4" />
                        Reply via Email
                      </a>
                    </Button>
                    {lead.phone ? (
                      <Button
                        asChild
                        variant="outline"
                        className="w-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 sm:w-auto"
                      >
                        <a href={whatsappHref(lead.phone)} target="_blank" rel="noreferrer">
                          <MessageCircle className="h-4 w-4" />
                          Reply via WhatsApp
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900">Status</h3>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative w-full sm:max-w-xs">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <ContactStatusIcon status={draftStatus} />
                        </span>
                        <select
                          value={draftStatus}
                          disabled={updatingMessageStatusId === message.id}
                          onChange={(e) =>
                            setDraftMessageStatuses((prev) => ({
                              ...prev,
                              [message.id]: e.target.value as ContactStatus,
                            }))
                          }
                          className={`${selectClassName} w-full pl-9 sm:max-w-xs`}
                        >
                          {CONTACT_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {CONTACT_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        disabled={updatingMessageStatusId === message.id || draftStatus === message.status}
                        onClick={() => updateMessageStatus(message.id)}
                      >
                        <Save className="h-4 w-4" />
                        Update
                      </Button>
                    </div>
                  </div>
                </Surface>
              );
            })
          )}

          <Surface className="mt-4 p-4 md:p-5">
            <h2 className="text-base font-semibold text-slate-900">Lead Status</h2>
            <p className="mt-1 text-xs text-slate-400">Status agregat lead — terpisah dari status pesan individual.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={draftLeadStatus}
                disabled={updatingLeadStatus}
                onChange={(e) => setDraftLeadStatus(e.target.value as LeadStatus)}
                className={`${selectClassName} w-full sm:max-w-xs`}
              >
                {LEAD_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button type="button" className="w-full sm:w-auto" disabled={updatingLeadStatus || draftLeadStatus === lead.status} onClick={updateLeadStatus}>
                <Save className="h-4 w-4" />
                Update
              </Button>
              <LeadStatusBadge status={lead.status} />
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
