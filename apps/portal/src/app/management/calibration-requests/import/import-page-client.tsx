"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { ApiError } from "@medcal/shared";
import type {
  CalibrationRequestImportPreviewResponse,
  CalibrationRequestImportPreviewRow,
} from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../../components/access-denied";
import {
  PageHeader,
  Surface,
  formPageClass,
  formSurfaceClass,
  selectClassName,
  SERVICE_MODE_OPTIONS,
  SERVICE_MODE_LABELS,
  CustomerCommandSelect,
  DeviceTypeItemSelect,
  type ServiceMode,
} from "../calibration-requests-ui";
import { useImportConfirm, useImportPreview } from "../use-calibration-requests-query";
import { useCustomers } from "../../customers/use-customers-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

interface EditableRow extends CalibrationRequestImportPreviewRow {
  resolvedDeviceTypeId: string;
}

const MATCH_LABEL: Record<string, string> = {
  EXACT_NAME: "Nama persis",
  ALIAS: "Alias",
  FUZZY: "Saran",
  UNMATCHED: "Tidak cocok",
  USER: "Dipilih user",
};

export default function ImportCalibrationRequestPageClient() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customerId, setCustomerId] = useState("");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("ON_SITE");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CalibrationRequestImportPreviewResponse | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useImportPreview();
  const confirmMutation = useImportConfirm();

  const customersQuery = useCustomers({
    search: "",
    status: "ACTIVE",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const customers = customersQuery.data?.data ?? [];
  const deviceTypes = typesQuery.data?.data ?? [];

  const totals = useMemo(() => {
    let readyItems = 0;
    let units = 0;
    let blocking = 0;
    let unresolved = 0;
    for (const row of rows) {
      if (row.errors.length > 0) {
        blocking += 1;
        continue;
      }
      const rowReady = row.qty != null && row.qty > 0 && row.resolvedDeviceTypeId !== "";
      if (rowReady) {
        readyItems += 1;
        units += row.qty ?? 0;
      } else {
        unresolved += 1;
      }
    }
    return { readyItems, units, blocking, unresolved };
  }, [rows]);

  const canConfirm =
    rows.length > 0 &&
    Boolean(customerId) &&
    totals.blocking === 0 &&
    totals.unresolved === 0 &&
    !confirmMutation.isPending;

  if (!capabilities?.calibrationRequestCreate) {
    return <AccessDenied />;
  }

  async function handleFile(file: File) {
    setError(null);
    setPreview(null);
    setRows([]);
    setFileName(file.name);
    try {
      const result = await previewMutation.mutateAsync(file);
      setPreview(result);
      setRows(
        result.rows.map((row) => ({
          ...row,
          resolvedDeviceTypeId: row.match.deviceTypeId ?? "",
        })),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal membaca file Excel.");
      }
      setFileName(null);
    }
  }

  function setRowDeviceType(rowNumber: number, deviceTypeId: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.rowNumber === rowNumber ? { ...row, resolvedDeviceTypeId: deviceTypeId } : row,
      ),
    );
  }

  async function confirm() {
    setError(null);
    try {
      const created = await confirmMutation.mutateAsync({
        customerId,
        serviceMode,
        ...(expectedDate ? { expectedDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        rows: rows.map((row) => ({
          customerDeviceName: row.customerDeviceName,
          ...(row.model ? { model: row.model } : {}),
          deviceId: row.deviceId ?? "",
          qty: row.qty ?? 1,
          ...(row.akdAkl ? { akdAkl: row.akdAkl } : {}),
          deviceTypeId: row.resolvedDeviceTypeId,
        })),
      });
      router.push(`/calibration-requests/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.data?.code;
        if (code === "CUSTOMER_NOT_FOUND") {
          setError("Customer tidak ditemukan.");
        } else if (code === "DEVICE_TYPE_NOT_FOUND") {
          setError("Satu atau lebih Device Name tidak ditemukan.");
        } else {
          setError(err.data?.message ?? err.message);
        }
      } else {
        setError("Gagal membuat requisition dari import.");
      }
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="Import Requisition dari Excel"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-requests", label: "Requisitions" },
          { label: "Import Excel" },
        ]}
      />

      <form onSubmit={(e) => e.preventDefault()}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Informasi Requisition</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Customer <span className="text-red-500">*</span>
                </label>
                <CustomerCommandSelect
                  value={customerId}
                  customers={customers}
                  loading={customersQuery.isLoading}
                  onChange={setCustomerId}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Service Mode <span className="text-red-500">*</span>
                </label>
                <select
                  value={serviceMode}
                  onChange={(e) => setServiceMode(e.target.value as ServiceMode)}
                  className={cn(selectClassName, "w-full")}
                >
                  {SERVICE_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {SERVICE_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
              <DateField
                label="Expected Date"
                value={expectedDate}
                onChange={setExpectedDate}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(selectClassName, "min-h-[70px] w-full")}
                maxLength={2000}
              />
            </div>
          </section>

          <section className="mt-6 space-y-3 border-t border-slate-100 pt-6">
            <h2 className="text-base font-semibold text-slate-900">File Excel</h2>
            <p className="text-sm text-slate-500">
              Format kolom: <span className="font-mono">Nama Alat</span> (wajib),{" "}
              <span className="font-mono">Model</span>, <span className="font-mono">Qty</span>{" "}
              (wajib, bilangan bulat positif), <span className="font-mono">Serial No</span>{" "}
              (opsional). Setiap baris Excel menjadi 1 item requisition; Qty adalah jumlah unit
              untuk item tersebut.{" "}
              <a
                href="/medcal-requisition-template.xlsx"
                download="medcal-requisition-template.xlsx"
                className="font-medium text-brand-700 hover:underline"
              >
                Download template Excel
              </a>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={previewMutation.isPending}
              >
                <Upload className="h-4 w-4" />
                {previewMutation.isPending ? "Memproses…" : "Pilih file .xlsx"}
              </Button>
              {fileName ? (
                <span className="flex items-center gap-1.5 text-sm text-slate-600">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </span>
              ) : null}
            </div>
          </section>

          {preview ? (
            <section className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">Preview</h2>
                <p className="text-sm text-slate-500">
                  {preview.summary.sourceRows} baris = {preview.summary.sourceRows} item ·{" "}
                  {totals.units} unit · {totals.readyItems} siap
                  {totals.unresolved > 0 ? ` · ${totals.unresolved} perlu dipetakan` : ""}
                  {totals.blocking > 0 ? ` · ${totals.blocking} error` : ""}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Nama Alat Customer</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Serial No</th>
                      <th className="px-3 py-2">Device Name</th>
                      <th className="px-3 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const rowReady =
                        row.errors.length === 0 &&
                        row.qty != null &&
                        row.resolvedDeviceTypeId !== "";
                      return (
                        <tr
                          key={row.rowNumber}
                          className={cn(
                            row.errors.length > 0 && "bg-red-50/60",
                            row.errors.length === 0 && !rowReady && "bg-amber-50/50",
                          )}
                        >
                          <td className="px-3 py-2 align-top text-slate-400">{row.rowNumber}</td>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-slate-900">
                              {row.customerDeviceName || <span className="text-red-500">—</span>}
                            </p>
                            {row.errors.map((e) => (
                              <p key={e} className="mt-0.5 text-xs text-red-600">
                                {e}
                              </p>
                            ))}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-600">
                            {row.model ?? <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-600">
                            {row.qty ?? <span className="text-red-500">?</span>}
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-xs text-slate-600">
                            {row.deviceId ?? <span className="text-slate-400">NULL</span>}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {row.errors.length > 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <div className="min-w-[200px]">
                                <DeviceTypeItemSelect
                                  value={row.resolvedDeviceTypeId}
                                  onChange={(id) => setRowDeviceType(row.rowNumber, id)}
                                  deviceTypes={deviceTypes}
                                  loading={typesQuery.isLoading}
                                />
                                {row.suggestions.length > 0 && row.resolvedDeviceTypeId === "" ? (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {row.suggestions.map((s) => (
                                      <button
                                        key={s.deviceTypeId}
                                        type="button"
                                        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                                        onClick={() =>
                                          setRowDeviceType(row.rowNumber, s.deviceTypeId)
                                        }
                                        title={s.via}
                                      >
                                        {s.deviceTypeName}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {row.match.method ? (
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-xs font-medium",
                                  row.match.method === "EXACT_NAME" || row.match.method === "ALIAS"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700",
                                )}
                              >
                                {MATCH_LABEL[row.match.method]}
                              </span>
                            ) : row.errors.length > 0 ? (
                              <span className="text-xs text-red-600">Error</span>
                            ) : row.resolvedDeviceTypeId ? (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                                {MATCH_LABEL.USER}
                              </span>
                            ) : (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                                {MATCH_LABEL.UNMATCHED}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totals.blocking > 0 ? (
                <p className="text-sm text-red-600">
                  Perbaiki {totals.blocking} baris bermasalah di file Excel, lalu unggah ulang.
                  Konfirmasi dinonaktifkan.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/calibration-requests">
                <ArrowLeft className="h-4 w-4" />
                Batal
              </Link>
            </Button>
            <Button type="button" onClick={confirm} disabled={!canConfirm}>
              <CheckCircle2 className="h-4 w-4" />
              {confirmMutation.isPending
                ? "Membuat…"
                : `Buat Requisition (${totals.readyItems} item · ${totals.units} unit)`}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
