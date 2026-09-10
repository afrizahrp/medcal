"use client";

import type {
  PhysicalCheckDraft,
  PhysicalCheckVerdict,
  TechPhysicalCheckItem,
} from "../../../../lib/calibration/physical-check";
import { physicalCheckItemChip } from "../../../../lib/calibration/physical-check";

export function PhysicalCheckStatusRow({
  name,
  verdict,
}: {
  name: string;
  verdict: PhysicalCheckVerdict | null | undefined;
}) {
  const chip = physicalCheckItemChip(verdict);
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="min-w-0 truncate text-slate-700">{name}</span>
      <span
        className={["shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", chip.className].join(
          " ",
        )}
      >
        {chip.label}
      </span>
    </li>
  );
}

export function PhysicalCheckItemCard({
  item,
  draft,
  editable,
  onChange,
}: {
  item: TechPhysicalCheckItem;
  draft: PhysicalCheckDraft;
  editable: boolean;
  onChange: (next: PhysicalCheckDraft) => void;
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        Batas Pemeriksaan: <span className="text-slate-700">{item.inspectionLimit}</span>
      </p>

      <fieldset className="mt-3" disabled={!editable}>
        <legend className="sr-only">Kondisi — {item.name}</legend>
        <div className="grid grid-cols-2 gap-2">
          <VerdictOption
            name={`verdict-${item.id}`}
            value="BAIK"
            label="BAIK"
            selected={draft.verdict === "BAIK"}
            onSelect={() => onChange({ ...draft, verdict: "BAIK" })}
          />
          <VerdictOption
            name={`verdict-${item.id}`}
            value="TIDAK_BAIK"
            label="TIDAK BAIK"
            selected={draft.verdict === "TIDAK_BAIK"}
            onSelect={() => onChange({ ...draft, verdict: "TIDAK_BAIK" })}
          />
        </div>
      </fieldset>

      <div className="mt-3">
        <label htmlFor={`note-${item.id}`} className="block text-xs font-medium text-slate-600">
          Catatan (opsional)
        </label>
        <textarea
          id={`note-${item.id}`}
          maxLength={2000}
          rows={2}
          disabled={!editable}
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>
    </li>
  );
}

function VerdictOption({
  name,
  value,
  label,
  selected,
  onSelect,
}: {
  name: string;
  value: PhysicalCheckVerdict;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={[
        "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold",
        selected
          ? value === "BAIK"
            ? "border-emerald-400 bg-emerald-50 text-emerald-800"
            : "border-red-400 bg-red-50 text-red-800"
          : "border-slate-300 bg-white text-slate-700",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      {label}
    </label>
  );
}
