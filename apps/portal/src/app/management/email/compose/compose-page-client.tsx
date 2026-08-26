"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, isForbidden } from "@medcal/shared";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessDenied } from "../../../../components/access-denied";
import { useRequireSession, useAuthz } from "@medcal/auth/client";
import { EmailFolderNav, PageHeader, Surface } from "../email-ui";
import {
  useEmailDetailQuery,
  useEmailStatisticsQuery,
  useSendDraft,
  useSaveDraft,
  useSendEmail,
  useUpdateDraft,
} from "../use-emails-query";
import { quotationPdfFilenameForRow } from "../../quotations/quotations-ui";
import { fetchQuotationPdf, useQuotation } from "../../quotations/use-quotations-query";

export default function EmailComposePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const replyToId = searchParams.get("replyTo") ?? "";
  const draftId = searchParams.get("draftId") ?? "";
  const quotationId = searchParams.get("quotationId") ?? "";
  const isEditingDraft = Boolean(draftId);
  const { status: sessionStatus } = useRequireSession();
  const { capabilities } = useAuthz();
  const statsQuery = useEmailStatisticsQuery();
  const replyQuery = useEmailDetailQuery(replyToId);
  const draftQuery = useEmailDetailQuery(draftId);
  const quotationQuery = useQuotation(quotationId || undefined);
  const sendMutation = useSendEmail();
  const draftMutation = useSaveDraft();
  const updateDraftMutation = useUpdateDraft();
  const sendDraftMutation = useSendDraft();

  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(searchParams.get("subject") ?? "");
  const [body, setBody] = useState(searchParams.get("body") ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [seededReply, setSeededReply] = useState(false);
  const [seededDraft, setSeededDraft] = useState(false);

  useEffect(() => {
    if (isEditingDraft) return;
    if (!replyQuery.data || seededReply) return;
    const parent = replyQuery.data;
    setTo(parent.fromEmail || to);
    if (!subject) {
      const base = parent.subject || "";
      setSubject(base.toLowerCase().startsWith("re:") ? base : `Re: ${base}`);
    }
    setSeededReply(true);
  }, [replyQuery.data, seededReply, subject, to]);

  useEffect(() => {
    if (!isEditingDraft) return;
    if (!draftQuery.data || seededDraft) return;
    const draft = draftQuery.data;
    setTo(draft.toEmail || "");
    setCc(draft.ccEmail || "");
    setSubject(draft.subject || "");
    setBody(draft.body || "");
    setSeededDraft(true);
  }, [draftQuery.data, isEditingDraft, seededDraft]);

  if (sessionStatus === "loading") {
    return <p className="px-4 py-6 text-sm text-slate-400">Memuat…</p>;
  }

  if (sessionStatus === "forbidden" || (capabilities && !capabilities.emailSend)) {
    return <AccessDenied message="Anda tidak memiliki izin mengirim email." />;
  }

  async function handleSend() {
    setFormError(null);
    setSuccessMessage(null);
    try {
      if (isEditingDraft) {
        if (!draftId) throw new Error("Missing draftId");
        await sendDraftMutation.mutateAsync(draftId);
        setSuccessMessage("Draft berhasil dikirim.");
        router.push("/email/sent");
        return;
      }

      await sendMutation.mutateAsync({
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        parentEmailId: replyToId || undefined,
        quotationId: quotationId || undefined,
      });
      setSuccessMessage("Email berhasil dikirim.");
      setTo("");
      setCc("");
      setSubject("");
      setBody("");
    } catch (err) {
      if (isForbidden(err)) {
        setFormError(isEditingDraft ? "Akses ditolak untuk mengirim draft." : "Akses ditolak untuk mengirim email.");
      } else if (err instanceof ApiError) {
        setFormError(err.message || "Gagal mengirim email.");
      } else {
        setFormError(isEditingDraft ? "Gagal mengirim draft." : "Gagal mengirim email.");
      }
    }
  }

  async function handleSaveDraft() {
    setFormError(null);
    setSuccessMessage(null);
    try {
      if (isEditingDraft) {
        if (!draftId) throw new Error("Missing draftId");
        await updateDraftMutation.mutateAsync({
          id: draftId,
          payload: {
            to: to.trim() || undefined,
            cc: cc.trim() || undefined,
            subject: subject.trim() || undefined,
            body: body || undefined,
          },
        });
        setSuccessMessage("Draft diperbarui.");
        return;
      }

      await draftMutation.mutateAsync({
        to: to.trim() || undefined,
        cc: cc.trim() || undefined,
        subject: subject.trim() || undefined,
        body: body || undefined,
        parentEmailId: replyToId || undefined,
      });
      setSuccessMessage("Draft disimpan.");
    } catch (err) {
      if (isForbidden(err)) {
        setFormError(isEditingDraft ? "Akses ditolak untuk memperbarui draft." : "Akses ditolak untuk menyimpan draft.");
      } else if (err instanceof ApiError) {
        setFormError(err.message || "Gagal menyimpan draft.");
      } else {
        setFormError(isEditingDraft ? "Gagal memperbarui draft." : "Gagal menyimpan draft.");
      }
    }
  }

  const busy = isEditingDraft
    ? updateDraftMutation.isPending || sendDraftMutation.isPending
    : sendMutation.isPending || draftMutation.isPending;
  const quotationReady = !quotationId || Boolean(quotationQuery.data);
  const quotationFailed = Boolean(quotationId) && quotationQuery.isError;
  const canSend = Boolean(to.trim() && subject.trim() && body.trim()) && quotationReady && !quotationFailed;

  async function downloadQuotationPdf() {
    if (!quotationId || !quotationQuery.data) return;
    try {
      const blob = await fetchQuotationPdf(quotationId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = quotationPdfFilenameForRow(quotationQuery.data);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message || "Gagal mengunduh PDF quotation.");
      } else {
        setFormError("Gagal mengunduh PDF quotation.");
      }
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader
        title="Compose"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/email", label: "Email" },
          { label: "Compose" },
        ]}
      />

      <div className="mt-4">
        <EmailFolderNav stats={statsQuery.data ?? null} />
      </div>

      <Surface className="mt-6 p-4 md:p-6">
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-400">Kepada</span>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="penerima@contoh.com"
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-400">Cc (opsional)</span>
            <Input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@contoh.com"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-400">Subjek</span>
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subjek email"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-400">Pesan</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tulis pesan…"
              rows={14}
              className="min-h-[240px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none ring-offset-background placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
        </div>

        {quotationId ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            {quotationQuery.isLoading ? (
              <p className="text-sm text-slate-500">Menyiapkan lampiran quotation…</p>
            ) : quotationQuery.isError || !quotationQuery.data ? (
              <p className="text-sm text-red-600">
                Lampiran quotation tidak dapat dimuat. Email tidak dikirim sampai PDF tersedia.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-slate-700">
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                  <span>
                    Lampiran:{" "}
                    <span className="font-medium">
                      {quotationPdfFilenameForRow(quotationQuery.data)}
                    </span>
                  </span>
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadQuotationPdf}>
                  Unduh PDF
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {!isEditingDraft && replyToId && replyQuery.data ? (
          <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Membalas:{" "}
            <Link href={`/email/${replyQuery.data.id}`} className="font-medium text-brand-800 underline">
              {replyQuery.data.subject || "(tanpa subjek)"}
            </Link>
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            {successMessage}{" "}
            <Link href="/email/sent" className="font-medium underline">
              Lihat Sent →
            </Link>
          </p>
        ) : null}
        {formError ? <p className="mt-4 text-sm text-red-600">{formError}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {isEditingDraft ? (
            <>
              <Button type="button" size="sm" disabled={!canSend || busy} onClick={handleSend}>
                {sendDraftMutation.isPending ? "Mengirim…" : "Kirim Draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={handleSaveDraft}
              >
                {updateDraftMutation.isPending ? "Memperbarui…" : "Update Draft"}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/email/drafts">Batal</Link>
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" disabled={!canSend || busy} onClick={handleSend}>
                {sendMutation.isPending ? "Mengirim…" : "Kirim"}
              </Button>
              {quotationId ? (
                <p className="self-center text-xs text-slate-500">
                  Draft tidak tersedia: lampiran PDF quotation hanya terkirim saat Anda menekan Kirim.
                </p>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleSaveDraft}>
                  {draftMutation.isPending ? "Menyimpan…" : "Simpan Draft"}
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/email/inbox">Batal</Link>
              </Button>
            </>
          )}
        </div>
      </Surface>
    </div>
  );
}
