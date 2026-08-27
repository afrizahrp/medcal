"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { useCalibrationRequest } from "../../calibration-requests/use-calibration-requests-query";
import {
  ServiceModeBadge,
  type ServiceMode,
} from "../../calibration-requests/calibration-requests-ui";
import {
  formActionsClass,
  formPageClass,
  formSurfaceClass,
} from "../../quotations/quotations-ui";
import { usePurchaseOrder } from "../../purchase-orders/use-purchase-orders-query";
import {
  PurchaseOrderSnapshot,
  snapshotLinesFromPurchaseOrder,
} from "../../purchase-orders/purchase-orders-ui";
import { useTaxes } from "../../quotations/use-taxes-query";
import { taxDescriptionForCode } from "../../purchase-orders/purchase-order-form-utils";
import { WorkOrderFormFields, type WorkOrderFormValue } from "../work-order-form-fields";
import {
  buildWorkOrderCreatePayload,
  canCreateWorkOrderFromPurchaseOrder,
  findActiveWorkOrder,
  formatWorkOrderApiError,
  validateWorkOrderOperationalForm,
} from "../work-order-form-utils";
import { PageHeader, Surface } from "../work-orders-ui";
import { useCreateWorkOrder, useWorkOrders } from "../use-work-orders-query";

function NewWorkOrderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const purchaseOrderId = searchParams.get("purchaseOrderId") ?? "";
  const { capabilities } = useAuthz();

  const purchaseOrderQuery = usePurchaseOrder(purchaseOrderId || undefined);
  const existingQuery = useWorkOrders(
    {
      search: "",
      status: "",
      purchaseOrderId,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
      pageSize: 20,
    },
    Boolean(purchaseOrderId && capabilities?.workOrderRead),
  );
  const requestId = purchaseOrderQuery.data?.quotation.requestId;
  const requestQuery = useCalibrationRequest(
    capabilities?.calibrationRequestRead ? requestId : undefined,
  );
  const createMutation = useCreateWorkOrder();
  const taxesQuery = useTaxes();

  const [form, setForm] = useState<WorkOrderFormValue>({
    serviceMode: "ON_SITE",
    addressText: "",
    geoLat: "",
    geoLng: "",
    locationNotes: "",
    scheduledStart: "",
    scheduledEnd: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [existingWorkOrderId, setExistingWorkOrderId] = useState<string | null>(null);

  const purchaseOrder = purchaseOrderQuery.data;
  const existingRows = existingQuery.data?.data ?? [];
  const activeWorkOrder = findActiveWorkOrder(existingRows);
  const serviceMode: ServiceMode = requestQuery.data?.serviceMode ?? "ON_SITE";

  if (!capabilities?.workOrderCreate) {
    return <AccessDenied />;
  }

  if (!purchaseOrderId) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="New Work Order"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
            { label: "New" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Work Order hanya dapat dibuat dari Purchase Order yang sudah APPROVED. Buka purchase
          order tersebut, lalu pilih Create Work Order.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/purchase-orders">Ke Purchase Orders</Link>
        </Button>
      </div>
    );
  }

  if (isForbidden(purchaseOrderQuery.error)) {
    return <AccessDenied />;
  }
  if (capabilities?.workOrderRead && isForbidden(existingQuery.error)) {
    return <AccessDenied />;
  }

  if (purchaseOrderQuery.isLoading || existingQuery.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (purchaseOrderQuery.error instanceof ApiError && purchaseOrderQuery.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Purchase Order tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
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

  if (activeWorkOrder) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Work Order sudah ada"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
            { label: "New" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Purchase Order {purchaseOrder.number} sudah memiliki Work Order aktif{" "}
          {activeWorkOrder.number}.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/work-orders/${activeWorkOrder.id}`}>Lihat Work Order</Link>
        </Button>
      </div>
    );
  }

  const canCreate = canCreateWorkOrderFromPurchaseOrder(purchaseOrder);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExistingWorkOrderId(null);

    if (!canCreate) {
      setError("Hanya Purchase Order APPROVED yang dapat dibuatkan Work Order.");
      return;
    }

    const validationError = validateWorkOrderOperationalForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const result = await createMutation.mutateAsync(
        buildWorkOrderCreatePayload({
          purchaseOrderId: purchaseOrder!.id,
          addressText: form.addressText,
          geoLat: form.geoLat,
          geoLng: form.geoLng,
          locationNotes: form.locationNotes,
          scheduledStart: form.scheduledStart,
          scheduledEnd: form.scheduledEnd,
        }),
      );
      router.push(`/work-orders/${result.id}?created=1`);
    } catch (err) {
      const formatted = formatWorkOrderApiError(err, "Gagal membuat work order.");
      setError(formatted.message);
      if (formatted.workOrderId) setExistingWorkOrderId(formatted.workOrderId);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="New Work Order"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/work-orders", label: "Work Orders" },
          { href: `/purchase-orders/${purchaseOrder.id}`, label: purchaseOrder.number },
          { label: "New" },
        ]}
      />

      <form noValidate onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{error}</p>
              {existingWorkOrderId ? (
                <Link
                  href={`/work-orders/${existingWorkOrderId}`}
                  className="mt-2 inline-block font-medium text-red-800 underline"
                >
                  Buka Work Order yang sudah ada
                </Link>
              ) : null}
            </div>
          ) : null}

          {!canCreate ? (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Purchase Order ini belum APPROVED, sehingga Work Order tidak dapat dibuat.
            </p>
          ) : null}

          <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Purchase Order</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/purchase-orders/${purchaseOrder.id}`}
                  className="font-mono text-sm text-brand-700 hover:underline"
                >
                  {purchaseOrder.number}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Customer</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{purchaseOrder.customer.name}</dd>
              <dd className="text-xs text-slate-400">{purchaseOrder.customer.number}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Quotation</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/quotations/${purchaseOrder.quotation.id}`}
                  className="font-mono text-sm text-brand-700 hover:underline"
                >
                  {purchaseOrder.quotation.number}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Service Mode</dt>
              <dd className="mt-1">
                <ServiceModeBadge mode={serviceMode} />
              </dd>
              <dd className="mt-1 text-xs text-slate-400">Disalin dari requisition. Dapat diubah setelah SPK dibuat.</dd>
            </div>
          </dl>

          <WorkOrderFormFields value={form} onChange={setForm} showServiceMode={false} />

          <div className="mt-6 border-t border-slate-100 pt-6">
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

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href={`/purchase-orders/${purchaseOrder.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !canCreate}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create Work Order"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}

export default function NewWorkOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8">
          <p className="text-sm text-slate-400">Memuat…</p>
        </div>
      }
    >
      <NewWorkOrderPageInner />
    </Suspense>
  );
}
