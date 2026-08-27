"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../../components/access-denied";
import {
  formActionsClass,
  formPageClass,
  formSurfaceClass,
} from "../../../quotations/quotations-ui";
import { useTaxes } from "../../../quotations/use-taxes-query";
import {
  PurchaseOrderFormFields,
  type PurchaseOrderFormValue,
} from "../../purchase-order-form-fields";
import {
  buildPurchaseOrderUpdatePayload,
  formatPurchaseOrderApiError,
  taxDescriptionForCode,
  validatePurchaseOrderForm,
} from "../../purchase-order-form-utils";
import {
  PageHeader,
  PurchaseOrderSnapshot,
  Surface,
  snapshotLinesFromPurchaseOrder,
} from "../../purchase-orders-ui";
import { usePurchaseOrder, useUpdatePurchaseOrder } from "../../use-purchase-orders-query";

function parseCustomerPoDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr) return undefined;
  try {
    return parseISO(dateStr);
  } catch {
    return undefined;
  }
}

export default function EditPurchaseOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();

  const query = usePurchaseOrder(params.id);
  const taxesQuery = useTaxes();
  const updateMutation = useUpdatePurchaseOrder();

  const [form, setForm] = useState<PurchaseOrderFormValue>({
    customerPoNumber: "",
    customerPoDate: undefined,
    notes: "",
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const purchaseOrder = query.data;

  useEffect(() => {
    if (purchaseOrder && !initialized) {
      setForm({
        customerPoNumber: purchaseOrder.customerPoNumber,
        customerPoDate: parseCustomerPoDate(purchaseOrder.customerPoDate),
        notes: purchaseOrder.notes ?? "",
      });
      setInitialized(true);
    }
  }, [purchaseOrder, initialized]);

  if (isForbidden(query.error) || !capabilities?.purchaseOrderUpdate) {
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

  if (purchaseOrder.status !== "DRAFT") {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Purchase Order tidak dapat diedit"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/purchase-orders", label: "Purchase Orders" },
            { href: `/purchase-orders/${purchaseOrder.id}`, label: purchaseOrder.number },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Hanya Purchase Order DRAFT yang dapat diedit.</p>
        <Button asChild className="mt-4">
          <Link href={`/purchase-orders/${purchaseOrder.id}`}>Kembali ke Detail</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validatePurchaseOrderForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: purchaseOrder!.id,
        input: buildPurchaseOrderUpdatePayload({
          customerPoNumber: form.customerPoNumber,
          customerPoDate: form.customerPoDate!,
          notes: form.notes,
        }),
      });
      router.push(`/purchase-orders/${purchaseOrder!.id}`);
    } catch (err) {
      setError(formatPurchaseOrderApiError(err, "Gagal menyimpan purchase order.").message);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={`Edit ${purchaseOrder.number}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/purchase-orders", label: "Purchase Orders" },
          { href: `/purchase-orders/${purchaseOrder.id}`, label: purchaseOrder.number },
          { label: "Edit" },
        ]}
      />

      <form noValidate onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{error}</p>
            </div>
          ) : null}

          <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">PO Number</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-900">{purchaseOrder.number}</dd>
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
          </dl>

          <PurchaseOrderFormFields
            value={form}
            onChange={setForm}
            dateOpen={dateOpen}
            onDateOpenChange={setDateOpen}
          />

          <div className="mt-6 border-t border-slate-100 pt-6">
            <PurchaseOrderSnapshot
              quotationNumber={purchaseOrder.quotation.number}
              quotationId={purchaseOrder.quotation.id}
              requestId={purchaseOrder.quotation.requestId}
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
            <Button type="submit" disabled={updateMutation.isPending}>
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
