"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Save, Send, UserPlus } from "lucide-react";
import { ApiError, apiFetch, isForbidden, normalizePhone } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessDenied } from "../../../../components/access-denied";
import { notifyUnreadCountChanged } from "../../../../lib/use-unread-count";
import { formatCustomerApiError } from "../../customers/customer-form-utils";
import { useConvertLeadToCustomer } from "../../customers/use-customers-query";
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

import type { EmailListResponse, EmailListRow } from "../../email/use-emails-query";
import { formatListDateTime } from "../../email/email-ui";

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
  customerId: string | null;
  createdAt: string;
  contactMessages: ContactMessage[];
}

function whatsappHref(phone: string): string {
  return `https://wa.me/${normalizePhone(phone)}`;
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const convertMutation = useConvertLeadToCustomer();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadEmails, setLeadEmails] = useState<EmailListRow[] | null>(null);
  const [leadEmailsError, setLeadEmailsError] = useState<string | null>(null);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [updatingMessageStatusId, setUpdatingMessageStatusId] = useState<string | null>(null);
  const [draftLeadStatus, setDraftLeadStatus] = useState<LeadStatus>("NEW");
  const [draftMessageStatuses, setDraftMessageStatuses] = useState<Record<string, ContactStatus>>({});
  const [convertLegalName, setConvertLegalName] = useState("");
  const [convertTaxId, setConvertTaxId] = useState("");
  const [convertAddress, setConvertAddress] = useState("");
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    setForbidden(false);
    setLeadEmails(null);
    setLeadEmailsError(null);
    try {
      const data = await apiFetch<LeadDetail>(`/leads/${params.id}`);
      setLead(data);
      setDraftLeadStatus(data.status);
      setDraftMessageStatuses(
        Object.fromEntries(data.contactMessages.map((message) => [message.id, message.status])),
      );

      // Lead email history (confirmed association only) — Phase 3 completion pass.
      try {
        const emailData = await apiFetch<EmailListResponse>(`/leads/${params.id}/emails`);
        setLeadEmails(emailData.data);
      } catch (err) {
        if (isForbidden(err)) {
          // Keep page renderable; just hide lead history section.
          setLeadEmailsError("Anda tidak memiliki izin untuk melihat riwayat email lead ini.");
        } else {
          setLeadEmailsError("Gagal memuat riwayat email lead.");
        }
        setLeadEmails([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else if (isForbidden(err)) {
        setForbidden(true);
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

  async function convertToCustomer() {
    if (!lead || lead.customerId) return;
    setConvertError(null);
    setConvertSuccess(null);
    try {
      const result = await convertMutation.mutateAsync({
        leadId: lead.id,
        input: {
          ...(convertLegalName.trim() ? { legalName: convertLegalName.trim() } : {}),
          ...(convertTaxId.trim() ? { taxId: convertTaxId.trim() } : {}),
          ...(convertAddress.trim() ? { address: convertAddress.trim() } : {}),
        },
      });
      setConvertSuccess(`Lead dikonversi ke customer ${result.customer.number}.`);
      await load();
      router.push(`/customers/${result.customer.id}`);
    } catch (err) {
      setConvertError(formatCustomerApiError(err, "Gagal mengonversi lead ke customer."));
    }
  }

  if (forbidden) {
    return <AccessDenied />;
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

          <Surface className="mt-4 p-4 md:p-5">
            <h2 className="text-base font-semibold text-slate-900">Customer</h2>
            {lead.customerId ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-slate-600">Lead ini sudah terhubung ke customer.</p>
                <Link
                  href={`/customers/${lead.customerId}`}
                  className="inline-flex font-medium text-brand-800 underline hover:text-brand-900"
                >
                  Lihat customer
                </Link>
                <LeadStatusBadge status={lead.status} />
              </div>
            ) : capabilities?.customerCreate ? (
              <div className="mt-3 space-y-4">
                <p className="text-xs text-slate-400">
                  Konversi lead menjadi customer melalui transaksi backend. Nama organisasi/nama lead akan dipetakan
                  otomatis.
                </p>
                {convertError ? <p className="text-sm text-red-600">{convertError}</p> : null}
                {convertSuccess ? <p className="text-sm text-emerald-700">{convertSuccess}</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Legal name (opsional)</label>
                    <Input
                      value={convertLegalName}
                      onChange={(e) => setConvertLegalName(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Tax ID (opsional)</label>
                    <Input value={convertTaxId} onChange={(e) => setConvertTaxId(e.target.value)} className="mt-1.5" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Alamat (opsional)</label>
                  <textarea
                    value={convertAddress}
                    onChange={(e) => setConvertAddress(e.target.value)}
                    className={`${selectClassName} mt-1.5 min-h-[72px] w-full`}
                  />
                </div>
                <Button type="button" disabled={convertMutation.isPending} onClick={convertToCustomer}>
                  <UserPlus className="h-4 w-4" />
                  {convertMutation.isPending ? "Mengonversi…" : "Convert to Customer"}
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Lead belum dikonversi ke customer.</p>
            )}
          </Surface>

          <Surface className="mt-4 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">Email History</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">Email yang terasosiasi (confirmed) dengan lead ini.</p>

            {leadEmailsError ? (
              <p className="mt-3 text-sm text-red-600">{leadEmailsError}</p>
            ) : leadEmails === null ? (
              <p className="mt-3 text-sm text-slate-400">Memuat…</p>
            ) : leadEmails.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">Belum ada email terasosiasi.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-3">Subjek</th>
                      <th className="py-2 pr-3">Dari</th>
                      <th className="py-2 pr-3">Waktu</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadEmails.map((email) => (
                      <tr key={email.id} className="border-b border-slate-50">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/email/${email.id}`}
                            className="font-medium text-brand-800 underline hover:text-brand-900"
                          >
                            {email.subject || "(tanpa subjek)"}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{email.fromName || email.fromEmail}</td>
                        <td className="py-2 pr-3 text-slate-500">
                          {formatListDateTime(email.sentAt ?? email.receivedAt ?? email.createdAt)}
                        </td>
                        <td className="py-2 text-slate-500">
                          {email.status === "UNREAD" ? "Belum dibaca" : "Sudah dibaca"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
