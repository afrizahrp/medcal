"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Edit, Mail, Printer, X } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  ConfirmDialog,
  DetailField,
  PageHeader,
  QuotationTotals,
  SOURCE_LABELS,
  StatusBadge,
  Surface,
  formPageClass,
  formSurfaceClass,
  formatDate,
  formatDateTime,
  formatIdr,
  formatQty,
  formatQuotationApiError,
  quotationPdfFilenameForRow,
  type QuotationRow,
} from "../quotations-ui";
import { useQuotationEmailCompose } from "../use-quotation-email-compose";
import {
  openQuotationPdf,
  useApproveQuotation,
  useCancelQuotation,
  useQuotation,
  useRejectQuotation,
} from "../use-quotations-query";

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = useQuotation(params.id);
  const approveMutation = useApproveQuotation();
  const rejectMutation = useRejectQuotation();
  const cancelMutation = useCancelQuotation();
  const { compose, pending: composePending } = useQuotationEmailCompose();

  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printPending, setPrintPending] = useState(false);

  const quotation = query.data;

  if (isForbidden(query.error)) {
    return <AccessDenied />;
  }

  if (query.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Quotation tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/quotations", label: "Quotations" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Quotation tidak ditemukan.</p>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat quotation.</p>
      </div>
    );
  }

  const isDraft = quotation.status === "DRAFT";
  const isSent = quotation.status === "SENT";
  const canCancel = quotation.status !== "CANCELLED" && quotation.status !== "APPROVED";
  const isFrozen = !isDraft;

  async function runAction(action: "approve" | "reject" | "cancel") {
    setError(null);
    setSuccess(null);
    const mutations = {
      approve: approveMutation,
      reject: rejectMutation,
      cancel: cancelMutation,
    };
    const successMessages = {
      approve: "Quotation berhasil di-approve.",
      reject: "Quotation berhasil di-reject.",
      cancel: "Quotation berhasil dibatalkan.",
    };
    const fallbacks = {
      approve: "Gagal approve quotation.",
      reject: "Gagal reject quotation.",
      cancel: "Gagal membatalkan quotation.",
    };
    try {
      await mutations[action].mutateAsync(quotation!.id);
      setSuccess(successMessages[action]);
      setConfirmAction(null);
      await query.refetch();
    } catch (err) {
      setError(formatQuotationApiError(err, fallbacks[action]).message);
      setConfirmAction(null);
    }
  }

  const actionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    composePending ||
    printPending;

  async function handleComposeEmail() {
    setError(null);
    setSuccess(null);
    const message = await compose(quotation!);
    if (message) setError(message);
  }

  async function handlePrint() {
    setError(null);
    setSuccess(null);
    setPrintPending(true);
    try {
      await openQuotationPdf(quotation!.id, quotationPdfFilenameForRow(quotation!));
    } catch (err) {
      setError(formatQuotationApiError(err, "Gagal membuka PDF quotation.").message);
    } finally {
      setPrintPending(false);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={quotation.number}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/quotations", label: "Quotations" },
          { label: quotation.number },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Suspense fallback={null}>
        <CreatedNextSteps
          quotation={quotation}
          composing={composePending}
          printing={printPending}
          canCompose={Boolean(capabilities?.emailSend)}
          onCompose={handleComposeEmail}
          onPrint={handlePrint}
        />
      </Suspense>

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{quotation.number}</p>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={quotation.status} />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/quotations">
                <ArrowLeft className="h-4 w-4" />
                Back to List
              </Link>
            </Button>
          </div>
        </div>

        {isFrozen ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Quotation ini tidak dapat diedit dalam status saat ini.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <DetailField label="Customer">
            <Link
              href={`/customers/${quotation.customer.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {quotation.customer.name}
            </Link>
            <span className="ml-2 text-slate-400">({quotation.customer.number})</span>
          </DetailField>

          <DetailField label="Requisition">
            <Link
              href={`/calibration-requests/${quotation.request.id}`}
              className="font-mono text-brand-700 hover:underline"
            >
              {quotation.request.number}
            </Link>
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Source">{SOURCE_LABELS[quotation.source]}</DetailField>
            <DetailField label="Created">{formatDateTime(quotation.createdAt)}</DetailField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Valid Until">{formatDate(quotation.validUntil)}</DetailField>
            <DetailField label="Currency">{quotation.currency || "IDR"}</DetailField>
          </div>

          {quotation.status === "APPROVED" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Approved At">{formatDateTime(quotation.approvedAt)}</DetailField>
              <DetailField label="Customer Approved At">
                {formatDateTime(quotation.customerApprovedAt)}
              </DetailField>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Items ({quotation.items.length})</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Deskripsi</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotation.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 text-sm text-slate-900">{item.description}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-slate-700">
                        {item.requestItem?.deviceType.name ?? "—"}
                      </p>
                      {item.requestItem?.deviceId ? (
                        <p className="font-mono text-xs text-slate-400">
                          {item.requestItem.deviceId}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-slate-600">
                      {formatQty(item.qty)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-slate-600">
                      {formatIdr(item.unitPrice)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-medium text-slate-900">
                      {formatIdr(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <QuotationTotals
              subtotal={quotation.subtotal}
              taxAmount={quotation.taxAmount}
              tax={quotation.tax}
              totalAmount={quotation.totalAmount}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={handlePrint} disabled={printPending}>
            <Printer className="h-4 w-4" />
            {printPending ? "Membuka PDF…" : "Print"}
          </Button>

          {isDraft && capabilities?.quotationUpdate ? (
            <>
              <Button type="button" variant="outline" asChild>
                <Link href={`/quotations/${quotation.id}/edit`}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              {capabilities.emailSend ? (
                <Button type="button" onClick={handleComposeEmail} disabled={composePending}>
                  <Mail className="h-4 w-4" />
                  {composePending ? "Menyiapkan PDF…" : "Kirim via Email"}
                </Button>
              ) : null}
            </>
          ) : null}

          {isSent && capabilities?.emailSend ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleComposeEmail}
              disabled={composePending}
            >
              <Mail className="h-4 w-4" />
              {composePending ? "Menyiapkan PDF…" : "Kirim via Email"}
            </Button>
          ) : null}

          {isSent ? (
            <>
              {capabilities?.quotationApprove ? (
                <Button type="button" onClick={() => setConfirmAction("approve")}>
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
              ) : null}
              {capabilities?.quotationUpdate ? (
                <Button type="button" variant="outline" onClick={() => setConfirmAction("reject")}>
                  <X className="h-4 w-4" />
                  Reject
                </Button>
              ) : null}
            </>
          ) : null}

          {canCancel && capabilities?.quotationCancel ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmAction("cancel")}>
              <X className="h-4 w-4" />
              Cancel Quotation
            </Button>
          ) : null}
        </div>
      </Surface>

      <ConfirmDialog
        open={confirmAction === "approve"}
        title="Approve Quotation?"
        description="Quotation yang sudah di-approve tidak dapat dibatalkan. Lanjutkan?"
        confirmLabel="Approve"
        onConfirm={() => runAction("approve")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
      />
      <ConfirmDialog
        open={confirmAction === "reject"}
        title="Reject Quotation?"
        description="Status quotation akan menjadi Rejected. Requisition tidak berubah otomatis. Lanjutkan?"
        confirmLabel="Reject"
        onConfirm={() => runAction("reject")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
        variant="destructive"
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        title="Cancel Quotation?"
        description="Quotation yang dibatalkan tidak dapat dipulihkan. Requisition tidak berubah otomatis. Lanjutkan?"
        confirmLabel="Cancel Quotation"
        onConfirm={() => runAction("cancel")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
        variant="destructive"
      />
    </div>
  );
}

function CreatedNextSteps({
  quotation,
  composing,
  printing,
  canCompose,
  onCompose,
  onPrint,
}: {
  quotation: QuotationRow;
  composing: boolean;
  printing: boolean;
  canCompose: boolean;
  onCompose: () => void;
  onPrint: () => void;
}) {
  const searchParams = useSearchParams();
  if (searchParams.get("created") !== "1") return null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-sm font-medium text-emerald-900">Quotation berhasil dibuat.</p>
      <p className="mt-1 text-sm text-emerald-800">
        Tinjau dokumen quotation terlebih dahulu, lalu kirim PDF ke email customer jika sudah sesuai.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={`/quotations/${quotation.id}`}>View Quotation</Link>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onPrint} disabled={printing}>
          <Printer className="h-4 w-4" />
          {printing ? "Membuka PDF…" : "Print"}
        </Button>
        {canCompose ? (
          <Button type="button" size="sm" onClick={onCompose} disabled={composing}>
            <Mail className="h-4 w-4" />
            {composing ? "Menyiapkan PDF…" : "Generate PDF & Compose Email"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
