"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { ApiError, formatIdr, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { fmtDateOnly, todayDateOnly } from "@/lib/date-utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginationSync } from "@/hooks/use-pagination-sync";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { useTableSort } from "@/hooks/use-table-sort";
import { SortableTh } from "@/components/ui/sortable-th";
import { ViewAdjustedBanner } from "@/components/ui/view-adjusted-banner";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../components/access-denied";
import { PageHeader } from "../../../components/management/page-header";
import { PaginationBar, Surface, selectClassName } from "../leads/leads-ui";
import { DeviceTypeItemSelect } from "../calibration-requests/calibration-requests-ui";
import { useDeviceTypes } from "../device-types/use-device-types-query";
import {
  useCreatePriceListItem,
  useDeletePriceListItem,
  usePriceListItems,
  useUpdatePriceListItem,
  type PriceListItemRow,
} from "./use-price-list-items-query";

const URL_KEYS = [
  "search",
  "deviceTypeId",
  "isActive",
  "sortBy",
  "sortDir",
  "page",
  "pageSize",
] as const;

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    if (code === "PRICE_LIST_OVERLAP")
      return "Sudah ada tarif aktif yang periodenya bertumpang tindih untuk device name ini.";
    if (code === "DUPLICATE_PRICE_LIST_ITEM")
      return "Sudah ada tarif dengan tanggal berlaku yang sama untuk device name ini.";
    if (code === "DEVICE_TYPE_NOT_FOUND") return "Device Name tidak ditemukan.";
    if (code === "INVALID_PRICE") return "Harga harus lebih besar dari 0.";
    if (code === "INVALID_EFFECTIVE_RANGE")
      return "Tanggal berakhir tidak boleh sebelum tanggal berlaku.";
    return err.data?.message ?? err.message;
  }
  return "Terjadi kesalahan.";
}

interface DraftFields {
  deviceTypeId: string;
  unitPrice: string;
  effectiveFrom: string;
  effectiveUntil: string;
  notes: string;
}

const EMPTY_DRAFT: DraftFields = {
  deviceTypeId: "",
  unitPrice: "",
  effectiveFrom: todayDateOnly(),
  effectiveUntil: "",
  notes: "",
};

