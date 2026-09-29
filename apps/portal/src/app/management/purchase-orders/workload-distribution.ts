/**
 * Deterministic split of remaining PO units across team members.
 * A "unit" is one quantity of a purchase-order item — the same count
 * WorkOrdersService later fans out into CalibrationJobs on start.
 * This module does not create work orders and does not read React state.
 */

export interface WorkloadUnit {
  id: string;
  deviceKey: string;
  deviceLabel: string;
  qty: number;
}

/** memberId → purchaseOrderItemId → qty */
export type WorkloadDistribution = Record<string, Record<string, number>>;

export interface DeviceSlice {
  deviceKey: string;
  deviceLabel: string;
  qty: number;
}

export interface MemberWorkload {
  memberId: string;
  total: number;
  devices: DeviceSlice[];
}

function sortedMembers(memberIds: string[]): string[] {
  return [...memberIds].sort((a, b) => a.localeCompare(b));
}

function sortedUnits(units: WorkloadUnit[]): WorkloadUnit[] {
  return [...units].sort(
    (a, b) => b.qty - a.qty || a.deviceKey.localeCompare(b.deviceKey) || a.id.localeCompare(b.id),
  );
}

function emptyDistribution(memberIds: string[], units: WorkloadUnit[]): WorkloadDistribution {
  const dist: WorkloadDistribution = {};
  for (const memberId of sortedMembers(memberIds)) {
    dist[memberId] = {};
    for (const unit of units) dist[memberId][unit.id] = 0;
  }
  return dist;
}

/**
 * Largest device lines first. Within a line, each unit goes to the member
 * with the lowest current total. Ties break toward the lexicographically
 * smaller member id, so the same input always yields the same split.
 * A device line may be split; balance is not sacrificed to keep it whole.
 */
export function recommendDistribution(
  units: WorkloadUnit[],
  memberIds: string[],
): WorkloadDistribution {
  const members = sortedMembers(memberIds);
  const dist = emptyDistribution(members, units);
  if (members.length === 0) return dist;

  const loads = new Map(members.map((id) => [id, 0]));
  for (const unit of sortedUnits(units)) {
    for (let n = 0; n < unit.qty; n += 1) {
      let chosen = members[0]!;
      let best = loads.get(chosen)!;
      for (const memberId of members) {
        const load = loads.get(memberId)!;
        if (load < best) {
          chosen = memberId;
          best = load;
        }
      }
      dist[chosen]![unit.id] = (dist[chosen]![unit.id] ?? 0) + 1;
      loads.set(chosen, best + 1);
    }
  }
  return dist;
}

export function memberTotal(dist: WorkloadDistribution, memberId: string): number {
  return Object.values(dist[memberId] ?? {}).reduce((sum, qty) => sum + qty, 0);
}

export function workloadSummary(
  dist: WorkloadDistribution,
  units: WorkloadUnit[],
  memberIds: string[],
): MemberWorkload[] {
  return sortedMembers(memberIds).map((memberId) => {
    const byDevice = new Map<string, DeviceSlice>();
    for (const unit of sortedUnits(units)) {
      const qty = dist[memberId]?.[unit.id] ?? 0;
      if (qty <= 0) continue;
      const existing = byDevice.get(unit.deviceKey);
      if (existing) existing.qty += qty;
      else byDevice.set(unit.deviceKey, { deviceKey: unit.deviceKey, deviceLabel: unit.deviceLabel, qty });
    }
    return {
      memberId,
      total: memberTotal(dist, memberId),
      devices: [...byDevice.values()].sort(
        (a, b) => b.qty - a.qty || a.deviceLabel.localeCompare(b.deviceLabel),
      ),
    };
  });
}

/**
 * Move `qty` units from one member to another. Optional deviceKey limits the
 * move to that device group. The move is all-or-nothing.
 */
export function moveUnits(
  dist: WorkloadDistribution,
  units: WorkloadUnit[],
  fromId: string,
  toId: string,
  qty: number,
  deviceKey?: string,
): { ok: true; distribution: WorkloadDistribution } | { ok: false; message: string } {
  if (fromId === toId) return { ok: false, message: "Pilih dua anggota yang berbeda." };
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, message: "Jumlah yang dipindahkan harus bilangan bulat positif." };
  }
  if (!dist[fromId] || !dist[toId]) {
    return { ok: false, message: "Anggota tidak ada dalam pembagian ini." };
  }

  const sources = sortedUnits(units).filter((unit) => !deviceKey || unit.deviceKey === deviceKey);
  const available = sources.reduce((sum, unit) => sum + (dist[fromId]?.[unit.id] ?? 0), 0);
  if (available < qty) {
    return { ok: false, message: "Jumlah yang dipindahkan melebihi beban anggota tersebut." };
  }

  const next: WorkloadDistribution = {};
  for (const [memberId, rows] of Object.entries(dist)) next[memberId] = { ...rows };

  let remaining = qty;
  for (const unit of sources) {
    if (remaining === 0) break;
    const have = next[fromId]![unit.id] ?? 0;
    const take = Math.min(have, remaining);
    next[fromId]![unit.id] = have - take;
    next[toId]![unit.id] = (next[toId]![unit.id] ?? 0) + take;
    remaining -= take;
  }
  return { ok: true, distribution: next };
}

export function validateDistribution(
  dist: WorkloadDistribution,
  units: WorkloadUnit[],
  memberIds: string[],
): string | null {
  if (memberIds.length === 0) return "Pilih minimal satu anggota tim.";
  const members = new Set(memberIds);
  for (const unit of units) {
    if (!Number.isInteger(unit.qty) || unit.qty < 0) return "Quantity item tidak valid.";
    let assigned = 0;
    for (const memberId of Object.keys(dist)) {
      if (!members.has(memberId)) return "Pembagian memuat anggota di luar tim yang dipilih.";
      const qty = dist[memberId]?.[unit.id] ?? 0;
      if (!Number.isInteger(qty) || qty < 0) return "Quantity pembagian tidak valid.";
      assigned += qty;
    }
    if (assigned !== unit.qty) {
      return assigned < unit.qty
        ? "Masih ada unit yang belum dibagikan."
        : "Ada unit yang terbagi lebih dari satu kali.";
    }
  }
  return null;
}

export function planForMember(
  dist: WorkloadDistribution,
  memberId: string,
): { purchaseOrderItemId: string; qty: number }[] {
  return Object.entries(dist[memberId] ?? {})
    .filter(([, qty]) => qty > 0)
    .map(([purchaseOrderItemId, qty]) => ({ purchaseOrderItemId, qty }))
    .sort((a, b) => a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId));
}
