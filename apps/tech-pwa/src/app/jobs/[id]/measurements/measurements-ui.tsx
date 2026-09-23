import Link from "next/link";
import {
  gridEntryStatus,
  isGroupedMeasurementCapability,
  parameterEntryStatus,
  passFailChip,
  toleranceText,
  type MeasurementCapabilitySectionView,
  type ParameterEntryStatus,
  type TechMeasurementParameter,
  type TechMeasurementResult,
} from "../../../../lib/calibration/measurement";

const chipBase = "rounded-md px-2 py-0.5 text-[11px] font-semibold";

export function PassFailChip({ isWithinTolerance }: { isWithinTolerance: boolean | null }) {
  const chip = passFailChip(isWithinTolerance);
  return <span className={[chipBase, chip.className].join(" ")}>{chip.label}</span>;
}

function StatusChip({ status }: { status: ParameterEntryStatus }) {
  if (status.complete) {
    return (
      <span
        className={[
          chipBase,
          status.anyFail ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800",
        ].join(" ")}
      >
        {status.anyFail ? "Ada yang tidak sesuai" : "Selesai"}
      </span>
    );
  }
  return (
    <span className={[chipBase, "bg-slate-100 text-slate-600"].join(" ")}>
      {status.filled}/{status.total} diisi
    </span>
  );
}

/** One row in the parameter list on the measurement-entry screen. */
export function MeasurementParameterListRow({
  jobId,
  param,
  rows,
  pointCount,
}: {
  jobId: string;
  param: TechMeasurementParameter;
  rows: TechMeasurementResult[];
  pointCount?: number;
}) {
  const status =
    pointCount !== undefined
      ? gridEntryStatus(
          rows,
          (param.testPoints ?? []).map((tp) => tp.id),
        )
      : parameterEntryStatus(rows);
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
          {pointCount !== undefined ? ` · ${pointCount} titik` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusChip status={status} />
      </span>
    </Link>
  );
}

/** One combined link row for a grouped capability (e.g. NIBP), replacing its per-parameter rows. */
export function MeasurementGroupedCapabilityLinkRow({
  jobId,
  capabilityCode,
  capabilityName,
  section,
  gridRowsByParameter,
}: {
  jobId: string;
  capabilityCode: string;
  capabilityName: string;
  section: MeasurementCapabilitySectionView;
  gridRowsByParameter: Map<string, TechMeasurementResult[]>;
}) {
  let filled = 0;
  let total = 0;
  let anyFail = false;
  for (const { parameter, pointCount } of section.parameters) {
    if (pointCount === undefined) continue;
    const status = gridEntryStatus(
      gridRowsByParameter.get(parameter.id) ?? [],
      (parameter.testPoints ?? []).map((tp) => tp.id),
    );
    filled += status.filled;
    total += status.total;
    anyFail = anyFail || status.anyFail;
  }
  const complete = total > 0 && filled >= total;
  return (
    <Link
      href={`/jobs/${jobId}/measurements/${capabilityCode.toLowerCase()}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 active:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{capabilityName}</span>
        <span className="mt-1 block text-xs text-slate-600">{total} titik ukur</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusChip status={{ filled, total, complete, anyFail }} />
      </span>
    </Link>
  );
}

/** Static capability sections wrapping existing parameter list rows. No accordion. */
export function MeasurementCapabilityGroupList({
  jobId,
  sections,
  rowsByParameter,
  gridRowsByParameter,
}: {
  jobId: string;
  sections: MeasurementCapabilitySectionView[];
  rowsByParameter: Map<string, TechMeasurementResult[]>;
  gridRowsByParameter: Map<string, TechMeasurementResult[]>;
}) {
  return (
    <>
      {sections.map((section) => {
        const grouped = isGroupedMeasurementCapability(section.code);
        return (
          <section key={section.id} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {section.name}
            </h2>
            {grouped ? (
              <MeasurementGroupedCapabilityLinkRow
                jobId={jobId}
                capabilityCode={section.code}
                capabilityName={section.name}
                section={section}
                gridRowsByParameter={gridRowsByParameter}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {section.parameters.map(({ parameter, pointCount }) => (
                  <li key={parameter.id}>
                    <MeasurementParameterListRow
                      jobId={jobId}
                      param={parameter}
                      rows={
                        pointCount !== undefined
                          ? (gridRowsByParameter.get(parameter.id) ?? [])
                          : (rowsByParameter.get(parameter.id) ?? [])
                      }
                      pointCount={pointCount}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
