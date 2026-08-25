"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown, Plus, Save, Trash2 } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  type ServiceMode,
  type CalibrationRequestRow,
} from "../../calibration-requests-ui";
import {
  useCalibrationRequest,
  useUpdateCalibrationRequest,
} from "../../use-calibration-requests-query";
import { useCustomers } from "../../../customers/use-customers-query";

interface ItemInput {
  deviceId: string;
  notes: string;
}

function itemsFromRequest(request: CalibrationRequestRow): ItemInput[] {
  return request.items.map((item) => ({
    deviceId: item.deviceId,
    notes: item.notes ?? "",
  }));
}

function parseExpectedDate(dateStr: string | null): Date | undefined {
  if (!dateStr) return undefined;
  try {
    return parseISO(dateStr);
  } catch {
    return undefined;
  }
}

export default function EditCalibrationRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const query = useCalibrationRequest(params.id);
  const updateMutation = useUpdateCalibrationRequest();

  const [customerId, setCustomerId] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("ON_SITE");
  const [desiredDate, setDesiredDate] = useState<Date | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);
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

  const customers = customersQuery.data?.data ?? [];
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const request = query.data;

  useEffect(() => {
    if (request && !initialized) {
      setCustomerId(request.customerId);
      setServiceMode(request.serviceMode);
      setDesiredDate(parseExpectedDate(request.expectedDate));
      setNotes(request.notes ?? "");
      setItems(itemsFromRequest(request));
      setInitialized(true);
    }
  }, [request, initialized]);

  if (isForbidden(query.error)) {
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
          title="Calibration Request tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-requests", label: "Calibration Requests" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Calibration request tidak ditemukan.</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat calibration request.</p>
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
            { href: "/calibration-requests", label: "Calibration Requests" },
            { href: `/calibration-requests/${request.id}`, label: request.number },
            { label: "Edit" },
          ]}
        />
        <p className="mt-5 text-sm text-amber-800">
          Request ini tidak dapat diedit karena sudah tidak dalam status DRAFT.
        </p>
        <Button asChild className="mt-3" variant="outline">
          <Link href={`/calibration-requests/${request.id}`}>Kembali ke Detail</Link>
        </Button>
      </div>
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { deviceId: "", notes: "" }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemInput, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError("Customer wajib dipilih.");
      return;
    }

    const validItems = items.filter((item) => item.deviceId.trim());
    if (validItems.length === 0) {
      setError("Minimal 1 device harus ditambahkan.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: request!.id,
        input: {
          customerId,
          serviceMode,
          expectedDate: desiredDate ?? null,
          notes: notes.trim() || null,
          items: validItems.map((item) => ({
            deviceId: item.deviceId.trim(),
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
        } else if (code === "DEVICE_NOT_FOUND") {
          setError("Satu atau lebih device tidak ditemukan.");
        } else if (code === "INVALID_STATUS_FOR_UPDATE") {
          setError("Request tidak dapat diedit dalam status saat ini.");
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
          { href: "/calibration-requests", label: "Calibration Requests" },
          { href: `/calibration-requests/${request.id}`, label: request.number },
          { label: "Edit" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Request Information</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                    <PopoverTrigger asChild>
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
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cari customer…" />
                        <CommandList>
                          <CommandEmpty>
                            {customersQuery.isLoading ? "Memuat…" : "Customer tidak ditemukan."}
                          </CommandEmpty>
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
                                    setItems([{ deviceId: "", notes: "" }]);
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
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Desired Schedule
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
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {desiredDate
                          ? format(desiredDate, "PPP", { locale: localeId })
                          : "Pilih tanggal…"}
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
                        captionLayout="dropdown"
                        startMonth={new Date(2020, 0)}
                        endMonth={new Date(2030, 11)}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

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
                    Enter device IDs for calibration.
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
                      <div className="flex-1 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Device ID <span className="text-red-500">*</span>
                          </label>
                          <Input
                            value={item.deviceId}
                            onChange={(e) => updateItem(index, "deviceId", e.target.value)}
                            placeholder="Enter device ID"
                            required={index === 0}
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
