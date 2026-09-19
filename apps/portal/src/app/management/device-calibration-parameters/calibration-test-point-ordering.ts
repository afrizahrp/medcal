/**
 * Pure ordering helper for the embedded "Titik Ukur" (Named Measurement
 * Points) list's move-up/move-down controls — Phase 4C. Given the current id
 * order (already sequence-ascending, as returned by the API) and one id to
 * move, return the new order with that id swapped with its immediate
 * neighbour. Returns the same array reference when the move is impossible
 * (id at the boundary already, or unknown id) so callers can skip a no-op
 * persist — same contract as reorderIds in device-calibration-parameter-ordering.ts.
 */
export function moveAdjacent(ids: string[], id: string, direction: "up" | "down"): string[] {
  const index = ids.indexOf(id);
  if (index === -1) return ids;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ids.length) return ids;

  const next = ids.slice();
  [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
  return next;
}
