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
  type WorkOrderEquipmentTypeRef,
} from "./work-orders-ui";
import { formatWorkOrderApiError } from "./work-order-form-utils";
import { reorderEquipmentIds, sameEquipmentOrder } from "./work-order-equipment-ordering";
import {
  useConfirmWorkOrderEquipment,
  useReorderWorkOrderEquipment,
  useReplaceWorkOrderEquipment,
  useWorkOrderEquipmentProposal,
} from "./use-work-orders-query";

function equipmentLabel(
  equipment: Pick<
    WorkOrderEquipmentRow["equipment"],
    "code" | "brand" | "model" | "serialNumber"
  >,
): string {
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

/**
 * One row of the unified "Equipment yang akan dibawa" list. Each row is a single
 * required EquipmentType with its actual selected unit. Rows that already have a
 * persisted WorkOrderEquipment (`persisted`) participate in drag-and-drop
 * ordering — that order is what the Delivery Note reads. Rows without a selected
 * unit yet are shown at the end and are not sortable until saved.
 */
interface UnifiedEquipmentRow {
  equipmentType: WorkOrderEquipmentTypeRef;
  proposal: WorkOrderEquipmentProposalRow | null;
  persisted: WorkOrderEquipmentRow | null;
}

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

  // Actual selected equipment, in its persisted operational order (sortOrder
  // asc, as returned by the API). This is the authoritative order for the
  // Delivery Note / Surat Jalan.
  const orderedEquipment = useMemo(
    () => [...workOrder.equipment].sort((a, b) => a.sortOrder - b.sortOrder),
    [workOrder.equipment],
  );

  // The single unified list: persisted equipment first (in Delivery Note order),
  // then any still-unselected requirements.
  const unifiedRows: UnifiedEquipmentRow[] = useMemo(() => {
    const proposalByType = new Map(rows.map((row) => [row.equipmentType.id, row]));
    const seen = new Set<string>();
    const out: UnifiedEquipmentRow[] = [];
    for (const eq of orderedEquipment) {
      seen.add(eq.equipmentTypeId);
      const proposal = proposalByType.get(eq.equipmentTypeId) ?? null;
      out.push({
        equipmentType: proposal?.equipmentType ?? eq.equipment.equipmentType,
        proposal,
        persisted: eq,
      });
    }
    for (const row of rows) {
      if (seen.has(row.equipmentType.id)) continue;
      out.push({ equipmentType: row.equipmentType, proposal: row, persisted: null });
    }
    return out;
  }, [rows, orderedEquipment]);

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

      <p className="mt-1 text-xs text-slate-500">
        Pilih unit equipment yang akan dibawa dan atur urutannya untuk Delivery Note.
      </p>

      {proposalQuery.isLoading ? (
        <p className="mt-3 text-sm text-slate-400">Memuat…</p>
      ) : proposalQuery.isError ? (
        <p className="mt-3 text-sm text-red-600">Gagal memuat kebutuhan equipment.</p>
      ) : unifiedRows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Tidak ada kebutuhan equipment standar untuk device type pada work order ini.
        </p>
      ) : (
        <UnifiedEquipmentList
          rows={unifiedRows}
          selection={selection}
          canEdit={canEdit}
          reordering={reorderMutation.isPending}
          onSelect={(equipmentTypeId, equipmentId) =>
            setSelection((current) => ({ ...current, [equipmentTypeId]: equipmentId }))
          }
          onReorder={handleReorder}
        />
      )}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-amber-700">{notice}</p> : null}

      {canEdit && unifiedRows.length > 0 ? (
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
    </div>
  );
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * The single list of equipment the technician will carry. Each row shows the
 * required EquipmentType and its actual selected unit; rows that already have a
 * persisted WorkOrderEquipment can be dragged to set the order the Delivery Note
 * uses. Drag-and-drop is scoped to this one work order and the grip handle is
 * the only activator so it never interferes with the unit selector.
 */
function UnifiedEquipmentList({
  rows,
  selection,
  canEdit,
  reordering,
  onSelect,
  onReorder,
}: {
  rows: UnifiedEquipmentRow[];
  selection: Record<string, string>;
  canEdit: boolean;
  reordering: boolean;
  onSelect: (equipmentTypeId: string, equipmentId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const mounted = useMounted();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = rows
    .filter((row) => row.persisted)
    .map((row) => row.persisted!.equipment.id);
  const dndEnabled = mounted && canEdit && sortableIds.length > 1;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

  const body = (
    <tbody>
      {rows.map((row, index) => (
        <EquipmentRow
          key={row.equipmentType.id}
          row={row}
          index={index}
          value={selection[row.equipmentType.id] ?? ""}
          canEdit={canEdit}
          sortable={dndEnabled && Boolean(row.persisted)}
          showHandleColumn={dndEnabled}
          onSelect={onSelect}
        />
      ))}
    </tbody>
  );

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex items-center justify-end">
        {reordering ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
      </div>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {dndEnabled ? <th className="w-8 py-2" aria-hidden /> : null}
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Jenis Equipment</th>
            <th className="py-2 pr-3">Unit Aktual</th>
          </tr>
        </thead>
        {dndEnabled ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{
              container: typeof document !== "undefined" ? document.body : undefined,
            }}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {body}
            </SortableContext>
          </DndContext>
        ) : (
          body
        )}
      </table>
    </div>
  );
}

function EquipmentRow({
  row,
  index,
  value,
  canEdit,
  sortable,
  showHandleColumn,
  onSelect,
}: {
  row: UnifiedEquipmentRow;
  index: number;
  value: string;
  canEdit: boolean;
  sortable: boolean;
  showHandleColumn: boolean;
  onSelect: (equipmentTypeId: string, equipmentId: string) => void;
}) {
  const sortableId = row.persisted?.equipment.id ?? row.equipmentType.id;
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id: sortableId,
    disabled: !sortable,
  });

  const candidates = row.proposal?.candidates ?? [];
  const selectedCandidate = candidates.find((candidate) => candidate.id === value);
  const persistedEquipment = row.persisted?.equipment ?? null;
  const displayLabel = selectedCandidate
    ? equipmentLabel(selectedCandidate)
    : persistedEquipment
      ? equipmentLabel(persistedEquipment)
      : null;
  const calibrationStatus = selectedCandidate?.calibrationStatus;

  return (
    <tr
      ref={sortable ? setNodeRef : undefined}
      style={sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined}
      className={
        "border-b border-slate-100 align-top bg-white" +
        (isDragging ? " relative z-10 shadow-sm" : "")
      }
    >
      {showHandleColumn ? (
        <td className="py-2">
          {sortable ? (
            <button
              type="button"
              aria-label="Ubah urutan"
              className="cursor-grab touch-none rounded p-1 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null}
        </td>
      ) : null}
      <td className="py-2 pr-3 text-slate-400">{index + 1}</td>
      <td className="py-2 pr-3">
        <span className="block font-medium text-slate-900">{row.equipmentType.name}</span>
        <span className="block text-xs text-slate-400">{row.equipmentType.code}</span>
      </td>
      <td className="py-2 pr-3">
        {canEdit && row.proposal ? (
          <select
            className={selectClassName}
            value={value}
            onChange={(event) => onSelect(row.equipmentType.id, event.target.value)}
            aria-label={`Unit untuk ${row.equipmentType.name}`}
          >
            <option value="">— Pilih unit —</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {equipmentLabel(candidate)}
              </option>
            ))}
          </select>
        ) : displayLabel ? (
          <span>{displayLabel}</span>
        ) : (
          <span className="text-slate-400">Belum dipilih</span>
        )}
        {calibrationStatus && calibrationStatus !== "VALID" ? (
          <span className="mt-1 block text-xs text-amber-700">
            {CALIBRATION_LABELS[calibrationStatus]}
          </span>
        ) : null}
        {canEdit && row.proposal && candidates.length === 0 ? (
          <span className="mt-1 block text-xs text-slate-400">
            Tidak ada unit aktif untuk jenis ini.
          </span>
        ) : null}
      </td>
    </tr>
  );
}
