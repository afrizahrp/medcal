"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { DeviceTypeItemSelect } from "../calibration-requests/calibration-requests-ui";
import { useDeviceTypes } from "../device-types/use-device-types-query";
import {
  useCreateDeviceTypeAlias,
  useDeleteDeviceTypeAlias,
  useDeviceTypeAliases,
  useUpdateDeviceTypeAlias,
  type DeviceTypeAliasRow,
} from "./use-device-type-aliases-query";

const URL_KEYS = ["search", "deviceTypeId", "isActive", "page", "pageSize"] as const;

function formatAliasError(err: unknown): string {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    if (code === "DUPLICATE_ALIAS") return err.data?.message ?? "Alias sudah digunakan.";
    if (code === "DEVICE_TYPE_NOT_FOUND") return "Device Type tidak ditemukan.";
    if (code === "INVALID_ALIAS") return "Alias tidak valid.";
    return err.data?.message ?? err.message;
  }
  return "Terjadi kesalahan.";
}

export default function DeviceTypeAliasesPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const committedSearch = params.search ?? "";
  const deviceTypeId = params.deviceTypeId ?? "";
  const isActive = params.isActive ?? "";
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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

  const query = useDeviceTypeAliases({
    search: committedSearch,
    deviceTypeId,
    isActive: isActive === "" ? "" : isActive === "true",
    sortBy: "alias",
    sortDir: "asc",
    page,
    pageSize,
  });

  const createMutation = useCreateDeviceTypeAlias();
  const updateMutation = useUpdateDeviceTypeAlias();
  const deleteMutation = useDeleteDeviceTypeAlias();

  if (!capabilities?.deviceTypeAliasRead) {
    return <AccessDenied />;
  }

  const result = query.data;
  const rows = result?.data ?? [];
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const listError = query.isError && !forbidden ? "Gagal memuat daftar Type Alias." : null;
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
    try {
      await updateMutation.mutateAsync({ id: row.id, input: { isActive: !row.isActive } });
    } catch (err) {
      setError(formatAliasError(err));
    }
  }

  async function remove(id: string) {
    setError(null);
    setPendingDeleteId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      setError(formatAliasError(err));
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Device Type Aliases"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Type Aliases" }]}
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
        Type resmi (mis. &quot;Sphygmomanometer&quot;). Digunakan untuk pencocokan otomatis saat
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
                placeholder="Pilih Device Type…"
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari alias atau device type…"
            className="sm:max-w-xs"
            aria-label="Cari alias"
          />
          <div className="w-full sm:w-56">
            <DeviceTypeItemSelect
              value={deviceTypeId}
              onChange={(id) => setParams({ deviceTypeId: id || undefined, page: undefined })}
              deviceTypes={deviceTypes}
              loading={typesQuery.isLoading}
              ariaLabel="Filter device type"
              placeholder="Semua Device Type"
              allowClear
            />
          </div>
          <select
            value={isActive}
            onChange={(e) => setParams({ isActive: e.target.value || undefined, page: undefined })}
            className={cn(selectClassName, "w-full sm:w-40")}
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>

        {listError ? <p className="mt-4 text-sm text-red-600">{listError}</p> : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Belum ada alias.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Alias</th>
                    <th className="px-4 py-3">Device Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const editing = editingId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          {editing ? (
                            <Input
                              value={editAlias}
                              onChange={(e) => setEditAlias(e.target.value)}
                              className="h-8 max-w-[240px]"
                              maxLength={150}
                            />
                          ) : (
                            <span className="font-medium text-slate-900">{row.alias}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editing ? (
                            <div className="min-w-[200px]">
                              <DeviceTypeItemSelect
                                value={editDeviceTypeId}
                                onChange={setEditDeviceTypeId}
                                deviceTypes={deviceTypes}
                                loading={typesQuery.isLoading}
                                placeholder="Pilih Device Type…"
                              />
                            </div>
                          ) : (
                            <Badge variant="secondary" className="font-medium text-slate-600">
                              {row.deviceType.name}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
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
                        <td className="px-4 py-3">
                          {canManage ? (
                            <div className="flex items-center justify-end gap-1">
                              {editing ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => saveEdit(row.id)}
                                    disabled={updateMutation.isPending || !editAlias.trim()}
                                  >
                                    Simpan
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => setEditingId(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => toggleActive(row)}
                                    disabled={updateMutation.isPending}
                                  >
                                    {row.isActive ? "Nonaktifkan" : "Aktifkan"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => startEdit(row)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                                    onClick={() => remove(row.id)}
                                    disabled={pendingDeleteId === row.id}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              className="mt-4"
              page={page}
              totalPages={totalPages}
              total={result?.total ?? 0}
              pageSize={pageSize}
              itemLabel="alias"
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
