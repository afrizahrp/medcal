"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Trash2 } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";

export interface EquipmentRequirementDeviceTypeRef {
  id: string;
  code: string;
  name: string;
}

export interface EquipmentRequirementEquipmentTypeRef {
  id: string;
  code: string;
  name: string;
  category: string | null;
  isActive: boolean;
}

export interface EquipmentRequirementRow {
  id: string;
  deviceTypeId: string;
  equipmentTypeId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deviceType: EquipmentRequirementDeviceTypeRef;
  equipmentType: EquipmentRequirementEquipmentTypeRef;
}

export interface EquipmentRequirementGroupRow {
  deviceType: EquipmentRequirementDeviceTypeRef;
  categoryName: string | null;
  count: number;
  requirements: EquipmentRequirementRow[];
}

export interface EquipmentRequirementGroupedResponse {
  data: EquipmentRequirementGroupRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalRequirements: number;
  totalDeviceTypes: number;
}

export { PageHeader, Surface, selectClassName, PaginationBar };

export function EquipmentRequirementSearchBar({
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
        placeholder="Cari device name atau equipment type…"
        className="pl-9"
        aria-label="Cari device name atau equipment type"
      />
    </div>
  );
}

export interface EquipmentTypeOption {
  id: string;
  code: string;
  name: string;
}

function GroupAddRow({
  group,
  equipmentTypeOptions,
  onAdd,
  pending,
}: {
  group: EquipmentRequirementGroupRow;
  equipmentTypeOptions: EquipmentTypeOption[];
  onAdd: (equipmentTypeId: string, notes: string) => Promise<void> | void;
  pending: boolean;
}) {
  const [equipmentTypeId, setEquipmentTypeId] = useState("");
  const [notes, setNotes] = useState("");

  const alreadyRequired = useMemo(
    () => new Set(group.requirements.map((r) => r.equipmentTypeId)),
    [group.requirements],
  );
  const options = equipmentTypeOptions.filter((opt) => !alreadyRequired.has(opt.id));

  async function submit() {
    if (!equipmentTypeId) return;
    await onAdd(equipmentTypeId, notes.trim());
    setEquipmentTypeId("");
    setNotes("");
  }

  return (
    <tr className="border-b border-slate-100 bg-slate-50/40 last:border-0">
      <td className="px-4 py-2 pl-10" colSpan={3}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={equipmentTypeId}
            onChange={(e) => setEquipmentTypeId(e.target.value)}
            className={`${selectClassName} min-w-[220px]`}
            aria-label={`Tambah equipment type untuk ${group.deviceType.name}`}
          >
            <option value="">Pilih equipment type…</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name} ({opt.code})
              </option>
            ))}
          </select>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan (opsional)"
            className="h-9 max-w-[260px]"
            maxLength={500}
          />
          <Button type="button" size="sm" onClick={submit} disabled={pending || !equipmentTypeId}>
            {pending ? "Menambah…" : "Tambah"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ChildRows({
  group,
  canManage,
  equipmentTypeOptions,
  onAdd,
  onRemove,
  pendingAdd,
  pendingRemoveId,
}: {
  group: EquipmentRequirementGroupRow;
  canManage: boolean;
  equipmentTypeOptions: EquipmentTypeOption[];
  onAdd: (deviceTypeId: string, equipmentTypeId: string, notes: string) => Promise<void> | void;
  onRemove: (requirementId: string) => Promise<void> | void;
  pendingAdd: boolean;
  pendingRemoveId: string | null;
}) {
  return (
    <>
      <tr className="bg-slate-50/60 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <td className="px-4 py-1.5 pl-10">Equipment Type</td>
        <td className="px-4 py-1.5">Catatan</td>
        <td className="px-4 py-1.5" />
      </tr>
      {group.requirements.map((row) => (
        <tr
          key={row.id}
          className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50"
        >
          <td className="px-4 py-2 pl-10 font-medium text-slate-900">
            {row.equipmentType.name}
            <span className="ml-2 font-mono text-[10px] text-slate-400">{row.equipmentType.code}</span>
          </td>
          <td className="px-4 py-2 text-slate-600">
            {row.notes ? row.notes : <span className="text-slate-400">—</span>}
          </td>
          <td className="px-4 py-2 text-right">
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => onRemove(row.id)}
                disabled={pendingRemoveId === row.id}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {pendingRemoveId === row.id ? "Menghapus…" : "Hapus"}
              </Button>
            ) : null}
          </td>
        </tr>
      ))}
      {canManage ? (
        <GroupAddRow
          group={group}
          equipmentTypeOptions={equipmentTypeOptions}
          onAdd={(equipmentTypeId, notes) => onAdd(group.deviceType.id, equipmentTypeId, notes)}
          pending={pendingAdd}
        />
      ) : null}
    </>
  );
}

export function DeviceTypeRequirementTable({
  groups,
  expandedIds,
  onToggle,
  canManage,
  equipmentTypeOptions,
  onAdd,
  onRemove,
  pendingAdd,
  pendingRemoveId,
}: {
  groups: EquipmentRequirementGroupRow[];
  expandedIds: Set<string>;
  onToggle: (deviceTypeId: string) => void;
  canManage: boolean;
  equipmentTypeOptions: EquipmentTypeOption[];
  onAdd: (deviceTypeId: string, equipmentTypeId: string, notes: string) => Promise<void> | void;
  onRemove: (requirementId: string) => Promise<void> | void;
  pendingAdd: boolean;
  pendingRemoveId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Device Name</th>
            <th className="px-4 py-2.5">Kategori</th>
            <th className="px-4 py-2.5">Jumlah</th>
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
                <td className="px-4 py-3 text-sm text-slate-500">{group.count} equipment</td>
              </tr>
              {expanded ? (
                <ChildRows
                  group={group}
                  canManage={canManage}
                  equipmentTypeOptions={equipmentTypeOptions}
                  onAdd={onAdd}
                  onRemove={onRemove}
                  pendingAdd={pendingAdd}
                  pendingRemoveId={pendingRemoveId}
                />
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export function EquipmentRequirementEmptyState({
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
          ? "Tidak ada device name atau equipment type yang cocok dengan pencarian."
          : "Belum ada kebutuhan equipment. Tambahkan lewat tombol di atas."}
      </p>
      {hasSearch && onClearSearch ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onClearSearch}>
          Reset pencarian
        </Button>
      ) : null}
    </div>
  );
}

export function formatEquipmentRequirementApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_EQUIPMENT_REQUIREMENT") {
      return "Equipment Type ini sudah menjadi kebutuhan untuk Device Name tersebut.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") return "Device Name tidak ditemukan.";
    if (code === "EQUIPMENT_TYPE_NOT_FOUND") return "Equipment Type tidak ditemukan.";
    if (code === "EQUIPMENT_REQUIREMENT_NOT_FOUND") return "Kebutuhan equipment tidak ditemukan.";
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan kebutuhan equipment. Silakan coba lagi.";
}
