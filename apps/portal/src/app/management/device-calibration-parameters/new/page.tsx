"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCalibrationParameterFormFields,
  buildDeviceCalibrationParameterCreatePayload,
  formatDeviceCalibrationParameterApiError,
  validateCalibrationToleranceForm,
  type DeviceCalibrationParameterFormValue,
} from "../device-calibration-parameter-form-fields";
import {
  PageHeader,
  Surface,
  deviceCalibrationParameterFormActionsClass,
  deviceCalibrationParameterFormPageClass,
  deviceCalibrationParameterFormSurfaceClass,
} from "../device-calibration-parameters-ui";
import { useCreateDeviceCalibrationParameter } from "../use-device-calibration-parameters-query";
import {
  useDeviceCapabilities,
  useDeviceCapabilityItems,
} from "../../device-capabilities/use-device-capabilities-query";
import { useDeviceTypes } from "../../device-types/use-device-types-query";
import { useUoms } from "../../uoms/use-uoms-query";

const emptyForm: DeviceCalibrationParameterFormValue = {
  deviceTypeId: "",
  capabilityId: "",
  capabilityItemId: "",
  code: "",
  name: "",
  uomId: "",
  toleranceMin: "",
  toleranceMax: "",
  toleranceNote: "",
  description: "",
};

export default function NewDeviceCalibrationParameterPage() {
  const router = useRouter();
  const { capabilities } = useAuthz();
  const createMutation = useCreateDeviceCalibrationParameter();
  const [form, setForm] = useState<DeviceCalibrationParameterFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const typesQuery = useDeviceTypes({
    search: "",
    categoryId: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const capabilitiesQuery = useDeviceCapabilities({
    search: "",
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });
  const itemsQuery = useDeviceCapabilityItems(form.capabilityId || undefined);
  const uomsQuery = useUoms({
    search: "",
    category: "",
    isActive: true,
    sortBy: "name",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
  });

  if (!capabilities?.deviceCalibrationParameterCreate) {
    return <AccessDenied />;
  }

  function setField<K extends keyof DeviceCalibrationParameterFormValue>(
    field: K,
    next: DeviceCalibrationParameterFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.deviceTypeId) {
      setError("Device Type wajib dipilih.");
      return;
    }
    if (!form.capabilityItemId) {
      setError("Capability Item wajib dipilih.");
      return;
    }
    if (!form.code.trim()) {
      setError("Kode wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    if (!form.uomId) {
      setError("UOM wajib dipilih.");
      return;
    }
    const limitError = validateCalibrationToleranceForm(form);
    if (limitError) {
      setError(limitError);
      return;
    }

    try {
      const row = await createMutation.mutateAsync(
        buildDeviceCalibrationParameterCreatePayload(form),
      );
      setSuccess(`Calibration Parameter ${row.name} berhasil dibuat.`);
      router.push(`/device-calibration-parameters/${row.id}`);
    } catch (err) {
      setError(formatDeviceCalibrationParameterApiError(err));
    }
  }

  return (
    <div className={deviceCalibrationParameterFormPageClass}>
      <PageHeader
        title="New Calibration Parameter"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-calibration-parameters", label: "Calibration Parameter" },
          { label: "New" },
        ]}
      />

      <form onSubmit={submit}>
        <Surface className={deviceCalibrationParameterFormSurfaceClass}>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}

          <DeviceCalibrationParameterFormFields
            value={form}
            onChange={setField}
            deviceTypes={typesQuery.data?.data ?? []}
            deviceTypesLoading={typesQuery.isLoading}
            capabilities={capabilitiesQuery.data?.data ?? []}
            capabilitiesLoading={capabilitiesQuery.isLoading}
            capabilityItems={itemsQuery.data ?? []}
            capabilityItemsLoading={itemsQuery.isLoading}
            uoms={uomsQuery.data?.data ?? []}
            uomsLoading={uomsQuery.isLoading}
          />

          <div className={deviceCalibrationParameterFormActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href="/device-calibration-parameters">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
