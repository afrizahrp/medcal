"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  FileText,
  History as HistoryIcon,
  Plus,
  RefreshCw,
  Send,
  Upload,
  X,
} from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deviceDisplayNames } from "@/lib/device-name-display";
import { AccessDenied } from "../../../../components/access-denied";
import {
  PageHeader,
  Surface,
  formPageClass,
  formSurfaceClass,
  StatusBadge,
  ServiceModeBadge,
  DetailField,
  ConfirmDialog,
  SERVICE_MODE_LABELS,
  DeviceTypeItemSelect,
  type CalibrationRequestRow,
  type DeviceTypeOption,
} from "../calibration-requests-ui";
import { buildImportedDesiredRows, rowFromItem, type DesiredItemRow } from "./revision-desired-scope";
import { formatRelativeTime } from "../../leads/leads-ui";
import { formatDateTime } from "../../quotations/quotations-ui";
import { useDeviceTypes } from "../../device-types/use-device-types-query";
import {
  useCalibrationRequest,
  useCalibrationRequestHistory,
  useCalibrationRequestHistoryRevision,
  useImportPreview,
  useReviseCalibrationRequest,
  useSubmitCalibrationRequest,
  useCancelCalibrationRequest,
} from "../use-calibration-requests-query";
import { StatusBadge as QuotationStatusBadge } from "../../quotations/quotations-ui";
import { useQuotations } from "../../quotations/use-quotations-query";

