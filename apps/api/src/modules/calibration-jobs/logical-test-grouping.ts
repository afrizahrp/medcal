/**
 * Phase 4A (Gap A) — logical-test grouping.
 *
 * Some LK worksheets record several independently measured quantities for one
 * logical test (Dental X-Ray reproducibility: kV + s + mGy; Microscope: stage +
 * eyepiece). Each quantity keeps its own unit, tolerance and verdict, so each is
 * its own `DeviceCalibrationParameter`; `logicalTestKey` / `logicalTestSequence`
 * are the CATALOG metadata that says they belong together and in what order.
 *
 * This module is presentation only. It never touches measurement identity:
 * `MeasurementResult`'s natural key, `CalibrationTestPoint`,
 * `JobCalibrationTestPoint`, `replicateIndex` and `direction` are unchanged, and
 * grouping is never inferred from `code` or `name`.
 *
 * Pure — no Prisma, no NestJS — so it is unit-tested in isolation
 * (logical-test-grouping.test.ts).
 */

export interface LogicalTestOrderable {
  id: string;
  logicalTestKey: string | null;
  logicalTestSequence: number | null;
}

/**
 * Reorder an already-sorted parameter list so members of the same logical test
 * are contiguous and in `logicalTestSequence` order.
 *
 * The incoming order (today: capability order → `sortOrder` → name) is otherwise
 * preserved: a group is emitted at the position of its FIRST member, so
 * introducing grouping never moves a logical test somewhere unexpected in the
 * worksheet, and never reorders the parameters around it.
 *
 * A parameter with a NULL key — which is every pre-existing row — passes through
 * untouched, so a catalog with no grouping declared is returned unchanged.
 *
 * `logicalTestSequence` is unique per `(deviceTypeId, logicalTestKey)` at the DB
 * level, so the sequence tie-break on `id` only ever matters for lists that span
 * device types (none today) and for keeping the sort total and deterministic.
 */
export function orderByLogicalTest<T extends LogicalTestOrderable>(items: readonly T[]): T[] {
  const membersByKey = new Map<string, T[]>();
  for (const item of items) {
    if (item.logicalTestKey === null) continue;
    const list = membersByKey.get(item.logicalTestKey);
    if (list) list.push(item);
    else membersByKey.set(item.logicalTestKey, [item]);
  }

  if (membersByKey.size === 0) return [...items];

  for (const [key, list] of membersByKey) {
    membersByKey.set(
      key,
      [...list].sort((a, b) => {
        const as = a.logicalTestSequence ?? Number.MAX_SAFE_INTEGER;
        const bs = b.logicalTestSequence ?? Number.MAX_SAFE_INTEGER;
        if (as !== bs) return as - bs;
        return a.id.localeCompare(b.id);
      }),
    );
  }

  const emitted = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.logicalTestKey;
    if (key === null) {
      out.push(item);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push(...(membersByKey.get(key) ?? [item]));
  }
  return out;
}

/**
 * Members of one logical test, keyed by `logicalTestKey`, in sequence order.
 * Parameters with a NULL key are absent from the map — they are not a group of
 * one, they are simply ungrouped.
 */
export function groupByLogicalTest<T extends LogicalTestOrderable>(
  items: readonly T[],
): Map<string, T[]> {
  const ordered = orderByLogicalTest(items);
  const out = new Map<string, T[]>();
  for (const item of ordered) {
    if (item.logicalTestKey === null) continue;
    const list = out.get(item.logicalTestKey);
    if (list) list.push(item);
    else out.set(item.logicalTestKey, [item]);
  }
  return out;
}
