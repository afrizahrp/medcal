/**
 * Pure ordering helper shared by the drag-and-drop UI and its unit test.
 * Given the current id order and a drag (activeId dropped onto overId), return
 * the new order. Returns the same array reference-equal to the input when
 * nothing moves so callers can skip a no-op persist.
 */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  if (activeId === overId) return ids;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

/** True when two id lists are the same length and same order. */
export function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}
