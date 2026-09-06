"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../calibration-requests/calibration-requests-ui";
import {
  fmtDateOnly,
  fmtTimestampDay,
  isCalibrationValidityWindowOk,
  parseDateOnly,
  toDateInputValue,
  toDateOnlyString,
} from "./equipment-calibration-record-date-utils";
import { Surface, selectClassName } from "./equipment-units-ui";
import {
  downloadCalibrationCertificate,
  useCreateEquipmentCalibrationRecord,
  useDeleteCalibrationCertificate,
  useDeleteEquipmentCalibrationRecord,
  useEquipmentCalibrationRecords,
  useUpdateEquipmentCalibrationRecord,
  useUploadCalibrationCertificate,
  type CalibrationDocument,
  type CalibrationValidity,
  type EquipmentCalibrationRecordRow,
} from "./use-equipment-calibration-records-query";

function apiErr(e: unknown): string {
  if (e instanceof ApiError) {
    const code = e.data?.code;
    if (code === "EQUIPMENT_CALIBRATION_RECORD_LOCKED")
      return "Record sudah CONFIRMED — tidak dapat diubah atau dihapus.";
    if (code === "EQUIPMENT_CALIBRATION_RECORD_HAS_FILES")
      return "Hapus dulu file sertifikat yang terlampir.";
    if (code === "INVALID_CALIBRATION_VALIDITY_WINDOW")
      return "Tanggal mulai berlaku harus sebelum/sama dengan tanggal berakhir.";
    if (code === "FILE_MIME_NOT_ALLOWED" || code === "FILE_EXTENSION_NOT_ALLOWED" || code === "FILE_CONTENT_MISMATCH")
      return "Hanya file PDF yang diperbolehkan.";
    if (code === "FILE_TOO_LARGE") return "Ukuran file melebihi batas (10 MB).";
    if (code === "FILE_OWNER_LOCKED") return "Record sudah CONFIRMED — evidence tidak dapat diubah.";
    if (typeof e.data?.message === "string") return e.data.message;
    return e.message;
  }
  return "Terjadi kesalahan. Coba lagi.";
}

// ---------------------------------------------------------------------------

