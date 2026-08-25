"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessDenied } from "../../../../components/access-denied";
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
} from "../calibration-requests-ui";
import { useCreateCalibrationRequest } from "../use-calibration-requests-query";
import { useCustomers } from "../../customers/use-customers-query";

interface ItemInput {
  deviceId: string;
  notes: string;
}

const emptyItem: ItemInput = { deviceId: "", notes: "" };

export default function NewCalibrationRequestPage() {
  const router = useRouter();
  const createMutation = useCreateCalibrationRequest();

  const [customerId, setCustomerId] = useState("");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("ON_SITE");
  const [desiredScheduleNote, setDesiredScheduleNote] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemInput[]>([{ ...emptyItem }]);
  const [error, setError] = useState<string | null>(null);

  const customersQuery = useCustomers({
    search: "",
    status: "ACTIVE",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  const customers = customersQuery.data?.data ?? [];

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
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
      const result = await createMutation.mutateAsync({
        customerId,
        serviceMode,
        desiredScheduleNote: desiredScheduleNote.trim() || undefined,
        notes: notes.trim() || undefined,
        items: validItems.map((item) => ({
          deviceId: item.deviceId.trim(),
          notes: item.notes.trim() || undefined,
        })),
      });
      router.push(`/calibration-requests/${result.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.data?.code;
        if (code === "CUSTOMER_NOT_FOUND") {
          setError("Customer tidak ditemukan.");
        } else if (code === "DEVICE_NOT_FOUND") {
          setError("Satu atau lebih device tidak ditemukan.");
        } else {
          setError(err.data?.message ?? err.message);
        }
      } else {
        setError("Gagal membuat calibration request.");
      }
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="New Calibration Request"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-requests", label: "Calibration Requests" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          <div className="space-y-5">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Request Information</h2>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Customer <span className="text-red-500">*</span>
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className={`${selectClassName} mt-1 w-full`}
                  required
                >
                  <option value="">Pilih customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.number})
                    </option>
                  ))}
                </select>
                {customersQuery.isLoading ? (
                  <p className="mt-1 text-xs text-slate-400">Memuat customer…</p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Service Mode <span className="text-red-500">*</span>
                </label>
                <select
                  value={serviceMode}
                  onChange={(e) => setServiceMode(e.target.value as ServiceMode)}
                  className={`${selectClassName} mt-1 w-full`}
                  required
                >
                  {SERVICE_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {SERVICE_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Desired Schedule Note
                </label>
                <Input
                  value={desiredScheduleNote}
                  onChange={(e) => setDesiredScheduleNote(e.target.value)}
                  placeholder="e.g., ASAP, Next week, etc."
                  className="mt-1 w-full"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${selectClassName} mt-1 min-h-[72px] w-full`}
                  placeholder="Additional notes…"
                  maxLength={2000}
                />
              </div>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Devices</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Add devices to calibrate. Enter device IDs from the customer's device
                    list.
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
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600">
                            Device ID <span className="text-red-500">*</span>
                          </label>
                          <Input
                            value={item.deviceId}
                            onChange={(e) => updateItem(index, "deviceId", e.target.value)}
                            placeholder="Enter device ID"
                            className="mt-1"
                            required={index === 0}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600">
                            Notes
                          </label>
                          <Input
                            value={item.notes}
                            onChange={(e) => updateItem(index, "notes", e.target.value)}
                            placeholder="Notes for this device…"
                            className="mt-1"
                            maxLength={1000}
                          />
                        </div>
                      </div>
                      {items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/calibration-requests">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create Request"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
