import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  buildDevicePhysicalCheckItemCreatePayload,
  buildDevicePhysicalCheckItemUpdatePayload,
  formatDevicePhysicalCheckItemApiError,
  validateDevicePhysicalCheckItemForm,
  type DevicePhysicalCheckItemFormValue,
} from "./device-physical-check-item-form-utils";

const validForm: DevicePhysicalCheckItemFormValue = {
  deviceTypeId: "dt-1",
  code: "",
  name: "Kondisi fisik",
  inspectionLimit: "Tidak rusak",
};

describe("validateDevicePhysicalCheckItemForm", () => {
  it("requires deviceTypeId on create", () => {
    expect(
      validateDevicePhysicalCheckItemForm({ ...validForm, deviceTypeId: "" }, "create"),
    ).toBe("Device Name wajib dipilih.");
  });

  it("does not require deviceTypeId on edit", () => {
    expect(
      validateDevicePhysicalCheckItemForm({ ...validForm, deviceTypeId: "" }, "edit"),
    ).toBeNull();
  });

  it("requires name", () => {
    expect(validateDevicePhysicalCheckItemForm({ ...validForm, name: "  " }, "create")).toBe(
      "Item / Parameter wajib diisi.",
    );
  });

  it("requires inspectionLimit (backend create schema is non-empty)", () => {
    expect(
      validateDevicePhysicalCheckItemForm({ ...validForm, inspectionLimit: "" }, "create"),
    ).toBe("Batas Pemeriksaan wajib diisi.");
  });

  it("accepts a valid create form", () => {
    expect(validateDevicePhysicalCheckItemForm(validForm, "create")).toBeNull();
  });
});

describe("buildDevicePhysicalCheckItemCreatePayload", () => {
  it("trims fields and omits code/sortOrder", () => {
    const payload = buildDevicePhysicalCheckItemCreatePayload({
      deviceTypeId: "dt-1",
      code: "SHOULD_NOT_SEND",
      name: "  Kabel power  ",
      inspectionLimit: "  Utuh  ",
    });
    expect(payload).toEqual({
      deviceTypeId: "dt-1",
      name: "Kabel power",
      inspectionLimit: "Utuh",
    });
    expect("code" in payload).toBe(false);
    expect("sortOrder" in payload).toBe(false);
    expect("isActive" in payload).toBe(false);
  });
});

describe("buildDevicePhysicalCheckItemUpdatePayload", () => {
  it("sends editable fields only (no deviceTypeId/code)", () => {
    const payload = buildDevicePhysicalCheckItemUpdatePayload({
      ...validForm,
      isActive: false,
    });
    expect(payload).toEqual({
      name: "Kondisi fisik",
      inspectionLimit: "Tidak rusak",
      isActive: false,
    });
    expect("deviceTypeId" in payload).toBe(false);
    expect("code" in payload).toBe(false);
  });
});

describe("formatDevicePhysicalCheckItemApiError", () => {
  it("maps known API error codes", () => {
    expect(
      formatDevicePhysicalCheckItemApiError(
        new ApiError(409, "conflict", { code: "DUPLICATE_DEVICE_PHYSICAL_CHECK_ITEM_CODE" }),
      ),
    ).toContain("sudah ada");
    expect(
      formatDevicePhysicalCheckItemApiError(
        new ApiError(400, "in use", { code: "DEVICE_PHYSICAL_CHECK_ITEM_IN_USE" }),
      ),
    ).toContain("Nonaktifkan");
  });

  it("falls back for unknown errors", () => {
    expect(formatDevicePhysicalCheckItemApiError(new Error("boom"))).toContain("Gagal menyimpan");
  });
});
