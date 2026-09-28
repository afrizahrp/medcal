"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../../../components/access-denied";
import { formPageClass, formSurfaceClass, formatQty, isPositiveIntegerQty, selectClassName } from "../../../quotations/quotations-ui";
import { usePurchaseOrder, usePurchaseOrderAllocationSummary } from "../../use-purchase-orders-query";
import { canCreateWorkOrderFromPurchaseOrder } from "../../../work-orders/work-order-form-utils";
import { formatWorkOrderApiError } from "../../../work-orders/work-order-form-utils";
import { PageHeader, Surface } from "../../../work-orders/work-orders-ui";
import { useCreateWorkOrder } from "../../../work-orders/use-work-orders-query";

/**
 * Allocation & Multi-WOL Architecture (Phase 7 — Plan WOL/SPK UI).
 * See docs/audits/final-po-allocation-wol-spk-architecture-decision.md §7:
 * "A 'Plan WOL/SPK' screen can let an operator stage several proposed
 * WorkOrder/item/quantity groupings entirely client-side (unpersisted)...
 * the batch can be sequential or a single larger transaction, an
 * implementation detail, not an architectural one."
 *
 * This screen stages N groups (each becoming one WorkOrder) purely in React
 * state — nothing is persisted until "Submit Plan" is pressed, and each
 * group's own WorkOrder+Allocation creation is atomic (existing,
 * unmodified WorkOrdersService.create()). Groups are submitted sequentially;
 * a failed group's error is shown inline and it stays staged for retry,
 * while succeeded groups are removed and listed as created Work Orders —
 * partial success is always shown honestly, never hidden behind a false
 * "all or nothing" claim across the whole plan.
 */

interface PlanRow {
  id: string;
  purchaseOrderItemId: string;
  qty: string;
}

interface PlanGroup {
  id: string;
  rows: PlanRow[];
  error: string | null;
}

interface CreatedWorkOrder {
  id: string;
  number: string;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyGroup(): PlanGroup {
  return { id: randomId(), rows: [{ id: randomId(), purchaseOrderItemId: "", qty: "" }], error: null };
}

export default function PlanWolPage() {
  const params = useParams<{ id: string }>();
  const purchaseOrderId = params.id;
  const { capabilities } = useAuthz();

  const purchaseOrderQuery = usePurchaseOrder(purchaseOrderId);
  const summaryQuery = usePurchaseOrderAllocationSummary(
    capabilities?.purchaseOrderRead ? purchaseOrderId : undefined,
  );
  const createMutation = useCreateWorkOrder();

  const [groups, setGroups] = useState<PlanGroup[]>([emptyGroup()]);
  const [createdWorkOrders, setCreatedWorkOrders] = useState<CreatedWorkOrder[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (!capabilities?.workOrderCreate || !capabilities?.purchaseOrderRead) {
    return <AccessDenied />;
  }
  if (isForbidden(purchaseOrderQuery.error) || isForbidden(summaryQuery.error)) {
    return <AccessDenied />;
  }

  if (purchaseOrderQuery.isLoading || summaryQuery.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (purchaseOrderQuery.error instanceof ApiError && purchaseOrderQuery.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Purchase Order tidak ditemukan"
          crumbs={[{ href: "/", label: "Dashboard" }, { href: "/purchase-orders", label: "Purchase Orders" }]}
        />
      </div>
    );
  }

  const purchaseOrder = purchaseOrderQuery.data;
  const summary = summaryQuery.data;
  if (!purchaseOrder || !summary) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat data alokasi purchase order.</p>
      </div>
    );
  }

  const eligible = canCreateWorkOrderFromPurchaseOrder(purchaseOrder);

