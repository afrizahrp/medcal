"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { ApiError, formatIdr, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useTableSort } from "@/hooks/use-table-sort";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { SortableTh } from "@/components/ui/sortable-th";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import {
  useAdditionalItemTypes,
  useCreateAdditionalItemType,
  useUpdateAdditionalItemType,
  type AdditionalItemServiceMode,
  type AdditionalItemTypeRow,
} from "./use-additional-item-types-query";

const URL_KEYS = ["search", "isActive", "sortBy", "sortDir", "page", "pageSize"] as const;

const MODE_LABELS: Record<AdditionalItemServiceMode, string> = {
  ON_SITE: "On-site",
  SEND_TO_LAB: "In-lab",
};

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    if (code === "INVALID_ADDITIONAL_ITEM_TYPE") return "Data jenis biaya tidak valid.";
    return err.data?.message ?? err.message;
  }
  return "Terjadi kesalahan.";
}

interface DraftFields {
  name: string;
  unitLabel: string;
  multiplierLabel: string;
  defaultUnitPrice: string;
  serviceMode: "" | AdditionalItemServiceMode;
}

const EMPTY_DRAFT: DraftFields = {
  name: "",
  unitLabel: "",
  multiplierLabel: "",
  defaultUnitPrice: "",
  serviceMode: "ON_SITE",
};

/**
 * Catalog of commercial quotation add-ons (e.g. ON_SITE accommodation). Only a
 * reusable default source: quotations snapshot what they use, so editing or
 * deactivating a type never changes an existing quotation or PO.
 */
