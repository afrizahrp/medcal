import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  buildWorkOrderAssignPayload,
  buildWorkOrderCreatePayload,
  buildWorkOrderUpdatePayload,
  canCreateWorkOrderFromPurchaseOrder,
  deviceIdentifierFromItem,
  findActiveWorkOrder,
  formatWorkOrderApiError,
  isActiveWorkOrderStatus,
  isWorkOrderTerminal,
  toScheduleDateValue,
  validateWorkOrderOperationalForm,
  workOrderActions,
  WORK_ORDER_STATUS_VALUES,
} from "./work-order-form-utils";

describe("workOrderActions", () => {
  it("shows Assign and Cancel for PLANNED, hides Start and Done; revision-eligible (MOM #1)", () => {
    expect(workOrderActions("PLANNED")).toEqual({
      canEdit: true,
      canAssign: true,
      canStart: false,
      canDone: false,
      canCancel: true,
      isLocked: false,
      canRevise: true,
    });
  });

  it("shows Start and Cancel for ASSIGNED; revision-eligible (MOM #1)", () => {
    expect(workOrderActions("ASSIGNED")).toEqual({
      canEdit: true,
      canAssign: false,
      canStart: true,
      canDone: false,
      canCancel: true,
      isLocked: false,
      canRevise: true,
    });
  });

  it("shows Done and Cancel for IN_PROGRESS; scope locked, not revision-eligible (MOM #1)", () => {
    expect(workOrderActions("IN_PROGRESS")).toEqual({
      canEdit: true,
      canAssign: false,
      canStart: false,
      canDone: true,
      canCancel: true,
      isLocked: false,
      canRevise: false,
    });
  });

  it("locks DONE with no workflow actions, including revision", () => {
    expect(workOrderActions("DONE")).toEqual({
      canEdit: false,
      canAssign: false,
      canStart: false,
      canDone: false,
      canCancel: false,
      isLocked: true,
      canRevise: false,
    });
    expect(isWorkOrderTerminal("DONE")).toBe(true);
  });

  it("locks CANCELLED with no workflow actions, including revision", () => {
    expect(workOrderActions("CANCELLED")).toEqual({
      canEdit: false,
      canAssign: false,
      canStart: false,
      canDone: false,
      canCancel: false,
      isLocked: true,
      canRevise: false,
    });
    expect(isWorkOrderTerminal("CANCELLED")).toBe(true);
  });
});

