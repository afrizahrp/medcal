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
import { reorderIds, sameOrder } from "./device-calibration-parameter-ordering";

export interface DeviceCalibrationParameterTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCalibrationParameterCapabilityRef {
  id: string;
  code: string;
  name: string;
}

export interface DeviceCalibrationParameterItemRef {
  id: string;
  name: string;
  capabilityId: string;
  capability: DeviceCalibrationParameterCapabilityRef;
}

export interface DeviceCalibrationParameterUomRef {
  id: string;
  code: string;
  name: string;
  symbol: string;
}

export interface DeviceCalibrationParameterRow {
  id: string;
  deviceTypeId: string;
  capabilityItemId: string;
  code: string;
  name: string;
  description: string | null;
  valueType: "NUMBER" | "RATIO" | "TEXT" | "BOOLEAN";
  uomId: string | null;
  toleranceMin: string | number | null;
  toleranceMax: string | number | null;
  /** `false` = strict `>`. Missing or true = inclusive `≥`. */
  toleranceMinInclusive: boolean;
  /** `false` = strict `<`. Missing or true = inclusive `≤`. */
  toleranceMaxInclusive: boolean;
  toleranceNote: string | null;
  decimalPlaces: number | null;
  sortOrder: number;
  isActive: boolean;
  /**
   * Which entry UI this parameter needs. DIRECT_REPLICATES and DERIVED
   * (Phase 4B) can be created/edited via the Portal today — LOGGER_SUMMARY
   * parameters have CalibrationTestPoint children with no create endpoint yet.
   */
  entryStyle: "DIRECT_REPLICATES" | "LOGGER_SUMMARY" | "DERIVED";
  /**
   * Phase 4B (Gap B) — descriptive-only note on what a DERIVED value is
   * derived from, e.g. `{ description: "Difference between S1 and S3" }`.
   * Never a formula; never evaluated. Only meaningful when
   * `entryStyle === "DERIVED"`; NULL otherwise and on every pre-Phase-4B row.
   */
  derivation: { description: string } | null;
  /**
   * Phase 4A (Gap A) — catalog grouping. Non-null when this parameter is one
   * measured quantity of a multi-quantity logical test; parameters sharing a key
   * are rendered contiguously in `logicalTestSequence` order. NULL on every
   * pre-Phase-4A row and on every standalone parameter.
   */
  logicalTestKey: string | null;
  logicalTestSequence: number | null;
  /**
   * Tech-PWA repetition UX (2026-09-20). Whether "+ Tambah ulangan" is offered
   * for this parameter's applicable points in Tech-PWA. Default true — every
   * parameter without explicit configuration keeps today's behavior.
   */
  allowsRepeatedReadings: boolean;
  createdAt: string;
  updatedAt: string;
  deviceType: DeviceCalibrationParameterTypeRef;
  capabilityItem: DeviceCalibrationParameterItemRef;
  uom: DeviceCalibrationParameterUomRef | null;
}

function formatBound(value: string | number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(Number(value));
}

export function formatCalibrationTolerance(row: {
  toleranceMin: string | number | null;
  toleranceMax: string | number | null;
  toleranceMinInclusive?: boolean;
  toleranceMaxInclusive?: boolean;
  toleranceNote: string | null;
}): string | null {
  const min = row.toleranceMin == null || row.toleranceMin === "" ? null : Number(row.toleranceMin);
  const max = row.toleranceMax == null || row.toleranceMax === "" ? null : Number(row.toleranceMax);
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  const minOp = row.toleranceMinInclusive === false ? ">" : "≥";
  const maxOp = row.toleranceMaxInclusive === false ? "<" : "≤";
  let bounds: string | null = null;
  if (hasMin && hasMax) {
    bounds =
      row.toleranceMinInclusive === false || row.toleranceMaxInclusive === false
        ? `${minOp} ${formatBound(min)} – ${maxOp} ${formatBound(max)}`
        : `${formatBound(min)} – ${formatBound(max)}`;
  } else if (hasMax) bounds = `${maxOp} ${formatBound(max)}`;
  else if (hasMin) bounds = `${minOp} ${formatBound(min)}`;
  const note = row.toleranceNote?.trim() || null;
  if (bounds && note) return `${bounds} (${note})`;
  return bounds ?? note;
}

export function ToleranceBoundOperatorSelect({
  id,
  side,
  inclusive,
  disabled,
  onChange,
}: {
  id: string;
  side: "min" | "max";
  inclusive: boolean;
  disabled?: boolean;
  onChange: (inclusive: boolean) => void;
}) {
  const inclusiveSymbol = side === "min" ? "≥" : "≤";
  const exclusiveSymbol = side === "min" ? ">" : "<";
  return (
    <select
      id={id}
      aria-label={side === "min" ? "Operator batas minimum" : "Operator batas maksimum"}
      disabled={disabled}
      value={inclusive ? "true" : "false"}
      onChange={(e) => onChange(e.target.value === "true")}
      className={`${selectClassName} w-28 shrink-0`}
    >
      <option value="true">{inclusiveSymbol} termasuk</option>
      <option value="false">{exclusiveSymbol} tidak termasuk</option>
    </select>
  );
}

