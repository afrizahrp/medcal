"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError, isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { sanitizeEmailHtml } from "../../../../lib/sanitize-html";
import { useRequireSession, useAuthz } from "@medcal/auth/client";
import {
  EmailComposeFab,
  EmailFolderNav,
  formatListDateTime,
  PageHeader,
  Surface,
} from "../email-ui";
import {
  useEmailDetailQuery,
  useEmailStatisticsQuery,
  useMarkEmailRead,
  useMoveEmailToTrash,
  useDismissSuggestedLead,
  useRestoreEmail,
  useUpdateEmailLead,
} from "../use-emails-query";

function folderHref(folder: string): string {
  switch (folder) {
    case "SENT":
      return "/email/sent";
    case "DRAFTS":
      return "/email/drafts";
    case "TRASH":
      return "/email/trash";
    default:
      return "/email/inbox";
  }
}

function folderLabel(folder: string): string {
  switch (folder) {
    case "SENT":
      return "Sent";
    case "DRAFTS":
      return "Drafts";
    case "TRASH":
      return "Trash";
    default:
      return "Inbox";
  }
}

function folderTab(folder: string): "INBOX" | "SENT" | "DRAFTS" | "TRASH" {
  if (folder === "SENT" || folder === "DRAFTS" || folder === "TRASH") return folder;
  return "INBOX";
}

