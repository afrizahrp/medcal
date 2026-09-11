"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Edit, Play, Printer, UserPlus, X } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { formPageClass, formSurfaceClass } from "../../quotations/quotations-ui";
import {
  ConfirmDialog,
  DetailField,
  PageHeader,
  ServiceModeBadge,
  StatusBadge,
  Surface,
  WorkOrderItemsTable,
  formatDateTime,
  selectClassName,
  ASSIGNMENT_ROLE_LABELS,
  workOrderPdfFilenameForRow,
  type WorkOrderRow,
} from "../work-orders-ui";
import {
  buildWorkOrderAssignPayload,
  formatWorkOrderApiError,
  workOrderActions,
  type AssignmentRole,
} from "../work-order-form-utils";
import { useWorkOrderCalibrationJobs } from "../../calibration-jobs/use-calibration-jobs-query";
import { WorkOrderEquipmentSection } from "../work-order-equipment-section";
import { WorkOrderDeliveryNoteSection } from "../work-order-delivery-note-section";
import {
  WorkOrderRequestReviewSection,
  WorkOrderItemAccessoriesSection,
} from "../work-order-request-review-section";
import { fmtDateOnly } from "@/lib/date-utils";
import {
  openWorkOrderPdf,
  useAssignWorkOrder,
  useAssignableUsers,
  useCancelWorkOrder,
  useDoneWorkOrder,
  useStartWorkOrder,
  useWorkOrder,
  type AssignableUser,
} from "../use-work-orders-query";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = useWorkOrder(params.id);
  const calibrationJobs = useWorkOrderCalibrationJobs(params.id);
  const assignMutation = useAssignWorkOrder();
  const startMutation = useStartWorkOrder();
  const doneMutation = useDoneWorkOrder();
  const cancelMutation = useCancelWorkOrder();
  const [assignOpen, setAssignOpen] = useState(false);
  const usersQuery = useAssignableUsers(Boolean(capabilities?.workOrderAssign && assignOpen));

  const [confirmAction, setConfirmAction] = useState<"start" | "done" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printPending, setPrintPending] = useState(false);

  const workOrder = query.data;

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

  const actions = workOrderActions(workOrder.status);

  const referenceEquipmentReviewPoiIds = new Set(
    (calibrationJobs.data?.data ?? [])
      .filter((job) => job.needsReferenceEquipmentReview && job.purchaseOrderItemId)
      .map((job) => job.purchaseOrderItemId as string),
  );

  async function runAction(action: "start" | "done" | "cancel") {
    setError(null);
    setSuccess(null);
    const mutations = {
      start: startMutation,
      done: doneMutation,
      cancel: cancelMutation,
    };
    const successMessages = {
      start: "Work Order dimulai.",
      done: "Work Order ditandai DONE dan terkunci.",
      cancel: "Work Order berhasil dibatalkan.",
    };
    const fallbacks = {
      start: "Gagal memulai work order.",
      done: "Gagal menandai work order sebagai DONE.",
      cancel: "Gagal membatalkan work order.",
    };
    try {
      await mutations[action].mutateAsync(workOrder!.id);
      setSuccess(successMessages[action]);
      setConfirmAction(null);
      await query.refetch();
    } catch (err) {
      setError(formatWorkOrderApiError(err, fallbacks[action]).message);
      setConfirmAction(null);
    }
  }

  async function submitAssign(
    technicians: Array<{ technicianUserId: string; roleOnJob: AssignmentRole }>,
  ) {
    setError(null);
    setSuccess(null);
    try {
      await assignMutation.mutateAsync({
        id: workOrder!.id,
        input: buildWorkOrderAssignPayload(technicians),
      });
      setSuccess("Teknisi berhasil di-assign.");
      setAssignOpen(false);
      await query.refetch();
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal assign teknisi.").message);
    }
  }

  async function handlePrint() {
    setError(null);
    setSuccess(null);
    setPrintPending(true);
    try {
      await openWorkOrderPdf(workOrder!.id, workOrderPdfFilenameForRow(workOrder!));
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal membuka PDF work order.").message);
    } finally {
      setPrintPending(false);
    }
  }

  const actionPending =
    assignMutation.isPending ||
    startMutation.isPending ||
    doneMutation.isPending ||
    cancelMutation.isPending ||
    printPending;

  return (
    <div className={formPageClass}>
      <PageHeader
        title={workOrder.number}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/work-orders", label: "Work Orders" },
          { label: workOrder.number },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Suspense fallback={null}>
        <CreatedBanner />
      </Suspense>

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{workOrder.number}</p>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={workOrder.status} />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/work-orders">
                <ArrowLeft className="h-4 w-4" />
                Back to List
              </Link>
            </Button>
          </div>
        </div>

        {actions.isLocked ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Work Order ini terkunci dan tidak dapat diubah.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <DetailField label="Work Order Number">
            <span className="font-mono">{workOrder.number}</span>
          </DetailField>

          <DetailField label="Customer">
            <Link
              href={`/customers/${workOrder.customer.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {workOrder.customer.name}
            </Link>
            <span className="ml-2 text-slate-400">({workOrder.customer.number})</span>
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Purchase Order">
              {workOrder.purchaseOrder ? (
                <Link
                  href={`/purchase-orders/${workOrder.purchaseOrder.id}`}
                  className="font-mono text-brand-700 hover:underline"
                >
                  {workOrder.purchaseOrder.number}
                </Link>
              ) : (
                "—"
              )}
            </DetailField>
            <DetailField label="Quotation">
              <Link
                href={`/quotations/${workOrder.quotation.id}`}
                className="font-mono text-brand-700 hover:underline"
              >
                {workOrder.quotation.number}
              </Link>
            </DetailField>
          </div>

          {workOrder.quotation.request ? (
            <DetailField label="Requisition">
              <Link
                href={`/calibration-requests/${workOrder.quotation.request.id}`}
                className="font-mono text-brand-700 hover:underline"
              >
                {workOrder.quotation.request.number}
              </Link>
            </DetailField>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Service Mode">
              <ServiceModeBadge mode={workOrder.serviceMode} />
            </DetailField>
            <DetailField label="Status">
              <StatusBadge status={workOrder.status} />
            </DetailField>
          </div>

          <DetailField label="Address">{workOrder.addressText || "—"}</DetailField>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Latitude">{workOrder.geoLat ?? "—"}</DetailField>
            <DetailField label="Longitude">{workOrder.geoLng ?? "—"}</DetailField>
          </div>
          {workOrder.locationNotes ? (
            <DetailField label="Location Notes">
              <span className="whitespace-pre-wrap">{workOrder.locationNotes}</span>
            </DetailField>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Scheduled Start">
              {fmtDateOnly(workOrder.scheduledStart)}
            </DetailField>
            <DetailField label="Scheduled End">{fmtDateOnly(workOrder.scheduledEnd)}</DetailField>
          </div>

          <DetailField label="Technicians">
            {workOrder.assignments.length === 0 ? (
              <span className="text-slate-400">Belum di-assign</span>
            ) : (
              <ul className="space-y-1">
                {workOrder.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <span className="font-medium text-slate-900">
                      {assignment.technician.name || assignment.technician.email}
                    </span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">
                      {ASSIGNMENT_ROLE_LABELS[assignment.roleOnJob]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Created">{formatDateTime(workOrder.createdAt)}</DetailField>
            <DetailField label="Updated">{formatDateTime(workOrder.updatedAt)}</DetailField>
          </div>
        </dl>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <WorkOrderItemsTable
            items={workOrder.items}
            jobs={workOrder.jobs}
            referenceEquipmentReviewPoiIds={
              calibrationJobs.data ? referenceEquipmentReviewPoiIds : undefined
            }
          />
        </div>

        <WorkOrderItemAccessoriesSection
          workOrder={workOrder}
          onChanged={() => void query.refetch()}
        />

        <WorkOrderRequestReviewSection
          workOrder={workOrder}
          onChanged={() => void query.refetch()}
        />

        <WorkOrderEquipmentSection
          workOrder={workOrder}
          editable={!actions.isLocked}
          onChanged={() => query.refetch()}
        />

        <WorkOrderDeliveryNoteSection workOrder={workOrder} onChanged={() => query.refetch()} />

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={handlePrint} disabled={printPending}>
            <Printer className="h-4 w-4" />
            {printPending ? "Membuka PDF…" : "Print"}
          </Button>

          {actions.canEdit && capabilities?.workOrderUpdate ? (
            <Button type="button" variant="outline" asChild>
              <Link href={`/work-orders/${workOrder.id}/edit`}>
                <Edit className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          ) : null}

          {actions.canAssign && capabilities?.workOrderAssign ? (
            <Button type="button" onClick={() => setAssignOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Assign
            </Button>
          ) : null}

          {actions.canStart && capabilities?.workOrderUpdate ? (
            <Button type="button" onClick={() => setConfirmAction("start")}>
              <Play className="h-4 w-4" />
              Start
            </Button>
          ) : null}

          {actions.canDone && capabilities?.workOrderUpdate ? (
            <Button type="button" onClick={() => setConfirmAction("done")}>
              <Check className="h-4 w-4" />
              Mark as Done
            </Button>
          ) : null}

          {actions.canCancel && capabilities?.workOrderCancel ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmAction("cancel")}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : null}
        </div>
      </Surface>

      <ConfirmDialog
        open={confirmAction === "start"}
        title="Start this Work Order?"
        description="Status akan berubah dari ASSIGNED menjadi IN PROGRESS."
        confirmLabel="Start"
        onConfirm={() => runAction("start")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
      />
      <ConfirmDialog
        open={confirmAction === "done"}
        title="Mark this WorkOrder as DONE?"
        description="Setelah ditandai selesai, Work Order terkunci. Tidak ada edit, assignment, cancel, atau pembalikan status."
        confirmLabel="Mark as Done"
        onConfirm={() => runAction("done")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        title="Cancel this Work Order?"
        description="Work Order tetap tersimpan sebagai CANCELLED dan terkunci. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Cancel Work Order"
        onConfirm={() => runAction("cancel")}
        onCancel={() => setConfirmAction(null)}
        loading={actionPending}
        variant="destructive"
      />

      <AssignDialog
        open={assignOpen}
        workOrder={workOrder}
        users={usersQuery.data?.data ?? []}
        usersLoading={usersQuery.isLoading}
        usersError={usersQuery.isError}
        usersForbidden={isForbidden(usersQuery.error)}
        pending={assignMutation.isPending}
        onCancel={() => setAssignOpen(false)}
        onSubmit={submitAssign}
      />
    </div>
  );
}

function CreatedBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("created") !== "1") return null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-sm font-medium text-emerald-900">Work Order berhasil dibuat.</p>
      <p className="mt-1 text-sm text-emerald-800">
        Lengkapi lokasi/jadwal jika perlu, lalu assign teknisi untuk memulai pekerjaan.
      </p>
    </div>
  );
}

function AssignDialog({
  open,
  workOrder,
  users,
  usersLoading,
  usersError,
  usersForbidden,
  pending,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  workOrder: WorkOrderRow;
  users: AssignableUser[];
  usersLoading: boolean;
  usersError: boolean;
  usersForbidden: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (technicians: Array<{ technicianUserId: string; roleOnJob: AssignmentRole }>) => void;
}) {
  const eligibleUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.status === "ACTIVE" && user.membership && user.membership.role !== "CUSTOMER",
      ),
    [users],
  );
  const [selected, setSelected] = useState<Record<string, AssignmentRole>>({});

  useEffect(() => {
    if (open) setSelected({});
  }, [open]);

  if (!open) return null;

  const selectedEntries = Object.entries(selected);

  function toggleUser(userId: string) {
    setSelected((current) => {
      if (current[userId]) {
        const next = { ...current };
        delete next[userId];
        return next;
      }
      const role: AssignmentRole = Object.keys(current).length === 0 ? "LEAD" : "ASSIST";
      return { ...current, [userId]: role };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Assign technicians</h3>
        <p className="mt-2 text-sm text-slate-600">
          Pilih teknisi untuk {workOrder.number}. Assignment mengubah status menjadi ASSIGNED.
        </p>

        {usersForbidden ? (
          <p className="mt-4 text-sm text-amber-800">
            Tidak ada izin untuk memuat daftar user. Hubungi admin untuk assign teknisi.
          </p>
        ) : usersLoading ? (
          <p className="mt-4 text-sm text-slate-400">Memuat…</p>
        ) : usersError ? (
          <p className="mt-4 text-sm text-red-600">Gagal memuat daftar teknisi.</p>
        ) : eligibleUsers.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Tidak ada user aktif yang dapat di-assign.</p>
        ) : (
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {eligibleUsers.map((user) => {
              const checked = Boolean(selected[user.id]);
              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUser(user.id)}
                      aria-label={user.name || user.email}
                    />
                    <span className="truncate">
                      <span className="font-medium text-slate-900">{user.name || user.email}</span>
                      <span className="ml-2 text-xs text-slate-400">{user.membership?.role}</span>
                    </span>
                  </label>
                  {checked ? (
                    <select
                      value={selected[user.id]}
                      onChange={(e) =>
                        setSelected((current) => ({
                          ...current,
                          [user.id]: e.target.value as AssignmentRole,
                        }))
                      }
                      className={selectClassName}
                      aria-label={`Role ${user.name || user.email}`}
                    >
                      <option value="LEAD">Lead</option>
                      <option value="ASSIST">Assist</option>
                    </select>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() =>
              onSubmit(
                selectedEntries.map(([technicianUserId, roleOnJob]) => ({
                  technicianUserId,
                  roleOnJob,
                })),
              )
            }
            disabled={pending || selectedEntries.length === 0}
          >
            {pending ? "Assigning…" : "Assign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
