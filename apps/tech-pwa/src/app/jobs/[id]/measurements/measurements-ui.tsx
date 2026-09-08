import Link from "next/link";
import {
  parameterEntryStatus,
  passFailChip,
  toleranceText,
  type TechMeasurementParameter,
  type TechMeasurementResult,
} from "../../../../lib/calibration/measurement";

const chipBase = "rounded-md px-2 py-0.5 text-[11px] font-semibold";

export function PassFailChip({ isWithinTolerance }: { isWithinTolerance: boolean | null }) {
  const chip = passFailChip(isWithinTolerance);
  return <span className={[chipBase, chip.className].join(" ")}>{chip.label}</span>;
}

/** One row in the parameter list on the measurement-entry screen. */
export function MeasurementParameterListRow({
  jobId,
  param,
  rows,
}: {
  jobId: string;
  param: TechMeasurementParameter;
  rows: TechMeasurementResult[];
}) {
  const status = parameterEntryStatus(rows);
  return (
    <Link
      href={`/jobs/${jobId}/measurements/${param.id}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 active:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{param.name}</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {param.capabilityName} › {param.capabilityItemName}
        </span>
        <span className="mt-1 block text-xs text-slate-600">
          Toleransi: {toleranceText(param)}
          {param.uom?.symbol ? ` · Satuan: ${param.uom.symbol}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {status.complete ? (
          <span
            className={[
              chipBase,
              status.anyFail ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800",
            ].join(" ")}
          >
            {status.anyFail ? "Ada yang tidak sesuai" : "Selesai"}
          </span>
        ) : (
          <span className={[chipBase, "bg-slate-100 text-slate-600"].join(" ")}>
            {status.filled}/{status.total} diisi
          </span>
        )}
      </span>
    </Link>
  );
}
