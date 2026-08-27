"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SERVICE_MODE_LABELS,
  SERVICE_MODE_OPTIONS,
  type ServiceMode,
} from "../calibration-requests/calibration-requests-ui";
import { selectClassName } from "../quotations/quotations-ui";

export type WorkOrderFormValue = {
  serviceMode: ServiceMode;
  addressText: string;
  geoLat: string;
  geoLng: string;
  locationNotes: string;
  scheduledStart: string;
  scheduledEnd: string;
};

export function WorkOrderFormFields({
  value,
  onChange,
  showServiceMode = true,
  serviceModeLocked = false,
}: {
  value: WorkOrderFormValue;
  onChange: (next: WorkOrderFormValue) => void;
  showServiceMode?: boolean;
  serviceModeLocked?: boolean;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Operational</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {showServiceMode ? (
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Service Mode</label>
            <select
              value={value.serviceMode}
              onChange={(e) => onChange({ ...value, serviceMode: e.target.value as ServiceMode })}
              className={cn(selectClassName, "w-full")}
              disabled={serviceModeLocked}
              aria-label="Service Mode"
            >
              {SERVICE_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {SERVICE_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="min-w-0 md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Address</label>
          <Input
            value={value.addressText}
            onChange={(e) => onChange({ ...value, addressText: e.target.value })}
            placeholder="Alamat lokasi pekerjaan"
            maxLength={2000}
            aria-label="Address"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Latitude</label>
          <Input
            type="number"
            step="any"
            value={value.geoLat}
            onChange={(e) => onChange({ ...value, geoLat: e.target.value })}
            placeholder="-6.200000"
            aria-label="Latitude"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Longitude</label>
          <Input
            type="number"
            step="any"
            value={value.geoLng}
            onChange={(e) => onChange({ ...value, geoLng: e.target.value })}
            placeholder="106.816666"
            aria-label="Longitude"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Scheduled Start</label>
          <Input
            type="datetime-local"
            value={value.scheduledStart}
            onChange={(e) => onChange({ ...value, scheduledStart: e.target.value })}
            aria-label="Scheduled Start"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Scheduled End</label>
          <Input
            type="datetime-local"
            value={value.scheduledEnd}
            onChange={(e) => onChange({ ...value, scheduledEnd: e.target.value })}
            aria-label="Scheduled End"
          />
        </div>
        <div className="min-w-0 md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Location Notes</label>
          <textarea
            value={value.locationNotes}
            onChange={(e) => onChange({ ...value, locationNotes: e.target.value })}
            className={cn(selectClassName, "min-h-[80px] w-full")}
            placeholder="Catatan lokasi, akses, atau instruksi lapangan…"
            maxLength={2000}
            aria-label="Location Notes"
          />
        </div>
      </div>
    </section>
  );
}
