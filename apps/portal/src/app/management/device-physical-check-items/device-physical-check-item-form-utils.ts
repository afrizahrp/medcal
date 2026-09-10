import { ApiError } from "@medcal/shared";
import type {
  DevicePhysicalCheckItemCreateInput,
  DevicePhysicalCheckItemUpdateInput,
} from "@medcal/shared";

export interface DevicePhysicalCheckItemFormValue {
  deviceTypeId: string;
  code: string;
  name: string;
  inspectionLimit: string;
}

export function validateDevicePhysicalCheckItemForm(
  form: DevicePhysicalCheckItemFormValue,
  mode: "create" | "edit" = "create",
): string | null {
  if (mode === "create" && !form.deviceTypeId) {
    return "Device Name wajib dipilih.";
  }
  if (!form.name.trim()) {
    return "Item / Parameter wajib diisi.";
  }
  if (!form.inspectionLimit.trim()) {
    return "Batas Pemeriksaan wajib diisi.";
  }
  return null;
}

export function buildDevicePhysicalCheckItemCreatePayload(
  form: DevicePhysicalCheckItemFormValue,
): DevicePhysicalCheckItemCreateInput {
  return {
    deviceTypeId: form.deviceTypeId,
    name: form.name.trim(),
    inspectionLimit: form.inspectionLimit.trim(),
  };
}

export function buildDevicePhysicalCheckItemUpdatePayload(
  form: DevicePhysicalCheckItemFormValue & { isActive?: boolean },
): DevicePhysicalCheckItemUpdateInput {
  return {
    name: form.name.trim(),
    inspectionLimit: form.inspectionLimit.trim(),
    ...(form.isActive !== undefined ? { isActive: form.isActive } : {}),
  };
}

export function formatDevicePhysicalCheckItemApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_DEVICE_PHYSICAL_CHECK_ITEM_CODE") {
      return "Physical Inspection item dengan kode ini sudah ada pada Device Name yang sama.";
    }
    if (code === "DEVICE_PHYSICAL_CHECK_ITEM_NOT_FOUND") {
      return "Physical Inspection item tidak ditemukan.";
    }
    if (code === "DEVICE_TYPE_NOT_FOUND") {
      return "Device Name yang dipilih tidak ditemukan.";
    }
    if (code === "DEVICE_PHYSICAL_CHECK_ITEM_IN_USE") {
      return "Item tidak dapat dihapus karena sudah dipakai hasil pemeriksaan. Nonaktifkan saja.";
    }
    if (code === "DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH") {
      return "Urutan gagal disimpan — daftar item tidak lengkap. Muat ulang halaman lalu coba lagi.";
    }
    if (
      code === "INVALID_DEVICE_PHYSICAL_CHECK_ITEM" ||
      code === "INVALID_DEVICE_PHYSICAL_CHECK_ITEM_UPDATE"
    ) {
      return "Data Physical Inspection tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan Physical Inspection. Silakan coba lagi.";
}
