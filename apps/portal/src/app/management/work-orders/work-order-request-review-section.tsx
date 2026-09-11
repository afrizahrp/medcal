"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailField, formatDateTime } from "../calibration-jobs/calibration-jobs-ui";
import {
  useUpdateWorkOrderRequestReview,
  useReplaceWorkOrderItemAccessories,
} from "./use-work-orders-query";
import type { WorkOrderRow, WorkOrderItem } from "./work-orders-ui";

// ── Helper ────────────────────────────────────────────────────────────────────

function BoolToggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
  disabled?: boolean;
}) {
  const options: Array<{ label: string; v: boolean | null; cls: string }> = [
    { label: "—", v: null, cls: "border-slate-200 bg-slate-50 text-slate-500" },
    { label: "OK", v: true, cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
    { label: "Tidak OK", v: false, cls: "border-red-300 bg-red-50 text-red-800" },
  ];

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={String(opt.v)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.v === value ? null : opt.v)}
            className={[
              "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
              value === opt.v ? opt.cls : "border-slate-200 bg-white text-slate-400",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}

// ── Request Review section ────────────────────────────────────────────────────

export function WorkOrderRequestReviewSection({
  workOrder,
  onChanged,
}: {
  workOrder: WorkOrderRow;
  onChanged: () => void;
}) {
  const { capabilities } = useAuthz();
  const mutation = useUpdateWorkOrderRequestReview();
  const [open, setOpen] = useState(false);
  const [otherText, setOtherText] = useState(workOrder.requestReviewConfirmOtherText ?? "");

  const isWol = workOrder.serviceMode === "SEND_TO_LAB";
  if (!isWol) return null;

  const canEdit = Boolean(capabilities?.workOrderUpdate) && !["DONE", "CANCELLED"].includes(workOrder.status);
  const pending = mutation.isPending;
  const completed = workOrder.requestReviewCompletedAt != null;

  function patch(input: Parameters<typeof mutation.mutate>[0]["input"]) {
    mutation.mutate(
      { id: workOrder.id, input },
      { onSuccess: onChanged },
    );
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {completed ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <span className="h-4 w-4 rounded-full border-2 border-amber-400" />
          )}
          II. Kaji Ulang Permintaan
        </h3>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {completed ? (
        <p className="mt-1 text-xs text-emerald-700">
          Selesai — {formatDateTime(workOrder.requestReviewCompletedAt)}{" "}
          {workOrder.requestReviewCompletedBy?.name
            ? `oleh ${workOrder.requestReviewCompletedBy.name}`
            : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-amber-600">Belum ditandai selesai</p>
      )}

      {open ? (
        <div className="mt-3 space-y-2 text-sm">
          {/* Method / Equipment / Personnel — tri-state */}
          <BoolToggle
            label="Metode kalibrasi sesuai"
            value={workOrder.requestReviewMethodOk}
            onChange={(v) => patch({ requestReviewMethodOk: v })}
            disabled={!canEdit || pending}
          />
          <BoolToggle
            label="Peralatan tersedia dan sesuai"
            value={workOrder.requestReviewEquipmentOk}
            onChange={(v) => patch({ requestReviewEquipmentOk: v })}
            disabled={!canEdit || pending}
          />
          <BoolToggle
            label="Personel kompeten tersedia"
            value={workOrder.requestReviewPersonnelOk}
            onChange={(v) => patch({ requestReviewPersonnelOk: v })}
            disabled={!canEdit || pending}
          />

          {/* Confirm check-boxes */}
          <div className="mt-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Konfirmasi persetujuan customer
            </p>
            <CheckboxRow
              label="Persetujuan langsung"
              checked={workOrder.requestReviewConfirmAgree}
              onChange={(v) => patch({ requestReviewConfirmAgree: v })}
              disabled={!canEdit || pending}
            />
            <CheckboxRow
              label="Konfirmasi via email"
              checked={workOrder.requestReviewConfirmEmail}
              onChange={(v) => patch({ requestReviewConfirmEmail: v })}
              disabled={!canEdit || pending}
            />
            <CheckboxRow
              label="Surat resmi"
              checked={workOrder.requestReviewConfirmLetter}
              onChange={(v) => patch({ requestReviewConfirmLetter: v })}
              disabled={!canEdit || pending}
            />
            <CheckboxRow
              label="Lainnya"
              checked={workOrder.requestReviewConfirmOther}
              onChange={(v) => patch({ requestReviewConfirmOther: v })}
              disabled={!canEdit || pending}
            />
            {workOrder.requestReviewConfirmOther ? (
              <div className="ml-6 mt-1 flex items-center gap-2">
                <Input
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  maxLength={500}
                  placeholder="Keterangan lainnya"
                  disabled={!canEdit}
                  className="text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canEdit || pending}
                  onClick={() => patch({ requestReviewConfirmOtherText: otherText.trim() || null })}
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          {/* Mark complete / reopen */}
          {canEdit ? (
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              {mutation.isError ? (
                <p className="text-xs text-red-600">Gagal menyimpan.</p>
              ) : (
                <span />
              )}
              <Button
                type="button"
                size="sm"
                disabled={pending}
                variant={completed ? "outline" : "default"}
                onClick={() => patch({ completed: !completed })}
              >
                {pending ? "Menyimpan…" : completed ? "Buka kembali" : "Tandai Selesai"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Per-item accessories section ──────────────────────────────────────────────

function ItemAccessoryEditor({
  workOrderId,
  item,
  canEdit,
  onChanged,
}: {
  workOrderId: string;
  item: WorkOrderItem;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const mutation = useReplaceWorkOrderItemAccessories();
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<string[]>(item.accessories.map((a) => a.label));
  const [newLabel, setNewLabel] = useState("");
  const [dirty, setDirty] = useState(false);

  function addRow() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setLabels((prev) => [...prev, trimmed]);
    setNewLabel("");
    setDirty(true);
  }

  function removeRow(i: number) {
    setLabels((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  function save() {
    mutation.mutate(
      {
        id: workOrderId,
        itemId: item.id,
        input: {
          accessories: labels
            .filter((l) => l.trim())
            .map((label, i) => ({ label: label.trim(), sortOrder: (i + 1) * 10 })),
        },
      },
      {
        onSuccess: () => {
          setDirty(false);
          onChanged();
        },
      },
    );
  }

  const deviceLabel = item.purchaseOrderItem.device
    ? [item.purchaseOrderItem.device.brand, item.purchaseOrderItem.device.model].filter(Boolean).join(" ") || item.description
    : item.description;

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate text-sm font-medium text-slate-800">{deviceLabel}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {labels.length} {labels.length === 1 ? "aksesori" : "aksesori"}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-3 py-3">
          {labels.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada perlengkapan untuk item ini.</p>
          ) : (
            <ul className="space-y-1">
              {labels.map((label, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-slate-700">{label}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  maxLength={200}
                  placeholder="Nama perlengkapan baru"
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRow();
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addRow}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {dirty ? (
                <div className="flex items-center justify-between">
                  {mutation.isError ? (
                    <p className="text-xs text-red-600">Gagal menyimpan.</p>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={save}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {mutation.isPending ? "Menyimpan…" : "Simpan perlengkapan"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WorkOrderItemAccessoriesSection({
  workOrder,
  onChanged,
}: {
  workOrder: WorkOrderRow;
  onChanged: () => void;
}) {
  const { capabilities } = useAuthz();

  const isWol = workOrder.serviceMode === "SEND_TO_LAB";
  if (!isWol || workOrder.items.length === 0) return null;

  const canEdit =
    Boolean(capabilities?.workOrderUpdate) && !["DONE", "CANCELLED"].includes(workOrder.status);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Perlengkapan per Item</h3>
      <p className="mb-3 text-xs text-slate-500">
        Daftar perlengkapan yang diterima bersama alat — akan disalin ke Kontrol Alat masing-masing
        unit saat Work Order dimulai.
      </p>
      <div className="space-y-2">
        {workOrder.items.map((item) => (
          <ItemAccessoryEditor
            key={item.id}
            workOrderId={workOrder.id}
            item={item}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}
