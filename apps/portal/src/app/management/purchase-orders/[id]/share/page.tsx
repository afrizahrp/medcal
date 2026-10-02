"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../../../components/access-denied";
import {
  formPageClass,
  formSurfaceClass,
  formatQty,
  selectClassName,
} from "../../../quotations/quotations-ui";
import {
  usePurchaseOrder,
  usePurchaseOrderAllocationSummary,
} from "../../use-purchase-orders-query";
import {
  canCreateWorkOrderFromPurchaseOrder,
  formatWorkOrderApiError,
} from "../../../work-orders/work-order-form-utils";
import { PageHeader, Surface } from "../../../work-orders/work-orders-ui";
import {
  useAssignableUsers,
  useCreateSharedSpk,
} from "../../../work-orders/use-work-orders-query";
import type { SharedSpkDetail } from "../../../work-orders/shared-spk-types";
import { DateField } from "@/components/ui/date-field";
import {
  moveUnits,
  planForMember,
  recommendDistribution,
  validateDistribution,
  workloadSummary,
  type WorkloadDistribution,
  type WorkloadUnit,
} from "../../workload-distribution";

const DEVICE_PREVIEW_COUNT = 5;

function workloadSpread(rows: { total: number }[]): number {
  if (rows.length === 0) return 0;
  const loads = rows.map((row) => row.total);
  return Math.max(...loads) - Math.min(...loads);
}

