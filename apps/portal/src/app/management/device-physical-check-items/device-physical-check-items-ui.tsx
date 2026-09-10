"use client";

import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { reorderIds, sameOrder } from "./device-physical-check-item-ordering";

export interface DevicePhysicalCheckItemTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface DevicePhysicalCheckItemRow {
  id: string;
  deviceTypeId: string;
  code: string;
  name: string;
  inspectionLimit: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deviceType: DevicePhysicalCheckItemTypeRef;
}

/** Legacy paginated list response — still returned by GET /device-physical-check-items. */
export interface DevicePhysicalCheckItemListResponse {
  data: DevicePhysicalCheckItemRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** GET /device-physical-check-items/grouped — items grouped by Device Type. */
export interface DevicePhysicalCheckItemGroupRow {
  deviceType: DevicePhysicalCheckItemTypeRef;
  categoryName: string | null;
  count: number;
  /** Items in persisted sortOrder (API order). */
  items: DevicePhysicalCheckItemRow[];
}

export interface DevicePhysicalCheckItemGroupedResponse {
  data: DevicePhysicalCheckItemGroupRow[];
  /** Standard MEDCAL pagination — at the Device-Type (parent-row) level. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalItems: number;
  totalDeviceTypes: number;
}

export const devicePhysicalCheckItemFormPageClass =
  "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const devicePhysicalCheckItemFormSurfaceClass = "mt-5 p-4 md:p-5";
export const devicePhysicalCheckItemFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName, PaginationBar };

export function DevicePhysicalCheckItemStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant={isActive ? "default" : "secondary"}
      className={cn(
        "font-medium",
        isActive
          ? "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
          : "text-slate-600",
      )}
    >
      {isActive ? "Aktif" : "Nonaktif"}
    </Badge>
  );
}

export function DevicePhysicalCheckItemSearchBar({
  value,
  onChange,
  isActive,
  onIsActiveChange,
}: {
  value: string;
  onChange: (value: string) => void;
  isActive: boolean | "";
  onIsActiveChange: (value: boolean | "") => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cari device name atau item pemeriksaan…"
          className="pl-9"
          aria-label="Cari device name atau physical inspection item"
        />
      </div>
      <select
        value={isActive === "" ? "" : isActive ? "true" : "false"}
        onChange={(e) => {
          const next = e.target.value;
          onIsActiveChange(next === "" ? "" : next === "true");
        }}
        className={cn(selectClassName, "w-full sm:w-44")}
        aria-label="Filter status"
      >
        <option value="">Semua status</option>
        <option value="true">Aktif</option>
        <option value="false">Nonaktif</option>
      </select>
    </div>
  );
}

const CHILD_HEADER = ["", "Item / Parameter", "Batas Pemeriksaan", "Status", ""] as const;

export interface DevicePhysicalCheckItemReorderHandlers {
  onReorderItems: (deviceTypeId: string, itemIds: string[]) => void;
}

type DragHandleProps = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

function DragHandle({ attributes, listeners }: DragHandleProps) {
  return (
    <button
      type="button"
      aria-label="Ubah urutan"
      className="cursor-grab touch-none rounded p-1 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function SortableItemRow({
  deviceTypeId,
  row,
  canReorder,
}: {
  deviceTypeId: string;
  row: DevicePhysicalCheckItemRow;
  canReorder: boolean;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id: row.id,
    data: { type: "item", deviceTypeId },
    disabled: !canReorder,
  });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50",
        isDragging && "relative z-10 bg-white shadow-sm",
      )}
    >
      <td className="px-4 py-2 pl-6">
        {canReorder ? (
          <DragHandle attributes={attributes} listeners={listeners} />
        ) : (
          <span className="inline-block w-6" />
        )}
      </td>
      <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
      <td className="px-4 py-2 text-slate-600">
        {row.inspectionLimit?.trim() ? (
          row.inspectionLimit
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <DevicePhysicalCheckItemStatusBadge isActive={row.isActive} />
      </td>
      <td className="px-4 py-2 text-right">
        <Link href={`/device-physical-check-items/${row.id}`}>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </Link>
      </td>
    </tr>
  );
}

function ChildRows({
  group,
  canCreate,
  canReorder,
  reorder,
}: {
  group: DevicePhysicalCheckItemGroupRow;
  canCreate: boolean;
  canReorder: boolean;
  reorder?: DevicePhysicalCheckItemReorderHandlers;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndEnabled = canReorder && Boolean(reorder);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!reorder || !over || active.id === over.id) return;
    const activeData = active.data.current as { type?: string; deviceTypeId?: string } | undefined;
    const overData = over.data.current as { type?: string; deviceTypeId?: string } | undefined;
    if (!activeData || !overData || activeData.type !== "item" || overData.type !== "item") return;
    // Items may only be reordered within their own DeviceType.
    if (activeData.deviceTypeId !== overData.deviceTypeId) return;
    if (activeData.deviceTypeId !== group.deviceType.id) return;

    const ids = group.items.map((item) => item.id);
    const next = reorderIds(ids, String(active.id), String(over.id));
    if (!sameOrder(ids, next)) {
      reorder.onReorderItems(group.deviceType.id, next);
    }
  }

  return (
    <>
      <tr className="bg-slate-50/60 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {CHILD_HEADER.map((label, i) => (
          <td key={label || i} className="px-4 py-1.5 pl-4">
            {label}
          </td>
        ))}
      </tr>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          container: typeof document !== "undefined" ? document.body : undefined,
        }}
      >
        <SortableContext
          items={group.items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {group.items.map((row) => (
            <SortableItemRow
              key={row.id}
              deviceTypeId={group.deviceType.id}
              row={row}
              canReorder={dndEnabled}
            />
          ))}
        </SortableContext>
      </DndContext>
      {canCreate ? (
        <tr className="border-b border-slate-100 last:border-0">
          <td colSpan={5} className="px-4 py-1.5 pl-6">
            <Link
              href={`/device-physical-check-items/new?deviceTypeId=${group.deviceType.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah item untuk {group.deviceType.name}
            </Link>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function DeviceTypePhysicalCheckItemTable({
  groups,
  expandedIds,
  onToggle,
  canCreate,
  canReorder = false,
  reorder,
}: {
  groups: DevicePhysicalCheckItemGroupRow[];
  expandedIds: Set<string>;
  onToggle: (deviceTypeId: string) => void;
  canCreate: boolean;
  canReorder?: boolean;
  reorder?: DevicePhysicalCheckItemReorderHandlers;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Device Name</th>
            <th className="px-4 py-2.5">Kategori</th>
            <th className="px-4 py-2.5" colSpan={3}>
              Jumlah
            </th>
          </tr>
        </thead>
        {groups.map((group) => {
          const expanded = expandedIds.has(group.deviceType.id);
          return (
            <tbody key={group.deviceType.id} className="border-b border-slate-200 last:border-0">
              <tr
                className="cursor-pointer bg-white hover:bg-slate-50"
                onClick={() => onToggle(group.deviceType.id)}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    {group.deviceType.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{group.categoryName ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-slate-500" colSpan={3}>
                  {group.count} item
                </td>
              </tr>
              {expanded ? (
                <ChildRows
                  group={group}
                  canCreate={canCreate}
                  canReorder={canReorder}
                  reorder={reorder}
                />
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export function DevicePhysicalCheckItemEmptyState({
  hasSearch,
  onClearSearch,
}: {
  hasSearch?: boolean;
  onClearSearch?: () => void;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-500">
        {hasSearch
          ? "Tidak ada device name atau item yang cocok dengan pencarian."
          : "Belum ada Physical Inspection item."}
      </p>
      {hasSearch && onClearSearch ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearSearch}>
          Reset pencarian
        </Button>
      ) : null}
    </div>
  );
}
