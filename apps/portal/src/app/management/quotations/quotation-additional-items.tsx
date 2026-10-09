"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { ApiError, additionalLineTotal, describeAdditionalCalculation } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useAdditionalItemTypes,
  useCreateAdditionalItemType,
  type AdditionalItemServiceMode,
  type AdditionalItemTypeRow,
} from "../additional-item-types/use-additional-item-types-query";
import {
  formatIdr,
  moneyNumber,
  selectClassName,
  type QuotationFormAdditionalItem,
} from "./quotations-ui";

/** A new, unsaved row seeded from the catalog entry (code / unit are snapshotted on the server). */
export function newAdditionalItemRow(type: AdditionalItemTypeRow): QuotationFormAdditionalItem {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    additionalItemTypeId: type.id,
    code: type.code,
    unitLabel: type.unitLabel,
    description: type.name,
    qty: "1",
    // A catalog type with a second dimension (e.g. hari) starts at 1 of it.
    multiplier: type.multiplierLabel ? "1" : "",
    multiplierLabel: type.multiplierLabel ?? null,
    unitPrice: type.defaultUnitPrice == null ? "" : String(type.defaultUnitPrice),
    notes: "",
  };
}

/**
 * "Additional / Biaya Tambahan" — commercial, non-calibration quotation lines
 * (first use: ON_SITE accommodation). The user decides per quotation whether to
 * add any; there is no customer-eligibility step. Choosing a catalog entry only
 * pre-fills defaults — the saved line is the quotation's own snapshot.
 */