function workloadPercent(total: number, grandTotal: number): string {
  if (grandTotal <= 0) return "0%";
  const rounded = Math.round((total / grandTotal) * 1000) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

function memberBalanceLabel(total: number, rows: { total: number }[]): string {
  const loads = rows.map((row) => row.total);
  const max = Math.max(...loads);
  const min = Math.min(...loads);
  if (total === max && total !== min) return "Beban lebih tinggi";
  if (total === min && total !== max) return "Beban lebih rendah";
  return "Beban seimbang";
}

/** A planned (not yet persisted) schedule for one Child, as `YYYY-MM-DD` strings. */
interface ChildSchedule {
  start: string;
  end: string;
}

export default function ShareWorkloadPage() {
  const params = useParams<{ id: string }>();
  const purchaseOrderId = params.id;
  const { capabilities } = useAuthz();

  const purchaseOrderQuery = usePurchaseOrder(purchaseOrderId);
  const summaryQuery = usePurchaseOrderAllocationSummary(
    capabilities?.purchaseOrderRead ? purchaseOrderId : undefined,
  );
  const usersQuery = useAssignableUsers(Boolean(capabilities?.workOrderAssign));
  const createMutation = useCreateSharedSpk();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [distribution, setDistribution] = useState<WorkloadDistribution>({});
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [moveQty, setMoveQty] = useState("1");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Per-Child planned schedule, keyed by team member. Nothing is persisted until "Lanjut".
  const [schedules, setSchedules] = useState<Record<string, ChildSchedule>>({});
  const [created, setCreated] = useState<SharedSpkDetail | null>(null);
  const [showAllDevices, setShowAllDevices] = useState<Record<string, boolean>>({});
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  const purchaseOrder = purchaseOrderQuery.data;
  const summary = summaryQuery.data;

  const units = useMemo<WorkloadUnit[]>(() => {
    if (!purchaseOrder || !summary) return [];
    const byId = new Map(purchaseOrder.items.map((item) => [item.id, item]));
    return summary.items
      .filter((item) => item.remainingQty > 0)
      .map((item) => {
        const source = byId.get(item.purchaseOrderItemId);
        const deviceType = source?.quotationItem?.requestItem?.deviceType;
        return {
          id: item.purchaseOrderItemId,
          deviceKey: deviceType?.id ?? item.purchaseOrderItemId,
          deviceLabel: deviceType?.name ?? item.description,
          qty: item.remainingQty,
        };
      });
  }, [purchaseOrder, summary]);

  const totalUnits = units.reduce((sum, unit) => sum + unit.qty, 0);

  useEffect(() => {
    setReviewing(false);
    setMoveError(null);
    if (selectedIds.length === 0) {
      setDistribution({});
      return;
    }
    setDistribution(recommendDistribution(units, selectedIds));
  }, [selectedIds, units]);

  const users = (usersQuery.data?.data ?? []).filter(
    (user) => user.status === "ACTIVE" && user.membership && user.membership.role !== "CUSTOMER",
  );
  const nameById = new Map(users.map((user) => [user.id, user.name ?? user.email]));
  const summaryRows = workloadSummary(distribution, units, selectedIds);
  const distributionError = validateDistribution(distribution, units, selectedIds);
  // Every Child must receive work, and a shared job needs at least two Children.
  const workingMemberIds = selectedIds
    .filter((memberId) => planForMember(distribution, memberId).length > 0)
    .sort((a, b) => a.localeCompare(b));
  const scheduleError = workingMemberIds.some((memberId) => {
    const schedule = schedules[memberId];
    return Boolean(schedule?.start && schedule?.end && schedule.end < schedule.start);
  })
    ? "Tanggal selesai tidak boleh sebelum tanggal mulai."
    : null;
  const validationError =
    distributionError ??
    (workingMemberIds.length < 2
      ? "Pembagian bersama membutuhkan minimal dua anggota tim yang mendapat pekerjaan."
      : null) ??
    scheduleError;
  const isOnSite = purchaseOrder?.quotation.request?.serviceMode === "ON_SITE";
  const deviceOptions = [
    ...new Map(
      units.map((unit) => {
        const source = purchaseOrder?.items.find((item) => item.id === unit.id);
        const code = source?.quotationItem?.requestItem?.deviceType?.code ?? "";
        return [unit.deviceKey, { label: unit.deviceLabel, code }] as const;
      }),
    ).entries(),
  ].sort((a, b) => a[1].label.localeCompare(b[1].label));
  const selectedDevice = deviceOptions.find(([key]) => key === deviceKey)?.[1];

  if (!capabilities?.workOrderCreate || !capabilities?.purchaseOrderRead || !capabilities?.workOrderAssign) {
    return <AccessDenied />;
  }
  if (isForbidden(purchaseOrderQuery.error) || isForbidden(summaryQuery.error) || isForbidden(usersQuery.error)) {
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
  if (!purchaseOrder || !summary) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat data alokasi purchase order.</p>
      </div>
    );
  }

  const eligible = canCreateWorkOrderFromPurchaseOrder(purchaseOrder) && isOnSite;

  function toggleMember(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id],
    );
  }

  function applyMove() {
    setMoveError(null);
    const qty = Number(moveQty);
    const result = moveUnits(distribution, units, fromId, toId, qty, deviceKey || undefined);
    if (!result.ok) {
      setMoveError(result.message);
      return;
    }
    setDistribution(result.distribution);
  }

  function setSchedule(memberId: string, patch: Partial<ChildSchedule>) {
    setSchedules((current) => ({
      ...current,
      [memberId]: { ...(current[memberId] ?? { start: "", end: "" }), ...patch },
    }));
  }

  /**
   * "Lanjut": ONE atomic server request creates the Parent SPK and every Child
   * SPK (technician, allocated batch, schedule). Nothing exists before this —
   * editing the distribution never creates anything — and a failure creates
   * nothing at all.
   */
  async function confirmShare() {
    if (validationError || !eligible || created) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const parent = await createMutation.mutateAsync({
        purchaseOrderId,
        children: workingMemberIds.map((memberId) => ({
          technicianUserId: memberId,
          items: planForMember(distribution, memberId),
          scheduledStart: schedules[memberId]?.start || undefined,
          scheduledEnd: schedules[memberId]?.end || undefined,
        })),
      });
      setCreated(parent);
      await summaryQuery.refetch();
    } catch (err) {
      setSubmitError(
        formatWorkOrderApiError(err, "Gagal membuat SPK bersama. Tidak ada SPK yang dibuat.").message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="SPK Bersama Dibuat"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/purchase-orders", label: "Purchase Orders" },
            { href: `/purchase-orders/${purchaseOrder.id}`, label: purchaseOrder.number },
            { label: created.number },
          ]}
        />
        <Surface className={formSurfaceClass}>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-medium text-emerald-800">
              SPK bersama berhasil dibuat:{" "}
              <Link
                href={`/work-orders/shared/${created.id}`}
                className="font-mono text-brand-700 hover:underline"
              >
                {created.number}
              </Link>
            </p>
            <ul className="mt-2 space-y-1">
              {created.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/work-orders/${child.id}`}
                    className="font-mono text-sm text-brand-700 hover:underline"
                  >
                    {child.number}
                  </Link>
                  <span className="text-sm text-slate-600">
                    {" "}
                    · {child.technicians.map((row) => row.name ?? row.email).join(", ")} ·{" "}
                    {formatQty(child.progress.total)} unit
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" asChild>
              <Link href={`/purchase-orders/${purchaseOrder.id}`}>Kembali ke PO</Link>
            </Button>
            <Button type="button" asChild>
              <Link href={`/work-orders/shared/${created.id}`}>Buka SPK Induk</Link>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="Bagikan Pekerjaan"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/purchase-orders", label: "Purchase Orders" },
          { href: `/purchase-orders/${purchaseOrder.id}`, label: purchaseOrder.number },
          { label: "Bagikan Pekerjaan" },
        ]}
      />

      <Surface className={formSurfaceClass}>
        {!isOnSite ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Bagikan Pekerjaan hanya tersedia untuk Purchase Order ON_SITE (SPK).
          </p>
        ) : !canCreateWorkOrderFromPurchaseOrder(purchaseOrder) ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Purchase Order ini belum APPROVED, sehingga Work Order tidak dapat dibuat.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {formatQty(totalUnits)} unit kalibrasi
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {selectedIds.length === 0
                ? "Pilih anggota tim untuk melihat pembagian."
                : `Dibagikan ke ${selectedIds.length} anggota tim`}
            </p>
          </div>
          <Button type="button" variant="outline" asChild>
            <Link href={`/purchase-orders/${purchaseOrder.id}`}>Kembali ke PO</Link>
          </Button>
        </div>

        {totalUnits === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Tidak ada unit tersisa untuk dibagikan.</p>
        ) : (
          <>
            <h3 className="mt-6 text-sm font-semibold text-slate-900">Pilih Anggota Tim</h3>
            {usersQuery.isLoading ? (
              <p className="mt-2 text-sm text-slate-400">Memuat…</p>
            ) : usersQuery.isError ? (
              <p className="mt-2 text-sm text-red-600">Gagal memuat daftar anggota.</p>
            ) : users.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Tidak ada anggota aktif yang dapat ditugaskan.</p>
            ) : (
              <CommandPopover
                open={memberPickerOpen}
                onOpenChange={setMemberPickerOpen}
                searchPlaceholder="Cari anggota…"
                emptyLabel="Anggota tidak ditemukan."
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={memberPickerOpen}
                    aria-label="Pilih Anggota Tim"
                    disabled={submitting}
                    className="mt-2 w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedIds.length === 0
                        ? "Pilih Anggota Tim"
                        : `${selectedIds.length} anggota dipilih`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                }
              >
                <CommandGroup>
                  {users.map((user) => {
                    const label = user.name ?? user.email;
                    const checked = selectedIds.includes(user.id);
                    return (
                      <CommandItem
                        key={user.id}
                        value={`${label} ${user.email}`}
                        onSelect={() => toggleMember(user.id)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandPopover>
            )}

            {selectedIds.length > 0 ? (
              <>
                {!reviewing ? (
                  <div className="mt-6 rounded-md border border-slate-200 p-3">
                    <h3 className="text-sm font-semibold text-slate-900">Pindahkan Pekerjaan</h3>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="text-sm text-slate-600">
                        Dari
                        <select
                          value={fromId}
                          onChange={(event) => setFromId(event.target.value)}
                          className={cn(selectClassName, "mt-1 block")}
                        >
                          <option value="">Pilih…</option>
                          {summaryRows.map((row) => (
                            <option key={row.memberId} value={row.memberId}>
                              {nameById.get(row.memberId) ?? row.memberId}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm text-slate-600">
                        Ke
                        <select
                          value={toId}
                          onChange={(event) => setToId(event.target.value)}
                          className={cn(selectClassName, "mt-1 block")}
                        >
                          <option value="">Pilih…</option>
                          {summaryRows.map((row) => (
                            <option key={row.memberId} value={row.memberId}>
                              {nameById.get(row.memberId) ?? row.memberId}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="text-sm text-slate-600">
                        Jenis
                        <CommandPopover
                          open={devicePickerOpen}
                          onOpenChange={setDevicePickerOpen}
                          searchPlaceholder="Cari jenis alat…"
                          emptyLabel="Jenis tidak ditemukan."
                          trigger={
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={devicePickerOpen}
                              aria-label="Jenis"
                              disabled={submitting}
                              className="mt-1 w-64 justify-between font-normal"
                            >
                              <span className="truncate">{selectedDevice?.label ?? "Semua jenis"}</span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          }
                        >
                          <CommandGroup>
                            <CommandItem
                              value="Semua jenis"
                              onSelect={() => {
                                setDeviceKey("");
                                setDevicePickerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", deviceKey === "" ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">Semua jenis</span>
                            </CommandItem>
                            {deviceOptions.map(([key, option]) => (
                              <CommandItem
                                key={key}
                                value={`${option.label} ${option.code}`}
                                onSelect={() => {
                                  setDeviceKey(key);
                                  setDevicePickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn("mr-2 h-4 w-4", deviceKey === key ? "opacity-100" : "opacity-0")}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">{option.label}</p>
                                  {option.code ? (
                                    <p className="truncate font-mono text-xs text-slate-500">{option.code}</p>
                                  ) : null}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandPopover>
                      </div>
                      <label className="text-sm text-slate-600">
                        Jumlah
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={moveQty}
                          onChange={(event) => setMoveQty(event.target.value)}
                          className="mt-1 w-24"
                        />
                      </label>
                      <Button type="button" variant="outline" onClick={applyMove} disabled={submitting}>
                        Pindahkan
                      </Button>
                    </div>
                    {moveError ? <p className="mt-2 text-sm text-red-600">{moveError}</p> : null}
                  </div>
                ) : null}

                <h3 className="mt-6 text-sm font-semibold text-slate-900">Pembagian Pekerjaan</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {formatQty(totalUnits)} unit · {selectedIds.length} anggota · Selisih maksimum{" "}
                  {formatQty(workloadSpread(summaryRows))} unit
                </p>
                <Accordion type="multiple" className="mt-3 grid gap-2 sm:grid-cols-2">
                  {summaryRows.map((row) => {
                    const visibleDevices = showAllDevices[row.memberId]
                      ? row.devices
                      : row.devices.slice(0, DEVICE_PREVIEW_COUNT);
                    const hiddenCount = row.devices.length - visibleDevices.length;
                    return (
                      <AccordionItem
                        key={row.memberId}
                        value={row.memberId}
                        className="rounded-lg border border-slate-200 border-b-0 px-3"
                      >
                        <AccordionTrigger className="group py-3 hover:no-underline">
                          <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                            <span className="text-sm font-medium text-slate-900">
                              {nameById.get(row.memberId) ?? row.memberId}
                            </span>
                            <span className="text-sm text-slate-700">
                              {formatQty(row.total)} unit · {workloadPercent(row.total, totalUnits)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              {workloadSpread(summaryRows) <= 1 ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  Beban seimbang
                                </>
                              ) : (
                                memberBalanceLabel(row.total, summaryRows)
                              )}
                            </span>
                            <span className="text-xs font-medium text-brand-700 group-data-[state=open]:hidden">
                              Lihat detail
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          {row.devices.length === 0 ? (
                            <p className="text-sm text-slate-500">Tidak ada unit untuk anggota ini.</p>
                          ) : (
                            <ul className="space-y-1">
                              {visibleDevices.map((device) => (
                                <li
                                  key={device.deviceKey}
                                  className="flex items-baseline justify-between gap-3 text-sm"
                                >
                                  <span className="text-slate-700">{device.deviceLabel}</span>
                                  <span className="tabular-nums text-slate-900">{formatQty(device.qty)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {hiddenCount > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-2 h-auto px-0"
                              onClick={() =>
                                setShowAllDevices((current) => ({ ...current, [row.memberId]: true }))
                              }
                            >
                              Lihat semua {row.devices.length} jenis alat
                            </Button>
                          ) : null}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>

                {reviewing ? (
                  <div className="mt-6 rounded-md border border-slate-200 p-3">
                    <h3 className="text-sm font-semibold text-slate-900">Tinjau pembagian</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Setiap anggota tim di bawah ini akan menjadi satu SPK yang dapat dijalankan sendiri,
                      lengkap dengan jadwal rencananya. Jadwal bersifat rencana, bukan realisasi.
                    </p>
                    <ul className="mt-3 space-y-3">
                      {summaryRows
                        .filter((row) => row.total > 0)
                        .map((row, index) => (
                          <li
                            key={row.memberId}
                            className="rounded-md border border-slate-200 p-3 text-sm text-slate-700"
                          >
                            <p className="font-medium text-slate-900">
                              SPK {index + 1} · {nameById.get(row.memberId) ?? row.memberId}
                            </p>
                            <p className="mt-0.5 text-slate-600">
                              {formatQty(row.total)} unit
                              {row.devices.length > 0
                                ? ` · ${row.devices.map((d) => `${d.deviceLabel} ×${formatQty(d.qty)}`).join(", ")}`
                                : ""}
                            </p>
                            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                              <DateField
                                label="Jadwal Mulai"
                                value={schedules[row.memberId]?.start ?? ""}
                                onChange={(start) => setSchedule(row.memberId, { start })}
                                disabled={submitting}
                                aria-label={`Jadwal mulai ${nameById.get(row.memberId) ?? row.memberId}`}
                              />
                              <DateField
                                label="Jadwal Selesai"
                                value={schedules[row.memberId]?.end ?? ""}
                                onChange={(end) => setSchedule(row.memberId, { end })}
                                disabled={submitting}
                                aria-label={`Jadwal selesai ${nameById.get(row.memberId) ?? row.memberId}`}
                              />
                            </div>
                          </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-sm text-slate-600">
                      Total {formatQty(totalUnits)} unit
                      {validationError ? `. ${validationError}` : ". Semua unit terbagi tepat satu kali."}
                    </p>
                  </div>
                ) : null}

                {submitError ? (
                  <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
                ) : null}
                <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  {reviewing ? (
                    <Button type="button" variant="outline" onClick={() => setReviewing(false)} disabled={submitting}>
                      Kembali
                    </Button>
                  ) : null}
                  {!reviewing ? (
                    <Button type="button" onClick={() => setReviewing(true)} disabled={Boolean(distributionError) || !eligible}>
                      Tinjau
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={confirmShare}
                      disabled={Boolean(validationError) || !eligible || submitting}
                    >
                      {submitting ? "Membuat SPK…" : "Lanjut"}
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}
      </Surface>
    </div>
  );
}
