"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { AccessDenied } from "../../../components/access-denied";
import { useDeviceTypes } from "../device-types/use-device-types-query";
import {
  PageHeader,
  Surface,
  PaginationBar,
  EquipmentRequirementSearchBar,
  DeviceTypeRequirementTable,
  EquipmentRequirementEmptyState,
  formatEquipmentRequirementApiError,
  selectClassName,
  type EquipmentTypeOption,
} from "./equipment-requirements-ui";
import {
  useActiveEquipmentTypeOptions,
  useCreateEquipmentRequirement,
  useDeleteEquipmentRequirement,
  useEquipmentRequirementGroups,
  useReorderEquipmentRequirements,
} from "./use-equipment-requirements-query";

const URL_KEYS = ["search", "expanded", "page", "pageSize"] as const;

export default function EquipmentRequirementsPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const committedSearch = params.search ?? "";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newDeviceTypeId, setNewDeviceTypeId] = useState("");
  const [newEquipmentTypeId, setNewEquipmentTypeId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const canManage = Boolean(capabilities?.equipmentRequirementCreate);

  const query = useEquipmentRequirementGroups({ search: committedSearch, page, pageSize });
  const equipmentTypeOptionsQuery = useActiveEquipmentTypeOptions(
    Boolean(capabilities?.equipmentRequirementRead),
  );
  const deviceTypesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const createMutation = useCreateEquipmentRequirement();
  const deleteMutation = useDeleteEquipmentRequirement();
  const reorderMutation = useReorderEquipmentRequirements();

  const canReorder = Boolean(capabilities?.equipmentRequirementUpdate);
  const reorderError = reorderMutation.isError
    ? "Gagal menyimpan urutan baru — urutan dikembalikan seperti semula. Coba lagi."
    : null;

  function reorderRequirements(deviceTypeId: string, requirementIds: string[]) {
    reorderMutation.mutate({ deviceTypeId, requirementIds });
  }

  const equipmentTypeOptions: EquipmentTypeOption[] = useMemo(
    () =>
      (equipmentTypeOptionsQuery.data?.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
      })),
    [equipmentTypeOptionsQuery.data],
  );

  const manuallyExpanded = useMemo(
    () => new Set((params.expanded ?? "").split(",").filter(Boolean)),
    [params.expanded],
  );

  const result = query.data;
  const groups = result?.data ?? [];
  const isSearching = committedSearch.trim().length > 0;

  const { didClamp, dismiss } = usePaginationSync({
    page,
    totalPages: result?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  const expandedIds = useMemo(() => {
    if (isSearching) return new Set(groups.map((g) => g.deviceType.id));
    return manuallyExpanded;
  }, [isSearching, groups, manuallyExpanded]);

  function toggle(deviceTypeId: string) {
    const next = new Set(manuallyExpanded);
    if (next.has(deviceTypeId)) next.delete(deviceTypeId);
    else next.add(deviceTypeId);
    setParams({ expanded: next.size ? [...next].join(",") : undefined });
  }

  async function addRequirement(deviceTypeId: string, equipmentTypeId: string, notes: string) {
    setError(null);
    try {
      await createMutation.mutateAsync({
        deviceTypeId,
        equipmentTypeId,
        ...(notes ? { notes } : {}),
      });
    } catch (err) {
      setError(formatEquipmentRequirementApiError(err));
    }
  }

  async function submitNewPanel() {
    if (!newDeviceTypeId || !newEquipmentTypeId) return;
    await addRequirement(newDeviceTypeId, newEquipmentTypeId, newNotes.trim());
    if (!createMutation.isError) {
      setNewEquipmentTypeId("");
      setNewNotes("");
      // keep the device type selected + expand it so the new row is visible
      const next = new Set(manuallyExpanded);
      next.add(newDeviceTypeId);
      setParams({ expanded: [...next].join(",") });
    }
  }

  async function removeRequirement(requirementId: string) {
    setError(null);
    setPendingRemoveId(requirementId);
    try {
      await deleteMutation.mutateAsync(requirementId);
    } catch (err) {
      setError(formatEquipmentRequirementApiError(err));
    } finally {
      setPendingRemoveId(null);
    }
  }

  if (!capabilities?.equipmentRequirementRead) {
    return <AccessDenied />;
  }

  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const listError =
    query.isError && !forbidden ? "Gagal memuat daftar Equipment Requirement." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Equipment Requirements"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Equipment Requirements" }]}
        />

        {canManage ? (
          <Button
            type="button"
            className="shrink-0"
            onClick={() => setShowAddPanel((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            Tambah kebutuhan
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {reorderError ? <p className="mt-4 text-sm text-red-600">{reorderError}</p> : null}

      {showAddPanel && canManage ? (
        <Surface className="mt-4 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Tambah kebutuhan equipment untuk Device Name
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Pilih Device Name dan Equipment Type yang normalnya diperlukan untuk kalibrasinya.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={newDeviceTypeId}
              onChange={(e) => setNewDeviceTypeId(e.target.value)}
              className={`${selectClassName} min-w-[220px]`}
              aria-label="Device Name"
            >
              <option value="">Pilih device name…</option>
              {(deviceTypesQuery.data?.data ?? []).map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.name} ({dt.code})
                </option>
              ))}
            </select>
            <select
              value={newEquipmentTypeId}
              onChange={(e) => setNewEquipmentTypeId(e.target.value)}
              className={`${selectClassName} min-w-[220px]`}
              aria-label="Equipment Type"
            >
              <option value="">Pilih equipment type…</option>
              {equipmentTypeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name} ({opt.code})
                </option>
              ))}
            </select>
            <Input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Catatan (opsional)"
              className="h-9 max-w-[260px]"
              maxLength={500}
            />
            <Button
              type="button"
              onClick={submitNewPanel}
              disabled={createMutation.isPending || !newDeviceTypeId || !newEquipmentTypeId}
            >
              {createMutation.isPending ? "Menambah…" : "Tambah"}
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface className={cn("mt-4 p-4 md:p-6", fetching && "opacity-70")}>
        {didClamp ? <ViewAdjustedBanner className="mb-3" onDismiss={dismiss} /> : null}

        <EquipmentRequirementSearchBar value={searchInput} onChange={setSearchInput} />

        {result ? (
          <p className="mt-3 text-xs text-slate-500">
            {result.totalDeviceTypes} device name dengan {result.totalRequirements} kebutuhan equipment
          </p>
        ) : null}

        {listError ? <p className="mt-4 text-sm text-red-600">{listError}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && groups.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : groups.length === 0 ? (
          <EquipmentRequirementEmptyState
            hasSearch={isSearching}
            onClearSearch={() => {
              setSearchInput("");
              setParams({ search: undefined, page: undefined });
            }}
          />
        ) : (
          <>
            <div className="mt-4">
              <DeviceTypeRequirementTable
                groups={groups}
                expandedIds={expandedIds}
                onToggle={toggle}
                canManage={canManage}
                canReorder={canReorder}
                equipmentTypeOptions={equipmentTypeOptions}
                onAdd={addRequirement}
                onRemove={removeRequirement}
                onReorder={reorderRequirements}
                pendingAdd={createMutation.isPending}
                pendingRemoveId={pendingRemoveId}
              />
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result?.total ?? 0}
              pageSize={pageSize}
              itemLabel="device name"
              onPageChange={(next) => setParams({ page: next <= 1 ? undefined : String(next) })}
              onPageSizeChange={(next) =>
                setParams({ pageSize: next === 10 ? undefined : String(next), page: undefined })
              }
            />
          </>
        )}
      </Surface>
    </div>
  );
}