export default function EmailDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status: sessionStatus } = useRequireSession();
  const { capabilities } = useAuthz();
  const detailQuery = useEmailDetailQuery(params.id);
  const statsQuery = useEmailStatisticsQuery();
  const markRead = useMarkEmailRead();
  const moveTrash = useMoveEmailToTrash();
  const restore = useRestoreEmail();
  const updateLead = useUpdateEmailLead();
  const dismissSuggestedLead = useDismissSuggestedLead();

  const [actionError, setActionError] = useState<string | null>(null);
  const [leadActionError, setLeadActionError] = useState<string | null>(null);
  const [leadActionSuccess, setLeadActionSuccess] = useState<string | null>(null);
  const autoMarked = useRef<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  const email = detailQuery.data;
  const forbidden = isForbidden(detailQuery.error);
  const notFound =
    detailQuery.error instanceof ApiError && detailQuery.error.status === 404;
  const loadError =
    detailQuery.isError && !forbidden && !notFound ? "Gagal memuat detail email." : null;

  useEffect(() => {
    if (!email || email.status !== "UNREAD" || email.deletedAt) return;
    if (autoMarked.current === email.id) return;
    autoMarked.current = email.id;
    markRead.mutate({ id: email.id, status: "READ" });
    // Intentionally omit markRead from deps — mutate once per opened unread email.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.id, email?.status, email?.deletedAt]);

  useEffect(() => {
    if (!email) return;
    // For multi-candidates + change flow, default selection to current
    // associated lead if present, otherwise first candidate.
    if (email.lead) {
      setSelectedCandidateId(email.lead.id);
      return;
    }
    if (email.suggestedLead) {
      setSelectedCandidateId(email.suggestedLead.id);
      return;
    }
    if (email.leadCandidates?.length) {
      setSelectedCandidateId(email.leadCandidates[0].id);
      return;
    }
    setSelectedCandidateId("");
  }, [email?.id]);

  if (sessionStatus === "loading") {
    return <p className="px-4 py-6 text-sm text-slate-400">Memuat…</p>;
  }

  if (sessionStatus === "forbidden" || (capabilities && !capabilities.emailRead) || forbidden) {
    return <AccessDenied />;
  }

  async function toggleRead() {
    if (!email) return;
    setActionError(null);
    try {
      await markRead.mutateAsync({
        id: email.id,
        status: email.status === "READ" ? "UNREAD" : "READ",
      });
    } catch {
      setActionError("Gagal mengubah status baca.");
    }
  }

  async function handleTrash() {
    if (!email) return;
    setActionError(null);
    try {
      await moveTrash.mutateAsync(email.id);
      router.push("/email/trash");
    } catch {
      setActionError("Gagal memindahkan ke Trash.");
    }
  }

  async function handleRestore() {
    if (!email) return;
    setActionError(null);
    try {
      await restore.mutateAsync(email.id);
      router.push(folderHref(email.folder));
    } catch {
      setActionError("Gagal memulihkan email.");
    }
  }

  const crumbs = [
    { href: "/", label: "Dashboard" },
    { href: "/email", label: "Email" },
    ...(email
      ? [{ href: folderHref(email.folder), label: folderLabel(email.folder) }]
      : [{ label: "Detail" }]),
  ];

  if (notFound) {
    return (
      <div className="w-full px-4 py-6 md:px-6 md:py-6">
        <PageHeader title="Email tidak ditemukan" crumbs={crumbs} />
        <p className="mt-6 text-sm text-slate-600">Email tidak ditemukan.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/email/inbox">Kembali ke Inbox</Link>
        </Button>
      </div>
    );
  }

  if (loadError && !email) {
    return (
      <div className="w-full px-4 py-6 md:px-6 md:py-6">
        <PageHeader title="Email" crumbs={crumbs} />
        <p className="mt-6 text-sm text-red-600">{loadError}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => detailQuery.refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if (!email) {
    return <p className="px-4 py-6 text-sm text-slate-400">Memuat…</p>;
  }

  const when =
    email.folder === "SENT"
      ? formatListDateTime(email.sentAt ?? email.createdAt)
      : formatListDateTime(email.receivedAt ?? email.createdAt);

  const bodyHtml = email.textBody
    ? undefined
    : sanitizeEmailHtml(email.body || "");
  const bodyText = email.textBody ?? (!email.body.includes("<") ? email.body : null);

  const replyHref = `/email/compose?replyTo=${encodeURIComponent(email.id)}&to=${encodeURIComponent(email.fromEmail)}&subject=${encodeURIComponent(
    email.subject?.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject || ""}`,
  )}`;

  const canManageLead = Boolean(capabilities?.emailManage);
  const associatedLead = email.lead;
  const suggestedLead = email.suggestedLead;
  const candidates = email.leadCandidates ?? [];

  const candidateOptions = (() => {
    // De-dupe by id (backend should already be unique, but keep UI robust).
    const seen = new Set<string>();
    const out: typeof candidates = [];
    for (const c of candidates) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  })();

  async function handleConfirmLead(leadIdOverride?: string) {
    if (!email) return;
    if (!canManageLead) return;
    const leadIdToUse = leadIdOverride ?? selectedCandidateId;
    if (!leadIdToUse) return;

    setLeadActionError(null);
    setLeadActionSuccess(null);
    try {
      await updateLead.mutateAsync({ id: email.id, leadId: leadIdToUse });
      setLeadActionSuccess("Lead berhasil dikonfirmasi.");
    } catch {
      setLeadActionError("Gagal mengonfirmasi lead.");
    }
  }

  async function handleChangeLead() {
    await handleConfirmLead();
  }

  async function handleRemoveLead() {
    if (!email) return;
    if (!canManageLead) return;

    setLeadActionError(null);
    setLeadActionSuccess(null);
    try {
      await updateLead.mutateAsync({ id: email.id, leadId: null });
      setLeadActionSuccess("Asosiasi lead dihapus.");
    } catch {
      setLeadActionError("Gagal menghapus asosiasi lead.");
    }
  }

  async function handleDismissSuggestion() {
    if (!email) return;

    setLeadActionError(null);
    setLeadActionSuccess(null);
    try {
      await dismissSuggestedLead.mutateAsync({ id: email.id });
      setLeadActionSuccess("Saran lead dibersihkan.");
    } catch {
      setLeadActionError("Gagal membersihkan saran lead.");
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <PageHeader title={email.subject || "(tanpa subjek)"} crumbs={crumbs} />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <EmailFolderNav
          active={email.deletedAt ? "TRASH" : folderTab(email.folder)}
          stats={statsQuery.data ?? null}
        />
        <div className="flex flex-wrap items-center gap-2">
          {capabilities?.emailSend && email.folder === "INBOX" && !email.deletedAt ? (
            <Button asChild size="sm">
              <Link href={replyHref}>Reply</Link>
            </Button>
          ) : null}
          {capabilities?.emailSend ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/email/compose">Compose</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {email.folder === "DRAFTS" && !email.deletedAt ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Draft tersimpan.{" "}
          {capabilities?.emailSend ? (
            <Link
              href={`/email/compose?draftId=${encodeURIComponent(email.id)}`}
              className="font-medium text-brand-800 underline"
            >
              Edit Draft
            </Link>
          ) : (
            "Anda tidak memiliki izin mengirim."
          )}
        </p>
      ) : null}

      <Surface className="mt-6 p-4 md:p-6">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Dari</dt>
            <dd className="mt-0.5 text-slate-800">
              {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Kepada</dt>
            <dd className="mt-0.5 text-slate-800">
              {email.toName ? `${email.toName} <${email.toEmail}>` : email.toEmail || "—"}
            </dd>
          </div>
          {email.ccEmail ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Cc</dt>
              <dd className="mt-0.5 text-slate-800">{email.ccEmail}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Waktu</dt>
            <dd className="mt-0.5 text-slate-800">{when}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
            <dd className="mt-0.5 text-slate-800">
              {email.deletedAt ? "Trash" : email.status === "UNREAD" ? "Belum dibaca" : "Sudah dibaca"}
            </dd>
          </div>
          {email.lead ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Lead</dt>
              <dd className="mt-0.5">
                <Link href={`/leads/${email.lead.id}`} className="font-medium text-brand-800 underline">
                  {email.lead.name}
                </Link>
              </dd>
            </div>
          ) : email.suggestedLead ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Suggested Lead</dt>
              <dd className="mt-0.5 text-amber-800">
                {email.suggestedLead.name}
                {email.suggestedLead.email ? (
                  <span className="ml-2 text-xs text-amber-700">{email.suggestedLead.email}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Lead association UI (Phase 3B) */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
          {associatedLead ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Associated Lead</p>
                  <p className="mt-1 text-sm text-slate-700">
                    <Link
                      href={`/leads/${associatedLead.id}`}
                      className="font-medium text-brand-800 underline"
                    >
                      {associatedLead.name}
                    </Link>
                    {associatedLead.email ? (
                      <span className="ml-2 text-xs text-slate-500">{associatedLead.email}</span>
                    ) : null}
                  </p>
                </div>

                {canManageLead ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                    onClick={handleRemoveLead}
                    disabled={updateLead.isPending}
                  >
                    Remove association
                  </Button>
                ) : null}
              </div>

              {canManageLead ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="text-xs uppercase tracking-wide text-slate-400" htmlFor="lead-change-select">
                      Change lead
                    </label>
                    <select
                      id="lead-change-select"
                      value={selectedCandidateId}
                      onChange={(e) => setSelectedCandidateId(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                    >
                      {candidateOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedCandidateId || updateLead.isPending}
                    onClick={handleChangeLead}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Perubahan asosiasi lead memerlukan izin <span className="font-medium">email:manage</span>.
                </p>
              )}
            </>
          ) : suggestedLead ? (
            <>
              <p className="text-sm font-semibold text-slate-900">Suggested Lead</p>
              <p className="mt-1 text-sm text-amber-800">
                <Link
                  href={`/leads/${suggestedLead.id}`}
                  className="font-medium underline"
                >
                  {suggestedLead.name}
                </Link>
                {suggestedLead.email ? (
                  <span className="ml-2 text-xs text-amber-700">{suggestedLead.email}</span>
                ) : null}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {canManageLead ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={updateLead.isPending}
                    onClick={() => handleConfirmLead(suggestedLead.id)}
                  >
                    Confirm
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={dismissSuggestedLead.isPending}
                  onClick={handleDismissSuggestion}
                >
                  Dismiss
                </Button>
              </div>
            </>
          ) : candidateOptions.length > 0 ? (
            <>
              <p className="text-sm font-semibold text-slate-900">Possible Leads</p>
              <p className="mt-1 text-sm text-slate-600">Pilih salah satu lead lalu konfirmasi.</p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs uppercase tracking-wide text-slate-400" htmlFor="lead-candidate-select">
                    Candidates ({candidateOptions.length})
                  </label>
                  <select
                    id="lead-candidate-select"
                    value={selectedCandidateId}
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                    disabled={!canManageLead}
                  >
                    {candidateOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {canManageLead ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedCandidateId || updateLead.isPending}
                    onClick={() => handleConfirmLead()}
                  >
                    Confirm
                  </Button>
                ) : null}
              </div>

              {!canManageLead ? (
                <p className="mt-3 text-xs text-slate-500">
                  Untuk mengonfirmasi asosiasi lead, Anda memerlukan izin <span className="font-medium">email:manage</span>.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">Tidak ada kandidat lead.</p>
          )}

          {leadActionError ? <p className="mt-3 text-sm text-red-600">{leadActionError}</p> : null}
          {leadActionSuccess ? (
            <p className="mt-3 text-sm text-emerald-700">
              {leadActionSuccess}
            </p>
          ) : null}
        </div>

        {email.parentEmail ? (
          <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Membalas:{" "}
            <Link href={`/email/${email.parentEmail.id}`} className="font-medium text-brand-800 underline">
              {email.parentEmail.subject || "(tanpa subjek)"}
            </Link>
          </div>
        ) : null}

        <div className="mt-6 border-t border-slate-100 pt-5">
          {bodyText ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{bodyText}</pre>
          ) : bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="text-sm text-slate-400">(kosong)</p>
          )}
        </div>

        {actionError ? <p className="mt-4 text-sm text-red-600">{actionError}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={toggleRead} disabled={markRead.isPending}>
            {email.status === "READ" ? "Tandai belum dibaca" : "Tandai sudah dibaca"}
          </Button>
          {capabilities?.emailDelete && !email.deletedAt ? (
            <Button type="button" variant="outline" size="sm" onClick={handleTrash} disabled={moveTrash.isPending}>
              Pindahkan ke Trash
            </Button>
          ) : null}
          {capabilities?.emailDelete && email.deletedAt ? (
            <Button type="button" variant="outline" size="sm" onClick={handleRestore} disabled={restore.isPending}>
              Pulihkan
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link href={folderHref(email.folder)}>Kembali</Link>
          </Button>
        </div>
      </Surface>

      <EmailComposeFab visible={Boolean(capabilities?.emailSend)} />
    </div>
  );
}
