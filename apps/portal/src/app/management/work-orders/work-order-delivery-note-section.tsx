"use client";

import { useState } from "react";
import { FileText, Loader2, Printer } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { formatDateTime, type WorkOrderRow } from "./work-orders-ui";
import { formatWorkOrderApiError } from "./work-order-form-utils";
import { openDeliveryNotePdf, useIssueDeliveryNote } from "./use-work-orders-query";

/**
 * "Surat Jalan Alat" (DLN) — ON_SITE work orders only. The document is issued
 * from the work order's confirmed equipment list; equipment is never selected
 * here. A reprint reuses the same DLN number.
 */
export function WorkOrderDeliveryNoteSection({
  workOrder,
  onChanged,
}: {
  workOrder: WorkOrderRow;
  onChanged: () => void | Promise<unknown>;
}) {
  const { capabilities } = useAuthz();
  const canIssue = Boolean(capabilities?.workOrderUpdate);
  const issueMutation = useIssueDeliveryNote();
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  if (workOrder.serviceMode !== "ON_SITE") return null;

  const deliveryNote = workOrder.deliveryNote;
  const confirmed = workOrder.equipmentConfirmedAt !== null;
  const hasEquipment = workOrder.equipment.length > 0;
  const eligible = confirmed && hasEquipment;

  async function handleIssue() {
    setError(null);
    try {
      await issueMutation.mutateAsync(workOrder.id);
      await onChanged();
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal menerbitkan Surat Jalan.").message);
    }
  }

  async function handlePrint() {
    setError(null);
    setPrinting(true);
    try {
      await openDeliveryNotePdf(
        workOrder.id,
        `${workOrder.deliveryNote?.number ?? "surat-jalan"}.pdf`,
      );
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal membuka PDF Surat Jalan.").message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FileText className="h-4 w-4" />
          Surat Jalan Alat
        </h3>
        {deliveryNote ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Terbit
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Belum terbit
          </span>
        )}
      </div>

      {deliveryNote ? (
        <dl className="mt-3 space-y-1 text-sm text-slate-700">
          <div className="flex gap-2">
            <dt className="w-28 text-slate-500">Nomor</dt>
            <dd className="font-mono">{deliveryNote.number}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-slate-500">Tanggal</dt>
            <dd>{formatDateTime(deliveryNote.issuedAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-slate-500">Alat</dt>
            <dd>{deliveryNote.items.length} unit</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          {eligible
            ? "Daftar equipment sudah dikonfirmasi. Surat Jalan siap diterbitkan."
            : "Konfirmasi daftar equipment terlebih dahulu sebelum menerbitkan Surat Jalan."}
        </p>
      )}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {deliveryNote ? (
          <Button type="button" variant="outline" onClick={handlePrint} disabled={printing}>
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            {printing ? "Membuka PDF…" : "Cetak / Unduh PDF"}
          </Button>
        ) : canIssue ? (
          <Button
            type="button"
            onClick={handleIssue}
            disabled={!eligible || issueMutation.isPending}
          >
            {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Issue Delivery Note
          </Button>
        ) : null}
      </div>
    </div>
  );
}