export default function AdditionalItemTypesPageClient() {
  const { capabilities } = useAuthz();
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const committedSearch = params.search ?? "";
  const isActive = params.isActive ?? "";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<DraftFields>({
    name: "",
    unitLabel: "",
    multiplierLabel: "",
    defaultUnitPrice: "",
    serviceMode: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const sort = useTableSort(params, setParams, "code");
  const { sortBy, sortDir } = sort;
  const canManage = Boolean(capabilities?.additionalItemTypeCreate);

  const query = useAdditionalItemTypes({
    search: committedSearch,
    isActive: isActive === "" ? "" : isActive === "true",
    sortBy,
    sortDir,
    page,
    pageSize,
  });
  const createMutation = useCreateAdditionalItemType();
  const updateMutation = useUpdateAdditionalItemType();

  usePaginationSync({
    page,
    totalPages: query.data?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  if (!capabilities?.additionalItemTypeRead) return <AccessDenied />;
  if (isForbidden(query.error)) return <AccessDenied />;

  const result = query.data;
  const rows = result?.data ?? [];
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const listError = query.isError ? "Gagal memuat katalog biaya tambahan." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  const draftPriceInvalid = draft.defaultUnitPrice !== "" && !(Number(draft.defaultUnitPrice) > 0);

  async function submitNew() {
    setError(null);
    if (!draft.name.trim() || !draft.unitLabel.trim() || draftPriceInvalid) {
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: draft.name.trim(),
        unitLabel: draft.unitLabel.trim(),
        multiplierLabel: draft.multiplierLabel.trim() || null,
        defaultUnitPrice: draft.defaultUnitPrice === "" ? null : Number(draft.defaultUnitPrice),
        serviceMode: draft.serviceMode === "" ? null : draft.serviceMode,
      });
      setDraft({ ...EMPTY_DRAFT });
      setShowAdd(false);
    } catch (err) {
      setError(formatError(err));
    }
  }

  function startEdit(row: AdditionalItemTypeRow) {
    setEditingId(row.id);
    setEdit({
      name: row.name,
      unitLabel: row.unitLabel,
      multiplierLabel: row.multiplierLabel ?? "",
      defaultUnitPrice: row.defaultUnitPrice == null ? "" : String(row.defaultUnitPrice),
      serviceMode: row.serviceMode ?? "",
    });
    setError(null);
  }

  const editPriceInvalid = edit.defaultUnitPrice !== "" && !(Number(edit.defaultUnitPrice) > 0);

  async function saveEdit(id: string) {
    setError(null);
    if (!edit.name.trim() || !edit.unitLabel.trim() || editPriceInvalid) return;
    try {
      await updateMutation.mutateAsync({
        id,
        input: {
          name: edit.name.trim(),
          unitLabel: edit.unitLabel.trim(),
          multiplierLabel: edit.multiplierLabel.trim() || null,
          defaultUnitPrice: edit.defaultUnitPrice === "" ? null : Number(edit.defaultUnitPrice),
          serviceMode: edit.serviceMode === "" ? null : edit.serviceMode,
        },
      });
      setEditingId(null);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function toggleActive(row: AdditionalItemTypeRow) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: row.id, input: { isActive: !row.isActive } });
    } catch (err) {
      setError(formatError(err));
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Additional Cost"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Additional Cost" }]}
        />
        {canManage ? (
          <Button type="button" className="shrink-0" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" />
            Jenis Biaya
          </Button>
        ) : null}
      </div>

      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Katalog jenis biaya tambahan (mis. akomodasi ON_SITE) untuk quotation. Katalog hanya
        sumber default — quotation menyimpan salinan nilainya, sehingga perubahan di sini tidak
        mengubah quotation atau PO yang sudah ada.
      </p>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {showAdd && canManage ? (
        <Surface className="mt-4 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Tambah jenis biaya</h2>
          <p className="mt-0.5 text-xs text-slate-500">Kode dibuat otomatis (ADC-001, ADC-002, …).</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nama</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                maxLength={150}
                placeholder="Akomodasi (penginapan)"
                aria-label="Nama"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Satuan</label>
              <Input
                value={draft.unitLabel}
                onChange={(e) => setDraft((d) => ({ ...d, unitLabel: e.target.value }))}
                maxLength={30}
                placeholder="malam"
                aria-label="Satuan"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Pengali ke-2 (opsional)
              </label>
              <Input
                value={draft.multiplierLabel}
                onChange={(e) => setDraft((d) => ({ ...d, multiplierLabel: e.target.value }))}
                maxLength={30}
                placeholder="hari"
                aria-label="Pengali kedua"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Mis. satuan "orang" + pengali "hari" → harga × orang × hari. Kosongkan untuk qty biasa.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Harga default (opsional)
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={draft.defaultUnitPrice}
                onChange={(e) => setDraft((d) => ({ ...d, defaultUnitPrice: e.target.value }))}
                aria-label="Harga default"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mode layanan</label>
              <select
                value={draft.serviceMode}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, serviceMode: e.target.value as DraftFields["serviceMode"] }))
                }
                className={cn(selectClassName, "w-full")}
                aria-label="Mode layanan"
              >
                <option value="">Semua mode</option>
                <option value="ON_SITE">On-site</option>
                <option value="SEND_TO_LAB">In-lab</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={submitNew}
              disabled={
                createMutation.isPending ||
                !draft.name.trim() ||
                !draft.unitLabel.trim() ||
                draftPriceInvalid
              }
            >
              {createMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface className={cn("mt-4 p-4 md:p-6", fetching && "opacity-70")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari kode atau nama…"
            className="sm:max-w-xs"
            aria-label="Cari jenis biaya"
          />
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
          <p className="mt-6 text-sm text-slate-500">Belum ada jenis biaya tambahan.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    <SortableTh field="code" label="Kode" sort={sort} />
                    <SortableTh field="name" label="Nama" sort={sort} />
                    <th className="px-4 py-3">Satuan</th>
                    <th className="px-4 py-3">Pengali ke-2</th>
                    <th className="px-4 py-3 text-right">Harga default</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const editing = editingId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {editing ? (
                            <Input
                              value={edit.name}
                              onChange={(e) => setEdit((d) => ({ ...d, name: e.target.value }))}
                              className="h-8"
                              aria-label="Nama"
                            />
                          ) : (
                            row.name
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {editing ? (
                            <Input
                              value={edit.unitLabel}
                              onChange={(e) => setEdit((d) => ({ ...d, unitLabel: e.target.value }))}
                              className="h-8 max-w-[120px]"
                              aria-label="Satuan"
                            />
                          ) : (
                            row.unitLabel
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {editing ? (
                            <Input
                              value={edit.multiplierLabel}
                              onChange={(e) => setEdit((d) => ({ ...d, multiplierLabel: e.target.value }))}
                              className="h-8 max-w-[120px]"
                              placeholder="—"
                              aria-label="Pengali kedua"
                            />
                          ) : (
                            row.multiplierLabel ?? <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {editing ? (
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={edit.defaultUnitPrice}
                              onChange={(e) =>
                                setEdit((d) => ({ ...d, defaultUnitPrice: e.target.value }))
                              }
                              className="h-8 max-w-[140px] text-right"
                              aria-label="Harga default"
                            />
                          ) : row.defaultUnitPrice == null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="font-medium text-slate-900">
                              {formatIdr(row.defaultUnitPrice)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {editing ? (
                            <select
                              value={edit.serviceMode}
                              onChange={(e) =>
                                setEdit((d) => ({
                                  ...d,
                                  serviceMode: e.target.value as DraftFields["serviceMode"],
                                }))
                              }
                              className={cn(selectClassName, "h-8 w-32")}
                              aria-label="Mode layanan"
                            >
                              <option value="">Semua mode</option>
                              <option value="ON_SITE">On-site</option>
                              <option value="SEND_TO_LAB">In-lab</option>
                            </select>
                          ) : row.serviceMode ? (
                            MODE_LABELS[row.serviceMode]
                          ) : (
                            "Semua"
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
                                    disabled={
                                      updateMutation.isPending ||
                                      !edit.name.trim() ||
                                      !edit.unitLabel.trim() ||
                                      editPriceInvalid
                                    }
                                  >
                                    Simpan
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => setEditingId(null)}
                                    aria-label="Batal edit"
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
                                    aria-label="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
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
              itemLabel="jenis biaya"
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
