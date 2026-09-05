"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { AccessDenied } from "../../../components/access-denied";
import {
  PageHeader,
  PaginationBar,
  Surface,
  DeviceTypeAliasSearchBar,
  DeviceTypeAliasGroupTable,
  DeviceTypeAliasEmptyState,
  type DeviceTypeAliasChildHandlers,
} from "./device-type-aliases-ui";
import { DeviceTypeItemSelect } from "../calibration-requests/calibration-requests-ui";
import { useDeviceTypes } from "../device-types/use-device-types-query";
import {
  useCreateDeviceTypeAlias,
  useDeviceTypeAliasGroups,
  useUpdateDeviceTypeAlias,
  type DeviceTypeAliasRow,
} from "./use-device-type-aliases-query";

const URL_KEYS = ["search", "expanded", "page", "pageSize"] as const;

function formatAliasError(err: unknown): string {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    if (code === "DUPLICATE_ALIAS") return err.data?.message ?? "Alias sudah digunakan.";
    if (code === "DEVICE_TYPE_NOT_FOUND") return "Device Name tidak ditemukan.";
    if (code === "INVALID_ALIAS") return "Alias tidak valid.";
    return err.data?.message ?? err.message;
  }
  return "Terjadi kesalahan.";
}

export default function DeviceTypeAliasesPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const committedSearch = params.search ?? "";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const [showAdd, setShowAdd] = useState(false);
  const [newDeviceTypeId, setNewDeviceTypeId] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState("");
  const [editDeviceTypeId, setEditDeviceTypeId] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const canManage = Boolean(capabilities?.deviceTypeAliasCreate);

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const deviceTypes = typesQuery.data?.data ?? [];

  const query = useDeviceTypeAliasGroups({ search: committedSearch, page, pageSize });

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

  // When searching, auto-expand every Device Type on the filtered page.
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

  const createMutation = useCreateDeviceTypeAlias();
  const updateMutation = useUpdateDeviceTypeAlias();

  if (!capabilities?.deviceTypeAliasRead) {
    return <AccessDenied />;
  }

  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const listError =
    query.isError && !forbidden ? "Gagal memuat daftar Type Alias." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) return <AccessDenied />;

  async function submitNew() {
    setError(null);
    if (!newDeviceTypeId || !newAlias.trim()) return;
    try {
      await createMutation.mutateAsync({ deviceTypeId: newDeviceTypeId, alias: newAlias.trim() });
      setNewAlias("");
    } catch (err) {
      setError(formatAliasError(err));
    }
  }

  function startEdit(row: DeviceTypeAliasRow) {
    setEditingId(row.id);
    setEditAlias(row.alias);
    setEditDeviceTypeId(row.deviceTypeId);
    setError(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id,
        input: { alias: editAlias.trim(), deviceTypeId: editDeviceTypeId },
      });
      setEditingId(null);
    } catch (err) {
      setError(formatAliasError(err));
    }
  }

  async function toggleActive(row: DeviceTypeAliasRow) {
    setError(null);
    setTogglingId(row.id);
    try {
      await updateMutation.mutateAsync({ id: row.id, input: { isActive: !row.isActive } });
    } catch (err) {
      setError(formatAliasError(err));
    } finally {
      setTogglingId(null);
    }
  }

  const childHandlers: DeviceTypeAliasChildHandlers = {
    canManage,
    deviceTypes,
    deviceTypesLoading: typesQuery.isLoading,
    editingId,
    editAlias,
    editDeviceTypeId,
    savingEdit: updateMutation.isPending,
    togglingId,
    onEditAliasChange: setEditAlias,
    onEditDeviceTypeChange: setEditDeviceTypeId,
    onStartEdit: startEdit,
    onCancelEdit: () => setEditingId(null),
    onSaveEdit: saveEdit,
    onToggleActive: toggleActive,
  };

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Device Name Aliases"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Name Aliases" }]}
        />
        {canManage ? (
          <Button type="button" className="shrink-0" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" />
            Tambah alias
          </Button>
        ) : null}
      </div>

      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Alias adalah istilah pelanggan (mis. &quot;Tensimeter&quot;) yang dipetakan ke satu Device
        Name resmi (mis. &quot;Sphygmomanometer&quot;). Digunakan untuk pencocokan otomatis saat
        import Excel Requisition.
      </p>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {showAdd && canManage ? (
        <Surface className="mt-4 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Tambah alias baru</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-[260px]">
              <DeviceTypeItemSelect
                value={newDeviceTypeId}
                onChange={setNewDeviceTypeId}
                deviceTypes={deviceTypes}
                loading={typesQuery.isLoading}
                placeholder="Pilih Device Name…"
              />
            </div>
            <Input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Alias pelanggan, mis. Tensimeter"
              className="h-9 max-w-[280px]"
              maxLength={150}
            />
            <Button
              type="button"
              onClick={submitNew}
              disabled={createMutation.isPending || !newDeviceTypeId || !newAlias.trim()}
            >
              {createMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface className={cn("mt-4 p-4 md:p-6", fetching && "opacity-70")}>
        {didClamp ? <ViewAdjustedBanner className="mb-4" onDismiss={dismiss} /> : null}

        <DeviceTypeAliasSearchBar value={searchInput} onChange={setSearchInput} />

        {result ? (
          <p className="mt-3 text-xs text-slate-500">
            {result.totalDeviceTypes} Device Name dengan {result.totalAliases} alias
          </p>
        ) : null}

        {listError ? <p className="mt-4 text-sm text-red-600">{listError}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : didClamp && groups.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Menyesuaikan halaman…</p>
        ) : groups.length === 0 ? (
          <DeviceTypeAliasEmptyState
            hasSearch={isSearching}
            onClearSearch={() => {
              setSearchInput("");
              setParams({ search: undefined, page: undefined });
            }}
          />
        ) : (
          <>
            <div className="mt-4">
              <DeviceTypeAliasGroupTable
                groups={groups}
                expandedIds={expandedIds}
                onToggle={toggle}
                handlers={childHandlers}
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
