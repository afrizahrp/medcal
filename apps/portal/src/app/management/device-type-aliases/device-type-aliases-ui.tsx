"use client";

import { ChevronDown, ChevronRight, Pencil, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { DeviceTypeItemSelect } from "../calibration-requests/calibration-requests-ui";
import type {
  DeviceTypeAliasGroupRow,
  DeviceTypeAliasRow,
} from "./use-device-type-aliases-query";

export { PageHeader, Surface, selectClassName, PaginationBar };

export interface DeviceTypeOption {
  id: string;
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Collapsible browse UI — Device Type is the primary navigation axis.
// Same expand/collapse TABLE pattern as the Calibration Parameter page
// (device-calibration-parameters-ui.tsx): parent rows = Device Type, child
// rows = its aliases. One screen, a single search box.
// ---------------------------------------------------------------------------

export function DeviceTypeAliasSearchBar({
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
        placeholder="Cari device name atau alias…"
        className="pl-9"
        aria-label="Cari device name atau alias"
      />
    </div>
  );
}

const CHILD_HEADER = ["Alias", "Normalized", "Status", ""] as const;

export interface DeviceTypeAliasChildHandlers {
  canManage: boolean;
  deviceTypes: DeviceTypeOption[];
  deviceTypesLoading: boolean;
  editingId: string | null;
  editAlias: string;
  editDeviceTypeId: string;
  savingEdit: boolean;
  togglingId: string | null;
  onEditAliasChange: (value: string) => void;
  onEditDeviceTypeChange: (value: string) => void;
  onStartEdit: (row: DeviceTypeAliasRow) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onToggleActive: (row: DeviceTypeAliasRow) => void;
}

function ChildRows({
  group,
  handlers,
}: {
  group: DeviceTypeAliasGroupRow;
  handlers: DeviceTypeAliasChildHandlers;
}) {
  const h = handlers;
  return (
    <>
      <tr className="bg-slate-50/60 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {CHILD_HEADER.map((label, i) => (
          <td key={label || i} className={cn("px-4 py-1.5", i === 0 && "pl-10")}>
            {label}
          </td>
        ))}
      </tr>
      {group.aliases.map((row) => {
        const editing = h.editingId === row.id;
        if (editing) {
          return (
            <tr key={row.id} className="border-b border-slate-100 text-sm last:border-0">
              <td className="px-4 py-2 pl-10" colSpan={4}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={h.editAlias}
                    onChange={(e) => h.onEditAliasChange(e.target.value)}
                    className="h-8 max-w-[240px]"
                    maxLength={150}
                    aria-label="Alias"
                  />
                  <div className="min-w-[200px]">
                    <DeviceTypeItemSelect
                      value={h.editDeviceTypeId}
                      onChange={h.onEditDeviceTypeChange}
                      deviceTypes={h.deviceTypes}
                      loading={h.deviceTypesLoading}
                      placeholder="Pilih Device Name…"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => h.onSaveEdit(row.id)}
                    disabled={h.savingEdit || !h.editAlias.trim()}
                  >
                    Simpan
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={h.onCancelEdit}
                    aria-label="Batal"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          );
        }
        return (
          <tr
            key={row.id}
            className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50"
          >
            <td className="px-4 py-2 pl-10 font-medium text-slate-900">{row.alias}</td>
            <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{row.normalizedAlias}</td>
            <td className="px-4 py-2">
              <Badge
                className={cn(
                  "text-[11px]",
                  row.isActive
                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                    : "bg-slate-400 text-white hover:bg-slate-400",
                )}
              >
                {row.isActive ? "Aktif" : "Nonaktif"}
              </Badge>
            </td>
            <td className="px-4 py-2 text-right">
              {h.canManage ? (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => h.onToggleActive(row)}
                    disabled={h.togglingId === row.id}
                  >
                    {row.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => h.onStartEdit(row)}
                    aria-label="Edit alias"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function DeviceTypeAliasGroupTable({
  groups,
  expandedIds,
  onToggle,
  handlers,
}: {
  groups: DeviceTypeAliasGroupRow[];
  expandedIds: Set<string>;
  onToggle: (deviceTypeId: string) => void;
  handlers: DeviceTypeAliasChildHandlers;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Device Name</th>
            <th className="px-4 py-2.5">Kategori</th>
            <th className="px-4 py-2.5" colSpan={2}>
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
                <td className="px-4 py-3 text-sm text-slate-500" colSpan={2}>
                  {group.count} alias
                </td>
              </tr>
              {expanded ? <ChildRows group={group} handlers={handlers} /> : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export function DeviceTypeAliasEmptyState({
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
          ? "Tidak ada device name atau alias yang cocok dengan pencarian."
          : "Belum ada alias."}
      </p>
      {hasSearch && onClearSearch ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearSearch}>
          Reset pencarian
        </Button>
      ) : null}
    </div>
  );
}
