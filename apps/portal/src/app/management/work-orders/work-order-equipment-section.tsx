"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Loader2, Package } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import {
  selectClassName,
  type WorkOrderRow,
  type WorkOrderEquipmentProposalRow,
  type WorkOrderEquipmentRow,
} from "./work-orders-ui";
import { formatWorkOrderApiError } from "./work-order-form-utils";
import { reorderEquipmentIds, sameEquipmentOrder } from "./work-order-equipment-ordering";
import {
  useConfirmWorkOrderEquipment,
  useReorderWorkOrderEquipment,
  useReplaceWorkOrderEquipment,
  useWorkOrderEquipmentProposal,
} from "./use-work-orders-query";

function equipmentLabel(equipment: WorkOrderEquipmentRow["equipment"]): string {
  return [equipment.code, equipment.brand, equipment.model, equipment.serialNumber]
    .filter(Boolean)
    .join(" · ");
}

const CALIBRATION_LABELS: Record<string, string> = {
  VALID: "Kalibrasi valid",
  EXPIRED: "Kalibrasi kadaluarsa",
  NOT_YET_VALID: "Kalibrasi belum berlaku",
  NO_RECORD: "Tanpa catatan kalibrasi",
};

/** "Equipment yang akan dibawa" — ON_SITE work orders only. */
export function WorkOrderEquipmentSection({
  workOrder,
  editable,
  onChanged,
}: {
  workOrder: WorkOrderRow;
  editable: boolean;
  onChanged: () => void | Promise<unknown>;
}) {
  const { capabilities } = useAuthz();
  const canUpdate = Boolean(capabilities?.workOrderUpdate);

  const proposalQuery = useWorkOrderEquipmentProposal(
    workOrder.id,
    workOrder.serviceMode === "ON_SITE",
  );
  const replaceMutation = useReplaceWorkOrderEquipment();
  const confirmMutation = useConfirmWorkOrderEquipment();
  const reorderMutation = useReorderWorkOrderEquipment();

  // Map<equipmentTypeId, equipmentId | "">
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows: WorkOrderEquipmentProposalRow[] = useMemo(
    () => proposalQuery.data?.proposal ?? [],
    [proposalQuery.data],
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of rows) next[row.equipmentType.id] = row.selectedEquipmentId ?? "";
    setSelection(next);
  }, [rows]);

  if (workOrder.serviceMode !== "ON_SITE") return null;

  const confirmed = workOrder.equipmentConfirmedAt !== null;
  const selectedCount = Object.values(selection).filter(Boolean).length;
  const dirty = rows.some(
    (row) => (selection[row.equipmentType.id] ?? "") !== (row.selectedEquipmentId ?? ""),
  );

  async function handleSave() {
    setError(null);
    setNotice(null);
    const equipment = rows
      .map((row) => ({
        equipmentTypeId: row.equipmentType.id,
        equipmentId: selection[row.equipmentType.id] ?? "",
      }))
      .filter((entry) => entry.equipmentId)
      .map((entry) => ({ equipmentId: entry.equipmentId, equipmentTypeId: entry.equipmentTypeId }));
    try {
      const result = await replaceMutation.mutateAsync({ id: workOrder.id, input: { equipment } });
      await onChanged();
      if (result.warnings.length > 0) {
        setNotice(result.warnings.map((warning) => warning.message).join(" · "));
      } else {
        setNotice("Daftar equipment disimpan.");
      }
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal menyimpan daftar equipment.").message);
    }
  }

  async function handleConfirm() {
    setError(null);
    setNotice(null);
    try {
      await confirmMutation.mutateAsync(workOrder.id);
      await onChanged();
      setNotice("Daftar equipment dikonfirmasi.");
    } catch (err) {
      setError(formatWorkOrderApiError(err, "Gagal mengonfirmasi daftar equipment.").message);
    }
  }

  const pending = replaceMutation.isPending || confirmMutation.isPending;
  const canEdit = editable && canUpdate;

  // Actual selected equipment, in its persisted operational order (sortOrder asc,
  // as returned by the API). This is the authoritative order for the future
  // Delivery Note / Surat Jalan.
  const orderedEquipment = useMemo(
    () => [...workOrder.equipment].sort((a, b) => a.sortOrder - b.sortOrder),
    [workOrder.equipment],
  );

  function handleReorder(activeId: string, overId: string) {
    setError(null);
    setNotice(null);
    const ids = orderedEquipment.map((row) => row.equipment.id);
    const next = reorderEquipmentIds(ids, activeId, overId);
    if (sameEquipmentOrder(ids, next)) return;
    reorderMutation.mutate(
      { id: workOrder.id, equipmentIds: next },
      {
        onError: (err) =>
          setError(formatWorkOrderApiError(err, "Gagal menyimpan urutan equipment.").message),
        onSuccess: () => setNotice("Urutan equipment disimpan."),
      },
    );
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Package className="h-4 w-4" />
          Equipment yang akan dibawa
        </h3>
        <span
          className={
            confirmed
              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
              : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
          }
        >
          {confirmed ? "Dikonfirmasi" : "Belum dikonfirmasi"}
        </span>
      </div>

      {proposalQuery.isLoading ? (
        <p className="mt-3 text-sm text-slate-400">Memuat…</p>
      ) : proposalQuery.isError ? (
        <p className="mt-3 text-sm text-red-600">Gagal memuat kebutuhan equipment.</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Tidak ada kebutuhan equipment standar untuk device type pada work order ini.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Jenis Equipment</th>
                <th className="py-2 pr-3">Unit Aktual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const value = selection[row.equipmentType.id] ?? "";
                const selectedCandidate = row.candidates.find(
                  (candidate) => candidate.id === value,
                );
                return (
                  <tr key={row.equipmentType.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 text-slate-400">{index + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-900">{row.equipmentType.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{row.equipmentType.code}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {canEdit ? (
                        <select
                          className={selectClassName}
                          value={value}
                          onChange={(event) =>
                            setSelection((current) => ({
                              ...current,
                              [row.equipmentType.id]: event.target.value,
                            }))
                          }
                          aria-label={`Unit untuk ${row.equipmentType.name}`}
                        >
                          <option value="">— Pilih unit —</option>
                          {row.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {[
                                candidate.code,
                                candidate.brand,
                                candidate.model,
                                candidate.serialNumber,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </option>
                          ))}
                        </select>
                      ) : selectedCandidate ? (
                        <span>
                          {[
                            selectedCandidate.code,
                            selectedCandidate.brand,
                            selectedCandidate.model,
                            selectedCandidate.serialNumber,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum dipilih</span>
                      )}
                      {selectedCandidate && selectedCandidate.calibrationStatus !== "VALID" ? (
                        <span className="mt-1 block text-xs text-amber-700">
                          {CALIBRATION_LABELS[selectedCandidate.calibrationStatus]}
                        </span>
                      ) : null}
                      {canEdit && row.candidates.length === 0 ? (
                        <span className="mt-1 block text-xs text-slate-400">
                          Tidak ada unit aktif untuk jenis ini.
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-amber-700">{notice}</p> : null}

      {canEdit && rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleSave} disabled={pending || !dirty}>
            {replaceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan Daftar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || dirty || confirmed || selectedCount === 0}
          >
            <Check className="h-4 w-4" />
            Konfirmasi Daftar
          </Button>
        </div>
      ) : null}

      {orderedEquipment.length > 0 ? (
        <EquipmentOrderList
          equipment={orderedEquipment}
          canReorder={canEdit}
          reordering={reorderMutation.isPending}
          onReorder={handleReorder}
        />
      ) : null}
    </div>
  );
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * The actual equipment for this work order, arranged in the order the technician
 * will carry it. Drag-and-drop scoped to this one work order; the drag handle is
 * the only activator so it never interferes with other row interactions. The
 * persisted order (WorkOrderEquipment.sortOrder) is what the Delivery Note reads.
 */
function EquipmentOrderList({
  equipment,
  canReorder,
  reordering,
  onReorder,
}: {
  equipment: WorkOrderEquipmentRow[];
  canReorder: boolean;
  reordering: boolean;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const mounted = useMounted();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndEnabled = mounted && canReorder && equipment.length > 1;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Urutan equipment yang akan dibawa teknisi (Delivery Note)
        </h4>
        {reordering ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
      </div>

      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ container: typeof document !== "undefined" ? document.body : undefined }}
        >
          <SortableContext
            items={equipment.map((row) => row.equipment.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-2 space-y-1">
              {equipment.map((row, index) => (
                <SortableEquipmentRow key={row.equipment.id} row={row} index={index} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="mt-2 space-y-1">
          {equipment.map((row, index) => (
            <li
              key={row.equipment.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="w-5 text-center text-xs text-slate-400">{index + 1}</span>
              <span className="font-medium text-slate-900">{row.equipment.equipmentType.name}</span>
              <span className="text-xs text-slate-400">{equipmentLabel(row.equipment)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortableEquipmentRow({ row, index }: { row: WorkOrderEquipmentRow; index: number }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id: row.equipment.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" +
        (isDragging ? " relative z-10 shadow-sm" : "")
      }
    >
      <button
        type="button"
        aria-label="Ubah urutan"
        className="cursor-grab touch-none rounded p-1 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-center text-xs text-slate-400">{index + 1}</span>
      <span className="font-medium text-slate-900">{row.equipment.equipmentType.name}</span>
      <span className="text-xs text-slate-400">{equipmentLabel(row.equipment)}</span>
      {!row.equipment.isActive ? (
        <span className="ml-auto text-xs text-amber-700">Non-aktif</span>
      ) : null}
    </li>
  );
}
