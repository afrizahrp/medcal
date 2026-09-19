"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Edit,
  FileText,
  History as HistoryIcon,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
import { deviceDisplayNames } from "@/lib/device-name-display";
import { useQuotationEmailCompose } from "../use-quotation-email-compose";
import { useTaxes } from "../use-taxes-query";
import {
  openQuotationPdf,
  useApproveQuotation,
  useCancelQuotation,
  useQuotation,
  useQuotationHistory,
  useQuotationHistoryRevision,
  useRejectQuotation,
  useReviseQuotation,
} from "../use-quotations-query";
import {
  canCreatePurchaseOrderFromQuotation,
  findActivePurchaseOrder,
} from "../../purchase-orders/purchase-order-form-utils";
import { StatusBadge as PurchaseOrderStatusBadge, type PurchaseOrderRow } from "../../purchase-orders/purchase-orders-ui";
import { usePurchaseOrders } from "../../purchase-orders/use-purchase-orders-query";

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = useQuotation(params.id);
  const approveMutation = useApproveQuotation();
  const rejectMutation = useRejectQuotation();
  const cancelMutation = useCancelQuotation();
  const { compose, pending: composePending } = useQuotationEmailCompose();
  const purchaseOrderQuery = usePurchaseOrders(
    {
      search: "",
      status: "",
      quotationId: params.id,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
      pageSize: 20,
    },
    Boolean(params.id && capabilities?.purchaseOrderRead),
  );

  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printPending, setPrintPending] = useState(false);
  // MOM #1 — Transaction Revision + Immutable History
  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const quotation = query.data;
  // `Tax.isExclude` is read live from the Tax master via the quotation's `taxCode`
  // — nothing about the tax mode is snapshotted on the quotation itself.
  const taxesQuery = useTaxes();
  const quotationTax = quotation
    ? (taxesQuery.data?.data.find((tax) => tax.taxCode === quotation.taxCode) ?? null)
    : null;

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
  // MOM #1 — Transaction Revision + Immutable History. Revise is the
  // committed-document counterpart to Edit: legal exactly where Edit is not
  // (left DRAFT) and the document is not terminal (REJECTED/EXPIRED/CANCELLED).
  const canRevise = quotation.status === "SENT" || quotation.status === "APPROVED";

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
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotation.items.map((item) => {
                  // Alias on top, master name below (MoM #3).
                  const names = deviceDisplayNames({
                    customerDeviceName: item.requestItem?.customerDeviceName,
                    deviceTypeName: item.requestItem?.deviceType.name,
                  });
                  return (
                  <tr key={item.id}>
                    <td className="px-3 py-3 text-sm text-slate-900">{item.description}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-slate-700">{names.primary ?? "—"}</p>
                      {names.secondary ? (
                        <p className="text-xs text-slate-500">{names.secondary}</p>
                      ) : null}
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
                    <td className="px-3 py-3 text-right text-sm text-slate-600">
                      {formatIdr(item.discountAmount)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-medium text-slate-900">
                      {formatIdr(item.lineTotal)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <QuotationTotals
              subtotal={quotation.subtotal}
              headerDiscountAmount={quotation.headerDiscountAmount}
              taxCode={quotation.taxCode}
              taxRate={quotation.taxRate}
              taxAmount={quotation.taxAmount}
              taxIsExclude={quotationTax?.isExclude ?? null}
              totalAmount={quotation.totalAmount}
            />
          </div>
        </div>

        {capabilities?.purchaseOrderRead || capabilities?.purchaseOrderCreate ? (
          <QuotationPurchaseOrderSection
            quotation={quotation}
            canCreate={Boolean(capabilities?.purchaseOrderCreate)}
            canRead={Boolean(capabilities?.purchaseOrderRead)}
            queryLoading={purchaseOrderQuery.isLoading}
            queryError={purchaseOrderQuery.isError}
            queryForbidden={isForbidden(purchaseOrderQuery.error)}
            rows={purchaseOrderQuery.data?.data ?? []}
          />
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={handlePrint} disabled={printPending}>
            <Printer className="h-4 w-4" />
            {printPending ? "Membuka PDF…" : "Print"}
          </Button>

          {capabilities?.quotationRead ? (
            <Button type="button" variant="outline" onClick={() => setHistoryDialogOpen(true)}>
              <HistoryIcon className="h-4 w-4" />
              History
            </Button>
          ) : null}

          {canRevise && capabilities?.quotationUpdate ? (
            <Button type="button" variant="outline" onClick={() => setReviseDialogOpen(true)}>
              <RefreshCw className="h-4 w-4" />
              Revise
            </Button>
          ) : null}

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

          {(isDraft || isSent) && capabilities?.quotationApprove ? (
            <Button type="button" onClick={() => setConfirmAction("approve")}>
              <Check className="h-4 w-4" />
              Approve
            </Button>
          ) : null}

          {isSent && capabilities?.quotationUpdate ? (
            <Button type="button" variant="outline" onClick={() => setConfirmAction("reject")}>
              <X className="h-4 w-4" />
              Reject
            </Button>
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
        title="Approve this Quotation?"
        description="Setelah disetujui, semua input quotation akan terkunci."
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

      {reviseDialogOpen ? (
        <ReviseQuotationDialog
          quotation={quotation}
          onClose={() => setReviseDialogOpen(false)}
          onRevised={async () => {
            setReviseDialogOpen(false);
            setSuccess("Quotation berhasil direvisi.");
            await query.refetch();
          }}
        />
      ) : null}

      {historyDialogOpen ? (
        <QuotationHistoryDialog quotationId={quotation.id} onClose={() => setHistoryDialogOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * MOM #1 — Transaction Revision + Immutable History.
 *
 * Minimal revision form: lets the user change the qty of an existing item.
 * The service decides per line whether that's applied in place or as an
 * additive sibling row (mom-1-item-revision-rule) — the UI does not need to
 * know which. Adding a brand-new line item is intentionally out of scope for
 * this first UI pass (see the implementation report's Known Constraints).
 */
function ReviseQuotationDialog({
  quotation,
  onClose,
  onRevised,
}: {
  quotation: QuotationRow;
  onClose: () => void;
  onRevised: () => void;
}) {
  const reviseMutation = useReviseQuotation();
  const [qtyById, setQtyById] = useState<Record<string, string>>(() =>
    Object.fromEntries(quotation.items.map((item) => [item.id, String(item.qty)])),
  );
  const [error, setError] = useState<string | null>(null);

  const changedItems = quotation.items.filter((item) => {
    const value = Number(qtyById[item.id]);
    return Number.isFinite(value) && value > 0 && value !== Number(item.qty);
  });

  async function submit() {
    setError(null);
    if (changedItems.length === 0) {
      setError("Ubah qty setidaknya satu item untuk membuat revisi.");
      return;
    }
    if (!changedItems.every((item) => item.requestItemId)) {
      setError("Item ini tidak memiliki tautan requisition dan tidak dapat direvisi dari sini.");
      return;
    }
    try {
      await reviseMutation.mutateAsync({
        id: quotation.id,
        input: {
          items: changedItems.map((item) => ({
            id: item.id,
            requestItemId: item.requestItemId as string,
            deviceId: item.deviceId ?? undefined,
            tariffId: item.tariffId ?? undefined,
            description: item.description,
            unitPrice: Number(item.unitPrice),
            discountAmount: Number(item.discountAmount),
            qty: Number(qtyById[item.id]),
          })),
        },
      });
      onRevised();
    } catch (err) {
      setError(formatQuotationApiError(err, "Gagal merevisi quotation.").message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Revise {quotation.number}</h3>
        <p className="mt-2 text-sm text-slate-600">
          Ubah qty item di bawah ini. Kondisi quotation saat ini akan disimpan sebagai riwayat
          (revision) sebelum perubahan diterapkan. Nomor quotation tidak berubah.
        </p>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {quotation.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{item.description}</p>
                <p className="text-xs text-slate-500">Qty saat ini: {formatQty(item.qty)}</p>
              </div>
              <Input
                type="number"
                min={1}
                step="1"
                className="w-24 shrink-0"
                value={qtyById[item.id] ?? ""}
                onChange={(e) =>
                  setQtyById((prev) => ({ ...prev, [item.id]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={reviseMutation.isPending}
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={reviseMutation.isPending || changedItems.length === 0}
          >
            {reviseMutation.isPending ? "Menyimpan…" : "Simpan Revisi"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * MOM #1 — Transaction Revision + Immutable History.
 * Read-only: no Edit/Delete affordance is ever rendered for a historical
 * snapshot.
 */
function QuotationHistoryDialog({
  quotationId,
  onClose,
}: {
  quotationId: string;
  onClose: () => void;
}) {
  const historyQuery = useQuotationHistory(quotationId);
  const [selected, setSelected] = useState<number | null>(null);
  const revisionQuery = useQuotationHistoryRevision(quotationId, selected ?? undefined);

  useEffect(() => {
    if (historyQuery.data && historyQuery.data.length > 0 && selected === null) {
      setSelected(historyQuery.data[0]!.revisionNumber);
    }
  }, [historyQuery.data, selected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Revision History</h3>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>

        {historyQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-400">Memuat…</p>
        ) : (historyQuery.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Belum ada revisi untuk quotation ini.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]">
            <ul className="space-y-1">
              {(historyQuery.data ?? []).map((rev) => (
                <li key={rev.revisionNumber}>
                  <button
                    type="button"
                    onClick={() => setSelected(rev.revisionNumber)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm",
                      selected === rev.revisionNumber
                        ? "bg-brand-50 text-brand-700"
                        : "hover:bg-slate-50",
                    )}
                  >
                    <p className="font-medium">Revision #{rev.revisionNumber}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(rev.revisedAt)}</p>
                    <p className="text-xs text-slate-500">
                      {rev.revisedBy?.name ?? rev.revisedBy?.email ?? "—"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="rounded-md border border-slate-200 p-3">
              {selected === null ? (
                <p className="text-sm text-slate-500">Pilih revisi untuk melihat detailnya.</p>
              ) : revisionQuery.isLoading ? (
                <p className="text-sm text-slate-400">Memuat…</p>
              ) : revisionQuery.data ? (
                <>
                  <p className="text-sm font-medium text-slate-900">
                    {revisionQuery.data.number} — Revision #{revisionQuery.data.revisionNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    Status saat itu: {revisionQuery.data.status}
                  </p>
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-500">
                        <th className="py-1">Deskripsi</th>
                        <th className="py-1 text-right">Qty</th>
                        <th className="py-1 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {revisionQuery.data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-1.5">{item.description}</td>
                          <td className="py-1.5 text-right">{formatQty(item.qty)}</td>
                          <td className="py-1.5 text-right">{formatIdr(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-right text-sm font-semibold text-slate-900">
                    Total: {formatIdr(revisionQuery.data.totalAmount)}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
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

function QuotationPurchaseOrderSection({
  quotation,
  canCreate,
  canRead,
  queryLoading,
  queryError,
  queryForbidden,
  rows,
}: {
  quotation: QuotationRow;
  canCreate: boolean;
  canRead: boolean;
  queryLoading: boolean;
  queryError: boolean;
  queryForbidden: boolean;
  rows: PurchaseOrderRow[];
}) {
  const activePo = findActivePurchaseOrder(rows);
  const cancelledOnly = rows.length > 0 && !activePo;
  const eligible = canCreatePurchaseOrderFromQuotation(quotation);
  const showCreate = canCreate && eligible && !queryLoading && !activePo && (!canRead || !queryError);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-semibold text-slate-900">Purchase Order</h3>
      {queryForbidden ? null : queryLoading ? (
        <p className="mt-2 text-sm text-slate-400">Memuat…</p>
      ) : canRead && queryError ? (
        <p className="mt-2 text-sm text-red-600">Gagal memuat purchase order.</p>
      ) : activePo ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div>
            <Link
              href={`/purchase-orders/${activePo.id}`}
              className="font-mono text-sm font-medium text-brand-700 hover:underline"
            >
              {activePo.number}
            </Link>
            <div className="mt-1">
              <PurchaseOrderStatusBadge status={activePo.status} />
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/purchase-orders/${activePo.id}`}>
              <FileText className="h-4 w-4" />
              View Purchase Order
            </Link>
          </Button>
        </div>
      ) : showCreate ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
          <p className="text-sm text-slate-600">
            {cancelledOnly
              ? "Purchase Order sebelumnya dibatalkan. Quotation ini dapat dibuatkan PO baru."
              : "Belum ada purchase order untuk quotation ini."}
          </p>
          <Button type="button" size="sm" asChild>
            <Link href={`/purchase-orders/new?quotationId=${quotation.id}`}>
              <Plus className="h-4 w-4" />
              Create Purchase Order
            </Link>
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          {eligible
            ? "Belum ada purchase order."
            : "Purchase Order dapat dibuat setelah quotation APPROVED dan disetujui customer."}
        </p>
      )}
    </div>
  );
}