export default function PriceListItemsPageClient() {
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
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editUntil, setEditUntil] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const sort = useTableSort(params, setParams, "effectiveFrom");
  const { sortBy, sortDir } = sort;
  const canManage = Boolean(capabilities?.priceListItemCreate);

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

  const query = usePriceListItems({
    search: committedSearch,
    deviceTypeId,
    isActive: isActive === "" ? "" : isActive === "true",
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  const createMutation = useCreatePriceListItem();
  const updateMutation = useUpdatePriceListItem();
  const deleteMutation = useDeletePriceListItem();

  const { didClamp, dismiss } = usePaginationSync({
    page,
    totalPages: query.data?.totalPages,
    onClamp: (lastPage) => setParams({ page: lastPage <= 1 ? undefined : String(lastPage) }),
  });

  if (!capabilities?.priceListItemRead) return <AccessDenied />;

  const result = query.data;
  const rows = result?.data ?? [];
  const loading = query.isLoading;
  const fetching = query.isFetching && !loading;
  const forbidden = isForbidden(query.error);
  const listError = query.isError && !forbidden ? "Gagal memuat Price List." : null;
  const totalPages = result ? Math.max(1, result.totalPages) : 1;

  if (forbidden) return <AccessDenied />;

  const draftRangeInvalid =
    draft.effectiveFrom !== "" &&
    draft.effectiveUntil !== "" &&
    draft.effectiveUntil < draft.effectiveFrom;

  async function submitNew() {
    setError(null);
    const price = Number(draft.unitPrice);
    if (!draft.deviceTypeId || !(price > 0) || !draft.effectiveFrom) return;
    if (draftRangeInvalid) {
      setError("Tanggal berakhir tidak boleh sebelum tanggal berlaku.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        deviceTypeId: draft.deviceTypeId,
        unitPrice: price,
        effectiveFrom: draft.effectiveFrom,
        effectiveUntil: draft.effectiveUntil || null,
        notes: draft.notes.trim() || null,
      });
      setDraft({ ...EMPTY_DRAFT });
      setShowAdd(false);
    } catch (err) {
      setError(formatError(err));
    }
  }

  function startEdit(row: PriceListItemRow) {
    setEditingId(row.id);
    setEditPrice(String(row.unitPrice));
    setEditFrom(row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : "");
    setEditUntil(row.effectiveUntil ? row.effectiveUntil.slice(0, 10) : "");
    setError(null);
  }

  // Mirror the server rule (INVALID_EFFECTIVE_RANGE): a set end date must not
  // predate the start date. yyyy-MM-dd strings compare lexicographically.
  const editRangeInvalid = editFrom !== "" && editUntil !== "" && editUntil < editFrom;

  async function saveEdit(id: string) {
    setError(null);
    const price = Number(editPrice);
    if (!(price > 0) || !editFrom) return;
    if (editRangeInvalid) {
      setError("Tanggal berakhir tidak boleh sebelum tanggal berlaku.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id,
        input: {
          unitPrice: price,
          effectiveFrom: editFrom,
          effectiveUntil: editUntil || null,
        },
      });
      setEditingId(null);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function toggleActive(row: PriceListItemRow) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: row.id, input: { isActive: !row.isActive } });
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function remove(id: string) {
    setError(null);
    setPendingDeleteId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Price List"
          crumbs={[{ href: "/", label: "Dashboard" }, { label: "Price List" }]}
        />
        {canManage ? (
          <Button type="button" className="shrink-0" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" />
            Tarif
          </Button>
        ) : null}
      </div>

    
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {showAdd && canManage ? (
        <Surface className="mt-4 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Tambah tarif baru</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Device Name</label>
              <DeviceTypeItemSelect
                value={draft.deviceTypeId}
                onChange={(id) => setDraft((d) => ({ ...d, deviceTypeId: id }))}
                deviceTypes={deviceTypes}
                loading={typesQuery.isLoading}
                placeholder="Pilih Device Name…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Unit Price (IDR, tanpa pajak)
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={draft.unitPrice}
                onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))}
                placeholder="100000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Berlaku dari</label>
              <DateField
                value={draft.effectiveFrom}
                onChange={(next) => setDraft((d) => ({ ...d, effectiveFrom: next }))}
                aria-label="Berlaku dari"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Berlaku sampai (opsional)
              </label>
              <DateField
                value={draft.effectiveUntil}
                onChange={(next) => setDraft((d) => ({ ...d, effectiveUntil: next }))}
                placeholder="dd/mm/yyyy (opsional)"
                aria-label="Berlaku sampai"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Catatan (opsional)
              </label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                maxLength={1000}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={submitNew}
              disabled={
                createMutation.isPending ||
                !draft.deviceTypeId ||
                !(Number(draft.unitPrice) > 0) ||
                !draft.effectiveFrom ||
                draftRangeInvalid
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
            placeholder="Cari device name…"
            className="sm:max-w-xs"
            aria-label="Cari tarif"
          />
          <div className="w-full sm:w-56">
            <DeviceTypeItemSelect
              value={deviceTypeId}
              onChange={(id) => setParams({ deviceTypeId: id || undefined, page: undefined })}
              deviceTypes={deviceTypes}
              loading={typesQuery.isLoading}
              ariaLabel="Filter device name"
              placeholder="Semua Device Name"
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
          <p className="mt-6 text-sm text-slate-500">Belum ada tarif.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    <SortableTh field="deviceName" label="Device Name" sort={sort} />
                    <SortableTh
                      field="unitPrice"
                      label="Unit Price"
                      sort={sort}
                      align="right"
                      className="text-right"
                    />
                    <SortableTh field="effectiveFrom" label="Berlaku" sort={sort} />
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
                          <span className="block font-medium text-slate-900">
                            {row.deviceType.name}
                          </span>
                          <span className="block font-mono text-xs text-slate-400">
                            {row.deviceType.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editing ? (
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="h-8 max-w-[140px] text-right"
                            />
                          ) : (
                            <span className="font-medium text-slate-900">
                              {formatIdr(row.unitPrice)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {editing ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <DateField
                                className="w-[150px]"
                                value={editFrom}
                                onChange={setEditFrom}
                                aria-label="Berlaku dari"
                              />
                              <span className="text-slate-400">—</span>
                              <DateField
                                className="w-[150px]"
                                value={editUntil}
                                onChange={setEditUntil}
                                placeholder="dd/mm/yyyy (opsional)"
                                aria-label="Berlaku sampai"
                              />
                              {editRangeInvalid ? (
                                <span className="w-full text-xs text-red-600">
                                  Tanggal berakhir tidak boleh sebelum tanggal berlaku.
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              {fmtDateOnly(row.effectiveFrom)} — {fmtDateOnly(row.effectiveUntil)}
                            </>
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
                                      !(Number(editPrice) > 0) ||
                                      !editFrom ||
                                      editRangeInvalid
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
              itemLabel="tarif"
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
