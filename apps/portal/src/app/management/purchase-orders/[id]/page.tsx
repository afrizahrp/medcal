"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Edit,
  History as HistoryIcon,
  Plus,
  Printer,
  RefreshCw,
  Wrench,
  X,
} from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../../components/access-denied";
import {
  formPageClass,
  formSurfaceClass,
  formatDate,
  formatDateTime,
  formatIdr,
  formatQty,
} from "../../quotations/quotations-ui";
import { useTaxes } from "../../quotations/use-taxes-query";
import {
  formatPurchaseOrderApiError,
  purchaseOrderActions,
  taxDescriptionForCode,
} from "../purchase-order-form-utils";
import {
  ConfirmDialog,
  DetailField,
  PageHeader,
  PurchaseOrderSnapshot,
  StatusBadge,
  Surface,
  purchaseOrderPdfFilenameForRow,
  snapshotLinesFromPurchaseOrder,
} from "../purchase-orders-ui";
import {
  openPurchaseOrderPdf,
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrderHistory,
  usePurchaseOrderHistoryRevision,
  useRevisePurchaseOrder,
} from "../use-purchase-orders-query";
import {
  canCreateWorkOrderFromPurchaseOrder,
  findActiveWorkOrder,
} from "../../work-orders/work-order-form-utils";
import { StatusBadge as WorkOrderStatusBadge, type WorkOrderRow } from "../../work-orders/work-orders-ui";
import { useWorkOrders } from "../../work-orders/use-work-orders-query";

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = usePurchaseOrder(params.id);
  const taxesQuery = useTaxes();
  const approveMutation = useApprovePurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();
  const reviseMutation = useRevisePurchaseOrder();
  const workOrderQuery = useWorkOrders(
    {
      search: "",
      status: "",
      purchaseOrderId: params.id,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
      pageSize: 20,
    },
    Boolean(params.id && capabilities?.workOrderRead),
  );

  const [confirmAction, setConfirmAction] = useState<"approve" | "cancel" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printPending, setPrintPending] = useState(false);
  // MOM #1 — Transaction Revision + Immutable History
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const purchaseOrder = query.data;

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
          title="Purchase Order tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/purchase-orders", label: "Purchase Orders" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Purchase Order tidak ditemukan.</p>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat purchase order.</p>
      </div>
    );
  }

  const actions = purchaseOrderActions(purchaseOrder.status);

  async function runAction(action: "approve" | "cancel" | "revise") {
    setError(null);
    setSuccess(null);
    const mutations = {
      approve: approveMutation,
      cancel: cancelMutation,
      revise: reviseMutation,
    };
    const successMessages = {
      approve: "Purchase Order berhasil di-approve.",
      cancel: "Purchase Order berhasil dibatalkan.",
      revise: "Purchase Order berhasil direvisi.",
    };
    const fallbacks = {
      approve: "Gagal approve purchase order.",
      cancel: "Gagal membatalkan purchase order.",
      revise: "Gagal merevisi purchase order.",
    };
    try {
      await mutations[action].mutateAsync(purchaseOrder!.id);
      setSuccess(successMessages[action]);
      setConfirmAction(null);
      await query.refetch();
    } catch (err) {
      setError(formatPurchaseOrderApiError(err, fallbacks[action]).message);
      setConfirmAction(null);
    }
  }

  const actionPending =
    approveMutation.isPending || cancelMutation.isPending || reviseMutation.isPending || printPending;

  async function handlePrint() {
    setError(null);
    setSuccess(null);
    setPrintPending(true);
    try {
      await openPurchaseOrderPdf(
        purchaseOrder!.id,
        purchaseOrderPdfFilenameForRow(purchaseOrder!),
      );
    } catch (err) {
      setError(formatPurchaseOrderApiError(err, "Gagal membuka PDF purchase order.").message);
    } finally {
      setPrintPending(false);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={purchaseOrder.number}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/purchase-orders", label: "Purchase Orders" },
          { label: purchaseOrder.number },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Suspense fallback={null}>
        <CreatedBanner />
      </Suspense>

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{purchaseOrder.number}</p>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={purchaseOrder.status} />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/purchase-orders">
                <ArrowLeft className="h-4 w-4" />
                Back to List
              </Link>
            </Button>
          </div>
        </div>

        {actions.isLocked ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Purchase Order ini terkunci dan tidak dapat diedit.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <DetailField label="PO Number">
            <span className="font-mono">{purchaseOrder.number}</span>
          </DetailField>

          <DetailField label="Customer">
            <Link
              href={`/customers/${purchaseOrder.customer.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {purchaseOrder.customer.name}
            </Link>
            <span className="ml-2 text-slate-400">({purchaseOrder.customer.number})</span>
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Customer PO No">
              <span className="font-mono">{purchaseOrder.customerPoNumber}</span>
            </DetailField>
            <DetailField label="Customer PO Date">
              {formatDate(purchaseOrder.customerPoDate)}
            </DetailField>
          </div>

          {purchaseOrder.notes ? (
            <DetailField label="Notes">
              <span className="whitespace-pre-wrap">{purchaseOrder.notes}</span>
            </DetailField>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Created">{formatDateTime(purchaseOrder.createdAt)}</DetailField>
            <DetailField label="Updated">{formatDateTime(purchaseOrder.updatedAt)}</DetailField>
          </div>

          {purchaseOrder.status === "APPROVED" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Approved At">
                {formatDateTime(purchaseOrder.confirmedAt)}
              </DetailField>
              <DetailField label="Approved By">
                {purchaseOrder.confirmedBy?.name ?? purchaseOrder.confirmedBy?.email ?? "—"}
              </DetailField>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <PurchaseOrderSnapshot
            quotationNumber={purchaseOrder.quotation.number}
            quotationId={purchaseOrder.quotation.id}
            requestId={purchaseOrder.quotation.requestId}
            requestNumber={purchaseOrder.quotation.request?.number}
            customer={purchaseOrder.customer}
            items={snapshotLinesFromPurchaseOrder(purchaseOrder)}
            subtotal={purchaseOrder.subtotal}
            headerDiscountAmount={purchaseOrder.headerDiscountAmount}
            taxCode={purchaseOrder.taxCode}
            taxRate={purchaseOrder.taxRate}
            taxAmount={purchaseOrder.taxAmount}
            totalAmount={purchaseOrder.totalAmount}
            currency={purchaseOrder.currency}
            taxDescription={taxDescriptionForCode(taxesQuery.data?.data, purchaseOrder.taxCode)}
          />
        </div>

        {capabilities?.workOrderRead || capabilities?.workOrderCreate ? (
          <PurchaseOrderWorkOrderSection
            purchaseOrderId={purchaseOrder.id}
            purchaseOrderStatus={purchaseOrder.status}
            canCreate={Boolean(capabilities?.workOrderCreate)}
            canRead={Boolean(capabilities?.workOrderRead)}
            queryLoading={workOrderQuery.isLoading}
            queryError={workOrderQuery.isError}
            queryForbidden={isForbidden(workOrderQuery.error)}
            rows={workOrderQuery.data?.data ?? []}
          />
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={handlePrint} disabled={printPending}>
            <Printer className="h-4 w-4" />
            {printPending ? "Membuka PDF…" : "Print"}
          </Button>

          {capabilities?.purchaseOrderRead ? (
            <Button type="button" variant="outline" onClick={() => setHistoryDialogOpen(true)}>
              <HistoryIcon className="h-4 w-4" />
              History
            </Button>
          ) : null}

          {actions.canRevise && capabilities?.purchaseOrderUpdate ? (
            <Button type="button" variant="outline" onClick={() => setConfirmAction("revise")}>
              <RefreshCw className="h-4 w-4" />
              Revise
            </Button>
          ) : null}

          {actions.canEdit && capabilities?.purchaseOrderUpdate ? (
            <Button type="button" variant="outline" asChild>
              <Link href={`/purchase-orders/${purchaseOrder.id}/edit`}>
                <Edit className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          ) : null}

          {actions.canApprove && capabilities?.purchaseOrderApprove ? (
            <Button type="button" onClick={() => setConfirmAction("approve")}>
              <Check className="h-4 w-4" />
              Approve
            </Button>
          ) : null}

          {actions.canCancel && capabilities?.purchaseOrderCancel ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmAction("cancel")}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : null}
        </div>
      </Surface>

      <ConfirmDialog
        open={confirmAction === "approve"}
        title="Approve this Purchase Order?"
        description="Setelah disetujui, semua field PO akan terkunci."
        confirmLabel="Approve"
        onConfirm={() => runAction("approve")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        title="Cancel this Purchase Order?"
        description="Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Cancel Purchase Order"
        onConfirm={() => runAction("cancel")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
        variant="destructive"
      />
      <ConfirmDialog
        open={confirmAction === "revise"}
        title="Revise this Purchase Order?"
        description="Kondisi Purchase Order saat ini akan disimpan sebagai riwayat, lalu scope terbaru dari Quotation akan diterapkan. Nomor PO tidak berubah."
        confirmLabel="Revise"
        onConfirm={() => runAction("revise")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
      />

      {historyDialogOpen ? (
        <PurchaseOrderHistoryDialog
          purchaseOrderId={purchaseOrder.id}
          onClose={() => setHistoryDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * MOM #1 — Transaction Revision + Immutable History.
 * Read-only: no Edit/Delete affordance is ever rendered for a historical
 * snapshot. Mirrors QuotationHistoryDialog (quotations/[id]/page.tsx).
 */
function PurchaseOrderHistoryDialog({
  purchaseOrderId,
  onClose,
}: {
  purchaseOrderId: string;
  onClose: () => void;
}) {
  const historyQuery = usePurchaseOrderHistory(purchaseOrderId);
  const [selected, setSelected] = useState<number | null>(null);
  const revisionQuery = usePurchaseOrderHistoryRevision(purchaseOrderId, selected ?? undefined);

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
          <p className="mt-4 text-sm text-slate-500">Belum ada revisi untuk purchase order ini.</p>
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

function CreatedBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("created") !== "1") return null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-sm font-medium text-emerald-900">Purchase Order berhasil dibuat.</p>
      <p className="mt-1 text-sm text-emerald-800">
        Lengkapi Customer PO No jika perlu, lalu approve untuk mengunci dokumen.
      </p>
    </div>
  );
}

function PurchaseOrderWorkOrderSection({
  purchaseOrderId,
  purchaseOrderStatus,
  canCreate,
  canRead,
  queryLoading,
  queryError,
  queryForbidden,
  rows,
}: {
  purchaseOrderId: string;
  purchaseOrderStatus: string;
  canCreate: boolean;
  canRead: boolean;
  queryLoading: boolean;
  queryError: boolean;
  queryForbidden: boolean;
  rows: WorkOrderRow[];
}) {
  const activeWorkOrder = findActiveWorkOrder(rows);
  const cancelledOnly = rows.length > 0 && !activeWorkOrder;
  const eligible = canCreateWorkOrderFromPurchaseOrder({ status: purchaseOrderStatus });
  const showCreate =
    canCreate && eligible && !queryLoading && !activeWorkOrder && (!canRead || !queryError);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-semibold text-slate-900">Work Order</h3>
      {queryForbidden ? null : queryLoading ? (
        <p className="mt-2 text-sm text-slate-400">Memuat…</p>
      ) : canRead && queryError ? (
        <p className="mt-2 text-sm text-red-600">Gagal memuat work order.</p>
      ) : activeWorkOrder ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div>
            <Link
              href={`/work-orders/${activeWorkOrder.id}`}
              className="font-mono text-sm font-medium text-brand-700 hover:underline"
            >
              {activeWorkOrder.number}
            </Link>
            <div className="mt-1">
              <WorkOrderStatusBadge status={activeWorkOrder.status} />
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/work-orders/${activeWorkOrder.id}`}>
              <Wrench className="h-4 w-4" />
              View Work Order
            </Link>
          </Button>
        </div>
      ) : showCreate ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
          <p className="text-sm text-slate-600">
            {cancelledOnly
              ? "Work Order sebelumnya dibatalkan. Purchase Order ini dapat dibuatkan SPK baru."
              : "Belum ada work order untuk purchase order ini."}
          </p>
          <Button type="button" size="sm" asChild>
            <Link href={`/work-orders/new?purchaseOrderId=${purchaseOrderId}`}>
              <Plus className="h-4 w-4" />
              Create Work Order
            </Link>
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          {eligible
            ? "Belum ada work order."
            : "Work Order dapat dibuat setelah purchase order APPROVED."}
        </p>
      )}
    </div>
  );
}