export default function CalibrationRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();

  const query = useCalibrationRequest(params.id);
  const submitMutation = useSubmitCalibrationRequest();
  const cancelMutation = useCancelCalibrationRequest();
  const reviseMutation = useReviseCalibrationRequest();
  const quotationQuery = useQuotations(
    {
      search: "",
      status: "",
      requestId: params.id,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
      pageSize: 1,
    },
    Boolean(params.id),
  );

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // MOM #1 — Transaction Revision + Immutable History
  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const request = query.data;

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
          title="Requisition tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-requests", label: "Requisitions" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Requisition tidak ditemukan.</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat requisition.</p>
      </div>
    );
  }

  const isDraft = request.status === "DRAFT";
  const canCancel = request.status !== "CANCELLED" && request.status !== "FULFILLED";
  const isReadOnly = !isDraft;
  // MOM #1 — Transaction Revision + Immutable History. Revise is the
  // committed-document counterpart to Edit: legal exactly where Edit is not
  // (left DRAFT) and the document isn't terminal (CANCELLED/FULFILLED).
  // Matches REVISABLE_CALIBRATION_REQUEST_STATUSES in
  // calibration-requests.service.ts.
  const canRevise = request.status === "SUBMITTED" || request.status === "IN_QUOTATION";
  const quotationForbidden = isForbidden(quotationQuery.error);
  const quotationReady = !quotationQuery.isLoading && !quotationQuery.isError;
  const existingQuotation = quotationReady ? quotationQuery.data?.data[0] : undefined;
  const canCreateQuotation =
    Boolean(capabilities?.quotationCreate) &&
    quotationReady &&
    !existingQuotation &&
    (request.status === "SUBMITTED" || request.status === "IN_QUOTATION");

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    try {
      await submitMutation.mutateAsync(request!.id);
      setSuccess("Requisition berhasil disubmit.");
      setShowSubmitConfirm(false);
      await query.refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal submit requisition.");
      }
      setShowSubmitConfirm(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setSuccess(null);
    try {
      await cancelMutation.mutateAsync(request!.id);
      setSuccess("Requisition berhasil dibatalkan.");
      setShowCancelConfirm(false);
      await query.refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal membatalkan requisition.");
      }
      setShowCancelConfirm(false);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={request.number}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-requests", label: "Requisitions" },
          { label: request.number },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{request.number}</p>
          <StatusBadge status={request.status} />
        </div>

        {isReadOnly ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Requisition ini tidak dapat diedit dalam status saat ini.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <DetailField label="Customer">
            <Link
              href={`/customers/${request.customer.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {request.customer.name}
            </Link>
            <span className="ml-2 text-slate-400">({request.customer.number})</span>
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Service Mode">
              <ServiceModeBadge mode={request.serviceMode} />
            </DetailField>
            <DetailField label="Created">{formatRelativeTime(request.createdAt)}</DetailField>
          </div>

          {request.expectedDate ? (
            <DetailField label="Expected Date">
              {new Date(request.expectedDate).toLocaleDateString("id-ID", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </DetailField>
          ) : null}

          {request.notes ? (
            <DetailField label="Notes">
              <span className="whitespace-pre-wrap">{request.notes}</span>
            </DetailField>
          ) : null}
        </dl>

        {quotationForbidden ? null : (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Quotation</h3>
            {quotationQuery.isLoading ? (
              <p className="mt-2 text-sm text-slate-400">Memuat…</p>
            ) : quotationQuery.isError ? (
              <p className="mt-2 text-sm text-red-600">Gagal memuat quotation.</p>
            ) : existingQuotation ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div>
                  <Link
                    href={`/quotations/${existingQuotation.id}`}
                    className="font-mono text-sm font-medium text-brand-700 hover:underline"
                  >
                    {existingQuotation.number}
                  </Link>
                  <div className="mt-1">
                    <QuotationStatusBadge status={existingQuotation.status} />
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={`/quotations/${existingQuotation.id}`}>
                    <FileText className="h-4 w-4" />
                    View Quotation
                  </Link>
                </Button>
              </div>
            ) : canCreateQuotation ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                <p className="text-sm text-slate-600">Belum ada quotation untuk request ini.</p>
                <Button type="button" size="sm" asChild>
                  <Link href={`/quotations/new?requestId=${request.id}`}>
                    <Plus className="h-4 w-4" />
                    Create Quotation
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Belum ada quotation.</p>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Devices ({request.items.length})</h3>
          <div className="mt-3 space-y-2">
            {request.items.map((item) => {
              // Alias on top, master name below (MoM #3).
              const names = deviceDisplayNames({
                customerDeviceName: item.customerDeviceName,
                deviceTypeName: item.deviceType.name,
              });
              return (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {names.primary}
                      <span className="ml-2 text-sm font-normal text-slate-500">× {item.qty}</span>
                    </p>
                    {names.secondary ? (
                      <p className="mt-0.5 text-xs text-slate-500">{names.secondary}</p>
                    ) : null}
                    {item.model ? (
                      <p className="mt-0.5 text-xs text-slate-500">Model: {item.model}</p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      Serial No:{" "}
                      {item.device?.serialNumber ? (
                        item.device.serialNumber
                      ) : (
                        <span className="text-slate-400">Not provided</span>
                      )}
                    </p>
                    {/* AKD/AKL/NIE is never displayed at Requisition (MoM #4) — no label, no
                        value, not even for historical rows. `akdAkl` / `akdAklDeclaration` stay
                        untouched in the database; this is a display-only change. */}
                    {item.deviceType.category?.name ? (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {item.deviceType.category.name}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-1 text-sm text-slate-600">{item.notes}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/calibration-requests">
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Link>
          </Button>

          {capabilities?.calibrationRequestRead ? (
            <Button type="button" variant="outline" onClick={() => setHistoryDialogOpen(true)}>
              <HistoryIcon className="h-4 w-4" />
              History
            </Button>
          ) : null}

          {canRevise && capabilities?.calibrationRequestUpdate ? (
            <Button type="button" variant="outline" onClick={() => setReviseDialogOpen(true)}>
              <RefreshCw className="h-4 w-4" />
              Revise
            </Button>
          ) : null}

          {isDraft ? (
            <>
              {capabilities?.calibrationRequestUpdate ? (
                <Button type="button" variant="outline" asChild>
                  <Link href={`/calibration-requests/${request.id}/edit`}>
                    <Edit className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              ) : null}
              {capabilities?.calibrationRequestUpdate ? (
                <Button type="button" onClick={() => setShowSubmitConfirm(true)}>
                  <Send className="h-4 w-4" />
                  Submit
                </Button>
              ) : null}
            </>
          ) : null}

          {canCancel && capabilities?.calibrationRequestCancel ? (
            <Button type="button" variant="destructive" onClick={() => setShowCancelConfirm(true)}>
              <X className="h-4 w-4" />
              Cancel Requisition
            </Button>
          ) : null}
        </div>
      </Surface>

      <ConfirmDialog
        open={showSubmitConfirm}
        title="Submit Requisition?"
        description="Setelah disubmit, requisition tidak dapat diedit lagi. Lanjutkan?"
        confirmLabel="Submit"
        onConfirm={handleSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
        loading={submitMutation.isPending}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Requisition?"
        description="Requisition yang dibatalkan tidak dapat dipulihkan. Lanjutkan?"
        confirmLabel="Cancel Requisition"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
        loading={cancelMutation.isPending}
        variant="destructive"
      />

      {reviseDialogOpen ? (
        <ReviseRequestDialog
          request={request}
          onClose={() => setReviseDialogOpen(false)}
          onRevised={async () => {
            setReviseDialogOpen(false);
            setSuccess("Requisition berhasil direvisi.");
            await query.refetch();
          }}
        />
      ) : null}

      {historyDialogOpen ? (
        <RequestHistoryDialog requestId={request.id} onClose={() => setHistoryDialogOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * MOM #1 — Transaction Revision + Immutable History.
 *
 * Minimal revision form, mirroring ReviseQuotationDialog
 * (quotations/[id]/page.tsx): lets the user change the qty of an existing
 * item. The service decides per line whether that's applied in place or as
 * an additive sibling row (mom-1-item-revision-rule) — the UI does not need
 * to know which. Adding a brand-new device line is intentionally out of
 * scope for this UI pass.
 */
function rowsFromRequest(request: CalibrationRequestRow): DesiredItemRow[] {
  return request.items.map(rowFromItem);
}

function emptyRow(): DesiredItemRow {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    deviceTypeId: "",
    customerDeviceName: "",
    model: "",
    deviceId: "",
    qty: 1,
    akdAkl: "",
    akdAklDeclaration: "NOT_PROVIDED",
    notes: "",
    removed: false,
  };
}

function ReviseRequestDialog({
  request,
  onClose,
  onRevised,
}: {
  request: CalibrationRequestRow;
  onClose: () => void;
  onRevised: () => void;
}) {
  const reviseMutation = useReviseCalibrationRequest();
  const importPreviewMutation = useImportPreview();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalById = new Map(request.items.map((item) => [item.id, item]));
  const [rows, setRows] = useState<DesiredItemRow[]>(() => rowsFromRequest(request));
  const [error, setError] = useState<string | null>(null);
  /**
   * Device types resolved by the existing Excel matcher for ADDED rows that
   * are not yet on `request.items` and may not (yet) be present in
   * `typesQuery`'s page — without this, the selector below has no option to
   * match the imported row's `deviceTypeId` against and renders blank.
   */
  const [importedDeviceTypes, setImportedDeviceTypes] = useState<DeviceTypeOption[]>([]);

  /**
   * MOM #1 — Import Excel for Requisition Revision. Reuses the existing
   * `/calibration-requests/import/preview` endpoint unchanged (it only
   * resolves customerDeviceName -> deviceTypeId; it has no notion of "which
   * requisition"). The uploaded file represents the COMPLETE desired scope:
   * rows that resolve to a deviceTypeId already present on this requisition
   * retain that item's id (update in place); rows that resolve to a new
   * deviceTypeId become new rows with no id; current items whose
   * deviceTypeId is absent from the file become Removed, via the same
   * removed:true mechanism as manual removal. Never mutates the DB — only
   * repopulates local `rows` state; Save Revision still calls the one
   * existing revise() mutation below.
   */
  async function handleImportFile(file: File) {
    setError(null);
    try {
      const preview = await importPreviewMutation.mutateAsync(file);
      const result = buildImportedDesiredRows(request.items, preview.rows);
      if ("errors" in result) {
        setError(result.errors.join("\n"));
        return;
      }
      setRows(result.rows);
      setImportedDeviceTypes(result.resolvedDeviceTypes);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal membaca file Excel.");
      }
    }
  }

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 200,
  });
  const deviceTypes: DeviceTypeOption[] = [
    ...(typesQuery.data?.data ?? []),
    ...request.items
      .map((item) => item.deviceType)
      .filter(
        (type, index, all) =>
          Boolean(type) &&
          all.findIndex((candidate) => candidate.id === type.id) === index &&
          !(typesQuery.data?.data ?? []).some((listed) => listed.id === type.id),
      ),
    ...importedDeviceTypes.filter(
      (type) =>
        !(typesQuery.data?.data ?? []).some((listed) => listed.id === type.id) &&
        !request.items.some((item) => item.deviceTypeId === type.id),
    ),
  ];

  function updateRow(key: string, patch: Partial<DesiredItemRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const target = prev.find((row) => row.key === key);
      if (!target) return prev;
      // A newly-added row (no id) was never real — just drop it. An
      // existing row is marked "removed" but stays visible, per §12/§19.
      if (!target.id) return prev.filter((row) => row.key !== key);
      return prev.map((row) => (row.key === key ? { ...row, removed: true } : row));
    });
  }

  function undoRemove(key: string) {
    updateRow(key, { removed: false });
  }

  /** "Change Device": retire the old row (stays visible as Removed) and
   * insert a fresh row with no id right after it — never reusing the old id. */
  function changeDevice(key: string) {
    setRows((prev) => {
      const index = prev.findIndex((row) => row.key === key);
      if (index === -1) return prev;
      const old = prev[index]!;
      const next = [...prev];
      next[index] = { ...old, removed: true };
      next.splice(index + 1, 0, { ...emptyRow(), qty: old.qty });
      return next;
    });
  }

  function rowStatus(row: DesiredItemRow): "unchanged" | "changed" | "added" | "removed" {
    if (row.removed) return "removed";
    if (!row.id) return "added";
    const original = originalById.get(row.id);
    if (!original) return "changed";
    return original.qty !== row.qty || original.deviceTypeId !== row.deviceTypeId
      ? "changed"
      : "unchanged";
  }

  const activeRows = rows.filter((row) => !row.removed);
  const hasChanges =
    activeRows.length !== request.items.length ||
    rows.some((row) => rowStatus(row) !== "unchanged") ||
    rows.some((row) => row.removed);
  const allActiveRowsHaveDeviceType = activeRows.every((row) => row.deviceTypeId);
  const allActiveRowsHaveDeviceId = activeRows.every((row) => row.deviceId.trim());

  async function submit() {
    setError(null);
    if (activeRows.length === 0) {
      setError("Requisition harus memiliki minimal satu device aktif.");
      return;
    }
    if (!allActiveRowsHaveDeviceType) {
      setError("Pilih device name untuk setiap baris.");
      return;
    }
    if (!allActiveRowsHaveDeviceId) {
      setError("Isi Serial No untuk setiap baris.");
      return;
    }
    try {
      await reviseMutation.mutateAsync({
        id: request.id,
        input: {
          items: activeRows.map((row) => ({
            id: row.id,
            deviceTypeId: row.deviceTypeId,
            customerDeviceName: row.customerDeviceName || undefined,
            model: row.model || undefined,
            deviceId: row.deviceId.trim(),
            akdAkl: row.akdAkl || undefined,
            akdAklDeclaration: row.akdAklDeclaration,
            notes: row.notes || undefined,
            qty: row.qty,
          })),
        },
      });
      onRevised();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal merevisi requisition.");
      }
    }
  }

  const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    added: { label: "Added", className: "bg-emerald-100 text-emerald-700" },
    changed: { label: "Changed", className: "bg-amber-100 text-amber-700" },
    removed: { label: "Removed", className: "bg-red-100 text-red-700" },
    unchanged: { label: "", className: "" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Revise {request.number}</h3>
        <p className="mt-2 text-sm text-slate-600">
          Edit the complete desired scope below — add, remove, change device, or change
          quantity, then save as one revision. The current state is saved as history first.
          The requisition number never changes.
        </p>
        <div className="mt-4 space-y-2">
          {rows.map((row) => {
            const status = rowStatus(row);
            const badge = STATUS_BADGE[status];
            return (
              <div
                key={row.key}
                className={cn(
                  "rounded-lg border p-3",
                  row.removed ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  {badge?.label ? (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  ) : (
                    <span />
                  )}
                  {row.removed ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => undoRemove(row.key)}>
                      Undo
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      {row.id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => changeDevice(row.key)}
                        >
                          Change Device
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                        onClick={() => removeRow(row.key)}
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {row.removed ? (
                  <p className="mt-1 text-sm text-slate-500 line-through">
                    {deviceTypes.find((dt) => dt.id === row.deviceTypeId)?.name ?? "Device"} × {row.qty}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <DeviceTypeItemSelect
                      value={row.deviceTypeId}
                      onChange={(id) => updateRow(row.key, { deviceTypeId: id })}
                      deviceTypes={deviceTypes}
                      loading={typesQuery.isLoading}
                    />
                    <div className="flex items-center gap-2">
                      <label className="w-20 text-xs font-medium text-slate-600">
                        Serial No <span className="text-red-500">*</span>
                      </label>
                      <Input
                        className="flex-1"
                        value={row.deviceId}
                        onChange={(e) => updateRow(row.key, { deviceId: e.target.value })}
                        placeholder="Nomor seri alat yang sudah terdaftar"
                        maxLength={120}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-20 text-xs font-medium text-slate-600">Qty</label>
                      <Input
                        type="number"
                        min={1}
                        step="1"
                        className="w-24"
                        value={row.qty}
                        onChange={(e) => updateRow(row.key, { qty: Number(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" />
            Add Device
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importPreviewMutation.isPending}
          >
            <Upload className="h-4 w-4" />
            {importPreviewMutation.isPending ? "Memproses…" : "Import Excel"}
          </Button>
        </div>

        {error ? (
          <p className="mt-3 whitespace-pre-line text-sm text-red-600">{error}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
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
            disabled={reviseMutation.isPending || !hasChanges}
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
 * snapshot. Mirrors QuotationHistoryDialog (quotations/[id]/page.tsx).
 */
function RequestHistoryDialog({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const historyQuery = useCalibrationRequestHistory(requestId);
  const [selected, setSelected] = useState<number | null>(null);
  const revisionQuery = useCalibrationRequestHistoryRevision(requestId, selected ?? undefined);

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
          <p className="mt-4 text-sm text-slate-500">Belum ada revisi untuk requisition ini.</p>
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
                        <th className="py-1">Device Type</th>
                        <th className="py-1 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {revisionQuery.data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-1.5">
                            {item.customerDeviceName ?? item.deviceTypeId}
                          </td>
                          <td className="py-1.5 text-right">{item.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
