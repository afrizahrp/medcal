"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { WorkOrderFormFields, type WorkOrderFormValue } from "../../work-order-form-fields";
import {
  buildWorkOrderUpdatePayload,
  formatWorkOrderApiError,
  isWorkOrderTerminal,
  toScheduleDateValue,
  validateWorkOrderOperationalForm,
} from "../../work-order-form-utils";
import { PageHeader, Surface, WorkOrderItemsTable } from "../../work-orders-ui";
import { useUpdateWorkOrder, useWorkOrder } from "../../use-work-orders-query";

export default function EditWorkOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();

  const query = useWorkOrder(params.id);
  const updateMutation = useUpdateWorkOrder();

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
  const [initialized, setInitialized] = useState(false);

  const workOrder = query.data;

  useEffect(() => {
    if (workOrder && !initialized) {
      setForm({
        serviceMode: workOrder.serviceMode,
        addressText: workOrder.addressText ?? "",
        geoLat: workOrder.geoLat == null ? "" : String(workOrder.geoLat),
        geoLng: workOrder.geoLng == null ? "" : String(workOrder.geoLng),
        locationNotes: workOrder.locationNotes ?? "",
        scheduledStart: toScheduleDateValue(workOrder.scheduledStart),
        scheduledEnd: toScheduleDateValue(workOrder.scheduledEnd),
      });
      setInitialized(true);
    }
  }, [workOrder, initialized]);

  if (isForbidden(query.error) || !capabilities?.workOrderUpdate) {
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
          title="Work Order tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Work Order tidak ditemukan.</p>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat work order.</p>
      </div>
    );
  }

  if (isWorkOrderTerminal(workOrder.status)) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Work Order tidak dapat diedit"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
            { href: `/work-orders/${workOrder.id}`, label: workOrder.number },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Work Order {workOrder.status} terkunci dan tidak dapat diedit.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/work-orders/${workOrder.id}`}>Kembali ke Detail</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateWorkOrderOperationalForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: workOrder!.id,
        input: buildWorkOrderUpdatePayload(form),
      });
      router.push(`/work-orders/${workOrder!.id}`);
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal menyimpan work order.").message);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={`Edit ${workOrder.number}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/work-orders", label: "Work Orders" },
          { href: `/work-orders/${workOrder.id}`, label: workOrder.number },
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
              <dt className="text-xs uppercase tracking-wide text-slate-400">Work Order</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-900">{workOrder.number}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Purchase Order</dt>
              <dd className="mt-0.5">
                {workOrder.purchaseOrder ? (
                  <Link
                    href={`/purchase-orders/${workOrder.purchaseOrder.id}`}
                    className="font-mono text-sm text-brand-700 hover:underline"
                  >
                    {workOrder.purchaseOrder.number}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          {/* serviceMode is immutable after creation (it determines SPK vs WOL). */}
          <WorkOrderFormFields value={form} onChange={setForm} showServiceMode={false} />

          <div className="mt-6 border-t border-slate-100 pt-6">
            <WorkOrderItemsTable items={workOrder.items} jobs={workOrder.jobs} />
          </div>

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href={`/work-orders/${workOrder.id}`}>Cancel</Link>
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
