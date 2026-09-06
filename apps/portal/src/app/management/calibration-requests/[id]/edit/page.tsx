"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Save, Trash2 } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandPopover } from "@/components/ui/command-popover";
import { toDateInputValue } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { AccessDenied } from "../../../../../components/access-denied";
import {
  PageHeader,
  Surface,
  formPageClass,
  formSurfaceClass,
  formActionsClass,
  selectClassName,
  SERVICE_MODE_OPTIONS,
  SERVICE_MODE_LABELS,
  AKD_AKL_DECLARATION_OPTIONS,
  AKD_AKL_DECLARATION_LABELS,
  DeviceTypeItemSelect,
  type ServiceMode,
  type CalibrationRequestRow,
  type DeviceTypeOption,
  type AkdAklDeclarationValue,
} from "../../calibration-requests-ui";
import {
  useCalibrationRequest,
  useUpdateCalibrationRequest,
} from "../../use-calibration-requests-query";
import { useCustomers } from "../../../customers/use-customers-query";
import { useDeviceTypes } from "../../../device-types/use-device-types-query";

interface ItemInput {
  deviceTypeId: string;
  customerDeviceName: string;
  model: string;
  deviceId: string;
  /** Aggregate quantity for the line. Carried through edits unchanged. */
  qty: number;
  /** Customer-declared AKD/AKL/NIE (Nomor Izin Edar). Optional. */
  akdAkl: string;
  /** Provenance of the declared AKD/AKL/NIE. */
  akdAklDeclaration: AkdAklDeclarationValue;
  notes: string;
}

const emptyItemInput = (): ItemInput => ({
  deviceTypeId: "",
  customerDeviceName: "",
  model: "",
  deviceId: "",
  qty: 1,
  akdAkl: "",
  akdAklDeclaration: "NOT_PROVIDED",
  notes: "",
});

function itemsFromRequest(request: CalibrationRequestRow): ItemInput[] {
  return request.items.map((item) => ({
    deviceTypeId: item.deviceTypeId,
    customerDeviceName: item.customerDeviceName ?? "",
    model: item.model ?? "",
    deviceId: item.deviceId ?? "",
    qty: item.qty ?? 1,
    akdAkl: item.akdAkl ?? "",
    akdAklDeclaration: item.akdAklDeclaration ?? "NOT_PROVIDED",
    notes: item.notes ?? "",
  }));
}

