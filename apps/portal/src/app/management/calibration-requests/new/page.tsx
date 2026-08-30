"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarIcon, Plus, Save, Trash2 } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  PageHeader,
  Surface,
  formPageClass,
  formSurfaceClass,
  formActionsClass,
  selectClassName,
  SERVICE_MODE_OPTIONS,
  SERVICE_MODE_LABELS,
  CustomerCommandSelect,
  DeviceTypeItemSelect,
  type ServiceMode,
} from "../calibration-requests-ui";
import { useCreateCalibrationRequest } from "../use-calibration-requests-query";
import { useCustomers } from "../../customers/use-customers-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";

interface ItemInput {
  deviceTypeId: string;
  customerDeviceName: string;
  model: string;
  deviceId: string;
  notes: string;
}

const emptyItem = (): ItemInput => ({
  deviceTypeId: "",
  customerDeviceName: "",
  model: "",
  deviceId: "",
  notes: "",
});

export default function NewCalibrationRequestPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateCalibrationRequest();

  const [customerId, setCustomerId] = useState("");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("ON_SITE");
  const [desiredDate, setDesiredDate] = useState<Date | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemInput[]>([emptyItem()]);
  const [error, setError] = useState<string | null>(null);

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
  const deviceTypes = typesQuery.data?.data ?? [];

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemInput, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
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
      const result = await createMutation.mutateAsync({
        customerId,
        serviceMode,
        expectedDate: desiredDate,
        notes: notes.trim() || undefined,
        items: validItems.map((item) => ({
          deviceTypeId: item.deviceTypeId.trim(),
          customerDeviceName: item.customerDeviceName.trim() || undefined,
          model: item.model.trim() || undefined,
          deviceId: item.deviceId.trim() || undefined,
          notes: item.notes.trim() || undefined,
        })),
      });
      router.push(`/calibration-requests/${result.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.data?.code;
        if (code === "CUSTOMER_NOT_FOUND") {
          setError("Customer tidak ditemukan.");
        } else if (code === "DEVICE_TYPE_NOT_FOUND") {
          setError("Satu atau lebih device name tidak ditemukan.");
        } else {
          setError(err.data?.message ?? err.message);
        }
      } else {
        setError("Gagal membuat requisition.");
      }
    }
  }

  if (!capabilities?.calibrationRequestCreate) {
    return <AccessDenied />;
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="New Requisition"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-requests", label: "Requisitions" },
          { label: "New" },
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

              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <CustomerCommandSelect
                    value={customerId}
                    customers={customers}
                    loading={customersQuery.isLoading}
                    onChange={(id) => {
                      setCustomerId(id);
                      setItems([emptyItem()]);
                    }}
                  />
                </div>

                <div className="min-w-0">
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

                <div className="min-w-0">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Expected Date
                  </label>
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start font-normal",
                          !desiredDate && "text-slate-400",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {desiredDate
                            ? format(desiredDate, "PPP", { locale: localeId })
                            : "Pilih tanggal…"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={desiredDate}
                        onSelect={(date) => {
                          setDesiredDate(date);
                          setDateOpen(false);
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        captionLayout="dropdown"
                        startMonth={new Date(2020, 0)}
                        endMonth={new Date(2030, 11)}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
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
                    {customerId
                      ? "Pilih device name. Nama alat customer, model, dan Device ID bersifat opsional."
                      : "Select a customer first to add devices."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  disabled={!customerId}
                >
                  <Plus className="h-4 w-4" />
                  Add Device
                </Button>
              </div>

              {!customerId ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Select a customer to add devices for calibration.
                </div>
              ) : (
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
              )}
            </section>
          </div>

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/calibration-requests">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create Requisition"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