describe("WORK_ORDER_STATUS_VALUES", () => {
  it("exposes only MVP statuses", () => {
    expect(WORK_ORDER_STATUS_VALUES).toEqual(["PLANNED", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"]);
    expect(WORK_ORDER_STATUS_VALUES).not.toContain("TECHNICALLY_DONE");
    expect(WORK_ORDER_STATUS_VALUES).not.toContain("CLOSED");
  });
});

describe("canCreateWorkOrderFromPurchaseOrder", () => {
  it("allows APPROVED purchase orders", () => {
    expect(canCreateWorkOrderFromPurchaseOrder({ status: "APPROVED" })).toBe(true);
  });

  it("rejects non-approved purchase orders", () => {
    expect(canCreateWorkOrderFromPurchaseOrder({ status: "DRAFT" })).toBe(false);
    expect(canCreateWorkOrderFromPurchaseOrder({ status: "CANCELLED" })).toBe(false);
  });
});

describe("findActiveWorkOrder", () => {
  it("treats cancelled WorkOrder as not blocking a replacement", () => {
    expect(isActiveWorkOrderStatus("CANCELLED")).toBe(false);
    expect(
      findActiveWorkOrder([
        { id: "wo-1", status: "CANCELLED" },
        { id: "wo-2", status: "PLANNED" },
      ]),
    ).toEqual({ id: "wo-2", status: "PLANNED" });
  });

  it("treats DONE as active so a second WorkOrder cannot be created", () => {
    expect(isActiveWorkOrderStatus("DONE")).toBe(true);
    expect(findActiveWorkOrder([{ id: "wo-1", status: "DONE" }])).toEqual({
      id: "wo-1",
      status: "DONE",
    });
  });

  it("returns undefined when only cancelled WorkOrders exist", () => {
    expect(findActiveWorkOrder([{ id: "wo-1", status: "CANCELLED" }])).toBeUndefined();
  });
});

describe("buildWorkOrderCreatePayload", () => {
  it("submits only client-controlled operational fields", () => {
    const payload = buildWorkOrderCreatePayload({
      purchaseOrderId: "po-1",
      addressText: "  Lab PKM  ",
      geoLat: "-6.2",
      geoLng: "106.8",
      locationNotes: "  Gate B  ",
      scheduledStart: "2026-09-01",
      scheduledEnd: "2026-09-02",
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "addressText",
        "geoLat",
        "geoLng",
        "locationNotes",
        "purchaseOrderId",
        "scheduledEnd",
        "scheduledStart",
      ].sort(),
    );
    expect(payload.purchaseOrderId).toBe("po-1");
    expect(payload.addressText).toBe("Lab PKM");
    // Date-only YYYY-MM-DD wire strings, never Date objects.
    expect(payload).toMatchObject({
      scheduledStart: "2026-09-01",
      scheduledEnd: "2026-09-02",
    });
    expect(payload.scheduledStart).not.toBeInstanceOf(Date);
    expect(payload).not.toHaveProperty("companyId");
    expect(payload).not.toHaveProperty("customerId");
    expect(payload).not.toHaveProperty("quotationId");
    expect(payload).not.toHaveProperty("items");
    expect(payload).not.toHaveProperty("qty");
    expect(payload).not.toHaveProperty("unitPrice");
    expect(payload).not.toHaveProperty("number");
    expect(payload).not.toHaveProperty("serviceMode");
  });
});

describe("buildWorkOrderUpdatePayload", () => {
  it("does not include source, commercial, or serviceMode fields", () => {
    const payload = buildWorkOrderUpdatePayload({
      addressText: "Site A",
      geoLat: "",
      geoLng: "",
      locationNotes: "",
      scheduledStart: "",
      scheduledEnd: "",
    });
    expect(payload).not.toHaveProperty("serviceMode");
    expect(payload.addressText).toBe("Site A");
    expect(payload.geoLat).toBeNull();
    expect(payload).not.toHaveProperty("purchaseOrderId");
    expect(payload).not.toHaveProperty("quotationId");
    expect(payload).not.toHaveProperty("customerId");
    expect(payload).not.toHaveProperty("number");
    expect(payload).not.toHaveProperty("items");
  });
});

describe("schedule dates (date-only)", () => {
  it("drops any time-of-day from a reloaded API instant", () => {
    expect(toScheduleDateValue("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(toScheduleDateValue("2026-09-01T14:30:00.000Z")).toBe("2026-09-01");
    expect(toScheduleDateValue(null)).toBe("");
  });

  it("rejects an end date before the start date", () => {
    const base = {
      addressText: "",
      geoLat: "",
      geoLng: "",
      locationNotes: "",
    };
    expect(
      validateWorkOrderOperationalForm({
        ...base,
        scheduledStart: "2026-09-10",
        scheduledEnd: "2026-09-01",
      }),
    ).toBe("Jadwal selesai tidak boleh sebelum jadwal mulai.");
    expect(
      validateWorkOrderOperationalForm({
        ...base,
        scheduledStart: "2026-09-01",
        scheduledEnd: "2026-09-10",
      }),
    ).toBeNull();
  });
});

describe("buildWorkOrderAssignPayload", () => {
  it("maps selected technicians to the backend contract", () => {
    expect(
      buildWorkOrderAssignPayload([
        { technicianUserId: "u-1", roleOnJob: "LEAD" },
        { technicianUserId: "u-2", roleOnJob: "ASSIST" },
      ]),
    ).toEqual({
      technicians: [
        { technicianUserId: "u-1", roleOnJob: "LEAD" },
        { technicianUserId: "u-2", roleOnJob: "ASSIST" },
      ],
    });
  });
});

describe("deviceIdentifierFromItem", () => {
  it("prefers the CalibrationRequestItem free-text device identifier", () => {
    expect(
      deviceIdentifierFromItem({
        purchaseOrderItem: {
          deviceId: "device-fk",
          device: { serialNumber: "SN-1", brand: "Brand", model: "Model" },
          quotationItem: {
            requestItem: {
              deviceId: "DEV-1",
              deviceType: { name: "Infusion Pump" },
            },
          },
        },
      }),
    ).toEqual({ identifier: "DEV-1", deviceName: "Infusion Pump", deviceTypeName: null });
  });

  it("puts the customer alias on top and the master device name below it", () => {
    expect(
      deviceIdentifierFromItem({
        purchaseOrderItem: {
          deviceId: "device-fk",
          device: { serialNumber: "SN-1", brand: "Brand", model: "Model" },
          quotationItem: {
            requestItem: {
              deviceId: "DEV-1",
              customerDeviceName: "pompa infus ruang 3",
              deviceType: { name: "Infusion Pump" },
            },
          },
        },
      }),
    ).toEqual({
      identifier: "DEV-1",
      deviceName: "pompa infus ruang 3",
      deviceTypeName: "Infusion Pump",
    });
  });
});

describe("formatWorkOrderApiError", () => {
  it("maps duplicate active WorkOrder and returns the existing id", () => {
    const err = new ApiError(409, "Conflict", {
      code: "DUPLICATE_ACTIVE_WORK_ORDER",
      workOrderId: "wo-active",
    });
    expect(formatWorkOrderApiError(err, "fallback")).toEqual({
      message:
        "Purchase Order ini sudah memiliki Work Order aktif. Batalkan Work Order tersebut terlebih dahulu, atau buka Work Order yang sudah ada.",
      workOrderId: "wo-active",
    });
  });

  it("maps invalid status transition", () => {
    const err = new ApiError(400, "Bad Request", { code: "INVALID_STATUS_TRANSITION" });
    expect(formatWorkOrderApiError(err, "fallback").message).toContain("tidak diizinkan");
  });
});
