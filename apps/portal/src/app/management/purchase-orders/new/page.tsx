"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { useTaxes } from "../../quotations/use-taxes-query";
import {
  formActionsClass,
  formPageClass,
  formSurfaceClass,
} from "../../quotations/quotations-ui";
import { useQuotation } from "../../quotations/use-quotations-query";
import {
  PurchaseOrderFormFields,
  type PurchaseOrderFormValue,
} from "../purchase-order-form-fields";
import {
  buildPurchaseOrderCreatePayload,
  canCreatePurchaseOrderFromQuotation,
  findActivePurchaseOrder,
  formatPurchaseOrderApiError,
  taxDescriptionForCode,
  validatePurchaseOrderForm,
} from "../purchase-order-form-utils";
import {
  PageHeader,
  PurchaseOrderSnapshot,
  Surface,
  snapshotLinesFromQuotation,
} from "../purchase-orders-ui";
import { useCreatePurchaseOrder, usePurchaseOrders } from "../use-purchase-orders-query";

function NewPurchaseOrderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";
  const { capabilities } = useAuthz();

  const quotationQuery = useQuotation(quotationId || undefined);
  const existingQuery = usePurchaseOrders(
    {
      search: "",
      status: "",
      quotationId,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
      pageSize: 20,
    },
    Boolean(quotationId && capabilities?.purchaseOrderRead),
  );
  const createMutation = useCreatePurchaseOrder();
  const taxesQuery = useTaxes();

  const [form, setForm] = useState<PurchaseOrderFormValue>({
    customerPoNumber: "",
    customerPoDate: new Date(),
    notes: "",
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingPurchaseOrderId, setExistingPurchaseOrderId] = useState<string | null>(null);

  const quotation = quotationQuery.data;
  const existingRows = existingQuery.data?.data ?? [];
  const activePurchaseOrder = findActivePurchaseOrder(existingRows);

  if (!capabilities?.purchaseOrderCreate) {
    return <AccessDenied />;
  }

  if (!quotationId) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="New Purchase Order"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/purchase-orders", label: "Purchase Orders" },
            { label: "New" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Purchase Order hanya dapat dibuat dari Quotation yang sudah APPROVED. Buka quotation
          tersebut, lalu pilih Create Purchase Order.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/quotations">Ke Quotations</Link>
        </Button>
      </div>
    );
  }

  if (isForbidden(quotationQuery.error)) {
    return <AccessDenied />;
  }
  if (capabilities?.purchaseOrderRead && isForbidden(existingQuery.error)) {
    return <AccessDenied />;
  }

  if (quotationQuery.isLoading || existingQuery.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (quotationQuery.error instanceof ApiError && quotationQuery.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Quotation tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/purchase-orders", label: "Purchase Orders" },
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

  if (activePurchaseOrder) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Purchase Order sudah ada"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/purchase-orders", label: "Purchase Orders" },
            { label: "New" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Quotation {quotation.number} sudah memiliki Purchase Order aktif{" "}
          {activePurchaseOrder.number}.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/purchase-orders/${activePurchaseOrder.id}`}>Lihat Purchase Order</Link>
        </Button>
      </div>
    );
  }

  const canCreate = canCreatePurchaseOrderFromQuotation(quotation);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExistingPurchaseOrderId(null);

    if (!canCreate) {
      setError("Hanya quotation APPROVED yang sudah disetujui customer yang dapat dibuatkan PO.");
      return;
    }

    const validationError = validatePurchaseOrderForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const result = await createMutation.mutateAsync(
        buildPurchaseOrderCreatePayload({
          quotationId: quotation!.id,
          customerPoNumber: form.customerPoNumber,
          customerPoDate: form.customerPoDate!,
          notes: form.notes,
        }),
      );
      router.push(`/purchase-orders/${result.id}?created=1`);
    } catch (err) {
      const formatted = formatPurchaseOrderApiError(err, "Gagal membuat purchase order.");
      setError(formatted.message);
      if (formatted.purchaseOrderId) setExistingPurchaseOrderId(formatted.purchaseOrderId);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="New Purchase Order"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/purchase-orders", label: "Purchase Orders" },
          { href: `/quotations/${quotation.id}`, label: quotation.number },
          { label: "New" },
        ]}
      />

      <form noValidate onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{error}</p>
              {existingPurchaseOrderId ? (
                <Link
                  href={`/purchase-orders/${existingPurchaseOrderId}`}
                  className="mt-2 inline-block font-medium text-red-800 underline"
                >
                  Buka Purchase Order yang sudah ada
                </Link>
              ) : null}
            </div>
          ) : null}

          {!canCreate ? (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Quotation ini belum APPROVED atau belum disetujui customer, sehingga Purchase Order
              tidak dapat dibuat.
            </p>
          ) : null}

          <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Quotation</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/quotations/${quotation.id}`}
                  className="font-mono text-sm text-brand-700 hover:underline"
                >
                  {quotation.number}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Customer</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{quotation.customer.name}</dd>
              <dd className="text-xs text-slate-400">{quotation.customer.number}</dd>
            </div>
          </dl>

          <PurchaseOrderFormFields
            value={form}
            onChange={setForm}
            dateOpen={dateOpen}
            onDateOpenChange={setDateOpen}
          />

          <div className="mt-6 border-t border-slate-100 pt-6">
            <PurchaseOrderSnapshot
              quotationNumber={quotation.number}
              quotationId={quotation.id}
              requestId={quotation.request.id}
              requestNumber={quotation.request.number}
              customer={quotation.customer}
              items={snapshotLinesFromQuotation(quotation)}
              subtotal={quotation.subtotal}
              headerDiscountAmount={quotation.headerDiscountAmount}
              taxCode={quotation.taxCode}
              taxRate={quotation.taxRate}
              taxAmount={quotation.taxAmount}
              totalAmount={quotation.totalAmount}
              currency={quotation.currency}
              taxDescription={taxDescriptionForCode(taxesQuery.data?.data, quotation.taxCode)}
            />
          </div>

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href={`/quotations/${quotation.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !canCreate}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create Purchase Order"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}

export default function NewPurchaseOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8">
          <p className="text-sm text-slate-400">Memuat…</p>
        </div>
      }
    >
      <NewPurchaseOrderPageInner />
    </Suspense>
  );
}
