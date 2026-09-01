/**
 * Pure ordering helpers for the WorkOrder equipment drag-and-drop list, shared
 * by the UI and its unit test. Mirrors the equipment-requirements ordering
 * helper — same dnd-kit pattern, scoped to one WorkOrder's equipment.
 *
 * The ids here are Equipment ids (WorkOrderEquipment.equipmentId), which is what
 * PATCH /work-orders/:id/equipment/order expects.
 */

/**
 * Given the current id order and a drag (activeId dropped onto overId), return
 * the new order. Returns the input array unchanged when nothing moves so callers
 * can skip a no-op persist.
 */
export function reorderEquipmentIds(ids: string[], activeId: string, overId: string): string[] {
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
export function sameEquipmentOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}
