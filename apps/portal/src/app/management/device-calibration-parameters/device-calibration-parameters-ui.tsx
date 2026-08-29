"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

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
  code: string;
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
  toleranceNote: string | null;
  decimalPlaces: number | null;
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
  toleranceNote: string | null;
}): string | null {
  const min = row.toleranceMin == null || row.toleranceMin === "" ? null : Number(row.toleranceMin);
  const max = row.toleranceMax == null || row.toleranceMax === "" ? null : Number(row.toleranceMax);
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  let bounds: string | null = null;
  if (hasMin && hasMax) bounds = `${formatBound(min)} – ${formatBound(max)}`;
  else if (hasMax) bounds = `≤ ${formatBound(max)}`;
  else if (hasMin) bounds = `≥ ${formatBound(min)}`;
  const note = row.toleranceNote?.trim() || null;
  if (bounds && note) return `${bounds} (${note})`;
  return bounds ?? note;
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

/** GET /device-calibration-parameters/grouped — parameters grouped by Device Type. */
export interface DeviceCalibrationParameterGroupRow {
  deviceType: DeviceCalibrationParameterTypeRef;
  categoryName: string | null;
  count: number;
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
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari device type atau parameter…"
        className="pl-9"
        aria-label="Cari device type atau calibration parameter"
      />
    </div>
  );
}

const CHILD_HEADER = ["Capability", "Parameter", "UOM", "Decimal", "Tolerance", ""] as const;

function ChildRows({
  group,
  canCreate,
}: {
  group: DeviceCalibrationParameterGroupRow;
  canCreate: boolean;
}) {
  return (
    <>
      <tr className="bg-slate-50/60 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {CHILD_HEADER.map((label, i) => (
          <td key={label || i} className="px-4 py-1.5 pl-10">
            {label}
          </td>
        ))}
      </tr>
      {group.parameters.map((row) => (
        <tr key={row.id} className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2 pl-10 text-slate-500">{row.capabilityItem.capability.name}</td>
          <td className="px-4 py-2 font-medium text-slate-900">
            {row.name}
            {row.valueType !== "NUMBER" ? (
              <Badge variant="secondary" className="ml-2 font-mono text-[10px] text-slate-500">
                {row.valueType}
              </Badge>
            ) : null}
          </td>
          <td className="px-4 py-2 text-slate-600">{row.uom ? row.uom.symbol : "—"}</td>
          <td className="px-4 py-2 tabular-nums text-slate-700">{formatDecimalPlaces(row)}</td>
          <td className="px-4 py-2 text-slate-600">
            {formatCalibrationTolerance(row) ?? <span className="text-slate-400">—</span>}
          </td>
          <td className="px-4 py-2 text-right">
            <Link href={`/device-calibration-parameters/${row.id}`}>
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            </Link>
          </td>
        </tr>
      ))}
      {canCreate ? (
        <tr className="border-b border-slate-100 last:border-0">
          <td colSpan={6} className="px-4 py-1.5 pl-10">
            <Link
              href={`/device-calibration-parameters/new?deviceTypeId=${group.deviceType.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah parameter untuk {group.deviceType.name}
            </Link>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function DeviceTypeParameterTable({
  groups,
  expandedIds,
  onToggle,
  canCreate,
}: {
  groups: DeviceCalibrationParameterGroupRow[];
  expandedIds: Set<string>;
  onToggle: (deviceTypeId: string) => void;
  canCreate: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Device Type</th>
            <th className="px-4 py-2.5">Kategori</th>
            <th className="px-4 py-2.5" colSpan={4}>
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
                  <td className="px-4 py-3 text-sm text-slate-500" colSpan={4}>
                    {group.count} parameter
                  </td>
                </tr>
              {expanded ? <ChildRows group={group} canCreate={canCreate} /> : null}
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
          ? "Tidak ada device type atau parameter yang cocok dengan pencarian."
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
