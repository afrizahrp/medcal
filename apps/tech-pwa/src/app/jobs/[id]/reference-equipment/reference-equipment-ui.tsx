import { Badge } from "../../../../components/ui/badge";
import {
  REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS,
  REFERENCE_EQUIPMENT_VALIDITY_LABELS,
  type JobEquipmentValidityStatus,
  type TechReferenceEquipmentUsed,
} from "../../../../lib/calibration/reference-equipment";

const badgeBase = "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

export function brandModel(u: { brand: string | null; model: string | null }): string {
  return [u.brand, u.model].filter(Boolean).join(" ");
}

export function ReferenceEquipmentValidityBadge({ status }: { status: JobEquipmentValidityStatus }) {
  return (
    <Badge className={[badgeBase, REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS[status]].join(" ")}>
      {REFERENCE_EQUIPMENT_VALIDITY_LABELS[status]}
    </Badge>
  );
}

/** Read-only rendering of the recorded set — shared by the job-detail section and the locked states of the record screen. */
export function RecordedReferenceEquipmentList({ used }: { used: TechReferenceEquipmentUsed[] }) {
  if (used.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada alat referensi yang dicatat.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {used.map((u) => {
        const bm = brandModel(u.equipment);
        return (
          <li
            key={u.id}
            className={
              u.validityOverridden
                ? "rounded-lg border border-amber-300 bg-amber-50 p-2.5"
                : "rounded-lg border border-slate-200 p-2.5"
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-900">
                  <span className="font-mono font-medium">{u.equipment.code}</span>
                  {bm ? <span className="ml-2 text-slate-600">{bm}</span> : null}
                </p>
                <p className="text-xs text-slate-500">{u.equipment.equipmentType.name}</p>
              </div>
              <Badge
                className={[badgeBase, u.validityOverridden ? "bg-amber-500" : "bg-emerald-600"].join(" ")}
              >
                {u.validityOverridden ? "Override" : "Valid"}
              </Badge>
            </div>
            {u.validityOverridden ? (
              <p className="mt-1 text-xs text-amber-700">
                Disetujui manajer: {u.overriddenBy?.name ?? "—"}
                {u.overrideReason ? ` — ${u.overrideReason}` : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
