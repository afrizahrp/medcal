import { Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatQty } from "../quotations/quotations-ui";
import { StatusBadge, selectClassName } from "./work-orders-ui";
import type { SharedSpkChild, SharedSpkDetail } from "./shared-spk-types";
import {
  childLockReason,
  computeAvailability,
  computeUnallocated,
  computeUsage,
  expectedChildNumber,
  isChildEditable,
  rowTotal,
  scheduleText,
  type PoItemAvailability,
  type RevisionAction,
  type RevisionRow,
  type RevisionState,
  type RevisionValidation,
} from "./shared-spk-revision";

export interface RevisionUser {
  id: string;
  label: string;
}

function technicianNames(child: SharedSpkChild): string {
  if (child.technicians.length === 0) return "—";
  return child.technicians.map((row) => row.name ?? row.email).join(", ");
}

/** A Child that has started / finished / been cancelled — shown, never editable. */
function LockedChildCard({ child }: { child: SharedSpkChild }) {
  return (
    <div
      data-child-id={child.id}
      data-locked="true"
      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium text-slate-800">{child.number}</span>
        <StatusBadge status={child.status} />
      </div>
      <dl className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-400">Teknisi</dt>
          <dd>{technicianNames(child)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Jadwal</dt>
          <dd>
            {scheduleText(child.scheduledStart?.slice(0, 10) ?? "", child.scheduledEnd?.slice(0, 10) ?? "")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Alokasi</dt>
          <dd className="tabular-nums">{formatQty(child.progress.total)} unit</dd>
        </div>
      </dl>
      <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500">
        <Lock className="h-3.5 w-3.5" />
        Terkunci — {childLockReason(child)}
      </p>
    </div>
  );
}

function RevisionRowCard({
  row,
  parent,
  items,
  users,
  state,
  validation,
  availability,
  dispatch,
  onRequestRemove,
  disabled,
  deliveryNoteIssued,
}: {
  row: RevisionRow;
  parent: SharedSpkDetail;
  items: PoItemAvailability[];
  users: RevisionUser[];
  state: RevisionState;
  validation: RevisionValidation;
  availability: Record<string, number>;
  dispatch: (action: RevisionAction) => void;
  onRequestRemove: (key: string) => void;
  disabled: boolean;
  deliveryNoteIssued: boolean;
}) {
  const isNew = row.workOrderId === null;
  const used = computeUsage(state);
  const labelOf = new Map(items.map((item) => [item.purchaseOrderItemId, item.label]));
  const rowItemIds = Object.keys(row.qty).sort((a, b) =>
    (labelOf.get(a) ?? a).localeCompare(labelOf.get(b) ?? b),
  );
  // Items that can still be added to this Child: something left to hand out and not already listed.
  const addable = items.filter(
    (item) =>
      !(item.purchaseOrderItemId in row.qty) &&
      (availability[item.purchaseOrderItemId] ?? 0) - (used[item.purchaseOrderItemId] ?? 0) > 0,
  );
  const errors = validation.byRow[row.key] ?? [];
  const title = isNew
    ? `SPK Child baru${(() => {
        const expected = expectedChildNumber(parent, state, row.key);
        return expected ? ` · ${expected}` : "";
      })()}`
    : (row.number ?? row.key);

  return (
    <div
      data-child-id={row.workOrderId ?? row.key}
      data-locked="false"
      data-removed={row.removed ? "true" : "false"}
      className={cn(
        "rounded-lg border p-3",
        row.removed ? "border-red-200 bg-red-50/40 opacity-80" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("font-mono text-sm font-medium text-slate-900", row.removed && "line-through")}>
            {title}
          </span>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
            {isNew ? "Baru" : "Dapat direvisi"}
          </span>
          {row.removed ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
              Akan dibatalkan
            </span>
          ) : null}
        </div>
        {row.removed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => dispatch({ type: "toggleRemove", key: row.key })}
          >
            <RotateCcw className="h-4 w-4" />
            Pulihkan
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || deliveryNoteIssued}
            title={
              deliveryNoteIssued
                ? "Batalkan Surat Jalan (DLN) SPK Child ini terlebih dahulu."
                : undefined
            }
            onClick={() => (isNew ? dispatch({ type: "toggleRemove", key: row.key }) : onRequestRemove(row.key))}
          >
            <Trash2 className="h-4 w-4" />
            {isNew ? "Hapus" : "Batalkan SPK Child"}
          </Button>
        )}
      </div>

      {row.removed ? (
        <p className="mt-2 text-sm text-red-700">
          SPK Child ini akan dibatalkan; {formatQty(rowTotal(row.original ?? row))} unit dilepas kembali ke
          Purchase Order. Nomornya tetap tercatat dan tidak dipakai ulang.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-slate-600">
              Teknisi
              <select
                aria-label={`Teknisi ${title}`}
                value={row.technicianUserId}
                disabled={disabled}
                onChange={(event) =>
                  dispatch({ type: "setTechnician", key: row.key, technicianUserId: event.target.value })
                }
                className={cn(selectClassName, "mt-1 block w-full")}
              >
                <option value="">Pilih teknisi…</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            <DateField
              label="Jadwal Mulai"
              value={row.start}
              disabled={disabled}
              onChange={(start) => dispatch({ type: "setSchedule", key: row.key, start })}
              aria-label={`Jadwal mulai ${title}`}
            />
            <DateField
              label="Jadwal Selesai"
              value={row.end}
              disabled={disabled}
              onChange={(end) => dispatch({ type: "setSchedule", key: row.key, end })}
              aria-label={`Jadwal selesai ${title}`}
            />
          </div>
          {row.technicianCount > 1 ? (
            <p className="mt-1 text-xs text-amber-700">
              SPK Child ini memiliki lebih dari satu teknisi; menyimpan revisi menggantikannya dengan satu
              teknisi yang dipilih.
            </p>
          ) : null}

          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Alokasi · {formatQty(rowTotal(row))} unit
            </p>
            {rowItemIds.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Belum ada item.</p>
            ) : (
              <ul className="mt-1 space-y-1.5">
                {rowItemIds.map((itemId) => (
                  <li key={itemId} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {labelOf.get(itemId) ?? itemId}
                    </span>
                    <span className="text-xs text-slate-400">
                      tersedia {formatQty(availability[itemId] ?? 0)}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={row.qty[itemId] ?? 0}
                      disabled={disabled}
                      aria-label={`Jumlah ${labelOf.get(itemId) ?? itemId} ${title}`}
                      onChange={(event) =>
                        dispatch({ type: "setQty", key: row.key, itemId, qty: Number(event.target.value) })
                      }
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label={`Hapus item ${labelOf.get(itemId) ?? itemId} dari ${title}`}
                      onClick={() => dispatch({ type: "setQty", key: row.key, itemId, qty: 0 })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {validation.byItem[itemId] ? (
                      <p className="basis-full text-xs text-red-600">{validation.byItem[itemId]}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {addable.length > 0 ? (
              <label className="mt-2 block text-sm text-slate-600">
                Tambah item
                <select
                  aria-label={`Tambah item ${title}`}
                  value=""
                  disabled={disabled}
                  onChange={(event) => {
                    if (event.target.value) {
                      dispatch({ type: "addItem", key: row.key, itemId: event.target.value });
                    }
                  }}
                  className={cn(selectClassName, "mt-1 block w-full")}
                >
                  <option value="">Pilih item…</option>
                  {addable.map((item) => (
                    <option key={item.purchaseOrderItemId} value={item.purchaseOrderItemId}>
                      {item.label} (sisa{" "}
                      {formatQty(
                        (availability[item.purchaseOrderItemId] ?? 0) - (used[item.purchaseOrderItemId] ?? 0),
                      )}
                      )
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {errors.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-red-600">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Revision editor for a shared ON_SITE job. Revision is per Child: started,
 * done and cancelled Children stay visible but read-only (no inputs, no cancel);
 * only unstarted Children — plus any new Child — expose controls. Presentational:
 * all state lives in the caller (see shared-spk-revision.ts).
 */
export function SharedSpkRevisionEditor({
  parent,
  items,
  users,
  state,
  validation,
  dispatch,
  onRequestRemove,
  disabled = false,
}: {
  parent: SharedSpkDetail;
  items: PoItemAvailability[];
  users: RevisionUser[];
  state: RevisionState;
  validation: RevisionValidation;
  dispatch: (action: RevisionAction) => void;
  /** Cancelling an existing Child needs confirmation, owned by the caller. */
  onRequestRemove: (key: string) => void;
  disabled?: boolean;
}) {
  const lockedChildren = parent.children.filter((child) => !isChildEditable(child));
  const availability = computeAvailability(items, parent);
  const unallocated = computeUnallocated(availability, state);
  const childById = new Map(parent.children.map((child) => [child.id, child]));

  return (
    <div className="space-y-6">
      {lockedChildren.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">
            SPK Child terkunci ({lockedChildren.length})
          </h3>
          <div className="space-y-2">
            {lockedChildren.map((child) => (
              <LockedChildCard key={child.id} child={child} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            SPK Child yang dapat direvisi ({state.rows.length})
          </h3>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => dispatch({ type: "addChild" })}>
            <Plus className="h-4 w-4" />
            Tambah SPK Child
          </Button>
        </div>
        {state.rows.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada SPK Child yang dapat direvisi.</p>
        ) : (
          <div className="space-y-3">
            {state.rows.map((row) => (
              <RevisionRowCard
                key={row.key}
                row={row}
                parent={parent}
                items={items}
                users={users}
                state={state}
                validation={validation}
                availability={availability}
                dispatch={dispatch}
                onRequestRemove={onRequestRemove}
                disabled={disabled}
                deliveryNoteIssued={
                  row.workOrderId !== null &&
                  childById.get(row.workOrderId)?.deliveryNote?.status === "ISSUED"
                }
              />
            ))}
          </div>
        )}
        <p className="text-sm text-slate-600">
          Sisa belum dibagikan setelah revisi: <span className="font-medium tabular-nums">{formatQty(unallocated)}</span>{" "}
          unit
        </p>
      </section>
    </div>
  );
}