  function stagedQtyForItem(itemId: string): number {
    let total = 0;
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.purchaseOrderItemId === itemId && isPositiveIntegerQty(row.qty)) {
          total += Number(row.qty);
        }
      }
    }
    return total;
  }

  const itemsById = new Map(summary!.items.map((item) => [item.purchaseOrderItemId, item]));

  function liveRemaining(itemId: string): number {
    const item = itemsById.get(itemId);
    if (!item) return 0;
    return item.remainingQty - stagedQtyForItem(itemId);
  }

  function updateGroup(groupId: string, updater: (group: PlanGroup) => PlanGroup) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? updater(g) : g)));
  }

  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
  }

  function removeGroup(groupId: string) {
    setGroups((prev) => (prev.length > 1 ? prev.filter((g) => g.id !== groupId) : prev));
  }

  function addRow(groupId: string) {
    updateGroup(groupId, (g) => ({
      ...g,
      rows: [...g.rows, { id: randomId(), purchaseOrderItemId: "", qty: "" }],
    }));
  }

  function removeRow(groupId: string, rowId: string) {
    updateGroup(groupId, (g) => ({
      ...g,
      rows: g.rows.length > 1 ? g.rows.filter((r) => r.id !== rowId) : g.rows,
    }));
  }

  function setRow(groupId: string, rowId: string, patch: Partial<PlanRow>) {
    updateGroup(groupId, (g) => ({
      ...g,
      rows: g.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  }

  function validGroupItems(group: PlanGroup): { purchaseOrderItemId: string; qty: number }[] {
    return group.rows
      .filter((row) => row.purchaseOrderItemId && isPositiveIntegerQty(row.qty))
      .map((row) => ({ purchaseOrderItemId: row.purchaseOrderItemId, qty: Number(row.qty) }));
  }

  const hasAnyStagedGroup = groups.some((g) => validGroupItems(g).length > 0);
  const hasOverStagedItem = summary!.items.some((item) => liveRemaining(item.purchaseOrderItemId) < 0);

  async function submitPlan() {
    setSubmitting(true);
    const remainingGroups: PlanGroup[] = [];
    const newlyCreated: CreatedWorkOrder[] = [];

    for (const group of groups) {
      const items = validGroupItems(group);
      if (items.length === 0) {
        // Nothing staged in this group — drop it silently, nothing to submit.
        continue;
      }
      try {
        const result = await createMutation.mutateAsync({ purchaseOrderId, items });
        newlyCreated.push({ id: result.id, number: result.number });
      } catch (err) {
        const formatted = formatWorkOrderApiError(err, "Gagal membuat Work Order untuk grup ini.");
        remainingGroups.push({ ...group, error: formatted.message });
      }
    }

    setCreatedWorkOrders((prev) => [...prev, ...newlyCreated]);
    setGroups(remainingGroups.length > 0 ? remainingGroups : [emptyGroup()]);
    setSubmitting(false);
    await summaryQuery.refetch();
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="Plan WOL/SPK"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/purchase-orders", label: "Purchase Orders" },
          { href: `/purchase-orders/${purchaseOrder.id}`, label: purchaseOrder.number },
          { label: "Plan WOL/SPK" },
        ]}
      />

      <Surface className={formSurfaceClass}>
        {!eligible ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Purchase Order ini belum APPROVED, sehingga Work Order tidak dapat dibuat.
          </p>
        ) : null}

        <p className="mb-4 text-sm text-slate-600">
          Bagi item Purchase Order <span className="font-mono">{purchaseOrder.number}</span> ke
          satu atau lebih Work Order (WOL/SPK). Setiap grup di bawah akan menjadi satu Work Order
          terpisah — beberapa Work Order aktif untuk satu PO kini didukung. Rencana ini hanya
          tersimpan di layar ini sampai Anda menekan &quot;Submit Plan&quot;.
        </p>

        {createdWorkOrders.length > 0 ? (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-medium text-emerald-800">Work Order berhasil dibuat:</p>
            <ul className="mt-2 space-y-1">
              {createdWorkOrders.map((wo) => (
                <li key={wo.id}>
                  <Link
                    href={`/work-orders/${wo.id}`}
                    className="font-mono text-sm text-brand-700 hover:underline"
                  >
                    {wo.number}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <h2 className="text-base font-semibold text-slate-900">Item Purchase Order</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Sudah Dialokasikan</th>
                <th className="py-2 pr-3 text-right">Sisa</th>
                <th className="py-2 text-right">Sisa Setelah Rencana</th>
              </tr>
            </thead>
            <tbody>
              {summary!.items.map((item) => {
                const remaining = liveRemaining(item.purchaseOrderItemId);
                return (
                  <tr key={item.purchaseOrderItemId} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{item.description}</td>
                    <td className="py-2 pr-3 text-right">{formatQty(item.qty)}</td>
                    <td className="py-2 pr-3 text-right">{formatQty(item.allocatedQty)}</td>
                    <td className="py-2 pr-3 text-right">{formatQty(item.remainingQty)}</td>
                    <td
                      className={cn(
                        "py-2 text-right font-medium",
                        remaining < 0 ? "text-red-600" : "text-slate-900",
                      )}
                    >
                      {formatQty(remaining)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-8 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Rencana Work Order</h2>
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">WOL/SPK #{groupIndex + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGroup(group.id)}
                  disabled={groups.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus Grup
                </Button>
              </div>

              {group.error ? (
                <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {group.error}
                </p>
              ) : null}

              <div className="space-y-2">
                {group.rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.purchaseOrderItemId}
                      onChange={(e) => setRow(group.id, row.id, { purchaseOrderItemId: e.target.value })}
                      className={cn(selectClassName, "min-w-[220px] flex-1")}
                      aria-label="Item"
                    >
                      <option value="">Pilih item…</option>
                      {summary!.items.map((item) => (
                        <option key={item.purchaseOrderItemId} value={item.purchaseOrderItemId}>
                          {item.description} (sisa {formatQty(item.remainingQty)})
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={row.qty}
                      onChange={(e) => setRow(group.id, row.id, { qty: e.target.value })}
                      placeholder="Qty"
                      className="w-28"
                      aria-label="Qty"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(group.id, row.id)}
                      disabled={group.rows.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => addRow(group.id)}>
                <Plus className="h-4 w-4" />
                Tambah Item
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addGroup}>
            <Plus className="h-4 w-4" />
            Tambah WOL/SPK
          </Button>
        </div>

        {hasOverStagedItem ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Rencana ini mengalokasikan lebih dari sisa quantity pada satu atau lebih item. Kurangi
            qty sebelum submit — server akan tetap menolak alokasi berlebih meskipun validasi ini
            terlewat.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-6">
          <Button type="button" variant="outline" asChild>
            <Link href={`/purchase-orders/${purchaseOrder.id}`}>Selesai</Link>
          </Button>
          <Button
            type="button"
            onClick={submitPlan}
            disabled={!eligible || !hasAnyStagedGroup || hasOverStagedItem || submitting}
          >
            <Save className="h-4 w-4" />
            {submitting ? "Mengirim…" : "Submit Plan"}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