export function QuotationAdditionalItemsSection({
  value,
  onChange,
  serviceMode,
  disabled = false,
}: {
  value: QuotationFormAdditionalItem[];
  onChange: (next: QuotationFormAdditionalItem[]) => void;
  /** The requisition's service mode — the picker offers only applicable types. */
  serviceMode?: AdditionalItemServiceMode;
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(value.length > 0);
  const [pendingTypeId, setPendingTypeId] = useState("");
  const { capabilities } = useAuthz();
  const canCreateType = Boolean(capabilities?.priceListItemCreate);
  const createType = useCreateAdditionalItemType();
  const [showNewType, setShowNewType] = useState(false);
  const [newType, setNewType] = useState({
    name: "",
    unitLabel: "",
    multiplierLabel: "",
    defaultUnitPrice: "",
  });
  const [newTypeError, setNewTypeError] = useState<string | null>(null);

  // Rows can arrive after mount (edit / revise load): keep the switch consistent with the data.
  useEffect(() => {
    if (value.length > 0) setEnabled(true);
  }, [value.length]);

  const typesQuery = useAdditionalItemTypes(
    {
      search: "",
      isActive: true,
      serviceMode,
      sortBy: "code",
      sortDir: "asc",
      page: 1,
      pageSize: 100,
    },
    enabled,
  );
  const types = typesQuery.data?.data ?? [];

  function toggle(next: boolean) {
    if (!next && value.length > 0) {
      const ok = window.confirm(
        "Matikan Biaya Tambahan? Semua baris biaya tambahan pada quotation ini akan dihapus.",
      );
      if (!ok) return;
      onChange([]);
    }
    setEnabled(next);
  }

  function updateRow(key: string, patch: Partial<QuotationFormAdditionalItem>) {
    onChange(value.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  /** Create a catalog type without leaving the quotation, then add it as a row. */
  async function createAndAddType() {
    setNewTypeError(null);
    try {
      const created = await createType.mutateAsync({
        name: newType.name.trim(),
        unitLabel: newType.unitLabel.trim(),
        multiplierLabel: newType.multiplierLabel.trim() || null,
        defaultUnitPrice: newType.defaultUnitPrice === "" ? null : Number(newType.defaultUnitPrice),
        serviceMode: serviceMode ?? null,
      });
      onChange([...value, newAdditionalItemRow(created)]);
      setNewType({ name: "", unitLabel: "", multiplierLabel: "", defaultUnitPrice: "" });
      setShowNewType(false);
    } catch (err) {
      setNewTypeError(
        err instanceof ApiError
          ? (err.data?.message ?? err.message)
          : "Gagal membuat jenis biaya.",
      );
    }
  }

  const newTypeValid =
    newType.name.trim() !== "" &&
    newType.unitLabel.trim() !== "" &&
    (newType.defaultUnitPrice === "" || Number(newType.defaultUnitPrice) > 0);

  function addPending() {
    const type = types.find((candidate) => candidate.id === pendingTypeId);
    if (!type) return;
    onChange([...value, newAdditionalItemRow(type)]);
    setPendingTypeId("");
  }

  return (
    <section className="space-y-4 border-t border-slate-100 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Additional / Biaya Tambahan</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Biaya non-kalibrasi (mis. akomodasi ON_SITE). Ditambahkan manual sesuai kebutuhan
            quotation ini; tidak masuk ke alokasi, Work Order, maupun Calibration Job.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Aktifkan Biaya Tambahan"
          disabled={disabled}
          onClick={() => toggle(!enabled)}
          className={cn(
            "relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-brand-600" : "bg-slate-300",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {enabled ? (
        <div className="space-y-3">
          {value.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Belum ada biaya tambahan. Pilih jenis biaya di bawah lalu klik Tambah.
            </p>
          ) : null}

          {value.map((row, index) => {
            // Mirrors the server: unitPrice x qty x (multiplier ?? 1); there is no line discount.
            const lineTotal = additionalLineTotal(
              moneyNumber(row.unitPrice),
              moneyNumber(row.qty || "0"),
              row.multiplierLabel ? moneyNumber(row.multiplier || "0") : null,
            );
            return (
              <div key={row.key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-slate-400">{row.code}</p>
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      maxLength={500}
                      className="mt-1"
                      aria-label={`Deskripsi biaya tambahan ${index + 1}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
                    onClick={() => onChange(value.filter((item) => item.key !== row.key))}
                    aria-label={`Hapus biaya tambahan ${index + 1}`}
                    disabled={disabled}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Harga satuan
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                      aria-label={`Harga satuan biaya tambahan ${index + 1}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Jumlah {row.unitLabel}
                    </label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={row.qty}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === "" || /^\d+$/.test(next)) updateRow(row.key, { qty: next });
                      }}
                      aria-label={`Jumlah ${row.unitLabel} biaya tambahan ${index + 1}`}
                    />
                  </div>
                  {row.multiplierLabel ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Jumlah {row.multiplierLabel}
                      </label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={row.multiplier}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === "" || /^\d+$/.test(next)) updateRow(row.key, { multiplier: next });
                        }}
                        aria-label={`Jumlah ${row.multiplierLabel} biaya tambahan ${index + 1}`}
                      />
                    </div>
                  ) : null}
                  <div className="text-right md:col-start-4">
                    <p className="mb-1 text-xs font-medium text-slate-600">Jumlah</p>
                    <p className="pt-2 text-sm font-medium text-slate-900">{formatIdr(lineTotal)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {describeAdditionalCalculation(formatIdr(moneyNumber(row.unitPrice)), {
                    qty: moneyNumber(row.qty || "0"),
                    unitLabel: row.unitLabel,
                    multiplier: row.multiplierLabel ? moneyNumber(row.multiplier || "0") : null,
                    multiplierLabel: row.multiplierLabel,
                  })}
                </p>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Catatan (opsional)
                  </label>
                  <Input
                    value={row.notes}
                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                    maxLength={1000}
                    aria-label={`Catatan biaya tambahan ${index + 1}`}
                  />
                </div>
              </div>
            );
          })}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className={cn(selectClassName, "w-full sm:max-w-sm")}
              value={pendingTypeId}
              onChange={(e) => setPendingTypeId(e.target.value)}
              disabled={disabled || typesQuery.isLoading || types.length === 0}
              aria-label="Jenis biaya tambahan"
            >
              <option value="">
                {typesQuery.isLoading
                  ? "Memuat jenis biaya…"
                  : types.length === 0
                    ? "Belum ada jenis biaya aktif"
                    : "Pilih jenis biaya…"}
              </option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.code} — {type.name} ({type.unitLabel})
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPending}
              disabled={disabled || !pendingTypeId}
            >
              <Plus className="h-4 w-4" />
              Tambah
            </Button>
            {canCreateType ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowNewType((v) => !v)}
              >
                {showNewType ? "Batal" : "+ Jenis biaya baru"}
              </Button>
            ) : types.length === 0 && !typesQuery.isLoading ? (
              <span className="text-xs text-slate-500">
                Minta admin menambahkan jenis biaya di menu Additional Cost.
              </span>
            ) : null}
          </div>

          {showNewType && canCreateType ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-3">
              <p className="text-sm font-medium text-slate-900">Jenis biaya baru</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Disimpan ke katalog Additional Cost (kode dibuat otomatis) dan langsung ditambahkan ke quotation ini.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Input
                  placeholder="Nama (Akomodasi)"
                  value={newType.name}
                  maxLength={150}
                  onChange={(e) => setNewType((t) => ({ ...t, name: e.target.value }))}
                  aria-label="Nama jenis biaya"
                />
                <Input
                  placeholder="Satuan (malam)"
                  value={newType.unitLabel}
                  maxLength={30}
                  onChange={(e) => setNewType((t) => ({ ...t, unitLabel: e.target.value }))}
                  aria-label="Satuan jenis biaya"
                />
                <Input
                  placeholder="Pengali ke-2 (opsional, mis. hari)"
                  value={newType.multiplierLabel}
                  maxLength={30}
                  onChange={(e) => setNewType((t) => ({ ...t, multiplierLabel: e.target.value }))}
                  aria-label="Label pengali kedua"
                />
                <Input
                  type="number"
                  min="1"
                  step="any"
                  placeholder="Harga default (opsional)"
                  value={newType.defaultUnitPrice}
                  onChange={(e) => setNewType((t) => ({ ...t, defaultUnitPrice: e.target.value }))}
                  aria-label="Harga default jenis biaya"
                />
              </div>
              {newTypeError ? <p className="mt-2 text-sm text-red-600">{newTypeError}</p> : null}
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={createAndAddType}
                  disabled={!newTypeValid || createType.isPending}
                >
                  {createType.isPending ? "Menyimpan…" : "Simpan & tambahkan"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