export default function EditCalibrationRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();

  const query = useCalibrationRequest(params.id);
  const updateMutation = useUpdateCalibrationRequest();

  const [customerId, setCustomerId] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("ON_SITE");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const customersQuery = useCustomers({
    search: "",
    status: "ACTIVE",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const customers = customersQuery.data?.data ?? [];
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const request = query.data;
  const deviceTypes: DeviceTypeOption[] = [
    ...(typesQuery.data?.data ?? []),
    ...(request?.items
      .map((item) => item.deviceType)
      .filter(
        (type, index, all) =>
          Boolean(type) &&
          all.findIndex((candidate) => candidate.id === type.id) === index &&
          !(typesQuery.data?.data ?? []).some((listed) => listed.id === type.id),
      ) ?? []),
  ];

  useEffect(() => {
    if (request && !initialized) {
      setCustomerId(request.customerId);
      setServiceMode(request.serviceMode);
      setExpectedDate(toDateInputValue(request.expectedDate));
      setNotes(request.notes ?? "");
      setItems(itemsFromRequest(request));
      setInitialized(true);
    }
  }, [request, initialized]);

  if (isForbidden(query.error) || !capabilities?.calibrationRequestUpdate) {
    return <AccessDenied />;
  }

  if (query.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Requisition tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-requests", label: "Requisitions" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Requisition tidak ditemukan.</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat requisition.</p>
      </div>
    );
  }

  if (request.status !== "DRAFT") {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Cannot Edit"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-requests", label: "Requisitions" },
            { href: `/calibration-requests/${request.id}`, label: request.number },
            { label: "Edit" },
          ]}
        />
        <p className="mt-5 text-sm text-amber-800">
          Requisition ini tidak dapat diedit karena sudah tidak dalam status DRAFT.
        </p>
        <Button asChild className="mt-3" variant="outline">
          <Link href={`/calibration-requests/${request.id}`}>Kembali ke Detail</Link>
        </Button>
      </div>
    );
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItemInput()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemInput, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? ({ ...item, [field]: value } as ItemInput) : item)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError("Customer wajib dipilih.");
      return;
    }

    const filledItems = items.filter(
      (item) =>
        item.deviceTypeId.trim() ||
        item.customerDeviceName.trim() ||
        item.model.trim() ||
        item.deviceId.trim() ||
        item.notes.trim(),
    );
    const validItems = filledItems.filter((item) => item.deviceTypeId.trim());
    if (validItems.length === 0) {
      setError("Minimal 1 device harus ditambahkan.");
      return;
    }
    if (validItems.length !== filledItems.length) {
      setError("Setiap device wajib memiliki Device Name.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: request!.id,
        input: {
          customerId,
          serviceMode,
          expectedDate: expectedDate || null,
          notes: notes.trim() || null,
          items: validItems.map((item) => ({
            deviceTypeId: item.deviceTypeId.trim(),
            customerDeviceName: item.customerDeviceName.trim() || undefined,
            model: item.model.trim() || undefined,
            deviceId: item.deviceId.trim() || undefined,
            qty: item.qty > 0 ? item.qty : 1,
            akdAkl: item.akdAkl.trim() || undefined,
            akdAklDeclaration: item.akdAklDeclaration,
            notes: item.notes.trim() || undefined,
          })),
        },
      });
      router.push(`/calibration-requests/${request!.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.data?.code;
        if (code === "CUSTOMER_NOT_FOUND") {
          setError("Customer tidak ditemukan.");
        } else if (code === "DEVICE_TYPE_NOT_FOUND") {
          setError("Satu atau lebih device name tidak ditemukan.");
        } else if (code === "INVALID_STATUS_FOR_UPDATE") {
          setError("Requisition tidak dapat diedit dalam status saat ini.");
        } else {
          setError(err.data?.message ?? err.message);
        }
      } else {
        setError("Gagal menyimpan perubahan.");
      }
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={`Edit ${request.number}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-requests", label: "Requisitions" },
          { href: `/calibration-requests/${request.id}`, label: request.number },
          { label: "Edit" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Requisition Information</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <CommandPopover
                    open={customerOpen}
                    onOpenChange={setCustomerOpen}
                    searchPlaceholder="Cari customer…"
                    emptyLabel={customersQuery.isLoading ? "Memuat…" : "Customer tidak ditemukan."}
                    contentClassName="w-[400px] p-0"
                    trigger={
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerOpen}
                        className="w-full justify-between font-normal"
                      >
                        {selectedCustomer ? (
                          <span className="truncate">
                            {selectedCustomer.name}{" "}
                            <span className="text-slate-400">({selectedCustomer.number})</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Pilih customer…</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    }
                  >
                    <CommandGroup>
                      {customers.map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={`${customer.name} ${customer.number}`}
                          onSelect={() => {
                            const changed = customer.id !== customerId;
                            setCustomerId(customer.id);
                            setCustomerOpen(false);
                            if (changed) {
                              setItems([emptyItemInput()]);
                            }
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              customerId === customer.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{customer.name}</p>
                            <p className="truncate text-xs text-slate-500">{customer.number}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandPopover>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Service Mode <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={serviceMode}
                    onChange={(e) => setServiceMode(e.target.value as ServiceMode)}
                    className={cn(selectClassName, "w-full")}
                    required
                  >
                    {SERVICE_MODE_OPTIONS.map((mode) => (
                      <option key={mode} value={mode}>
                        {SERVICE_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DateField
                  label="Expected Date"
                  value={expectedDate}
                  onChange={setExpectedDate}
                />

                <div className="md:col-span-1" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={cn(selectClassName, "min-h-[80px] w-full")}
                  placeholder="Additional notes…"
                  maxLength={2000}
                />
              </div>
            </section>

            <section className="space-y-4 border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Devices</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Pilih device name. Nama alat customer, model, dan Device ID bersifat opsional.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4" />
                  Add Device
                </Button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Device Name <span className="text-red-500">*</span>
                          </label>
                          <DeviceTypeItemSelect
                            value={item.deviceTypeId}
                            onChange={(id) => updateItem(index, "deviceTypeId", id)}
                            deviceTypes={deviceTypes}
                            loading={typesQuery.isLoading}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Nama Alat Customer
                            </label>
                            <Input
                              value={item.customerDeviceName}
                              onChange={(e) =>
                                updateItem(index, "customerDeviceName", e.target.value)
                              }
                              placeholder="e.g. Tensimeter Digital"
                              maxLength={200}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Model
                            </label>
                            <Input
                              value={item.model}
                              onChange={(e) => updateItem(index, "model", e.target.value)}
                              placeholder="e.g. AB-123"
                              maxLength={120}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Device ID{" "}
                              <span className="font-normal text-slate-400">(opsional)</span>
                            </label>
                            <Input
                              value={item.deviceId}
                              onChange={(e) => updateItem(index, "deviceId", e.target.value)}
                              placeholder="Kosongkan jika customer tidak memberikan"
                              maxLength={120}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              AKD / AKL / NIE — Status{" "}
                              <span className="font-normal text-slate-400">
                                (deklarasi customer)
                              </span>
                            </label>
                            <select
                              value={item.akdAklDeclaration}
                              onChange={(e) =>
                                updateItem(index, "akdAklDeclaration", e.target.value)
                              }
                              className={cn(selectClassName, "w-full")}
                            >
                              {AKD_AKL_DECLARATION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {AKD_AKL_DECLARATION_LABELS[opt]}
                                </option>
                              ))}
                            </select>
                          </div>
                          {item.akdAklDeclaration === "CUSTOMER_PROVIDED" ? (
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Nomor AKD / AKL / NIE
                              </label>
                              <Input
                                value={item.akdAkl}
                                onChange={(e) => updateItem(index, "akdAkl", e.target.value)}
                                placeholder="Nomor Izin Edar dari customer"
                                maxLength={120}
                              />
                            </div>
                          ) : null}
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Notes
                            </label>
                            <Input
                              value={item.notes}
                              onChange={(e) => updateItem(index, "notes", e.target.value)}
                              placeholder="Notes for this device…"
                              maxLength={1000}
                            />
                          </div>
                        </div>
                      </div>
                      {items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-5 h-9 w-9 shrink-0 text-slate-400 hover:text-red-600"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="mt-5 h-9 w-9" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href={`/calibration-requests/${request.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