function ValidityBanner({ validity }: { validity: CalibrationValidity }) {
  const map = {
    VALID: { label: "VALID", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    EXPIRED: { label: "EXPIRED", cls: "bg-red-50 text-red-800 border-red-200" },
    NOT_YET_VALID: { label: "BELUM BERLAKU", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    NO_RECORD: { label: "TIDAK ADA RECORD KALIBRASI", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  }[validity.status];
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm", map.cls)}>
      <span className="font-semibold">{map.label}</span>
      {validity.status === "VALID" && validity.validUntil ? (
        <span>· berlaku s/d {fmtDateOnly(validity.validUntil)}</span>
      ) : null}
      <span className="ml-auto text-xs opacity-70">Dihitung dari record kalibrasi CONFIRMED</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface FormValue {
  calibrationDate: string;
  validFrom: string;
  validUntil: string;
  certificateNumber: string;
  provider: string;
  result: string;
  remarks: string;
  acceptedForUse: boolean;
  acceptanceNotes: string;
}

const emptyForm: FormValue = {
  calibrationDate: "",
  validFrom: "",
  validUntil: "",
  certificateNumber: "",
  provider: "",
  result: "",
  remarks: "",
  acceptedForUse: false,
  acceptanceNotes: "",
};

function formFromRow(r: EquipmentCalibrationRecordRow): FormValue {
  return {
    calibrationDate: toDateInputValue(r.calibrationDate),
    validFrom: toDateInputValue(r.validFrom),
    validUntil: toDateInputValue(r.validUntil),
    certificateNumber: r.certificateNumber ?? "",
    provider: r.provider ?? "",
    result: r.result ?? "",
    remarks: r.remarks ?? "",
    acceptedForUse: r.acceptedForUse,
    acceptanceNotes: r.acceptanceNotes ?? "",
  };
}

const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-slate-500";
const label = "block text-xs font-medium text-slate-600";
const grid2 = "grid gap-3 sm:grid-cols-2";

/**
 * Portal standard date picker (Popover + Calendar) — same composition as
 * Price List / PO / Quotation. Displays dd/MM/yyyy; value stays YYYY-MM-DD.
 */
function DateField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  allowClear = false,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateOnly(value);
  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "mt-1 h-9 w-full justify-start font-normal",
            !selected && "text-slate-400",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {selected ? format(selected, "dd/MM/yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(toDateOnlyString(date));
            setOpen(false);
          }}
          captionLayout="dropdown"
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2035, 11)}
          autoFocus
        />
        {allowClear && selected ? (
          <div className="border-t border-slate-100 p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Hapus tanggal
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function CalibrationRecordForm({
  value,
  onChange,
  disabled,
}: {
  value: FormValue;
  onChange: <K extends keyof FormValue>(k: K, v: FormValue[K]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className={sectionTitle}>Data Kalibrasi</h4>
        <div className={grid2}>
          <div>
            <label className={label}>Tanggal kalibrasi *</label>
            <DateField
              value={value.calibrationDate}
              disabled={disabled}
              onChange={(next) => onChange("calibrationDate", next)}
              placeholder="Pilih tanggal…"
              ariaLabel="Tanggal kalibrasi"
            />
          </div>
          <div>
            <label className={label}>Berlaku dari</label>
            <DateField
              value={value.validFrom}
              disabled={disabled}
              onChange={(next) => onChange("validFrom", next)}
              placeholder="Pilih tanggal…"
              ariaLabel="Berlaku dari"
              allowClear
            />
          </div>
          <div>
            <label className={label}>Berlaku s/d *</label>
            <DateField
              value={value.validUntil}
              disabled={disabled}
              onChange={(next) => onChange("validUntil", next)}
              placeholder="Pilih tanggal…"
              ariaLabel="Berlaku s/d"
            />
          </div>
          <div>
            <label className={label}>No. sertifikat</label>
            <Input value={value.certificateNumber} disabled={disabled} maxLength={120}
              onChange={(e) => onChange("certificateNumber", e.target.value)} className="mt-1 h-9" placeholder="CAL-001" />
          </div>
          <div>
            <label className={label}>Penyedia kalibrasi</label>
            <Input value={value.provider} disabled={disabled} maxLength={200}
              onChange={(e) => onChange("provider", e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <label className={label}>Hasil</label>
            <Input value={value.result} disabled={disabled} maxLength={120}
              onChange={(e) => onChange("result", e.target.value)} className="mt-1 h-9" placeholder="mis. PASS" />
          </div>
        </div>
        <div>
          <label className={label}>Catatan</label>
          <textarea value={value.remarks} disabled={disabled} maxLength={500}
            onChange={(e) => onChange("remarks", e.target.value)}
            className={`${selectClassName} mt-1 min-h-[56px] w-full`} />
        </div>
      </section>

      <section className="space-y-2 border-t border-slate-100 pt-3">
        <h4 className={sectionTitle}>Penerimaan (Accepted for use)</h4>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={value.acceptedForUse} disabled={disabled}
            onChange={(e) => onChange("acceptedForUse", e.target.checked)} />
          Diterima untuk digunakan (dicatat: oleh siapa & kapan)
        </label>
        <div>
          <label className={label}>Catatan penerimaan</label>
          <textarea value={value.acceptanceNotes} disabled={disabled} maxLength={500}
            onChange={(e) => onChange("acceptanceNotes", e.target.value)}
            className={`${selectClassName} mt-1 min-h-[48px] w-full`} />
        </div>
      </section>
    </div>
  );
}

function toCreatePayload(f: FormValue) {
  return {
    calibrationDate: f.calibrationDate,
    ...(f.validFrom ? { validFrom: f.validFrom } : {}),
    validUntil: f.validUntil,
    ...(f.certificateNumber.trim() ? { certificateNumber: f.certificateNumber.trim() } : {}),
    ...(f.provider.trim() ? { provider: f.provider.trim() } : {}),
    ...(f.result.trim() ? { result: f.result.trim() } : {}),
    ...(f.remarks.trim() ? { remarks: f.remarks.trim() } : {}),
    acceptedForUse: f.acceptedForUse,
    ...(f.acceptanceNotes.trim() ? { acceptanceNotes: f.acceptanceNotes.trim() } : {}),
  } as never;
}

function toUpdatePayload(f: FormValue) {
  return {
    calibrationDate: f.calibrationDate,
    validFrom: f.validFrom ? f.validFrom : null,
    validUntil: f.validUntil,
    certificateNumber: f.certificateNumber.trim() ? f.certificateNumber.trim() : null,
    provider: f.provider.trim() ? f.provider.trim() : null,
    result: f.result.trim() ? f.result.trim() : null,
    remarks: f.remarks.trim() ? f.remarks.trim() : null,
    acceptedForUse: f.acceptedForUse,
    acceptanceNotes: f.acceptanceNotes.trim() ? f.acceptanceNotes.trim() : null,
  } as never;
}

// ---------------------------------------------------------------------------

function EvidenceSection({
  record,
  canManage,
  onError,
}: {
  record: EquipmentCalibrationRecordRow;
  canManage: boolean;
  onError: (m: string | null) => void;
}) {
  const upload = useUploadCalibrationCertificate();
  const removeFile = useDeleteCalibrationCertificate();
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = canManage && record.status === "DRAFT";

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onError(null);
    try {
      await upload.mutateAsync({ recordId: record.id, file });
    } catch (err) {
      onError(apiErr(err));
    }
  }

  async function download(doc: CalibrationDocument) {
    onError(null);
    try {
      await downloadCalibrationCertificate(doc);
    } catch (err) {
      onError(apiErr(err));
    }
  }

  return (
    <section className="space-y-2 border-t border-slate-100 pt-3">
      <h4 className={sectionTitle}>Evidence — Sertifikat</h4>
      {record.documents.length === 0 ? (
        <p className="text-xs text-slate-400">Belum ada sertifikat terlampir.</p>
      ) : (
        <ul className="space-y-1">
          {record.documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{doc.originalName ?? doc.id}</span>
              {doc.sizeBytes ? (
                <span className="text-xs text-slate-400">({Math.ceil(doc.sizeBytes / 1024)} KB)</span>
              ) : null}
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => download(doc)}>
                <Download className="h-3.5 w-3.5" /> Unduh
              </Button>
              {editable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  disabled={removeFile.isPending}
                  onClick={async () => {
                    onError(null);
                    try {
                      await removeFile.mutateAsync(doc.id);
                    } catch (err) {
                      onError(apiErr(err));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPick} />
          <Button type="button" variant="outline" size="sm" disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {upload.isPending ? "Mengunggah…" : "Unggah sertifikat PDF"}
          </Button>
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

function RecordDetail({
  record,
  canManage,
}: {
  record: EquipmentCalibrationRecordRow;
  canManage: boolean;
}) {
  const update = useUpdateEquipmentCalibrationRecord();
  const del = useDeleteEquipmentCalibrationRecord();
  const [form, setForm] = useState<FormValue>(() => formFromRow(record));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const locked = record.status === "CONFIRMED";
  const editable = canManage && !locked;

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(formFromRow(record)),
    [form, record],
  );

  function setField<K extends keyof FormValue>(k: K, v: FormValue[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setError(null);
    setSuccess(null);
    if (!form.calibrationDate || !form.validUntil) {
      setError("Tanggal kalibrasi dan tanggal berakhir wajib diisi.");
      return;
    }
    if (!isCalibrationValidityWindowOk(form.calibrationDate, form.validFrom, form.validUntil)) {
      setError("Tanggal mulai berlaku harus sebelum/sama dengan tanggal berakhir.");
      return;
    }
    try {
      await update.mutateAsync({ id: record.id, input: toUpdatePayload(form) });
      setSuccess("Tersimpan.");
    } catch (err) {
      setError(apiErr(err));
    }
  }

  async function confirm() {
    setError(null);
    try {
      if (dirty) await update.mutateAsync({ id: record.id, input: toUpdatePayload(form) });
      await update.mutateAsync({ id: record.id, input: { status: "CONFIRMED" } as never });
      setConfirmOpen(false);
    } catch (err) {
      setError(apiErr(err));
    }
  }

  async function remove() {
    setError(null);
    try {
      await del.mutateAsync(record.id);
      setDeleteOpen(false);
    } catch (err) {
      setError(apiErr(err));
    }
  }

  return (
    <div className="space-y-3 bg-slate-50/60 p-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <CalibrationRecordForm value={form} onChange={setField} disabled={!editable} />

      {record.acceptedForUse && record.acceptedBy ? (
        <p className="text-xs text-slate-500">
          Diterima oleh {record.acceptedBy.name ?? record.acceptedBy.email}
          {record.acceptedAt ? ` · ${fmtTimestampDay(record.acceptedAt)}` : ""}
        </p>
      ) : null}

      <EvidenceSection record={record} canManage={canManage} onError={setError} />

      {editable ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={del.isPending}
          >
            {del.isPending ? "Menghapus…" : "Hapus"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={save} disabled={update.isPending || !dirty}>
            Simpan draft
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={update.isPending}
          >
            Konfirmasi (lock)
          </Button>
        </div>
      ) : (
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          Record CONFIRMED — evidence historis, terkunci dari perubahan.
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Konfirmasi Record"
        description="Record kalibrasi yang sudah CONFIRMED tidak dapat diubah atau dihapus."
        confirmLabel="Konfirmasi"
        loading={update.isPending}
        onConfirm={confirm}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Hapus Record Kalibrasi"
        description="Hapus record kalibrasi DRAFT ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="destructive"
        loading={del.isPending}
        onConfirm={remove}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function EquipmentCalibrationRecordsPanel({
  equipmentId,
  canRead,
  canManage,
}: {
  equipmentId: string;
  canRead: boolean;
  canManage: boolean;
}) {
  const query = useEquipmentCalibrationRecords(equipmentId, canRead);
  const create = useCreateEquipmentCalibrationRecord(equipmentId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  if (!canRead) return null;

  const result = query.data;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitNew() {
    setError(null);
    if (!form.calibrationDate || !form.validUntil) {
      setError("Tanggal kalibrasi dan tanggal berakhir wajib diisi.");
      return;
    }
    if (!isCalibrationValidityWindowOk(form.calibrationDate, form.validFrom, form.validUntil)) {
      setError("Tanggal mulai berlaku harus sebelum/sama dengan tanggal berakhir.");
      return;
    }
    try {
      await create.mutateAsync(toCreatePayload(form));
      setForm(emptyForm);
      setAdding(false);
    } catch (err) {
      setError(apiErr(err));
    }
  }

  return (
    <Surface className="mt-5 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Calibration Records</h3>
        {canManage ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Tambah
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <p className="mt-3 text-sm text-slate-400">Memuat…</p>
      ) : query.isError ? (
        <p className="mt-3 text-sm text-red-600">Gagal memuat calibration records.</p>
      ) : result ? (
        <>
          <div className="mt-3">
            <ValidityBanner validity={result.validity} />
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          {adding && canManage ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <CalibrationRecordForm value={form} onChange={(k, v) => setForm((p) => ({ ...p, [k]: v }))} />
              <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(false); setForm(emptyForm); }}>
                  Batal
                </Button>
                <Button type="button" size="sm" onClick={submitNew} disabled={create.isPending}>
                  {create.isPending ? "Menyimpan…" : "Simpan sebagai DRAFT"}
                </Button>
              </div>
            </div>
          ) : null}

          {result.data.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Belum ada record kalibrasi.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Tanggal</th>
                    <th className="px-3 py-2">Berlaku s/d</th>
                    <th className="px-3 py-2">Sertifikat</th>
                    <th className="px-3 py-2">Hasil</th>
                    <th className="px-3 py-2">Diterima</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                {result.data.map((rec) => {
                  const open = expanded.has(rec.id);
                  return (
                    <tbody key={rec.id} className="border-b border-slate-200 last:border-0">
                      <tr className="cursor-pointer bg-white hover:bg-slate-50" onClick={() => toggle(rec.id)}>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                            {fmtDateOnly(rec.calibrationDate)}
                          </span>
                        </td>
                        <td className="px-3 py-2">{fmtDateOnly(rec.validUntil)}</td>
                        <td className="px-3 py-2 text-slate-600">{rec.certificateNumber ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{rec.result ?? "—"}</td>
                        <td className="px-3 py-2">{rec.acceptedForUse ? "Ya" : "Tidak"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className={cn("font-mono text-[10px]",
                            rec.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "text-slate-600")}>
                            {rec.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-slate-400">
                          {rec.documents.length} file
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <RecordDetail record={rec} canManage={canManage} />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
        </>
      ) : null}
    </Surface>
  );
}
