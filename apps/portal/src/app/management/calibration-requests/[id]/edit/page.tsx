"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function EditCalibrationRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const query = useCalibrationRequest(params.id);
  const updateMutation = useUpdateCalibrationRequest();

  const [customerId, setCustomerId] = useState("");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("ON_SITE");
  const [desiredScheduleNote, setDesiredScheduleNote] = useState("");
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
  const request = query.data;

  useEffect(() => {
    if (request && !initialized) {
      setCustomerId(request.customerId);
      setServiceMode(request.serviceMode);
      setDesiredScheduleNote(request.desiredScheduleNote ?? "");
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
          desiredScheduleNote: desiredScheduleNote.trim() || null,
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
                    Devices to calibrate.
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
