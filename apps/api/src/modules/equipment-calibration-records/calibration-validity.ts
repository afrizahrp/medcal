/**
 * Derived calibration validity. The source of truth is the set of CONFIRMED
 * EquipmentCalibrationRecord rows for an Equipment unit — there is NO
 * Equipment.calibrationDueDate / calibrationStatus field. A DRAFT record is
 * provisional and does not establish validity.
 *
 * This is a pure function so it is trivially unit-testable and reusable; it is
 * deliberately NOT wired to CalibrationJob / WorkOrder — the authoritative
 * "equipment use date" for job-level validation is an open business decision.
 */

export type CalibrationValidityStatus = "VALID" | "EXPIRED" | "NOT_YET_VALID" | "NO_RECORD";

export interface CalibrationValidityRecord {
  id: string;
  status: "DRAFT" | "CONFIRMED";
  /** Date-only values (time component ignored). */
  calibrationDate: Date;
  validFrom: Date | null;
  validUntil: Date;
}

export interface CalibrationValidityResult {
  status: CalibrationValidityStatus;
  /** The record that determines the result (the applicable / nearest one), if any. */
  recordId: string | null;
  validUntil: Date | null;
}

/** Interval start = validFrom when set, else calibrationDate. */
function intervalStart(r: CalibrationValidityRecord): Date {
  return r.validFrom ?? r.calibrationDate;
}

/** Compare by calendar day only. */
function dayLte(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

/**
 * @param records all calibration records for one Equipment unit (any status).
 * @param asOf    the reference date the validity is evaluated against.
 */
export function resolveCalibrationValidity(
  records: CalibrationValidityRecord[],
  asOf: Date,
): CalibrationValidityResult {
  const confirmed = records
    .filter((r) => r.status === "CONFIRMED")
    .sort((a, b) => a.calibrationDate.getTime() - b.calibrationDate.getTime());

  if (confirmed.length === 0) {
    return { status: "NO_RECORD", recordId: null, validUntil: null };
  }

  const covering = confirmed.filter(
    (r) => dayLte(intervalStart(r), asOf) && dayLte(asOf, r.validUntil),
  );
  if (covering.length > 0) {
    // The applicable record is the most recent calibration whose interval covers asOf.
    const applicable = covering.reduce((best, r) =>
      r.calibrationDate.getTime() >= best.calibrationDate.getTime() ? r : best,
    );
    return { status: "VALID", recordId: applicable.id, validUntil: applicable.validUntil };
  }

  // No record covers asOf. If no calibration had even started by asOf → not yet valid.
  const started = confirmed.filter((r) => dayLte(intervalStart(r), asOf));
  if (started.length === 0) {
    const earliest = confirmed[0];
    return { status: "NOT_YET_VALID", recordId: earliest.id, validUntil: earliest.validUntil };
  }

  // There is a past calibration but its validity has lapsed.
  const latestPast = started.reduce((best, r) =>
    r.calibrationDate.getTime() >= best.calibrationDate.getTime() ? r : best,
  );
  return { status: "EXPIRED", recordId: latestPast.id, validUntil: latestPast.validUntil };
}