/** "DXRAY_REPRODUCIBILITY #2" for a grouped quantity, "—" for a standalone one. */
export function formatLogicalTest(row: {
  logicalTestKey: string | null;
  logicalTestSequence: number | null;
}): string {
  if (row.logicalTestKey == null || row.logicalTestSequence == null) return "—";
  return `${row.logicalTestKey} #${row.logicalTestSequence}`;
}

export function formatDecimalPlaces(row: {
  valueType: DeviceCalibrationParameterRow["valueType"];
  decimalPlaces: number | null;
}): string {
  if (row.valueType !== "NUMBER") return "—";
  if (row.decimalPlaces == null) return "—";
  return String(row.decimalPlaces);
}

/** Legacy paginated list response — still returned by GET /device-calibration-parameters. */
export interface DeviceCalibrationParameterListResponse {
  data: DeviceCalibrationParameterRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One Capability inside a Device-Type group, with its ordered parameters. */
export interface DeviceCalibrationParameterCapabilityGroupRow {
  capability: DeviceCalibrationParameterCapabilityRef;
  sortOrder: number | null;
  count: number;
  parameters: DeviceCalibrationParameterRow[];
}

/** GET /device-calibration-parameters/grouped — parameters grouped by Device Type. */
export interface DeviceCalibrationParameterGroupRow {
  deviceType: DeviceCalibrationParameterTypeRef;
  categoryName: string | null;
  count: number;
  /** Capabilities in persisted per-DeviceType order, each with ordered parameters. */
  capabilities: DeviceCalibrationParameterCapabilityGroupRow[];
  /** Flattened view of `capabilities` (same order) — kept for backward compatibility. */
  parameters: DeviceCalibrationParameterRow[];
}

export interface DeviceCalibrationParameterGroupedResponse {
  data: DeviceCalibrationParameterGroupRow[];
  /** Standard MEDCAL pagination — at the Device-Type (parent-row) level. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalParameters: number;
  totalDeviceTypes: number;
}

export const deviceCalibrationParameterFormPageClass =
  "mx-auto w-full max-w-[1000px] px-4 py-5 md:px-6";
export const deviceCalibrationParameterFormSurfaceClass = "mt-5 p-4 md:p-5";
export const deviceCalibrationParameterFormActionsClass =
  "mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3";

export { PageHeader, Surface, selectClassName, PaginationBar };

export function DeviceCalibrationParameterStatusBadge({ isActive }: { isActive: boolean }) {
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

// ---------------------------------------------------------------------------
// Simplified browse UI — Device Type is the primary navigation axis.
// An expandable / collapsible TABLE grouped by Device Type: one screen, a
// single search box, parent rows = Device Type, child rows = its calibration
// parameters. Capability / Capability Item / UOM are no longer top-level
// filters; the underlying data relationships are unchanged (see create/edit).
// ---------------------------------------------------------------------------

export function DeviceCalibrationParameterSearchBar({
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
          placeholder="Cari device name atau parameter…"
          className="pl-9 placeholder:text-xs placeholder:font-normal placeholder:text-slate-400/70"
          aria-label="Cari device name atau calibration parameter"
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

const CHILD_HEADER = ["", "Parameter", "UOM", "Decimal", "Tolerance", "Status", ""] as const;

export interface DeviceCalibrationParameterReorderHandlers {
  onReorderCapabilities: (deviceTypeId: string, capabilityIds: string[]) => void;
  onReorderParameters: (
    deviceTypeId: string,
    capabilityId: string,
    parameterIds: string[],
  ) => void;
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

function SortableCapabilityHeaderRow({
  deviceTypeId,
  cap,
  canReorder,
}: {
  deviceTypeId: string;
  cap: DeviceCalibrationParameterCapabilityGroupRow;
  canReorder: boolean;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id: cap.capability.id,
    data: { type: "capability", deviceTypeId },
    disabled: !canReorder,
  });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "border-b border-slate-100 bg-slate-100/70",
        isDragging && "relative z-10 shadow-sm",
      )}
    >
      <td colSpan={7} className="px-4 py-1.5 pl-4">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {canReorder ? <DragHandle attributes={attributes} listeners={listeners} /> : null}
          {cap.capability.name}
          <span className="font-normal normal-case text-slate-400">· {cap.count} parameter</span>
        </span>
      </td>
    </tr>
  );
}

function SortableParameterRow({
  deviceTypeId,
  capabilityId,
  row,
  canReorder,
}: {
  deviceTypeId: string;
  capabilityId: string;
  row: DeviceCalibrationParameterRow;
  canReorder: boolean;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id: row.id,
    data: { type: "parameter", deviceTypeId, capabilityId },
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
      <td className="px-4 py-2 font-medium text-slate-900">
        {row.name}
        {row.valueType !== "NUMBER" ? (
          <Badge variant="secondary" className="ml-2 font-mono text-[10px] text-slate-500">
            {row.valueType}
          </Badge>
        ) : null}
        {row.entryStyle === "DERIVED" ? (
          <Badge variant="secondary" className="ml-2 font-mono text-[10px] text-slate-500">
            DERIVED
          </Badge>
        ) : null}
      </td>
      <td className="px-4 py-2 text-slate-600">{row.uom ? row.uom.symbol : "—"}</td>
      <td className="px-4 py-2 tabular-nums text-slate-700">{formatDecimalPlaces(row)}</td>
      <td className="px-4 py-2 text-slate-600">
        {formatCalibrationTolerance(row) ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-2">
        <DeviceCalibrationParameterStatusBadge isActive={row.isActive} />
      </td>
      <td className="px-4 py-2 text-right">
        <Link href={`/device-calibration-parameters/${row.id}`}>
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
  group: DeviceCalibrationParameterGroupRow;
  canCreate: boolean;
  canReorder: boolean;
  reorder?: DeviceCalibrationParameterReorderHandlers;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndEnabled = canReorder && Boolean(reorder);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!reorder || !over || active.id === over.id) return;
    const activeData = active.data.current as { type?: string; capabilityId?: string } | undefined;
    const overData = over.data.current as { type?: string; capabilityId?: string } | undefined;
    if (!activeData || !overData || activeData.type !== overData.type) return;

    if (activeData.type === "capability") {
      const ids = group.capabilities.map((c) => c.capability.id);
      const next = reorderIds(ids, String(active.id), String(over.id));
      if (!sameOrder(ids, next)) reorder.onReorderCapabilities(group.deviceType.id, next);
      return;
    }
    // Parameters may only be reordered within their own Capability.
    if (activeData.capabilityId !== overData.capabilityId || !activeData.capabilityId) return;
    const cap = group.capabilities.find((c) => c.capability.id === activeData.capabilityId);
    if (!cap) return;
    const ids = cap.parameters.map((p) => p.id);
    const next = reorderIds(ids, String(active.id), String(over.id));
    if (!sameOrder(ids, next)) {
      reorder.onReorderParameters(group.deviceType.id, cap.capability.id, next);
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
          items={group.capabilities.map((c) => c.capability.id)}
          strategy={verticalListSortingStrategy}
        >
          {group.capabilities.map((cap) => (
            <CapabilitySection
              key={cap.capability.id}
              deviceTypeId={group.deviceType.id}
              cap={cap}
              canReorder={dndEnabled}
            />
          ))}
        </SortableContext>
      </DndContext>
      {canCreate ? (
        <tr className="border-b border-slate-100 last:border-0">
          <td colSpan={7} className="px-4 py-1.5 pl-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href={`/device-calibration-parameters/new?deviceTypeId=${group.deviceType.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah parameter untuk {group.deviceType.name}
              </Link>
              {/* "Copy dari device lain" hidden for now (nice-to-have, not urgent) —
                  route/component/backend endpoint kept intact, just no entry point. */}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CapabilitySection({
  deviceTypeId,
  cap,
  canReorder,
}: {
  deviceTypeId: string;
  cap: DeviceCalibrationParameterCapabilityGroupRow;
  canReorder: boolean;
}) {
  return (
    <>
      <SortableCapabilityHeaderRow deviceTypeId={deviceTypeId} cap={cap} canReorder={canReorder} />
      <SortableContext
        items={cap.parameters.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        {cap.parameters.map((row) => (
          <SortableParameterRow
            key={row.id}
            deviceTypeId={deviceTypeId}
            capabilityId={cap.capability.id}
            row={row}
            canReorder={canReorder}
          />
        ))}
      </SortableContext>
    </>
  );
}

export function DeviceTypeParameterTable({
  groups,
  expandedIds,
  onToggle,
  canCreate,
  canReorder = false,
  reorder,
}: {
  groups: DeviceCalibrationParameterGroupRow[];
  expandedIds: Set<string>;
  onToggle: (deviceTypeId: string) => void;
  canCreate: boolean;
  canReorder?: boolean;
  reorder?: DeviceCalibrationParameterReorderHandlers;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Device Name</th>
            <th className="px-4 py-2.5">Kategori</th>
            <th className="px-4 py-2.5" colSpan={5}>
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
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {group.categoryName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500" colSpan={5}>
                    {group.count} parameter
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

export function DeviceCalibrationParameterEmptyState({
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
          ? "Tidak ada device name atau parameter yang cocok dengan pencarian."
          : "Belum ada Calibration Parameter."}
      </p>
      {hasSearch && onClearSearch ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearSearch}>
          Reset pencarian
        </Button>
      ) : null}
    </div>
  );
}
